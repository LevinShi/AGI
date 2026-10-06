export const PROVIDERS = [
  { id: 'chatgpt', name: 'ChatGPT', mark: 'G', scope: 'Codex / Work', url: 'https://chatgpt.com/', connector: 'codex' },
  { id: 'cursor', name: 'Cursor', mark: 'C', scope: '个人订阅', url: 'https://cursor.com/dashboard', connector: 'cursor' },
  { id: 'muse', name: 'Muse.ai', mark: 'Mu', scope: '个人 AI 助手', url: 'https://muse.ai/', connector: 'muse' },
  { id: 'grokbot', name: 'Grok Bot', mark: 'X', scope: '通过 Cursor 账户读取', url: 'https://x.ai/bot', connector: 'grokbot' },
  { id: 'zcode', name: 'ZCode', mark: 'Z', scope: '智谱', url: 'https://bigmodel.cn/coding-plan/personal/usage', connector: 'zcode' },
  { id: 'kimi', name: 'Kimi', mark: 'K', scope: '综合会员 · Code / Work', url: 'https://www.kimi.com/', connector: 'kimi' },
  { id: 'youmind', name: 'YouMind', mark: 'Y', scope: '创作会员', url: 'https://youmind.com/', connector: 'youmind' },
  { id: 'minimax', name: 'MiniMax', mark: 'M', scope: 'Token / M Plan', url: 'https://platform.minimaxi.com/subscribe/coding-plan', connector: 'minimax' },
  { id: 'gemini', hidden: true, name: 'Gemini', mark: 'Ge', scope: 'Pro 网页会员', url: 'https://gemini.google.com/' },
  { id: 'claude', name: 'Claude', mark: 'A', scope: '扩展账户', url: 'https://claude.ai/' },
  { id: 'opencode', name: 'OpenCode Go', mark: 'O', scope: '扩展账户', url: 'https://opencode.ai/' }
];
export const providerVisible = id => !PROVIDERS.find(p => p.id === id)?.hidden;
export const WINDOWS = [{ id: 'h5', label: '5 小时' }, { id: 'week', label: '周' }, { id: 'month', label: '月' }];
// Stable first-run order: coding/work tools, then general and creative tools.
export const DEFAULT_ORDER = ['chatgpt', 'cursor', 'kimi', 'minimax', 'zcode', 'gemini', 'grokbot', 'youmind', 'muse', 'claude', 'opencode'];
export const MARKS = { chatgpt: 'CG', cursor: 'Cr', kimi: 'Ki', minimax: 'Mx', zcode: 'Z', gemini: 'Ge', grokbot: 'Gr', youmind: 'Ym', muse: 'Mu', claude: 'Cl', opencode: 'Oc' };
export function recommendedOrder(accounts) {
  return [...accounts].sort((a, b) => DEFAULT_ORDER.indexOf(a.providerId) - DEFAULT_ORDER.indexOf(b.providerId));
}
export function reorderAccounts(accounts, ids) {
  if (!Array.isArray(ids) || ids.length !== accounts.length || new Set(ids).size !== accounts.length || ids.some(id => !accounts.some(a => a.id === id))) throw new Error('账户列表已变化，请刷新后重新排序');
  const byId = new Map(accounts.map(a => [a.id, a]));
  return ids.map(id => byId.get(id));
}
export function initialAccounts() {
  return recommendedOrder(PROVIDERS.slice(0, 9).map(p => ({ id: p.id, providerId: p.id, alias: '主账户', plan: '', pinned: ['chatgpt', 'kimi', 'minimax'].includes(p.id), source: 'none', observedAt: null, coverage: { h5: 'unknown', week: 'unknown', month: 'unknown' }, pools: [], connection: { type: 'none', status: 'disconnected' } })));
}
