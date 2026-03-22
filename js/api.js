// ── GitHub API fetch ──
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
