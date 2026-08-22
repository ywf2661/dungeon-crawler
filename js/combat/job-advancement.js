"use strict";
/*
레벨 10 하이브리드 전직 선택 UI.
export(전역): showJobAdvancement, resolveJobAdvancement
의존성: state.js, data/jobs.js(JOB_HYBRIDS/getHybrid)
*/
  /* ---------- 전직 선택 UI (레벨 10) ---------- */
  function showJobAdvancement(){
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'jobadv-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel relic-panel-locked';
    const myJob = getJob(player);
    panel.innerHTML = `<h3>전직의 때가 왔다!</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;line-height:1.6;margin-bottom:12px;">
        레벨 10에 도달했다. 이대로 <b style="color:var(--gold-bright);">${myJob.name}</b>의 길을 계속 갈지,
        다른 직업의 힘을 받아들여 새로운 존재로 각성할지 선택하라.
      </p>
      <p class="relic-lock-msg" id="jobadv-lock-msg">내용을 살펴보는 중…</p>
      <div class="job-select" id="jobadv-select"></div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    const grid = panel.querySelector('#jobadv-select');
    // 유물/저주 제단과 동일하게, 창이 뜬 직후 잠깐은 선택을 막아 오터치로
    // 실수 선택되는 것을 방지한다(job-card는 <div>라 disabled 속성이 안 먹히므로
    // JS 플래그로 직접 막는다).
    let locked = true;
    JOBS.forEach(j=>{
      const isSelf = j.id === myJob.id;
      const hybrid = JOB_HYBRIDS[sortedPairKey(myJob.id, j.id)];
      const card = document.createElement('div');
      card.className = 'job-card';
      card.innerHTML = `<div class="ji-icon">${hybrid ? hybrid.icon : j.icon}</div>
        <div class="ji-name">${hybrid ? hybrid.name : j.name}</div>
        <div class="ji-desc">${hybrid ? hybrid.desc : j.desc}</div>`;
      card.addEventListener('click', ()=>{
        if(locked) return;
        resolveJobAdvancement(isSelf ? null : j.id);
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
  function resolveJobAdvancement(secondJobId){
    player.jobChosenAt10 = true;
    player.jobAdvancePending = false;
    const chosenSecond = secondJobId || player.job;
    const isSelfPick = chosenSecond === player.job;
    player.job2 = chosenSecond;
    if(isSelfPick){
      player.maxhp += 16; player.maxmp += 8;
      player.atk += 3; player.def += 3; player.mag += 3; player.spd += 3;
    } else {
      const secondJob = JOBS.find(j=>j.id===chosenSecond);
      const m = secondJob.statMods;
      player.maxhp += 10 + Math.round((m.maxhp||0)*0.5);
      player.maxmp += 4 + Math.round((m.maxmp||0)*0.5);
      player.atk += Math.round((m.atk||0)*0.5);
      player.def += Math.round((m.def||0)*0.5);
      player.mag += Math.round((m.mag||0)*0.5);
      player.spd += Math.round((m.spd||0)*0.5);
    }
    if(hasRelicFlag('noPostBattleHeal')){
      player.hp = Math.min(player.hp, player.maxhp);
      player.mp = Math.min(player.mp, player.maxmp);
    } else {
      player.hp = player.maxhp; player.mp = player.maxmp;
    }
    const hybrid = getHybrid(player);
    const skillKey = hybrid && hybrid.skills[10];
    if(skillKey && !player.skills.includes(skillKey)) player.skills.push(skillKey);
    renderStatus();
    if(hybrid){
      addLog(`${player.name}은(는) ${hybrid.icon} ${hybrid.name}(으)로 각성했다! 새로운 스킬 「${SKILLDB[skillKey].name}」을(를) 익혔다.`, 'gold');
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
