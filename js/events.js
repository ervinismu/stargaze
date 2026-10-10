// ── Auto-restore last session ──
const _savedUser = localStorage.getItem('stargaze_username');
if(_savedUser){
  document.getElementById('input-username').value = _savedUser;
  loadRepos();
}

// ── Re-fetch ──
document.getElementById('btn-refetch').addEventListener('click', () => loadRepos(true));

// ── Landing ──
document.getElementById('btn-load').addEventListener('click', loadRepos);
document.getElementById('input-username').addEventListener('keydown', e => { if(e.key==='Enter') loadRepos(); });
document.getElementById('input-token').addEventListener('keydown',   e => { if(e.key==='Enter') loadRepos(); });

// ── Search ──
document.getElementById('search-input').addEventListener('input', e => {
  searchVal = e.target.value;
  clearTimeout(window._searchTimer);
  window._searchTimer = setTimeout(rebuildGraph, 250);
});

// ── Sidebar list search (filters the lists themselves, not the graph) ──
document.getElementById('lang-filter').addEventListener('input',  refreshLangList);
document.getElementById('topic-filter').addEventListener('input', refreshTopicList);

// ── Clear all filters ──
document.getElementById('btn-clear-filters').addEventListener('click', clearAllFilters);

// ── Reset ──
document.getElementById('btn-reset').addEventListener('click', () => {
  if(sim) sim.stop();
  if(canvasController){ canvasController.abort(); canvasController = null; }
  if(resizeObs){ resizeObs.disconnect(); resizeObs = null; }

  allRepos=[]; graphData=null; filterLangs.clear(); filterTopics.clear(); filterList=null;
  allLists=[]; listsStatus='none';
  searchVal=''; selectedNode=null; currentDraw=null; currentZoom=null; zoomCanvas=null;
  posCache.clear(); savedTransform=null; currentClearFocus=null;

  document.getElementById('lang-chip').innerHTML  = '';
  document.getElementById('topic-chip').innerHTML = '';
  document.getElementById('list-chip').innerHTML  = '';
  document.getElementById('lists-block').style.display = 'none';
  document.getElementById('list-list').innerHTML = '';
  document.getElementById('lang-filter').value  = '';
  document.getElementById('topic-filter').value = '';
  document.getElementById('btn-clear-filters').style.display = 'none';
  showLabels = true;
  document.getElementById('toggle-labels').checked = true;

  appEl.classList.remove('visible');
  landing.style.display = 'flex';
  startStarfield();
  localStorage.removeItem('stargaze_username');
  localStorage.removeItem(REPO_CACHE_KEY);
  document.getElementById('input-username').value = '';
  document.getElementById('input-token').value    = '';
  document.getElementById('btn-load').disabled    = false;
  document.getElementById('btn-load').textContent  = 'Build Graph →';
  document.getElementById('error-box').style.display = 'none';
  closeDetail();
});

// ── Keyboard shortcuts ──
//   /    focus the search bar
//   Esc  close detail panel → exit focus mode → clear search (in that order)
document.addEventListener('keydown', e => {
  const typing = /^(input|textarea)$/i.test(e.target.tagName || '');

  if(e.key === '/' && !typing && appEl.classList.contains('visible')){
    e.preventDefault();
    document.getElementById('search-input').focus();
    return;
  }

  if(e.key === 'Escape'){
    if(typing){ e.target.blur(); return; }
    if(!appEl.classList.contains('visible')) return;
    if(document.getElementById('detail').classList.contains('visible')){ closeDetail(); return; }
    if(currentClearFocus && currentClearFocus()) return;
    const si = document.getElementById('search-input');
    if(si.value){ si.value = ''; searchVal = ''; rebuildGraph(); }
  }
});

// ── Detail panel ──
document.getElementById('d-close').addEventListener('click', closeDetail);

// ── Zoom controls ──
document.getElementById('btn-zoom-in').addEventListener('click', () => {
  if(currentZoom && zoomCanvas)
    d3.select(zoomCanvas).transition().duration(250).call(currentZoom.scaleBy, 1.5);
});
document.getElementById('btn-zoom-out').addEventListener('click', () => {
  if(currentZoom && zoomCanvas)
    d3.select(zoomCanvas).transition().duration(250).call(currentZoom.scaleBy, 1/1.5);
});
document.getElementById('btn-zoom-fit').addEventListener('click', () => {
  if(!currentZoom || !zoomCanvas || !sim) return;
  const nodes = sim.nodes();
  if(!nodes.length) return;
  let x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
  for(const n of nodes){
    x0=Math.min(x0,n.x); y0=Math.min(y0,n.y);
    x1=Math.max(x1,n.x); y1=Math.max(y1,n.y);
  }
  const W = zoomCanvas.offsetWidth, H = zoomCanvas.offsetHeight, pad = 60;
  const k  = Math.min(0.9, (W-pad*2)/(x1-x0), (H-pad*2)/(y1-y0));
  const tx = W/2 - k*(x0+x1)/2, ty = H/2 - k*(y0+y1)/2;
  d3.select(zoomCanvas).transition().duration(400)
    .call(currentZoom.transform, d3.zoomIdentity.translate(tx,ty).scale(k));
});

// ── Display toggles ──
document.getElementById('toggle-labels').addEventListener('change', e => {
  showLabels = e.target.checked;
  if(currentDraw) currentDraw();
});

// Theme — applied via data-theme on <html>; canvas colors are re-read on rebuild
const themeToggle = document.getElementById('toggle-theme');
themeToggle.checked = document.documentElement.dataset.theme !== 'light';
themeToggle.addEventListener('change', e => {
  const theme = e.target.checked ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try{ localStorage.setItem('stargaze_theme', theme); }catch(err){}
  if(graphData) rebuildGraph();
});
