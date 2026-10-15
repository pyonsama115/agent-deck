// Claude Code (~/.claude/settings.json) と Codex (~/.codex/hooks.json) に Agent Deck 用の hooks を追加する。
//   node install-hooks.js            … 変更内容を表示するだけ (何も書き換えない)
//   node install-hooks.js --apply    … バックアップを取ってから追加
//   node install-hooks.js --remove   … Agent Deck の hooks だけを取り除く
// 既存の hooks や Codex の notify (computer-use が使用中) には触れない。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.AGENT_DECK_PORT || 8787);
const MARK = 'agent-deck';
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--remove') ? 'remove' : 'dry';
const HOME = os.homedir();
const claudeFile = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'settings.json');
const codexFile = path.join(process.env.CODEX_HOME || path.join(HOME, '.codex'), 'hooks.json');
const hookScript = path.join(__dirname, 'hooks', 'codex-hook.js');

const CLAUDE_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest',
  'Notification', 'Stop', 'StopFailure', 'SessionEnd'];
const CODEX_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest',
  'Stop', 'Interrupt', 'SessionEnd'];

function load(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isOurs(group) {
  return (group.hooks || []).some(h => (h.url || '').includes(`/hook/`) && (h.url || '').includes(`:${PORT}`)
    || (h.command || '').includes('codex-hook.js'));
}

function strip(cfg) {
  if (!cfg.hooks) return cfg;
  for (const ev of Object.keys(cfg.hooks)) {
    cfg.hooks[ev] = cfg.hooks[ev].filter(g => !isOurs(g));
    if (!cfg.hooks[ev].length) delete cfg.hooks[ev];
  }
  if (!Object.keys(cfg.hooks).length) delete cfg.hooks;
  return cfg;
}

function withClaude(cfg) {
  strip(cfg);
  cfg.hooks = cfg.hooks || {};
  for (const ev of CLAUDE_EVENTS) {
    (cfg.hooks[ev] = cfg.hooks[ev] || []).push({
      hooks: [{ type: 'http', url: `http://127.0.0.1:${PORT}/hook/claude`, timeout: 2 }],
    });
  }
  return cfg;
}

function withCodex(cfg) {
  strip(cfg);
  cfg.hooks = cfg.hooks || {};
  const cmd = `node "${hookScript}"`;
  for (const ev of CODEX_EVENTS) {
    (cfg.hooks[ev] = cfg.hooks[ev] || []).push({
      hooks: [{ type: 'command', command: cmd, commandWindows: cmd, timeout: 2 }],
    });
  }
  return cfg;
}

function write(file, cfg) {
  if (fs.existsSync(file)) {
    const bak = `${file}.${MARK}-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(file, bak);
    console.log(`  バックアップ: ${bak}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`  書き込み: ${file}`);
}

const claude = load(claudeFile);
const codex = load(codexFile);
const nextClaude = mode === 'remove' ? strip(structuredClone(claude)) : withClaude(structuredClone(claude));
const nextCodex = mode === 'remove' ? strip(structuredClone(codex)) : withCodex(structuredClone(codex));

if (mode === 'dry') {
  console.log(`Claude: ${claudeFile}\n  追加するイベント: ${CLAUDE_EVENTS.join(', ')}\n  → http://127.0.0.1:${PORT}/hook/claude`);
  console.log(`Codex : ${codexFile}\n  追加するイベント: ${CODEX_EVENTS.join(', ')}\n  → node "${hookScript}"`);
  console.log('\n実際に書き込むには: node install-hooks.js --apply');
} else {
  write(claudeFile, nextClaude);
  write(codexFile, nextCodex);
  console.log(mode === 'apply'
    ? '\n完了。新しく始めたセッションから反映されます。Codex は初回に /hooks で信頼(trust)が必要な場合があります。'
    : '\nAgent Deck の hooks を取り除きました。');
}
