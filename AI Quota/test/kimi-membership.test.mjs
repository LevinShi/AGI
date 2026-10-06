import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeKimiMembership, fetchKimiAccount, validateKimiDesktopToken } from '../src/kimi-membership.mjs';
import { percentOf } from '../src/domain.js';
import { initialAccounts } from '../src/catalog.js';
import { AdapterError, decodeKimi } from '../src/adapters.mjs';

const account = initialAccounts().find(item => item.providerId === 'kimi');
const now = Date.parse('2030-06-05T12:00:00Z');
// Synthetic fixture for the official GetSubscriptionStats schema.
const payload = {
  subscriptionBalance: { amountUsedRatio: 0.25, kimiCodeUsedRatio: 0.05,
    expireTime: '2030-06-18T08:00:00.000000Z', type: 'SUBSCRIPTION', feature: 'FEATURE_OMNI', unit: 'UNIT_CREDIT' },
  ratelimitCode5h: { enabled: true, resetTime: '2030-06-05T16:00:00.000000Z' },
  ratelimitCode7d: { ratio: 0.1, enabled: true, resetTime: '2030-06-06T08:00:00.000000Z' }
};

test('Kimi monthly total includes Code without counting its contribution twice', () => {
  const result = decodeKimiMembership(account, payload, now);
  assert.equal(result.pools.filter(pool => pool.bucket === 'month').length, 1);
  assert.equal(percentOf(result.pools.find(pool => pool.bucket === 'month')), 75);
  assert.equal(percentOf(result.pools.find(pool => pool.bucket === 'h5')), 100);
  assert.equal(percentOf(result.pools.find(pool => pool.bucket === 'week')), 90);
  assert.equal(result.pools[0].resetsAt, '2030-06-18T08:00:00.000Z');
});

test('missing optional monthly ratio stays unknown; zero is valid', () => {
  assert.throws(() => decodeKimiMembership(account, { ...payload,
    subscriptionBalance: { ...payload.subscriptionBalance, amountUsedRatio: undefined } }), { code: 'schema' });
  const zero = decodeKimiMembership(account, { ...payload,
    subscriptionBalance: { ...payload.subscriptionBalance, amountUsedRatio: 0 } });
  assert.equal(percentOf(zero.pools[0]), 100);
  assert.throws(() => decodeKimiMembership(account, { ...payload,
    subscriptionBalance: { ...payload.subscriptionBalance, feature: 'FEATURE_CODING' } }), { code: 'schema' });
});

test('Kimi accepts official snake-case fields and omits disabled rate windows', () => {
  const result = decodeKimiMembership(account, {
    subscription_balance: { type: 'SUBSCRIPTION', feature: 'FEATURE_OMNI', amount_used_ratio: 0.25,
      expire_time: '2030-06-18T08:00:00Z' },
    ratelimit_code_5h: { enabled: false, ratio: 0.9 }
  }, now);
  assert.equal(result.pools.length, 1);
  assert.equal(percentOf(result.pools[0]), 75);
});

test('Kimi fallback never refreshes an old monthly snapshot with a new timestamp', async () => {
  const previous = decodeKimiMembership(account, payload, now);
  const result = await fetchKimiAccount(previous, {
    membership: async () => { throw new AdapterError('登录失效', 'auth'); },
    code: async old => decodeKimi(old, { code: 0, data: { kind: 'ok', summary: {
      window: { unit: 'week', duration: 1 }, used: 10, limit: 100, reset_at: '2030-06-06T08:00:00Z'
    } } }, now + 86_400_000)
  });
  assert.equal(result.pools.some(pool => pool.bucket === 'month'), false);
  assert.equal(result.coverage.month, 'unknown');
  assert.match(result.connection.message, /月度总量暂不可用/);
});

test('Kimi rejects missing, expired, malformed and newline-containing local tokens', () => {
  const token = exp => `test.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.test`;
  assert.equal(validateKimiDesktopToken(token(now / 1000 + 120), now), true);
  assert.equal(validateKimiDesktopToken(token(now / 1000 + 20), now), false);
  assert.equal(validateKimiDesktopToken(token(now / 1000 - 1), now), false);
  assert.equal(validateKimiDesktopToken(undefined, now), false);
  assert.equal(validateKimiDesktopToken('invalid', now), false);
  assert.equal(validateKimiDesktopToken(`${token(now / 1000 + 120)}\n`, now), false);
});
