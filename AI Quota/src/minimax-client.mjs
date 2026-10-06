import { createConnection } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readJSON, requestJSON } from './local-clients.mjs';
import { AdapterError } from './adapters.mjs';

// MiniMax Code's documented local lease broker owns token refresh and file locking.
async function leaseToken() {
  const run = join(homedir(), '.minimax/run'), capFile = join(run, 'mcode-auth-lease-v1.cap');
  const meta = await stat(capFile);
  if (meta.uid !== process.getuid() || (meta.mode & 0o077)) throw new Error('Unsafe capability permissions');
  const capability = (await readFile(capFile, 'utf8')).trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(capability)) throw new Error('Invalid capability');
  const requestId = randomUUID();
  const body = Buffer.from(JSON.stringify({ version: 1, requestId, capability, method: 'lease', minValidityMs: 60_000 }));
  const prefix = Buffer.alloc(4); prefix.writeUInt32BE(body.length);
  return new Promise((resolve, reject) => {
    const socket = createConnection(join(run, 'mcode-auth-lease-v1.sock')); let bytes = Buffer.alloc(0), done = false;
    const finish = (error, token) => { if (done) return; done = true; clearTimeout(timer); socket.destroy(); error ? reject(new Error('Official authentication broker unavailable')) : resolve(token); };
    const timer = setTimeout(() => finish(true), 12_000);
    socket.on('error', () => finish(true)); socket.on('end', () => finish(true));
    socket.on('connect', () => socket.write(Buffer.concat([prefix, body])));
    socket.on('data', chunk => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length > 65540) return finish(true);
      if (bytes.length < 4) return;
      const length = bytes.readUInt32BE();
      if (length < 1 || length > 65536) return finish(true);
      if (bytes.length < length + 4) return;
      try {
        const msg = JSON.parse(bytes.subarray(4, length + 4).toString());
        if (msg.version !== 1 || msg.requestId !== requestId || msg.ok !== true || msg.result?.method !== 'lease' || msg.result.audience !== 'agent-backend' || msg.result.expiresAtMs <= Date.now() || typeof msg.result.accessToken !== 'string' || /[\r\n]/.test(msg.result.accessToken)) return finish(true);
        finish(false, msg.result.accessToken);
      } catch { finish(true); }
    });
  });
}
async function credentials() {
  // Use only the official production auth directory; never search arbitrary files.
  for (const region of ['cn', 'en']) {
    const directory = join(homedir(), '.minimax/auth/prod', region, 'mcode-public');
    try {
      const state = await readJSON(join(directory, 'auth-state.json'));
      if (state.region !== region || state.buildEnv !== 'prod') continue;
      try { return { region, token: await leaseToken() }; } catch {}
      const saved = await readJSON(join(directory, 'auth.json'));
      const record = Object.values(saved.records || {}).find(r => typeof r.accessToken === 'string' && r.expiresAtMs > Date.now() + 60_000 && !/[\r\n]/.test(r.accessToken));
      if (record) return { region, token: record.accessToken };
    } catch {}
  }
  throw new AdapterError('请打开 MiniMax Code 并保持登录，然后点击重试；App 将复用官方登录，无需填写 token', 'auth');
}
const md5 = s => createHash('md5').update(s).digest('hex');
export async function minimaxPayload() {
  const { token, region } = await credentials();
  const origin = region === 'cn' ? 'https://agent.minimaxi.com' : 'https://agent.minimax.io';
  async function matrix(path, payload, userId = '0') {
    const now = Date.now(), second = Math.floor(now / 1000), body = payload === undefined ? undefined : JSON.stringify(payload);
    const url = new URL(path, origin);
    url.search = new URLSearchParams({ device_platform: 'mcode', biz_id: '3', app_id: '3001', version_code: '22201', unix: String(now), timezone_offset: '28800', sys_language: region === 'cn' ? 'zh' : 'en', lang: region === 'cn' ? 'zh' : 'en', device_id: '0', os_name: process.platform, browser_name: 'mcode', user_id: String(userId), client: 'mcode' });
    // Wire constants documented in MiniMax's open source client; authorization is the bearer token.
    const data = await requestJSON(url, { method: body === undefined ? 'GET' : 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'QuotaDesk/0.3', Authorization: `Bearer ${token}`, yy: md5(`${encodeURIComponent(url.pathname + url.search)}_${body || '{}'}${md5(String(now))}ooui`), 'x-timestamp': String(second), 'x-signature': md5(`${second}I*7Cf%WZ#S&%1RlZJ&C2${body || ''}`) }, ...(body ? { body } : {}) });
    if ((data.statusInfo?.code ?? 0) !== 0 || (data.base_resp?.status_code ?? 0) !== 0) throw new AdapterError('MiniMax 账户接口未返回成功，请在 MiniMax Code 中确认登录', 'auth');
    return data.data || data;
  }
  const identity = await matrix('/v1/api/user/info');
  const userId = identity.userInfo?.realUserID || identity.user_info?.real_user_id;
  if (!userId) throw new AdapterError('MiniMax 账户标识缺失，暂不能查询订阅', 'schema');
  const extra = await matrix('/matrix/api/v1/user/get_user_extra_info', {}, userId);
  const workspace = extra.workspaces?.find(w => w.workspace_type === 0);
  if (!workspace?.op_group_id) throw new AdapterError('MiniMax 未返回个人 Token Plan 账户，请核对所登录的账户', 'schema');
  let plan = workspace.token_plan_tier;
  try { plan = (await matrix('/matrix/api/v1/commerce/get_membership_info', { workspace_id: workspace.workspace_id }, userId)).token_plan_tier || plan; } catch {}
  const host = region === 'cn' ? 'https://www.minimaxi.com' : 'https://platform.minimax.io';
  const quota = await requestJSON(`${host}/v1/api/openplatform/coding_plan/remains`, { headers: { Authorization: `Bearer ${token}`, 'X-Group-Id': String(workspace.op_group_id), Accept: 'application/json' } });
  return { quota, plan: typeof plan === 'string' ? plan : '' };
}
