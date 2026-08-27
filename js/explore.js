"use strict";
/*
탐험 화면 로직 — 게임 시작, 화면 전환, 상태바/탐험 로그 렌더, 휴식, 마을 귀환,
보스소굴 진입, 층 진행(다음 층 이동, 유물/저주 제단 조우, 보스/최종보스 조우 판정).
export(전역): startGame, showScreen, isBattleActive, scheduleJobAdvancementCheck, renderStatus,
              currentLocation, renderExplore, addLog, onRest, onReturnTown, enterBossDen,
              showBossDenConfirm, proceedEnterBossDen, proceedBossDenAdvance, onAdvance,
              showFinalFloorConfirm, proceedAdvance
의존성: state.js, storage.js, relics.js, combat/battle-setup.js(startBattle 호출),
       data/jobs.js(needsSpecializationMigration, getJobLabel)
주의: renderStatus()가 전직(세분화) 후에도 상태바 왼쪽에 항상 기본 직업 이름("전사")만
     표시하던 버그가 있었다(hybrid만 확인하고 specialization은 확인하지 않았음) —
     data/jobs.js의 getJobLabel()로 교체해 고쳤다. combat/battle-end.js의 showEnding()도
     동일한 종류의 버그가 있어 같은 방식으로 이미 고쳐졌다.
*/

  // '나아가다' 버튼 연타 시 층이 중복 진행되는 것을 막기 위한 잠금.
  // onAdvance() 내부에서 depth 증가 등은 동기적으로 즉시 일어나지만, 이어지는 전투/제단
  // 진입은 setTimeout(350~500ms)으로 지연되어 그 사이 버튼이 계속 클릭 가능한 상태로 남는다.
  let exploreAdvanceLock = false;

  function startGame(isContinue){
    if(isContinue && window.__savedGame){
      const saved = window.__savedGame;
      player = saved.player; depth = saved.depth; town = saved.town;
      inBossDen = saved.inBossDen||false; bossDenFloor = saved.bossDenFloor||0;
      if(player.job2===undefined) player.job2 = null;
      if(player.specialization===undefined) player.specialization = null;
      if(player.jobChosenAt10===undefined) player.jobChosenAt10 = false;
      if(!player.equipment) player.equipment = {weapon:null, armor:null, accessory:null};
      if(!player.equipOwned) player.equipOwned = [];
      if(!player.relics) player.relics = [];
      if(!player.relicSlots) player.relicSlots = 2;
      if(!player.relicAltarsSeen) player.relicAltarsSeen = [];
      if(player.relicSkipsUsed===undefined) player.relicSkipsUsed = 0;
      if(player.relicSkipsMax===undefined) player.relicSkipsMax = 2;
      if(player.ledgerStack===undefined) player.ledgerStack = 0;
      if(!player.curseAltarsSeen) player.curseAltarsSeen = [];
      if(!player.relicAppliedDeltas) player.relicAppliedDeltas = {};
      if(player.difficulty===undefined) player.difficulty = 'easy';
      if(player.candleUsed===undefined) player.candleUsed = false;
      if(player.diceDelta===undefined) player.diceDelta = null;
      if(player.buffCounterTurns===undefined) player.buffCounterTurns = 0;
      if(player.buffCounterChance===undefined) player.buffCounterChance = 0;
      if(player.fateBoostChance===undefined) player.fateBoostChance = 0;
      if(player.fateBoostMult===undefined) player.fateBoostMult = 0;
      if(player.endingSeen===undefined) player.endingSeen = false;
      if(player.deathCount===undefined) player.deathCount = 0;
      // 노드맵 시스템(신규) — 예전 세이브에는 이 필드들이 없으므로 안전하게
      // 채워 넣는다. tierIndex는 기존에 저장된 depth로부터 역산한다(예:
      // depth=7이었다면 5층 보스를 이미 넘긴 뒤였을 테니 tierIndex=1로 복구,
      // 정확히 안 맞아도 다음 "나아가다"에서 새 지도를 뽑으므로 큰 문제 없음).
      if(player.tierIndex===undefined) player.tierIndex = Math.floor(Math.max(0,depth-1)/5);
      if(player.nodeMap===undefined) player.nodeMap = null;
      if(player.nodeRow===undefined) player.nodeRow = -1;
      if(player.nodeCurrentId===undefined) player.nodeCurrentId = null;
      if(player.nodeVisited===undefined) player.nodeVisited = [];
      // 오프닝 심리테스트(신규) — 이 기능이 생기기 전에 시작한 캐릭터는
      // 보너스가 아예 없는 게 맞다(모든 계산식이 undefined를 0으로 처리하므로
      // 굳이 채워 넣지 않아도 안전하지만, 명시적으로 빈 객체를 둬 헷갈리지
      // 않게 한다).
      if(player.originBonuses===undefined) player.originBonuses = {};
      if(player.originGrowthRemainder===undefined) player.originGrowthRemainder = {hp:0, mp:0, atk:0, spd:0};
      if(player.level>=10 && !player.jobChosenAt10) player.jobAdvancePending = true;
      if(needsSpecializationMigration(player)) player.jobAdvancePending = true; // 레거시 하이브리드 → 재전직 필요
      document.getElementById('statusbar').style.display='flex';
      showScreen('explore');
      renderStatus();
      renderExplore(['모험을 이어간다.']);
      return;
    }
    const nameInput = document.getElementById('name-input').value.trim();
    player = newPlayer(nameInput, selectedJobId, selectedDifficulty);
    depth = 0; town = true; enemy = null; battleOver = false; subMode = null;
    inBossDen = false; bossDenFloor = 0;
    battleFlags = {guardian:false, phoenix:false, firstStrikeUsed:false, execCount:0, execReady:false, gambleStacks:0, jackpotGauge:0, jackpotArmed:false, paladinAwoken:false, paladinUltUsed:false, hourglassTurn:0, witchClockUsedThisTurn:false, rig:null};
    // 오프닝 심리테스트(origin.js) — 새 게임에서만 1회 등장한다(이어하기는
    // 위쪽 분기에서 이미 처리되어 여길 안 지나감). 퀴즈가 끝나면
    // finishNewGameStart()가 호출되어 실제로 마을 화면이 열린다.
    showOriginQuiz();
  }

  // 오프닝 심리테스트(origin.js) 완료 후 실제로 마을 화면을 여는 마무리 처리.
  // 예전엔 startGame()의 새 게임 분기 맨 끝에 그대로 있던 코드를, 퀴즈를 먼저
  // 보여줘야 해서 별도 함수로 뺐다.
  function finishNewGameStart(){
    document.getElementById('statusbar').style.display='flex';
    showScreen('explore');
    renderStatus();
    renderExplore(['회랑 어귀에 첫 발을 내디뎠다.']);
    saveGame();
  }

  function showScreen(id){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-'+id).classList.add('active');
    if(id==='explore'){
      scheduleJobAdvancementCheck();
      Sound.setBgmMode('explore');
    } else if(id==='battle'){
      Sound.setBgmMode('battle');
    } else if(id==='title' || id==='gameover'){
      Sound.setBgmMode('explore');
    }
  }

  function isBattleActive(){
    const el = document.getElementById('screen-battle');
    return !!(el && el.classList.contains('active'));
  }

  // 레벨10 전직 안내를 안전하게 예약한다. 전투 중이면 절대 띄우지 않고,
  // 탐험 화면으로 돌아올 때마다 다시 확인해 결국 한 번은 반드시 뜨도록 한다.
  // 레거시 하이브리드 캐릭터(job2는 있지만 specialization이 없는 경우)는
  // jobChosenAt10이 이미 true이더라도 재전직 대상이므로 별도로 통과시킨다.
  function scheduleJobAdvancementCheck(){
    if(!player || !player.jobAdvancePending) return;
    if(player.jobChosenAt10 && !needsSpecializationMigration(player)) return;
    setTimeout(()=>{
      if(!player || !player.jobAdvancePending) return;
      if(player.jobChosenAt10 && !needsSpecializationMigration(player)) return;
      if(isBattleActive()) return; // 다음 탐험 화면 진입 시 다시 시도된다.
      if(document.getElementById('jobadv-overlay')) return;
      showJobAdvancement();
    }, 1600);
  }

  function renderStatus(){
    // 빈 그릇(mpZero) 저주: 레벨업/전직 등 어떤 경로로 최대MP가 늘어나든 항상 0으로 되돌린다.
    if(player && hasRelicFlag('mpZero')){
      player.maxmp = 0; player.mp = 0;
    }
    // 전직(세분화) 후 상태바에 항상 기본 직업 이름("전사")만 뜨던 버그를 고쳤다.
    // getJobLabel()(data/jobs.js)이 전직했으면 분기 이름을, 레거시 하이브리드면
    // 그 이름을, 둘 다 아니면 기본 직업 이름을 알아서 골라 반환한다.
    document.getElementById('sb-name').textContent = player.name;
    document.getElementById('sb-lvl').textContent = `Lv.${player.level} · ${getJobLabel(player)}`;
    document.getElementById('sb-hp-bar').style.width = Math.max(0,(player.hp/player.maxhp*100))+'%';
    document.getElementById('sb-hp-val').textContent = `${Math.max(0,player.hp)}/${player.maxhp}`;
    document.getElementById('sb-mp-bar').style.width = Math.max(0,(player.mp/player.maxmp*100))+'%';
    document.getElementById('sb-mp-val').textContent = `${Math.max(0,player.mp)}/${player.maxmp}`;
    document.getElementById('gold-display').textContent = '💰 '+player.gold;
  }

  function currentLocation(){
    return LOCATIONS.find(l=>depth<=l.max) || LOCATIONS[LOCATIONS.length-1];
  }

  function renderExplore(newLines){
    const loc = currentLocation();
    if(inBossDen){
      document.getElementById('ex-depth-tag').textContent = '보스소굴 '+bossDenFloor+'층';
      document.getElementById('ex-loc-name').textContent = '심연의 투기장';
      document.getElementById('ex-loc-desc').textContent = '오직 강자만이 다음 상대와 마주할 수 있는 곳. 돌아가지 않는 한, 쉼 없이 다음 보스가 나타난다.';
    } else {
      const depthLabel = (!town && hasRelicFlag('hideDepth')) ? '깊이 ???' : ('깊이 '+depth);
      document.getElementById('ex-depth-tag').textContent = town ? '마을' : depthLabel;
      document.getElementById('ex-loc-name').textContent = town ? '안식의 마을' : loc.name;
      document.getElementById('ex-loc-desc').textContent = town ? '따뜻한 화롯불과 상인들의 목소리가 들린다. 이곳에서는 안전하다.' : loc.desc;
    }
    document.getElementById('btn-advance').style.display = 'block';
    document.getElementById('btn-advance').textContent = inBossDen ? '⚔ 다음 상대와 맞서다' : (town ? '➡ 던전으로 출발' : '➡ 나아가다');
    document.getElementById('btn-town').style.display = town ? 'none' : 'block';
    const bossDenBtn = document.getElementById('btn-bossden');
    if(bossDenBtn) bossDenBtn.style.display = (!inBossDen && player && (player.level||1) >= 15) ? 'block' : 'none';
    // 노드맵 영역 갱신 — 마을/보스소굴이 아니고 진행 중인 지도가 있으면 이
    // 함수가 알아서 '나아가다'/'휴식'/'상점' 버튼을 감추고 지도를 보여준다.
    renderNodeMapArea();
    const logEl = document.getElementById('ex-log');
    if(newLines){
      newLines.forEach(l=>{
        const div = document.createElement('div');
        div.className = 'entry' + (l.cls?(' '+l.cls):'');
        div.textContent = l.text || l;
        logEl.appendChild(div);
      });
      while(logEl.children.length > 60){ logEl.removeChild(logEl.firstChild); }
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  function addLog(text, cls){
    const logEl = document.getElementById('ex-log');
    const div = document.createElement('div');
    div.className = 'entry'+(cls?(' '+cls):'');
    div.textContent = text;
    logEl.appendChild(div);
    while(logEl.children.length > 60){ logEl.removeChild(logEl.firstChild); }
    logEl.scrollTop = logEl.scrollHeight;
  }

  function onRest(){
    if(town){
      player.hp = player.maxhp; player.mp = player.maxmp;
      renderStatus();
      addLog('마을의 화로 곁에서 몸을 녹였다. 체력과 마력이 전부 회복되었다.', 'gold');
      saveGame();
    } else {
      const cost = Math.round(30 + depth*4);
      if(player.gold < cost){ addLog(`휴식을 취하기엔 금화가 부족하다. (${cost}G 필요)`, 'warn'); return; }
      player.gold -= cost;
      player.hp = player.maxhp; player.mp = player.maxmp;
      renderStatus();
      addLog(`${cost}G를 들여 마련한 화롯불 곁에서 완전히 몸을 추슬렀다. (HP/MP 완전 회복)`, 'gold');
      saveGame();
    }
  }

  function onReturnTown(){
    town = true;
    // 노드맵 시스템: 마을로 돌아가면 진행 중이던 지도는 버려진다(다음에 나갈 때
    // 새 지도가 생성됨). 다만 tierIndex(어느 보스를 잡아야 하는지)는 그대로
    // 유지되므로, depth 표시는 "마지막으로 클리어한 보스 층수"로 맞춘다
    // (예: 5층 보스를 잡은 뒤 마을에 왔다면 depth=5로 표시).
    depth = player.tierIndex*5;
    player.nodeMap = null; player.nodeRow = -1; player.nodeCurrentId = null; player.nodeVisited = [];
    inBossDen = false; bossDenFloor = 0;
    player.hp = player.maxhp; player.mp = player.maxmp;
    renderStatus();
    renderExplore(['마을로 돌아왔다. 상처가 아물고 기운이 되살아난다.']);
    saveGame();
  }

  function enterBossDen(){
    if(inBossDen) return;
    if((player.level||1) < 15){
      addLog('아직 보스소굴에 들어갈 준비가 되지 않았다. (레벨 15 필요)', 'warn');
      return;
    }
    showBossDenConfirm();
  }

  function showBossDenConfirm(){
    const fromDungeon = !town;
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'bossden-confirm-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    panel.innerHTML = `
      <h3 style="color:var(--rust-bright);">보스소굴</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:13px;line-height:1.7;margin-bottom:14px;">
        오직 강자만이 살아남는 곳. 발을 들이면 매 스테이지마다 강력한 보스와 연이어 맞서야 한다.<br>
        ${fromDungeon ? '<b style="color:var(--gold-bright);">지금 탐험 중인 깊이의 진행은 사라진다.</b><br>' : ''}
        <b style="color:var(--gold-bright);">보스소굴로 진입하시겠습니까?</b>
      </p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <button class="btn" id="bossden-confirm-cancel">돌아간다</button>
        <button class="btn btn-danger" id="bossden-confirm-go">진입한다</button>
      </div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    panel.querySelector('#bossden-confirm-cancel').addEventListener('click', ()=>overlay.remove());
    panel.querySelector('#bossden-confirm-go').addEventListener('click', ()=>{
      overlay.remove();
      proceedEnterBossDen();
    });
  }

  function proceedEnterBossDen(){
    const fromDungeon = !town;
    town = false; inBossDen = true; depth = 40; bossDenFloor = 0;
    renderExplore([fromDungeon
      ? '탐험을 중단하고 보스소굴로 향한다. 위압감이 온몸을 짓누른다. 이 안에서는 오직 강자만이 살아남는다.'
      : '보스소굴 깊은 곳에서 흘러나오는 위압감이 온몸을 짓누른다. 이 안에서는 오직 강자만이 살아남는다.']);
    saveGame();
  }

  function proceedBossDenAdvance(){
    bossDenFloor += 1;
    document.getElementById('ex-depth-tag').textContent = '보스소굴 '+bossDenFloor+'층';
    document.getElementById('ex-loc-name').textContent = '심연의 투기장';
    document.getElementById('ex-loc-desc').textContent = '오직 강자만이 다음 상대와 마주할 수 있는 곳. 돌아가지 않는 한, 쉼 없이 다음 보스가 나타난다.';
    saveGame();
    addLog('공기가 무겁게 가라앉는다… 다음 상대가 기다리고 있다.', 'warn');
    setTimeout(()=>startBattle(true), 400);
  }

  function onAdvance(){
    const advBtn = document.getElementById('btn-advance');
    if(exploreAdvanceLock || (advBtn && advBtn.disabled)) return; // 연타로 인한 중복 진행 방지
    exploreAdvanceLock = true;
    if(advBtn) advBtn.disabled = true;
    setTimeout(()=>{
      exploreAdvanceLock = false;
      if(advBtn) advBtn.disabled = false;
    }, 500);

    if(inBossDen){
      proceedBossDenAdvance();
      return;
    }
    if(town){
      town = false;
      // 노드맵 시스템: 마을을 나설 때 지도가 없으면(처음이거나, 방금 보스를
      // 잡고 돌아왔거나, 지난번에 마을로 도망쳐서 지도를 버렸거나) 새로
      // 생성한다. tierIndex는 그대로라 "어느 보스를 잡아야 하는지"는 안 바뀐다.
      if(!player.nodeMap){
        enterNodeMapTier();
      } else {
        renderExplore(['다시 어둠 속 회랑으로 발을 들였다.']);
      }
      saveGame();
      return;
    }
    // 마을도 보스소굴도 아닌데 이 버튼이 보인다는 건 지도가 없다는 뜻이다
    // (지도가 있으면 renderNodeMapArea()가 이 버튼을 숨기고 지도를 보여준다) —
    // 즉 방금 이 구간의 보스를 잡고 다음 구간으로 넘어가려는 상황.
    if(!player.nodeMap){
      enterNodeMapTier();
    }
  }

  function showFinalFloorConfirm(){
    const flawless = (player.deathCount||0) === 0;
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'final-confirm-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    panel.innerHTML = `
      <h3 style="color:var(--rust-bright);">회랑의 끝</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:13px;line-height:1.7;margin-bottom:14px;">
        문 너머에서 압도적인 기운이 느껴진다. 이곳을 지나면 되돌아올 수 없다.<br>
        ${flawless ? '<b style="color:var(--gold-bright);">단 한 번도 무릎 꿇지 않은 그대에게만, 문 너머의 기운이 어딘가 다르게 느껴진다.</b><br>' : ''}
        <b style="color:var(--gold-bright);">정말로 이 회랑의 끝으로 들어가겠는가?</b>
      </p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <button class="btn" id="final-confirm-cancel">돌아간다</button>
        <button class="btn btn-danger" id="final-confirm-go">들어간다</button>
      </div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    panel.querySelector('#final-confirm-cancel').addEventListener('click', ()=>overlay.remove());
    panel.querySelector('#final-confirm-go').addEventListener('click', ()=>{
      overlay.remove();
      // 노드맵 시스템 도입 후: depth는 이미 resolveNode()의 보스 분기에서
      // 50으로 확정되어 있으므로, 여기서는 곧장 최종보스 전투만 시작한다
      // (예전의 proceedAdvance() 재호출 — depth+=1 등 — 은 더 이상 맞지 않음).
      const isTrueFinal = (player.deathCount||0) === 0;
      addLog(isTrueFinal
        ? '한 번도 무릎 꿇지 않은 자에게만 열리는 문이, 조용히 그 모습을 드러낸다…'
        : '심장이 터질 듯 두근거린다… 이곳이 회랑의 끝이다.', 'warn');
      setTimeout(()=>startBattle(true, true, isTrueFinal), 400);
    });
  }

  // [레거시/보류] 노드맵 도입 전, "나아가다"를 누를 때마다 직접 depth를 올리고
  // 그 자리에서 보스/유물/저주/일반 조우를 확률로 굴리던 예전 로직. 지금은
  // onAdvance()가 더 이상 이 함수를 호출하지 않는다(대신 nodemap.js의
  // resolveNode()가 이 역할을 전부 대체함 — 보스는 노드맵의 보스 행, 유물/저주는
  // 노드 타입으로 흡수됨). 삭제하지 않고 남겨두는 이유: 외상 도박사(jester_debtor,
  // 현재 admin 전용 잠금 + 리뉴얼 보류 상태)의 "황금고블린 유예기간" 강제 발동
  // 로직이 이 함수 안에 있는데, 그 직업을 다시 다듬을 때 이 로직을 노드맵 쪽으로
  // 옮겨와야 하므로 참고용으로 보존한다.
  function proceedAdvance(){
    depth += 1;
    const loc = currentLocation();
    document.getElementById('ex-depth-tag').textContent = '깊이 '+depth;
    document.getElementById('ex-loc-name').textContent = loc.name;
    document.getElementById('ex-loc-desc').textContent = loc.desc;
    saveGame();

    // 외상 도박사(jester_debtor): 층을 이동할 때마다 남은 빚에 이자가 붙는다.
    // 만기 연장(jesterDebtFreeze)으로 얼려둔 층 수가 남아있으면 이번엔 건너뛰고
    // 카운트만 줄인다. 다른 직업이면 player.debt가 항상 0이라 아무 일도 없다.
    if(player.debt>0){
      if(player.debtFreezeFloors>0){
        player.debtFreezeFloors -= 1;
        addLog(`만기가 연장되어 있다. 이자가 붙지 않는다. (연장 ${player.debtFreezeFloors}층 남음)`, 'gold');
      } else {
        const interest = Math.max(1, Math.round(player.debt*DEBT_INTEREST_RATE));
        player.debt += interest;
        addLog(`빚에 이자 ${interest}G가 붙었다. (남은 빚: ${player.debt}G)`, 'warn');
      }
      renderStatus();
      saveGame();
    }

    const isFinalFloor = depth === 50 && !player.endingSeen;
    const isBossFloor = depth>0 && depth % 5 === 0;
    const isRelicFloor = RELIC_ALTAR_FLOORS.includes(depth) && !(player.relicAltarsSeen||[]).includes(depth);
    const isCurseFloor = CURSE_ALTAR_FLOORS.includes(depth) && !(player.curseAltarsSeen||[]).includes(depth);
    // 황금고블린: 대출 후 DEBT_GRACE_FLOORS 층 안에 못 갚았거나, 올인 대출로
    // 강제 예약(debtCollectorImminent)되어 있으면 이번 층에 무조건 마주친다.
    // 최종보스 층보다는 우선순위가 낮지만(그 순간만큼은 존중), 보스/유물/저주
    // 제단 층보다는 높다 — "언젠가 반드시 청산해야 한다"는 컨셉의 핵심이라
    // 미루는 게 불가능해야 하기 때문.
    const isDebtOverdue = player.debt>0 && (
      player.debtCollectorImminent ||
      (player.debtBorrowedAtDepth!=null && (depth - player.debtBorrowedAtDepth) >= DEBT_GRACE_FLOORS)
    );
    const roll = Math.random();

    if(isFinalFloor){
      const isTrueFinal = (player.deathCount||0) === 0;
      addLog(isTrueFinal
        ? '한 번도 무릎 꿇지 않은 자에게만 열리는 문이, 조용히 그 모습을 드러낸다…'
        : '심장이 터질 듯 두근거린다… 이곳이 회랑의 끝이다.', 'warn');
      setTimeout(()=>startBattle(true, true, isTrueFinal), 400);
      return;
    }
    if(isDebtOverdue){
      player.debtCollectorImminent = false;
      addLog('낯익은 발소리… 누군가 두꺼운 장부를 든 채 다가온다.', 'warn');
      setTimeout(()=>showDebtCollectorEvent(), 500);
      return;
    }
    if(isBossFloor){
      addLog('공기가 무겁게 가라앉는다… 강력한 기척이 느껴진다!', 'warn');
      setTimeout(()=>startBattle(true), 400);
      return;
    }
    if(isRelicFloor){
      addLog('낯선 제단이 어둠 속에서 은은한 빛을 낸다…', 'gold');
      player.relicAltarsSeen.push(depth);
      saveGame();
      setTimeout(()=>showRelicAltar(depth), 500);
      return;
    }
    if(isCurseFloor){
      addLog('피비린내가 감도는 제단이 어둠 속에 웅크리고 있다…', 'warn');
      player.curseAltarsSeen.push(depth);
      saveGame();
      setTimeout(()=>showCurseAltar(depth), 500);
      return;
    }
    if(roll < 0.68){
      addLog('그림자 속에서 무언가 튀어나왔다!', 'warn');
      setTimeout(()=>startBattle(false), 350);
      return;
    }
    const findRoll = Math.random();
    if(findRoll < 0.35){
      const g = 4 + Math.floor(Math.random()*10) + depth;
      player.gold += g;
      renderStatus();
      addLog(`바닥에서 금화 ${g}G를 주웠다.`, 'gold');
    } else if(findRoll < 0.55){
      player.inv.potion += 1;
      addLog('낡은 배낭 속에서 물약을 발견했다. (물약 +1)', 'gold');
    } else if(findRoll < 0.68){
      const foundId = findEquipmentForDepth();
      if(foundId){
        player.equipOwned.push(foundId);
        const item = EQUIPMENT[foundId];
        addLog(`먼지 쌓인 상자에서 [${item.name}]을(를) 발견했다! (${statsText(item.stats)})`, 'gold');
        saveGame();
      } else {
        const g = 4 + Math.floor(Math.random()*10) + depth;
        player.gold += g;
        renderStatus();
        addLog(`바닥에서 금화 ${g}G를 주웠다.`, 'gold');
      }
    } else {
      addLog('조용히 발걸음을 옮겼다. 아무 일도 일어나지 않았다.');
    }
    saveGame();
  }
