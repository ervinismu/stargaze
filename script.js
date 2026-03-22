const LANG_COLORS = {
  JavaScript:"#f7df1e",TypeScript:"#3178c6",Python:"#4584b6",Rust:"#ce422b",
  Go:"#00acd7",Java:"#e76f00","C++":"#f34b7d",C:"#a8b9cc","C#":"#9b4993",
  Ruby:"#cc342d",PHP:"#7a86b8",Swift:"#fa7343",Kotlin:"#7f52ff",Dart:"#01579b",
  Shell:"#89e051",HTML:"#e44b23",CSS:"#264de4",Vue:"#41b883",Scala:"#dc322f",
  Haskell:"#5e5086",Elixir:"#6e4a7e",Lua:"#000080",R:"#198ce7",Zig:"#ec915c",
  Nix:"#7e7eff",OCaml:"#ef7a08",Clojure:"#db5855",GLSL:"#5686a5",
  default:"#6e7681"
};

function langColor(l){ return LANG_COLORS[l] || LANG_COLORS.default; }
function nodeR(d){ return Math.max(4, Math.min(10, 4 + Math.log2(Math.max(1, d.stars)) * 0.7)); }
function fmtNum(n){ return n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n); }

// ── State ──
let allRepos = [];
let graphData = null;
let filterLang  = null;
let filterTopic = null;
let searchVal = '';
let sim = null;
let selectedNode = null;
let canvasController = null;
let resizeObs = null;
let showLabels = true;
let currentDraw = null;
let currentZoom = null;
let zoomCanvas  = null;

// ── DOM refs ──
const landing = document.getElementById('landing');
const appEl   = document.getElementById('app');
const tooltip = document.getElementById('tooltip');

// ── Fetch ──
async function loadRepos(){
  const username = document.getElementById('input-username').value.trim();
  const token    = document.getElementById('input-token').value.trim();
  if(!username) return;

  const errBox = document.getElementById('error-box');
  const btn    = document.getElementById('btn-load');
  errBox.style.display = 'none';
  btn.disabled = true;

  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if(token) headers['Authorization'] = 'token ' + token;

  allRepos = [];
  let page = 1;
  const maxPages = token ? 20 : 6;

  try {
    while(page <= maxPages){
      btn.textContent = `Fetching… (${allRepos.length} loaded)`;
      const url = `https://api.github.com/users/${encodeURIComponent(username)}/starred?per_page=100&page=${page}`;
      const res = await fetch(url, { headers });

      if(!res.ok){
        if(res.status === 403) throw new Error('Rate limited by GitHub. Add a personal token to load more repos.');
        if(res.status === 404) throw new Error(`User "${username}" not found on GitHub.`);
        throw new Error(`GitHub API error (${res.status})`);
      }

      const data = await res.json();
      if(!data.length) break;
      allRepos = allRepos.concat(data);
      if(data.length < 100) break;
      page++;
      await new Promise(r => setTimeout(r, 50));
    }

    if(!allRepos.length) throw new Error('No starred repos found for this user.');

    graphData = buildGraph(allRepos);
    showApp(username);
  } catch(e){
    errBox.textContent = e.message;
    errBox.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Build Graph →';
  }
}

// ── Build graph ──
function buildGraph(repos){
  const nodes = repos.map(r => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    url: r.html_url,
    description: r.description || '',
    language: r.language || 'Unknown',
    stars: r.stargazers_count,
    forks: r.forks_count,
    topics: Array.isArray(r.topics) ? r.topics : [],
    updatedAt: r.updated_at,
    color: langColor(r.language),
    owner: r.owner?.login || '',
  }));

  const topicMap = {}, langMap = {};
  nodes.forEach((n, i) => {
    n.topics.forEach(t => { (topicMap[t] = topicMap[t]||[]).push(i); });
    (langMap[n.language] = langMap[n.language]||[]).push(i);
  });

  const links = [], seen = new Set();
  Object.entries(topicMap).forEach(([, idxs]) => {
    if(idxs.length < 2 || idxs.length > 25) return;
    const cap = Math.min(idxs.length, 12);
    for(let i=0;i<cap;i++) for(let j=i+1;j<cap;j++){
      const a=Math.min(idxs[i],idxs[j]), b=Math.max(idxs[i],idxs[j]);
      const k=`${a}-${b}`;
      if(!seen.has(k)){ seen.add(k); links.push({source:nodes[a].id, target:nodes[b].id}); }
    }
  });

  return { nodes, links, topicMap, langMap };
}

// ── Show app ──
function showApp(username){
  landing.style.display = 'none';
  appEl.classList.add('visible');

  function setChip(chipId, value, onClear){
    const el = document.getElementById(chipId);
    if(!value){ el.innerHTML = ''; return; }
    el.innerHTML = `<div class="active-chip"><span class="active-chip-name" title="${value}">${value}</span><span class="active-chip-clear">×</span></div>`;
    el.querySelector('.active-chip-clear').addEventListener('click', e => { e.stopPropagation(); onClear(); });
  }

  const topLangs = Object.entries(graphData.langMap)
    .sort((a,b)=>a[0].localeCompare(b[0]));
  const langList = document.getElementById('lang-list');
  langList.innerHTML = '';
  topLangs.forEach(([lang, idxs]) => {
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

  const topTopics = Object.entries(graphData.topicMap)
    .sort((a,b) => a[0].localeCompare(b[0]));
  const topicList = document.getElementById('topic-list');
  topicList.innerHTML = '';
  topTopics.forEach(([topic, idxs]) => {
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

  document.getElementById('stats-list').innerHTML = [
    ['Repos', allRepos.length],
    ['Languages', Object.keys(graphData.langMap).length],
    ['Topics', Object.keys(graphData.topicMap).length],
    ['Edges', graphData.links.length],
  ].map(([l,v])=>`<div class="stat-row"><span class="stat-label">${l}</span><span class="stat-val">${v.toLocaleString()}</span></div>`).join('');

  updateHeaderMeta(username, allRepos.length, allRepos.length, graphData.links.length);
  rebuildGraph();
}

function updateHeaderMeta(username, filtered, total, edges){
  document.getElementById('header-meta').innerHTML =
    `<b>${username}</b> · ${filtered !== total ? `<em>${filtered}</em>/${total}` : `<b>${total}</b>`} repos · <b>${edges}</b> edges`;
}

// ── Graph (Canvas renderer) ──
function rebuildGraph(){
  if(sim) sim.stop();

  // Cancel old canvas event listeners and resize observer
  if(canvasController) canvasController.abort();
  canvasController = new AbortController();
  const signal = canvasController.signal;
  if(resizeObs){ resizeObs.disconnect(); resizeObs = null; }

  const { nodes: allNodes, links: allLinks } = graphData;
  const q = searchVal.toLowerCase().trim();

  const visNodes = allNodes.filter(n => {
    if(filterLang  && n.language !== filterLang) return false;
    if(filterTopic && !n.topics.includes(filterTopic)) return false;
    if(q) return n.name.toLowerCase().includes(q) ||
      n.description.toLowerCase().includes(q) ||
      n.topics.some(t => t.includes(q)) ||
      n.language.toLowerCase().includes(q) ||
      n.fullName.toLowerCase().includes(q);
    return true;
  });

  const simNodes = visNodes.map(n => ({...n}));
  const visIds = new Set(simNodes.map(n => n.id));
  const simLinks = allLinks
    .filter(l => visIds.has(l.source?.id ?? l.source) && visIds.has(l.target?.id ?? l.target))
    .map(l => ({ source: l.source?.id ?? l.source, target: l.target?.id ?? l.target }));

  const username = document.getElementById('input-username').value.trim();
  updateHeaderMeta(username, visNodes.length, allNodes.length, simLinks.length);

  const canvas = document.getElementById('graph-canvas');
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const ctx = canvas.getContext('2d');

  let transform  = d3.zoomIdentity;
  let quadtree   = null;
  let hoveredNode = null;
  let dragNode   = null;
  let wasDragging = false;

  function buildQuadtree(){
    quadtree = d3.quadtree().x(d=>d.x).y(d=>d.y).addAll(simNodes);
  }

  function findNode(cx, cy, threshold = 20){
    if(!quadtree) return null;
    const [wx, wy] = transform.invert([cx, cy]);
    return quadtree.find(wx, wy, threshold / transform.k) || null;
  }

  function drawGrid(){
    const W = canvas.width, H = canvas.height;
    // Adapt spacing so dots are always 20-40px apart on screen
    let spacing = 50;
    while(spacing * transform.k < 20) spacing *= 2;
    while(spacing * transform.k > 80) spacing /= 2;
    // Skip grid at extreme zoom-out (would draw too many dots)
    if(spacing * transform.k < 10) return;

    const dotR = 1.2 / transform.k;
    const wx0 = -transform.x / transform.k;
    const wy0 = -transform.y / transform.k;
    const wx1 = (W - transform.x) / transform.k;
    const wy1 = (H - transform.y) / transform.k;

    const startX = Math.floor(wx0 / spacing) * spacing;
    const startY = Math.floor(wy0 / spacing) * spacing;

    ctx.fillStyle = '#1e2d40';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for(let x = startX; x <= wx1 + spacing; x += spacing){
      for(let y = startY; y <= wy1 + spacing; y += spacing){
        ctx.moveTo(x + dotR, y);
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw(){
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    drawGrid();

    // All links in one path — massive perf win over per-element SVG
    ctx.beginPath();
    ctx.strokeStyle = '#1e2d40';
    ctx.lineWidth   = 0.9 / transform.k;
    ctx.globalAlpha = 0.75;
    for(const l of simLinks){
      ctx.moveTo(l.source.x, l.source.y);
      ctx.lineTo(l.target.x, l.target.y);
    }
    ctx.stroke();

    // Nodes grouped by color — minimises fillStyle changes
    ctx.globalAlpha = 0.88;
    const byColor = new Map();
    for(const n of simNodes){
      if(n === hoveredNode) continue;
      const list = byColor.get(n.color);
      if(list) list.push(n); else byColor.set(n.color, [n]);
    }
    for(const [color, nodes] of byColor){
      ctx.fillStyle = color;
      ctx.beginPath();
      for(const n of nodes){
        const r = nodeR(n);
        ctx.moveTo(n.x + r, n.y);
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Hovered node drawn last with glow
    if(hoveredNode){
      const n = hoveredNode;
      const r = nodeR(n) + 4;
      ctx.save();
      ctx.shadowColor = n.color;
      ctx.shadowBlur  = 15 / transform.k;
      ctx.fillStyle   = n.color;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Node labels — visible world bounds for culling off-screen nodes
    if(!showLabels){ ctx.restore(); return; }
    const vx0 = -transform.x / transform.k;
    const vy0 = -transform.y / transform.k;
    const vx1 = (canvas.width  - transform.x) / transform.k;
    const vy1 = (canvas.height - transform.y) / transform.k;

    const fontSize = 10 / transform.k;
    ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.globalAlpha  = 1;
    ctx.shadowColor  = '#0b0c10';
    ctx.shadowBlur   = 4 / transform.k;

    for(const n of simNodes){
      // Skip nodes outside the visible viewport (+ a small margin)
      if(n.x < vx0 - 60 || n.x > vx1 + 60 || n.y < vy0 - 60 || n.y > vy1 + 60) continue;
      const label = n.name.length > 22 ? n.name.slice(0, 20) + '…' : n.name;
      const ty = n.y + nodeR(n) + 3 / transform.k;
      ctx.fillStyle = n === hoveredNode ? '#e6edf3' : '#8b949e';
      ctx.fillText(label, n.x, ty);
    }
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // ── Simulation ──
  // Degree map — number of links per node, used to scale link distance
  const degreeMap = new Map(simNodes.map(n => [n.id, 0]));
  for(const l of simLinks){
    degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1);
    degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1);
  }

  const W = canvas.width, H = canvas.height;
  sim = d3.forceSimulation(simNodes)
    .force('link', d3.forceLink(simLinks).id(d=>d.id)
      // High-degree hub nodes get longer links so they spread out from each other
      .distance(l => {
        const sd = degreeMap.get(l.source.id ?? l.source) || 1;
        const td = degreeMap.get(l.target.id ?? l.target) || 1;
        return 60 + Math.sqrt(sd + td) * 12;
      })
      .strength(0.3))
    .force('charge',  d3.forceManyBody().strength(-180).distanceMax(400))
    // Stronger center keeps isolated nodes from drifting to the far edges
    .force('center',  d3.forceCenter(W/2, H/2).strength(0.08))
    .force('collide', d3.forceCollide().radius(d=>nodeR(d)+5))
    .alphaDecay(0.04)
    .velocityDecay(0.4)
    .stop();

  // Pre-warm: run ticks synchronously so graph starts near-settled
  const preTicks = Math.min(300, Math.max(50, Math.floor(10000 / Math.max(simNodes.length, 1))));
  for(let i = 0; i < preTicks; i++) sim.tick();

  currentDraw = draw;
  buildQuadtree();
  draw();

  // Resume animated settling, skipping frames for large graphs
  let tickN = 0;
  const tickSkip = simNodes.length > 600 ? 3 : simNodes.length > 300 ? 2 : 1;
  sim.restart().on('tick', () => {
    if(++tickN % tickSkip !== 0) return;
    buildQuadtree();
    draw();
  });

  // ── Zoom / pan ──
  const zoomBehavior = d3.zoom()
    .scaleExtent([0.04, 8])
    .filter(e => {
      if(e.type === 'mousedown') return !findNode(e.offsetX, e.offsetY);
      return !e.button;
    })
    .on('zoom', e => { transform = e.transform; draw(); });

  d3.select(canvas).call(zoomBehavior).on('dblclick.zoom', null);
  currentZoom = zoomBehavior;
  zoomCanvas  = canvas;

  // ── Node drag ──
  canvas.addEventListener('mousedown', e => {
    if(e.button !== 0) return;
    const found = findNode(e.offsetX, e.offsetY);
    if(found){
      dragNode = found; wasDragging = false;
      sim.alphaTarget(0.3).restart();
      found.fx = found.x; found.fy = found.y;
    }
  }, { signal });

  canvas.addEventListener('mousemove', e => {
    if(dragNode){
      wasDragging = true;
      const [wx, wy] = transform.invert([e.offsetX, e.offsetY]);
      dragNode.fx = wx; dragNode.fy = wy;
      return;
    }
    const found = findNode(e.offsetX, e.offsetY);
    if(found !== hoveredNode){
      hoveredNode = found; draw();
      if(found) showTooltip(e, found); else hideTooltip();
    } else if(found){
      moveTooltip(e);
    }
  }, { signal });

  canvas.addEventListener('mouseup', () => {
    if(dragNode){
      sim.alphaTarget(0);
      dragNode.fx = null; dragNode.fy = null; dragNode = null;
    }
  }, { signal });

  canvas.addEventListener('mouseleave', () => {
    hoveredNode = null; hideTooltip();
    if(dragNode){
      sim.alphaTarget(0);
      dragNode.fx = null; dragNode.fy = null; dragNode = null;
    }
    draw();
  }, { signal });

  canvas.addEventListener('click', e => {
    if(wasDragging){ wasDragging = false; return; }
    const found = findNode(e.offsetX, e.offsetY);
    if(found){
      const orig = allNodes.find(n => n.id === found.id) || found;
      openDetail(orig); hideTooltip();
    } else {
      closeDetail();
    }
  }, { signal });

  // ── Resize ──
  resizeObs = new ResizeObserver(() => {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    draw();
  });
  resizeObs.observe(canvas);
}

// ── Tooltip ──
function showTooltip(e, d){
  document.getElementById('tip-name').textContent = d.name;
  document.getElementById('tip-dot').style.cssText = `background:${d.color};box-shadow:0 0 4px ${d.color}`;
  document.getElementById('tip-lang').textContent = d.language;
  document.getElementById('tip-stars').textContent = '⭐ '+fmtNum(d.stars);
  tooltip.style.display = 'block';
  moveTooltip(e);
}
function moveTooltip(e){ tooltip.style.left=(e.clientX+14)+'px'; tooltip.style.top=(e.clientY-36)+'px'; }
function hideTooltip(){ tooltip.style.display='none'; }

// ── Detail panel ──
function openDetail(n){
  selectedNode = n;
  document.getElementById('d-name').textContent = n.name;
  document.getElementById('d-sub').textContent = `${n.owner}/${n.name}`;
  document.getElementById('d-desc').textContent = n.description || 'No description';
  document.getElementById('d-stars').textContent = fmtNum(n.stars);
  document.getElementById('d-forks').textContent = fmtNum(n.forks);
  document.getElementById('d-lang').textContent = n.language;
  document.getElementById('d-lang-dot').style.cssText = `background:${n.color};box-shadow:0 0 5px ${n.color}`;
  document.getElementById('d-date').textContent = 'Updated '+new Date(n.updatedAt).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
  document.getElementById('d-link').href = n.url;

  const topicsWrap = document.getElementById('d-topics-wrap');
  const topicPills = document.getElementById('d-topics');
  topicPills.innerHTML = '';
  if(n.topics.length){
    topicsWrap.style.display='block';
    n.topics.forEach(t => {
      const b = document.createElement('button');
      b.className='topic-pill'; b.textContent=t;
      b.onclick = () => { document.getElementById('search-input').value=t; searchVal=t; rebuildGraph(); closeDetail(); };
      topicPills.appendChild(b);
    });
  } else { topicsWrap.style.display='none'; }

  document.getElementById('d-similar').onclick = () => {
    if(n.topics[0]){ document.getElementById('search-input').value=n.topics[0]; searchVal=n.topics[0]; rebuildGraph(); }
    closeDetail();
  };

  document.getElementById('detail').classList.add('visible');
}
function closeDetail(){
  selectedNode = null;
  document.getElementById('detail').classList.remove('visible');
}

// ── Event wiring ──
document.getElementById('btn-load').addEventListener('click', loadRepos);
document.getElementById('input-username').addEventListener('keydown', e => { if(e.key==='Enter') loadRepos(); });
document.getElementById('input-token').addEventListener('keydown', e => { if(e.key==='Enter') loadRepos(); });

document.getElementById('search-input').addEventListener('input', e => {
  searchVal = e.target.value;
  clearTimeout(window._searchTimer);
  window._searchTimer = setTimeout(rebuildGraph, 250);
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if(sim) sim.stop();
  if(canvasController){ canvasController.abort(); canvasController = null; }
  if(resizeObs){ resizeObs.disconnect(); resizeObs = null; }
  allRepos=[]; graphData=null; filterLang=null; filterTopic=null; searchVal=''; selectedNode=null;
  document.getElementById('lang-chip').innerHTML='';
  document.getElementById('topic-chip').innerHTML='';
  currentDraw=null; currentZoom=null; zoomCanvas=null;
  showLabels=true; document.getElementById('toggle-labels').checked=true;
  appEl.classList.remove('visible');
  landing.style.display='flex';
  document.getElementById('input-username').value='';
  document.getElementById('input-token').value='';
  document.getElementById('btn-load').disabled=false;
  document.getElementById('btn-load').textContent='Build Graph →';
  document.getElementById('error-box').style.display='none';
  closeDetail();
});

document.getElementById('d-close').addEventListener('click', closeDetail);

document.getElementById('btn-zoom-in').addEventListener('click', () => {
  if(currentZoom && zoomCanvas) d3.select(zoomCanvas).transition().duration(250).call(currentZoom.scaleBy, 1.5);
});
document.getElementById('btn-zoom-out').addEventListener('click', () => {
  if(currentZoom && zoomCanvas) d3.select(zoomCanvas).transition().duration(250).call(currentZoom.scaleBy, 1/1.5);
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
  const W = zoomCanvas.offsetWidth, H = zoomCanvas.offsetHeight;
  const pad = 60;
  const k = Math.min(0.9, (W - pad*2) / (x1-x0), (H - pad*2) / (y1-y0));
  const tx = W/2 - k*(x0+x1)/2, ty = H/2 - k*(y0+y1)/2;
  d3.select(zoomCanvas).transition().duration(400).call(currentZoom.transform, d3.zoomIdentity.translate(tx,ty).scale(k));
});

document.getElementById('toggle-labels').addEventListener('change', e => {
  showLabels = e.target.checked;
  if(currentDraw) currentDraw();
});
