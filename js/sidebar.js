// ── Active filter chip (floats over canvas) ──
function setChip(chipId, value, onClear){
  const el = document.getElementById(chipId);
  if(!value){ el.innerHTML = ''; return; }
  el.innerHTML = `<div class="active-chip"><span class="active-chip-name" title="${value}">${value}</span><span class="active-chip-clear">×</span></div>`;
  el.querySelector('.active-chip-clear').addEventListener('click', e => { e.stopPropagation(); onClear(); });
}

// ── App shell population ──
function showApp(username){
  landing.style.display = 'none';
  appEl.classList.add('visible');

  // Language filter list
  const langList = document.getElementById('lang-list');
  langList.innerHTML = '';
  Object.entries(graphData.langMap)
    .sort((a,b) => a[0].localeCompare(b[0]))
    .forEach(([lang, idxs]) => {
      const el = document.createElement('div');
      el.className = 'lang-item';
      el.dataset.lang = lang;
      el.innerHTML = `<div class="lang-dot" style="background:${langColor(lang)};box-shadow:0 0 5px ${langColor(lang)}"></div><span class="lang-name">${lang}</span><span class="lang-count">${idxs.length}</span>`;
      el.addEventListener('click', () => {
        filterLang = filterLang === lang ? null : lang;
        document.querySelectorAll('#lang-list .lang-item').forEach(e => e.classList.toggle('active', e.dataset.lang === filterLang));
        setChip('lang-chip', filterLang, () => {
          filterLang = null;
          document.querySelectorAll('#lang-list .lang-item').forEach(e => e.classList.remove('active'));
          setChip('lang-chip', null);
          rebuildGraph();
        });
        if(filterLang) el.scrollIntoView({ block: 'nearest' });
        rebuildGraph();
      });
      langList.appendChild(el);
    });

  // Topic filter list
  const topicList = document.getElementById('topic-list');
  topicList.innerHTML = '';
  Object.entries(graphData.topicMap)
    .sort((a,b) => a[0].localeCompare(b[0]))
    .forEach(([topic, idxs]) => {
      const el = document.createElement('div');
      el.className = 'lang-item';
      el.dataset.topic = topic;
      el.innerHTML = `<span class="lang-name">${topic}</span><span class="lang-count">${idxs.length}</span>`;
      el.addEventListener('click', () => {
        filterTopic = filterTopic === topic ? null : topic;
        document.querySelectorAll('#topic-list .lang-item').forEach(e => e.classList.toggle('active', e.dataset.topic === filterTopic));
        setChip('topic-chip', filterTopic, () => {
          filterTopic = null;
          document.querySelectorAll('#topic-list .lang-item').forEach(e => e.classList.remove('active'));
          setChip('topic-chip', null);
          rebuildGraph();
        });
        if(filterTopic) el.scrollIntoView({ block: 'nearest' });
        rebuildGraph();
      });
      topicList.appendChild(el);
    });

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
