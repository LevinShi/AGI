import { mkdir, cp, writeFile, realpath, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin') throw new Error('This native desktop build requires macOS.');
const release = process.argv.includes('--release');
const app = resolve(root, release ? 'dist/release/Quota Desk.app' : 'dist/Quota Desk.app'), contents = resolve(app, 'Contents'), resources = resolve(contents, 'Resources');
if (release) await rm(app, { recursive: true, force: true });
await mkdir(resolve(contents, 'MacOS'), { recursive: true });
await mkdir(resolve(root, '.local/swift-cache'), { recursive: true });
await mkdir(resolve(resources, 'app'), { recursive: true });
await mkdir(resolve(root, 'design/native-qa'), { recursive: true });
for (const dir of ['public', 'src']) await cp(resolve(root, dir), resolve(resources, 'app', dir), { recursive: true });
await mkdir(resolve(resources, 'app/design'), { recursive: true });
await cp(resolve(root,'README.md'),resolve(resources,'app/design/desktop-v0.4.md'));
await cp(resolve(root, 'package.json'), resolve(resources, 'app/package.json'));
let codex;
try { codex = execFileSync('/usr/bin/which', ['codex'], { encoding: 'utf8' }).trim(); } catch {}
if (release) {
  const runtime = resolve(resources, 'runtime/bin'); await mkdir(runtime, { recursive: true });
  await cp(await realpath(process.execPath), resolve(runtime, 'node'));
  const nodeLicense = resolve(dirname(await realpath(process.execPath)), '../LICENSE');
  await cp(nodeLicense, resolve(resources, 'NODE-LICENSE.txt'));
  await cp(resolve(root,'LICENSES'),resolve(resources,'LICENSES'),{recursive:true});
  for (const name of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) await cp(resolve(root,name), resolve(resources,name));
  await cp(resolve(root,'README.md'),resolve(resources,'app/design/desktop-v0.4.md'));
  await writeFile(resolve(resources,'runtime.json'), '{}');
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', resolve(runtime,'node')]);
} else {
  await writeFile(resolve(resources, 'runtime.json'), JSON.stringify({ node: await realpath(process.execPath), legacyData: resolve(root, '.local/quotas.json'), smokeData: resolve(root, '.local/desktop-smoke'), smokeOutput: resolve(root, 'design/native-qa'), ...(codex ? { codex } : {}) }));
}
await writeFile(resolve(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>Quota Desk</string><key>CFBundleDisplayName</key><string>Quota Desk</string><key>CFBundleIdentifier</key><string>local.quota-desk</string><key>CFBundleExecutable</key><string>QuotaDesk</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.5.0</string><key>CFBundleVersion</key><string>5</string><key>CFBundleIconFile</key><string>QuotaDesk.icns</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>LSUIElement</key><false/><key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>`);
const iconset = resolve(root, '.local/QuotaDesk.iconset');
execFileSync('/usr/bin/swift', ['-module-cache-path', resolve(root, '.local/swift-cache'), resolve(root, 'scripts/draw-icon.swift'), iconset], { stdio: 'inherit' });
execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', resolve(resources, 'QuotaDesk.icns')]);
execFileSync('/usr/bin/swiftc', ['-O', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx13.0`, '-module-cache-path', resolve(root, '.local/swift-cache'), '-framework', 'AppKit', '-framework', 'WebKit', resolve(root, 'desktop/QuotaDesk.swift'), '-o', resolve(contents, 'MacOS/QuotaDesk')], { stdio: 'inherit' });
execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', app], { stdio: 'inherit' });
console.log(`Built ${app}\n${release ? 'Includes Node.js; no personal data or source-machine paths.' : 'Development build uses this Mac’s Node.js.'}`);
