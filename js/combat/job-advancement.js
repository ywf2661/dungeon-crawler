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
  function showJobAdvancement(){
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'jobadv-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel relic-panel-locked';
    const myJob = getJob(player);
    const isMigration = needsSpecializationMigration(player);
    const introHtml = isMigration
      ? `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;line-height:1.6;margin-bottom:12px;">
          전직 체계가 새롭게 개편되었다. 이전에 택했던 길은 저물고,
          <b style="color:var(--gold-bright);">${myJob.name}</b> 본연의 두 갈래 중 하나를 다시 선택해야 한다.
        </p>`
      : `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;line-height:1.6;margin-bottom:12px;">
          레벨 10에 도달했다. <b style="color:var(--gold-bright);">${myJob.name}</b>의 두 갈래 중
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
    const branches = JOB_SPECIALIZATIONS[myJob.id] || [];
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
      [spec.masterySkillId, spec.activeSkillId].forEach(skillKey=>{
        if(skillKey && typeof SKILLDB!=='undefined' && SKILLDB[skillKey] && !player.skills.includes(skillKey)){
          player.skills.push(skillKey);
        }
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
