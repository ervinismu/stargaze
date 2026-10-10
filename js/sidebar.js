// ── Active filter chips (float over canvas) ──
// Single-value chip (star lists)
function setChip(chipId, value, onClear){
  const el = document.getElementById(chipId);
  if(!value){ el.innerHTML = ''; return; }
  el.innerHTML = `<div class="active-chip"><span class="active-chip-name" title="${value}">${value}</span><span class="active-chip-clear">×</span></div>`;
  el.querySelector('.active-chip-clear').addEventListener('click', e => { e.stopPropagation(); onClear(); });
}

// Multi-value chips (languages, topics) — one chip per selected value
function setMultiChips(chipId, values, onClear){
  const el = document.getElementById(chipId);
  el.innerHTML = '';
  for(const v of values){
    const chip = document.createElement('div');
    chip.className = 'active-chip';
    chip.innerHTML = `<span class="active-chip-name" title="${v}">${v}</span><span class="active-chip-clear">×</span>`;
    chip.querySelector('.active-chip-clear').addEventListener('click', e => { e.stopPropagation(); onClear(v); });
    el.appendChild(chip);
  }
}

function refreshLangChips(){
  setMultiChips('lang-chip', [...filterLangs], lang => {
    filterLangs.delete(lang);
    refreshLangChips();
    refreshLangList();
    refreshTopicList();
    rebuildGraph();
  });
}

function refreshTopicChips(){
  setMultiChips('topic-chip', [...filterTopics], topic => {
    filterTopics.delete(topic);
    refreshTopicChips();
    refreshTopicList();
    rebuildGraph();
  });
}

// ── Topic counts — union across the selected languages, or global when none ──
function topicCounts(){
  const count = new Map();
  let indices;
  if(filterLangs.size){
    indices = [];
    for(const lang of filterLangs) indices.push(...(graphData.langMap[lang] || []));
  } else {
    indices = graphData.nodes.map((_, i) => i);
  }
  for(const idx of indices){
    for(const t of graphData.nodes[idx].topics){
      count.set(t, (count.get(t) || 0) + 1);
    }
  }
  return count;
}

// ── Topic list — rebuilt on language selection or list-search input ──
function refreshTopicList(){
  const topicList = document.getElementById('topic-list');
  topicList.innerHTML = '';

  const q = document.getElementById('topic-filter').value.trim().toLowerCase();
  let entries = [...topicCounts().entries()]
    .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if(q) entries = entries.filter(([t]) => t.toLowerCase().includes(q));
  entries = entries.slice(0, 80); // the global topic list can be huge — cap to top topics

  if(!entries.length){
    topicList.innerHTML = `<div class="topic-placeholder">${q ? 'No matching topics' : 'No topics found'}</div>`;
    return;
  }

  entries.forEach(([topic, count]) => {
    const el = document.createElement('div');
    el.className = 'lang-item' + (filterTopics.has(topic) ? ' active' : '');
    el.innerHTML = `<span class="lang-name">${topic}</span><span class="lang-count">${count}</span>`;
    el.addEventListener('click', () => {
      if(filterTopics.has(topic)) filterTopics.delete(topic); else filterTopics.add(topic);
      refreshTopicChips();
      refreshTopicList();
      rebuildGraph();
    });
    topicList.appendChild(el);
  });
}

// ── Language list — rebuilt on list-search input ──
function refreshLangList(){
  const langList = document.getElementById('lang-list');
  langList.innerHTML = '';

  const q = document.getElementById('lang-filter').value.trim().toLowerCase();
  Object.entries(graphData.langMap)
    .sort((a,b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .filter(([lang]) => !q || lang.toLowerCase().includes(q))
    .forEach(([lang, idxs]) => {
      const el = document.createElement('div');
      el.className = 'lang-item' + (filterLangs.has(lang) ? ' active' : '');
      el.innerHTML = `<div class="lang-dot" style="background:${langColor(lang)};box-shadow:0 0 5px ${langColor(lang)}"></div><span class="lang-name">${lang}</span><span class="lang-count">${idxs.length}</span>`;
      el.addEventListener('click', () => {
        if(filterLangs.has(lang)) filterLangs.delete(lang); else filterLangs.add(lang);
        refreshLangChips();
        refreshLangList();
        refreshTopicList(); // topic counts follow the selected languages
        rebuildGraph();
      });
      langList.appendChild(el);
    });
}

// ── Star lists block — always visible; shows an empty-state hint until lists load ──
function refreshListsBlock(){
  const block = document.getElementById('lists-block');
  const listEl = document.getElementById('list-list');
  listEl.innerHTML = '';
  block.style.display = 'block';

  if(!allLists.length){
    if(listsStatus === 'loading'){
      listEl.innerHTML = '<div class="topic-placeholder">Loading your star lists…</div>';
      return;
    }
    if(listsStatus === 'ready'){
      listEl.innerHTML = '<div class="topic-placeholder">No star lists found for this user</div>';
      return;
    }
    // 'none' (no token yet) or 'failed' — offer a token box so lists are
    // loadable without a full Reset + refetch
    listEl.innerHTML = `
      <div class="topic-placeholder">${listsStatus === 'failed'
        ? 'Couldn’t load star lists — check the token and try again'
        : 'Filter by your GitHub Lists (your own star categories) — token needed:'}</div>
      <input class="list-filter" id="lists-token-input" type="password" placeholder="GitHub token" autocomplete="off" spellcheck="false" />
      <button class="btn-clear" id="btn-load-lists">Load star lists</button>`;
    const tokInput = document.getElementById('lists-token-input');
    const load = () => {
      const token = tokInput.value.trim();
      const username = document.getElementById('input-username').value.trim();
      if(token && username) refreshLists(username, token);
    };
    document.getElementById('btn-load-lists').addEventListener('click', load);
    tokInput.addEventListener('keydown', e => { if(e.key === 'Enter') load(); });
    return;
  }

  // Count only repos that are actually in this graph (lists can contain
  // repos the user has since unstarred or that weren't fetched)
  const inGraph = new Set(allRepos.map(r => r.full_name));
  allLists
    .map(l => ({ ...l, count: l.repos.filter(fn => inGraph.has(fn)).length }))
    .sort((a,b) => b.count - a.count || a.name.localeCompare(b.name))
    .forEach(l => {
      const el = document.createElement('div');
      el.className = 'lang-item' + (l.name === filterList ? ' active' : '');
      el.title = l.description || l.name;
      el.innerHTML = `<span class="lang-name">${l.name}</span><span class="lang-count">${l.count}</span>`;
      el.addEventListener('click', () => {
        filterList = filterList === l.name ? null : l.name;
        setChip('list-chip', filterList, () => {
          filterList = null;
          setChip('list-chip', null);
          refreshListsBlock();
          rebuildGraph();
        });
        refreshListsBlock();
        rebuildGraph();
      });
      listEl.appendChild(el);
    });
}

// ── "Clear all filters" button — only visible when something is filtered ──
function updateClearBtn(){
  const any = filterLangs.size || filterTopics.size || filterList || searchVal.trim();
  document.getElementById('btn-clear-filters').style.display = any ? 'block' : 'none';
}

function clearAllFilters(){
  filterLangs.clear(); filterTopics.clear(); filterList = null;
  searchVal = '';
  document.getElementById('search-input').value = '';
  document.getElementById('lang-filter').value  = '';
  document.getElementById('topic-filter').value = '';
  setMultiChips('lang-chip', []);
  setMultiChips('topic-chip', []);
  setChip('list-chip', null);
  if(currentClearFocus) currentClearFocus();
  refreshLangList();
  refreshTopicList();
  refreshListsBlock();
  rebuildGraph();
}

// ── App shell population ──
function showApp(username){
  document.documentElement.classList.remove('restoring');
  stopStarfield();
  landing.style.display = 'none';
  appEl.classList.add('visible');

  refreshLangList();
  refreshTopicList();
  refreshListsBlock();

  // Stats
  document.getElementById('stats-list').innerHTML = [
    ['Repos',     allRepos.length],
    ['Languages', Object.keys(graphData.langMap).length],
    ['Topics',    Object.keys(graphData.topicMap).length],
    ['Edges',     graphData.links.length],
  ].map(([l,v]) => `<div class="stat-row"><span class="stat-label">${l}</span><span class="stat-val">${v.toLocaleString()}</span></div>`).join('');

  updateHeaderMeta(username, allRepos.length, allRepos.length, graphData.links.length);
  rebuildGraph();
}

function updateHeaderMeta(username, filtered, total, edges){
  document.getElementById('header-meta').innerHTML =
    `<b>${username}</b> · ${filtered !== total ? `<em>${filtered}</em>/${total}` : `<b>${total}</b>`} repos · <b>${edges}</b> edges`;
}
