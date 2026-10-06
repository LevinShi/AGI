import { homedir } from 'node:os';
import { join } from 'node:path';
import { AdapterError, baseSnapshot } from './adapters.mjs';
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
  const result = baseSnapshot(account, 'kimi', pools, now);
  result.connection.message = '已读取 Kimi 综合会员月度总量（含 Code），以及可用的周期额度。';
  return result;
}

export async function fetchKimiMembership(account) {
  const token = await desktopToken();
  const payload = await requestJSON(MEMBERSHIP_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
      'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'x-msh-platform': 'web' },
    body: JSON.stringify({ mute_notice: true })
  });
  return decodeKimiMembership(account, payload);
}

export async function fetchKimiAccount(account, { membership = fetchKimiMembership, code = fetchLocalKimi } = {}) {
  try { return await membership(account); }
  catch (membershipError) {
    try {
      const result = await code(account);
      if (!result.pools.some(pool => pool.bucket === 'month')) {
        result.coverage.month = 'unknown';
        result.connection.message = '已读取 Kimi Code；月度总量暂不可用，请打开已登录的 Kimi 官方桌面客户端后重试。';
      }
      return result;
    } catch {
      // Only expose our controlled error messages, never raw upstream responses.
      if (membershipError instanceof AdapterError) throw membershipError;
      throw new AdapterError('Kimi 额度读取失败，请确认官方客户端的登录与网络', 'unavailable');
    }
  }
}
