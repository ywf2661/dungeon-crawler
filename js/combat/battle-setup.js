"use strict";
/*
전투 시작 세팅 — 최종보스/진 최종보스 데이터, 광폭화(엔레이지) 페이즈 시스템,
난이도별 몬스터 스탯 보정, 적 선택(pickEnemy), 전투 시작(startBattle).
export(전역): FINAL_BOSS_BY_JOB, TRUE_FINAL_BOSS, ENRAGE_STEPS_FINAL/TRUE, pickFinalBossJob,
              canEnrage, triggerEnragePhase, getDifficultyMonsterMult, scaleEnemyForDifficulty,
              pickEnemy, GOLDEN_GOBLIN, pickDebtCollector, startBattle
의존성: state.js, data/monsters.js, relics.js(hasRelicFlag, rollDiceEffectForBattle, DICE_EFFECT_LABELS,
       DEBTOR_LOANS 등), Sound(sound.js), showToast(ui/difficulty.js)
주의: startBattle()에 4번째 인자 isDebtCollector가 추가되었다 — 외상 도박사(jester_debtor)의
     빚을 오래 방치했을 때 강제로 마주치는 "황금고블린" 이벤트 전투를 최종보스와 동일한
     패턴(일반 몬스터 풀을 쓰지 않고 직접 구성)으로 시작시킨다. 실제 승리/패배 시의 특수
     보상·페널티 처리는 combat/battle-end.js의 checkBattleEnd()에서 enemy.isDebtCollector를
     확인해 처리한다(정상적인 게임오버로 이어지지 않고 살아남는 것이 핵심 차이).
*/

  /* ============ 전투 ============ */
  // 회랑의 최종보스는 고정된 몬스터가 아니라, 플레이어가 고를 수 있는 6개 직업 중
  // 하나의 모습을 한 "타락한 용사"로 매번 랜덤하게 등장한다.
  const FINAL_BOSS_BY_JOB = {
    warrior:  {name:'잠식된 전사 용사',   type:'herowarrior',  hp:320, atk:32, def:14, spd:7,  exp:600, gold:[350,450], skills:['heroWarriorSmite']},
    mage:     {name:'잠식된 마법사 용사', type:'heromage',     hp:280, atk:38, def:9,  spd:8,  exp:600, gold:[350,450], skills:['heroMageBurst']},
    rogue:    {name:'잠식된 도적 용사',   type:'herorogue',    hp:290, atk:35, def:10, spd:13, exp:600, gold:[350,450], skills:['heroRogueSlash']},
    paladin:  {name:'잠식된 성기사 용사', type:'heropaladin',  hp:340, atk:29, def:16, spd:6,  exp:600, gold:[350,450], skills:['heroPaladinSmite','heal']},
    mechanic: {name:'잠식된 메카닉 용사', type:'heromechanic', hp:310, atk:32, def:12, spd:9,  exp:600, gold:[350,450], skills:['heroMechanicBlast']},
    jester:   {name:'잠식된 도박사 용사',   type:'herojester',   hp:285, atk:35, def:10, spd:11, exp:600, gold:[350,450], skills:['heroJesterGamble']},
  };
  // 단 한 번도 쓰러지지 않고(deathCount===0) 50층에 도달했을 때만 등장하는 진짜 최종보스.
  // 일반 최종보스(잠식된 OO 용사)보다, 그리고 여느 보스들보다도 훨씬 강하다.
  const TRUE_FINAL_BOSS = {
    name:'회랑의 시조', type:'progenitor', hp:460, atk:32, def:22, spd:10,
    exp:1200, gold:[600,800], skills:['trueBossJudgment','heal'],
  };
  function pickFinalBossJob(){
    const ids = JOBS.map(j=>j.id);
    return ids[Math.floor(Math.random()*ids.length)];
  }

  // 황금고블린 — 외상 도박사의 빚을 오래 방치하면 등장하는 강제 이벤트 전용
  // 몬스터. 일반 몬스터 풀(MONSTERS/BOSSES)에는 넣지 않고, 최종보스와 동일한
  // 패턴으로 필요할 때 직접 구성해서 등장시킨다. 골드 드랍은 0으로 뒀다 —
  // 이 전투의 보상은 일반 처치 골드가 아니라 빚 탕감(승리) 자체이기 때문
  // (combat/battle-end.js 참고).
  const GOLDEN_GOBLIN = {
    name:'황금고블린', type:'goldgoblin', hp:120, atk:16, def:8, spd:9,
    exp:60, gold:[0,0], skills:['smash'],
  };
  function pickDebtCollector(){
    const scale = 1 + depth*0.05;
    return scaleEnemyForDifficulty({
      type: GOLDEN_GOBLIN.type, name: GOLDEN_GOBLIN.name, isBoss:true, isDebtCollector:true,
      maxhp: Math.round(GOLDEN_GOBLIN.hp*scale), hp: Math.round(GOLDEN_GOBLIN.hp*scale),
      atk: Math.round(GOLDEN_GOBLIN.atk*scale*0.8),
      def: Math.round(GOLDEN_GOBLIN.def + depth*0.1),
      spd: GOLDEN_GOBLIN.spd,
      exp: GOLDEN_GOBLIN.exp,
      gold: GOLDEN_GOBLIN.gold,
      skills: GOLDEN_GOBLIN.skills, guarding:false,
    });
  }

  // ---------- 최종보스 / 진 최종보스 페이즈(광폭화) 시스템 ----------
  // 체력이 0이 되어도 곧바로 쓰러지지 않고, 남은 페이즈가 있으면 체력을 가득 채우며
  // 더욱 강력해진 모습으로 다시 일어선다. 쉬움 난이도에서는 적용되지 않는다.
  const ENRAGE_STEPS_FINAL = [
    {atkMult:1.35, defMult:1.15, hpMult:1.15, skillChance:0.55, label:'광폭화! 잠식된 힘이 폭주한다'},
  ];
  const ENRAGE_STEPS_TRUE = [
    {atkMult:1.3, defMult:1.12, hpMult:1.15, skillChance:0.55, label:'1차 각성 — 태초의 분노가 깨어난다'},
    {atkMult:1.5, defMult:1.2,  hpMult:1.25, skillChance:0.75, label:'2차 각성 — 회랑 그 자체가 몸부림친다'},
  ];
  function canEnrage(e){
    if(!e || !(e.isFinal || e.isTrueFinal)) return false;
    if(!player || player.difficulty==='easy') return false;
    const steps = e.isTrueFinal ? ENRAGE_STEPS_TRUE : ENRAGE_STEPS_FINAL;
    return (e.phase||0) < steps.length;
  }
  function triggerEnragePhase(){
    setCommandsEnabled(false);
    const steps = enemy.isTrueFinal ? ENRAGE_STEPS_TRUE : ENRAGE_STEPS_FINAL;
    const phase = enemy.phase||0;
    const step = steps[phase];
    enemy.phase = phase+1;
    enemy.atk = Math.max(1, Math.round(enemy.atk*step.atkMult));
    enemy.def = Math.max(0, Math.round(enemy.def*step.defMult));
    enemy.maxhp = Math.round(enemy.maxhp*(step.hpMult||1));
    enemy.hp = enemy.maxhp;
    enemy.skillChance = step.skillChance;
    enemy.dots = [];
    updateEnemyHpBar();
    updateStatusBadges();
    document.getElementById('bt-stage').classList.remove('dying');
    shakeEnemy();
    playBanner(step.label, 'enrage');
    Sound.gameOver();
    setBattleMsg(`${enemy.name}이(가) 쓰러지지 않는다…!`, `${step.label} — 체력을 되찾고 더욱 강력해졌다!`);
    setTimeout(()=>{
      if(battleOver) return;
      enemyTurn();
    }, 1400);
  }

  // 난이도에 따라 몬스터 스탯을 조금씩(보통) 또는 크게(하드코어) 강화한다.
  function getDifficultyMonsterMult(){
    const d = player && player.difficulty;
    if(d==='hardcore') return {hp:1.28, atk:1.22, def:1.12};
    if(d==='normal') return {hp:1.12, atk:1.10, def:1.05};
    return {hp:1, atk:1, def:1};
  }
  function scaleEnemyForDifficulty(e){
    const m = getDifficultyMonsterMult();
    if(m.hp!==1){ e.maxhp = Math.max(1, Math.round(e.maxhp*m.hp)); e.hp = e.maxhp; }
    if(m.atk!==1) e.atk = Math.max(1, Math.round(e.atk*m.atk));
    if(m.def!==1) e.def = Math.max(0, Math.round(e.def*m.def));
    return e;
  }
  function pickEnemy(isBoss, isFinal, isTrueFinal){
    if(isTrueFinal){
      const base = TRUE_FINAL_BOSS;
      const scale = 1 + depth*0.05;
      return scaleEnemyForDifficulty({
        type: base.type, name: base.name, isBoss:true, isFinal:true, isTrueFinal:true,
        maxhp: Math.round(base.hp*scale), hp: Math.round(base.hp*scale),
        atk: Math.round(base.atk*scale*0.8),
        def: Math.round(base.def + depth*0.12),
        spd: base.spd,
        exp: base.exp,
        gold: base.gold,
        skills: base.skills, guarding:false,
      });
    }
    if(isFinal){
      const jobId = pickFinalBossJob();
      const base = FINAL_BOSS_BY_JOB[jobId];
      const scale = 1 + depth*0.05;
      return scaleEnemyForDifficulty({
        type: base.type, name: base.name, isBoss:true, isFinal:true, finalJobId: jobId,
        maxhp: Math.round(base.hp*scale), hp: Math.round(base.hp*scale),
        atk: Math.round(base.atk*scale*0.8),
        def: Math.round(base.def + depth*0.12),
        spd: base.spd,
        exp: base.exp,
        gold: base.gold,
        skills: base.skills, guarding:false,
      });
    }
    const pool = (isBoss?BOSSES:MONSTERS).filter(m=>depth>=m.minDepth);
    const base = pool[Math.floor(Math.random()*pool.length)] || (isBoss?BOSSES[0]:MONSTERS[0]);
    const scale = 1 + depth*0.06;
    // 엘리트: 보스가 아닌 일반 몬스터 중 낮은 확률로 강화판이 등장한다. 처치 시 유물이 확정으로 주어진다.
    const isElite = !isBoss && depth>=3 && Math.random()<0.10;
    const eliteMult = isElite ? {hp:1.8, atk:1.35, def:1.3, reward:2.2} : {hp:1, atk:1, def:1, reward:1};
    // 보스소굴은 에픽/희귀 파밍을 위한 공간이므로, 여기서 잡는 보스는 골드/경험치 보상이 크게 줄어든다
    // (드랍 확률 자체는 그대로 유지되어, 장비 파밍 목적은 그대로 살아있다).
    const bossDenRewardMult = (isBoss && inBossDen) ? 0.35 : 1;
    const skills = isElite ? base.skills.concat(['eliteFerocity']) : base.skills;
    return scaleEnemyForDifficulty({
      type: base.type, name: (isElite?'정예 ':'')+base.name, isBoss, isElite,
      maxhp: Math.round(base.hp*scale*eliteMult.hp), hp: Math.round(base.hp*scale*eliteMult.hp),
      atk: Math.round((base.atk*scale*0.8 + depth*0.4)*eliteMult.atk),
      def: Math.round((base.def + depth*0.15)*eliteMult.def),
      spd: base.spd,
      exp: Math.round(base.exp*(1+depth*0.08)*eliteMult.reward*bossDenRewardMult),
      gold: [Math.round(base.gold[0]*(1+depth*0.08)*eliteMult.reward*bossDenRewardMult), Math.round(base.gold[1]*(1+depth*0.08)*eliteMult.reward*bossDenRewardMult)],
      skills, guarding:false,
    });
  }

  function startBattle(isBoss, isFinal, isTrueFinal, isDebtCollector){
    revertDiceDelta(); // 직전 전투의 불확실성의 주사위 효과가 남아있다면 먼저 되돌린다(안전망).
    enemy = isDebtCollector ? pickDebtCollector() : pickEnemy(isBoss, isFinal, isTrueFinal);
    battleOver = false; subMode = null;
    battleFlags = {guardian:false, phoenix:false, firstStrikeUsed:false, execCount:0, execReady:false, gambleStacks:0, jackpotGauge:0, jackpotArmed:false, paladinAwoken:false, paladinUltUsed:false, hourglassTurn:0, witchClockUsedThisTurn:false, snakeskinUsed:false, revengeArmed:false, flaskStacks:0, diceEffect:null, rig:null};
    battleFlags.creed = null; battleFlags.creedStacks = 0;
    // 로봇군단장(mastery_multideploy)의 두 번째 로봇 슬롯, 데토네이터
    // (mastery_chaindetonate)의 기폭 스택 — 둘 다 매 전투 새로 초기화된다.
    battleFlags.rig2 = null;
    battleFlags.detonatorStacks = 0;
    // 도박사 세분화(운명의 반란자/패의 마술사)용 필드 — 둘 다 매 전투 새로 초기화된다.
    battleFlags.luckGauge = 0;
    battleFlags.cardHand = [];
    // 계율(mastery_creed): 전투 시작 시 두 계율 중 하나를 무작위로 자동 선택한다(선택 UI가
    // 없어 단순화 — 계약술사/촉매 주입과 동일한 종류의 설계 타협).
    let creedLabel = '';
    if(player.skills && player.skills.includes('mastery_creed')){
      battleFlags.creed = Math.random()<0.5 ? 'nopotion' : 'skillonly';
      creedLabel = battleFlags.creed==='nopotion' ? '물약 사용 금지' : '기본 공격 금지(스킬만 사용)';
    }
    if(hasRelicFlag('diceRoll')) rollDiceEffectForBattle();
    checkPaladinAwoken();
    const hpLockPct = getRelicSum('hpLockPct');
    if(hpLockPct>0 && player.maxhp>0){
      player.hp = Math.max(1, Math.round(player.maxhp*hpLockPct));
    }
    showScreen('battle');
    document.getElementById('bt-ename').innerHTML =
      (enemy.isElite ? '<span class="elite-tag">⚔ 정예</span>' : '')
      + (isDebtCollector ? '💰 ' : (isTrueFinal?'👑 ':(isFinal?'☠️ ':(isBoss?'💀 ':''))))
      + enemy.name;
    document.getElementById('bt-stage').innerHTML = svgMonster(enemy.type);
    document.getElementById('bt-stage').className='enemy-stage'+(enemy.isElite?' elite':'');
    updateEnemyHpBar();
    updateStatusBadges();
    setBattleMsg(isDebtCollector ? `${enemy.name}이(가) 장부를 펼치며 다가온다… "자, 슬슬 이야기 좀 할까요?"`
      : (isTrueFinal ? `${enemy.name}이(가) 마침내 진정한 모습을 드러낸다!` : (isFinal ? `${enemy.name}이(가) 마침내 모습을 드러냈다!` : (isBoss ? `${enemy.name}이(가) 앞을 가로막는다!` : (enemy.isElite ? `심상치 않은 기운이 감돈다… ${enemy.name}이(가) 나타났다!` : `${enemy.name}이(가) 나타났다!`)))), '');
    resetCommandUI();
    renderStatus();
    // 불확실성의 주사위: 전투 시작 시 어떤 효과가 뽑혔는지 토스트로 알려준다.
    if(battleFlags.diceEffect){
      showToast(`<h3>🎲 불확실성의 주사위</h3><p>${DICE_EFFECT_LABELS[battleFlags.diceEffect]}</p>`, '#ffcf6a');
    }
    if(battleFlags.creed){
      showToast(`<h3>📜 계율</h3><p>이번 전투의 계율: <b>${creedLabel}</b><br>유지할수록 공격력이 오르고, 어기면 즉시 상실한다.</p>`, '#d9c07a');
    }
  }
