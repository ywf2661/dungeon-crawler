"use strict";
/*
장비 아이템 데이터(일반/희귀/에픽) + 장비 착용 로직 + 에픽 세트효과 로직.
데이터와 로직이 함께 있는 파일(에픽 세트효과가 장비 조합 판정에 강하게 종속되어
분리 시 위험 증가 → 원본 순서 그대로 유지).
export(전역): SLOT_LABELS, STAT_LABELS, EQUIPMENT, RARE_EQUIPMENT, EPIC_EQUIPMENT, EPIC_SETS,
              getItemDef, statsText, applyEquipStats, unapplyEquipStats, equipItem, unequipItem,
              checkEpicSetToast, showEpicSetToast, equippedSpecials, getSpecialSum, hasSpecial,
              getDotBoostRatio, getReviveRatio, applyPassiveLifesteal, getEpicSetCounts, epicSetTier,
              epicLifestealMult, checkPaladinAwoken, rogueRegisterHit, maybeWarriorExtraHit,
              epicLuckPre / epicLuckApplyChance / epicLuckPost, getEpicSetMult, getEffectiveEnemyDef
의존성: player/enemy(state.js), Sound(sound.js, 세트효과 발동음)
*/

  /* ---------- 장비 아이템 ---------- */
  const SLOT_LABELS = {weapon:'무기', armor:'방어구', accessory:'장신구'};
  const STAT_LABELS = {atk:'공격력', def:'방어력', mag:'마력', spd:'속도', maxhp:'최대HP', maxmp:'최대MP'};
  const EQUIPMENT = {
    w_dagger:      {name:'낡은 단검',       slot:'weapon',    desc:'가볍고 다루기 쉬운 단검.',           stats:{atk:2},               price:15,  minDepth:0},
    w_steelsword:  {name:'강철 검',         slot:'weapon',    desc:'표준적인 강철 장검.',                stats:{atk:5},               price:60,  minDepth:1},
    w_staff:       {name:'견습생의 지팡이', slot:'weapon',    desc:'마력을 증폭시키는 지팡이.',          stats:{mag:5},               price:55,  minDepth:1},
    w_greatsword:  {name:'흑요석 대검',     slot:'weapon',    desc:'무겁지만 파괴적인 대검.',            stats:{atk:9, def:-1},       price:140, minDepth:5},
    w_abyssalstaff:{name:'심연의 지팡이',   slot:'weapon',    desc:'어둠의 마력이 깃든 지팡이.',         stats:{mag:10},              price:150, minDepth:5},
    w_dragonfang:  {name:'용의 송곳니',     slot:'weapon',    desc:'용의 이빨로 벼려낸 전설의 무기.',    stats:{atk:14, spd:2},       price:260, minDepth:9},
    a_leather:     {name:'가죽 갑옷',       slot:'armor',     desc:'가볍고 기본적인 방어구.',            stats:{def:3, maxhp:8},      price:50,  minDepth:0},
    a_chain:       {name:'사슬 갑옷',       slot:'armor',     desc:'촘촘히 엮은 사슬 갑옷.',             stats:{def:6, maxhp:14},     price:110, minDepth:3},
    a_robe:        {name:'그림자 로브',     slot:'armor',     desc:'움직임을 방해하지 않는 가벼운 로브.',stats:{def:3, spd:4},        price:90,  minDepth:3},
    a_plate:       {name:'기사의 판금 갑옷',slot:'armor',     desc:'묵직하지만 견고한 전신 갑옷.',       stats:{def:10, maxhp:22, spd:-1}, price:220, minDepth:7},
    c_ring:        {name:'행운의 반지',     slot:'accessory', desc:'몸을 가볍게 하는 오래된 반지.',      stats:{spd:3},               price:70,  minDepth:1},
    c_amulet:      {name:'마력의 목걸이',   slot:'accessory', desc:'마력을 저장하는 목걸이.',            stats:{maxmp:10},            price:90,  minDepth:2},
    c_bracer:      {name:'전사의 팔찌',     slot:'accessory', desc:'힘과 균형을 더해주는 팔찌.',         stats:{atk:3, def:2},        price:130, minDepth:4},
    c_talisman:    {name:'현자의 부적',     slot:'accessory', desc:'마력을 크게 증폭시키는 부적.',       stats:{mag:6, maxmp:8},      price:160, minDepth:6},
    c_charm:       {name:'수호의 부적',     slot:'accessory', desc:'착용자를 지켜주는 신성한 부적.',     stats:{def:5, maxhp:15},     price:180, minDepth:7},
  };

  const RARE_EQUIPMENT = {
    r_bloodfang:     {name:'피의 이빨',       slot:'weapon',    desc:'몬스터의 몸에서만 드물게 발견되는 저주받은 검. 상점에서는 구할 수 없다. ✦특성: 가한 피해의 12%를 흡혈한다.',
      stats:{atk:18, mag:4},              minDepth:3,  rare:true, special:{lifestealPct:0.12}},
    r_stormblade:    {name:'폭풍의 검',       slot:'weapon',    desc:'번개를 두른 전설의 검. 몬스터가 드물게 떨어뜨린다. ✦특성: 공격 시 20% 확률로 번개처럼 한 번 더 벤다.',
      stats:{atk:10, spd:8},              minDepth:5,  rare:true, special:{doubleStrikeChance:0.2}},
    r_voidplate:     {name:'공허의 갑주',     slot:'armor',     desc:'심연에서 태어난 듯한 칠흑의 갑주. 몹시 희귀하다. ✦특성: 적의 공격을 12% 확률로 완전히 회피한다.',
      stats:{def:14, maxhp:30, spd:-2},   minDepth:6,  rare:true, special:{dodgeChance:0.12}},
    r_dragonscale:   {name:'용린 갑옷',       slot:'armor',     desc:'용의 비늘로 만든 갑옷. 강력한 몬스터만이 지니고 있다. ✦특성: 피격 시 15% 확률로 반격한다.',
      stats:{def:16, maxhp:20, mag:4},    minDepth:9,  rare:true, special:{counterChance:0.15}},
    r_phoenixfeather:{name:'불사조의 깃털',   slot:'accessory', desc:'만지면 따뜻한 온기가 감도는 불멸의 깃털. ✦특성: 전투 중 한 번, 쓰러질 위기에서 체력 30%로 부활한다.',
      stats:{maxhp:25, maxmp:15},         minDepth:4,  rare:true, special:{reviveOnce:0.3}},
    r_soulring:      {name:'영혼의 반지',     slot:'accessory', desc:'모든 힘의 균형을 담은 신비로운 반지. 극히 드물게 발견된다. ✦특성: 중독·화상·출혈 피해가 25% 강화된다.',
      stats:{atk:5, def:5, mag:5},        minDepth:8,  rare:true, special:{dotBoost:0.25}},
    r_roguedagger:   {name:'도적의 단검',     slot:'weapon',    desc:'맹독이 발린 얇은 단검. 뒷골목의 암살자들이 즐겨 쓴다. ✦특성: 중독 피해가 40% 강화된다.',
      stats:{atk:8, spd:6},               minDepth:2,  rare:true, special:{dotBoost:{poison:0.4}}},
    r_guardiancharm: {name:'수호자의 부적',   slot:'accessory', desc:'고대 수호자의 힘이 깃든 부적. ✦특성: 전투 중 한 번, 치명적인 공격을 완전히 막아낸다.',
      stats:{def:6, maxhp:10},            minDepth:5,  rare:true, special:{guardianShield:true}},
    r_luckyclover:   {name:'행운의 네잎클로버', slot:'accessory', desc:'우연히 발견한 네 개의 잎. 행운을 가져다준다는 소문이 있다. ✦특성: 희귀 아이템 발견 확률과 획득 골드가 늘어난다.',
      stats:{spd:2},                      minDepth:1,  rare:true, special:{rareDropBoost:0.5, goldBoost:0.2}},
  };

  // ---------- 칼리버 X (회랑의 기사 전용 무기, 3단계) ----------
  // 회랑의 기사(paladin_knight)로 전직하면 전직 즉시 caliberx_1이 강제 장착되고,
  // 레벨12/15에 도달하면 combat/battle-end.js의 applyLevelUpEffects()가 자동으로
  // caliberx_2 → caliberx_3으로 교체한다(플레이어가 직접 장착/교체하는 게 아님).
  // 세 단계 모두 equipItem()/unequipItem()에서 "회랑의 기사는 무기 슬롯을 직접
  // 조작할 수 없다"는 잠금이 걸려 있어, 상점이나 장비창에서 다른 무기로 바꾸거나
  // 벗을 수 없다. 스탯은 단계가 오를수록 조금씩 강해지지만, 이 아이템의 핵심은
  // 스탯보다 "설명이 성검→불길함→저주받은 검으로 변해가는" 서사 연출이다.
  const CALIBERX_STAGES = {
    caliberx_1: {name:'칼리버 X', slot:'weapon', storyWeapon:true, minDepth:0,
      desc:'어둠의 회랑 가장 깊은 제단에서 발견된 성검. 손에 쥐는 순간 마치 처음부터 그대의 것이었던 것처럼 익숙하게 감겨온다. 휘두를 때마다 검신에 신성한 빛이 감돌아, 성기사들 사이에 전해지는 \'선택받은 자에게만 스스로 손잡이를 내어주는 검\'이라는 전설이 사실이었음을 증명하는 듯하다.',
      stats:{atk:12, mag:6}},
    caliberx_2: {name:'칼리버 X', slot:'weapon', storyWeapon:true, minDepth:0,
      desc:'기도를 올리면 응답이 온다. 다만 그 응답이 신의 것인지는 이제 확신할 수 없다. 검신 깊숙한 곳에서 무언가가 꿈틀거리는 감각이 손끝을 타고 올라온다. 이 검은 처음부터 \'성기사를 위해\' 만들어진 게 아니었을지도 모른다.',
      stats:{atk:18, mag:9}},
    caliberx_3: {name:'칼리버 X', slot:'weapon', storyWeapon:true, minDepth:0,
      desc:'이것은 성검이 아니다. 회랑 깊은 곳에 봉인되어 있던 무언가가, 봉인을 풀어줄 그릇을 기다리며 성검의 껍데기를 두르고 있었을 뿐. 그대는 검을 선택한 것이 아니라, 검에게 선택된 것이다.',
      stats:{atk:26, mag:13}},
  };
  // 회랑의 기사가 caliberx_2/3로 자동 교체될 때, 이전 단계 스탯을 정확히 빼고
  // 새 단계 스탯을 더하기 위한 헬퍼(combat/battle-end.js에서 사용).
  function reforgeCaliberX(fromId, toId){
    const from = CALIBERX_STAGES[fromId];
    const to = CALIBERX_STAGES[toId];
    if(!to) return;
    if(from) unapplyEquipStats(from.stats);
    applyEquipStats(to.stats);
    player.equipment.weapon = toId;
    if(!player.equipOwned.includes(toId)) player.equipOwned.push(toId);
  }

  /* ---------- 에픽 세트 아이템 (어둠의 회랑) ---------- */
  const EPIC_EQUIPMENT = {
    // 전사 — 멸망한 거인의 유산
    w_giantslayer: {name:'거인의 절멸검', slot:'weapon', setId:'warrior', epic:true, minDepth:12,
      desc:'무너진 거인의 뼈로 벼려낸 대검. 어둠의 회랑 깊은 곳에서만 발견된다. ✦✦ 「멸망한 거인의 유산」 세트 部位.',
      stats:{atk:14, def:-2}},
    a_giantheart:  {name:'거인의 심장갑', slot:'armor', setId:'warrior', epic:true, minDepth:12,
      desc:'거인의 심장을 본떠 벼려낸 흉갑. ✦✦ 「멸망한 거인의 유산」 세트 부위.',
      stats:{def:11, maxhp:18}},
    c_giantring:   {name:'거인의 전쟁고리', slot:'accessory', setId:'warrior', epic:true, minDepth:12,
      desc:'전장에서 죽어간 거인의 손가락에 끼워져 있던 고리. ✦✦ 「멸망한 거인의 유산」 세트 부위.',
      stats:{atk:5, maxhp:12}},

    // 마법사 — 별을 삼킨 대현자
    w_stardevourer: {name:'멸성의 지팡이', slot:'weapon', setId:'mage', epic:true, minDepth:13,
      desc:'별 하나를 통째로 삼켰다는 전설이 전해지는 지팡이. ✦✦ 「별을 삼킨 대현자」 세트 부위.',
      stats:{mag:11, maxmp:6}},
    a_starrobe:     {name:'별빛 마도포', slot:'armor', setId:'mage', epic:true, minDepth:13,
      desc:'밤하늘의 별빛을 짜 넣은 마도사의 로브. ✦✦ 「별을 삼킨 대현자」 세트 부위.',
      stats:{def:4, maxmp:16}},
    c_voidcore:     {name:'공허의 마도핵', slot:'accessory', setId:'mage', epic:true, minDepth:13,
      desc:'공허 그 자체가 응축된 마도핵. ✦✦ 「별을 삼킨 대현자」 세트 부위.',
      stats:{mag:6, maxmp:10}},

    // 도적 — 밤을 걷는 학살자
    w_nightblades:  {name:'밤의 쌍날', slot:'weapon', setId:'rogue', epic:true, minDepth:14,
      desc:'어둠 속에서만 번뜩이는 한 쌍의 단검. ✦✦ 「밤을 걷는 학살자」 세트 부위.',
      stats:{atk:10, spd:7}},
    a_shadowcloak:  {name:'그림자 망토', slot:'armor', setId:'rogue', epic:true, minDepth:14,
      desc:'걸치면 그림자와 하나가 되는 듯한 망토. ✦✦ 「밤을 걷는 학살자」 세트 부위.',
      stats:{def:5, spd:6}},
    c_assassineye:  {name:'암살자의 눈', slot:'accessory', setId:'rogue', epic:true, minDepth:14,
      desc:'적의 빈틈을 놓치지 않는 암살자의 의안. ✦✦ 「밤을 걷는 학살자」 세트 부위.',
      stats:{atk:4, spd:5}},

    // 성기사 — 최후의 성전
    w_judgmentblade:{name:'신벌의 성검', slot:'weapon', setId:'paladin', epic:true, minDepth:15,
      desc:'신의 뜻을 대신해 벌을 내리는 성검. ✦✦ 「최후의 성전」 세트 부위.',
      stats:{atk:11, mag:4}},
    a_godplate:     {name:'신의 철갑', slot:'armor', setId:'paladin', epic:true, minDepth:15,
      desc:'신성한 힘이 깃들어 무너지지 않는 철갑. ✦✦ 「최후의 성전」 세트 부위.',
      stats:{def:13, maxhp:22}},
    c_saintheart:   {name:'성자의 심장', slot:'accessory', setId:'paladin', epic:true, minDepth:15,
      desc:'순교한 성자의 심장이 깃든 성물. ✦✦ 「최후의 성전」 세트 부위.',
      stats:{def:5, maxhp:18, maxmp:6}},

    // 메카닉 — 종말기계 Mk.Ω
    w_omegacannon:  {name:'종말식 자동포', slot:'weapon', setId:'mechanic', epic:true, minDepth:16,
      desc:'세상의 끝을 상정하고 설계된 자동 화기. ✦✦ 「종말기계 Mk.Ω」 세트 부위.',
      stats:{mag:9, atk:5}},
    a_overloadarmor:{name:'과부하 기갑', slot:'armor', setId:'mechanic', epic:true, minDepth:16,
      desc:'한계까지 출력을 끌어올린 실험용 기갑. ✦✦ 「종말기계 Mk.Ω」 세트 부위.',
      stats:{def:7, maxmp:12}},
    c_omegareactor: {name:'Ω 반응로', slot:'accessory', setId:'mechanic', epic:true, minDepth:16,
      desc:'끊임없이 마력을 증폭시키는 소형 반응로. ✦✦ 「종말기계 Mk.Ω」 세트 부위.',
      stats:{mag:6, maxmp:8}},

    // 도박사 — 운명의 마지막 패
    w_fatedeck:     {name:'운명의 사기패', slot:'weapon', setId:'jester', epic:true, minDepth:17,
      desc:'뽑는 패마다 운명이 뒤바뀐다는 소문의 카드 뭉치. ✦✦ 「운명의 마지막 패」 세트 부위.',
      stats:{atk:7, mag:6, spd:3}},
    a_jokertailcoat:{name:'광대왕의 연미복', slot:'armor', setId:'jester', epic:true, minDepth:17,
      desc:'회랑을 떠돈 어느 광대왕이 입었다는 연미복. ✦✦ 「운명의 마지막 패」 세트 부위.',
      stats:{def:5, maxhp:8, spd:4}},
    c_lastjoker:    {name:'최후의 조커', slot:'accessory', setId:'jester', epic:true, minDepth:17,
      desc:'단 한 번, 모든 것을 뒤집을 수 있는 마지막 패. ✦✦ 「운명의 마지막 패」 세트 부위.',
      stats:{mag:5, maxmp:10, spd:3}},
  };

  const EPIC_SETS = {
    warrior:  {name:'멸망한 거인의 유산',
      set2Name:'거인의 혈맥', set2Desc:'최대 HP 50% 이하일 때 물리 피해 +25%',
      set3Name:'거인강림',   set3Desc:'체력 50% 이하에서 공격/물리 스킬 사용 시 피해 +60%, 방어력 30% 관통, 20% 확률로 추가 공격 발동'},
    mage:     {name:'별을 삼킨 대현자',
      set2Name:'마력 과잉', set2Desc:'MP 50% 이상일 때 마법 피해 +25%',
      set3Name:'별의 종말', set3Desc:'MP 10 이상 소모하는 공격 마법 사용 시 피해 +70% (MP 30% 이하면 +40% 추가), 화상 부여/강화'},
    rogue:    {name:'밤을 걷는 학살자',
      set2Name:'그림자 가속', set2Desc:'속도가 적보다 높을 때 모든 물리 피해 +25%',
      set3Name:'죽음의 연쇄', set3Desc:'물리 공격 적중마다 처형 카운트 누적, 3회 누적 시 다음 공격 피해 +100% (적 HP 30% 이하면 +100% 추가), 방어력 50% 관통'},
    paladin:  {name:'최후의 성전',
      set2Name:'신성한 맹세', set2Desc:'HP 50% 이상이면 받는 피해 -15%, HP 50% 이하면 가하는 피해 +25%',
      set3Name:'최후의 심판', set3Desc:'전투 중 HP 50% 이하가 된 순간부터 피해 +50%, 흡혈 2배, 방어력 40% 관통 (HP 25% 이하 시 1회 추가로 피해 +100%)'},
    mechanic: {name:'종말기계 Mk.Ω',
      set2Name:'과부하', set2Desc:'가동 중인 장치(포탑/드론/오메가 유닛)가 있으면 모든 피해 +20%',
      set3Name:'세계종말 프로토콜', set3Desc:'장치가 가동 중인 동안 방어력 40% 관통, 모든 피해 +35%. 압력을 소모하는 스킬(밸브개방/안전밸브/과압각성/임계폭주 등) 사용 시 소모한 압력 10당 피해 +5%(최대 +50%)'},
    jester:   {name:'운명의 마지막 패',
      set2Name:'판돈 상승', set2Desc:'운 스킬 성공 시 다음 운 스킬 피해 +30% (최대 2중첩, 실패 시 중첩 초기화)',
      set3Name:'세계의 마지막 카드', set3Desc:'운 스킬 성공 3회마다 다음 운 스킬 성공 확률 최소 90%, 피해 +150%, 방어력 60% 관통, 실패해도 자해 피해 없음'},
  };

  function getItemDef(id){
    return EQUIPMENT[id] || RARE_EQUIPMENT[id] || EPIC_EQUIPMENT[id] || CALIBERX_STAGES[id];
  }

  function statsText(stats){
    return Object.entries(stats).map(([k,v])=>`${STAT_LABELS[k]||k} ${v>0?'+':''}${v}`).join(', ');
  }

  function applyEquipStats(stats){
    if(stats.atk) player.atk += stats.atk;
    if(stats.def) player.def += stats.def;
    if(stats.mag) player.mag += stats.mag;
    if(stats.spd) player.spd += stats.spd;
    if(stats.maxhp){ player.maxhp += stats.maxhp; player.hp = Math.min(player.maxhp, Math.max(0, player.hp + stats.maxhp)); }
    if(stats.maxmp){ player.maxmp += stats.maxmp; player.mp = Math.min(player.maxmp, Math.max(0, player.mp + stats.maxmp)); }
  }
  function unapplyEquipStats(stats){
    if(stats.atk) player.atk -= stats.atk;
    if(stats.def) player.def -= stats.def;
    if(stats.mag) player.mag -= stats.mag;
    if(stats.spd) player.spd -= stats.spd;
    if(stats.maxhp){ player.maxhp -= stats.maxhp; player.hp = Math.min(player.maxhp, Math.max(0, player.hp - stats.maxhp)); }
    if(stats.maxmp){ player.maxmp -= stats.maxmp; player.mp = Math.min(player.maxmp, Math.max(0, player.mp - stats.maxmp)); }
  }

  function equipItem(itemId){
    const item = getItemDef(itemId);
    if(!item) return;
    if(!player.equipOwned.includes(itemId)) return;
    const slot = item.slot;
    // 회랑의 기사(paladin_knight): 칼리버 X가 장착된 무기 슬롯은 플레이어가 직접
    // 건드릴 수 없다. 칼리버 X 자기 자신으로의 "교체"(예: 레벨업 재장착) 요청만
    // 예외로 허용한다 — combat/battle-end.js는 이 함수를 거치지 않고
    // reforgeCaliberX()를 직접 호출하므로, 사실상 이 슬롯은 플레이어 입력으로는
    // 절대 안 걸린다.
    if(slot==='weapon' && player.equipment.weapon && getItemDef(player.equipment.weapon) && getItemDef(player.equipment.weapon).storyWeapon){
      return;
    }
    const current = player.equipment[slot];
    if(current === itemId) return;
    const prevCounts = getEpicSetCounts();
    if(current){
      unapplyEquipStats(getItemDef(current).stats);
      // 장비 강화(사용자 요청) — 갈아끼우는 이전 장비의 스탯형 강화 보너스도 회수.
      if(typeof unapplyEnhancementStatBonuses==='function') unapplyEnhancementStatBonuses(current);
    }
    applyEquipStats(item.stats);
    if(typeof applyEnhancementStatBonuses==='function') applyEnhancementStatBonuses(itemId);
    player.equipment[slot] = itemId;
    renderStatus();
    checkEpicSetToast(prevCounts);
    saveGame();
  }
  function unequipItem(slot){
    const current = player.equipment[slot];
    if(!current) return;
    // 칼리버 X는 해제할 수 없다(회랑의 기사의 정체성 그 자체 — 서사상으로도
    // "검이 손을 놓아주지 않는다"는 컨셉과 맞물린다).
    const def = getItemDef(current);
    if(def && def.storyWeapon) return;
    const prevCounts = getEpicSetCounts();
    unapplyEquipStats(def.stats);
    // 장비 강화(사용자 요청) — 스탯형 강화 보너스도 함께 회수(장착 중에만 적용).
    if(typeof unapplyEnhancementStatBonuses==='function') unapplyEnhancementStatBonuses(current);
    player.equipment[slot] = null;
    renderStatus();
    checkEpicSetToast(prevCounts);
    saveGame();
  }
  function checkEpicSetToast(prevCounts){
    const newCounts = getEpicSetCounts();
    Object.keys(EPIC_SETS).forEach(setId=>{
      const prev = prevCounts[setId]||0;
      const now = newCounts[setId]||0;
      if(now===prev) return;
      if(now===2 && prev<2) showEpicSetToast(setId, 2);
      else if(now===3 && prev<3) showEpicSetToast(setId, 3);
    });
  }
  function showEpicSetToast(setId, tier){
    const set = EPIC_SETS[setId];
    const t = document.createElement('div');
    t.className = 'toast toast-epic';
    if(tier===2){
      t.innerHTML = `<h3 style="color:var(--epic-bright);">✦ ${set.name} — 2/3</h3><p><b>${set.set2Name}</b></p><p>${set.set2Desc}</p>`;
    } else {
      t.innerHTML = `<h3 style="color:var(--epic-bright);">✦✦✦ SET COMPLETE</h3><p style="color:var(--epic-bright);"><b>${set.name}</b></p><p><b>${set.set3Name}</b></p><p>${set.set3Desc}</p>`;
    }
    document.getElementById('app').appendChild(t);
    setTimeout(()=>t.remove(), 3200);
  }

  function equippedSpecials(){
    const list = Object.values(player.equipment).filter(Boolean).map(id=>{
      const def = getItemDef(id);
      return def && def.special;
    }).filter(Boolean);
    // 장비 강화(사용자 요청)로 얻은 special도 합친다 — js/blacksmith.js의
    // ENHANCEMENTS 카탈로그 중 기존 special 어휘(lifestealPct 등)를 재사용하는
    // 효과가 여기로 자동 반영된다.
    if(typeof getEquippedEnhancementSpecials==='function'){
      list.push(...getEquippedEnhancementSpecials());
    }
    return list;
  }
  function getSpecialSum(key){
    return equippedSpecials().reduce((sum,sp)=> sum + (typeof sp[key]==='number' ? sp[key] : 0), 0);
  }
  function hasSpecial(key){
    return equippedSpecials().some(sp=>sp[key]);
  }
  // 슬롯 하나(무기/방어구/장신구)에 걸린 dotBoost 총합(원본 아이템 special +
  // 그 아이템에 붙은 강화 special 전부 포함).
  function getSlotDotBoost(slot, type){
    const id = player.equipment && player.equipment[slot];
    if(!id) return 0;
    let sum = 0;
    const def = getItemDef(id);
    if(def && def.special){
      const sp = def.special;
      if(typeof sp.dotBoost === 'number') sum += sp.dotBoost;
      else if(sp.dotBoost && sp.dotBoost[type]) sum += sp.dotBoost[type];
    }
    if(typeof getEnhancementsFor==='function' && typeof ENHANCEMENTS!=='undefined'){
      getEnhancementsFor(id).forEach(eid=>{
        const edef = ENHANCEMENTS[eid];
        if(!edef || !edef.special) return;
        const sp = edef.special;
        if(typeof sp.dotBoost === 'number') sum += sp.dotBoost;
        else if(sp.dotBoost && sp.dotBoost[type]) sum += sp.dotBoost[type];
      });
    }
    return sum;
  }
  function getDotBoostRatio(type){
    // 사용자 요청(밸런스 조정): 무기(도적의 단검 등)와 방어구/장신구의 중독
    // 강화 효과는 더 이상 합산되지 않는다 — 둘 중 더 높은 쪽 하나만 적용된다.
    // (예: 도적의 단검 +40% + 독사의 반지 강화 +25%를 동시에 껴도 65%가 아니라
    // 더 높은 40%만 적용) 방어구/장신구끼리는(둘 다 dotBoost를 주는 경우)
    // 여전히 합산된다 — 무기 쪽만 별도로 분리해 비교하는 취지이기 때문.
    const weaponBoost = getSlotDotBoost('weapon', type);
    const nonWeaponBoost = getSlotDotBoost('armor', type) + getSlotDotBoost('accessory', type);
    let total = Math.max(weaponBoost, nonWeaponBoost);
    // 보스 약점(사용자 요청 — 정예/보스 리뉴얼 1차): weakness:'dot'인 보스는
    // 지속피해에 특히 취약해 피해량이 2배(+100%)가 된다. data/monsters.js의
    // BOSSES 데이터에 시범 적용된 3개 보스 한정(잠들지 않는 태엽 심장/멈추지
    // 않는 모래/빈 옷의 예언자). 이건 장비 중첩 규칙과 무관하게 항상 별도로 더해진다.
    if(typeof enemy!=='undefined' && enemy && enemy.weakness==='dot') total += 1.0;
    return total;
  }
  function getReviveRatio(){
    let best = 0;
    equippedSpecials().forEach(sp=>{ if(sp.reviveOnce && sp.reviveOnce>best) best = sp.reviveOnce; });
    return best || 0.3;
  }
  function applyPassiveLifesteal(dmg){
    const pct = getSpecialSum('lifestealPct') * epicLifestealMult();
    if(pct<=0) return 0;
    const healed = Math.min(player.maxhp-player.hp, Math.round(dmg*pct));
    if(healed>0) player.hp += healed;
    return healed;
  }

  /* ---------- 에픽 세트 효과 ---------- */
  function getEpicSetCounts(){
    const counts = {};
    Object.values(player.equipment).forEach(id=>{
      if(!id) return;
      const def = EPIC_EQUIPMENT[id];
      if(!def) return;
      counts[def.setId] = (counts[def.setId]||0)+1;
    });
    return counts;
  }
  function epicSetTier(setId){
    const c = getEpicSetCounts()[setId] || 0;
    return c>=3 ? 3 : (c>=2 ? 2 : 0);
  }
  function epicLifestealMult(){
    const pt = epicSetTier('paladin');
    return (pt>=3 && battleFlags && battleFlags.paladinAwoken) ? 2 : 1;
  }
  function checkPaladinAwoken(){
    const pt = epicSetTier('paladin');
    if(pt<3 || !battleFlags) return;
    if(player.maxhp>0 && (player.hp/player.maxhp)<=0.5) battleFlags.paladinAwoken = true;
  }
  // 물리 공격/스킬이 적중할 때마다 도적 3세트 처형 카운트를 쌓는다
  function rogueRegisterHit(isPhys){
    const rt = epicSetTier('rogue');
    if(rt<3 || !isPhys || !battleFlags) return;
    battleFlags.execCount = (battleFlags.execCount||0)+1;
    if(battleFlags.execCount>=3){
      battleFlags.execCount = 0;
      battleFlags.execReady = true;
    }
  }
  // 체력 50% 이하에서 20% 확률로 한 번 더 공격하는 전사 3세트 효과
  function maybeWarriorExtraHit(){
    const wt = epicSetTier('warrior');
    if(wt<3) return false;
    const hpRatio = player.maxhp>0 ? player.hp/player.maxhp : 1;
    if(hpRatio>0.5) return false;
    return Math.random() < 0.2;
  }
  // 운 스킬(coinflip/gamble/finalcard)의 도박사 세트 상태를 확인한다
  function epicLuckPre(s){
    const jt = epicSetTier('jester');
    const info = {jt, wasArmed:false};
    if(!s.luck || !battleFlags) return info;
    if(jt>=3 && battleFlags.jackpotArmed) info.wasArmed = true;
    return info;
  }
  function epicLuckApplyChance(chance, info){
    if(info && info.wasArmed) return Math.max(chance, 0.9);
    return chance;
  }
  function epicLuckPost(success, info){
    if(!info || !battleFlags) return;
    const jt = info.jt;
    if(success){
      if(jt>=2) battleFlags.gambleStacks = Math.min(2, (battleFlags.gambleStacks||0)+1);
      if(jt>=3){
        if(info.wasArmed){
          battleFlags.jackpotArmed = false;
          battleFlags.jackpotGauge = 0;
        } else {
          battleFlags.jackpotGauge = (battleFlags.jackpotGauge||0)+1;
          if(battleFlags.jackpotGauge>=3) battleFlags.jackpotArmed = true;
        }
      }
    } else {
      battleFlags.gambleStacks = 0;
      if(info.wasArmed){
        battleFlags.jackpotArmed = false;
        battleFlags.jackpotGauge = 0;
      }
    }
  }
  // 모든 피해 계산의 마지막 단계에서 곱해지는 에픽 세트 배율
  function getEpicSetMult(ctx){
    ctx = ctx || {};
    let mult = 1;
    const hpRatio = player.maxhp>0 ? player.hp/player.maxhp : 1;
    const mpRatio = player.maxmp>0 ? player.mp/player.maxmp : 1;
    const isPhys = ctx.type==='basic' || ctx.type==='physkill';
    const isMagic = ctx.type==='magicskill';

    // 전사 — 멸망한 거인의 유산
    const wt = epicSetTier('warrior');
    if(wt>=2 && isPhys && hpRatio<=0.5) mult *= 1.25;
    if(wt>=3 && isPhys && hpRatio<=0.5) mult *= 1.6;

    // 마법사 — 별을 삼킨 대현자
    const mt = epicSetTier('mage');
    if(mt>=2 && isMagic && mpRatio>=0.5) mult *= 1.25;
    if(mt>=3 && isMagic && (ctx.mpCost||0)>=10){
      mult *= 1.7;
      if(mpRatio<=0.3) mult *= 1.4;
      if(enemy) applyDot({type:'burn', basis:'mag', ratio:0.22, turns:3, label:'별의 화상'});
    }

    // 도적 — 밤을 걷는 학살자
    const rt = epicSetTier('rogue');
    if(rt>=2 && isPhys && enemy && player.spd>enemy.spd) mult *= 1.25;
    if(rt>=3 && isPhys && battleFlags && battleFlags.execReady){
      mult *= 2.0;
      if(enemy && enemy.maxhp>0 && (enemy.hp/enemy.maxhp)<=0.3) mult *= 2.0;
      battleFlags.execReady = false;
    }

    // 성기사 — 최후의 성전
    const pt = epicSetTier('paladin');
    if(pt>=2 && hpRatio<=0.5) mult *= 1.25;
    if(pt>=3 && battleFlags && battleFlags.paladinAwoken){
      mult *= 1.5;
      if(hpRatio<=0.25 && !battleFlags.paladinUltUsed){
        mult *= 2.0;
        battleFlags.paladinUltUsed = true;
      }
    }

    // 메카닉 — 종말기계 Mk.Ω (가동 중인 장치가 있을 때 화력이 오른다)
    // [리뉴얼] 3세트 효과 교체(사용자 요청) — 옛 데토네이터(자폭 기동) 전용
    // 효과라 지금 선택 가능한 폭주 화부/축압 기술자로는 절대 발동할 수 없는
    // 죽은 효과였다. 압력을 소모하는 스킬 전반(밸브개방/안전밸브/과압각성/
    // 임계폭주)에 걸리는 "압력 소모량 비례 피해 보너스"로 교체했다 — 1차와
    // 양쪽 2차 분기 전부를 커버한다. ctx.pressureConsumed는 각 핸들러가
    // applyOutgoingDamageMods 호출 시 실어준다(없으면 그냥 0으로 무시됨).
    const mct = epicSetTier('mechanic');
    if(mct>=2 && battleFlags && battleFlags.rig && battleFlags.rig.turnsLeft>0){
      mult *= mct>=3 ? 1.35 : 1.2;
    }
    if(mct>=3 && ctx.pressureConsumed){
      mult *= 1 + Math.min(0.5, Math.floor(ctx.pressureConsumed/10)*0.05);
    }

    // 도박사 — 운명의 마지막 패
    const jt = epicSetTier('jester');
    if(ctx.luck && battleFlags){
      if(jt>=2){
        const stacks = battleFlags.gambleStacks||0;
        if(stacks>0) mult *= (1+0.3*stacks);
      }
      if(jt>=3 && battleFlags.jackpotArmed) mult *= 2.5;
    }

    return mult;
  }

  function getEffectiveEnemyDef(base){
    let pierce = 0;
    const hpRatio = player.maxhp>0 ? player.hp/player.maxhp : 1;
    if(epicSetTier('warrior')>=3 && hpRatio<=0.5) pierce += 0.3;
    if(epicSetTier('paladin')>=3 && battleFlags && battleFlags.paladinAwoken) pierce += 0.4;
    if(epicSetTier('rogue')>=3 && battleFlags && battleFlags.execReady) pierce += 0.5;
    if(epicSetTier('mechanic')>=3 && battleFlags && battleFlags.rig && battleFlags.rig.turnsLeft>0) pierce += 0.4;
    if(epicSetTier('jester')>=3 && battleFlags && battleFlags.jackpotArmed) pierce += 0.6;
    if(enemy && enemy.exposedTurns>0) pierce += (enemy.exposePierce||0);
    if(pierce<=0) return base;
    return Math.max(0, Math.round(base*(1-Math.min(0.9, pierce))));
  }
  function getRelicSum(key){
    return (player.relics||[]).reduce((sum,id)=>{
      const r = RELICS[id];
      return sum + (r && typeof r.effect[key]==='number' ? r.effect[key] : 0);
    }, 0);
  }
  function hasRelicFlag(key){
    return (player.relics||[]).some(id=>{ const r = RELICS[id]; return r && r.effect[key]; });
  }
  // 거꾸로 된 왕관: 체력이 75% 이상이면 피해가 오히려 줄고, 낮아질수록 피해가 가속도로 커진다.
  function getLowHpScalingMult(){
    if(!hasRelicFlag('lowHpScalingDmg')) return 1;
    const ratio = player.maxhp>0 ? player.hp/player.maxhp : 1;
    if(ratio>=0.75) return Math.max(0.7, 1 - (ratio-0.75)*0.6);
    const missing = 0.75-ratio;
    return 1 + missing*missing*2.5;
  }
  // 빈 자루의 각오: 물약/상급 물약/에테르가 전부 0개일 때만 발동하는 실시간 조건부 배율.
  // 포션을 쓰는 순간 발동하고, 다시 채워 넣으면 곧바로 해제되는 동적 효과다.
  function getEmptySackMult(){
    if(!hasRelicFlag('emptySackDmg')) return 1;
    const inv = player.inv || {};
    const isEmpty = (inv.potion||0)===0 && (inv.hipotion||0)===0 && (inv.ether||0)===0;
    return isEmpty ? 1.4 : 1;
  }
  // 죽음의 모래시계: 전투 시작 후 제한 턴 이내면 피해가 오른다.
  // 회랑자의 칼날 + 칼자루: 두 개를 동시에 지니고 있을 때만 효과가 있다.
  // player.relics를 매번 실시간으로 검사하므로, 둘 중 하나가 교체로 빠지는 즉시 효과도 사라진다.
  function hasBladeHiltSet(){
    const r = player.relics||[];
    return r.includes('relic_blade') && r.includes('relic_hilt');
  }
  // 연금술사의 플라스크(포션 스택) + 복수자의 반지(피격 후 무장)를 한 번에 소모해 배율로 돌려준다.
  // 반드시 "공격 행동 1회"당 정확히 한 번만 호출해야 한다(다타 스킬은 총합에 한 번만 적용).
  function consumeOnHitBonuses(){
    let mult = 1;
    if(battleFlags){
      const stacks = battleFlags.flaskStacks||0;
      if(stacks>0){ mult *= (1 + stacks*0.2); battleFlags.flaskStacks = 0; }
      if(battleFlags.revengeArmed){ mult *= 1.3; battleFlags.revengeArmed = false; }
    }
    return mult;
  }
  function applyOutgoingDamageMods(dmg, ctx){
    ctx = ctx || {};
    let mult = 1;
    mult *= getEpicSetMult(ctx);
    mult *= (1 + getRelicSum('dmgPctMult'));
    if(ctx.type==='basic') mult *= (1 + getRelicSum('basicAtkPctMult'));
    if(ctx.type!=='basic') mult *= (1 + getRelicSum('skillDmgPctMult'));
    if(enemy && enemy.isBoss) mult *= (1 + getRelicSum('bossDmgPctMult'));
    mult *= getLowHpScalingMult();
    mult *= getHourglassMult();
    mult *= getEmptySackMult();
    mult *= (ctx.onHitMult||1);
    if(ctx.type!=='basic' && hasBladeHiltSet()) mult *= 2;
    // 장신구 강화(사용자 요청) — 마력의 반지(스킬 피해 전용), 행운의 부적(치명타),
    // 도박사의 주사위(도박), 시간의 모래(전투 첫 행동)까지 전부 이 지점에서 처리.
    if(ctx.type!=='basic') mult *= (1 + getSpecialSum('skillDmgPctBonus'));
    const critChance = getSpecialSum('critChancePct');
    if(critChance>0 && Math.random()<critChance) mult *= 1.5;
    const gambleChance = getSpecialSum('gambleDiceChance');
    if(gambleChance>0){
      if(Math.random()<gambleChance) mult *= 2;
      else mult *= 0.8;
    }
    if(hasSpecial('firstActionBonus') && battleFlags && !battleFlags.firstActionUsed){
      battleFlags.firstActionUsed = true;
      mult *= (1+getSpecialSum('firstActionBonus'));
    }
    let result = Math.max(1, Math.round(dmg*mult));
    return Math.max(1, result);
  }

  // 불확실성의 주사위: 이전 전투에서 적용된 임시 스탯을 정확히 되돌린다.
  function revertDiceDelta(){
    const d = player.diceDelta;
    if(!d) return;
    if(d.atk) player.atk -= d.atk;
    if(d.def) player.def -= d.def;
    if(d.mag) player.mag -= d.mag;
    if(d.maxhp) player.maxhp -= d.maxhp;
    if(d.hp) player.hp -= d.hp;
    if(d.spd) player.spd -= d.spd;
    player.maxhp = Math.max(1, player.maxhp);
    player.hp = Math.max(1, Math.min(player.hp, player.maxhp));
    player.diceDelta = null;
  }
