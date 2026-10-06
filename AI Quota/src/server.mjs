import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createService } from './service.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = { '/': ['public/index.html', 'text/html; charset=utf-8'], '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'], '/styles.css': ['public/styles.css', 'text/css; charset=utf-8'], '/domain.js': ['src/domain.js', 'text/javascript; charset=utf-8'], '/catalog.js': ['src/catalog.js', 'text/javascript; charset=utf-8'], '/demo.js': ['src/demo.js', 'text/javascript; charset=utf-8'], '/design': ['design/desktop-v0.4.md', 'text/plain; charset=utf-8'] };
export async function createQuotaServer({ port = 0, dataPath = resolve(root, '.local/quotas.json'), adapters } = {}) {
  const service = await createService(dataPath, adapters), token = randomBytes(32).toString('hex');
  let actualPort = port;
  const server = http.createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${actualPort}`;
    const security = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" };
    const send = (status, payload, type = 'application/json; charset=utf-8') => { res.writeHead(status, { ...security, 'Content-Type': type }); res.end(type.startsWith('application/json') ? JSON.stringify(payload) : payload); };
    if (req.headers.host !== `127.0.0.1:${actualPort}` || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') { send(403, { error: '来源不被允许' }); return; }
    const path = new URL(req.url, origin).pathname;
    if (path.startsWith('/api/')) {
      const provided = req.headers['x-quota-token'];
      if (typeof provided !== 'string' || !/^[a-f0-9]{64}$/.test(provided) || !timingSafeEqual(Buffer.from(provided), Buffer.from(token))) { send(401, { error: '需要本地页面授权，请重新打开页面' }); return; }
      if (req.method === 'GET' && path === '/api/snapshot') { send(200, service.snapshot()); return; }
      if (req.method !== 'POST' || req.headers['content-type']?.split(';')[0] !== 'application/json') { send(405, { error: '请求方法不被允许' }); return; }
      try {
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 256 * 1024) { send(413, { error: '数据过大' }); req.resume(); return; } chunks.push(chunk); }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        if (path === '/api/manual') await service.manual(body.account);
        else if (path === '/api/add') await service.add(body.providerId, body.alias);
        else if (path === '/api/pin') await service.pin(body.id, body.pinned);
        else if (path === '/api/reorder') await service.reorder(body.ids);
        else if (path === '/api/remove') await service.remove(body.id);
        else if (path === '/api/import') await service.import(body.id, body.payload);
        else if (path === '/api/connect') await service.connect(body.id, body.type);
        else if (path === '/api/disconnect') await service.disconnect(body.id);
        else if (path === '/api/refresh-all') await service.refreshAll();
        else if (path === '/api/refresh') await service.refresh(body.id);
        else { send(404, { error: '接口不存在' }); return; }
        send(200, service.snapshot());
      } catch (error) { send(400, { error: error instanceof SyntaxError ? 'JSON 格式无效' : error.message?.slice(0, 180) || '操作失败' }); }
      return;
    }
    if (req.method !== 'GET' || !assets[path]) { send(404, { error: '页面不存在' }); return; }
    try { const [file, type] = assets[path]; let content = await readFile(resolve(root, file), 'utf8'); if (path === '/') content = content.replace('__QUOTA_TOKEN__', token); send(200, content, type); }
    catch { send(500, { error: '界面文件尚未准备好' }); }
  });
  server.requestTimeout = 35_000; server.headersTimeout = 10_000;
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); }); actualPort = server.address().port;
  void service.tick();
  const timer = setInterval(() => service.tick(), 30_000); timer.unref();
  return { server, service, port: actualPort, async close() { clearInterval(timer); service.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.QUOTA_PORT || 4318);
  if (!Number.isInteger(port) || (port !== 0 && port < 1024) || port > 65535) throw new Error('QUOTA_PORT 必须是 0 或 1024–65535 的端口');
  const app = await createQuotaServer({ port, ...(process.env.QUOTA_SMOKE === '1' ? { adapters: {} } : {}), ...(process.env.QUOTA_DATA_PATH ? { dataPath: resolve(process.env.QUOTA_DATA_PATH) } : {}) });
  console.log(`Quota Desk: http://127.0.0.1:${app.port}`);
  process.on('SIGINT', () => app.close().then(() => process.exit(0)));
  process.on('SIGTERM', () => app.close().then(() => process.exit(0)));
  const parent = Number(process.env.QUOTA_PARENT_PID);
  if (Number.isInteger(parent) && parent > 1) {
    const watchdog = setInterval(() => {
      try { process.kill(parent, 0); }
      catch (error) { if (error.code === 'ESRCH') app.close().then(() => process.exit(0)); }
    }, 3000);
    watchdog.unref();
  }
}
