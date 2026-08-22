"use strict";
/*
직업(클래스) 및 전직(하이브리드 2차 직업) 데이터/조회 함수.
export(전역): JOBS, getJob, sortedPairKey, JOB_HYBRIDS, getHybrid
의존성: getJob/getHybrid는 인자로 받은 플레이어 유사 객체의 job/job2 필드를 참조.
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

