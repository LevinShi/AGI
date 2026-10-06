import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeYouMind } from '../src/youmind-client.mjs';
import { percentOf, projectAccount } from '../src/domain.js';

const now = Date.parse('2030-06-05T12:00:00.000Z');
const account = { id: 'youmind', providerId: 'youmind', alias: '主账户' };
const observedAt = new Date(now).toISOString();

test('YouMind synthetic fixture respects the returned denominator rather than a fixed plan assumption', () => {
  const result = decodeYouMind(account, { observedAt, data: { monthlyBalance: 30000, monthlyQuota: 40000, currentPeriodEnd: '2030-06-29T08:00:00.000Z', productTier: 'pro', permanentBalance: 0 } }, now);
  assert.equal(result.plan, 'Pro');
  assert.equal(result.pools[0].remaining, 30000);
  assert.equal(result.pools[0].limit, 40000);
  assert.equal(result.pools[0].used, 10000);
  assert.equal(percentOf(result.pools[0]), 75);
  assert.equal(result.pools[0].resetsAt, '2030-06-29T08:00:00.000Z');
  assert.equal(result.coverage.h5, 'not_applicable');
  assert.equal(result.coverage.week, 'not_applicable');
});

test('YouMind extra credit balances do not inflate monthly remaining percentage or inherit its reset', () => {
  const result = decodeYouMind(account, { observedAt, data: { monthlyBalance: 1000, monthlyQuota: 4000, permanentBalance: 2500, bonusBalance: 300, productTier: 'pro', currentPeriodEnd: '2030-06-29T08:00:00Z' } }, now);
  assert.equal(percentOf(result.pools[0]), 25);
  assert.equal(result.pools.length, 3);
  assert.deepEqual(result.pools.slice(1).map(p => [p.bucket, p.resetsAt]), [['other', null], ['other', null]]);
});

test('A free daily credit pool does not masquerade as monthly usage', () => {
  const result = decodeYouMind(account, { observedAt, data: { dailyBalance: 50, dailyLimit: 500, monthlyQuota: 4000, monthlyBalance: 4000, productTier: 'free' } }, now);
  assert.equal(result.pools.length, 1);
  assert.equal(result.pools[0].bucket, 'other');
  assert.equal(result.pools[0].windowMinutes, 1440);
  assert.equal(result.pools[0].resetsAt, null);
});

test('Missing denominator and stale reset boundary never become a fabricated fresh full quota', () => {
  assert.throws(() => decodeYouMind(account, { observedAt, data: { monthlyBalance: 4000, productTier: 'pro' } }, now), /总额/);
  assert.throws(() => decodeYouMind(account, { observedAt: 'invalid', data: { monthlyBalance: 4, monthlyQuota: 5, productTier: 'pro' } }, now), /读取时间/);
  const result = decodeYouMind(account, { observedAt, data: { monthlyBalance: 0, monthlyQuota: 4000, productTier: 'pro', currentPeriodEnd: '2030-06-04T08:00:00Z' } }, now);
  assert.equal(percentOf(result.pools[0]), 0);
  assert.equal(projectAccount(result, now).pools[0].freshness, 'awaiting_refresh');
});

test('Only allowed quota fields leave the decoder; no account identity or raw response is retained', () => {
  const result = decodeYouMind(account, { observedAt, data: { id: 'private-user', email: 'private@example.test', token: 'secret-value', monthlyBalance: 10, monthlyQuota: 100, productTier: 'pro' } }, now);
  assert.doesNotMatch(JSON.stringify(result), /private-user|private@example|secret-value/);
});
