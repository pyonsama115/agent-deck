// ?demo=1 で使う架空のセッション。すべての場面と演出を確認できる。
'use strict';
(function () {
  const now = Date.now();
  const base = (o) => ({
    agent: 'claude', cwd: 'C:\\work\\' + (o.project || 'demo'), branch: 'main', source: '', model: o.agent === 'codex' ? 'gpt-6' : 'claude-opus-5-5',
    detail: '', tool: '', act: 'think', lastPrompt: 'ログイン画面のバグを直して', lastText: '原因はトークンの期限切れ判定でした。修正してテストも追加しています。',
    startedAt: now - 3600e3, turnStartedAt: null, lastActivity: now - 5000, stateSince: now - 20000, live: true,
    tokens: { context: 80000 + Math.random() * 300000 | 0, output: 12000, total: 140000 }, costUSD: o.agent === 'codex' ? null : 1.23,
    subagents: null, isExec: false, level: 1 + (Math.random() * 9 | 0), levelProgress: Math.random(), xp: 0, resume: 'claude --resume demo', ...o,
  });
  const S = [
    base({ id: 'd:1', sessionId: 'd1', title: 'ログイン画面のバグ修正', project: 'web-app', state: 'working', act: 'edit', detail: '🔧 Edit', turnStartedAt: now - 95e3 }),
    base({ id: 'd:2', sessionId: 'd2', agent: 'codex', title: 'APIのテストを追加', project: 'api', state: 'working', act: 'shell', detail: '🔧 exec_command', turnStartedAt: now - 40e3 }),
    base({ id: 'd:3', sessionId: 'd3', title: '大規模リファクタリング', project: 'core', state: 'working', act: 'agent', detail: '🔧 Agent', subagents: { active: 4, today: 9, total: 31 }, turnStartedAt: now - 600e3 }),
    base({ id: 'd:4', sessionId: 'd4', title: '競合サービスの調査', project: 'research', state: 'working', act: 'web', detail: '🔧 WebSearch', turnStartedAt: now - 120e3 }),
    base({ id: 'd:5', sessionId: 'd5', agent: 'codex', title: 'デプロイ手順を確認', project: 'infra', state: 'waiting', detail: '実行の許可待ち', stateSince: now - 70e3 }),
    base({ id: 'd:6', sessionId: 'd6', title: 'デザイン方針の相談', project: 'design', state: 'waiting', detail: '質問・確認への返事待ち', stateSince: now - 240e3 }),
    base({ id: 'd:7', sessionId: 'd7', title: 'README を整える', project: 'docs', state: 'idle', lastActivity: now - 90e3 }),
    base({ id: 'd:8', sessionId: 'd8', agent: 'codex', title: 'ログの解析', project: 'ops', state: 'idle', lastActivity: now - 3 * 3600e3 }),
    base({ id: 'd:9', sessionId: 'd9', title: '画面の操作確認', project: 'e2e', state: 'working', act: 'browser', detail: '🔧 navigate', turnStartedAt: now - 30e3 }),
    base({ id: 'd:10', sessionId: 'd10', title: '依存パッケージ更新', project: 'deps', state: 'error', detail: 'エラー: rate_limit' }),
    base({ id: 'd:11', sessionId: 'd11', agent: 'codex', title: '夜間バッチ', project: 'batch', state: 'ended', detail: '終了', isExec: true, lastActivity: now - 5 * 3600e3 }),
  ];
  const ACTS = ['think', 'read', 'edit', 'shell', 'web', 'browser', 'plan', 'mcp'];
  const TOOLS = { think: '', read: 'Read', edit: 'Edit', shell: 'Bash', web: 'WebSearch', browser: 'navigate', plan: 'TodoWrite', mcp: 'mcp__tool' };
  const ACH = [
    ['first_turn', '🎬', 'はじめの一歩', 'ターンを1回完了'], ['turns_10', '🔟', '肩慣らし', 'ターンを累計10回完了'], ['multi_3', '🚀', '3体同時稼働', '3つのセッションが同時に作業'],
    ['dual', '🤝', '夢の共演', 'Claude と Codex が同時に作業'], ['combo_3', '🔥', '3コンボ', '5分以内に3回連続でターン完了'], ['sub_1', '🐣', 'はじめての部下', 'サブエージェントを呼び出した'],
  ];
  const g = {
    xp: 1180, level: 5, progress: .6, next: 320, totals: { turns: 48, tools: 920, subagents: 31 },
    today: { turns: 12, tools: 240, subagents: 9, xp: 600, peak: 5 }, combo: 0,
    achievements: ACH.map(([id, icon, title, desc], i) => ({ id, icon, title, desc, at: i < 4 ? now - i * 86400e3 : null })),
    history: Array.from({ length: 360 }, (_, i) => { const t = now - (360 - i) * 30e3; const c = Math.max(0, Math.round(2 + Math.sin(i / 20) * 1.6)); return { t, c, x: Math.max(0, Math.round(1 + Math.cos(i / 15))), q: i % 47 === 0 ? 1 : 0 }; }),
  };
  const push = () => applySnapshot({ sessions: S.map(s => ({ ...s })), usage: { claude: { fiveHour: 42, sevenDay: 63, at: Date.now() - 600e3 }, codex: { fiveHour: 18, sevenDay: 35, at: Date.now() - 60e3 } }, game: { ...g } });
  $('#conn').classList.add('on'); setText($('#conn span'), 'DEMO');
  document.body.insertAdjacentHTML('beforeend', '<div class="demo-chip">🎮 デモ表示中 · <a href="./">本番に戻る</a></div>');
  push();

  let tick = 0;
  setInterval(() => {
    tick++;
    const t = Date.now();
    // 作業内容を入れ替える
    for (const s of S) if (s.state === 'working' && s.act !== 'agent' && Math.random() < .35) { s.act = ACTS[Math.random() * ACTS.length | 0]; s.tool = TOOLS[s.act]; s.detail = s.tool ? `🔧 ${s.tool}` : '考え中…'; s.lastActivity = t; }
    // XP
    const w = S.filter(s => s.state === 'working');
    if (w.length) { const s = w[Math.random() * w.length | 0]; s.xp += 2; onXp({ id: s.id, amount: 2 + (Math.random() < .2 ? 10 : 0), kinds: { tool: 1 }, botLevel: s.level, botLevelUp: false }); g.xp += 2; g.today.tools++; }
    // ターン完了と再開
    if (tick % 6 === 0) {
      const s = w.filter(x => x.act !== 'agent')[0];
      if (s) {
        s.state = 'idle'; s.lastActivity = t; s.stateSince = t; s.level++; g.today.turns++; g.combo++;
        addFeed({ agent: s.agent, sessionId: s.sessionId, kind: 'state', to: 'idle', text: `${s.title} → ターン完了`, at: t });
        setTimeout(() => onXp({ id: s.id, amount: 25, kinds: { turn: 1 }, botLevel: s.level, botLevelUp: true }), 600);
        if (g.combo >= 2) setTimeout(() => onCombo({ count: g.combo }), 900);
      }
      const r = S.find(x => x.state === 'idle' && x !== s);
      if (r) { r.state = 'working'; r.act = ACTS[Math.random() * ACTS.length | 0]; r.turnStartedAt = t; r.stateSince = t; r.lastActivity = t; }
    }
    if (tick === 9) { g.level++; g.progress = .05; onLevelUp({ level: g.level }); }
    if (tick === 15) { const a = g.achievements.find(x => !x.at); if (a) { a.at = t; onAchievement(a); } }
    const sub = S.find(s => s.id === 'd:3');
    sub.subagents = { ...sub.subagents, active: 1 + (tick % 6) };
    push();
  }, 3000);

  window.demo = {
    timeline(id) {
      const s = S.find(x => x.id === id) || S[0];
      const t = Date.now();
      return { items: [
        { t: t - 300e3, kind: 'user', text: s.lastPrompt },
        { t: t - 290e3, kind: 'assistant', text: 'まず関連するファイルを確認します。' },
        { t: t - 280e3, kind: 'tool', text: 'Read · src/auth/session.ts', act: 'read' },
        { t: t - 260e3, kind: 'tool', text: 'Grep · isExpired', act: 'read' },
        { t: t - 200e3, kind: 'tool', text: 'Edit · src/auth/session.ts', act: 'edit' },
        { t: t - 150e3, kind: 'tool', text: 'Bash · npm test', act: 'shell' },
        { t: t - 100e3, kind: 'assistant', text: s.lastText },
        { t: t - 99e3, kind: 'turn', text: '' },
      ] };
    },
    dismiss(id, undo) { const s = S.find(x => x.id === id); if (!s) return; if (undo) { s.state = 'idle'; s.dismissed = false; } else { s._prev = s.state; s.state = 'ended'; s.dismissed = true; s.detail = '完了にしました'; } setTimeout(push, 700); },
  };
})();
