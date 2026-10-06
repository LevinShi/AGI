import { createHash, createDecipheriv } from 'node:crypto';
import { homedir, platform, userInfo } from 'node:os';
import { join } from 'node:path';
import { readJSON, requestJSON } from './local-clients.mjs';
import { AdapterError } from './adapters.mjs';

// Read only the Coding Plan entry in ZCode's own credential format (client 0.16.9).
// No credential export, file changes, OAuth refresh, or browser storage access.
export function openZCodeCredential(value, secret) {
  if (typeof value !== 'string') throw new Error('Invalid credential');
  if (!value.startsWith('enc:v1:')) return value;
  const parts = value.slice(7).split('.');
  if (parts.length !== 3) throw new Error('Unsupported credential format');
  const [iv, tag, encrypted] = parts.map(x => Buffer.from(x, 'base64url'));
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid credential format');
  const key = createHash('sha256').update(secret).digest();
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, iv); cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8');
  } finally { key.fill(0); }
}
export async function zcodePayload() {
  let token;
  try {
    const saved = await readJSON(join(homedir(), '.zcode/v2/credentials.json'));
    const entries = Object.entries(saved).filter(([k]) => k.startsWith('account-provider:coding-plan:account:bigmodel-individual-coding-plan:account:') && k.endsWith(':api-key'));
    if (entries.length !== 1) throw new Error('Ambiguous account');
    token = openZCodeCredential(entries[0][1], process.env.ZCODE_CREDENTIAL_SECRET || `zcode-credential-fallback:${platform()}:${homedir()}:${userInfo().username}`);
    if (!token || token.length > 4096 || /[\r\n]/.test(token)) throw new Error('Invalid credential');
  } catch { throw new AdapterError('未能读取 ZCode 的个人 Coding Plan 登录，请在 ZCode 中确认已连接智谱个人订阅', 'auth'); }
  const data = await requestJSON('https://open.bigmodel.cn/api/monitor/usage/quota/limit', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (data?.success !== true || data.code !== 200) throw new AdapterError('智谱拒绝额度查询，请在 ZCode 中确认个人 Coding Plan 可用后重试', 'auth');
  return data;
}
