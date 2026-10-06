import { initialAccounts } from './catalog.js';
export function demoAccounts(now = Date.now(), scenario = 'normal') {
  const all = initialAccounts();
  const inHours = h => new Date(now + h * 3600_000).toISOString();
  const set = (id, plan, windows, absent = []) => {
    const a = all.find(a => a.id === id); a.plan = plan; a.source = 'demo'; a.observedAt = new Date(now - 60_000).toISOString(); a.connection = { type: 'none', status: 'ready' };
    a.pools = windows.map(([bucket, n, hours, scope = '']) => ({ id: `${id}-${bucket}-${scope}`, bucket, label: scope || ({ h5: '5 小时', week: '周', month: '月' }[bucket]), scope, remainingPercent: n, resetsAt: inHours(hours), boundaryKind: 'reset' }));
    absent.forEach(b => a.coverage[b] = 'not_applicable');
  };
  set('chatgpt', 'Pro · 示例', [['h5', 72, 2.7], ['week', 36, 54]], ['month']);
  set('cursor', 'Pro · 示例', [['month', 44, 288]], ['h5', 'week']);
  set('muse', '会员 · 示例', [['week', 63, 80]], ['h5', 'month']);
  set('grokbot', '套餐待确认', [], []);
  set('zcode', 'Coding Plan · 示例', [['h5', 81, 3], ['week', 52, 68], ['month', 67, 360]]);
  set('kimi', '综合会员 · 示例', [['h5', 48, 1.4], ['week', 67, 42], ['month', 21, 240, '总池'], ['month', 58, 240, 'Code']]);
  set('minimax', 'Token Plan · 示例', [['h5', 84, 3.1], ['week', 58, 92]], ['month']);
  set('gemini', 'Pro · 示例', [['h5', 61, 2], ['week', 42, 76]], ['month']);
  const y = all.find(a => a.id === 'youmind'); y.plan = '会员 · 示例'; y.source = 'manual'; y.connection = { type: 'manual', status: 'ready' }; y.observedAt = new Date(now - 3600_000).toISOString();
  y.pools = [{ id: 'credits', bucket: 'other', label: '积分余额', remaining: 1200, unit: '积分', boundaryKind: 'expiry', resetsAt: inHours(480) }];
  if (scenario === 'low') { all.find(a => a.id === 'chatgpt').pools[0].remainingPercent = 4; all.find(a => a.id === 'minimax').pools[1].remainingPercent = 12; }
  if (scenario === 'stale') { const a = all.find(a => a.id === 'kimi'); a.observedAt = new Date(now - 18 * 60_000).toISOString(); a.connection = { type: 'kimi', status: 'error', message: '连接中断，保留上次成功读取的数据' }; }
  if (scenario === 'reset') all.find(a => a.id === 'chatgpt').pools[0].resetsAt = new Date(now - 60_000).toISOString();
  return all;
}
