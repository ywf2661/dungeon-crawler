"use strict";
/*
전투 UI 연출/이펙트 — HP바 갱신, 메시지 표시, 커맨드 UI 리셋/활성화,
데미지 팝업, 흔들림, 슬래시 이펙트, 콤보 연출, 상태이상 배지, 스킬/아이템 서브메뉴 열기/닫기.
export(전역): updateEnemyHpBar, setBattleMsg, resetCommandUI, setCommandsEnabled, popDamage,
              shakeEnemy, spawnSlashMark, spawnSlashImageFx, spawnChalnaSlashBurst, playComboFinish,
              playStatusFx, playCastBurst, playBanner,
              updateStatusBadges, updatePlayerStatusBadges, openSub, closeSub, updateBossIntentCard,
              checkMechanicOverheat, updatePressureGauge, lungeEnemy, shakePlayerArea, setBossPoseImage
주의(신규 — 메카닉 리뉴얼/전 직업 궁극기 쿨타임, 사용자 요청): checkMechanicOverheat()는
     보일러 압력이 100에서 방출되지 않고 넘어갔을 때의 자동 폭주를 처리하고,
     updatePressureGauge()는 #bt-pressure 요소에 압력 수치를 표시한다. 둘 다
     resetCommandUI() 안에서 "플레이어가 실제로 행동했을 때"만 정확히 1번
     발동하는 지점(cooldownTickPending 플래그)을 그대로 재사용한다 — 스킬
     쿨타임 감소와 동일한 안전장치 원칙.
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

  // 정예 특성(사용자 요청) 중 "반사"/"철갑"/"복수"는 player-actions.js 안에
  // 흩어진 40여 곳의 개별 피해 적용 지점을 전부 손대는 대신, enemy.hp가
  // 실제로 줄어들 때마다 항상 호출되는 이 함수에서 델타(직전 대비 감소량)를
  // 감지해 한 곳에서 처리한다(combat/enemy-turn.js의 handleEliteOnHitTraits 참고).
  function updateEnemyHpBar(){
    if(enemy && typeof enemy._prevHp==='number' && enemy.hp < enemy._prevHp){
      const dealt = enemy._prevHp - enemy.hp;
      if(typeof handleEliteOnHitTraits==='function') handleEliteOnHitTraits(dealt);
      // 최후의 발악(3페이즈) 트리거 체크(사용자 요청 — 보스전 리뉴얼).
      if(typeof checkLastStand==='function') checkLastStand();
    }
    if(enemy) enemy._prevHp = enemy.hp;
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
    updateRigVisuals();
    updatePressureGauge();
    // 스킬 쿨타임(사용자 요청 — 1차 직업 궁극기 로테이션 개선). resetCommandUI()는
    // 메뉴 열기/닫기(closeSub) 등 실제 턴 진행과 무관한 경로로도 호출되므로,
    // 그런 호출에서까지 쿨타임이 깎이면 메뉴만 열었다 닫아도 쿨타임을 공짜로
    // 줄이는 악용이 생긴다. 그래서 "플레이어가 실제로 행동했다"는 표시
    // (battleFlags.cooldownTickPending, player-actions.js에서 세팅)가 있을 때만
    // 여기서 정확히 1번 소비하며 감소시킨다.
    if(battleFlags && battleFlags.cooldownTickPending){
      battleFlags.cooldownTickPending = false;
      if(battleFlags.skillCooldowns){
        Object.keys(battleFlags.skillCooldowns).forEach(k=>{
          battleFlags.skillCooldowns[k] -= 1;
          if(battleFlags.skillCooldowns[k]<=0) delete battleFlags.skillCooldowns[k];
        });
      }
      // 메카닉 리뉴얼(사용자 요청) — 보일러 압력 폭주(오버히트). 압력을 100까지
      // 채운 채 스스로 방출하지 않고 넘기면, 내 턴이 돌아오는 이 시점에 자동
      // 발동한다(20% 확률로 반동 피해도 함께). cooldownTickPending과 동일한
      // "정확히 1번만" 보장 지점을 그대로 재사용한다.
      if(typeof checkMechanicOverheat==='function') checkMechanicOverheat();
    }
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

  // 적이 공격할 때의 연출(사용자 요청) — 적 스프라이트가 살짝 앞으로
  // 튀어나왔다 돌아오는 동작(lunge)과, 플레이어 쪽 상태바가 맞는 순간
  // 흔들리는 연출. shakeEnemy()와 완전히 동일한 클래스 토글 패턴이다.
  function lungeEnemy(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    stage.classList.remove('attacking'); void stage.offsetWidth; stage.classList.add('attacking');
  }
  function shakePlayerArea(){
    const bar = document.getElementById('statusbar');
    if(!bar) return;
    bar.classList.remove('player-hit'); void bar.offsetWidth; bar.classList.add('player-hit');
  }

  // 회랑의 시조/시간의 마녀 등 "포즈 3장(평상시/예고/내려찍기)"을 가진 진
  // 최종보스 전용 스킬 연출 전환(사용자 요청 — 손을 들어 힘을 모았다가
  // 내려찍는 연출). #bt-stage 안의 <img> src만 바꿔치기한다(innerHTML을
  // 통째로 다시 그리면 hit/dying 등 클래스 상태가 꼬일 수 있어 src만 교체하는
  // 쪽이 안전). monster-visuals.js의 BOSS_POSE_IMG_BY_TYPE(enemy.type별
  // 포즈셋 매핑)을 사용한다. 포즈셋이 없는 몬스터는 즉시 아무 일도 하지
  // 않는다 — 매 턴 무조건 호출해도 안전(enemy-turn.js 참고).
  function setBossPoseImage(poseKey){
    if(!enemy) return;
    if(typeof BOSS_POSE_IMG_BY_TYPE==='undefined') return;
    const poseSet = BOSS_POSE_IMG_BY_TYPE[enemy.type];
    if(!poseSet) return;
    const src = poseSet[poseKey] || poseSet.idle;
    const img = document.querySelector('#bt-stage img');
    if(!img || img.src.endsWith(src)) return;
    img.src = src;
    if(typeof fixMonsterImageGrounding==='function') fixMonsterImageGrounding(img); // 그림마다 여백이 달라 포즈 바뀔 때마다 다시 보정
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

  // 이미지 기반 슬래시 VFX(사용자 제공 스프라이트) — 찰나검사 전용. 호출할
  // 때마다 회전각/위치/좌우반전을 무작위로 섞어서(옵션으로 고정도 가능)
  // "이곳저곳에서 베는" 느낌을 낸다. opts: {angle, x, y, flip}(전부 생략 가능).
  function spawnSlashImageFx(opts){
    opts = opts || {};
    const stage = document.getElementById('bt-stage');
    const el = document.createElement('div');
    const flip = opts.flip!=null ? opts.flip : Math.random()<0.5;
    el.className = 'slash-img-fx' + (flip ? ' flip' : '');
    el.style.setProperty('--ang', (opts.angle!=null ? opts.angle : Math.round(Math.random()*70-35))+'deg');
    el.style.setProperty('--sx', (opts.x!=null ? opts.x : Math.round(32+Math.random()*36))+'%');
    el.style.setProperty('--sy', (opts.y!=null ? opts.y : Math.round(32+Math.random()*36))+'%');
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 420);
  }
  // 찰나검사 타격 연출용 헬퍼 — n번, delayMs 간격으로 spawnSlashImageFx를 뿌린다.
  function spawnChalnaSlashBurst(n, delayMs){
    for(let i=0;i<n;i++) setTimeout(()=>spawnSlashImageFx(), i*(delayMs||90));
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

  // 보스 다음 행동 미리보기 카드(사용자 요청 — 보스전 리뉴얼). 예고 상태가
  // 아니면 "다음 행동: 알 수 없음"(운빨을 그대로 인정), 예고 상태면 어떤
  // 필살기가 다음 턴 확정 발동하는지 보여줘 플레이어가 대응할 수 있게 한다.
  function updateBossIntentCard(){
    const card = document.getElementById('bt-boss-intent');
    if(!card) return;
    // 사용자 요청: 예고된 다음 행동이 있을 때만 카드를 보여준다. 평소 상태
    // ("다음 행동: 알 수 없음")는 그냥 숨겨서 보스 이름을 가리지 않게 한다.
    if(!enemy || !enemy.isBoss || !(enemy.telegraphed || enemy.aboutToUltimate)){
      card.style.display = 'none';
      return;
    }
    card.style.display = 'block';
    card.className = 'boss-intent-card warn';
    card.textContent = `⚠ [${BOSS_SKILL_LABELS[enemy.pendingSkillKey]||'강공격'}] — 다음 턴 발동!`;
  }

  function playBanner(text, cls){
    const stage = document.getElementById('bt-stage');
    const el = document.createElement('div');
    el.className = 'fx-banner'+(cls?(' '+cls):'');
    el.textContent = text;
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 1150);
  }

  // ---------- 메카닉 로봇 비주얼 ----------
  // battleFlags.rig/rig2 상태를 화면 하단 좌우 슬롯(#bt-rig1/#bt-rig2)에 그린다.
  // 로봇 상태가 바뀌는 모든 지점(배치/정비/기폭/매 라운드 소멸,
  // player-actions.js·enemy-turn.js)에서 이 함수를 호출한다 —
  // resetCommandUI()에서도 호출해 항상 최신 상태를 반영한다(다른 배지들과
  // 동일한 안전망 패턴). index.html에 슬롯 2개 요소와 CSS를 추가해야 실제로
  // 보인다(별도 안내 참고 — mechanic-rig-visuals-v2.txt).
  // 오메가 유닛(kind:'omega')은 전용 와이드 슬롯을 따로 두지 않는다 — 예전 방식은
  // 오메가가 뜨는 순간 반대편 슬롯(다른 로봇)까지 강제로 숨겨버리는 버그가 있었다
  // (2기 동시 운용 자체가 안 보이는 문제). 이제 오메가도 자기 슬롯(왼쪽 또는
  // 오른쪽) 안에서만 폭이 넓어지고(.rig-wide 클래스 — 왼쪽 슬롯은 오른쪽으로,
  // 오른쪽 슬롯은 왼쪽으로 확장돼 "가운데를 향해 길게 뻗는" 인상은 유지된다),
  // 반대편 슬롯의 다른 로봇은 그대로 보인다.
  function renderOneRigSlot(el, rig){
    if(!rig){
      el.style.display = 'none'; el.innerHTML = ''; el.classList.remove('rig-wide'); el.classList.remove('rig-top'); el.classList.remove('rig-shield'); el.classList.remove('rig-hover');
      return;
    }
    el.innerHTML = svgRig(rig.kind) + `<div class="rig-turns">${rig.turnsLeft}턴</div>`;
    el.style.display = 'block';
    el.classList.toggle('rig-wide', rig.kind==='omega');
    // 강철 군단장의 정찰/화력/방벽/긴급배치(필러) 로봇은 기존 포탑류(bottom:-100px,
    // 머리만 보이는 연출)와 달리 화면 위쪽 구석에 전체가 온전히 보이게 그린다.
    el.classList.toggle('rig-top', ['recon','firepower','shield','filler'].includes(rig.kind));
    // 방벽 로봇은 다른 2종보다 살짝 작고 더 바깥쪽/위쪽에 오도록(사용자 요청).
    el.classList.toggle('rig-shield', rig.kind==='shield');
    // 정찰/화력/방벽 3종은 드론처럼 공중에 떠 있는 컨셉이라 은은하게 둥둥
    // 뜨는 애니메이션을 준다(사용자 요청). 필러(긴급배치)는 대상에서 제외 —
    // 요청 범위가 명시적으로 이 3종이었음. 컨테이너(el)에 애니메이션을 걸어
    // img 자식의 좌우반전 transform(.rig-slot-right img{scaleX(-1)})과 겹치지
    // 않게 한다.
    el.classList.toggle('rig-hover', ['recon','firepower','shield'].includes(rig.kind));
  }
  // 메카닉 리뉴얼(사용자 요청) — 보일러 압력 폭주. 압력이 100에 도달한 채
  // 방출되지 않고 넘어가면, 내 턴이 돌아올 때 자동으로 터진다(20% 확률로
  // 나 자신도 반동 피해를 입어 "무한정 쌓아두기만 해도 안전"하지 않게 한다).
  function checkMechanicOverheat(){
    if(!battleFlags || (battleFlags.pressure||0) < 100) return;
    if(!enemy || enemy.hp<=0 || battleOver) return;
    const edef = typeof getEffectiveEnemyDef==='function' ? getEffectiveEnemyDef(enemy.def) : enemy.def;
    let dmg = Math.max(1, Math.round((player.mag||0)*2.2) - Math.round(edef*0.5));
    enemy.hp = Math.max(0, enemy.hp-dmg);
    updateEnemyHpBar(); popDamage('-'+dmg,'crit');
    battleFlags.pressure = 0;
    updatePressureGauge();
    let msg = `보일러 압력이 폭주해 ${dmg}의 피해를 입혔다!`;
    if(Math.random()<0.2 && player.hp>0){
      const selfDmg = Math.max(1, Math.round(player.maxhp*0.08));
      player.hp = Math.max(0, player.hp-selfDmg);
      popDamage('-'+selfDmg,'bleed');
      msg += ` 반동으로 나도 ${selfDmg}의 피해를 입었다!`;
    }
    setBattleMsg('보일러 폭주!', msg);
    renderStatus();
    if(typeof checkBattleEnd==='function') checkBattleEnd();
  }
  // 압력 게이지 UI(사용자 요청) — 메카닉일 때만 rig 슬롯 근처에 작은 계기판으로 표시.
  function updatePressureGauge(){
    const el = document.getElementById('bt-pressure');
    if(!el) return;
    // 강철 군단장(mechanic_accumulator 리뉴얼)은 압력 게이지를 아예 쓰지 않으므로
    // 다른 메카닉 특성과 달리 이 계기판 자체를 숨긴다.
    if(!player || player.job!=='mechanic' || player.specialization==='mechanic_accumulator' || !isBattleActive()){ el.style.display='none'; return; }
    const p = (battleFlags && battleFlags.pressure) || 0;
    el.style.display = 'block';
    el.textContent = `🔥 압력 ${p}/100`;
    el.classList.toggle('pressure-high', p>=70);
  }

  function updateRigVisuals(){
    const slot1 = document.getElementById('bt-rig1');
    const slot2 = document.getElementById('bt-rig2');
    if(!slot1 || !slot2) return;
    const r1 = (battleFlags && battleFlags.rig && battleFlags.rig.turnsLeft>0) ? battleFlags.rig : null;
    const r2 = (battleFlags && battleFlags.rig2 && battleFlags.rig2.turnsLeft>0) ? battleFlags.rig2 : null;
    renderOneRigSlot(slot1, r1);
    renderOneRigSlot(slot2, r2);
    // 강철 군단장 전용 오메가 고정 슬롯(#bt-rigomega, index.html에 존재할 때만).
    // rig/rig2 풀과 완전히 분리되어 있어 정찰/화력/방벽 로봇은 절대 여기 오지 않는다.
    const slotOmega = document.getElementById('bt-rigomega');
    if(slotOmega){
      const rO = (battleFlags && battleFlags.omegaRig && battleFlags.omegaRig.turnsLeft>0) ? battleFlags.omegaRig : null;
      renderOneRigSlot(slotOmega, rO);
    }
  }
  // 로봇이 사격한 순간 해당 슬롯을 짧게 번쩍여, "지금 이 로봇이 쐈다"는 게
  // 눈에 보이게 한다. slotKey는 battleFlags의 키('rig'|'rig2')를 그대로 받아
  // DOM id로 매핑한다.
  function flashRigSlot(slotKey){
    const id = slotKey==='rig' ? 'bt-rig1' : slotKey==='rig2' ? 'bt-rig2' : 'bt-rigomega';
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.remove('rig-fire'); void el.offsetWidth; el.classList.add('rig-fire');
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
      const icon = d.type==='poison' ? '☠' : (d.type==='burn' ? '🔥' : (d.type==='infection' ? '🦠' : '🩸'));
      const stackText = d.type==='infection' ? ` x${d.stacks}` : '';
      b.textContent = `${icon} ${d.label}${stackText} ${d.turns}턴`;
      box.appendChild(b);
      // 전염(infection)은 전용 CSS 펄스 애니메이션이 없어서 출혈(bleed)
      // 이펙트를 그대로 재사용한다(뱃지 아이콘/텍스트는 위에서 이미 구분됨).
      stage.classList.add('dot-'+(d.type==='infection' ? 'bleed' : d.type));
    });
    if(enemy && enemy.exposedTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge expose';
      b.textContent = `🎯 급소 노출 ${enemy.exposedTurns}턴`;
      box.appendChild(b);
    }
    // 찰나검사(warrior_chalna) "완급" 콤보 경직 배지.
    if(enemy && enemy.chalnaStunTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge expose';
      b.textContent = `😵 경직 ${enemy.chalnaStunTurns}턴`;
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
    // 찰나검사(warrior_chalna) — 찰나 예약 중 배지. 대기 중인 beat의 한국어
    // 이름(완박/중박/급박)을 그대로 보여준다.
    if(battleFlags && battleFlags.chalnaReserve){
      const beatLabel = {slow:'완박', mid:'중박', fast:'급박'}[battleFlags.chalnaReserve.beat] || '';
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      b.textContent = `🌀 찰나: ${beatLabel} 대기 중`;
      b.title = '다음 내 턴에 다른 검격을 시전하면 콤보가 발동한다. 놓치면 흩어진다.';
      box.appendChild(b);
    }
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
    // 분신 배가(rogueDoubleImage, 환영검사): 다음 공격형 스킬 1회에만 적용되는
    // 1회성 예약 상태다(스택 없음 — 재설계로 지속 토글에서 1회성으로 바뀜).
    // player.doubleImageArmed에 저장되므로(lightningCritArmed/stealthDmgBonusArmed와
    // 동일한 패턴 — 전투 중 계속 유지되다가 소모될 때 꺼짐) battleFlags가 아니라
    // player를 확인한다.
    if(player.doubleImageArmed){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      b.textContent = '👻 분신 배가 대기중';
      b.title = '다음 공격형 스킬을 쓰면 잔영이 두 번, 더 강하게 나타난다. 한 번 쓰면 소모된다.';
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
    // (구) 채무 스택 배지 — 사기꾼 리뉴얼로 mastery_luckdebt가 더 이상 스택을
    // 쌓지 않아(손버릇으로 재설계) 이 배지는 제거했다.
    // 빚(외상 도박사): 전투 중에도 항상 남은 빚과 대략적인 상환율을 확인할 수
    // 있게 한다. 빚이 없으면(player.debt<=0) 표시하지 않는다. 사용자 피드백
    // "버프가 언제까지 적용되는지 모호하다"에 따라, 대출로 얻은 버프(영구
    // 스탯 상승 — 갚을 때까지 모든 전투에 상시 적용됨. 전투마다 리셋되는 게
    // 아니다)가 현재 얼마인지도 함께 보여준다.
    if((player.debt||0) > 0){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      const repayPct = Math.round(getDebtRepaymentRatio()*100);
      const d = player.debtAppliedDelta || {};
      const buffParts = [];
      if(d.atk) buffParts.push(`공+${d.atk}`);
      if(d.mag) buffParts.push(`마+${d.mag}`);
      const buffStr = buffParts.length ? ` · ${buffParts.join(' ')}` : '';
      b.textContent = `📒 빚 ${player.debt}G (상환 ${repayPct}%)${buffStr}`;
      b.title = '대출로 얻은 버프는 전투와 무관하게 상시 적용되며, 갚을 때까지 계속 유지된다. 갚은 비율만큼 페널티는 완화된다. 대출 후 일정 층 안에 못 갚으면 황금고블린이 찾아온다.';
      box.appendChild(b);
    }
    // 버프류 스킬 잔여 턴수 표시(사용자 요청 — 검은 기도/총사령관의 명령처럼
    // "몇 턴 남았는지 모호한" 버프들). warcry/paladinblessing 등 여러 스킬이
    // 공유하는 범용 필드(buffAtkTurns/buffDefTurns/buffCounterTurns)부터
    // 스킬 전용 필드(knightVulnTurns/legionCommandTurns)까지 전부 배지로 노출.
    if(player.buffAtkTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      const pct = Math.round(((player.buffAtkMult||1)-1)*100);
      // 명상/유물/계약 등 장기 지속형 버프는 관례적으로 buffAtkTurns=99
      // (큰 숫자)로 표현한다 — 라운드당 1씩만 깎여서 실제로는 여러 전투에
      // 걸쳐 유지될 수 있다("다음 전투까지"라고 단정할 수 없어 그냥 "지속
      // 중"으로 표시).
      const turnLabel = player.buffAtkTurns>=90 ? '지속 중' : `${player.buffAtkTurns}턴`;
      b.textContent = `⚔️ 공격력 버프 ${turnLabel}`;
      b.title = pct>0 ? `공격력 +${pct}%` : '공격력이 오른 상태가 지속되고 있다.';
      box.appendChild(b);
    }
    if(player.buffDefTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      const turnLabel = player.buffDefTurns>=90 ? '지속 중' : `${player.buffDefTurns}턴`;
      // 버그 수정(사용자 제보) — buffDefMult는 방어 버프(1보다 작음, 받는
      // 피해 감소)와 물음표 이벤트 저주(applyNextBattleCurse 등, 1보다 큼,
      // 받는 피해 증가) 양쪽에 재활용되는 필드인데, 배지는 방향과 무관하게
      // 항상 "방어 버프"로만 표시하고 있었다. 방향에 따라 배지 자체를 분기한다.
      if((player.buffDefMult||1) > 1){
        const curseP = Math.round(((player.buffDefMult||1)-1)*100);
        b.textContent = `💀 저주: 받는피해 증가 ${turnLabel}`;
        b.title = `받는 피해 +${curseP}%`;
      } else {
        const pct = Math.round((1-(player.buffDefMult||1))*100);
        b.textContent = `🛡️ 방어 버프 ${turnLabel}`;
        b.title = pct>0 ? `받는 피해 -${pct}%` : '방어 태세가 지속되고 있다.';
      }
      box.appendChild(b);
    }
    if(player.buffCounterTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      b.textContent = `⚡ 반격 태세 ${player.buffCounterTurns}턴`;
      b.title = `피격 시 ${Math.round((player.buffCounterChance||0)*100)}% 확률로 즉시 반격한다.`;
      box.appendChild(b);
    }
    if(player.knightVulnTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      b.textContent = `🩸 검은 기도 ${player.knightVulnTurns}턴`;
      b.title = `공격력 +${player.knightVulnAtkBonus||0}, 방어력 -${player.knightVulnDefPenalty||0}가 남은 턴 동안 유지된다.`;
      box.appendChild(b);
    }
    if(battleFlags && battleFlags.legionCommandTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      b.textContent = `📯 총사령관의 명령 ${battleFlags.legionCommandTurns}턴`;
      b.title = `가동 중인 모든 로봇의 사격 위력이 ${Math.round((battleFlags.legionCommandMult||0)*100)}% 늘어난 상태가 지속되고 있다.`;
      box.appendChild(b);
    }
  }

  // 1차/2차 "각성기" 스킬 테두리 색 구분(사용자 요청) — 스킬 전체가 아니라
  // 딱 두 개: 기본 직업의 레벨10 궁극기(job.skillLevels[10] — 예: 과압각성/
  // 메테오/심판의날 등, "1차 각성기") 하나와, 전직 특성의 레벨15 궁극기
  // (spec.skillLevels[15], "2차 각성기") 하나만 표시한다. 그 외 스킬은 0을
  // 반환해 기본 테두리 그대로 둔다.
  function getSkillTier(k){
    const job = getJob(player);
    if(job && job.skillLevels && job.skillLevels[10]===k) return 1;
    const spec = getSpecialization(player);
    if(spec && spec.skillLevels && spec.skillLevels[15]===k) return 2;
    return 0;
  }

  // 자연 능력치 근사 계산(사용자 요청 — 상태창에 "공격력 40 (+25)"처럼
  // 순수 레벨업 성장분과 장비/스킬/유물 등에서 온 보너스를 나눠서 보여주기
  // 위함). player.originGrowthRemainder(레벨업 시 나머지를 이월시키는 실제
  // 저장값)를 직접 활용해 대부분의 경우 완전히 정확하게 역산한다 —
  // "지금까지 지급된 정수 총합 = 정확한 소수 총합 - 현재 이월 잔량"이라는
  // 이월 누적 구조의 성질을 이용한다. 방어력/속도/마력은 항상 정확하고,
  // 공격력은 "쉬움 난이도 + 오프닝 근력 보정"이 둘 다 있는 경우에만 근사치로
  // 남는다(그 조합에선 매 레벨 origin 성장값에 쉬움 배율 반올림이 한 번 더
  // 얹히는 이중 반올림이라, 정확히 재현하려면 레벨별 재시뮬레이션이 필요해
  // 화면 표시 하나 때문에 그렇게까지는 하지 않았다). 실제 전투 계산에는
  // 전혀 안 쓰이는 표시 전용 함수다.
  function computeNaturalStats(){
    const job = getJob(player);
    const m = job.statMods;
    const ob = player.originBonuses || {};
    const rem = player.originGrowthRemainder || {};
    const easyMult = player.difficulty==='easy' ? 1.2 : 1;
    const levelsGained = Math.max(0, (player.level||1)-1);
    const specBonus = player.specialization ? 3 : 0;

    const defExactTotal = levelsGained*1*(1+(ob.atonement||0));
    const natDef = (3+m.def) + Math.round(defExactTotal - (rem.def||0)) + specBonus;

    const spdExactTotal = levelsGained*1*(1+(ob.swiftness||0));
    const natSpd = (6+m.spd) + Math.round(spdExactTotal - (rem.spd||0)) + specBonus;

    const natMag = Math.round((6+m.mag)*easyMult) + levelsGained*Math.round(2*easyMult) + specBonus;

    const atkExactTotal = levelsGained*2*(1+(ob.strength||0));
    const atkOriginWhole = Math.round(atkExactTotal - (rem.atk||0));
    const natAtkGrowth = (easyMult===1) ? atkOriginWhole : Math.round(atkOriginWhole*easyMult);
    const natAtk = Math.round((7+m.atk)*easyMult) + natAtkGrowth + specBonus;

    return {atk:natAtk, mag:natMag, def:natDef, spd:natSpd};
  }

  // 상태창(사용자 요청) — 초상화는 이번엔 제외하고 능력치+스킬 목록만.
  // 상단 이름/레벨 영역(#namewrap-status)을 누르면 언제든 열 수 있다.
  function openStatusSheet(){
    const existing = document.getElementById('status-sheet-overlay');
    if(existing){ existing.remove(); return; }
    const nat = computeNaturalStats();
    const statRow = (label, cur, natVal)=>{
      const bonus = cur - natVal;
      const bonusStr = bonus===0 ? '' : ` <span style="color:${bonus>0?'var(--forest-bright)':'var(--rust-bright)'};">(${bonus>0?'+':''}${bonus})</span>`;
      return `<div class="shop-item"><span class="si-info"><b>${label}</b></span><span>${natVal}${bonusStr}</span></div>`;
    };
    const skillsHtml = (player.skills||[]).filter(k=>SKILLDB[k]).map(k=>{
      const sk = SKILLDB[k];
      const tier = getSkillTier(k);
      const borderColor = tier===1 ? '#5a7a9c' : (tier===2 ? 'var(--violet)' : '#3a2c1c');
      return `<div class="shop-item" style="border-left:3px solid ${borderColor}; padding-left:8px;">
        <span class="si-info"><span class="si-name"><b>${sk.name}</b></span><br>
        <span style="font-size:12px; color:var(--parchment-dim);">${sk.desc||''}</span></span>
      </div>`;
    }).join('');
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'status-sheet-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    panel.innerHTML = `<h3>📜 ${player.name}의 상태창</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 12px;">Lv.${player.level} · ${getJobLabel(player)}</p>
      <div style="display:flex; flex-direction:column; margin-bottom:12px;">
        <div class="shop-item"><span class="si-info"><b>HP</b></span><span>${Math.max(0,player.hp)}/${player.maxhp}</span></div>
        <div class="shop-item"><span class="si-info"><b>MP</b></span><span>${Math.max(0,player.mp)}/${player.maxmp}</span></div>
        ${statRow('공격력', player.atk, nat.atk)}
        ${statRow('마력', player.mag, nat.mag)}
        ${statRow('방어력', player.def, nat.def)}
        ${statRow('속도', player.spd, nat.spd)}
      </div>
      <p style="color:var(--parchment-dim); font-size:12px; text-align:center; margin:-4px 0 8px;">괄호 안 수치는 장비/강화/스킬/유물 등에서 온 보너스(근사치)</p>
      <h3 style="font-size:15px; margin-top:6px;">보유 스킬</h3>
      <div style="display:flex; flex-direction:column;">${skillsHtml || '<p style="text-align:center;color:var(--parchment-dim);">보유한 스킬이 없다.</p>'}</div>
      <div style="text-align:center; margin-top:12px;"><button class="btn" id="status-sheet-close">닫기</button></div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    panel.querySelector('#status-sheet-close').addEventListener('click', ()=> overlay.remove());
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.remove(); });
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
      // 강철 군단장 전용 표시 순서(사용자 요청 — 2차 각성 후 스킬 목록이
      // 뒤섞여 헷갈림). 목록에 없는 스킬(마스터리 "군단 편성" 등)은 맨 앞에
      // 그대로 남긴다.
      if(player.specialization==='mechanic_accumulator'){
        const legionOrder = ['mechanicFocusFire','mechanicMark','legionMaintenance','mechanicDeployFirepower','mechanicDeployRecon','mechanicDeployShield','mechanicOverpressure','legionFullSquadSynergy','legionCommand'];
        avail.sort((a,b)=>{
          const ia = legionOrder.indexOf(a), ib = legionOrder.indexOf(b);
          if(ia===-1 && ib===-1) return 0;
          if(ia===-1) return -1;
          if(ib===-1) return 1;
          return ia-ib;
        });
      }
      if(avail.length===0){ sub.innerHTML = '<div class="sub-item disabled">배운 스킬이 없다</div>'; return; }
      // 토글형 스킬(arm/elementpact)은 가로 한 줄로 묶어서 맨 위에 먼저 그린다 —
      // 화염/빙결/번개계약처럼 토글이 여러 개라도 세로 목록이 길어지지 않는다.
      const toggleKeys = avail.filter(k => SKILLDB[k].type==='arm' || SKILLDB[k].type==='elementpact');
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
            : !!player[s.armFlag];
          const btn = document.createElement('div');
          const tierCls = getSkillTier(k);
          btn.className = 'toggle-btn'+(isActive?' active':'')+(tierCls?' skill-tier'+tierCls:'');
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
        // 찰나검사(warrior_chalna): 찰나가 대기 중이면 예약 3항목은 목록에서
        // 아예 숨긴다(한 번에 하나만 걸 수 있으므로 또 예약할 이유가 없음).
        if(s.type==='chalnaReserve' && battleFlags && battleFlags.chalnaReserve) return;
        const mpCost = s.mp;
        const cdLeft = (battleFlags && battleFlags.skillCooldowns && battleFlags.skillCooldowns[k]) || 0;
        // 사기꾼 "운명 뒤바꾸기"(hpswap)는 전투당 1회 제한(겹패 각인이 있으면
        // 2회) — 상한에 도달했으면 비활성화.
        const wIdDS2 = player.equipment && player.equipment.weapon;
        const hasDoubleSwap2 = !!(wIdDS2 && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdDS2).includes('ju_doubleswap'));
        const fateSwapMax2 = hasDoubleSwap2 ? 2 : 1;
        const usedOnce = s.type==='hpswap' && battleFlags && (battleFlags.fateSwapUsedCount||0) >= fateSwapMax2;
        const canUse = !usedOnce && player.mp>=mpCost && cdLeft<=0;
        const div = document.createElement('div');
        const tierClsN = getSkillTier(k);
        div.className = 'sub-item'+(canUse?'':' disabled')+(tierClsN?' skill-tier'+tierClsN:'');
        // 찰나검사: 찰나가 대기 중이면 즉시시전 3항목은 실제로 눌렀을 때 나갈
        // 콤보의 이름/설명으로 표시를 바꿔치기한다(원래 스킬 이름 대신).
        let displayName = s.name, displayDesc = s.desc;
        if(s.type==='chalnaStrike' && battleFlags && battleFlags.chalnaReserve){
          const combo = CHALNA_COMBOS[[battleFlags.chalnaReserve.beat, s.beat].sort().join('+')];
          if(combo){ displayName = combo.name; displayDesc = combo.desc; }
        }
        // 베팅/올인(goldbet 타입): 실제로 쓰면 판돈이 얼마가 될지 현재 소지 골드
        // 기준으로 미리 계산해 보여준다("전투 중 소지금액 확인" 요청에 맞춰,
        // 그냥 골드 숫자만 보여주는 것보다 "이 스킬을 쓰면 얼마를 거는지"가 더
        // 실질적인 정보라 판단해 이 형태로 구현했다 — 상단 상태바의 💰 표시와
        // 함께 보면 현재 골드와 판돈을 한눈에 비교할 수 있다).
        let extraInfo = '';
        if(s.type==='goldbet'){
          const stakePreview = Math.min(s.stakeCap||Infinity, Math.round((player.gold||0)*s.stakePct));
          extraInfo = `<div class="si-desc" style="color:var(--gold-bright); margin-top:2px;">💰 지금 걸면 판돈 ${stakePreview}G (보유 ${player.gold||0}G)</div>`;
        }
        // 대출(loanborrow 타입, 외상 도박사): 이 종류로 지금까지 몇 번 빌렸는지,
        // 그리고 지금 빌리면 남은 빚이 얼마가 되는지 미리 보여준다.
        if(s.type==='loanborrow'){
          const loan = DEBTOR_LOANS[s.loanKey];
          const count = (player.loanCounts && player.loanCounts[s.loanKey]) || 0;
          extraInfo = `<div class="si-desc" style="color:var(--gold-bright); margin-top:2px;">📒 지금까지 ${count}회 대출 · 빌리면 빚 ${(player.debt||0)+loan.amount}G</div>`;
        }
        const costBadge = usedOnce ? '전투당 1회' : (cdLeft>0 ? `쿨타임 ${cdLeft}턴` : `MP ${mpCost}`);
        div.innerHTML = `<div class="si-info"><div class="si-name">${displayName}</div><div class="si-desc">${displayDesc}</div>${extraInfo}</div><div class="si-cost">${costBadge}</div>`;
        if(canUse) div.addEventListener('click', ()=>{ closeSub(); playerSkill(k); });
        sub.appendChild(div);
      });
    } else if(mode==='item'){
      const items = [
        {key:'potion', name:'물약', desc:'HP 40 회복'},
        {key:'hipotion', name:'상급 물약', desc:'HP 110 회복'},
        {key:'ether', name:'에테르', desc:'MP 30 회복'},
        {key:'hiether', name:'상급 에테르', desc:'MP 85 회복'},
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
