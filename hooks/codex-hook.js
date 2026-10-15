// Codex の hooks は command 型だけなので、stdin の JSON を Agent Deck へ転送する。
// ダッシュボードが止まっていても Codex を邪魔しないよう、常に何も出力せず exit 0 する。
'use strict';
const http = require('http');
const port = Number(process.env.AGENT_DECK_PORT || 8787);
let body = '';
process.stdin.on('data', c => { body += c; });
process.stdin.on('end', () => {
  const req = http.request({ host: '127.0.0.1', port, path: '/hook/codex', method: 'POST', timeout: 800,
    headers: { 'Content-Type': 'application/json' } }, res => { res.resume(); res.on('end', () => process.exit(0)); });
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.end(body);
});
setTimeout(() => process.exit(0), 1500);
