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
      showCurseEchoEvent, showOldLibraryEvent, showMapFragmentEvent,
      showAlchemistBagEvent, showMadAlchemistEvent, showBloodyChallengerEvent,
      showCorpsePileEvent, showStrangeCandleEvent, showDemonContractEvent,
      showLostWalletEvent, showMysteriousMageEvent, showInjuredAdventurerEvent, showSealedDoorEvent,
      showBloodThirstyStatueEvent, showDevilsDiceEvent, showFrozenClockmakerEvent,
      showAchosTombstoneEvent, showScratchedPortraitEvent, showPlagueDiaryEvent,
      showGatekeeperLogEvent, showBrokenArmorStandEvent,
      showTailorWorkshopEvent, showArchivistNoteEvent, showDiggerToolboxEvent, showJesterPropsEvent,
    ];
    // "부서진 톱니 장신구"(아이온 파편)는 마녀의 시계 보유자에게만 이벤트
    // 풀이 열린다(멈춘 시계공방과 같은 게이트, 사용자 기획).
    if((player.relics||[]).includes('relic_witchclock')) handlers.push(showGearShardEvent);
    // "그때 그 모험가"(재회)는 이전에 부상당한 모험가를 도와준 적이 있을 때만
    // 이벤트 풀에 포함된다 — 안 만난 적 없는 상태에서 재회가 뜨면 앞뒤가 안
    // 맞기 때문에, 이 조건만은 균등 확률 원칙의 예외로 둔다.
    if(player.helpedInjuredAdventurer) handlers.push(showInjuredAdventurerReunionEvent);
    // "잠긴 육아실"(왕자 떡밥 3단계 세트 중 2단계, 사용자 기획): 잭과의
    // 대사를 3단계까지 전부 들은 상태(combat/battle-setup.js의
    // jackPrinceDialogueCount>=3)에서만 이벤트 풀에 등장하고, 한 번 보면
    // 다시 뜨지 않는다(재회 이벤트와 같은 "조건부 예외" 패턴).
    if((player.jackPrinceDialogueCount||0) >= 3 && !player.nurseryEventSeen) handlers.push(showNurseryEvent);
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
        오래된 제단 위에 마른 핏자국이 남아 있다. 새겨진 문양은 이제 다 지워졌지만, 한때 이곳에서 무언가 절박한 의식이 치러졌다는 것만은 분명하다. 바치면, 여전히 응답한다.
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
        은은하게 빛나는 샘물을 발견했다. 수면 위로, 미동도 없는 잔물결이 얼어붙은 것처럼 비친다. 마시면 몸이 가벼워질 것 같지만, 어딘가 대가가 있을 것 같다.
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
        먼지 쌓인 관 하나가 놓여 있다. 관 뚜껑에 희미하게 남은 문장(紋章)이, 이 회랑 어딘가에서 본 것과 닮아 있다. 안에 뭐가 들었을지는 열어봐야 안다.
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
        낯선 상인이 마지막 남은 물건이라며 하나를 내민다. 옷차림이 이상하리만치 낡았다 — 마치 이 회랑보다도 오래 이곳에 있었던 것처럼. 지금이 아니면 다시 없을 물건이다.
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
      '벽 틈에 반쯤 삭은 깃발 조각이 끼어 있다. 문양은 알아볼 수 없지만, 한때 어느 가문의 것이었을 것이다.',
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
  // 8) 속삭이는 저주의 흔적 (B안 — 저주와 엮이는 이벤트). 짊어진 저주 개수가
  // 많을수록 공명시켰을 때의 보상이 커진다. 저주가 하나도 없으면 공명 자체가
  // 안 통해 밋밋한 결과만 나온다(그래도 손해는 없음).
  function showCurseEchoEvent(){
    const curseCount = (typeof getCurseCount==='function') ? getCurseCount() : 0;
    if(curseCount<=0){
      const {overlay, panel} = eventOverlay('속삭이는 저주의 흔적',
        `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
          바닥에 희미한 저주의 흔적이 남아 있다. 오래전 이곳에 살았던 누군가의 흔적 같기도 하다. 그대에게는 아무런 감흥도 일으키지 못한다.
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

  // 10) 낡은 서고 (D안 — 직업별로 다르게 반응하는 이벤트). 기본 직업(job)에
  // 따라 발견하는 물건과 보상이 달라진다 — "내 직업다운" 순간을 준다.
  function showOldLibraryEvent(){
    const byJob = {
      warrior:  {find:'낡은 훈련 교본', flavor:'닳고 닳은 교본 표지에, 이제는 지워진 문장(紋章)이 희미하게 남아 있다. 안에는 검을 다루는 법이 빼곡히 적혀 있다.', apply:()=>{ const d=Math.max(1,Math.round(player.atk*0.05)); player.atk+=d; return `공격력 +${d} (영구)`; }},
      mage:     {find:'봉인된 마법서', flavor:'표지가 서늘한 마법서 한 권. 넘기는 것만으로도 마력이 꿈틀댄다.', apply:()=>{ const d=Math.max(1,Math.round(player.mag*0.05)); player.mag+=d; return `마력 +${d} (영구)`; }},
      rogue:    {find:'숨겨진 보물 지도', flavor:'서고 한구석, 낡은 지도 한 장이 눈에 띈다.', apply:()=>{ const g=30+Math.floor(Math.random()*20)+depth*3; player.gold+=g; return `골드 +${g}G`; }},
      paladin:  {find:'성서의 한 구절', flavor:'빛바랜 성서를 읽어내리자 몸에 온기가 감돈다. 마지막 장, 누군가의 서명이 있었을 자리가 긁혀 지워져 있다.', apply:()=>{ const d=Math.max(1,Math.round(player.maxhp*0.04)); player.maxhp+=d; player.hp=Math.min(player.maxhp,player.hp+d); return `최대HP +${d} (영구)`; }},
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
        바닥에 반쯤 타버린 지도 조각이 떨어져 있다. 표시된 건 이 회랑이 아니라, 지금은 없는 어느 지역의 지도 같다.<br>
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
    const available = ['potion','hipotion','ether','hiether'].filter(k=>(player.inv[k]||0) < CONSUMABLE_CAPS[k]);
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
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">누군가 버리고 간 가방이다. 안감에 작은 자수가 놓여 있다 — 한때는 이름이었을 것 같은데, 실이 다 풀려 알아볼 수 없다.</p>`,
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


  // 14) 미친 연금술사 — "검사"는 30G를 내고 결과를 미리 본 뒤 다시 선택하는 2단계 구성.
  function showMadAlchemistEvent(){
    const {overlay, panel} = eventOverlay('미친 연금술사',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">"이 포션은 분명 효과가 있을 거야. 아마도." 연금술사의 손끝이 옅은 보랏빛으로 물들어 있다.</p>`,
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
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">"나를 쓰러뜨리면 이 보물을 가져가라." 갑옷 곳곳에 낯선 문장이 찍혀 있다 — 이미 누군가의 것이었던 것처럼.</p>`,
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

  // 17) 시체 더미 — "뒤진다"는 30% 확률로 일반 전투로 이어진다.
  function showCorpsePileEvent(){
    const {overlay, panel} = eventOverlay('시체 더미',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">시체 사이에서 무언가 반짝인다. 갑옷 아래로, 이 회랑의 것이 아닌 낯선 문양이 언뜻 비친다.</p>`,
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
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">촛불 하나가 꺼지지 않고 타오르고 있다. 불꽃이 흔들리는 방식이, 마치 이 자리만 시간이 다르게 흐르는 것 같다.</p>`,
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
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">"지금 네게 힘을 주겠다. 대가는 나중에 받도록 하지." 목소리에는 성별도 나이도 느껴지지 않는다. 다만 그 말투가, 어딘가 낡은 시계태엽 소리처럼 규칙적이다.</p>`,
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
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">바닥에 무거운 주머니가 떨어져 있다. 안에는 이제 어디서도 쓸 수 없을 것 같은, 낯선 문양이 찍힌 동전 몇 개가 섞여 있다.</p>`,
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
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">"네게 필요한 힘을 하나 주겠다." 말투에서, 아주 오래전에 잊힌 억양이 옅게 느껴진다.</p>`,
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
    const potionKeys = ['potion','hipotion','ether','hiether'].filter(k=>(player.inv[k]||0)>0);
    const {overlay, panel} = eventOverlay('부상당한 모험가',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">"제발... 포션 하나만..." 갑옷은 낡았지만, 자세만은 이상하리만치 꼿꼿하다.</p>`,
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
        낯익은 얼굴이 다가온다. 처음 만났을 때보다 표정이 한결 평온해 보인다. "그때 도와줘서 고맙다." 그가 무언가를 건넨다.
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
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">문 너머에서 무언가가 두드리고 있다. 두드리는 소리에 일정한 박자가 있다 — 마치 누군가 아직도 규율을 지키고 있는 것처럼.</p>`,
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
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">석상의 눈이 붉게 빛난다. 조각된 얼굴은 사람의 것이지만, 표정만은 어딘가 텅 비어 있다.</p>`,
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
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;">"한 번 던져보겠나?" 주사위 표면에 눈금 대신, 알아볼 수 없는 낡은 문자가 새겨져 있다.</p>
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

  // 26) 멈춘 시계공방 — 아이온(시간의 마녀) 테마 전용. 마녀의 시계 보유 시에만
  // 4번째 선택지가 나타난다(기존 균등 확률 이벤트 풀에 그대로 합류).
  function showFrozenClockmakerEvent(){
    const hasClock = (player.relics||[]).includes('relic_witchclock');
    const {overlay, panel} = eventOverlay('멈춘 시계공방',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        낡은 시계공방이 있다. 벽에 걸린 시계들은 전부 같은 시각에 멈춰 있다. 작업대 위엔, 완성되다 만 회중시계 하나가 놓여 있다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-inspect">시계를 살펴본다 (안전, 소량 경험치)</button>
        <button class="btn" id="me-take">시계를 챙긴다 (골드 획득, 대신 다음 전투에서 저주)</button>
        ${hasClock ? '<button class="btn" id="me-clock">품 안의 시계를 꺼내본다</button>' : ''}
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    panel.querySelector('#me-inspect').addEventListener('click', ()=>{
      const expGain = 10 + depth*3;
      const leveled = grantExp(expGain);
      renderStatus();
      addLog(`멈춘 시계들을 살펴봤다. 아무 일도 일어나지 않았다. (EXP +${expGain})`, 'gold');
      saveGame();
      overlay.remove();
      if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
      renderExplore([]);
    });
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      const g = 20 + Math.floor(Math.random()*20) + depth*3;
      player.gold += g;
      applyNextBattleCurse();
      renderStatus();
      addLog(`미완성 회중시계를 챙겼다. 골드 +${g}G. 불길한 기운이 스며든다(다음 전투 받는 피해 +15%).`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    if(hasClock){
      panel.querySelector('#me-clock').addEventListener('click', ()=>{
        overlay.remove();
        showDialogueSequence(
          ['품 안의 시계가 미세하게 떨린다.', '작업대 위 미완성 시계가, 그 떨림에 응답하듯 희미하게 빛난다.'],
          {onDone: ()=>{
            const msg = grantRareOrGold(25);
            renderStatus();
            addLog(`두 시계가 서로에게 반응했다. ${msg}`, 'gold');
            saveGame();
            renderExplore([]);
          }}
        );
      });
    }
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('시계공방을 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }


  // 27) 낡은 묘비 — 아코스(칼리버 X의 정체) 관련 간접 단서. 직업 무관.
  function showAchosTombstoneEvent(){
    const {overlay, panel} = eventOverlay('낡은 묘비',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        낡은 묘비 하나가 서 있다. 새겨진 이름은 거의 다 지워졌지만, 그 앞에 놓인 꽃만은 이상하리만치 시들지 않았다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-inspect">묘비를 살펴본다 (안전, 소량 경험치)</button>
        <button class="btn" id="me-take">꽃을 치운다 (골드 획득, 대신 다음 전투에서 저주)</button>
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    panel.querySelector('#me-inspect').addEventListener('click', ()=>{
      const expGain = 10 + depth*3;
      const leveled = grantExp(expGain);
      renderStatus();
      addLog(`묘비 앞에 한참을 서 있었다. 이름은 끝내 읽을 수 없었다. (EXP +${expGain})`, 'gold');
      saveGame();
      overlay.remove();
      if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
      renderExplore([]);
    });
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      const g = 20 + Math.floor(Math.random()*20) + depth*3;
      player.gold += g;
      applyNextBattleCurse();
      renderStatus();
      addLog(`시들지 않는 꽃을 치웠다. 골드 +${g}G. 왠지 모를 죄책감이 스며든다(다음 전투 받는 피해 +15%).`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('묘비를 뒤로하고 발걸음을 옮겼다.');
      closeMysteryEvent(overlay);
    });
  }

  // 28) 긁힌 초상화 — 왕실 초상화에서 지워진 존재에 대한 간접 단서. 직업 무관.
  function showScratchedPortraitEvent(){
    const {overlay, panel} = eventOverlay('긁힌 초상화',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        낡은 초상화 한 점이 걸려 있다. 왕의 곁에 나란히 있었을 자리는 날카로운 것으로 긁혀 지워져 있다. 그 아래엔, 작은 손바닥 자국이 희미하게 남아 있다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-inspect">초상화를 살펴본다 (안전, 소량 경험치)</button>
        <button class="btn" id="me-take">액자를 뜯어본다 (골드 획득, 대신 다음 전투에서 저주)</button>
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    panel.querySelector('#me-inspect').addEventListener('click', ()=>{
      const expGain = 10 + depth*3;
      const leveled = grantExp(expGain);
      renderStatus();
      addLog(`지워진 자리를 한참 들여다봤지만, 누구였는지는 끝내 알 수 없었다. (EXP +${expGain})`, 'gold');
      saveGame();
      overlay.remove();
      if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
      renderExplore([]);
    });
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      const g = 20 + Math.floor(Math.random()*20) + depth*3;
      player.gold += g;
      applyNextBattleCurse();
      renderStatus();
      addLog(`액자를 뜯어 뒷면을 확인했지만 아무것도 없었다. 골드 +${g}G. 괜히 뒤가 서늘하다(다음 전투 받는 피해 +15%).`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('초상화를 뒤로하고 발걸음을 옮겼다.');
      closeMysteryEvent(overlay);
    });
  }

  // 29) 역병 시절의 일기장 — 이번 스토리텔링 중 가장 직접적인 단서(역병→낯선
  // 손님→시간 이상 순서를 플레이어가 스스로 조립하게 함). 직업 무관.
  function showPlagueDiaryEvent(){
    const {overlay, panel} = eventOverlay('역병 시절의 일기장',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        먼지 쌓인 서랍 속에서 낡은 일기장 하나를 발견했다. 마지막 몇 장만 겨우 글씨를 알아볼 수 있다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-read">일기장을 읽는다</button>
        <button class="btn" id="me-skip">그냥 둔다</button>
      </div>`);
    panel.querySelector('#me-read').addEventListener('click', ()=>{
      overlay.remove();
      showDialogueSequence([
        '"다들 기침을 멈추지 않는다. 의원들도 손을 놓은 지 오래다."',
        '"오늘, 폐하께서 낯선 손님을 들이셨다고 한다. 아무도 그 이름을 알지 못한다."',
        '"그날 이후로... 시계탑의 종이 울리지 않는다. 다들 이상하다고 하면서도, 아무도 이상하게 여기지 않는다."',
        '이후로는, 아무것도 적혀 있지 않다.',
      ], {onDone: ()=>{
        const expGain = 15 + depth*3;
        const leveled = grantExp(expGain);
        renderStatus();
        addLog(`오래된 일기장을 끝까지 읽었다. (EXP +${expGain})`, 'gold');
        saveGame();
        if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
        renderExplore([]);
      }});
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('일기장을 서랍에 도로 넣어두었다.');
      closeMysteryEvent(overlay);
    });
  }

  // 30) 잠긴 육아실 — 왕자 떡밥 3단계 세트 중 2단계(사용자 기획). 잭과의
  // 대사를 3단계까지 전부 들은 플레이어(combat/battle-setup.js의
  // jackPrinceDialogueCount>=3)에게만 이벤트 풀에 등장하며, 한 번 보면
  // player.nurseryEventSeen 플래그로 이후 다시 뜨지 않는다(showMysteryEvent
  // 참고). 죽음은 끝까지 직접 말하지 않고, 긁힌 초상화의 손바닥 자국과
  // 조용히 연결만 시킨다(간접 서술 원칙 — story.md 8장).
  function showNurseryEvent(){
    const {overlay, panel} = eventOverlay('잠긴 육아실',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        회랑 깊은 곳, 오랫동안 열리지 않은 것 같은 작은 방을 발견했다. 문 틈으로 먼지 쌓인 목마 인형과, 한 번도 쓰인 흔적이 없는 작은 침대가 보인다. 서리 낀 창문 한쪽에, 작은 손바닥 자국이 희미하게 남아 있다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-take">목마 인형을 챙긴다</button>
        <button class="btn" id="me-look">방을 조용히 둘러본다 (안전, 소량 경험치)</button>
        <button class="btn" id="me-skip">문을 닫고 나온다</button>
      </div>`);
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      overlay.remove();
      player.nurseryEventSeen = true;
      const already = player.equipOwned.includes('r_woodenhorse');
      if(!already) player.equipOwned.push('r_woodenhorse');
      showDialogueSequence([
        '목마를 집어 드니, 손잡이가 유난히 매끈하게 닳아 있다. 오래도록, 자주 쥐었던 것처럼.',
        already ? '이미 하나 가지고 있었다는 걸 깨닫는다 — 어쩌면, 그때도 이곳에 와본 적이 있었던 걸까.' : '',
      ].filter(Boolean), {onDone: ()=>{
        renderStatus();
        addLog(already ? '낡은 목마 인형을 다시 손에 쥐었다.' : '낡은 목마 인형을 손에 넣었다.', 'gold');
        saveGame();
        renderExplore([]);
      }});
    });
    panel.querySelector('#me-look').addEventListener('click', ()=>{
      player.nurseryEventSeen = true;
      const expGain = 15 + depth*3;
      const leveled = grantExp(expGain);
      renderStatus();
      addLog(`방 안을 한참 둘러봤지만, 누구의 것이었는지는 끝내 알 수 없었다. (EXP +${expGain})`, 'gold');
      saveGame();
      overlay.remove();
      if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
      renderExplore([]);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      player.nurseryEventSeen = true;
      addLog('왠지 더 들여다봐선 안 될 것 같아, 문을 조용히 닫았다.');
      saveGame();
      closeMysteryEvent(overlay);
    });
  }

  // 31) 닫히지 않는 문 — 문지기(오프닝 origin.js) = 아이온 반전 회수 1단계
  // (사용자 기획, story.md 9장 최우선 미회수 떡밥). 정체를 밝히지 않고,
  // 오프닝 마지막 대사("...들어가라. 문은 닫히지 않는다")의 잔향만 남긴다.
  // "손님"이라는 단어를 역병 시절의 일기장("낯선 손님")과 그대로 이어서
  // 두 이벤트가 은근히 연결되게 했다. 직업 무관, 일반 이벤트 풀에 포함.
  function showGatekeeperLogEvent(){
    const {overlay, panel} = eventOverlay('닫히지 않는 문',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        문지기의 근무일지, 마지막 장만 겨우 남아 있다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-read">근무일지를 읽는다 (안전, 소량 경험치)</button>
        <button class="btn" id="me-take">낡은 종이를 챙긴다 (골드 획득, 대신 다음 전투에서 저주)</button>
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    panel.querySelector('#me-read').addEventListener('click', ()=>{
      overlay.remove();
      showDialogueSequence([
        '"오늘도 그 자리에 서 계셨다. 시계를 만지작거리시며."',
        '"몇 년째 한 발짝도 움직이지 않으신다. 마치... 누군가를 기다리듯."',
        '"...설마, 처음 들어왔던 그 손님이신가?"',
        '그 뒤로는 몇 글자가 젖어 번져 있어, 더는 알아볼 수 없다.',
      ], {onDone: ()=>{
        const expGain = 12 + depth*3;
        const leveled = grantExp(expGain);
        renderStatus();
        addLog(`오래된 근무일지를 끝까지 읽었다. (EXP +${expGain})`, 'gold');
        saveGame();
        if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
        renderExplore([]);
      }});
    });
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      const g = 20 + Math.floor(Math.random()*20) + depth*3;
      player.gold += g;
      applyNextBattleCurse();
      renderStatus();
      addLog(`낡은 종이를 챙겼다. 골드 +${g}G. 괜히 뒤가 서늘하다(다음 전투 받는 피해 +15%).`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('일지를 도로 덮어두고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 32) 부서진 갑주 걸이 — 아코스 쪽 떡밥 보강(사용자 기획, 왕자 떡밥
  // 3단계 세트와 균형을 맞춤). 안전 선택지는 EXP, 위험 선택지는 골드
  // 대신 영구 방어력 소량(낡은 서고와 같은 "직접 이어받는다"는 결).
  // 회랑의 기사(칼리버X 소지)면 검이 반응하는 전용 문구가 덧붙는다.
  function showBrokenArmorStandEvent(){
    const {overlay, panel} = eventOverlay('부서진 갑주 걸이',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        녹슨 갑주 걸이 하나가 덩그러니 놓여 있다. 걸쳐 있어야 할 것은 보이지 않는다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-inspect">걸이를 살펴본다 (안전, 소량 경험치)</button>
        <button class="btn" id="me-take">글귀를 옮겨 새긴다 (영구 방어력 소량 획득)</button>
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    panel.querySelector('#me-inspect').addEventListener('click', ()=>{
      overlay.remove();
      showDialogueSequence([
        '걸이 아래, 벽에 짧은 글귀가 새겨져 있다 — "그가 돌아오면, 이 자리에."',
        '다른 손으로 몇 번이고 덧새겨진 흔적이 있다. 다른 사람들이, 계속 이어 새긴 것처럼.',
        '가장 최근 것으로 보이는 한 줄은 유독 힘없이 그어져 있다 — "...이제는, 나도 잘 모르겠다."',
      ], {onDone: ()=>{
        const expGain = 12 + depth*3;
        const leveled = grantExp(expGain);
        renderStatus();
        addLog(`오래도록 걸이를 바라봤다. (EXP +${expGain})`, 'gold');
        saveGame();
        if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
        renderExplore([]);
      }});
    });
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      overlay.remove();
      const d = Math.max(1, Math.round(player.def*0.05)) + 2;
      player.def += d;
      const isKnight = player.specialization === 'paladin_knight';
      const lines = ['글귀를 손끝으로 옮겨, 그대로 새겨 넣는다.'];
      if(isKnight) lines.push('칼리버 X가 아주 잠깐, 손안에서 미세하게 떨린다.');
      showDialogueSequence(lines, {onDone: ()=>{
        renderStatus();
        addLog(`걸이의 글귀를 이어 새겼다. 방어력 +${d} (영구)`, 'gold');
        saveGame();
        renderExplore([]);
      }});
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('걸이를 뒤로하고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 33) 부서진 톱니 장신구 — 아이온 파편 시리즈(사용자 기획). 마녀의 시계
  // 보유자에게만 이벤트 풀이 열린다(멈춘 시계공방과 같은 게이트 —
  // showMysteryEvent 참고). 보상은 신규 장신구(r_gearshard) 확정 지급이며,
  // 착용 중 아이온과 조우하면 전용 1회성 대사가 뜬다
  // (combat/battle-setup.js의 maybeShowAionEncounterDialogue).
  function showGearShardEvent(){
    const {overlay, panel} = eventOverlay('부서진 톱니 장신구',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        부서진 톱니 장신구 하나가 바닥에 떨어져 있다. 손에 쥐자, 낮은 울림이 귓가에 스친다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-take">장신구를 쥔다</button>
        <button class="btn" id="me-skip">그냥 둔다</button>
      </div>`);
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      overlay.remove();
      const already = player.equipOwned.includes('r_gearshard');
      if(!already) player.equipOwned.push('r_gearshard');
      showDialogueSequence([
        '"...멈추면, 더는 아무도 잃지 않아도 된다."',
        '"...그런데 왜, 이렇게 아플까."',
        '울림은 그것으로 끝이다. 장신구는 다시 그저 차가운 쇳조각일 뿐이다.',
      ], {onDone: ()=>{
        renderStatus();
        addLog(already ? '부서진 톱니 장신구를 다시 손에 쥐었다.' : '부서진 톱니 장신구를 손에 넣었다.', 'gold');
        saveGame();
        renderExplore([]);
      }});
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('장신구를 그대로 두고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }

  // 34~37) "회랑의 ○○" 중 아직 물음표 이벤트로 조명되지 않은 4종(재단사/
  // 금서/굴착꾼/어릿광대) 소규모 조명(사용자 기획 — 물량 확보, 낮은 개발
  // 비용). 전부 기존 스토리 이벤트와 동일한 템플릿(안전=EXP, 위험=골드+
  // 저주, 지나간다)이며, 특정 몬스터 조우와는 무관하게 등장한다.
  function showTailorWorkshopEvent(){
    const {overlay, panel} = eventOverlay('재단사의 공방',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        손대지 않은 옷감 두루마리가 펼쳐진 채다. 마름질선이 반쯤 그려지다 만 채로 멈춰 있다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-inspect">공방을 살펴본다 (안전, 소량 경험치)</button>
        <button class="btn" id="me-take">가위를 챙긴다 (골드 획득, 대신 다음 전투에서 저주)</button>
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    panel.querySelector('#me-inspect').addEventListener('click', ()=>{
      overlay.remove();
      showDialogueSequence([
        '가위 옆에, 완성 못한 단추 하나가 놓여 있다.',
      ], {onDone: ()=>{
        const expGain = 10 + depth*3;
        const leveled = grantExp(expGain);
        renderStatus();
        addLog(`공방을 한참 둘러봤다. (EXP +${expGain})`, 'gold');
        saveGame();
        if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
        renderExplore([]);
      }});
    });
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      const g = 20 + Math.floor(Math.random()*20) + depth*3;
      player.gold += g;
      applyNextBattleCurse();
      renderStatus();
      addLog(`가위를 챙겼다. 골드 +${g}G. 괜히 뒤가 서늘하다(다음 전투 받는 피해 +15%).`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('공방을 뒤로하고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }
  function showArchivistNoteEvent(){
    const {overlay, panel} = eventOverlay('서고지기의 마지막 메모',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        책갈피 사이, 접힌 메모 한 장이 끼워져 있다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-inspect">메모를 읽는다 (안전, 소량 경험치)</button>
        <button class="btn" id="me-take">책을 챙긴다 (골드 획득, 대신 다음 전투에서 저주)</button>
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    panel.querySelector('#me-inspect').addEventListener('click', ()=>{
      overlay.remove();
      showDialogueSequence([
        '"이름을 남기지 않는 자에 대해 더 알아내야 한다."',
        '그 아래, \'위험하다\'는 한 단어만 다급하게 덧붙여져 있다.',
      ], {onDone: ()=>{
        const expGain = 10 + depth*3;
        const leveled = grantExp(expGain);
        renderStatus();
        addLog(`메모를 끝까지 읽었다. (EXP +${expGain})`, 'gold');
        saveGame();
        if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
        renderExplore([]);
      }});
    });
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      const g = 20 + Math.floor(Math.random()*20) + depth*3;
      player.gold += g;
      applyNextBattleCurse();
      renderStatus();
      addLog(`책을 챙겼다. 골드 +${g}G. 괜히 뒤가 서늘하다(다음 전투 받는 피해 +15%).`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('메모를 도로 끼워두고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }
  function showDiggerToolboxEvent(){
    const {overlay, panel} = eventOverlay('굴착꾼의 공구함',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        녹슨 곡괭이와 함께, 성벽 보수 도면 한 장이 접혀 있다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-inspect">도면을 살펴본다 (안전, 소량 경험치)</button>
        <button class="btn" id="me-take">공구를 챙긴다 (골드 획득, 대신 다음 전투에서 저주)</button>
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    panel.querySelector('#me-inspect').addEventListener('click', ()=>{
      overlay.remove();
      showDialogueSequence([
        '도면 귀퉁이에 작은 글씨로 — "이걸로 충분할까."',
      ], {onDone: ()=>{
        const expGain = 10 + depth*3;
        const leveled = grantExp(expGain);
        renderStatus();
        addLog(`도면을 한참 들여다봤다. (EXP +${expGain})`, 'gold');
        saveGame();
        if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
        renderExplore([]);
      }});
    });
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      const g = 20 + Math.floor(Math.random()*20) + depth*3;
      player.gold += g;
      applyNextBattleCurse();
      renderStatus();
      addLog(`공구를 챙겼다. 골드 +${g}G. 괜히 뒤가 서늘하다(다음 전투 받는 피해 +15%).`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('공구함을 뒤로하고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }
  function showJesterPropsEvent(){
    const {overlay, panel} = eventOverlay('광대의 소품함',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        낡은 가면과 리본들 사이, 마지막 공연 순서표가 남아 있다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-inspect">순서표를 살펴본다 (안전, 소량 경험치)</button>
        <button class="btn" id="me-take">가면을 챙긴다 (골드 획득, 대신 다음 전투에서 저주)</button>
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    panel.querySelector('#me-inspect').addEventListener('click', ()=>{
      overlay.remove();
      showDialogueSequence([
        '맨 마지막 줄, \'앙코르\'라고 적혀 있던 자리가 지워지고 물음표로 바뀌어 있다.',
      ], {onDone: ()=>{
        const expGain = 10 + depth*3;
        const leveled = grantExp(expGain);
        renderStatus();
        addLog(`순서표를 한참 들여다봤다. (EXP +${expGain})`, 'gold');
        saveGame();
        if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
        renderExplore([]);
      }});
    });
    panel.querySelector('#me-take').addEventListener('click', ()=>{
      const g = 20 + Math.floor(Math.random()*20) + depth*3;
      player.gold += g;
      applyNextBattleCurse();
      renderStatus();
      addLog(`가면을 챙겼다. 골드 +${g}G. 괜히 뒤가 서늘하다(다음 전투 받는 피해 +15%).`, 'warn');
      saveGame();
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog('소품함을 뒤로하고 지나쳤다.');
      closeMysteryEvent(overlay);
    });
  }
