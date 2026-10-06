import { AdapterError, baseSnapshot } from './adapters.mjs';
import { finite } from './domain.js';
import { runQuotaBrowser } from './tabbit-quota.mjs';

// This endpoint and field casing are from the official YouMind desktop bundle.
// The browser holds the login. Only these quota fields cross the local bridge.
const YOUMIND_PROGRAM = `
const response = await page.fetch("https://youmind.com/api/v1/credit/getCreditAccount", {
  method: "POST", headers: { "Content-Type": "application/json", "x-use-camel-case": "true" },
  body: "{}", as: "json", timeoutMs: 15000, maxBytes: 32768,
});
if (!response.ok) return { quotaError: [401, 403].includes(response.status) ? "auth" : response.status === 429 ? "rate_limit" : "network" };
const fields = ["monthlyBalance", "monthlyQuota", "dailyBalance", "dailyLimit", "dailyUsed", "permanentBalance", "bonusBalance", "currentPeriodStart", "currentPeriodEnd", "refreshCycleAnchor", "productTier", "subTier"];
const data = Object.fromEntries(fields.filter(key => Object.hasOwn(response.json || {}, key)).map(key => [key, response.json[key]]));
return { data, observedAt: new Date().toISOString() };
`;

function iso(value) {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function decodeYouMind(account, payload, now = Date.now()) {
  const data = payload?.data;
  if (!data || typeof data !== 'object') throw new AdapterError('YouMind 未返回有效积分账户', 'schema');
  const pools = [];
  if (data.productTier === 'free') {
    // Daily grants cannot be converted into a 5-hour/week/month subscription.
    if (finite(data.dailyBalance) && data.dailyLimit > 0) pools.push({ id: 'daily', bucket: 'other', label: '每日积分', remaining: data.dailyBalance, limit: data.dailyLimit, unit: '积分', windowMinutes: 1440, resetsAt: null, boundaryKind: 'unknown' });
  } else if (finite(data.monthlyBalance) && finite(data.monthlyQuota) && data.monthlyQuota > 0 && data.monthlyBalance >= 0) {
    pools.push({ id: 'monthly', bucket: 'month', label: '套餐积分', scope: '套餐积分', remaining: data.monthlyBalance, used: Math.max(0, data.monthlyQuota - data.monthlyBalance), limit: data.monthlyQuota, unit: '积分', resetsAt: iso(data.currentPeriodEnd), boundaryKind: 'reset' });
  }
  if (!pools.length) throw new AdapterError('YouMind 没有返回可用的套餐积分总额，不能计算剩余百分比', 'schema');
  const observed = Date.parse(payload.observedAt);
  if (!Number.isFinite(observed) || observed > now + 60_000) throw new AdapterError('YouMind 额度缺少有效读取时间', 'schema');
  const result = baseSnapshot(account, 'youmind', pools, observed);
  result.plan = ({ pro: 'Pro', max: 'Max', free: 'Free' })[data.productTier] || account.plan;
  // Permanent and bonus credits are separate balances, not part of the monthly
  // denominator. Never add them to monthlyBalance or assign a monthly reset.
  for (const [key, label] of [['permanentBalance', '永久积分'], ['bonusBalance', '奖励积分']]) {
    if (finite(data[key]) && data[key] > 0) result.pools.push({ id: key, bucket: 'other', label, remaining: data[key], unit: '积分', resetsAt: null, boundaryKind: 'unknown' });
  }
  result.connection = { type: 'youmind', status: 'ready', message: '使用 Tabbit 中的官方登录读取套餐积分；总额与官网一致。' };
  return result;
}

export async function fetchYouMind(account) {
  return decodeYouMind(account, await runQuotaBrowser('youmind', YOUMIND_PROGRAM));
}
