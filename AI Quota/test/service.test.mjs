import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createService, AUTO_REFRESH_MS } from '../src/service.mjs';
import { createQuotaServer } from '../src/server.mjs';
async function temp(t) { const dir = await mkdtemp(join(tmpdir(), 'quota-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return join(dir, 'data', 'quotas.json'); }
test('failed refresh retains previous value and disconnect stops future refreshes', async t => {
  let calls = 0; const path = await temp(t); const service = await createService(path, { codex: async a => { if (calls++) throw new Error('provider failed SECRET'); return { ...a, source: 'codex', observedAt: new Date().toISOString(), pools: [{ id: 'h', bucket: 'h5', remainingPercent: 72 }], connection: { type: 'codex', status: 'ready' } }; } });
  await service.connect('chatgpt', 'codex'); await service.refresh('chatgpt', true);
  const a = service.snapshot().accounts[0]; assert.equal(a.pools[0].remainingPercent, 72); assert.equal(a.connection.status, 'error'); assert.equal(JSON.stringify(a).includes('SECRET'), false);
  await service.disconnect('chatgpt'); await assert.rejects(service.refresh('chatgpt', true));
});
test('a late provider response cannot overwrite a manual edit', async t => {
  let release; const service = await createService(await temp(t), { codex: a => new Promise(resolve => { release = () => resolve({ ...a, pools: [{ id: 'h', bucket: 'h5', remainingPercent: 1 }] }); }) });
  const pending = service.connect('chatgpt', 'codex');
  const a = service.snapshot().accounts[0]; await service.manual({ ...a, pools: [{ id: 'manual', bucket: 'h5', remainingPercent: 88 }] });
  release(); await pending; assert.equal(service.snapshot().accounts[0].pools[0].remainingPercent, 88);
});
test('Kimi service token is never serialized', async t => {
  const path = await temp(t); const service = await createService(path, { kimi: async (a, c) => { assert.equal(c.token, undefined); return { ...a, observedAt: new Date().toISOString(), source: 'kimi', connection: { type: 'kimi', status: 'ready' } }; } });
  await service.connect('kimi', 'kimi', { port: 58627, token: 'VERY_SECRET' });
  assert.equal((await readFile(path, 'utf8')).includes('VERY_SECRET'), false); assert.equal(JSON.stringify(service.snapshot()).includes('VERY_SECRET'), false); assert.equal((await stat(path)).mode & 0o777, 0o600);
});
test('daily scheduling persists failures and successes across restart; manual refresh resets the day', async t => {
  const path = await temp(t); let clock = Date.now(), calls = 0, fail = false;
  const options = { now: () => clock };
  const adapters = { codex: async a => {
    calls++; if (fail) throw new Error('offline');
    return { ...a, source: 'codex', observedAt: new Date(clock).toISOString(),
      connection: { type: 'codex', status: 'ready' }, pools: [{ id: 'week', bucket: 'week', remainingPercent: 70 }] };
  } };
  let service = await createService(path, adapters, options);
  await service.tick(); assert.equal(calls, 1); service.close();
  service = await createService(path, adapters, options);
  await service.tick(); assert.equal(calls, 1);
  clock += AUTO_REFRESH_MS - 1; await service.tick(); assert.equal(calls, 1);
  clock++; fail = true; await service.tick(); assert.equal(calls, 2); service.close();
  service = await createService(path, adapters, options);
  await service.tick(); assert.equal(calls, 2);
  clock += 16_000; fail = false; await service.refresh('chatgpt'); assert.equal(calls, 3);
  clock += AUTO_REFRESH_MS - 1; await service.tick(); assert.equal(calls, 3);
  clock++; await service.tick(); assert.equal(calls, 4); service.close();
});
test('local HTTP API requires token and exact origin, rejects oversized writes and exposes no filesystem', async t => {
  const app = await createQuotaServer({ dataPath: await temp(t), adapters: {} }); t.after(() => app.close());
  const url = `http://127.0.0.1:${app.port}`;
  const html = await (await fetch(url)).text(); const token = html.match(/name="quota-token" content="([a-f0-9]+)"/)[1];
  assert.equal((await fetch(url + '/api/snapshot')).status, 401);
  assert.equal((await fetch(url + '/api/snapshot', { headers: { 'X-Quota-Token': 'é'.repeat(64) } })).status, 401);
  assert.equal((await fetch(url + '/api/snapshot', { headers: { 'X-Quota-Token': token, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(url + '/api/snapshot', { headers: { 'X-Quota-Token': token } })).status, 200);
  assert.equal((await fetch(url + '/.local/quotas.json')).status, 404);
  assert.equal((await fetch(url + '/api/manual', { method: 'POST', headers: { 'X-Quota-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(270000) }) })).status, 413);
  assert.equal((await fetch(url + '/api/snapshot', { headers: { 'X-Quota-Token': token } })).status, 200);
});
