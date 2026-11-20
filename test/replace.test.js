const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planFile,replacementFor}=require('../src/replace');
const item=(text,start,end,line=0)=>({text,start,end,line});

test('literal replacement preserves dollar tokens and supports deletion',()=>{
 const m=item('hello hello',0,5);
 assert.equal(replacementFor(m,{regex:false},'$1 $$'), '$1 $$');
 assert.equal(planFile(m.text,[m],{},'').preview[0].after,' hello');
});
test('multiple matches in one line use original offsets and deduplicate overlapping search roots',()=>{
 const a=item('foo foo',0,3),b=item('foo foo',4,7);
 const plan=planFile(a.text,[a,b,a],{},'longer');
 assert.equal(plan.edits.length,2);
 assert.equal(plan.preview[0].after,'longer longer');
});
test('regular expression replacements match JavaScript substitution semantics',()=>{
 const options={regex:true,query:'(?<first>a)(b)?',caseSensitive:true};
 const m=item('xabz',1,3);
 for(const replacement of ['$1-$2-$<first>','$$ $& $` $\'','$10 $20 $99 $01 $0','$<missing>']) {
  assert.equal(planFile(m.text,[m],options,replacement).preview[0].after,m.text.replace(new RegExp(options.query,'g'),replacement));
 }
});
test('lookbehind and optional groups resolve against the entire original line',()=>{
 const m=item('xfoo',1,4);
 assert.equal(replacementFor(m,{regex:true,query:'(?<=x)(foo)(z)?'},'$1$2'), 'foo');
});
test('Unicode, CRLF and replacement with newlines preserve editor offsets',()=>{
 const m=item('🌈 foo',3,6,1);
 const p=planFile('header\r\n🌈 foo\r\n',[m],{},'new\nline');
 assert.equal(p.preview[0].after,'🌈 new\nline');
 assert.deepEqual(p.edits[0],{line:1,start:3,end:6,text:'new\nline'});
});
test('changed lines and shifted results are rejected before planning any edit',()=>{
 const m=item('foo',0,3);
 assert.throws(()=>planFile('bar',[m],{},'x'),/changed since/);
 assert.throws(()=>planFile('new\nfoo',[m],{},'x'),/changed since/);
});
test('incompatible regex and overlapping matches fail without changing text',()=>{
 const m=item('foo',0,3);
 assert.throws(()=>replacementFor(m,{regex:true,query:'('},'x'),/not supported/);
 assert.throws(()=>replacementFor(m,{regex:true,query:'bar'},'x'),/disagree/);
 assert.throws(()=>planFile('foo',[m,item('foo',1,3)],{},'x'),/Overlapping/);
});
test('zero-width matches are handled without an infinite loop',()=>{
 assert.equal(replacementFor(item('ab',1,1),{regex:true,query:'(?=b)'},'!'),'!');
 assert.throws(()=>replacementFor(item('ab',2,2),{regex:true,query:'(?=b)'},'!'),/disagree/);
});
