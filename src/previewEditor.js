const { randomUUID } = require('node:crypto');

// Apply each automatic save against its document and disk snapshot.
function createPreviewEditor(vscode, getState) {
  let session, serial = 0, busy = false;
  function valid(s) {
    if (session !== s || getState().generation !== s.generation) throw new Error('This editing session expired. Reopen the editor.');
    if (s.doc.isClosed || s.doc.version !== s.version || s.doc.getText() !== s.text) throw new Error('The file changed outside this editor. Copy your draft, then reopen the search result.');
  }
  return {
    discard() { serial++; session = undefined; },
    async open(id) {
      if (busy) throw new Error('Saving is still in progress.');
      session = undefined;
      const sequence = ++serial, state = getState(), item = state.matches[id];
      if (!item) throw new Error('Select a search result first.');
      const uri = vscode.Uri.file(item.file), doc = await vscode.workspace.openTextDocument(uri);
      const text = doc.getText(), version = doc.version;
      if (text.length > 2 * 1024 * 1024) throw new Error('Inline editing supports files up to 2 MiB. Open this file in the main editor.');
      const bytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
      if (sequence !== serial || state.generation !== getState().generation) throw new Error('This editing session was cancelled.');
      session = {token:randomUUID(), doc, uri, text, version, bytes, generation:state.generation};
      valid(session);
      return {token:session.token, text, language:doc.languageId, line:item.line, column:item.start, end:item.end, label:vscode.workspace.asRelativePath(uri)};
    },
    async save(token, text) {
      if (busy) throw new Error('Saving is still in progress.');
      const s = session;
      if (!s || s.token !== token) throw new Error('This editing session expired. Reopen the editor.');
      if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) throw new Error('Inline editing supports files up to 2 MiB.');
      text = text.replace(/\r\n|\r/g, '\n');
      if (s.doc.eol === 2) text = text.replace(/\n/g, '\r\n');
      busy = true;
      try {
        valid(s);
        const bytes = Buffer.from(await vscode.workspace.fs.readFile(s.uri));
        valid(s);
        if (!bytes.equals(s.bytes)) throw new Error('The file changed on disk. Copy your draft, then reopen the search result.');
        // Replace only the changed range, retaining positions outside it and VS Code Undo.
        if (text !== s.text) {
          let start = 0, end = s.text.length, newEnd = text.length;
          while (start < end && start < newEnd && s.text[start] === text[start]) start++;
          while (end > start && newEnd > start && s.text[end-1] === text[newEnd-1]) { end--; newEnd--; }
          const edit = new vscode.WorkspaceEdit();
          edit.replace(s.uri, new vscode.Range(s.doc.positionAt(start), s.doc.positionAt(end)), text.slice(start, newEnd));
          if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code could not apply the edit.');
        }
        if (!await s.doc.save()) throw new Error('Edits were applied in VS Code, but the file could not be saved. Open the file and save it manually.');
        const savedText = s.doc.getText(), savedVersion = s.doc.version;
        const savedBytes = Buffer.from(await vscode.workspace.fs.readFile(s.uri));
        if (session !== s || s.doc.version !== savedVersion || s.doc.isClosed) throw new Error('The file changed during automatic saving. Copy your draft before reopening the result.');
        Object.assign(s, {text:savedText, version:savedVersion, bytes:savedBytes});
        return {label:vscode.workspace.asRelativePath(s.uri), text:savedText.replace(/\r\n|\r/g, '\n')};
      } finally { busy = false; }
    }
  };
}
module.exports = {createPreviewEditor};
