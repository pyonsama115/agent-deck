'use strict';
(function () {
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const button = document.getElementById('analyticsBtn');
  if (!button) return;
  const dialog = document.getElementById('analyticsDialog') || document.body.appendChild(Object.assign(document.createElement('dialog'), { id: 'analyticsDialog' }));
  dialog.setAttribute('aria-labelledby', 'analyticsTitle');
  let period = 'week', offset = 0, report = null, request = 0, busy = false, loadController = null;
  const paidResults = new Map();
  let paidKey = null;
  const periodKey = () => `${period}:${report?.period?.start || offset}`;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = value => new Intl.NumberFormat('ja-JP', {maximumFractionDigits:1}).format(number(value));
  const token = value => value == null ? '未取得' : number(value) >= 1000000 ? `${fmt(value / 1000000)}M` : number(value) >= 1000 ? `${fmt(value / 1000)}k` : fmt(value);
  const dateLabel = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'}).format(d); };
  const q = selector => dialog.querySelector(selector);
  dialog.innerHTML = `<div class="analytics-shell"><div class="analytics-head"><div><h2 id="analyticsTitle">一緒に働いた時間を、次へ。</h2><p>Claude と Codex の週間・月間レポート</p></div><button type="button" class="btn" data-action="close" aria-label="分析を閉じる">閉じる</button></div><div class="analytics-toolbar"><div class="analytics-period" role="group" aria-label="集計期間"><button type="button" data-period="week" aria-pressed="true">週間</button><button type="button" data-period="month" aria-pressed="false">月間</button></div><div class="analytics-dates"><button type="button" class="btn" data-action="prev" aria-label="前の期間">←</button><strong id="analyticsRange">読み込み中</strong><button type="button" class="btn" data-action="next" aria-label="次の期間" disabled>→</button></div></div><div id="analyticsBody" aria-live="polite"></div></div>`;
  function demoReport() {
    // UTC calendar arithmetic over the explicit Tokyo calendar avoids host-zone drift.
    const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const calendarStart = new Date(today+'T00:00:00Z');
    if (period === 'week') calendarStart.setUTCDate(calendarStart.getUTCDate() - (calendarStart.getUTCDay()+6)%7 + offset*7);
    else { calendarStart.setUTCDate(1); calendarStart.setUTCMonth(calendarStart.getUTCMonth()+offset); }
    const calendarEnd = new Date(calendarStart); if(period==='week') calendarEnd.setUTCDate(calendarEnd.getUTCDate()+7); else calendarEnd.setUTCMonth(calendarEnd.getUTCMonth()+1);
    const start=new Date(calendarStart.getTime()-9*3600000),finish=new Date(calendarEnd.getTime()-9*3600000);
    const days = Math.round((finish-start)/86400000);
    const daily = Array.from({length:days},(_,i)=>{const time=start.getTime()+i*86400000;const future=time>Date.now();return {date:new Date(time).toISOString(),claudeHours:future?0:[1.2,2.4,3.1,1.6,3.6,2.1,1.8][i%7],codexHours:future?0:[1.4,.8,2.2,1.3,2.5,1.2,1.2][i%7]};});
    const providers=['claude','codex'].map((id,i)=>{const activeHours=daily.reduce((sum,d)=>sum+d[id+'Hours'],0);return {id,activeHours,sessions:Math.round(activeHours*1.8),tokens:Math.round(activeHours*(i?148000:178000)),subagents:Math.round(activeHours*.7)};});
    const sessions=providers.reduce((sum,p)=>sum+p.sessions,0),subagents=providers.reduce((sum,p)=>sum+p.subagents,0);
    return {demo:true,period:{label:dateLabel(start)+' – '+dateLabel(new Date(finish-1)),start:start.toISOString(),end:finish.toISOString()},summary:{activeHours:providers.reduce((sum,p)=>sum+p.activeHours,0)-daily.reduce((sum,d)=>sum+Math.min(d.claudeHours,d.codexHours)*.6,0),collaborationHours:daily.reduce((sum,d)=>sum+Math.min(d.claudeHours,d.codexHours)*.6,0),sessions,subagentRatio:sessions?subagents/sessions:0,tokens:providers.reduce((sum,p)=>sum+p.tokens,0)},providers,daily,recommendations:[{title:'並行して進める時間を、意識してつくる',detail:'設計・レビューを Claude、実装と検証を Codex に分けると、両方の強みを使う計画を立てやすくなります。品質と所要時間を見て役割を入れ替えてください。'},{title:'サブエージェントは、切り分けやすい作業から',detail:'調査・テスト・独立した画面など、ファイルの競合が少ない作業を並行化する候補にしましょう。'},{title:'API クレジットは、月末前に残高を確認',detail:'API クレジットと Claude / Codex の契約使用枠は別です。Console の残高・有効期限を確認して、必要な分析に使いましょう。'}],coverage:{since:start.toISOString(),notes:['この画面はサンプルデータです。実際の利用状況には加算されません。']},ai:{available:false,maxCostUSD:.5}};
  }
  function render(data) {
    report=data;
    const s=data.summary||{}, providers=data.providers||[], daily=data.daily||[], ai=data.ai||{}, notes=data.coverage?.notes||[];
    q('#analyticsRange').textContent=data.period?.label||'集計期間';
    const total=providers.reduce((sum,p)=>sum+number(p.activeHours),0);
    const max=Math.max(1,...daily.map(d=>number(d.claudeHours)+number(d.codexHours)));
    const recommendations=data.recommendations||[];
    const empty = !data.demo && number(s.sessions) === 0 && number(s.activeHours) === 0;
    q('#analyticsBody').innerHTML=`<div class="analytics-status" data-demo="${!!data.demo}"><strong>${data.demo?'デモ · サンプルのレポート':'この PC で記録された利用状況'}</strong>${data.coverage?.since?` · 記録開始 ${esc(dateLabel(data.coverage.since))}`:''}<br>${esc(notes.join(' ')||'アクティブ時間は記録からの推定です。記録のない期間は集計されません。')}</div>${empty?'<div class="analytics-empty"><strong>この期間の記録はまだありません</strong>別の期間を選ぶか、ダッシュボードを起動したまま Claude / Codex を利用してください。</div>':''}<div class="analytics-kpis"><div class="analytics-kpi"><span>一緒に働いた時間</span><strong>${fmt(s.activeHours)}<small style="display:inline;font-size:13px"> 時間</small></strong><small>両者の稼働を合わせた実時間（重複を除く）</small></div><div class="analytics-kpi"><span>Claude × Codex の並行時間</span><strong>${fmt(s.collaborationHours)}<small style="display:inline;font-size:13px"> 時間</small></strong><small>両方が同時に稼働した時間</small></div><div class="analytics-kpi"><span>サブエージェントの活用率</span><strong>${s.subagentRatio==null?'—':fmt(number(s.subagentRatio)*100)+'%'}</strong><small>全セッションに占めるサブエージェントの比率</small></div><div class="analytics-kpi"><span>記録されたトークン</span><strong>${token(s.tokens)}</strong><small>${fmt(s.sessions)} セッション · 契約残量とは異なります</small></div></div><div class="analytics-columns"><div><section class="analytics-section"><h3>ふたりの働き方<small>稼働時間で比較 · ローカル記録から推定</small></h3>${providers.map(p=>`<div class="analytics-provider" data-agent="${p.id==='codex'?'codex':'claude'}"><div class="analytics-provider-title"><i class="analytics-dot ${p.id==='codex'?'codex':''}"></i><strong>${p.id==='codex'?'Codex':'Claude'}</strong><strong>${fmt(p.activeHours)} 時間</strong></div><div class="analytics-meter" role="img" aria-label="${esc(p.id)} の稼働時間比率 ${fmt(total?number(p.activeHours)/total*100:0)}%"><span style="width:${total?Math.min(100,number(p.activeHours)/total*100):0}%"></span></div><div class="analytics-provider-meta"><span>${fmt(p.sessions)} セッション</span><span>${token(p.tokens)} トークン</span><span>サブエージェント ${p.subagents==null?'未取得':fmt(p.subagents)+' 件'}</span></div></div>`).join('')}<div class="analytics-quota"><h4>使い残しはある？</h4><p>${esc(data.quota?.message||'トークン数だけでは契約枠の残りを算出できません。Claude / Codex の使用枠はプロバイダーの表示を確認してください。Anthropic Console の API クレジット残高・有効期限も別管理です。')}</p></div></section><section class="analytics-section"><h3>日ごとのリズム<small>日別の稼働時間 · 棒の高さは期間内の相対値</small></h3>${daily.length?`<div class="analytics-chart" role="img" aria-label="日別稼働時間。詳細は集計 JSON から確認できます。">${daily.map((d,i)=>`<div class="analytics-day" title="${esc(dateLabel(d.date))} Claude ${fmt(d.claudeHours)} 時間 / Codex ${fmt(d.codexHours)} 時間"><div class="analytics-bar-stack"><i style="height:${number(d.claudeHours)/max*104}px"></i><i style="height:${number(d.codexHours)/max*104}px"></i></div><small>${daily.length<10||i%5===0?esc(dateLabel(d.date)):''}</small></div>`).join('')}</div><div class="analytics-legend"><span><i class="analytics-dot"></i>Claude</span><span><i class="analytics-dot codex"></i>Codex</span></div>`:'<p class="analytics-chart-note">この期間の日別記録はありません。</p>'}</section></div><div><section class="analytics-section"><h3>${period==='week'?'来週':'来月'}につなげるヒント<small>ローカルの集計値を使った提案</small></h3><ol class="analytics-recommendations">${recommendations.length?recommendations.map(r=>`<li><div><strong>${esc(typeof r==='string'?r:r.title)}</strong>${typeof r==='string'?'':`<p>${esc(r.detail||r.body||'')}</p>`}</div></li>`).join(''):'<li><div><strong>記録をためて、働き方を見つける</strong><p>ダッシュボードを起動したまま利用すると、この期間の傾向を比較できるようになります。</p></div></li>'}</ol></section><section class="analytics-ai"><h3>Claude に、もう一歩深く相談</h3><p>集計データだけを Anthropic API に送り、次の期間の使い分けを分析します。会話本文・プロンプト・ファイル内容は送りません。1 回の上限は <strong>$0.50</strong>。API クレジットを使用します。</p><button type="button" class="btn" data-action="analyze" ${!ai.available||data.demo?'disabled':''}>${data.demo?'デモでは API を実行しません':ai.available?'上限 $0.50 で詳しく分析する':'API 分析は未設定です'}</button><div class="analytics-ai-status">${data.demo?'実データの画面で、設定後に利用できます。':ai.available?'クリックすると有料の分析を 1 回実行します。':esc(ai.reason||'設定方法はプロジェクトの分析ガイドを確認してください。キーはブラウザに保存しません。')}</div><div class="analytics-ai-result" aria-live="polite"></div></section></div></div><footer class="analytics-foot"><p>時間は作業ログの間隔から推定し、実際の勤務時間や成果を表すものではありません。${data.demo?'サンプルは実データから分離されています。':'この PC 以外の記録は含みません。'}<br>比較・再計算のために、表示中の集計値を JSON で保存できます。</p><button type="button" class="btn" data-action="download">集計 JSON を保存</button></footer>`;
  }
  async function load() {
    loadController?.abort(); loadController=new AbortController();
    const id=++request; report=null;
    q('[data-action="next"]').disabled=offset>=0;
    dialog.querySelectorAll('[data-period]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.period===period)));
    q('#analyticsBody').innerHTML='<div class="analytics-loading" role="status">記録をまとめています…</div>';
    try { const data=demo?demoReport():await fetch(`/api/analytics?period=${period}&offset=${offset}`,{cache:'no-store',signal:loadController.signal}).then(async r=>{const value=await r.json();if(!r.ok)throw new Error(value.error||'集計の取得に失敗しました');return value;});if(id===request){render(data);syncPaid();} }
    catch(error){if(error.name==='AbortError')return;if(id===request)q('#analyticsBody').innerHTML=`<div class="analytics-error"><strong>レポートを取得できませんでした</strong>${esc(error.message)}<br><button type="button" class="btn" data-action="retry">再読み込み</button></div>`;}
  }
  function syncPaid() {
    if(!report)return;
    const trigger=q('[data-action="analyze"]'),status=q('.analytics-ai-status'),result=q('.analytics-ai-result');
    const cached=paidResults.get(periodKey());
    if(cached){result.textContent=cached.text;status.textContent=cached.status;}
    if(busy){trigger.disabled=true;status.textContent=paidKey===periodKey()?'この期間を分析しています。結果はこの期間に保存されます。':'別の期間を分析中です。完了するまで新しい有料分析は実行できません。';}
    else trigger.disabled=!!demo||!report.ai?.available;
  }
  async function analyze() {
    if(busy||!report||demo||!report.ai?.available)return;
    busy=true;paidKey=periodKey();const key=paidKey,body={period,offset,maxCostUSD:.5};
    syncPaid();
    try {const response=await fetch('/api/analytics/analyze',{method:'POST',headers:{'Content-Type':'application/json','X-Agent-Deck':'1'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw new Error(value.error||'分析できませんでした');paidResults.set(key,{text:value.analysis||value.text||'分析結果が返されませんでした。',status:'分析が完了しました。'+(value.costUSD!=null?'推定費用 $'+Number(value.costUSD).toFixed(4):'費用は Anthropic Console で確認できます。')});}
    catch(error){paidResults.set(key,{text:'',status:'分析を実行できませんでした：'+error.message});}
    finally{busy=false;paidKey=null;syncPaid();}
  }
  dialog.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.dataset.period){period=target.dataset.period;offset=0;load();return;}
    switch(target.dataset.action){case 'close':dialog.close();break;case 'prev':offset--;load();break;case 'next':if(offset<0){offset++;load();}break;case 'retry':load();break;case 'analyze':analyze();break;case 'download':if(report){const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=Object.assign(document.createElement('a'),{href:url,download:`agent-deck-${period}-${offset}${demo?'-demo':''}.json`});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}break;}
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{loadController?.abort();++request;});
  q('.analytics-period').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'week':event.key==='End'?'month':period==='week'?'month':'week';period=next;offset=0;q('[data-period='+next+']').focus();load();});
  button.addEventListener('click',()=>{if(!dialog.open){dialog.showModal();load();}});
})();


