'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {codexParentId,attachCodexSubagents}=require('../subagents');
test('Codex parent linkage accepts real structured metadata only',()=>{
 assert.equal(codexParentId({source:{subagent:{thread_spawn:{parent_thread_id:'parent'}}}}),'parent');
 for(const meta of [{},{source:'exec'},{source:{subagent:{thread_spawn:{parent_thread_id:42}}}}])assert.equal(codexParentId(meta),null);
});
test('child observations count working children, distinguish waiting and retain missing coverage',()=>{
 const now=Date.now();const sessions=[{agent:'codex',sessionId:'p',state:'working'},{agent:'codex',sessionId:'none',subagents:null},{agent:'claude',sessionId:'p',subagents:null}];
 const child=(id,state,age=0)=>({agent:'codex',sessionId:id,parentSessionId:'p',state,lastActivity:now-age,startedAt:now});
 sessions.push(child('a','working'),child('b','waiting'),child('c','idle'),child('d','working',16*60e3),child('a','working'));
 attachCodexSubagents(sessions,now);
 assert.equal(sessions[0].subagents.active,1);assert.equal(sessions[0].subagents.waiting,1);assert.equal(sessions[0].subagents.total,4);
 assert.equal(sessions[0].subagents.estimated,true);assert.equal(sessions[0].act,'agent');assert.equal(sessions[1].subagents,null);assert.equal(sessions[2].subagents,null);
});
test('finished child does not leave parent in collaboration animation',()=>{
 const p={agent:'codex',sessionId:'p',state:'working',act:'think'};
 attachCodexSubagents([p,{agent:'codex',sessionId:'a',parentSessionId:'p',state:'idle',lastActivity:Date.now()}]);
 assert.equal(p.subagents.active,0);assert.equal(p.act,'think');
});
