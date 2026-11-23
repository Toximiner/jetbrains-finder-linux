const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function ui(t){
 const dom=new JSDOM('<div id="app"></div>',{runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window,messages=[];let editor;
 w.acquireVsCodeApi=()=>({getState:()=>({}),setState:()=>{},postMessage:m=>messages.push(m)});
 w.ResizeObserver=class{observe(){}};w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLCanvasElement.prototype.getContext=()=>({measureText:()=>({width:8})});
 w.FinderEditor={create:(parent,data,changed)=>{let text=data.text;editor={syntax:[],setSyntax:value=>{editor.syntax=value;},text:()=>text,setText:value=>{text=value;changed();},destroy:()=>{},input:value=>{text=value;changed();}};return editor;}};
 w.eval(fs.readFileSync(path.join(__dirname,'../media/main.js'),'utf8'));
 const $=id=>w.document.getElementById(id),send=data=>w.dispatchEvent(new w.MessageEvent('message',{data}));
 send({type:'init',replace:false,folders:[],query:''});send({type:'results',done:false});
 send({type:'append',count:2,files:1,items:[0,1].map(id=>({id,line:id,label:'file.py',snippet:{text:'foo',start:0,end:3}}))});await tick();
 send({type:'previewInfo',id:0,data:{token:'session',text:'foo\nfoo',language:'python',line:0,column:0,label:'file.py'}});
 return {$,w,send,editor,messages,last:type=>messages.filter(m=>m.type===type).at(-1)};
}
test('the lower pane is editable immediately without Edit or Save buttons',async t=>{
 const f=await ui(t);assert.equal(f.editor.text(),'foo\nfoo');assert.equal(f.$('editPreview'),null);assert.equal(f.$('savePreview'),null);
 f.editor.input('bar\nfoo');await new Promise(r=>setTimeout(r,550));
 const save=f.last('savePreview');assert.equal(save.text,'bar\nfoo');assert.equal(save.token,'session');
 f.send({type:'editSaved',request:save.request,text:save.text,label:'file.py'});await tick();assert.equal(f.$('editStatus').textContent,'');
});
test('result navigation waits for automatic saving; typing during save is retained',async t=>{
 const f=await ui(t);f.editor.input('first');f.w.dispatchEvent(new f.w.Event('blur'));
 const first=f.last('savePreview');f.editor.input('second');f.w.document.querySelector('[data-id="1"]').click();await tick();
 assert.equal(f.last('preview').id,0);
 f.send({type:'editSaved',request:first.request,text:'first',label:'file.py'});await tick();
 const second=f.last('savePreview');assert.equal(second.text,'second');assert.equal(f.last('preview').id,0);
 f.send({type:'editSaved',request:second.request,text:'second',label:'file.py'});await tick();assert.equal(f.last('preview').id,1);
});
test('conflict preserves the draft and prevents closing or navigating away',async t=>{
 const f=await ui(t);f.editor.input('my unsaved draft');f.w.dispatchEvent(new f.w.Event('blur'));
 const save=f.last('savePreview');f.send({type:'editError',request:save.request,message:'The file changed on disk.'});await tick();
 f.w.document.querySelector('[data-id="1"]').click();f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();
 assert.equal(f.last('preview').id,0);assert.equal(f.last('close'),undefined);assert.equal(f.editor.text(),'my unsaved draft');assert.match(f.$('editStatus').textContent,/changed on disk/);
});
test('format-on-save changes update a settled draft without an extra save loop',async t=>{
 const f=await ui(t);f.editor.input('foo=1');f.w.dispatchEvent(new f.w.Event('blur'));
 const save=f.last('savePreview');f.send({type:'editSaved',request:save.request,text:'foo = 1\n',label:'file.py'});await tick();
 assert.equal(f.editor.text(),'foo = 1\n');assert.equal(f.messages.filter(m=>m.type==='savePreview').length,1);
});

test('editor syntax refreshes with the theme without replacing the document or draft',async t=>{
 const f=await ui(t),initial=f.last('editorSyntax');
 const first=[{start:0,end:3,color:'#abcdef'}];
 f.send({type:'editorSyntax',request:initial.request,spans:first});assert.deepEqual(f.editor.syntax,first);
 f.editor.input('unsaved foo');f.send({type:'refreshSyntax'});
 const next=f.last('editorSyntax');assert.equal(next.text,'unsaved foo');assert.ok(next.request>initial.request);
 f.send({type:'editorSyntax',request:initial.request,spans:[]});assert.deepEqual(f.editor.syntax,first);
 const second=[{start:8,end:11,color:'#123456'}];f.send({type:'editorSyntax',request:next.request,spans:second});
 assert.deepEqual(f.editor.syntax,second);assert.equal(f.editor.text(),'unsaved foo');
});
