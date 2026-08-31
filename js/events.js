"use strict";
/*
미지의 사건(노드맵 event 타입) — 다수 이벤트 중 하나를 무작위로 보여준다.
export(전역): showMysteryEvent
의존성: player/depth(state.js), data/equipment.js(RARE_EQUIPMENT/EPIC_EQUIPMENT/statsText/EQUIPMENT),
       relics.js(findEquipmentForDepth/findRareDropForDepth), shop.js(SHOP_ITEMS/CONSUMABLE_CAPS),
       combat/battle-setup.js(startBattle, nodeForcedElite/nodeEliteBoost 변수),
       combat/battle-end.js(grantExp, showLevelUpToast),
       explore.js(addLog/renderExplore/renderStatus/saveGame)
주의: 사용자 요청 — 노드맵만 보고 있는 플레이어도 이벤트가 발생했다는 걸 확실히
     알 수 있도록, 로그 한 줄이 아니라 relic/curse 제단과 동일한 전체 오버레이
     (.shop-overlay/.shop-panel)로 보여준다.
주의(신규 — 사용자 요청 대량 추가): 기존 11개 + 신규 14개(가방 포함) + 조건부
     "부상당한 모험가와의 재회" 1개로 이벤트 풀을 확장했다. 전부 균등 확률.
     장비 강화가 필요한 두 이벤트("탐욕스러운 상인", "잊혀진 대장장이")와
     "현상금 사냥꾼" 후속 조우는 이번 배치에서 보류했다(사용자 확정).
     결투류 이벤트가 승리 시 지급하는 정예의 인장 개수가 이벤트마다 달라져서,
     기존 boolean 플래그 pendingDuelSealReward를 숫자 pendingDuelSealCount로
     바꿨다(0=미적용). 추가 골드 보상용 pendingDuelBonusGold도 함께 추가했다.
*/

  // 결투류 이벤트가 승리 시 지급할 정예의 인장 개수/추가 골드. combat/battle-end.js의
  // 일반 승리 처리부가 소비한다(0/undefined면 아무 일도 안 함).
  let pendingDuelSealCount = 0;
  let pendingDuelBonusGold = 0;

  function showMysteryEvent(){
    const handlers = [
      showAltarEvent, showSpringEvent, showCoffinEvent, showMerchantEvent, showTrainingEvent, showMemoryEvent,
      showObservationDoorsEvent, showCurseEchoEvent, showShadowDuelEvent, showOldLibraryEvent, showMapFragmentEvent,
      showAlchemistBagEvent, showBloodAltarEvent, showMadAlchemistEvent, showBloodyChallengerEvent,
      showSuspiciousWeaponEvent, showCorpsePileEvent, showStrangeCandleEvent, showDemonContractEvent,
      showLostWalletEvent, showMysteriousMageEvent, showInjuredAdventurerEvent, showSealedDoorEvent,
      showBloodThirstyStatueEvent, showDevilsDiceEvent,
    ];
    // "그때 그 모험가"(재회)는 이전에 부상당한 모험가를 도와준 적이 있을 때만
    // 이벤트 풀에 포함된다 — 안 만난 적 없는 상태에서 재회가 뜨면 앞뒤가 안
    // 맞기 때문에, 이 조건만은 균등 확률 원칙의 예외로 둔다.
    if(player.helpedInjuredAdventurer) handlers.push(showInjuredAdventurerReunionEvent);
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
      pendingDuelSealCount = 1;
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

  /* ============ 신규 이벤트 공용 헬퍼 ============ */

  // 랜덤 포션 1개 지급 — CONSUMABLE_CAPS(shop.js)에 도달한 종류는 후보에서
  // 제외하고, 전부 가득 찼으면 골드로 대체한다(사용자 확정).
  function grantRandomPotion(){
    const available = ['potion','hipotion','ether'].filter(k=>(player.inv[k]||0) < CONSUMABLE_CAPS[k]);
    if(!available.length){
      const g = 20 + Math.floor(Math.random()*20) + depth*2;
      player.gold += g;
      return `이미 포션이 가득 차, 대신 금화 ${g}G를 얻었다.`;
    }
    const key = available[Math.floor(Math.random()*available.length)];
    player.inv[key] = (player.inv[key]||0) + 1;
    return `${SHOP_ITEMS.find(s=>s.key===key).name}을(를) 얻었다. (보유 ${player.inv[key]}/${CONSUMABLE_CAPS[key]})`;
  }
  // 특정 종류의 포션 지급(최대치면 골드로 대체).
  function grantSpecificPotion(key){
    if((player.inv[key]||0) >= CONSUMABLE_CAPS[key]){
      const g = 20 + Math.floor(Math.random()*20) + depth*2;
      player.gold += g;
      return `이미 ${SHOP_ITEMS.find(s=>s.key===key).name}이(가) 가득 차, 대신 금화 ${g}G를 얻었다.`;
    }
    player.inv[key] = (player.inv[key]||0) + 1;
    return `${SHOP_ITEMS.find(s=>s.key===key).name}을(를) 얻었다. (보유 ${player.inv[key]}/${CONSUMABLE_CAPS[key]})`;
  }
  // 정예의 인장 조각 지급 — 4개 모이면 자동으로 인장 1개로 전환(초과분 유지).
  function grantEliteSealFragments(n){
    player.eliteSealFragments = (player.eliteSealFragments||0) + n;
    let msg = `정예의 인장 조각 +${n}`;
    if(player.eliteSealFragments >= 4){
      const gained = Math.floor(player.eliteSealFragments/4);
      player.eliteSealFragments -= gained*4;
      player.eliteSeals = (player.eliteSeals||0) + gained;
      msg += ` → 조각이 모여 정예의 인장 +${gained}개로 전환됐다! (보유 ${player.eliteSeals}개)`;
    } else {
      msg += ` (조각 ${player.eliteSealFragments}/4)`;
    }
    return msg;
  }
  // "다음 전투 한정" 저주(받는 피해 증가) — 기존 buffDefTurns/buffDefMult을
  // 재활용한다(전투 하나가 끝나기 전에 자연 소멸).
  function applyNextBattleCurse(){
    player.buffDefTurns = 99; player.buffDefMult = 1.15;
  }
  // 무작위 희귀 장비 지급, 없으면 골드로 대체.
  function grantRareOrGold(goldFallbackBase){
    const id = findRareDropForDepth();
    if(id){
      player.equipOwned.push(id);
      const it = RARE_EQUIPMENT[id];
      return `✨ 희귀 아이템 [${it.name}]을(를) 얻었다! (${statsText(it.stats)})`;
    }
    const g = goldFallbackBase + Math.floor(Math.random()*goldFallbackBase) + depth*3;
    player.gold += g;
    return `대신 금화 ${g}G를 얻었다.`;
  }

  /* ============ 신규 이벤트 ============ */

  // 12) 낡은 연금술사의 가방
  function showAlchemistBagEvent(){
    const {overlay, panel} = eventOverlay('낡은 연금술사의 가방',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">누군가 버리고 간 가방이다.</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-search">뒤진다 (랜덤 포션 1개 획득)</button>
        <button class="btn" id="me-skip">그냥 지나간다</button>
        <button class="btn" id="me-open">가방을 열어본다 (상급 포션 획득, 대신 다음 전투에서 저주)</button>
      </div>`);
    panel.querySelector('#me-search').addEventListener('click', ()=>{
      const msg = grantRandomPotion();
      renderStatus();
      addLog(`가방을 뒤졌다. ${msg}`, 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('가방을 그냥 지나쳤다.');
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-open').addEventListener('click', ()=>{
      const msg = grantSpecificPotion('hipotion');
      applyNextBattleCurse();
      renderStatus();
      addLog(`가방을 열어봤다. ${msg} 불길한 기운이 스며든다(다음 전투 받는 피해 +15%).`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
  }

  // 13) 피의 제단
  function showBloodAltarEvent(){
    const {overlay, panel} = eventOverlay('피의 제단',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">오래된 제단에서 피 냄새가 난다.</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-full" ${player.hp<=Math.round(player.maxhp*0.2)?'disabled':''}>피를 바친다 (HP -20%, 무작위 희귀 장비)</button>
        <button class="btn" id="me-half" ${player.hp<=Math.round(player.maxhp*0.1)?'disabled':''}>조금만 바친다 (HP -10%, 골드 획득)</button>
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    panel.querySelector('#me-full').addEventListener('click', ()=>{
      const loss = Math.max(1, Math.round(player.maxhp*0.2));
      player.hp = Math.max(1, player.hp-loss);
      const msg = grantRareOrGold(25);
      renderStatus();
      addLog(`제단에 피를 바쳤다(HP -${loss}). ${msg}`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-half').addEventListener('click', ()=>{
      const loss = Math.max(1, Math.round(player.maxhp*0.1));
      player.hp = Math.max(1, player.hp-loss);
      const g = 20 + Math.floor(Math.random()*20) + depth*3;
      player.gold += g;
      renderStatus();
      addLog(`제단에 피를 조금 바쳤다(HP -${loss}). 골드 +${g}G.`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('제단을 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 14) 미친 연금술사 — "검사"는 30G를 내고 결과를 미리 본 뒤 다시 선택하는 2단계 구성.
  function showMadAlchemistEvent(){
    const {overlay, panel} = eventOverlay('미친 연금술사',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">"이 포션은 분명 효과가 있을 거야. 아마도."</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-drink">마신다 (랜덤 HP/MP 회복 또는 독)</button>
        <button class="btn" id="me-inspect" ${player.gold<30?'disabled':''}>포션을 검사한다 (30G, 결과를 먼저 확인)</button>
        <button class="btn" id="me-take">가져간다 (랜덤 포션 1개 획득)</button>
      </div>`);
    function drinkGood(){
      const healHp = Math.round(player.maxhp*(0.2+Math.random()*0.3));
      const healMp = Math.round(player.maxmp*(0.2+Math.random()*0.3));
      player.hp = Math.min(player.maxhp, player.hp+healHp);
      player.mp = Math.min(player.maxmp, player.mp+healMp);
      return `효과가 좋았다! HP +${healHp}, MP +${healMp}`;
    }
    function drinkBad(){
      const loss = Math.max(1, Math.round(player.maxhp*0.12));
      player.hp = Math.max(1, player.hp-loss);
      applyNextBattleCurse();
      return `독이었다! HP -${loss}, 다음 전투 받는 피해 +15%`;
    }
    panel.querySelector('#me-drink').addEventListener('click', ()=>{
      const good = Math.random()<0.5;
      const text = good ? drinkGood() : drinkBad();
      renderStatus();
      addLog(`포션을 그냥 마셨다. ${text}`, good?'gold':'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-inspect').addEventListener('click', ()=>{
      if(player.gold<30) return;
      player.gold -= 30;
      renderStatus();
      const good = Math.random()<0.5;
      panel.innerHTML = `<h3 style="color:#c9a8ff;">❓ 미친 연금술사</h3>
        <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
          30G를 지불하고 살펴보니 — ${good ? '<span style="color:var(--gold-bright);">몸에 좋은 효과가 있을 것 같다.</span>' : '<span style="color:var(--rust-bright);">독이 든 것 같다.</span>'}
        </p>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <button class="btn" id="me-drink2">${good ? '마신다' : '그래도 마신다'}</button>
          <button class="btn" id="me-take2">포기하고 가져간다 (랜덤 포션 1개 획득)</button>
        </div>`;
      panel.querySelector('#me-drink2').addEventListener('click', ()=>{
        const text = good ? drinkGood() : drinkBad();
        renderStatus();
        addLog(`검사한 대로 포션을 마셨다. ${text}`, good?'gold':'warn');
        saveGame();
        closeMysteryEvent(overlay);
      });
      panel.querySelector('#me-take2').addEventListener('click', ()=>{
        const msg = grantRandomPotion();
        renderStatus();
        addLog(`포션을 검사만 하고 챙겼다. ${msg}`, 'gold');
        saveGame();
        closeMysteryEvent(overlay);
      });
    });
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      const msg = grantRandomPotion();
      renderStatus();
      addLog(`포션을 그대로 챙겼다. ${msg}`, 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
  }

  // 15) 피투성이 도전자 — 정예 전투로 이어지는 결투류 이벤트.
  function showBloodyChallengerEvent(){
    const {overlay, panel} = eventOverlay('피투성이 도전자',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">"나를 쓰러뜨리면 이 보물을 가져가라."</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-fight">싸운다 (정예급 전투, 승리 시 정예의 인장 +1 + 추가 골드)</button>
        <button class="btn" id="me-skip">거절한다</button>
        <button class="btn" id="me-taunt">도발한다 (더 강한 정예, 대신 인장 +2)</button>
      </div>`);
    panel.querySelector('#me-fight').addEventListener('click', ()=>{
      overlay.remove();
      nodeForcedElite = true;
      pendingDuelSealCount = 1;
      pendingDuelBonusGold = 30 + Math.floor(Math.random()*20) + depth*2;
      addLog('피투성이 도전자와 맞선다!', 'warn');
      setTimeout(()=>startBattle(false), 350);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('도전을 거절하고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-taunt').addEventListener('click', ()=>{
      overlay.remove();
      nodeForcedElite = true;
      nodeEliteBoost = true;
      pendingDuelSealCount = 2;
      addLog('도전자를 도발했다 — 훨씬 강해진 기운이 느껴진다!', 'warn');
      setTimeout(()=>startBattle(false), 350);
    });
  }

  // 16) 수상한 무기
  function showSuspiciousWeaponEvent(){
    const {overlay, panel} = eventOverlay('수상한 무기',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">바닥에 누군가 버리고 간 검이 있다.</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-take">집는다 (무기 획득, 대신 다음 전투에서 저주)</button>
        <button class="btn" id="me-inspect">조사한다 (50% 좋은 무기 / 50% 함정)</button>
        <button class="btn" id="me-skip">버린다</button>
      </div>`);
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      const id = findEquipmentForDepth();
      let text;
      if(id){ player.equipOwned.push(id); text = `[${EQUIPMENT[id].name}]을(를) 얻었다.`; }
      else { const g = 15+Math.floor(Math.random()*15)+depth*2; player.gold += g; text = `대신 금화 ${g}G를 얻었다.`; }
      applyNextBattleCurse();
      renderStatus();
      addLog(`무기를 집었다. ${text} 불길한 기운이 스며든다(다음 전투 받는 피해 +15%).`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-inspect').addEventListener('click', ()=>{
      if(Math.random()<0.5){
        const msg = grantRareOrGold(20);
        renderStatus();
        addLog(`조사해보니 좋은 물건이었다! ${msg}`, 'gold');
      } else {
        const loss = Math.max(1, Math.round(player.maxhp*0.1));
        player.hp = Math.max(1, player.hp-loss);
        renderStatus();
        addLog(`함정이었다! HP -${loss}`, 'warn');
      }
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('무기를 그냥 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 17) 시체 더미 — "뒤진다"는 30% 확률로 일반 전투로 이어진다.
  function showCorpsePileEvent(){
    const {overlay, panel} = eventOverlay('시체 더미',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">시체 사이에서 무언가 반짝인다.</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-search">뒤진다 (골드/포션/장비 중 하나, 30% 확률로 전투 발생)</button>
        <button class="btn" id="me-careful">조심스럽게 조사한다 (골드 적게, 전투 없음)</button>
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    panel.querySelector('#me-search').addEventListener('click', ()=>{
      overlay.remove();
      const roll = Math.random();
      let text;
      if(roll<0.4){ const g = 25+Math.floor(Math.random()*20)+depth*3; player.gold+=g; text = `금화 ${g}G를 찾았다.`; }
      else if(roll<0.7){ text = grantRandomPotion(); }
      else {
        const id = findEquipmentForDepth();
        if(id){ player.equipOwned.push(id); text = `[${EQUIPMENT[id].name}]을(를) 찾았다.`; }
        else { const g=20+Math.floor(Math.random()*15)+depth*2; player.gold+=g; text = `금화 ${g}G를 찾았다.`; }
      }
      renderStatus();
      const willFight = Math.random()<0.3;
      addLog(`시체 더미를 뒤졌다. ${text}${willFight ? ' 무언가 반응했다!' : ''}`, 'gold');
      saveGame();
      if(willFight) setTimeout(()=>startBattle(false), 400);
      else renderExplore([]);
    });
    panel.querySelector('#me-careful').addEventListener('click', ()=>{
      const g = 8+Math.floor(Math.random()*10)+depth;
      player.gold += g;
      renderStatus();
      addLog(`조심스럽게 조사했다. 골드 +${g}G.`, 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('시체 더미를 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 18) 이상한 촛불
  function showStrangeCandleEvent(){
    const {overlay, panel} = eventOverlay('이상한 촛불',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">촛불 하나가 꺼지지 않고 타오르고 있다.</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-extinguish">촛불을 끈다 (다음 전투 적 공격력 -20%)</button>
        <button class="btn" id="me-take">촛불을 가져간다 (골드 획득, 대신 다음 전투 받는 피해 +15%)</button>
        <button class="btn" id="me-skip">그냥 지나간다</button>
      </div>`);
    panel.querySelector('#me-extinguish').addEventListener('click', ()=>{
      player.nextBattleEnemyAtkMult = 0.8;
      addLog('촛불을 껐다. 다음 전투에서 마주칠 상대가 어딘가 약해진 듯하다.', 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      const g = 15+Math.floor(Math.random()*15)+depth*2;
      player.gold += g;
      applyNextBattleCurse();
      renderStatus();
      addLog(`촛불을 챙겼다. 골드 +${g}G. 불길한 기운이 스며든다(다음 전투 받는 피해 +15%).`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('촛불을 그냥 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 19) 악마의 계약 — 마을 도착 시(combat/battle-end.js의 showBossRewardChoice) 자동 해제.
  function showDemonContractEvent(){
    const {overlay, panel} = eventOverlay('악마의 계약',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">"지금 네게 힘을 주겠다. 대가는 나중에 받도록 하지."</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-c1">계약한다 (공격력 +25%, 대신 승리마다 HP -5%)</button>
        <button class="btn" id="me-c2">더 강한 계약 (공격력 +50%, 대신 승리마다 HP -10%)</button>
        <button class="btn" id="me-skip">거절한다</button>
      </div>`);
    panel.querySelector('#me-c1').addEventListener('click', ()=>{
      player.contractBuff = {atkMult:1.25, hpDrainPct:0.05};
      addLog('악마와 계약했다. 힘이 차오른다. (마을 도착 시 해제됨)', 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-c2').addEventListener('click', ()=>{
      player.contractBuff = {atkMult:1.5, hpDrainPct:0.10};
      addLog('더 강한 계약을 맺었다. 압도적인 힘이 느껴진다. (마을 도착 시 해제됨)', 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('계약을 거절하고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 20) 잃어버린 지갑
  function showLostWalletEvent(){
    const {overlay, panel} = eventOverlay('잃어버린 지갑',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">바닥에 무거운 주머니가 떨어져 있다.</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-take">가져간다 (골드 +150)</button>
        <button class="btn" id="me-return">주인을 찾는다 (사례금 50G + 경험치)</button>
        <button class="btn" id="me-skip">무시한다</button>
      </div>`);
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      player.gold += 150;
      renderStatus();
      addLog('지갑을 가져갔다. 골드 +150G.', 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-return').addEventListener('click', ()=>{
      overlay.remove();
      player.gold += 50;
      const expGain = 15+depth*3;
      const leveled = grantExp(expGain);
      renderStatus();
      addLog(`주인을 찾아 지갑을 돌려주고 사례금을 받았다. 골드 +50G, 경험치 +${expGain}.`, 'gold');
      saveGame();
      if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
      renderExplore([]);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('지갑을 무시하고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 21) 수수께끼의 마법사 — 3가지 중 반드시 하나를 고른다(거절 선택지 없음).
  function showMysteriousMageEvent(){
    const {overlay, panel} = eventOverlay('수수께끼의 마법사',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">"네게 필요한 힘을 하나 주겠다."</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-atk">🔥 공격의 축복 (다음 3전투 공격력 +20%)</button>
        <button class="btn" id="me-def">🛡 생존의 축복 (다음 3전투 받는 피해 -15%)</button>
        <button class="btn" id="me-mp">🔮 마나의 축복 (다음 3전투 스킬 MP비용 -20%)</button>
      </div>`);
    function pick(type, value, label){
      player.multiBattleBuff = {type, value, battlesLeft:3};
      addLog(`마법사에게서 ${label}을(를) 받았다. (다음 3전투 지속)`, 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    }
    panel.querySelector('#me-atk').addEventListener('click', ()=> pick('atk', 0.20, '공격의 축복'));
    panel.querySelector('#me-def').addEventListener('click', ()=> pick('mitigate', 0.15, '생존의 축복'));
    panel.querySelector('#me-mp').addEventListener('click', ()=> pick('mpcost', 0.20, '마나의 축복'));
  }

  // 22) 부상당한 모험가 — 도움을 준 적이 있으면 나중에 showInjuredAdventurerReunionEvent로 이어진다.
  function showInjuredAdventurerEvent(){
    const potionKeys = ['potion','hipotion','ether'].filter(k=>(player.inv[k]||0)>0);
    const {overlay, panel} = eventOverlay('부상당한 모험가',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">"제발... 포션 하나만..."</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-give-potion" ${potionKeys.length?'':'disabled'}>포션을 준다 (포션 1개 소모, 대신 경험치+골드)</button>
        <button class="btn" id="me-give-gold" ${player.gold<50?'disabled':''}>골드를 준다 (50G, 대신 경험치)</button>
        <button class="btn" id="me-skip">무시한다</button>
      </div>`);
    panel.querySelector('#me-give-potion').addEventListener('click', ()=>{
      if(!potionKeys.length) return;
      overlay.remove();
      const key = potionKeys[Math.floor(Math.random()*potionKeys.length)];
      player.inv[key] -= 1;
      player.helpedInjuredAdventurer = true;
      const g = 20+Math.floor(Math.random()*15)+depth*2;
      const expGain = 12+depth*2;
      player.gold += g;
      const leveled = grantExp(expGain);
      renderStatus();
      addLog(`${SHOP_ITEMS.find(s=>s.key===key).name}을(를) 나눠줬다. 골드 +${g}G, 경험치 +${expGain}.`, 'gold');
      saveGame();
      if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
      renderExplore([]);
    });
    panel.querySelector('#me-give-gold').addEventListener('click', ()=>{
      if(player.gold<50) return;
      overlay.remove();
      player.gold -= 50;
      player.helpedInjuredAdventurer = true;
      const expGain = 10+depth*2;
      const leveled = grantExp(expGain);
      renderStatus();
      addLog(`금화 50G를 나눠줬다. 경험치 +${expGain}.`, 'gold');
      saveGame();
      if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
      renderExplore([]);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('모험가를 무시하고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 22-2) 부상당한 모험가와의 재회 — 조건부 이벤트(showMysteryEvent 참고).
  function showInjuredAdventurerReunionEvent(){
    const {overlay, panel} = eventOverlay('그때 그 모험가',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:13px;font-style:italic;line-height:1.7;margin:-4px 0 16px;">
        낯익은 얼굴이 다가온다. "그때 도와줘서 고맙다." 그가 무언가를 건넨다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-take">받는다</button>
      </div>`);
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      player.helpedInjuredAdventurer = false;
      const msg = grantRareOrGold(30);
      renderStatus();
      addLog(`옛 모험가가 보답을 전했다. ${msg}`, 'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
  }

  // 23) 봉인된 문
  function showSealedDoorEvent(){
    const {overlay, panel} = eventOverlay('봉인된 문',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">문 너머에서 무언가가 두드리고 있다.</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-open">문을 연다 (정예 전투, 승리 시 정예의 인장 +2)</button>
        <button class="btn" id="me-break" ${player.hp<=Math.round(player.maxhp*0.15)?'disabled':''}>문을 부순다 (HP -15%, 즉시 보상)</button>
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    panel.querySelector('#me-open').addEventListener('click', ()=>{
      overlay.remove();
      nodeForcedElite = true;
      pendingDuelSealCount = 2;
      addLog('봉인된 문을 열었다 — 정예가 뛰쳐나온다!', 'warn');
      setTimeout(()=>startBattle(false), 350);
    });
    panel.querySelector('#me-break').addEventListener('click', ()=>{
      const loss = Math.max(1, Math.round(player.maxhp*0.15));
      player.hp = Math.max(1, player.hp-loss);
      const msg = grantRareOrGold(25);
      renderStatus();
      addLog(`문을 부쉈다(HP -${loss}). ${msg}`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('문을 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 24) 피를 원하는 석상
  function showBloodThirstyStatueEvent(){
    const {overlay, panel} = eventOverlay('피를 원하는 석상',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">석상의 눈이 붉게 빛난다.</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-small" ${player.hp<=Math.round(player.maxhp*0.1)?'disabled':''}>HP 10% 바치기 (정예의 인장 조각 또는 골드)</button>
        <button class="btn" id="me-big" ${player.hp<=Math.round(player.maxhp*0.3)?'disabled':''}>HP 30% 바치기 (희귀 장비 획득)</button>
        <button class="btn" id="me-skip">무시한다</button>
      </div>`);
    panel.querySelector('#me-small').addEventListener('click', ()=>{
      const loss = Math.max(1, Math.round(player.maxhp*0.1));
      player.hp = Math.max(1, player.hp-loss);
      let text;
      if(Math.random()<0.5){ text = grantEliteSealFragments(1+Math.floor(Math.random()*2)); }
      else { const g = 20+Math.floor(Math.random()*20)+depth*3; player.gold+=g; text = `금화 +${g}G`; }
      renderStatus();
      addLog(`석상에 피를 바쳤다(HP -${loss}). ${text}`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-big').addEventListener('click', ()=>{
      const loss = Math.max(1, Math.round(player.maxhp*0.3));
      player.hp = Math.max(1, player.hp-loss);
      const msg = grantRareOrGold(30);
      renderStatus();
      addLog(`석상에 많은 피를 바쳤다(HP -${loss}). ${msg}`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('석상을 무시하고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 25) 악마의 주사위 — 도박사(jester)는 50G 배팅 후 "한 번 더 던진다"가 가능.
  function showDevilsDiceEvent(){
    const isJester = player.job==='jester';
    const {overlay, panel} = eventOverlay('악마의 주사위',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;">"한 번 던져보겠나?"</p>
       <p id="me-dice-result" style="text-align:center;color:var(--gold-bright);font-size:12.5px;min-height:16px;margin:0 0 8px;"></p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-bet50" ${player.gold<50?'disabled':''}>50G를 건다</button>
        <button class="btn" id="me-bet100" ${player.gold<100?'disabled':''}>100G를 건다 (성공 시 희귀 아이템)</button>
        <button class="btn" id="me-skip">떠난다</button>
      </div>`);
    const resultEl = panel.querySelector('#me-dice-result');
    function rollSmall(){
      if(player.gold<50) return;
      player.gold -= 50;
      const roll = 1+Math.floor(Math.random()*6);
      let text;
      if(roll<=2){ text = `주사위(${roll}) — 아무것도 없었다.`; }
      else if(roll<=5){ player.gold += 100; text = `주사위(${roll}) — 골드 +100G!`; }
      else { player.gold += 300; text = `주사위(${roll}) — 대박! 골드 +300G!`; }
      renderStatus();
      resultEl.textContent = text;
      addLog(text, roll<=2?'warn':'gold');
      saveGame();
      panel.querySelector('#me-bet50').disabled = player.gold<50;
      panel.querySelector('#me-bet100').disabled = player.gold<100;
    }
    panel.querySelector('#me-bet50').addEventListener('click', ()=>{
      rollSmall();
      if(isJester){
        panel.querySelector('#me-bet50').textContent = '🎲 한 번 더 던진다';
      } else {
        closeMysteryEvent(overlay);
      }
    });
    panel.querySelector('#me-bet100').addEventListener('click', ()=>{
      if(player.gold<100) return;
      player.gold -= 100;
      let text;
      if(Math.random()<0.5){
        const id = findRareDropForDepth();
        if(id){ player.equipOwned.push(id); text = `도박 성공! [${RARE_EQUIPMENT[id].name}]을(를) 얻었다.`; }
        else { const g = 60+depth*3; player.gold+=g; text = `도박 성공! 금화 +${g}G.`; }
      } else {
        text = '도박에 실패했다. 100G를 잃었다.';
      }
      renderStatus();
      resultEl.textContent = text;
      addLog(text, text.includes('실패')?'warn':'gold');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('주사위를 거절하고 떠났다.');
      closeMysteryEvent(overlay);
    });
  }