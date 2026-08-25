"use strict";
/*
전투 UI 연출/이펙트 — HP바 갱신, 메시지 표시, 커맨드 UI 리셋/활성화,
데미지 팝업, 흔들림, 슬래시 이펙트, 콤보 연출, 상태이상 배지, 스킬/아이템 서브메뉴 열기/닫기.
export(전역): updateEnemyHpBar, setBattleMsg, resetCommandUI, setCommandsEnabled, popDamage,
              shakeEnemy, spawnSlashMark, playComboFinish, playStatusFx, playCastBurst, playBanner,
              updateStatusBadges, updatePlayerStatusBadges, openSub, closeSub
의존성: state.js(enemy/player), Sound(sound.js)
주의: updatePlayerStatusBadges()는 적 화면 왼쪽 위(#bt-player-status)에 현재 켜져 있는
     내 토글 상태(혈서=🩸, 화염/빙결/번개계약=🔥/❄/⚡)를 아이콘으로 표시한다. SKILLDB의
     icon 필드를 읽으므로, 새 토글형 스킬을 추가할 때 icon만 지정하면 자동으로 표시된다.
     resetCommandUI()와 각 토글 핸들러(player-actions.js) 양쪽에서 호출해 항상 최신
     상태를 반영한다. index.html에 #bt-player-status 요소와 CSS를 추가해야 실제로
     보인다(별도 안내 참고).
     openSub('skill')이 토글형 스킬(SKILLDB의 type==='arm' 또는 'elementpact' — 예: 혈서,
     화염/빙결/번개계약)을 세로 목록과 분리해 가로 한 줄(.toggle-row)로 먼저 그리도록
     바뀌었다. 토글이 여러 개(3개 이상) 생겨도 세로 스크롤 목록이 길어지지 않게 하기
     위함. 새 토글형 스킬을 추가할 때도 SKILLDB에 type만 'arm'/'elementpact'로 지정하면
     자동으로 이 가로줄에 들어간다 — 별도 UI 코드 수정 불필요.
     이 토글 줄은 .toggle-sticky-wrap으로 감싸 스크롤해도 화면 위에 계속 고정(sticky)
     되도록 index.html에서 CSS를 추가해야 한다(별도 안내 참고) — 스크롤해서 지나치면
     사용자가 존재조차 모를 수 있다는 지적에 따른 개선.
*/

  function updateEnemyHpBar(){
    document.getElementById('bt-ehp-bar').style.width = Math.max(0,(enemy.hp/enemy.maxhp*100))+'%';
  }

  function setBattleMsg(line1, line2){
    document.getElementById('bt-msg1').textContent = line1||'';
    document.getElementById('bt-msg2').textContent = line2||'';
  }

  function resetCommandUI(){
    subMode=null;
    document.getElementById('cmd-main').style.display='grid';
    document.getElementById('cmd-sub').style.display='none';
    document.getElementById('cmd-back-row').style.display='none';
    setCommandsEnabled(true);
    if(hasRelicFlag('skillLocked')) document.getElementById('cmd-skill').disabled = true;
    const runBtn = document.getElementById('cmd-run');
    const canFlee = !player || player.difficulty==='easy';
    runBtn.style.display = canFlee ? '' : 'none';
    updatePlayerStatusBadges();
  }
  function setCommandsEnabled(en){
    ['cmd-attack','cmd-skill','cmd-item','cmd-run'].forEach(id=>document.getElementById(id).disabled=!en);
  }

  function popDamage(text, cls){
    const stage = document.getElementById('bt-stage');
    const pop = document.createElement('div');
    pop.className = 'dmg-pop'+(cls?(' '+cls):'');
    pop.textContent = text;
    stage.appendChild(pop);
    setTimeout(()=>pop.remove(), 800);
  }

  function shakeEnemy(){
    const stage = document.getElementById('bt-stage');
    stage.classList.remove('hit'); void stage.offsetWidth; stage.classList.add('hit');
  }

  function spawnSlashMark(seed){
    const stage = document.getElementById('bt-stage');
    const el = document.createElement('div');
    el.className = 'slash-mark';
    const angles = [-32, 24, -12, 38, -44];
    el.style.setProperty('--ang', angles[seed % angles.length]+'deg');
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 350);
  }

  function playComboFinish(hits){
    if(hits < 2) return;
    const stage = document.getElementById('bt-stage');
    const el = document.createElement('div');
    el.className = 'combo-count';
    el.textContent = `COMBO x${hits}!`;
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 700);
  }

  function playStatusFx(type){
    if(!type) return;
    const stage = document.getElementById('bt-stage');
    const el = document.createElement('div');
    el.className = 'status-fx '+type+' play';
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 600);
  }

  function playCastBurst(cls){
    const stage = document.getElementById('bt-stage');
    const el = document.createElement('div');
    el.className = 'cast-burst'+(cls?(' '+cls):'');
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 600);
  }

  function playBanner(text, cls){
    const stage = document.getElementById('bt-stage');
    const el = document.createElement('div');
    el.className = 'fx-banner'+(cls?(' '+cls):'');
    el.textContent = text;
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 1150);
  }

  function updateStatusBadges(){
    const box = document.getElementById('bt-status');
    if(!box) return;
    box.innerHTML = '';
    const stage = document.getElementById('bt-stage');
    stage.classList.remove('dot-poison','dot-burn','dot-bleed');
    const dots = (enemy && enemy.dots) ? enemy.dots.filter(d=>d.turns>0) : [];
    dots.forEach(d=>{
      const b = document.createElement('div');
      b.className = 'status-badge '+d.type;
      const icon = d.type==='poison' ? '☠' : (d.type==='burn' ? '🔥' : '🩸');
      b.textContent = `${icon} ${d.label} ${d.turns}턴`;
      box.appendChild(b);
      stage.classList.add('dot-'+d.type);
    });
    if(enemy && enemy.exposedTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge expose';
      b.textContent = `🎯 급소 노출 ${enemy.exposedTurns}턴`;
      box.appendChild(b);
    }
    // 독 중첩(맹독 연금술사): enemy.venomStacks는 일반 dot(enemy.dots)과 별개로
    // 관리되는 영구 스택이라(턴이 지나도 안 사라짐) 위 dots 루프에는 안 걸린다 —
    // 여기서 따로 표시한다. "적 왼쪽 위"에 두 달라는 요청이 있었지만, 그 자리는
    // 이미 내 토글 상태 배지(#bt-player-status — 혈서/원소계약/시간조각)가 쓰고
    // 있어서 겹치므로, 기존에 "적 상태"를 보여주던 이 자리(오른쪽)에 넣었다.
    if(enemy && (enemy.venomStacks||0) > 0){
      const b = document.createElement('div');
      b.className = 'status-badge venom-stack';
      b.textContent = `☠ 독중첩 ${enemy.venomStacks}/10`;
      box.appendChild(b);
    }
  }

  // 적 화면 왼쪽 위에 "현재 켜져 있는 내 토글 상태"를 작은 아이콘으로 표시한다
  // (혈서=🩸, 화염/빙결/번개계약=🔥/❄/⚡ 등). SKILLDB에 type:'arm' 또는
  // 'elementpact'로 정의된 스킬이면 자동으로 대상이 되므로, 앞으로 비슷한 토글형
  // 스킬을 추가할 때도 SKILLDB에 icon 필드만 넣으면 별도 UI 코드 수정 없이
  // 여기 표시된다. 토글을 켜고 끌 때(player-actions.js)와 매 턴 커맨드가 다시
  // 열릴 때(resetCommandUI) 둘 다에서 호출해 항상 최신 상태를 반영한다.
  function updatePlayerStatusBadges(){
    const box = document.getElementById('bt-player-status');
    if(!box || !player || !player.skills) return;
    box.innerHTML = '';
    player.skills.forEach(k=>{
      const s = SKILLDB[k];
      if(!s) return;
      let active = false;
      if(s.type==='arm') active = !!player[s.armFlag];
      else if(s.type==='elementpact') active = !!(battleFlags && battleFlags.elementPact === s.pactElement);
      if(!active) return;
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      b.textContent = `${s.icon||'●'} ${s.name}`;
      b.title = s.desc || '';
      box.appendChild(b);
    });
    // 시간 조각(mastery_timewarp, 시간술사): 토글이 아니라 누적 스택이라 위 루프와는
    // 별도로 처리한다. 시계 아이콘을 스택 수만큼 반복해 한 배지에 표시한다
    // (예: 3스택 = 🕐🕐🕐). battleFlags.timeStacks가 0이면 아예 표시하지 않는다.
    if(player.skills.includes('mastery_timewarp') && battleFlags && (battleFlags.timeStacks||0) > 0){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      b.textContent = '🕐'.repeat(battleFlags.timeStacks) + ` ${battleFlags.timeStacks}/5`;
      b.title = '시간 조각 — 시간 역행(3개 이상 필요, 소비 안 함)과 시간의 역설(전부 소비)의 재료';
      box.appendChild(b);
    }
    // 분신 배가(rogueDoubleImage, 환영검사): 토글이면서 동시에 스택(0~2)도 갖는
    // 특수 케이스라 위의 arm/elementpact 범용 루프로는 못 잡는다 — 따로 처리한다.
    if(battleFlags && battleFlags.doubleImageArmed){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      const stacks = battleFlags.doubleImageStacks||0;
      b.textContent = `👻 분신 배가 (${['40%','60%','80%'][Math.min(2,stacks)]})`;
      b.title = '켜져 있는 동안 공격 적중마다 분신이 즉시 한 번 더 나타난다. 계속 켜둘수록 위력이 강해진다(최대 2단계).';
      box.appendChild(b);
    }
    // 잔영 누적(mastery_afterimage): 백귀야행(레벨15)의 재료가 되는 이번 전투
    // 누적 발동 횟수를 보여준다. 0이면 표시하지 않는다.
    if(player.skills.includes('mastery_afterimage') && battleFlags && (battleFlags.afterimageTriggerCount||0) > 0){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      b.textContent = `👤 잔영 ${battleFlags.afterimageTriggerCount}`;
      b.title = '이번 전투에서 잔영이 발동한 누적 횟수 — 백귀야행이 이 횟수만큼 분신을 동시에 몰아친다.';
      box.appendChild(b);
    }
  }

  function openSub(mode){
    subMode = mode;
    document.getElementById('cmd-main').style.display='none';
    document.getElementById('cmd-back-row').style.display='flex';
    const sub = document.getElementById('cmd-sub');
    sub.style.display='flex';
    sub.innerHTML='';
    if(mode==='skill'){
      const avail = player.skills.filter(k=>SKILLDB[k]);
      if(avail.length===0){ sub.innerHTML = '<div class="sub-item disabled">배운 스킬이 없다</div>'; return; }
      // 토글형 스킬(arm/elementpact)은 가로 한 줄로 묶어서 맨 위에 먼저 그린다 —
      // 화염/빙결/번개계약처럼 토글이 여러 개라도 세로 목록이 길어지지 않는다.
      const toggleKeys = avail.filter(k => SKILLDB[k].type==='arm' || SKILLDB[k].type==='elementpact' || SKILLDB[k].type==='doubleimagepact');
      const normalKeys = avail.filter(k => !toggleKeys.includes(k));
      if(toggleKeys.length){
        // 사용자 요청: 목록을 스크롤해도 토글형 스킬(혈서, 원소계약 등)이 화면
        // 밖으로 사라지지 않고 맨 위에 계속 붙어있게(sticky) 한다. 또한 "이게
        // 뭘 하는 버튼인지" 첫눈에 알기 어려울 수 있어, 작은 안내 문구를
        // 함께 붙였다. 라벨+버튼줄을 하나의 래퍼(.toggle-sticky-wrap)로
        // 묶어야 둘이 함께 고정된다 — CSS는 index.html에 별도로 추가 필요.
        const wrap = document.createElement('div');
        wrap.className = 'toggle-sticky-wrap';
        const label = document.createElement('div');
        label.className = 'toggle-row-label';
        label.textContent = '▼ 상시 발동 스킬 — 탭해서 켜고 끄기';
        wrap.appendChild(label);
        const row = document.createElement('div');
        row.className = 'toggle-row';
        toggleKeys.forEach(k=>{
          const s = SKILLDB[k];
          const isActive = s.type==='elementpact'
            ? (battleFlags && battleFlags.elementPact === s.pactElement)
            : (s.type==='doubleimagepact' ? !!(battleFlags && battleFlags.doubleImageArmed) : !!player[s.armFlag]);
          const btn = document.createElement('div');
          btn.className = 'toggle-btn'+(isActive?' active':'');
          btn.innerHTML = `<div>${s.name}</div>`;
          btn.title = s.desc;
          btn.addEventListener('click', ()=>{ closeSub(); playerSkill(k); });
          row.appendChild(btn);
        });
        wrap.appendChild(row);
        sub.appendChild(wrap);
      }
      normalKeys.forEach(k=>{
        const s = SKILLDB[k];
        const mpCost = s.mp;
        const canUse = player.mp>=mpCost;
        const div = document.createElement('div');
        div.className = 'sub-item'+(canUse?'':' disabled');
        div.innerHTML = `<div class="si-info"><div class="si-name">${s.name}</div><div class="si-desc">${s.desc}</div></div><div class="si-cost">MP ${mpCost}</div>`;
        if(canUse) div.addEventListener('click', ()=>{ closeSub(); playerSkill(k); });
        sub.appendChild(div);
      });
    } else if(mode==='item'){
      const items = [
        {key:'potion', name:'물약', desc:'HP 40 회복'},
        {key:'hipotion', name:'상급 물약', desc:'HP 110 회복'},
        {key:'ether', name:'에테르', desc:'MP 30 회복'},
      ];
      items.forEach(it=>{
        const count = player.inv[it.key]||0;
        const div = document.createElement('div');
        div.className = 'sub-item'+(count>0?'':' disabled');
        div.innerHTML = `<div class="si-info"><div class="si-name">${it.name} ×${count}</div><div class="si-desc">${it.desc}</div></div>`;
        if(count>0) div.addEventListener('click', ()=>{ closeSub(); playerItem(it.key); });
        sub.appendChild(div);
      });
    }
  }
  function closeSub(){ resetCommandUI(); }
