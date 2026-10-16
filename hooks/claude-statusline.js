// Claude Code のステータスラインとして動き、渡された使用枠 (rate_limits) をファイルに保存する。
// モデルは呼ばないので料金や使用枠は消費しない。Agent Deck がこのファイルを読む。
// 保存先: ~/.claude/agent-deck-usage.json
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const OUT = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'agent-deck-usage.json');
let body = '';
process.stdin.on('data', c => { body += c; });
process.stdin.on('end', () => {
  let line = 'Agent Deck';
  try {
    const o = JSON.parse(body);
    const rl = o.rate_limits || null;
    if (rl && (rl.five_hour || rl.seven_day)) {
      const snap = { at: Date.now(), sessionId: o.session_id || null, rate_limits: rl };
      fs.writeFileSync(OUT + '.tmp', JSON.stringify(snap));
      fs.renameSync(OUT + '.tmp', OUT);
      const pct = w => w && w.used_percentage != null ? `${Math.round(w.used_percentage)}%` : '—';
      line = `5h ${pct(rl.five_hour)} · 週 ${pct(rl.seven_day)}`;
    }
  } catch { /* 表示が崩れないよう、失敗しても何か出して終わる */ }
  process.stdout.write(line + '\n');
});
