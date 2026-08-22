"use strict";
/*
전투 UI 연출/이펙트 — HP바 갱신, 메시지 표시, 커맨드 UI 리셋/활성화,
데미지 팝업, 흔들림, 슬래시 이펙트, 콤보 연출, 상태이상 배지, 스킬/아이템 서브메뉴 열기/닫기.
export(전역): updateEnemyHpBar, setBattleMsg, resetCommandUI, setCommandsEnabled, popDamage,
              shakeEnemy, spawnSlashMark, playComboFinish, playStatusFx, playCastBurst, playBanner,
              updateStatusBadges, openSub, closeSub
의존성: state.js(enemy/player), Sound(sound.js)
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
      if(avail.length===0){ sub.innerHTML = '<div class="sub-item disabled">배운 스킬이 없다</div>'; }
      avail.forEach(k=>{
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

