import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = p => resolve(root, p);
await mkdir(file('design/archive'), { recursive: true });
for (const name of ['mvp-design.md', 'mvp-prototype.html']) {
  const archive = file(`design/archive/${name.replace(/(\.[^.]+)$/, '-v0.1$1')}`);
  try { await access(archive); } catch { try { await copyFile(file(`design/${name}`), archive); } catch {} }
}
const pieces = await Promise.all(['src/catalog.js', 'src/domain.js', 'src/demo.js', 'public/app.js'].map(p => readFile(file(p), 'utf8')));
const script = pieces.map(s => s.replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '')).join('\n');
const css = await readFile(file('public/styles.css'), 'utf8');
let html = await readFile(file('public/index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="/styles.css">', `<style>${css}</style>`).replace('<script type="module" src="/app.js"></script>', `<script>(()=>{\n${script.replace(/<\/script/gi, '<\\/script')}\n})();</script>`).replace('__QUOTA_TOKEN__', 'offline-preview').replace('href="/design"', 'href="./mvp-design.md"');
await writeFile(file('design/mvp-prototype.html'), html);
console.log('Built design/mvp-prototype.html (self-contained offline preview).');
