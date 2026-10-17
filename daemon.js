// server.js を見張り、落ちたら自動で立ち上げ直す。ログは data/agent-deck.log に残す。
//   node daemon.js            … 前面で実行
//   start-background.cmd      … 画面を出さずに裏で実行 (Windows)
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
const LOG = path.join(DATA, 'agent-deck.log');
const PID = path.join(DATA, 'daemon.pid');

function log(line) {
  const text = `[${new Date().toLocaleString('ja-JP')}] ${line}\n`;
  try {
    // ログが大きくなりすぎたら古い方を捨てる
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 2 * 1024 * 1024) fs.renameSync(LOG, LOG + '.old');
    fs.appendFileSync(LOG, text);
  } catch { }
}

let restarts = [];
function run() {
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { cwd: __dirname, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  log(`server 起動 (pid ${child.pid})`);
  child.stdout.on('data', d => log(String(d).trimEnd()));
  child.stderr.on('data', d => log('ERR ' + String(d).trimEnd()));
  child.on('exit', (code, sig) => {
    log(`server 終了 (code ${code}, signal ${sig})`);
    // ポートが使用中なら別の Agent Deck がもう動いているので見張りもやめる
    if (code === 1 && fs.readFileSync(LOG, 'utf8').slice(-400).includes('使用中')) { log('既に起動しているため終了します'); cleanup(); process.exit(0); }
    const now = Date.now();
    restarts = restarts.filter(t => now - t < 60e3).concat(now);
    // 1分に5回以上落ちるなら少し待ってから
    setTimeout(run, restarts.length >= 5 ? 30e3 : 2e3);
  });
}
function cleanup() { try { if (fs.readFileSync(PID, 'utf8') === String(process.pid)) fs.unlinkSync(PID); } catch { } }
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(0); });
// すでに Agent Deck が動いていれば何もしない (ログイン時の自動起動と手動起動が重なっても二重にならない)
const port = Number(process.env.AGENT_DECK_PORT || 8787);
const probe = require('net').connect({ host: '127.0.0.1', port });
probe.setTimeout(1500);
probe.on('connect', () => { probe.destroy(); log(`ポート ${port} で既に動いているので起動しません`); process.exit(0); });
const start = () => { probe.destroy(); fs.writeFileSync(PID, String(process.pid)); log('daemon 開始'); run(); };
probe.on('error', start);
probe.on('timeout', start);
