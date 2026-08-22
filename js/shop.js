"use strict";
/*
상점 데이터 및 UI.
export(전역): SHOP_ITEMS, openShop
의존성: player(state.js), Sound(sound.js), applyMerchantSealPurchase(relics.js)
*/

  /* ============ 상점 ============ */
  const SHOP_ITEMS = [
    {key:'potion', name:'물약', desc:'HP 40 회복', price:25},
    {key:'hipotion', name:'상급 물약', desc:'HP 110 회복', price:65},
    {key:'ether', name:'에테르', desc:'MP 30 회복', price:45},
  ];
  function openShop(){
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'shop-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    const discountMult = 1;
    const dprice = p => Math.max(1, Math.round(p*discountMult));
    const equipPool = Object.keys(EQUIPMENT).filter(id=>EQUIPMENT[id].minDepth<=depth+1);
    panel.innerHTML = `<h3>떠돌이 상인</h3>`
      + `<div style="font-family:Cinzel; color:var(--gold); font-size:12.5px; letter-spacing:.05em; margin:4px 0 2px;">소모품</div>`
      + SHOP_ITEMS.map(it=>`
      <div class="shop-item">
        <div class="si-info">
          <span class="si-name" style="font-family:Cinzel;color:var(--parchment);">${it.name} <span style="color:var(--parchment-dim); font-size:12px;">(보유 ${player.inv[it.key]})</span></span>
          <span class="si-desc" style="color:var(--parchment-dim); font-size:12.5px; font-style:italic;">${it.desc}</span>
        </div>
        <button class="buy-btn" data-kind="item" data-key="${it.key}" data-price="${dprice(it.price)}" ${player.gold<dprice(it.price)?'disabled':''}>${dprice(it.price)}G 구매</button>
      </div>
    `).join('')
      + `<div style="font-family:Cinzel; color:var(--gold); font-size:12.5px; letter-spacing:.05em; margin:14px 0 2px;">장비</div>`
      + (equipPool.length ? equipPool.map(id=>{
        const it = EQUIPMENT[id];
        const owned = player.equipOwned.includes(id);
        const price = dprice(it.price);
        return `
      <div class="shop-item">
        <div class="si-info">
          <span class="si-name" style="font-family:Cinzel;color:var(--parchment);">[${SLOT_LABELS[it.slot]}] ${it.name}</span>
          <span class="si-desc" style="color:var(--parchment-dim); font-size:12.5px; font-style:italic;">${it.desc} (${statsText(it.stats)})</span>
        </div>
        <button class="buy-btn" data-kind="equip" data-key="${id}" data-price="${price}" ${(owned||player.gold<price)?'disabled':''}>${owned?'보유중':price+'G 구매'}</button>
      </div>` ;
      }).join('') : `<div style="color:var(--parchment-dim); font-size:13px; font-style:italic; text-align:center; padding:8px;">아직 팔 만한 장비가 없다.</div>`)
      + `<div style="text-align:center; margin-top:10px;"><button class="btn" id="shop-close">떠나기</button></div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    panel.querySelectorAll('.buy-btn').forEach(b=>{
      b.addEventListener('click', ()=>{
        const kind=b.dataset.kind, key=b.dataset.key, price=+b.dataset.price;
        if(player.gold<price) return;
        applyMerchantSealPurchase();
        if(kind==='item'){
          player.gold -= price; player.inv[key]+=1;
          renderStatus();
          addLog(`${SHOP_ITEMS.find(s=>s.key===key).name}을(를) 구매했다.`,'gold');
        } else {
          if(player.equipOwned.includes(key)) return;
          player.gold -= price; player.equipOwned.push(key);
          renderStatus();
          addLog(`[${EQUIPMENT[key].name}]을(를) 구매했다. 장비 화면에서 장착할 수 있다.`,'gold');
        }
        saveGame();
        overlay.remove(); openShop();
      });
    });
    panel.querySelector('#shop-close').addEventListener('click', ()=>overlay.remove());
  }
