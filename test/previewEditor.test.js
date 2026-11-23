const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPreviewEditor}=require('../src/previewEditor');
function fixture(initial='hello\nworld\n',eol=1){
 let text=initial,bytes=Buffer.from(initial),applied=0,saved=0;
 const uri={fsPath:'/repo/example.py'};
 const doc={version:1,isDirty:false,isClosed:false,eol,languageId:'python',getText:()=>text,positionAt:offset=>({offset}),save:async()=>{saved++;bytes=Buffer.from(text);doc.isDirty=false;return true;}};
 const state={generation:1,matches:[{file:uri.fsPath,line:1,start:0}]};
 const vscode={Uri:{file:()=>uri},Range:class{constructor(start,end){Object.assign(this,{start,end});}},WorkspaceEdit:class{replace(uri,range,text){this.edit={uri,range,text};}},workspace:{openTextDocument:async()=>doc,fs:{readFile:async()=>bytes},asRelativePath:()=>uri.fsPath,applyEdit:async({edit})=>{applied++;text=text.slice(0,edit.range.start.offset)+edit.text+text.slice(edit.range.end.offset);doc.version++;doc.isDirty=true;return true;}}};
 return {controller:createPreviewEditor(vscode,()=>state),doc,state,vscode,text:()=>text,applied:()=>applied,saved:()=>saved,setDisk:value=>{bytes=Buffer.from(value);},setText:value=>{text=value;doc.version++;}};
}
test('opening is read-only and repeated automatic saves update the snapshot',async()=>{
 const f=fixture(),data=await f.controller.open(0);assert.equal(data.language,'python');assert.equal(data.line,1);assert.equal(f.applied(),0);
 await f.controller.save(data.token,'hello\nworld!\n');assert.equal(f.text(),'hello\nworld!\n');assert.equal(f.doc.isDirty,false);
 await f.controller.save(data.token,'hello\nworld!!\n');assert.equal(f.text(),'hello\nworld!!\n');assert.equal(f.saved(),2);
});
test('CRLF, Unicode and trailing newlines survive a CodeMirror save',async()=>{
 const f=fixture('α\r\n🌍\r\n',2),data=await f.controller.open(0);
 const result=await f.controller.save(data.token,'α\n🌍!\n');assert.equal(f.text(),'α\r\n🌍!\r\n');assert.equal(result.text,'α\n🌍!\n');
});
test('external editor and disk changes are rejected without overwriting',async()=>{
 for(const change of [f=>f.setText('changed in editor'),f=>f.setDisk('changed on disk'),f=>{f.doc.isClosed=true;}]){
  const f=fixture(),data=await f.controller.open(0);change(f);
  await assert.rejects(()=>f.controller.save(data.token,'new text'),/changed/);assert.equal(f.applied(),0);assert.equal(f.saved(),0);
 }
});
test('cancelled sessions, stale tokens and changed searches cannot write',async()=>{
 for(const change of [f=>f.controller.discard(),f=>{f.state.generation++;}]){
  const f=fixture(),data=await f.controller.open(0);change(f);
  await assert.rejects(()=>f.controller.save(data.token,'new text'),/expired/);assert.equal(f.applied(),0);
 }
 const f=fixture();await f.controller.open(0);await assert.rejects(()=>f.controller.save('forged','oops'),/expired/);
});
test('failed apply or save is reported and subsequent stale saves are rejected',async()=>{
 const f=fixture(),data=await f.controller.open(0);f.vscode.workspace.applyEdit=async()=>false;
 await assert.rejects(()=>f.controller.save(data.token,'new'),/could not apply/);assert.equal(f.saved(),0);
 const g=fixture(),other=await g.controller.open(0);g.doc.save=async()=>false;
 await assert.rejects(()=>g.controller.save(other.token,'new'),/Edits were applied/);assert.equal(g.text(),'new');
 await assert.rejects(()=>g.controller.save(other.token,'again'),/changed/);
});
test('open cancellation and document races do not create stale sessions',async()=>{
 const f=fixture();let finish;f.vscode.workspace.openTextDocument=()=>new Promise(resolve=>{finish=resolve;});
 const pending=f.controller.open(0);f.controller.discard();finish(f.doc);await assert.rejects(()=>pending,/cancelled/);
 const g=fixture();g.vscode.workspace.fs.readFile=async()=>{g.setText('concurrent');return Buffer.from('hello');};
 await assert.rejects(()=>g.controller.open(0),/changed/);
});
