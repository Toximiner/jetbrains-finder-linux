const vscode = require('vscode');
const { spawn } = require('child_process');
const readline = require('readline');
const { buildArgs, parseMatch, selectSearchRoots } = require('./search');
const { createReplacementController } = require('./replacementController');
const { createPreviewEditor } = require('./previewEditor');
const { tokenizeEditor } = require('./editorSyntax');
const { createSyntax } = require('./syntax');
const { getPreviewRange, createRowMap, rowPosition, segmentRange, matchRow, resultSnippet } = require('./preview');

async function activate(context) {
  const { rgPath } = await import('@vscode/ripgrep');
  let panel, processes = [], generation = 0, matches = [], originalColumn, selectedDirectory;
  let latestDraft, savingTask, closingTask = Promise.resolve();
  let replacementMode = false, searchOptions, searchReady = false, searchTruncated = false, searchError = '';
  const replacements = createReplacementController(vscode, () => ({ generation, matches, options:searchOptions, ready:searchReady && !!panel, truncated:searchTruncated, error:searchError }));
  const previewEditor = createPreviewEditor(vscode, () => ({generation, matches}));
  const title = () => replacementMode ? 'Replace in Files' : 'Find in Files';
  const syntax = createSyntax(vscode);
  let syntaxGeneration = 0, editorSyntaxSequence = 0;
  const refreshSyntax = () => { syntaxGeneration++; syntax.reset(); panel?.webview.postMessage({type:'refreshSyntax'}); };
  context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(refreshSyntax), vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('workbench.colorTheme') || event.affectsConfiguration('editor.tokenColorCustomizations')) refreshSyntax(); }), vscode.extensions.onDidChange(refreshSyntax));
  function stop() { latestDraft = undefined; previewEditor.discard(); searchReady = false; replacements.discard(); generation++; for (const p of processes) p.kill(); processes = []; }
  async function search(options) {
    stop(); const current = generation; matches = []; searchOptions = {...options}; searchTruncated = false; searchError = '';
    if (panel) panel.title = title();
    const folders = vscode.workspace.workspaceFolders || [];
    if (!options.query) { panel.webview.postMessage({ type: 'results', items: [], count: 0, done: true }); return; }
    const roots = selectSearchRoots(options.scope, folders, selectedDirectory, options.root);
    if (!roots.length) { panel.webview.postMessage({ type:'error', message:options.scope === 'directory' ? 'Choose a directory to search.' : 'Open a folder or workspace to search.' }); return; }
    if (roots.some(f => f.uri.scheme !== 'file')) { panel.webview.postMessage({type:'error', message:'This search currently supports file-based folders.'}); return; }
    let remaining = roots.length, truncated = false, errors = [];
    const files = new Set();
    panel.webview.postMessage({type:'results', items:[], count:0, done:false});
    for (const folder of roots) {
      const root = folder.uri.fsPath;
      const config = vscode.workspace.getConfiguration('search', folder.uri).get('exclude', {});
      const args = buildArgs(options, config);
      const child = spawn(rgPath, args, {cwd:root, windowsHide:true}); processes.push(child);
      let stderr = '', batch = [], timer;
      const flush = () => { clearTimeout(timer); timer = undefined; if (batch.length && current === generation && panel) { panel.title = `${title()}  ${matches.length} ${matches.length === 1 ? 'match' : 'matches'} in ${files.size} ${files.size === 1 ? 'file' : 'files'}`; panel.webview.postMessage({type:'append', items:batch, count:matches.length, files:files.size}); batch=[]; } };
      readline.createInterface({input:child.stdout}).on('line', line => {
        if (current !== generation || truncated) return;
        try {
          const event = JSON.parse(line); if (event.type !== 'match') return;
          for (const item of parseMatch(event.data, root)) {
            if (matches.length >= 1000) { truncated = true; for (const p of processes) p.kill(); break; }
            item.snippet = resultSnippet(item); item.id = matches.length; item.label = vscode.workspace.asRelativePath(vscode.Uri.file(item.file)); matches.push(item); files.add(item.file); batch.push({...item,text:undefined});
          }
          if (!timer) timer = setTimeout(flush, 60);
        } catch (_) { /* Ignore malformed ripgrep output. */ }
      });
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });
      child.on('error', e => { errors.push(e.message); });
      child.on('close', code => { flush(); if (code > 1 && stderr) errors.push(stderr.trim()); if (--remaining === 0) finish(); });
    }
    function finish() { if (current !== generation || !panel) return; processes = []; searchTruncated = truncated; searchError = errors.join('\n'); searchReady = true; panel.title = `${title()}  ${truncated ? 'First ' : ''}${matches.length} ${matches.length === 1 ? 'match' : 'matches'} in ${files.size} ${files.size === 1 ? 'file' : 'files'}${truncated ? ' (limit reached)' : ''}`; panel.webview.postMessage({type:'done', count:matches.length, files:files.size, truncated, error:errors.join('\n')}); }
  }
  async function highlightResults(ids) {
    const active = syntaxGeneration, current = generation;
    const batch = [];
    for (const id of ids.slice(0, 1000)) {
      const item = matches[id]; if (!item || item.snippet.text.length > 20000) continue;
      try {
        const grammar = await syntax.grammarFor(item.file);
        if (active !== syntaxGeneration || current !== generation || !panel) return;
        if (grammar) batch.push({id, spans:syntax.tokenize(grammar, item.snippet.text, null).spans});
      } catch { /* Leave the result as plain text if its grammar fails. */ }
      if (batch.length >= 40) { panel.webview.postMessage({type:'resultSyntax', items:batch.splice(0)}); }
    }
    if (batch.length && panel && current === generation && active === syntaxGeneration) panel.webview.postMessage({type:'resultSyntax', items:batch});
  }
  let previewSequence = 0, previewRequest = 0, previewModel;
  async function preview(id, columns) {
    const item = matches[id], sequence = ++previewSequence; if (!item || !panel) return;
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(item.file));
      if (matches[id] !== item || !panel || sequence !== previewSequence) return;
      const data = await previewEditor.open(id);
      if (matches[id] !== item || !panel || sequence !== previewSequence) return;
      const map = createRowMap(doc, columns);
      previewModel={id, doc, map, version:doc.version};
      panel.webview.postMessage({type:'previewInfo', data, id, label:item.label, lineCount:map.count, line:matchRow(map,doc,item.line,item.start), start:item.start, end:item.end, columns:map.width});
    } catch (error) { if (panel && sequence === previewSequence) panel.webview.postMessage({type:'previewError', id, message:error.message}); }
  }
  async function previewLines(id, requestedStart, requestedEnd, serial) {
    const item = matches[id], model=previewModel, sequence = previewSequence, current = generation, active = syntaxGeneration, request = ++previewRequest;
    if (!item || !panel || !model || model.id!==id) return;
    try {
      const {doc,map}=model;
      if(doc.version!==model.version){preview(id,map.width);return;}
      const range = getPreviewRange(requestedStart, requestedEnd, map.count);
      const lines = [];
      for (let row=range.start; row<range.end; row++) {
        const pos=rowPosition(map,row), text=doc.lineAt(pos.line).text;
        const {from,to}=segmentRange(map,pos.line,pos.part,text);
        lines.push({number:pos.part?'':pos.line+1, continuation:pos.part>0, wraps:row+1<map.offsets[pos.line+1], text:text.slice(from,to), active:pos.line===item.line && item.start<to && item.end>from, from, sourceLine:pos.line});
      }
      try {
        const grammar = await syntax.grammarFor(item.file, doc.languageId);
        if (grammar && lines.length) {
          let state = null, total = 0;
          const first=lines[0].sourceLine, last=lines[lines.length-1].sourceLine;
          const contextStart = first < 5000 ? 0 : first;
          for (let i=contextStart; i<=last; i++) {
            if (i % 200 === 0) {
              await new Promise(resolve => setImmediate(resolve));
              if (sequence !== previewSequence || request !== previewRequest || active !== syntaxGeneration || current !== generation || !panel) return;
            }
            const text = doc.lineAt(i).text; total += text.length;
            if (total > 2000000 || text.length > 1000000) { state = null; continue; }
            const tokenized = syntax.tokenize(grammar, text, state); state = tokenized.state;
            if(i>=first)for(const line of lines)if(line.sourceLine===i){const end=line.from+line.text.length;line.spans=tokenized.spans.filter(span=>span.end>line.from&&span.start<end).map(span=>({...span,start:Math.max(span.start,line.from)-line.from,end:Math.min(span.end,end)-line.from}));}
          }
        }
      } catch { /* Leave preview text uncolored if highlighting fails. */ }
      if (sequence === previewSequence && request === previewRequest && current === generation && active === syntaxGeneration && matches[id] === item && panel) panel.webview.postMessage({type:'previewLines', id, serial, first:range.start, lines});
    } catch (error) { if (panel && sequence === previewSequence && request === previewRequest) panel.webview.postMessage({type:'previewError',id,message:error.message}); }
  }
  for (const [name, target] of [['quickOpen', 'workbench.action.quickOpen'], ['commands', 'workbench.action.showCommands']]) {
    context.subscriptions.push(vscode.commands.registerCommand(`jetbrainsFinderLinux.${name}`, async () => {
      panel?.dispose();
      await new Promise(resolve => setTimeout(resolve, 150));
      await vscode.commands.executeCommand(target);
    }));
  }
  async function open(initialQuery, replace = false, newWindow = false) {
    await closingTask;
    replacementMode = replace;
    const selected = typeof initialQuery === 'string' ? initialQuery : (vscode.window.activeTextEditor?.document.getText(vscode.window.activeTextEditor.selection) || '');
    if (panel) {
      panel.title = title(); panel.reveal(); panel.webview.postMessage({type:'focus', replace:replacementMode, query:selected.includes('\n') ? '' : selected});
      if (newWindow) await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
      return;
    }
    const activeDocument = vscode.window.activeTextEditor?.document;
    if (!selectedDirectory) selectedDirectory = (activeDocument && vscode.workspace.getWorkspaceFolder(activeDocument.uri)?.uri) || vscode.workspace.workspaceFolders?.[0]?.uri;
    originalColumn = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;
    panel = vscode.window.createWebviewPanel('jetbrainsFinderLinux', title(), vscode.ViewColumn.Active, {enableScripts:true, retainContextWhenHidden:true, localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media'), vscode.Uri.joinPath(context.extensionUri,'node_modules','@vscode','codicons','dist')]});
    const webview = panel.webview, script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','main.js')), style = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','style.css'));
    const icons = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'node_modules','@vscode','codicons','dist','codicon.css'));
    const editorScript = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','editor.bundle.js'));
    const nonce = require('crypto').randomBytes(16).toString('base64');
    webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${icons}"><link rel="stylesheet" href="${style}"></head><body><div id="app"></div><script nonce="${nonce}" src="${editorScript}"></script><script nonce="${nonce}" src="${script}"></script></body></html>`;
    panel.onDidChangeViewState(async event => {
      const owner = event.webviewPanel;
      if (owner.active || panel !== owner || vscode.workspace.getConfiguration('workbench.editor').get('useModal') !== 'all') return;
      const group = vscode.window.tabGroups.all.find(group => group.tabs.some(tab => tab.input instanceof vscode.TabInputWebview && tab.input.viewType === 'jetbrainsFinderLinux'));
      if (!group || group.tabs.length !== 2 || !(group.activeTab?.input instanceof vscode.TabInputText)) return;
      owner.dispose();
      await vscode.commands.executeCommand('workbench.action.moveModalEditorToMain');
    });
    panel.onDidDispose(() => {
      searchReady = false; replacements.discard(); for (const p of processes) p.kill(); processes = [];
      panel = undefined;
      closingTask = (async () => {
        try {
          if (savingTask) await savingTask;
          if (latestDraft) await previewEditor.save(latestDraft.token, latestDraft.text);
        } catch (error) {
          vscode.window.showErrorMessage(`Automatic saving failed: ${error.message}`);
          if (latestDraft) {
            const recovered = await vscode.workspace.openTextDocument({content:latestDraft.text});
            await vscode.window.showTextDocument(recovered, {preview:false});
          }
        } finally { latestDraft = undefined; previewEditor.discard(); generation++; }
      })();
    });
    webview.onDidReceiveMessage(async message => {
      if (message.type === 'ready') webview.postMessage({type:'init', replace:replacementMode, folders:(vscode.workspace.workspaceFolders || []).map(f=>({name:f.name, uri:f.uri.toString()})), query:selected.includes('\n')?'':selected, directory:selectedDirectory?.fsPath || ''});
      else if (message.type === 'chooseDirectory') {
        const owner = panel;
        const picked = await vscode.window.showOpenDialog({canSelectFiles:false, canSelectFolders:true, canSelectMany:false, openLabel:'Select Directory', defaultUri:selectedDirectory || vscode.workspace.workspaceFolders?.[0]?.uri});
        if (panel !== owner || !panel || !picked?.length) return;
        if (picked[0].scheme !== 'file') { vscode.window.showWarningMessage('Choose a file-based directory.'); return; }
        selectedDirectory = picked[0];
        webview.postMessage({type:'directorySelected', path:selectedDirectory.fsPath});
      }
      else if (message.type === 'editorSyntax' && typeof message.text === 'string' && message.text.length <= 2*1024*1024) {
        const model = previewModel, owner = panel, sequence = ++editorSyntaxSequence, theme = syntaxGeneration;
        if (!model || model.id !== message.id) return;
        const cancelled = () => sequence !== editorSyntaxSequence || theme !== syntaxGeneration || panel !== owner || previewModel !== model;
        try {
          const spans = await tokenizeEditor(syntax, model.doc.uri.fsPath, model.doc.languageId, message.text, cancelled);
          if (!cancelled()) webview.postMessage({type:'editorSyntax', request:message.request, spans});
        } catch { if (!cancelled()) webview.postMessage({type:'editorSyntax', request:message.request, spans:[]}); }
      }
      else if (message.type === 'draftPreview' && typeof message.text === 'string') latestDraft = {token:message.token, text:message.text};
      else if (message.type === 'savePreview') {
        try {
          savingTask = previewEditor.save(message.token, message.text);
          const result = await savingTask;
          if (latestDraft?.token === message.token && latestDraft.text === message.text) latestDraft = undefined;
          webview.postMessage({type:'editSaved', request:message.request, ...result});
          replacements.discard();
          searchReady = false; // Disk search results must be refreshed before bulk replacement.
        } catch (error) { webview.postMessage({type:'editError', request:message.request, message:error.message}); }
        finally { savingTask = undefined; }
      }
      else if (message.type === 'search') search(message.options);
      else if (message.type === 'discardReplacement') replacements.discard();
      else if (message.type === 'previewReplacement') {
        try { webview.postMessage({type:'replacementPreview', request:message.request, plan:await replacements.prepare(message)}); }
        catch (error) { webview.postMessage({type:'replacementError', request:message.request, message:error.message}); }
      }
      else if (message.type === 'applyReplacement') {
        try {
          const result = await replacements.apply(message.id);
          if (panel) { webview.postMessage({type:'replacementApplied', ...result}); search(searchOptions); }
        } catch (error) { webview.postMessage({type:'replacementError', request:message.request, message:error.message}); }
      }
      else if (message.type === 'preview') { latestDraft = undefined; preview(message.id, message.columns); }
      else if (message.type === 'previewLines' && Number.isInteger(message.id)) previewLines(message.id, message.start, message.end, message.serial);
      else if (message.type === 'highlightResults' && Array.isArray(message.ids)) highlightResults(message.ids.filter(Number.isInteger));
      else if (message.type === 'open') { const item=matches[message.id]; if (!item) return; const column=originalColumn; panel.dispose(); const doc=await vscode.workspace.openTextDocument(vscode.Uri.file(item.file)); const editor=await vscode.window.showTextDocument(doc,{viewColumn:column, preview:false}); const range=new vscode.Range(item.line,item.start,item.line,item.end); editor.selection=new vscode.Selection(range.start,range.end); editor.revealRange(range,vscode.TextEditorRevealType.InCenter); }
      else if (message.type === 'close') panel?.dispose();
      else if (message.type === 'native') {
        const options = message.options;
        panel.dispose();
        if (message.newTab) {
          const folder = options.scope === 'folder' && options.root ? vscode.Uri.parse(options.root).fsPath : options.scope === 'directory' ? options.directory : undefined;
          await vscode.commands.executeCommand('search.action.openNewEditor', {query:options.query, isRegexp:options.regex, isCaseSensitive:options.caseSensitive, matchWholeWord:options.wholeWord, filesToInclude:folder, triggerSearch:true});
        } else {
          await vscode.commands.executeCommand('workbench.action.findInFiles',{query:options.query,isRegex:options.regex,isCaseSensitive:options.caseSensitive,matchWholeWord:options.wholeWord});
        }
      }
    });
    if (newWindow) {
      try {
        await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
      } catch (error) {
        vscode.window.showWarningMessage(`Finder opened in this window. VS Code could not move it to a separate window: ${error.message}`);
      }
    }
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('jetbrainsFinderLinux.open', initialQuery => open(initialQuery, false)),
    vscode.commands.registerCommand('jetbrainsFinderLinux.openInNewWindow', initialQuery => open(initialQuery, false, true)),
    vscode.commands.registerCommand('jetbrainsFinderLinux.replace', initialQuery => open(initialQuery, true)),
    vscode.commands.registerCommand('jetbrainsFinderLinux.replaceInNewWindow', initialQuery => open(initialQuery, true, true))
  );
}
module.exports = { activate };
