// Publish only this allowlist: never copy the development workspace wholesale.
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=resolve(root,'dist/source/quota-desk');
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
for(const name of ['src','public','desktop','test','LICENSES','README.md','RELEASE_NOTES.md','LICENSE','THIRD_PARTY_NOTICES.md','package.json','.gitignore']) await cp(resolve(root,name),resolve(target,name),{recursive:true});
await mkdir(resolve(target,'scripts'),{recursive:true});
for(const name of ['build-desktop.mjs','build-preview.mjs','draw-icon.swift','package-release.mjs','export-source.mjs']) await cp(resolve(root,'scripts',name),resolve(target,'scripts',name));
console.log(`Clean source exported to ${target}`);
