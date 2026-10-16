// Codex の使用枠を、モデルを動かさずに取得する (codex app-server の account/rateLimits/read)。
// ChatGPT でログインしている Codex が必要。node codex-limits.js で単体テストできる。
'use strict';
const { spawn } = require('child_process');

function readCodexLimits(timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const cmd = process.env.AGENT_DECK_CODEX_BIN || 'codex';
    const child = process.platform === 'win32'
      ? spawn(`"${cmd}" app-server`, { shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
      : spawn(cmd, ['app-server'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '', done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.stdin.end(); } catch { }
      // Windows では shell 経由の子プロセスごと止める
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else child.kill();
      err ? reject(err) : resolve(val);
    };
    const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
    child.on('error', e => finish(e));
    child.on('exit', code => finish(new Error(`codex app-server exited (${code})`)));
    child.stdout.on('data', chunk => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 0 && msg.result) {
          send({ method: 'initialized', params: {} });
          // バージョンによってはパラメータを受け付けないので付けない
          send({ method: 'account/rateLimits/read', id: 1 });
        } else if (msg.id === 1) {
          if (msg.error) finish(new Error(msg.error.message || 'rateLimits error'));
          else finish(null, normalize(msg.result));
        }
      }
    });
    const send = o => child.stdin.write(JSON.stringify(o) + '\n');
    send({ method: 'initialize', id: 0, params: { clientInfo: { name: 'agent_deck', title: 'Agent Deck', version: '1.0.0' } } });
  });
}

function normalize(r) {
  const snap = (r && (r.rateLimitsByLimitId && r.rateLimitsByLimitId.codex)) || (r && r.rateLimits) || {};
  const w = x => x && x.usedPercent != null ? { used: x.usedPercent, minutes: x.windowDurationMins || null, resetsAt: x.resetsAt ? x.resetsAt * 1000 : null } : null;
  return {
    windows: [w(snap.primary), w(snap.secondary)].filter(Boolean),
    plan: snap.planType || null,
    reached: snap.rateLimitReachedType || null,
    at: Date.now(),
  };
}

module.exports = { readCodexLimits };

if (require.main === module) {
  readCodexLimits().then(v => console.log(JSON.stringify(v, null, 2)), e => { console.error('error:', e.message); process.exit(1); });
}
