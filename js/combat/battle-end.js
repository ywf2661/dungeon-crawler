"use strict";
/*
전투 종료 판정 및 결과 처리 — 승리/패배/광폭화 재판정, 엔딩 화면,
경험치 지급, 레벨업/희귀드랍/에픽드랍 토스트.
export(전역): checkBattleEnd, showEnding, grantExp, applyLevelUpEffects, showLevelUpToast,
              showRareDropToast, showEpicDropToast
의존성: state.js, storage.js, explore.js(renderExplore/showScreen), combat/battle-setup.js(triggerEnragePhase),
        data/jobs.js(getSpecialization)
주의: applyLevelUpEffects()는 grantExp()의 레벨업 1회분 로직(스탯 증가+스킬 지급)을 뽑아낸
     것으로, combat/job-advancement.js의 admin 전용 "전직 즉시 15레벨" 디버그 로직도
     이 함수를 그대로 재사용한다. grantExp()의 레벨업 루프에서 warrior_purist(일격의
     구도자) 전용으로 maxmp 증가를
     건너뛰는 예외 처리가 추가되어 있다(해당 분기는 스킬을 전혀 쓰지 않아 마나가 항상
     0으로 유지되어야 함 — combat/job-advancement.js의 resolveJobAdvancement()에서
     전직 시점 마나도 함께 0으로 초기화한다).
*/

  function checkBattleEnd(){
    if(enemy.hp<=0){
      if(canEnrage(enemy)){
        triggerEnragePhase();
        return true;
      }
      // 황금고블린(외상 도박사): 일반 승리 처리(처치 골드/경험치/레벨업/드랍)를
      // 전부 건너뛰고, 빚 탕감이라는 이 전투만의 고유 보상을 준다. 빚을 완전히
      // 갚지 못했더라도 남은 빚의 70%를 즉시 탕감해준다(전액 탕감이 아닌 이유:
      // "담판으로 크게 깎았다"는 느낌을 주면서도, 완전히 공짜는 아니게 하기
      // 위함 — 남은 30%는 여전히 갚아야 할 몫으로 남는다).
      if(enemy.isDebtCollector){
        battleOver = true;
        setCommandsEnabled(false);
        revertDiceDelta();
        document.getElementById('bt-stage').classList.add('dying');
        const forgiven = Math.round((player.debt||0)*0.7);
        player.debt = Math.max(0, (player.debt||0) - forgiven);
        if(player.debt<=0) clearDebtorLoans();
        const bonusGold = 200 + depth*10;
        player.gold += bonusGold;
        renderStatus();
        setTimeout(()=>{
          setBattleMsg(`${enemy.name}이(가) 장부를 덮으며 물러난다!`, `빚 ${forgiven}G를 탕감받고, 골드 ${bonusGold}G를 챙겼다! (남은 빚: ${player.debt}G)`);
          saveGame();
        }, 500);
        setTimeout(()=>{
          showScreen('explore');
          renderExplore(['황금고블린과의 담판을 끝내고 다시 길을 나섰다.']);
        }, 1800);
        return true;
      }
      battleOver = true;
      setCommandsEnabled(false);
      revertDiceDelta();
      document.getElementById('bt-stage').classList.add('dying');
      let g = enemy.gold[0]+Math.floor(Math.random()*(enemy.gold[1]-enemy.gold[0]+1));
      const curseRewardMult = getCurseRewardMult();
      // 물주의 감각(mastery_goldsense, 황금 도박사): 승리 골드 +20%. 기존 계산식에
      // 항 하나만 추가하면 되므로 별도 함수 없이 여기서 직접 처리한다.
      const goldSenseBonus = (player.skills && player.skills.includes('mastery_goldsense')) ? 0.2 : 0;
      const goldBoost = getSpecialSum('goldBoost') + getRelicSum('goldPctMult') + curseRewardMult + goldSenseBonus;
      if(goldBoost>0) g = Math.round(g*(1+goldBoost));
      player.gold += g;
      const killHealPct = getRelicSum('killHealPct');
      if(killHealPct>0 && player.hp>0 && player.hp<player.maxhp){
        player.hp = Math.min(player.maxhp, player.hp + Math.max(1, Math.round(player.maxhp*killHealPct)));
      }
      if(hasRelicFlag('killAtkStack')){
        const stackAmt = Math.max(1, Math.round(getRelicSum('stackAtkPerKill')));
        player.atk += stackAmt;
        player.ledgerStack = (player.ledgerStack||0) + stackAmt;
      }
      const leveled = grantExp(enemy.exp);
      const isFinalKill = !!enemy.isFinal;
      if(leveled.includes(10) && !player.jobChosenAt10){
        player.jobAdvancePending = true;
      }
      let rareDropId = null;
      if(!isFinalKill){
        // 정예 처치 보상 재설계(사용자 요청): 예전엔 정예를 잡으면 유물 제단이
        // 확정으로 떴는데, 노드맵 도입 후 유물 제단이 구간당 1개 노드로 이미
        // 따로 있어서 두 개를 합치면 유물 선택이 너무 자주 뜨는 문제가 있었다.
        // 이제 유물은 "제단 노드를 통해서만" 얻고, 정예는 대신 확정으로 희귀
        // 장비를 준다 — 일반전투(낮은 확률) < 정예(확정 희귀템) < 보스(높은
        // 확률+에픽) < 유물/저주 제단(빌드 선택)으로 보상 사다리가 분리된다.
        // 정예 처치 보상 재설계(2차 — 사용자 피드백: "확정 희귀템도 좀 별로다").
        // 정예는 이제 일반 몬스터보다 살짝 높은 정도의 희귀템 확률만 갖고,
        // 대신 진짜 시그니처 보상은 아래에서 지급하는 "정예의 인장"이다(모아서
        // 마을 교환소에서 원하는 에픽 장비와 직접 교환 가능 — 확률에 기대지
        // 않고 확실하게 목표를 향해 나아갈 수 있는 자원).
        let rareChance = enemy.isBoss ? 0.12 : (enemy.isElite ? 0.15 : 0.035);
        rareChance *= (1 + getSpecialSum('rareDropBoost') + getRelicSum('rareDropPctBonus') + curseRewardMult);
        if(Math.random() < rareChance) rareDropId = findRareDropForDepth();
        if(rareDropId) player.equipOwned.push(rareDropId);
      }
      // 정예의 인장: 정예 처치마다 고정 1개 지급. 유물은 노드맵의 유물 제단
      // 노드에서만 얻고, 정예는 이 인장을 통해 "원하는 에픽을 직접 고르는"
      // 별개의 보상 경로를 갖는다(마을 교환소, shop.js의 openExchange() 참고).
      let eliteSealsGained = 0;
      if(enemy.isElite && !isFinalKill){
        eliteSealsGained = 1;
        player.eliteSeals = (player.eliteSeals||0) + eliteSealsGained;
      }
      // 에픽 드랍은 rareDropBoost의 영향을 받지 않는 별도 확률 판정이지만,
      // 네잎클로버처럼 rareDropBoost 특성을 가진 장비를 착용 중이면 별도로 크게 상승하고,
      // 저주를 3개 이상 짊어졌다면(피 값을 치른 대가로) 추가 보너스가 붙는다.
      // 최종 진보스는 엔딩 처리(isFinalKill) 이전에 먼저 보상을 지급한다
      let epicDropId = null;
      const hasCloverLuck = hasSpecial('rareDropBoost');
      let epicChance;
      if(enemy.isFinal) epicChance = 0.05;
      else if(enemy.isBoss) epicChance = hasCloverLuck ? 0.25 : 0.03;
      else epicChance = hasCloverLuck ? 0.03 : 0.005;
      epicChance += getCurseEpicBonus();
      if(Math.random() < epicChance) epicDropId = findEpicDropForDepth();
      if(epicDropId) player.equipOwned.push(epicDropId);
      Sound.victory();
      renderStatus();
      setTimeout(()=>{
        setBattleMsg(`${enemy.name}을(를) 쓰러뜨렸다!`, `EXP +${enemy.exp}  골드 +${g}`);
        setTimeout(()=>{
          if(isFinalKill){
            player.endingSeen = true;
            if(epicDropId){
              showEpicDropToast(EPIC_EQUIPMENT[epicDropId]);
              setTimeout(()=> showEnding(!!enemy.isTrueFinal), 1300);
            } else {
              showEnding(!!enemy.isTrueFinal);
            }
            return;
          }
          // 노드맵 시스템: 이번 승리가 구간의 보스(노드맵 마지막 행)였다면
          // 다음 구간으로 넘어가도록 타이어를 올리고 지도를 비운다("나아가다"를
          // 다시 누르면 새 지도가 생성된다). 일반 전투/정예 승리는 해당 없음.
          if(enemy.isBoss && player.nodeMap && player.nodeRow === player.nodeMap.length-1){
            player.tierIndex += 1;
            player.nodeMap = null; player.nodeRow = -1; player.nodeCurrentId = null; player.nodeVisited = [];
          }
          showScreen('explore');
          const lines = [{text:`${enemy.name}을(를) 물리쳤다. (EXP +${enemy.exp}, 골드 +${g})`, cls:'gold'}];
          if(rareDropId){
            const item = RARE_EQUIPMENT[rareDropId];
            lines.push({text:`✨ 희귀 아이템 [${item.name}]을(를) 손에 넣었다! (${statsText(item.stats)})`, cls:'gold'});
          }
          if(epicDropId){
            const eitem = EPIC_EQUIPMENT[epicDropId];
            lines.push({text:`✦✦ 에픽 아이템 [${eitem.name}]을(를) 손에 넣었다! (${statsText(eitem.stats)})`, cls:'gold'});
          }
          if(enemy.isElite){
            // 예전의 "확정 희귀템"/"유물 제단 자동 소환"은 모두 삭제되고,
            // 이제 정예의 시그니처 보상은 정예의 인장이다.
            lines.push({text:`🔱 정예를 쓰러뜨려 정예의 인장을 얻었다! (보유 ${player.eliteSeals}개) 마을 교환소에서 원하는 에픽 장비와 교환할 수 있다.`, cls:'gold'});
          }
          renderExplore(lines);
          if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
          if(rareDropId) setTimeout(()=>showRareDropToast(RARE_EQUIPMENT[rareDropId]), 150*leveled.length + 200);
          if(epicDropId) setTimeout(()=>showEpicDropToast(EPIC_EQUIPMENT[epicDropId]), 150*leveled.length + (rareDropId?500:200));
          saveGame();
        }, 1300);
      }, 500);
      return true;
    }
    if(player.hp<=0){
      // 황금고블린(외상 도박사) 상대로만 예외적으로 "패배해도 죽지 않는다."
      // HP 1로 목숨만 부지한 채 물러나되, 빚이 절반만큼 더 늘고 다음 황금고블린이
      // 훨씬 빨리(유예기간 10층 중 4층을 이미 써버린 것으로 취급) 다시 찾아온다 —
      // "담판에서 지면 상황이 더 나빠진다"는 사용자 요구를 일반 게임오버(런 종료/
      // 하드코어 초기화)와 완전히 분리해서 처리한다. 이 분기가 아래 일반
      // player.hp<=0 처리보다 먼저 와야 한다.
      if(enemy.isDebtCollector){
        battleOver = true;
        setCommandsEnabled(false);
        revertDiceDelta();
        player.hp = 1;
        const penalty = Math.max(1, Math.round((player.debt||0)*0.5));
        player.debt = (player.debt||0) + penalty;
        // 유예기간 10층 중 4층을 이미 써버린 것으로 취급 — 다음 방문이 더 빨리 온다.
        player.debtBorrowedAtDepth = depth - Math.max(0, DEBT_GRACE_FLOORS - 4);
        player.debtCollectorImminent = false;
        renderStatus();
        setBattleMsg('황금고블린이 비웃으며 물러난다…', `담판에서 패배했다! 빚이 ${penalty}G 늘었고, 다음 방문이 더 빨라진다. (남은 빚: ${player.debt}G)`);
        setTimeout(()=>{
          showScreen('explore');
          renderExplore(['가까스로 목숨만 부지한 채 황금고블린에게서 도망쳤다.']);
          saveGame();
        }, 1800);
        return true;
      }
      battleOver = true;
      setCommandsEnabled(false);
      revertDiceDelta();
      setBattleMsg(`${player.name}은(는) 쓰러지고 말았다…`, '');
      Sound.gameOver();
      player.deathCount = (player.deathCount||0) + 1;
      setTimeout(()=>{
        showScreen('gameover');
        if(player.difficulty==='hardcore'){
          document.getElementById('go-summary').textContent =
            `깊이 ${depth}까지 도달했으나, 미궁의 알수없는 힘에 의해 모든 것이 원래대로 되돌아간다. `
            + `레벨 1, 1층부터 다시 시작한다. 그러나 손에 넣은 유물만은 그대로 남는다.`;
          const oldRelics = (player.relics||[]).slice();
          const oldRelicSlots = player.relicSlots;
          const oldAltarsSeen = (player.relicAltarsSeen||[]).slice();
          const oldCurseSeen = (player.curseAltarsSeen||[]).slice();
          const oldEquipOwned = (player.equipOwned||[]).slice();
          const oldDeathCount = player.deathCount;
          const oldSkipsUsed = player.relicSkipsUsed;
          const oldCandleUsed = player.candleUsed;
          const name = player.name, jobId = player.job, diff = player.difficulty;

          player = newPlayer(name, jobId, diff);
          player.relicSlots = oldRelicSlots;
          player.relicAltarsSeen = oldAltarsSeen;
          player.curseAltarsSeen = oldCurseSeen;
          player.equipOwned = oldEquipOwned;
          player.deathCount = oldDeathCount;
          player.relicSkipsUsed = oldSkipsUsed;
          player.candleUsed = oldCandleUsed;
          oldRelics.forEach(id=> applyRelicEffect(id));
          player.relics = oldRelics.slice();
        } else {
          document.getElementById('go-summary').textContent =
            `깊이 ${depth}까지 도달했다. 레벨 ${player.level}, 소지금 ${player.gold}G. 마을 사람들이 그대를 구해내어 마을로 옮겼다.`;
          player.gold = Math.floor(player.gold*0.5);
          player.hp = player.maxhp; player.mp = player.maxmp;
        }
        // 노드맵 시스템: 사망 후 마을 귀환도 onReturnTown()과 동일하게 지도를
        // 지운다(사용자 피드백 — "죽은 노드에서 다시 시작하는 게 이상하다").
        // tierIndex(어느 보스를 잡아야 하는지)는 그대로 유지 — 다음에 나갈 때
        // 같은 구간의 "새" 지도가 생성된다.
        depth = player.tierIndex*5; town = true; inBossDen = false; bossDenFloor = 0;
        player.nodeMap = null; player.nodeRow = -1; player.nodeCurrentId = null; player.nodeVisited = [];
        saveGame();
      }, 900);
      return true;
    }
    return false;
  }

  function showEnding(isTrueEnding){
    showScreen('ending');
    // 기록(record) 저장 시(bootstrap.js) 무결 클리어 여부 판정에 쓰인다.
    player.trueEndingSeen = !!isTrueEnding;
    // 전직(세분화) 후에도 항상 기본 직업 이름("전사")으로만 표시되던 버그를
    // getJobLabel()(data/jobs.js)로 교체해 고쳤다 — 전직했으면 분기 이름을 보여준다.
    const jobLabel = getJobLabel(player);
    const titleEl = document.getElementById('ending-title');
    if(isTrueEnding){
      titleEl.textContent = '회랑, 마침내 안식에 들다';
      document.getElementById('ending-summary').textContent =
        `회랑의 시조가 무너져 내리는 순간, 돌벽 틈새로 스며들던 서늘한 기운이 거짓말처럼 걷힌다. `
        + `오랫동안 이 곳을 넘지 못한 채 쓰러져간 이름 없는 용사들의 원혼이, 하나둘 빛으로 떠올라 ${player.name}의 곁을 스쳐 지나간다. `
        + `"고맙다." 누군가의 목소리가, 어쩌면 수백의 목소리가 겹쳐 들려온다. "너의 승리로, 우리는 비로소 이곳을 떠날 수 있게 되었다." `
        + `돌기둥이 하나씩 허물어지고, 회랑을 지탱하던 저주의 뿌리가 빛무리와 함께 흩어진다. `
        + `${player.name}(${jobLabel})은(는) 무너져 내리는 회랑을 뒤로하고, 마침내 지상으로 향하는 계단을 오른다. `
        + `레벨 ${player.level}, 소지금 ${player.gold}G — 그리고 그 무엇보다 값진, 단 한 번도 무릎 꿇지 않았다는 증명을 품고서. `
        + `회랑의 문은 이제 열리지 않는다. 지킬 것도, 가둘 것도 남지 않았기 때문이다.`;
    } else {
      titleEl.textContent = '회랑의 새로운 파수꾼';
      const bossJob = (enemy && enemy.finalJobId && JOBS.find(j=>j.id===enemy.finalJobId)) || null;
      const bossJobName = bossJob ? bossJob.name : '용사';
      document.getElementById('ending-summary').textContent =
        `${player.name}은(는) 회랑의 가장 깊은 곳에서, ${bossJobName}의 모습을 한 무언가를 마침내 쓰러뜨렸다. `
        + `그러나 승리의 환희도 잠시, 발밑에서 차오르는 서늘한 기운이 온몸을 휘감는다. `
        + `회랑은 정복자를 놓아주지 않는다 — 애초에 이곳이 원한 것은 승자가 아니라, 새로운 파수꾼이었을 뿐이다. `
        + `의식이 흐려지는 사이, ${player.name}(${jobLabel})의 형상이 서서히 어둠 속으로 녹아든다. `
        + `이제 이 회랑의 가장 깊은 곳을 지키는 것은, 한때 용사였던 무언가다. `
        + `레벨 ${player.level}, 소지금 ${player.gold}G. 탑의 문은 다시, 조용히 닫혔다.`;
    }
    saveGame();
  }

  function grantExp(amount){
    player.exp += amount;
    const levelsGained = [];
    while(player.exp >= player.expNext){
      player.exp -= player.expNext;
      applyLevelUpEffects();
      levelsGained.push(player.level);
    }
    return levelsGained;
  }

  // 레벨 1회 상승분의 스탯 증가/스킬 지급을 처리한다(경험치 소모는 여기서 하지
  // 않는다 — grantExp()가 exp/expNext를 먼저 처리한 뒤 이 함수를 호출한다). 이렇게
  // 분리해둔 이유는 combat/job-advancement.js의 admin 전용 "전직 즉시 15레벨"
  // 디버그 로직도 정확히 같은 레벨업 효과(스탯 증가 + 2차 전직 스킬 지급 포함)를
  // 그대로 재사용해야 하기 때문 — 로직을 중복 작성하면 나중에 둘 중 하나만 고치는
  // 실수가 생기기 쉽다.
  function applyLevelUpEffects(){
    const job = getJob(player);
    const hybrid = getHybrid(player);
    const specialization = getSpecialization(player);
    player.level += 1;
    // 20레벨 이후부터는(쉬움 제외) 레벨업에 필요한 경험치 성장률이 더 가팔라진다.
    // 레벨업 노가다만으로 진보스/최종보스를 손쉽게 찍어누르는 것을 막기 위함이다.
    const growthRate = (player.difficulty!=='easy' && player.level>=20) ? 1.36 : 1.28;
    player.expNext = Math.round(player.expNext*growthRate + 6);
    player.maxhp += 9;
    // 일격의 구도자(warrior_purist)는 스킬을 전혀 쓰지 않아 마나가 항상 0으로
    // 유지되어야 한다(combat/job-advancement.js에서 전직 시점에도 0으로 초기화).
    // 레벨업 때마다 관례적으로 붙는 maxmp 증가분만 이 분기에 한해 건너뛴다.
    if(!(player.specialization === 'warrior_purist')){
      player.maxmp += 4;
    }
    player.atk += 2; player.def += 1; player.mag += 2; player.spd += 1;
    // 저주술사(mastery_curseweaver)는 레벨업 시 무회복 저주도 저주 개수만큼의
    // 확률로 뚫을 수 있다(레벨업이 한 번에 여러 번 처리될 수 있어, 매번 배너가
    // 뜨면 스팸이 될 수 있으므로 여기서는 안내 문구 없이 조용히 판정만 한다).
    // 외상 도박사(거액 대출)의 회복 봉인도 같은 자리에서 함께 확인한다.
    if(isCurseSealActive('noPostBattleHeal') || isDebtHealSealActive()){
      player.hp = Math.min(player.hp, player.maxhp);
      player.mp = Math.min(player.mp, player.maxmp);
    } else {
      player.hp = player.maxhp; player.mp = player.maxmp;
    }
    const unlockKey = job.skillLevels[player.level];
    if(unlockKey && !player.skills.includes(unlockKey)) player.skills.push(unlockKey);
    const hybridKey = hybrid && hybrid.skills[player.level];
    if(hybridKey && !player.skills.includes(hybridKey)) player.skills.push(hybridKey);
    // 2차 전직 세분화(JOB_SPECIALIZATIONS)의 레벨별 추가 스킬(예: 혈맹의 검투사
    // 12/15). specialization.skillLevels가 없는 분기는 이 줄이 그냥 undefined라
    // 아무 영향이 없다(아직 skillLevels를 채우지 않은 다른 분기들도 안전).
    const specKey = specialization && specialization.skillLevels && specialization.skillLevels[player.level];
    if(specKey && !player.skills.includes(specKey)) player.skills.push(specKey);
    // 회랑의 기사(paladin_knight): 레벨12/15에 도달하면 칼리버 X 자체가 다음
    // 단계로 자동 교체된다(플레이어가 직접 장착하는 게 아님 — equipItem()은 이
    // 무기를 교체 못 하게 막고 있으므로 data/equipment.js의 reforgeCaliberX()를
    // 직접 호출해 우회한다). 아이템 설명이 이 시점에 성검→불길함→저주받은 검으로
    // 바뀌면서 서사가 진행된다.
    if(player.specialization==='paladin_knight' && typeof reforgeCaliberX==='function'){
      if(player.level===12) reforgeCaliberX('caliberx_1', 'caliberx_2');
      else if(player.level===15) reforgeCaliberX('caliberx_2', 'caliberx_3');
    }
    return player.level;
  }

  function showLevelUpToast(lv){
    const job = getJob(player);
    const hybrid = getHybrid(player);
    const specialization = getSpecialization(player);
    const t = document.createElement('div');
    t.className='toast';
    const names = [];
    const unlockKey = job.skillLevels[lv];
    if(unlockKey) names.push(SKILLDB[unlockKey].name);
    const hybridKey = hybrid && hybrid.skills[lv];
    if(hybridKey) names.push(SKILLDB[hybridKey].name);
    // 2차 전직 세분화(JOB_SPECIALIZATIONS)의 레벨별 추가 스킬(예: 혈맹의 검투사
    // 12/15, 일격의 구도자 12/15)도 습득 알림에 포함한다. grantExp()는 이 스킬을
    // 이미 정상적으로 지급하고 있었지만, 이 토스트 함수가 specialization.skillLevels를
    // 확인하지 않아 알림만 안 뜨던 버그였다.
    const specKey = specialization && specialization.skillLevels && specialization.skillLevels[lv];
    if(specKey) names.push(SKILLDB[specKey].name);
    Sound.levelUp();
    t.innerHTML = `<h3>레벨 업! Lv.${lv}</h3><p>최대 HP/MP와 능력치가 상승했다.</p>${names.length?`<p>새로운 스킬 습득: <b>${names.join(', ')}</b></p>`:''}`;
    document.getElementById('app').appendChild(t);
    setTimeout(()=>t.remove(), 2200);
  }

  function showRareDropToast(item){
    const t = document.createElement('div');
    t.className='toast';
    t.style.borderColor = 'var(--violet)';
    Sound.coin();
    t.innerHTML = `<h3 style="color:#c9a8ff;">✨ 희귀 아이템 발견!</h3><p><b>${item.name}</b></p><p>${statsText(item.stats)}</p><p style="opacity:.75;">${item.desc}</p>`;
    document.getElementById('app').appendChild(t);
    setTimeout(()=>t.remove(), 2800);
  }

  function showEpicDropToast(item){
    const t = document.createElement('div');
    t.className='toast toast-epic';
    const setInfo = EPIC_SETS[item.setId];
    const owned = player.equipOwned.filter(id=>EPIC_EQUIPMENT[id] && EPIC_EQUIPMENT[id].setId===item.setId);
    const setItems = Object.keys(EPIC_EQUIPMENT).filter(k=>EPIC_EQUIPMENT[k].setId===item.setId);
    const bars = setItems.map(k=> owned.includes(k) ? '■' : '□').join(' ');
    Sound.levelUp();
    t.innerHTML = `<h3 style="color:var(--epic-bright);">✦✦ EPIC DROP ✦✦</h3>
      <p style="color:var(--epic-bright);"><b>「${setInfo.name}」</b></p>
      <p><b>[${SLOT_LABELS[item.slot]}] ${item.name}</b></p>
      <p>${statsText(item.stats)}</p>
      <p style="opacity:.75;">${item.desc}</p>
      <p style="margin-top:8px; font-size:13px; letter-spacing:.15em;">세트 진행도 ${bars} (${owned.length}/3)</p>`;
    document.getElementById('app').appendChild(t);
    setTimeout(()=>t.remove(), 3400);
  }
