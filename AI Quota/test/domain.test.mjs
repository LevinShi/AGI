import test from 'node:test';
import assert from 'node:assert/strict';
import { percentOf, bucketOf, projectAccount, cleanAccount, formatPercent } from '../src/domain.js';
import { initialAccounts } from '../src/catalog.js';
import { decodeCodex, decodeKimi, decodeCodexBar } from '../src/adapters.mjs';
const now = Date.parse('2026-10-04T12:00:00Z');
const base = () => ({ ...initialAccounts()[0], observedAt: new Date(now).toISOString(), source: 'codex', connection: { type: 'codex', status: 'ready' } });
test('remaining %, used %, fraction and quantities converge on the same result', () => {
  for (const pool of [{ remainingPercent: 72 }, { usedPercent: 28 }, { usedRatio: 0.28 }, { remaining: 720, limit: 1000 }, { used: 280, limit: 1000 }]) assert.ok(Math.abs(percentOf(pool) - 72) < 1e-8);
});
test('zero is measured exhaustion, missing and invalid denominators stay unknown', () => {
  assert.equal(percentOf({ remainingPercent: 0 }), 0);
  for (const p of [{}, { remaining: 1200 }, { remaining: 0, limit: 0 }, { remainingPercent: null }, { usedPercent: '28' }, { remainingPercent: 101 }, { usedPercent: -1 }]) assert.equal(percentOf(p), null);
});
test('conflicting figures are not silently preferred and overuse cannot be negative remaining', () => {
  assert.equal(percentOf({ remainingPercent: 72, usedPercent: 50 }), null);
  assert.equal(percentOf({ usedPercent: 110 }), 0);
});
test('cadence mapping requires evidence, never scales capacities', () => {
  assert.equal(bucketOf({ windowMinutes: 300 }), 'h5');
  assert.equal(bucketOf({ windowMinutes: 10080 }), 'week');
  assert.equal(bucketOf({ period: 'billing_month' }), 'month');
  assert.equal(bucketOf({ windowMinutes: 43200 }), 'other');
  assert.equal(bucketOf({ windowMinutes: 180 }), 'other');
});
test('unknown and not applicable remain distinct', () => {
  const a = base(); a.coverage.month = 'not_applicable';
  const p = projectAccount(a, now); assert.equal(p.cells.month.state, 'not_applicable'); assert.equal(p.cells.h5.state, 'unknown');
});
test('independent monthly pools remain two values', () => {
  const a = base(); a.pools = [{ id: 'total', bucket: 'month', remainingPercent: 21 }, { id: 'code', bucket: 'month', remainingPercent: 58 }];
  assert.deepEqual(projectAccount(a, now).cells.month.pools.map(p => p.percent), [21, 58]);
});
test('reset passage does not refill the pool; expiry does not count as recovery', () => {
  const a = base(); a.pools = [{ id: 'h', bucket: 'h5', remainingPercent: 0, resetsAt: new Date(now - 1).toISOString(), boundaryKind: 'reset' }, { id: 'credit', bucket: 'other', remaining: 40, resetsAt: new Date(now - 1000).toISOString(), boundaryKind: 'expiry' }];
  const p = projectAccount(a, now); assert.equal(p.cells.h5.pools[0].percent, 0); assert.equal(p.cells.h5.pools[0].freshness, 'awaiting_refresh'); assert.equal(p.nextReset.id, 'h');
});
test('stale data never raises a new low-quota alert', () => {
  const a = base(); a.observedAt = new Date(now - 25 * 3600_000).toISOString(); a.pools = [{ id: 'h', bucket: 'h5', remainingPercent: 4 }];
  const p = projectAccount(a, now); assert.equal(p.stale, true); assert.equal(p.low, false); assert.equal(p.cells.h5.pools[0].percent, 4);
});
test('canonical storage drops secrets, identity payloads and unknown properties', () => {
  const a = cleanAccount({ ...base(), token: 'SECRET', cookies: 'SECRET', raw: { email: 'x@y.com' }, connection: { type: 'kimi', token: 'SECRET', status: 'ready' } });
  assert.equal(JSON.stringify(a).includes('SECRET'), false); assert.equal(JSON.stringify(a).includes('x@y.com'), false);
  assert.throws(() => cleanAccount({ ...base(), pools: [{ remainingPercent: -1 }] }));
});
test('small positive percentages do not show depleted or full', () => { assert.equal(formatPercent(0.01), '<0.1%'); assert.equal(formatPercent(99.99), '>99.9%'); });
test('Codex supports several metered buckets and discards account identity', () => {
  const a = decodeCodex(base(), { rateLimitsByLimitId: { codex: { primary: { usedPercent: 28, windowDurationMins: 300, resetsAt: now / 1000 + 3600 } }, other: { primary: { usedPercent: 44, windowDurationMins: 300 } } } }, { account: { planType: 'pro', email: 'private@example.com' } }, now);
  assert.equal(a.pools.length, 2); assert.equal(a.plan, 'pro'); assert.equal(JSON.stringify(a).includes('private@example.com'), false);
});
test('Kimi distinguishes overall and Code monthly pools and no-denominator wallet', () => {
  const a = decodeKimi({ ...base(), providerId: 'kimi' }, { code: 0, data: { kind: 'ok', quota: { usages: { monthTotal: { usedRatio: 0.79 }, monthCode: { usedRatio: 0.42 } }, extraUsage: { balanceCents: 1200, currency: 'CNY' } } } }, now);
  assert.equal(a.pools.length, 3); assert.equal(a.pools[2].remaining, 12); assert.equal(percentOf(a.pools[2]), null);
  assert.throws(() => decodeKimi(base(), { code: 40101, data: { kind: 'ok' } }));
});
test('CodexBar import preserves timestamp and rejects CLI quota as Gemini web quota', () => {
  const payload = { provider: 'codex', usage: { updatedAt: '2026-10-02T11:30:00Z', primary: { windowMinutes: 300, usedPercent: 50 } } };
  const a = decodeCodexBar(base(), payload, now); assert.equal(a.observedAt, '2026-10-02T11:30:00.000Z'); assert.equal(projectAccount(a, now).stale, true);
  assert.throws(() => decodeCodexBar({ ...base(), providerId: 'gemini' }, { ...payload, provider: 'gemini' }, now));
  assert.throws(() => decodeCodexBar(base(), { provider: 'codex', windows: [] }, now));
});
test('CodexBar repeated feature ids across distinct windows do not collide', () => {
  const a = decodeCodexBar(base(), { id: 'codex', updatedAt: new Date(now).toISOString(), windows: [{ limitId: 'codex', label: '5h', usedPercent: 12 }, { limitId: 'codex', kind: 'weekly', label: 'Week', usedPercent: 42 }] }, now);
  assert.equal(a.pools.length, 2); assert.equal(a.pools[0].bucket, 'h5'); assert.equal(a.pools[1].bucket, 'week');
});
