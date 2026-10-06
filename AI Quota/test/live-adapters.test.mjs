import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeKimi, AdapterError, codexRPCError } from '../src/adapters.mjs';
import { decodeCursor, decodeGrok, decodeMiniMax, decodeZCode } from '../src/providers.mjs';
import { cleanAccount, percentOf } from '../src/domain.js';
import { createService } from '../src/service.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const account = providerId => ({ id: providerId, providerId, alias: '主账户', plan: '', pools: [], coverage: {} });

test('Codex temporary RPC errors are not misreported as expired login and never expose the raw message', () => {
  const transient = codexRPCError({ code: -32001, message: 'network request failed: SECRET_VALUE' });
  assert.equal(transient.code, 'unavailable'); assert.equal(transient.message.includes('SECRET_VALUE'), false);
  assert.equal(codexRPCError({ message: 'HTTP 429 Too many requests' }).code, 'rate_limit');
  assert.equal(codexRPCError({ message: 'HTTP 401 Unauthorized' }).code, 'auth');
});

test('Kimi 0.36 live response shape retains Code quota and marks unreported Work monthly quota unknown', () => {
  const value = decodeKimi(account('kimi'), { code: 0, data: { kind: 'ok', summary: { window: { duration: 1, unit: 'week' }, used: 0, limit: 100 }, limits: [{ window: { duration: 5, unit: 'hour' }, used: 20, limit: 100 }] } });
  assert.equal(percentOf(value.pools[0]), 100); assert.equal(percentOf(value.pools[1]), 80);
  assert.equal(value.pools[0].bucket, 'week'); assert.equal(value.coverage.month, 'unknown');
  assert.throws(() => decodeKimi(account('kimi'), { code: 0, data: { kind: 'ok' } }), AdapterError);
});
test('Cursor overall percentage is separate from exhausted third-party dollar allowance', () => {
  const value = decodeCursor(account('cursor'), { membershipType: 'pro', teamUsage: {}, individualUsage: { plan: { enabled: true, used: 2000, limit: 2000, totalPercentUsed: 4.806349, autoPercentUsed: 0, apiPercentUsed: 100 } } });
  assert.equal(value.pools.length, 3); assert.equal(percentOf(value.pools[2]), 0); assert.equal(percentOf(value.pools[1]), 100);
  assert.ok(percentOf(value.pools[0]) > 95); assert.equal(value.coverage.h5, 'not_applicable');
  assert.throws(() => decodeCursor(account('cursor'), { individualUsage: { plan: { enabled: true } } }));
});
test('Grok trial expires instead of inventing a weekly reset; current limit flag takes precedence', () => {
  const value = decodeGrok(account('grokbot'), { usagePercent: 19, hasNonZeroIncludedLimit: true, includedLimitZero: true, sandTrialExpiresAt: '2030-01-01T00:00:00Z' });
  assert.equal(value.pools[0].bucket, 'other'); assert.equal(value.pools[0].boundaryKind, 'expiry');
  assert.throws(() => decodeGrok(account('grokbot'), { usagePercent: 0, includedLimitZero: true }));
});
test('MiniMax zero counts can still have a real percentage, legacy usage_count means remaining', () => {
  const value = decodeMiniMax(account('minimax'), { plan: 'Plus', quota: { base_resp: { status_code: 0 }, model_remains: [{ current_interval_total_count: 0, current_interval_remaining_percent: 100, current_weekly_total_count: 1000, current_weekly_usage_count: 420 }] } });
  assert.equal(percentOf(value.pools[0]), 100); assert.equal(percentOf(value.pools[1]), 42);
  assert.throws(() => decodeMiniMax(account('minimax'), { quota: { base_resp: { status_code: 1000 } } }));
});
test('ZCode uses reported counts, preserves missing reset time, and does not fabricate a monthly window', () => {
  const value = decodeZCode(account('zcode'), { code: 200, success: true, data: { level: 'lite', limits: [{ type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 0, usage: 2000, remaining: 2000 }, { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 59, usage: 10000, remaining: 4098 }] } });
  assert.equal(value.pools[0].resetsAt, null); assert.equal(percentOf(value.pools[1]), 40.98);
  assert.equal(value.pools[1].bucket, 'week'); assert.equal(value.coverage.month, 'not_applicable');
});
test('automatic connections survive restart, explicit disconnection survives restart, secrets never persist', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-resume-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'data.json'); let calls = 0;
  const adapters = { kimi: async a => { calls++; return cleanAccount({ ...a, source: 'kimi', observedAt: new Date().toISOString(), pools: [{ id: 'week', bucket: 'week', remainingPercent: 63 }], connection: { type: 'kimi', status: 'ready' } }); } };
  const first = await createService(path, adapters); await first.tick(); first.close();
  const second = await createService(path, adapters); await second.tick(); assert.equal(calls, 1);
  await second.disconnect('kimi'); second.close();
  const third = await createService(path, adapters); await third.tick(); assert.equal(calls, 1); third.close();
  const saved = JSON.parse(await readFile(path, 'utf8')); assert.equal(saved.version, 3); assert.deepEqual(saved.enabled, []);
  assert.equal(JSON.stringify(saved).includes('token'), false);
});
