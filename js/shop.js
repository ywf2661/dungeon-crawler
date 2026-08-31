"use strict";
/*
상점 데이터 및 UI + 정예의 교환소.
export(전역): SHOP_ITEMS, openShop, EXCHANGE_EPIC_COST, openExchange
의존성: player(state.js), Sound(sound.js), applyMerchantSealPurchase(relics.js), repayDebt(relics.js)
주의: 외상 도박사(jester_debtor)의 빚이 있을 때만 "빚 갚기" 섹션이 나타난다(절반/전액
     두 버튼 — 자동 상환은 넣지 않았다, 사용자 확정: 다른 골드 소비와 충돌하지 않도록
     항상 직접 선택하게 함). 실제 상환 처리는 relics.js의 repayDebt()에 위임한다.
     openExchange()는 정예 몬스터 처치로 쌓이는 "정예의 인장"(combat/battle-end.js에서
     지급)을 에픽 장비와 교환하는 마을 전용 화면이다(사용자 요청 — 정예 보상을 확률
     드랍이 아니라 "모아서 직접 고르는" 방식으로 재설계).
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
    const debtSectionHtml = (player.debt||0) > 0 ? `
      <div style="font-family:Cinzel; color:#ffd76a; font-size:12.5px; letter-spacing:.05em; margin:4px 0 2px;">빚 갚기</div>
      <div class="shop-item">
        <div class="si-info">
          <span class="si-name" style="font-family:Cinzel;color:#ffd76a;">남은 빚 ${player.debt}G</span>
          <span class="si-desc" style="color:var(--parchment-dim); font-size:12.5px; font-style:italic;">갚은 비율만큼 대출 페널티가 즉시 완화된다. 전액 상환 시 대출로 얻은 힘도 함께 회수된다.</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="buy-btn" data-kind="repay" data-amount="${Math.min(player.gold, Math.round(player.debt*0.5))}" ${player.gold<=0?'disabled':''}>절반 갚기</button>
          <button class="buy-btn" data-kind="repay" data-amount="${Math.min(player.gold, player.debt)}" ${player.gold<=0?'disabled':''}>전액 갚기</button>
        </div>
      </div>` : '';
    panel.innerHTML = `<h3>떠돌이 상인</h3>`
      + debtSectionHtml
      + `<div style="font-family:Cinzel; color:var(--gold); font-size:12.5px; letter-spacing:.05em; margin:14px 0 2px;">소모품</div>`
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
        const kind=b.dataset.kind;
        if(kind==='repay'){
          const amount = +b.dataset.amount;
          if(amount<=0 || player.gold<=0) return;
          player.gold -= amount;
          const paid = repayDebt(amount);
          renderStatus();
          addLog(`빚 ${paid}G를 갚았다. (남은 빚: ${player.debt}G)`, 'gold');
          saveGame();
          overlay.remove(); openShop();
          return;
        }
        const key=b.dataset.key, price=+b.dataset.price;
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

  // ---------- 정예의 교환소 ----------
  // 정예 몬스터를 처치하면 얻는 "정예의 인장"을 모아 원하는 에픽 장비와 직접
  // 교환한다(사용자 요청 — 확정 드랍/확률 대신 "모아서 목표를 직접 고르는"
  // 자원으로 설계). 마을에서만 이용 가능(#btn-exchange, town일 때만 노출 —
  // index.html/bootstrap.js 참고).
  const EXCHANGE_EPIC_COST = 5;
  function openExchange(){
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'exchange-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    const seals = player.eliteSeals||0;
    const pool = Object.keys(EPIC_EQUIPMENT).filter(id=>EPIC_EQUIPMENT[id].minDepth<=Math.max(depth, player.tierIndex*10) && !player.equipOwned.includes(id));
    panel.innerHTML = `<h3>정예의 교환소</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 12px;">정예 몬스터를 처치하면 얻는 정예의 인장을 모아, 원하는 에픽 장비와 직접 교환할 수 있다.</p>
      <p style="text-align:center;color:#ffd76a;font-size:14px;margin:0 0 14px;">🔱 보유 인장: ${seals}개</p>
      ${pool.length ? pool.map(id=>{
        const it = EPIC_EQUIPMENT[id];
        const afford = seals >= EXCHANGE_EPIC_COST;
        return `
      <div class="shop-item">
        <div class="si-info">
          <span class="si-name" style="font-family:Cinzel;color:var(--epic-bright);">✦✦ ${it.name}</span>
          <span class="si-desc" style="color:var(--parchment-dim); font-size:12.5px; font-style:italic;">${it.desc} (${statsText(it.stats)})</span>
        </div>
        <button class="buy-btn" data-key="${id}" ${afford?'':'disabled'}>${EXCHANGE_EPIC_COST}개 교환</button>
      </div>`;
      }).join('') : `<div style="color:var(--parchment-dim); font-size:13px; font-style:italic; text-align:center; padding:8px;">지금 교환할 수 있는 에픽 장비가 없다(이미 다 모았거나, 아직 이 깊이에서 안 풀렸다).</div>`}
      <div style="text-align:center; margin-top:10px;"><button class="btn" id="exchange-close">떠나기</button></div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    panel.querySelectorAll('.buy-btn').forEach(b=>{
      b.addEventListener('click', ()=>{
        const key = b.dataset.key;
        if((player.eliteSeals||0) < EXCHANGE_EPIC_COST) return;
        player.eliteSeals -= EXCHANGE_EPIC_COST;
        player.equipOwned.push(key);
        renderStatus();
        addLog(`정예의 인장 ${EXCHANGE_EPIC_COST}개로 [${EPIC_EQUIPMENT[key].name}]을(를) 교환했다.`, 'gold');
        saveGame();
        overlay.remove(); openExchange();
      });
    });
    panel.querySelector('#exchange-close').addEventListener('click', ()=>overlay.remove());
  }
