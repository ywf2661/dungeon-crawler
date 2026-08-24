"use strict";
/*
전투 종료 판정 및 결과 처리 — 승리/패배/광폭화 재판정, 엔딩 화면,
경험치 지급, 레벨업/희귀드랍/에픽드랍 토스트.
export(전역): checkBattleEnd, showEnding, grantExp, showLevelUpToast, showRareDropToast, showEpicDropToast
의존성: state.js, storage.js, explore.js(renderExplore/showScreen), combat/battle-setup.js(triggerEnragePhase),
        data/jobs.js(getSpecialization)
주의: grantExp()의 레벨업 루프에서 warrior_purist(일격의 구도자) 전용으로 maxmp 증가를
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
      battleOver = true;
      setCommandsEnabled(false);
      revertDiceDelta();
      document.getElementById('bt-stage').classList.add('dying');
      let g = enemy.gold[0]+Math.floor(Math.random()*(enemy.gold[1]-enemy.gold[0]+1));
      const curseRewardMult = getCurseRewardMult();
      const goldBoost = getSpecialSum('goldBoost') + getRelicSum('goldPctMult') + curseRewardMult;
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
        let rareChance = enemy.isBoss ? 0.12 : 0.035;
        rareChance *= (1 + getSpecialSum('rareDropBoost') + getRelicSum('rareDropPctBonus') + curseRewardMult);
        if(Math.random() < rareChance) rareDropId = findRareDropForDepth();
        if(rareDropId) player.equipOwned.push(rareDropId);
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
            lines.push({text:`⚔ 정예를 쓰러뜨린 대가로, 유물의 힘이 그대를 부른다…`, cls:'gold'});
          }
          renderExplore(lines);
          if(leveled.length) leveled.forEach(lv=> setTimeout(()=>showLevelUpToast(lv), 150));
          if(rareDropId) setTimeout(()=>showRareDropToast(RARE_EQUIPMENT[rareDropId]), 150*leveled.length + 200);
          if(epicDropId) setTimeout(()=>showEpicDropToast(EPIC_EQUIPMENT[epicDropId]), 150*leveled.length + (rareDropId?500:200));
          if(enemy.isElite) setTimeout(()=>showRelicAltar(), 150*leveled.length + (rareDropId?500:200) + (epicDropId?500:200) + 500);
          saveGame();
        }, 1300);
      }, 500);
      return true;
    }
    if(player.hp<=0){
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
        depth = 0; town = true; inBossDen = false; bossDenFloor = 0;
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
    const job = getJob(player);
    const hybrid = getHybrid(player);
    const jobLabel = hybrid ? `${hybrid.icon} ${hybrid.name}` : `${job.icon} ${job.name}`;
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
    const job = getJob(player);
    const hybrid = getHybrid(player);
    const specialization = getSpecialization(player);
    player.exp += amount;
    const levelsGained = [];
    while(player.exp >= player.expNext){
      player.exp -= player.expNext;
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
      if(hasRelicFlag('noPostBattleHeal')){
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
      levelsGained.push(player.level);
    }
    return levelsGained;
  }

  function showLevelUpToast(lv){
    const job = getJob(player);
    const hybrid = getHybrid(player);
    const t = document.createElement('div');
    t.className='toast';
    const names = [];
    const unlockKey = job.skillLevels[lv];
    if(unlockKey) names.push(SKILLDB[unlockKey].name);
    const hybridKey = hybrid && hybrid.skills[lv];
    if(hybridKey) names.push(SKILLDB[hybridKey].name);
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
