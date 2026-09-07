"use strict";
/*
장비 강화 시스템(사용자 요청) — 대장간 UI + 강화 데이터/로직.
export(전역): ENHANCEMENTS, ENHANCE_MAX, ENHANCE_COST, getItemGrade, getEnhancementsFor,
              getEnhancedDisplayName, getEquippedEnhancementSpecials, getWeaponEnhanceDamageMult,
              applyWeaponOnHitEffects, shouldTriggerWeaponMultiStrike, grantReinforceStones,
              rollReinforceStoneDrop, openBlacksmith, applyEnhancementStatBonuses,
              unapplyEnhancementStatBonuses
의존성: player(state.js), data/equipment.js(getItemDef/EQUIPMENT/RARE_EQUIPMENT/EPIC_EQUIPMENT),
       combat/enemy-turn.js(applyDot, effectiveAtk), explore.js(addLog/renderStatus/saveGame)

설계 메모:
- 강화는 "장비 종류(아이템 ID)" 자체에 귀속된다(player.equipEnhancements[id] = [enhId,...]).
  장착 여부와 무관하게 항상 유지되고, 어디서 그 아이템 이름을 표시하든 강화된
  이름으로 보인다(getEnhancedDisplayName). PROJECT 확정 사항.
- 등급(일반/희귀/에픽)은 기존 데이터 플래그(rare/epic)로 판별하며, 등급별로
  강화 가능 최대 횟수(ENHANCE_MAX)와 시도당 필요 강화석 개수(ENHANCE_COST)가
  다르다. 강화석 자체는 등급 구분 없는 단일 재화(사용자 확정).
- 강화 시도마다 랜덤 3개 후보(이미 붙은 효과 제외)를 보여주고 그중 하나를
  직접 고른다(사용자 확정 — 리롤 없음).
- 효과 중 기존 special 시스템(dotBoost/lifestealPct/goldBoost/reviveOnce/
  rareDropBoost 등)과 겹치는 것은 그 자리에 그대로 꽂아 재사용한다
  (getEquippedEnhancementSpecials → data/equipment.js의 equippedSpecials()에 합쳐짐).
  나머지(절차형: 독/연격/치명타/마나파괴/무거운일격 등)는 이 파일의 전용
  함수(getWeaponEnhanceDamageMult/applyWeaponOnHitEffects)로 처리한다.
- 칼리버 X(caliberx_1/2/3)는 스토리 무기라 강화 대상에서 제외한다(사용자 확정).
- 1차: 무기 강화 8종 + 공용 인프라(강화석/대장간 UI/체크포인트 연동).
- 2차(완료): 방어구 강화 8종 + 장신구 강화 8종. 대장간 UI는 슬롯 파라미터화
  되어 있어 추가 코드 없이 자동으로 새 강화들을 보여준다. 새로 생긴 special
  키(dmgReductionPct/turnRegenPct/counterOnHit/preventLethalOnce/manaArmor/
  thornsPct/healPenaltyPct/dmgTakenPctBonus/critChancePct/skillDmgPctBonus/
  gambleDiceChance/firstActionBonus/berserkAtk)의 실제 발동 지점은
  combat/enemy-turn.js(피해 적용부·effectiveAtk)와 data/equipment.js
  (applyOutgoingDamageMods)에 있다.
*/

  /* ============ 강화 데이터 (1차: 무기 8종) ============ */
  const ENHANCEMENTS = {
    sharp:       {slot:'weapon', name:'날카로운 칼날', desc:'공격력 +15%',
      prefix:'날 선', dmgMult:0.15},
    brutal:      {slot:'weapon', name:'잔혹한 칼날', desc:'적 HP 50% 이하일 때 피해 +25%',
      prefix:'잔혹한', lowHpDmg:{threshold:0.5, mult:0.25}},
    lifesteal_w: {slot:'weapon', name:'흡혈의 칼날', desc:'가한 피해의 3% 회복',
      prefix:'피를 머금은', special:{lifestealPct:0.03}},
    poison_w:    {slot:'weapon', name:'독 묻은 칼날', desc:'기본 공격 시 20% 확률로 독 부여',
      prefix:'맹독의', onHitPoisonChance:0.2},
    multistrike: {slot:'weapon', name:'연격', desc:'기본 공격 시 30% 확률로 추가 공격',
      prefix:'쾌속의', extraHitChance:0.3},
    executioner: {slot:'weapon', name:'처형자의 칼날', desc:'적 HP 20% 이하일 때 치명타 확률 +30%(피해 1.5배)',
      prefix:'처형자의', critLowHp:{threshold:0.2, chance:0.3, mult:1.5}},
    manabreak:   {slot:'weapon', name:'마나 파괴', desc:'기본 공격 적중마다 적의 스킬 사용 확률이 5%p 감소(최저 10%, 그 전투 한정)',
      prefix:'파훼의', skillChanceReduce:0.05},
    heavy:       {slot:'weapon', name:'무거운 일격', desc:'기본 공격 피해 +40%, 대신 그다음 피격 시 받는 피해 +25%',
      prefix:'묵직한', dmgMult:0.4, selfDebuff:true},

    // 방어구(2차) — "생존 방식 강화". 상당수는 기존 special 어휘를 그대로 씀.
    ironplate:    {slot:'armor', name:'강철판', desc:'받는 피해 -10%',
      prefix:'강철을 덧댄', special:{dmgReductionPct:0.10}},
    regenarmor:   {slot:'armor', name:'재생의 갑옷', desc:'턴 종료 시 최대HP 2% 회복',
      prefix:'재생의', special:{turnRegenPct:0.02}},
    emergency:    {slot:'armor', name:'응급 갑옷', desc:'HP 30% 이하에서 받는 피해 -25%',
      prefix:'응급의', lowHpDmgReduction:{threshold:0.3, pct:0.25}},
    counterarmor: {slot:'armor', name:'반격의 갑옷', desc:'피해를 받으면 다음 공격이 강화된다',
      prefix:'반격의', special:{counterOnHit:true}},
    undyingarmor: {slot:'armor', name:'불굴의 갑옷', desc:'한 전투에서 1회, 치명적인 피해를 받아도 HP 1로 버틴다',
      prefix:'불굴의', special:{preventLethalOnce:true}},
    manaarmor:    {slot:'armor', name:'마나 갑옷', desc:'HP 대신 보유 MP로 받는 피해의 절반까지 흡수한다',
      prefix:'마나의', special:{manaArmor:true}},
    thornarmor:   {slot:'armor', name:'가시 갑옷', desc:'받은 피해의 15%를 적에게 반사한다',
      prefix:'가시 돋친', special:{thornsPct:0.15}},
    bloodarmor:   {slot:'armor', name:'피의 갑옷', desc:'최대 HP +20%, 대신 회복 효과 -20%',
      prefix:'피의', special:{healPenaltyPct:0.20}, maxhpPctBonus:0.20},

    // 장신구(2차) — "빌드 시너지". 독사의 반지/망자의 부적은 기존 special을 그대로 재사용.
    poisonring:  {slot:'accessory', name:'독사의 반지', desc:'중독 피해 +25%',
      prefix:'독사의', special:{dotBoost:{poison:0.25}}},
    berserkring: {slot:'accessory', name:'광전사의 반지', desc:'HP 40% 이하일 때 공격력 +30%',
      prefix:'광전사의', berserkAtk:{threshold:0.4, mult:0.30}},
    manaring:    {slot:'accessory', name:'마력의 반지', desc:'스킬 피해 +10% (MP 최대치도 소폭 증가)',
      prefix:'마력의', special:{skillDmgPctBonus:0.10}, maxmpPctBonus:0.20},
    luckcharm:   {slot:'accessory', name:'행운의 부적', desc:'치명타 확률 +10%(피해 1.5배), 희귀 아이템 발견 확률 소폭 증가',
      prefix:'행운의', special:{critChancePct:0.10, rareDropBoost:0.15}},
    gambledice:  {slot:'accessory', name:'도박사의 주사위', desc:'30% 확률로 피해 2배, 실패 시 피해 -20%',
      prefix:'도박사의', special:{gambleDiceChance:0.30}},
    timesand:    {slot:'accessory', name:'시간의 모래', desc:'전투 시작 시 첫 행동의 위력이 오른다',
      prefix:'시간의', special:{firstActionBonus:0.20}},
    deadcharm:   {slot:'accessory', name:'망자의 부적', desc:'전투 중 한 번, 쓰러질 위기에서 HP 25%로 부활한다',
      prefix:'망자의', special:{reviveOnce:0.25}},
    greedcharm:  {slot:'accessory', name:'탐욕의 목걸이', desc:'골드 획득 +30%, 대신 받는 피해 +10%',
      prefix:'탐욕의', special:{goldBoost:0.30, dmgTakenPctBonus:0.10}},
  };

  // 등급별 최대 강화 횟수 / 시도당 필요 강화석(사용자 확정).
  const ENHANCE_MAX = {normal:1, rare:2, epic:3};
  const ENHANCE_COST = {normal:3, rare:5, epic:8};

  /* ============ 에픽 직업 각인(사용자 요청) ============
     일반 강화와 완전히 같은 테이블(ENHANCEMENTS)에 합쳐 넣는다 — 그래야
     getEnhancedDisplayName/getEquippedEnhancementSpecials 등 기존 함수를
     전혀 안 건드리고도 표시/장착/저장이 그대로 동작한다. 구분은 두 필드로:
     - specId: 이 값이 있으면 "그 특성으로 전직한 캐릭터가, 그 직업의 에픽
       장비를 강화할 때만" 후보로 뜬다(renderBlacksmithChoice에서 필터링).
     - exclusiveGroup: 같은 그룹끼리는 하나를 고르면 나머지가 후보에서
       완전히 사라진다(회랑의 기사 방어구 "택1"용 — 이번 세션엔 아직 없음).
     주의: 데이터는 아래처럼 정의돼 있어도, 실제 전투 로직 연결은 아직
     일부(전사 2종 + 마법사 계약술사/시간술사)만 되어 있다. 나머지는 다음
     작업에서 이어서 붙일 예정 — 골라도 당장은 효과가 안 나갈 수 있다.
  */
  const EPIC_JOB_ENCHANTS = {
    we_chainexec: {slot:'weapon', specId:'warrior_bloodpact', name:'연쇄 처형', prefix:'처형자의',
      desc:'저돌로 적 최대HP의 30% 이상을 깎으면 HP 소모 없이 즉시 재발동한다. 못 채우면 다음 턴 방어력이 20% 낮아진다.'},
    we_madimmortal: {slot:'armor', specId:'warrior_bloodpact', name:'불사의 광기', prefix:'광기의',
      desc:'전투당 1회, 쓰러질 위기에서 HP 1로 버틴다. 이후로는 받는 피해가 25% 늘어난다.'},
    we_bloodrevive: {slot:'accessory', specId:'warrior_bloodpact', name:'부활하는 각인', prefix:'불멸의',
      desc:'혈옥쇄로 적 최대HP의 30% 이상을 깎으면 쿨다운과 소모한 HP가 즉시 되돌아온다.'},
    we_puresword: {slot:'weapon', specId:'warrior_purist', name:'일섬의 각인', prefix:'일섬의',
      desc:'기본 공격이 항상 확정 크리티컬(2배)로 터진다. 대신 명중률이 70%로 떨어진다.'},
    we_resonance: {slot:'armor', specId:'warrior_purist', name:'공명 각인', prefix:'공명하는',
      desc:'직전 기본 공격 피해의 20%를 이번 공격에 그대로 증폭해 물려받는다. 스킬/아이템을 쓰면 끊긴다.'},
    we_infechoic: {slot:'accessory', specId:'warrior_purist', name:'무한 메아리 각인', prefix:'메아리치는',
      desc:'쌍격의 파문 2타 이후 50% 확률로 위력이 줄어든 추가 타격이 계속 이어진다.'},
    me_dualpact: {slot:'weapon', specId:'mage_pact', name:'이중 계약 각인', prefix:'이중 계약의',
      desc:'원소 각인이 미계약 원소 효과도 함께 발동시킨다. 대신 두 효과 모두 위력이 70%로 줄어든다.'},
    me_betrayal: {slot:'armor', specId:'mage_pact', name:'배신의 계약 각인', prefix:'배신의',
      desc:'계약 원소가 적중할 때마다 20% 확률로 다른 원소로 강제 전환되며, 전환되는 순간 추가 폭발 피해가 터진다.'},
    me_trinity: {slot:'accessory', specId:'mage_pact', name:'삼위일체 각인', prefix:'삼위일체의',
      desc:'원소 폭풍이 계약 원소와 무관하게 화염+빙결+번개를 전부 발동시킨다. 대신 쿨다운이 2배가 된다.'},
    me_regression: {slot:'armor', specId:'mage_time', name:'역행의 각인', prefix:'역행하는',
      desc:'시간 왜곡의 발동 확률이 20%→35%로 오른다. 대신 이 각인으로 발동한 추가 행동에서는 가속 주문의 위력이 20% 낮아진다.'},
    me_infiniteaccel: {slot:'weapon', specId:'mage_time', name:'무한 가속 각인', prefix:'무한 가속의',
      desc:'가속 주문을 연달아 쓸 때 오르는 MP 소모 증가율이 절반으로 줄어든다. 대신 다른 스킬/기본공격/아이템을 한 번이라도 쓰면 연쇄가 끊긴다.'},
    me_timestop: {slot:'accessory', specId:'mage_time', name:'시간 정지 각인', prefix:'정지된',
      desc:'시간 조각이 최대(5개)일 때 시간의 역설을 쓰면 조각이 소비되지 않고 그대로 유지된다.'},
    me_tempcurse: {slot:'weapon', specId:'mage_curseweaver', name:'임시 계약 각인', prefix:'임시 계약의',
      desc:'전투당 1회, 저주 폭발/저주 각인/저주 만개 중 먼저 쓰는 스킬이 저주를 1개 더 짊어진 것처럼 계산된다(실제 유물창엔 안 남는 가짜 저주).'},
    me_doublecurse: {slot:'armor', specId:'mage_curseweaver', name:'겹저주 각인', prefix:'겹겹의',
      desc:'저주 각인을 걸린 적에게 다시 쓰면, 남은 저주를 미리 30% 터뜨린 뒤 새로 건다. 새로 거는 저주 자체는 20% 약해진다.'},
    me_curseCycle: {slot:'accessory', specId:'mage_curseweaver', name:'만개 순환 각인', prefix:'순환하는',
      desc:'저주 만개가 저주 각인의 잔여 도트를 흡수하지 않고 그대로 유지한 채(계속 틱딜) 발동한다. 대신 만개의 저주 개수 보너스가 20% 줄어든다.'},
    re_doublestrike: {slot:'weapon', specId:'rogue_phantom', name:'이중 쇄도 각인', prefix:'이중 쇄도의',
      desc:'그림자 쇄도를 쓰면 분신 배가가 자동으로 걸린 것처럼 처리된다. 대신 이 스킬 자체의 즉발 피해가 15% 줄어든다.'},
    re_afterimage_extend: {slot:'armor', specId:'rogue_phantom', name:'잔상 각인', prefix:'잔상의',
      desc:'분신 배가가 한 번 쓰이고도 끊기지 않고 한 번 더(연속 2회) 유지된다. 대신 배가 강화 폭이 줄어든다.'},
    re_immortallegion: {slot:'accessory', specId:'rogue_phantom', name:'불멸 군단 각인', prefix:'불멸 군단의',
      desc:'백귀야행을 사용해도 이번 전투에서 쌓아온 잔영 누적 발동 횟수가 초기화되지 않고 그대로 유지된다. 대신 쿨다운이 3턴→5턴으로 늘어난다.'},
    re_venomrush: {slot:'weapon', specId:'rogue_alchemist', name:'폭주 주입 각인', prefix:'폭주하는',
      desc:'맹독 주입의 자기 전용 스택 보너스가 2배가 된다. 대신 독 스택 상한을 넘기면 초과분만큼 자신도 반동 피해를 입는다.'},
    re_venomburst: {slot:'armor', specId:'rogue_alchemist', name:'폭발 정제 각인', prefix:'폭발하는',
      desc:'독 스택이 최대치에 도달한 라운드엔 평소 틱딜 대신 스택을 전부 소모하는 큰 폭발 피해로 터진다. 대신 정제의 지속피해 보너스가 30%→15%로 줄어든다.'},
    re_solovenom: {slot:'accessory', specId:'rogue_alchemist', name:'고독 각인', prefix:'고독한',
      desc:'맹독 주입의 자기 전용 스택 보너스가 한 번 더 2배가 된다(삼중 주입과 겹치면 3개→12개). 대신 독 스택 상한이 10→7로 줄어든다.'},
    pa_instantmartyr: {slot:'weapon', specId:'paladin_martyr', name:'즉각 순교 각인', prefix:'즉각 순교의',
      desc:'심판의 빛에서 희생의 맹세가 실제로 발동하면 이번 피해(흡혈 포함)가 +50%. 발동하지 않으면 오히려 -10%.'},
    pa_thornseal: {slot:'armor', specId:'paladin_martyr', name:'가시 갑옷 각인', prefix:'가시 인장의',
      desc:'순교자의 인장(방어력 보너스)은 그대로 유지되면서, 추가로 피격 시 누적 희생 횟수 1회당 소량의 반사 피해가 함께 나간다.'},
    pa_eternalreturn: {slot:'accessory', specId:'paladin_martyr', name:'영겁 회귀의 각인', prefix:'영겁의',
      desc:'불멸의 순교로 적 최대HP의 30% 이상을 깎으면, 반동 HP와 쿨다운이 즉시 되돌아온다.'},
    pa_knight_a: {slot:'armor', specId:'paladin_knight', name:'순교자의 서약', prefix:'서약의', exclusiveGroup:'knight_armor',
      desc:'검은 기도의 공격력 보너스가 +50%→+80%, 지속시간이 2턴→3턴으로 늘어난다. 대신 방어력 감소 페널티도 35%→55%로 커진다. (방어구 각인은 이것과 성좌의 가호 중 하나만 고를 수 있다)'},
    pa_knight_b: {slot:'armor', specId:'paladin_knight', name:'성좌의 가호', prefix:'가호받은', exclusiveGroup:'knight_armor',
      desc:'성휘참의 피해가 10% 줄어드는 대신 흡혈이 2배가 되고, 적중 시 2턴간 받는 피해가 10% 줄어드는 배리어가 함께 걸린다. (방어구 각인은 이것과 순교자의 서약 중 하나만 고를 수 있다)'},
    pa_transcend: {slot:'accessory', specId:'paladin_knight', name:'종언을 넘어서', prefix:'초월한',
      desc:'칼리버 X: 종언으로 적 최대HP의 30% 이상을 깎으면, 반동 HP와 쿨다운이 즉시 되돌아온다.'},
    me_pressurerush: {slot:'weapon', specId:'mechanic_stoker', name:'폭주 가속 각인', prefix:'폭주 가속의',
      desc:'폭주 사출을 쓸 때마다 압력이 25 대신 35씩 쌓인다. 대신 압력 초과분 자해 배율이 1.5배/점→2.0배/점으로 커진다.'},
    me_phoenixash: {slot:'armor', specId:'mechanic_stoker', name:'불사조의 재 각인', prefix:'불사조의',
      desc:'과부하 자해로 죽을 뻔하면 전투당 1회, 압력을 0으로 리셋하고 회피 스택을 최대치로 채운 채 살아남는다.'},
    me_permanentcost: {slot:'accessory', specId:'mechanic_stoker', name:'돌이킬 수 없는 각인', prefix:'대가의',
      desc:'임계 폭주의 일시적 반동(HP)이 사라지는 대신, 최대HP가 영구히(반동의 30%만큼) 줄어든다.'},
    me_fortify: {slot:'weapon', specId:'mechanic_accumulator', name:'증축 각인', prefix:'증축된',
      desc:'화력 로봇 배치 시 남은 빈 슬롯이 있으면 그 자리에도 화력 로봇을 하나 더 즉석 배치한다. 대신 이렇게 배치된 로봇들은 지속시간이 1턴 짧다.'},
    me_totalrefit: {slot:'armor', specId:'mechanic_accumulator', name:'총력 재정비 각인', prefix:'총력의',
      desc:'전체 정비가 로봇 지속시간 연장과 동시에 오메가 유닛 쿨다운도 1턴 줄여준다. 대신 연장 턴수 자체는 3턴→2턴으로 줄어든다.'},
    me_undyingcommand: {slot:'accessory', specId:'mechanic_accumulator', name:'불멸의 명령 각인', prefix:'불멸 명령의',
      desc:'총사령관의 명령이 지속되는 동안 로봇이 만료돼도 즉시 같은 종류로 무료 재배치된다. 대신 버프 지속시간이 3턴→2턴으로 줄어든다.'},
    ju_bigbet: {slot:'weapon', specId:'jester_goldbet', name:'몰빵 각인', prefix:'몰빵의',
      desc:'베팅의 판돈 상한이 1.5배로 늘어난다. 대신 실패하면 이후 이번 전투에서 얻는 골드가 반토막난다.'},
    ju_infoscam: {slot:'armor', specId:'jester_goldbet', name:'사기 정보 각인', prefix:'사기 정보의',
      desc:'정보료로 얻는 성공률/배율 보너스가 2배가 되는 대신, 정보료 비용 자체도 2배가 된다.'},
    ju_debtbet: {slot:'accessory', specId:'jester_goldbet', name:'빚투 각인', prefix:'빚투의',
      desc:'올인에 한해 가진 골드의 150%까지 판돈으로 걸 수 있다. 대신 실패하면 판돈 크기와 무관하게 최대HP 15%의 고정 피해를 입는다.'},
    ju_doubleswap: {slot:'weapon', specId:'jester_debtcollector', name:'겹패 각인', prefix:'겹패의',
      desc:'운명 뒤바꾸기를 전투당 1회가 아니라 2회까지 사용할 수 있다.'},
    ju_doubleluck: {slot:'armor', specId:'jester_debtcollector', name:'이중 손버릇 각인', prefix:'이중 손버릇의',
      desc:'손버릇의 무료 재시도마저 실패하면, 한 번 더(총 3연속 시도) 기회가 생긴다. 대신 그 마지막 시도까지 실패하면 이번 턴 방어력이 사실상 무의미해질 만큼(받는 피해 3배) 무너진다.'},
    ju_dicereveal: {slot:'accessory', specId:'jester_debtcollector', name:'속임수 폭로 각인', prefix:'폭로된',
      desc:'주사위류 스킬의 눈이 4~6이 아니라 항상 6만 나오도록 더 노골적으로 조작한다. 대신 들통난 대가로 이후 2턴간 모든 스킬의 MP 소모가 20% 늘어난다.'},
  };
  Object.assign(ENHANCEMENTS, EPIC_JOB_ENCHANTS);

  function isEnhanceable(id){
    // 칼리버 X(성기사 전용 스토리 무기)는 강화 대상에서 제외.
    if(id && id.indexOf('caliberx_')===0) return false;
    return !!getItemDef(id);
  }
  function getItemGrade(id){
    const def = getItemDef(id);
    if(!def) return 'normal';
    if(def.epic) return 'epic';
    if(def.rare) return 'rare';
    return 'normal';
  }
  function getEnhancementsFor(id){
    return (player.equipEnhancements && player.equipEnhancements[id]) || [];
  }
  // 강화 접두어를 적용 순서대로 이름 앞에 붙인다(최근 적용분이 가장 앞).
  // "녹슨 장검" + [sharp] → "날 선 녹슨 장검", + [lifesteal_w, sharp] →
  // "피를 머금은 날 선 녹슨 장검".
  function getEnhancedDisplayName(id){
    const def = getItemDef(id);
    if(!def) return '???';
    const list = getEnhancementsFor(id);
    if(!list.length) return def.name;
    const prefixes = list.slice().reverse().map(eid=> (ENHANCEMENTS[eid]||{}).prefix).filter(Boolean);
    return prefixes.join(' ') + (prefixes.length ? ' ' : '') + def.name;
  }

  /* ============ 기존 special 시스템과의 연동 ============ */
  // data/equipment.js의 equippedSpecials()가 이 함수를 호출해 강화로 얻은
  // special 조각(흡혈 등 기존 시스템 재사용분)을 합쳐간다.
  function getEquippedEnhancementSpecials(){
    const specials = [];
    Object.values(player.equipment||{}).filter(Boolean).forEach(id=>{
      getEnhancementsFor(id).forEach(eid=>{
        const def = ENHANCEMENTS[eid];
        if(def && def.special) specials.push(def.special);
      });
    });
    return specials;
  }

  /* ============ 절차형 효과(전용 훅) ============ */
  // 기본 공격 데미지 배율(sharp/brutal/heavy/executioner-치명타). combat/player-actions.js의
  // playerAttack()이 applyOutgoingDamageMods() 적용 직후 별도로 곱해준다(스킬
  // 데미지 계산 함수를 건드리지 않고 기본 공격에만 한정하기 위함).
  function getWeaponEnhanceDamageMult(){
    const wId = player.equipment && player.equipment.weapon;
    if(!wId) return 1;
    let mult = 1;
    getEnhancementsFor(wId).forEach(eid=>{
      const def = ENHANCEMENTS[eid];
      if(!def) return;
      if(typeof def.dmgMult==='number') mult *= (1+def.dmgMult);
      if(def.lowHpDmg && enemy && enemy.maxhp>0 && (enemy.hp/enemy.maxhp)<=def.lowHpDmg.threshold){
        mult *= (1+def.lowHpDmg.mult);
      }
      if(def.critLowHp && enemy && enemy.maxhp>0 && (enemy.hp/enemy.maxhp)<=def.critLowHp.threshold){
        if(Math.random()<def.critLowHp.chance) mult *= def.critLowHp.mult;
      }
    });
    return mult;
  }
  // 무거운 일격의 반작용(다음 피격 시 받는 피해 +25%, 1회성).
  function applyHeavyStrikeDrawback(){
    const wId = player.equipment && player.equipment.weapon;
    if(!wId) return;
    if(!getEnhancementsFor(wId).includes('heavy')) return;
    player.buffDefTurns = 1;
    player.buffDefMult = Math.max(player.buffDefMult||1, 1.25);
  }
  // 기본 공격 적중 후 부수효과(독/마나파괴/무거운 일격 반작용). combat/player-actions.js의
  // playerAttack()이 데미지를 적용한 직후 호출한다.
  function applyWeaponOnHitEffects(){
    const wId = player.equipment && player.equipment.weapon;
    if(!wId || !enemy || enemy.hp<=0) return;
    const list = getEnhancementsFor(wId);
    if(!list.length) return;
    list.forEach(eid=>{
      const def = ENHANCEMENTS[eid];
      if(!def) return;
      if(def.onHitPoisonChance && Math.random()<def.onHitPoisonChance){
        applyDot({type:'poison', turns:3, ratio:0.12, basis:'atk', label:'독'});
      }
      if(def.skillChanceReduce){
        // enemy.skillChance가 명시적으로 없는 몬스터는 combat/enemy-turn.js의
        // enemyAction()이 기본값 0.4를 쓴다(enemy.skillChance||0.4) — 여기서도
        // 같은 기본값을 기준으로 깎아야 "적용이 안 되는" 몬스터가 없다.
        const base = enemy.skillChance!==undefined ? enemy.skillChance : 0.4;
        enemy.skillChance = Math.max(0.10, base - def.skillChanceReduce);
      }
      if(def.selfDebuff) applyHeavyStrikeDrawback();
    });
  }
  // 연격(사용자 요청) — 기존 거인강림 "한 번 더 몰아친다" 패턴(player-actions.js의
  // maybeWarriorExtraHit)과 동일한 자리에서, 동일한 방식(동기, 그 자리에서
  // 바로 한 번 더 데미지 계산)으로 발동하도록 확률 판정만 여기서 제공한다.
  function shouldTriggerWeaponMultiStrike(){
    const wId = player.equipment && player.equipment.weapon;
    if(!wId) return false;
    const has = getEnhancementsFor(wId).includes('multistrike');
    if(!has) return false;
    return Math.random() < ENHANCEMENTS.multistrike.extraHitChance;
  }

  /* ============ 강화석 ============ */
  function grantReinforceStones(n){
    player.reinforceStones = (player.reinforceStones||0) + n;
    return n;
  }
  // 몬스터 등급별 드랍(사용자 요청 — 상점 판매는 절대 금지). combat/battle-end.js의
  // 일반 승리 처리부에서 호출한다.
  function rollReinforceStoneDrop(){
    if(enemy.isBoss){
      return grantReinforceStones(2 + Math.floor(Math.random()*2)); // 2~3개 확정
    }
    if(enemy.isElite){
      if(Math.random()<0.35) return grantReinforceStones(1 + Math.floor(Math.random()*2)); // 35%, 1~2개
      return 0;
    }
    if(Math.random()<0.08) return grantReinforceStones(1); // 일반 몬스터 8%, 1개
    return 0;
  }

  // 강화로 얻은 %기반 스탯 보너스(피의 갑옷/마력의 반지)를 "장착 중일 때만"
  // 적용/회수한다. data/equipment.js의 equipItem()/unequipItem()이 호출한다.
  // 적용 시점의 현재 최대치 기준으로 계산한 델타를 player.equipEnhancementDeltas
  // 에 캐싱해두고, 해제할 땐 그 캐싱된 값을 정확히 그대로 빼야 한다(그 사이
  // 레벨업 등으로 최대치가 달라졌어도 어긋나지 않도록).
  function applyEnhancementStatBonuses(id){
    const list = getEnhancementsFor(id);
    if(!list.length) return;
    let dHp = 0, dMp = 0;
    list.forEach(eid=>{
      const def = ENHANCEMENTS[eid];
      if(!def) return;
      if(def.maxhpPctBonus) dHp += Math.round(player.maxhp*def.maxhpPctBonus);
      if(def.maxmpPctBonus) dMp += Math.round(player.maxmp*def.maxmpPctBonus);
    });
    if(dHp||dMp){
      player.maxhp += dHp; player.hp = Math.min(player.maxhp, player.hp+dHp);
      player.maxmp += dMp; player.mp = Math.min(player.maxmp, player.mp+dMp);
      if(!player.equipEnhancementDeltas) player.equipEnhancementDeltas = {};
      player.equipEnhancementDeltas[id] = {maxhp:dHp, maxmp:dMp};
    }
  }
  function unapplyEnhancementStatBonuses(id){
    const d = player.equipEnhancementDeltas && player.equipEnhancementDeltas[id];
    if(!d) return;
    if(d.maxhp){ player.maxhp -= d.maxhp; player.hp = Math.min(player.maxhp, Math.max(0, player.hp-d.maxhp)); }
    if(d.maxmp){ player.maxmp -= d.maxmp; player.mp = Math.min(player.maxmp, Math.max(0, player.mp-d.maxmp)); }
    delete player.equipEnhancementDeltas[id];
  }

  /* ============ 대장간 UI ============ */
  function openBlacksmith(){
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'blacksmith-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    renderBlacksmithHome(panel);
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    return overlay;
  }
  function renderBlacksmithHome(panel){
    const slots = ['weapon','armor','accessory'];
    panel.innerHTML = `<h3>🔨 대장간</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 12px;">지금 장착 중인 장비만 강화할 수 있다.</p>
      <p style="text-align:center;color:#ffd76a;font-size:14px;margin:0 0 14px;">🔶 보유 강화석: ${player.reinforceStones||0}개</p>
      ${slots.map(slot=>{
        const id = player.equipment && player.equipment[slot];
        if(!id) return `<div class="shop-item"><div class="si-info"><span class="si-name" style="color:var(--parchment-dim);">[${SLOT_LABELS[slot]}] 장착한 장비 없음</span></div></div>`;
        const grade = getItemGrade(id);
        const enhList = getEnhancementsFor(id);
        const max = ENHANCE_MAX[grade];
        const enhanceable = isEnhanceable(id) && enhList.length<max;
        const cost = ENHANCE_COST[grade];
        const canAfford = (player.reinforceStones||0) >= cost;
        return `
      <div class="shop-item">
        <div class="si-info">
          <span class="si-name" style="font-family:Cinzel;color:var(--parchment);">[${SLOT_LABELS[slot]}] ${getEnhancedDisplayName(id)}</span>
          <span class="si-desc" style="color:var(--parchment-dim); font-size:12.5px; font-style:italic;">
            ${enhList.length ? enhList.map(eid=>{
              const isJob = !!(ENHANCEMENTS[eid] && ENHANCEMENTS[eid].specId);
              const mark = isJob ? '<span style="color:var(--violet);">✨</span>' : '✦';
              return `${mark} ${ENHANCEMENTS[eid].name}: ${ENHANCEMENTS[eid].desc}`;
            }).join('<br>') : '강화된 적 없음'}
            <br>강화 ${enhList.length}/${max}
          </span>
        </div>
        ${id.indexOf('caliberx_')===0
          ? `<button class="buy-btn" disabled>강화 불가</button>`
          : (enhanceable
            ? `<button class="buy-btn" data-slot="${slot}" data-id="${id}" ${canAfford?'':'disabled'}>${cost}개로 강화</button>`
            : `<button class="buy-btn" disabled>${enhList.length>=max?'최대 강화':'강화 불가'}</button>`)}
      </div>`;
      }).join('')}
      <div style="text-align:center; margin-top:10px;"><button class="btn" id="blacksmith-close">떠나기</button></div>`;
    panel.querySelectorAll('.buy-btn[data-id]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const slot = b.dataset.slot, id = b.dataset.id;
        const grade = getItemGrade(id);
        if((player.reinforceStones||0) < ENHANCE_COST[grade]) return;
        renderBlacksmithChoice(panel, slot, id, grade);
      });
    });
    panel.querySelector('#blacksmith-close').addEventListener('click', ()=>panel.closest('.shop-overlay').remove());
  }
  function renderBlacksmithChoice(panel, slot, id, grade){
    const already = getEnhancementsFor(id);
    const pool = Object.keys(ENHANCEMENTS).filter(eid=>{
      const def = ENHANCEMENTS[eid];
      if(def.slot!==slot || already.includes(eid)) return false;
      // 직업 각인(specId 있음)은 에픽 등급 + 실제로 그 특성으로 전직했을
      // 때만 후보로 나온다(사용자 요청 — 강화 슬롯 하나를 그대로 차지).
      if(def.specId){
        if(grade!=='epic' || player.specialization!==def.specId) return false;
      }
      // exclusiveGroup(택1류): 이미 같은 그룹의 다른 각인을 골랐다면 제외.
      if(def.exclusiveGroup && already.some(aid=> ENHANCEMENTS[aid] && ENHANCEMENTS[aid].exclusiveGroup===def.exclusiveGroup)){
        return false;
      }
      return true;
    });
    const shuffled = pool.slice().sort(()=>Math.random()-0.5);
    const candidates = shuffled.slice(0, 3);
    if(!candidates.length){
      panel.innerHTML = `<h3>🔨 대장간</h3><p style="text-align:center;color:var(--parchment-dim);font-size:13px;padding:12px;">더 이상 새로 붙일 수 있는 강화가 없다.</p>
        <div style="text-align:center; margin-top:10px;"><button class="btn" id="blacksmith-back">돌아가기</button></div>`;
      panel.querySelector('#blacksmith-back').addEventListener('click', ()=>renderBlacksmithHome(panel));
      return;
    }
    panel.innerHTML = `<h3>🔨 대장간 — 강화 선택</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">${getEnhancedDisplayName(id)}에 무엇을 새길지 고른다.</p>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${candidates.map(eid=>{
          const def = ENHANCEMENTS[eid];
          // 직업 각인(specId 있음)은 일반 강화와 확실히 구분되도록 보라색
          // 테두리 + "✨ 직업 각인" 배지를 붙인다(사용자 요청).
          const isJobEnchant = !!def.specId;
          const borderStyle = isJobEnchant ? `border-color:var(--violet); box-shadow:0 0 8px #7a5a9c66;` : '';
          const badge = isJobEnchant ? `<span style="display:inline-block; font-size:10.5px; color:var(--violet); border:1px solid var(--violet); border-radius:4px; padding:1px 5px; margin-right:6px; vertical-align:middle;">✨ 직업 각인</span>` : '';
          return `
        <button class="btn enhance-pick" data-eid="${eid}" style="text-align:left; padding:10px 12px; ${borderStyle}">
          <b>${badge}${def.prefix} — ${def.name}</b><br>
          <span style="font-size:12px; color:var(--parchment-dim); font-weight:normal;">${def.desc}</span>
        </button>`;
        }).join('')}
      </div>
      <div style="text-align:center; margin-top:10px;"><button class="btn" id="blacksmith-cancel">취소</button></div>`;
    panel.querySelectorAll('.enhance-pick').forEach(b=>{
      b.addEventListener('click', ()=>{
        const eid = b.dataset.eid;
        const cost = ENHANCE_COST[grade];
        if((player.reinforceStones||0) < cost) return;
        player.reinforceStones -= cost;
        if(!player.equipEnhancements[id]) player.equipEnhancements[id] = [];
        player.equipEnhancements[id].push(eid);
        // 스탯형 보너스(피의 갑옷 최대HP+20%, 마력의 반지 최대MP+20%)는 지금
        // 이 아이템이 장착 중일 때만 즉시 적용한다 — 장착 중이 아니면 나중에
        // 장착하는 순간 data/equipment.js의 equipItem()이 적용해준다.
        if(player.equipment && player.equipment[slot]===id && typeof applyEnhancementStatBonuses==='function'){
          applyEnhancementStatBonuses(id);
        }
        renderStatus();
        addLog(`[${getEnhancedDisplayName(id)}]에 [${ENHANCEMENTS[eid].name}]을(를) 새겼다!`, 'gold');
        saveGame();
        renderBlacksmithHome(panel);
      });
    });
    panel.querySelector('#blacksmith-cancel').addEventListener('click', ()=>renderBlacksmithHome(panel));
  }
