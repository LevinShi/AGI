import { readFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { AdapterError, decodeKimi } from './adapters.mjs';

// These credentials stay inside this process. Never return them to the UI or logs.
export async function readJSON(path) { return JSON.parse(await readFile(path, 'utf8')); }
export async function requestJSON(url, init = {}) {
  let response;
  try { response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) }); }
  catch { throw new AdapterError('额度请求未完成，请检查网络或官方客户端是否正常运行', 'network'); }
  if (!response.ok) {
    const code = [401, 403].includes(response.status) ? 'auth' : response.status === 429 ? 'rate_limit' : 'network';
    throw new AdapterError(code === 'auth' ? '登录已失效或接口拒绝访问，请在官方客户端重新登录后重试' : `额度服务返回 HTTP ${response.status}，稍后重试`, code);
  }
  const chunks = []; let size = 0;
  try {
    for await (const chunk of response.body) { size += chunk.length; if (size > 512 * 1024) throw new AdapterError('额度响应超出大小限制', 'schema'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { if (error instanceof AdapterError) throw error; throw new AdapterError('额度服务返回了无法识别的数据', 'schema'); }
}

let kimiChild, kimiConfig, starting;
async function freePort() {
  const server = createServer();
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}
export async function startKimi() {
  if (kimiConfig && kimiChild?.exitCode === null && !kimiChild.killed) return kimiConfig;
  if (starting) return starting;
  starting = (async () => {
    const base = join(homedir(), '.kimi-code'), executable = join(base, 'bin/kimi');
    try { await access(executable); } catch { throw new AdapterError('未安装 Kimi Code 官方客户端，请先安装并登录', 'missing'); }
    const port = await freePort();
    const env = { HOME: homedir(), PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'en_US.UTF-8', DO_NOT_TRACK: '1' };
    for (const key of ['TMPDIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS']) if (process.env[key]) env[key] = process.env[key];
    kimiChild = spawn(executable, ['web', '--host', '127.0.0.1', '--port', String(port), '--no-open', '--log-level', 'silent'], {
      stdio: 'ignore', shell: false, env
    });
    let failed = false; kimiChild.on('error', () => { failed = true; });
    for (let i = 0; i < 60; i++) {
      if (failed || kimiChild.exitCode !== null) break;
      try {
        const health = await fetch(`http://127.0.0.1:${port}/api/v1/healthz`, { signal: AbortSignal.timeout(600), redirect: 'error' });
        if (health.ok && (await health.json())?.data?.ok === true) {
          const token = (await readFile(join(base, 'server.token'), 'utf8')).trim();
          if (token && !/[\r\n]/.test(token)) return kimiConfig = { port, token };
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    closeLocalClients(); throw new AdapterError('Kimi 官方额度服务启动失败，请先确认 Kimi Code 能正常打开', 'unavailable');
  })();
  try { return await starting; } finally { starting = null; }
}
export async function fetchLocalKimi(account) {
  const { port, token } = await startKimi();
  const headers = { Authorization: `Bearer ${token}` };
  const payload = await requestJSON(`http://127.0.0.1:${port}/api/v1/oauth/usage`, { headers });
  const result = decodeKimi(account, payload);
  try {
    const info = await requestJSON(`http://127.0.0.1:${port}/api/v1/oauth/userinfo`, { headers });
    const plan = info?.data?.userInfo?.userLevelName;
    if (typeof plan === 'string') result.plan = plan.slice(0, 60);
  } catch {}
  return result;
}
export async function cursorCookie() {
  let db;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    db = new DatabaseSync(join(homedir(), 'Library/Application Support/Cursor/User/globalStorage/state.vscdb'), { readOnly: true });
    const raw = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get('cursorAuth/accessToken')?.value;
    const token = typeof raw === 'string' ? raw : raw ? Buffer.from(raw).toString('utf8') : '';
    if (!token || /[\r\n]/.test(token)) throw new Error();
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const user = claims.sub?.split('|').at(-1);
    if (!user || !/^[a-zA-Z0-9._-]+$/.test(user) || claims.exp * 1000 <= Date.now() + 60_000) throw new Error();
    return `WorkosCursorSessionToken=${user}%3A%3A${token}`;
  } catch { throw new AdapterError('未找到有效的 Cursor 登录，请打开 Cursor 并登录后重试', 'auth'); }
  finally { db?.close(); }
}
export async function cursorRequest(path, method = 'GET') {
  if (!['/api/usage-summary', '/api/dashboard/get-sand-usage-status'].includes(path)) throw new Error('Unexpected quota path');
  return requestJSON(`https://cursor.com${path}`, { method, headers: { Cookie: await cursorCookie(), Accept: 'application/json', Origin: 'https://cursor.com', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}) });
}
export function closeLocalClients() {
  if (kimiChild && kimiChild.exitCode === null) {
    const child = kimiChild; child.kill('SIGTERM');
    const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 2000); timer.unref();
  }
  kimiConfig = null; kimiChild = null;
}
process.once('exit', closeLocalClients);
