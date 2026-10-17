'use strict';
// Transcript state is an observation, not proof of an OS process being alive.
function codexParentId(meta) {
  const parent=meta?.source?.subagent?.thread_spawn?.parent_thread_id;
  return typeof parent === 'string' && parent.length > 0 ? parent : null;
}
function attachCodexSubagents(sessions, now=Date.now()) {
  const groups=new Map();
  for(const s of sessions){
    if(s.agent !== 'codex' || !s.parentSessionId || s.parentSessionId === s.sessionId) continue;
    if(!groups.has(s.parentSessionId))groups.set(s.parentSessionId,new Map());
    groups.get(s.parentSessionId).set(s.sessionId,s);
  }
  const dayStart=new Date(now).setHours(0,0,0,0);
  for(const parent of sessions){
    if(parent.agent !== 'codex')continue;
    const children=groups.get(parent.sessionId);
    // No known relationship is not evidence of no subagents.
    if(!children)continue;
    const list=[...children.values()];
    parent.subagents={active:list.filter(s=>s.state==='working' && Number.isFinite(s.lastActivity) && now-s.lastActivity<=15*60e3).length,
      waiting:list.filter(s=>s.state==='waiting').length,total:list.length,
      today:list.filter(s=>s.startedAt>=dayStart).length,estimated:true,source:'observed-child-sessions',
      coverage:'recent-sessions',observedAt:now};
    if(parent.state==='working' && parent.subagents.active>0)parent.act='agent';
  }
  return sessions;
}
module.exports={codexParentId,attachCodexSubagents};
