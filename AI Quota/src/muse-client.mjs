import { AdapterError, baseSnapshot } from './adapters.mjs';
import { runQuotaBrowser } from './tabbit-quota.mjs';

// Read-only Next.js server action exported as fetchSubscriptionAction by Muse's
// official public client. includeAgreement:false omits payment agreement data.
// No auth headers or cookies leave the browser. On a deploy/schema change this
// adapter fails closed, retaining the previous snapshot in the service.
const MUSE_QUERY = `
const response = await page.fetch("https://muse.ai/", {
  method: "POST", as: "text",
  headers: {"Next-Action":"4038929ccb11928307cbc571f3bce03554b86038e2", "Content-Type":"text/plain;charset=UTF-8", "Accept":"text/x-component"},
  body: JSON.stringify([{includeAgreement:false}])
});
if (!response.ok) return {status:response.status};
const records=(response.text||"").split("\\n").flatMap(line=>{try{return [JSON.parse(line.slice(line.indexOf(":")+1))];}catch{return [];}});
const record=records.find(x=>x?.subscription), s=record?.subscription;
if (!record?.success || !s) return {status:502};
return {status:200, observedAt:new Date().toISOString(),
  plan: typeof s.tier?.name === "string" ? s.tier.name.slice(0,60) : "",
  usage:s.usage?{percentUsed:s.usage.percentUsed,resetsAt:s.usage.resetsAt,state:s.usage.state}:null,
  cadence:typeof s.statusSubtitle === "string" ? s.statusSubtitle.slice(0,100) : "",
  topupBalance:s.topupBalance,topupTotal:s.topupTotal};
`;

export function decodeMuse(account, data) {
  if ([401, 403].includes(data?.status)) throw new AdapterError('请在 Tabbit 中登录 Muse.ai 后重新刷新', 'auth');
  const usage = data?.usage, used = usage?.percentUsed;
  if (data?.status !== 200 || usage?.state !== 'METERED' || typeof used !== 'number' || !Number.isFinite(used) || used < 0 || !Number.isFinite(Date.parse(data.observedAt))) {
    throw new AdapterError('Muse.ai 未返回有效额度，请核对官网登录；若官网正常，可能是接口已更新', 'schema');
  }
  const bucket = /\bweekly\b|每周|周限额|週限額/i.test(data.cadence) ? 'week' : /\bmonthly\b|每月|月限额|月限額/i.test(data.cadence) ? 'month' : 'other';
  const resetsAt = typeof usage.resetsAt === 'number' && Number.isFinite(usage.resetsAt) && usage.resetsAt > 0
    ? new Date(usage.resetsAt * 1000).toISOString() : null;
  const pools = [{id:'subscription',bucket,label:'订阅额度',usedPercent:used,resetsAt,boundaryKind:'reset'}];
  if (typeof data.topupTotal === 'number' && data.topupTotal > 0 && typeof data.topupBalance === 'number' && data.topupBalance >= 0 && data.topupBalance <= data.topupTotal) {
    // Muse's internal top-up units are not tokens. Only their ratio is portable.
    pools.push({id:'extra-tokens',bucket:'other',label:'额外 tokens',remainingPercent:100*data.topupBalance/data.topupTotal,resetsAt:null,boundaryKind:'expiry'});
  }
  const result = baseSnapshot(account, 'muse', pools, Date.parse(data.observedAt));
  if (bucket !== 'other') result.coverage = { h5: 'not_applicable', week: bucket === 'week' ? 'unknown' : 'not_applicable', month: bucket === 'month' ? 'unknown' : 'not_applicable' };
  result.plan = typeof data.plan === 'string' ? data.plan.slice(0,60) : account.plan;
  result.connection.message = '通过 Tabbit 的 Muse.ai 登录读取。额外 tokens 单独展示，不并入周期额度。';
  return result;
}

export async function fetchMuse(account) {
  return decodeMuse(account, await runQuotaBrowser('muse', MUSE_QUERY));
}
