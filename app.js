(() => {
  const $ = (s) => document.querySelector(s);
  const network = $('#network');
  const state = { rows: [], visible: [], byId: new Map(), batchStart: 0, query: '', minScore: 0, selected: null };
  const poemMap = new Map();
  function parseCSV(text) {
    const rows=[]; let row=[], field='', quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(field);field='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}else field+=c;}
    row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows;
  }
  function normalize(s){return (s||'').replace(/^\uFEFF/,'').trim();}
  function nodeKey(author,poemId,verseId){return `${author}:${poemId}:${verseId}`;}
  async function init(){
    try{
      let pairRows,liRows,duRows;
      if(window.poetryData){pairRows=window.poetryData.pairs;liRows=window.poetryData.li||[];duRows=window.poetryData.du||[];}
      else{const texts=await Promise.all(['李杜/李白-杜甫.csv','李杜/李白.csv','李杜/杜甫.csv'].map(async url=>{const r=await fetch(url);if(!r.ok)throw new Error(`无法读取 ${url}`);return r.text();}));[pairRows,liRows,duRows]=texts.map(parseCSV);}
      for(const [author,rows] of [['李白',liRows],['杜甫',duRows]])for(const r of rows){if(r.length<4)continue;const poemId=normalize(r[2]),verseId=normalize(r[3]);poemMap.set(nodeKey(author,poemId,verseId),{title:normalize(r[0]),line:normalize(r[1]),poemId,verseId,author});}
      state.rows=pairRows.filter(r=>r.length>=11).map((r,i)=>{
        const left={author:normalize(r[0]),title:normalize(r[1]),line:normalize(r[2]),poemId:normalize(r[7]),verseId:normalize(r[8])};
        const right={author:normalize(r[3]),title:normalize(r[4]),line:normalize(r[5]),poemId:normalize(r[9]),verseId:normalize(r[10])};
        left.poem=poemMap.get(nodeKey(left.author,left.poemId,left.verseId));right.poem=poemMap.get(nodeKey(right.author,right.poemId,right.verseId));
        return {id:i,left,right,score:Number(normalize(r[6]))||0};
      });
      state.rows.sort((a,b)=>b.score-a.score||a.id-b.id);state.byId=new Map(state.rows.map(r=>[r.id,r]));
      const selector=$('#range-select');if(selector){const options=document.createDocumentFragment();for(let start=0;start<state.rows.length;start+=20){const option=document.createElement('option');option.value=String(start);option.textContent=`${start+1}–${Math.min(start+20,state.rows.length)}`;options.append(option);}selector.append(options);selector.addEventListener('change',()=>{state.batchStart=Number(selector.value)||0;filterRows();});}
      const statPairs=$('#stat-pairs'),statPoems=$('#stat-poems');if(statPairs&&statPoems){statPairs.textContent=state.rows.length.toLocaleString('zh-CN');const poemIds=new Set();state.rows.forEach(r=>{poemIds.add(`${r.left.author}:${r.left.poemId}`);poemIds.add(`${r.right.author}:${r.right.poemId}`)});statPoems.textContent=poemIds.size.toLocaleString('zh-CN');}
      $('#loading').classList.add('hidden');filterRows();
    }catch(e){$('#loading').textContent='数据载入失败，请通过本地服务器或 GitHub Pages 打开。';console.error(e);}
  }
  function filterRows(){state.visible=state.rows.slice(state.batchStart,state.batchStart+20);const first=state.visible.length?state.batchStart+1:0,last=state.batchStart+state.visible.length;const count=$('#result-count');if(count)count.textContent=`相似度排名 ${first}–${last}`;render();}
  function render(){if(location.hash==='#explore')drawNetwork();if(location.hash==='#index')renderList();}
  function drawNetwork(){if(!network)return;const rows=state.visible;if(!rows.length){network.innerHTML='';return;}const leftKeys=new Set(),rightKeys=new Set(),labels=new Map(),firstPair=new Map();
    rows.forEach(r=>{const lk=nodeKey(r.left.author,r.left.poemId,r.left.verseId),rk=nodeKey(r.right.author,r.right.poemId,r.right.verseId);leftKeys.add(lk);rightKeys.add(rk);labels.set(lk,r.left.line);labels.set(rk,r.right.line);if(!firstPair.has(lk))firstPair.set(lk,r.id);if(!firstPair.has(rk))firstPair.set(rk,r.id);});
    const W=network.clientWidth||1200,H=network.clientHeight||680,cx=W/2,leftX=W*.2,rightX=W*.8,left=[...leftKeys].sort(),right=[...rightKeys].sort(),positions=new Map();network.setAttribute('viewBox',`0 0 ${W} ${H}`);
    const place=(keys,x,side)=>keys.forEach((key,i)=>positions.set(key,{x,y:42+(i+.5)*(H-84)/Math.max(1,keys.length),side,key}));place(left,leftX,-1);place(right,rightX,1);
    const links=rows.map(r=>{const a=positions.get(nodeKey(r.left.author,r.left.poemId,r.left.verseId)),b=positions.get(nodeKey(r.right.author,r.right.poemId,r.right.verseId)),ratio=Math.max(.12,Math.min(1,r.score/10000));return `<path class="relation-link" data-row="${r.id}" d="M ${a.x} ${a.y} C ${cx-W*.13} ${a.y}, ${cx+W*.13} ${b.y}, ${b.x} ${b.y}" stroke-opacity="${(.22+ratio*.36).toFixed(2)}" stroke-width="${(.8+ratio*1.2).toFixed(1)}"><title>${esc(r.left.line)} ↔ ${esc(r.right.line)} · ${(r.score/100).toFixed(1)}%</title></path>`;}).join('');
    const maxChars=Math.max(5,Math.min(11,Math.floor(W*.23/14)));
    const nodes=[...positions.values()].map(p=>{let line=String(labels.get(p.key)||'');if(line.length>maxChars)line=line.slice(0,maxChars-1)+'…';const leftSide=p.side<0,tx=leftSide?p.x+12:p.x-12,anchor=leftSide?'start':'end',tagWidth=Math.min(W*.23,Math.max(34,line.length*14+12)),tagX=leftSide?tx-5:tx-tagWidth+5;return `<g class="poetry-node ${leftSide?'node-li':'node-du'}" data-row="${firstPair.get(p.key)}"><title>${esc(labels.get(p.key)||'')}</title><circle cx="${p.x}" cy="${p.y}" r="4"/><rect x="${tagX}" y="${p.y-10}" width="${tagWidth}" height="20" rx="3"/><text x="${tx}" y="${p.y+4}" text-anchor="${anchor}">${esc(line)}</text></g>`;}).join('');
    network.innerHTML=`<text class="author-label label-li" x="${leftX}" y="25">李白</text><text class="author-label label-du" x="${rightX}" y="25" text-anchor="end">杜甫</text><g>${links}</g><g>${nodes}</g>`;
  }
  function renderList(){const el=$('#list-view');const q=state.query.toLowerCase(),matches=state.rows.filter(r=>r.score>=state.minScore&&(!q||[r.left.line,r.right.line,r.left.title,r.right.title].join(' ').toLowerCase().includes(q))),rows=matches.slice(0,250);el.innerHTML=rows.map(r=>`<div class="list-row" data-id="${r.id}"><span class="score">${(r.score/100).toFixed(1)}%</span><span class="line-cell">${esc(r.left.line)}</span><span class="line-cell">${esc(r.right.line)}</span><span class="author-cell">李白 · 杜甫</span></div>`).join('')+(matches.length>250?'<p style="text-align:center;color:#999;font-size:11px">共 '+matches.length.toLocaleString('zh-CN')+' 组，请搜索缩小范围</p>':'');el.querySelectorAll('.list-row').forEach(row=>row.addEventListener('click',()=>select(state.byId.get(Number(row.dataset.id)))));}
  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function select(r){if(!r)return;state.selected=r;const score=(r.score/100).toFixed(1),html=`<div class="match-score"><strong>${score}%</strong><span>诗句相似度</span></div>${verseHTML(r.left,'li-card')}${verseHTML(r.right,'du-card')}<div class="detail-footnote">诗句编号：${esc(r.left.verseId)} / ${esc(r.right.verseId)}<br>诗作编号：${esc(r.left.poemId)} / ${esc(r.right.poemId)}</div>`;document.querySelectorAll('.detail-content').forEach(el=>{el.className='detail-content';el.innerHTML=html;});document.querySelectorAll('.detail-panel').forEach(el=>el.classList.add('open'));}
  function verseHTML(v,cls){const full=v.poem&&v.poem.line&&v.poem.line!==v.line?`<div class="more-poem">所在诗句：${esc(v.poem.line)}</div>`:'';return `<article class="verse-card ${cls}"><div class="author">${esc(v.author)}</div><blockquote>${esc(v.line)}</blockquote><div class="poem">${esc(v.title)}</div>${full}</article>`;}
  network.addEventListener('click',e=>{const hit=e.target.closest('[data-row]');if(!hit)return;const row=state.byId.get(Number(hit.dataset.row));if(row){select(row);location.hash='#index';}});
  $('#search').addEventListener('input',e=>{$('#index-search').value=e.target.value;state.query=e.target.value.trim();filterRows();});$('#threshold').addEventListener('input',e=>{state.minScore=Number(e.target.value);$('#threshold-value').textContent=state.minScore?`${(state.minScore/100).toFixed(0)}% 以上`:'全部';filterRows();});
  $('#index-search').addEventListener('input',e=>{$('#search').value=e.target.value;state.query=e.target.value.trim();filterRows();});
  document.querySelectorAll('.close-detail,#close-detail').forEach(b=>b.addEventListener('click',()=>document.querySelectorAll('.detail-panel').forEach(p=>p.classList.remove('open'))));
  function route(){const page=location.hash==='#index'?'index':location.hash==='#explore'?'explore':'home';document.querySelectorAll('.page').forEach(p=>{const visible=p.id===page;p.hidden=!visible;p.classList.toggle('active',visible);});document.body.classList.toggle('is-exploring',page!=='home');if(page==='explore')requestAnimationFrame(drawNetwork);if(page==='index')renderList();}
  window.addEventListener('hashchange',route);window.addEventListener('resize',()=>{if(!$('#explore').classList.contains('active'))return;drawNetwork();});route();init();
})();
