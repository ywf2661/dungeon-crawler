"use strict";
/*
직업(클래스) 및 전직(레벨10 세분화) 데이터/조회 함수.
export(전역): JOBS, getJob, sortedPairKey, JOB_HYBRIDS, getHybrid, JOB_SPECIALIZATIONS,
              getSpecialization, needsSpecializationMigration, getJobLabel
의존성: getJob/getHybrid/getSpecialization은 인자로 받은 플레이어 유사 객체의 job/job2/specialization
       필드를 참조.
주의: JOB_HYBRIDS/getHybrid는 신규 전직 로직에서는 더 이상 쓰이지 않는다(레거시 세이브 감지 및
     과도기 라벨 표시용으로만 유지). 신규 전직은 JOB_SPECIALIZATIONS/getSpecialization을 쓴다.
*/

  /* ============ 직업(클래스) ============ */
  const JOBS = [
    {id:'warrior', name:'전사', icon:'⚔️',
      desc:'강인한 육체로 적을 압도하는 근접 전사. 체력과 방어력이 뛰어나다.',
      statMods:{maxhp:8, maxmp:-2, atk:3, def:2, mag:-3, spd:-1},
      skillLevels:{1:'powerstrike', 3:'guard', 5:'warcry', 7:'crushingblow', 10:'earthrend'}},
    {id:'mage', name:'마법사', icon:'🔮',
      desc:'원소 마법으로 적을 멀리서 불태우는 술사. 마력은 강하나 몸이 약하다.',
      statMods:{maxhp:-8, maxmp:10, atk:-3, def:-2, mag:6, spd:0},
      skillLevels:{1:'fireball', 3:'icelance', 5:'thunderbolt', 7:'blizzard', 10:'meteor'}},
    {id:'rogue', name:'도적', icon:'🗡️',
      desc:'빠른 몸놀림과 급소 공격으로 승부하는 자. 속도가 매우 빠르다.',
      statMods:{maxhp:-3, maxmp:0, atk:2, def:-2, mag:-2, spd:6},
      skillLevels:{1:'doubleslash', 3:'backstab', 5:'draintouch', 7:'shadowslash', 10:'assassinate'}},
    {id:'paladin', name:'성기사', icon:'🛡️',
      desc:'신성한 힘으로 자신과 전황을 지키는 수호자. 축복과 응징으로 전투의 흐름을 지배한다.',
      statMods:{maxhp:5, maxmp:4, atk:1, def:3, mag:1, spd:-3},
      skillLevels:{1:'judgment', 3:'paladinblessing', 5:'retributionoath', 7:'holylight', 10:'divinejudgment'}},
    {id:'mechanic', name:'메카닉', icon:'⚙️',
      desc:'포탑과 드론, 전투로봇을 전개해 함께 싸우는 기계공학자. 장치를 설치하고 가동하는 리듬으로 전투를 지배한다.',
      statMods:{maxhp:-4, maxmp:6, atk:0, def:-2, mag:5, spd:3},
      skillLevels:{1:'deployturret', 3:'maintenancepulse', 5:'deploydrone', 7:'detonate', 10:'omegaunit'}},
    {id:'jester', name:'도박사', icon:'🎭',
      desc:'숫자 대신 운명을 정면으로 다루는 자. 스킬마다 성패가 갈려, 잘 풀리면 누구보다 강력하지만 그만큼 위험도 확실하다.',
      statMods:{maxhp:-2, maxmp:2, atk:1, def:-3, mag:1, spd:2},
      skillLevels:{1:'coinflip', 3:'fateshift', 5:'wildcard', 7:'gamble', 10:'finalcard'}},
  ];
  function getJob(p){
    return JOBS.find(j=>j.id===(p&&p.job)) || JOBS[0];
  }
  function sortedPairKey(a,b){ return [a,b].sort().join('+'); }

  /* ---------- 전직(레벨10 하이브리드 직업) ---------- */
  const JOB_HYBRIDS = {
    'mage+paladin': {name:'현자',       icon:'📖', desc:'지혜와 신성한 힘을 함께 다루는 현자.',
      skills:{10:'sacredflame', 13:'blessedburst', 16:'starofjudgment'}},
    'mage+rogue':   {name:'그림자술사', icon:'🌑', desc:'그림자와 마법을 넘나드는 은밀한 술사.',
      skills:{10:'shadowstab', 13:'darkorb', 16:'abyssalscythe'}},
    'mage+warrior': {name:'마검사',     icon:'🌀', desc:'검과 마법을 동시에 다루는 전사.',
      skills:{10:'runeslash', 13:'flameblade', 16:'bladeofruin'}},
    'paladin+rogue':{name:'심판자',     icon:'⚖️', desc:'은밀함과 신성한 심판을 함께 쓰는 자.',
      skills:{10:'executionstrike', 13:'chainpunishment', 16:'finaljudgment'}},
    'paladin+warrior':{name:'성전사',   icon:'✝️', desc:'신념과 힘을 함께 두른 기사.',
      skills:{10:'holysmite', 13:'guardiansblessing', 16:'judgmentcharge'}},
    'rogue+warrior':{name:'광전사',     icon:'🪓', desc:'이성을 넘어선 힘을 휘두르는 전투광.',
      skills:{10:'frenziedflurry', 13:'bloodlust', 16:'executionersaxe'}},
    // 같은 직업을 다시 선택했을 때 — 한 길을 극한까지 파고든 마스터리 클래스
    'warrior+warrior':{name:'검성',     icon:'🗡️👑', desc:'검의 극의에 도달해 누구도 따를 수 없는 경지에 이른 전사.',
      skills:{10:'swordsaintstrike', 13:'swordsaintguard', 16:'swordsaintultimate'}},
    'mage+mage':{name:'대마법사',       icon:'🔮👑', desc:'세상의 모든 원소를 다스리는 마법의 정점.',
      skills:{10:'archmagebolt', 13:'archmagebarrier', 16:'archmageapocalypse'}},
    'rogue+rogue':{name:'그림자군주',   icon:'🌑👑', desc:'그림자 그 자체가 되어버린 암살의 극의.',
      skills:{10:'shadowlordstrike', 13:'shadowlorddrain', 16:'shadowlordexecute'}},
    'paladin+paladin':{name:'대성기사', icon:'🛡️👑', desc:'신의 축복을 온몸에 두른 수호의 화신.',
      skills:{10:'grandpaladinsmite', 13:'grandpaladinlight', 16:'grandpaladinaegis'}},
    // 메카닉 전직 조합 — 장치를 함께 전개해 싸운다는 것이 핵심 테마
    'mage+mechanic':{name:'연금기갑사', icon:'🔮⚙️', desc:'원소 마력을 두른 장치를 전개해 함께 싸우는 발명가.',
      skills:{10:'alchemicshot', 13:'elementalpayload', 16:'grandinvention'}},
    'mechanic+paladin':{name:'수호공학자', icon:'⚙️🛡️', desc:'신성한 힘을 두른 장치가 함께 싸우고 지켜주는 수호자.',
      skills:{10:'sanctifiedgear', 13:'purgingblast', 16:'judgmentengine'}},
    'mechanic+rogue':{name:'폭탄술사', icon:'⚙️🗡️', desc:'은신 장치와 함정을 전개해 적을 궁지로 모는 파괴 전문가.',
      skills:{10:'trapblade', 13:'shrapnelvolley', 16:'silentdetonation'}},
    'mechanic+warrior':{name:'기갑전사', icon:'⚙️⚔️', desc:'기계 장갑을 두르고 전선에 뛰어드는 돌격형 전사.',
      skills:{10:'gearcrusher', 13:'overloadslam', 16:'demolitionstrike'}},
    'mechanic+mechanic':{name:'종말기계', icon:'⚙️👑', desc:'모든 장치를 완벽히 통제하는 파괴 공학의 극치.',
      skills:{10:'masterworkshot', 13:'cascadingtoxin', 16:'worldenderprotocol'}},
    // 도박사 전직 조합 — 확률·베팅으로 파트너 직업의 색을 뒤섞는 것이 핵심 테마
    'jester+mage':{name:'환영술사', icon:'🎭🔮', desc:'환영과 확률을 뒤섞어 적을 현혹하는 술사.',
      skills:{10:'illusionbolt', 13:'mirageshift', 16:'grandillusion'}},
    'jester+mechanic':{name:'확률공학자', icon:'🎭⚙️', desc:'승률까지 조작하는 장치로 대박과 폭사를 오가는 발명가.',
      skills:{10:'riggedmine', 13:'overclockedluck', 16:'jackpotprotocol'}},
    'jester+paladin':{name:'심판의 도박사', icon:'🎭🛡️', desc:'신의 뜻마저 확률로 시험하는 이단적인 심판자.',
      skills:{10:'divinegamble', 13:'oathoffortune', 16:'judgmentcard'}},
    'jester+rogue':{name:'그림자 도박사', icon:'🎭🗡️', desc:'그림자 속에서 목숨을 걸고 승부를 거는 무법자.',
      skills:{10:'shadowbet', 13:'quickdraw', 16:'deathgamble'}},
    'jester+warrior':{name:'광기의 결투가', icon:'🎭⚔️', desc:'힘과 운을 동시에 시험하는 위험한 결투가.',
      skills:{10:'berserkcoin', 13:'warfateroar', 16:'lastwargamble'}},
    'jester+jester':{name:'운명의 지배자', icon:'🎭👑', desc:'운명 그 자체를 손에 쥔 궁극의 도박사.',
      skills:{10:'fatestrike', 13:'perfectodds', 16:'ultimategamble'}},
  };
  function getHybrid(p){
    if(!p || !p.job2) return null;
    return JOB_HYBRIDS[sortedPairKey(p.job, p.job2)] || null;
  }

  /* ---------- 전직(레벨10 세분화 — 본인 직업 내 2분기 선택) ----------
     구조 전환 1단계: 데이터 구조와 선택 UI만 마련한 상태. 각 분기의 마스터리
     패시브/액티브 스킬의 실제 수치·전투 로직(SKILLDB 항목)은 2단계에서 직업별로
     순차 구현 예정 — masterySkillId/activeSkillId는 그 시점에 채워질 SKILLDB
     키를 미리 지정해둔 것이며, 아직 SKILLDB에 해당 키가 없는 동안은
     resolveJobAdvancement()에서 자동으로 스킬 지급을 건너뛴다(방어적 처리). */
  const JOB_SPECIALIZATIONS = {
    warrior: [
      {id:'warrior_bloodpact', name:'혈맹의 검투사', icon:'🩸',
        desc:'피의 대가로 힘을 증폭시키는 광전사. 몸을 던질수록 위험해지지만, 그만큼 잔인해진다.',
        masteryName:'혈서', masteryDesc:'스킬 사용 시 HP를 태워 위력을 증폭시키는 선택지가 상시 열림. HP가 낮을수록 회피율 상승.', masterySkillId:'mastery_bloodpact',
        activeName:'저돌', activeDesc:'HP가 낮을수록 위력이 커지는 강타.', activeSkillId:'warriorBloodpactActive',
        // 2차 전직 후 레벨 12/15에 추가로 배우는 스킬(전직 컨셉을 이어감).
        // combat/battle-end.js의 grantExp()가 이 맵을 읽어 레벨업 시 자동 지급한다.
        skillLevels: {12:'warriorBloodrend', 15:'warriorBloodpactUltimate'}},
      // [교체됨] 기존 '인내의 파훼자(warrior_endurance)'를 대체하는 신규 분기.
      // 액티브 스킬이 없고, 레벨10/12/15에 걸쳐 패시브 3개만 습득한다(오직 기본
      // 공격만으로 싸우는 컨셉). activeName/activeDesc/activeSkillId를 모두 null로
      // 비워두었으며, combat/job-advancement.js의 resolveJobAdvancement()는
      // activeSkillId가 falsy면 지급을 건너뛰도록 이미 방어적으로 짜여 있어 추가
      // 수정 없이도 안전하다(단, 각성 안내 로그 문구는 activeName이 없을 때를 대비해
      // 별도로 손봐야 한다 — HANDOFF 참고).
      {id:'warrior_purist', name:'일격의 구도자', icon:'🎯',
        desc:'화려한 스킬 따위 필요 없다. 오직 검 한 자루, 일격 하나만을 극한까지 갈고닦은 구도자.',
        masteryName:'순일격', masteryDesc:'기본 공격의 피해가 항상 15% 증가한다.', masterySkillId:'mastery_purestrike',
        activeName:null, activeDesc:null, activeSkillId:null,
        // 레벨12: 메아리 타격(짝수 번째 기본 공격 강화), 레벨15: 쌍격의 파문(확률로
        // 기본 공격이 한 번 더 나감). 전부 combat/player-actions.js의 playerAttack()
        // 안에서 직접 처리한다.
        skillLevels: {12:'warriorPuristEcho', 15:'warriorPuristDoubleStrike'}},
    ],
    mage: [
      {id:'mage_pact', name:'계약술사', icon:'🎴',
        desc:'화염·빙결·번개, 셋 중 하나와 스스로 운명을 맺는 술사. 어떤 원소를 택하느냐에 따라 완전히 다른 마법사가 된다.',
        // 재설계: 기존엔 스킬 시전마다 화염/빙결/번개 중 하나가 "무작위"로 걸렸는데,
        // 사용자 요청으로 "스스로 선택하는 토글" 방식으로 바뀌었다. 마스터리 슬롯 하나가
        // 아니라 세 개의 토글 패시브(화염/빙결/번개계약)로 나뉘어, masterySkillId
        // (단수) 대신 masterySkillIds(복수, 배열)를 쓴다 — combat/job-advancement.js의
        // resolveJobAdvancement()가 이 필드를 확인해 셋 다 지급하도록 이미 고쳐져 있다.
        masteryName:'원소 계약', masteryDesc:'화염/빙결/번개 계약 중 하나를 선택해 토글(전투가 끝날 때까지 유지, 서로 배타적). 계약한 원소에 따라 이후의 원소 각인/원소 파동/원소 폭풍의 효과가 완전히 달라진다.',
        masterySkillIds:['mastery_firepact','mastery_icepact','mastery_lightningpact'],
        activeName:'원소 각인', activeDesc:'계약한 원소에 따라 전혀 다르게 작동하는 마법 공격(미계약 시 위력이 약함).', activeSkillId:'mageElementStrike',
        // 레벨12/15도 마찬가지로 계약 원소에 따라 분기한다.
        skillLevels: {12:'mageElementWave', 15:'mageElementStorm'}},
      {id:'mage_time', name:'시간술사', icon:'⏳',
        desc:'시간의 흐름 그 자체를 다루어, 남들보다 한 발 먼저 움직이는 술사.',
        masteryName:'시간 왜곡', masteryDesc:'매 턴 일정 확률로 자신 턴이 한 번 더 오거나 적 턴이 밀림(자동 발동).', masterySkillId:'mastery_timewarp',
        activeName:'가속 주문', activeDesc:'마법 피해를 입히는 동시에 적의 턴을 건너뛰고 다시 행동(연속 사용 시 MP 소모 급증).', activeSkillId:'mageHaste',
        // 레벨12/15는 시간 조각(battleFlags.timeStacks — 마스터리 발동 시, 가속 주문
        // 시전 시마다 최대 5개까지 쌓임) 시스템을 공유한다.
        skillLevels: {12:'mageTimeRewind', 15:'mageTimeParadox'}},
      {id:'mage_curseweaver', name:'저주술사', icon:'☠',
        desc:'저주받은 운명을 스스로 짊어지고, 그것을 오히려 힘으로 바꾸는 이단의 술사.',
        masteryName:'저주 계약', masteryDesc:'저주를 받아들일 때마다 마력이 영구히 오르고, 저주의 수치형 페널티는 절반만 적용됨.', masterySkillId:'mastery_curseweaver',
        activeName:'저주 폭발', activeDesc:'짊어진 저주 개수만큼 강력해지는 마법 공격.', activeSkillId:'mageCurseNova',
        // 레벨12/15 추가 스킬(혈맹의 검투사/일격의 구도자와 동일한 패턴 —
        // combat/battle-end.js의 grantExp()가 이 맵을 읽어 레벨업 시 자동 지급한다).
        skillLevels: {12:'mageCurseBrand', 15:'mageCurseBloom'}},
    ],
    rogue: [
      {id:'rogue_phantom', name:'환영검사', icon:'👥',
        desc:'그림자 속에 분신을 두고 함께 싸우는 환영 검사. 눈에 보이는 칼날은 언제나 하나가 아니다.',
        masteryName:'잔영', masteryDesc:'공격형 스킬 사용 시 확정적으로 분신 생성, 적 턴 직전 자동으로 50% 위력의 추가 공격.', masterySkillId:'mastery_afterimage',
        activeName:'그림자 쇄도', activeDesc:'분신과 함께 즉시 2연격(급소 확정 적중). 이 스킬 자체도 잔영을 발동시켜 다음 턴 분신 공격까지 예약된다.', activeSkillId:'rogueShadowStrike'},
      {id:'rogue_alchemist', name:'맹독 연금술사', icon:'⚗',
        desc:'맹독을 짙게 짜 넣어, 서서히 그러나 확실하게 무너뜨리는 연금술사. 한번 스며든 독은 좀처럼 빠지지 않는다.',
        masteryName:'독 중첩', masteryDesc:'적에게 쌓인 맹독이 매 라운드 자동으로 피해를 입힌다(전투가 끝날 때까지 지속, 최대 10스택).', masterySkillId:'mastery_venomstacks',
        activeName:'맹독 주입', activeDesc:'피해와 함께 독 스택을 쌓는다.', activeSkillId:'rogueVenomInject',
        // 레벨12/15는 독 중첩 시스템을 강화하는 패시브 2개.
        skillLevels: {12:'rogueVenomRefine', 15:'rogueVenomTriple'}},
    ],
    paladin: [
      {id:'paladin_martyr', name:'순교자', icon:'✝',
        desc:'자신의 생명력을 제물로 바쳐 영원한 힘을 얻는 순교자. 대가를 두려워하지 않는다.',
        masteryName:'희생의 맹세', masteryDesc:'특정 스킬 사용 시 최대HP를 영구히 깎는 대신 영구 스탯을 얻는 선택지가 상시 열림.', masterySkillId:'mastery_martyrvow',
        activeName:'심판의 빛', activeDesc:'공격 + 소량 자힐 복합기.', activeSkillId:'paladinJudgmentLight'},
      {id:'paladin_creed', name:'계율의 파수꾼', icon:'📜',
        desc:'스스로 세운 계율을 지키며 신념의 힘을 증명하는 파수꾼. 계율을 어기는 순간 모든 것이 무너진다.',
        masteryName:'계율', masteryDesc:'전투 시작 시 스스로 계율(예: 물약 사용 금지)을 선택, 유지 시 버프 스택 증가·어기면 즉시 상실.', masterySkillId:'mastery_creed',
        activeName:'축복의 벽', activeDesc:'몇 턴간 자신에게 피해 흡수 보호막.', activeSkillId:'paladinBlessedWall'},
    ],
    mechanic: [
      {id:'mechanic_legion', name:'로봇군단장', icon:'🤖',
        desc:'로봇 군단을 이끄는 지휘관. 홀로 싸우지 않는다 — 여러 기의 로봇과 함께 전장을 장악한다.',
        masteryName:'다중 전개', masteryDesc:'로봇을 여러 기 동시에 배치 가능. 대신 폭발 계열 스킬은 일절 사용 불가.', masterySkillId:'mastery_multideploy',
        activeName:'역할 배치', activeDesc:'정찰/화력/방벽 등 역할이 다른 로봇 한 기를 즉시 소환.', activeSkillId:'mechanicRoleDeploy'},
      {id:'mechanic_detonator', name:'데토네이터', icon:'💥',
        desc:'폭발 하나에 모든 것을 건다. 설치하고, 기다리고, 터뜨리는 데토네이터.',
        masteryName:'연쇄 기폭', masteryDesc:'설치된 폭발물 개수만큼 기폭 시 배율 자동 누적.', masterySkillId:'mastery_chaindetonate',
        activeName:'기폭', activeDesc:'설치된 폭발물을 한 번에 전부 터뜨림(범위 내 자신도 휘말릴 수 있음).', activeSkillId:'mechanicDetonate'},
    ],
    jester: [
      {id:'jester_rebel', name:'운명의 반란자', icon:'🎰',
        desc:'운명의 파도에 몸을 맡긴 반란자. 흐름을 거스르지 않고, 오히려 그 위에 올라탄다.',
        masteryName:'행운의 파도', masteryDesc:'매 턴 "운" 게이지가 자동으로 오르내리며 전투 전체 배율에 실시간 반영.', masterySkillId:'mastery_luckwave',
        activeName:'파도타기', activeDesc:'현재 운 게이지를 즉시 유리한 방향으로 크게 밀어붙임.', activeSkillId:'jesterRideWave'},
      {id:'jester_cardmaster', name:'패의 마술사', icon:'🃏',
        desc:'패를 손에 쥔 마술사. 하나둘 모이는 카드가 어떤 조합을 이룰지는 아무도 모른다.',
        masteryName:'패 획득', masteryDesc:'스킬 사용마다 자동으로 카드 한 장 획득, 조합 완성 시 강력한 효과 발동 가능.', masterySkillId:'mastery_drawcard',
        activeName:'패 교환', activeDesc:'원치 않는 카드 한 장을 즉시 새 카드로 교체.', activeSkillId:'jesterExchange'},
    ],
  };
  function getSpecialization(p){
    if(!p || !p.specialization) return null;
    const list = JOB_SPECIALIZATIONS[p.job];
    if(!list) return null;
    return list.find(s=>s.id===p.specialization) || null;
  }
  // 화면에 표시할 "직업 이름표"를 한 곳에서 결정한다. 전직(세분화)을 마쳤으면 그
  // 분기 이름(예: "혈맹의 검투사")을, 레거시 하이브리드 캐릭터면 하이브리드 이름을,
  // 둘 다 없으면 기본 직업 이름(예: "전사")을 반환한다.
  // 예전에는 화면마다 각자 getJob()/getHybrid()만 보고 라벨을 조립해서, 전직 후에도
  // "전사"로 계속 표시되는 버그가 여러 곳에 있었다(예: combat/battle-end.js의
  // showEnding()) — 앞으로 직업 이름을 표시할 일이 있으면 이 함수를 쓸 것.
  function getJobLabel(p){
    const spec = getSpecialization(p);
    if(spec) return `${spec.icon} ${spec.name}`;
    const hybrid = getHybrid(p);
    if(hybrid) return `${hybrid.icon} ${hybrid.name}`;
    const job = getJob(p);
    return `${job.icon} ${job.name}`;
  }
  // 구조 전환 이전(하이브리드 시스템)에 이미 전직을 마친 캐릭터인지 판별한다.
  // job2가 있는데 specialization이 없으면, 다음 접속 시 새 분기 중 하나를 다시 선택해야 한다.
  function needsSpecializationMigration(p){
    return !!(p && p.job2 && !p.specialization);
  }
