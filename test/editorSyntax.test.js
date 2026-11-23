const {test}=require('node:test');
const assert=require('node:assert/strict');
const {tokenizeEditor}=require('../src/editorSyntax');
test('TextMate colors and font styles use document offsets and multiline grammar state',async()=>{
 const grammar={},states=[];
 const syntax={grammarFor:async(file,language)=>{assert.equal(file,'file.py');assert.equal(language,'python');return grammar;},tokenize:(g,line,state)=>{assert.equal(g,grammar);states.push(state);return {state:line,spans:[{start:0,end:line.length,color:'#ABCDEF',italic:true},{start:line.length,end:line.length}]};}};
 const spans=await tokenizeEditor(syntax,'file.py','python','🌍 hi\nsecond');
 assert.deepEqual(states,[null,'🌍 hi']);assert.equal(spans[0].color,'#ABCDEF');assert.equal(spans[1].start,6);assert.equal(spans[1].end,12);assert.equal(spans[1].italic,true);
});
test('missing grammars and cancelled highlighting return no stale colors',async()=>{
 assert.deepEqual(await tokenizeEditor({grammarFor:async()=>null},'file','text','data'),[]);
 let cancelled=false;
 const syntax={grammarFor:async()=>({}),tokenize:()=>{cancelled=true;return {state:null,spans:[{start:0,end:1,color:'#123456'}]};}};
 assert.deepEqual(await tokenizeEditor(syntax,'file','text','x',()=>cancelled),[]);
});
