const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createReplacementController}=require('../src/replacementController');
function fixture(){
 let text='foo foo',bytes=Buffer.from(text),applied=0,saved=0;
 const uri={fsPath:'/repo/file.txt'};
 const doc={version:1,isDirty:false,isClosed:false,getText:()=>text,save:async()=>{saved++;bytes=Buffer.from(text);doc.isDirty=false;return true;}};
 const state={generation:1,ready:true,truncated:false,error:'',options:{query:'foo',regex:false},matches:[{id:0,file:uri.fsPath,line:0,start:0,end:3,text},{id:1,file:uri.fsPath,line:0,start:4,end:7,text}]};
 const vscode={Uri:{file:()=>uri},Range:class{constructor(line,start,endLine,end){Object.assign(this,{line,start,endLine,end});}},WorkspaceEdit:class{constructor(){this.edits=[];}replace(uri,range,text){this.edits.push({uri,range,text});}},workspace:{openTextDocument:async()=>doc,fs:{readFile:async()=>bytes},asRelativePath:u=>u.fsPath,applyEdit:async edit=>{applied++;for(const e of [...edit.edits].reverse())text=text.slice(0,e.range.start)+e.text+text.slice(e.range.end);doc.version++;doc.isDirty=true;return true;}}};
 const controller=createReplacementController(vscode,()=>state);
 const request={all:true,options:state.options,replacement:'bar'};
 return {controller,vscode,state,doc,request,text:()=>text,applied:()=>applied,saved:()=>saved,setDisk:value=>{bytes=Buffer.from(value);}};
}

test('preview is read-only; applying the exact preview replaces and saves once',async()=>{
 const f=fixture(),plan=await f.controller.prepare(f.request);
 assert.equal(f.text(),'foo foo');assert.equal(f.applied(),0);assert.equal(plan.count,2);
 assert.equal(plan.files[0].lines[0].after,'bar bar');
 assert.deepEqual(await f.controller.apply(plan.id),{count:2,files:1});
 assert.equal(f.text(),'bar bar');assert.equal(f.saved(),1);
 await assert.rejects(()=>f.controller.apply(plan.id),/expired/);
});
test('selected replacement only includes its match',async()=>{
 const f=fixture(),plan=await f.controller.prepare({...f.request,all:false,id:1});
 assert.equal(plan.count,1);await f.controller.apply(plan.id);assert.equal(f.text(),'foo bar');
});
test('cancel and changed preview tokens cannot modify files',async()=>{
 const f=fixture(),plan=await f.controller.prepare(f.request);
 f.controller.discard();await assert.rejects(()=>f.controller.apply(plan.id),/expired/);assert.equal(f.applied(),0);
});
test('incomplete, truncated and failed searches cannot be replaced',async()=>{
 for(const fields of [{ready:false},{truncated:true},{error:'failed'},{matches:[]}]){
  const f=fixture();Object.assign(f.state,fields);
  await assert.rejects(()=>f.controller.prepare(f.request),/complete search/);assert.equal(f.applied(),0);
 }
});
test('dirty files and options not belonging to current search are rejected',async()=>{
 const f=fixture();f.doc.isDirty=true;
 await assert.rejects(()=>f.controller.prepare(f.request),/unsaved/);
 f.doc.isDirty=false;
 await assert.rejects(()=>f.controller.prepare({...f.request,options:{query:'other'}}),/query changed/);
});
test('editing or changing disk contents after preview never applies stale edits',async()=>{
 for(const change of [f=>{f.doc.version++;},f=>{f.doc.isDirty=true;},f=>f.setDisk('modified elsewhere'),f=>{f.doc.isClosed=true;}]){
  const f=fixture(),p=await f.controller.prepare(f.request);change(f);
  await assert.rejects(()=>f.controller.apply(p.id),/changed after/);assert.equal(f.applied(),0);
 }
});
test('a new search invalidates the preview',async()=>{
 const f=fixture(),p=await f.controller.prepare(f.request);f.state.generation++;
 await assert.rejects(()=>f.controller.apply(p.id),/search changed/);assert.equal(f.applied(),0);
});
test('cancellation during asynchronous preview preparation does not resurrect the preview',async()=>{
 const f=fixture();let finish;
 f.vscode.workspace.openTextDocument=()=>new Promise(resolve=>{finish=resolve;});
 const request=f.controller.prepare(f.request);f.controller.discard();finish(f.doc);
 await assert.rejects(()=>request,/cancelled/);assert.equal(f.applied(),0);
});
test('apply failure is reported and does not save documents',async()=>{
 const f=fixture(),p=await f.controller.prepare(f.request);f.vscode.workspace.applyEdit=async()=>false;
 await assert.rejects(()=>f.controller.apply(p.id),/could not apply/);assert.equal(f.saved(),0);
});
test('save failure reports that edits are already applied',async()=>{
 const f=fixture(),p=await f.controller.prepare(f.request);f.doc.save=async()=>false;
 await assert.rejects(()=>f.controller.apply(p.id),/edits were applied/);assert.equal(f.applied(),1);
});
