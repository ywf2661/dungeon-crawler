"use strict";
/*
전 직업 스킬 데이터베이스(정적 데이터, 로직 없음).
export(전역): SKILLDB
의존성: 없음(실제 스킬 실행 로직은 combat/player-actions.js의 playerSkill에 있음)
*/

  const SKILLDB = {
    // 전사
    powerstrike:    {name:'강타',         mp:3,  desc:'적에게 강력한 일격을 가한다',              type:'phys',    mult:1.7},
    guard:          {name:'방어태세',      mp:0,  desc:'다음 피해를 크게 줄인다',                  type:'guard'},
    warcry:         {name:'전투의 함성',   mp:5,  desc:'포효하여 3턴간 공격력을 크게 높인다',      type:'buff'},
    crushingblow:   {name:'분쇄의 일격',   mp:8,  desc:'무기를 내리찍어 강력한 피해를 입힌다',     type:'phys',    mult:2.3},
    earthrend:      {name:'대지분쇄',      mp:14, desc:'대지를 가르는 필살의 일격을 날린다',       type:'phys',    mult:3.0, cooldown:3},
    // 마법사
    fireball:       {name:'파이어볼',      mp:5,  desc:'화염 마법으로 적을 태운다',                type:'magic',   mult:1.9},
    icelance:       {name:'얼음창',        mp:7,  desc:'얼어붙는 냉기의 창을 꽂는다',              type:'magic',   mult:2.2},
    thunderbolt:    {name:'번개화살',      mp:9,  desc:'하늘의 벼락을 끌어내려 적을 꿰뚫는다',     type:'magic',   mult:2.5},
    blizzard:       {name:'블리자드',      mp:11, desc:'매서운 눈보라로 적을 몰아친다',            type:'magic',   mult:2.8},
    meteor:         {name:'메테오',        mp:14, desc:'강력한 유성을 떨어뜨린다',                 type:'magic',   mult:3.0, cooldown:3},
    // 도적
    doubleslash:    {name:'연속 베기',     mp:4,  desc:'빠르게 두 번 베어낸다',                    type:'multihit',mult:0.95, hits:2},
    backstab:       {name:'급소 찌르기',   mp:5,  desc:'적의 급소를 정확히 찔러 큰 피해를 입힌다', type:'phys',    mult:2.0},
    draintouch:     {name:'은신',         mp:8,  desc:'그림자에 몸을 숨긴다. 이번에 다가오는 적의 공격을 전부 피하고, 다음 자신의 공격(기본 공격/스킬 모두)에 피해 +30%가 붙는다',
      type:'stealth'},
    shadowslash:    {name:'그림자 베기',   mp:10, desc:'그림자처럼 스며들어 세 번 베어낸다',       type:'multihit',mult:0.85, hits:3},
    assassinate:    {name:'암살',          mp:15, desc:'모든 것을 걸고 치명적인 일격을 노린다',    type:'phys',    mult:3.4, cooldown:3},
    // 성기사
    judgment:       {name:'심판의 일격',   mp:4,  desc:'신성한 힘을 담아 적을 벌한다. 가한 피해의 일부를 흡수한다',   type:'phys',    mult:1.6, lifesteal:0.12},
    paladinblessing:{name:'축복의 인도',   mp:7,  desc:'성스러운 축복을 두른다. 3턴간 공격력이 오르고 받는 피해가 줄어든다',
      type:'dualbuff', turns:3, atkMult:1.25, defMult:0.8},
    retributionoath:{name:'응징의 맹세',   mp:8,  desc:'3턴간 적의 공격을 받을 때마다 40% 확률로 즉시 반격한다',
      type:'counterbuff', turns:3, chance:0.4},
    holylight:      {name:'신성한 빛',     mp:11, desc:'성스러운 빛으로 크게 회복한다',            type:'heal',    mult:0.8},
    divinejudgment: {name:'심판의 빛',     mp:15, desc:'신성한 빛의 심판을 내려 적을 무찌른다. 상태이상에 걸린 적일수록 더 강력하며 피해의 일부를 흡수한다',
      type:'phys',    mult:3.0, statusSynergyBonus:0.18, lifesteal:0.2, cooldown:3},
    // 메카닉(리뉴얼 — 사용자 요청) — 보일러 압력(0~100, battleFlags.pressure)을
    // 매 턴 자동으로 쌓고, 언제 어떻게 터뜨릴지 직접 판단하는 자원 관리형
    // 재설계. 기존 "장치 설치 → 자동 사격" 구조는 상태이상 DOT와 실질적으로
    // 다를 게 없다는 피드백을 반영했다. 압력을 100까지 채운 채 방출하지
    // 않고 넘기면 내 다음 턴 시작 시 자동으로 "폭주 방출"된다(combat/battle-fx.js
    // 의 resetCommandUI() 안 오버히트 체크 참고).
    mechanicIgnite: {name:'보일러 점화', mp:6, desc:'포탑을 가동한다. 배치 즉시 소량 피해와 함께 첫 사격도 동시에 나가고, 이후 3턴간 매 턴 피해와 함께 압력을 쌓는다(턴당 +18). 포탑의 사격은 방어력을 무시하며, 쌓인 압력이 높을수록 위력도 함께 강해진다',
      type:'deployrig', mult:0.3, rigKind:'turret', rigName:'자동 포탑', rigTurns:4, rigMult:0.65, rigPressurePerTick:18, pressureOnDeploy:15,
      instantFirstTick:true, pressureScaled:true, pressureScaleRate:0.006},
    mechanicValve: {name:'밸브 개방', mp:5, desc:'쌓인 압력을 전부 소모해, 압력량에 비례한 즉발 피해를 가한다(압력이 많을수록 강력)',
      type:'pressurevent', ventMode:'attack', minPressure:10, dmgPerPressure:0.028},
    mechanicMark: {name:'표적 마킹', mp:8, desc:'적에게 표식을 3턴간 남긴다. 표식이 걸린 동안 압력 방출 스킬(밸브 개방/안전밸브/과압 각성)의 위력이 25% 늘어난다',
      type:'mechmark', markTurns:3, markBonus:0.25},
    mechanicSafety: {name:'안전밸브', mp:6, desc:'쌓인 압력을 전부 소모해, 다음 피격 시 받는 피해를 압력량에 비례해 크게 줄인다',
      type:'pressurevent', ventMode:'defense', minPressure:10, defReducePerPressure:0.006, defReduceCap:0.6},
    mechanicOverpressure: {name:'과압 각성', mp:16, desc:'오메가 유닛을 투입하며 압력을 강제로 최대까지 끌어올려 그 자리에서 안전하게 전량 방출한다. 이후 오메가 유닛은 평소보다 훨씬 빠르게 압력을 만들어낸다',
      type:'overpressureult', mult:1.2, rigKind:'omega', rigName:'오메가 유닛', rigTurns:4, rigMult:0.4, rigPressurePerTick:30, shieldPct:0.3, dmgPerPressure:0.03, cooldown:3},
    // ---- 이하 구 메카닉 스킬(리뉴얼로 미사용, 참고용 보존) ----
    deployturret:   {name:'자동 포탑 설치', mp:6,  desc:'소형 포탑을 설치한다. 설치와 동시에 첫 사격을 가하고, 이후 3턴간 무엇을 하든 매 턴 자동으로 사격한다. 이미 가동 중인 장치가 있다면 교체된다',
      type:'deployrig', mult:1.0, rigKind:'turret', rigName:'자동 포탑', rigTurns:3, rigMult:0.85},
    maintenancepulse:{name:'정비 신호', mp:6,  desc:'가동 중인 장치가 있으면 지속시간을 늘리고 사격 위력을 강화한다. 장치가 없으면 대신 2턴간 공격력이 오른다',
      type:'rigsupport', extendTurns:2, boostMult:1.25, fallbackAtkMult:1.2, fallbackTurns:2},
    deploydrone:    {name:'정찰 드론 투입', mp:9,  desc:'정찰 드론을 띄운다. 포탑보다 한 발 한 발은 약하지만, 3턴간 적의 급소를 표시해 받는 모든 피해가 늘어난다. 이미 가동 중인 장치가 있다면 교체된다',
      type:'deployrig', mult:0.9, rigKind:'drone', rigName:'정찰 드론', rigTurns:3, rigMult:0.55, exposeTurns:3, exposePierce:0.25},
    detonate:       {name:'자폭 기동', mp:7,  desc:'가동 중인 장치를 그 자리에서 폭파시켜, 남은 가동력을 한꺼번에 쏟아붓는 즉발 피해로 바꾼다. 가동 중인 장치가 없으면 예비 폭발물을 대신 투척한다',
      type:'detonaterig', noRigMult:1.3, burstMult:2.2},
    omegaunit:      {name:'오메가 유닛 기동', mp:15, desc:'중장갑 전투로봇을 투입한다. 투입과 동시에 강력한 첫 사격을 가하고, 이후 4턴간 매 턴 강력하게 자동 사격하며 그동안 받는 피해의 일부를 로봇이 대신 막아준다',
      type:'deployrig', mult:1.6, rigKind:'omega', rigName:'오메가 유닛', rigTurns:4, rigMult:1.5, shieldPct:0.35},
    // 전직(하이브리드) 전용 스킬 — 직업 특색에 맞는 상태이상/특수효과 부여
    sacredflame:      {name:'신성한 화염',   mp:9,  desc:'성스러운 불꽃으로 적을 태우고, 신성한 화상을 남긴다',
      type:'magic',   mult:1.7, dot:{type:'burn', basis:'mag', ratio:0.4, turns:3, label:'신성한 화상'}},
    blessedburst:     {name:'축복의 폭발',   mp:10, desc:'성스러운 기운이 크게 몸을 회복시킨다',     type:'heal',    mult:1.0},
    starofjudgment:   {name:'심판의 별',     mp:14, desc:'하늘의 별을 떨어뜨려 심판하고, 격렬한 화상을 남긴다',
      type:'magic',   mult:2.8, dot:{type:'burn', basis:'mag', ratio:0.55, turns:3, label:'신성한 화상'}},
    shadowstab:       {name:'그림자 자상',   mp:9,  desc:'그림자 속에서 급소를 찔러 생명력을 흡수하고, 맹독을 주입한다',
      type:'drain',   mult:1.6, drainRatio:0.3, dot:{type:'poison', basis:'mag', ratio:0.35, turns:4, label:'중독'}},
    darkorb:          {name:'암흑구',        mp:10, desc:'어둠의 구체로 적을 꿰뚫고, 독기를 짙게 만든다',
      type:'magic',   mult:2.2, dot:{type:'poison', basis:'mag', ratio:0.45, turns:4, label:'중독'}},
    abyssalscythe:    {name:'심연의 낫',     mp:13, desc:'어둠의 낫으로 세 번 베어낸다. 중독된 적에게 특히 강력하다',
      type:'multihit',mult:0.85, hits:3, magic:true, executeVsStatus:'poison', executeVsStatusMult:1.45},
    runeslash:        {name:'룬 베기',       mp:8,  desc:'검에 화염 마력을 담아 벤다. 룬화염이 적을 태운다',
      type:'phys',    mult:1.7, dot:{type:'burn', basis:'mag', ratio:0.3, turns:3, label:'룬화염'}},
    flameblade:       {name:'화염검',        mp:9,  desc:'불타는 검으로 크게 베어내며 화상을 짙게 남긴다',
      type:'magic',   mult:2.1, dot:{type:'burn', basis:'mag', ratio:0.4, turns:3, label:'룬화염'}},
    bladeofruin:      {name:'파괴의 마검',   mp:12, desc:'방어를 일부 무시하는 파괴적인 일격. 마검의 불꽃이 크게 타오른다',
      type:'phys',    mult:2.6, defPierce:0.3, dot:{type:'burn', basis:'mag', ratio:0.5, turns:3, label:'룬화염'}},
    executionstrike:  {name:'처형의 일격',   mp:9,  desc:'약점을 정확히 찔러 방어를 일부 무시하고, 상처를 깊게 남긴다',
      type:'phys',    mult:2.0, defPierce:0.3, dot:{type:'bleed', basis:'atk', ratio:0.3, turns:3, label:'출혈'}},
    chainpunishment:  {name:'연쇄 처벌',     mp:9,  desc:'사슬처럼 빠르게 두 번 벌하며 상처를 남긴다',
      type:'multihit',mult:1.0, hits:2, dot:{type:'bleed', basis:'atk', ratio:0.25, turns:3, label:'출혈'}},
    finaljudgment:    {name:'최후의 심판',   mp:15, desc:'모든 것을 건 최후의 심판. 적의 체력이 낮거나 출혈 중이면 훨씬 강력하다',
      type:'phys',    mult:2.4, defPierce:0.3, executeBonus:{vsHpPct:0.3, mult:1.5}, executeVsStatus:'bleed', executeVsStatusMult:1.3},
    holysmite:        {name:'성스러운 강타', mp:8,  desc:'성스러운 힘을 담아 내려친다. 가한 피해의 일부를 자신도 회복한다',
      type:'phys',    mult:1.8, lifesteal:0.25},
    guardiansblessing:{name:'수호자의 축복', mp:9,  desc:'3턴간 받는 피해를 크게 줄인다',            type:'defbuff', turns:3, mult:0.5},
    judgmentcharge:   {name:'심판의 돌격',   mp:13, desc:'방어를 일부 무시하며 돌진해 적을 베고, 그 힘으로 상처를 회복한다',
      type:'phys',    mult:2.5, defPierce:0.25, lifesteal:0.2},
    frenziedflurry:   {name:'광란의 연타',   mp:8,  desc:'이성을 잃고 세 번 연속 베어낸다. 자신의 체력이 낮을수록 더 강력해진다',
      type:'multihit',mult:0.85, hits:3, selfHpBonusMax:0.6},
    bloodlust:        {name:'피의 갈증',     mp:10, desc:'적을 베어 생명력을 흡수한다',              type:'drain',   mult:1.8, drainRatio:0.45, basis:'atk'},
    executionersaxe:  {name:'처형자의 도끼', mp:14, desc:'방어를 크게 무시하는 필살의 도끼질. 피가 끓을수록(체력이 낮을수록) 더욱 강해진다',
      type:'phys',    mult:2.8, defPierce:0.35, selfHpBonusMax:0.7},
    // 마스터리(동일 직업 재선택) 전용 스킬 — 한 길을 극한까지 파고든 자만의 특색
    swordsaintstrike:   {name:'검성의 일격',   mp:8,  desc:'빈틈을 정확히 노려 방어를 일부 무시하는 완벽한 검격',
      type:'phys',    mult:1.9, defPierce:0.25},
    swordsaintguard:    {name:'완벽한 방어',   mp:9,  desc:'3턴간 받는 피해를 크게 줄인다',            type:'defbuff', turns:3, mult:0.5},
    swordsaintultimate: {name:'검신강림',      mp:16, desc:'검의 신이 강림한 듯한 필살의 일격. 방어를 크게 무시한다',
      type:'phys',    mult:3.2, defPierce:0.4},
    archmagebolt:       {name:'대마법사의 화살', mp:9, desc:'순수한 마력을 압축해 쏘아내고, 마력의 화상을 남긴다',
      type:'magic',   mult:1.8, dot:{type:'burn', basis:'mag', ratio:0.4, turns:3, label:'마력화상'}},
    archmagebarrier:    {name:'마력 방벽',     mp:10, desc:'마력으로 방벽을 둘러 피해를 크게 줄인다',  type:'defbuff', turns:3, mult:0.55},
    archmageapocalypse: {name:'멸계의 마법',   mp:18, desc:'세상을 뒤흔드는 궁극의 마법. 거대한 화상을 남긴다',
      type:'magic',   mult:3.0, dot:{type:'burn', basis:'mag', ratio:0.6, turns:3, label:'마력화상'}},
    shadowlordstrike:   {name:'그림자 일격',   mp:8,  desc:'그림자 속에서 소리없이 베어 맹독을 주입한다',
      type:'phys',    mult:1.8, dot:{type:'poison', basis:'atk', ratio:0.35, turns:4, label:'맹독'}},
    shadowlorddrain:    {name:'혼 흡수',       mp:10, desc:'적의 혼을 빨아들여 생명력으로 삼는다',     type:'drain',   mult:1.8, drainRatio:0.45},
    shadowlordexecute:  {name:'완전암살',      mp:17, desc:'그림자군주만이 도달할 수 있는 완전한 일격. 맹독에 걸린 적에게 치명적이다',
      type:'phys',    mult:3.0, executeVsStatus:'poison', executeVsStatusMult:1.5},
    grandpaladinsmite:  {name:'대성기사의 강타', mp:8, desc:'신성한 힘을 담은 묵직한 강타. 가한 피해의 상당 부분을 회복한다',
      type:'phys',    mult:1.8, lifesteal:0.3},
    grandpaladinlight:  {name:'대치유의 빛',   mp:10, desc:'축복의 빛으로 크게 회복한다',              type:'heal',    mult:0.9},
    grandpaladinaegis:  {name:'절대방어',      mp:12, desc:'4턴간 받는 피해를 압도적으로 줄인다',      type:'defbuff', turns:4, mult:0.4},
    // 연금기갑사(마법사+메카닉) — 원소 마력을 두른 장치를 전개한다
    alchemicshot:       {name:'원소 포탑 전개', mp:9,  desc:'원소 마력을 두른 포탑을 설치한다. 첫 사격에 화상을 남기고, 이후 3턴간 자동으로 원소탄을 사격한다',
      type:'deployrig', mult:1.1, rigKind:'turret', rigName:'원소 포탑', rigTurns:3, rigMult:0.9,
      dot:{type:'burn', basis:'mag', ratio:0.28, turns:3, label:'원소 화상'}},
    elementalpayload:   {name:'원소 과충전',   mp:11, desc:'가동 중인 장치에 원소 마력을 충전해 지속시간과 위력을 강화하며, 동시에 충전탄을 발사한다. 장치가 없으면 대신 공격력이 오른다',
      type:'rigsupport', extendTurns:2, boostMult:1.3, burstMult:1.3, fallbackAtkMult:1.2, fallbackTurns:2},
    grandinvention:     {name:'대발명 가동',   mp:16, desc:'가동 중인 장치를 극한까지 과충전해 자폭시킨다. 폭발과 함께 짙은 화상을 남기며, 장치가 없으면 예비 폭발물을 투척한다',
      type:'detonaterig', noRigMult:1.5, burstMult:2.4,
      dot:{type:'burn', basis:'mag', ratio:0.5, turns:3, label:'원소 화상'}},
    // 수호공학자(메카닉+성기사) — 신성한 힘을 두른 장치가 함께 싸우고 지켜준다
    sanctifiedgear:     {name:'신성 포탑 전개', mp:8,  desc:'신성한 힘을 두른 포탑을 설치한다. 첫 사격의 일부를 흡수해 회복하며, 이후 3턴간 받는 피해를 소폭 막아준다',
      type:'deployrig', mult:1.0, rigKind:'turret', rigName:'신성 포탑', rigTurns:3, rigMult:0.8, lifesteal:0.2, shieldPct:0.1},
    purgingblast:       {name:'정화 신호',     mp:10, desc:'가동 중인 장치를 정화하여 지속시간을 늘리고, 자신의 상처도 함께 회복한다. 장치가 없으면 대신 공격력이 오른다',
      type:'rigsupport', extendTurns:2, boostMult:1.2, healSelfRatio:0.12, fallbackAtkMult:1.2, fallbackTurns:2},
    judgmentengine:     {name:'심판의 엔진 가동', mp:14, desc:'가동 중인 장치를 심판의 엔진으로 폭발시켜 큰 피해를 주고, 그 힘의 일부를 회복한다. 장치가 없으면 예비 폭발물을 투척한다',
      type:'detonaterig', noRigMult:1.4, burstMult:2.2, lifesteal:0.25},
    // 폭탄술사(메카닉+도적) — 은신 장치와 함정으로 적을 궁지로 몬다
    trapblade:          {name:'은신 지뢰 설치', mp:9,  desc:'은밀한 지뢰를 설치한다. 첫 사격에 상처를 남기고, 이후 3턴간 자동으로 터진다',
      type:'deployrig', mult:1.1, rigKind:'turret', rigName:'은신 지뢰', rigTurns:3, rigMult:0.95,
      dot:{type:'bleed', basis:'atk', ratio:0.22, turns:3, label:'출혈'}},
    shrapnelvolley:     {name:'연쇄 뇌관 삽입', mp:10, desc:'설치된 장치에 연쇄 뇌관을 추가로 심어 지속시간과 위력을 강화하며, 동시에 파편탄을 날린다. 장치가 없으면 대신 공격력이 오른다',
      type:'rigsupport', extendTurns:2, boostMult:1.25, burstMult:1.2, fallbackAtkMult:1.25, fallbackTurns:2},
    silentdetonation:   {name:'침묵의 폭발',   mp:14, desc:'가동 중인 장치를 소리 없이 폭파시킨다. 적의 체력이 낮을수록 위력이 폭발적으로 증가한다. 장치가 없으면 예비 폭발물을 투척한다',
      type:'detonaterig', noRigMult:1.5, burstMult:2.3, executeThreshold:0.3, executeMult:1.6},
    // 기갑전사(메카닉+전사) — 기계 장갑을 두르고 전선에 뛰어드는 돌격형 전사
    gearcrusher:        {name:'기계 장갑 가동', mp:8,  desc:'자율 기계 장갑을 가동한다. 첫 격돌로 피해를 입히고, 이후 3턴간 자동으로 짓누르며, 2턴간 자신의 공격력도 함께 오른다',
      type:'deployrig', mult:1.1, rigKind:'turret', rigName:'기계 장갑', rigTurns:3, rigMult:0.85, selfAtkBuffTurns:2, selfAtkBuffMult:1.2},
    overloadslam:       {name:'과부하 돌격',   mp:10, desc:'가동 중인 장갑을 과부하시켜 지속시간과 위력을 강화하며, 그대로 몸을 던져 들이받는다. 장치가 없으면 대신 공격력이 오른다',
      type:'rigsupport', extendTurns:2, boostMult:1.3, burstMult:1.3, fallbackAtkMult:1.3, fallbackTurns:2},
    demolitionstrike:   {name:'해체의 일격',   mp:15, desc:'가동 중인 장갑의 동력을 전부 끌어내 방어를 크게 무시하는 필살의 일격을 꽂는다. 장치가 없으면 예비 폭발물을 투척한다',
      type:'detonaterig', noRigMult:1.6, burstMult:2.4, defPierceBonus:0.3},
    // 종말기계(메카닉 마스터리) — 모든 장치를 완벽히 통제하는 파괴 공학의 극치
    masterworkshot:     {name:'명공의 포탑 전개', mp:9,  desc:'명공이 벼려낸 포탑을 설치한다. 첫 사격부터 강력하며, 이후 4턴간 자동으로 사격한다',
      type:'deployrig', mult:1.3, rigKind:'turret', rigName:'명공의 포탑', rigTurns:4, rigMult:1.0},
    cascadingtoxin:     {name:'연쇄 정비',     mp:11, desc:'가동 중인 장치를 완벽히 정비해 지속시간과 위력을 크게 강화하며, 동시에 강력한 사격을 가한다. 장치가 없으면 대신 공격력이 크게 오른다',
      type:'rigsupport', extendTurns:3, boostMult:1.4, burstMult:1.4, fallbackAtkMult:1.35, fallbackTurns:3},
    worldenderprotocol: {name:'종말 프로토콜', mp:18, desc:'가동 중인 장치를 세상의 끝을 상정한 위력으로 폭파시킨다. 폭발 직후 곧바로 새로운 포탑이 무료로 재전개된다. 장치가 없으면 예비 폭발물을 투척한다',
      type:'detonaterig', noRigMult:1.8, burstMult:3.0, guaranteedRedeploy:true, redeployRigName:'명공의 포탑', redeployRigTurns:4, redeployRigMult:1.0},
    // 도박사 — 숫자 대신 운을 정면으로 다루는 고위험 고보상 직업
    // 1차 리뉴얼(사용자 요청 — 스킬끼리 시너지를 억지로 엮기보다, 각 스킬의
    // "확률 구조" 자체를 서로 다르게 만들어 결을 구분했다). 기존 id는 그대로
    // 재사용한다(메카닉 1차 리뉴얼 때와 동일한 패턴 — 저장 데이터 호환).
    coinflip: {name:'동전 던지기', mp:3,  desc:'운명의 동전을 던진다. 50% 확률로 4.06배의 피해를 입히고, 50% 확률로 완전히 빗나간다',
      // 밸런스 수정(사용자 제보 — "동전 던지기가 리스크 있는데 다른 1레벨
      // 스킬보다 약하다"): 기존 mult1.0/critMult2.0(기댓값 1.0배)는 확정
      // 히트인 다른 직업 1레벨 스킬들(1.6~1.9배)보다도 낮았다. mult1.4/
      // critMult2.9(기댓값 2.03배)로 상향 — 레벨1 노템 기준 시뮬레이션
      // 결과 강타(15)와 비슷한 기댓값(15)에 성공 시 파이어볼(22)보다도 센
      // 30딜이 나오는 걸 확인하고 확정.
      type:'coinflip', mult:1.4, chance:0.5, critMult:2.9, luck:true},
    // [리뉴얼] 운명 조작 → 야바위. 컵 게임처럼 3분기 판정(완전실패/적중/간파)이라
    // 동전 던지기의 단순 이진법과 확실히 다르다. "간파"는 exposedTurns/
    // exposePierce(기존 필드, data/equipment.js의 getEffectiveEnemyDef가 이미
    // 소비)를 재사용해 새 코드 없이 급소노출 효과를 낸다. 새 타입 'shellgame'.
    fateshift: {name:'야바위', mp:6, desc:'컵 안의 주사위를 재빠르게 섞는다. 완전히 놓치거나(무피해), 적당히 맞히거나(1.5배), 완벽하게 간파해(2.8배) 급소를 드러낼 수도 있다',
      type:'shellgame', missChance:0.34, hitChance:0.33, hitMult:1.5, greatMult:2.8, greatExposeTurns:2, greatExposePierce:0.2, luck:true},
    wildcard: {name:'운명의 주사위', mp:9,  desc:'운명의 주사위를 던진다. 나온 눈(1~6)이 클수록 강력한 피해를 입힌다',
      type:'dicecast', diceMults:[0.6,1.1,1.7,2.4,3.2,4.5], luck:true},
    // [리뉴얼] 도박 → 승부수. 기존 MP 전액 스테이크 구조는 그대로 두고 확률/
    // 배율만 극단으로 밀어붙였다(50%/3.6배 → 25%/7.0배) — 동전 던지기의
    // "무난한 반반"과 겹치지 않는 "거의 안 터지지만 터지면 판이 뒤집히는" 결.
    gamble: {name:'승부수', mp:8,  desc:'모든 것을 걸고 필사의 한 수를 던진다. 성공률은 낮지만(25%) 터지면 압도적인 피해가 터진다',
      type:'gamble', chance:0.25, mult:7.0, selfMult:2.0, luck:true},
    // [리뉴얼] 성공 시 자힐(healOnSuccessPct)을 추가 — 벼랑 끝에서 역전하는
    // 느낌을 강화했다. 나머지 HP 스케일링 구조는 그대로.
    finalcard: {name:'마지막 카드', mp:12, desc:'체력이 낮을수록 성공률과 배율이 극단적으로 치솟는 필살의 패. 실패해도 반동은 크지 않다. 성공하면 그 기세로 스스로도 크게 회복한다',
      type:'finalcard', baseChance:0.35, maxChance:0.95, baseMult:2.0, maxMult:6.0, defPierce:0.2, failSelfRatio:0.08, healOnSuccessPct:0.15, luck:true, cooldown:3},
    // 환영술사(도박사+마법사)
    illusionbolt:  {name:'환영의 화살', mp:8,  desc:'환영이 섞인 마력의 화살을 쏜다. 50% 확률로 2.4배의 피해와 화상을 입히고, 50% 확률로 완전히 빗나간다',
      type:'coinflip', magic:true, mult:1.3, critMult:2.4, chance:0.5, luck:true,
      dot:{type:'burn', basis:'mag', ratio:0.3, turns:3, label:'환영의 화상'}},
    mirageshift:   {name:'신기루의 조작', mp:10, desc:'신기루로 운명을 뒤틀어 다음 운 스킬의 성공 확률과 배율을 크게 끌어올리고, 소량 회복한다',
      type:'fateshift', chanceBonus:0.35, multBonus:0.7, selfHealRatio:0.15},
    grandillusion: {name:'대환영', mp:16, desc:'체력이 낮을수록 성공률과 배율이 치솟는 궁극의 환영. 성공 시 짙은 화상을 남긴다',
      type:'finalcard', magic:true, baseChance:0.4, maxChance:0.97, baseMult:2.4, maxMult:6.5, failSelfRatio:0.07,
      dot:{type:'burn', basis:'mag', ratio:0.5, turns:3, label:'환영의 화상'}},
    // 확률공학자(도박사+메카닉)
    riggedmine:      {name:'조작된 지뢰', mp:8,  desc:'승률을 조작한 지뢰를 설치한다. 50% 확률로 2.3배의 피해와 출혈을 남기고, 50% 확률로 불발된다',
      type:'coinflip', mult:1.3, critMult:2.3, chance:0.5, luck:true,
      dot:{type:'bleed', basis:'atk', ratio:0.3, turns:3, label:'출혈'}},
    overclockedluck: {name:'과부하 확률 조정', mp:10, desc:'장치를 과부하시켜 다음 운 스킬의 성공 확률과 배율을 극대화한다',
      type:'fateshift', chanceBonus:0.4, multBonus:0.8},
    jackpotprotocol: {name:'잭팟 프로토콜', mp:6,  desc:'가진 MP를 모두 걸고 장치를 가동한다. 성공하면 압도적인 피해와 중독을 남기고, 실패하면 폭발로 자신도 크게 다친다',
      type:'gamble', chance:0.5, mult:4.2, selfMult:2.0, luck:true,
      dot:{type:'poison', basis:'mag', ratio:0.4, turns:4, label:'중독'}},
    // 심판의 도박사(도박사+성기사)
    divinegamble:  {name:'신성한 베팅', mp:7,  desc:'신의 뜻을 시험하는 일격. 50% 확률로 2.4배의 피해를 입히고 그 일부를 흡수하며, 50% 확률로 완전히 빗나간다',
      type:'coinflip', mult:1.3, critMult:2.4, chance:0.5, luck:true, lifesteal:0.25},
    oathoffortune: {name:'행운의 맹세', mp:9,  desc:'운명과 신념을 함께 맹세해, 다음 운 스킬의 성공 확률과 배율을 높이고 2턴간 받는 피해를 줄인다',
      type:'fateshift', chanceBonus:0.3, multBonus:0.6, defBuffTurns:2, defBuffMult:0.75},
    judgmentcard:  {name:'심판의 마지막 패', mp:14, desc:'체력이 낮을수록 성공률과 배율이 치솟는 심판의 패. 성공 시 방어를 일부 무시하며 가한 피해의 일부를 회복한다',
      type:'finalcard', baseChance:0.4, maxChance:0.96, baseMult:2.2, maxMult:6.2, defPierce:0.3, lifesteal:0.2, failSelfRatio:0.06},
    // 그림자 도박사(도박사+도적)
    shadowbet: {name:'그림자 베팅', mp:6,  desc:'그림자 속에서 급소를 노린다. 50% 확률로 2.6배의 치명적인 피해를 입히고, 50% 확률로 완전히 빗나간다',
      type:'coinflip', mult:1.3, critMult:2.6, chance:0.5, luck:true},
    quickdraw: {name:'속임수의 패', mp:9,  desc:'재빠르게 패를 바꿔치기해, 다음 운 스킬의 성공 확률과 배율을 크게 끌어올린다',
      type:'fateshift', chanceBonus:0.35, multBonus:0.7},
    deathgamble: {name:'생사의 도박', mp:5, desc:'목숨을 걸고 가진 MP를 모두 배팅한다. 성공하면 압도적인 피해를 입히지만, 실패하면 반동이 매우 크다',
      type:'gamble', chance:0.5, mult:4.6, selfMult:2.6, luck:true},
    // 광기의 결투가(도박사+전사)
    berserkcoin: {name:'광전의 동전', mp:6,  desc:'몸을 던져 승부를 건다. 50% 확률로 2.3배의 피해를 입히며 체력이 낮을수록 더 강력해지고, 50% 확률로 완전히 빗나간다',
      type:'coinflip', mult:1.3, critMult:2.3, chance:0.5, luck:true, selfHpBonusMax:0.5},
    warfateroar: {name:'투사의 확신', mp:9, desc:'확신에 찬 함성으로, 다음 운 스킬의 성공 확률과 배율을 크게 끌어올린다',
      type:'fateshift', chanceBonus:0.35, multBonus:0.7},
    lastwargamble: {name:'최후의 결투', mp:5, desc:'모든 MP를 걸고 필사의 결투를 벌인다. 성공하면 압도적인 피해를 입히지만, 실패하면 큰 반동을 입는다',
      type:'gamble', chance:0.5, mult:4.4, selfMult:2.4, luck:true},
    // 운명의 지배자(도박사 마스터리)
    fatestrike: {name:'운명의 일격', mp:6,  desc:'운명을 완전히 장악한 일격. 60% 확률로 2.8배의 피해를 입히고, 40% 확률로 빗나간다',
      type:'coinflip', mult:1.3, critMult:2.8, chance:0.6, luck:true},
    perfectodds: {name:'완벽한 확률', mp:10, desc:'운명을 완벽히 조작해, 다음 운 스킬의 성공 확률과 배율을 극한까지 끌어올린다',
      type:'fateshift', chanceBonus:0.45, multBonus:0.9},
    ultimategamble: {name:'궁극의 패', mp:16, desc:'체력이 낮을수록 성공률과 배율이 극단으로 치솟는, 운명 그 자체의 패. 실패해도 반동은 미미하다',
      type:'finalcard', baseChance:0.45, maxChance:0.99, baseMult:2.6, maxMult:7.5, defPierce:0.25, failSelfRatio:0.05},

    // ---------- 전직 2차 세분화(JOB_SPECIALIZATIONS) ----------
    // 전사 - 혈맹의 검투사(warrior_bloodpact)
    // 마스터리 "혈서": 액티브 스킬이 아니라 상시 켜고 끄는 토글(player-actions.js).
    // 켜두면 다음 스킬 사용 시 HP를 태워 위력을 증폭시키고, HP가 낮을수록 회피율도
    // 오른다(combat/enemy-turn.js의 getBloodPactDodgeBonus).
    mastery_bloodpact: {name:'혈서', mp:0, type:'arm', armFlag:'bloodPactArmed', icon:'🩸',
      armMsgOn:'혈서가 켜졌다. 전투가 끝나거나 직접 끌 때까지, 스킬을 쓸 때마다 HP를 태워 위력이 증폭된다.',
      armMsgOff:'혈서가 꺼졌다.',
      desc:'켜두면 전투가 끝나거나 직접 끌 때까지, 스킬을 쓸 때마다 HP 15%를 태워 위력을 크게 증폭시킨다. HP가 낮을수록 회피율도 오른다.'},
    warriorBloodpactActive: {name:'저돌', mp:6, desc:'앞뒤 재지 않고 돌진해 벤다. 체력이 낮을수록 위력이 크게 오른다',
      type:'phys', mult:1.6, selfHpBonusMax:0.9},
    // 레벨12 "혈인": 혈서처럼 선택적(토글)이 아니라, 쓸 때마다 확정으로 HP를 태우는
    // 스킬(hpCostPct — 최대HP 기준 비율, player-actions.js의 범용 phys/magic 분기에서
    // 공용으로 처리). 저돌보다 한 단계 무거운 피의 대가를 요구하는 대신 짙은 출혈도 남긴다.
    warriorBloodrend: {name:'혈인', mp:8, desc:'스스로의 피를 무기에 둘러 벤다. 최대HP의 12%를 확정으로 소모하는 대신 강력한 피해를 입히고 짙은 출혈을 남긴다',
      type:'phys', mult:2.2, hpCostPct:0.12, dot:{type:'bleed', basis:'atk', ratio:0.35, turns:3, label:'출혈'}},
    // 레벨15 궁극기 "혈옥쇄": 최대HP의 50%를 제물로 바치는 필살기(HP 1은 항상 남도록
    // player-actions.js에서 방어적으로 클램프한다).
    warriorBloodpactUltimate: {name:'혈옥쇄', mp:14, desc:'자신의 생명력 절반을 제물로 바쳐 필멸의 일격을 꽂는다. 최대HP의 50%를 소모하는 대신(HP 1은 항상 남는다) 압도적인 피해를 입힌다',
      type:'phys', mult:4.5, defPierce:0.35, hpCostPct:0.5},

    // 전사 - 인내의 파훼자(warrior_endurance) — [삭제됨, 레거시 호환용으로만 유지]
    // 이 분기는 JOB_SPECIALIZATIONS.warrior에서 제거되어 더 이상 새로 선택할 수 없다
    // (일격의 구도자로 대체됨). 다만 이미 이 분기를 선택해 mastery_endurance/
    // warriorEnduranceActive를 습득한 기존 캐릭터가 있을 수 있으므로, 해당 캐릭터가
    // 계속 정상 동작하도록 SKILLDB 항목 자체는 그대로 남겨둔다(삭제 시 플레이어의
    // 저장 데이터에 남은 스킬 키가 SKILLDB에서 사라져 오류가 날 수 있음).
    mastery_endurance: {name:'인내', mp:0, type:'passive',
      desc:'피격당할 때마다 자동으로 "인내" 스택을 얻는다(전투 중에만 유지).'},
    warriorEnduranceActive: {name:'파훼일격', mp:5, desc:'그동안 쌓아온 인내 스택을 모두 소모해, 쌓인 만큼 강력한 필살기를 꽂는다. 스택이 없으면 위력이 크게 줄어든다',
      type:'enduranceburst', baseMult:1.2, stackMult:0.35, defPierce:0.2},

    // 전사 - 일격의 구도자(warrior_purist) — 인내의 파훼자를 대체하는 신규 분기.
    // 액티브 스킬 없이 오직 패시브 3개(레벨10 마스터리 + 레벨12 + 레벨15)만으로
    // 기본 공격(playerAttack) 하나를 극한까지 파고든다. 세 패시브 모두 combat/
    // player-actions.js의 playerAttack() 안에서 직접 처리하며, 스킬 사용을 아예
    // 요구하지 않으므로 "오직 기본 공격만 쓸 수 있는 직업"이라는 컨셉에 맞춰
    // 셋 다 type:'passive'로 두었다(직접 선택해도 턴을 소모하지 않고 설명만 표시).
    mastery_purestrike: {name:'순일격', mp:0, type:'passive',
      desc:'기본 공격의 피해가 항상 30% 증가한다.'},
    // 레벨12: 기본 공격 횟수를 세어(전투마다 초기화) 2번째·4번째·6번째… 짝수 번째
    // 타격마다 추가로 강하게 들어간다(player-actions.js의 battleFlags.basicAtkCount).
    warriorPuristEcho: {name:'메아리 타격', mp:0, type:'passive',
      desc:'기본 공격을 두 번째 낼 때마다(2타/4타/6타…) 25% 더 강하게 꽂힌다.'},
    // 레벨15: 기존에 이미 존재하는 "일정 확률로 기본 공격이 한 번 더 나가는" 시스템
    // (희귀 장비의 doubleStrikeChance와 완전히 동일한 메커니즘)에 확률을 얹어서
    // 재사용한다 — player-actions.js의 doubleChance 계산부에 그대로 합산.
    warriorPuristDoubleStrike: {name:'쌍격의 파문', mp:0, type:'passive',
      desc:'기본 공격 시 반드시 한 번 더 공격한다. 두 번째 타격의 위력은 50%.'},

    // 마법사 - 계약술사(mage_pact)
    // 마스터리 "원소 계약": 마법 스킬을 시전할 때마다 화염/빙결/번개 중 하나를 무작위로
    // "계약"해 그 자리에서 추가 효과가 실린다(player-actions.js의 magic 분기에서 처리).
    // 원래 기획은 "매 턴 시작 시" 계약이지만, 턴 시작을 감지하는 훅이 다른 파일(플레이어
    // 턴이 실제로 언제 열리는지 결정하는 UI/전투 흐름 파일)에 있어서 지금은 "마법 스킬을
    // 실제로 쓸 때마다 그 즉시 계약을 굴리는" 방식으로 단순화했다. 한 턴에 마법 스킬을
    // 한 번만 쓰는 게 보통이라 체감상 큰 차이는 없지만, 정확한 "턴 시작" 시점 훅으로
    // 바꾸려면 플레이어 턴이 다시 열리는 지점(resetCommandUI 호출부)을 정의한 파일을
    // 확인해야 한다.
    mastery_elementpact: {name:'원소 계약', mp:0, type:'passive',
      desc:'마법 스킬을 시전할 때마다 화염/빙결/번개 중 하나와 무작위로 계약해, 그 자리에서 추가 효과가 실린다.'},
    mageChainExplosion: {name:'연쇄폭발', mp:10, desc:'압축한 마력을 폭발시킨다. 적에게 걸린 상태이상 종류가 많을수록 더 강력하다',
      type:'magic', mult:2.0, statusSynergyBonus:0.35},
    // 레벨12 "삼원소 연격": 마스터리(원소 계약)는 화염/빙결/번개 중 하나만 무작위로
    // 걸리는데, 이 스킬은 확률과 무관하게 세 원소 효과를 전부 동시에 발동시킨다
    // (화염=도트는 s.dot으로 범용 처리, 빙결/번개는 combat/player-actions.js의
    // key==='mageTripleElement' 전용 블록에서 확정 적용 — 순교자의
    // paladinJudgmentLight와 동일한 "스킬 id로 특정해 훅을 건다" 패턴 재사용).
    mageTripleElement: {name:'삼원소 연격', mp:11, desc:'화염·빙결·번개를 동시에 압축해 쏟아붓는다. 확률과 무관하게 세 원소 효과가 전부 함께 발동한다',
      type:'magic', mult:1.7,
      dot:{type:'burn', basis:'mag', ratio:0.32, turns:3, label:'삼원소: 화염'}},
    // 레벨15 궁극기 "원소 붕괴": 연쇄폭발(상태이상 종류 수만큼 배율)과 달리, 이번엔
    // 적에게 걸린 상태이상들을 실제로 "수확"해서 터뜨리고 전부 제거한다 — 출처가
    // 무엇이든(원소 계약의 화상, 삼원소 연격의 화상, 다른 분기의 독/출혈 등) 상관없이
    // enemy.dots에 남아있는 모든 상태이상의 잔여 피해량 합계에 비례해 폭딜이 나온다.
    // 새 스킬 타입 'dotdetonate'로 처리한다(combat/player-actions.js 참고).
    mageElementalCollapse: {name:'원소 붕괴', mp:15, desc:'적에게 걸린 모든 상태이상을 한꺼번에 붕괴시켜 터뜨린다. 상태이상이 많이 걸려있고 남은 지속시간이 길수록 훨씬 강력하며, 붕괴한 상태이상은 모두 사라진다',
      type:'dotdetonate', baseMult:1.0, dotMult:1.8},

    // ---------- [교체됨] 위 4개(mastery_elementpact/mageChainExplosion/
    // mageTripleElement/mageElementalCollapse)는 계약술사(mage_pact)의 구버전
    // 키트다. 사용자 요청으로 "무작위 계약"에서 "스스로 선택하는 토글 계약"으로
    // 전면 재설계했다 — data/jobs.js의 mage_pact는 이제 아래 신규 키들을 가리킨다.
    // 구버전 4개는 삭제하지 않고 그대로 남겨둔다(레거시 세이브 크래시 방지 원칙,
    // 전사 인내의 파훼자 교체 때와 동일).
    //
    // 화염/빙결/번개계약(mastery_firepact/icepact/lightningpact): 서로 배타적인
    // 토글 3개. battleFlags.elementPact('fire'|'ice'|'lightning'|null)에 저장되며,
    // 하나를 켜면 다른 계약은 자동으로 꺼진다. 전투가 끝날 때까지(= battleFlags가
    // 새로 생성될 때까지) 유지된다. 새 스킬 타입 'elementpact'로 처리한다
    // (combat/player-actions.js 참고). combat/ui/battle-fx.js의 openSub()가 이
    // 타입(과 기존 'arm' 타입)을 자동으로 가로 토글 버튼 줄로 그린다.
    mastery_firepact: {name:'화염계약', mp:0, type:'elementpact', pactElement:'fire', icon:'🔥',
      desc:'화염과 계약한다(전투가 끝날 때까지 유지, 다른 원소 계약과 배타적). 이후 원소 각인/원소 파동/원소 폭풍이 화염 전용 효과로 발동한다.'},
    mastery_icepact: {name:'빙결계약', mp:0, type:'elementpact', pactElement:'ice', icon:'❄',
      desc:'빙결과 계약한다(전투가 끝날 때까지 유지, 다른 원소 계약과 배타적). 이후 원소 각인/원소 파동/원소 폭풍이 빙결 전용 효과로 발동한다.'},
    mastery_lightningpact: {name:'번개계약', mp:0, type:'elementpact', pactElement:'lightning', icon:'⚡',
      desc:'번개와 계약한다(전투가 끝날 때까지 유지, 다른 원소 계약과 배타적). 이후 원소 각인/원소 파동/원소 폭풍이 번개 전용 효과로 발동한다.'},
    // 원소 각인(레벨10 액티브): 화염=강한 화상+중간 피해, 빙결=방어 무시 없는
    // 고배율 단일 강타, 번개=2연속 타격(관통은 약함). 계약이 없으면 위력이
    // 눈에 띄게 약하다(계약을 먼저 하도록 유도). 새 타입 'elementstrike'.
    mageElementStrike: {name:'원소 각인', mp:9, type:'elementstrike',
      desc:'계약한 원소를 무기에 아로새긴다. 화염은 짙은 화상, 빙결은 고배율 단일 강타, 번개는 2연속 타격. 계약이 없으면 위력이 크게 약하다.'},
    // 원소 파동(레벨12 액티브): 화염=쌓인 화상의 잔여 피해량만큼 즉시 폭발(화상이
    // 없으면 약한 대체 공격), 빙결=2턴간 자체 방어력 상승, 번개=다음 공격 확정
    // 치명타 부여(player.lightningCritArmed, 기본 공격/범용 phys·magic 분기에서
    // 소모됨). 새 타입 'elementwave'.
    mageElementWave: {name:'원소 파동', mp:11, type:'elementwave',
      desc:'계약한 원소의 힘을 파동으로 흘려보낸다. 화염은 쌓인 화상을 한꺼번에 터뜨리고, 빙결은 2턴간 방어력이 오르며, 번개는 다음 공격이 반드시 급소에 꽂히게 한다.'},
    // 원소 폭풍(레벨15 궁극기): 화염=초강력 화상+큰 피해, 빙결=방어 완전 무시
    // 초고배율 강타, 번개=3연속 타격(관통 있음). 계약 없으면 여전히 약함(궁극기까지
    // 계약 없이 쓰는 것을 강하게 억제). 새 타입 'elementstorm'.
    mageElementStorm: {name:'원소 폭풍', mp:16, type:'elementstorm',
      desc:'계약한 원소의 힘을 폭풍처럼 몰아친다. 화염은 압도적인 화상과 피해, 빙결은 방어를 완전히 무시하는 필살의 일격, 번개는 방어를 꿰뚫는 3연속 타격. 계약이 없으면 궁극기라 하기 민망할 정도로 약하다.'},

    // 마법사 - 시간술사(mage_time)
    // 마스터리 "시간 왜곡": 기존 "마녀의 시계" 유물과 완전히 동일한 메커니즘(매 턴
    // 일정 확률로 적 턴을 건너뛰고 한 번 더 행동)이라, combat/enemy-turn.js의 기존
    // enemyTurn() 확률 체크에 그대로 얹어서 재사용한다(같은 "이번 턴 이미 사용함" 안전
    //장치를 공유 — 유물과 마스터리를 동시에 가져도 한 턴에 추가 행동은 최대 1회).
    mastery_timewarp: {name:'시간 왜곡', mp:0, type:'passive',
      desc:'매 턴 20% 확률로 시간이 뒤틀려, 적의 턴을 건너뛰고 자신이 한 번 더 행동한다(자동 발동).'},
    mageHaste: {name:'가속 주문', mp:14, desc:'시간을 압축해 벼락같이 몰아친다. 마법 피해를 입히는 동시에, 시간이 뒤틀려 적의 턴을 건너뛰고 곧바로 다시 행동할 수 있게 된다. 같은 전투에서 연달아 쓸수록 시간을 거스르는 대가가 가파르게 불어난다(재사용마다 소모 MP 1.8배). 시전할 때마다 시간 조각을 하나 얻는다(최대 5)',
      type:'haste', mult:1.5, comboCostMult:1.8},

    // 레벨12 "시간 역행": 스택을 소비하지 않고 "조건"으로만 쓴다(사용자 확정) —
    // 시간 조각이 3개 이상 쌓여 있어야 사용 가능하며, 사용해도 조각은 그대로
    // 남는다. 부족하면 MP를 그대로 환불하고 스킬 자체를 취소한다.
    mageTimeRewind: {name:'시간 역행', mp:12, type:'timerewind', stackRequirement:3,
      desc:'시간 조각이 3개 이상 쌓여 있어야 쓸 수 있다(소비하지 않음). 시간을 되돌려 HP와 MP를 가득 채운다.'},
    // 레벨15 궁극기 "시간의 역설": 쌓인 시간 조각을 전부 소비해 조각 수에 비례한
    // 폭딜을 넣는다(풀스택 5개면 마력 4.0배 — 저주술사/전사의 다른 궁극기와
    // 비슷한 급의 위력). 조각이 없으면 기본 배율(1.0배)만 나온다.
    mageTimeParadox: {name:'시간의 역설', mp:18, type:'timeparadox', baseMult:1.0, stackMult:0.6,
      desc:'쌓아온 시간 조각을 모두 소비해 그 힘을 한꺼번에 무너뜨려 적을 덮친다. 조각이 많을수록(최대 5개) 압도적으로 강력하다.'},

    // 마법사 - 저주술사(mage_curseweaver) — 마법사의 3번째 분기. JOB_SPECIALIZATIONS는
    // 배열이라 직업당 분기 수가 고정이 아니며, 전직 UI(job-advancement.js)도 배열
    // 길이만큼 그대로 카드를 그리므로 이 분기를 3번째로 추가해도 별도 구조 변경이
    // 필요 없다.
    // 마스터리 "저주 계약": 저주 제단(relics.js의 showCurseAltar)에서 저주를 받아들일
    // 때마다 마력이 영구히 4 오르고, 그 저주의 수치형 페널티(퍼센트/고정치)는 절반만
    // 적용된다. 실제 처리는 relics.js의 applyRelicEffect()에서 한다(온오프형 봉인
    // 효과인 굶주린 회랑/침묵의 서약은 "절반"의 의미가 없어 그대로 적용됨 — 설계상
    // 의도적 범위 제한).
    mastery_curseweaver: {name:'저주 계약', mp:0, type:'passive',
      desc:'저주 제단에서 저주를 받아들일 때마다 마력이 영구히 4 오른다. 받아들이는 저주의 수치형 페널티(퍼센트/고정치)도 절반만 적용된다.'},
    // 액티브 "저주 폭발": 보유한 저주 개수만큼 배율이 곱해지는 마법 공격(스택당 +25%,
    // combat/enemy-turn.js의 applySkillModifiers()에서 처리 — 기존 statusSynergyBonus와
    // 동일한 패턴).
    mageCurseNova: {name:'저주 폭발', mp:9, desc:'짊어진 저주의 힘을 한꺼번에 쏟아낸다. 저주를 많이 짊어질수록 훨씬 강력하다',
      type:'magic', mult:1.6, curseCountBonus:0.25},
    // 레벨12 "저주 전가": 저주 폭발과 마찬가지로 curseCountBonus를 그대로 재사용하므로
    // (combat/enemy-turn.js의 applySkillModifiers()가 이미 처리함) player-actions.js에
    // 새 코드가 전혀 필요 없다 — 데이터 추가만으로 끝난다. 여기에 더해 s.dot도 기존
    // 범용 phys/magic 파이프라인이 자동으로 처리하는 필드라, 저주형 도트를 남기는
    // 부분도 신규 로직 없이 그대로 동작한다(dot 타입은 poison을 재사용 — 기존에
    // 완전히 지원되는 타입이라 이펙트/사운드가 안전하게 뜬다. 별도 'curse' 타입을
    // 새로 만들면 연출이 지원 안 될 위험이 있어 피했다).
    // 레벨12 "저주의 표식": 저주 폭발과 달리 단순 데미지 증폭이 아니라, 적에게
    // 낙인을 하나씩 새기는 스킬이다(battleFlags.curseMarkStacks, 최대 5, 전투 내내
    // 유지). 데미지는 일부러 약하게 잡았다 — 이 스킬의 진짜 목적은 낙인을 쌓는
    // 것이고, 실제 보상은 레벨15 "저주 회수"에서 터진다. 새 스킬 타입 'cursemark'로
    // 처리한다(combat/player-actions.js 참고). 저주 폭발/천 개의 저주(마법 공격+
    // curseCountBonus+dot 반복)와는 완전히 다른 텍스처를 주기 위해, 첫 시도(마법
    // 공격+저주 개수 배율+도트)를 폐기하고 "낙인 → 회수" 2단 콤보로 다시 설계했다.
    mageCurseMark: {name:'저주의 표식', mp:7, desc:'적의 영혼에 저주의 표식을 새긴다. 그 자체로는 위력이 크지 않지만, 낙인은 전투가 끝날 때까지 쌓여 남는다(최대 5)',
      type:'cursemark', mult:1.1},
    // 레벨15 궁극기 "저주 회수": 쌓인 낙인을 전부 소모해 낙인 수에 비례한 강력한
    // 일격을 꽂는다(인내의 파훼자 warriorEnduranceActive의 baseMult+stackMult
    // 패턴을 그대로 재사용). 낙인이 없는 상태로 쓰면 기본 위력만 나온다 — "먼저
    // 표식을 새겨야 의미가 있는" 콤보 구조. 새 스킬 타입 'cursereap'으로 처리한다.
    mageCurseReap: {name:'저주 회수', mp:14, desc:'적에게 새겨둔 저주의 표식을 한꺼번에 거둬들인다. 표식이 많이 쌓여 있을수록 압도적으로 강력하며, 표식이 없으면 위력이 크게 줄어든다',
      type:'cursereap', baseMult:0.8, stackMult:0.55, defPierce:0.2},

    // ---------- [교체됨] 위 2개(저주의 표식/저주 회수)는 사용자 피드백으로 폐기된
    // 구버전이다 — "낙인→회수" 콤보가 마스터리/액티브(내가 짊어진 저주 개수로
    // 강해진다)와 무관한 별도 자원(적에게 새기는 마크)이라 저주술사 정체성과
    // 겉돌았고, 마침 새로 만든 맹독 연금술사의 "적에게 쌓이는 스택" 시스템과도
    // 컨셉이 겹쳤다("저주 도트딜이라도 줘야 되는 거 아니냐"는 지적도 있었음).
    // 구버전은 삭제하지 않고 남겨둔다(레거시 세이브 크래시 방지).
    //
    // 새 설계 — "내가 짊어진 저주가 곧 적에게 새기는 저주가 된다": 마스터리/
    // 저주 폭발과 동일하게 getCurseCount()(내가 저주 제단에서 받아들인 저주 개수,
    // 최대 4)를 그대로 힘의 원천으로 쓴다. 별도의 새 자원(마크/스택)을 만들지 않고
    // 기존 enemy.dots(도트) 시스템만 재사용한다.
    //
    // 레벨12 "저주 각인": 마법 피해 + 적에게 저주(포이즌 타입 도트) 부여. 도트의
    // 세기(ratio)와 직접 피해 배율 둘 다 내 저주 개수에 비례해 세진다 — 요청하신
    // "저주 도트딜"을 실제로 구현한 것. 새 타입 'cursebrand'로 처리한다.
    mageCurseBrand: {name:'저주 각인', mp:10, type:'cursebrand', mult:1.3, curseCountBonus:0.15,
      dotBaseRatio:0.25, dotRatioPerCurse:0.08, dotTurns:4,
      desc:'짊어진 저주의 파편을 뜯어내 적의 살에 아로새긴다. 저주를 많이 짊어질수록 피해도 크고, 새겨지는 저주도 더 짙고 오래간다.'},
    // 레벨15 궁극기 "저주 만개": 내 저주 개수에 비례한 큰 피해 + 저주 각인이 남긴
    // 도트가 아직 남아있으면 그 잔여 피해량까지 한꺼번에 터뜨리고 소모한다(신규
    // 계산 로직 없이 원소 붕괴의 "잔여 도트 피해량 = dmgPerTurn×turns" 방식을
    // 그대로 재사용). "각인으로 심고, 만개로 거둔다"는 실제 콤보가 생기지만,
    // 각인 없이 바로 써도(내 저주 개수만으로) 준수한 위력은 나온다. 새 타입
    // 'cursebloom'으로 처리한다.
    mageCurseBloom: {name:'저주 만개', mp:17, type:'cursebloom', baseMult:1.6, curseCountBonus:0.3,
      desc:'짊어진 저주를 한꺼번에 만개시켜 적을 덮친다. 저주를 많이 짊어질수록 폭발적으로 강력하며, 저주 각인으로 새겨둔 저주가 남아있다면 그 힘까지 함께 터진다.'},

    // 도적 - 환영검사(rogue_phantom)
    // 마스터리 "잔영": 스킬로 적에게 피해를 입힐 때마다 25% 확률로 분신이
    // 생성되어 battleFlags.afterimagePending을 세운다. 적의 턴이 열리기 직전
    // (combat/enemy-turn.js의 enemyTurn() → triggerAfterimageStrike())에 분신이
    // 자동으로 한 번 더 공격한 뒤, 적의 턴은 정상적으로 이어진다.
    // 설계 범위(수정): 원래는 기본 공격에만 한정했으나, 기본 공격을 잘 쓰지 않을
    // 것 같다는 이유로 "스킬로 피해를 입혔을 때"로 발동 조건을 옮겼다
    // (player-actions.js의 범용 phys/magic 분기, multihit 분기 참고).
    // 도적 - 환영검사(rogue_phantom) — 리뉴얼: "환영+은신" 컨셉을 실제로 살리도록
    // 마스터리를 확정 발동으로 바꾸고, 액티브를 순수 확정 치명타에서 은신+분신 예약
    // 콤보로 재설계했다. (참고: 재설계 전 버전은 SKILLDB 설명에 "25% 확률"이라고
    // 적혀 있었지만, combat/player-actions.js에 실제로 그 확률을 체크해
    // battleFlags.afterimagePending을 세우는 코드 자체가 없어서 사실상 발동하지
    // 않고 있었다 — 이번 재설계로 실제 동작하는 코드까지 함께 정리했다.)
    mastery_afterimage: {name:'잔영', mp:0, type:'passive',
      desc:'공격형 스킬을 사용할 때마다 분신이 나타나, 적의 턴이 오기 직전 자동으로 효과 공격력의 50%로 한 번 더 공격한다(확정 발동).'},
    // 환영 은신: 직접 피해는 없는 순수 세팅형 액티브. 2턴간 받는 피해를 크게 줄이고,
    // 동시에 분신 하나를 즉시 예약한다(마스터리의 "공격 스킬 사용 시" 조건과 무관하게
    // 이 스킬 자체가 예약을 강제로 건다) — 은신 직후 그림자가 따라와 한 번 더
    // 때려준다는 그림.
    // 환영 은신(defbuff, 순수 세팅형)이 밋밋하다는 피드백을 받아 "그림자 쇄도"로
    // 교체했다. multihit 타입 + guaranteedCritMult를 그대로 재사용한 것뿐이라
    // 신규 코드가 전혀 필요 없다(둘 다 이미 검증된 범용 메커니즘). 게다가 이 스킬
    // 자체도 multihit 분기를 타므로, 잔영 마스터리의 "공격형 스킬 사용 시 확정
    // 예약" 조건에 자동으로 걸린다 — 즉 이 스킬 한 번으로 즉발 2타(자신+분신이
    // 동시에 베는 연출) + 예약된 분신 1타(적 턴 직전)까지, 사실상 3연타가 나온다.
    rogueShadowStrike: {name:'그림자 쇄도', mp:9, desc:'그림자 속에서 분신이 즉시 튀어나와 함께 베어낸다. 자신과 분신이 동시에 두 번 급소를 노린다',
      type:'multihit', mult:1.15, hits:2, guaranteedCritMult:1.3},
    // 레벨12 "분신 배가": 지속 토글이 아니라 "다음 공격형 스킬 1회"에만 적용되는
    // 1회성 예약이다(사용자 확정). 예약 중 공격형 스킬(예: 두번베기)을 쓰면,
    // 잔영이 평소처럼 1번(50%)만 재현되는 게 아니라 2번, 그것도 더 강한 비율
    // (boostedRatio)로 연달아 재현된다("두번베기 이펙트가 총 3번 발생" — 즉발 1번
    // + 잔영 재현 2번). 소모되면 다시 눌러야 하며(턴은 소모하지 않음), 이 예약이
    // 걸린 공격은 백귀야행의 재료(잔영 발동 누적 횟수)도 평소 1이 아니라 2만큼
    // 오른다 — "잔영이 2번 나타난 것"을 그대로 카운트에 반영한 것. 새 타입
    // 'doubleimagenext'로 처리한다.
    rogueDoubleImage: {name:'분신 배가', mp:8, type:'doubleimagenext', boostedRatio:0.65,
      desc:'그림자를 겹쳐 짠다(턴을 소모하지 않음). 다음 공격형 스킬을 쓰면 잔영이 한 번이 아니라 두 번, 그것도 더 강하게 나타나 그 스킬의 효과를 재현한다. 한 번 쓰면 소모되며, 다시 걸지 않으면 다음 공격은 평소처럼 잔영이 한 번만 나타난다.'},
    // 레벨15 궁극기 "백귀야행": 이번 전투에서 잔영(마스터리)이 발동했던 누적
    // 횟수(battleFlags.afterimageTriggerCount — 분신 배가가 걸린 공격은 2씩,
    // 평범한 공격은 1씩 누적)만큼 분신이 동시에 몰아친다. 확정 발동 마스터리
    // 기준으로 세는 것이라 "운"이 아니라 "이번 전투에서 얼마나 적극적으로
    // 싸웠는가(+분신 배가를 잘 활용했는가)"에 정직하게 비례한다. 사용 후 카운트는
    // 0으로 초기화된다. 새 타입 'nightparade'로 처리한다.
    rogueUndeadParade: {name:'백귀야행', mp:20, type:'nightparade',
      desc:'이번 전투에서 쌓아온 잔영의 흔적을 모두 불러내, 그 횟수만큼 분신 군단이 동시에 적을 몰아친다. 오래, 적극적으로 싸울수록(분신 배가를 잘 활용했을수록) 압도적으로 강력해진다.'},

    // 도적 - 맹독 연금술사(rogue_alchemist)
    // 마스터리 "삼중 조제": 스킬로 적에게 피해를 입힐 때마다 독 3종(맹독/독액/역병) 중
    // 무작위 하나가 battleFlags.triplePoison에 축적된다. 세 종류가 모두 채워진 뒤 다시
    // 스킬로 피해를 입히면, 그 자리에서 자동으로 폭발 효과가 발동해 추가 피해를 입히고
    // 축적은 초기화된다(player-actions.js 참고). 잔영과 동일한 이유로 발동 조건을
    // "기본 공격"에서 "스킬로 피해를 입혔을 때"로 옮겼다.
    mastery_triplepoison: {name:'삼중 조제', mp:0, type:'passive',
      desc:'스킬로 적에게 피해를 입힐 때마다 독 3종 중 하나가 무작위로 축적된다. 3종이 모두 채워진 뒤 다시 피해를 입히면 자동으로 폭발 효과가 발동한다.'},
    // 촉매 주입: 원 기획은 "원하는 독 하나"를 직접 지정하는 것이지만, 이를 위한 선택
    // UI가 없어(계약술사의 원소 계약과 동일한 종류의 설계 타협) 부족한 독 중 하나를
    // 무작위로 채우는 것으로 단순화했다. 세 종류가 이미 다 채워져 있으면 폭발 없이
    // 안내 메시지만 표시하고 턴은 그대로 소모한다.
    rogueCatalyst: {name:'촉매 주입', mp:4, type:'catalyst',
      desc:'부족한 맹독 중 하나를 즉시 채운다(무작위). 세 종류가 이미 모두 채워져 있으면 다음 스킬 적중에서 자동으로 폭발한다.'},

    // ---------- [교체됨] 맹독 연금술사(rogue_alchemist, 표시명은 이제 "독사")
    // 완전 재설계 ----------
    // 위 2개(mastery_triplepoison/rogueCatalyst)는 구버전 "3종 독 축적→폭발" 키트다.
    // 사용자 요청으로 "독 스택을 계속 쌓아 전투 내내 지속적으로 괴롭히는" 컨셉으로
    // 전면 교체했다. 구버전은 삭제하지 않고 남겨둔다(레거시 세이브 크래시 방지).
    // (2차 조정: 스택당 데미지가 너무 약하다는 피드백에 따라 스택당 기본 배율과
    // 독성 정제 배율을 상향하고, 마스터리를 "기본 공격/모든 스킬 적중 시에도
    // 스택이 쌓이는" 방식으로 확장했다 — 아래 각주 참고.)
    //
    // 마스터리 "독 중첩": 두 가지 역할을 겸한다. (1) enemy.venomStacks(0~10, 전투가
    // 끝날 때까지 유지 — 일반 dot과 달리 턴이 지나도 사라지지 않음)를 매 라운드
    // 자동으로 틱시키는 순수 패시브 피해원(combat/enemy-turn.js의 enemyTurnReal()
    // 에서 처리, 기존 dot 연출 파이프라인 재사용). (2) 사용자 추가 요청 —
    // 기본 공격과 그 외 모든 도적 스킬이 적중할 때마다 스택을 +1 쌓는다(맹독
    // 주입 자신은 이 범용 훅을 타지 않고 별도의 더 큰 자기 몫을 준다 — 아래
    // rogueVenomInject 참고). combat/player-actions.js의 playerAttack()/범용
    // phys·magic 분기/multihit 분기 세 곳에 이 훅이 들어가 있다. 스택 수는
    // 화면에서 적 상태 배지 영역에 "☠ 독중첩 N/10"으로 표시된다.
    mastery_venomstacks: {name:'독 중첩', mp:0, type:'passive',
      desc:'기본 공격과 모든 스킬이 적중할 때마다 적에게 독이 스며든다(+1스택). 쌓인 맹독은 매 라운드 자동으로 피해를 입히며, 스택이 많을수록 피해도 커진다(최대 10, 전투가 끝날 때까지 지속).'},
    // 레벨10 액티브 "맹독 주입": 피해를 입히는 동시에 독 스택을 "추가로 더" 쌓는다
    // (마스터리의 범용 +1과는 별개의 자기 전용 보너스 — 기본 1, 레벨15를 배우면 3).
    // 새 스킬 타입 'venominject'로 처리한다.
    rogueVenomInject: {name:'맹독 주입', mp:6, type:'venominject', mult:1.4,
      desc:'적에게 상처를 내고 그 틈으로 맹독을 주입한다. 피해와 함께 독 스택이 추가로 1(레벨15를 배웠다면 3) 더 쌓인다.'},
    // 레벨12 패시브 "독성 정제": 스택당 매 라운드 피해량 자체를 증폭시킨다(스택
    // 개수를 늘리는 게 아니라 "한 스택의 위력"을 강화 — 레벨15의 "스택을 더 많이
    // 쌓는" 효과와 명확히 구분되는 축). combat/enemy-turn.js의
    // getVenomDmgPerStack()에서 이 패시브 보유 여부를 확인해 배율을 곱한다.
    // (밸런스 조정: 다른 2차 전직 대비 과하게 강해 +90%→+30%로 하향 —
    // combat/enemy-turn.js의 getVenomDmgPerStack() 주석 참고)
    rogueVenomRefine: {name:'독성 정제', mp:0, type:'passive',
      desc:'맹독을 더 짙고 치명적으로 정제한다. 독 스택 하나하나의 매 라운드 피해량이 늘어난다(+30%).'},
    // 레벨15 패시브 "삼중 주입": 맹독 주입의 "자기 전용 보너스"가 1이 아니라
    // 3씩 쌓이게 한다(마스터리의 범용 +1은 별개로 항상 따로 적용됨 — 즉 맹독
    // 주입 한 번으로 최종 1+3=4스택까지 쌓일 수 있다). player-actions.js의
    // rogueVenomInject 핸들러에서 이 패시브 보유 여부를 확인한다.
    rogueVenomTriple: {name:'삼중 주입', mp:0, type:'passive',
      desc:'맹독 주입을 사용할 때마다 독 스택이 추가로 3개씩(기본 1개 대신) 쌓인다(최대 10은 동일).'},

    // 성기사 - 순교자(paladin_martyr)
    // 마스터리 "희생의 맹세": 혈서(mastery_bloodpact)와 동일한 상시 토글형(arm) 스킬이다.
    // 다만 혈서는 이번 전투에서만 유효한 임시 위력 증폭인 반면, 희생의 맹세는 실제로
    // player.maxhp/player.atk를 영구히 바꾼다(세이브에도 그대로 반영될 것으로 예상되나,
    // storage.js를 열어 실제 저장/복원까지 확인하지는 않았다 — player 객체 필드를 직접
    // 바꾸는 것뿐이라 별도 저장 로직 추가는 필요 없을 것으로 보임). 범위를 좁히기 위해
    // 액티브 스킬(심판의 빛)을 사용할 때만 발동하도록 한정했다(player-actions.js 하단
    // 범용 phys/magic 분기 참고 — 혈서처럼 모든 스킬에 걸리지 않고 이 스킬 하나에만 걸림).
    mastery_martyrvow: {name:'희생의 맹세', mp:0, type:'arm', armFlag:'martyrVowArmed', icon:'✝',
      armMsgOn:'맹세가 켜졌다. 다음 심판의 빛 사용 시 최대HP를 영구히 깎는 대신 영구히 강해진다.',
      armMsgOff:'맹세가 꺼졌다.',
      desc:'다음 심판의 빛 사용 시 최대HP 8%를 영구히 깎는 대신 공격력을 영구히 3 올릴지 여부를 켜고 끈다.'},
    paladinJudgmentLight: {name:'심판의 빛', mp:7, desc:'적을 강타하고 그 힘의 일부로 소량 회복한다. 희생의 맹세가 켜져 있다면 최대HP를 영구히 깎는 대신 영구히 강해진다',
      type:'phys', mult:1.6, lifesteal:0.2},

    // 성기사 - 계율의 파수꾼(paladin_creed)
    // 마스터리 "계율": 전투 시작 시 두 계율(물약 사용 금지 / 기본 공격 금지) 중 하나를
    // 무작위로 자동 선택한다(combat/battle-setup.js의 startBattle() — 원 기획은 "스스로
    // 선택"이지만 선택 UI가 없어 무작위 자동 선택으로 단순화했다. 계약술사/촉매 주입과
    // 동일한 종류의 설계 타협). 계율을 지키는 행동을 할 때마다(player-actions.js) 스택이
    // 쌓여 공격력이 오르고(combat/enemy-turn.js의 effectiveAtk), 어기는 순간 스택이 즉시
    // 0으로 초기화된다.
    mastery_creed: {name:'계율', mp:0, type:'passive',
      desc:'전투 시작 시 계율(물약 사용 금지 또는 기본 공격 금지)을 자동으로 선택한다. 지킬수록 공격력이 오르고(스택당 +5%, 최대 +25%), 어기면 즉시 상실한다.'},
    paladinBlessedWall: {name:'축복의 벽', mp:8, desc:'몇 턴간 자신을 감싸는 보호막을 둘러 받는 피해를 크게 줄인다',
      type:'defbuff', turns:3, mult:0.55},

    // ---------- 회랑의 기사(paladin_knight) — 계율의 파수꾼을 대체하는 신규 분기 ----------
    // "성기사로 시작했지만, 전직과 함께 강제로 손에 넣은 전용무기 칼리버 X의 정체가
    // 레벨이 오를 때마다 서서히 드러나는" 서사 중심 직업. 마스터리는 순수 서사/
    // 자동장착 트리거 역할(직접 발동 로직 없음 — 실제 강제장착/재장비는
    // combat/job-advancement.js와 combat/battle-end.js에서 처리). 무기(칼리버 X)
    // 자체는 data/equipment.js의 CALIBERX_STAGES 3단계.
    mastery_caliberx: {name:'칼리버 X', mp:0, type:'passive',
      desc:'전직과 동시에 전용 무기 칼리버 X가 강제로 장착된다. 다른 무기로 교체하거나 해제할 수 없다. 레벨이 오를 때마다 검 자체가 다음 단계로 변해간다.'},
    // 레벨10 "성휘참": 정석적인 성기사의 성검 기술처럼 보인다 — 신성한 빛, 방어
    // 관통, 소량 흡혈. 기존 phys 타입의 mult/defPierce/lifesteal 필드를 그대로
    // 쓰므로 신규 코드가 필요 없다.
    paladinHolyRend: {name:'성휘참', mp:8, type:'phys', mult:1.8, defPierce:0.15, lifesteal:0.15,
      desc:'칼리버 X에 신성한 빛을 모아 적을 강하게 베어낸다. 성스러운 힘으로 자신의 상처를 함께 치유한다.'},
    // 레벨12 "검은 기도": HP를 대가로 바치고 검의 힘을 빌린다 — 2턴간 공격력이
    // 크게 오르지만, 동시에 방어력도 함께 떨어진다("신성한 힘이라면 이런 대가가
    // 있을 리 없는데?"라는 위화감을 메커니즘으로도 표현). 새 타입 'darkprayer'로
    // 처리한다(combat/player-actions.js). 부여된 공/방 변동치는 정확히 저장해뒀다가
    // combat/enemy-turn.js의 매 라운드 카운트다운에서 정확히 되돌린다(불확실성의
    // 주사위 revertDiceDelta()와 동일한 원칙 — 얼마를 줬는지 반드시 기억해뒀다가
    // 그대로 되돌린다).
    paladinDarkPrayer: {name:'검은 기도', mp:9, type:'darkprayer', hpCostPct:0.12, atkBonus:0.5, defPenaltyPct:0.35, turns:2,
      desc:'기도를 올렸다... 무언가가 응답했다. 자신의 생명력을 대가로 검의 힘을 끌어내 2턴간 공격력이 크게 오르지만, 그만큼 방어가 허술해진다.'},
    // 레벨15 궁극기 "칼리버 X: 종언": 성검의 힘을 "빌리는" 게 아니라 칼리버 X
    // 자체의 봉인을 해제한다는 컨셉. hpCostPct(자기 HP 30% 희생)+defPierce(방어
    // 대폭 무시)+lifesteal(적의 생명력을 빼앗아 자신에게 돌려줌 — 레벨10의
    // "성스러운 치유"와 정확히 대비되는 연출) 전부 기존 phys 타입의 범용 필드라
    // 신규 코드가 필요 없다. 유일한 신규 동작은 사용 후 전투가 끝날 때까지 남는
    // "회복 감소 저주"(battleFlags.knightHealCurse)뿐이며, 이건 player-actions.js
    // 하단 범용 phys 분기에서 key==='paladinCaliberXFinale'로 특정해 건다(순교자의
    // paladinJudgmentLight와 동일한 패턴) — 물약 회복량이 이후 절반으로 줄어든다.
    paladinCaliberXFinale: {name:'칼리버 X: 종언', mp:20, type:'phys', mult:4.2, defPierce:0.5, hpCostPct:0.3, lifesteal:0.6,
      desc:'억눌려 있던 칼리버 X의 봉인이 풀린다. 검이 적의 생명을 빼앗아 자신의 주인에게 돌려준다 — 그 대가로, 전투가 끝날 때까지 그 어떤 회복도 온전하지 못하게 된다.'},

    // 메카닉 - 로봇군단장(mechanic_legion)
    // 마스터리 "다중 전개": 이 마스터리를 보유하면 로봇(가동 장치)을 battleFlags.rig
    // 하나가 아니라 battleFlags.rig2까지 총 2기까지 동시에 유지할 수 있다(사용자
    // 요청에 따라 상한 2기로 고정). 실제 슬롯 배분/2기 자동사격 로직은
    // combat/player-actions.js의 'legiondeploy' 타입, combat/enemy-turn.js의
    // tickActiveRig()에 구현되어 있다. 대신 폭발 계열(detonaterig 타입) 스킬은
    // 아예 선택할 수 없다(player-actions.js의 playerSkill() 진입부에서 차단 —
    // 기존 '자폭 기동' 등 detonaterig 타입 스킬 전부가 대상이며 이 스킬 하나에
    // 한정되지 않는다).
    // 강철 군단장(mechanic_accumulator 재사용)에서 이 마스터리를 다시 쓴다.
    // 예전 문구의 "폭발 계열 스킬 사용 불가" 절은 데토네이터와의 상호배제
    // 규칙이었는데, 이제 데토네이터와 무관하게 재사용되므로 제거했다.
    mastery_multideploy: {name:'다중 전개', mp:0, type:'passive',
      desc:'정찰/화력/방벽 로봇을 최대 2기까지 동시에 배치할 수 있게 된다.'},
    mechanicRoleDeploy: {name:'역할 배치', mp:8, desc:'정찰/화력/방벽 중 하나의 역할을 무작위로 맡은 로봇 한 기를 즉시 배치한다. 이미 로봇이 2기 있다면 가장 먼저 배치된 로봇을 대신 교체한다',
      type:'legiondeploy', rigTurns:3},
    // [교체됨] 위 mechanicRoleDeploy(무작위 배정)는 사용자 피드백으로 폐기되고
    // 아래 3개(직접 선택형)로 대체되었다. 삭제하지 않고 남겨둔다(레거시 세이브
    // 크래시 방지 — data/jobs.js에서 activeSkillIds로 아래 3개를 대신 지급한다).
    mechanicDeployRecon: {name:'정찰 로봇 배치', mp:8, type:'legiondeploy', roleKind:'recon', rigTurns:3,
      desc:'정찰 로봇을 배치한다. 적의 급소를 드러내 받는 피해가 늘어난다. 이미 로봇이 2기 있다면 가장 먼저 배치된 로봇을 대신 교체한다.'},
    mechanicDeployFirepower: {name:'화력 로봇 배치', mp:8, type:'legiondeploy', roleKind:'firepower', rigTurns:3,
      desc:'화력 로봇을 배치한다. 세 종류 중 가장 강한 화력으로 꾸준히 사격한다. 이미 로봇이 2기 있다면 가장 먼저 배치된 로봇을 대신 교체한다.'},
    mechanicDeployShield: {name:'방벽 로봇 배치', mp:8, type:'legiondeploy', roleKind:'shield', rigTurns:3,
      desc:'방벽 로봇을 배치한다. 가동 중엔 받는 피해의 일부를 대신 막아준다. 이미 로봇이 2기 있다면 가장 먼저 배치된 로봇을 대신 교체한다.'},
    // 레벨15 궁극기 "집중포화": 현재 가동 중인 로봇(들)의 역할을 그대로 활용해
    // 함께 집중사격한다. 데토네이터와 달리 로봇을 파괴하지 않는다 — 사격 후에도
    // battleFlags.rig/rig2는 그대로 살아남아 다음 라운드에도 정상적으로 계속
    // 사격한다. 로봇이 하나도 없으면 기본 배율만 나와 위력이 크게 약하다(먼저
    // 로봇을 배치해야 의미 있는 구조 — 다른 스택형 궁극기들과 동일한 설계
    // 원칙). 새 타입 'legionbarrage'로 처리한다.
    mechanicFocusFire: {name:'집중포화', mp:16, type:'legionbarrage', baseMult:0.8,
      desc:'현재 배치된 로봇들에게 집중사격을 명령한다. 화력 로봇이 있으면 화력이 더해지고, 정찰 로봇이 있으면 방어를 꿰뚫으며, 방벽 로봇이 있으면 스스로를 보호한다. 로봇은 파괴되지 않고 이후에도 계속 가동된다.'},

    // 메카닉 - 데토네이터(mechanic_detonator)
    // 마스터리 "연쇄 기폭": 장치를 설치(전개)할 때마다 battleFlags.detonatorStacks가
    // 자동으로 오른다(최대 5스택, player-actions.js의 deployrig 분기). 이후 폭발
    // 계열(detonaterig 타입) 스킬을 사용하면 그 스택 수만큼 배율이 곱해지고(스택당
    // +15%) 스택은 0으로 초기화된다(player-actions.js의 detonaterig 분기). 로봇군단장과
    // 달리 rig 자체는 기존과 동일하게 1개만 유지되며, "폭발물 개수"는 별도의 스택
    // 카운터로만 표현한다(사용자 확정 사항). 이 마스터리를 가진 캐릭터는 어떤
    // detonaterig 계열 스킬(기존 '자폭 기동' 포함)을 써도 동일하게 스택 보너스가 적용된다.
    mastery_chaindetonate: {name:'연쇄 기폭', mp:0, type:'passive',
      desc:'장치를 설치할 때마다 자동으로 "기폭 스택"이 쌓인다(최대 5, 스택당 폭발 위력 +15%). 폭발 계열 스킬 사용 시 스택 수만큼 배율이 곱해지고 스택은 초기화된다.'},
    mechanicDetonate: {name:'기폭', mp:7, desc:'가동 중인 장치를 그 자리에서 폭파시킨다. 연쇄 기폭 스택이 쌓여 있을수록 훨씬 강력하다. 가동 중인 장치가 없으면 예비 폭발물을 대신 투척한다',
      type:'detonaterig', noRigMult:1.3, burstMult:2.2},

    // 메카닉 - 폭주 화부(mechanic_stoker) — 안전장치를 뜯어낸 화부. 압력 상한을
    // 무시하고 위험할수록 강해지는 하이리스크 하이리턴 분기. 축압 기술자와
    // 정반대 축을 이루는 컨셉(사용자 확정 — 시뮬레이션으로 수치 조정 완료).
    // 마스터리 "폭주 압력": 압력 상한이 100→150으로 늘어난다. 100을 넘는 압력은
    // 초과분만큼(1당 1.5) 즉시 자해 피해를 입히지만, 압력 방출 스킬(폭주 사출/
    // 임계 폭주 포함, 1차 밸브개방/안전밸브도 해당)의 dmgPerPressure에 초과분당
    // 0.0006이 추가로 붙는다. 실제 자해/보너스 적용은 combat/player-actions.js의
    // applyOverheatOverflowDamage()가 담당(deployrig pressureOnDeploy 및
    // combat/enemy-turn.js의 rig 압력 틱 양쪽에서 호출됨).
    mastery_overheat: {name:'폭주 압력', mp:0, type:'passive',
      pressureCapBonus:50, overflowSelfDmgPerPoint:1.5, ventPowerBonusPerOverflow:0.0006,
      desc:'압력 상한이 150으로 늘어난다. 100을 넘는 압력은 매번 초과분만큼 자해 피해를 입히지만, 압력 방출 스킬의 위력도 초과분에 비례해 강해진다.'},
    // 레벨10 액티브 "폭주 사출": 압력을 소모하지 않고 즉시 압력비례 피해를
    // 준 뒤, 오히려 압력을 25 더 쌓는 스노우볼형 스킬(기존 밸브개방과 정반대
    // 방향). 강철 군단장(구 축압 기술자) 리뉴얼 밸런스 시뮬레이션 결과, 자해
    // 리스크가 있는데도 강철 군단장(리스크 없음)보다 총딜이 낮게 나와
    // dmgPerPressure를 0.03→0.04로 상향(자해량은 그대로 유지).
    mechanicOverloadDischarge: {name:'폭주 사출', mp:6, type:'pressuresurge',
      dmgPerPressure:0.04, pressureGainOnUse:25,
      desc:'압력을 소모하지 않고 즉시 압력량에 비례한 피해를 입힌다. 사용할 때마다 오히려 압력이 25 더 쌓인다.'},
    // 레벨12: 과부하 자해를 입을 때마다 회피 스택이 쌓이는 생존 보상 패시브.
    mechanicHeatResist: {name:'과열 내성', mp:0, type:'passive',
      dodgePerOverflowTrigger:0.02, maxDodgeStacks:10,
      desc:'과부하로 자해 피해를 입을 때마다 이번 전투 동안 회피율이 2%p 오른다(최대 +20%p).'},
    // 레벨15 궁극기 "임계 폭주": 압력 100 이상일 때만 사용 가능. 현재 압력 전체를
    // 압도적 피해로 전환하고 최대HP 25%의 반동 피해를 입는다(다른 궁극기들과
    // 동일하게 반동으로 죽지는 않도록 player-actions.js에서 HP 1 클램프 처리).
    // dmgPerPressure는 강철 군단장 리뉴얼 밸런스 시뮬레이션(자해량 유지, 딜만
    // 상향)에 맞춰 0.04→0.06으로 상향.
    mechanicCriticalOverload: {name:'임계 폭주', mp:20, type:'criticaloverload', cooldown:4,
      minPressure:100, dmgPerPressure:0.06, recoilHpCostPct:0.25,
      desc:'상한을 완전히 무시하고 이번 압력 전체를 압도적 피해로 전환한다. 사용 후 최대HP 25%의 반동 피해를 입는다.'},

    // 메카닉 - 축압 기술자(mechanic_accumulator) — 압력을 함부로 흘려보내지
    // 않는 제어형 분기. 폭주 화부와 정반대로, 100에 도달해도 넘치지 않고
    // 그대로 고정 유지되며, 대신 장치 지속시간과 압력 축적 속도가 늘어난다.
    // 마스터리 "압력 봉인": rigTurnsBonus/rigPressureTickBonus는 combat/
    // player-actions.js의 deployrig 분기에서 직접 적용한다(자동포탑/오메가
    // 유닛 배치 시점에 지속시간 +2턴, 압력 축적 +9/틱).
    mastery_pressureseal: {name:'압력 봉인', mp:0, type:'passive',
      rigTurnsBonus:2, rigPressureTickBonus:9,
      desc:'압력이 100에 도달하면 넘치거나 터지지 않고 그대로 고정 유지된다. 가동 중인 장치의 지속시간이 2턴, 압력 축적 속도가 틱당 +9 늘어난다.'},
    // 레벨10 액티브 "정밀 배분": 현재 압력을 전부 소모해 화력강화(가동 중인
    // 장치의 dmgPerTick을 소모량 비례로 영구 강화) 또는 보호막(다음 피격 피해
    // 감소, 1차 안전밸브와 동일한 defReducePerPressure/defReduceCap 필드 재사용)
    // 중 하나를 선택. 사용 후 압력 50을 즉시 돌려받는다.
    mechanicAccumFirepower: {name:'정밀 배분: 화력 강화', mp:5, type:'pressureallocate', mode:'firepower',
      minPressure:50, refundAmount:50, dmgBuffPerPressure:0.01,
      desc:'압력을 소모해 가동 중인 장치의 화력을 강화한다(소모량에 비례). 사용 후 압력 50을 돌려받는다.'},
    mechanicAccumShield: {name:'정밀 배분: 보호막', mp:5, type:'pressureallocate', mode:'shield',
      minPressure:50, refundAmount:50, defReducePerPressure:0.006, defReduceCap:0.6,
      desc:'압력을 소모해 다음 피격 시 받는 피해를 줄인다(소모량에 비례). 사용 후 압력 50을 돌려받는다.'},
    // 레벨12: 환급량 50→60.
    mechanicAccumEfficiency: {name:'효율 개선', mp:0, type:'passive', refundBonus:10,
      desc:'정밀 배분 사용 시 돌려받는 압력이 10 늘어난다(50→60).'},
    // 레벨15 궁극기 "범람": 압력이 최대(100)일 때만 사용 가능. 화력강화+보호막을
    // 동시에 발동시키며 이번엔 환급 없이 압력을 전량 소모한다.
    mechanicAccumOverflow: {name:'범람', mp:18, type:'pressureallocate', mode:'both', cooldown:3,
      minPressure:100, refundAmount:0, dmgBuffPerPressure:0.014, defReducePerPressure:0.007, defReduceCap:0.7,
      desc:'압력이 최대일 때만 사용 가능. 화력 강화와 보호막을 동시에 발동시키며 압력을 전량 소모한다(환급 없음).'},

    // ---------- 강철 군단장(mechanic_accumulator 리뉴얼) ----------
    // 축압 기술자를 완전히 갈아엎은 버전. 압력 게이지를 쓰지 않고, 로봇 3기
    // (정찰/화력/방벽 중 2기 + 오메가 유닛 전용 고정 1자리)를 직접 지휘·관리하는
    // 것이 핵심 루프다. 위 mechanicAccum* 항목들은 레거시로 남겨둔다(구버전
    // 세이브 크래시 방지). id는 그대로 mechanic_accumulator를 재사용하므로
    // 기존 캐릭터도 다음 레벨업/전투부터 자동으로 이 킷을 쓰게 된다.
    // 수치(mp/피해 배율/지속시간 등)는 전부 시뮬레이션 전 임시값이다.
    //
    // 레벨1 베이스 스킬 오버라이드: "긴급 배치" — 역할 효과 없는 저비용 필러
    // 로봇을 rig/rig2 풀에 배치한다(legiondeploy 타입을 그대로 쓰되 roleKind로
    // 'filler'를 추가). 정찰/화력/방벽보다 화력이 낮은 대신 MP가 싸다.
    legionEmergencyDeploy: {name:'긴급 배치', mp:4, type:'legiondeploy', roleKind:'filler', rigTurns:3,
      desc:'역할 없는 저비용 로봇을 즉시 배치한다. 정찰/화력/방벽보다 약하지만 부담 없이 슬롯을 채울 수 있다. 이미 로봇이 2기 있다면 가장 먼저 배치된 로봇을 대신 교체한다.'},
    // 레벨7 베이스 스킬 오버라이드: "전체 정비" — 가동 중인 로봇 전원(rig/rig2/
    // 오메가 전용 슬롯)의 지속시간을 한꺼번에 늘린다. 새 타입 'legionmaintenance'.
    legionMaintenance: {name:'전체 정비', mp:10, type:'legionmaintenance', extendTurns:3,
      desc:'가동 중인 로봇 전원의 지속시간을 3턴 늘린다. 로봇이 하나도 없으면 효과가 없다.'},
    // 레벨10 베이스 스킬(과압 각성/mechanicOverpressure)은 그대로 재사용한다 —
    // combat/player-actions.js의 overpressureult 분기에서 specialization이
    // mechanic_accumulator면 압력 관련 처리를 건너뛰고 battleFlags.omegaRig
    // 전용 슬롯에 오메가 유닛을 배치하도록 분기했다(스킬 데이터 자체는 불변).
    //
    // 레벨12 패시브: "풀편성 시너지" — 정찰/화력/방벽(최대 2기) + 오메가(1기)
    // 슬롯이 전부 가동 중일 때 모든 로봇의 사격 위력이 오른다. 실제 적용은
    // combat/enemy-turn.js의 tickActiveRig() 데미지 계산에서 이뤄진다.
    legionFullSquadSynergy: {name:'풀편성 시너지', mp:0, type:'passive', fullSquadDmgBonus:0.2,
      desc:'로봇 3기(정찰/화력/방벽 중 2기 + 오메가)가 전부 가동 중일 때 모든 로봇의 사격 위력이 20% 늘어난다.'},
    // 레벨15 궁극기: "총사령관의 명령" — 몇 턴간 전 로봇의 사격 위력을 강화하는
    // 지속형 버프. 즉발 데미지 없음. 새 타입 'legioncommand'.
    legionCommand: {name:'총사령관의 명령', mp:20, type:'legioncommand', buffTurns:3, buffMult:0.4, cooldown:4,
      desc:'3턴간 가동 중인 모든 로봇의 사격 위력이 40% 늘어난다. 즉발 피해는 없다.'},

    // 도박사 - 운명의 반란자(jester_rebel)
    // 마스터리 "행운의 파도": 매 라운드(적의 실제 턴이 열릴 때, combat/enemy-turn.js의
    // enemyTurnReal())마다 battleFlags.luckGauge가 -3~+3 사이에서 무작위로 오르내리고,
    // 그 값이 combat/enemy-turn.js의 effectiveAtk()에 실시간으로 반영된다
    // (getLuckWaveBonus() — 계율의 getCreedAtkBonus()와 같은 방식). 액티브(파도타기)는
    // 게이지를 즉시 최댓값(+3)으로 밀어붙인다.
    mastery_luckwave: {name:'행운의 파도', mp:0, type:'passive',
      desc:'매 라운드 "운" 게이지가 -3~+3 사이에서 자동으로 오르내리며, 그 값이 전투 내내 공격력에 실시간으로 반영된다(게이지 1당 공격력 ±7%).'},
    jesterRideWave: {name:'파도타기', mp:6, desc:'운명의 파도를 강제로 밀어붙여 운 게이지를 즉시 최고조로 끌어올린다',
      type:'ridewave'},

    // ---------- 황금 도박사(jester_goldbet) — 운명의 반란자를 대체하는 신규 분기 ----------
    // 소지 골드 자체를 판돈 삼아 싸우는 하이리스크 하이리턴 컨셉. 마스터리는
    // combat/battle-end.js의 승리 골드 계산식에 20% 항을 더하는 것뿐이라 별도
    // 액티브 로직이 없다.
    mastery_goldsense: {name:'물주의 감각', mp:0, type:'passive',
      desc:'전투에서 승리할 때 얻는 골드가 20% 증가한다.'},
    // 레벨10 "베팅": 소지 골드의 10%를 판돈으로 걸고, 성공(50%)하면 판돈의 2배를
    // 돌려받으며 판돈에 비례한 추가 피해까지 들어간다. 실패하면 판돈만 잃고
    // 피해는 0. 골드가 0이면(판돈 자체가 불가능) 확률 없이 평범한 일격만 나간다.
    // 새 타입 'goldbet'로 처리한다(combat/player-actions.js).
    jesterGoldBet: {name:'베팅', mp:10, type:'goldbet', stakePct:0.1, stakeCap:2000, successChance:0.5, baseMult:1.4, stakeBonusMult:0.5, payoutMult:2.0,
      desc:'소지 골드의 10%(최대 2000G)를 판돈으로 건다. 성공하면 판돈의 2배를 얻고 판돈에 비례한 추가 피해가 들어가지만, 실패하면 판돈만 그대로 잃고 피해는 없다. 골드가 없으면 그냥 평범한 일격이 나간다.'},
    // [리뉴얼] 촉 → 정보료. 기존엔 MP만 쓰는 범용 fateshift 재탕이라 황금
    // 도박사만의 색깔(골드)이 전혀 없었다. 이제 골드를 직접 지불해 다음
    // 베팅/올인을 사실상 확정시키는 스킬로 바꿨다 — 새 타입 'goldinfofee'.
    // 내부적으로는 여전히 player.fateBoostChance/fateBoostMult를 세팅해
    // goldbet 타입이 그대로 소비하므로(위 jesterGoldBet 주석 참고) 소비 로직은
    // 손댈 필요가 없다.
    // 사용자 요청 — 성공률 보너스를 +40%p에서 +30%p로 하향(베팅/올인 둘 다
    // 공용으로 적용됨: 베팅 50%+30%=80%, 올인 45%+30%=75%).
    jesterHunch: {name:'정보료', mp:3, type:'goldinfofee', goldCostPct:0.4, goldCostMin:20, chanceBonus:0.3, multBonus:0.5,
      desc:'정보상에게 거금을 찔러준다(소지 골드의 40% 이상, 최소 20G). 다음 베팅/올인의 성공률이 크게 오르고, 판돈 보너스 배율도 함께 오른다.'},
    // 레벨15 궁극기 "올인": 소지 골드 전액을 건다. 성공 확률은 베팅보다 낮지만
    // (판돈이 훨씬 크므로) 기본 피해와 판돈 보너스 배율 모두 더 강하다. 베팅과
    // 동일한 'goldbet' 타입을 재사용하되 수치만 다르게 잡았다.
    jesterAllIn: {name:'올인', mp:16, type:'goldbet', stakePct:1.0, stakeCap:10000, successChance:0.45, baseMult:2.5, stakeBonusMult:0.6, payoutMult:2.0,
      desc:'소지 골드 전액(최대 10000G)을 건다. 성공하면 강력한 피해와 함께 판돈의 2배를 돌려받지만, 실패하면 판돈만큼 잃는다. 골드가 없으면 그냥 평범한 강타가 나간다.'},

    // ---------- [교체됨] 외상 도박사(jester_debtor) → 사기꾼(구 불운의 채권자) ----------
    // 사용자 요청으로 "채무 스택" 시스템(운 실패 시 스택→한꺼번에 청산)을
    // 전면 폐기하고, 사기도박(속임수) 컨셉으로 다시 리뉴얼했다. jesterSettle/
    // jesterReceivable/jesterBankruptcy(옛 청산/미수금/파산 선언)는 삭제하지
    // 않고 아래에 그대로 남겨둔다(레거시 세이브 크래시 방지) — 더 이상
    // jobs.js에서 참조하지 않을 뿐이다.
    //
    // 마스터리 "손버릇": 운 스킬(coinflip/dicecast/shellgame/gamble 등
    // luck:true 계열)이 실패하면 같은 스킬이 무료로 1회 자동 재시도된다.
    // combat/player-actions.js의 checkGamblerRetry()가 각 실패 분기 끝에서
    // 호출한다(!isRetry로 감싸 재귀 2회 이상 안 이어지게 방지) — 1차 스킬
    // 로직 자체는 안 건드리고 결과만 지켜보는 훅이라 예전 방식과 동일한
    // 호환 패턴이다.
    mastery_luckdebt: {name:'손버릇', mp:0, type:'passive',
      desc:'운 스킬이 실패하면 같은 스킬이 무료로 한 번 더 자동 발동된다(재시도가 또 실패하면 거기서 끝).'},
    // 레벨10 "조작된 도박판"(자동 발동 패시브, 선택 UI 없음 — 계율/불확실성의
    // 주사위와 동일한 방식): 전투 시작 시 내 스탯(공/마/방/속) 중 무작위 1개
    // +12%, 적 스탯(공/방/속) 중 무작위 1개 -12%를 이번 전투 내내 적용한다.
    // 실제 적용/연출은 combat/battle-setup.js의 startBattle()에서 처리.
    jesterRiggedTable: {name:'조작된 도박판', mp:0, type:'passive', statBoostPct:0.12, statDebuffPct:0.12,
      desc:'전투가 시작되면 도박판이 은밀히 조작된다. 내 무작위 능력치 하나가 12% 오르고, 적의 무작위 능력치 하나가 12% 떨어진다(이번 전투 내내 유지).'},
    // 레벨12 "속임수 주사위"(패시브): 주사위류 스킬(dicecast 타입)의 눈이
    // 항상 4/5/6 중에서만 나오게 조작한다. combat/player-actions.js의
    // dicecast 분기에서 이 스킬 보유 여부를 확인해 굴림 범위를 좁힌다.
    jesterRiggedDice: {name:'속임수 주사위', mp:0, type:'passive',
      desc:'주사위류 스킬의 눈이 항상 4, 5, 6 중에서만 나온다.'},
    // 레벨15 궁극기 "운명 뒤바꾸기": 성공 시 나와 적의 현재 HP를 완전히
    // 맞바꾼다. 전투당 1회 제한(battleFlags.fateSwapUsed로 체크 — combat/
    // battle-fx.js의 openSub()에서 스킬 목록의 사용 가능 여부에도 반영).
    // 새 타입 'hpswap'. 실패해도 손버릇으로 1회 무료 재시도 가능(luck:true).
    jesterFateSwap: {name:'운명 뒤바꾸기', mp:14, type:'hpswap', chance:0.5, luck:true,
      desc:'운명의 저울을 조작해 나와 적의 "남은 체력 비율"을 서로 맞바꾼다(예: 적이 80% 남았으면 내가 내 최대HP의 80%가 되고, 적은 내가 남았던 비율만큼이 된다). 전투당 1회만 시도할 수 있다.'},

    // ---------- [레거시] 옛 외상 도박사(jester_debtor) — 더 이상 선택 불가 ----------
    // 실제 대출/이자/상환/봉인 로직은 relics.js에 헬퍼 함수로 구현했다
    // (DEBTOR_LOANS 데이터, applyDebtorLoan/clearDebtorLoans/getDebtRepaymentRatio
    // 등 — getCurseCount류 기존 메타 자원 집계 함수와 동일한 위치·패턴).
    mastery_debtcycle: {name:'복리의 굴레', mp:0, type:'passive',
      desc:'남은 빚에 매 층 이자가 붙어 서서히 불어난다. 갚은 비율만큼 대출의 페널티가 즉시 완화되며, 완전히 갚으면 대출로 얻은 힘도 함께 회수된다.'},
    // 레벨10 대출 3종. 새 타입 'loanborrow'로 처리하며, 실제 버프/빚 반영은
    // relics.js의 applyDebtorLoan(loanKey)를 그대로 호출한다.
    jesterLoanSmall: {name:'소액 대출', mp:5, type:'loanborrow', loanKey:'small',
      desc:'500G의 빚을 지는 대신 공격력이 즉시 오른다(중복 대출 가능). 갚기 전까지 물약 회복 효율이 떨어진다.'},
    jesterLoanMedium: {name:'중액 대출', mp:8, type:'loanborrow', loanKey:'medium',
      desc:'1500G의 빚을 지는 대신 공격력과 마력이 함께 오른다(중복 대출 가능). 갚기 전까지 받는 피해가 늘어난다.'},
    jesterLoanLarge: {name:'거액 대출', mp:12, type:'loanborrow', loanKey:'large',
      desc:'4000G의 빚을 지는 대신 공격력과 마력이 크게 오른다(중복 대출 가능). 갚기 전까지 확률적으로 회복이 봉인된다.'},
    // 레벨12 "만기 연장": 확률 강화형이 아니라 시간 관리형 스킬(사용자 명세) —
    // 이자 계산을 몇 층 동안 멈춘다. 새 타입 'debtfreeze'로 처리한다.
    jesterDebtFreeze: {name:'만기 연장', mp:9, type:'debtfreeze', freezeFloors:5,
      desc:'빚쟁이와 협상해 이자 계산을 5층 동안 멈춘다. 그동안은 층을 이동해도 빚이 불어나지 않는다.'},
    // 레벨15 궁극기 "올인 대출": 거액을 추가로 끌어와 그 돈을 그대로 화력으로
    // 쏟아붓는다. 데미지는 "현재 빚 총액"에 비례하므로(대출 실행 후 값 기준),
    // 빚을 많이 짊어지고 있을수록 강력하다. 사용 즉시 debtCollectorImminent를
    // 세워, 다음 층에 황금고블린이 무조건 찾아오게 만든다(사용자 명세 —
    // "쓰면 조만간 반드시 담판을 지어야 한다"). 새 타입 'allinloan'으로 처리한다.
    jesterAllInLoan: {name:'올인 대출', mp:18, type:'allinloan', loanAmount:6000, baseMult:1.8, debtDmgRatio:0.025,
      desc:'거액을 추가로 끌어와 그 돈을 그대로 화력으로 쏟아붓는다. 현재 빚이 많을수록 피해가 커지지만, 사용 즉시 다음 층에서 황금고블린이 확정적으로 찾아온다.'},

    // 도박사 - 패의 마술사(jester_cardmaster)
    // 마스터리 "패 획득": 실제로 턴을 소모하는 스킬을 사용할 때마다(player-actions.js의
    // playerSkill(), arm/passive/catalyst/haste 조기 반환 다음 지점) 카드 한 장(1~7)을
    // 뽑아 최대 3장까지 손에 쥔다. 페어/스트레이트/트리플이 완성되면 즉시 추가 피해를
    // 입히고 손을 비운다(player-actions.js의 resolveCardCombo() 헬퍼 — 마스터리 훅과
    // 액티브(패 교환) 양쪽에서 공유). 여러 스킬 타입에 걸쳐 공통으로 발동해야 해서, 각
    // 분기의 메시지를 개별로 건드리는 대신 완성 시 배너(playBanner)로 별도 안내한다.
    mastery_drawcard: {name:'패 획득', mp:0, type:'passive',
      desc:'스킬을 사용할 때마다 카드 한 장을 자동으로 뽑는다(최대 3장). 페어/스트레이트/트리플이 완성되면 즉시 추가 피해를 입히고 손을 비운다.'},
    jesterExchange: {name:'패 교환', mp:5, desc:'원치 않는 카드 한 장을 새 카드로 교체한다. 이미 세 장이 있으면 마지막 카드를 대신 교체한다',
      type:'cardexchange'},
  };
