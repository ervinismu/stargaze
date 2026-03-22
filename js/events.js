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

// ── Reset ──
document.getElementById('btn-reset').addEventListener('click', () => {
  if(sim) sim.stop();
  if(canvasController){ canvasController.abort(); canvasController = null; }
  if(resizeObs){ resizeObs.disconnect(); resizeObs = null; }

  allRepos=[]; graphData=null; filterLang=null; filterTopic=null;
  searchVal=''; selectedNode=null; currentDraw=null; currentZoom=null; zoomCanvas=null;

  document.getElementById('lang-chip').innerHTML  = '';
  document.getElementById('topic-chip').innerHTML = '';
  showLabels = true;
  document.getElementById('toggle-labels').checked = true;

  appEl.classList.remove('visible');
  landing.style.display = 'flex';
  document.getElementById('input-username').value = '';
  document.getElementById('input-token').value    = '';
  document.getElementById('btn-load').disabled    = false;
  document.getElementById('btn-load').textContent  = 'Build Graph →';
  document.getElementById('error-box').style.display = 'none';
  closeDetail();
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
