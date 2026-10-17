'use strict';
// Aggregate-only historical analysis. No transcript text survives the importer.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { setImmediate: yieldLoop } = require('timers/promises');
const DAY = 86400000, JST = 9 * 3600000, GAP = 5 * 60000;
const MODEL = 'claude-haiku-4-5-20251001';
const PRICE = {input: 1 / 1e6, output: 5 / 1e6};
const MAX_COST = 0.50, MAX_OUTPUT = 3000;
const numeric = v => Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0;
const empty = () => ({sessions:0,mainSessions:0,subagentSessions:0,inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,totalTokens:0,estimatedWorkMs:0,subagentRatio:0});
function periodBounds(kind='week', offset=0, now=Date.now()) {
  if (!['week','month'].includes(kind) || !Number.isInteger(offset) || offset > 0 || offset < -120) throw Object.assign(new Error('期間は week / month、offset は -120〜0 を指定してください。'),{status:400});
  const d = new Date(now + JST); d.setUTCHours(0,0,0,0);
  let end;
  if(kind==='week') {d.setUTCDate(d.getUTCDate() - (d.getUTCDay()+6)%7 + offset*7); end = d.getTime()+7*DAY-JST;}
  else {d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+offset);const e=new Date(d);e.setUTCMonth(e.getUTCMonth()+1);end=e.getTime()-JST;}
  const start=d.getTime()-JST;
  const labelDate = t => new Date(t+JST).toISOString().slice(0,10).replaceAll('-','/');
  return {kind,offset,start:new Date(start).toISOString(),end:new Date(end).toISOString(),label:`${labelDate(start)} – ${labelDate(end-1)}`,timeZone:'Asia/Tokyo'};
}
function usage(u={}, codex=false) {
  const input=numeric(u.input_tokens), output=numeric(u.output_tokens), read=numeric(codex?u.cached_input_tokens:u.cache_read_input_tokens), write=numeric(u.cache_creation_input_tokens);
  // Codex cached input is already INCLUDED in input_tokens; Claude cache counts are additional.
  return {inputTokens:input,outputTokens:output,cacheReadTokens:read,cacheWriteTokens:write,totalTokens:codex?(numeric(u.total_tokens)||input+output):input+output+read+write};
}
function maxUsage(a,b) { for(const k of Object.keys(b)) a[k]=Math.max(a[k]||0,b[k]); return a; }
async function parseTranscript(file,provider) {
  const result={provider,id:path.basename(file,'.jsonl'),subagent: /[\\/]subagents[\\/]/i.test(file),parent:null,events:[],intervals:[],quota:[],malformed:0};
  const messages=new Map(), times=new Set(), cumulative={}; let previousTime=null, lines=0, hasCumulative=false;
  const stream=fs.createReadStream(file,{encoding:'utf8'});
  const input=readline.createInterface({input:stream,crlfDelay:Infinity});
  try { for await (const line of input) {
    if(++lines%400===0) await yieldLoop();
    if(!line.trim()) continue;
    let o;try{o=JSON.parse(line);}catch{result.malformed++;continue;}
    const t=Date.parse(o.timestamp);
    if(provider==='codex' && o.type==='session_meta') {
      const p=o.payload||{}; result.id=p.id||result.id;
      const source=p.source;
      if(source && typeof source==='object' && source.subagent) {result.subagent=true;result.parent=source.subagent.thread_spawn?.parent_thread_id||null;}
    }
    if(provider==='codex' && o.type==='event_msg' && o.payload?.rate_limits && Number.isFinite(t)) {
      for(const [name,w] of Object.entries(o.payload.rate_limits)) if(w && typeof w==='object' && Number.isFinite(Number(w.used_percent))) result.quota.push({provider:'codex',name,t,usedPercent:Math.max(0,Math.min(100,Number(w.used_percent))),windowMinutes:numeric(w.window_minutes),resetsAt:w.resets_at?Number(w.resets_at)*1000:null});
    }
    if(provider==='claude') {
      if(o.sessionId && !result.subagent)result.id=o.sessionId;
      if(o.isSidechain) result.subagent=true;
      if(Number.isFinite(t) && ['user','assistant','progress'].includes(o.type))times.add(t);
      if(o.type==='assistant' && o.message?.usage && Number.isFinite(t)) {
        const m=o.message, key=m.id ? `${m.id}:${o.requestId||''}` : o.uuid;
        // Missing IDs cannot safely be deduplicated across stream snapshots.
        if(!key) continue;
        const prev=messages.get(key)||{t,u:{}};prev.t=Math.min(prev.t,t);maxUsage(prev.u,usage(m.usage));messages.set(key,prev);
      }
    } else {
      if(Number.isFinite(t) && ['response_item','event_msg'].includes(o.type)) times.add(t);
      if(o.type==='event_msg' && o.payload?.type==='token_count' && Number.isFinite(t)) {
        const info=o.payload.info;
        if(!info)continue;
        if(info.total_token_usage) { hasCumulative=true;
          const total=usage(info.total_token_usage,true), delta={}; if(total.totalTokens < (cumulative.totalTokens||0)) for(const k of Object.keys(cumulative)) cumulative[k]=0;
          for(const [k,v] of Object.entries(total)){delta[k]=Math.max(0,v-(cumulative[k]||0));cumulative[k]=v;}
          // A decreasing total marks a new counter epoch; count only from zero for that epoch.
          if(Object.values(delta).some(v=>v)) result.events.push({t,u:delta});
        } else if(info.last_token_usage) {
          // last_token_usage without totals can be emitted repeatedly. Deduplicate exact event identity.
          const u=usage(info.last_token_usage,true),key=`${t}:${JSON.stringify(u)}`;
          if(!messages.has(key))messages.set(key,{t,u});
        }
      }
    }
  }} finally {input.close();stream.destroy();}
  if(provider==='claude' || !hasCumulative) result.events.push(...messages.values());
  const sorted=[...times].sort((a,b)=>a-b);
  for(const t of sorted){if(previousTime!==null && t>previousTime && t-previousTime<=GAP)result.intervals.push([previousTime,t]);previousTime=t;}
  result.times=sorted;
  return result;
}
async function discover(root,provider,depth=0,out=[]) {
  let entries;try{entries=await fs.promises.readdir(root,{withFileTypes:true});}catch{return out;}
  for(const e of entries){const p=path.join(root,e.name);if(e.isDirectory()&&depth<12)await discover(p,provider,depth+1,out);else if(e.isFile()&&e.name.endsWith('.jsonl'))out.push({file:p,provider});}
  return out;
}
function union(intervals) {
  const sorted=intervals.filter(x=>x[1]>x[0]).sort((a,b)=>a[0]-b[0]), out=[];
  for(const v of sorted){const last=out[out.length-1];if(last&&v[0]<=last[1])last[1]=Math.max(last[1],v[1]);else out.push([...v]);}return out;
}
const duration=xs=>xs.reduce((s,[a,b])=>s+b-a,0);
function overlap(a,b){let i=0,j=0,ms=0;while(i<a.length&&j<b.length){ms+=Math.max(0,Math.min(a[i][1],b[j][1])-Math.max(a[i][0],b[j][0]));if(a[i][1]<b[j][1])i++;else j++;}return ms;}
function aggregate(records,period) {
  const start=Date.parse(period.start),end=Date.parse(period.end), totals=empty(), by=new Map(['claude','codex'].map(id=>[id,{id,label:id==='claude'?'Claude':'Codex',...empty()}]));
  const series=[];for(let t=start;t<end;t+=DAY)series.push({date:new Date(t+JST).toISOString().slice(0,10),...empty(),claudeHours:0,codexHours:0});
  const intervals={claude:[],codex:[]}, sessions=new Set(), sub=new Set();
  for(const r of records){const p=by.get(r.provider),key=`${r.provider}:${r.id}`,active=r.times.some(t=>t>=start&&t<end)||r.events.some(e=>e.t>=start&&e.t<end);
    if(active&&!sessions.has(key)){sessions.add(key);totals.sessions++;p.sessions++;if(r.subagent){sub.add(key);totals.subagentSessions++;p.subagentSessions++;}else{totals.mainSessions++;p.mainSessions++;}}
    for(const e of r.events){if(e.t<start||e.t>=end)continue;const day=series[Math.floor((e.t-start)/DAY)];for(const [k,v]of Object.entries(e.u)){totals[k]+=v;p[k]+=v;day[k]+=v;}}
    for(const [a,b]of r.intervals){const interval=[Math.max(a,start),Math.min(b,end)];if(interval[1]>interval[0])intervals[r.provider].push(interval);}
  }
  for(const p of by.values()){const xs=union(intervals[p.id]);intervals[p.id]=xs;p.estimatedWorkMs=duration(xs);p.subagentRatio=p.sessions?p.subagentSessions/p.sessions:0;p.activeHours=p.estimatedWorkMs/3600000;p.tokens=p.totalTokens;p.subagents=p.subagentSessions;
    series.forEach((d,i)=>{const a=start+i*DAY,b=a+DAY;d[`${p.id}Hours`]=duration(xs.map(([s,e])=>[Math.max(a,s),Math.min(b,e)]).filter(([s,e])=>e>s))/3600000;});}
  totals.estimatedWorkMs=duration(union([...intervals.claude,...intervals.codex]));totals.subagentRatio=totals.sessions?sub.size/totals.sessions:0;
  const collaborationHours=overlap(intervals.claude,intervals.codex)/3600000;
  return {totals,providers:[...by.values()],series,daily:series,summary:{activeHours:totals.estimatedWorkMs/3600000,collaborationHours,sessions:totals.sessions,subagentRatio:totals.subagentRatio,tokens:totals.totalTokens}};
}
function aiStatus(env=process.env){const available=env.AGENT_DECK_AI_ANALYSIS==='1'&&!!env.ANTHROPIC_API_KEY;return {available,enabled:available,model:MODEL,maxCostUSD:MAX_COST,maxCostUsd:MAX_COST,reason:available?null:'サーバーで AGENT_DECK_AI_ANALYSIS=1 と ANTHROPIC_API_KEY を設定してください。'};}
function createAnalytics({claudeDir,codexDir,env=process.env,fetchImpl=global.fetch,now=()=>Date.now(),claudePlanUsageFile}={}) {
  const cache=new Map();let scanPromise=null,lastScan=0,records=[],fileCount=0,scanErrors=0,inFlight=false,lastAI=0;
  async function refresh(){if(lastScan&&now()-lastScan<30000)return;if(scanPromise)return scanPromise;
    scanPromise=(async()=>{const files=[...await discover(path.join(claudeDir,'projects'),'claude'),...await discover(path.join(codexDir,'sessions'),'codex'),...await discover(path.join(codexDir,'archived_sessions'),'codex')];const parsed=[];scanErrors=0;
      for(const {file,provider}of files){try{const st=await fs.promises.stat(file),old=cache.get(file);if(old&&old.size===st.size&&old.mtime===st.mtimeMs){parsed.push(old.record);continue;}const record=await parseTranscript(file,provider);cache.set(file,{size:st.size,mtime:st.mtimeMs,record});parsed.push(record);}catch{scanErrors++;}}
      // Copied or archived session files are alternatives, never additive. Prefer the most complete record.
      const dedup=new Map();for(const r of parsed){const key=`${r.provider}:${r.id}`,old=dedup.get(key);if(!old||r.times.length+r.events.length>old.times.length+old.events.length)dedup.set(key,r);}records=[...dedup.values()];fileCount=files.length;lastScan=now();
      const existing=new Set(files.map(f=>f.file));for(const key of cache.keys())if(!existing.has(key))cache.delete(key);
    })().finally(()=>{scanPromise=null;});return scanPromise;
  }
  async function report(kind='week',offset=0){const period=periodBounds(kind,Number(offset),now());await refresh();const report=aggregate(records,period),previous=aggregate(records,periodBounds(kind,Number(offset)-1,now()));
    const notes=['稼働時間は同一セッション内で 5 分以内の記録間隔を合算し、同時稼働を重複除去した推定値です。人の勤務時間・課金時間ではありません。','サブエージェント比率 = サブエージェントのセッション数 ÷ 全セッション数。演出上の仲間は含みません。','ログが存在するこの PC の履歴のみ対象。削除された履歴・取得できないセッションは含みません。','Claude のキャッシュ入力は合算。Codex のキャッシュ入力は input_tokens に含まれるため二重加算しません。'];
    if(scanErrors)notes.push(`${scanErrors} ファイルを読み取れませんでした。`);
    const malformed=records.reduce((s,r)=>s+r.malformed,0);if(malformed)notes.push(`途中書き込みを含む ${malformed} 行を読み飛ばしました。`);
    const earliest=records.reduce((first,r)=>r.times.length?Math.min(first,r.times[0]):first,Infinity);
    const recommendations=[];const p=report.providers,dominant=p.reduce((a,b)=>a.estimatedWorkMs>b.estimatedWorkMs?a:b),other=p.find(v=>v!==dominant);
    if(!report.totals.sessions)recommendations.push({title:'まず記録をためる',detail:'この期間のログがありません。Claude と Codex を利用後に再表示すると履歴から集計します。'});
    else {if(other.estimatedWorkMs<dominant.estimatedWorkMs*.25)recommendations.push({title:`次の独立した作業を ${other.label} に割り当てる`,detail:`記録上は ${dominant.label} に作業が集中しています。小さな実装・調査・レビューをもう一方に任せ、所要時間と成果を比較してください。`});
    if(report.totals.subagentRatio<.15)recommendations.push({title:'独立した調査・検証を並行化する',detail:'記録上のサブエージェント比率は低めです。別ファイルの調査やテストを候補にし、共有ファイルへの同時編集を避けてください。'});
    else recommendations.push({title:'並行化の効果を成果でも確認する',detail:'サブエージェントの利用が記録されています。数を増やす前に、重複調査や手戻りが減っているか振り返ってください。'});}
    recommendations.push({title:'API クレジットは残高と期限を確認して使う',detail:'Anthropic Console の API クレジットは Claude の契約使用枠と別です。残高はこのアプリでは未取得です。必要な週次・月次の集計分析に限定し、クレジット消費自体を目的にしないでください。'});
    const quotaObservations=records.flatMap(r=>r.quota||[]).filter(q=>q.t>=Date.parse(period.start)&&q.t<Date.parse(period.end));
    if(claudePlanUsageFile) {try {const plan=JSON.parse(await fs.promises.readFile(claudePlanUsageFile,'utf8'));for(const sample of plan.samples||[]){if(sample.t<Date.parse(period.start)||sample.t>=Date.parse(period.end))continue;for(const [name,minutes,key] of [['five_hour',300,'fh'],['seven_day',10080,'sd']])if(sample.u?.[key]!=null && Number.isFinite(Number(sample.u[key])))quotaObservations.push({provider:'claude',name,t:sample.t,usedPercent:Math.max(0,Math.min(100,Number(sample.u[key]))),windowMinutes:minutes,resetsAt:null});}}catch{}}
    const latestQuota=new Map();for(const q of quotaObservations){const key=q.provider+':'+q.name;if(!latestQuota.has(key)||q.t>latestQuota.get(key).t)latestQuota.set(key,q);}
    const quotaWindows=[...latestQuota.values()].map(q=>({...q,observedAt:new Date(q.t).toISOString(),unusedPercentAtObservation:100-q.usedPercent,status:'observed'}));
    const quotaText=quotaWindows.map(q=>(q.provider==='claude'?'Claude':'Codex')+' '+(q.windowMinutes>=10080?'週枠':q.windowMinutes?Math.round(q.windowMinutes/60)+'時間枠':q.name)+': 最終観測時に '+Math.round(q.unusedPercentAtObservation)+'% 未使用 ('+new Date(q.t+JST).toISOString().slice(0,16).replace('T',' ')+' JST)').join('。');
    const change=(a,b)=>b?Math.round((a-b)/b*1000)/10:null;
    return {period,...report,recommendations,comparison:{previousTotalTokens:previous.totals.totalTokens,tokenChangePercent:change(report.totals.totalTokens,previous.totals.totalTokens),previousEstimatedWorkMs:previous.totals.estimatedWorkMs,workChangePercent:change(report.totals.estimatedWorkMs,previous.totals.estimatedWorkMs)},coverage:{since:earliest&&Number.isFinite(earliest)?new Date(earliest).toISOString():null,notes},dataQuality:{notes,filesScanned:fileCount,malformedLines:malformed,unreadableFiles:scanErrors,workTimeMethod:'union of same-session consecutive log timestamps, gaps <= 5 minutes',subagentRatioDefinition:'subagent sessions / all distinct sessions'},quota:{windows:quotaWindows,message:(quotaText?quotaText+'。これは観測時点の残りで、リセット直前の使い残しを保証しません。 ':'')+'契約枠の使い残しはトークン数からは算出できません。現在の使用枠はメイン画面のプロバイダー表示で確認してください。過去の枠残量と Anthropic Console の API クレジット残高・期限は未取得です。'},allowance:{status:'unknown'},credits:{status:'unknown',note:'API credit balance is separate from subscription quota; not available from local logs.'},ai:aiStatus(env)};
  }
  async function analyze(kind,offset){if(!aiStatus(env).available)throw Object.assign(new Error('API 分析はサーバー設定後に利用できます。'),{status:503});if(inFlight||lastAI&&now()-lastAI<60000)throw Object.assign(new Error('分析は 1 分あけて実行してください。'),{status:429});inFlight=true;
    try{const r=await report(kind,offset);const payload={period:r.period,totals:r.totals,providers:r.providers,comparison:r.comparison,method:r.dataQuality.workTimeMethod,quotaKnown:false,creditBalanceKnown:false};
      const system='日本語で、集計だけに基づき Claude と Codex の次週・次月の利用改善を提案してください。実測でない時間、費用、品質を断定しない。契約残量やAPI残高は不明。簡潔に傾向・注意点・具体的な3つの行動を示す。';
      const text=JSON.stringify(payload); // JSON contains counts, dates and fixed labels only.
      // UTF-8 byte count is a deliberately conservative upper token bound, plus fixed protocol allowance.
      const inputBound=Buffer.byteLength(system+text,'utf8')+4096,upperCost=inputBound*PRICE.input+MAX_OUTPUT*PRICE.output;
      if(upperCost>MAX_COST)throw Object.assign(new Error('入力が 1 回 $0.50 の予算上限を超えます。'),{status:400});
      lastAI=now();const response=await fetchImpl('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':env.ANTHROPIC_API_KEY},body:JSON.stringify({model:MODEL,max_tokens:MAX_OUTPUT,system,messages:[{role:'user',content:text}]}),signal:AbortSignal.timeout(45000)});
      if(!response.ok)throw Object.assign(new Error(`Anthropic API が分析を完了できませんでした (HTTP ${response.status})。Console を確認してください。自動再試行はしません。`),{status:502});
      const value=await response.json(),analysis=(value.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');if(!analysis)throw Object.assign(new Error('API から分析本文が返りませんでした。'),{status:502});
      const costUSD=numeric(value.usage?.input_tokens)*PRICE.input+numeric(value.usage?.output_tokens)*PRICE.output;return {analysis,model:MODEL,costUSD,estimatedMaxCostUsd:upperCost,maxCostUSD:MAX_COST};
    }finally{inFlight=false;}
  }
  function handle(req,res,url){if(!url.pathname.startsWith('/api/analytics'))return false;const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    if(req.method==='GET'&&url.pathname==='/api/analytics/status'){send(200,aiStatus(env));return true;}
    if(req.method==='GET'&&url.pathname==='/api/analytics'){report(url.searchParams.get('period')||'week',Number(url.searchParams.get('offset')||0)).then(v=>send(200,v)).catch(e=>send(e.status||500,{error:e.status?e.message:'履歴の集計に失敗しました。'}));return true;}
    if(req.method==='POST'&&url.pathname==='/api/analytics/analyze'){
      if(req.headers['x-agent-deck']!=='1'){send(403,{error:'分析にはダッシュボードからの明示的な操作が必要です。'});return true;}
      if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`){send(403,{error:'同じダッシュボードから実行してください。'});return true;}
      let body='',tooLarge=false;req.on('data',c=>{body+=c;if(body.length>4096){tooLarge=true;body='';}});req.on('end',async()=>{if(tooLarge){send(413,{error:'リクエストが大きすぎます。'});return;}let data;try{data=JSON.parse(body);}catch{send(400,{error:'JSON が正しくありません。'});return;}try{send(200,await analyze(data.period||'week',Number(data.offset||0)));}catch(e){send(e.status||502,{error:e.status?e.message:'API 分析に失敗しました。自動再試行はしません。'});}});return true;
    }send(405,{error:'この操作には対応していません。'});return true;
  }
  return {report,analyze,handle};
}
module.exports={createAnalytics,periodBounds,parseTranscript,aggregate,usage,aiStatus,union,overlap};

