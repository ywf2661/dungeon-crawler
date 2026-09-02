"use strict";
/*
노드맵 시스템 — 슬레이 더 스파이어식 절차적 경로 선택.
10층 단위 보스 사이클(보스 10/20/30/40/50층 — 배경 구역/LOCATIONS도 정확히
동일한 10층 단위 경계를 쓴다. 예전엔 여기가 5층 단위였는데 배경/구역만
10층 단위라 서로 어긋나 있었다 — 이번에 10층 단위로 통일해 수정함) 안에서,
그 사이 구간을 "몇 개의 노드를 지날지" 자유롭게 늘릴 수 있는 서브맵으로
대체한다. 노드를 많이 배치해도(예: 1구간 9개) depth 자체는 노드 하나당
오르지 않는다 — 대신 getVirtualDepth()가 "지금 이 구간에서 몇 번째 노드에
있는지"를 기준으로 10층 사이를 부드럽게 보간한 값을 계산해서, 그 값만 전투
스케일링(combat/battle-setup.js의 pickEnemy 등, 전부 전역 depth를 그대로
읽으므로 이 값을 depth에 대입하는 것만으로 자연히 반영됨)에 쓴다. 실제
depth가 정확히 10/20/30...이 되는 시점은 오직 "그 구간의 보스를 잡았을
때"뿐이다.

주의(사용자 요청 — 최종보스 트리거 위치 변경): 5번째 구간(tierIndex===5)은
generateSilentAltarMap()이 만드는 "고요한 제단" 특수 지도를 쓴다 — 가지
갈라짐 없이 준비 노드 1개(휴식/유물/상점/미지의 사건 중 무작위)+보스 노드
1개뿐이다. 이 보스 노드가 이제 진짜 최종보스 트리거다(resolveNode() 참고) —
원래 4번째 구간(depth 50) 보스가 곧바로 최종보스로 이어졌었는데, 이제 그
보스는 평범한 구간 보스가 되고 최종보스는 그 다음 "고요한 제단"에서 나온다.

export(전역): NODE_TYPES, TIER_NODE_COUNTS, getTierNodeCount, generateNodeMap,
              generateSilentAltarMap, enterNodeMapTier, getVirtualDepth, pickNode, resolveNode,
              renderNodeMapArea, nodeForcedElite(변수), nodeEliteBoost(변수)
의존성: state.js(player, depth), explore.js(addLog, renderExplore, saveGame 호출),
       relics.js(showRelicAltar/showCurseAltar), shop.js(openShop),
       combat/battle-setup.js(startBattle) — 순환 의존이라 함수 호출 시점에만 참조.
주의: 상점/휴식 노드는 사용자가 확정한 A안(무제한 자유 이용 금지, 노드로만 접근)을
     따른다. [구버전 메모] 옛 외상 도박사(jester_debtor)의 빚/황금고블린 시스템은
     "불운의 채권자"로 전면 교체되어 더 이상 선택되지 않는다(관련 depth 기반
     유예기간 로직은 레거시 세이브 호환용으로 손대지 않고 그대로 둠).
*/

  // 노드 종류. weight는 "특수 배치(relic/curse)를 제외한 나머지 칸"에 쓰는
  // 무작위 가중치 풀 — relic/curse는 가중치 추첨이 아니라 구간당 정확히 1개씩
  // 확정 배치된다(아래 generateNodeMap 참고).
  const NODE_TYPES = {
    combat: {icon:'⚔', label:'전투',       weight:46},
    elite:  {icon:'💀', label:'정예 전투',  weight:12},
    relic:  {icon:'✦', label:'유물 제단',   weight:0},
    curse:  {icon:'☠', label:'저주 제단',   weight:0},
    shop:   {icon:'🛒', label:'상점',       weight:12},
    rest:   {icon:'🔥', label:'휴식',       weight:12},
    event:  {icon:'❓', label:'미지의 사건', weight:18},
    boss:   {icon:'👑', label:'보스',       weight:0},
  };
  // 구간(타이어)별 행 개수. 사용자 요청 — 1구간(첫 보스 전)은 왕복 없이도
  // 자연스럽게 레벨업할 수 있도록 넉넉하게, 이후 점점 줄여 템포를 올린다.
  // 배열 길이를 넘는 타이어는 마지막 값을 계속 재사용한다.
  const TIER_NODE_COUNTS = [9, 8, 7, 6, 6];
  function getTierNodeCount(tierIndex){
    return TIER_NODE_COUNTS[Math.min(tierIndex, TIER_NODE_COUNTS.length-1)];
  }

  // 정예 노드를 골랐을 때 combat/battle-setup.js의 pickEnemy()가 무작위 굴림
  // 대신 확정으로 정예를 내주도록 하는 1회용 플래그. resolveNode()에서 세우고,
  // pickEnemy() 안에서 소비 즉시 꺼진다.
  let nodeForcedElite = false;
  // 더 강한 정예(사용자 요청 — 피투성이 도전자 이벤트 "도발한다" 전용). 위
  // nodeForcedElite와 함께 세팅해야 의미가 있다(정예가 아니면 무시됨).
  // combat/battle-setup.js의 pickEnemy()에서 소비 즉시 꺼진다.
  let nodeEliteBoost = false;
  // 지도 접기/펼치기 상태(사용자 요청 — 지도가 항상 펼쳐져 있으면 장비/유물
  // 같은 다른 메뉴 버튼을 누를 공간이 없어짐). 저장하지 않는 순수 화면 상태다.
  let nodeMapCollapsed = false;

  // 절차적 생성: rowCount개의 "일반 행" + 마지막에 보스 행 1개를 덧붙인다.
  // 각 행은 2~3개 노드, 인접한 행끼리 1~2개씩 연결선을 잇되, 다음 행의 모든
  // 노드가 최소 하나의 들어오는 연결을 갖도록 보정한다(고립 노드 방지).
  function generateNodeMap(tierIndex){
    const rowCount = getTierNodeCount(tierIndex);
    const rows = [];
    for(let r=0; r<rowCount; r++){
      const width = (r===0) ? 2 : (2 + Math.floor(Math.random()*2));
      const nodes = [];
      for(let i=0;i<width;i++){
        nodes.push({id:`t${tierIndex}r${r}n${i}`, type:null, connections:[]});
      }
      rows.push(nodes);
    }
    for(let r=0; r<rowCount-1; r++){
      const cur = rows[r], next = rows[r+1];
      const incoming = new Array(next.length).fill(0);
      cur.forEach((node, i)=>{
        const primary = Math.min(next.length-1, Math.floor(i/cur.length*next.length));
        const targets = new Set([primary]);
        if(Math.random()<0.5){
          const alt = Math.min(next.length-1, Math.max(0, primary + (Math.random()<0.5?-1:1)));
          targets.add(alt);
        }
        targets.forEach(t=>{ node.connections.push(next[t].id); incoming[t]++; });
      });
      next.forEach((n,i)=>{
        if(incoming[i]===0){
          const src = cur[Math.min(cur.length-1, Math.round(i/next.length*cur.length))];
          src.connections.push(n.id);
        }
      });
    }
    // 보스 행: 항상 노드 1개, 마지막 일반 행 전부가 여기로 연결된다(모든 경로 수렴).
    const bossNode = {id:`t${tierIndex}boss`, type:'boss', connections:[]};
    rows[rowCount-1].forEach(n=> n.connections.push(bossNode.id));
    rows.push([bossNode]);

    // 노드 타입 배정: 첫 행은 전투/정예만(막 들어선 시점이라 상점·이벤트가
    // 뜨는 게 어색함). 그 다음부터 유물 1개 + 저주 1개를 무작위 위치에 확정
    // 배치하고, 나머지는 가중치 랜덤으로 채운다.
    const specialPool = rows.slice(1, rowCount).flat();
    if(specialPool.length>=2){
      const relicIdx = Math.floor(Math.random()*specialPool.length);
      specialPool[relicIdx].type = 'relic';
      let curseIdx;
      do { curseIdx = Math.floor(Math.random()*specialPool.length); } while(curseIdx===relicIdx);
      specialPool[curseIdx].type = 'curse';
    }
    const weightedPool = [];
    Object.keys(NODE_TYPES).forEach(k=>{
      const w = NODE_TYPES[k].weight;
      for(let i=0;i<w;i++) weightedPool.push(k);
    });
    // 정예 노드 배정(사용자 요청) — 1구간(tier0)의 1~2층(rows[0]/rows[1])은
    // 아직 정예가 나오면 안 된다. 다른 구간의 "그 구간 첫 행"은 실제 절대
    // 층수가 이미 11층 이상이라 그대로 정예가 나와도 된다.
    const noEliteEarly = tierIndex===0;
    rows[0].forEach(n=>{ n.type = (noEliteEarly || Math.random()<0.85) ? 'combat' : 'elite'; });
    const weightedPoolNoElite = weightedPool.filter(k=>k!=='elite');
    rows.slice(1, rowCount).forEach((row, idx)=>{
      const isDepth2Row = noEliteEarly && idx===0; // rows[1] = tier0의 2층
      const pool = isDepth2Row ? weightedPoolNoElite : weightedPool;
      row.forEach(n=>{
        if(n.type) return; // 이미 유물/저주로 확정 배정된 노드
        n.type = pool[Math.floor(Math.random()*pool.length)];
      });
    });
    return rows;
  }

  // "고요한 제단"(사용자 요청) — 5번째 구간(tierIndex===5) 전용 특수 지도.
  // 일반 절차적 생성(generateNodeMap)과 달리 가지 갈라짐 없이 딱 2개 노드만
  // 일직선으로 존재한다: 1번 노드(휴식/유물 제단/상점/미지의 사건 중 무작위
  // 하나, 전투 없음 — 최종결전 전 순수 준비 노드), 2번 노드(보스 — 여기서
  // 진짜 최종보스가 나온다. resolveNode()의 트리거 조건 참고).
  function generateSilentAltarMap(tierIndex){
    const prepTypes = ['rest','relic','shop','event'];
    const prepType = prepTypes[Math.floor(Math.random()*prepTypes.length)];
    const prepNode = {id:`t${tierIndex}r0n0`, type:prepType, connections:[]};
    const bossNode = {id:`t${tierIndex}boss`, type:'boss', connections:[]};
    prepNode.connections.push(bossNode.id);
    return [[prepNode], [bossNode]];
  }

  // 새 구간 진입 — 지도를 새로 뽑고 첫 행 선택 대기 상태로 초기화한다.
  function enterNodeMapTier(){
    // 5번째 구간(tierIndex===5)은 "고요한 제단" 특수 지도를 쓴다(사용자 요청).
    player.nodeMap = (player.tierIndex===5) ? generateSilentAltarMap(player.tierIndex) : generateNodeMap(player.tierIndex);
    player.nodeRow = -1;
    player.nodeCurrentId = null;
    player.nodeVisited = [];
    saveGame();
    renderExplore(['새로운 구간에 들어섰다. 나아갈 길을 고를 수 있다.']);
    // 긴박한 BGM(사용자 요청) — showScreen('explore')는 이미 그 이전(보스 보상
    // 선택 전)에 호출되어 있어서 tierIndex 갱신 시점을 놓친다. 여기서 직접
    // 확정한다(고요한 제단에 들어서는 유일한 지점).
    if(player.tierIndex===5 && !player.endingSeen){
      Sound.setBgmMode('dread');
    }
    // 사용자 요청: 새 구간에 들어서면 지도가 출발 지점(맨 위, row 0)부터
    // 보이도록 스크롤을 초기화한다. #node-map-area는 구간이 바뀌어도 DOM
    // 요소 자체는 그대로 재사용되고 안쪽 내용만 다시 그려지므로, 이전 구간
    // 끝(보스 근처)에서 스크롤해둔 위치가 새 지도에도 그대로 남아있었다.
    // renderExplore()가 이미 지도를 다 그린 뒤이므로, 레이아웃이 확정되는
    // 다음 프레임에 스크롤을 되돌린다.
    requestAnimationFrame(()=>{
      const area = document.getElementById('node-map-area');
      if(area) area.scrollTop = 0;
    });
  }

  // 지금 구간에서 "가상 층수" — 실제 depth는 보스를 잡아야만 오르지만, 전투
  // 스케일링은 이 값으로 부드럽게 이어지게 한다. tierIndex*10(구간 시작, 이전
  // 보스 층수)에서 (tierIndex+1)*10(이번 보스 층수)까지, 지금 몇 번째 노드에
  // 있는지 비율로 보간한다.
  function getVirtualDepth(){
    const tierStart = player.tierIndex*10;
    const tierEnd = tierStart+10;
    const totalSteps = player.nodeMap.length; // 보스 행 포함
    const progress = (player.nodeRow+1)/totalSteps;
    return Math.max(tierStart+1, Math.round(tierStart + (tierEnd-tierStart)*progress));
  }

  function pickNode(nodeId){
    if(!player.nodeMap) return;
    const nextRowIdx = player.nodeRow+1;
    const nextRow = player.nodeMap[nextRowIdx];
    if(!nextRow) return;
    const node = nextRow.find(n=>n.id===nodeId);
    if(!node) return;
    // 실제로 연결된 노드인지 확인(닫힌 노드를 억지로 못 고르게 하는 안전장치 —
    // 화면단에서 이미 클릭 불가 처리하지만 이중으로 막아둔다).
    if(player.nodeRow>=0){
      const curNode = player.nodeMap[player.nodeRow].find(n=>n.id===player.nodeCurrentId);
      if(curNode && !curNode.connections.includes(nodeId)) return;
    }
    player.nodeRow = nextRowIdx;
    player.nodeCurrentId = nodeId;
    player.nodeVisited.push(nodeId);
    saveGame();
    resolveNode(node);
  }

  function resolveNode(node){
    depth = getVirtualDepth();
    renderNodeMapArea();
    if(node.type==='boss'){
      const bossDepth = player.tierIndex*10 + 10;
      depth = bossDepth;
      // 사용자 요청 — 최종보스 트리거를 "고요한 제단"(tierIndex===5)의 보스
      // 노드로 옮겼다. 원래 5번째 구간(depth 50) 보스가 곧바로 최종보스로
      // 이어졌는데, 이제 그 보스는 평범한 구간 보스가 되고, 그 다음에 오는
      // "고요한 제단"(노드 2개짜리 특수 구간)의 보스가 진짜 최종보스다.
      // 실제 최종보스 진입 서사(showFinalFloorConfirm — 기원 답변/무사고
      // 클리어 판정에 따른 분기)는 전혀 안 건드렸다, 트리거 위치만 이동.
      if(player.tierIndex===5 && !player.endingSeen){
        showFinalFloorConfirm();
        return;
      }
      addLog('공기가 무겁게 가라앉는다… 구간의 끝, 보스가 기다리고 있다!', 'warn');
      setTimeout(()=>startBattle(true), 400);
      return;
    }
    switch(node.type){
      case 'elite':
        nodeForcedElite = true;
        addLog('심상치 않은 기운이 감돈다… 정예가 나타났다!', 'warn');
        setTimeout(()=>startBattle(false), 350);
        break;
      case 'relic':
        addLog('낯선 제단이 어둠 속에서 은은한 빛을 낸다…', 'gold');
        setTimeout(()=>showRelicAltar(depth), 400);
        break;
      case 'curse':
        addLog('피비린내가 감도는 제단이 어둠 속에 웅크리고 있다…', 'warn');
        setTimeout(()=>showCurseAltar(depth), 400);
        break;
      case 'shop':
        addLog('떠돌이 상인이 좌판을 펼치고 있다.', 'gold');
        setTimeout(()=>openShop(), 400);
        break;
      case 'rest':
        addLog('아늑한 화롯불 자리가 눈에 띈다.', 'gold');
        onRest();
        renderExplore([]);
        break;
      case 'event':
        addLog('무언가 심상치 않은 기운이 느껴진다…', 'gold');
        setTimeout(()=>showMysteryEvent(), 400);
        break;
      default:
        addLog('그림자 속에서 무언가 튀어나왔다!', 'warn');
        setTimeout(()=>startBattle(false), 350);
    }
  }

  // 탐험 화면(#screen-explore) 안에 끼워넣는 노드맵 영역 렌더. 새 화면을 따로
  // 안 만들어서(전투/제단/상점 복귀 로직을 그대로 재사용하기 위함), 이 함수는
  // explore.js의 renderExplore() 안에서 매번 호출된다.
  function renderNodeMapArea(){
    const area = document.getElementById('node-map-area');
    const btnAdvance = document.getElementById('btn-advance');
    const btnShop = document.getElementById('btn-shop');
    const btnExchange = document.getElementById('btn-exchange');
    const btnBlacksmith = document.getElementById('btn-blacksmith');
    if(!area) return; // index.html에 아직 마크업이 없으면 조용히 무시(안전장치)
    if(!player.nodeMap || town || inBossDen){
      area.style.display = 'none';
      if(btnAdvance) btnAdvance.style.display = 'block';
      // 상점/정예 교환소/대장간은 마을에서만 상시 노출한다(사용자 확정 A안 —
      // 상점은 노드로만, 교환소/대장간은 애초에 마을 전용으로 설계됨). 휴식하다
      // 버튼은 삭제됐다(사용자 요청 — 체크포인트 무료 힐 스캠 방지).
      if(btnShop) btnShop.style.display = town ? 'block' : 'none';
      if(btnExchange) btnExchange.style.display = town ? 'block' : 'none';
      if(btnBlacksmith) btnBlacksmith.style.display = town ? 'block' : 'none';
      return;
    }
    area.style.display = 'block';
    if(btnAdvance) btnAdvance.style.display = 'none';
    if(btnShop) btnShop.style.display = 'none';
    if(btnExchange) btnExchange.style.display = 'none';
    if(btnBlacksmith) btnBlacksmith.style.display = 'none';

    const totalSteps = player.nodeMap.length;
    const progressLabel = document.getElementById('node-map-progress');
    if(progressLabel){
      const stepNow = Math.min(player.nodeRow+1, totalSteps-1);
      // 접기/펼치기 토글(사용자 요청 — 지도가 펼쳐져 있으면 장비/유물 등 다른
      // 메뉴 버튼을 누를 공간이 없어졌었다). nodeMapCollapsed는 저장하지 않는
      // 순전한 화면 상태다 — 새로고침하면 다시 펼쳐진 채로 시작해도 무방하다.
      progressLabel.innerHTML =
        `<span style="display:flex; justify-content:space-between; align-items:center;">`
        + `<span>구간 진행 ${stepNow}/${totalSteps-1}</span>`
        + `<button id="node-map-toggle" class="btn" style="padding:3px 10px; font-size:11px; width:auto; pointer-events:auto;">${nodeMapCollapsed?'지도 펼치기 ▼':'지도 접기 ▲'}</button>`
        + `</span>`;
      const toggleBtn = document.getElementById('node-map-toggle');
      if(toggleBtn) toggleBtn.addEventListener('click', ()=>{
        nodeMapCollapsed = !nodeMapCollapsed;
        renderNodeMapArea();
      });
    }

    const rowsEl = document.getElementById('node-map-rows');
    if(!rowsEl) return;
    rowsEl.style.display = nodeMapCollapsed ? 'none' : 'flex';
    if(nodeMapCollapsed) return; // 접혀 있으면 행 자체를 안 그린다(다른 버튼 누를 공간 확보)
    // 유물 "hideDepth"(깊이를 알 수 없게 만드는 유물): 아직 안 가본 노드는
    // 종류를 미리 보여주면 안 되는 게 컨셉이라, 지나온/현재 노드를 제외한 전부를
    // 물음표로 가린다(보스 행 포함 — "여기가 보스"라는 정보 자체도 숨긴다).
    const hideAll = (typeof hasRelicFlag==='function') && hasRelicFlag('hideDepth');
    const curNode = player.nodeRow>=0 ? player.nodeMap[player.nodeRow].find(n=>n.id===player.nodeCurrentId) : null;
    rowsEl.innerHTML = player.nodeMap.map((row, rIdx)=>{
      const isPast = rIdx <= player.nodeRow;
      const isNext = rIdx === player.nodeRow+1;
      const nodesHtml = row.map(n=>{
        const isChosenHere = n.id === player.nodeCurrentId && isPast;
        const mustHide = hideAll && !isPast;
        const def = mustHide ? {icon:'❓', label:'???'} : (NODE_TYPES[n.type] || NODE_TYPES.combat);
        let cls = 'node-btn';
        let clickable = false;
        if(isPast){
          cls += isChosenHere ? ' node-visited-chosen' : ' node-visited-skip';
        } else if(isNext){
          const reachable = !curNode || curNode.connections.includes(n.id);
          cls += reachable ? ' node-available' : ' node-locked';
          clickable = reachable;
        } else {
          cls += ' node-locked';
        }
        // data-nodeid는 클릭 가능 여부와 무관하게 항상 붙인다 — 연결선을 그릴 때
        // 모든 노드(잠긴 것 포함)의 화면 위치를 찾아야 하기 때문. 클릭 핸들러는
        // data-node(클릭 가능한 것에만 붙는 별도 속성)로만 건다.
        return `<button class="${cls}" data-nodeid="${n.id}" ${clickable?`data-node="${n.id}"`:'disabled'}>`
          + `<span class="node-icon">${def.icon}</span><span class="node-label">${def.label}</span>`
          + `</button>`;
      }).join('');
      return `<div class="node-row">${nodesHtml}</div>`;
    }).join('');
    rowsEl.querySelectorAll('[data-node]').forEach(btn=>{
      btn.addEventListener('click', ()=>{ Sound.click(); pickNode(btn.dataset.node); });
    });
    // 연결선(사용자 요청 — "어디로 갈 수 있는지 보이면 좋겠다"): 버튼이 실제로
    // 배치된 뒤에야 정확한 좌표를 잴 수 있으므로 다음 프레임에 그린다.
    requestAnimationFrame(renderNodeMapConnections);
  }

  // 노드 사이 연결선을 SVG로 그린다. 매번 새로 그리는 이유는 지도가 재렌더될
  // 때마다(다음 노드 선택, 탭 전환 등) 버튼 위치가 바뀔 수 있기 때문이다.
  function renderNodeMapConnections(){
    const container = document.getElementById('node-map-rows');
    if(!container || nodeMapCollapsed) return;
    let svg = document.getElementById('node-map-svg');
    if(!svg){
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'node-map-svg';
      svg.style.position = 'absolute';
      svg.style.left = '0'; svg.style.top = '0';
      svg.style.width = '100%'; svg.style.height = '100%';
      svg.style.pointerEvents = 'none';
      container.style.position = 'relative';
      container.insertBefore(svg, container.firstChild);
    }
    svg.innerHTML = '';
    const containerRect = container.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${containerRect.width} ${containerRect.height}`);
    if(!player.nodeMap) return;
    player.nodeMap.forEach(row=>{
      row.forEach(n=>{
        const fromEl = container.querySelector(`[data-nodeid="${n.id}"]`);
        if(!fromEl) return;
        const fromRect = fromEl.getBoundingClientRect();
        const fx = fromRect.left - containerRect.left + fromRect.width/2;
        const fy = fromRect.top - containerRect.top + fromRect.height;
        n.connections.forEach(toId=>{
          const toEl = container.querySelector(`[data-nodeid="${toId}"]`);
          if(!toEl) return;
          const toRect = toEl.getBoundingClientRect();
          const tx = toRect.left - containerRect.left + toRect.width/2;
          const ty = toRect.top - containerRect.top;
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', fx); line.setAttribute('y1', fy);
          line.setAttribute('x2', tx); line.setAttribute('y2', ty);
          // 지나온 경로 하이라이트(사용자 피드백 — "어느 길로 왔는지 한눈에
          // 안 보인다"): player.nodeVisited의 연속된 두 id가 정확히 이 선의
          // from→to와 일치하면 "내가 실제로 걸어온 길"이므로 굵고 밝은 금색으로,
          // 그 외(안 밟은 갈림길)는 예전처럼 얇고 흐리게 그린다.
          const visited = player.nodeVisited || [];
          const fromIdx = visited.indexOf(n.id);
          const isWalked = fromIdx>=0 && visited[fromIdx+1]===toId;
          if(isWalked){
            line.setAttribute('stroke', '#e6c34a');
            line.setAttribute('stroke-width', '3.5');
            line.setAttribute('opacity', '0.95');
          } else {
            line.setAttribute('stroke', '#5a4a30');
            line.setAttribute('stroke-width', '1.5');
            line.setAttribute('opacity', '0.55');
          }
          svg.appendChild(line);
        });
      });
    });
  }
