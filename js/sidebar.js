// ── Active filter chip (floats over canvas) ──
function setChip(chipId, value, onClear){
  const el = document.getElementById(chipId);
  if(!value){ el.innerHTML = ''; return; }
  el.innerHTML = `<div class="active-chip"><span class="active-chip-name" title="${value}">${value}</span><span class="active-chip-clear">×</span></div>`;
  el.querySelector('.active-chip-clear').addEventListener('click', e => { e.stopPropagation(); onClear(); });
}

// ── Topic list — rebuilt whenever the language selection changes ──
function refreshTopicList(){
  const topicList = document.getElementById('topic-list');
  topicList.innerHTML = '';

  if(!filterLang){
    topicList.innerHTML = '<div class="topic-placeholder">Select a language first</div>';
    return;
  }

  // Count topics across repos of the selected language only
  const langIndices = graphData.langMap[filterLang] || [];
  const topicCount  = new Map();
  for(const idx of langIndices){
    for(const t of graphData.nodes[idx].topics){
      topicCount.set(t, (topicCount.get(t) || 0) + 1);
    }
  }

  if(!topicCount.size){
    topicList.innerHTML = '<div class="topic-placeholder">No topics found</div>';
    return;
  }

  [...topicCount.entries()]
    .sort((a,b) => a[0].localeCompare(b[0]))
    .forEach(([topic, count]) => {
      const el = document.createElement('div');
      el.className = 'lang-item';
      el.dataset.topic = topic;
      el.innerHTML = `<span class="lang-name">${topic}</span><span class="lang-count">${count}</span>`;
      el.addEventListener('click', () => {
        filterTopic = filterTopic === topic ? null : topic;
        document.querySelectorAll('#topic-list .lang-item').forEach(e => e.classList.toggle('active', e.dataset.topic === filterTopic));
        setChip('topic-chip', filterTopic, () => {
          filterTopic = null;
          document.querySelectorAll('#topic-list .lang-item').forEach(e => e.classList.remove('active'));
          setChip('topic-chip', null);
          rebuildGraph();
        });
        if(filterTopic) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        rebuildGraph();
      });
      topicList.appendChild(el);
    });
}

// ── App shell population ──
function showApp(username){
  document.documentElement.classList.remove('restoring');
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

        // Clearing language also clears topic
        filterTopic = null;
        document.querySelectorAll('#topic-list .lang-item').forEach(e => e.classList.remove('active'));
        setChip('topic-chip', null);
        refreshTopicList();

        setChip('lang-chip', filterLang, () => {
          filterLang = null;
          filterTopic = null;
          document.querySelectorAll('#lang-list .lang-item').forEach(e => e.classList.remove('active'));
          setChip('lang-chip', null);
          setChip('topic-chip', null);
          refreshTopicList();
          rebuildGraph();
        });
        if(filterLang) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        rebuildGraph();
      });
      langList.appendChild(el);
    });

  // Topic list starts empty until a language is chosen
  refreshTopicList();

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
