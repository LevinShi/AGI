import { readFile, mkdir, writeFile, rename, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialAccounts, PROVIDERS, providerVisible, recommendedOrder, reorderAccounts } from './catalog.js';
import { cleanAccount } from './domain.js';
import { AdapterError, decodeCodexBar } from './adapters.mjs';
import { liveAdapters, providerForConnector } from './providers.mjs';
import { closeLocalClients } from './local-clients.mjs';

export const AUTO_REFRESH_MS = 24 * 60 * 60_000;
export async function createService(path, adapters = liveAdapters, { now = Date.now } = {}) {
  let accounts = initialAccounts(), orderCustomized = false;
  let enabled = null, storedAttempts = {}, storeVersion = 0;
  try {
    const text = await readFile(path, 'utf8');
    if (text.length > 1024 * 1024) throw new Error('存储文件过大');
    const data = JSON.parse(text);
    if (![1, 2, 3].includes(data.version) || !Array.isArray(data.accounts) || data.accounts.length > 40) throw new Error('存储版本或账户数量不兼容');
    accounts = data.accounts.map(cleanAccount);
    orderCustomized = data.orderCustomized === true;
    if (!orderCustomized) accounts = recommendedOrder(accounts);
    if (new Set(accounts.map(a => a.id)).size !== accounts.length || accounts.some(a => !PROVIDERS.some(p => p.id === a.providerId))) throw new Error('存储账户无效');
    enabled = data.version >= 2 ? data.enabled || [] : null;
    storeVersion = data.version; storedAttempts = data.lastAttempts || {};
  } catch (error) { if (error.code !== 'ENOENT') throw new Error('无法读取本地记录，原文件已保留。请先检查或备份 .local/quotas.json。'); }
  const configs = new Map(), inflight = new Map(), generations = new Map(), attempts = new Map();
  // Only connection preferences are persisted. Tokens are read afresh from official clients.
  for (const account of accounts) {
    const type = Object.keys(providerForConnector).find(t => providerForConnector[t] === account.providerId);
    const newSource = storeVersion < 3 && ['muse', 'youmind'].includes(account.providerId) && account.source === 'none';
    const resume = providerVisible(account.providerId) && (enabled ? enabled.includes(account.id) || newSource : account.source !== 'manual' && account.source !== 'codexbar');
    const last = storedAttempts[account.id] ?? Date.parse(account.observedAt);
    if (Number.isFinite(last) && last > 0 && last <= now()) attempts.set(account.id, last);
    if (type && adapters[type] && resume && ![...configs.values()].some(c => c.type === type)) {
      configs.set(account.id, { type, failures: 0 });
      if (!account.observedAt && !attempts.has(account.id)) account.connection = { type, status: 'connecting', message: '等待首次读取…' };
    }
  }
  let writeQueue = Promise.resolve();
  const find = id => { const a = accounts.find(a => a.id === id); if (!a) throw new Error('账户不存在'); return a; };
  const bump = id => generations.set(id, (generations.get(id) || 0) + 1);
  function save() {
    const text = JSON.stringify({ version: 3, orderCustomized, enabled: [...configs.keys()], lastAttempts: Object.fromEntries(attempts), accounts }, null, 2);
    const operation = writeQueue.catch(() => {}).then(async () => {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await chmod(dirname(path), 0o700);
      const temp = `${path}.${randomUUID()}.tmp`;
      await writeFile(temp, text, { mode: 0o600, flag: 'wx' }); await rename(temp, path);
    });
    writeQueue = operation; return operation;
  }
  async function refresh(id, force = false) {
    if (inflight.has(id)) return inflight.get(id);
    const account = find(id), config = configs.get(id);
    if (!config) throw new Error('该账户尚未连接自动来源');
    if (!force && now() - (attempts.get(id) || 0) < 15_000) throw new Error('刚刚已刷新，请稍后再试');
    const generation = generations.get(id); attempts.set(id, now());
    // Persist attempts as well as successes: restarts must not produce repeated API calls.
    const scheduledWrite = save();
    scheduledWrite.catch(() => {}); // The operation awaits this below; avoid an early unhandled rejection.
    const operation = (async () => {
      try {
        const result = cleanAccount(await adapters[config.type](structuredClone(account), config));
        if (generations.get(id) !== generation) return;
        const current = find(id);
        accounts = accounts.map(a => a.id === id ? { ...result, pinned: current.pinned, alias: current.alias } : a);
        config.failures = 0; config.paused = false;
      } catch (error) {
        if (generations.get(id) !== generation) return;
        const current = find(id);
        current.connection = { type: config.type, status: error.code === 'auth' ? 'auth_required' : 'error', message: error instanceof AdapterError ? error.message.slice(0, 160) : '读取失败，保留上次成功值；请稍后重试' };
        config.failures = (config.failures || 0) + 1;
      }
      await scheduledWrite; await save();
    })();
    inflight.set(id, operation);
    try { await operation; } finally { inflight.delete(id); }
  }
  return {
    snapshot: () => ({ version: 1, accounts: structuredClone(accounts), refreshing: [...inflight.keys()], autoRefreshMs: AUTO_REFRESH_MS, generatedAt: new Date(now()).toISOString() }),
    async reorder(ids) { accounts = reorderAccounts(accounts, ids); orderCustomized = true; await save(); },
    async manual(input) {
      const old = find(input.id); const cleaned = cleanAccount({ ...input, providerId: old.providerId, source: 'manual', observedAt: new Date(now()).toISOString(), connection: { type: 'manual', status: 'ready' } });
      bump(old.id); configs.delete(old.id); accounts = accounts.map(a => a.id === old.id ? cleaned : a); await save();
    },
    async add(providerId, alias) {
      if (accounts.length >= 40 || !PROVIDERS.some(p => p.id === providerId)) throw new Error('无法添加该账户');
      const a = cleanAccount({ id: randomUUID(), providerId, alias, plan: '', pools: [], coverage: {}, source: 'none' }); accounts.push(a); await save(); return a.id;
    },
    async pin(id, value) { find(id).pinned = value === true; await save(); },
    async remove(id) { find(id); bump(id); configs.delete(id); accounts = accounts.filter(a => a.id !== id); await save(); },
    async import(id, payload) { const old = find(id); const next = decodeCodexBar(old, payload); bump(id); configs.delete(id); accounts = accounts.map(a => a.id === id ? next : a); await save(); },
    async connect(id, type, config = {}) {
      const a = find(id);
      if (providerForConnector[type] !== a.providerId || !adapters[type]) throw new Error('该账户不支持此连接器');
      if ([...configs.entries()].some(([key, c]) => key !== id && c.type === type)) throw new Error('同一个本地客户端登录仅连接一个账户，避免重复计入');
      if (inflight.has(id)) throw new Error('该账户正在读取，请完成后再更换连接');
      bump(id); configs.set(id, { type, failures: 0 });
      a.connection = { type, status: 'connecting', message: '正在读取官方来源…' };
      await refresh(id, true);
    },
    async disconnect(id) { bump(id); configs.delete(id); const a = find(id); a.connection = { type: a.connection.type, status: 'disconnected', message: '已断开，保留最后一次读取值' }; await save(); },
    refresh,
    async refreshAll() { await Promise.allSettled([...configs.keys()].map(id => refresh(id))); },
    async tick() {
      await Promise.allSettled([...configs.entries()].filter(([id, c]) => providerVisible(find(id).providerId) && now() - (attempts.get(id) || 0) >= AUTO_REFRESH_MS).map(([id]) => refresh(id)));
    },
    close() { configs.clear(); for (const a of accounts) bump(a.id); if (adapters === liveAdapters) closeLocalClients(); }
  };
}
