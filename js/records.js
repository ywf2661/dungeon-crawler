"use strict";
/*
이전 모험 기록 렌더 + 유물 도감 표시(획득한 유물의 현재 상태를 설명에 덧붙임).
export(전역): renderRecords, getRelicDisplayDesc, showMyRelics
의존성: player(state.js), RELICS(relics.js)
*/

  function renderRecords(records){
    const section = document.getElementById('records-section');
    const box = document.getElementById('records-list');
    if(!records || !records.length){ section.style.display='none'; return; }
    section.style.display='block';
    box.innerHTML = '';
    records.slice().reverse().forEach(r=>{
      const row = document.createElement('div');
      row.className = 'record-row';
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
        row.innerHTML = `<span style="color:var(--gold-bright); font-family:'Cinzel';">${r.name}</span><span>${typeLabel[r.type]}</span>`;
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
      const isEmpty = (inv.potion||0)===0 && (inv.hipotion||0)===0 && (inv.ether||0)===0;
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

  function showMyRelics(){
    const typeLabel = {blessing:'축복', contract:'계약', curse:'저주', wild:'변칙'};
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'myrelics-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel relic-panel';
    const held = (player.relics||[]);
    const body = held.length
      ? `<div class="relic-grid">` + held.map(id=>{
          const r = RELICS[id];
          if(!r) return '';
          return `<div class="relic-card type-${r.type}" style="cursor:default;">
            <div class="relic-type">${typeLabel[r.type]}</div>
            <div class="relic-name">${r.name}</div>
            <div class="relic-desc">${getRelicDisplayDesc(id)}</div>
          </div>`;
        }).join('') + `</div>`
      : `<p style="text-align:center;color:var(--parchment-dim);font-size:13px;font-style:italic;padding:10px 0;">아직 손에 넣은 유물이 없다.</p>`;
    panel.innerHTML = `<h3>✦ 보유 중인 유물 ✦</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12px;margin:-4px 0 10px;">유물 슬롯 ${getRelicSlotUsage()}/${player.relicSlots} <span style="opacity:.7;">(저주는 슬롯을 차지하지 않는다)</span></p>
      ${body}
      <div style="text-align:center; margin-top:10px;"><button class="btn" id="myrelics-close">닫기</button></div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    panel.querySelector('#myrelics-close').addEventListener('click', ()=> overlay.remove());
  }
