import { homedir } from 'node:os';
import { join } from 'node:path';
import { AdapterError, baseSnapshot } from './adapters.mjs';
import { runQuotaBrowser } from './tabbit-quota.mjs';
import { bucketOf, percentOf } from './domain.js';
import { fetchLocalKimi, requestJSON } from './local-clients.mjs';

// The official Kimi web client uses this read-only Connect RPC. Its public
// GetSubscriptionStats schema distinguishes the combined subscription balance
// from the Code 5-hour / 7-day rate limits. The Coding API alone does not return
// the combined monthly balance for every account.
const MEMBERSHIP_URL = 'https://www.kimi.com/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats';
const field = (value, camel, snake) => value?.[camel] ?? value?.[snake];
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

export function validateKimiDesktopToken(value, now = Date.now()) {
  if (typeof value !== 'string' || value.length > 16_384 || /[\r\n\s]/.test(value)) return false;
  try {
    const claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
    return number(claims.exp) && claims.exp * 1000 > now + 60_000;
  } catch { return false; }
}

async function desktopToken() {
  let db;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    db = new DatabaseSync(join(homedir(), 'Library/Application Support/kimi-desktop/Cookies'), { readOnly: true });
    // Read one allowlisted first-party credential from Kimi's own app. Never scan
    // a browser profile, decrypt a keychain item, copy this database, or persist it.
    const token = db.prepare('SELECT value FROM cookies WHERE host_key = ? AND name = ?')
      .get('www.kimi.com', 'kimi-auth')?.value;
    if (!validateKimiDesktopToken(token)) throw new Error();
    return token;
  } catch {
    throw new AdapterError('Kimi 综合会员登录不可用，请打开并登录 Kimi 官方桌面客户端后重试', 'auth');
  } finally { db?.close(); }
}

export function decodeKimiMembership(account, payload, now = Date.now()) {
  const balance = field(payload, 'subscriptionBalance', 'subscription_balance');
  const usedRatio = field(balance, 'amountUsedRatio', 'amount_used_ratio');
  // This optional field must be explicitly present. Missing does not mean zero.
  if (!balance || balance.type !== 'SUBSCRIPTION' || balance.feature !== 'FEATURE_OMNI' || !number(usedRatio)) {
    throw new AdapterError('Kimi 未返回综合会员月度总量，请在官方会员页面核对套餐', 'schema');
  }
  const pools = [{
    id: 'month-total', bucket: 'month', label: '月度总量', scope: 'Kimi + Code',
    usedRatio, resetsAt: iso(field(balance, 'expireTime', 'expire_time')),
    period: 'billing_month', boundaryKind: 'reset'
  }];
  for (const [camel, snake, bucket, label] of [
    ['ratelimit5h', 'ratelimit_5h', 'h5', 'Kimi'],
    ['ratelimitCode5h', 'ratelimit_code_5h', 'h5', 'Kimi Code'],
    ['ratelimit7d', 'ratelimit_7d', 'week', 'Kimi'],
    ['ratelimitCode7d', 'ratelimit_code_7d', 'week', 'Kimi Code']
  ]) {
    const rate = field(payload, camel, snake);
    if (rate?.enabled !== true) continue;
    // ratio is a non-optional protobuf scalar: omission in an enabled window is
    // its documented zero value. This differs from optional amountUsedRatio.
    const ratio = rate.ratio ?? 0;
    if (!number(ratio)) throw new AdapterError('Kimi 返回了无效的周期额度', 'schema');
    pools.push({ id: camel, bucket, label, scope: label, usedRatio: ratio,
      resetsAt: iso(field(rate, 'resetTime', 'reset_time')), boundaryKind: 'reset' });
  }
  const result = baseSnapshot(account, 'kimi', pools.map(pool => ({ ...pool, observedAt: new Date(now).toISOString() })), now);
  result.connection.message = '已读取 Kimi 综合会员月度总量（含 Code），以及可用的周期额度。';
  return result;
}

async function fetchDesktopKimiMembership(account) {
  const token = await desktopToken();
  const payload = await requestJSON(MEMBERSHIP_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
      'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'x-msh-platform': 'web' },
    body: JSON.stringify({ mute_notice: true })
  });
  return decodeKimiMembership(account, payload);
}

// The web session stays in its browser. Only the allowlisted quota fields leave it.
const KIMI_MEMBERSHIP_PROGRAM = `
return await page.evaluate(async () => {
  const token = localStorage.getItem('access_token');
  if (!token || /[\\r\\n]/.test(token)) return { quotaError: 'auth' };
  const response = await fetch('/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json',
      'Connect-Protocol-Version': '1', 'x-msh-platform': 'web' }, body: JSON.stringify({ mute_notice: true }),
    redirect: 'error', signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) return { quotaError: [401,403].includes(response.status) ? 'auth' : response.status === 429 ? 'rate_limit' : 'network' };
  const text = await response.text();
  if (text.length > 32768) return { quotaError: 'schema' };
  const body = JSON.parse(text), data = {};
  for (const key of ['subscriptionBalance','subscription_balance','ratelimit5h','ratelimit_5h','ratelimitCode5h','ratelimit_code_5h','ratelimit7d','ratelimit_7d','ratelimitCode7d','ratelimit_code_7d']) {
    const value = body[key]; if (!value || typeof value !== 'object') continue;
    data[key] = Object.fromEntries(['amountUsedRatio','amount_used_ratio','expireTime','expire_time','type','feature','ratio','enabled','resetTime','reset_time'].filter(field => Object.hasOwn(value,field)).map(field => [field,value[field]]));
  }
  return { data, observedAt: new Date().toISOString() };
});
`;
async function fetchBrowserKimiMembership(account) {
  const payload = await runQuotaBrowser('kimi', KIMI_MEMBERSHIP_PROGRAM);
  const observed = Date.parse(payload?.observedAt);
  if (!Number.isFinite(observed) || observed > Date.now() + 60_000) throw new AdapterError('Kimi 月度额度缺少有效读取时间', 'schema');
  return decodeKimiMembership(account, payload.data, observed);
}
export async function fetchKimiMembership(account, { desktop = fetchDesktopKimiMembership, browser = fetchBrowserKimiMembership } = {}) {
  try { return await desktop(account); }
  catch (error) {
    // An unavailable desktop login can use the user's independent web session.
    // Do not route around rate limits or retry an incompatible schema.
    if (error.code !== 'auth' && error.code !== 'missing') throw error;
    return browser(account);
  }
}

export async function fetchKimiAccount(account, { membership = fetchKimiMembership, code = fetchLocalKimi } = {}) {
  try { return await membership(account); }
  catch (membershipError) {
    try {
      const result = await code(account);
      // Code's windows cannot replace the combined Kimi + Code subscription.
      // Preserve the last total with its own timestamp, even across repeated fallback.
      const previous = account.source === 'kimi' ? account.pools.find(pool => pool.id === 'month-total' && bucketOf(pool) === 'month' && percentOf(pool) !== null) : null;
      const monthly = previous ? { ...previous, observedAt: previous.observedAt ?? account.observedAt, refreshFailed: true } : {
        id: 'month-total', bucket: 'month', label: '月度总量', scope: 'Kimi + Code',
        observedAt: null, refreshFailed: true, resetsAt: null, boundaryKind: 'reset'
      };
      result.pools = [monthly, ...result.pools];
      result.coverage.month = 'unknown';
      result.connection.message = previous?.observedAt || (previous && account.observedAt)
        ? '月度总量更新失败，保留上次值；5 小时／周额度独立更新。请在 Tabbit 登录 Kimi 后刷新，或更新官方桌面登录。'
        : '月度总量待读取；5 小时／周额度独立更新。请在 Tabbit 登录 Kimi 后刷新，或更新官方桌面登录。';
      return result;
    } catch {
      // Only expose our controlled error messages, never raw upstream responses.
      if (membershipError instanceof AdapterError) throw membershipError;
      throw new AdapterError('Kimi 额度读取失败，请确认官方客户端的登录与网络', 'unavailable');
    }
  }
}
