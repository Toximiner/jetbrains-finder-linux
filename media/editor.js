const {EditorView, basicSetup} = require('codemirror');
const {Compartment, StateEffect} = require('@codemirror/state');
const {syntaxHighlighting, HighlightStyle} = require('@codemirror/language');
const {StateField} = require('@codemirror/state');
const {Decoration} = require('@codemirror/view');
const {keymap} = require('@codemirror/view');
const {indentWithTab} = require('@codemirror/commands');
const {python} = require('@codemirror/lang-python');
const {javascript} = require('@codemirror/lang-javascript');
const {json} = require('@codemirror/lang-json');
window.FinderEditor = {
  create(parent, data, changed) {
    const language = data.language === 'python' ? python() : ['javascript','javascriptreact','typescript','typescriptreact'].includes(data.language) ? javascript({typescript:data.language.startsWith('typescript'),jsx:data.language.endsWith('react')}) : ['json','jsonc'].includes(data.language) ? json() : [];
    const theme = EditorView.theme({
      '&':{height:'100%',color:'var(--vscode-editor-foreground)',backgroundColor:'var(--vscode-editor-background)'},
      '.cm-scroller':{overflow:'auto',fontFamily:'var(--vscode-editor-font-family, monospace)',fontSize:'var(--vscode-editor-font-size, 13px)'},
      '.cm-content':{caretColor:'var(--vscode-editorCursor-foreground)'},
      '.cm-gutters':{backgroundColor:'var(--vscode-editor-background)',color:'var(--vscode-editorLineNumber-foreground)',border:'none'},
      '.cm-activeLine,.cm-activeLineGutter':{backgroundColor:'var(--vscode-editor-lineHighlightBackground, #88888815)'},
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground':{backgroundColor:'var(--vscode-editor-selectionBackground, #264f78)'},
      '.cm-cursor':{borderLeftColor:'var(--vscode-editorCursor-foreground)'},
      '.cm-panels,.cm-tooltip':{backgroundColor:'var(--vscode-editorWidget-background)',color:'var(--vscode-editorWidget-foreground, var(--vscode-editor-foreground))'},
      '.cm-searchMatch':{backgroundColor:'var(--vscode-editor-findMatchHighlightBackground, #ffaa0030)'}
    });
    const tokenEffect = StateEffect.define(), tokenTheme = new Compartment();
    const themedTokens = StateField.define({
      create:()=>Decoration.none,
      update(value, transaction) {
        value = value.map(transaction.changes);
        for (const effect of transaction.effects) if (effect.is(tokenEffect)) value = effect.value;
        return value;
      },
      provide:field=>EditorView.decorations.from(field)
    });
    const match = StateField.define({
      create(state) {
        const line = state.doc.line(Math.min(state.doc.lines,Math.max(1,data.line+1)));
        const from = Math.min(line.to,line.from+data.column), to = Math.min(line.to,line.from+(data.end ?? data.column));
        return from<to ? Decoration.set([Decoration.mark({class:'cm-search-result'}).range(from,to)]) : Decoration.none;
      },
      update:(value,transaction)=>value.map(transaction.changes),
      provide:field=>EditorView.decorations.from(field)
    });
    const view = new EditorView({doc:data.text,parent,extensions:[EditorView.cspNonce.of(document.querySelector('script[nonce]')?.nonce || ''),basicSetup,syntaxHighlighting(HighlightStyle.define([])),language,theme,match,themedTokens,tokenTheme.of([]),keymap.of([indentWithTab]),EditorView.updateListener.of(update=>{if(update.docChanged)changed();}),EditorView.contentAttributes.of({'aria-label':'Edit source file'})]});
    const line = view.state.doc.line(Math.min(view.state.doc.lines,Math.max(1,data.line+1)));
    const pos = Math.min(line.to,line.from+data.column);
    view.dispatch({selection:{anchor:pos},effects:EditorView.scrollIntoView(pos,{y:'center'})});
    return {setSyntax(spans) {
      const styles = {}, classes = new Map(), marks = [];
      for (const span of spans) {
        if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start<0 || span.end>view.state.doc.length || span.end<=span.start) continue;
        const style = {};
        if (/^#[0-9a-f]{6,8}$/i.test(span.color || '')) style.color=span.color;
        if (span.italic) style.fontStyle='italic';
        if (span.bold) style.fontWeight='bold';
        if (span.underline || span.strike) style.textDecoration=[span.underline?'underline':'',span.strike?'line-through':''].filter(Boolean).join(' ');
        const key=JSON.stringify(style);let name=classes.get(key);
        if (!name) {name=`cm-vscode-token-${classes.size}`;classes.set(key,name);styles[`.${name}`]=style;}
        marks.push(Decoration.mark({class:name}).range(span.start,span.end));
      }
      view.dispatch({effects:[tokenEffect.of(Decoration.set(marks,true)),tokenTheme.reconfigure(EditorView.theme(styles))]});
    },text:()=>view.state.doc.toString(),setText:text=>view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}}),destroy:()=>view.destroy(),focus:()=>view.focus()};
  }
};
