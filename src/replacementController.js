const { randomUUID } = require('node:crypto');
const { planFile } = require('./replace');

function createReplacementController(vscode, getState) {
  let pending, busy = false, serial = 0;
  const sameOptions = (a,b) => ['query','regex','caseSensitive','wholeWord','scope','root','directory'].every(k => a?.[k] === b?.[k]);
  function valid(state) {
    if (!state.ready || state.truncated || state.error || !state.matches.length) throw new Error('Wait for a complete search. Narrow the query if the result limit is reached.');
  }
  const current = state => {
    const now = getState();
    if (now.generation !== state.generation || !sameOptions(now.options,state.options)) throw new Error('The search changed. Preview the replacement again.');
    return now;
  };
  return {
    discard() { serial++; pending = undefined; },
    async prepare(request) {
      if (busy) throw new Error('A replacement is already in progress.');
      pending = undefined; const requestSerial = ++serial;
      const now = getState();
      const state = {...now, options:{...now.options}, matches:[...now.matches]}; valid(state);
      if (!sameOptions(request.options,state.options)) throw new Error('The query changed. Wait for the new search.');
      if (typeof request.replacement !== 'string') throw new Error('Replacement text must be a string.');
      const items = request.all ? state.matches : state.matches.filter(item => item.id === request.id);
      if (!items.length) throw new Error('Select a search result first.');
      const grouped = new Map();
      for (const item of items) { if (!grouped.has(item.file)) grouped.set(item.file,[]); grouped.get(item.file).push(item); }
      const files = [];
      for (const [file, matches] of grouped) {
        const uri = vscode.Uri.file(file);
        const document = await vscode.workspace.openTextDocument(uri);
        if (document.isDirty) throw new Error('Save unsaved files and search again before replacing.');
        const text = document.getText(), version = document.version;
        const bytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
        const plan = planFile(text,matches,state.options,request.replacement);
        current(state);
        if (document.version !== version || document.isDirty) throw new Error('A file changed while preparing the preview. Search again.');
        files.push({uri,document,text,version,bytes,...plan});
      }
      current(state);
      const count = files.reduce((n,f)=>n+f.edits.length,0);
      if (requestSerial !== serial) throw new Error('This preview was cancelled.');
      pending = {id:randomUUID(),state,files,count};
      return {id:pending.id,count,files:files.map(f=>({label:vscode.workspace.asRelativePath(f.uri),lines:f.preview}))};
    },
    async apply(id) {
      if (busy) throw new Error('A replacement is already in progress.');
      const plan = pending;
      if (!plan || plan.id !== id) throw new Error('This preview has expired. Preview the replacement again.');
      busy = true; pending = undefined;
      try {
        current(plan.state); valid(getState());
        for (const file of plan.files) {
          const bytes = Buffer.from(await vscode.workspace.fs.readFile(file.uri));
          if (file.document.isClosed || file.document.isDirty || file.document.version !== file.version || file.document.getText() !== file.text || !bytes.equals(file.bytes)) {
            throw new Error('A file changed after the preview. Search again before replacing.');
          }
        }
        current(plan.state);
        const edit = new vscode.WorkspaceEdit();
        for (const file of plan.files) {
          for (const change of file.edits) edit.replace(file.uri,new vscode.Range(change.line,change.start,change.line,change.end),change.text);
        }
        // Recheck every document synchronously after the last asynchronous read.
        if (plan.files.some(f=>f.document.isDirty || f.document.version !== f.version || f.document.isClosed)) throw new Error('A file changed after the preview. Search again.');
        if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code could not apply the replacement.');
        const saved = await Promise.all(plan.files.map(f=>f.document.save()));
        if (saved.some(value=>!value)) throw new Error('The edits were applied, but some files could not be saved. Save them manually before searching again.');
        return {count:plan.count,files:plan.files.length};
      } finally { busy = false; }
    }
  };
}
module.exports = {createReplacementController};
