/* app.js — router, shell, command menu, theme */

const ROUTES = [
  { path: 'home', label: 'Home', ico: '⌂', view: 'viewHome', section: null },
  { path: 'active', label: 'Active Deals', ico: '●', view: 'viewActive', section: 'Work', count: () => NV.active.deals.filter((a) => a.stage !== 'DEAD').length },
  { path: 'deals', label: 'Deals', ico: '▤', view: 'viewDeals', section: 'Work', count: () => NV.deals.length },
  { path: 'pipeline', label: 'Pipeline', ico: '⇶', view: 'viewPipeline', section: 'Work' },
  { path: 'negotiations', label: 'Negotiations', ico: '⇄', view: 'viewNegotiations', section: 'Work', count: () => NV.deals.filter(isActionable).length },
  { path: 'followups', label: 'Follow-Ups', ico: '↻', view: 'viewFollowups', section: 'Work', count: () => NV.followups.length },
  { path: 'responses', label: 'Responses', ico: '✉', view: 'viewResponses', section: 'Work', count: () => NV.drafts.length },
  { path: 'manychat', label: 'ManyChat Audit', ico: '◇', view: 'viewManychat', section: 'Records', count: () => NV.manychat.records.length },
  { path: 'brands', label: 'Brands', ico: '◈', view: 'viewBrands', section: 'Records' },
  { path: 'contacts', label: 'Contacts', ico: '◉', view: 'viewContacts', section: 'Records' },
  { path: 'files', label: 'Contracts & Files', ico: '⎗', view: 'viewFiles', section: 'Records' },
  { path: 'analytics', label: 'Analytics', ico: '◫', view: 'viewAnalytics', section: 'Intelligence' },
  { path: 'ratecard', label: 'Rate Card', ico: '¤', view: 'viewRatecard', section: 'Intelligence' },
  { path: 'health', label: 'Data Health', ico: '✓', view: 'viewHealth', section: 'Intelligence' },
  { path: 'settings', label: 'Settings', ico: '⚙', view: 'viewSettings', section: 'Intelligence' }
];

/* ---------- theme ---------- */
function applyTheme() {
  const pref = NVStore.getTheme();
  const dark = pref ? pref === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ---------- sidebar ---------- */
function buildNav() {
  const nav = document.getElementById('nav');
  let html = '', lastSection = null;
  for (const r of ROUTES) {
    if (r.section !== lastSection && r.section) { html += `<div class="nav-section">${r.section}</div>`; lastSection = r.section; }
    html += `<button class="nav-item" data-path="${r.path}"><span class="nav-ico">${r.ico}</span><span class="nav-label">${r.label}</span>${r.count ? `<span class="nav-count">${r.count()}</span>` : ''}</button>`;
  }
  nav.innerHTML = html;
  nav.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => {
    location.hash = '#/' + b.dataset.path;
    document.getElementById('sidebar').classList.remove('open');
  }));
}

/* ---------- router ---------- */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [pathPart, query] = h.split('?');
  const params = new URLSearchParams(query || '');
  const segs = pathPart.split('/');
  return { path: segs[0], arg: segs[1] || null, params };
}

function renderRoute() {
  const { path, arg, params } = parseHash();
  const container = document.getElementById('view');
  let result, crumb;

  if (path === 'deal' && arg) {
    result = NVViews.viewDealDetail(arg, params);
    crumb = `<a href="#/deals" style="color:var(--text-2)">Deals</a> <span>›</span> <b>${result.title}</b>`;
  } else {
    const route = ROUTES.find((r) => r.path === path) || ROUTES[0];
    result = NVViews[route.view](params);
    crumb = `<b>${route.label}</b>`;
    document.querySelectorAll('.nav-item[data-path]').forEach((b) => b.classList.toggle('active', b.dataset.path === route.path));
  }
  if (path === 'deal') document.querySelectorAll('.nav-item[data-path]').forEach((b) => b.classList.toggle('active', b.dataset.path === 'deals'));

  container.innerHTML = result.html;
  container.scrollTop = 0;
  document.getElementById('crumbs').innerHTML = crumb;
  document.title = `${result.title} — Noe Varner Partnerships`;
  result.mount?.();
}
window.renderRoute = renderRoute;
window.addEventListener('hashchange', renderRoute);

/* ---------- command menu ---------- */
const CmdK = (() => {
  const overlay = document.getElementById('cmdk');
  const input = document.getElementById('cmdk-input');
  const results = document.getElementById('cmdk-results');
  let items = [], sel = 0;

  const ACTIONS = [
    { t: 'Open highest-value deals', ico: '★', go: () => (location.hash = '#/deals') },
    { t: 'View overdue follow-ups', ico: '↻', go: () => (location.hash = '#/followups') },
    { t: 'Open next response draft', ico: '✉', go: () => { const first = NV.drafts.find((x) => !NVStore.getDraftStatus(x.dealId)); location.hash = first ? `#/deal/${first.dealId}?tab=negotiation` : '#/responses'; } },
    { t: 'Find legal-review deals', ico: '§', go: () => (location.hash = '#/deals?filter=legal') },
    { t: 'Find deals with no budget', ico: '¤', go: () => (location.hash = '#/deals?filter=nobudget') },
    { t: 'Deals needing a counter', ico: '⇄', go: () => (location.hash = '#/deals?filter=counter') },
    { t: 'View scam-risk records', ico: '⚠', go: () => (location.hash = '#/deals?filter=scam') },
    { t: 'Strategic exceptions awaiting approval', ico: '◆', go: () => (location.hash = '#/deals?filter=exception') },
    { t: 'Show ManyChat-only deals', ico: '◇', go: () => (location.hash = '#/deals?filter=manychat') },
    { t: 'Show email + DM matches', ico: '◇', go: () => (location.hash = '#/deals?filter=both') },
    { t: 'Show channel conflicts', ico: '⚠', go: () => (location.hash = '#/deals?filter=conflict') },
    { t: 'Show possible duplicates', ico: '⚠', go: () => (location.hash = '#/deals?filter=duplicate') },
    { t: 'Open ManyChat audit', ico: '◇', go: () => (location.hash = '#/manychat') },
    { t: 'Open DM drafts awaiting review', ico: '✉', go: () => { const first = NV.drafts.find((x) => x.channel === 'dm' && !NVStore.getDraftStatus(x.dealId)); location.hash = first ? `#/deal/${first.dealId}?tab=negotiation` : '#/responses'; } },
    { t: 'Show unanswered commercial DMs', ico: '◇', go: () => (location.hash = '#/manychat?filter=Response Ready') },
    { t: 'Toggle dark / light mode', ico: '◐', go: toggleTheme }
  ];

  function open() { overlay.hidden = false; input.value = ''; input.focus(); query(''); }
  function close() { overlay.hidden = true; }

  function query(q) {
    const ql = q.toLowerCase().trim();
    items = [];
    if (!ql) {
      items = ACTIONS.map((a) => ({ ...a, section: 'Quick actions' })).concat(
        [...NV.deals].filter(isActionable).sort((a, b) => b.prob_weighted_usd - a.prob_weighted_usd).slice(0, 5)
          .map((d) => ({ t: d.brand, sub: `${d.deal_id} · ${fmt$(d.prob_weighted_usd)} weighted`, ico: '▤', section: 'Top deals', go: () => (location.hash = `#/deal/${d.deal_id}`) })));
    } else {
      const nav = ROUTES.filter((r) => r.label.toLowerCase().includes(ql)).map((r) => ({ t: r.label, ico: r.ico, section: 'Go to', go: () => (location.hash = '#/' + r.path) }));
      const acts = ACTIONS.filter((a) => a.t.toLowerCase().includes(ql)).map((a) => ({ ...a, section: 'Actions' }));
      const deals = NV.deals.filter((d) => (d.brand + ' ' + d.deal_id + ' ' + d.product + ' ' + d.agency + ' ' + d.contact_email + ' ' + d.ai_category + ' ' + d.commercial_structure + ' ' + (d.source_channel === 'manychat' ? 'manychat dm instagram' : '') + ' ' + d.manychat_ids.map((m) => { const r = NV.manychat.records.find((x) => x.id === m); return r ? m + ' ' + (r.ig || '') + ' ' + r.contact : m; }).join(' ')).toLowerCase().includes(ql))
        .slice(0, 8).map((d) => ({ t: d.brand, sub: `${d.deal_id} · ${d.grade} · ${fmt$(d.prob_weighted_usd)}`, ico: '▤', section: 'Deals', go: () => (location.hash = `#/deal/${d.deal_id}`) }));
      const mcs = NV.manychat.records.filter((m) => (m.id + ' ' + (m.ig || '') + ' ' + m.brand + ' ' + m.contact + ' ' + m.classification).toLowerCase().includes(ql))
        .slice(0, 4).map((m) => ({ t: `${m.id} — ${m.brand}`, sub: m.ig ? '@' + m.ig : m.classification, ico: '◇', section: 'ManyChat audit', go: () => (location.hash = m.linkedDealId ? `#/deal/${m.linkedDealId}` : '#/manychat') }));
      const drafts = NV.drafts.filter((x) => (x.brand + ' ' + x.id + ' ' + x.subject).toLowerCase().includes(ql))
        .slice(0, 4).map((x) => ({ t: x.subject, sub: x.id, ico: '✉', section: 'Drafts', go: () => (location.hash = `#/deal/${x.dealId}?tab=negotiation`) }));
      const brands = NV.research.filter((r) => (r.brand + ' ' + r.domain + ' ' + r.competitors).toLowerCase().includes(ql))
        .slice(0, 4).map((r) => ({ t: r.brand + ' — research', sub: r.domain, ico: '◈', section: 'Brand research', go: () => (location.hash = `#/deal/${r.dealId}?tab=research`) }));
      const actives = (NV.active?.deals || []).filter((a) => (a.brand + ' ' + a.stage + ' ' + a.notes).toLowerCase().includes(ql))
        .slice(0, 4).map((a) => ({ t: `${a.brand} (Round ${a.round})`, sub: `${a.stage}${a.amount ? ' · $' + a.amount.toLocaleString() : ''}`, ico: '●', section: 'Active deals', go: () => (location.hash = '#/active') }));
      items = [...nav, ...acts, ...actives, ...deals, ...mcs, ...drafts, ...brands];
    }
    sel = 0;
    render();
  }

  function render() {
    let html = '', lastSection = null;
    items.forEach((it, i) => {
      if (it.section !== lastSection) { html += `<div class="cmdk-section">${it.section}</div>`; lastSection = it.section; }
      html += `<div class="cmdk-item ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="ci-ico">${it.ico}</span><span>${esc(it.t)}</span>${it.sub ? `<span class="ci-sub">${esc(it.sub)}</span>` : ''}</div>`;
    });
    results.innerHTML = html || '<div class="empty" style="padding:22px">No matches</div>';
    results.querySelectorAll('.cmdk-item').forEach((el) => {
      el.addEventListener('click', () => { items[+el.dataset.i].go(); close(); });
      el.addEventListener('mousemove', () => { sel = +el.dataset.i; render(); });
    });
    results.querySelector('.cmdk-item.sel')?.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', () => query(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
    else if (e.key === 'Enter' && items[sel]) { items[sel].go(); close(); }
    else if (e.key === 'Escape') close();
  });
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  return { open, close };
})();

function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  NVStore.setTheme(cur === 'dark' ? 'light' : 'dark');
  applyTheme();
}

/* ---------- global bindings ---------- */
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); CmdK.open(); }
});
document.getElementById('open-cmdk').addEventListener('click', CmdK.open);
document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
document.getElementById('collapse-toggle').addEventListener('click', () => {
  const sb = document.getElementById('sidebar');
  sb.classList.toggle('collapsed');
  NVStore.setSidebar(sb.classList.contains('collapsed'));
});
/* Mobile drawer: backdrop + close on outside tap */
const sidebarEl = document.getElementById('sidebar');
function setDrawer(open) {
  sidebarEl.classList.toggle('open', open);
  let bd = document.getElementById('sidebar-backdrop');
  if (open && !bd) {
    bd = document.createElement('div');
    bd.id = 'sidebar-backdrop';
    bd.className = 'sidebar-backdrop';
    bd.addEventListener('click', () => setDrawer(false));
    document.body.appendChild(bd);
  } else if (!open && bd) bd.remove();
}
document.getElementById('mobile-menu').addEventListener('click', () => setDrawer(!sidebarEl.classList.contains('open')));
document.getElementById('nav').addEventListener('click', () => setDrawer(false));
window.addEventListener('hashchange', () => setDrawer(false));

/* ---------- boot ---------- */
(function boot() {
  applyTheme();
  buildNav();
  if (NVStore.getSidebar()) document.getElementById('sidebar').classList.add('collapsed');
  const pill = document.getElementById('sync-pill');
  pill.innerHTML = `<span class="sync-dot"></span>${NV.meta.dealCount} deals · ${NV.meta.recordVersion}`;
  pill.title = `Source synced ${NV.meta.sourceSyncedAt} · bundle built ${new Date(NV.meta.builtAt).toLocaleString()} · validation ${NV.meta.validation}`;
  pill.style.cursor = 'pointer';
  pill.addEventListener('click', () => (location.hash = '#/health'));
  renderRoute();
})();
