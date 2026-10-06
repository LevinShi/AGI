import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beijingTime, beijingInput, fromBeijingInput } from '../src/domain.js';
import { initialAccounts, reorderAccounts } from '../src/catalog.js';
import { createService } from '../src/service.mjs';

test('Beijing display and input are UTC+8 across DST, year and month boundaries', () => {
  for (const [iso, date] of [['2026-12-31T18:45:00.000Z', '2027-01-01T02:45'], ['2026-03-08T10:30:00.000Z', '2026-03-08T18:30'], ['2026-10-04T16:00:00.000Z', '2026-10-05T00:00']]) {
    assert.equal(beijingInput(iso), date); assert.equal(fromBeijingInput(date), iso);
    assert.equal(beijingTime(iso, true), date.replace('T', ' ') + ' 北京时间');
  }
  assert.equal(beijingTime('invalid'), '未提供'); assert.equal(fromBeijingInput(''), null);
  assert.throws(() => fromBeijingInput('2026-02-30T10:00'));
});
test('reordering is an exact permutation, preserves pools and rejects stale account sets', () => {
  const accounts = initialAccounts(); accounts[0].pools = [{ id: 'week', remainingPercent: 74 }];
  const ids = accounts.map(a => a.id).reverse();
  const reordered = reorderAccounts(accounts, ids);
  assert.deepEqual(reordered.map(a => a.id), ids); assert.deepEqual(reordered.at(-1).pools, accounts[0].pools);
  assert.throws(() => reorderAccounts(accounts, ids.slice(1)));
  assert.throws(() => reorderAccounts(accounts, ids.map(() => ids[0])));
  assert.throws(() => reorderAccounts(accounts, [...ids.slice(1), 'unknown-account']));
});
test('legacy data gains the default order once; customized order survives edits, refresh and restart', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-order-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'quotas.json'); await writeFile(path, JSON.stringify({ version: 1, accounts: initialAccounts().reverse() }));
  const service = await createService(path, { codex: async a => ({ ...a, pools: [{ id: 'week', bucket: 'week', remainingPercent: 74 }] }) });
  assert.deepEqual(service.snapshot().accounts.map(a => a.id), initialAccounts().map(a => a.id));
  const ids = service.snapshot().accounts.map(a => a.id).reverse(); await service.reorder(ids);
  await service.connect('chatgpt', 'codex'); await service.pin('kimi', false);
  const saved = JSON.parse(await readFile(path, 'utf8')); assert.equal(saved.orderCustomized, true);
  const restarted = await createService(path);
  assert.deepEqual(restarted.snapshot().accounts.map(a => a.id), ids);
  assert.equal(restarted.snapshot().accounts.find(a => a.id === 'chatgpt').pools[0].remainingPercent, 74);
  service.close(); restarted.close();
});
