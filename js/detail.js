function openDetail(n){
  selectedNode = n;
  document.getElementById('d-name').textContent = n.name;
  document.getElementById('d-sub').textContent  = `${n.owner}/${n.name}`;
  document.getElementById('d-desc').textContent = n.description || 'No description';
  document.getElementById('d-stars').textContent = fmtNum(n.stars);
  document.getElementById('d-forks').textContent = fmtNum(n.forks);
  document.getElementById('d-lang').textContent  = n.language;
  document.getElementById('d-lang-dot').style.cssText = `background:${n.color};box-shadow:0 0 5px ${n.color}`;
  document.getElementById('d-date').textContent  = 'Updated '+new Date(n.updatedAt).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
  document.getElementById('d-link').href = n.url;

  const topicsWrap = document.getElementById('d-topics-wrap');
  const topicPills = document.getElementById('d-topics');
  topicPills.innerHTML = '';
  if(n.topics.length){
    topicsWrap.style.display = 'block';
    n.topics.forEach(t => {
      const b = document.createElement('button');
      b.className = 'topic-pill';
      b.textContent = t;
      b.onclick = () => {
        document.getElementById('search-input').value = t;
        searchVal = t;
        rebuildGraph();
        closeDetail();
      };
      topicPills.appendChild(b);
    });
  } else {
    topicsWrap.style.display = 'none';
  }

  document.getElementById('detail').classList.add('visible');
}

function closeDetail(){
  selectedNode = null;
  document.getElementById('detail').classList.remove('visible');
}
