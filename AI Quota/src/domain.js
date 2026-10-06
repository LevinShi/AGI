// Provider-independent accounting rules. No I/O, credentials or browser dependencies.
export const BUCKETS = ['h5', 'week', 'month'];
export function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
export function percentOf(pool) {
  const values = [];
  if (pool.remainingPercent != null) {
    if (!finite(pool.remainingPercent) || pool.remainingPercent < 0 || pool.remainingPercent > 100) return null;
    values.push(pool.remainingPercent);
  }
  for (const [key, scale] of [['usedPercent', 1], ['usedRatio', 100]]) {
    if (pool[key] != null) {
      if (!finite(pool[key]) || pool[key] < 0) return null;
      values.push(Math.max(0, 100 - pool[key] * scale));
    }
  }
  if (pool.limit != null && finite(pool.limit) && pool.limit > 0) {
    if (pool.remaining != null) {
      if (!finite(pool.remaining) || pool.remaining < 0 || pool.remaining > pool.limit) return null;
      values.push(100 * pool.remaining / pool.limit);
    }
    if (pool.used != null) {
      if (!finite(pool.used) || pool.used < 0) return null;
      values.push(Math.max(0, 100 * (1 - pool.used / pool.limit)));
    }
  }
  if (!values.length || values.some(n => Math.abs(n - values[0]) > 0.5)) return null;
  return values[0];
}
export function bucketOf(pool) {
  if (BUCKETS.includes(pool.bucket)) return pool.bucket;
  if (pool.windowMinutes === 300) return 'h5';
  if (pool.windowMinutes === 10080) return 'week';
  if (['calendar_month', 'billing_month', 'rolling_month'].includes(pool.period)) return 'month';
  return 'other';
}
export function formatPercent(n) {
  if (!finite(n)) return '未知';
  if (n > 0 && n < 0.1) return '<0.1%';
  if (n < 100 && n > 99.9) return '>99.9%';
  return `${Math.round(n * 100) / 100}%`;
}
export function timeLabel(iso, now = Date.now()) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '时间未知';
  const mins = Math.ceil((Date.parse(iso) - now) / 60000);
  if (mins <= 0) return '待刷新';
  if (mins < 60) return `${mins} 分钟后`;
  if (mins < 1440) return `${Math.floor(mins / 60)}小时${mins % 60 ? `${mins % 60}分` : ''}后`;
  return `${Math.floor(mins / 1440)}天${Math.floor(mins % 1440 / 60) ? `${Math.floor(mins % 1440 / 60)}小时` : ''}后`;
}
export function ageLabel(iso, now = Date.now()) {
  if (!iso) return '尚未读取';
  const mins = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  if (!Number.isFinite(mins)) return '时间未知';
  if (!mins) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  if (mins < 1440) return `${Math.floor(mins / 60)} 小时前`;
  return `${Math.floor(mins / 1440)} 天前`;
}
export function beijingTime(iso, full = false) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '未提供';
  const d = new Date(Date.parse(iso) + 8 * 3600_000);
  const parts = d.toISOString();
  return `${full ? parts.slice(0, 10) : parts.slice(5, 10).replace('-', '/')} ${parts.slice(11, 16)}${full ? ' 北京时间' : ''}`;
}
export function beijingInput(iso) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '';
  return new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 16);
}
export function fromBeijingInput(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('请填写有效的北京时间');
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime()) || beijingInput(date.toISOString()) !== value) throw new Error('请填写有效的北京时间');
  return date.toISOString();
}
export function projectAccount(account, now = Date.now()) {
  const observed = Date.parse(account.observedAt);
  // Daily snapshots remain valid for one day; crossing a quota reset still marks that pool due.
  const ttl = 24 * 3600_000;
  const stale = !!account.observedAt && (!Number.isFinite(observed) || now - observed > ttl || observed > now + 60_000 || ['error', 'auth_required', 'disconnected', 'connecting'].includes(account.connection?.status));
  const pools = (account.pools || []).map(p => {
    const percent = percentOf(p);
    const boundaryPassed = p.resetsAt && Date.parse(p.resetsAt) <= now;
    const freshness = boundaryPassed ? 'awaiting_refresh' : stale ? 'stale' : 'current';
    return { ...p, bucket: bucketOf(p), percent, freshness, low: percent !== null && percent < 20 && freshness === 'current' };
  });
  const cells = Object.fromEntries(BUCKETS.map(bucket => {
    const items = pools.filter(p => p.bucket === bucket);
    return [bucket, { state: items.length ? 'reported' : account.coverage?.[bucket] === 'not_applicable' ? 'not_applicable' : 'unknown', pools: items }];
  }));
  // Earliest reset concerns one quota pool, never full-account restoration.
  const resets = pools.filter(p => p.boundaryKind !== 'expiry' && p.resetsAt && Number.isFinite(Date.parse(p.resetsAt))).sort((a, b) => Date.parse(a.resetsAt) - Date.parse(b.resetsAt));
  return { ...account, cells, pools, extraPools: pools.filter(p => p.bucket === 'other'), stale, low: pools.some(p => p.low), nextReset: resets[0] || null, hasUnknown: BUCKETS.some(b => cells[b].state === 'unknown' || cells[b].pools.some(p => p.percent === null)), needsAttention: stale || pools.some(p => p.low || p.freshness === 'awaiting_refresh') || ['error', 'auth_required'].includes(account.connection?.status) };
}

function shortText(value, max = 100) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').slice(0, max) : ''; }
function isoTime(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('时间格式无效');
  return new Date(value).toISOString();
}
export function cleanAccount(input) {
  if (!input || typeof input !== 'object' || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.id || '') || !/^[a-z]{1,30}$/.test(input.providerId || '')) throw new Error('账户标识无效');
  if (!Array.isArray(input.pools) || input.pools.length > 32) throw new Error('额度池数量无效');
  const seen = new Set();
  const pools = input.pools.map((p, i) => {
    if (!p || typeof p !== 'object') throw new Error('额度格式无效');
    const id = shortText(p.id || `pool-${i}`);
    if (seen.has(id)) throw new Error('额度池标识重复');
    seen.add(id);
    const out = { id, label: shortText(p.label || '额度'), bucket: bucketOf(p), scope: shortText(p.scope), unit: shortText(p.unit, 20), resetsAt: isoTime(p.resetsAt), boundaryKind: ['reset', 'expiry', 'unknown'].includes(p.boundaryKind) ? p.boundaryKind : 'unknown' };
    if (p.period) out.period = shortText(p.period, 30);
    for (const key of ['remainingPercent', 'usedPercent', 'usedRatio', 'remaining', 'used', 'limit', 'windowMinutes']) {
      if (p[key] == null) continue;
      if (!finite(p[key]) || p[key] < 0 || (key === 'remainingPercent' && p[key] > 100)) throw new Error('额度数值应是有效的非负数字，余量百分比须在 0–100 之间');
      out[key] = p[key];
    }
    return out;
  });
  const coverage = Object.fromEntries(BUCKETS.map(b => [b, input.coverage?.[b] === 'not_applicable' ? 'not_applicable' : 'unknown']));
  const conn = input.connection || {};
  return { id: input.id, providerId: input.providerId, alias: shortText(input.alias || '主账户', 40), plan: shortText(input.plan, 60), pinned: input.pinned === true, source: ['none', 'manual', 'codex', 'kimi', 'cursor', 'grokbot', 'minimax', 'zcode', 'youmind', 'muse', 'codexbar', 'demo'].includes(input.source) ? input.source : 'none', observedAt: isoTime(input.observedAt), pools, coverage, connection: { type: ['none', 'manual', 'codex', 'kimi', 'cursor', 'grokbot', 'minimax', 'zcode', 'youmind', 'muse', 'codexbar'].includes(conn.type) ? conn.type : 'none', status: ['disconnected', 'connecting', 'ready', 'error', 'auth_required', 'paused'].includes(conn.status) ? conn.status : 'disconnected', message: shortText(conn.message, 160) } };
}
