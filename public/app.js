'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// 作業が終わってからこの時間までは「返信待ち」、過ぎたら「待機」へ
const REPLY_WINDOW_MS = 15 * 60e3;
// 作業内容の場面は短すぎる切り替えでチカチカしないよう最低この時間は保つ
const SCENE_MIN_MS = 2500;
const DEMO = new URLSearchParams(location.search).has('demo');

const VIS = {
  waiting: { label: 'あなた待ち', order: 0 },
  yourturn: { label: 'あなたの番', order: 1 },
  working: { label: '進行中', order: 2 },
  error: { label: 'エラー', order: 3 },
  stale: { label: '応答なし', order: 3 },
  interrupted: { label: '中断', order: 4 },
  standby: { label: '待機中', order: 5 },
  ended: { label: '終了', order: 9 },
};
const ACT_LABEL = {
  think: '💭 考え中', read: '🔍 調べもの中', edit: '🔨 編集中', shell: '⌨️ コマンド実行', web: '🌐 Web調査',
  browser: '🖱️ ブラウザ操作', plan: '📋 計画中', mcp: '⚙️ ツール作業', agent: '📣 部下に指示中',
  waiting: '🙋 返事待ち', permission: '🔐 許可待ち', yourturn: '🎉 できた！', standby: '💤 おやすみ中',
  error: '💥 エラー', stale: '📡 応答なし', interrupted: '✋ 中断',
};
const ACT_ICON = { think: '💭', read: '🔍', edit: '🔨', shell: '⌨️', web: '🌐', browser: '🖱️', plan: '📋', mcp: '⚙️', agent: '🤖' };
const STATE_COLOR = { working: 'var(--progress)', waiting: 'var(--reply)', idle: 'var(--reply)', error: 'var(--error)', stale: 'var(--error)', interrupted: 'var(--reply)', ended: 'var(--muted)' };
const AGENT_COLOR = { claude: '#ff8a4c', codex: '#33e1c9' };
const AGENT_NAME = { claude: 'Claude', codex: 'Codex' };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let sessions = [];
let usage = {};
let game = null;
let filter = pref('filter') || 'all';
let search = '';
let showEnded = pref('showEnded') === '1';
let showExec = pref('showExec') !== '0';
let density = ['l', 'm', 's'].includes(pref('density')) ? pref('density') : 'm';
let sound = pref('sound') === '1';
let lite = pref('lite') === '1';
let notify = pref('notify') === '1' && 'Notification' in window && Notification.permission === 'granted';
const prevState = new Map();
let firstSnapshot = true;

function pref(k) { try { return localStorage.getItem('agentdeck.' + k); } catch { return null; } }
function setPref(k, v) { try { localStorage.setItem('agentdeck.' + k, v); } catch { } }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}秒前`; if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`; return `${Math.floor(s / 86400)}日前`;
}
function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
function hhmmss(t) { return new Date(t).toLocaleTimeString('ja-JP', { hour12: false }); }
function fmtTok(n) { if (!n) return '0'; if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'; return String(n); }
function shortModel(m) { return (m || '').replace(/^claude-/, '').replace(/-\d{8}$/, ''); }
function contextLimit(s) { return s.agent === 'codex' ? (s.tokens.contextWindow || 258400) : (s.tokens.context > 200000 ? 1000000 : 200000); }
function setText(node, v) { if (node && node.textContent !== v) node.textContent = v; }

function visOf(s) {
  if (s.state === 'idle') return Date.now() - s.lastActivity < REPLY_WINDOW_MS ? 'yourturn' : 'standby';
  return VIS[s.state] ? s.state : 'standby';
}
function laneOf(vis) {
  if (vis === 'waiting' || vis === 'yourturn') return 'reply';
  if (vis === 'working') return 'progress';
  if (vis === 'ended') return 'ended';
  return 'standby';
}
function isPermission(s) { return /許可|承認|approval|permission/i.test(s.detail || ''); }
function sceneOf(s, vis) {
  if (vis !== 'working') return vis;
  if ((s.subagents && s.subagents.active) || s.act === 'agent') return 'agent';
  return s.act || 'think';
}
function actLabel(s, vis, scene) {
  if (vis === 'waiting') return ACT_LABEL[isPermission(s) ? 'permission' : 'waiting'];
  return ACT_LABEL[scene] || ACT_LABEL.think;
}

// ---------- カード ----------
const cards = new Map();
const offscreenObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const e of entries) e.target.classList.toggle('offscreen', !e.isIntersecting);
}, { rootMargin: '120px' }) : null;

function makeCard(s) {
  const el = document.createElement('div');
  el.className = 'card';
  el.tabIndex = 0;
  el.dataset.agent = s.agent;
  el.innerHTML = `
    <div class="stage"><div class="scene-host"></div>
      <div class="stage-hud">
        <span class="lv-badge" title="このロボットのレベル"><svg class="lv-ring" viewBox="0 0 20 20"><circle class="bg" cx="10" cy="10" r="7.5"/><circle class="fg" cx="10" cy="10" r="7.5" stroke-dasharray="47.1" stroke-dashoffset="47.1"/></svg>Lv.<b class="lv">1</b></span>
        <span class="act-chip"></span>
        <span class="stage-timer" hidden></span>
      </div>
    </div>
    <div class="info">
      <div class="head-row"><span class="agent-tag">${s.agent === 'claude' ? 'CLAUDE' : 'CODEX'}</span><span class="state-pill"><i></i><span class="sl"></span></span><span class="tags"></span>
        <span class="card-actions"><button class="btn small act-done" title="このセッションを終了済みに移す">✓ 完了</button></span></div>
      <div class="title"></div>
      <div class="meta"></div>
      <div class="subline" hidden></div>
      <div class="detail"></div>
      <div class="bubble" hidden></div>
      <div class="foot"><span>ctx</span><div class="ctxbar"><i></i></div><span class="num ctxn">—</span><span class="num tok"></span><span class="compact-act"></span><span class="when"></span></div>
    </div>`;
  el.addEventListener('click', e => { if (!e.target.closest('button')) openDetail(s.id); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') openDetail(s.id); });
  $('.act-done', el).addEventListener('click', e => { e.stopPropagation(); dismiss(s.id); });
  el._kind = 'full';
  if (offscreenObserver) offscreenObserver.observe(el);
  return el;
}

function makeCompact(s) {
  const el = document.createElement('div');
  el.className = 'card compact';
  el.dataset.agent = s.agent;
  el.dataset.vis = 'ended';
  el.tabIndex = 0;
  el.innerHTML = `${Scenes.tinyBot(s.agent)}<div style="min-width:0"><div class="title"></div><div class="meta"></div></div><button class="btn small act-undo" hidden>↩ 戻す</button>`;
  el.addEventListener('click', e => { if (!e.target.closest('button')) openDetail(s.id); });
  $('.act-undo', el).addEventListener('click', e => { e.stopPropagation(); dismiss(s.id, true); });
  el._kind = 'compact';
  return el;
}

function updateCard(el, s, vis) {
  el._s = s; el._vis = vis;
  if (el._kind === 'compact') {
    setText($('.title', el), s.title);
    setText($('.meta', el), [AGENT_NAME[s.agent], s.project, s.detail, ago(s.lastActivity)].filter(Boolean).join(' · '));
    $('.act-undo', el).hidden = !s.dismissed;
    return;
  }
  if (el.dataset.vis !== vis) el.dataset.vis = vis;
  // 場面の切り替え
  const now = Date.now();
  let scene = sceneOf(s, vis);
  const bothWork = vis === 'working' && el._vis0 === 'working';
  if (bothWork && el._scene && scene !== el._scene && now - el._sceneAt < SCENE_MIN_MS) scene = el._scene;
  el._vis0 = vis;
  const minis = scene === 'agent' ? Math.max(1, Math.min(6, (s.subagents && s.subagents.active) || 1)) : 0;
  const key = `${scene}|${minis}|${isPermission(s)}`;
  if (el._sceneKey !== key) {
    const stage = $('.stage', el);
    $('.scene-host', el).innerHTML = Scenes.buildScene(s.agent, scene, { minis, permission: isPermission(s) });
    if (el._sceneKey) { stage.classList.remove('swap'); void stage.offsetWidth; stage.classList.add('swap'); }
    if (scene !== el._scene) { el._scene = scene; el._sceneAt = now; }
    el._sceneKey = key;
  }
  setText($('.act-chip', el), actLabel(s, vis, scene));
  setText($('.lv', el), String(s.level || 1));
  $('.lv-ring .fg', el).style.strokeDashoffset = String(47.1 * (1 - (s.levelProgress || 0)));
  const sub = $('.subline', el);
  sub.hidden = !(s.subagents && s.subagents.total);
  if (!sub.hidden) {
    const a = s.subagents.active;
    const h = `<span class="bots">${'🤖'.repeat(Math.min(a, 6)) || '🤖'}</span><span>サブエージェント 稼働<b>${a}</b></span><span>今日<b>${s.subagents.today}</b></span><span>累計<b>${s.subagents.total}</b></span>`;
    if (sub.innerHTML !== h) sub.innerHTML = h;
  }
  setText($('.sl', el), VIS[vis].label);
  setText($('.title', el), s.title);
  $('.title', el).title = `${s.title}\n${s.cwd}`;
  const tags = [s.isExec && '自動実行', s.forkOf && 'フォーク', s.source && !/claude-desktop|Codex Desktop/.test(s.source) && s.source].filter(Boolean);
  const tagHtml = tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');
  if ($('.tags', el).innerHTML !== tagHtml) $('.tags', el).innerHTML = tagHtml;
  const meta = [s.project && `📁 ${s.project}`, s.branch && s.branch !== 'HEAD' && `⎇ ${s.branch}`, s.model && `🧠 ${shortModel(s.model)}`].filter(Boolean);
  const metaHtml = meta.map(m => `<span>${esc(m)}</span>`).join('');
  if ($('.meta', el).innerHTML !== metaHtml) $('.meta', el).innerHTML = metaHtml;
  const det = $('.detail', el);
  const detail = vis === 'yourturn' ? `✅ 完了 — ${s.lastPrompt ? '「' + s.lastPrompt.slice(0, 50) + '」への返事をどうぞ' : '返事をどうぞ'}`
    : vis === 'standby' ? `💤 ${ago(s.lastActivity)}から待機` : (s.detail || VIS[vis].label);
  if (det.textContent !== detail) { det.textContent = detail; det.classList.remove('typing'); void det.offsetWidth; det.classList.add('typing'); }
  const b = $('.bubble', el);
  b.hidden = !s.lastText || vis === 'standby';
  const bh = `<span class="who">${AGENT_NAME[s.agent]}</span>${esc(s.lastText)}`;
  if (s.lastText && b.innerHTML !== bh) b.innerHTML = bh;
  const ctx = s.tokens.context || 0, pct = Math.min(1, ctx / contextLimit(s));
  const bar = $('.ctxbar i', el);
  bar.style.width = `${Math.round(pct * 100)}%`;
  bar.className = pct > .85 ? 'full' : pct > .6 ? 'warn' : '';
  setText($('.ctxn', el), ctx ? `${Math.round(pct * 100)}%` : '—');
  setText($('.tok', el), s.agent === 'claude' ? (s.costUSD != null ? `$${s.costUSD.toFixed(2)}` : '') : (s.tokens.total ? `${fmtTok(s.tokens.total)} tok` : ''));
  updateTimers(el);
}

function updateTimers(el) {
  const s = el._s, vis = el._vis;
  if (!s || el._kind !== 'full') return;
  setText($('.when', el), ago(s.lastActivity));
  const t = $('.stage-timer', el);
  let txt = '';
  if (vis === 'working') txt = `⏱ ${dur(Date.now() - (s.turnStartedAt || s.stateSince || s.lastActivity))}`;
  else if (vis === 'waiting') txt = `⌛ 待ち ${dur(Date.now() - (s.stateSince || s.lastActivity))}`;
  else if (vis === 'yourturn') txt = `✅ ${ago(s.lastActivity)}`;
  t.hidden = !txt;
  setText(t, txt);
  t.classList.toggle('urgent', vis === 'waiting' && Date.now() - (s.stateSince || s.lastActivity) > 3 * 60e3);
  setText($('.compact-act', el), [$('.act-chip', el).textContent, txt].filter(Boolean).join('  '));
}

let noFlip = false;
// レーンをまたぐ移動も含めて FLIP でなめらかに動かす
function placeAll(groups) {
  const first = new Map();
  for (const el of cards.values()) if (el.isConnected) first.set(el, el.getBoundingClientRect());
  for (const [container, list] of groups) {
    list.forEach((s, i) => {
      const el = cards.get(s.id);
      if (container.children[i] !== el) container.insertBefore(el, container.children[i] || null);
    });
  }
  if (reduceMotion || noFlip) return;
  for (const [el, a] of first) {
    if (!el.isConnected) continue;
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) + Math.abs(dy) < 1) continue;
    const far = Math.abs(dx) > 60;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: far ? 1100 : 600, easing: far ? 'cubic-bezier(.45, 0, .3, 1)' : 'cubic-bezier(.2, 1.2, .4, 1)' });
    if (far) { el.classList.add('walking'); clearTimeout(el._walkT); el._walkT = setTimeout(() => el.classList.remove('walking'), 1100); }
  }
}

function matches(s) {
  if (filter !== 'all' && s.agent !== filter) return false;
  if (!showExec && s.isExec) return false;
  if (search) {
    const q = search.toLowerCase();
    if (![s.title, s.project, s.cwd, s.branch, s.model].some(v => (v || '').toLowerCase().includes(q))) return false;
  }
  return true;
}

function render() {
  const visible = sessions.filter(matches);
  const lanes = { reply: [], progress: [], standby: [], ended: [] };
  for (const s of visible) { s._vis = visOf(s); lanes[laneOf(s._vis)].push(s); }
  const byOrder = (a, b) => VIS[a._vis].order - VIS[b._vis].order || b.lastActivity - a.lastActivity;
  lanes.reply.sort((a, b) => VIS[a._vis].order - VIS[b._vis].order || (a.stateSince || 0) - (b.stateSince || 0));
  lanes.progress.sort((a, b) => (a.turnStartedAt || a.stateSince || 0) - (b.turnStartedAt || b.stateSince || 0));
  lanes.standby.sort(byOrder);
  lanes.ended.sort((a, b) => b.lastActivity - a.lastActivity);
  const shown = [...lanes.reply, ...lanes.progress, ...lanes.standby, ...(showEnded ? lanes.ended : [])];
  const keep = new Set(shown.map(s => s.id));
  for (const [id, el] of cards) if (!keep.has(id)) { el.remove(); cards.delete(id); }
  for (const s of shown) {
    const kind = s._vis === 'ended' ? 'compact' : 'full';
    let el = cards.get(s.id);
    if (el && el._kind !== kind) { el.remove(); el = null; }
    if (!el) { el = kind === 'full' ? makeCard(s) : makeCompact(s); cards.set(s.id, el); }
    updateCard(el, s, s._vis);
  }
  placeAll([[$('#lane-reply'), lanes.reply], [$('#lane-progress'), lanes.progress], [$('#lane-standby'), lanes.standby], [$('#lane-ended'), showEnded ? lanes.ended : []]]);
  emptyMsg($('#lane-reply'), lanes.reply.length, '🎉', 'あなたを待っているエージェントはいません');
  emptyMsg($('#lane-progress'), lanes.progress.length, '🌌', 'いま動いているエージェントはいません');
  emptyMsg($('#lane-standby'), lanes.standby.length, '🛏️', '待機中のセッションはありません');
  setText($('#endedBtn'), showEnded ? `終了済みを隠す (${lanes.ended.length})` : `終了済みを表示 (${lanes.ended.length})`);
  bumpNum($('#nReply'), lanes.reply.length);
  bumpNum($('#nProgress'), lanes.progress.length);
  bumpNum($('#nStandby'), lanes.standby.length);
  const waitingN = lanes.reply.filter(s => s._vis === 'waiting').length;
  $('.lane[data-lane="reply"]').classList.toggle('hot', waitingN > 0);
  document.title = waitingN ? `(${waitingN}) あなた待ち · Agent Deck` : lanes.reply.length ? `(${lanes.reply.length}) 返信待ち · Agent Deck` : 'Agent Deck';
  setFavicon(waitingN, lanes.reply.length, lanes.progress.length);
  renderUsage();
  renderWeather();
  if (detailId) renderDetailMeta();
}

function emptyMsg(container, n, icon, text) {
  const e = container.querySelector('.lane-empty');
  if (!n && !e) container.insertAdjacentHTML('beforeend', `<div class="lane-empty"><span class="e-ic">${icon}</span>${text}</div>`);
  if (n && e) e.remove();
}

function bumpNum(el, v) {
  const s = String(v);
  if (el.textContent === s) return;
  el.textContent = s;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ---------- 使用枠 ----------
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];
function fmtReset(t) {
  const d = new Date(t), now = Date.now();
  const hm = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
  const left = t - now;
  const rel = left < 3600e3 ? `あと${Math.max(1, Math.round(left / 60e3))}分` : left < 86400e3 ? `あと${Math.round(left / 3600e3)}時間` : `あと${Math.round(left / 86400e3)}日`;
  const day = left < 86400e3 && d.getDate() === new Date().getDate() ? '' : `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]}) `;
  return `${day}${hm} (${rel})`;
}
function renderUsage() {
  const blocks = ['claude', 'codex'].filter(a => usage[a] && (filter === 'all' || filter === a)).map(a => {
    const u = usage[a];
    const src = u.at ? `${u.source || ''} · ${ago(u.at)}時点` : (u.source || '');
    const reached = u.reached && (!u.reached.resetsAt || u.reached.resetsAt > Date.now())
      ? `<div class="ureached">⛔ ${esc(u.reached.label)}枠の上限に到達${u.reached.resetsAt ? ` · ${fmtReset(u.reached.resetsAt)} に解除` : ''}</div>` : '';
    const rows = (u.windows || []).map(w => {
      if (w.used == null) return `<div class="uwin"><span class="ul">${esc(w.label)}</span><span class="uv unknown" title="記録が古く、枠がすでに切り替わっている可能性があります">不明 (記録が古い)</span></div>`;
      const used = Math.max(0, Math.min(100, w.used));
      // 3時間以上前の値は今と違う可能性が高いので目印を付ける
      const old = w.at && Date.now() - w.at > 3 * 3600e3;
      const col = used >= 90 ? 'var(--error)' : used >= 70 ? 'var(--reply)' : `var(--${a})`;
      return `<div class="uwin" title="${esc(w.label)}枠: ${Math.round(used)}% 使用 / 残り ${Math.round(100 - used)}%">
        <span class="ul">${esc(w.label)}</span><span class="mbar"><i style="width:${used}%;background:${col}"></i></span>
        <span class="uv${old ? ' old' : ''}">使用 <b>${Math.round(used)}%</b> · 残り ${Math.round(100 - used)}%${old ? `<span class="oldtag">⏳ ${ago(w.at)}の値</span>` : ''}</span>
        ${w.resetsAt ? `<span class="ureset">↻ ${fmtReset(w.resetsAt)}</span>` : ''}</div>`;
    }).join('');
    return `<div class="ublock"><div class="uhead"><b style="color:var(--${a})">${AGENT_NAME[a]}</b>${u.plan ? `<span class="tag">${esc(u.plan)}</span>` : ''}<span class="usrc">${esc(src)}</span></div>${reached}${rows}</div>`;
  });
  const html = blocks.length ? blocks.join('') : '<small>使用枠のデータはまだありません</small>';
  if ($('#usageBox').innerHTML !== html) $('#usageBox').innerHTML = html;
}

// ---------- ゲーム HUD ----------
let lastPilotLevel = null;
function renderGame() {
  if (!game) return;
  setText($('#pilotLv'), String(game.level));
  $('#xpFill').style.width = `${Math.round(game.progress * 100)}%`;
  setText($('#xpText'), `${game.xp.toLocaleString()} XP · 次のレベルまで ${Math.max(0, Math.round(game.next)).toLocaleString()}`);
  bumpNum($('#stTurns'), game.today.turns);
  bumpNum($('#stTools'), game.today.tools);
  bumpNum($('#stSubs'), game.today.subagents);
  bumpNum($('#stCombo'), game.combo);
  $('#comboStat').classList.toggle('hot', game.combo >= 2);
  const got = game.achievements.filter(a => a.at).length;
  setText($('#achCount'), `${got}/${game.achievements.length}`);
  renderChart(game.history);
  if (!$('#achModal').hidden) renderAchievements();
  lastPilotLevel = game.level;
}

function renderChart(hist) {
  const svg = $('#chart');
  if (!hist || hist.length < 2) { svg.innerHTML = '<text x="150" y="34" text-anchor="middle" fill="#8d93b8" font-size="11">データを集めています…</text>'; return; }
  const W = 300, H = 60, t0 = Date.now() - 3 * 3600e3, t1 = Date.now();
  const max = Math.max(3, ...hist.map(h => Math.max(h.c + h.x, h.q || 0)));
  const X = t => ((t - t0) / (t1 - t0)) * W, Y = v => H - 2 - (v / max) * (H - 8);
  const line = key => hist.map((h, i) => `${i ? 'L' : 'M'}${X(h.t).toFixed(1)} ${Y(key(h)).toFixed(1)}`).join(' ');
  const area = key => `${line(key)} L${X(hist[hist.length - 1].t).toFixed(1)} ${H} L${X(hist[0].t).toFixed(1)} ${H} Z`;
  const waits = hist.some(h => h.q) ? `<path d="${line(h => h.q || 0)}" fill="none" stroke="#ffc531" stroke-width="1.4" stroke-dasharray="4 3"/>` : '';
  svg.innerHTML = `<path d="${area(h => h.c + h.x)}" fill="#33e1c9" opacity=".35"/><path d="${area(h => h.c)}" fill="#ff8a4c" opacity=".55"/>
    <path d="${line(h => h.c + h.x)}" fill="none" stroke="#33e1c9" stroke-width="1.5"/><path d="${line(h => h.c)}" fill="none" stroke="#ff8a4c" stroke-width="1.5"/>${waits}`;
}

function renderAchievements() {
  const got = game.achievements.filter(a => a.at).length;
  $('#achSummary').innerHTML = `解除 <b>${got}</b> / ${game.achievements.length} · 累計 ターン <b>${game.totals.turns}</b> · ツール <b>${game.totals.tools}</b> · サブエージェント <b>${game.totals.subagents}</b>`;
  $('#achGrid').innerHTML = game.achievements.map(a => `<div class="ach ${a.at ? 'got' : 'locked'}"><span class="ai">${a.icon}</span><b>${esc(a.title)}</b><small>${esc(a.desc)}</small>${a.at ? `<small style="display:block;color:#ffd166">${new Date(a.at).toLocaleDateString('ja-JP')}</small>` : ''}</div>`).join('');
}

// ---------- 状態遷移の演出 ----------
function onTransitions(list) {
  for (const s of list) {
    const prev = prevState.get(s.id);
    prevState.set(s.id, s.state);
    if (firstSnapshot || prev === s.state || prev === undefined) continue;
    const el = cards.get(s.id);
    if (s.state === 'waiting') {
      toast('🙋', `<b>${esc(s.title)}</b> が${isPermission(s) ? '許可' : '返事'}を待っています`, 'var(--reply)');
      if (el) shockwave(el, '#ffc531');
      sfx.alert();
      desktopNotify(`🙋 ${s.title}`, `${AGENT_NAME[s.agent]} が${isPermission(s) ? '許可' : '返事'}を待っています`);
    } else if (prev === 'working' && s.state === 'idle') {
      toast('🎉', `<b>${esc(s.title)}</b> のターンが完了！`, `var(--${s.agent})`);
      if (TOD[currentTod()].night) shootingStar();
      if (el) { el.classList.add('cheer'); setTimeout(() => el.classList.remove('cheer'), 2400); setTimeout(() => confetti(el, s.agent), 400); }
      sfx.done();
      desktopNotify(`🎉 ${s.title}`, `${AGENT_NAME[s.agent]} のターンが完了しました`);
    } else if (s.state === 'working') {
      if (el) setTimeout(() => shockwave(el, '#4ade80'), 600);
    } else if (s.state === 'error' || s.state === 'stale') {
      toast('💥', `<b>${esc(s.title)}</b> で問題が発生`, 'var(--error)');
      sfx.error();
    }
  }
  firstSnapshot = false;
}

function onXp(d) {
  const el = cards.get(d.id);
  if (!el || el._kind !== 'full' || reduceMotion) return;
  const stage = $('.stage', el);
  const pop = document.createElement('div');
  pop.className = 'xp-pop';
  pop.textContent = `+${d.amount} XP`;
  pop.style.left = `${18 + Math.random() * 14}%`;
  pop.style.top = `${22 + Math.random() * 14}%`;
  stage.appendChild(pop);
  setTimeout(() => pop.remove(), 1500);
  if (d.kinds && d.kinds.spawn) coinBurst(el, 6);
  sfx.coin();
  if (d.botLevelUp) {
    const lv = document.createElement('div');
    lv.className = 'lvup-pop';
    lv.textContent = `LEVEL UP! Lv.${d.botLevel}`;
    stage.appendChild(lv);
    setTimeout(() => lv.remove(), 2300);
    confetti(el, el.dataset.agent);
    sfx.levelup();
  }
}

function showBanner(big, sub, cls = '') {
  const b = $('#banner');
  b.className = `banner ${cls}`;
  b.innerHTML = `<div class="big">${esc(big)}</div><div class="sub">${esc(sub)}</div>`;
  b.hidden = false;
  void b.offsetWidth;
  b.classList.add('show');
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.hidden = true; }, 2900);
}

function onLevelUp(d) {
  showRainbow();
  showBanner('LEVEL UP!', `パイロットレベル ${d.level} になりました`);
  $('#pilot').classList.remove('levelup'); void $('#pilot').offsetWidth; $('#pilot').classList.add('levelup');
  fireworks(5);
  sfx.fanfare();
}
function onCombo(d) {
  showRainbow();
  showBanner(`COMBO ×${d.count}`, '連続でターン完了！', 'combo');
  fireworks(Math.min(d.count, 6));
  sfx.combo(d.count);
}
function onAchievement(a) {
  showRainbow(12000);
  const t = toast(a.icon, `<div><b>実績解除！ ${esc(a.title)}</b><br><small>${esc(a.desc)}</small></div>`, 'var(--gold)');
  t.classList.add('ach');
  rain(['#ffd166', '#fff3c4', '#ff8a4c', '#33e1c9']);
  sfx.fanfare();
}

function toast(icon, html, color) {
  const t = document.createElement('div');
  t.className = 'toast'; t.style.setProperty('--c', color);
  t.innerHTML = `<span class="t-ic">${icon}</span><div>${html}</div>`;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 5200);
  while ($('#toasts').children.length > 5) $('#toasts').firstChild.remove();
  return t;
}

function desktopNotify(title, body) {
  if (!notify || DEMO || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try { const n = new Notification(title, { body, icon: 'icon.svg', tag: title }); n.onclick = () => { window.focus(); n.close(); }; } catch { }
}

// ---------- 効果音 ----------
let audioCtx = null;
let lastCoin = 0;
function tone(freq, start, len, type = 'sine', vol = .1) {
  audioCtx = audioCtx || new AudioContext();
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  const t = audioCtx.currentTime + start;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + len);
  o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + len + .05);
}
const sfx = {
  play(notes, type, vol, step = .11, len = .3) { if (!sound) return; notes.forEach((f, i) => tone(f, i * step, len, type, vol)); },
  coin() { if (!sound || Date.now() - lastCoin < 350) return; lastCoin = Date.now(); tone(988, 0, .08, 'square', .04); tone(1319, .07, .2, 'square', .04); },
  done() { this.play([659, 784, 1047], 'triangle', .12); },
  alert() { this.play([880, 1175, 880, 1175], 'sine', .1, .13); },
  error() { this.play([330, 220], 'sawtooth', .06, .16); },
  levelup() { this.play([523, 659, 784, 1047, 1319], 'square', .05, .08, .25); },
  fanfare() { this.play([523, 523, 523, 698, 880, 784, 1047], 'triangle', .1, .12, .35); },
  combo(n) { this.play([440, 554, 659, 880, 1109].slice(0, Math.min(5, n + 1)), 'square', .05, .07, .2); },
};

// ---------- パーティクル (紙吹雪・花火・衝撃波) ----------
const fx = $('#fx'), fctx = fx.getContext('2d');
let parts = [], rings = [];
const FX_DPR = () => Math.min(devicePixelRatio, 1.25);
function sizeCanvas(c) { c.width = innerWidth * FX_DPR(); c.height = innerHeight * FX_DPR(); c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px'; }
let fxRunning = false;
function startFx() { if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxLoop); } }
function botCenter(el) { const r = ($('.stage', el) || el).getBoundingClientRect(); return { x: r.left + r.width * .22, y: r.top + r.height * .55 }; }
function burst(x, y, cols, n, power = 12, shape = 'rect') {
  if (reduceMotion) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = Math.random() * power;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * .4, g: .3, life: 70 + Math.random() * 50, rot: Math.random() * 6, vr: (Math.random() - .5) * .4,
      w: 4 + Math.random() * 5, h: 3 + Math.random() * 4, c: cols[i % cols.length], shape });
  }
  startFx();
}
function confetti(el, agent) {
  const c = botCenter(el);
  burst(c.x, c.y - 20, agent === 'claude' ? ['#ff8a4c', '#ffb26b', '#fff2e8', '#ffd166'] : ['#33e1c9', '#6aa8ff', '#eafffb', '#b388ff'], 90, 13);
}
function coinBurst(el, n) { const c = botCenter(el); burst(c.x, c.y - 30, ['#ffd166', '#ffe9a8'], n, 7, 'coin'); }
function shockwave(el, color) { if (reduceMotion) return; const c = botCenter(el); rings.push({ x: c.x, y: c.y, r: 10, a: 1, c: color }); startFx(); }
function fireworks(n) {
  for (let i = 0; i < n; i++) setTimeout(() => {
    const x = innerWidth * (.2 + Math.random() * .6), y = innerHeight * (.15 + Math.random() * .35);
    burst(x, y, [['#ff8a4c', '#ffd166'], ['#33e1c9', '#6aa8ff'], ['#b388ff', '#ff4d6d']][i % 3].concat('#fff'), 70, 9, 'spark');
    rings.push({ x, y, r: 6, a: 1, c: '#ffd166' }); startFx();
  }, i * 260);
}
function rain(cols) {
  if (reduceMotion) return;
  for (let i = 0; i < 120; i++) parts.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * 200, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3, g: .05,
    life: 200, rot: Math.random() * 6, vr: (Math.random() - .5) * .3, w: 6, h: 4, c: cols[i % cols.length], shape: 'rect' });
  startFx();
}
function fxLoop() {
  const dpr = FX_DPR();
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter(p => p.life-- > 0 && p.y < innerHeight + 40);
  for (const p of parts) {
    p.vy += p.g; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot);
    fctx.globalAlpha = Math.min(1, p.life / 30); fctx.fillStyle = p.c;
    if (p.shape === 'coin') { fctx.beginPath(); fctx.ellipse(0, 0, 5 * Math.abs(Math.cos(p.rot * 2)) + 1, 5, 0, 0, Math.PI * 2); fctx.fill(); }
    else if (p.shape === 'spark') { fctx.fillRect(-1, -4, 2, 8); }
    else fctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    fctx.restore();
  }
  rings = rings.filter(r => r.a > .02);
  for (const r of rings) {
    r.r += 4.5; r.a *= .93;
    fctx.globalAlpha = r.a; fctx.strokeStyle = r.c; fctx.lineWidth = 3;
    fctx.beginPath(); fctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); fctx.stroke();
  }
  fctx.globalAlpha = 1;
  if (!parts.length && !rings.length) { fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, fx.width, fx.height); fxRunning = false; return; }
  requestAnimationFrame(fxLoop);
}

// ---------- 背景の空 (時間帯で朝・昼・夕方・夜に変わる / 進行中が多いほど流れが速くなる) ----------
const TOD = {
  morning: { label: '朝', icon: '🌅', sky: ['#2f2d66', '#7d5a8c', '#d99c88'], neb: [[255, 170, 150], [255, 214, 140]], stars: .2, sun: { x: .16, y: .9, r: 60, c: [255, 200, 140] }, clouds: { hi: [255, 232, 236], lo: [176, 120, 156] }, theme: '#2f2d66' },
  day: { label: '昼', icon: '☀️', sky: ['#4ea6ff', '#9fd2ff', '#e8f5ff'], neb: [[255, 255, 255], [180, 230, 255]], stars: 0, sun: { x: .85, y: .12, r: 46, c: [255, 240, 170] }, clouds: { hi: [255, 255, 255], lo: [160, 184, 216] }, theme: '#4ea6ff' },
  evening: { label: '夕方', icon: '🌇', sky: ['#2a1650', '#b8406a', '#ff9450'], neb: [[255, 120, 90], [180, 90, 200]], stars: .35, sun: { x: .8, y: .84, r: 90, c: [255, 150, 70] }, clouds: { hi: [255, 206, 176], lo: [120, 60, 108] }, theme: '#2a1650' },
  night: { label: '夜', icon: '🌙', sky: ['#191237', '#0a0d1d', '#05060d'], neb: [[255, 138, 76], [51, 225, 201]], stars: 1, moon: { x: .86, y: .12, r: 22 }, clouds: { hi: [104, 110, 150], lo: [26, 28, 56] }, night: true, theme: '#070912' },
};
const TOD_ORDER = ['auto', 'morning', 'day', 'evening', 'night'];
let todPref = TOD_ORDER.includes(pref('tod')) ? pref('tod') : 'auto';
function todByClock(d = new Date()) { const h = d.getHours(); return h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 16 ? 'day' : h >= 16 && h < 19 ? 'evening' : 'night'; }
function currentTod() { return todPref === 'auto' ? todByClock() : todPref; }
function applyTod() {
  const t = currentTod();
  if (document.body.dataset.tod !== t) document.body.dataset.tod = t;
  const btn = $('#todBtn');
  btn.textContent = TOD[t].icon;
  btn.classList.toggle('auto', todPref === 'auto');
  btn.title = todPref === 'auto' ? `表示: 自動 (いまは${TOD[t].label}) — クリックで切り替え (T)` : `表示: ${TOD[t].label} (固定) — クリックで切り替え (T)`;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = TOD[t].theme;
}
function cycleTod() {
  todPref = TOD_ORDER[(TOD_ORDER.indexOf(todPref) + 1) % TOD_ORDER.length];
  setPref('tod', todPref); applyTod();
  toast(TOD[currentTod()].icon, todPref === 'auto' ? `表示を自動にしました (いまは${TOD[currentTod()].label})` : `${TOD[todPref].label}の表示に固定しました`, 'var(--codex-2)');
}
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const rgb = (c, a = 1) => `rgba(${c.map(v => Math.round(v)).join(',')},${a})`;
let skyNow = null;
const sky = $('#sky'), sctx = sky.getContext('2d');
let stars = [], clouds = [];
function initStars() {
  stars = Array.from({ length: Math.min(400, Math.round(innerWidth * innerHeight / 5000)) }, () => ({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight, z: Math.random() * .9 + .1, tw: Math.random() * 6.28, hue: Math.random() < .5 }));
  clouds = Array.from({ length: 6 }, (_, i) => newCloud(i, Math.random() * innerWidth));
}
// 雲: 小さな綿を何十個もぼかして重ね、下側に影を付けた画像を作って使い回す
const cloudSprites = new Map();
function seeded(n) { return () => { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; }; }
function cloudSprite(col, i) {
  const key = col.hi.join() + col.lo.join() + i;
  if (cloudSprites.has(key)) return cloudSprites.get(key);
  const w = 380, h = 160, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d'), r = seeded(i * 7919 + 13);
  x.filter = 'blur(4px)';
  for (let k = 0; k < 34; k++) {
    const px = 50 + r() * (w - 100), edge = Math.abs(px - w / 2) / (w / 2);
    const py = 104 - r() * 50 * (1 - edge * .8), rad = 14 + r() * 30 * (1 - edge * .55);
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, rgb(col.hi, .95)); g.addColorStop(.55, rgb(col.hi, .7)); g.addColorStop(1, rgb(col.hi, 0));
    x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
  }
  x.filter = 'none';
  // 底を平らにする
  x.globalCompositeOperation = 'destination-out';
  const cut = x.createLinearGradient(0, 106, 0, 132); cut.addColorStop(0, 'rgba(0,0,0,0)'); cut.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = cut; x.fillRect(0, 100, w, h);
  // 下側に影、上側に光
  x.globalCompositeOperation = 'source-atop';
  const shade = x.createLinearGradient(0, 40, 0, 125); shade.addColorStop(0, rgb(col.lo, 0)); shade.addColorStop(1, rgb(col.lo, .6));
  x.fillStyle = shade; x.fillRect(0, 0, w, h);
  const light = x.createRadialGradient(w * .4, 40, 0, w * .4, 40, w * .45); light.addColorStop(0, 'rgba(255,255,255,.35)'); light.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = light; x.fillRect(0, 0, w, h);
  cloudSprites.set(key, c);
  return c;
}
function newCloud(i, x) {
  const far = i % 2 === 0;
  return { x, far, sprite: i % 4, s: far ? .35 + Math.random() * .25 : .6 + Math.random() * .35,
    y: innerHeight * (far ? .02 + Math.random() * .18 : .06 + Math.random() * .28), v: far ? .06 + Math.random() * .06 : .14 + Math.random() * .12 };
}
// ---------- 天気: エージェントの調子で空模様が変わる ----------
const WEATHER = {
  clear: { icon: '☀️', nightIcon: '✨', label: '快晴', cover: .35, nightCover: 0, dark: 0, rain: 0 },
  cloudy: { icon: '☁️', label: 'くもり', cover: 1, nightCover: .7, dark: .22, rain: 0 },
  rain: { icon: '🌧️', label: '雨', cover: 1, nightCover: 1, dark: .45, rain: .55 },
  storm: { icon: '⛈️', label: '雷雨', cover: 1, nightCover: 1, dark: .62, rain: 1 },
};
let rainbowUntil = 0;
function weatherNow() {
  const now = Date.now();
  const errs = sessions.filter(s => s.state === 'error' || s.state === 'stale');
  const waiting = sessions.filter(s => s.state === 'waiting');
  const longWait = waiting.filter(s => now - (s.stateSince || s.lastActivity) > 3 * 60e3);
  let maxUsed = 0, maxLabel = '', reached = null;
  for (const a of ['claude', 'codex']) {
    const u = usage[a]; if (!u) continue;
    if (u.reached && (!u.reached.resetsAt || u.reached.resetsAt > now)) reached = `${AGENT_NAME[a]}の${u.reached.label}枠が上限`;
    for (const w of u.windows || []) if (w.used != null && !(w.at && now - w.at > 3 * 3600e3) && w.used > maxUsed) { maxUsed = w.used; maxLabel = `${AGENT_NAME[a]} ${w.label}枠 ${Math.round(w.used)}%`; }
  }
  if (reached || errs.length) return { kind: 'storm', why: reached || `エラーのセッションが ${errs.length} 件` };
  if (maxUsed >= 80 || longWait.length >= 2) return { kind: 'rain', why: maxUsed >= 80 ? `使用量が多め (${maxLabel})` : `3分以上待たせているセッションが ${longWait.length} 件` };
  if (waiting.length || maxUsed >= 60) return { kind: 'cloudy', why: waiting.length ? `返事を待っているセッションが ${waiting.length} 件` : `使用量がやや多め (${maxLabel})` };
  return { kind: 'clear', why: sessions.some(s => s.state === 'working') ? 'みんな順調に作業中' : '穏やかな空' };
}
let lastWeather = '';
function renderWeather() {
  const w = weatherNow(), def = WEATHER[w.kind], night = TOD[currentTod()].night;
  const rainbow = Date.now() < rainbowUntil;
  const btn = $('#weatherBtn');
  const label = `${w.kind === 'clear' && night ? def.nightIcon : def.icon} ${def.label}${rainbow ? ' 🌈' : ''}`;
  setText(btn, label);
  btn.title = `天気: ${def.label} — ${w.why}\nクリックで天気のルールを表示`;
  btn.dataset.kind = w.kind;
  // 快晴とくもりは頻繁に入れ替わるので、崩れたときだけ知らせる
  if (lastWeather && lastWeather !== w.kind && (w.kind === 'rain' || w.kind === 'storm')) toast(def.icon, `天気が「${def.label}」に変わりました — ${esc(w.why)}`, w.kind === 'storm' ? 'var(--error)' : w.kind === 'rain' ? 'var(--codex-2)' : 'var(--gold)');
  lastWeather = w.kind;
  return w;
}
function showRainbow(ms = 20000) { rainbowUntil = Math.max(rainbowUntil, Date.now() + ms); }
let meteors = [], drops = [], flash = 0, bolt = null, nextBolt = 0;
function shootingStar() { if (reduceMotion) return; meteors.push({ x: innerWidth * (.4 + Math.random() * .6), y: innerHeight * Math.random() * .3, life: 1 }); }

let warp = 0.2, pulse = 0;
// 背景は「ほぼ動かない層 (空の色・太陽/月・暗さ・虹)」を別キャンバスに 0.5秒ごとに描いて使い回し、
// 毎フレームは星・雲・雨などの動く物だけを描く。解像度も控えめにして GPU の負担を減らす。
const SKY_SCALE = () => Math.min(devicePixelRatio, 1) * (lite ? .5 : .75);
const skyBase = document.createElement('canvas'), bctx = skyBase.getContext('2d');
let baseAt = 0, liteFrame = 0;
function drawBase(t, P, W, H) {
  const sc = SKY_SCALE() * .5;
  if (skyBase.width !== Math.round(W * sc) || skyBase.height !== Math.round(H * sc)) { skyBase.width = Math.round(W * sc); skyBase.height = Math.round(H * sc); }
  bctx.setTransform(sc, 0, 0, sc, 0, 0);
  const g = bctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(skyNow.sky[0])); g.addColorStop(.55, rgb(skyNow.sky[1])); g.addColorStop(1, rgb(skyNow.sky[2]));
  bctx.fillStyle = g; bctx.fillRect(0, 0, W, H);
  const blob = (x, y, r, c, a) => { const rg = bctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, rgb(c, a)); rg.addColorStop(1, rgb(c, 0)); bctx.fillStyle = rg; bctx.fillRect(x - r, y - r, r * 2, r * 2); };
  blob(W * (.15 + Math.sin(t / 9000) * .05), H * .25, W * .4, skyNow.neb[0], .10);
  blob(W * (.85 + Math.cos(t / 11000) * .05), H * .7, W * .45, skyNow.neb[1], .09);
  if (P.sun) {
    const sx = W * P.sun.x, sy = H * P.sun.y + Math.sin(t / 5000) * 4;
    blob(sx, sy, P.sun.r * 4, P.sun.c, .35);
    bctx.fillStyle = rgb(P.sun.c, .95); bctx.beginPath(); bctx.arc(sx, sy, P.sun.r, 0, Math.PI * 2); bctx.fill();
  } else if (P.moon) {
    const mx = W * P.moon.x, my = H * P.moon.y;
    blob(mx, my, P.moon.r * 5, [255, 233, 168], .12);
    bctx.fillStyle = 'rgba(255,233,168,.9)'; bctx.beginPath(); bctx.arc(mx, my, P.moon.r, 0, Math.PI * 2); bctx.fill();
    bctx.fillStyle = rgb(skyNow.sky[0]); bctx.beginPath(); bctx.arc(mx + P.moon.r * .45, my - P.moon.r * .25, P.moon.r * .85, 0, Math.PI * 2); bctx.fill();
  }
  if (skyNow.dark > .01) { bctx.fillStyle = `rgba(20,26,44,${skyNow.dark * .55})`; bctx.fillRect(0, 0, W, H); }
  if (skyNow.bow > .01) {
    const cx = W * .3, cy = H * 1.05, R = Math.max(W, H) * .62;
    ['#ff4d4d', '#ff9f43', '#ffe14d', '#4ade80', '#4dabff', '#6a5cff', '#b06aff'].forEach((c, i) => {
      bctx.strokeStyle = c; bctx.globalAlpha = .28 * skyNow.bow; bctx.lineWidth = 14;
      bctx.beginPath(); bctx.arc(cx, cy, R - i * 13, Math.PI * 1.08, Math.PI * 1.92); bctx.stroke();
    });
    bctx.globalAlpha = 1;
  }
}

function skyLoop(t) {
  requestAnimationFrame(skyLoop);
  // 軽量モードは 15fps 程度に間引く
  if (lite && (++liteFrame % 4)) return;
  const W = innerWidth, H = innerHeight, sc = SKY_SCALE();
  if (sky.width !== Math.round(W * sc) || sky.height !== Math.round(H * sc)) { sky.width = Math.round(W * sc); sky.height = Math.round(H * sc); sky.style.width = W + 'px'; sky.style.height = H + 'px'; }
  const P = TOD[currentTod()];
  // 時間帯・天気が切り替わったら色をゆっくり近づける
  const W8 = WEATHER[lastWeather || 'clear'];
  const target = { sky: P.sky.map(hex), neb: P.neb, stars: P.stars, cloud: P.clouds ? (P.night ? W8.nightCover : W8.cover) : 0, dark: W8.dark, rain: W8.rain, bow: Date.now() < rainbowUntil ? 1 : 0 };
  if (!skyNow) { skyNow = JSON.parse(JSON.stringify(target)); baseAt = 0; }
  const k = reduceMotion ? 1 : lite ? .12 : .03;
  skyNow.sky = skyNow.sky.map((c, i) => mix(c, target.sky[i], k));
  skyNow.neb = skyNow.neb.map((c, i) => mix(c, target.neb[i], k));
  skyNow.stars += (target.stars - skyNow.stars) * k;
  skyNow.cloud += (target.cloud - skyNow.cloud) * k;
  for (const key of ['dark', 'rain', 'bow']) skyNow[key] = (skyNow[key] || 0) + (target[key] - (skyNow[key] || 0)) * k;
  const working = sessions.filter(s => s.state === 'working').length;
  const waiting = sessions.some(s => s.state === 'waiting');
  warp += ((reduceMotion || lite ? 0 : 0.25 + Math.min(working, 6) * 0.9) - warp) * 0.02;
  pulse = waiting ? (Math.sin(t / 400) + 1) / 2 : pulse * .95;
  if (t - baseAt > 500) { drawBase(t, P, W, H); baseAt = t; }
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.drawImage(skyBase, 0, 0, sky.width, sky.height);
  sctx.setTransform(sc, 0, 0, sc, 0, 0);
  if (pulse > .01) { const rg = sctx.createRadialGradient(W * .17, H * .35, 0, W * .17, H * .35, W * .4); rg.addColorStop(0, `rgba(255,197,49,${.14 * pulse})`); rg.addColorStop(1, 'rgba(255,197,49,0)'); sctx.fillStyle = rg; sctx.fillRect(0, 0, W, H); }
  if (skyNow.stars > .02) {
    // 星は明るさを4段階にまとめて、色ごとに1回で描く
    const fade = skyNow.stars * (1 - skyNow.dark);
    for (const hue of [true, false]) for (let b = 0; b < 4; b++) {
      sctx.strokeStyle = hue ? `rgba(255,190,150,${(.3 + b * .2) * fade})` : `rgba(160,240,255,${(.3 + b * .2) * fade})`;
      sctx.lineWidth = 1 + b * .3;
      sctx.beginPath();
      for (const s of stars) {
        if (s.hue !== hue) continue;
        const tw = .5 + Math.sin(t / 700 + s.tw) * .5;
        if (Math.min(3, Math.floor(tw * s.z * 4)) !== b) continue;
        sctx.moveTo(s.x, s.y); sctx.lineTo(s.x + warp * s.z * 6 + .5, s.y);
      }
      sctx.stroke();
    }
    for (const s of stars) { s.x -= warp * s.z * 1.6; if (s.x < -10) { s.x = W + 10; s.y = Math.random() * H; } }
  }
  // 雲 (遠くの雲ほど小さく薄く遅い)。作業中が多いと速く流れる
  if (skyNow.cloud > .02 && P.clouds) {
    const d = Math.round(skyNow.dark * 10) / 10;
    const col = { hi: mix(P.clouds.hi, [120, 126, 146], d).map(Math.round), lo: mix(P.clouds.lo, [44, 48, 64], d).map(Math.round) };
    const n = skyNow.cloud * clouds.length;
    clouds.forEach((c, i) => {
      c.x -= c.v * (.5 + warp * .35 + skyNow.rain * .8) * (lite ? 4 : 1);
      const img = cloudSprite(col, c.sprite);
      if (c.x < -img.width * c.s) Object.assign(c, newCloud(i, W + Math.random() * 120));
      const vis = Math.max(0, Math.min(1, n - i));
      if (!vis) return;
      sctx.globalAlpha = (c.far ? .5 : .85) * vis;
      sctx.drawImage(img, c.x, c.y, img.width * c.s, img.height * c.s);
    });
    sctx.globalAlpha = 1;
  }
  if (skyNow.rain > .02 && !reduceMotion) {
    const want = Math.round((lite ? 90 : 220) * skyNow.rain);
    while (drops.length < want) drops.push({ x: Math.random() * W * 1.2, y: Math.random() * -H, v: 9 + Math.random() * 7, l: 10 + Math.random() * 14 });
    if (drops.length > want) drops.length = want;
    sctx.strokeStyle = P.night ? 'rgba(170,190,255,.35)' : 'rgba(225,235,255,.55)'; sctx.lineWidth = 1.1;
    sctx.beginPath();
    for (const p of drops) {
      p.y += p.v * (lite ? 4 : 1); p.x -= p.v * .25 * (lite ? 4 : 1);
      if (p.y > H) { p.y = -20; p.x = Math.random() * W * 1.2; }
      sctx.moveTo(p.x, p.y); sctx.lineTo(p.x + p.l * .25, p.y - p.l);
    }
    sctx.stroke();
  } else drops.length = 0;
  if (lastWeather === 'storm' && !reduceMotion && !lite && t > nextBolt) {
    nextBolt = t + 4000 + Math.random() * 6000; flash = 1;
    let x = W * (.2 + Math.random() * .6), y = 0; bolt = [[x, y]];
    while (y < H * .55) { y += 20 + Math.random() * 30; x += (Math.random() - .5) * 50; bolt.push([x, y]); }
  }
  if (flash > .01) {
    sctx.fillStyle = `rgba(235,240,255,${flash * .35})`; sctx.fillRect(0, 0, W, H);
    if (bolt && flash > .5) { sctx.strokeStyle = `rgba(255,255,255,${flash})`; sctx.lineWidth = 2.5; sctx.beginPath(); bolt.forEach(([x, y], i) => i ? sctx.lineTo(x, y) : sctx.moveTo(x, y)); sctx.stroke(); }
    flash *= .88;
  }
  meteors = meteors.filter(m => (m.life -= .015) > 0);
  for (const m of meteors) {
    m.x -= 9; m.y += 4;
    const g2 = sctx.createLinearGradient(m.x, m.y, m.x + 90, m.y - 40);
    g2.addColorStop(0, `rgba(255,255,255,${m.life})`); g2.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.strokeStyle = g2; sctx.lineWidth = 2; sctx.beginPath(); sctx.moveTo(m.x, m.y); sctx.lineTo(m.x + 90, m.y - 40); sctx.stroke();
  }
}

// ---------- ファビコン (返信待ちの数をバッジで表示) ----------
let lastFav = '';
function setFavicon(waiting, reply, working) {
  const key = `${waiting}|${reply}|${working > 0}`;
  if (key === lastFav) return;
  lastFav = key;
  const n = waiting || reply;
  const badge = n ? `<circle cx="48" cy="16" r="15" fill="${waiting ? '#ff4d6d' : '#ffc531'}" stroke="#070912" stroke-width="3"/><text x="48" y="22" text-anchor="middle" font-family="Arial" font-weight="900" font-size="18" fill="${waiting ? '#fff' : '#2a1c00'}">${n > 9 ? '9+' : n}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a4c"/><stop offset="1" stop-color="#33e1c9"/></linearGradient></defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="#0d1122"/><line x1="32" y1="8" x2="32" y2="15" stroke="#ffd166" stroke-width="3"/><circle cx="32" cy="7" r="4" fill="${working ? '#4ade80' : '#ffd166'}"/>
    <rect x="9" y="15" width="46" height="38" rx="15" fill="url(#g)"/><rect x="15" y="22" width="34" height="22" rx="10" fill="#1b1530"/>
    <ellipse cx="25" cy="33" rx="4" ry="5" fill="#fff"/><ellipse cx="39" cy="33" rx="4" ry="5" fill="#fff"/>${badge}</svg>`;
  $('#favicon').href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// ---------- フィード ----------
const feedEl = $('#feed');
let unread = 0;
function eventText(ev) {
  const s = sessions.find(x => x.sessionId === ev.sessionId);
  return ev.kind === 'hook' && s ? `${s.title} · ${ev.text}` : ev.text;
}
function addFeed(ev, live = true) {
  const color = ev.kind === 'state' ? (STATE_COLOR[ev.to] || 'var(--standby)') : ev.kind === 'achievement' || ev.kind === 'levelup' ? 'var(--gold)' : `var(--${ev.agent})`;
  const li = document.createElement('li');
  li.style.setProperty('--c', color);
  if (!live) li.style.animation = 'none';
  li.innerHTML = `<span class="dot"></span><div><div class="t">${esc(eventText(ev))}</div><div class="m">${ev.sessionId ? AGENT_NAME[ev.agent] + ' · ' : ''}<span data-at="${ev.at}">${ago(ev.at)}</span></div></div>`;
  feedEl.prepend(li);
  while (feedEl.children.length > 120) feedEl.lastChild.remove();
  if (live) {
    const tk = $('#tk');
    tk.textContent = `${ev.agent === 'codex' ? '🟢' : '🟠'} ${eventText(ev)}`;
    tk.style.animation = 'none'; void tk.offsetWidth; tk.style.animation = '';
    if (!$('#drawer').classList.contains('open')) { unread++; $('#feedBadge').hidden = false; $('#feedBadge').textContent = unread > 99 ? '99+' : unread; }
  }
}

// ---------- パネル ----------
function openPanel(id, open = true) {
  const el = $('#' + id);
  if (el.classList.contains('modal')) el.hidden = !open;
  else el.classList.toggle('open', open);
  if (id === 'drawer' && open) { unread = 0; $('#feedBadge').hidden = true; }
  if (id === 'detail' && !open) { detailId = null; clearInterval(detailTimer); }
  if (id === 'achModal' && open && game) renderAchievements();
}
function closeAll() { ['drawer', 'detail', 'achModal', 'helpModal'].forEach(id => openPanel(id, false)); }

let detailId = null, detailTimer = null;
function openDetail(id) {
  detailId = id;
  $('#dTimeline').innerHTML = '';
  $('#dStage').innerHTML = '';
  $('#dStage')._key = '';
  renderDetailMeta();
  openPanel('detail', true);
  loadTimeline(true);
  clearInterval(detailTimer);
  detailTimer = setInterval(() => loadTimeline(false), 4000);
}

function renderDetailMeta() {
  const s = sessions.find(x => x.id === detailId);
  if (!s) return;
  const vis = visOf(s);
  const scene = sceneOf(s, vis === 'ended' ? 'standby' : vis);
  const minis = scene === 'agent' ? Math.max(1, Math.min(6, (s.subagents && s.subagents.active) || 1)) : 0;
  const key = `${s.agent}|${scene}|${minis}`;
  if ($('#dStage')._key !== key) { $('#dStage').innerHTML = Scenes.buildScene(s.agent, scene, { minis, permission: isPermission(s) }); $('#dStage')._key = key; }
  setText($('#dTitle'), s.title);
  const rows = [
    ['エージェント', `${AGENT_NAME[s.agent]}${s.source ? ` (${s.source})` : ''}`],
    ['状態', `${VIS[vis].label}${s.detail ? ' — ' + s.detail : ''}`],
    ['レベル', `Lv.${s.level || 1} · ${s.xp || 0} XP`],
    ['プロジェクト', s.cwd],
    s.branch && ['ブランチ', s.branch],
    s.model && ['モデル', s.model],
    s.startedAt && ['開始', `${new Date(s.startedAt).toLocaleString('ja-JP')} (${ago(s.startedAt)})`],
    ['最終更新', ago(s.lastActivity)],
    ['コンテキスト', s.tokens.context ? `${fmtTok(s.tokens.context)} / ${fmtTok(contextLimit(s))}` : '—'],
    s.costUSD != null && ['コスト (推定)', `$${s.costUSD.toFixed(2)}`],
    s.tokens.total && ['累計トークン', fmtTok(s.tokens.total)],
    s.subagents && ['サブエージェント', `稼働 ${s.subagents.active} · 今日 ${s.subagents.today} · 累計 ${s.subagents.total}`],
    ['セッションID', s.sessionId],
  ].filter(Boolean);
  const html = `<dl class="d-meta">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  if ($('#dMeta').innerHTML !== html) $('#dMeta').innerHTML = html;
  const act = `<button class="btn small" data-copy="${esc(s.resume)}">📋 再開コマンドをコピー</button><button class="btn small" data-copy="${esc(s.cwd)}">📁 パスをコピー</button>
    ${s.dismissed ? `<button class="btn small" data-undo="${esc(s.id)}">↩ 戻す</button>` : vis !== 'ended' ? `<button class="btn small primary" data-done="${esc(s.id)}">✓ 完了にする</button>` : ''}`;
  if ($('#dActions')._h !== act) { $('#dActions').innerHTML = act; $('#dActions')._h = act; }
}

async function loadTimeline(first) {
  if (!detailId) return;
  const id = detailId;
  let data;
  if (DEMO) data = demo.timeline(id);
  else { try { data = await (await fetch(`/api/timeline?id=${encodeURIComponent(id)}`)).json(); } catch { return; } }
  if (id !== detailId || !data || !data.items) { if (first) $('#dTimeline').innerHTML = '<li>タイムラインを読めませんでした</li>'; return; }
  const ol = $('#dTimeline');
  const atBottom = ol.parentElement.scrollTop + ol.parentElement.clientHeight >= ol.parentElement.scrollHeight - 40;
  const IC = { user: '🙂', assistant: '🤖', turn: '✅', error: '❌' };
  const html = data.items.map(it => {
    const ic = it.kind === 'tool' ? (ACT_ICON[it.act] || '🔧') : IC[it.kind] || '•';
    const text = it.kind === 'turn' ? 'ターン完了' : it.text;
    return `<li class="${it.kind}" data-ic="${ic}"><span class="tm">${it.t ? hhmmss(it.t) : ''}</span><span class="tx">${esc(text)}</span></li>`;
  }).join('') || '<li>まだ記録がありません</li>';
  if (ol._h !== html) { ol.innerHTML = html; ol._h = html; if (first || atBottom) ol.parentElement.scrollTop = ol.parentElement.scrollHeight; }
}

async function dismiss(id, undo = false) {
  const el = cards.get(id);
  if (!undo && el && !reduceMotion) { el.classList.add('goodbye'); sfx.play([784, 659, 523], 'triangle', .08); }
  if (DEMO) { demo.dismiss(id, undo); return; }
  try {
    await fetch('/api/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Deck': '1' }, body: JSON.stringify({ id, undo }) });
  } catch { if (el) el.classList.remove('goodbye'); toast('⚠️', '更新できませんでした', 'var(--error)'); }
}

// ---------- 時計・相対時刻 ----------
let secs = 0;
function tickClock() {
  setText($('#clock'), new Date().toLocaleTimeString('ja-JP', { hour12: false }));
  for (const el of cards.values()) updateTimers(el);
  for (const sp of feedEl.querySelectorAll('[data-at]')) sp.textContent = ago(Number(sp.dataset.at));
  // 返信待ち → 待機 は時間で変わるので定期的に並べ直す
  if (++secs % 10 === 0) render();
}

// ---------- 接続 ----------
function applySnapshot(d) {
  sessions = d.sessions || [];
  usage = d.usage || {};
  game = d.game || game;
  render();
  renderGame();
  onTransitions(sessions);
}

function connect() {
  const es = new EventSource('/events');
  es.onopen = () => { $('#conn').classList.add('on'); setText($('#conn span'), 'LIVE'); };
  es.onerror = () => { $('#conn').classList.remove('on'); setText($('#conn span'), '再接続中…'); };
  es.addEventListener('snapshot', e => applySnapshot(JSON.parse(e.data)));
  es.addEventListener('history', e => { feedEl.innerHTML = ''; for (const ev of JSON.parse(e.data)) addFeed(ev, false); });
  es.addEventListener('event', e => addFeed(JSON.parse(e.data)));
  es.addEventListener('xp', e => onXp(JSON.parse(e.data)));
  es.addEventListener('levelup', e => onLevelUp(JSON.parse(e.data)));
  es.addEventListener('combo', e => onCombo(JSON.parse(e.data)));
  es.addEventListener('achievement', e => onAchievement(JSON.parse(e.data)));
}

// ---------- UI 操作 ----------
function setFilter(f) {
  filter = f; setPref('filter', f);
  $$('[data-filter]').forEach(x => x.classList.toggle('on', x.dataset.filter === f));
  render();
}
function paintToggles() {
  $('#soundBtn').textContent = sound ? '🔊' : '🔇'; $('#soundBtn').classList.toggle('on', sound);
  $('#notifyBtn').textContent = notify ? '🔔' : '🔕'; $('#notifyBtn').classList.toggle('on', notify);
  $('#execBtn').classList.toggle('on', showExec);
  $('#execBtn').title = showExec ? 'codex exec などの自動実行セッションを表示中 (X)' : '自動実行セッションを隠しています (X)';
}
$$('[data-filter]').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.filter)));
$('#endedBtn').onclick = () => { showEnded = !showEnded; setPref('showEnded', showEnded ? '1' : '0'); render(); };
$('#execBtn').onclick = () => { showExec = !showExec; setPref('showExec', showExec ? '1' : '0'); paintToggles(); render(); };
$('#feedBtn').onclick = () => openPanel('drawer', !$('#drawer').classList.contains('open'));
$('#ticker').onclick = () => openPanel('drawer', true);
$('#achBtn').onclick = () => openPanel('achModal', true);
$('#helpBtn').onclick = () => openPanel('helpModal', true);
$('#soundBtn').onclick = () => { sound = !sound; setPref('sound', sound ? '1' : '0'); paintToggles(); if (sound) sfx.done(); };
$('#notifyBtn').onclick = async () => {
  if (!('Notification' in window)) { toast('⚠️', 'このブラウザは通知に対応していません', 'var(--error)'); return; }
  if (!notify && Notification.permission !== 'granted') {
    const p = await Notification.requestPermission();
    if (p !== 'granted') { toast('🔕', '通知が許可されませんでした', 'var(--reply)'); return; }
  }
  notify = !notify; setPref('notify', notify ? '1' : '0'); paintToggles();
  toast(notify ? '🔔' : '🔕', notify ? '別の画面にいる時、返信待ち・完了をデスクトップ通知します' : 'デスクトップ通知をオフにしました', 'var(--codex-2)');
};
$('#search').addEventListener('input', e => { search = e.target.value.trim(); render(); });
document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]'); if (c) openPanel(c.dataset.close, false);
  const cp = e.target.closest('[data-copy]');
  if (cp) navigator.clipboard.writeText(cp.dataset.copy).then(() => toast('📋', 'コピーしました', 'var(--codex-2)'), () => toast('⚠️', 'コピーできませんでした', 'var(--error)'));
  const d = e.target.closest('[data-done]'); if (d) { dismiss(d.dataset.done); openPanel('detail', false); }
  const u = e.target.closest('[data-undo]'); if (u) dismiss(u.dataset.undo, true);
  if (e.target.classList && e.target.classList.contains('modal')) openPanel(e.target.id, false);
});
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') closeAll();
  else if (k === '1') setFilter('all'); else if (k === '2') setFilter('claude'); else if (k === '3') setFilter('codex');
  else if (k === '/') { e.preventDefault(); $('#search').focus(); }
  else if (k === 'f') $('#feedBtn').click();
  else if (k === 'e') $('#endedBtn').click();
  else if (k === 'x') $('#execBtn').click();
  else if (k === 't') cycleTod();
  else if (k === 'l') setLite(!lite, true);
  else if (k === 'd') setDensity({ l: 'm', m: 's', s: 'l' }[density]);
  else if (k === 's') $('#soundBtn').click();
  else if (k === 'a') openPanel('achModal', $('#achModal').hidden);
  else if (k === '?') openPanel('helpModal', true);
});

addEventListener('resize', () => { sizeCanvas(sky); sizeCanvas(fx); initStars(); });
sizeCanvas(sky); sizeCanvas(fx); initStars();
requestAnimationFrame(skyLoop);
setFilter(filter);
// カードの大きさ: l = 大 (舞台を大きく), m = 中, s = 小 (1行)
function setDensity(d) {
  density = d; setPref('density', d);
  document.body.dataset.density = d;
  $$('[data-density]', $('#density')).forEach(b => b.classList.toggle('on', b.dataset.density === d));
  // 並びが大きく変わるのでカードの移動アニメーションは出さずに配置し直す
  noFlip = true; render(); noFlip = false;
}
$$('#density [data-density]').forEach(b => b.addEventListener('click', () => setDensity(b.dataset.density)));
setDensity(density);
$('#todBtn').addEventListener('click', cycleTod);
function setLite(on, announce) {
  lite = on; setPref('lite', on ? '1' : '0');
  document.body.toggleAttribute('data-lite', on);
  $('#liteBtn').classList.toggle('on', on);
  $('#liteBtn').title = on ? '軽量モード: ON — 背景を間引き、待機中のロボットを止めています (L)' : '軽量モード: OFF (L)';
  skyNow = null;
  if (announce) toast(on ? '🪶' : '✨', on ? '軽量モードにしました (背景を間引き、待機中のロボットを停止)' : '通常モードに戻しました', 'var(--codex-2)');
}
$('#liteBtn').addEventListener('click', () => setLite(!lite, true));
setLite(lite, false);
$('#weatherBtn').addEventListener('click', () => {
  const w = weatherNow();
  toast(WEATHER[w.kind].icon, `<b>いまは「${WEATHER[w.kind].label}」</b> — ${esc(w.why)}<br><small>☀️ 快晴: 順調 / ☁️ くもり: 返信待ちあり・使用量60%超 / 🌧️ 雨: 3分以上の待ちが2件・使用量80%超 / ⛈️ 雷雨: エラー・上限到達 / 🌈 コンボや実績で虹</small>`, 'var(--codex-2)');
});
applyTod();
setInterval(applyTod, 60e3);
paintToggles();
setInterval(tickClock, 1000); tickClock();
if (DEMO) {
  const s = document.createElement('script');
  s.src = 'demo.js';
  document.body.appendChild(s);
} else connect();
