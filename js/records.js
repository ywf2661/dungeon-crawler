"use strict";
/*
이전 모험 기록 렌더 + 유물 도감 표시(획득한 유물의 현재 상태를 설명에 덧붙인다) + 업적 판정/도감.
export(전역): renderRecords, getRelicDisplayDesc, showMyRelics, checkAchievements, showAchievements,
              showAchievementToast
의존성: player(state.js), RELICS(relics.js), ACHIEVEMENTS(data/achievements.js),
        loadRelicDex/loadAchievements/unlockAchievement(storage.js)
주의: checkAchievements(player, record, records)는 bootstrap.js의 addRecord() 직후,
     player가 아직 리셋(deleteSave)되기 전 시점에 호출된다. record는 이번 판(run)의
     결과, records는 addRecord()가 반환한 전체 누적 기록 배열(누적형 업적 판정용).
주의: showMyRelics()가 저주(type:'curse')를 일반 유물과 분리해 별도 묶음("☠ 저주")으로
     보여주도록 바뀌었다 — 저주는 슬롯을 차지하지 않고 영구히 유지된다는 성격이 일반
     유물과 달라 섞여 있으면 헷갈리기 쉽다는 이유. relics.js의 showRelicSwapPrompt()도
     같은 이유로 저주를 교체 후보에서 아예 제외하도록 이미 고쳐져 있다.
*/

  function renderRecords(records){
    const section = document.getElementById('records-section');
    const box = document.getElementById('records-list');
    if(!records || !records.length){ section.style.display='none'; return; }
    section.style.display='block';
    box.innerHTML = '';
    records.slice().reverse().forEach(r=>{
      const row = document.createElement('div');
      row.className = 'record-row' + (r.trueEnding ? ' flawless' : '');
      const left = document.createElement('span');
      left.className = 'rec-name';
      left.textContent = r.name;
      const job = document.createElement('span');
      job.className = 'rec-job';
      job.textContent = r.jobLabel;
      const diffLabel = {easy:'쉬움', normal:'보통', hardcore:'하드코어'}[r.difficulty] || '쉬움';
      const stat = document.createElement('span');
      stat.className = 'rec-stat';
      stat.textContent = `${diffLabel} · Lv.${r.level} · 사망 ${r.deathCount}회`;
      row.appendChild(left); row.appendChild(job); row.appendChild(stat);
      if(r.trueEnding){
        const badge = document.createElement('span');
        badge.className = 'rec-flawless-badge';
        badge.style.color = 'var(--gold-bright)';
        badge.style.marginLeft = '6px';
        badge.title = '한 번도 쓰러지지 않고 진 최종보스를 물리쳤다';
        badge.textContent = '👑 무결';
        row.appendChild(badge);
      }
      box.appendChild(row);
    });
  }

  async function showRelicDex(){
    const discovered = await loadRelicDex();
    const ids = Object.keys(RELICS);
    const typeLabel = {blessing:'축복', contract:'계약', curse:'저주', wild:'변칙'};
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'relicdex-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    panel.innerHTML = `<h3>📖 유물 도감</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;margin:-4px 0 10px;">발견: ${discovered.length} / ${ids.length}</p>
      <div id="relicdex-list"></div>
      <div style="text-align:center; margin-top:10px;"><button class="btn" id="relicdex-close">닫기</button></div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    const box = panel.querySelector('#relicdex-list');
    ids.forEach(id=>{
      const found = discovered.includes(id);
      const r = RELICS[id];
      const row = document.createElement('div');
      row.className = 'relicdex-row' + (found?'':' locked');
      if(found){
        row.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--gold-bright); font-family:'Cinzel';">${r.name}</span><span>${typeLabel[r.type]}</span>
          </div>
          <div class="relic-desc" style="margin-top:3px;">${r.desc}</div>`;
      } else {
        row.innerHTML = `<span>？？？</span><span>🔒</span>`;
      }
      box.appendChild(row);
    });
    panel.querySelector('#relicdex-close').addEventListener('click', ()=> overlay.remove());
  }

  // 현재 보유 중인 유물 목록 (탐험 화면에서 언제든 확인 가능)
  // 상태가 변하는 유물들의 "지금 상태"를 설명에 덧붙인다(촛불 소모여부/주사위 현재효과/
  // 플라스크 스택/뱀의허물 발동여부/복수자의반지 무장상태).
  function getRelicDisplayDesc(id){
    const r = RELICS[id];
    if(!r) return '';
    if(id==='relic_candle'){
      return player.candleUsed ? '촛불이 꺼졌다. 다신 불이 들어오지 않을 것 같다.' : r.desc;
    }
    if(id==='relic_dice'){
      const inBattle = isBattleActive();
      const eff = battleFlags && battleFlags.diceEffect;
      if(inBattle && eff) return r.desc + ` <span class="relic-pos">(이번 전투: ${DICE_EFFECT_LABELS[eff]})</span>`;
      return r.desc + ` <span style="opacity:.7;">(전투 중이 아니면 효과가 없다)</span>`;
    }
    if(id==='relic_flask'){
      const st = (battleFlags && battleFlags.flaskStacks) || 0;
      return r.desc + ` <span class="relic-pos">(현재 스택: ${st}/3)</span>`;
    }
    if(id==='relic_snakeskin'){
      if(!isBattleActive()) return r.desc;
      const used = battleFlags && battleFlags.snakeskinUsed;
      return r.desc + (used ? ' <span style="opacity:.7;">(이번 전투에서 이미 발동함)</span>' : ' <span class="relic-pos">(이번 전투 발동 대기 중)</span>');
    }
    if(id==='relic_revengering'){
      const armed = battleFlags && battleFlags.revengeArmed;
      return r.desc + (armed ? ' <span class="relic-pos">(다음 공격 강화 대기 중!)</span>' : '');
    }
    if(id==='relic_blade' || id==='relic_hilt'){
      return r.desc + (hasBladeHiltSet()
        ? ' <span class="relic-pos">(짝이 맞았다! 모든 스킬 피해 2배 발동 중)</span>'
        : ' <span style="opacity:.7;">(아직 짝을 찾지 못했다 — 단독으로는 효과가 없다)</span>');
    }
    if(id==='relic_emptysack'){
      const inv = player.inv || {};
      const isEmpty = (inv.potion||0)===0 && (inv.hipotion||0)===0 && (inv.ether||0)===0 && (inv.hiether||0)===0;
      return r.desc + (isEmpty
        ? ' <span class="relic-pos">(지금 발동 중!)</span>'
        : ' <span style="opacity:.7;">(포션류를 모두 소진하면 발동)</span>');
    }
    if(id==='relic_merchantseal'){
      const st = player.merchantSealStack||0;
      return r.desc + ` <span class="relic-pos">(현재 스택: ${st}/10)</span>`;
    }
    return r.desc;
  }

  // 유물 카드 묶음 하나를 그린다(showMyRelics 전용 헬퍼). 저주/일반 유물 두 묶음을
  // 같은 방식으로 그리기 위해 분리했다.
  function renderRelicCardGroup(ids, typeLabel){
    return `<div class="relic-grid">` + ids.map(id=>{
      const r = RELICS[id];
      if(!r) return '';
      return `<div class="relic-card type-${r.type}" style="cursor:default;">
        <div class="relic-type">${typeLabel[r.type]}</div>
        <div class="relic-name">${r.name}</div>
        <div class="relic-desc">${getRelicDisplayDesc(id)}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  // 업적 판정. record는 이번 판 결과(bootstrap.js에서 구성), records는 addRecord()가
  // 반환한 전체 누적 기록(과거 판 전부 + 이번 판). player는 아직 리셋 전이라
  // player.relics/player.equipOwned를 그대로 참조할 수 있다.
  // 반환값: 이번에 새로 달성한 업적 정의(ACHIEVEMENTS 원소) 배열.
  async function checkAchievements(player, record, records){
    const relics = player.relics || [];
    const curseIds = relics.filter(id=>{ const r=RELICS[id]; return r && r.type==='curse'; });
    const blessingIds = relics.filter(id=>{ const r=RELICS[id]; return r && r.type==='blessing'; });
    const relicDex = await loadRelicDex();

    const candidates = [];
    if(!record.trueEnding) candidates.push('ach_new_guardian');
    if(record.trueEnding && record.bossType!=='timewitch') candidates.push('ach_progenitor_rest');
    if(record.trueEnding && record.bossType==='timewitch') candidates.push('ach_witch_time');
    if(record.difficulty==='hardcore') candidates.push('ach_hardcore_clear');
    if(record.trueEnding && (record.deathCount||0)===0) candidates.push('ach_flawless');
    if(relicDex.length >= Object.keys(RELICS).length) candidates.push('ach_relicdex_complete');
    if((player.equipOwned||[]).includes('r_achoskeepsake')) candidates.push('ach_achos_keepsake');
    if(curseIds.length >= 3) candidates.push('ach_triple_curse');
    if(blessingIds.length===0 && curseIds.length>=1) candidates.push('ach_pure_misfortune');
    if(relics.length>0 && relics.every(id=>{ const r=RELICS[id]; return r && r.type==='contract'; })) candidates.push('ach_contract_incarnate');

    const BASE_JOB_IDS = ['warrior','mage','rogue','paladin','mechanic','jester'];
    if(records && BASE_JOB_IDS.every(jid=> records.some(r=>r.job===jid))) candidates.push('ach_all_rounder');
    if(records && records.length >= 10) candidates.push('ach_frequent_flyer');
    if(records){
      const totalDeaths = records.reduce((s,r)=> s + (r.deathCount||0), 0);
      if(totalDeaths >= 10) candidates.push('ach_undying_will');
    }

    const newlyUnlocked = [];
    for(const id of candidates){
      const {isNew} = await unlockAchievement(id);
      if(isNew){
        const def = ACHIEVEMENTS.find(a=>a.id===id);
        if(def) newlyUnlocked.push(def);
      }
    }
    return newlyUnlocked;
  }

  // 엔딩→타이틀 전환 직후처럼 화면이 이미 바뀐 상태에서도 보이도록,
  // 특정 화면 마크업이 아니라 #app 위에 얹는 오버레이 토스트로 띄운다
  // (shop-overlay/relicdex-overlay 등과 같은 패턴).
  function showAchievementToast(newlyUnlocked){
    if(!newlyUnlocked || !newlyUnlocked.length) return;
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'achievement-toast-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    panel.innerHTML = `<h3>🏆 신규 업적 달성!</h3>
      <div>${newlyUnlocked.map(a=>`
        <div class="relicdex-row">
          <div style="color:var(--gold-bright); font-family:'Cinzel';">${a.name}</div>
          <div class="relic-desc" style="margin-top:3px;">${a.desc}</div>
        </div>`).join('')}</div>
      <div style="text-align:center; margin-top:10px;"><button class="btn" id="achievement-toast-close">확인</button></div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    panel.querySelector('#achievement-toast-close').addEventListener('click', ()=> overlay.remove());
  }

  async function showAchievements(){
    const unlocked = await loadAchievements();
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'achievements-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    panel.innerHTML = `<h3>📜 업적</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;margin:-4px 0 10px;">달성: ${unlocked.length} / ${ACHIEVEMENTS.length}</p>
      <div id="achievements-list"></div>
      <div style="text-align:center; margin-top:10px;"><button class="btn" id="achievements-close">닫기</button></div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    const box = panel.querySelector('#achievements-list');
    ACHIEVEMENTS.forEach(a=>{
      const done = unlocked.includes(a.id);
      const row = document.createElement('div');
      row.className = 'relicdex-row' + (done?'':' locked');
      if(done){
        row.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--gold-bright); font-family:'Cinzel';">${a.name}</span><span>✅</span>
          </div>
          <div class="relic-desc" style="margin-top:3px;">${a.desc}</div>`;
      } else if(a.hidden){
        row.innerHTML = `<span>？？？</span><span>🔒</span>`;
      } else {
        row.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--parchment-dim);">${a.name}</span><span>🔒</span>
          </div>
          <div class="relic-desc" style="margin-top:3px; opacity:.7;">${a.desc}</div>`;
      }
      box.appendChild(row);
    });
    panel.querySelector('#achievements-close').addEventListener('click', ()=> overlay.remove());
  }

  function showMyRelics(){
    const typeLabel = {blessing:'축복', contract:'계약', curse:'저주', wild:'변칙'};
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'myrelics-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel relic-panel';
    const held = (player.relics||[]);
    // 저주(type:'curse')는 일반 유물과 분리해서 별도 묶음("☠ 저주")으로 보여준다.
    // 슬롯을 차지하지 않고(getRelicSlotUsage 참고) 영구히 유지된다는 점이 일반
    // 유물과 근본적으로 달라, 섞어놓으면 어떤 게 저주인지 한눈에 안 들어온다.
    const normalRelics = held.filter(id=>{ const r=RELICS[id]; return r && r.type!=='curse'; });
    const curseRelics = held.filter(id=>{ const r=RELICS[id]; return r && r.type==='curse'; });

    let body;
    if(!held.length){
      body = `<p style="text-align:center;color:var(--parchment-dim);font-size:13px;font-style:italic;padding:10px 0;">아직 손에 넣은 유물이 없다.</p>`;
    } else {
      body = '';
      if(normalRelics.length){
        body += `<h4 style="color:var(--gold-bright); font-family:'Cinzel'; font-size:13px; letter-spacing:.08em; margin:6px 0 6px;">유물</h4>`
          + renderRelicCardGroup(normalRelics, typeLabel);
      }
      if(curseRelics.length){
        body += `<h4 style="color:#d99fff; font-family:'Cinzel'; font-size:13px; letter-spacing:.08em; margin:16px 0 6px;">☠ 저주</h4>`
          + renderRelicCardGroup(curseRelics, typeLabel);
      }
    }
    panel.innerHTML = `<h3>✦ 보유 중인 유물 ✦</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12px;margin:-4px 0 10px;">유물 슬롯 ${getRelicSlotUsage()}/${player.relicSlots} <span style="opacity:.7;">(저주는 슬롯을 차지하지 않는다)</span></p>
      ${body}
      <div style="text-align:center; margin-top:10px;"><button class="btn" id="myrelics-close">닫기</button></div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    panel.querySelector('#myrelics-close').addEventListener('click', ()=> overlay.remove());
  }
