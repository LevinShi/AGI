import { AdapterError, baseSnapshot, fetchCodex } from './adapters.mjs';
import { cursorRequest } from './local-clients.mjs';
import { minimaxPayload } from './minimax-client.mjs';
import { zcodePayload } from './zcode-client.mjs';
import { fetchKimiAccount } from './kimi-membership.mjs';
import { fetchYouMind } from './youmind-client.mjs';
import { fetchMuse } from './muse-client.mjs';
import { finite } from './domain.js';

const date = value => {
  if (value == null || value === '') return null;
  const parsed = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};
export function decodeCursor(account, data, now = Date.now()) {
  if (data.membershipType === 'enterprise' || Object.keys(data.teamUsage || {}).length) throw new AdapterError('当前适配器仅验证个人 Cursor 订阅，团队额度请在官方用量页查看', 'schema');
  const plan = data.individualUsage?.plan, pools = [];
  if (plan?.enabled !== true) throw new AdapterError('Cursor 没有返回个人订阅额度', 'schema');
  for (const [key, label] of [['totalPercentUsed', '整体'], ['autoPercentUsed', 'Cursor 模型'], ['apiPercentUsed', '第三方模型']]) {
    if (finite(plan[key])) pools.push({ id: key, bucket: 'month', label, scope: label, usedPercent: plan[key], resetsAt: date(data.billingCycleEnd), boundaryKind: 'reset' });
  }
  // Do not average model percentages or mix a third-party dollar cap with the overall percentage.
  if (!pools.length && finite(plan.used) && plan.limit > 0) pools.push({ id: 'included', bucket: 'month', label: '套餐额度', used: plan.used, limit: plan.limit, resetsAt: date(data.billingCycleEnd), boundaryKind: 'reset' });
  return { ...baseSnapshot(account, 'cursor', pools, now), plan: typeof data.membershipType === 'string' ? data.membershipType.slice(0, 60) : account.plan };
}
export function decodeGrok(account, data, now = Date.now()) {
  const hasLimit = typeof data.includedLimitZero === 'boolean' ? !data.includedLimitZero : data.hasNonZeroIncludedLimit === true;
  const trial = !hasLimit && Date.parse(data.sandTrialExpiresAt) > now;
  if ((!hasLimit && !trial) || !finite(data.usagePercent)) throw new AdapterError('该 Cursor 登录未返回 Grok Bot 订阅额度，请核对 Grok Bot 使用的账户', 'schema');
  const pools = [{ id: 'grok', bucket: trial ? 'other' : 'week', label: trial ? '试用额度' : 'Grok Bot', usedPercent: data.usagePercent, resetsAt: date(trial ? data.sandTrialExpiresAt : data.nextResetTimestampUtc), boundaryKind: trial ? 'expiry' : 'reset' }];
  return { ...baseSnapshot(account, 'grokbot', pools, now), plan: typeof data.grokPlanLabel === 'string' ? data.grokPlanLabel.slice(0, 60) : account.plan };
}
export function decodeMiniMax(account, { quota, plan }, now = Date.now()) {
  if (quota?.base_resp?.status_code !== 0) throw new AdapterError('MiniMax 未返回成功的额度结果', 'schema');
  const primary = quota.model_remains?.[0], pools = [];
  for (const [prefix, bucket, reset] of [['current_interval', 'h5', 'end_time'], ['current_weekly', 'week', 'weekly_end_time']]) {
    if (!primary || primary[`${prefix}_status`] === 3) continue;
    const direct = primary[`${prefix}_remaining_percent`], total = primary[`${prefix}_total_count`], remaining = primary[`${prefix}_usage_count`];
    const percent = finite(direct) ? direct : total > 0 && finite(remaining) ? remaining / total * 100 : null;
    if (percent !== null) pools.push({ id: prefix, bucket, label: 'Token Plan', remainingPercent: percent, resetsAt: date(primary[reset]), boundaryKind: 'reset' });
  }
  const result = baseSnapshot(account, 'minimax', pools, now);
  result.plan = plan || account.plan;
  return result;
}
export function decodeZCode(account, payload, now = Date.now()) {
  if (payload?.success !== true || payload.code !== 200 || !Array.isArray(payload.data?.limits)) throw new AdapterError('智谱没有返回有效额度', 'schema');
  const pools = [];
  for (const [index, raw] of payload.data.limits.entries()) {
    if (!['TOKENS_LIMIT', 'CREDIT_LIMIT', 'TIME_LIMIT'].includes(raw.type)) continue;
    const minutes = ({ 1: 1440, 3: 60, 5: 1, 6: 10080 }[raw.unit] || 0) * raw.number;
    const bucket = minutes === 300 ? 'h5' : minutes === 10080 ? 'week' : 'other';
    const pool = { id: `quota-${index}`, bucket, label: raw.type === 'TIME_LIMIT' ? 'MCP' : 'Coding Plan', windowMinutes: minutes || undefined, boundaryKind: 'reset', resetsAt: date(raw.nextResetTime) };
    if (raw.usage > 0 && finite(raw.remaining)) { pool.remaining = raw.remaining; pool.limit = raw.usage; }
    else if (raw.usage > 0 && finite(raw.currentValue)) { pool.used = raw.currentValue; pool.limit = raw.usage; }
    else if (finite(raw.percentage)) pool.usedPercent = raw.percentage;
    if (bucket === 'h5' && Date.parse(pool.resetsAt) > now + 301 * 60000) pool.resetsAt = null;
    pools.push(pool);
  }
  const result = baseSnapshot(account, 'zcode', pools, now);
  const plan = payload.data.planName || payload.data.level;
  result.plan = typeof plan === 'string' ? plan.slice(0, 60) : account.plan;
  return result;
}
export const providerForConnector = { codex: 'chatgpt', kimi: 'kimi', cursor: 'cursor', grokbot: 'grokbot', minimax: 'minimax', zcode: 'zcode', youmind: 'youmind', muse: 'muse' };
export const liveAdapters = {
  codex: fetchCodex,
  youmind: fetchYouMind,
  muse: fetchMuse,
  kimi: fetchKimiAccount,
  cursor: async account => decodeCursor(account, await cursorRequest('/api/usage-summary')),
  grokbot: async account => decodeGrok(account, await cursorRequest('/api/dashboard/get-sand-usage-status', 'POST')),
  minimax: async account => decodeMiniMax(account, await minimaxPayload()),
  zcode: async account => decodeZCode(account, await zcodePayload()),
};
