"use strict";
/*
상점 데이터 및 UI + 정예의 교환소.
export(전역): SHOP_ITEMS, CONSUMABLE_CAPS, openShop, EXCHANGE_EPIC_COST, EXCHANGE_REFRESH_COST, openExchange, generateExchangeStock
의존성: player(state.js), Sound(sound.js), applyMerchantSealPurchase(relics.js), repayDebt(relics.js)
주의: 외상 도박사(jester_debtor)의 빚이 있을 때만 "빚 갚기" 섹션이 나타난다(절반/전액
     두 버튼 — 자동 상환은 넣지 않았다, 사용자 확정: 다른 골드 소비와 충돌하지 않도록
     항상 직접 선택하게 함). 실제 상환 처리는 relics.js의 repayDebt()에 위임한다.
     openExchange()는 정예 몬스터 처치로 쌓이는 "정예의 인장"(combat/battle-end.js에서
     지급)을 에픽 장비와 교환하는 마을 전용 화면이다(사용자 요청 — 정예 보상을 확률
     드랍이 아니라 "모아서 직접 고르는" 방식으로 재설계).
주의(신규 — 사용자 요청): 소모품(초급/상급 HP포션, MP포션)은 난이도 무관하게
     CONSUMABLE_CAPS만큼만 보유할 수 있다. 이 개수에 도달하면 상점에서도
     구매가 막힌다(버튼이 "보유 최대"로 비활성화됨). 또한 상점은 매 방문마다
     소모품 3종 전부가 아니라 무작위 일부만, 그마저도 방문당 한정 수량으로만
     내놓는다(generateShopStock() 참고) — 장비 섹션은 이번 변경 범위 밖이라
     기존처럼 depth 조건만으로 전부 노출한다. shopStock은 상점을 새로 여는
     시점(openShop() 또는 openShop(false))에만 다시 뽑고, 구매 후 패널을
     새로고침하는 내부 호출(openShop(true))에서는 그대로 유지한다.
*/

  /* ============ 상점 ============ */
  const SHOP_ITEMS = [
    {key:'potion', name:'물약', desc:'HP 40 회복', price:25},
    {key:'hipotion', name:'상급 물약', desc:'HP 110 회복', price:65},
    {key:'ether', name:'에테르', desc:'MP 30 회복', price:45},
    {key:'hiether', name:'상급 에테르', desc:'MP 85 회복', price:115},
  ];
  // 소모품 최대 보유 개수(사용자 요청 — 난이도 무관 동일). 이 값을 넘어서는
  // 개수는 상점 구매/향후 다른 획득 경로 모두에서 막혀야 한다.
  const CONSUMABLE_CAPS = { potion:3, hipotion:2, ether:3, hiether:2 };

  // 상점 재고(사용자 요청 — 매 방문마다 소모품 3종 중 무작위 일부만, 한정
  // 수량으로 등장). 상급 HP 포션은 개인 보유 한도(2개)에 맞춰 재고도 더
  // 적게 나오도록 별도 범위를 둔다.
  let shopStock = null; // {potion:n, hipotion:n, ether:n, hiether:n} 중 등장하는 키만 포함
  function randInt(min, max){ return min + Math.floor(Math.random()*(max-min+1)); }
  function generateShopStock(){
    const keys = SHOP_ITEMS.map(it=>it.key).sort(()=>Math.random()-0.5);
    const showCount = randInt(1, keys.length); // 1~3종만 등장(전부 나오지 않을 수 있음)
    const stock = {};
    keys.slice(0, showCount).forEach(k=>{
      // 상급 계열(상급 물약/상급 에테르)은 개인 보유 한도(2개)에 맞춰 재고도
      // 더 적게 나오도록 별도 범위를 둔다.
      stock[k] = (k==='hipotion' || k==='hiether') ? randInt(1,2) : randInt(1,3);
    });
    return stock;
  }

  function openShop(refreshOnly){
    // 상점을 새로 열 때만 재고를 다시 뽑는다(구매 후 패널 새로고침 시엔 유지).
    if(!refreshOnly || !shopStock) shopStock = generateShopStock();
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
    const stockKeys = Object.keys(shopStock);
    const consumableSectionHtml = stockKeys.length ? stockKeys.map(key=>{
      const it = SHOP_ITEMS.find(s=>s.key===key);
      const remain = shopStock[key];
      const owned = player.inv[key]||0;
      const cap = CONSUMABLE_CAPS[key];
      const atCap = owned >= cap;
      const price = dprice(it.price);
      const canBuy = remain>0 && !atCap && player.gold>=price;
      let btnLabel;
      if(atCap) btnLabel = '보유 최대';
      else if(remain<=0) btnLabel = '품절';
      else btnLabel = price+'G 구매';
      return `
      <div class="shop-item">
        <div class="si-info">
          <span class="si-name" style="font-family:Cinzel;color:var(--parchment);">${it.name} <span style="color:var(--parchment-dim); font-size:12px;">(보유 ${owned}/${cap}, 재고 ${remain})</span></span>
          <span class="si-desc" style="color:var(--parchment-dim); font-size:12.5px; font-style:italic;">${it.desc}</span>
        </div>
        <button class="buy-btn" data-kind="item" data-key="${key}" data-price="${price}" ${canBuy?'':'disabled'}>${btnLabel}</button>
      </div>
    `;
    }).join('') : `<div style="color:var(--parchment-dim); font-size:13px; font-style:italic; text-align:center; padding:8px;">오늘은 팔 만한 소모품이 없다.</div>`;
    panel.innerHTML = `<h3>떠돌이 상인</h3>`
      + debtSectionHtml
      + `<div style="font-family:Cinzel; color:var(--gold); font-size:12.5px; letter-spacing:.05em; margin:14px 0 2px;">소모품</div>`
      + consumableSectionHtml
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
          overlay.remove(); openShop(true);
          return;
        }
        const key=b.dataset.key, price=+b.dataset.price;
        if(player.gold<price) return;
        if(kind==='item'){
          // 사용자 요청: 방문당 재고와 개인 보유 한도를 모두 넘을 수 없다.
          if((shopStock[key]||0)<=0){ addLog('그 물건은 오늘 다 팔렸다.', 'warn'); return; }
          if((player.inv[key]||0) >= CONSUMABLE_CAPS[key]){
            addLog(`${SHOP_ITEMS.find(s=>s.key===key).name}은(는) 더 이상 지닐 수 없다. (최대 ${CONSUMABLE_CAPS[key]}개)`, 'warn');
            return;
          }
          applyMerchantSealPurchase();
          player.gold -= price; player.inv[key]+=1;
          shopStock[key] -= 1;
          renderStatus();
          addLog(`${SHOP_ITEMS.find(s=>s.key===key).name}을(를) 구매했다.`,'gold');
        } else {
          if(player.equipOwned.includes(key)) return;
          applyMerchantSealPurchase();
          player.gold -= price; player.equipOwned.push(key);
          renderStatus();
          addLog(`[${EQUIPMENT[key].name}]을(를) 구매했다. 장비 화면에서 장착할 수 있다.`,'gold');
        }
        saveGame();
        overlay.remove(); openShop(true);
      });
    });
    panel.querySelector('#shop-close').addEventListener('click', ()=>overlay.remove());
  }

  // ---------- 정예의 교환소 ----------
  // 정예 몬스터를 처치하면 얻는 "정예의 인장"을 모아 원하는 에픽 장비와 직접
  // 교환한다(사용자 요청 — 확정 드랍/확률 대신 "모아서 목표를 직접 고르는"
  // 자원으로 설계). 마을에서만 이용 가능(#btn-exchange, town일 때만 노출 —
  // index.html/bootstrap.js 참고).
  // 리뉴얼(사용자 요청): 조건에 맞는 에픽 전부를 보여주는 대신 5개만 무작위로
  // 노출한다. player.exchangeStock에 목록을 저장해 재방문해도 동일하게
  // 유지되고, 다음 마을(타이어 보스 클리어 후 체크포인트 갱신 — battle-end.js의
  // showBossRewardChoice)에 도착해야 자동으로 새로 뽑힌다. 인장 1개를 내고
  // 수동으로 새로고침할 수도 있다. 개당 교환 비용(EXCHANGE_EPIC_COST)은 그대로.
  const EXCHANGE_EPIC_COST = 5;
  const EXCHANGE_REFRESH_COST = 1;
  function generateExchangeStock(){
    const pool = Object.keys(EPIC_EQUIPMENT).filter(id=>EPIC_EQUIPMENT[id].minDepth<=Math.max(depth, player.tierIndex*10) && !player.equipOwned.includes(id));
    return pool.slice().sort(()=>Math.random()-0.5).slice(0, 5);
  }
  function openExchange(){
    // 이미 구매/장착 등으로 보유하게 된 항목은 목록에서 걸러낸다(목록 자체를
    // 다시 뽑지는 않는다 — 자연 감소만 반영).
    if(!player.exchangeStock){
      player.exchangeStock = generateExchangeStock();
      saveGame();
    } else {
      player.exchangeStock = player.exchangeStock.filter(id=>!player.equipOwned.includes(id));
    }
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'exchange-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    const seals = player.eliteSeals||0;
    const stock = player.exchangeStock;
    const canRefresh = seals >= EXCHANGE_REFRESH_COST;
    panel.innerHTML = `<h3>정예의 교환소</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 12px;">정예 몬스터를 처치하면 얻는 정예의 인장을 모아, 원하는 에픽 장비와 직접 교환할 수 있다.</p>
      <p style="text-align:center;color:#ffd76a;font-size:14px;margin:0 0 14px;">🔱 보유 인장: ${seals}개</p>
      ${stock.length ? stock.map(id=>{
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
      <div style="text-align:center; margin:10px 0;"><button class="btn" id="exchange-refresh" ${canRefresh?'':'disabled'}>🔄 목록 새로고침 (인장 ${EXCHANGE_REFRESH_COST}개)</button></div>
      <p style="text-align:center;color:var(--parchment-dim);font-size:11px;font-style:italic;margin:-6px 0 10px;">다음 마을에 도착하면 목록이 자연히 새로 뽑힌다.</p>
      <div style="text-align:center;"><button class="btn" id="exchange-close">떠나기</button></div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    panel.querySelectorAll('.buy-btn').forEach(b=>{
      b.addEventListener('click', ()=>{
        const key = b.dataset.key;
        if((player.eliteSeals||0) < EXCHANGE_EPIC_COST) return;
        player.eliteSeals -= EXCHANGE_EPIC_COST;
        player.equipOwned.push(key);
        player.exchangeStock = (player.exchangeStock||[]).filter(id=>id!==key);
        renderStatus();
        addLog(`정예의 인장 ${EXCHANGE_EPIC_COST}개로 [${EPIC_EQUIPMENT[key].name}]을(를) 교환했다.`, 'gold');
        saveGame();
        overlay.remove(); openExchange();
      });
    });
    panel.querySelector('#exchange-refresh').addEventListener('click', ()=>{
      if((player.eliteSeals||0) < EXCHANGE_REFRESH_COST) return;
      player.eliteSeals -= EXCHANGE_REFRESH_COST;
      player.exchangeStock = generateExchangeStock();
      renderStatus();
      addLog(`정예의 인장 ${EXCHANGE_REFRESH_COST}개로 교환소 목록을 새로고침했다.`, 'gold');
      saveGame();
      overlay.remove(); openExchange();
    });
    panel.querySelector('#exchange-close').addEventListener('click', ()=>overlay.remove());
  }
