"use strict";
/*
레벨 10 전직 선택 UI(본인 직업 내 2분기 선택 — 세분화 시스템).
export(전역): showJobAdvancement, resolveJobAdvancement
의존성: state.js, data/jobs.js(JOB_SPECIALIZATIONS/getSpecialization/needsSpecializationMigration)
주의: 구조 전환 1단계 상태. 분기 데이터(이름/설명)는 확정되어 있으나, 각 분기의 실제
     전투 스킬(SKILLDB의 masterySkillId/activeSkillId)은 2단계에서 직업별로 순차
     구현될 예정이라, resolveJobAdvancement()는 SKILLDB에 아직 없는 키는 지급을
     건너뛴다(방어적 처리 — 2단계에서 SKILLDB에 채워 넣기만 하면 자동으로 지급됨).
     일격의 구도자(warrior_purist)처럼 activeSkillId가 아예 없는(null) 액티브-없음
     분기도 있을 수 있어, 아래 각성 안내 로그는 activeName이 없을 때 그 부분을
     자연스럽게 생략하도록 처리되어 있다.
*/
  /* ---------- 전직 선택 UI (레벨 10 / 레거시 하이브리드 재전직) ---------- */
  // 분기 개수(N)를 "한 갈래"/"두 갈래"/"세 갈래" 같은 한국어 관형사 표현으로
  // 바꾼다. 계약술사처럼 3분기, 앞으로 4분기 이상이 생겨도 안내 문구가 자동으로
  // 맞는 개수로 나오게 하기 위함(예전엔 "두 갈래"가 하드코딩되어 있어 마법사가
  // 3분기가 된 뒤에도 계속 "두 갈래"라고 잘못 표시되고 있었다).
  function branchCountLabel(n){
    const map = {1:'한', 2:'두', 3:'세', 4:'네', 5:'다섯', 6:'여섯', 7:'일곱', 8:'여덟'};
    return (map[n] || n) + ' 갈래';
  }

  function showJobAdvancement(){
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'jobadv-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel relic-panel-locked';
    const myJob = getJob(player);
    const isMigration = needsSpecializationMigration(player);
    const branches = JOB_SPECIALIZATIONS[myJob.id] || [];
    const branchLabel = branchCountLabel(branches.length);
    const introHtml = isMigration
      ? `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;line-height:1.6;margin-bottom:12px;">
          전직 체계가 새롭게 개편되었다. 이전에 택했던 길은 저물고,
          <b style="color:var(--gold-bright);">${myJob.name}</b> 본연의 ${branchLabel} 중 하나를 다시 선택해야 한다.
        </p>`
      : `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;line-height:1.6;margin-bottom:12px;">
          레벨 10에 도달했다. <b style="color:var(--gold-bright);">${myJob.name}</b>의 ${branchLabel} 중
          하나를 선택해 각성하라.
        </p>`;
    panel.innerHTML = `<h3>전직의 때가 왔다!</h3>
      ${introHtml}
      <p class="relic-lock-msg" id="jobadv-lock-msg">내용을 살펴보는 중…</p>
      <div class="job-select" id="jobadv-select"></div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    const grid = panel.querySelector('#jobadv-select');
    // 유물/저주 제단과 동일하게, 창이 뜬 직후 잠깐은 선택을 막아 오터치로
    // 실수 선택되는 것을 방지한다(job-card는 <div>라 disabled 속성이 안 먹히므로
    // JS 플래그로 직접 막는다).
    let locked = true;
    branches.forEach(spec=>{
      const card = document.createElement('div');
      card.className = 'job-card';
      card.innerHTML = `<div class="ji-icon">${spec.icon}</div>
        <div class="ji-name">${spec.name}</div>
        <div class="ji-desc">${spec.desc}</div>`;
      card.addEventListener('click', ()=>{
        if(locked) return;
        resolveJobAdvancement(spec.id);
        overlay.remove();
      });
      grid.appendChild(card);
    });
    const LOCK_MS = 1500;
    setTimeout(()=>{
      locked = false;
      panel.classList.remove('relic-panel-locked');
      const msg = panel.querySelector('#jobadv-lock-msg');
      if(msg) msg.remove();
    }, LOCK_MS);
  }
  // 강철 군단장(mechanic_accumulator 리뉴얼) 전용 — 기본 기관사 스킬(1/3/7레벨:
  // 보일러 점화/밸브 개방/안전밸브)을 로봇 테마 대체 스킬로 교체한다(5레벨
  // 표적 마킹은 그대로 재사용 — combat/enemy-turn.js에서 로봇 사격에도 표식
  // 보너스가 적용되도록 확장해뒀다). 1레벨 보일러 점화(mechanicIgnite)는
  // 사용자 요청으로 대체 스킬 없이 그냥 제거한다(swapMap 값이 null이면 skip).
  // 멱등(idempotent)하게 짜여 있어 여러 번 호출해도 안전하다 — 그래서 신규
  // 전직 시점(resolveJobAdvancement)뿐 아니라 이미 이 특성으로 전직을 마친
  // 기존 세이브 캐릭터를 위해 combat/battle-setup.js의 startBattle()에서도
  // 매 전투 시작 시 호출한다.
  function migrateLegionBaseSkills(player){
    if(player.specialization !== 'mechanic_accumulator') return;
    const swapMap = {mechanicIgnite:null, mechanicValve:'mechanicFocusFire', mechanicSafety:'legionMaintenance'};
    Object.keys(swapMap).forEach(oldId=>{
      const newId = swapMap[oldId];
      const idx = player.skills.indexOf(oldId);
      if(idx>=0) player.skills.splice(idx,1);
      if(newId && !player.skills.includes(newId)) player.skills.push(newId);
    });
    // 개발 중 잠깐 존재했던 "긴급 배치"(legionEmergencyDeploy)를 이미 받은
    // 캐릭터가 있다면 정리한다(사용자 요청으로 최종 킷에서 제외됨).
    const emgIdx = player.skills.indexOf('legionEmergencyDeploy');
    if(emgIdx>=0) player.skills.splice(emgIdx,1);
  }
  function resolveJobAdvancement(specId){
    player.jobChosenAt10 = true;
    player.jobAdvancePending = false;
    player.job2 = null; // 레거시 하이브리드 파트너 직업 필드 — 신규 시스템에서는 더 이상 쓰지 않는다.
    player.specialization = specId;
    // 스탯 보너스: 기존 하이브리드 시스템의 "본인 직업 재선택" 보너스 공식을 그대로 재사용.
    player.maxhp += 16; player.maxmp += 8;
    player.atk += 3; player.def += 3; player.mag += 3; player.spd += 3;
    // 일격의 구도자(warrior_purist): 스킬을 전혀 쓰지 않는(패시브 3개뿐인) 컨셉이라
    // 마나 자체가 필요 없다. 위에서 계산된 maxmp 증가분을 포함해 완전히 0으로
    // 되돌린다(사용자 요청).
    if(specId === 'warrior_purist'){
      player.maxmp = 0;
    }
    // 저주술사(mastery_curseweaver)는 무회복(굶주린 회랑)도 저주 개수만큼의 확률로
    // 뚫고 나올 수 있다 — isCurseSealActive()가 확률 판정과 배너 안내를 처리한다.
    if(isCurseSealActive('noPostBattleHeal', '저주를 찢고 완전히 회복했다!')){
      player.hp = Math.min(player.hp, player.maxhp);
      player.mp = Math.min(player.mp, player.maxmp);
    } else {
      player.hp = player.maxhp; player.mp = player.maxmp;
    }
    const spec = getSpecialization(player);
    if(spec){
      // 마스터리 패시브/액티브 스킬은 SKILLDB에 실제 정의가 있을 때만 지급한다.
      // 2단계에서 직업별로 SKILLDB 항목을 채워 넣으면, 이후 전직하는 캐릭터부터
      // 자동으로 지급되기 시작한다(이미 전직을 마친 캐릭터는 재전직 없이는 소급되지 않음).
      // masterySkillIds/activeSkillIds(복수, 배열)가 있으면 그쪽을 우선 사용한다 —
      // 계약술사처럼 마스터리 슬롯 하나가 아니라 여러 개(화염/빙결/번개계약)를
      // 동시에 지급해야 하는 분기를 위한 확장이다. 기존 단수형(masterySkillId/
      // activeSkillId) 필드를 쓰는 다른 모든 분기는 그대로 동작한다.
      const grantKeys = [
        ...(spec.masterySkillIds || (spec.masterySkillId ? [spec.masterySkillId] : [])),
        ...(spec.activeSkillIds || (spec.activeSkillId ? [spec.activeSkillId] : [])),
      ];
      grantKeys.forEach(skillKey=>{
        if(skillKey && typeof SKILLDB!=='undefined' && SKILLDB[skillKey] && !player.skills.includes(skillKey)){
          player.skills.push(skillKey);
        }
      });
      // 회랑의 기사(paladin_knight): 전직 확정 즉시 전용 무기 칼리버 X 1단계를
      // 강제로 장착한다. equipItem()을 거치지 않고 직접 처리한다 — equipItem()은
      // "이미 칼리버 X를 장착 중이면 무기 슬롯을 못 바꾼다"는 잠금이 걸려 있어서,
      // 최초 장착 자체가 막히는 문제가 없도록 여기서는 우회한다. 기존 무기가
      // 있었다면 그 스탯을 정확히 빼고 칼리버 X 스탯을 더한다.
      if(specId==='paladin_knight' && typeof CALIBERX_STAGES!=='undefined'){
        const prevWeapon = player.equipment.weapon;
        if(prevWeapon && getItemDef(prevWeapon)) unapplyEquipStats(getItemDef(prevWeapon).stats);
        applyEquipStats(CALIBERX_STAGES.caliberx_1.stats);
        player.equipment.weapon = 'caliberx_1';
        if(!player.equipOwned.includes('caliberx_1')) player.equipOwned.push('caliberx_1');
      }
      // 강철 군단장(mechanic_accumulator 리뉴얼) 베이스 스킬 교체 — 함수는
      // 아래 migrateLegionBaseSkills()에 분리해뒀다(신규 전직 시점 + 기존
      // 세이브 캐릭터의 전투 진입 시점, 총 두 곳에서 호출해야 하기 때문).
      migrateLegionBaseSkills(player);
    }
    // [디버그 전용] 캐릭터 이름이 정확히 "admin"(대소문자 무관)이면, 전직 직후
    // 즉시 레벨 15까지 올려서 12/15레벨 스킬을 곧바로 테스트할 수 있게 한다.
    // combat/battle-end.js의 applyLevelUpEffects()를 그대로 재사용하므로, 실제
    // 정상 레벨업과 완전히 동일한 방식(스탯 증가 + 2차 전직 스킬 지급 포함)으로
    // 처리된다 — exp/expNext 소모는 건드리지 않으므로 이후 정상적인 경험치
    // 누적에도 영향이 없다. 이름이 "admin"이 아닌 캐릭터에는 전혀 영향 없다.
    if(player.name && player.name.trim().toLowerCase()==='admin'){
      while(player.level < 15){
        applyLevelUpEffects();
      }
    }
    // [디버그 전용] admin2는 위 admin과 같은 이유(12/15레벨 세분화 스킬 확인용)로
    // 레벨을 다시 통과시켜야 하는데, admin2는 이미 레벨20으로 시작해버려서
    // "레벨을 다시 올려 통과시키는" 방식(위 admin 블록)이 전혀 발동하지 않는다
    // (player.level<15가 처음부터 거짓). 그래서 spec.skillLevels에 있는 레벨 중
    // 이미 지난 것들을 레벨업 없이 직접 지급한다 — exp/expNext는 건드리지
    // 않으므로 이후 정상적인 경험치 누적에 영향 없다. 이름이 "admin2"가 아닌
    // 캐릭터에는 전혀 영향 없다. (사용자 요청으로 admin3도 동일하게 적용)
    const debugName = player.name && player.name.trim().toLowerCase();
    const isAdminDebug2or3 = debugName==='admin2' || debugName==='admin3';
    if(isAdminDebug2or3 && spec && spec.skillLevels){
      Object.keys(spec.skillLevels).forEach(lvKey=>{
        if(Number(lvKey) > player.level) return;
        const skillKey = spec.skillLevels[lvKey];
        if(skillKey && typeof SKILLDB!=='undefined' && SKILLDB[skillKey] && !player.skills.includes(skillKey)){
          player.skills.push(skillKey);
        }
      });
    }
    // [디버그 전용] 저주술사(mage_curseweaver)는 admin2/admin3 둘 다 "현실적인
    // 저주 보유량"을 갖게 한다(사용자 요청) — 유물처럼 처음부터 몰아주면
    // 딜사이클이 실제 자연 진행과 안 맞기 때문. 구간마다 저주 제단이 1번씩
    // (총 5번) 뜨지만 고른 경로가 매번 그 노드를 지나간다는 보장은 없어,
    // 5개 중 4개만 무작위로 지급한다(하나는 놓친 것으로 취급). applyRelicEffect()
    // 호출 시점이 마스터리(mastery_curseweaver, 위 grantKeys 루프에서 이미
    // 지급됨) 지급 "이후"라 페널티 절반 감면 + 마력+4 보너스가 자동으로
    // 정확히 반영된다.
    if(isAdminDebug2or3 && specId==='mage_curseweaver'){
      const cursePool = Object.keys(RELICS).filter(id=>{
        const r = RELICS[id];
        return r && r.type==='curse' && !r.deprecated;
      });
      const shuffled = cursePool.slice();
      for(let i=shuffled.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      shuffled.slice(0, Math.min(4, shuffled.length)).forEach(id=>{
        player.relics.push(id);
        if(typeof applyRelicEffect==='function') applyRelicEffect(id);
      });
    }
    renderStatus();
    if(spec){
      // 일격의 구도자처럼 activeName이 없는(액티브 스킬 자체가 없는) 분기를 대비해,
      // 마스터리/액티브 각각 실제로 존재할 때만 안내 문구에 포함시킨다.
      const parts = [];
      if(spec.masteryName) parts.push(`「${spec.masteryName}」이(가) 상시 발동하기 시작했다`);
      if(spec.activeName) parts.push(`「${spec.activeName}」을(를) 익혔다`);
      const detail = parts.length ? ' ' + parts.join(', ') + '.' : '';
      addLog(`${player.name}은(는) ${spec.icon} ${spec.name}(으)로 각성했다!${detail}`, 'gold');
    }
    saveGame();
  }
  // 마녀의 시계: 속도가 높을수록 적에게 턴을 넘기지 않고 한 번 더 행동할 확률이 생긴다.
  // (한 턴에 최대 1회. 22곳에 흩어진 enemyTurn() 호출부를 그대로 두기 위해, 여기서 래퍼로 가로챈다.)
  function getWitchClockExtraChance(){
    if(!hasRelicFlag('extraActionBySpd')) return 0;
    const spd = player.spd||0;
    if(spd>=25) return 0.30;
    if(spd>=20) return 0.20;
    if(spd>=15) return 0.10;
    return 0;
  }
