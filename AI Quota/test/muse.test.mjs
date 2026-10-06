import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMuse } from '../src/muse-client.mjs';
import { percentOf } from '../src/domain.js';
import { initialAccounts } from '../src/catalog.js';
const account = initialAccounts().find(a=>a.providerId==='muse');
const sample = {status:200,observedAt:'2030-06-05T12:00:00Z',plan:'Muse Free',usage:{percentUsed:0,resetsAt:1907280000,state:'METERED'},cadence:'Weekly limit resets on Jun 10',topupBalance:1000,topupTotal:1000};
test('Muse weekly usage and non-expiring extras remain distinct, without treating internal units as tokens',()=>{
  const result=decodeMuse(account,sample);
  assert.equal(result.pools[0].bucket,'week'); assert.equal(percentOf(result.pools[0]),100);
  assert.equal(result.pools[0].resetsAt,new Date(1907280000000).toISOString());
  assert.equal(result.pools[1].bucket,'other'); assert.equal(result.pools[1].remaining,undefined);
  assert.equal(percentOf(result.pools[1]),100); assert.equal(result.pools[1].boundaryKind,'expiry');
});
test('Muse unknown cadence is not invented and malformed reads cannot become zero usage',()=>{
  assert.equal(decodeMuse(account,{...sample,cadence:'Unknown'}).pools[0].bucket,'other');
  assert.throws(()=>decodeMuse(account,{...sample,usage:{state:'METERED'}}),{code:'schema'});
  assert.throws(()=>decodeMuse(account,{status:401}),{code:'auth'});
});
