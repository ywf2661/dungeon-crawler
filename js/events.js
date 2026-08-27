"use strict";
/*
미지의 사건(노드맵 event 타입) — 6종 중 하나를 무작위로 보여준다. 여러 층에
걸쳐 상태를 추적하는 지속 시스템(외상 도박사식)은 피하고, "그 자리에서 선택하고
그 자리에서 끝나는" 단발성 이벤트로만 구성했다 — 구현 리스크가 적고, 나중에
이벤트를 더 추가하기도 쉽다.
export(전역): showMysteryEvent
의존성: player/depth(state.js), data/equipment.js(RARE_EQUIPMENT/EPIC_EQUIPMENT/statsText),
       combat/battle-setup.js(startBattle, nodeForcedElite 변수),
       combat/battle-end.js(grantExp, showLevelUpToast),
       explore.js(addLog/renderExplore/renderStatus/saveGame)
주의: 사용자 요청 — 노드맵만 보고 있는 플레이어도 이벤트가 발생했다는 걸 확실히
     알 수 있도록, 로그 한 줄이 아니라 relic/curse 제단과 동일한 전체 오버레이
     (.shop-overlay/.shop-panel)로 보여준다. 완전히 새로운 화면(showScreen 타겟)을
     만드는 것보다 기존에 검증된 이 패턴이 일관되고 리스크가 적다.
*/

  // 그림자와의 결투(events.js "정예의 인장 대체 획득" 경로)가 승리 시 인장을
  // 지급하도록, combat/battle-end.js의 승리 처리부가 확인하는 1회용 플래그.
  let pendingDuelSealReward = false;

  function showMysteryEvent(){
    const handlers = [
      showAltarEvent, showSpringEvent, showCoffinEvent, showMerchantEvent, showTrainingEvent, showMemoryEvent,
      showObservationDoorsEvent, showCurseEchoEvent, showShadowDuelEvent, showOldLibraryEvent, showMapFragmentEvent,
    ];
    handlers[Math.floor(Math.random()*handlers.length)]();
  }

  function eventOverlay(title, bodyHtml, buttonsHtml){
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'mystery-event-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    panel.innerHTML = `<h3 style="color:#c9a8ff;">❓ ${title}</h3>${bodyHtml}${buttonsHtml}`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    return {overlay, panel};
  }

  // 선택을 마쳤을 때 공통으로 호출 — 오버레이를 닫고 노드맵 화면을 다시 그린다
  // (전투로 이어지는 경우는 각 이벤트에서 직접 처리하므로 이 헬퍼를 안 쓴다).
  function closeMysteryEvent(overlay){
    overlay.remove();
    renderExplore([]);
  }

  // 1) 버려진 제단 — 체력 또는 골드를 제물로 영구 스탯을 얻는다.
  function showAltarEvent(){
    const {overlay, panel} = eventOverlay('버려진 제단',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        오래된 제단 위에 마른 핏자국이 남아 있다. 무언가를 바치면 힘을 주는 듯한 기운이 감돈다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-hp">체력을 바친다 (최대HP -10%, 공격력·마력 영구 +8%)</button>
        <button class="btn" id="me-gold">금화를 바친다 (소지금 30%, 공격력·마력 영구 +8%)</button>
        <button class="btn" id="me-skip">지나친다</button>
      </div>`);
    panel.querySelector('#me-hp').addEventListener('click', ()=>{
      const loss = Math.max(1, Math.round(player.maxhp*0.10));
      player.maxhp = Math.max(1, player.maxhp-loss);
      player.hp = Math.min(player.hp, player.maxhp);
      const atkGain = Math.max(1, Math.round(player.atk*0.08));
      const magGain = Math.max(1, Math.round(player.mag*0.08));
      player.atk += atkGain; player.mag += magGain;
      renderStatus();
      addLog(`제단에 생명력을 바쳤다. 최대HP -${loss}, 공격력 +${atkGain}, 마력 +${magGain} (영구)`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-gold').addEventListener('click', ()=>{
      const cost = Math.round(player.gold*0.30);
      player.gold -= cost;
      const atkGain = Math.max(1, Math.round(player.atk*0.08));
      const magGain = Math.max(1, Math.round(player.mag*0.08));
      player.atk += atkGain; player.mag += magGain;
      renderStatus();
      addLog(`제단에 금화 ${cost}G를 바쳤다. 공격력 +${atkGain}, 마력 +${magGain} (영구)`, 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('제단을 그냥 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 2) 신비한 샘물 — 완전 회복 대신 최대HP를 조금 영구히 내준다.
  function showSpringEvent(){
    const {overlay, panel} = eventOverlay('신비한 샘물',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        은은하게 빛나는 샘물을 발견했다. 마시면 몸이 가벼워질 것 같지만, 어딘가 대가가 있을 것 같다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-drink">마신다 (HP/MP 완전 회복, 최대HP 영구 -5%)</button>
        <button class="btn" id="me-skip">지나친다</button>
      </div>`);
    panel.querySelector('#me-drink').addEventListener('click', ()=>{
      player.hp = player.maxhp; player.mp = player.maxmp;
      const loss = Math.max(1, Math.round(player.maxhp*0.05));
      player.maxhp = Math.max(1, player.maxhp-loss);
      player.hp = Math.min(player.hp, player.maxhp);
      renderStatus();
      addLog(`샘물을 마셨다. HP/MP가 완전히 회복됐지만, 최대HP가 ${loss} 줄었다.`, 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('샘물을 그냥 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 3) 봉인된 관 — 절반은 보물, 절반은 기습 전투(정예급). "수상한 지도 조각"
  // (E안 — 가벼운 연쇄 이벤트)을 갖고 있으면 확률 없이 확정으로 좋은 결과가
  // 나오고 조각을 소비한다.
  function showCoffinEvent(){
    const hasFragment = !!player.hasMapFragment;
    const {overlay, panel} = eventOverlay('봉인된 관',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        먼지 쌓인 관 하나가 놓여 있다. 안에 뭐가 들었을지는 열어봐야 안다.
        ${hasFragment ? '<br><span style="color:var(--gold-bright);">품 안의 지도 조각이 이 관의 위치를 정확히 짚어냈던 그 그림과 일치한다!</span>' : ''}
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-open">${hasFragment ? '연다 (지도 조각으로 위치 확인됨 — 안전)' : '연다 (보물 또는 기습 — 반반)'}</button>
        <button class="btn" id="me-skip">지나친다</button>
      </div>`);
    panel.querySelector('#me-open').addEventListener('click', ()=>{
      overlay.remove();
      const safe = hasFragment || Math.random()<0.5;
      if(hasFragment){ player.hasMapFragment = false; }
      if(safe){
        const g = 20 + Math.floor(Math.random()*20) + depth*3;
        player.gold += g;
        renderStatus();
        addLog(hasFragment ? `지도 조각 덕분에 함정 없이 관 속 금화 ${g}G를 챙겼다!` : `관 속에서 금화 ${g}G를 발견했다!`, 'gold');
        saveGame();
        renderExplore([]);
      } else {
        addLog('관 속에서 무언가 튀어나왔다!', 'warn');
        nodeForcedElite = true;
        setTimeout(()=>startBattle(false), 350);
      }
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('관을 그냥 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 4) 방랑 상인의 마지막 재고 — 희귀/에픽 중 하나를 단 한 번 제시.
  function showMerchantEvent(){
    const rarePool = Object.keys(RARE_EQUIPMENT).filter(id=>RARE_EQUIPMENT[id].minDepth<=depth && !player.equipOwned.includes(id));
    const epicPool = Object.keys(EPIC_EQUIPMENT).filter(id=>EPIC_EQUIPMENT[id].minDepth<=depth && !player.equipOwned.includes(id));
    const useEpic = epicPool.length>0 && Math.random()<0.35;
    const pool = useEpic ? epicPool : rarePool;
    if(!pool.length){
      // 팔 게 없으면 허탕 대신 골드를 준다.
      const g = 15 + Math.floor(Math.random()*15) + depth*2;
      player.gold += g;
      renderStatus();
      addLog(`방랑 상인이 팔 물건이 없다며, 대신 금화 ${g}G를 쥐여줬다.`, 'gold');
      saveGame();
      renderExplore([]);
      return;
    }
    const itemId = pool[Math.floor(Math.random()*pool.length)];
    const item = useEpic ? EPIC_EQUIPMENT[itemId] : RARE_EQUIPMENT[itemId];
    const basePrice = useEpic ? 220 : 90;
    const price = Math.round(basePrice*(1+depth*0.05));
    const {overlay, panel} = eventOverlay('방랑 상인의 마지막 재고',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;">
        낯선 상인이 마지막 남은 물건이라며 하나를 내민다. 지금이 아니면 다시 없을 물건이다.
      </p>
      <div class="shop-item">
        <div class="si-info">
          <span class="si-name" style="font-family:Cinzel;color:${useEpic?'var(--epic-bright)':'var(--violet)'};">${useEpic?'✦✦ ':'✨ '}${item.name}</span>
          <span class="si-desc" style="color:var(--parchment-dim); font-size:12.5px; font-style:italic;">${item.desc} (${statsText(item.stats)})</span>
        </div>
      </div>`,
      `<div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
        <button class="btn" id="me-buy" ${player.gold<price?'disabled':''}>${price}G에 구매</button>
        <button class="btn" id="me-skip">지나친다</button>
      </div>`);
    panel.querySelector('#me-buy').addEventListener('click', ()=>{
      if(player.gold<price) return;
      player.gold -= price;
      player.equipOwned.push(itemId);
      renderStatus();
      addLog(`방랑 상인에게서 [${item.name}]을(를) ${price}G에 구매했다.`, 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('상인의 물건을 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 5) 낡은 수련장 — 위험 없이 확정 경험치만.
  function showTrainingEvent(){
    const {overlay, panel} = eventOverlay('낡은 수련장',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        오래전 버려진 수련장이 남아 있다. 위험 없이 몸을 풀 수 있을 것 같다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-train">훈련한다 (안전한 확정 경험치, 골드·드랍 없음)</button>
        <button class="btn" id="me-skip">지나친다</button>
      </div>`);
    panel.querySelector('#me-train').addEventListener('click', ()=>{
      const expGain = 12 + depth*4;
      const leveled = grantExp(expGain);
      renderStatus();
      addLog(`수련장에서 안전하게 땀을 흘렸다. (EXP +${expGain})`, 'gold');
      saveGame();
      overlay.remove();
      if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
      renderExplore([]);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('수련장을 그냥 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 6) 기억의 조각 — 선택 없는 완충용 로어 노드. 소량 골드로 "빈 노드"가 되지
  // 않게 한다.
  function showMemoryEvent(){
    const fragments = [
      '이 회랑은 원래 사람이 살던 곳이었다는 이야기가 전해진다.',
      '벽에 새겨진 글귀는 오래되어 알아볼 수 없다. 다만 누군가 절박하게 무언가를 새겨넣었다는 것만은 분명하다.',
      '회랑 깊은 곳에서, 아주 오래된 무언가가 여전히 깨어있다는 소문이 있다.',
      '이곳을 지나간 수많은 이들 중, 살아 돌아간 자는 손에 꼽는다고 한다.',
    ];
    const text = fragments[Math.floor(Math.random()*fragments.length)];
    const g = 8 + Math.floor(Math.random()*8) + depth;
    const {overlay, panel} = eventOverlay('기억의 조각',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:13px;font-style:italic;line-height:1.7;margin:-4px 0 16px;">${text}</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-continue">계속 나아간다</button>
      </div>`);
    panel.querySelector('#me-continue').addEventListener('click', ()=>{
      player.gold += g;
      renderStatus();
      addLog(`잠시 숨을 고르며 회랑을 둘러봤다. (골드 +${g}G)`, 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
  }

  // 7) 두 개의 문 (A안 — "관찰"형 이벤트). 힌트-결과 연결이 매번 고정돼 있어
  // (달콤한 냄새=보상, 서늘한 바람=매복), 순수 운이 아니라 "감으로 고르는"
  // 재미를 준다. 어느 문이 왼쪽/오른쪽에 배정될지만 매번 무작위다.
  function showObservationDoorsEvent(){
    const hints = [
      {key:'sweet', text:'문틈으로 달콤한 냄새가 희미하게 새어 나온다.'},
      {key:'cold', text:'문틈으로 서늘한 바람이 새어 나온다.'},
    ];
    const shuffled = Math.random()<0.5 ? [hints[0],hints[1]] : [hints[1],hints[0]];
    const {overlay, panel} = eventOverlay('두 개의 문',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        회랑이 갈라지며 낡은 문 두 개가 나타났다. 어느 쪽이든 하나만 열 수 있다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-left" style="text-align:left; height:auto; padding:12px 14px; white-space:normal;">왼쪽 문 — ${shuffled[0].text}</button>
        <button class="btn" id="me-right" style="text-align:left; height:auto; padding:12px 14px; white-space:normal;">오른쪽 문 — ${shuffled[1].text}</button>
      </div>`);
    function openDoor(hintKey){
      overlay.remove();
      if(hintKey==='sweet'){
        const g = 25 + Math.floor(Math.random()*20) + depth*3;
        player.gold += g;
        renderStatus();
        addLog(`문 너머에서 달콤한 향의 정체 — 숨겨진 보물이었다! (골드 +${g}G)`, 'gold');
        saveGame();
        renderExplore([]);
      } else {
        addLog('서늘한 바람의 정체는 매복이었다!', 'warn');
        setTimeout(()=>startBattle(false), 350);
      }
    }
    panel.querySelector('#me-left').addEventListener('click', ()=> openDoor(shuffled[0].key));
    panel.querySelector('#me-right').addEventListener('click', ()=> openDoor(shuffled[1].key));
  }

  // 8) 속삭이는 저주의 흔적 (B안 — 저주와 엮이는 이벤트). 짊어진 저주 개수가
  // 많을수록 공명시켰을 때의 보상이 커진다. 저주가 하나도 없으면 공명 자체가
  // 안 통해 밋밋한 결과만 나온다(그래도 손해는 없음).
  function showCurseEchoEvent(){
    const curseCount = (typeof getCurseCount==='function') ? getCurseCount() : 0;
    if(curseCount<=0){
      const {overlay, panel} = eventOverlay('속삭이는 저주의 흔적',
        `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
          바닥에 희미한 저주의 흔적이 남아 있다. 그대에게는 아무런 감흥도 일으키지 못한다.
        </p>`,
        `<div style="display:flex; flex-direction:column; gap:8px;">
          <button class="btn" id="me-continue">계속 나아간다</button>
        </div>`);
      panel.querySelector('#me-continue').addEventListener('click', ()=>{
        addLog('저주의 흔적은 그대에게 아무 반응도 보이지 않았다.');
        closeMysteryEvent(overlay);
      });
      return;
    }
    const {overlay, panel} = eventOverlay('속삭이는 저주의 흔적',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        바닥에 남은 저주의 흔적이 그대가 짊어진 저주(${curseCount}개)에 반응해 희미하게 떨린다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-resonate">공명시킨다 (공격력·마력 영구 +${curseCount*2}%)</button>
        <button class="btn" id="me-skip">무시한다</button>
      </div>`);
    panel.querySelector('#me-resonate').addEventListener('click', ()=>{
      const pct = curseCount*0.02;
      player.atk = Math.round(player.atk*(1+pct));
      player.mag = Math.round(player.mag*(1+pct));
      renderStatus();
      addLog(`저주의 흔적과 공명했다. 공격력·마력이 영구히 ${Math.round(pct*100)}% 올랐다.`, 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('저주의 흔적을 무시하고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 9) 그림자와의 결투 (C안 — 정예의 인장 대체 획득 경로). 정예 사냥 없이도
  // 자발적인 결투로 인장을 얻을 수 있다. 강제 기습이 아니라 "도전할지 말지"를
  // 직접 고르는 정상적인 전투라 패배하면 평범하게 전투 패배 처리를 받는다.
  function showShadowDuelEvent(){
    const {overlay, panel} = eventOverlay('그림자와의 결투',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        그림자 하나가 조용히 다가와 결투를 청한다. "이기면 증표를 주지." 낮은 목소리가 울린다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-duel">결투를 받아들인다 (승리 시 정예의 인장 획득)</button>
        <button class="btn" id="me-skip">거절한다</button>
      </div>`);
    panel.querySelector('#me-duel').addEventListener('click', ()=>{
      overlay.remove();
      pendingDuelSealReward = true;
      addLog('그림자 결투사와 맞선다!', 'warn');
      setTimeout(()=>startBattle(false), 350);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('결투를 거절하고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 10) 낡은 서고 (D안 — 직업별로 다르게 반응하는 이벤트). 기본 직업(job)에
  // 따라 발견하는 물건과 보상이 달라진다 — "내 직업다운" 순간을 준다.
  function showOldLibraryEvent(){
    const byJob = {
      warrior:  {find:'낡은 훈련 교본', flavor:'닳고 닳은 교본에는 검을 다루는 법이 빼곡히 적혀 있다.', apply:()=>{ const d=Math.max(1,Math.round(player.atk*0.05)); player.atk+=d; return `공격력 +${d} (영구)`; }},
      mage:     {find:'봉인된 마법서', flavor:'표지가 서늘한 마법서 한 권. 넘기는 것만으로도 마력이 꿈틀댄다.', apply:()=>{ const d=Math.max(1,Math.round(player.mag*0.05)); player.mag+=d; return `마력 +${d} (영구)`; }},
      rogue:    {find:'숨겨진 보물 지도', flavor:'서고 한구석, 낡은 지도 한 장이 눈에 띈다.', apply:()=>{ const g=30+Math.floor(Math.random()*20)+depth*3; player.gold+=g; return `골드 +${g}G`; }},
      paladin:  {find:'성서의 한 구절', flavor:'빛바랜 성서를 읽어내리자 몸에 온기가 감돈다.', apply:()=>{ const d=Math.max(1,Math.round(player.maxhp*0.04)); player.maxhp+=d; player.hp=Math.min(player.maxhp,player.hp+d); return `최대HP +${d} (영구)`; }},
      mechanic: {find:'낡은 설계도 파편', flavor:'알아보기 힘든 설계도지만, 쓸 만한 부분만 골라 챙긴다.', apply:()=>{ const d=Math.max(1,Math.round(player.mag*0.05)); player.mag+=d; return `마력 +${d} (영구)`; }},
      jester:   {find:'낡은 도박 규칙서', flavor:'귀퉁이가 다 닳은 규칙서. 무언가 요령이 적혀 있다.', apply:()=>{ const g=30+Math.floor(Math.random()*20)+depth*3; player.gold+=g; return `골드 +${g}G`; }},
    };
    const entry = byJob[player.job] || byJob.warrior;
    const {overlay, panel} = eventOverlay('낡은 서고',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;">
        먼지 쌓인 서고 안, ${entry.find}을(를) 발견했다.<br>${entry.flavor}
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-take">챙긴다</button>
      </div>`);
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      const resultText = entry.apply();
      renderStatus();
      addLog(`[${entry.find}]을(를) 챙겼다. ${resultText}`, 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
  }

  // 11) 수상한 지도 조각 (E안 — 가벼운 연쇄 이벤트). 지금 당장은 아무 효과가
  // 없고, player.hasMapFragment 플래그만 세운다 — 나중에 "봉인된 관" 이벤트를
  // 다시 만나면 그 관이 확정으로 안전해진다(showCoffinEvent() 참고). 지속
  // 상태 추적은 최소화한다는 원칙을 지키기 위해, 딱 이 두 이벤트 사이의
  // 1회성 연결만 둔다.
  function showMapFragmentEvent(){
    const {overlay, panel} = eventOverlay('수상한 지도 조각',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:13px;font-style:italic;line-height:1.7;margin:-4px 0 16px;">
        바닥에 반쯤 타버린 지도 조각이 떨어져 있다. 무언가의 위치를 표시해둔 것 같은데, 지금은 알아볼 수 없다.<br>
        <span style="color:var(--gold-bright);">품에 넣어두면 언젠가 쓸모가 있을지도 모른다.</span>
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-take">챙긴다</button>
      </div>`);
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      player.hasMapFragment = true;
      addLog('수상한 지도 조각을 품에 넣었다.', 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
  }