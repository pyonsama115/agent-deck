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
const STATE_COLOR = { working: '#4ade80', waiting: '#ffc531', idle: '#ffc531', error: '#ff4d6d', stale: '#ff4d6d', interrupted: '#ff9f6b', ended: '#555b7a' };
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
let sound = pref('sound') === '1';
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
      <div class="foot"><span>ctx</span><div class="ctxbar"><i></i></div><span class="num ctxn">—</span><span class="num tok"></span><span class="when"></span></div>
    </div>`;
  el.addEventListener('click', e => { if (!e.target.closest('button')) openDetail(s.id); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') openDetail(s.id); });
  $('.act-done', el).addEventListener('click', e => { e.stopPropagation(); dismiss(s.id); });
  el._kind = 'full';
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
}

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
  if (reduceMotion) return;
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
function renderUsage() {
  const rows = ['claude', 'codex'].filter(a => usage[a] && (filter === 'all' || filter === a)).map(a => {
    const u = usage[a];
    const meter = (label, v) => v == null ? '<span></span>' : `<span class="meter"><span>${label}</span><span class="mbar"><i style="width:${Math.min(100, v)}%;background:${v >= 90 ? 'var(--error)' : v >= 70 ? 'var(--reply)' : AGENT_COLOR[a]}"></i></span><b>${Math.round(v)}%</b></span>`;
    const stale = Date.now() - u.at > 30 * 60e3;
    return `<div class="urow"><span class="who" style="color:${AGENT_COLOR[a]}">${AGENT_NAME[a]}</span>${meter('5h', u.fiveHour)}${meter('週', u.sevenDay)}<span class="uat${stale ? ' stale' : ''}" title="この値を取得した時刻">${stale ? '⏳ ' : ''}${ago(u.at)}</span></div>`;
  });
  const html = rows.length ? rows.join('') : '<small>使用枠のデータはまだありません</small>';
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
  const max = Math.max(3, ...hist.map(h => h.c + h.x));
  const X = t => ((t - t0) / (t1 - t0)) * W, Y = v => H - 2 - (v / max) * (H - 8);
  const line = key => hist.map((h, i) => `${i ? 'L' : 'M'}${X(h.t).toFixed(1)} ${Y(key(h)).toFixed(1)}`).join(' ');
  const area = key => `${line(key)} L${X(hist[hist.length - 1].t).toFixed(1)} ${H} L${X(hist[0].t).toFixed(1)} ${H} Z`;
  const waits = hist.filter(h => h.q).map(h => `<circle cx="${X(h.t).toFixed(1)}" cy="4" r="2" fill="#ffc531"/>`).join('');
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
      toast('🙋', `<b>${esc(s.title)}</b> が${isPermission(s) ? '許可' : '返事'}を待っています`, '#ffc531');
      if (el) shockwave(el, '#ffc531');
      sfx.alert();
      desktopNotify(`🙋 ${s.title}`, `${AGENT_NAME[s.agent]} が${isPermission(s) ? '許可' : '返事'}を待っています`);
    } else if (prev === 'working' && s.state === 'idle') {
      toast('🎉', `<b>${esc(s.title)}</b> のターンが完了！`, AGENT_COLOR[s.agent]);
      if (el) { el.classList.add('cheer'); setTimeout(() => el.classList.remove('cheer'), 2400); setTimeout(() => confetti(el, s.agent), 400); }
      sfx.done();
      desktopNotify(`🎉 ${s.title}`, `${AGENT_NAME[s.agent]} のターンが完了しました`);
    } else if (s.state === 'working') {
      if (el) setTimeout(() => shockwave(el, '#4ade80'), 600);
    } else if (s.state === 'error' || s.state === 'stale') {
      toast('💥', `<b>${esc(s.title)}</b> で問題が発生`, '#ff4d6d');
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
  showBanner('LEVEL UP!', `パイロットレベル ${d.level} になりました`);
  $('#pilot').classList.remove('levelup'); void $('#pilot').offsetWidth; $('#pilot').classList.add('levelup');
  fireworks(5);
  sfx.fanfare();
}
function onCombo(d) {
  showBanner(`COMBO ×${d.count}`, '連続でターン完了！', 'combo');
  fireworks(Math.min(d.count, 6));
  sfx.combo(d.count);
}
function onAchievement(a) {
  const t = toast(a.icon, `<div><b>実績解除！ ${esc(a.title)}</b><br><small>${esc(a.desc)}</small></div>`, '#ffd166');
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
function sizeCanvas(c) { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px'; }
function botCenter(el) { const r = ($('.stage', el) || el).getBoundingClientRect(); return { x: r.left + r.width * .22, y: r.top + r.height * .55 }; }
function burst(x, y, cols, n, power = 12, shape = 'rect') {
  if (reduceMotion) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = Math.random() * power;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * .4, g: .3, life: 70 + Math.random() * 50, rot: Math.random() * 6, vr: (Math.random() - .5) * .4,
      w: 4 + Math.random() * 5, h: 3 + Math.random() * 4, c: cols[i % cols.length], shape });
  }
}
function confetti(el, agent) {
  const c = botCenter(el);
  burst(c.x, c.y - 20, agent === 'claude' ? ['#ff8a4c', '#ffb26b', '#fff2e8', '#ffd166'] : ['#33e1c9', '#6aa8ff', '#eafffb', '#b388ff'], 90, 13);
}
function coinBurst(el, n) { const c = botCenter(el); burst(c.x, c.y - 30, ['#ffd166', '#ffe9a8'], n, 7, 'coin'); }
function shockwave(el, color) { if (reduceMotion) return; const c = botCenter(el); rings.push({ x: c.x, y: c.y, r: 10, a: 1, c: color }); }
function fireworks(n) {
  for (let i = 0; i < n; i++) setTimeout(() => {
    const x = innerWidth * (.2 + Math.random() * .6), y = innerHeight * (.15 + Math.random() * .35);
    burst(x, y, [['#ff8a4c', '#ffd166'], ['#33e1c9', '#6aa8ff'], ['#b388ff', '#ff4d6d']][i % 3].concat('#fff'), 70, 9, 'spark');
    rings.push({ x, y, r: 6, a: 1, c: '#ffd166' });
  }, i * 260);
}
function rain(cols) {
  if (reduceMotion) return;
  for (let i = 0; i < 120; i++) parts.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * 200, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3, g: .05,
    life: 200, rot: Math.random() * 6, vr: (Math.random() - .5) * .3, w: 6, h: 4, c: cols[i % cols.length], shape: 'rect' });
}
function fxLoop() {
  const dpr = devicePixelRatio;
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
  requestAnimationFrame(fxLoop);
}

// ---------- 背景の星空 (進行中が多いほど流れが速くなる) ----------
const sky = $('#sky'), sctx = sky.getContext('2d');
let stars = [];
function initStars() {
  stars = Array.from({ length: Math.min(400, Math.round(innerWidth * innerHeight / 5000)) }, () => ({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight, z: Math.random() * .9 + .1, tw: Math.random() * 6.28, hue: Math.random() < .5 }));
}
let warp = 0.2, pulse = 0;
function skyLoop(t) {
  const dpr = devicePixelRatio;
  const working = sessions.filter(s => s.state === 'working').length;
  const waiting = sessions.some(s => s.state === 'waiting');
  warp += ((reduceMotion ? 0 : 0.25 + Math.min(working, 6) * 0.9) - warp) * 0.02;
  pulse = waiting ? (Math.sin(t / 400) + 1) / 2 : pulse * .95;
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = sctx.createRadialGradient(innerWidth * .2, innerHeight * .1, 0, innerWidth * .5, innerHeight * .5, innerWidth);
  g.addColorStop(0, '#191237'); g.addColorStop(.5, '#0a0d1d'); g.addColorStop(1, '#05060d');
  sctx.fillStyle = g; sctx.fillRect(0, 0, innerWidth, innerHeight);
  const blob = (x, y, r, c, a) => { const rg = sctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c.replace('A', a)); rg.addColorStop(1, c.replace('A', 0)); sctx.fillStyle = rg; sctx.fillRect(0, 0, innerWidth, innerHeight); };
  blob(innerWidth * (.15 + Math.sin(t / 9000) * .05), innerHeight * .25, innerWidth * .4, 'rgba(255,138,76,A)', .10);
  blob(innerWidth * (.85 + Math.cos(t / 11000) * .05), innerHeight * .7, innerWidth * .45, 'rgba(51,225,201,A)', .09);
  if (pulse > .01) blob(innerWidth * .17, innerHeight * .35, innerWidth * .4, 'rgba(255,197,49,A)', .14 * pulse);
  for (const s of stars) {
    s.x -= warp * s.z * 1.6;
    if (s.x < -10) { s.x = innerWidth + 10; s.y = Math.random() * innerHeight; }
    const tw = .5 + Math.sin(t / 700 + s.tw) * .5;
    sctx.strokeStyle = s.hue ? `rgba(255,190,150,${.25 + .6 * tw * s.z})` : `rgba(160,240,255,${.25 + .6 * tw * s.z})`;
    sctx.lineWidth = s.z * 1.6;
    sctx.beginPath(); sctx.moveTo(s.x, s.y); sctx.lineTo(s.x + warp * s.z * 6 + .5, s.y); sctx.stroke();
  }
  requestAnimationFrame(skyLoop);
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
  const color = ev.kind === 'state' ? (STATE_COLOR[ev.to] || '#8b9cff') : ev.kind === 'achievement' || ev.kind === 'levelup' ? '#ffd166' : AGENT_COLOR[ev.agent];
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
  } catch { if (el) el.classList.remove('goodbye'); toast('⚠️', '更新できませんでした', '#ff4d6d'); }
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
  if (!('Notification' in window)) { toast('⚠️', 'このブラウザは通知に対応していません', '#ff4d6d'); return; }
  if (!notify && Notification.permission !== 'granted') {
    const p = await Notification.requestPermission();
    if (p !== 'granted') { toast('🔕', '通知が許可されませんでした', '#ff9f6b'); return; }
  }
  notify = !notify; setPref('notify', notify ? '1' : '0'); paintToggles();
  toast(notify ? '🔔' : '🔕', notify ? '別の画面にいる時、返信待ち・完了をデスクトップ通知します' : 'デスクトップ通知をオフにしました', '#6aa8ff');
};
$('#search').addEventListener('input', e => { search = e.target.value.trim(); render(); });
document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]'); if (c) openPanel(c.dataset.close, false);
  const cp = e.target.closest('[data-copy]');
  if (cp) navigator.clipboard.writeText(cp.dataset.copy).then(() => toast('📋', 'コピーしました', '#6aa8ff'), () => toast('⚠️', 'コピーできませんでした', '#ff4d6d'));
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
  else if (k === 's') $('#soundBtn').click();
  else if (k === 'a') openPanel('achModal', $('#achModal').hidden);
  else if (k === '?') openPanel('helpModal', true);
});

addEventListener('resize', () => { sizeCanvas(sky); sizeCanvas(fx); initStars(); });
sizeCanvas(sky); sizeCanvas(fx); initStars();
requestAnimationFrame(skyLoop); requestAnimationFrame(fxLoop);
setFilter(filter);
paintToggles();
setInterval(tickClock, 1000); tickClock();
if (DEMO) {
  const s = document.createElement('script');
  s.src = 'demo.js';
  document.body.appendChild(s);
} else connect();
