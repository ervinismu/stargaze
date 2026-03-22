const REPO_CACHE_KEY = 'stargaze_repos_v1';

// ── Cache compression helpers ──
// To keep localStorage small we store a minimal "slim" shape with short keys.
// expandRepo() is the inverse — it rebuilds the full shape expected by buildGraph().
//
// Key mapping:
//   i = id                 (number)
//   n = name               (string)
//   f = full_name          (string, "owner/repo") — html_url and owner are derived from this
//   d = description        (string, truncated to 120 chars — we never display more)
//   l = language           (string | null)
//   s = stargazers_count   (number)
//   k = forks_count        (number)
//   t = topics             (string[])
//   a = updated_at         (ISO string)
//
// Fields NOT stored (reconstructed on expand):
//   html_url  → "https://github.com/" + full_name
//   owner     → full_name.split('/')[0]
function slimRepo(r){
  return {
    i: r.id,
    n: r.name,
    f: r.full_name,
    d: (r.description || '').slice(0, 120),
    l: r.language || null,
    s: r.stargazers_count,
    k: r.forks_count,
    t: Array.isArray(r.topics) ? r.topics : [],
    a: r.updated_at,
  };
}

function expandRepo(c){
  return {
    id:               c.i,
    name:             c.n,
    full_name:        c.f,
    html_url:         `https://github.com/${c.f}`,
    description:      c.d || '',
    language:         c.l || null,
    stargazers_count: c.s,
    forks_count:      c.k,
    topics:           c.t || [],
    updated_at:       c.a,
    owner:            { login: c.f.split('/')[0] },
  };
}

// ── GitHub API fetch ──
async function loadRepos(forceRefetch = false){
  const username = document.getElementById('input-username').value.trim();
  const token    = document.getElementById('input-token').value.trim();
  if(!username) return;

  const errBox     = document.getElementById('error-box');
  const btn        = document.getElementById('btn-load');
  const inpUser    = document.getElementById('input-username');
  const inpToken   = document.getElementById('input-token');
  const refetchBtn = document.getElementById('btn-refetch');
  errBox.style.display = 'none';

  // ── Try cache first ──
  if(!forceRefetch){
    try {
      const raw = localStorage.getItem(REPO_CACHE_KEY);
      if(raw){
        const cache = JSON.parse(raw);
        if(cache.username === username && Array.isArray(cache.repos) && cache.repos.length){
          allRepos  = cache.repos.map(expandRepo);
          graphData = buildGraph(allRepos);
          showApp(username);
          return;
        }
      }
    } catch(e){ /* corrupted cache — fall through to fetch */ }
  }

  // ── Fetch from GitHub API ──
  const inApp = appEl.classList.contains('visible');
  if(inApp){
    if(refetchBtn){ refetchBtn.disabled = true; refetchBtn.textContent = 'Fetching…'; }
  } else {
    btn.disabled = true; inpUser.disabled = true; inpToken.disabled = true;
  }

  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if(token) headers['Authorization'] = 'token ' + token;

  allRepos = [];
  let page = 1;
  const maxPages = token ? 20 : 6;

  try {
    while(page <= maxPages){
      if(!inApp) btn.textContent = `Fetching… (${allRepos.length} loaded)`;
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

    try {
      localStorage.setItem(REPO_CACHE_KEY, JSON.stringify({ username, repos: allRepos.map(slimRepo) }));
    } catch(e){ /* quota exceeded — cache skipped */ }

    graphData = buildGraph(allRepos);
    localStorage.setItem('stargaze_username', username);
    if(refetchBtn){ refetchBtn.disabled = false; refetchBtn.textContent = '↻ Re-fetch'; }
    showApp(username);
  } catch(e){
    errBox.textContent = e.message;
    errBox.style.display = 'block';
    if(inApp){
      if(refetchBtn){ refetchBtn.disabled = false; refetchBtn.textContent = '↻ Re-fetch'; }
    } else {
      btn.disabled = false; btn.textContent = 'Build Graph →';
      inpUser.disabled = false; inpToken.disabled = false;
    }
  }
}

// ── Graph data construction ──
function buildGraph(repos){
  const nodes = repos.map(r => ({
    id:          r.id,
    name:        r.name,
    fullName:    r.full_name,
    url:         r.html_url,
    description: r.description || '',
    language:    r.language || 'Unknown',
    stars:       r.stargazers_count,
    forks:       r.forks_count,
    topics:      Array.isArray(r.topics) ? r.topics : [],
    updatedAt:   r.updated_at,
    color:       langColor(r.language),
    owner:       r.owner?.login || '',
    _searchKey:  `${r.name} ${r.description||''} ${(Array.isArray(r.topics)?r.topics:[]).join(' ')} ${r.language||''} ${r.full_name}`.toLowerCase(),
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
