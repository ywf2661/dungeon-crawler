"use strict";
/*
도박사 유물 세트 "딜러의 판"(소매 속 에이스 + 딜러의 장갑 + 벼랑 끝의 촛불) — 보스전을 한 판 승부로.
세트를 완성하면 보스전(층별보스·시간의 파수꾼·최종보스) 시작 때 명령 버튼 위에 "한 판으로 끝낸다"가 뜨고, 첫 행동을 하면
사라진다(battle-fx.js setCommandsEnabled). 걸면 미니게임 결과로 승패가 난다 — 이기면 그 자리에서 처치(보상·엔딩은 평소와
같다, checkBattleEnd), 지면 그대로 쓰러진다. 층별보스·파수꾼은 도박장 게임 4종 중 무작위(보스전 모드), 최종보스는
"시간의 스물하나". 건 순간 player.bossGambleUsed에 칸 id를 저장해 새로고침으로 다시 걸지 못하게 한다(nodemap.js가 초기화).
설계: docs/superpowers/specs/2026-10-07-jester-boss-gamble-design.md
export(전역): showBossGambleOffer, hideBossGambleOffer, startBossGamble, resolveBossGamble, showFinal21, maybeShowJesterSetScene
의존성: jester-den-games.js, jester-den.js(denButtons/DEN_*_STYLE/showRatRace/showThiefGame), events.js(eventOverlay/
       showJesterTableEvent/showJesterShellEvent), jester-table.js(jesterTableDraw/jesterTableCardLabel),
       combat/battle-setup.js(getEnrageSteps), combat/battle-end.js(checkBattleEnd), combat/battle-fx.js, ui/dialogue.js
*/

  function showBossGambleOffer(){
    const row = document.getElementById('boss-gamble-row');
    if(row) row.style.display = (enemy && !battleOver && bossGambleEligible(player, enemy)) ? 'block' : 'none';
  }
  function hideBossGambleOffer(){
    const row = document.getElementById('boss-gamble-row');
    if(row) row.style.display = 'none';
  }
  function confirmBossGamble(){
    if(battleOver || !bossGambleEligible(player, enemy)) return;
    const {overlay, panel} = eventOverlay('딜러의 판',
      `<p style="${DEN_INTRO_STYLE}">${enemy.name} 앞으로, 손만 남은 딜러가 탁자를 편다.<br>이기면 그 자리에서 끝난다. 지면 — 그대로 쓰러진다.</p>`,
      `<div id="bg-btns" style="display:flex; flex-direction:column; gap:8px;"></div>`);
    denButtons(panel.querySelector('#bg-btns'), [
      {label:'🎲 건다', on:()=>{ overlay.remove(); startBossGamble(); }},
      {label:'그만둔다 (싸운다)', on:()=> overlay.remove()},
    ]);
  }
  const bossGambleBtn = document.getElementById('cmd-boss-gamble');
  if(bossGambleBtn) bossGambleBtn.addEventListener('click', confirmBossGamble);

  function startBossGamble(){
    setCommandsEnabled(false); // 버튼 행도 같이 숨는다
    // 건 순간 저장 — 지고 새로고침해 다시 거는 걸 막는다(이 칸에서는 다시 제안하지 않는다).
    player.bossGambleUsed = player.nodeCurrentId || 'boss';
    saveGame();
    const game = bossGambleGame(enemy);
    const opts = {boss:true, onResult: resolveBossGamble};
    if(game==='final21') showFinal21(resolveBossGamble);
    else if(game==='table') showJesterTableEvent(opts);
    else if(game==='shell') showJesterShellEvent(opts);
    else if(game==='rats') showRatRace(opts);
    else showThiefGame(opts);
  }
  // 이기면 기존 처치 경로(최종보스 광폭화 단계는 건너뛴다), 지면 HP 0 → 기존 사망 경로. 생존 장치는 거치지 않는다.
  function resolveBossGamble(won){
    if(battleOver) return;
    playBanner(won ? '판을 이겼다!' : '판을 잃었다…', won ? '' : 'enrage');
    setBattleMsg(won ? '딜러의 손이 판을 덮는다.' : '딜러의 손가락이, 그대를 가리킨다.', won ? `${enemy.name}이(가) 무너져 내린다.` : '');
    setTimeout(()=>{
      if(battleOver) return;
      if(won){
        enemy.phase = getEnrageSteps(enemy).length;
        enemy.usedUndying = true;
        enemy.hp = 0; enemy._prevHp = 0;
        document.getElementById('bt-ehp-bar').style.width = '0%';
      } else {
        player.hp = 0;
        renderStatus();
      }
      checkBattleEnd();
    }, 900);
  }

  // 최종보스 "시간의 스물하나": 보스가 딜러(17 이상까지 받음), 동점은 다시 나눈다. 21을 넘으면 한 번,
  // 시간을 되감아 방금 받은 카드를 무를 수 있다(되감기는 한 판 전체에 1회).
  const FINAL21_INTRO = {
    progenitor: '낡은 왕관 아래의 시선이, 딜러가 내민 카드에 머문다. "...끝까지 운에 맡기겠다는 건가."',
    timewitch: '시간의 마녀가 카드 한 장을 뒤집어 보고는 희미하게 웃는다. "되감는 건 내가 먼저였지. 해 보아라."',
  };
  function f21CardHtml(n, up){
    return `<div class="jt-card${up ? ' face-up' : ''}"><div class="jt-back"></div><div class="jt-front">${jesterTableCardLabel(n)}</div></div>`;
  }
  function showFinal21(onResult){
    const intro = FINAL21_INTRO[enemy.type] || `${enemy.name}이(가) 딜러의 손에서 카드를 받아 든다.`;
    const {overlay, panel} = eventOverlay('시간의 스물하나',
      `<p style="${DEN_INTRO_STYLE}">${intro}</p>
      <p class="jt-hint">카드 숫자를 더해 21에 더 가까운 쪽이 이긴다. 21을 넘으면 그 자리에서 진다.<br>
        A는 11 또는 1(넘을 땐 1), J·Q·K는 10. ${enemy.name}은(는) 17이 될 때까지 받는다.<br>
        21을 넘었을 때 한 번, 시간을 되감아 방금 받은 카드를 무를 수 있다.</p>
      <div class="th-row" id="f21-boss"></div><p class="jt-hint" id="f21-boss-sum"></p>
      <div class="th-row" id="f21-me"></div><p class="jt-hint" id="f21-me-sum"></p>
      <p id="f21-info" style="${DEN_INFO_STYLE}"></p>`,
      `<div id="f21-btns" style="display:flex; flex-direction:column; gap:8px;"></div>`);
    const bossEl = panel.querySelector('#f21-boss'), meEl = panel.querySelector('#f21-me');
    const bossSum = panel.querySelector('#f21-boss-sum'), meSum = panel.querySelector('#f21-me-sum');
    const info = panel.querySelector('#f21-info'), btns = panel.querySelector('#f21-btns');
    let me = [], boss = [], hidden = true, rewindLeft = 1;
    const later = (fn, ms)=> setTimeout(()=>{ if(overlay.isConnected) fn(); }, ms);
    const draw = ()=>{
      bossEl.innerHTML = boss.map((n,i)=> f21CardHtml(n, !(hidden && i===1))).join('');
      meEl.innerHTML = me.map(n=> f21CardHtml(n, true)).join('');
      bossSum.textContent = `${enemy.name} — ${hidden ? '?' : bjTotal(boss)}`;
      meSum.textContent = `나 — ${bjTotal(me)}`;
    };
    const finish = res=>{
      hidden = false; draw();
      info.textContent = bjResultText(me, boss, enemy.name);
      if(res==='push'){
        denButtons(btns, [{label:'다시 받는다', on:deal}]);
        return;
      }
      const won = res==='win';
      denButtons(btns, [{label: won ? '판을 거둔다' : '일어선다', on:()=>{ overlay.remove(); onResult(won); }}]);
    };
    const myTurn = ()=>{
      const t = bjTotal(me);
      if(t > 21){
        const last = jesterTableCardLabel(me[me.length-1]);
        info.textContent = rewindLeft > 0 ? `${t} — 21을 넘었다! 되감으면 방금 받은 ${last}을(를) 무를 수 있다.` : `${t} — 21을 넘었다.`;
        const opts = [];
        if(rewindLeft > 0) opts.push({label:'⏳ 시간을 되감는다 (1회)', on:()=>{
          rewindLeft--; me.pop(); draw();
          info.textContent = '모래가 거꾸로 흐른다. 방금 받은 카드는, 받지 않은 것이 되었다.';
          later(myTurn, 700);
        }});
        opts.push({label: rewindLeft > 0 ? '되감지 않는다 (진다)' : '일어선다', on:()=> finish('lose')});
        denButtons(btns, opts);
        return;
      }
      info.textContent = t===21 ? '21 — 더 받을 필요 없다.' : `${t} — 21까지 ${21-t}. 한 장 더 받을까?`;
      denButtons(btns, [
        {label:'한 장 더', on:()=>{ me.push(jesterTableDraw()); draw(); later(myTurn, 350); }},
        {label:'멈춘다', on:stand},
      ]);
    };
    const stand = ()=>{
      hidden = false; draw();
      info.textContent = `${enemy.name}이(가) 카드를 받는다…`;
      const step = ()=>{
        if(bjDealerHits(boss)){ boss.push(jesterTableDraw()); draw(); later(step, 600); return; }
        later(()=> finish(bjOutcome(me, boss)), 500);
      };
      later(step, 600);
    };
    function deal(){
      me = [jesterTableDraw(), jesterTableDraw()];
      boss = [jesterTableDraw(), jesterTableDraw()];
      hidden = true; draw();
      later(myTurn, 500);
    }
    deal();
  }

  // 세 번째 유물을 얻는 순간 1회(relics.js finalizeRelicPick). 딜러의 정체는 방울로만 암시한다.
  function maybeShowJesterSetScene(){
    if(!jesterSetComplete(player) || player.jesterSetSeen) return;
    player.jesterSetSeen = true;
    saveGame();
    showDialogueSequence([
      '세 가지가 손 안에서 맞물린다 — 소매 속의 에이스, 빈 장갑, 꺼지지 않는 몽당초.',
      '어디선가 작고 낡은 방울 소리가 난다. 광대 모자 끝에나 달려 있을 법한 방울이다.',
      '손만 남은 딜러가, 처음으로 고개 숙여 인사하는 시늉을 한다. 이제 판은 그대의 것이다.',
      {text:'이제 보스전을 시작할 때 "딜러의 판"으로 한 번에 끝낼 수 있다. 지면, 그대로 쓰러진다.', title:'🎲 딜러의 판'},
    ], {title:'🎲 세 개의 소지품'});
  }
