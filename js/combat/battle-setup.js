"use strict";
/*
전투 시작 세팅 — 최종보스/진 최종보스 데이터, 광폭화(엔레이지) 페이즈 시스템,
난이도별 몬스터 스탯 보정, 적 선택(pickEnemy), 전투 시작(startBattle),
보스 예고 필살기 데이터(사용자 요청 — 보스전 리뉴얼).
export(전역): FINAL_BOSS_BY_JOB, TRUE_FINAL_BOSS, ENRAGE_STEPS_FINAL/TRUE, pickFinalBossJob,
              canEnrage, triggerEnragePhase, getDifficultyMonsterMult, scaleEnemyForDifficulty,
              pickEnemy, startBattle, BOSS_ULTIMATE_SKILL, BOSS_ULTIMATE_LABELS, getUltimateSkillFor
의존성: state.js, data/monsters.js, relics.js(hasRelicFlag, rollDiceEffectForBattle, DICE_EFFECT_LABELS 등), Sound(sound.js), showToast(ui/difficulty.js),
       monster-visuals.js(getDungeonBgForDepth — 전투 시작 시 던전 배경 갱신)
주의(신규 — 보스전 리뉴얼): 3페이즈(최후의 발악)는 기존 ENRAGE_STEPS_FINAL/TRUE
     (부활형 광폭화, 1~2페이즈)를 그대로 두고, 그 마지막 부활 이후 HP 30%
     이하에서 combat/enemy-turn.js의 checkLastStand()가 별도로 발동시킨다
     (부활 없이 공격력↑/방어력↓/매 턴 자체 피해만 추가되는 방식). 보스 필살기는
     새 스킬을 만들지 않고 이미 존재하는 보스 스킬 중 배율이 더 높은 쪽을
     그대로 지정했다(BOSS_ULTIMATE_SKILL).
*/

  /* ============ 전투 ============ */
  // 회랑의 최종보스는 고정된 몬스터가 아니라, 플레이어가 고를 수 있는 6개 직업 중
  // 하나의 모습을 한 "타락한 용사"로 매번 랜덤하게 등장한다.
  // 최근 클리어 기록(explore.js의 showFinalFloorConfirm()이 최종보스 전투 시작
  // 직전에 loadRecords()로 채워둔다) — 일반 최종보스의 이름/직업을 여기서
  // 따온다. 기록이 없으면 null로 남아 예전처럼 무작위 직업 폴백이 동작한다.
  let recentRunRecord = null;

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

  // ---------- 최종보스 / 진 최종보스 페이즈(광폭화) 시스템 ----------
  // 체력이 0이 되어도 곧바로 쓰러지지 않고, 남은 페이즈가 있으면 체력을 가득 채우며
  // 더욱 강력해진 모습으로 다시 일어선다. 쉬움 난이도에서는 적용되지 않는다.
  // 밸런스 조정(사용자 피드백 — "광폭화 후 한 대만 맞아도 죽는다"): 광폭화의
  // atkMult는 이미 깊이 스케일링(50층 기준 ×3.5)과 난이도 보정(보통 ×1.10,
  // 하드코어 ×1.22)까지 다 반영된 공격력 위에 또 곱해지는 구조라, 예전 수치
  // (1.35, 진 최종보스는 1.3→1.5)로는 한 방에 즉사시킬 정도로 과도했다.
  // 배율을 전체적으로 낮췄다 — "부활해서 더 강해졌다"는 느낌은 유지하되
  // 즉사기가 되지 않는 선으로.
  const ENRAGE_STEPS_FINAL = [
    {atkMult:1.15, defMult:1.1, hpMult:1.1, skillChance:0.45, label:'광폭화! 잠식된 힘이 폭주한다'},
  ];
  const ENRAGE_STEPS_TRUE = [
    {atkMult:1.12, defMult:1.08, hpMult:1.1,  skillChance:0.45, label:'1차 각성 — 태초의 분노가 깨어난다'},
    {atkMult:1.25, defMult:1.12, hpMult:1.15, skillChance:0.6,  label:'2차 각성 — 회랑 그 자체가 몸부림친다'},
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
    // 버그 수정: 예전엔 여기서 enemyTurn()을 호출해 광폭화 직후 적이 곧바로
    // 한 번 더 공격했다 — "공격→보스 HP0→광폭화→내 턴"이어야 할 흐름이
    // "...→광폭화→적 턴(피격)→내 턴"이 되어버려, 사용자 입장에선 광폭화
    // 메시지가 뜨자마자 이유 없이 체력이 깎이는 것처럼 보였다. 이 광폭화는
    // 플레이어가 이미 자기 턴(공격)을 다 써서 발생한 것이므로, 적에게 추가
    // 턴을 줄 이유가 없다 — 연출이 끝나면 그대로 플레이어에게 턴을 돌려준다.
    setTimeout(()=>{
      if(battleOver) return;
      resetCommandUI();
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
    // 저주 "그림자의 포효": 이 저주를 짊어진 동안 마주치는 모든 적의 공격력이
    // 오른다. getRelicSum('enemyAtkPct')가 저주가 없으면 0을 반환하므로 다른
    // 캐릭터에는 전혀 영향 없다. 모든 적 생성 경로(일반/정예/보스/최종보스/
    // 황금고블린)가 이 함수를 거치므로 여기 한 곳만 고치면 전부 적용된다.
    const curseAtkPct = getRelicSum('enemyAtkPct');
    if(curseAtkPct>0) e.atk = Math.max(1, Math.round(e.atk*(1+curseAtkPct)));
    return e;
  }
  /* ============ 정예 특성(사용자 요청 — 정예 몬스터 리뉴얼) ============ */
  // 실제 효과 구현은 대부분 combat/enemy-turn.js(hasEliteTrait, getEffectiveEnemyAtk 등)와
  // combat/battle-fx.js(updateEnemyHpBar 후킹 — 반사/철갑/복수), explore.js(renderStatus
  // 후킹 — 저주로 인한 회복량 감소)에 있다. 여기서는 정의/배정만 담당한다.
  const ELITE_TRAITS = {
    berserk:   {label:'광폭',     desc:'HP 50% 이하일 때 공격력 +30%'},
    lifesteal: {label:'흡혈',     desc:'가한 피해의 20% 회복'},
    ironskin:  {label:'철갑',     desc:'첫 2턴 받는 피해 -40%'},
    revenge:   {label:'복수',     desc:'피격 시 다음 공격 +30%'},
    regen:     {label:'재생',     desc:'매 턴 최대HP 4% 회복'},
    undying:   {label:'불사',     desc:'사망 시 1회, HP 25%로 부활'},
    curse:     {label:'저주',     desc:'플레이어가 받는 회복 효과 -30%'},
    madness:   {label:'광기',     desc:'3턴마다 한 번, 그 턴 공격력이 크게 오른다'},
    poison:    {label:'독성',     desc:'공격이 적중하면 중독(3턴) 부여'},
    reflect:   {label:'반사',     desc:'받는 피해의 15%를 플레이어에게 반사'},
    manaburn:  {label:'마나포식', desc:'플레이어가 스킬을 쓸 때마다 MP -2'},
    hunter:    {label:'사냥꾼',   desc:'플레이어 HP 30% 이하일 때 가하는 피해 +40%'},
  };
  const ALL_ELITE_TRAIT_KEYS = Object.keys(ELITE_TRAITS);
  // 몬스터별 전용 풀(사용자 요청 예시 기반 — 표에 없는 "도주/훔치기/주문강화/
  // 보호막/도발" 등은 이번엔 12개 표 안에서 컨셉이 가장 가까운 특성으로
  // 대체했다). 풀에 없는 타입(슬라임/박쥐/늑대 등)은 12종 전체에서 무작위로
  // 뽑는다. 보스(BOSSES)에는 이번엔 적용하지 않는다(사용자 확정).
  const MONSTER_TYPE_TRAIT_POOLS = {
    goblin:   ['berserk','poison','hunter'],       // 광폭/독/훔치기·도주 대체(사냥꾼)
    skeleton: ['undying','curse','regen'],         // 언데드 계열
    ghost:    ['undying','curse','regen'],
    wraith:   ['undying','curse','regen'],
    knight:   ['ironskin','revenge','reflect'],     // 철갑/복수/도발 대체(반사)
    witch:    ['manaburn','madness','regen'],       // 마나포식/주문강화 대체(광기)/보호막 대체(재생)
    cultist:  ['manaburn','madness','regen'],
  };
  // 정예 특성 개수(사용자 요청 — 진행상황 + 난이도에 따라 1~3개).
  function getEliteTraitCount(atDepth, difficulty){
    const base = atDepth<20 ? 1 : (atDepth<40 ? 2 : 3);
    if(difficulty==='easy') return Math.max(1, base-1);
    if(difficulty==='hardcore') return Math.min(3, base+1);
    return base;
  }
  function rollEliteTraits(monsterType, count){
    const pool = MONSTER_TYPE_TRAIT_POOLS[monsterType] || ALL_ELITE_TRAIT_KEYS;
    const shuffled = pool.slice().sort(()=>Math.random()-0.5);
    const picked = shuffled.slice(0, count);
    if(picked.length < count){
      const rest = ALL_ELITE_TRAIT_KEYS.filter(k=>!picked.includes(k)).sort(()=>Math.random()-0.5);
      picked.push(...rest.slice(0, count-picked.length));
    }
    return picked;
  }

  /* ============ 보스 예고 필살기(사용자 요청 — 보스전 리뉴얼) ============ */
  // "예고 → 대응 → 발동" 구조. 새 스킬을 만들지 않고, 이미 있는 보스 스킬 중
  // 데미지 배율이 더 높은 쪽을 그대로 "필살기"로 지정한다(combat/enemy-turn.js의
  // 데미지 분기 참고). BOSS_ULTIMATE_LABELS는 예고 UI/카드에 쓰는 한글 이름.
  const BOSS_ULTIMATE_SKILL = {
    watchertablet:   'unblinkingGaze',   // 1.55 vs 2.05
    hollowprophet:   'prophecyFlame',    // 1.5  vs 2.0
    hornedwarden:    'whisperingHorn',   // 1.6  vs 1.85
    threadmannequin: 'scissorGreeting',  // 1.5  vs 1.9
    bladedbloom:     'bladeStemSweep',   // 1.4  vs 2.1
    sinlantern:      'lanternChorus',    // 1.45 vs 2.0
    clockheart:      'pulseShockwave',   // 1.7  vs 1.5
    unstoppingsand:  'timeTurningBack',  // 1.6  vs 2.15
  };
  const BOSS_ULTIMATE_LABELS = {
    unblinkingGaze:'깜빡이지 않는 시선', prophecyFlame:'예언의 불꽃', whisperingHorn:'속삭이는 뿔피리',
    scissorGreeting:'가위의 인사', bladeStemSweep:'칼날 줄기의 휩쓸기', lanternChorus:'등롱의 합창',
    pulseShockwave:'박동의 충격파', timeTurningBack:'되돌아오는 시간',
    heroWarriorSmite:'필멸의 참격', heroMageBurst:'멸망의 화염구', heroRogueSlash:'그림자 베기',
    heroPaladinSmite:'심판의 빛', heroMechanicBlast:'장치 기폭', heroJesterGamble:'최후의 도박',
    trueBossJudgment:'태초의 심판',
  };
  // 최종보스(직업별/진)는 스킬이 1개(+선택적 heal)뿐이라 그 공격 스킬 자체가 필살기.
  function getUltimateSkillFor(type, skills){
    if(BOSS_ULTIMATE_SKILL[type]) return BOSS_ULTIMATE_SKILL[type];
    return (skills||[]).find(k=>k!=='heal') || (skills&&skills[0]) || null;
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
        // 보스 예고 필살기/최후의 발악(사용자 요청 — 보스전 리뉴얼).
        ultimateSkillKey: getUltimateSkillFor(base.type, base.skills),
        rageGauge:0, rageMax:100, telegraphed:false, aboutToUltimate:false,
        lastStandActive:false, lastStandTriggered:false,
      });
    }
    if(isFinal){
      // 일반 최종보스("잠식된 OO 용사")는 최근 클리어 기록이 있으면 그 기록의
      // 이름과 직업을 따른다(사용자 요청) — 과거의 자신(또는 다른 기록)과
      // 다시 마주하는 서사적 장치. explore.js의 showFinalFloorConfirm()이
      // 전투 시작 직전 recentRunRecord를 미리 채워둔다(pickEnemy는 동기
      // 함수라 비동기 loadRecords()를 직접 못 씀). 기록이 없거나(첫 플레이)
      // job 필드가 없는 옛 기록이면 예전처럼 무작위 직업으로 폴백한다.
      let jobId, bossName;
      if(recentRunRecord && recentRunRecord.job && FINAL_BOSS_BY_JOB[recentRunRecord.job]){
        jobId = recentRunRecord.job;
        bossName = `잠식된 ${recentRunRecord.name}`;
      } else {
        jobId = pickFinalBossJob();
        bossName = FINAL_BOSS_BY_JOB[jobId].name;
      }
      const base = FINAL_BOSS_BY_JOB[jobId];
      const scale = 1 + depth*0.05;
      return scaleEnemyForDifficulty({
        type: base.type, name: bossName, isBoss:true, isFinal:true, finalJobId: jobId,
        maxhp: Math.round(base.hp*scale), hp: Math.round(base.hp*scale),
        atk: Math.round(base.atk*scale*0.8),
        def: Math.round(base.def + depth*0.12),
        spd: base.spd,
        exp: base.exp,
        gold: base.gold,
        skills: base.skills, guarding:false,
        ultimateSkillKey: getUltimateSkillFor(base.type, base.skills),
        rageGauge:0, rageMax:100, telegraphed:false, aboutToUltimate:false,
        lastStandActive:false, lastStandTriggered:false,
      });
    }
    // 몬스터 선택: 예전엔 조건(depth>=minDepth)만 맞으면 전부 동일 확률로
    // 뽑혀서, 고층에서도 1층 몬스터(박쥐 등)가 26층 몬스터(악마 등)랑 똑같이
    // 나올 수 있었다. 특히 "정예 박쥐 떼"처럼 저층 잡몹이 고층에서 정예로
    // 등장하면 스탯만 세졌지 위협감은 그대로 없어서 긴장감이 떨어진다는
    // 피드백을 받았다. 이제 몬스터의 minDepth와 현재 depth 사이의 "격차"가
    // 클수록 뽑힐 확률을 부드럽게 낮춘다(하드 컷오프는 아님 — 아주 가끔은
    // 여전히 나올 수 있어 완전히 안 보이진 않는다). 보스 풀(BOSSES)은 원래도
    // 몬스터 수가 적고 이미 구간별로 어느 정도 안배돼 있어 그대로 균등 추첨을
    // 유지한다.
    function pickWeightedMonster(pool, atDepth){
      // 지수 감쇠(k=0.13): 단순 반비례(1/(1+gap))보다 훨씬 빠르게 떨어진다 —
      // 고층에선 자격 있는 몬스터 수 자체가 많아져서 반비례 방식으론 "나눠먹기"
      // 때문에 저층 몬스터가 여전히 몇 %씩 나왔다(예: 40층에서도 박쥐 4%).
      // 지수 감쇠로 바꾸니 같은 상황에서 박쥐가 1% 수준까지 확실히 낮아진다.
      const weights = pool.map(m=>{
        const gap = Math.max(0, atDepth - m.minDepth);
        return Math.exp(-gap*0.13);
      });
      const total = weights.reduce((a,b)=>a+b, 0);
      let r = Math.random()*total;
      for(let i=0;i<pool.length;i++){
        r -= weights[i];
        if(r<=0) return pool[i];
      }
      return pool[pool.length-1];
    }
    const pool = (isBoss?BOSSES:MONSTERS).filter(m=>depth>=m.minDepth);
    const base = isBoss
      ? (pool[Math.floor(Math.random()*pool.length)] || BOSSES[0])
      : (pickWeightedMonster(pool, depth) || MONSTERS[0]);
    const scale = 1 + depth*0.06;
    // 엘리트: 보스가 아닌 일반 몬스터 중 낮은 확률로 강화판이 등장한다. 처치 시 유물이 확정으로 주어진다.
    // 정예: 노드맵의 '정예 전투' 노드를 골랐으면(nodeForcedElite) 확정으로
    // 정예가 나온다 — 이 경우 nodemap.js의 resolveNode()가 플래그를 세워둔다.
    // 그 외엔 예전처럼 낮은 확률로 무작위 등장한다(구간 없이 시작하는 보스소굴
    // 등 레거시 경로용으로 남겨둠).
    const isElite = !isBoss && (nodeForcedElite || (depth>=3 && Math.random()<0.10));
    nodeForcedElite = false;
    // 더 강한 정예(사용자 요청 — 피투성이 도전자 이벤트 "도발한다" 전용).
    // nodemap.js에 nodeForcedElite와 함께 선언된 nodeEliteBoost 플래그를 여기서
    // 소비한다 — isElite가 아니면(정예가 아니면) 애초에 의미가 없으니 무시된다.
    const isEliteBoosted = isElite && nodeEliteBoost;
    nodeEliteBoost = false;
    const eliteMult = isEliteBoosted ? {hp:2.3, atk:1.6, def:1.5, reward:2.6}
      : (isElite ? {hp:1.8, atk:1.35, def:1.3, reward:2.2} : {hp:1, atk:1, def:1, reward:1});
    // 보스소굴은 에픽/희귀 파밍을 위한 공간이므로, 여기서 잡는 보스는 골드/경험치 보상이 크게 줄어든다
    // (드랍 확률 자체는 그대로 유지되어, 장비 파밍 목적은 그대로 살아있다).
    const bossDenRewardMult = (isBoss && inBossDen) ? 0.35 : 1;
    const skills = isElite ? base.skills.concat(['eliteFerocity']) : base.skills;
    const built = {
      type: base.type, name: (isElite?'정예 ':'')+base.name, isBoss, isElite,
      maxhp: Math.round(base.hp*scale*eliteMult.hp), hp: Math.round(base.hp*scale*eliteMult.hp),
      atk: Math.round((base.atk*scale*0.8 + depth*0.4)*eliteMult.atk),
      def: Math.round((base.def + depth*0.15)*eliteMult.def),
      spd: base.spd,
      exp: Math.round(base.exp*(1+depth*0.08)*eliteMult.reward*bossDenRewardMult),
      gold: [Math.round(base.gold[0]*(1+depth*0.08)*eliteMult.reward*bossDenRewardMult), Math.round(base.gold[1]*(1+depth*0.08)*eliteMult.reward*bossDenRewardMult)],
      skills, guarding:false,
    };
    if(isElite){
      const traitCount = getEliteTraitCount(depth, player && player.difficulty);
      built.eliteTraits = rollEliteTraits(base.type, traitCount);
      // 철갑/불사는 지속 카운터·1회성 플래그가 필요해 여기서 초기값을 함께 심어둔다.
      if(built.eliteTraits.includes('ironskin')) built.ironskinTurns = 2;
      if(built.eliteTraits.includes('undying')) built.usedUndying = false;
    }
    if(isBoss){
      // 보스 예고 필살기/분노 게이지/최후의 발악(사용자 요청 — 보스전 리뉴얼).
      built.ultimateSkillKey = getUltimateSkillFor(base.type, base.skills);
      built.rageGauge = 0; built.rageMax = 100;
      built.telegraphed = false; built.aboutToUltimate = false;
      built.lastStandActive = false; built.lastStandTriggered = false;
      // 약점(사용자 요청 — 시범 3개 보스만). data/monsters.js의 BOSSES 데이터에
      // weakness가 있으면 그대로 옮겨 심는다(없으면 undefined로 아무 효과 없음).
      if(base.weakness) built.weakness = base.weakness;
    }
    return scaleEnemyForDifficulty(built);
  }

  function startBattle(isBoss, isFinal, isTrueFinal){
    revertDiceDelta(); // 직전 전투의 불확실성의 주사위 효과가 남아있다면 먼저 되돌린다(안전망).
    enemy = pickEnemy(isBoss, isFinal, isTrueFinal);
    // 다음 전투 한정 적 공격력 감소(사용자 요청 — 이상한 촛불 이벤트 "촛불을 끈다").
    // 단발성이라 소비 즉시 되돌린다.
    if(player.nextBattleEnemyAtkMult){
      enemy.atk = Math.max(1, Math.round(enemy.atk*player.nextBattleEnemyAtkMult));
      player.nextBattleEnemyAtkMult = null;
    }
    battleOver = false; subMode = null;
    // 정예 "저주" 특성(플레이어 회복량 감소)이 explore.js의 renderStatus()에서
    // HP 증가분을 감지하는 기준값. 전투 시작 시점 HP로 초기화해 이전 화면의
    // HP 변화가 오작동으로 걸리지 않게 한다.
    player._prevHpForCurse = player.hp;
    if(enemy) enemy._prevHp = enemy.hp;
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
    // 다중 전투 버프(사용자 요청 — 수수께끼의 마법사, 다음 3전투 지속)와 계약
    // 버프(악마의 계약, 마을 도착 전까지 지속)를 매 전투 시작 시 반영한다.
    // 둘 다 기존 buffAtkTurns/buffAtkMult·buffDefTurns/buffDefMult 필드를
    // 그대로 재활용한다(값이 겹치면 나중에 세팅되는 쪽이 우선 — 계약이 더
    // 강렬한 효과라는 컨셉이라 다중전투 버프 다음에 적용해 우선하게 한다).
    let eventBuffMsgs = [];
    if(player.multiBattleBuff && player.multiBattleBuff.battlesLeft>0){
      const mb = player.multiBattleBuff;
      if(mb.type==='atk'){ player.buffAtkTurns = 99; player.buffAtkMult = 1+mb.value; }
      else if(mb.type==='mitigate'){ player.buffDefTurns = 99; player.buffDefMult = 1-mb.value; }
      // type==='mpcost'는 combat/player-actions.js의 playerSkill()에서 직접 참조한다.
      eventBuffMsgs.push(`남은 축복 전투 ${mb.battlesLeft}회`);
    }
    if(player.contractBuff){
      player.buffAtkTurns = 99; player.buffAtkMult = player.contractBuff.atkMult;
      eventBuffMsgs.push('악마와의 계약이 유지되고 있다');
    }
    const hpLockPct = getRelicSum('hpLockPct');
    if(hpLockPct>0 && player.maxhp>0){
      player.hp = Math.max(1, Math.round(player.maxhp*hpLockPct));
    }
    showScreen('battle');
    // 던전 배경(구역별): getDungeonBgForDepth()는 이미 monster-visuals.js에
    // 정의돼 있었지만 여기서 실제로 호출되지 않아 배경이 항상 dungeon1.png로
    // 고정돼 있던 버그를 고쳤다. .archway의 background는 3중 레이어(그라디언트
    // 2개 + 배경 이미지)라 shorthand로 이미지 URL만 갈아끼운다.
    const archwayEl = document.querySelector('.archway');
    if(archwayEl){
      const bgFile = getDungeonBgForDepth(depth);
      archwayEl.style.backgroundImage =
        `radial-gradient(ellipse at 50% 30%, #3a2c1c66 0%, transparent 65%), `
        + `linear-gradient(180deg, #00000000 55%, #171009cc 100%), `
        + `url('${bgFile}')`;
    }
    const eliteTagHtml = enemy.isElite
      ? (enemy.eliteTraits && enemy.eliteTraits.length
          ? enemy.eliteTraits.map(k=>`<span class="elite-tag">[${ELITE_TRAITS[k].label}]</span>`).join('')
          : '<span class="elite-tag">⚔ 정예</span>')
      : '';
    // enemy.name은 로그/토스트 등 다른 곳에서 "정예 OO" 형태로 계속 쓰이므로
    // 그대로 두고, 이 표시줄에서만 접두어를 떼어 특성 태그와 중복되지 않게 한다.
    const displayName = (enemy.isElite && enemy.eliteTraits && enemy.eliteTraits.length)
      ? enemy.name.replace(/^정예 /, '')
      : enemy.name;
    document.getElementById('bt-ename').innerHTML =
      eliteTagHtml
      + (isTrueFinal?'👑 ':(isFinal?'☠️ ':(isBoss?'💀 ':'')))
      + displayName;
    // 보스 다음 행동 미리보기 카드(사용자 요청 — 보스전 리뉴얼) 초기화.
    if(typeof updateBossIntentCard==='function') updateBossIntentCard();
    document.getElementById('bt-stage').innerHTML = svgMonster(enemy.type);
    document.getElementById('bt-stage').className='enemy-stage'+(enemy.isElite?' elite':'');
    // PNG 몬스터 그림이 캔버스 안 투명 여백 때문에 "붕 떠 보이는" 문제를
    // 자동으로 보정한다(monster-visuals.js의 fixMonsterImageGrounding 참고).
    // SVG 몬스터일 땐 <img> 자체가 없으니 querySelector가 null을 반환해
    // 자연히 아무 일도 안 일어난다.
    fixMonsterImageGrounding(document.getElementById('bt-stage').querySelector('img'));
    updateEnemyHpBar();
    updateStatusBadges();
    setBattleMsg(isTrueFinal ? `${enemy.name}이(가) 마침내 진정한 모습을 드러낸다!` : (isFinal ? `${enemy.name}이(가) 마침내 모습을 드러냈다!` : (isBoss ? `${enemy.name}이(가) 앞을 가로막는다!` : (enemy.isElite ? `심상치 않은 기운이 감돈다… ${enemy.name}이(가) 나타났다!` : `${enemy.name}이(가) 나타났다!`))), '');
    resetCommandUI();
    renderStatus();
    // 불확실성의 주사위: 전투 시작 시 어떤 효과가 뽑혔는지 토스트로 알려준다.
    if(battleFlags.diceEffect){
      showToast(`<h3>🎲 불확실성의 주사위</h3><p>${DICE_EFFECT_LABELS[battleFlags.diceEffect]}</p>`, '#ffcf6a');
    }
    if(battleFlags.creed){
      showToast(`<h3>📜 계율</h3><p>이번 전투의 계율: <b>${creedLabel}</b><br>유지할수록 공격력이 오르고, 어기면 즉시 상실한다.</p>`, '#d9c07a');
    }
    if(eventBuffMsgs.length){
      showToast(`<h3>✨ 지속 효과</h3><p>${eventBuffMsgs.join('<br>')}</p>`, '#c9a8ff');
    }
    // 정예 특성 안내(사용자 요청 — 정예 몬스터 리뉴얼). 무엇과 싸우는지 미리 알 수 있게.
    if(enemy.eliteTraits && enemy.eliteTraits.length){
      const traitLines = enemy.eliteTraits.map(k=> `<b>[${ELITE_TRAITS[k].label}]</b> ${ELITE_TRAITS[k].desc}`).join('<br>');
      showToast(`<h3>⚔ 정예 특성</h3><p>${traitLines}</p>`, '#ff8a3a');
    }
  }
