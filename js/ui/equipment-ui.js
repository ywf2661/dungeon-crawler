"use strict";
/*
장비 관리 화면 UI(에픽 세트 진행도 표시 포함).
export(전역): renderSetProgressHTML, openEquipment
의존성: player(state.js), data/equipment.js
*/

  /* ============ 장비 관리 ============ */
  function renderSetProgressHTML(){
    const counts = getEpicSetCounts();
    const ownedSetIds = Object.keys(EPIC_SETS).filter(id=>
      player.equipOwned.some(oid=>EPIC_EQUIPMENT[oid] && EPIC_EQUIPMENT[oid].setId===id)
    );
    if(!ownedSetIds.length) return '';
    return `<div style="font-family:Cinzel; color:var(--epic-bright); font-size:12.5px; letter-spacing:.05em; margin:10px 0 6px;">✦ 에픽 세트 진행도</div>` +
      ownedSetIds.map(id=>{
        const set = EPIC_SETS[id];
        const equippedCount = counts[id]||0;
        const items = Object.keys(EPIC_EQUIPMENT).filter(k=>EPIC_EQUIPMENT[k].setId===id);
        const rows = items.map(k=>{
          const owned = player.equipOwned.includes(k);
          const equipped = Object.values(player.equipment).includes(k);
          const mark = equipped ? '■' : (owned?'▣':'□');
          return `${EPIC_EQUIPMENT[k].name} ${mark}`;
        }).join('&nbsp;&nbsp;');
        const tierNote = equippedCount>=3 ? `<span style="color:var(--epic-bright);"> — SET COMPLETE (${set.set3Name})</span>`
          : equippedCount>=2 ? `<span style="color:var(--epic-bright);"> — ${set.set2Name} 발동중</span>` : '';
        return `<div class="set-progress-box">
          <b style="color:var(--epic-bright);">${set.name}</b> (${equippedCount}/3 장착)${tierNote}<br>${rows}
        </div>`;
      }).join('');
  }

  function openEquipment(){
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'equip-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    const slots = ['weapon','armor','accessory'];
    panel.innerHTML = `<h3>장비 정비</h3>` + renderSetProgressHTML() + slots.map(slot=>{
      const equippedId = player.equipment[slot];
      const owned = player.equipOwned.filter(id=>getItemDef(id).slot===slot && id!==equippedId);
      const equippedDef = equippedId ? getItemDef(equippedId) : null;
      const equippedRow = equippedId
        ? `<div class="shop-item">
            <div class="si-info">
              <span class="si-name" style="font-family:Cinzel;color:${equippedDef.epic?'var(--epic-bright)':'var(--gold-bright)'};">★ ${equippedDef.epic?'✦✦ ':(equippedDef.rare?'✨ ':'')}${equippedDef.name}</span>
              <span class="si-desc" style="color:var(--parchment-dim); font-size:12.5px; font-style:italic;">${statsText(equippedDef.stats)}</span>
              <div class="${equippedDef.epic?'item-desc-epic':(equippedDef.rare?'item-desc-rare':'item-desc')}">${equippedDef.desc}</div>
            </div>
            <button class="buy-btn" data-action="unequip" data-slot="${slot}">해제</button>
          </div>`
        : `<div class="shop-item"><div class="si-info"><span class="si-desc" style="color:var(--parchment-dim); font-size:12.5px; font-style:italic;">장착한 ${SLOT_LABELS[slot]}이(가) 없다.</span></div></div>`;
      const ownedRows = owned.map(id=>{
        const def = getItemDef(id);
        return `
          <div class="shop-item">
            <div class="si-info">
              <span class="si-name" style="font-family:Cinzel;color:${def.epic?'var(--epic-bright)':(def.rare?'var(--violet)':'var(--parchment)')};">${def.epic?'✦✦ ':(def.rare?'✨ ':'')}${def.name}</span>
              <span class="si-desc" style="color:var(--parchment-dim); font-size:12.5px; font-style:italic;">${statsText(def.stats)}</span>
              <div class="${def.epic?'item-desc-epic':(def.rare?'item-desc-rare':'item-desc')}">${def.desc}</div>
            </div>
            <button class="buy-btn" data-action="equip" data-item="${id}">장착</button>
          </div>`;
      }).join('');
      return `<div style="font-family:Cinzel; color:var(--gold); font-size:12.5px; letter-spacing:.05em; margin:10px 0 2px;">${SLOT_LABELS[slot]}</div>${equippedRow}${ownedRows}`;
    }).join('') + `<div style="text-align:center; margin-top:10px;"><button class="btn" id="equip-close">닫기</button></div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    panel.querySelectorAll('[data-action="equip"]').forEach(b=>{
      b.addEventListener('click', ()=>{ equipItem(b.dataset.item); overlay.remove(); openEquipment(); });
    });
    panel.querySelectorAll('[data-action="unequip"]').forEach(b=>{
      b.addEventListener('click', ()=>{ unequipItem(b.dataset.slot); overlay.remove(); openEquipment(); });
    });
    panel.querySelector('#equip-close').addEventListener('click', ()=>overlay.remove());
  }

