import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { cleanAccount, bucketOf, percentOf } from './domain.js';

export class AdapterError extends Error {
  constructor(message, code = 'unavailable') { super(message); this.code = code; }
}
export function codexRPCError(error) {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  const auth = /\b401\b|unauthorized|not authenticated|authentication required|refresh token.*(used|expired|invalid)|not logged in/.test(message);
  const limited = /\b429\b|rate.?limit|too many requests/.test(message);
  const result = new AdapterError(limited ? 'Codex 暂时限流，保留上次额度并稍后重试' : auth ? 'Codex 官方登录已失效，请在官方客户端确认登录后重试' : 'Codex 额度查询暂时失败，保留上次值；可稍后刷新', limited ? 'rate_limit' : auth ? 'auth' : 'unavailable');
  // Diagnostic categories are allowlisted; the original RPC message is never exposed.
  result.diagnostic = { rpcCode: Number.isInteger(error?.code) ? error.code : null, auth, limited, network: /network|fetch|connect|timed? ?out|request.*failed/.test(message), refreshConflict: /refresh token.*used/.test(message) };
  return result;
}
function iso(value) {
  if (value == null) return null;
  const date = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function baseSnapshot(account, source, pools, now = Date.now()) {
  if (!pools.some(p => percentOf(p) !== null)) throw new AdapterError('来源没有返回可用的额度比例，请核对账号与客户端版本', 'schema');
  const coverage = Object.fromEntries(['h5', 'week', 'month'].map(b => [b, pools.some(p => bucketOf(p) === 'other') ? 'unknown' : pools.some(p => bucketOf(p) === b) ? 'unknown' : 'not_applicable']));
  return cleanAccount({ ...account, source, observedAt: new Date(now).toISOString(), pools, coverage, connection: { type: source, status: 'ready' } });
}
export function decodeCodex(account, limits, accountInfo = {}, now = Date.now()) {
  const map = limits?.rateLimitsByLimitId;
  const groups = map && typeof map === 'object' && Object.keys(map).length ? Object.entries(map) : limits?.rateLimits ? [[limits.rateLimits.limitId || 'codex', limits.rateLimits]] : [];
  const pools = [];
  for (const [group, value] of groups.slice(0, 12)) {
    if (!value || typeof value !== 'object') continue;
    for (const position of ['primary', 'secondary']) {
      const w = value[position]; if (!w) continue;
      pools.push({ id: `${group}-${position}`, label: value.limitName || group, scope: groups.length > 1 ? (value.limitName || group) : '', windowMinutes: w.windowDurationMins, usedPercent: w.usedPercent, resetsAt: iso(w.resetsAt), boundaryKind: 'reset' });
    }
  }
  const out = baseSnapshot(account, 'codex', pools, now);
  if (typeof accountInfo?.account?.planType === 'string') out.plan = accountInfo.account.planType.slice(0, 60);
  return out;
}
export function decodeKimi(account, envelope, now = Date.now()) {
  if (envelope?.code !== 0 || envelope.data?.kind !== 'ok') throw new AdapterError('Kimi 未返回成功的额度结果；请检查本地服务登录状态', 'auth');
  const quota = envelope.data.quota;
  const pools = [];
  // Kimi Code 0.36.x returns summary/limits, while newer combined plans return quota.usages.
  if (envelope.data.summary || Array.isArray(envelope.data.limits)) {
    for (const [index, w] of [envelope.data.summary, ...(envelope.data.limits || [])].entries()) {
      if (!w) continue;
      const { duration, unit } = w.window || {};
      const bucket = unit === 'hour' && duration === 5 ? 'h5' : (unit === 'week' && duration === 1) || (unit === 'day' && duration === 7) ? 'week' : unit === 'month' && duration === 1 ? 'month' : 'other';
      pools.push({ id: `code-${index}`, bucket, label: 'Kimi Code', used: w.used, limit: w.limit, resetsAt: iso(w.reset_at), boundaryKind: 'reset' });
    }
  }
  for (const [name, bucket, label] of [['limit5h', 'h5', '5 小时'], ['limit7d', 'week', '周'], ['monthTotal', 'month', '总池'], ['monthCode', 'month', 'Code']]) {
    const w = quota?.usages?.[name];
    if (w) pools.push({ id: name, bucket, label, scope: bucket === 'month' ? label : '', usedRatio: w.usedRatio, resetsAt: iso(w.resetAt), boundaryKind: 'reset' });
  }
  const out = baseSnapshot(account, 'kimi', pools, now);
  if (!quota?.usages) {
    out.coverage.month = 'unknown';
    out.connection.message = '已读取 Kimi Code；本机客户端未返回 Work / 综合会员月度池。';
  }
  const extra = quota?.extraUsage;
  if (typeof extra?.balanceCents === 'number' && extra.balanceCents >= 0) out.pools.push({ id: 'wallet', label: '额外余额', bucket: 'other', remaining: extra.balanceCents / 100, unit: typeof extra.currency === 'string' ? extra.currency.slice(0, 8) : '', boundaryKind: 'unknown', resetsAt: null });
  return cleanAccount(out);
}

// Import only a selected provider/account. Raw payloads and identity fields never reach storage.
export function decodeCodexBar(account, input, now = Date.now()) {
  const aliases = { chatgpt: ['codex'], cursor: ['cursor'], muse: ['museai'], grokbot: ['grokbot', 'grok-bot'], zcode: ['zai', 'zcode'], kimi: ['kimi', 'kimik2'], minimax: ['minimax'], gemini: ['gemini-app', 'gemini-web'], claude: ['claude'], opencode: ['opencodego'], youmind: ['youmind'] };
  const rows = Array.isArray(input) ? input : Array.isArray(input?.providers) ? input.providers : [input];
  const matches = rows.filter(r => aliases[account.providerId]?.includes(r?.provider || r?.id));
  if (matches.length !== 1) throw new AdapterError('请导入与该产品匹配的单账户 JSON。Gemini CLI 数据不能代替 Gemini 网页会员。', 'schema');
  const row = matches[0];
  if (row.error || row.accounts?.length > 1) throw new AdapterError('来源包含错误或多个账户，请先导出单个成功账户', 'schema');
  const pools = [];
  const windows = row.windows || row.usage?.windows;
  if (Array.isArray(windows)) {
    windows.slice(0, 24).forEach((w, i) => {
      const label = String(w.label || '额度');
      let bucket = 'other';
      if (/5\s*(h|hours?|小时)/i.test(label)) bucket = 'h5';
      if (/weekly|week|周|7\s*天/i.test(label) || w.kind === 'weekly') bucket = 'week';
      if (/monthly|month|月/i.test(label)) bucket = 'month';
      pools.push({ id: `${w.limitId || 'window'}-${i}`, label, bucket, windowMinutes: w.windowMinutes, remainingPercent: w.remainingPercent, usedPercent: w.usedPercent, used: w.used, limit: w.limit, remaining: w.remaining, resetsAt: iso(w.resetAt || w.resetsAt), boundaryKind: w.boundaryKind || 'reset' });
    });
  } else {
    for (const name of ['primary', 'secondary', 'tertiary']) {
      const w = row.usage?.[name]; if (!w) continue;
      pools.push({ id: name, label: row.rateWindowLabels?.[name] || '额度', windowMinutes: w.windowMinutes, usedPercent: w.usedPercent, resetsAt: iso(w.resetsAt), boundaryKind: 'reset' });
    }
  }
  const stamp = row.updatedAt || row.usage?.updatedAt || input?.generatedAt;
  if (!stamp || !Number.isFinite(Date.parse(stamp)) || Date.parse(stamp) > now + 60_000) throw new AdapterError('导入数据需要有效的原始更新时间，不能用导入时间冒充采集时间', 'schema');
  const out = baseSnapshot(account, 'codexbar', pools, Date.parse(stamp));
  out.plan = String(row.identity?.plan || row.usage?.identity?.loginMethod || account.plan || '').slice(0, 60);
  return out;
}

export async function resolveCodex() {
  const override = process.env.QUOTA_CODEX_BIN;
  const candidates = override ? [override] : (process.env.PATH || '').split(':').filter(isAbsolute).map(dir => join(dir, 'codex'));
  for (const candidate of candidates) {
    if (!isAbsolute(candidate)) continue;
    try { await access(candidate, constants.X_OK); return candidate; } catch {}
  }
  throw new AdapterError('未找到 Codex CLI。请先安装并通过官方客户端登录。', 'missing');
}
export async function fetchCodex(account) {
  const executable = await resolveCodex();
  const env = { HOME: homedir(), PATH: (process.env.PATH || '').split(':').filter(isAbsolute).join(':'), LANG: 'en_US.UTF-8' };
  for (const key of ['CODEX_HOME', 'TMPDIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS']) if (process.env[key]) env[key] = process.env[key];
  const child = spawn(executable, ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'pipe'], env, shell: false });
  const pending = new Map(); let buffer = '', bytes = 0, nextId = 0, closed = false;
  const fail = () => { closed = true; for (const p of pending.values()) p.reject(new AdapterError('Codex 官方客户端未能完成额度查询，请检查登录与网络', 'unavailable')); pending.clear(); };
  child.on('error', fail); child.on('exit', fail); child.stdin.on('error', fail); child.stderr.on('data', () => {});
  child.stdout.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) { fail(); child.kill(); return; }
    buffer += chunk.toString();
    while (buffer.includes('\n')) {
      const pos = buffer.indexOf('\n'), line = buffer.slice(0, pos); buffer = buffer.slice(pos + 1);
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); msg.error ? p.reject(codexRPCError(msg.error)) : p.resolve(msg.result); }
      else if (msg.id != null && msg.method && !child.stdin.destroyed) child.stdin.write(JSON.stringify({ id: msg.id, error: { code: -32601, message: 'Read-only quota client' } }) + '\n');
    }
  });
  function rpc(method, params) {
    if (closed) return Promise.reject(new AdapterError('Codex 客户端已退出'));
    return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ method, id, params }) + '\n'); });
  }
  const deadline = setTimeout(() => { fail(); child.kill(); }, 25_000);
  try {
    await rpc('initialize', { clientInfo: { name: 'quota_desk_local', title: 'Quota Desk local personal dashboard', version: '0.1.0' } });
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    const info = await rpc('account/read', { refreshToken: false });
    const limits = await rpc('account/rateLimits/read', {});
    return decodeCodex(account, limits, info);
  } finally {
    clearTimeout(deadline); child.stdin.end(); child.kill('SIGTERM');
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 1000); killTimer.unref(); child.once('exit', () => clearTimeout(killTimer));
  }
}
