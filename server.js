// Agent Deck — Claude Code と Codex のセッションを1ページで見るローカルダッシュボード
// 依存パッケージなし。node server.js で起動し http://127.0.0.1:8787 を開く。
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.AGENT_DECK_PORT || 8787);
const HOST = process.env.AGENT_DECK_HOST || '127.0.0.1';
const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const CODEX_DIR = process.env.CODEX_HOME || path.join(HOME, '.codex');
const APPDATA_CLAUDE = path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'Claude');
const DESKTOP_META_DIR = path.join(APPDATA_CLAUDE, 'claude-code-sessions');
const PLAN_USAGE_FILE = path.join(APPDATA_CLAUDE, 'plan-usage-history.json');
const RECENT_MS = Number(process.env.AGENT_DECK_RECENT_HOURS || 12) * 3600e3;
const POLL_MS = 2000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// ---------- ファイル読み取りユーティリティ ----------

const tailCache = new Map(); // file -> {size, mtimeMs, lines}

// ファイル末尾の完全な行だけを返す。巨大な tool_result 行があるので足りなければ範囲を広げる。
function readTailLines(file, st, minBytes = 512 * 1024) {
  const c = tailCache.get(file);
  if (c && c.size === st.size && c.mtimeMs === st.mtimeMs && c.minBytes >= minBytes) return c.lines;
  let lines = [];
  for (const bytes of [minBytes, 4 * 1024 * 1024]) {
    const start = Math.max(0, st.size - bytes);
    const len = st.size - start;
    const buf = Buffer.alloc(len);
    let fd;
    try {
      fd = fs.openSync(file, 'r');
      fs.readSync(fd, buf, 0, len, start);
    } catch { return c ? c.lines : []; } finally { if (fd !== undefined) fs.closeSync(fd); }
    let text = buf.toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    lines = [];
    for (const l of text.split('\n')) {
      if (!l.trim()) continue;
      try { lines.push(JSON.parse(l)); } catch { /* 書き込み途中の行 */ }
    }
    if (lines.length >= 5 || start === 0) break;
  }
  tailCache.set(file, { size: st.size, mtimeMs: st.mtimeMs, minBytes, lines });
  return lines;
}

// 先頭行 (Codex の session_meta) を読む。base_instructions で長いことがある。
const headCache = new Map();
function readFirstLine(file) {
  if (headCache.has(file)) return headCache.get(file);
  let out = null;
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    let acc = '';
    const buf = Buffer.alloc(256 * 1024);
    for (let pos = 0; pos < 8 * 1024 * 1024;) {
      const n = fs.readSync(fd, buf, 0, buf.length, pos);
      if (!n) break;
      acc += buf.toString('utf8', 0, n);
      pos += n;
      const nl = acc.indexOf('\n');
      if (nl >= 0) { out = JSON.parse(acc.slice(0, nl)); break; }
    }
  } catch { out = null; } finally { if (fd !== undefined) fs.closeSync(fd); }
  if (out) headCache.set(file, out);
  return out;
}

function safeStat(p) { try { return fs.statSync(p); } catch { return null; } }
function safeReaddir(p) { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; } }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function clip(s, n = 140) {
  if (!s) return '';
  s = String(s).replace(/<[^>]{1,40}>/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function ts(o) { return Date.parse(o.timestamp) || 0; }
// mcp__Server__tool のような名前を読みやすくする
function prettyTool(name) { return String(name || '').replace(/^mcp__/, '').replace(/__/g, ' · '); }

// ツール名から「いま何をしているか」の場面を決める
function activityOf(tool) {
  if (!tool) return 'think';
  if (/^(Task|Agent)$|spawn_agent|subagent/i.test(tool)) return 'agent';
  if (/^(Read|Grep|Glob|LS|NotebookRead)$|read_file|list_dir|grep|search_files|view_image/i.test(tool)) return 'read';
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$|apply_patch|write_file|edit_file/i.test(tool)) return 'edit';
  if (/^(Bash|PowerShell|BashOutput|KillShell|Monitor)$|shell|exec_command|write_stdin|local_shell|terminal/i.test(tool)) return 'shell';
  if (/^(WebSearch|WebFetch)$|web_search|web_fetch|fetch_url/i.test(tool)) return 'web';
  if (/browser|chrome|navigate|screenshot|computer|preview|playwright/i.test(tool)) return 'browser';
  if (/TodoWrite|update_plan|plan|Task(Create|Update|List)/i.test(tool)) return 'plan';
  return 'mcp';
}

// ---------- hooks で受け取った最新状態 ----------

const hookState = new Map(); // `${agent}:${sessionId}` -> {state, detail, at, event, tool}

function applyHook(agent, body) {
  const sid = body.session_id || body.sessionId;
  if (!sid) return;
  const ev = body.hook_event_name || '';
  const key = `${agent}:${sid}`;
  const prev = hookState.get(key) || {};
  let state = prev.state, detail = prev.detail || '', tool = prev.tool || '';
  switch (ev) {
    case 'SessionStart': state = 'idle'; detail = 'セッション開始'; tool = ''; break;
    case 'UserPromptSubmit': state = 'working'; detail = clip(body.prompt, 80) || '考え中'; tool = ''; break;
    case 'PreToolUse': state = 'working'; tool = body.tool_name || ''; detail = `🔧 ${prettyTool(tool) || 'tool'}`; break;
    case 'PostToolUse': case 'PostToolUseFailure': state = 'working'; detail = `✓ ${prettyTool(body.tool_name) || 'tool'}`; tool = ''; break;
    case 'PermissionRequest': state = 'waiting'; tool = body.tool_name || tool; detail = `許可待ち: ${prettyTool(body.tool_name)}`; break;
    case 'Notification': {
      const t = body.notification_type || '';
      if (t === 'permission_prompt' || t === 'elicitation_dialog' || t === 'agent_needs_input') { state = 'waiting'; detail = clip(body.message, 80) || '入力待ち'; }
      else if (t === 'idle_prompt') { state = 'idle'; detail = '入力待ち'; }
      break;
    }
    case 'Stop': state = 'idle'; detail = 'ターン完了'; tool = ''; break;
    case 'StopFailure': state = 'error'; detail = `エラー: ${body.error_type || body.reason || ''}`; break;
    case 'Interrupt': state = 'interrupted'; detail = '中断'; tool = ''; break;
    case 'SessionEnd': state = 'ended'; detail = 'セッション終了'; tool = ''; break;
    default: break;
  }
  hookState.set(key, { state, detail, tool, at: Date.now(), event: ev });
  if (ev !== 'PreToolUse' && ev !== 'PostToolUse') pushEvent({ agent, sessionId: sid, kind: 'hook', text: `${ev}${detail ? ' · ' + detail : ''}` });
  scheduleTick();
}

// ---------- Claude Code ----------

let claudeProjectIndex = { at: 0, map: new Map() }; // sessionId -> jsonl path
let desktopMeta = { at: 0, map: new Map() }; // cliSessionId -> meta

function indexClaudeProjects(now) {
  if (now - claudeProjectIndex.at < 10000) return claudeProjectIndex.map;
  const map = new Map();
  const root = path.join(CLAUDE_DIR, 'projects');
  for (const d of safeReaddir(root)) {
    if (!d.isDirectory()) continue;
    const dir = path.join(root, d.name);
    for (const f of safeReaddir(dir)) {
      if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
      const sid = f.name.slice(0, -6);
      const p = path.join(dir, f.name);
      // 同じセッションがドライブ文字の大小違いで2か所にあることがあるので新しい方を使う
      const prev = map.get(sid);
      if (prev) { const a = safeStat(prev), b = safeStat(p); if (a && b && a.mtimeMs >= b.mtimeMs) continue; }
      map.set(sid, p);
    }
  }
  claudeProjectIndex = { at: now, map };
  return map;
}

function indexDesktopMeta(now) {
  if (now - desktopMeta.at < 30000) return desktopMeta.map;
  const map = new Map();
  const walk = (dir, depth) => {
    for (const e of safeReaddir(dir)) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (e.isFile() && /^local_.*\.json$/.test(e.name)) {
        const st = safeStat(p);
        if (!st || now - st.mtimeMs > 7 * 86400e3) continue;
        const m = readJson(p);
        if (m && m.cliSessionId) map.set(m.cliSessionId, m);
      }
    }
  };
  walk(DESKTOP_META_DIR, 0);
  desktopMeta = { at: now, map };
  return map;
}

function summarizeClaudeTranscript(file) {
  const st = safeStat(file);
  if (!st) return null;
  const lines = readTailLines(file, st);
  const r = { mtimeMs: st.mtimeMs, title: '', lastPrompt: '', lastText: '', model: '', cwd: '', branch: '',
    pendingTool: '', lastTool: '', lastStop: '', context: 0, costUSD: null, entrypoint: '', outTokens: 0, events: [] };
  const seen = new Set();
  const openTools = new Map();
  for (const o of lines) {
    if (o.cwd) r.cwd = o.cwd;
    if (o.gitBranch) r.branch = o.gitBranch;
    if (o.entrypoint) r.entrypoint = o.entrypoint;
    switch (o.type) {
      case 'ai-title': if (o.aiTitle) r.aiTitle = o.aiTitle; break;
      case 'custom-title': if (o.customTitle || o.title) r.customTitle = o.customTitle || o.title; break;
      case 'last-prompt': r.lastPrompt = o.lastPrompt || r.lastPrompt; break;
      case 'cost-state': if (typeof o.totalCostUSD === 'number') r.costUSD = o.totalCostUSD; break;
      case 'assistant': {
        if (o.isSidechain) break;
        const m = o.message || {};
        if (m.model && m.model !== '<synthetic>') r.model = m.model;
        const k = `${m.id}:${o.requestId}`;
        if (m.usage && !seen.has(k)) {
          seen.add(k);
          const u = m.usage;
          r.context = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
          r.outTokens += u.output_tokens || 0;
        }
        for (const b of m.content || []) {
          if (b.type === 'text' && b.text) r.lastText = b.text;
          if (b.type === 'tool_use') {
            openTools.set(b.id, b.name);
            r.lastTool = b.name;
            r.events.push({ t: ts(o), kind: activityOf(b.name) === 'agent' ? 'spawn' : 'tool', name: b.name });
          }
        }
        if (m.stop_reason) {
          r.lastStop = m.stop_reason;
          if (m.stop_reason === 'end_turn') r.events.push({ t: ts(o), kind: 'turn' });
        }
        break;
      }
      case 'user': {
        if (o.isSidechain) break;
        const c = o.message && o.message.content;
        if (Array.isArray(c)) {
          for (const b of c) {
            if (b.type === 'tool_result') { openTools.delete(b.tool_use_id); if (b.is_error) r.events.push({ t: ts(o), kind: 'toolError' }); }
            else if (b.type === 'text' && !o.isMeta) r.lastPrompt = b.text;
          }
        } else if (typeof c === 'string' && !o.isMeta) r.lastPrompt = c;
        break;
      }
      default: break;
    }
  }
  r.title = r.customTitle || r.aiTitle || '';
  r.pendingTool = [...openTools.values()].pop() || '';
  return r;
}

// サブエージェントは <session-id>/subagents/*.jsonl に書かれる。最近書き込まれたものを「動作中」とみなす。
const subCache = new Map();
function claudeSubagents(file, now, fresh) {
  const c = subCache.get(file);
  if (c && !fresh && now - c.at < 15000) return c.value;
  const dir = path.join(file.slice(0, -6), 'subagents');
  let active = 0, total = 0, today = 0;
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  for (const e of safeReaddir(dir)) {
    if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
    total++;
    const st = safeStat(path.join(dir, e.name));
    if (!st) continue;
    if (now - st.mtimeMs < 30e3) active++;
    if (st.birthtimeMs >= dayStart) today++;
  }
  const value = total ? { active, total, today } : null;
  subCache.set(file, { at: now, value });
  return value;
}

function collectClaude(now) {
  const sessions = [];
  const projects = indexClaudeProjects(now);
  const meta = indexDesktopMeta(now);
  const live = new Map();
  const regDir = path.join(CLAUDE_DIR, 'sessions');
  for (const e of safeReaddir(regDir)) {
    if (!e.isFile() || !/^\d+\.json$/.test(e.name)) continue;
    const reg = readJson(path.join(regDir, e.name));
    if (!reg || !reg.sessionId || !pidAlive(reg.pid)) continue;
    live.set(reg.sessionId, reg);
  }
  const ids = new Set(live.keys());
  for (const [sid, file] of projects) {
    const st = safeStat(file);
    if (st && now - st.mtimeMs < RECENT_MS) ids.add(sid);
  }
  const localToCli = new Map();
  for (const m of meta.values()) if (m.sessionId) localToCli.set(m.sessionId, m.cliSessionId);
  for (const sid of ids) {
    const reg = live.get(sid);
    const dm = meta.get(sid);
    // デスクトップアプリのサイドチャット等のフォーク。一度も使っていないものは独立したセッションとして数えない
    const forkFrom = dm && (dm.forkedFromSessionId || (dm.spawnedFrom && dm.spawnedFrom.sessionId));
    if (forkFrom && !dm.completedTurns && !(dm.latestUserFrameAt > dm.createdAt)) continue;
    const file = projects.get(sid);
    const t = file ? summarizeClaudeTranscript(file) : null;
    const hook = hookState.get(`claude:${sid}`);
    const lastActivity = Math.max(t ? t.mtimeMs : 0, reg ? reg.statusUpdatedAt || reg.updatedAt || 0 : 0, hook ? hook.at : 0);

    let state, detail = '';
    if (reg) {
      // status は busy / idle / waiting (waitingFor に理由) がある
      state = reg.status === 'busy' ? 'working' : reg.status === 'waiting' ? 'waiting' : 'idle';
      if (state === 'working' && t && t.pendingTool) detail = `🔧 ${prettyTool(t.pendingTool)}`;
      else if (state === 'working') detail = '考え中…';
      else if (state === 'waiting') detail = reg.waitingFor === 'input needed' ? '質問・確認への返事待ち' : `待ち: ${reg.waitingFor || ''}`;
      else detail = '入力待ち';
    } else {
      state = t && now - t.mtimeMs < 90e3 && t.lastStop !== 'end_turn' ? 'working' : 'ended';
      detail = state === 'ended' ? '終了' : '';
    }
    // hooks の方が細かいので、新しければ優先する (待ち状態が分かるのは hooks だけ)
    if (hook && hook.at >= lastActivity - 1500 && hook.state) {
      if (!(hook.state === 'ended' && reg)) { state = hook.state; detail = hook.detail || detail; }
    } else if (hook && hook.state === 'waiting' && reg && reg.status === 'busy' && (!t || t.mtimeMs <= hook.at + 1500)) {
      // 許可待ちの間はトランスクリプトが伸びないので、伸びていなければ待ちのまま
      state = 'waiting'; detail = hook.detail;
    }
    if (dm && dm.isArchived) { state = 'ended'; detail = 'アーカイブ済み'; }
    const tool = state === 'working' ? ((hook && hook.tool && now - hook.at < 600e3) ? hook.tool : (t && t.pendingTool) || '') : (state === 'waiting' ? (hook && hook.tool) || (t && t.pendingTool) || '' : '');
    const subagents = file ? claudeSubagents(file, now, state === 'working') : null;
    const cwd = (reg && reg.cwd) || (t && t.cwd) || (dm && dm.cwd) || '';
    const source = (reg && reg.entrypoint) || (t && t.entrypoint) || '';
    sessions.push({
      id: `claude:${sid}`, agent: 'claude', sessionId: sid,
      title: (reg && reg.name) || (dm && dm.title) || (t && t.title) || path.basename(cwd) || sid.slice(0, 8),
      cwd, project: path.basename(cwd), branch: t ? t.branch : '',
      source, isExec: /^sdk/.test(source), model: (t && t.model) || (dm && dm.model) || '',
      state, detail, tool, act: state === 'working' && subagents && subagents.active ? 'agent' : activityOf(tool),
      lastPrompt: clip(t && t.lastPrompt, 160), lastText: clip(t && t.lastText, 220),
      startedAt: (reg && reg.startedAt) || (dm && dm.createdAt) || null,
      turnStartedAt: state === 'working' && reg ? reg.statusUpdatedAt || null : null,
      lastActivity, live: !!reg, pid: reg ? reg.pid : null,
      tokens: { context: t ? t.context : 0, output: t ? t.outTokens : 0 },
      costUSD: t ? t.costUSD : null,
      turns: dm ? dm.completedTurns : null,
      subagents, hooked: !!hook,
      forkOf: forkFrom ? localToCli.get(forkFrom) || null : null,
      resume: `claude --resume ${sid}`,
      _events: t ? t.events : [], _file: file,
    });
  }
  return sessions;
}

// ---------- Codex ----------

let codexIndex = { at: 0, size: 0, map: new Map() };
function codexTitles(now) {
  const f = path.join(CODEX_DIR, 'session_index.jsonl');
  const st = safeStat(f);
  if (!st || (st.size === codexIndex.size && now - codexIndex.at < 60000)) return codexIndex.map;
  const map = new Map();
  try {
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!l) continue;
      try { const o = JSON.parse(l); if (o.id && o.thread_name) map.set(o.id, o.thread_name); } catch { }
    }
  } catch { }
  codexIndex = { at: now, size: st.size, map };
  return map;
}

function codexDayDirs(now) {
  const dirs = [];
  for (let i = 0; i <= Math.ceil(RECENT_MS / 86400e3); i++) {
    const d = new Date(now - i * 86400e3);
    dirs.push(path.join(CODEX_DIR, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')));
  }
  return dirs;
}

function contentText(content) {
  if (!Array.isArray(content)) return typeof content === 'string' ? content : '';
  return content.map(c => c.text || '').join(' ');
}

function collectCodex(now) {
  const sessions = [];
  const titles = codexTitles(now);
  for (const dir of codexDayDirs(now)) {
    for (const e of safeReaddir(dir)) {
      if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
      const file = path.join(dir, e.name);
      const st = safeStat(file);
      if (!st || now - st.mtimeMs > RECENT_MS) continue;
      const m = e.name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/);
      const sid = m ? m[1] : e.name;
      const head = readFirstLine(file);
      const meta = head && head.type === 'session_meta' ? head.payload || {} : {};
      const lines = readTailLines(file, st);
      let state = 'idle', detail = '', lastText = '', lastPrompt = '', model = '', cwd = meta.cwd || '';
      let tokens = 0, context = 0, ctxWindow = 0, rate = null, turnStarted = null, lastTool = '', toolOpen = false;
      const events = [];
      for (const o of lines) {
        const p = o.payload || {};
        if (o.type === 'turn_context') { model = p.model || model; cwd = p.cwd || cwd; }
        else if (o.type === 'event_msg') {
          switch (p.type) {
            case 'task_started': case 'turn_started': state = 'working'; detail = '考え中…'; turnStarted = ts(o) || null; ctxWindow = p.model_context_window || ctxWindow; lastTool = ''; break;
            case 'task_complete': case 'turn_complete': state = 'idle'; detail = 'ターン完了'; if (p.last_agent_message) lastText = p.last_agent_message; events.push({ t: ts(o), kind: 'turn' }); break;
            case 'turn_aborted': state = 'interrupted'; detail = '中断'; break;
            case 'exec_approval_request': state = 'waiting'; detail = '実行の許可待ち'; break;
            case 'apply_patch_approval_request': state = 'waiting'; detail = 'パッチ適用の許可待ち'; break;
            case 'request_user_input': state = 'waiting'; detail = '入力待ち'; break;
            case 'error': state = 'error'; detail = clip(p.message, 80) || 'エラー'; break;
            case 'shutdown_complete': state = 'ended'; detail = '終了'; break;
            case 'agent_message': if (p.message) lastText = p.message; break;
            case 'user_message': if (p.message) lastPrompt = p.message; break;
            case 'token_count':
              if (p.info) {
                tokens = (p.info.total_token_usage || {}).total_tokens || tokens;
                context = (p.info.last_token_usage || {}).input_tokens || context;
                ctxWindow = p.info.model_context_window || ctxWindow;
              }
              if (p.rate_limits && p.rate_limits.primary) rate = { primary: p.rate_limits.primary.used_percent, secondary: p.rate_limits.secondary ? p.rate_limits.secondary.used_percent : null };
              break;
            default: break;
          }
        } else if (o.type === 'response_item') {
          if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call' || p.type === 'web_search_call') {
            lastTool = p.name || p.type.replace(/_call$/, ''); toolOpen = true;
            if (state === 'working') detail = `🔧 ${prettyTool(lastTool)}`;
            events.push({ t: ts(o), kind: activityOf(lastTool) === 'agent' ? 'spawn' : 'tool', name: lastTool });
          } else if (/_output$/.test(p.type || '')) toolOpen = false;
          else if (p.type === 'message' && p.role === 'assistant') { const tx = contentText(p.content); if (tx) lastText = tx; }
        }
      }
      // 書き込みが長時間止まった "working" は落ちたプロセスとみなす
      if (state === 'working' && now - st.mtimeMs > 15 * 60e3) { state = 'stale'; detail = '応答なし'; }
      // Codex には生存プロセスの一覧がないので、しばらく書き込みのない待機セッションは終了扱いにする
      if ((state === 'idle' || state === 'interrupted') && now - st.mtimeMs > 30 * 60e3) { state = 'ended'; detail = '終了'; }
      const hook = hookState.get(`codex:${sid}`);
      if (hook && hook.state && hook.at >= st.mtimeMs - 1500) { state = hook.state; detail = hook.detail || detail; }
      const tool = state === 'working' ? ((hook && hook.tool && hook.at >= st.mtimeMs - 1500) ? hook.tool : (toolOpen ? lastTool : '')) : '';
      const isExec = meta.originator === 'codex_exec' || meta.source === 'exec';
      sessions.push({
        id: `codex:${sid}`, agent: 'codex', sessionId: sid,
        title: titles.get(sid) || clip(lastPrompt, 40) || path.basename(cwd) || sid.slice(0, 8),
        cwd, project: path.basename(cwd), branch: meta.git ? meta.git.branch || '' : '',
        source: meta.originator || (typeof meta.source === 'string' ? meta.source : ''), isExec, model,
        state, detail, tool, act: activityOf(tool),
        lastPrompt: clip(lastPrompt, 160), lastText: clip(lastText, 220),
        startedAt: Date.parse(meta.timestamp) || st.birthtimeMs, turnStartedAt: state === 'working' ? turnStarted : null,
        lastActivity: Math.max(st.mtimeMs, hook ? hook.at : 0), live: state !== 'ended',
        tokens: { total: tokens, context, contextWindow: ctxWindow }, rate,
        subagents: null, hooked: !!hook,
        resume: `codex resume ${sid}`,
        _events: events, _file: file,
      });
    }
  }
  return sessions;
}

// ---------- 詳細タイムライン ----------

function timelineFor(id) {
  const s = snapshot.sessions.find(x => x.id === id);
  const file = s && fileOf.get(id);
  if (!file) return null;
  const st = safeStat(file);
  if (!st) return null;
  const lines = readTailLines(file, st, 1024 * 1024);
  const items = [];
  const add = (t, kind, text, extra) => { if (text || kind === 'turn') items.push({ t, kind, text: clip(text, 400), ...extra }); };
  if (s.agent === 'claude') {
    for (const o of lines) {
      if (o.isSidechain) continue;
      if (o.type === 'assistant') {
        for (const b of (o.message && o.message.content) || []) {
          if (b.type === 'text') add(ts(o), 'assistant', b.text);
          else if (b.type === 'tool_use') add(ts(o), 'tool', toolSummary(b.name, b.input), { tool: b.name, act: activityOf(b.name) });
        }
        if (o.message && o.message.stop_reason === 'end_turn') add(ts(o), 'turn', '');
      } else if (o.type === 'user' && !o.isMeta) {
        const c = o.message && o.message.content;
        if (typeof c === 'string') add(ts(o), 'user', c);
        else if (Array.isArray(c)) for (const b of c) {
          if (b.type === 'text') add(ts(o), 'user', b.text);
          else if (b.type === 'tool_result' && b.is_error) add(ts(o), 'error', typeof b.content === 'string' ? b.content : 'ツールエラー');
        }
      }
    }
  } else {
    for (const o of lines) {
      const p = o.payload || {};
      if (o.type === 'event_msg') {
        if (p.type === 'user_message') add(ts(o), 'user', p.message);
        else if (p.type === 'agent_message') add(ts(o), 'assistant', p.message);
        else if (p.type === 'task_complete') add(ts(o), 'turn', '');
        else if (p.type === 'error') add(ts(o), 'error', p.message);
      } else if (o.type === 'response_item' && (p.type === 'function_call' || p.type === 'custom_tool_call')) {
        let input = p.arguments || p.input;
        try { input = JSON.parse(input); } catch { }
        add(ts(o), 'tool', toolSummary(p.name, input), { tool: p.name, act: activityOf(p.name) });
      }
    }
  }
  return { id, file, items: items.slice(-120) };
}

function toolSummary(name, input) {
  name = prettyTool(name);
  if (!input) return name;
  if (typeof input === 'string') return `${name} · ${input}`;
  const v = input.command || input.cmd || input.file_path || input.path || input.pattern || input.url || input.query || input.description || input.prompt || '';
  const s = Array.isArray(v) ? v.join(' ') : String(v);
  return s ? `${name} · ${s}` : name;
}

// ---------- 使用枠 ----------

// Claude デスクトップアプリが時々書き込む使用率の履歴 (fh = 5時間枠 %, sd = 週間枠 %)。リアルタイムではない。
let planUsage = { mtimeMs: 0, value: null };
function claudeUsage() {
  const st = safeStat(PLAN_USAGE_FILE);
  if (!st) return null;
  if (st.mtimeMs !== planUsage.mtimeMs) {
    const o = readJson(PLAN_USAGE_FILE);
    const last = o && Array.isArray(o.samples) ? o.samples[o.samples.length - 1] : null;
    planUsage = { mtimeMs: st.mtimeMs, value: last && last.u ? { fiveHour: last.u.fh, sevenDay: last.u.sd, at: last.t } : null };
  }
  return planUsage.value;
}

function codexUsage(sessions) {
  const s = sessions.filter(x => x.agent === 'codex' && x.rate && x.rate.primary != null).sort((a, b) => b.lastActivity - a.lastActivity)[0];
  return s ? { fiveHour: s.rate.primary, sevenDay: s.rate.secondary, at: s.lastActivity } : null;
}

// ---------- ゲーム要素: XP・レベル・実績 ----------

const XP = { tool: 2, turn: 25, spawn: 12, toolError: 0 };
const ACHIEVEMENTS = [
  { id: 'first_turn', icon: '🎬', title: 'はじめの一歩', desc: 'ターンを1回完了' },
  { id: 'turns_10', icon: '🔟', title: '肩慣らし', desc: 'ターンを累計10回完了' },
  { id: 'turns_50', icon: '🏅', title: '働き者', desc: 'ターンを累計50回完了' },
  { id: 'turns_200', icon: '🏆', title: '工場長', desc: 'ターンを累計200回完了' },
  { id: 'tools_100', icon: '🔧', title: '道具使い', desc: 'ツールを累計100回使用' },
  { id: 'tools_1000', icon: '🛠️', title: '千の手', desc: 'ツールを累計1000回使用' },
  { id: 'sub_1', icon: '🐣', title: 'はじめての部下', desc: 'サブエージェントを呼び出した' },
  { id: 'sub_25', icon: '🐝', title: 'ミツバチ部隊', desc: 'サブエージェントを累計25体' },
  { id: 'multi_3', icon: '🚀', title: '3体同時稼働', desc: '3つのセッションが同時に作業' },
  { id: 'multi_5', icon: '🌌', title: '艦隊出撃', desc: '5つのセッションが同時に作業' },
  { id: 'dual', icon: '🤝', title: '夢の共演', desc: 'Claude と Codex が同時に作業' },
  { id: 'combo_3', icon: '🔥', title: '3コンボ', desc: '5分以内に3回連続でターン完了' },
  { id: 'combo_5', icon: '💥', title: '5コンボ', desc: '5分以内に5回連続でターン完了' },
  { id: 'quick', icon: '⚡', title: '即レス', desc: '許可待ちに30秒以内で応答' },
  { id: 'night_owl', icon: '🦉', title: '夜ふかし', desc: '深夜2〜5時にエージェントが作業' },
  { id: 'marathon', icon: '🏃', title: 'マラソン', desc: '1ターンが30分以上続いた' },
];

let game = {
  xp: 0, turns: 0, tools: 0, subagents: 0,
  today: { date: '', turns: 0, tools: 0, subagents: 0, xp: 0, peak: 0 },
  achievements: {}, sessionXp: {}, combo: { count: 0, last: 0 }, history: [], events: [],
};

function levelOf(xp, k) { const lv = Math.floor(Math.sqrt(xp / k)) + 1; const a = k * (lv - 1) ** 2, b = k * lv ** 2; return { level: lv, progress: (xp - a) / (b - a), next: b - xp }; }
const pilotLevel = xp => levelOf(xp, 60);
const botLevel = xp => levelOf(xp, 15);
function todayKey(now) { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

function loadState() {
  const o = readJson(STATE_FILE);
  if (o) game = { ...game, ...o, combo: { count: 0, last: 0 } };
  events = (game.events || []).slice(-200);
}
let dirty = false;
function saveState() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const cutoff = Date.now() - 7 * 86400e3;
    for (const [k, v] of Object.entries(game.sessionXp)) if (v.at < cutoff) delete game.sessionXp[k];
    for (const [k, at] of Object.entries(game.dismissed || {})) if (at < cutoff) delete game.dismissed[k];
    game.events = events.slice(-200);
    fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify(game));
    fs.renameSync(STATE_FILE + '.tmp', STATE_FILE);
  } catch (e) { console.error('save', e.message); }
}

function unlock(id) {
  if (game.achievements[id]) return;
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  game.achievements[id] = Date.now();
  dirty = true;
  broadcast('achievement', a);
  pushEvent({ agent: 'claude', sessionId: '', kind: 'achievement', text: `🏆 実績解除: ${a.icon} ${a.title}` });
}

const lastSeen = new Map(); // session id -> 最後に数えたイベントの時刻
const serverStart = Date.now();

function award(now, sessions) {
  const key = todayKey(now);
  if (game.today.date !== key) game.today = { date: key, turns: 0, tools: 0, subagents: 0, xp: 0, peak: 0 };
  const beforeLv = pilotLevel(game.xp).level;
  for (const s of sessions) {
    const evs = s._events || [];
    const seen = lastSeen.has(s.id) ? lastSeen.get(s.id) : serverStart;
    let maxT = seen, gained = 0;
    const kinds = { tool: 0, turn: 0, spawn: 0 };
    for (const e of evs) {
      if (e.t <= seen) continue;
      maxT = Math.max(maxT, e.t);
      if (!(e.kind in kinds)) continue;
      kinds[e.kind]++;
      gained += XP[e.kind];
    }
    lastSeen.set(s.id, maxT);
    if (!gained) continue;
    const tools = kinds.tool + kinds.spawn;
    game.xp += gained; game.tools += tools; game.turns += kinds.turn; game.subagents += kinds.spawn;
    game.today.xp += gained; game.today.tools += tools; game.today.turns += kinds.turn; game.today.subagents += kinds.spawn;
    const sx = game.sessionXp[s.id] || { xp: 0, at: now };
    const beforeBot = botLevel(sx.xp).level;
    sx.xp += gained; sx.at = now;
    game.sessionXp[s.id] = sx;
    dirty = true;
    const bl = botLevel(sx.xp);
    broadcast('xp', { id: s.id, amount: gained, kinds, botLevel: bl.level, botLevelUp: bl.level > beforeBot });
    if (kinds.turn) {
      game.combo = now - game.combo.last < 5 * 60e3 ? { count: game.combo.count + kinds.turn, last: now } : { count: kinds.turn, last: now };
      if (game.combo.count >= 2) broadcast('combo', { count: game.combo.count, id: s.id });
      if (game.combo.count >= 3) unlock('combo_3');
      if (game.combo.count >= 5) unlock('combo_5');
    }
    if (kinds.spawn) unlock('sub_1');
  }
  const after = pilotLevel(game.xp);
  if (after.level > beforeLv) { broadcast('levelup', { level: after.level }); pushEvent({ agent: 'claude', sessionId: '', kind: 'levelup', text: `⭐ パイロットレベル ${after.level} に到達！` }); }
  if (game.turns >= 1) unlock('first_turn');
  if (game.turns >= 10) unlock('turns_10');
  if (game.turns >= 50) unlock('turns_50');
  if (game.turns >= 200) unlock('turns_200');
  if (game.tools >= 100) unlock('tools_100');
  if (game.tools >= 1000) unlock('tools_1000');
  if (game.subagents >= 25) unlock('sub_25');
  const working = sessions.filter(s => s.state === 'working');
  if (working.length > game.today.peak) { game.today.peak = working.length; dirty = true; }
  if (working.length >= 3) unlock('multi_3');
  if (working.length >= 5) unlock('multi_5');
  if (working.some(s => s.agent === 'claude') && working.some(s => s.agent === 'codex')) unlock('dual');
  const h = new Date(now).getHours();
  if (working.length && h >= 2 && h < 5) unlock('night_owl');
  if (working.some(s => s.turnStartedAt && now - s.turnStartedAt > 30 * 60e3)) unlock('marathon');
}

function sampleHistory(now, sessions) {
  const last = game.history[game.history.length - 1];
  if (last && now - last.t < 30e3) return;
  const w = sessions.filter(s => s.state === 'working');
  game.history.push({ t: now, c: w.filter(s => s.agent === 'claude').length, x: w.filter(s => s.agent === 'codex').length, q: sessions.filter(s => s.state === 'waiting').length });
  const cutoff = now - 24 * 3600e3;
  while (game.history.length && game.history[0].t < cutoff) game.history.shift();
  dirty = true;
}

function gameSummary(now) {
  const lv = pilotLevel(game.xp);
  const cutoff = now - 3 * 3600e3;
  return {
    xp: game.xp, level: lv.level, progress: lv.progress, next: lv.next,
    totals: { turns: game.turns, tools: game.tools, subagents: game.subagents },
    today: game.today, combo: now - game.combo.last < 5 * 60e3 ? game.combo.count : 0,
    achievements: ACHIEVEMENTS.map(a => ({ ...a, at: game.achievements[a.id] || null })),
    history: game.history.filter(h => h.t >= cutoff),
  };
}

// ---------- 状態の集約と配信 ----------

let snapshot = { at: 0, sessions: [], usage: {}, game: null };
let events = [];
const clients = new Set();
let lastStates = new Map();
const stateSince = new Map();
const fileOf = new Map();

function pushEvent(ev) {
  ev.at = Date.now();
  events.push(ev);
  if (events.length > 300) events = events.slice(-300);
  dirty = true;
  broadcast('event', ev);
}

function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

const STATE_LABEL = { working: '作業開始', waiting: '許可・返事待ち', idle: 'ターン完了', ended: '終了', error: 'エラー', interrupted: '中断', stale: '応答なし' };

function tick() {
  const now = Date.now();
  let sessions = [];
  try { sessions = sessions.concat(collectClaude(now)); } catch (e) { console.error('claude', e); }
  try { sessions = sessions.concat(collectCodex(now)); } catch (e) { console.error('codex', e); }
  sessions.sort((a, b) => b.lastActivity - a.lastActivity);
  try { award(now, sessions); } catch (e) { console.error('award', e); }
  sampleHistory(now, sessions);
  const next = new Map();
  game.dismissed = game.dismissed || {};
  for (const s of sessions) {
    // ダッシュボードで「完了」にしたセッションは、新しい動きがあるまで終了扱い
    const d = game.dismissed[s.id];
    if (d && s.lastActivity > d + 3000 && s.state !== 'ended') { delete game.dismissed[s.id]; dirty = true; }
    else if (d) { s.state = 'ended'; s.detail = '完了にしました'; s.dismissed = true; }
    // 開いたまま長時間放置されているセッションは終了扱い
    if (s.state === 'idle' && now - s.lastActivity > 12 * 3600e3) { s.state = 'ended'; s.detail = '長時間動きなし'; }
    next.set(s.id, s.state);
    const prev = lastStates.get(s.id);
    const since = stateSince.get(s.id);
    if (!since || since.state !== s.state) stateSince.set(s.id, { state: s.state, at: prev ? now : Math.min(now, s.lastActivity || now) });
    if (prev === 'waiting' && s.state === 'working' && since && now - since.at < 30e3) unlock('quick');
    if (lastStates.size && prev !== s.state) {
      pushEvent({ agent: s.agent, sessionId: s.sessionId, kind: 'state', from: prev || 'new', to: s.state,
        text: `${s.title} → ${STATE_LABEL[s.state] || s.state}` });
    }
    s.stateSince = stateSince.get(s.id).at;
    const sx = game.sessionXp[s.id];
    s.xp = sx ? sx.xp : 0;
    s.level = botLevel(s.xp).level;
    s.levelProgress = botLevel(s.xp).progress;
    fileOf.set(s.id, s._file);
    delete s._events; delete s._file;
  }
  lastStates = next;
  const usage = { claude: claudeUsage(), codex: codexUsage(sessions) };
  const gs = gameSummary(now);
  const json = JSON.stringify({ sessions, usage, gs });
  if (json !== snapshot.json) {
    snapshot = { at: now, sessions, usage, game: gs, json };
    broadcast('snapshot', { at: now, sessions, usage, game: gs });
  }
}

let tickTimer = null;
function scheduleTick() {
  if (tickTimer) return;
  tickTimer = setTimeout(() => { tickTimer = null; tick(); }, 150);
}

// ---------- HTTP ----------

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && url.pathname.startsWith('/hook/')) {
    const agent = url.pathname.slice(6);
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      try { applyHook(agent === 'codex' ? 'codex' : 'claude', JSON.parse(body)); } catch { }
      // 空のJSONは「判断なし」なので Claude/Codex の動作には影響しない
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/dismiss') {
    // 他サイトからの書き込みを防ぐため独自ヘッダを必須にする (ブラウザはプリフライトで止める)
    if (req.headers['x-agent-deck'] !== '1') { res.writeHead(403); res.end(); return; }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      try {
        const { id, undo } = JSON.parse(body);
        game.dismissed = game.dismissed || {};
        if (undo) delete game.dismissed[id]; else if (snapshot.sessions.some(s => s.id === id)) game.dismissed[id] = Date.now();
        dirty = true;
        scheduleTick();
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
      } catch { res.writeHead(400); res.end(); }
    });
    return;
  }
  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ at: snapshot.at, sessions: snapshot.sessions, usage: snapshot.usage, game: snapshot.game, events: events.slice(-50) }));
    return;
  }
  if (url.pathname === '/api/timeline') {
    const t = timelineFor(url.searchParams.get('id') || '');
    res.writeHead(t ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(t || { error: 'not found' }));
    return;
  }
  if (url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: snapshot\ndata: ${JSON.stringify({ at: snapshot.at, sessions: snapshot.sessions, usage: snapshot.usage, game: snapshot.game })}\n\n`);
    res.write(`event: history\ndata: ${JSON.stringify(events.slice(-80))}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR) || !safeStat(file) || safeStat(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

loadState();
tick();
setInterval(tick, POLL_MS);
setInterval(saveState, 15000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { dirty = true; saveState(); process.exit(0); });
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `ポート ${PORT} は使用中です (既に起動していませんか?)` : e); process.exit(1); });
server.listen(PORT, HOST, () => {
  console.log(`Agent Deck → http://${HOST}:${PORT}`);
  console.log(`  Claude: ${CLAUDE_DIR}`);
  console.log(`  Codex : ${CODEX_DIR}`);
});
