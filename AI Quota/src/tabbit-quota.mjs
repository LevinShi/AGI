import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AdapterError } from './adapters.mjs';

// Only trusted backend adapters call this helper. Never expose program, origin,
// tab selectors, or command-line arguments through the local HTTP API.
const PROVIDERS = Object.freeze({
  youmind: { title: 'YouMind', origin: 'https://youmind.com', entry: 'https://youmind.com/new-task' },
  muse: { title: 'Muse.ai', origin: 'https://muse.ai', entry: 'https://muse.ai/' },
  kimi: { title: 'Kimi', origin: 'https://www.kimi.com', entry: 'https://www.kimi.com/' },
});

function command(executable, args, input = '', timeout = 70_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let text = '', size = 0, done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const failure = () => new AdapterError('浏览器额度读取未完成；请确认 Tabbit 可以正常打开后重试', 'unavailable');
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(failure()); }, timeout);
    timer.unref();
    child.on('error', () => finish(failure()));
    child.stdin.on('error', () => {});
    // Browser/runtime diagnostics can contain private page details. Do not log,
    // persist, attach to an Error, or return either raw stream to the UI.
    child.stderr.on('data', () => {});
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 512 * 1024) { child.kill('SIGTERM'); finish(failure()); return; }
      text += chunk.toString('utf8');
    });
    child.on('close', () => {
      try {
        const lines = text.trim().split('\n');
        const last = lines.findLast(line => line.trim().startsWith('{'));
        finish(null, JSON.parse(last || '{}'));
      } catch { finish(failure()); }
    });
    child.stdin.end(input);
  });
}

function readValue(receipt) {
  if (receipt?.status !== 'succeeded') throw new AdapterError('浏览器未能完成额度查询；可打开官方用量页确认登录后重试', 'unavailable');
  const result = receipt.result;
  if (result?.type === 'resource' || result?.resourceId) throw new AdapterError('额度响应超出允许范围', 'schema');
  if (!result || !Object.hasOwn(result, 'value')) throw new AdapterError('浏览器没有返回可用额度', 'schema');
  return result.value;
}

/**
 * Run a fixed, trusted adapter program in a new background browser tab.
 * Cookies never leave the browser. Every program must return a small allowlist
 * of quota fields and must never return raw API bodies, storage, or headers.
 * Existing user tabs are neither selected nor closed. The scratch tab closes
 * before returning; task ownership/receipts are released by finish.
 */
export async function runQuotaBrowser(providerId, program) {
  const provider = PROVIDERS[providerId];
  if (!provider || typeof program !== 'string' || program.length > 32_000) throw new AdapterError('不支持的浏览器额度来源', 'schema');
  const executable = join(homedir(), '.local/bin/tabbit-cli');
  try { await access(executable, constants.X_OK); }
  catch { throw new AdapterError(`需要 Tabbit 浏览器：请先在 Tabbit 登录 ${provider.title} 后刷新`, 'missing'); }
  const task = `Quota Desk · ${provider.title} 额度`;
  const requestId = `quota-${randomUUID()}`;
  const source = `
const quotaScratch = page;
try {
  await quotaScratch.goto(${JSON.stringify(provider.entry)}, { waitUntil: "domcontentloaded", timeout: 20000 });
  if (new URL(quotaScratch.url()).origin !== ${JSON.stringify(provider.origin)}) return { quotaError: "auth" };
  const result = await (async () => { ${program}\n })();
  return result;
} finally {
  await quotaScratch.close();
}
`;
  try {
    let receipt = await command(executable, ['nodejs', '--task', task, '--request-id', requestId, '--timeout-ms', '60000'], source);
    // A queued receipt is not a failed query. Wait for the same request ID;
    // dispatching again would create duplicate API traffic and tabs.
    const deadline = Date.now() + 70_000;
    while (['queued', 'running'].includes(receipt?.status) && Date.now() < deadline) {
      receipt = await command(executable, ['receipt', '--task', task, '--request-id', requestId, '--wait-ms', '30000'], '', 35_000);
    }
    if (['queued', 'running'].includes(receipt?.status)) throw new AdapterError('额度读取超时，请稍后重试', 'network');
    const value = readValue(receipt);
    if (value?.quotaError === 'auth') throw new AdapterError(`请先在 Tabbit 浏览器登录 ${provider.title}，再点击刷新`, 'auth');
    if (value?.quotaError === 'rate_limit') throw new AdapterError(`${provider.title} 暂时限制查询频率，请稍后手动刷新`, 'rate_limit');
    if (value?.quotaError) throw new AdapterError(`${provider.title} 额度查询未完成，保留上次结果`, 'network');
    return value;
  } finally {
    // Closing is performed inside the browser program even after fetch failure.
    // finish releases only this task; it never discards existing user tabs.
    try { await command(executable, ['finish', '--task', task], '', 15_000); } catch {}
  }
}
