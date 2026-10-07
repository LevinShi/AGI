import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeKimiMembership, fetchKimiAccount, validateKimiDesktopToken } from '../src/kimi-membership.mjs';
import { percentOf, cleanAccount, projectAccount } from '../src/domain.js';
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
  assert.equal(result.pools.filter(pool => pool.bucket === 'month').length, 1);
  assert.equal(percentOf(result.pools[0]), 75);
  assert.equal(result.pools[0].observedAt, previous.observedAt);
  assert.equal(result.pools[0].refreshFailed, true);
  const view = projectAccount(cleanAccount(result), now + 86_400_000);
  assert.equal(view.cells.month.pools[0].freshness, 'stale');
  assert.equal(view.cells.week.pools[0].freshness, 'awaiting_refresh');
  assert.equal(view.needsAttention, true);
  assert.equal(result.coverage.month, 'unknown');
  assert.match(result.connection.message, /月度总量更新失败/);
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

const codeSnapshot = (old, time) => decodeKimi(old, { code: 0, data: { kind: 'ok', summary: {
  window: { unit: 'week', duration: 1 }, used: 10, limit: 100, reset_at: new Date(time + 86_400_000).toISOString()
}, limits: [{ window: { unit: 'hour', duration: 5 }, used: 5, limit: 100 }] } }, time);
const unavailable = async () => { throw new AdapterError('登录失效', 'auth'); };

test('repeated Code fallback and persistence cannot advance the cached monthly timestamp', async () => {
  const previous = decodeKimiMembership(account, payload, now);
  const first = cleanAccount(await fetchKimiAccount(previous, { membership: unavailable, code: async old => codeSnapshot(old, now + 1000) }));
  const second = cleanAccount(await fetchKimiAccount(first, { membership: unavailable, code: async old => codeSnapshot(old, now + 2000) }));
  assert.equal(second.pools[0].observedAt, previous.observedAt);
  assert.equal(second.pools[0].refreshFailed, true);
  const view = projectAccount(second, now + 2000);
  assert.equal(view.cells.month.pools[0].freshness, 'stale');
  assert.equal(view.cells.week.pools[0].freshness, 'current');
  assert.equal(view.cells.h5.pools[0].freshness, 'current');
  const recovered = await fetchKimiAccount(second, { membership: async old => decodeKimiMembership(old, payload, now + 3000), code: async () => { throw new Error('must not run'); } });
  assert.equal(recovered.pools[0].refreshFailed, undefined);
  assert.equal(recovered.pools[0].observedAt, new Date(now + 3000).toISOString());
  assert.equal(projectAccount(recovered, now + 3000).cells.month.pools[0].freshness, 'current');
});

test('without any monthly history, the total remains explicitly unknown alongside fresh Code windows', async () => {
  const result = cleanAccount(await fetchKimiAccount(account, { membership: unavailable, code: async old => codeSnapshot(old, now) }));
  const view = projectAccount(result, now);
  assert.equal(view.cells.month.pools.length, 1);
  assert.equal(view.cells.month.pools[0].percent, null);
  assert.equal(view.cells.week.pools[0].percent, 90);
  assert.equal(view.cells.h5.pools[0].percent, 95);
  assert.equal(view.needsAttention, true);
  assert.match(result.connection.message, /月度总量待读取/);
});

test('desktop login expiry uses browser membership without falling back to Code-only usage', async () => {
  const { fetchKimiMembership } = await import('../src/kimi-membership.mjs');
  let browserCalls = 0;
  const result = await fetchKimiMembership(account, { desktop: unavailable, browser: async old => { browserCalls++; return decodeKimiMembership(old, payload, now); } });
  assert.equal(browserCalls, 1);
  assert.equal(percentOf(result.pools[0]), 75);
  await assert.rejects(fetchKimiMembership(account, { desktop: async () => { throw new AdapterError('限流', 'rate_limit'); }, browser: async () => { browserCalls++; } }), { code: 'rate_limit' });
  assert.equal(browserCalls, 1);
});
