import { PROVIDERS, WINDOWS, MARKS, providerVisible, initialAccounts, recommendedOrder, reorderAccounts } from './catalog.js';
import { projectAccount, percentOf, formatPercent, timeLabel, ageLabel, cleanAccount, bucketOf, beijingTime, beijingInput, fromBeijingInput } from './domain.js';
import { demoAccounts } from './demo.js';

const el = id => document.getElementById(id);
const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const localBackend = location.protocol === 'http:' && location.hostname === '127.0.0.1';
const nativeBridge = window.webkit?.messageHandlers?.quota;
const nativeAction = (action, extra = {}) => nativeBridge?.postMessage({ action, ...extra });
if (nativeBridge) document.body.classList.add('native');
const authToken = document.querySelector('meta[name="quota-token"]').content;
const storageKey = 'quota-desk-records-v1';
const ui = { accounts: initialAccounts(), demo: !localBackend, examples: demoAccounts(), filter: 'all', search: '', compact: false, refreshing: new Set(), pending: new Set() };
let returnFocus, toastTimer, pollTimer;
const provider = id => PROVIDERS.find(p => p.id === id) || { name: id, mark: '?', scope: '', url: '#' };
const sourceName = a => ({ none: '未接入', manual: '手动记录', codex: '官方客户端', kimi: 'Kimi 实读', youmind: 'YouMind 实读', muse: 'Muse.ai 实读', cursor: 'Cursor 实读', grokbot: 'Grok Bot 实读', minimax: 'MiniMax 实读', zcode: 'ZCode 实读', codexbar: '导入快照', demo: '示例' }[a.source] || '未知来源');
const allAccounts = () => ui.demo ? ui.examples : ui.accounts;
const displayAccounts = () => allAccounts().filter(a => providerVisible(a.providerId));
const accountById = id => displayAccounts().find(a => a.id === id);
const fullTime = iso => beijingTime(iso, true);
function notify(message) { el('toast').textContent = message; el('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el('toast').classList.remove('show'), 4200); }
function saveLocal() { try { localStorage.setItem(storageKey, JSON.stringify({ orderCustomized: true, accounts: ui.accounts.map(cleanAccount) })); } catch { notify('浏览器未允许持久保存，当前修改只保留到本页关闭。'); } }
async function api(path, data) {
  const response = await fetch(path, { method: data === undefined ? 'GET' : 'POST', headers: { 'X-Quota-Token': authToken, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '操作失败'); return result;
}
async function mutate(path, data, localAction) {
  if (ui.demo) { if (!localAction) throw new Error('当前是示例模式，请先切换到“我的记录”再连接真实账号。'); ui.examples = localAction(ui.examples); }
  else if (localBackend) { const result = await api(path, data); ui.accounts = result.accounts; ui.refreshing = new Set(result.refreshing || []); }
  else { if (!localAction) throw new Error('此功能需要本地服务。请在项目目录运行 npm start，再打开 http://127.0.0.1:4318。'); ui.accounts = localAction(ui.accounts); saveLocal(); }
  render();
}
function statusText(a) {
  if (a.connection.status === 'connecting') return '连接中';
  if (a.connection.status === 'auth_required') return '需在官方客户端登录';
  if (a.connection.status === 'error' && !a.observedAt) return '读取失败';
  if (a.stale) return '上次值 · ' + ageLabel(a.observedAt);
  if (!a.observedAt) return sourceName(a);
  return sourceName(a) + ' · ' + ageLabel(a.observedAt);
}
function poolHTML(p) {
  const stale = p.freshness !== 'current';
  if (p.percent === null) return `<div class="pool"><span class="unknown">未知</span>${p.scope ? `<div class="micro">${safe(p.scope)}</div>` : ''}</div>`;
  return `<div class="pool ${stale ? 'stale' : p.percent < 5 ? 'critical' : p.percent < 20 ? 'low' : ''}" title="${safe(p.label)}；${safe(p.resetsAt ? fullTime(p.resetsAt) : '恢复时间未知')}"><div class="value-line">${p.scope ? `<span class="scope">${safe(p.scope)}</span>` : ''}<strong>${formatPercent(p.percent)}</strong></div><span class="bar" aria-hidden="true"><i style="width:${p.percent}%"></i></span>${p.limit != null && (p.used != null || p.remaining != null) ? `<div class="micro">已用 ${safe(Number(p.used ?? (p.limit - p.remaining)).toLocaleString('zh-CN', { maximumFractionDigits: 2 }))} / ${safe(Number(p.limit).toLocaleString('zh-CN'))}</div>` : ''}${stale ? `<div class="micro">${p.freshness === 'awaiting_refresh' ? '到点待刷新' : '上次值'}</div>` : ''}</div>`;
}
function render() {
  if (ui.dragId) return;
  const projected = displayAccounts().map(a => projectAccount(a));
  const rows = projected.filter(a => (ui.filter !== 'pinned' || a.pinned) && (ui.filter !== 'attention' || a.needsAttention));
  el('accountCount').textContent = projected.length;
  el('attentionCount').textContent = projected.filter(a => a.needsAttention).length;
  el('demoNotice').hidden = !ui.demo;
  el('modeLabel').textContent = ui.demo ? '示例数据' : localBackend ? '本机运行' : '离线记录';
  el('demoButton').hidden = ui.demo;
  el('app').classList.toggle('collapsed', ui.compact);
  el('expandedView').hidden = ui.compact;
  el('collapsedBar').hidden = !ui.compact;
  el('compactButton').textContent = ui.compact ? '+' : '−';
  el('compactButton').setAttribute('aria-label', ui.compact ? '展开悬浮窗' : '收缩悬浮窗');
  el('compactButton').title = ui.compact ? '展开面板' : '收缩为小条';
  document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active', b.dataset.filter === ui.filter); b.setAttribute('aria-pressed', String(b.dataset.filter === ui.filter)); });
  const favorites = projected.filter(a => a.pinned);
  el('collapsedBar').innerHTML = (favorites.length ? favorites : projected).slice(0, 3).map(a => {
    const pool = a.cells.h5.pools[0] || a.cells.week.pools[0] || a.cells.month.pools[0];
    return `<button class="mini-account" data-detail="${a.id}" title="${safe(provider(a.providerId).name)} · ${safe(a.alias)}${ui.demo ? ' · 示例' : ''}" aria-label="查看 ${safe(provider(a.providerId).name)} 详情"><span class="account-mark" data-provider="${a.providerId}">${safe(provider(a.providerId).name)}</span><span class="mini-value ${pool?.freshness !== 'current' ? 'stale' : ''}">${pool ? formatPercent(pool.percent) : '未知'}<small>${ui.demo ? '示例 · ' : ''}${pool ? ({h5:'5h', week:'周', month:'月'}[pool.bucket]) : '未接入'}${pool && pool.freshness !== 'current' ? ' · 旧值' : ''}</small></span></button>`;
  }).join('') || '<span class="unknown">添加账户后显示额度</span>';
  el('accountRows').innerHTML = rows.map(a => {
    const p = provider(a.providerId), next = a.nextReset;
    const busy = ui.pending.has(a.id) || ui.refreshing.has(a.id);
    const canRefresh = !ui.demo && localBackend && !!p.connector;
    const extra = a.extraPools.map(p => p.remaining != null ? `${Number(p.remaining).toLocaleString('zh-CN')} ${p.unit || ''}` : p.percent != null ? `${p.label} ${formatPercent(p.percent)}` : '').join(' · ');
    const title = `${p.name} · ${a.alias} · ${a.plan || '档位未填写'} · ${statusText(a)}`;
    return `<tr data-account-row="${a.id}"><td class="product-cell"><div class="identity"><button class="drag-handle" draggable="true" data-drag-id="${a.id}" aria-label="拖动排序 ${safe(p.name)}" title="拖动排序；也可点击右上角 ⇅">⠿</button><button class="account-mark" data-provider="${a.providerId}" data-detail="${a.id}" title="${safe(title)}" aria-label="查看 ${safe(p.name)} 详情">${safe(provider(a.providerId).name)}<i class="status-dot ${a.needsAttention ? 'warn' : a.hasUnknown ? 'unknown-dot' : ''}"></i></button></div><div class="plan" title="${safe(title)}">${safe(a.plan.replace(' · 示例', '') || (p.connector ? statusText(a) : '尚未接入'))}</div>${a.alias !== '主账户' ? `<div class="alias" title="${safe(a.alias)}">${safe(a.alias)}</div>` : ''}<div class="read-age" title="${safe(fullTime(a.observedAt))}">${a.observedAt ? safe(ageLabel(a.observedAt)) + '读取' : '尚未读取'}</div></td>${WINDOWS.map(w => `<td>${a.cells[w.id].state === 'not_applicable' ? '<span class="na">不适用</span>' : a.cells[w.id].state === 'unknown' ? '<span class="unknown">未知</span>' : a.cells[w.id].pools.map(poolHTML).join('')}</td>`).join('')}<td><div class="reset-label" title="${safe(next ? fullTime(next.resetsAt) : '未提供恢复时间')}">${next ? `<span class="reset-date">${safe(beijingTime(next.resetsAt))}</span><div class="reset-countdown">${safe(timeLabel(next.resetsAt))} · ${safe(({ h5:'5h', week:'周', month:'月', other:next.label }[next.bucket]))}${next.scope ? ' · ' + safe(next.scope) : ''}${a.stale ? ' · 上次记录' : ''}</div>` : '<span class="unknown">未提供</span>'}</div>${!a.observedAt ? `<div class="connection-hint">${safe(a.connection.message || (p.connector ? '等待首次读取' : ({zcode:'自动接入待完成',gemini:'网页会员未接入',youmind:'自动接入待完成',muse:'自动接入待完成'}[a.providerId] || '自动接入待完成')))}</div>` : ''}${extra ? `<div class="pool-extra" title="${safe(extra)}">另有 ${safe(extra)}</div>` : ''}</td><td class="refresh-cell"><button class="row-refresh" data-row-refresh="${a.id}" ${!canRefresh || busy ? 'disabled' : ''} aria-label="刷新 ${safe(p.name)}" title="${busy ? '正在读取' : canRefresh ? '单独刷新 ' + safe(p.name) : '自动接入待完成'}">${busy ? '…' : '↻'}</button></td></tr>`;
  }).join('');
  el('empty').hidden = rows.length > 0;
    const live = projected.filter(a => a.connection.status === 'ready' && !a.stale && !['manual','codexbar','demo','none'].includes(a.source)).length;
  el('freshnessSummary').textContent = ui.demo ? '示例数据 · 非真实账户' : `真实读取 ${live} / ${projected.length} · 每 24 小时自动更新 1 次`;
  el('refreshAllButton').hidden = ui.demo || !localBackend;
  nativeAction('summary', { attention: projected.filter(a => a.needsAttention).length, example: ui.demo });
}
function setCompact(value, send = true) {
  ui.compact = value; render();
  if (send) nativeAction('collapse', { value });
}
window.quotaDesktopState = state => { setCompact(!!state.compact, false); };
async function applyOrder(ids) {
  // Hidden products retain their stored slot while visible products are reordered.
  let index = 0;
  const completeIds = allAccounts().map(a => providerVisible(a.providerId) ? ids[index++] : a.id);
  await mutate('/api/reorder', { ids: completeIds }, accounts => reorderAccounts(accounts, completeIds));
}
function showSort() {
  const all = displayAccounts();
  modal('调整产品顺序', `<p>拖动 ⠿，或点击上下箭头。立即保存；筛选和自动刷新不会打乱顺序。</p><ul class="sort-list">${all.map((a, i) => `<li class="sort-row" data-sort-id="${a.id}"><span class="drag-handle" draggable="true" data-drag-id="${a.id}" aria-label="拖动 ${safe(provider(a.providerId).name)}">⠿</span><span class="account-mark" data-provider="${a.providerId}">${safe(provider(a.providerId).name)}</span><span class="sort-name">${safe(provider(a.providerId).name)}<small>${safe(a.alias)}</small></span><button data-sort-move="${a.id}" data-direction="-1" ${i === 0 ? 'disabled' : ''} aria-label="上移 ${safe(provider(a.providerId).name)}">↑</button><button data-sort-move="${a.id}" data-direction="1" ${i === all.length - 1 ? 'disabled' : ''} aria-label="下移 ${safe(provider(a.providerId).name)}">↓</button></li>`).join('')}</ul><div class="sort-hint"><button class="text-button" data-default-order>恢复推荐顺序</button><button class="button" data-close>完成</button></div>`);
}
async function moveAccount(id, target) {
  const ids = displayAccounts().map(a => a.id), from = ids.indexOf(id), to = ids.indexOf(target);
  if (from < 0 || to < 0 || from === to) return;
  ids.splice(from, 1); ids.splice(to, 0, id);
  const sorting = !!document.querySelector('.sort-list');
  await applyOrder(ids); if (sorting) showSort();
}
function modal(title, body) {
  if (ui.compact) setCompact(false);
  returnFocus = document.activeElement;
  el('modalContent').innerHTML = `<div class="modal-head"><h2 id="modalTitle">${safe(title)}</h2><button class="close" data-close aria-label="关闭">×</button></div>${body}`;
  el('modalBackdrop').hidden = false; el('app').inert = true;
  const input = el('modalContent').querySelector('input,select'); (input || el('modalContent').querySelector('button')).focus();
}
function closeModal() { el('modalBackdrop').hidden = true; el('app').inert = false; el('modalContent').innerHTML = ''; if (returnFocus?.isConnected) returnFocus.focus(); }
function showDetail(id) {
  const a = projectAccount(accountById(id)), p = provider(a.providerId);
  const connected = ['codex', 'kimi', 'cursor', 'grokbot', 'minimax', 'zcode', 'youmind', 'muse'].includes(a.connection.type) && !['disconnected', 'auth_required'].includes(a.connection.status);
  modal(`${p.name} · ${a.alias}`, `<p>${safe(a.plan || '档位未填写')} · ${safe(p.scope)}</p><div class="chips"><span class="chip">${safe(sourceName(a))}</span><span class="chip ${a.stale ? 'warn' : ''}">${safe(statusText(a))}</span></div>${a.connection.message ? `<div class="muted-note">${safe(a.connection.message)}</div>` : ''}${a.pools.map(pool => `<div class="detail-pool"><div><strong>${safe(({ h5: '5 小时', week: '周', month: '月' }[pool.bucket] || '特殊额度'))} · ${safe(pool.label)}</strong><small>${pool.boundaryKind === 'expiry' ? '到期' : '恢复'}：${safe(fullTime(pool.resetsAt))}</small>${pool.windowMinutes ? `<small>来源窗口：${pool.windowMinutes} 分钟</small>` : ''}</div><div><b>${pool.percent === null ? pool.remaining != null ? safe(`${pool.remaining} ${pool.unit || ''}`) : '未知' : formatPercent(pool.percent)}</b>${pool.limit != null ? `<small>已用 ${safe(pool.used ?? (pool.limit - (pool.remaining ?? pool.limit)))} / ${safe(pool.limit)} ${safe(pool.unit)}</small>` : ''}<small>${pool.percent === null ? '无确定分母时保留余额' : '剩余比例'}${pool.freshness !== 'current' ? ' · 上次值' : ''}</small></div></div>`).join('') || '<div class="muted-note">还没有额度记录。可连接已支持的来源、手动填写，或导入单账户快照。</div>'}<div class="muted-note">${a.providerId === 'chatgpt' ? 'Codex 接口只展示它实际返回的额度池，不能据此承诺覆盖全部 Work 功能。' : '同一周期的多个独立额度池分别列出；不相加或平均。'} “下次恢复”指最早发生的一次额度恢复，不代表整个账户恢复满额。</div><div class="detail-actions"><button class="button secondary" data-pin="${id}">${a.pinned ? '取消固定' : '固定此账户'}</button>${p.connector ? `<button class="button" data-connect="${id}" data-type="${p.connector}">${connected ? '重试连接' : '读取本机登录'}</button>` : ''}${connected ? `<button class="button secondary" data-refresh="${id}">刷新</button><button class="button secondary" data-disconnect="${id}">断开</button>` : ''}<button class="button secondary" data-manual="${id}">手动记录</button><button class="button secondary" data-import="${id}">导入 CodexBar JSON</button><a class="button secondary" href="${p.url}" target="_blank" rel="noopener noreferrer">查看官方网站 ↗</a></div><div class="detail-actions"><button class="text-button" data-remove="${id}">移除本地账户卡</button></div><p>最近成功读取：${safe(fullTime(a.observedAt))}。${ui.demo ? '当前全部为模拟值。' : '记录仅保存在本机。'}</p>`);
}
const localDatetime = beijingInput;
function showManual(id) {
  const a = accountById(id);
  const balance = a.pools.find(p => bucketOf(p) === 'other' && p.remaining != null);
  modal('手动记录额度', `<p>统一录入剩余或已用百分比。保存会暂停这个账户的自动采集；无对应周期选“不适用”，暂时不知道选“未知”。</p><form id="manualForm" data-id="${id}"><div class="field-grid"><div><label for="planInput">订阅档位</label><input id="planInput" name="plan" maxlength="60" value="${safe(a.plan)}" placeholder="例如 Pro、Token Plan"></div><div><label for="aliasInput">账户别名</label><input id="aliasInput" name="alias" maxlength="40" value="${safe(a.alias)}" required></div></div>${WINDOWS.map(w => {
    const pools = a.pools.filter(p => bucketOf(p) === w.id); const state = pools.length ? 'known' : a.coverage[w.id] === 'not_applicable' ? 'not_applicable' : 'unknown';
    return `<fieldset class="window-edit"><div class="window-heading"><strong>${w.label}</strong><select name="state-${w.id}" data-window-select="${w.id}" aria-label="${w.label} 额度状态"><option value="known" ${state === 'known' ? 'selected' : ''}>填写额度</option><option value="not_applicable" ${state === 'not_applicable' ? 'selected' : ''}>不适用</option><option value="unknown" ${state === 'unknown' ? 'selected' : ''}>未知</option></select></div><div data-window-fields="${w.id}" ${state !== 'known' ? 'hidden' : ''}>${(pools.length ? pools : [{ id: `manual-${w.id}`, label: w.label }]).map((p, i) => `<div class="pool-edit" data-bucket="${w.id}" data-pool-index="${i}" data-pool-id="${safe(p.id)}"><span class="pool-label">${safe(p.scope || p.label || w.label)}</span><div><label>输入口径</label><select data-field="measure"><option value="remainingPercent">剩余 %</option><option value="usedPercent">已用 %</option><option value="amount">剩余额度 / 总额</option></select></div><div><label>数值</label><input data-field="number" type="number" min="0" step="any" value="${percentOf(p) ?? ''}" placeholder="0–100"></div><div><label>额度总额（数值口径时）</label><input data-field="limit" type="number" min="0" step="any" placeholder="仅数值口径填写"></div><div class="time-edit"><label>下次恢复（北京时间，可空）</label><input data-field="reset" type="datetime-local" value="${localDatetime(p.resetsAt)}"></div></div>`).join('')}</div></fieldset>`;
  }).join('')}<details class="window-edit"><summary>额外积分 / 余额（可选）</summary><div class="field-grid"><div><label>剩余额度</label><input name="extraRemaining" type="number" min="0" step="any" value="${balance?.remaining ?? ''}"></div><div><label>总额 / 分母（未知留空）</label><input name="extraLimit" type="number" min="0" step="any" value="${balance?.limit ?? ''}"></div><div><label>单位</label><input name="extraUnit" maxlength="20" value="${safe(balance?.unit || '积分')}"></div><div><label>到期时间（北京时间，可空）</label><input name="extraExpiry" type="datetime-local" value="${localDatetime(balance?.resetsAt)}"></div></div></details><div class="muted-note">额外积分不折算成 5 小时、周或月额度。多个同周期额度池仍分别保存。</div><div class="form-actions"><button type="button" class="button secondary" data-close>取消</button><button class="button" type="submit">保存记录</button></div></form>`);
}
function showConnect(id, type) {
  if (ui.demo) { notify('请先退出示例模式，再连接你的账户。'); return; }
  if (!localBackend) { modal('启动本地服务', '<p>连接官方来源需要运行本地服务。项目目录执行 <code>npm start</code>，然后打开下面的地址。</p><div class="detail-actions"><a class="button" href="http://127.0.0.1:4318" target="_blank" rel="noopener">打开本地服务 ↗</a></div><p>离线文件仍可用于手动记录；两个存储空间不会自动合并。</p>'); return; }
  const descriptions = {zcode:'复用 ZCode 已连接的智谱个人 Coding Plan，读取本地凭据后只向智谱固定额度接口发送请求。不读取会话。',codex:'复用本机 Codex 登录，只读取官方返回的额度池。',kimi:'优先复用 Kimi 官方桌面登录，读取综合会员月度总量和 Code 周期额度。综合会员不可用时回退 Code，并明确提示月度未知。',youmind:'通过 Tabbit 已登录的 YouMind 查询会员积分，不导出浏览器凭据。需要 Tabbit 可用且已登录官网。',muse:'通过 Tabbit 已登录的 Muse.ai 查询订阅用量，不导出浏览器凭据。需要 Tabbit 可用且已登录官网。',cursor:'只读取 Cursor 官方客户端保存的当前登录，再向 cursor.com 查询个人订阅额度。',grokbot:'Grok Bot 的订阅额度由 Cursor 账户接口提供，使用本机 Cursor 的当前登录。',minimax:'复用 MiniMax Code 官方登录。请保持 MiniMax Code 已打开；登录续期由它处理。'};
  modal('读取 ' + provider(accountById(id).providerId).name + ' 额度', `<p>${safe(descriptions[type] || '读取已登录官方客户端的账户额度。')}</p><p>连接后每 24 小时自动更新 1 次，重启自动恢复。凭据不进入页面或额度记录。</p><form id="connectForm" data-id="${id}" data-type="${type}"><div class="form-actions"><button type="button" class="button secondary" data-close>取消</button><button class="button" type="submit">读取额度</button></div></form>`);
}
function showHelp() {
  modal('统一口径如何计算', '<ul class="help-list"><li><strong>统一剩余百分比：</strong>已用 28% → 剩余 72%；使用比例 0.28 → 剩余 72%；剩余 720 / 总额 1000 → 剩余 72%。</li><li><strong>统一时间列：</strong>300 分钟映射为 5 小时；7 天映射为周；已明确的月度池映射为月。不将周额度除以小时数制造 5 小时额度。</li><li><strong>不适用：</strong>确认没有对应窗口。<strong>未知：</strong>来源未提供或尚未接入。<strong>0%：</strong>已确认余量耗尽。</li><li><strong>多个额度池：</strong>同周期的总池与专属池分别展示，不相加、不平均。</li><li><strong>北京时间：</strong>所有绝对时间与手动录入固定为 UTC+8，不随系统时区变化。</li><li><strong>恢复时间：</strong>到点后等待重新读取，不自动把余额加满。积分到期不会算成额度恢复。</li><li><strong>首版接入：</strong>Codex、Cursor、Kimi 综合会员、Grok Bot、MiniMax、ZCode 复用官方客户端登录；Muse.ai、YouMind 通过 Tabbit 官网登录查询。每 24 小时自动读取一次，手动刷新会重新起算；App 退出期间不会查询，重新打开后补一次到期读取。Gemini 暂时隐藏。</li></ul><div class="muted-note">各产品的 50% 表示各自套餐剩余一半，不代表相同的 token、请求数或工作量。</div>');
}
async function runAction(fn, button) { if (button) button.disabled = true; try { await fn(); } catch (e) { notify(e.message || '操作失败'); } finally { if (button?.isConnected) button.disabled = false; } }
document.addEventListener('click', e => {
  const target = e.target.closest('button');
  if (e.target === el('modalBackdrop') || target?.hasAttribute('data-close')) { closeModal(); return; }
  if (target?.dataset.filter) { ui.filter = target.dataset.filter; render(); return; }
  if (target?.dataset.detail) { showDetail(target.dataset.detail); return; }
  if (target?.dataset.pin) { const id = target.dataset.pin, value = !accountById(id).pinned; runAction(async () => { await mutate('/api/pin', { id, pinned: value }, accounts => accounts.map(a => a.id === id ? { ...a, pinned: value } : a)); if (!el('modalBackdrop').hidden) showDetail(id); }, target); return; }
  if (target?.dataset.manual) { showManual(target.dataset.manual); return; }
  if (target?.dataset.connect) { showConnect(target.dataset.connect, target.dataset.type); return; }
  if (target?.dataset.rowRefresh) { const id = target.dataset.rowRefresh; runAction(async () => { ui.pending.add(id); render(); try { const a = accountById(id); await mutate(a.connection.type === provider(a.providerId).connector && a.connection.status !== 'disconnected' ? '/api/refresh' : '/api/connect', { id, type: provider(a.providerId).connector }); const result = accountById(id); notify(result.connection.status === 'ready' ? provider(result.providerId).name + ' 已更新' : result.connection.message || '读取失败'); } finally { ui.pending.delete(id); render(); } }); return; }
  if (target?.dataset.refresh) { const id = target.dataset.refresh; runAction(async () => { await mutate('/api/refresh', { id }); showDetail(id); notify('读取已结束，请查看最新状态。'); }, target); return; }
  if (target?.dataset.disconnect) { const id = target.dataset.disconnect; runAction(async () => { await mutate('/api/disconnect', { id }); showDetail(id); notify('已停止自动读取。'); }, target); return; }
  if (target?.dataset.remove) { const id = target.dataset.remove; modal('移除这张账户卡？', `<p>只删除本机记录，不影响原产品的账户或订阅。</p><div class="form-actions"><button class="button secondary" data-close>取消</button><button class="button danger" data-confirm-remove="${id}">移除记录</button></div>`); return; }
  if (target?.dataset.confirmRemove) { const id = target.dataset.confirmRemove; runAction(async () => { await mutate('/api/remove', { id }, accounts => accounts.filter(a => a.id !== id)); closeModal(); }, target); return; }
  if (target?.dataset.import) {
    const id = target.dataset.import;
    if (ui.demo || !localBackend) { notify('请在本地服务的“我的记录”模式导入。'); return; }
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('change', () => runAction(async () => { const file = input.files[0]; if (!file) return; if (file.size > 240 * 1024) throw new Error('导入文件需小于 240 KB'); await mutate('/api/import', { id, payload: JSON.parse(await file.text()) }); showDetail(id); notify('已导入快照，保留原采集时间。'); })); input.click(); return;
  }
});
document.addEventListener('change', e => { if (e.target.dataset.windowSelect) document.querySelector(`[data-window-fields="${e.target.dataset.windowSelect}"]`).hidden = e.target.value !== 'known'; });
document.addEventListener('submit', e => {
  if (!['manualForm', 'connectForm', 'addForm'].includes(e.target.id)) return;
  e.preventDefault(); const form = e.target, button = form.querySelector('[type=submit]');
  runAction(async () => {
    if (form.id === 'manualForm') {
      const old = accountById(form.dataset.id), fields = new FormData(form), pools = old.pools.filter(p => bucketOf(p) === 'other').map(p => ({ ...p })), coverage = {};
      for (const w of WINDOWS) {
        const state = fields.get(`state-${w.id}`); coverage[w.id] = state === 'not_applicable' ? 'not_applicable' : 'unknown';
        if (state !== 'known') continue;
        for (const row of form.querySelectorAll(`[data-bucket="${w.id}"]`)) {
          const read = key => row.querySelector(`[data-field="${key}"]`).value;
          if (read('number').trim() === '') throw new Error(`${w.label}的数值尚未填写；不知道时请选择“未知”。`);
          const number = Number(read('number')), measure = read('measure');
          if (!Number.isFinite(number) || number < 0 || (measure !== 'amount' && number > 100)) throw new Error('百分比应在 0–100 之间');
          const existing = old.pools.find(p => p.id === row.dataset.poolId);
          const pool = { id: row.dataset.poolId, bucket: w.id, label: existing?.label || w.label, scope: existing?.scope || '', boundaryKind: 'reset', resetsAt: fromBeijingInput(read('reset')) };
          if (measure === 'amount') { const limit = Number(read('limit')); if (!(limit > 0) || number > limit) throw new Error('总额须大于零，剩余额度不能超过总额'); pool.remaining = number; pool.limit = limit; }
          else pool[measure] = number;
          pools.push(pool);
        }
      }
      const extraText = String(fields.get('extraRemaining') || '').trim();
      if (extraText) {
        const remaining = Number(extraText), limitText = String(fields.get('extraLimit') || '').trim(), limit = limitText ? Number(limitText) : null;
        if (!Number.isFinite(remaining) || remaining < 0 || (limit !== null && (!(limit > 0) || remaining > limit))) throw new Error('请核对积分余额与总额');
        const existing = pools.find(p => bucketOf(p) === 'other' && p.remaining != null), extra = { id: existing?.id || 'manual-extra', bucket: 'other', label: '额外余额', remaining, ...(limit !== null ? { limit } : {}), unit: fields.get('extraUnit'), boundaryKind: 'expiry', resetsAt: fromBeijingInput(fields.get('extraExpiry')) };
        if (existing) pools[pools.indexOf(existing)] = extra; else pools.push(extra);
      }
      const account = cleanAccount({ ...old, alias: fields.get('alias'), plan: fields.get('plan'), pools, coverage, source: 'manual', observedAt: new Date().toISOString(), connection: { type: 'manual', status: 'ready' } });
      await mutate('/api/manual', { account }, accounts => accounts.map(a => a.id === old.id ? account : a)); closeModal(); notify(ui.demo ? '示例已修改，不影响真实记录。' : '额度已保存为手动记录。');
    } else if (form.id === 'connectForm') {
      const id = form.dataset.id, type = form.dataset.type;

      button.textContent = '正在读取…';
      await mutate('/api/connect', { id, type }); showDetail(id);
    } else {
      const fields = new FormData(form), providerId = fields.get('provider'), alias = fields.get('alias');
      await mutate('/api/add', { providerId, alias }, accounts => [...accounts, cleanAccount({ id: crypto.randomUUID(), providerId, alias, plan: '', pools: [], source: 'none' })]); closeModal();
    }
  }, button);
});
el('compactButton').onclick = () => setCompact(!ui.compact);
el('sortButton').onclick = showSort;
el('topButton').onclick = () => nativeBridge ? nativeAction('pin') : notify('实际置顶由桌面 App 提供；当前为交互预览。');
el('hideButton').onclick = () => { if (nativeBridge) nativeAction('hide'); else { el('app').hidden = true; el('previewTray').hidden = false; } };
el('restoreButton').onclick = () => { el('app').hidden = false; el('previewTray').hidden = true; };
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.sortMove) { const all = displayAccounts(), from = all.findIndex(a => a.id === b.dataset.sortMove), target = all[from + Number(b.dataset.direction)]; if (target) runAction(() => moveAccount(b.dataset.sortMove, target.id), b); }
  if (b.hasAttribute('data-default-order')) runAction(async () => { await applyOrder(recommendedOrder(displayAccounts()).map(a => a.id)); showSort(); }, b);
});
document.addEventListener('dragstart', e => { const handle = e.target.closest('[data-drag-id]'); if (!handle) return; ui.dragId = handle.dataset.dragId; e.dataTransfer.setData('text/plain', ui.dragId); e.dataTransfer.effectAllowed = 'move'; });
document.addEventListener('dragover', e => { if (!ui.dragId) return; const row = e.target.closest('[data-account-row],[data-sort-id]'); if (!row) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target')); row.classList.add('drop-target'); });
document.addEventListener('drop', e => { const row = e.target.closest('[data-account-row],[data-sort-id]'), id = ui.dragId; if (!id || !row) return; e.preventDefault(); ui.dragId = null; document.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target')); runAction(() => moveAccount(id, row.dataset.accountRow || row.dataset.sortId)); });
document.addEventListener('dragend', () => { ui.dragId = null; document.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target')); });
el('refreshAllButton').onclick = () => runAction(async () => { el('refreshAllButton').textContent='读取中…'; try { await mutate('/api/refresh-all', {}); notify('已完成本次读取，失败原因可点击对应产品查看。'); } finally { el('refreshAllButton').textContent='刷新全部'; } }, el('refreshAllButton'));
el('helpButton').onclick = showHelp;
el('demoButton').onclick = () => { ui.demo = true; ui.examples = demoAccounts(Date.now(), el('scenarioSelect').value); render(); };
el('exitDemo').onclick = () => { ui.demo = false; render(); };
el('scenarioSelect').onchange = e => { ui.examples = demoAccounts(Date.now(), e.target.value); render(); };
el('addButton').onclick = () => modal('添加账户', `<p>同一产品可添加多个账户；自动 Codex 连接当前只支持本机官方客户端的登录账户。</p><form id="addForm"><label for="providerSelect">产品</label><select id="providerSelect" name="provider">${PROVIDERS.filter(p => !p.hidden).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select><label for="newAlias">账户别名</label><input id="newAlias" name="alias" maxlength="40" placeholder="例如 工作账户" required><div class="form-actions"><button class="button secondary" type="button" data-close>取消</button><button class="button" type="submit">添加</button></div></form>`);
el('exportButton').onclick = () => { const data = { version: 1, example: ui.demo, exportedAt: new Date().toISOString(), accounts: displayAccounts().map(cleanAccount) }; if (nativeBridge) { nativeAction('export', { json: JSON.stringify(data, null, 2) }); return; } const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = ui.demo ? 'quota-example.json' : 'quota-records.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
document.addEventListener('keydown', e => {
  if (el('modalBackdrop').hidden) return;
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Tab') { const nodes = [...el('modal').querySelectorAll('button,input,select,a[href]')].filter(n => !n.disabled && n.offsetParent !== null), first = nodes[0], last = nodes.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
});
async function refreshView() {
  try { const result = await api('/api/snapshot'); ui.accounts = result.accounts; ui.refreshing = new Set(result.refreshing || []); el('backendError').hidden = true; render(); }
  catch { el('backendError').hidden = false; el('backendError').textContent = '本地服务暂时不可用。当前为上次记录，请恢复服务后刷新页面。'; ui.accounts = ui.accounts.map(a => ({ ...a, connection: { ...a.connection, status: 'disconnected' } })); render(); }
}
if (localBackend) { refreshView(); pollTimer = setInterval(() => { if (!document.hidden) refreshView(); }, 5000); }
else { try { const saved = JSON.parse(localStorage.getItem(storageKey)); const accounts = Array.isArray(saved) ? saved : saved?.accounts; if (Array.isArray(accounts) && accounts.length <= 40) ui.accounts = saved.orderCustomized ? accounts.map(cleanAccount) : recommendedOrder(accounts.map(cleanAccount)); } catch {} el('designLink').href = './mvp-design.md'; }
setInterval(() => { if (!document.hidden) render(); }, 60_000);
render();
