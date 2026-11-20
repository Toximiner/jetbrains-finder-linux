const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
function ui(t){
 const dom=new JSDOM('<div id="app"></div>',{runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window,messages=[];
 w.acquireVsCodeApi=()=>({getState:()=>({}),setState:()=>{},postMessage:m=>messages.push(m)});
 w.ResizeObserver=class{observe(){}};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLCanvasElement.prototype.getContext=()=>({measureText:()=>({width:8})});
 w.eval(fs.readFileSync(path.join(__dirname,'../media/main.js'),'utf8'));
 const $=id=>w.document.getElementById(id);
 const send=data=>w.dispatchEvent(new w.MessageEvent('message',{data}));
 send({type:'init',replace:true,folders:[],query:'foo'});
 send({type:'results',done:false});
 send({type:'append',count:1,files:1,items:[{id:0,line:0,label:'file.txt',snippet:{text:'foo',start:0,end:3}}]});
 const done=()=>send({type:'done',count:1,files:1,truncated:false,error:''});
 return {$,send,messages,w,done,last:type=>messages.filter(m=>m.type===type).at(-1)};
}
const review=request=>({type:'replacementPreview',request,plan:{id:'preview-1',count:1,files:[{label:'file.txt',lines:[{line:1,before:'foo',after:'<img src=x onerror=alert(1)>'}]}]}});

test('replace mode waits for complete results, while find mode hides replacement fields',t=>{
 const f=ui(t);assert.equal(f.$('replaceBar').hidden,false);assert.equal(f.$('replaceAll').disabled,true);
 f.done();assert.equal(f.$('replaceAll').disabled,false);
 f.send({type:'focus',replace:false});assert.equal(f.$('replaceBar').hidden,true);
 f.send({type:'focus',replace:true});assert.equal(f.$('replaceBar').hidden,false);
});
test('preview renders source as text; cancelling never sends apply',t=>{
 const f=ui(t);f.done();f.$('replacement').value='bar';f.$('replaceAll').click();
 const request=f.last('previewReplacement');assert.equal(request.replacement,'bar');assert.equal(request.all,true);
 f.send(review(request.request));assert.equal(f.$('replacementReview').hidden,false);
 assert.equal(f.$('reviewChanges').querySelector('img'),null);
 assert.match(f.$('reviewChanges').textContent,/<img src=x/);
 f.$('cancelReplacement').click();assert.equal(f.$('replacementReview').hidden,true);assert.equal(f.last('applyReplacement'),undefined);
});
test('applying submits reviewed token once and displays completion',t=>{
 const f=ui(t);f.done();f.$('replaceOne').click();const request=f.last('previewReplacement');assert.equal(request.all,false);assert.equal(request.id,0);
 f.send(review(request.request));f.$('applyReplacement').click();f.$('applyReplacement').click();
 assert.equal(f.messages.filter(m=>m.type==='applyReplacement').length,1);assert.equal(f.last('applyReplacement').id,'preview-1');
 f.send({type:'replacementApplied',count:1,files:1});assert.equal(f.$('replacementReview').hidden,true);assert.match(f.$('replaceNotice').textContent,/Replaced 1/);
});
test('query edits expire pending previews and Escape cancels only the review',t=>{
 const f=ui(t);f.done();f.$('replaceAll').click();const request=f.last('previewReplacement');
 f.$('query').value='different';f.$('query').dispatchEvent(new f.w.Event('input'));f.send(review(request.request));assert.equal(f.$('replacementReview').hidden,true);
 f.send({type:'append',count:1,files:1,items:[{id:0,line:0,label:'file.txt',snippet:{text:'different',start:0,end:9}}]});
 f.done();f.$('replaceAll').click();f.send(review(f.last('previewReplacement').request));
 f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(f.$('replacementReview').hidden,true);assert.equal(f.last('close'),undefined);
});
test('truncated results disable replacement and server errors are shown',t=>{
 const f=ui(t);f.send({type:'done',count:1000,files:1,truncated:true});assert.equal(f.$('replaceAll').disabled,true);
 f.done();f.$('replaceAll').click();const request=f.last('previewReplacement');
 f.send({type:'replacementError',request:request.request,message:'A file changed.'});assert.equal(f.$('replaceNotice').hidden,false);assert.equal(f.$('replaceNotice').textContent,'A file changed.');
});
