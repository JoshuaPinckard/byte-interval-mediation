'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {fixture,binding}=require('../tests/helpers/byte-authority-fixture');
test('paper review: leases are checked at admission, not as publication deadlines',async t=>{
 let now=1000,checks=0;
 const f=fixture(t,Buffer.from('abcdefghij'),{now:()=>now}),a=binding('paper-expiry');
 const read=await f.authority.observeRead({binding:a,resource:f.resource});
 const result=await f.authority.applyPatch({binding:a,resource:f.resource,derivePatch:()=>({startByte:0,endByte:1,replacement:Buffer.from('A')}),assertCurrent:()=>{checks++;if(checks===2)now=read.receipt.expiresAtMs+1;}});
 assert(now>read.receipt.expiresAtMs);assert.equal(fs.readFileSync(f.resource,'utf8'),'Abcdefghij');
 console.log(JSON.stringify({observationExpiresAt:read.receipt.expiresAtMs,clockAtCommit:now,outcome:result.receipt.outcome,scopeChecks:checks}));
});
test('paper review: unmediated cross-file changes after validation are not fenced',async t=>{
 let checks=0;
 const f=fixture(t),a=binding('paper-cross-file'),dep=f.file('interface.txt','old');
 await f.authority.observeRead({binding:a,resource:dep});await f.authority.observeRead({binding:a,resource:f.resource});
 const result=await f.authority.applyPatch({binding:a,resource:f.resource,derivePatch:()=>({startByte:0,endByte:1,replacement:Buffer.from('A')}),assertCurrent:()=>{checks++;if(checks===2)fs.writeFileSync(dep,'new');}});
 assert.equal(fs.readFileSync(dep,'utf8'),'new');assert.equal(fs.readFileSync(f.resource,'utf8'),'Abcdefghij');
 console.log(JSON.stringify({unmediatedDependencyChangedAfterValidation:true,outcome:result.receipt.outcome}));
});
