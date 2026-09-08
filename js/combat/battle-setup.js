"use strict";
/*
전투 시작 세팅 — 최종보스/진 최종보스 데이터, 광폭화(엔레이지) 페이즈 시스템,
난이도별 몬스터 스탯 보정, 적 선택(pickEnemy), 전투 시작(startBattle),
보스 예고 스킬 이름 데이터(사용자 요청 — 보스전 리뉴얼).
export(전역): FINAL_BOSS_BY_JOB, TRUE_FINAL_BOSS, ENRAGE_STEPS_FINAL/TRUE, pickFinalBossJob,
              canEnrage, triggerEnragePhase, getDifficultyMonsterMult, scaleEnemyForDifficulty,
              pickEnemy, startBattle, BOSS_SKILL_LABELS
의존성: state.js, data/monsters.js, relics.js(hasRelicFlag, rollDiceEffectForBattle, DICE_EFFECT_LABELS 등), Sound(sound.js), showToast(ui/difficulty.js),
       monster-visuals.js(getDungeonBgForDepth — 전투 시작 시 던전 배경 갱신)
주의(신규 — 보스전 리뉴얼): 3페이즈(최후의 발악)는 기존 ENRAGE_STEPS_FINAL/TRUE
     (부활형 광폭화, 1~2페이즈)를 그대로 두고, 그 마지막 부활 이후 HP 30%
     이하에서 combat/enemy-turn.js의 checkLastStand()가 별도로 발동시킨다
     (부활 없이 공격력↑/방어력↓/매 턴 자체 피해만 추가되는 방식).
주의(수정): 처음엔 "분노 게이지가 차면 필살기 하나만 예고"하는 구조였으나,
     사용자 피드백으로 "보스가 스킬을 쓸 때마다(전부) 예고"로 다시 설계했다
     — 분노 게이지 관련 필드/함수는 전부 제거했다. combat/enemy-turn.js의
     enemyAction()이 보스의 스킬 굴림 자체를 한 턴 늦추는 방식으로 구현한다.
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
    mechanic: {name:'잠식된 기관사 용사', type:'heromechanic', hp:310, atk:32, def:12, spd:9,  exp:600, gold:[350,450], skills:['heroMechanicBlast']},
    jester:   {name:'잠식된 도박사 용사',   type:'herojester',   hp:285, atk:35, def:10, spd:11, exp:600, gold:[350,450], skills:['heroJesterGamble']},
  };
  // 단 한 번도 쓰러지지 않고(deathCount===0) 50층에 도달했을 때만 등장하는 진짜 최종보스.
  // 일반 최종보스(잠식된 OO 용사)보다, 그리고 여느 보스들보다도 훨씬 강하다.
  const TRUE_FINAL_BOSS = {
    name:'회랑의 시조', type:'progenitor', hp:460, atk:32, def:22, spd:10,
    exp:1200, gold:[600,800], skills:['trueBossJudgment','heal'],
  };
  // 마녀의 시계(relic_witchclock) 보유 시, 회랑의 시조 대신 등장하는 진 최종보스
  // "시간의 마녀"(아이온) — B안: 대역(시조)을 보낼 필요 없이 자신의 물건을
  // 알아보고 직접 나선다는 서사(CURRENT_STATUS.md/설계 대화 참고). 시조보다
  // 덜 단단하지만 더 빠른 쪽으로 스탯을 잡았다(HP/DEF 소폭 하향, SPD 대폭 상향).
  const TRUE_FINAL_BOSS_WITCH = {
    name:'시간의 마녀', type:'timewitch', hp:440, atk:34, def:20, spd:14,
    exp:1300, gold:[650,850], skills:['aionHaste','aionParadox'],
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
  // 사용자 요청 — 시뮬레이션(Python Monte Carlo, 자연 진행 레벨17 기준) 결과
  // 반영: 부활 2회는 사실상 총 체력 3배에 가까운 효과라 시간 승부에서 답이
  // 없었다. 1회로 축소하고 배율도 완화했다.
  const ENRAGE_STEPS_TRUE = [
    {atkMult:1.10, defMult:1.05, hpMult:1.10, skillChance:0.45, label:'각성 — 태초의 분노가 깨어난다'},
  ];
  // 아이온 전용 광폭화 스텝 — 발동 조건/구조(체력 0 -> 풀피 부활)는
  // ENRAGE_STEPS_TRUE와 완전히 동일하고 라벨/연출만 시간 역행 테마로 다르다.
  const ENRAGE_STEPS_WITCH = [
    {atkMult:1.10, defMult:1.05, hpMult:1.10, skillChance:0.45, label:'시간 역행 — 되감긴 시간이 상처를 지운다'},
  ];
  // 진 최종보스 종류별 광폭화 스텝 선택 헬퍼(canEnrage/triggerEnragePhase/
  // checkLastStand 3곳에서 공용으로 쓴다) — 새 진 최종보스가 추가되면
  // 여기만 분기를 늘리면 된다.
  function getEnrageSteps(e){
    if(e && e.type==='timewitch') return ENRAGE_STEPS_WITCH;
    if(e && e.isTrueFinal) return ENRAGE_STEPS_TRUE;
    return ENRAGE_STEPS_FINAL;
  }
  function canEnrage(e){
    if(!e || !(e.isFinal || e.isTrueFinal)) return false;
    if(!player || player.difficulty==='easy') return false;
    const steps = getEnrageSteps(e);
    return (e.phase||0) < steps.length;
  }
  function triggerEnragePhase(){
    setCommandsEnabled(false);
    const steps = getEnrageSteps(enemy);
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
    // 쉬움(사용자 요청 — atk 감소는 너프 전(1.0)으로 되돌리고, 대신 플레이어
    // 쪽 공격력을 올리고 마나 소모를 줄이는 방식으로 접근을 바꿨다. hp/def는
    // 기존 소폭 완화(0.95)를 유지한다).
    return {hp:0.95, atk:1, def:0.95};
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

  /* ============ 보스 예고 스킬(사용자 요청 — 보스전 리뉴얼) ============ */
  // "예고 → 대응 → 발동" 구조. 사용자 재확인: 특정 "필살기" 하나만 예고하는 게
  // 아니라, 보스가 스킬을 쓸 때마다(어떤 스킬이든) 항상 한 턴 전에 예고해야
  // 한다 — 그래서 분노 게이지로 필살기 하나만 가끔 예고하던 1차 버전을
  // 걷어내고, 보스의 스킬 굴림 자체를 "이번 턴 발동" 대신 "다음 턴 예고 →
  // 그다음 턴 발동"으로 한 턴 늦추는 방식으로 다시 만들었다(combat/enemy-turn.js
  // 참고). 치유(heal)는 위협이 아니라 예고 없이 즉시 사용한다.
  // BOSS_SKILL_LABELS는 예고 UI/카드에 쓰는 한글 이름 — 보스가 가진 스킬
  // 전부(둘 다) + 최종보스류를 포함한다.
  const BOSS_SKILL_LABELS = {
    carvedBrand:'새겨지는 낙인', unblinkingGaze:'깜빡이지 않는 시선',
    lockedVoices:'잠긴 목소리들', prophecyFlame:'예언의 불꽃',
    judgmentKey:'심판의 열쇠', whisperingHorn:'속삭이는 뿔피리',
    threadWinds:'실이 감긴다', scissorGreeting:'가위의 인사',
    petalBloodletting:'꽃잎의 선혈', bladeStemSweep:'칼날 줄기의 휩쓸기',
    burningSin:'타오르는 죄', lanternChorus:'등롱의 합창',
    pulseShockwave:'박동의 충격파', rustedChainBind:'녹슨 사슬의 포박',
    crumblingSand:'무너지는 모래', timeTurningBack:'되돌아오는 시간',
    heroWarriorSmite:'필멸의 참격', heroMageBurst:'멸망의 화염구', heroRogueSlash:'그림자 베기',
    heroPaladinSmite:'심판의 빛', heroMechanicBlast:'장치 기폭', heroJesterGamble:'최후의 도박',
    trueBossJudgment:'태초의 심판',
    aionHaste:'가속의 손', aionParadox:'시간의 역설',
  };

  function pickEnemy(isBoss, isFinal, isTrueFinal){
    if(isTrueFinal){
      const hasWitchClock = (player.relics||[]).includes('relic_witchclock');
      const base = hasWitchClock ? TRUE_FINAL_BOSS_WITCH : TRUE_FINAL_BOSS;
      const scale = 1 + depth*0.05;
      // 사용자 요청 — 시뮬레이션(자연 진행 레벨17, 유물슬롯 보정 포함) 결과
      // 반영: hp/atk에 ×0.77 하향. def는 하향 대상에서 제외(원래도 별도
      // 완만한 공식이라 과도하지 않았음).
      const nerf = 0.77;
      return scaleEnemyForDifficulty({
        type: base.type, name: base.name, isBoss:true, isFinal:true, isTrueFinal:true,
        maxhp: Math.round(base.hp*scale*nerf), hp: Math.round(base.hp*scale*nerf),
        atk: Math.round(base.atk*scale*0.8*nerf),
        def: Math.round(base.def + depth*0.12),
        spd: base.spd,
        exp: base.exp,
        gold: base.gold,
        skills: base.skills, guarding:false,
        // 보스 예고 스킬/최후의 발악(사용자 요청 — 보스전 리뉴얼).
        telegraphed:false, aboutToUltimate:false, pendingSkillKey:null,
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
        // 사용자 요청 — 직업(2차 전직했다면 그 전직명까지) 라벨을 이름 앞에 넣는다.
        // jobLabel은 "🔮 계약술사"처럼 아이콘+이름 형태로 저장되어 있어, 아이콘
        // 부분만 떼어낸다. 옛 기록(jobLabel 필드가 없는 경우)은 예전처럼
        // 이름만 사용한다.
        const jobLabelText = recentRunRecord.jobLabel
          ? recentRunRecord.jobLabel.replace(/^\S+\s*/, '')
          : '';
        bossName = jobLabelText ? `잠식된 ${jobLabelText} ${recentRunRecord.name}` : `잠식된 ${recentRunRecord.name}`;
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
        telegraphed:false, aboutToUltimate:false, pendingSkillKey:null,
        lastStandActive:false, lastStandTriggered:false,
      });
    }
    // 몬스터 선택: 예전엔 조건(depth>=minDepth)만 맞으면 전부 동일 확률로
    // 뽑혀서, 고층에서도 1층 몬스터(박쥐 등)가 26층 몬스터(악마 등)랑 똑같이
    // 나올 수 있었다. 특히 "정예 박쥐 떼"처럼 저층 잡몹이 고층에서 정예로
    // 등장하면 스탯만 세졌지 위협감은 그대로 없어서 긴장감이 떨어진다는
    // 피드백을 받았다. 이제 몬스터의 minDepth와 현재 depth 사이의 "격차"가
    // 클수록 뽑힐 확률을 부드럽게 낮춘다(하드 컷오프는 아님 — 아주 가끔은
    // 여전히 나올 수 있어 완전히 안 보이진 않는다).
    //
    // [리뉴얼] 구간별 몬스터 풀(사용자 요청) — 위 지수 감쇠만으로는 오크전사
    // 같은 강타(smash) 계열이 그 구간 "주력"으로 너무 자주 나오는 문제가
    // 있었다(시뮬레이션으로 확인 — 기관사가 오크전사 한 방에 최대HP 75%를
    // 잃는 경우까지 있었음). data/monsters.js의 TIER_MONSTER_POOLS로 구간마다
    // "주력"(native, 대부분 이걸 뽑음)과 "희귀 조우"(reach, 낮은 확률로만 —
    // 다음 구간을 미리 살짝 맛보여주는 긴장감용) 풀을 나눴다. 지수 감쇠 자체는
    // native/reach 각 풀 "안에서" 그대로 유지해 자연스러운 층별 변화는 남긴다.
    // 보스 풀(BOSSES)은 원래도 몬스터 수가 적고 이미 구간별로 어느 정도
    // 안배돼 있어 그대로 균등 추첨을 유지한다.
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
    function pickTieredMonster(atDepth){
      const tierPool = TIER_MONSTER_POOLS[Math.min(player.tierIndex||0, TIER_MONSTER_POOLS.length-1)];
      const useReach = tierPool.reach.length && Math.random() < tierPool.reachChance;
      const typeSet = useReach ? tierPool.reach : tierPool.native;
      const sub = MONSTERS.filter(m=>typeSet.includes(m.type) && atDepth>=m.minDepth);
      const fallback = MONSTERS.filter(m=>tierPool.native.includes(m.type) && atDepth>=m.minDepth);
      return pickWeightedMonster(sub.length?sub:(fallback.length?fallback:MONSTERS.filter(m=>atDepth>=m.minDepth)), atDepth);
    }
    const pool = isBoss ? BOSSES.filter(m=>depth>=m.minDepth) : null;
    const base = isBoss
      ? (pool[Math.floor(Math.random()*pool.length)] || BOSSES[0])
      : (pickTieredMonster(depth) || MONSTERS[0]);
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
      // 보스 예고 스킬/최후의 발악(사용자 요청 — 보스전 리뉴얼). 특정 스킬
      // 하나만 "필살기"로 지정하던 걸 없애고, 어떤 스킬이 나오든 매번
      // 예고되도록 바꿨다(combat/enemy-turn.js 참고) — pendingSkillKey에
      // "예고된 다음 턴 발동 예정 스킬"을 담아둔다.
      built.telegraphed = false; built.aboutToUltimate = false; built.pendingSkillKey = null;
      built.lastStandActive = false; built.lastStandTriggered = false;
      // 약점(사용자 요청 — 시범 3개 보스만). data/monsters.js의 BOSSES 데이터에
      // weakness가 있으면 그대로 옮겨 심는다(없으면 undefined로 아무 효과 없음).
      if(base.weakness) built.weakness = base.weakness;
    }
    return scaleEnemyForDifficulty(built);
  }

  // 사기꾼(jesterRiggedTable) "조작된 도박판" — 전투 시작 시 내 무작위
  // 스탯(공/마/방/속) 하나를 +12%, 적의 무작위 스탯(공/방/속) 하나를 -12%
  // 적용한다. 플레이어 쪽만 델타를 저장해뒀다가 되돌려야 한다(적은 전투마다
  // 새로 생성되므로 별도 복구 불필요) — 불확실성의 주사위 revertDiceDelta()와
  // 동일한 설계 원칙, 필드만 별도(player.riggedTableDelta)로 서로 안 겹치게.
  function revertRiggedTableDelta(){
    const d = player.riggedTableDelta;
    if(!d) return;
    if(d.atk) player.atk -= d.atk;
    if(d.def) player.def -= d.def;
    if(d.mag) player.mag -= d.mag;
    if(d.spd) player.spd -= d.spd;
    player.riggedTableDelta = null;
  }
  function applyRiggedTable(){
    if(!(player.skills && player.skills.includes('jesterRiggedTable'))) return null;
    const STAT_LABEL = {atk:'공격력', mag:'마력', def:'방어력', spd:'속도'};
    const playerStats = ['atk','mag','def','spd'];
    const enemyStats = ['atk','def','spd'];
    const pStat = playerStats[Math.floor(Math.random()*playerStats.length)];
    const eStat = enemyStats[Math.floor(Math.random()*enemyStats.length)];
    const before = player[pStat];
    player[pStat] = Math.round(player[pStat]*1.12);
    player.riggedTableDelta = {[pStat]: player[pStat]-before};
    if(enemy){
      enemy[eStat] = Math.max(0, Math.round(enemy[eStat]*0.88));
    }
    return {pStat, eStat, label:{p:STAT_LABEL[pStat], e:STAT_LABEL[eStat]}};
  }

  /* ============ 회랑 특수 조우 대사(사용자 요청 — 서사 통합) ============
     전투 세팅이 전부 끝난 뒤(startBattle() 맨 끝)에만 호출되는, 순수하게
     .dialogue-overlay(전체화면 고정 오버레이)를 얹는 방식이라 enemyTurn()/
     checkBattleEnd() 등 실제 전투 로직 체인은 전혀 건드리지 않는다.
     저장 데이터: player.corridorDialogueCount/witchClockDialogueCount는
     storage.js가 player 객체를 통째로 직렬화하므로 별도 마이그레이션 없이
     안전하다(구 세이브는 undefined -> ||0으로 처리). */

  // 회랑의 정령(ogre)만 칼리버 X 단계별로 다른 반응 — 깊이 스케일 상 1~3단계를
  // 전부 실제로 마주칠 수 있는 유일한 "회랑의 ○○" 몬스터라 여기서만 단계별
  // 분기를 둔다(나머지 7종은 사실상 항상 3단계 시점에만 마주치게 되어 있어
  // 단일 버전으로 충분하다는 사용자 확인 반영).
  const OGRE_KNIGHT_LINES_BY_STAGE = {
    caliberx_1: ['...익숙한 기운이군.', '아코스. 자네가 그 검을 들고 여기까지 올 줄은 몰랐네.'],
    caliberx_2: ['...아코스? ...자네, 눈빛이 예전 같지 않군.', '정말 자네가 맞나?'],
    caliberx_3: ['...누구지?', '아니, 아무것도 아니다. 지나가라.'],
  };
  // 회랑의 기사(paladin_knight) 전용 — 나머지 "회랑의 ○○" 몬스터 7종.
  const CORRIDOR_NPC_LINES = {
    egg: ['쩌적... 쩌적... 껍질 안쪽에서 무언가 웅얼거리는 소리가 새어 나온다.', '알아들을 수 있는 말은 아니지만, 어딘가 반가운 듯한 울림이다.'],
    golem: ['그 검... 낯이 익구먼. 예전에 성벽 보수를 같이 했던가.', '쓸데없는 소리였군. 어서 가시게, 여긴 자네가 있을 곳이 아니야.'],
    jack: ['오, 아코스 경 아니십니까! 제가 만든 인형들, 기억하십니까?', '왕자님께서 참 좋아하셨는데 말이죠...'],
    demon: ['하하, 아코스 경 아니신가! 마지막 공연이 아직도 안 끝났나 보군.', '다들 박수를 못 쳐서 안달인데 말이야.'],
    tome: ['그 검을 든 자여, 마녀의 이름은 이 책 어디에도 적혀 있지 않다.', '그녀는 애초에, 이름을 남기지 않는 자니까.'],
    tailor: ['아코스...? 그 갑옷, 아직도 몸에 맞는가 보군.', '...이럴 줄 알았으면 그때 옷깃 하나라도 제대로 여며줄걸 그랬어.'],
    hornbeast: ['크르릉... 컹!', '짐승 같은 울음소리 사이로, 언뜻 사람의 말이 섞여 나온다. "...도망쳐... 늦기 전에..."'],
  };
  // 마녀의 시계(relic_witchclock) 보유 시 — 직업 무관, 내레이션 톤(캐릭터 대사 아님).
  const WITCH_CLOCK_LINES = {
    boss: ['손목의 시계가 미세하게 떨린다.', '마치 저 너머의 무언가가, 그대가 쥔 시계를 알아본 것처럼.'],
    corridor: ['시계 초침이 한순간 멈췄다가, 다시 움직인다.', '그 몬스터의 눈이, 아주 잠깐 시계 쪽을 향했다.'],
  };

  // 회랑의 기사 전용 대사. 실제로 대사를 띄웠으면 true를 반환한다(마녀의 시계
  // 쪽과 같은 전투에서 중복으로 겹쳐 뜨는 것을 막기 위한 신호용).
  // 시간술사(mage_time)는 "회랑의 ○○" 몬스터를 개인적 인연이 아니라 "빌린
  // 힘의 동질감"으로 인식한다 — 회랑의 기사와 같은 카운터/확률을 공유한다.
  // 사용자 요청 — 런당 최대 2회 발동인데 대사가 하나뿐이면 똑같은 말을
  // 두 번 듣게 되어 어색함. 첫 발동/두 번째 발동에 각각 다른 대사가
  // 나오도록 2종으로 분리(무작위가 아니라 순서 고정 — 같은 대사가 연속
  // 두 번 나오는 걸 원천 차단).
  const TIME_MAGE_CORRIDOR_LINES = [
    ['...그 기운, 익숙하군.', '너도, 빌린 것이었나.'],
    ['...너에게서도 그 냄새가 난다.', '빌린 시간은, 언젠가 반드시 돌려줘야 하는 법인데.'],
  ];
  function maybeShowCorridorEncounterDialogue(){
    const isKnight = player.specialization === 'paladin_knight';
    const isTimeMage = player.specialization === 'mage_time';
    if(!isKnight && !isTimeMage) return false;
    if((player.corridorDialogueCount||0) >= 2) return false;
    const isCorridorMonster = enemy.type==='ogre' || !!CORRIDOR_NPC_LINES[enemy.type];
    if(!isCorridorMonster) return false;
    let lines, displayName = (MONSTERS.find(m=>m.type===enemy.type)||{}).name || '';
    if(isKnight){
      if(enemy.type === 'ogre'){
        const stage = (player.equipment && player.equipment.weapon) || 'caliberx_1';
        lines = OGRE_KNIGHT_LINES_BY_STAGE[stage] || OGRE_KNIGHT_LINES_BY_STAGE.caliberx_1;
      } else {
        lines = CORRIDOR_NPC_LINES[enemy.type];
      }
    } else {
      lines = TIME_MAGE_CORRIDOR_LINES[player.corridorDialogueCount||0] || TIME_MAGE_CORRIDOR_LINES[TIME_MAGE_CORRIDOR_LINES.length-1];
    }
    if(Math.random() >= 0.5) return false; // 만날 때마다 50%만 -> 런 전체에서 자연스럽게 1~2회로 수렴
    player.corridorDialogueCount = (player.corridorDialogueCount||0) + 1;
    saveGame();
    showDialogueSequence(lines, {title: displayName});
    return true;
  }

  // 일반 최종보스("잠식된 OO 용사")가 내 직업과 같을 때 — 파수꾼 시스템의
  // 무게감을 살리는 1회성 대사(빈도 조절 불필요 — 50층 최종보스는 런당 최대 1회).
  function maybeShowMirrorBossDialogue(isFinal, isTrueFinal){
    if(!isFinal || isTrueFinal) return false;
    if(!enemy.finalJobId || enemy.finalJobId !== player.job) return false;
    showDialogueSequence(
      ['저건... 나와 같은 길을 걷던 자였다.', '한때 자신과 같은 선택을 했을 누군가가, 지금은 회랑의 것이 되어 서 있다.'],
      {tone:'grand'}
    );
    return true;
  }

  // 마녀의 시계 보유 시 — 직업 무관. 회랑의 기사 전용 대사가 이미 떴다면 같은
  // 전투에서 중복으로 겹쳐 뜨지 않도록 건너뛴다.
  function maybeShowWitchClockDialogue(isBoss, isFinal){
    if(!(player.relics||[]).includes('relic_witchclock')) return;
    const isCorridorMonster = enemy.type==='ogre' || !!CORRIDOR_NPC_LINES[enemy.type];
    const isRegularBoss = isBoss && !isFinal;
    if(!isCorridorMonster && !isRegularBoss) return;
    if((player.witchClockDialogueCount||0) >= 2) return;
    if(Math.random() >= 0.5) return;
    player.witchClockDialogueCount = (player.witchClockDialogueCount||0) + 1;
    saveGame();
    showDialogueSequence(isRegularBoss ? WITCH_CLOCK_LINES.boss : WITCH_CLOCK_LINES.corridor, {title:'마녀의 시계'});
  }

  // 시간술사 + 마녀의 시계 동시 보유 — 직업 상호작용과 유물 상호작용이
  // 겹치는 유일한 조합이라, 둘 중 하나 대신 별도의 3번째 대사를 준다.
  // 가장 특별한 조합이므로 런당 1회만.
  const AION_RESONANCE_LINE = ['시계 초침과 그대의 마력이, 순간 같은 박자로 뛴다.', '마치 둘 다, 같은 곳에서 흘러나온 것처럼.'];
  function maybeShowAionResonanceDialogue(){
    if(player.specialization !== 'mage_time') return false;
    if(!(player.relics||[]).includes('relic_witchclock')) return false;
    const isCorridorMonster = enemy.type==='ogre' || !!CORRIDOR_NPC_LINES[enemy.type];
    if(!isCorridorMonster) return false;
    if((player.aionResonanceDialogueCount||0) >= 1) return false;
    if(Math.random() >= 0.5) return false;
    player.aionResonanceDialogueCount = (player.aionResonanceDialogueCount||0) + 1;
    saveGame();
    showDialogueSequence(AION_RESONANCE_LINE, {title:'???'});
    return true;
  }

  // 아코스의 유품("낡은 병사의 반지", 회랑의 정령 처치 시 드롭)을 착용한
  // 채로 회랑의 정령을 만나면 — 직업 무관. 회랑의 기사/시간술사 전용
  // 대사가 이미 떴다면(우선순위상 먼저 체크되므로) 겹치지 않는다.
  const KEEPSAKE_RECOGNITION_LINE = ['정령의 시선이 그대의 손끝에 머문다.', '"...그 반지, 어디서 났나. 설마 아직도 그 자리에 있었나."'];
  function maybeShowKeepsakeRecognitionDialogue(){
    if(enemy.type !== 'ogre') return false;
    if(!(player.equipment && player.equipment.accessory === 'r_achoskeepsake')) return false;
    if((player.keepsakeDialogueCount||0) >= 1) return false;
    if(Math.random() >= 0.7) return false;
    player.keepsakeDialogueCount = (player.keepsakeDialogueCount||0) + 1;
    saveGame();
    showDialogueSequence(KEEPSAKE_RECOGNITION_LINE, {title:'회랑의 정령'});
    return true;
  }

  // 직업/장비 무관 — 아무 "회랑의 ○○" 몬스터에게서나 낮은 확률로 뜨는
  // "엿듣기" 버전. 플레이어를 아코스로 착각하는 게 아니라, 그 이름이 아직도
  // 회랑 어딘가에 남아 떠돈다는 걸 보여주는 용도(런당 1회, 낮은 확률).
  const OVERHEARD_ACHOS_LINE = ['회랑의 몬스터가 허공에 대고 낮게 중얼거린다.', '"...아코스. 그 이름을 들은 지도 오래됐군."'];
  function maybeShowOverheardAchosDialogue(){
    const isCorridorMonster = enemy.type==='ogre' || !!CORRIDOR_NPC_LINES[enemy.type];
    if(!isCorridorMonster) return false;
    if((player.overheardAchosDialogueCount||0) >= 1) return false;
    if(Math.random() >= 0.3) return false;
    player.overheardAchosDialogueCount = (player.overheardAchosDialogueCount||0) + 1;
    saveGame();
    showDialogueSequence(OVERHEARD_ACHOS_LINE, {});
    return true;
  }

  // startBattle() 맨 끝에서 호출되는 진입점 — 우선순위: 거울 보스 > 아이온 공명 >
  // 회랑의 기사/시간술사 > 유품 착용자 > 엿듣기 > 마녀의 시계.
  function maybeShowSpecialEncounterDialogue(isBoss, isFinal, isTrueFinal){
    if(maybeShowMirrorBossDialogue(isFinal, isTrueFinal)) return;
    if(maybeShowAionResonanceDialogue()) return;
    if(maybeShowCorridorEncounterDialogue()) return;
    if(maybeShowKeepsakeRecognitionDialogue()) return;
    if(maybeShowOverheardAchosDialogue()) return;
    maybeShowWitchClockDialogue(isBoss, isFinal);
  }

  function startBattle(isBoss, isFinal, isTrueFinal){
    revertDiceDelta(); // 직전 전투의 불확실성의 주사위 효과가 남아있다면 먼저 되돌린다(안전망).
    revertRiggedTableDelta(); // 사기꾼 "조작된 도박판"도 동일한 안전망.
    // 공명 각인(we_resonance): 이전 전투의 마지막 기본 공격 피해가 이번
    // 전투로 넘어오지 않도록 초기화.
    player.lastBasicAtkDmg = 0;
    // 강철 군단장 리뉴얼 이전에 이미 축압 기술자로 전직했던 기존 세이브
    // 캐릭터도 여기서 자동으로 새 킷으로 마이그레이션된다(멱등 처리라 안전).
    if(typeof migrateLegionBaseSkills==='function') migrateLegionBaseSkills(player);
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
    battleFlags = {guardian:false, phoenix:false, firstStrikeUsed:false, execCount:0, execReady:false, gambleStacks:0, jackpotGauge:0, jackpotArmed:false, paladinAwoken:false, paladinUltUsed:false, hourglassTurn:0, witchClockUsedThisTurn:false, snakeskinUsed:false, revengeArmed:false, flaskStacks:0, diceEffect:null, rig:null, undyingArmorUsed:false, firstActionUsed:false, skillCooldowns:{}, cooldownTickPending:false, pressure:0, martyrReviveUsed:false};
    battleFlags.creed = null; battleFlags.creedStacks = 0;
    // 로봇군단장(mastery_multideploy)의 두 번째 로봇 슬롯, 데토네이터
    // (mastery_chaindetonate)의 기폭 스택 — 둘 다 매 전투 새로 초기화된다.
    battleFlags.rig2 = null;
    battleFlags.detonatorStacks = 0;
    // 강철 군단장 오메가 전용 슬롯 + 총사령관의 명령 버프도 매 전투 새로 초기화.
    battleFlags.omegaRig = null;
    battleFlags.legionCommandTurns = 0;
    battleFlags.legionCommandMult = 0;
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
    // 사기꾼(jesterRiggedTable) "조작된 도박판" — 전투 시작 시 자동 발동.
    // 실제 배너 연출(스핀 → 결과 두 줄)은 아래에서 showScreen('battle') 이후,
    // enemy가 화면에 다 세팅된 뒤에 재생한다(riggedTableResult 변수에 잠깐
    // 담아뒀다가 그 시점에 소비).
    const riggedTableResult = applyRiggedTable();
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
    // 층별보스 후광(사용자 요청 — 정예몹 pulse처럼 CSS만으로 가볍게, 이미지
    // 로딩 없음). 최종보스/진최종보스도 enemy.isBoss=true라 함께 적용된다.
    // 부유 애니메이션은 컨셉상 "떠 있는" 보스에만 준다(감시자의 석판/빈 옷의
    // 예언자/재봉인형/죄의 등롱 — 나머지는 그대로 둔 채 걷거나 서 있는
    // 컨셉이라 부유가 어색해서 뺐다).
    const isFloatingBoss = ['watchertablet','hollowprophet','threadmannequin','sinlantern'].includes(enemy.type);
    document.getElementById('bt-stage').className='enemy-stage'
      + (enemy.isElite?' elite':'')
      + (enemy.isBoss && !isTrueFinal?' boss-halo':'')
      + (isTrueFinal && enemy.type==='timewitch'?' witch-boss-halo':'')
      + (isTrueFinal && enemy.type!=='timewitch'?' true-boss-halo':'')
      + (enemy.isBoss && isFloatingBoss?' boss-float':'');
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
    // 사기꾼 "조작된 도박판" — 룰렛이 돌아가는 느낌으로, 내 스탯 상승과 적
    // 스탯 하락을 나란히 보여준다.
    if(riggedTableResult){
      showToast(`<h3>🎰 조작된 도박판</h3><p>당신의 ${riggedTableResult.label.p} +12%<br>${enemy.name}의 ${riggedTableResult.label.e} -12%</p>`, '#e6c34a');
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
    maybeShowSpecialEncounterDialogue(isBoss, isFinal, isTrueFinal);
  }
