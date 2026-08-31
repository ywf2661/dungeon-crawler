"use strict";
/*
장비 강화 시스템(사용자 요청) — 대장간 UI + 강화 데이터/로직.
export(전역): ENHANCEMENTS, ENHANCE_MAX, ENHANCE_COST, getItemGrade, getEnhancementsFor,
              getEnhancedDisplayName, getEquippedEnhancementSpecials, getWeaponEnhanceDamageMult,
              applyWeaponOnHitEffects, shouldTriggerWeaponMultiStrike, grantReinforceStones,
              rollReinforceStoneDrop, openBlacksmith
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
            ${enhList.length ? enhList.map(eid=>`✦ ${ENHANCEMENTS[eid].name}: ${ENHANCEMENTS[eid].desc}`).join('<br>') : '강화된 적 없음'}
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
    const pool = Object.keys(ENHANCEMENTS).filter(eid=> ENHANCEMENTS[eid].slot===slot && !already.includes(eid));
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
        ${candidates.map(eid=>`
        <button class="btn enhance-pick" data-eid="${eid}" style="text-align:left; padding:10px 12px;">
          <b>${ENHANCEMENTS[eid].prefix} — ${ENHANCEMENTS[eid].name}</b><br>
          <span style="font-size:12px; color:var(--parchment-dim); font-weight:normal;">${ENHANCEMENTS[eid].desc}</span>
        </button>`).join('')}
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
        const def = ENHANCEMENTS[eid];
        // 1회성 스탯 델타(사용자 요청 — 피의 갑옷 최대HP+20%, 마력의 반지 최대MP+20%).
        // 유물 적용분(player.relicAppliedDeltas)과 동일한 원리로, 부여 시점의
        // 현재 최대치 기준으로 딱 한 번 계산해 더한다(장착 여부와 무관하게 유지).
        if(def.maxhpPctBonus){
          const delta = Math.round(player.maxhp*def.maxhpPctBonus);
          player.maxhp += delta; player.hp += delta;
        }
        if(def.maxmpPctBonus){
          const delta = Math.round(player.maxmp*def.maxmpPctBonus);
          player.maxmp += delta; player.mp += delta;
        }
        renderStatus();
        addLog(`[${getEnhancedDisplayName(id)}]에 [${def.name}]을(를) 새겼다!`, 'gold');
        saveGame();
        renderBlacksmithHome(panel);
      });
    });
    panel.querySelector('#blacksmith-cancel').addEventListener('click', ()=>renderBlacksmithHome(panel));
  }
