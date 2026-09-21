"use strict";
/*
전투 UI 연출/이펙트 — HP바 갱신, 메시지 표시, 커맨드 UI 리셋/활성화,
데미지 팝업, 흔들림, 슬래시 이펙트, 콤보 연출, 상태이상 배지, 스킬/아이템 서브메뉴 열기/닫기.
export(전역): updateEnemyHpBar, setBattleMsg, resetCommandUI, setCommandsEnabled, popDamage,
              shakeEnemy, spawnSlashMark, spawnSlashImageFx, spawnFigureSlashFx, playComboFinish,
              playStatusFx, playCastBurst, playBanner, spawnFrostFlashFx, spawnFateSwapFx, spawnCoinTossFx, spawnVenomDrainFx, spawnHolyRendFx, spawnDarkPrayerFx, spawnMartyrJudgmentFx, spawnTimeHasteFx, spawnTimeRewindFx, spawnRigShotFx, spawnGuardianVfxImage, spawnCaliberXFx, spawnMartyrFx, spawnTimeParadoxFx, shakeScreen,
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
    // 빙결(사용자 요청 — 계약술사 빙결계약/정예 특성 연동): resetCommandUI()는
    // closeSub()(메뉴 열기/닫기)처럼 실제 턴 경계가 아닌 경로에서도 호출되므로,
    // 스킬 쿨타임 감소와 동일한 안전장치(cooldownTickPending — "플레이어가 실제로
    // 행동해서 라운드가 막 넘어왔다"는 신호)로만 판정한다. 걸려 있으면 커맨드
    // UI를 아예 열지 않고 곧장 다음 라운드(enemyTurn)로 넘긴다 — 찰나검사
    // 경직이 적의 행동을 통째로 건너뛰는 것과 동일한 패턴.
    const isRealTurnBoundary = !!(battleFlags && battleFlags.cooldownTickPending);
    if(isRealTurnBoundary && player.freezeTurns>0){
      // 배지가 "얼어붙었다"는 걸 실제로 보여줄 수 있도록, 카운터를 깎기 전에
      // 먼저 그린다(먼저 깎으면 0이 되어 배지 조건을 스스로 지워버린다).
      setCommandsEnabled(false);
      updatePlayerStatusBadges();
      setBattleMsg('빙결!', '몸이 얼어붙어 움직일 수 없다!');
      if(typeof playStatusFx==='function') playStatusFx('pact-ice');
      player.freezeTurns -= 1;
      setTimeout(()=>{ if(!battleOver) enemyTurn(); }, 700);
      return;
    }
    subMode=null;
    document.getElementById('cmd-main').style.display='grid';
    document.getElementById('cmd-sub').style.display='none';
    document.getElementById('cmd-back-row').style.display='none';
    setCommandsEnabled(true);
    // 시간의 파수꾼 "결빙의 궤적" 속도 감소 디버프 되돌리기(사용자 기획).
    // 플레이어 턴이 다시 시작될 때마다 하나씩 줄이고, 0이 되면 원상복구.
    if(battleFlags && battleFlags.tgSpdDebuff && battleFlags.tgSpdDebuff.turnsLeft>0){
      battleFlags.tgSpdDebuff.turnsLeft -= 1;
      if(battleFlags.tgSpdDebuff.turnsLeft<=0){
        player.spd += battleFlags.tgSpdDebuff.delta;
        battleFlags.tgSpdDebuff = null;
      }
    }
    if(hasRelicFlag('skillLocked')) document.getElementById('cmd-skill').disabled = true;
    // 감전 스킬 봉인 — 반드시 "비활성화 판정 뒤에" 카운트를 내린다. 먼저
    // 내리면 지속 2턴 중 실제로 막히는 턴은 1턴뿐이게 되는 오프바이원이 생긴다.
    if(player.shockSealTurns>0){
      document.getElementById('cmd-skill').disabled = true;
      if(isRealTurnBoundary) player.shockSealTurns -= 1;
    }
    const runBtn = document.getElementById('cmd-run');
    // (사용자 요청 — 굴복 시스템) 도망(쉬움 전용, 확률제)과 굴복(보통/하드코어
    // 전용, 확정 성공 + 골드 대가)은 같은 버튼 자리를 난이도에 따라 바꿔 쓴다 —
    // 둘 다 "이번 조우를 중단하고 재도전한다"는 같은 역할이라 동시에 보일
    // 필요가 없다.
    const canFlee = !player || player.difficulty==='easy';
    runBtn.style.display = '';
    runBtn.innerHTML = canFlee
      ? '<span class="icon">💨</span>도망'
      : '<span class="icon">🏳️</span>굴복';
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
    // (사용자 요청 — 정예 특성 경고를 토스트 대신 상시 카드로 통일) 광기 예고를
    // 포함해 매번 여기서 갱신한다. 이전엔 cooldownTickPending 시점에만 광기
    // 토스트를 1회 띄웠지만, 이제 카드가 상태를 계속 반영하므로 조건 게이팅이
    // 필요 없다.
    if(typeof updateBossIntentCard==='function') updateBossIntentCard();
  }
  function setCommandsEnabled(en){
    ['cmd-attack','cmd-skill','cmd-item','cmd-run'].forEach(id=>document.getElementById(id).disabled=!en);
  }

  // 재수정(사용자 제보 — 기관사 포탑 배치 시 데미지 숫자가 겹쳐 보임):
  // 기존엔 매번 -35~35px 사이 완전 무작위 오프셋만 줬는데, 로봇군단장은
  // 슬롯이 최대 3개(rig/rig2/omegaRig)라 짧은 간격(약 700ms)으로 연속
  // 데미지가 뜨는 경우가 흔하고, 좁은 무작위 범위 안에서 우연히 비슷한
  // 값이 나오면 여전히 겹쳤다. 이제 "현재 화면에 떠 있는 숫자들의 위치"를
  // 직접 추적해서, 겹치지 않는 위치를 순환식으로 골라 쓰도록 바꿨다.
  let dmgPopActiveSlots = [];
  const DMG_POP_OFFSETS = [0, -55, 55, -25, 25, -80, 80];
  let dmgPopCursor = 0;
  function popDamage(text, cls){
    const stage = document.getElementById('bt-stage');
    const pop = document.createElement('div');
    pop.className = 'dmg-pop'+(cls?(' '+cls):'');
    pop.textContent = text;
    const now = Date.now();
    dmgPopActiveSlots = dmgPopActiveSlots.filter(s=>s.expireAt>now);
    let offset = DMG_POP_OFFSETS[dmgPopCursor % DMG_POP_OFFSETS.length];
    let tries = 0;
    while(dmgPopActiveSlots.some(s=>Math.abs(s.offset-offset)<30) && tries<DMG_POP_OFFSETS.length){
      dmgPopCursor++;
      offset = DMG_POP_OFFSETS[dmgPopCursor % DMG_POP_OFFSETS.length];
      tries++;
    }
    dmgPopCursor++;
    const expireAt = now + 800;
    dmgPopActiveSlots.push({offset, expireAt});
    pop.style.left = `calc(50% + ${offset}px)`;
    stage.appendChild(pop);
    setTimeout(()=>{
      pop.remove();
      dmgPopActiveSlots = dmgPopActiveSlots.filter(s=>s.expireAt>Date.now());
    }, 800);
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

  // seed(숫자, 기존 방식)를 주면 고정 각도 배열에서 하나 골라 항상 화면
  // 중앙에 긋는다. opts 객체({angle, x, y})를 주면 각도/위치를 직접 지정할
  // 수 있다(백귀야행이 잔영 슬라이드와 같은 각도/자리에 자국을 남기기 위해
  // 추가 — 사용자 요청 "지나간 자리엔 연속베기 같은 베는 모션이 생기고").
  function spawnSlashMark(seedOrOpts){
    const stage = document.getElementById('bt-stage');
    const el = document.createElement('div');
    el.className = 'slash-mark';
    let ang, x, y;
    if(seedOrOpts && typeof seedOrOpts === 'object'){
      ang = seedOrOpts.angle||0; x = seedOrOpts.x; y = seedOrOpts.y;
    } else {
      const angles = [-32, 24, -12, 38, -44];
      ang = angles[(seedOrOpts||0) % angles.length];
    }
    el.style.setProperty('--ang', ang+'deg');
    if(x!=null) el.style.left = x+'%';
    if(y!=null) el.style.top = y+'%';
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 350);
  }

  // 이미지 기반 슬래시 VFX(사용자 제공 스프라이트) — 찰나검사 전용. 호출할
  // 때마다 회전각/위치/좌우반전을 무작위로 섞어서(옵션으로 고정도 가능)
  // "이곳저곳에서 베는" 느낌을 낸다. opts: {angle, x, y, flip, variant}(전부 생략 가능).
  // 칼날연출 변주 10종(v1~v10, v1은 무표시=기본) — 새 스프라이트 없이 색상
  // 필터/크기/교차 레이어로 다르게 보이게 한다(CSS 쪽 .slash-img-fx.vN 참고).
  // 삼박난무(chalnaTriBeat)는 이 함수를 3연속 호출하므로 매번 다른 조합이
  // 자연스럽게 섞여 "여러 번 다르게 베는" 느낌이 강화된다.
  const SLASH_VARIANTS = ['','v2','v3','v4','v5','v6','v7','v8','v9','v10'];
  function spawnSlashImageFx(opts){
    opts = opts || {};
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    const flip = opts.flip!=null ? opts.flip : Math.random()<0.5;
    const variant = opts.variant!=null ? opts.variant : SLASH_VARIANTS[Math.floor(Math.random()*SLASH_VARIANTS.length)];
    el.className = 'slash-img-fx' + (flip ? ' flip' : '') + (variant ? ' '+variant : '');
    el.style.setProperty('--ang', (opts.angle!=null ? opts.angle : Math.round(Math.random()*70-35))+'deg');
    // 참격은 몬스터 쪽(중앙 근처)에 뜨도록(사용자 요청) — 사람 형상은 외곽,
    // 참격은 중앙으로 역할을 나눈다.
    el.style.setProperty('--sx', (opts.x!=null ? opts.x : Math.round(38+Math.random()*24))+'%');
    el.style.setProperty('--sy', (opts.y!=null ? opts.y : Math.round(38+Math.random()*24))+'%');
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 230);
  }
  // 삼박난무 전용 — 베는 동작을 하는 사람 형상(사용자 제공 스프라이트 3종)을
  // spawnSlashImageFx와 동일한 무작위 위치/회전/반전으로 뿌린다.
  const CHALNA_FIGURE_IMAGES = ['images/vfx/chalna_figure_1.webp','images/vfx/chalna_figure_2.webp','images/vfx/chalna_figure_3.webp'];
  // 백귀야행(환영도적) 전용 — 사용자가 직접 준비한 전용 슬래시 이미지 1장.
  // 사람 형상이 아니라 대각선 검광/잔영 덩어리라, opts.images로 넘겨서
  // spawnFigureSlashFx()의 기존 무작위 위치/회전/반전 로직을 그대로 재사용한다.
  const PHANTOM_SLASH_IMAGES = ['images/vfx/phantom_slash.webp'];
  function spawnFigureSlashFx(opts){
    opts = opts || {};
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    const flip = opts.flip!=null ? opts.flip : Math.random()<0.5;
    el.className = 'slash-figure-fx' + (opts.slide ? ' slide' : '') + (flip ? ' flip' : '');
    const pool = opts.images || CHALNA_FIGURE_IMAGES;
    const img = pool[Math.floor(Math.random()*pool.length)];
    el.style.backgroundImage = `url('${img}')`;
    // 값을 지역변수로도 따로 들고 있는다 — slide 모드일 때 아래에서 같은
    // 각도/위치로 spawnSlashMark()를 겹쳐 찍어야 하기 때문(CSS 커스텀
    // 프로퍼티는 JS에서 다시 읽기 번거로워 애초에 숫자로 챙겨둔다).
    const ang = opts.angle!=null ? opts.angle : Math.round(Math.random()*70-35);
    // [수정] 사용자 요청 — 예전엔 참격(중앙)과 사람 형상(외곽)의 자리를
    // 나눴었는데, 삼박난무가 10연타로 늘어나며 굳이 안 나눠도 자연스러운
    // "여러 명이 동시에 베는" 느낌이 나서 제한을 풀었다. 참격과 동일한
    // 무작위 범위를 그대로 재사용.
    const sx = opts.x!=null ? opts.x : Math.round(38+Math.random()*24);
    const sy = opts.y!=null ? opts.y : Math.round(38+Math.random()*24);
    el.style.setProperty('--ang', ang+'deg');
    el.style.setProperty('--sx', sx+'%');
    el.style.setProperty('--sy', sy+'%');
    stage.appendChild(el);
    setTimeout(()=>el.remove(), opts.slide ? 220 : 320);
    // 백귀야행 전용(사용자 요청 — "지나간 자리엔 연속베기 등의 스킬에 쓰이는
    // 베는 모션이 생기고"): 잔영이 슬라이드하는 것과 같은 각도/위치에 기존
    // 연속베기용 슬래시 자국(spawnSlashMark)을 겹쳐 찍어, 지나간 궤적처럼
    // 보이게 한다.
    if(opts.slide && typeof spawnSlashMark==='function'){
      spawnSlashMark({angle: ang, x: sx, y: sy});
    }
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
  // (사용자 요청 — 정예 특성 경고를 토스트 대신 이 카드로 통일) 보스 텔레그래프가
  // 없으면, 정예 특성(광기 예고/광폭화·사냥꾼 발동 중) 상태를 같은 카드에
  // 이어서 보여준다. 우선순위: 보스 스킬 예고 > 광기 예고 > 광폭화/사냥꾼(둘 다
  // 활성이면 함께 표시). 광폭화/사냥꾼은 매번 살아있는 HP 조건을 그대로
  // 확인하므로(enemy-turn.js의 getEffectiveEnemyAtk와 동일한 조건), 체력이
  // 회복되어 조건을 벗어나면 카드도 자동으로 사라진다 — 예전 토스트의 "한 번
  // 뜨고 끝"과 달리 실제 상태를 그대로 반영한다.
  function updateBossIntentCard(){
    const card = document.getElementById('bt-boss-intent');
    if(!card) return;
    if(!enemy || battleOver){ card.style.display = 'none'; return; }
    if(enemy.isBoss && (enemy.telegraphed || enemy.aboutToUltimate)){
      card.style.display = 'block';
      card.className = 'boss-intent-card warn';
      card.textContent = `⚠ [${BOSS_SKILL_LABELS[enemy.pendingSkillKey]||'강공격'}] — 다음 턴 발동!`;
      return;
    }
    // 시간의 파수꾼 메아리 예고(사용자 기획) — 대기 중인 메아리가 바로 다음
    // 턴에 터질 예정이면 알려준다. "시간 역행"(HP50% 이하에서 앞당겨 발동)은
    // 의도적으로 예고하지 않는 유일한 예외라 여기서 다루지 않는다.
    if(enemy.type==='timeguardian' && enemy.echoQueue && enemy.echoQueue.length && enemy.echoQueue[0].turnsLeft===1){
      card.style.display = 'block';
      card.className = 'boss-intent-card warn';
      card.textContent = '⏳ 메아리가 다가온다…';
      return;
    }
    // 명멸의 틈 상태 표시(사용자 기획) — 공격이 왜 안 통하는지 알 수 있게
    // 상태만 알려준다("귀환의 일격"이 언제 올지는 의도적으로 예고하지 않음 —
    // 다크홀식 기습이 이 기믹의 핵심).
    if(enemy.type==='timeguardian' && enemy.vanishedTurns>0){
      card.style.display = 'block';
      card.className = 'boss-intent-card warn';
      card.textContent = '🌀 명멸의 틈 — 지금은 공격이 통하지 않는다';
      return;
    }
    if(enemy.eliteTraits && enemy.eliteTraits.length){
      const lines = [];
      if(enemy.eliteTraits.includes('madness')){
        const nextMadnessTurn = (enemy.madnessTurn||0) + 1;
        if(nextMadnessTurn % 3 === 0) lines.push('⚠ 광기 — 다음 턴 강공격!');
      }
      if(enemy.eliteTraits.includes('berserk') && enemy.maxhp>0 && (enemy.hp/enemy.maxhp)<=0.5){
        lines.push('💢 광폭화 — 공격력 상승 중');
      }
      if(enemy.eliteTraits.includes('hunter') && player.maxhp>0 && (player.hp/player.maxhp)<=0.3){
        lines.push('🎯 사냥꾼 표적 — 받는 피해 증가 중');
      }
      if(lines.length){
        card.style.display = 'block';
        card.className = 'boss-intent-card warn';
        card.textContent = lines.join(' / ');
        return;
      }
    }
    card.style.display = 'none';
  }

  function playBanner(text, cls){
    const stage = document.getElementById('bt-stage');
    const el = document.createElement('div');
    el.className = 'fx-banner'+(cls?(' '+cls):'');
    el.textContent = text;
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 1150);
  }

  // 시간의 파수꾼 "결빙의 궤적" 전용 화면 이펙트(사용자 요청 — 텍스트 배너만으론
  // 밋밋하다는 피드백). isEcho면 더 옅은 버전(frostflashecho)을 쓴다.
  function spawnFrostFlashFx(isEcho){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.className = 'frost-flash-fx'+(isEcho?' echo':'');
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 700);
  }

  // 폭주 사출(mechanicOverloadDischarge) 전용 — 사용자가 직접 준비한 전용
  // 이미지(images/vfx/overload_jet.webp/overload_explode.webp)를 재생한다.
  // spawnFrostFlashFx()와 동일한 생성 → setTimeout 제거 수명주기.
  //
  // [수정] 처음엔 .overload-jet-fx를 #bt-stage 구석에 고정 좌표(bottom/left)로
  // 박아뒀는데, 실제 포탑(#bt-rig1/#bt-rig2, bottom:-100px로 크게 내려가
  // 있음)이 그 좌표와 안 맞아 "포탑에서 나가는" 느낌이 안 났다(사용자 피드백).
  // 그래서 고정 좌표 대신 실제 포탑 DOM 요소의 getBoundingClientRect()를 읽어
  // 그 자리에서 직접 발사되도록 좌표를 계산한다 — 이후 포탑 CSS가 바뀌어도
  // 자동으로 따라간다. targetEl이 없거나(장치 자체가 없음) 화면에 없으면
  // (display:none) 기존처럼 화면 왼쪽 아래 구석을 기본값으로 쓴다.
  // 일반 포탑(#bt-rig1/#bt-rig2) 전용 — 오메가 유닛은 사출 빔 없이
  // 폭발 이미지만 쓰기로 해서(사용자 요청 — "사출이미지 없이 폭발이미지만")
  // spawnOverloadJetBurst()에서 아예 분기 처리한다.
  function spawnOverloadJetFx(fromRight, targetEl){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.className = 'overload-jet-fx'+(fromRight?' from-right':'');
    const stageRect = stage.getBoundingClientRect();
    const tRect = (targetEl && targetEl.offsetParent) ? targetEl.getBoundingClientRect() : null;
    if(tRect && tRect.width>0){
      // 포탑 스프라이트 안에서 포신 끝(발사구)은 대략 가로 45%, 세로 38%
      // 지점(autobot.png 실측 기준)에 있다 — 그 점이 곧 빔 이미지의 발사
      // 기준점(jet.png의 밝은 원점은 이미지 좌하단 근처)과 겹치도록 el의
      // 좌상단을 역산한다. 오른쪽 슬롯은 좌우 반전이라 발사구도 거울상(55%)이 된다.
      // 크기(254x190, index.html의 .overload-jet-fx와 반드시 동일해야 함)는
      // .archway가 겨우 210px 높이인데 원래 360x280으로 뒀다가 그 자체가
      // 무대보다 커서 클램핑을 해도 못 다 담겨 잘렸었다(사용자 피드백) — 원본
      // 이미지 비율(1456:1088≈1.338)에 맞춰 무대 높이 안에 들어오도록 줄였다.
      const W = 254, H = 190;
      const muzzleX = tRect.left + tRect.width*(fromRight?0.55:0.45);
      const muzzleY = tRect.top + tRect.height*0.38;
      const originFracX = fromRight ? 0.92 : 0.08; // jet.png 안에서 밝은 원점의 대략적 위치
      const originFracY = 0.88;
      let left = muzzleX - stageRect.left - W*originFracX;
      let top = muzzleY - stageRect.top - H*originFracY;
      // 클램핑(사용자 피드백 — 포탑이 .archway의 overflow:hidden 경계에 바짝
      // 붙어 있어(bottom:-100px로 몸통 대부분이 이미 가려진 상태), 위 계산이
      // 조금만 어긋나도 빔의 밝은 원점 쪽이 그대로 잘려 보였다. 정확한 픽셀
      // 정렬 대신, 최소한 이미지 전체가 무대 안에 들어오도록 좌표를 안전
      // 범위로 밀어넣는다 — 포탑 바로 옆이라는 느낌은 유지하면서 잘림만 없앤다.
      left = Math.max(4, Math.min(left, stageRect.width - W - 4));
      top = Math.max(4, Math.min(top, stageRect.height - H - 4));
      el.style.left = Math.round(left) + 'px';
      el.style.top = Math.round(top) + 'px';
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 450);
  }
  // atEl을 주면 그 요소 위치(가로 중앙/세로 35% 지점)에서, 안 주면 기존처럼
  // 적 위치(.overload-explode-fx 기본 CSS, 화면 중앙 42%)에서 터진다 —
  // 오메가 유닛의 "발사" 연출을 이 함수 재사용만으로 해결한다(사용자 요청).
  function spawnOverloadExplodeFx(atEl){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.className = 'overload-explode-fx';
    if(atEl && atEl.offsetParent){
      const stageRect = stage.getBoundingClientRect();
      const tRect = atEl.getBoundingClientRect();
      const cx = tRect.left + tRect.width*0.5;
      const cy = tRect.top + tRect.height*0.35;
      el.style.left = Math.round(cx - stageRect.left) + 'px';
      el.style.top = Math.round(cy - stageRect.top) + 'px';
    }
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 550);
  }
  // 포탑/오메가 자동 틱 전용 경량 스파크(사용자 요청 — 폭주 사출용 큰
  // 이미지는 자동 평타치고 너무 쎔). 빔/폭발 이미지 없이 적 위치에 작고
  // 빠른 CSS 플래시만 띄운다.
  function spawnRigTickSpark(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.className = 'rig-tick-spark';
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 320);
  }
  // 로봇 자동 사격 연출(사용자 요청 — "로봇이 총을 쏘는 게 타격감이 별로"). 새 이미지 없이
  // CSS/WAAPI만으로 발사(총구 섬광) → 비행(탄환/빔/에너지구) → 명중(섬광+충격 링+적 흔들림)
  // 3단계를 만든다. enemy-turn.js의 tickActiveRig()가 피해를 넣는 시점(landMs 뒤)에 맞춰
  // 마지막 탄이 도착하도록 발사 타이밍을 역산하므로, 피해 판정 코드는 그대로다.
  // 역할별: recon=가는 레이저, firepower=예광탄 3연사, shield=에너지 파동구, turret=탄 1발,
  // omega=굵은 빔. 총사령관의 명령(legionCommandTurns>0) 중엔 금빛으로 강화된다.
  function spawnRigShotFx(slotKey, rig, landMs){
    const stage = document.getElementById('bt-stage');
    if(!stage || !rig) return;
    const kind = rig.kind;
    if(!['recon','firepower','shield','turret','omega'].includes(kind)) return;
    const srcEl = document.getElementById(slotKey==='rig' ? 'bt-rig1' : slotKey==='rig2' ? 'bt-rig2' : 'bt-rigomega');
    const sr = stage.getBoundingClientRect();
    if(!sr.width) return;
    const er = (srcEl && srcEl.offsetParent) ? srcEl.getBoundingClientRect() : null;
    const sx = er ? er.left + er.width/2 - sr.left : (slotKey==='rig2' ? sr.width*0.85 : sr.width*0.15);
    const sy = er ? er.top + er.height*0.5 - sr.top : sr.height*0.3;
    const tx = sr.width*0.5, ty = sr.height*0.46;
    const boosted = !!(battleFlags && battleFlags.legionCommandTurns>0);
    const C = boosted
      ? {core:'#fff3c4', glow:'#ffc94a', edge:'rgba(255,190,60,0.0)'}
      : (kind==='recon'   ? {core:'#e6fbff', glow:'#4fd8ff', edge:'rgba(79,216,255,0.0)'}
      :  kind==='shield'  ? {core:'#ffffff', glow:'#8fb4ff', edge:'rgba(143,180,255,0.0)'}
      :  kind==='omega'   ? {core:'#fff0d6', glow:'#ff9a3c', edge:'rgba(255,154,60,0.0)'}
      :                     {core:'#fff1c9', glow:'#ff8a2b', edge:'rgba(255,138,43,0.0)'});
    const mk = (css)=>{
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute; pointer-events:none; z-index:7; opacity:0; will-change:transform,opacity; ' + css;
      stage.appendChild(el);
      return el;
    };
    const run = (el, frames, opt)=>{
      const a = el.animate(frames, Object.assign({fill:'both', easing:'linear'}, opt));
      a.onfinish = ()=>el.remove();
      return a;
    };
    const FLIGHT = kind==='shield' ? 230 : kind==='omega' ? 170 : 150;
    const shots = kind==='firepower' ? 3 : 1;
    const STAGGER = 55;
    const firstLaunch = landMs - FLIGHT - (shots-1)*STAGGER;
    // ① 총구 섬광
    {
      const m = mk(`left:${sx-22}px; top:${sy-22}px; width:44px; height:44px; border-radius:50%; `
        + `background:radial-gradient(circle, ${C.core} 0%, ${C.glow} 40%, ${C.edge} 75%);`);
      run(m, [{opacity:0, transform:'scale(.3)'},{opacity:1, transform:'scale(1.1)', offset:.3},{opacity:0, transform:'scale(1.5)'}],
        {delay:Math.max(0, firstLaunch-30), duration:170});
    }
    const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx)*180/Math.PI;
    for(let i=0;i<shots;i++){
      const t0 = Math.max(0, firstLaunch + i*STAGGER);
      const jx = (Math.random()-0.5)*36, jy = (Math.random()-0.5)*30;
      const ex = tx + jx, ey = ty + jy;
      const ddx = ex - sx, ddy = ey - sy, dl = Math.hypot(ddx, ddy), da = Math.atan2(ddy, ddx)*180/Math.PI;
      // ② 비행
      if(kind==='recon' || kind==='omega'){
        const h = kind==='omega' ? 9 : 3;
        const b = mk(`left:${sx}px; top:${sy-h/2}px; width:${dl}px; height:${h}px; transform-origin:0 50%; `
          + `background:linear-gradient(90deg, ${C.glow}00 0%, ${C.core} 55%, ${C.core} 100%); border-radius:${h}px; `
          + `box-shadow:0 0 ${h*3}px ${C.glow}, 0 0 ${h*6}px ${C.glow}88;`);
        run(b, [{opacity:1, transform:`rotate(${da}deg) scaleX(0)`},{opacity:1, transform:`rotate(${da}deg) scaleX(1)`, offset:.6},{opacity:0, transform:`rotate(${da}deg) scaleX(1)`}],
          {delay:t0, duration:FLIGHT+80});
      } else if(kind==='shield'){
        const o = mk(`left:${sx-16}px; top:${sy-16}px; width:32px; height:32px; border-radius:50%; `
          + `background:radial-gradient(circle, ${C.core} 0%, ${C.glow} 45%, ${C.edge} 72%); box-shadow:0 0 16px ${C.glow};`);
        run(o, [{opacity:1, transform:'translate(0,0) scale(.6)'},{opacity:1, transform:`translate(${ddx}px,${ddy}px) scale(1.5)`}],
          {delay:t0, duration:FLIGHT, easing:'ease-in'});
      } else {
        const b = mk(`left:${sx-14}px; top:${sy-2.5}px; width:28px; height:5px; border-radius:5px; transform-origin:50% 50%; `
          + `background:linear-gradient(90deg, ${C.glow}00, ${C.core}); box-shadow:0 0 8px ${C.glow}, 0 0 16px ${C.glow}99;`);
        run(b, [{opacity:1, transform:`translate(0,0) rotate(${da}deg)`},{opacity:1, transform:`translate(${ddx}px,${ddy}px) rotate(${da}deg)`}],
          {delay:t0, duration:FLIGHT, easing:'ease-in'});
      }
      // ③ 명중: 섬광 + 충격 링(마지막 탄은 더 크게)
      const last = i===shots-1;
      const hitAt = t0 + FLIGHT;
      const big = (last ? 1.25 : 0.8) * (kind==='omega' ? 1.5 : kind==='shield' ? 1.3 : 1);
      const f = mk(`left:${ex-32}px; top:${ey-32}px; width:64px; height:64px; border-radius:50%; `
        + `background:radial-gradient(circle, ${C.core} 0%, ${C.glow} 38%, ${C.edge} 72%);`);
      run(f, [{opacity:0, transform:'scale(.2)'},{opacity:1, transform:`scale(${big})`, offset:.35},{opacity:0, transform:`scale(${big*1.5})`}],
        {delay:hitAt, duration:230});
      const r = mk(`left:${ex-30}px; top:${ey-30}px; width:60px; height:60px; border-radius:50%; `
        + `border:${kind==='shield'?4:2}px solid ${C.core}; box-shadow:0 0 10px ${C.glow};`);
      run(r, [{opacity:.9, transform:'scale(.3)'},{opacity:0, transform:`scale(${big*2.1})`}],
        {delay:hitAt, duration:300, easing:'ease-out'});
    }
    // 적 몸이 맞는 반응(마지막 탄이 닿는 순간)
    setTimeout(()=>{ if(!battleOver) shakeEnemy(); }, Math.max(0, firstLaunch + (shots-1)*STAGGER + FLIGHT));
  }

  // 현재 배치된 장치 구성을 보고 사출 연출을 정한다(사용자 요청). 오메가
  // 유닛(#bt-rigomega, battleFlags.omegaRig)은 빔 대신 그 자리에서 폭발
  // 이미지가 바로 터지는 것으로 단순화했다. 일반 포탑(battleFlags.rig/rig2,
  // rigKind:'turret')은 그 포탑이 실제로 놓인 DOM 요소(#bt-rig1/#bt-rig2)
  // 위치에서 빔이 나간다. 아무 장치도 없으면(폭주 화부는 마스터리로 포탑
  // 없이도 압력이 쌓일 수 있다) 화면 왼쪽 아래 구석을 기본값으로 쓴다.
  function spawnOverloadJetBurst(){
    const hasOmega = !!(battleFlags && battleFlags.omegaRig && battleFlags.omegaRig.turnsLeft>0);
    if(hasOmega){
      spawnOverloadExplodeFx(document.getElementById('bt-rigomega'));
      return;
    }
    const rig2Active = !!(battleFlags && battleFlags.rig2 && battleFlags.rig2.turnsLeft>0);
    const rig1Active = !!(battleFlags && battleFlags.rig && battleFlags.rig.turnsLeft>0);
    // rig(왼쪽 슬롯)가 비어있고 rig2(오른쪽 슬롯)만 차 있는 드문 경우에만
    // 오른쪽에서 발사하고, 그 외(둘 다 있거나 둘 다 없거나)엔 왼쪽 기준.
    const fromRight = !rig1Active && rig2Active;
    const targetEl = document.getElementById(fromRight ? 'bt-rig2' : 'bt-rig1');
    spawnOverloadJetFx(fromRight, targetEl);
  }

  // 사기꾼 "이중주사위" 전용 연출(사용자 요청 — 나란히 굴러가는 주사위 2개).
  // 새 이미지 없이 주사위 글리프 2개를 짧게 무작위로 바꾸다(굴러가는 느낌)
  // 최종 눈에 멈춘다. 더블(같은 눈)이면 .double 클래스로 금색 펄스를 얹는다.
  // spawnFrostFlashFx()와 동일한 "생성 → setTimeout 제거" 수명주기.
  // 이중주사위 연출 타이밍: 70ms×N틱 굴린 뒤 눈이 확정되고, 잠시 보여준 다음
  // (RESOLVE_MS) player-actions.js가 공격 판정/피해를 실행한다.
  const DUAL_DICE_SPIN_TICKS = 10;
  const DUAL_DICE_RESOLVE_MS = 1000;
  function spawnDualDiceFx(face1, face2, isDouble){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    const el = document.createElement('div');
    el.className = 'dual-dice-fx';
    const d1 = document.createElement('span'); d1.className = 'die';
    const d2 = document.createElement('span'); d2.className = 'die';
    d1.textContent = FACES[Math.floor(Math.random()*6)];
    d2.textContent = FACES[Math.floor(Math.random()*6)];
    el.appendChild(d1); el.appendChild(d2);
    stage.appendChild(el);
    let ticks = 0;
    const spin = setInterval(()=>{
      d1.textContent = FACES[Math.floor(Math.random()*6)];
      d2.textContent = FACES[Math.floor(Math.random()*6)];
      ticks++;
      if(ticks>=DUAL_DICE_SPIN_TICKS){
        clearInterval(spin);
        d1.textContent = face1; d2.textContent = face2;
        if(isDouble) el.classList.add('double');
      }
    }, 70);
    setTimeout(()=>el.remove(), DUAL_DICE_RESOLVE_MS + 500);
  }

  // 황금 도박사 베팅/올인 코인토스 연출(사용자 제공 coin_spin_1/2, coin_heads,
  // coin_tails). 동전의 회전각(θ)을 rAF로 굴리며 각도에 맞는 프레임을 고른다:
  // 정면(앞/뒤) → 기울어진 면(spin_1, 뒷면 쪽은 좌우반전) → 옆면(spin_2) → …
  // 끝으로 갈수록 느려지다가(ease-out) 결과 면(성공=앞면 왕관, 실패=뒷면 해골)에
  // 정확히 멈춘다. 위치는 던져 올렸다 받는 포물선. 피해/배너는
  // COIN_TOSS_RESOLVE_MS 뒤에 player-actions.js가 실행한다(결과가 먼저 보이도록).
  const COIN_TOSS_SPIN_MS = 1000;
  const COIN_TOSS_RESOLVE_MS = 1400;
  function spawnCoinTossFx(success, big){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const size = big ? 240 : 180;
    const el = document.createElement('div');
    el.style.cssText = `position:absolute; left:50%; top:62%; width:${size}px; height:${size}px; `
      + "background-size:contain; background-repeat:no-repeat; background-position:center; "
      + "pointer-events:none; z-index:7; will-change:transform;";
    stage.appendChild(el);
    let cur = '';
    const show = (n, mirror)=>{
      if(n!==cur){ el.style.backgroundImage = `url('images/vfx/${n}.webp')`; cur = n; }
      return mirror ? -1 : 1;
    };
    // 앞면(θ=0)에서 출발해 짝수 반바퀴면 앞면, 홀수 반바퀴면 뒷면으로 끝난다.
    const halfTurns = success ? 8 : 9;
    const thetaEnd = halfTurns * Math.PI;
    const rise = size * 0.9;
    const t0 = performance.now();
    const frame = now=>{
      if(!el.isConnected) return;
      const t = Math.min(1, (now - t0) / COIN_TOSS_SPIN_MS);
      const th = thetaEnd * (1 - Math.pow(1 - t, 2.2));      // 감속하며 멈춤
      const c = Math.cos(th), a = Math.abs(c);
      let sx;
      if(a > 0.85)      sx = show(c > 0 ? 'coin_heads' : 'coin_tails', false);
      else if(a > 0.4)  sx = show('coin_spin_1', c < 0);
      else              sx = show('coin_spin_2', false);
      const y = -rise * 4 * t * (1 - t);                       // 포물선(위로 던져 받음)
      const sc = 0.85 + 0.25 * 4 * t * (1 - t);                // 정점에서 살짝 커짐
      el.style.opacity = String(Math.min(1, t * 8));
      el.style.transform = `translate(-50%,-50%) translateY(${y}px) scale(${sx*sc},${sc})`;
      if(t < 1) requestAnimationFrame(frame);
      else {
        show(success ? 'coin_heads' : 'coin_tails', false);
        el.style.transition = 'transform .2s cubic-bezier(.2,1.6,.4,1)';
        el.style.transform = 'translate(-50%,-50%) scale(1.15)';
        if(success && big && typeof shakeScreen==='function') shakeScreen(0.5);
      }
    };
    requestAnimationFrame(frame);
    setTimeout(()=>{
      el.style.transition = 'opacity .35s ease-in, transform .35s ease-in';
      el.style.opacity = '0';
      el.style.transform = `translate(-50%,-50%) scale(${success?1.35:0.85})`;
    }, COIN_TOSS_RESOLVE_MS + 250);
    setTimeout(()=>el.remove(), COIN_TOSS_RESOLVE_MS + 700);
  }

  // 체액 흡수(역병숙주 Lv10 액티브) 전용 연출(사용자 제공 venom_bite/venom_stream/
  // venom_absorb): ① 적 몸에 독액이 튀며 송곳니 자국이 남고 → ② 상처에서 독액
  // 줄기가 아래(플레이어 쪽)로 흘러내리고 → ③ 화면 아래쪽에서 독기 소용돌이가
  // 몸으로 빨려든다. 피해는 ①에 맞춰 바로 들어가고, 스택/공격력 흡수 메시지와 적
  // 턴은 연출이 끝나는 VENOM_DRAIN_RESOLVE_MS 뒤에 player-actions.js가 처리한다.
  // big=true(레벨15 완전 기생화)면 전부 크게/짙게 나온다.
  const VENOM_DRAIN_RESOLVE_MS = 1250;
  function spawnVenomDrainFx(big){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const H = stage.clientHeight || 300;
    const k = big ? 1.25 : 1;
    const mk = (img, css)=>{
      const el = document.createElement('div');
      el.style.cssText = "position:absolute; pointer-events:none; z-index:7; opacity:0; "
        + "background-size:contain; background-repeat:no-repeat; background-position:center; "
        + `background-image:url('images/vfx/${img}.webp'); ` + css;
      stage.appendChild(el);
      return el;
    };
    const after = (ms, fn)=>setTimeout(fn, ms);
    // ① 적 몸 타격
    const bite = mk('venom_bite', `left:50%; top:46%; width:${230*k}px; height:${230*k}px; transform:translate(-50%,-50%) scale(.4);`);
    void bite.offsetWidth;
    bite.style.transition = 'opacity .1s ease-out, transform .25s cubic-bezier(.2,1.4,.4,1)';
    bite.style.opacity = '1'; bite.style.transform = 'translate(-50%,-50%) scale(1)';
    after(450, ()=>{ bite.style.transition = 'opacity .35s ease-in'; bite.style.opacity = '0'; });
    // ② 독액 줄기: 적 중심에서 화면 아래로. 위에서 아래로 드러났다가(clip-path) 위쪽부터 사라진다.
    const sh = H * 0.62, sw = sh * (290/640) * (big?1.15:1);
    const stream = mk('venom_stream', `left:50%; top:46%; width:${sw}px; height:${sh}px; transform:translateX(-50%); clip-path:inset(0 0 100% 0);`);
    after(250, ()=>{
      stream.style.opacity = '1';
      stream.style.transition = 'clip-path .4s ease-in';
      stream.style.clipPath = 'inset(0 0 0% 0)';
    });
    after(760, ()=>{
      stream.style.transition = 'clip-path .4s ease-out, opacity .4s ease-out';
      stream.style.clipPath = 'inset(100% 0 0 0)';
      stream.style.opacity = '0';
    });
    // ③ 아래쪽에서 소용돌이가 회전하며 수축(빨려듦)
    const vs = 200*k;
    const vortex = mk('venom_absorb', `left:50%; top:${Math.round(H*0.9)}px; width:${vs}px; height:${vs}px; transform:translate(-50%,-50%) scale(.3) rotate(0deg);`);
    after(650, ()=>{
      vortex.style.transition = 'opacity .2s ease-out, transform .35s ease-out';
      vortex.style.opacity = '1'; vortex.style.transform = 'translate(-50%,-50%) scale(1.05) rotate(-120deg)';
    });
    after(1000, ()=>{
      vortex.style.transition = 'opacity .25s ease-in, transform .25s ease-in';
      vortex.style.opacity = '0'; vortex.style.transform = 'translate(-50%,-50%) scale(.2) rotate(-300deg)';
    });
    after(VENOM_DRAIN_RESOLVE_MS + 300, ()=>{ bite.remove(); stream.remove(); vortex.remove(); });
  }

  // 회랑의 기사 성휘참(Lv10): 사용자 제공 knight_holyrend — 적 몸 위에 곧게 그어지는
  // 금빛 참격. 이미지의 사선(좌하→우상)을 그대로 쓰되 무작위로 좌우 반전해 단조롭지
  // 않게 한다. 번쩍이며 나타났다가 살짝 커지며 사라진다.
  function spawnHolyRendFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    const flip = Math.random()<0.5 ? -1 : 1;
    el.style.cssText = "position:absolute; left:50%; top:46%; width:300px; height:300px; "
      + "background-image:url('images/vfx/knight_holyrend.webp'); background-size:contain; "
      + "background-repeat:no-repeat; background-position:center; pointer-events:none; z-index:7; "
      + `opacity:0; transform:translate(-50%,-50%) scale(${.6*flip},.6);`;
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.transition = 'opacity .08s ease-out, transform .2s cubic-bezier(.2,1.3,.4,1)';
    el.style.opacity = '1';
    el.style.transform = `translate(-50%,-50%) scale(${1*flip},1)`;
    setTimeout(()=>{
      el.style.transition = 'opacity .35s ease-in, transform .35s ease-in';
      el.style.opacity = '0';
      el.style.transform = `translate(-50%,-50%) scale(${1.15*flip},1.15)`;
    }, 300);
    setTimeout(()=>el.remove(), 750);
  }

  // 회랑의 기사 검은 기도(Lv12): 사용자 제공 knight_darkprayer — 금 간 검은 후광과
  // 붉은 어둠이 화면 아래(플레이어 쪽)에서 솟아오르며 커졌다가 사라진다.
  function spawnDarkPrayerFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const H = stage.clientHeight || 300;
    const h = Math.round(H*0.95), w = Math.round(h*795/1236);
    const el = document.createElement('div');
    el.style.cssText = `position:absolute; left:50%; top:${Math.round(H*0.55)}px; width:${w}px; height:${h}px; `
      + "background-image:url('images/vfx/knight_darkprayer.webp'); background-size:contain; "
      + "background-repeat:no-repeat; background-position:center; pointer-events:none; z-index:7; "
      + "opacity:0; transform:translate(-50%,-25%) scale(.6);";
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.transition = 'opacity .3s ease-out, transform .7s cubic-bezier(.2,.8,.3,1)';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1)';
    setTimeout(()=>{
      el.style.transition = 'opacity .5s ease-in, transform .5s ease-in';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%,-58%) scale(1.1)';
    }, 800);
    setTimeout(()=>el.remove(), 1400);
  }

  // 시간술사 가속 주문(Lv10): 사용자 제공 time_haste — 태엽 고리가 크게 나타나 회전하며
  // 빠르게 안쪽으로 쪼그라든다(시간 압축). 압축이 끝나는 순간 중심 섬광에서 피해가
  // 들어가는 느낌이라 살짝 화면을 흔든다. 적 턴을 건너뛰는 로직은 그대로다.
  function spawnTimeHasteFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.style.cssText = "position:absolute; left:50%; top:46%; width:190px; height:190px; "
      + "background-image:url('images/vfx/time_haste.webp'); background-size:contain; "
      + "background-repeat:no-repeat; background-position:center; pointer-events:none; z-index:7; "
      + "opacity:0; transform:translate(-50%,-50%) scale(1.6) rotate(-60deg);";
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.transition = 'opacity .12s ease-out, transform .32s cubic-bezier(.6,0,.9,.5)';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(.75) rotate(60deg)';
    setTimeout(()=>{
      if(typeof shakeScreen==='function') shakeScreen(0.35);
      el.style.transition = 'opacity .3s ease-in, transform .3s ease-out';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%,-50%) scale(1.05) rotate(70deg)';
    }, 330);
    setTimeout(()=>el.remove(), 800);
  }

  // 시간술사 시간 역행(Lv12): 사용자 제공 time_rewind — 화면 아래(플레이어 쪽)에서 시계판이
  // 반시계 방향으로 돌며 커졌다가 옅어진다. 회복(HP/MP 가득)은 기존 castBurst가 함께 맡는다.
  function spawnTimeRewindFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const H = stage.clientHeight || 300;
    const el = document.createElement('div');
    el.style.cssText = `position:absolute; left:50%; top:${Math.round(H*0.68)}px; width:260px; height:260px; `
      + "background-image:url('images/vfx/time_rewind.webp'); background-size:contain; "
      + "background-repeat:no-repeat; background-position:center; pointer-events:none; z-index:7; "
      + "opacity:0; transform:translate(-50%,-50%) scale(.6) rotate(0deg);";
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.transition = 'opacity .25s ease-out, transform 1s cubic-bezier(.25,.6,.3,1)';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1.1) rotate(-300deg)';
    setTimeout(()=>{
      el.style.transition = 'opacity .4s ease-in, transform .4s ease-in';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%,-50%) scale(1.25) rotate(-360deg)';
    }, 800);
    setTimeout(()=>el.remove(), 1300);
  }

  // 시간의 역설(시간술사 레벨15 궁극기) 전용 연출 — 사용자가 새로 준 24프레임
  // 루프형 스프라이트 시트(보라색 포탈, 256px 6x4 그리드)를 프레임 애니메이션
  // 으로 재생한다. 이번 시트는 원본 자체가 각 프레임 중심이 이미 거의 안 흔들
  // 렸지만(centroid 오차 ±3~4px 수준), 그래도 알파 채널 무게중심 기준으로
  // 자동 정렬해 프레임마다 살짝 남아있던 흔들림까지 제거했다(전처리 단계에서
  // 처리 — 여기 JS는 그 결과물을 그대로 재생만 한다). 재생 속도도 기존
  // 95ms/프레임에서 70ms/프레임으로 올렸다(24×70ms≈1.7초, 사용자 요청).
  function spawnTimeParadoxFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute; left:50%; top:42%; width:260px; height:260px; '
      + "background-image:url('images/vfx/time_paradox_f01.webp'); "
      + 'background-size:contain; background-repeat:no-repeat; background-position:center; '
      + 'pointer-events:none; z-index:7; transform:translate(-50%,-50%); '
      + 'opacity:0; transition:opacity .15s ease-out;';
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.opacity = '1';
    const frameCount = 24, frameMs = 70;
    let i = 1;
    const timer = setInterval(()=>{
      i++;
      if(i>frameCount){
        clearInterval(timer);
        // 마지막 프레임에서 잠깐 멈췄다가 옅어지며 사라진다.
        setTimeout(()=>{
          el.style.transition = 'opacity .5s ease-in';
          el.style.opacity = '0';
          setTimeout(()=>el.remove(), 550);
        }, 180);
        return;
      }
      el.style.backgroundImage = `url('images/vfx/time_paradox_f${String(i).padStart(2,'0')}.webp')`;
    }, frameMs);
  }

  // 운명 뒤바꾸기(사기꾼 Lv15) 전용 VFX 이미지(사용자 제공) — 저울이 뒤집히며
  // 회전하고 커졌다가 사라진다. 다른 이미지 VFX들과 같은 인라인 방식.
  function spawnFateSwapFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.style.cssText = "position:absolute; left:50%; top:44%; width:320px; height:320px; "
      + "background-image:url('images/vfx/fateswap_scale.webp'); background-size:contain; "
      + "background-repeat:no-repeat; background-position:center; pointer-events:none; z-index:7; "
      + "opacity:0; transform:translate(-50%,-50%) scale(0.7) rotate(-180deg);";
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.transition = 'opacity .25s ease-out, transform .45s cubic-bezier(.2,.8,.3,1)';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1.05) rotate(0deg)';
    setTimeout(()=>{
      el.style.transition = 'opacity .5s ease-in, transform .5s ease-in';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%,-50%) scale(1.2) rotate(0deg)';
    }, 650);
    setTimeout(()=>el.remove(), 1200);
  }

  // 칼리버 X: 종언 전용 VFX 이미지(사용자 제공). 명멸의 틈 페이드 때와 같은
  // 이유(클래스+키프레임 방식이 다른 CSS 규칙과 얽혀 안 먹혔던 전례)로,
  // 여기서도 인라인 스타일을 직접 타이밍대로 바꾸는 방식으로 구현한다 —
  // 클래스 기반보다 항상 우선 적용되어 다른 규칙과 부딪힐 여지가 없다.
  // 화면 전체 흔들림(사용자 요청 — 시간의 역설 발동 연출). 클래스+키프레임
  // 대신 인라인 스타일을 직접 여러 번 바꾸는 방식으로 구현한다(이 세션에서
  // 여러 번 겪은 것처럼, 클래스 기반 애니메이션이 다른 CSS 규칙과 얽혀
  // 안 먹혔던 전례가 있어 — 이 방식은 그럴 여지가 없다). 진폭이 점점
  // 줄어들다 원래 자리로 돌아온다, 총 길이 약 240ms.
  function shakeScreen(scale){
    const el = document.getElementById('screen-battle');
    if(!el) return;
    const k = scale==null ? 1 : scale;
    const offsets = [[-7,0],[7,-5],[-6,4],[5,-3],[-3,2],[2,-1],[0,0]].map(([x,y])=>[x*k,y*k]);
    let i = 0;
    (function step(){
      if(i>=offsets.length) return;
      const [x,y] = offsets[i];
      el.style.transform = `translate(${x}px, ${y}px)`;
      i++;
      setTimeout(step, 35);
    })();
  }

  function spawnCaliberXFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.style.cssText = "position:absolute; left:50%; top:42%; width:280px; height:280px; "
      + "background-image:url('images/vfx/caliberx_finale.webp'); background-size:contain; "
      + "background-repeat:no-repeat; background-position:center; pointer-events:none; z-index:7; "
      + "opacity:0; transform:translate(-50%,-50%) scale(0.7) rotate(-4deg);";
    stage.appendChild(el);
    void el.offsetWidth; // 강제 리플로우 — 초기 상태가 확실히 반영된 뒤에 전환 시작
    el.style.transition = 'opacity .22s ease-out, transform .22s ease-out';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1.08) rotate(2deg)';
    setTimeout(()=>{
      el.style.transition = 'opacity .4s ease-in, transform .4s ease-in';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%,-50%) scale(1.2) rotate(2deg)';
    }, 260);
    setTimeout(()=>el.remove(), 750);
  }

  // 혈옥쇄(혈맹의 검투사 Lv15) 전용 VFX 이미지(사용자 제공) — 중앙에 수직으로 꽂히는
  // 결정 폭발. (저돌은 찰나검사 슬래시의 핏빛 변주 v4를 재사용한다.)
  function spawnBloodUltimateFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.style.cssText = "position:absolute; left:50%; top:44%; width:340px; height:356px; "
      + "background-image:url('images/vfx/bloodpact_ultimate.webp'); background-size:contain; "
      + "background-repeat:no-repeat; background-position:center; pointer-events:none; z-index:7; "
      + "opacity:0; transform:translate(-50%,-62%) scale(0.75);";
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.transition = 'opacity .18s ease-out, transform .2s cubic-bezier(.2,.8,.3,1)';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1.06)';
    setTimeout(()=>{
      el.style.transition = 'opacity .5s ease-in, transform .5s ease-in';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%,-50%) scale(1.18)';
    }, 420);
    setTimeout(()=>el.remove(), 960);
  }

  // 순교자 심판의 빛(Lv10): 사용자 제공 martyr_judgment — 화면 위에서 적 몸까지 곧게
  // 내리꽂히는 성스러운 빛기둥. 위에서 아래로 드러난 뒤(clip-path) 잠깐 머물다
  // 사라진다. 이미지 하단의 착지 섬광이 적 중심(약 화면 절반 높이)에 오도록 맞춘다.
  function spawnMartyrJudgmentFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const H = stage.clientHeight || 300;
    const h = Math.round(H*0.62), w = Math.round(h*359/800);
    const el = document.createElement('div');
    el.style.cssText = `position:absolute; left:50%; top:0; width:${w}px; height:${h}px; `
      + "background-image:url('images/vfx/martyr_judgment.webp'); background-size:100% 100%; "
      + "background-repeat:no-repeat; pointer-events:none; z-index:7; "
      + "opacity:1; transform:translateX(-50%); clip-path:inset(0 0 100% 0);";
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.transition = 'clip-path .2s ease-in';
    el.style.clipPath = 'inset(0 0 0% 0)';
    setTimeout(()=>{
      el.style.transition = 'opacity .35s ease-out';
      el.style.opacity = '0';
    }, 420);
    setTimeout(()=>el.remove(), 850);
  }

  // 불멸의 순교(순교자 레벨15 궁극기) 전용 VFX 이미지(사용자 제공). 위와
  // 동일한 인라인 스타일 방식.
  function spawnMartyrFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.style.cssText = "position:absolute; left:50%; top:42%; width:280px; height:360px; "
      + "background-image:url('images/vfx/martyr_ultimate.webp'); background-size:contain; "
      + "background-repeat:no-repeat; background-position:center; pointer-events:none; z-index:7; "
      + "opacity:0; transform:translate(-50%,-50%) scale(0.7) rotate(-4deg);";
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.transition = 'opacity .22s ease-out, transform .22s ease-out';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1.08) rotate(2deg)';
    setTimeout(()=>{
      el.style.transition = 'opacity .45s ease-in, transform .45s ease-in';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%,-50%) scale(1.2) rotate(2deg)';
    }, 280);
    setTimeout(()=>el.remove(), 800);
  }

  // 저주술사 스킬 전용 VFX 이미지 3종(사용자 제공, curse_nova/curse_brand/
  // curse_bloom_ultimate). 위 칼리버X/순교 궁극기와 동일한 인라인 스타일
  // 방식이지만, 세 스킬의 위상(평범한 액티브 < 레벨12 스킬 < 레벨15 궁극기)에
  // 맞춰 크기·회전·잔류 시간을 점점 키웠다 — 사용자 요청("궁극기는 궁극기답게,
  // 아닌 스킬은 아닌 스킬답게").
  // 저주 폭발(mageCurseNova, 평범한 액티브): 가장 작고 회전/스케일 변화 없이
  // 짧게 반짝이고 사라진다.
  function spawnCurseNovaFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.style.cssText = "position:absolute; left:50%; top:42%; width:150px; height:150px; "
      + "background-image:url('images/vfx/curse_nova.webp'); background-size:contain; "
      + "background-repeat:no-repeat; background-position:center; pointer-events:none; z-index:7; "
      + "opacity:0; transform:translate(-50%,-50%) scale(0.85);";
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.transition = 'opacity .15s ease-out, transform .15s ease-out';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1)';
    setTimeout(()=>{
      el.style.transition = 'opacity .25s ease-in';
      el.style.opacity = '0';
    }, 180);
    setTimeout(()=>el.remove(), 450);
  }
  // 저주 각인(mageCurseBrand, 레벨12): 폭발보다 한 단계 크고 조금 더 오래
  // 남지만, 궁극기급 회전/스케일 플로리시는 주지 않는다(낙인을 "새기는"
  // 느낌이라 과장된 움직임 대신 살짝만 커지다 멈춘다).
  function spawnCurseBrandFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.style.cssText = "position:absolute; left:50%; top:42%; width:190px; height:190px; "
      + "background-image:url('images/vfx/curse_brand.webp'); background-size:contain; "
      + "background-repeat:no-repeat; background-position:center; pointer-events:none; z-index:7; "
      + "opacity:0; transform:translate(-50%,-50%) scale(0.8);";
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.transition = 'opacity .18s ease-out, transform .18s ease-out';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1.02)';
    setTimeout(()=>{
      el.style.transition = 'opacity .3s ease-in';
      el.style.opacity = '0';
    }, 260);
    setTimeout(()=>el.remove(), 580);
  }
  // 저주 만개(mageCurseBloom, 레벨15 궁극기): 칼리버X/순교와 동일한 급의
  // 궁극기 플로리시(가장 큰 사이즈+회전+스케일 오버슛+가장 긴 잔류)를 그대로 적용.
  function spawnCurseBloomFx(){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.style.cssText = "position:absolute; left:50%; top:42%; width:300px; height:300px; "
      + "background-image:url('images/vfx/curse_bloom_ultimate.webp'); background-size:contain; "
      + "background-repeat:no-repeat; background-position:center; pointer-events:none; z-index:7; "
      + "opacity:0; transform:translate(-50%,-50%) scale(0.7) rotate(-4deg);";
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.transition = 'opacity .22s ease-out, transform .22s ease-out';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1.08) rotate(2deg)';
    setTimeout(()=>{
      el.style.transition = 'opacity .45s ease-in, transform .45s ease-in';
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%,-50%) scale(1.2) rotate(2deg)';
    }, 280);
    setTimeout(()=>el.remove(), 800);
  }

  // 계약술사 원소 VFX(사용자 제공 images/vfx/<file>.webp). tier 1=원소 각인,
  // 2=원소 파동, 3=원소 폭풍(궁극기) — 저주술사 3종과 같은 위상 규칙(크기·잔류
  // 시간이 점점 커지고, 궁극기만 회전+스케일 오버슛). 빙결/번개 이미지도 파일명만
  // 넘기면 그대로 재사용된다.
  // dx/dy(px, 선택): 연타 스킬이 타마다 위치를 흩뿌릴 때 쓰는 중심 오프셋.
  function spawnPactFx(file, tier, dx, dy){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const C = [null,
      {size:150, inMs:150, holdMs:180, outMs:250, from:'scale(0.85)', to:'scale(1)', out:''},
      {size:190, inMs:180, holdMs:260, outMs:300, from:'scale(0.8)', to:'scale(1.02)', out:''},
      {size:300, inMs:220, holdMs:280, outMs:450, from:'scale(0.7) rotate(-4deg)', to:'scale(1.08) rotate(2deg)', out:'scale(1.2) rotate(2deg)'},
    ][tier];
    const el = document.createElement('div');
    el.style.cssText = "position:absolute; left:calc(50% + "+(dx||0)+"px); top:calc(42% + "+(dy||0)+"px); width:"+C.size+"px; height:"+C.size+"px; "
      + "background-image:url('images/vfx/"+file+".webp'); background-size:contain; "
      + "background-repeat:no-repeat; background-position:center; pointer-events:none; z-index:7; "
      + "opacity:0; transform:translate(-50%,-50%) "+C.from+";";
    stage.appendChild(el);
    void el.offsetWidth;
    el.style.transition = 'opacity '+C.inMs+'ms ease-out, transform '+C.inMs+'ms ease-out';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) '+C.to;
    setTimeout(()=>{
      el.style.transition = 'opacity '+C.outMs+'ms ease-in, transform '+C.outMs+'ms ease-in';
      el.style.opacity = '0';
      if(C.out) el.style.transform = 'translate(-50%,-50%) '+C.out;
    }, C.holdMs);
    setTimeout(()=>el.remove(), C.holdMs + C.outMs + 70);
  }

  // 시간의 파수꾼 스킬 전용 VFX 이미지(사용자 제공). kind: 'frost'|'void'|'returnstrike'.
  function spawnGuardianVfxImage(kind){
    const stage = document.getElementById('bt-stage');
    if(!stage) return;
    const el = document.createElement('div');
    el.className = 'tg-vfx-img ' + kind;
    stage.appendChild(el);
    setTimeout(()=>el.remove(), 900);
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
      el.style.display = 'none'; el.innerHTML = ''; el.classList.remove('rig-wide'); el.classList.remove('rig-top'); el.classList.remove('rig-shield'); el.classList.remove('rig-hover'); el.classList.remove('rig-necro');
      return;
    }
    // 강령술사 소환수(rig.monsterType이 있으면)는 몬스터 도감의 실제 이미지를
    // 그대로 재사용한다(svgMonster) — 기존 로봇 3종은 monsterType이 없으므로
    // svgRig(rig.kind) 그대로 유지된다.
    const visual = rig.monsterType ? svgMonster(rig.monsterType) : svgRig(rig.kind);
    el.innerHTML = visual + `<div class="rig-turns">${rig.turnsLeft}턴</div>`;
    el.style.display = 'block';
    el.classList.toggle('rig-necro', !!rig.monsterType);
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
    // 버그 수정(사용자 제보 — "게이지가 110이었는데 다음 턴에 갑자기 0이
    // 됐다"): 이 자동방출은 원래 1차 기관사 기본 트리를 위한 안전장치인데,
    // 전직 구분 없이 모든 기관사에게 걸려 있었다. 폭주 화부(mastery_overheat
    // 보유)는 정반대로 100을 일부러 넘겨 들고 있다가 임계 폭주로 직접
    // 터뜨리는 게 핵심 정체성이라(초과분 자해/보너스도 이미 자체적으로
    // 처리됨), 이 레거시 자동방출에서 제외한다.
    if(player.skills && player.skills.includes('mastery_overheat')) return;
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
  // 버그 수정(사용자 제보) — 폭주 압력(mastery_overheat) 보유 시 실제 상한은
  // 150인데 게이지 표시는 항상 "/100"으로 고정돼 있어 헷갈렸다. 이제 실제
  // 상한(getPressureCap())을 그대로 분모로 쓰고, 100 지점엔 항상 붉은 경계선을
  // 그어서 "여기부터는 초과분(자해+보너스) 구간"이라는 걸 시각적으로 구분한다.
  function updatePressureGauge(){
    const el = document.getElementById('bt-pressure');
    if(!el) return;
    // 강철 군단장(mechanic_accumulator 리뉴얼)은 압력 게이지를 아예 쓰지 않으므로
    // 다른 메카닉 특성과 달리 이 계기판 자체를 숨긴다.
    if(!player || player.job!=='mechanic' || player.specialization==='mechanic_accumulator' || !isBattleActive()){ el.style.display='none'; return; }
    const p = (battleFlags && battleFlags.pressure) || 0;
    const cap = (typeof getPressureCap==='function') ? getPressureCap() : 100;
    el.style.display = 'block';
    const label = document.getElementById('bt-pressure-label');
    const fill = document.getElementById('bt-pressure-fill');
    const mark = document.getElementById('bt-pressure-mark');
    if(label) label.textContent = `🔥 압력 ${p}/${cap}`;
    if(fill) fill.style.width = Math.min(100, Math.round(p/cap*100)) + '%';
    if(mark){
      if(cap>100){ mark.style.display='block'; mark.style.left = Math.round(100/cap*100) + '%'; }
      else mark.style.display = 'none';
    }
    el.classList.toggle('pressure-high', p>=70);
  }
  // 폭주 사출(mechanicOverloadDischarge) 전용 스파이크 연출 — 게이지가 순간
  // 확 밝아졌다 가라앉는다. combat/player-actions.js의 pressuresurge 핸들러가
  // 데미지 적용 직후 호출한다.
  function flashPressureGaugeSpike(){
    const el = document.getElementById('bt-pressure');
    if(!el) return;
    el.classList.remove('pressure-spike'); void el.offsetWidth; el.classList.add('pressure-spike');
  }

  // 역병숙주 전용 화면 전체 스모그(사용자 요청) — 잠식 스택(enemy.venomStacks)이
  // 상한(getVenomStackCap())에 가까워질수록 초록빛 비네트가 짙어진다.
  // renderStatus()(explore.js)가 상태 갱신 때마다 호출해준다. 최대치에서도
  // 불투명도 0.55로 캡을 걸어 텍스트 가독성을 해치지 않는 "은은한" 수준을
  // 유지한다(사용자 표현 그대로).
  function updateVenomSmog(){
    const el = document.getElementById('bt-venom-smog');
    if(!el) return;
    if(!player || player.specialization!=='rogue_alchemist' || !isBattleActive() || !enemy){
      el.style.setProperty('--smog-opacity', 0);
      return;
    }
    const cap = (typeof getVenomStackCap==='function') ? getVenomStackCap() : 10;
    const stacks = enemy.venomStacks||0;
    const ratio = cap>0 ? Math.min(1, stacks/cap) : 0;
    el.style.setProperty('--smog-opacity', (ratio*0.55).toFixed(2));
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
    // 강령술사(망령 소환사) 전용 소환수 슬롯 — 화면 하단, 플레이어 쪽 근처에
    // 배치(index.html/#bt-necropet, CSS로 별도 위치 지정. 기존 rig 슬롯들은
    // 전부 화면 위쪽(.rig-top)이라 이 슬롯만 레이아웃이 다르다).
    const slotNecro = document.getElementById('bt-necropet');
    if(slotNecro){
      const rN = (battleFlags && battleFlags.necroPet && battleFlags.necroPet.turnsLeft>0) ? battleFlags.necroPet : null;
      renderOneRigSlot(slotNecro, rN);
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

  // 장치 소환 입장 연출(사용자 요청 — 오메가 유닛 투입이 심심함). 배치
  // 코드가 updateRigVisuals()로 화면에 이미 그려 넣은 직후 한 번만 호출한다
  // (renderOneRigSlot 안에 넣으면 매 턴 재렌더링될 때마다 재생돼버림).
  function flashRigDeploy(slotKey){
    const id = slotKey==='rig' ? 'bt-rig1' : slotKey==='rig2' ? 'bt-rig2' : 'bt-rigomega';
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.remove('rig-deploy-in'); void el.offsetWidth; el.classList.add('rig-deploy-in');
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
    // 빙결/감전(사용자 요청 — 계약술사 원소계약/정예 특성 연동). 적 쪽은 기존
    // 배지와 동일하게 정적으로 표시하고, 플레이어 쪽(updatePlayerStatusBadges)만
    // 펄스 애니메이션으로 눈에 띄게 해 "누가 걸렸는지" 구분한다.
    if(enemy && enemy.freezeTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge freeze';
      b.textContent = `❄ 빙결 ${enemy.freezeTurns}턴`;
      box.appendChild(b);
    }
    if(enemy && enemy.shockSealTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge shock';
      b.textContent = `⚡ 감전(스킬봉인) ${enemy.shockSealTurns}턴`;
      box.appendChild(b);
    } else if(enemy && enemy.shockSpdTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge shock';
      b.textContent = `⚡ 감전(속도↓) ${enemy.shockSpdTurns}턴`;
      box.appendChild(b);
    }
    if(enemy && enemy.frostSpdTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge freeze';
      b.textContent = `❄ 결빙(속도↓) ${enemy.frostSpdTurns}턴`;
      box.appendChild(b);
    }
    // 역병중첩(역병숙주): enemy.venomStacks는 일반 dot(enemy.dots)과 별개로
    // 관리되는 영구 스택이라(턴이 지나도 안 사라짐) 위 dots 루프에는 안 걸린다 —
    // 여기서 따로 표시한다. "적 왼쪽 위"에 두 달라는 요청이 있었지만, 그 자리는
    // 이미 내 토글 상태 배지(#bt-player-status — 혈서/원소계약/시간조각)가 쓰고
    // 있어서 겹치므로, 기존에 "적 상태"를 보여주던 이 자리(오른쪽)에 넣었다.
    if(enemy && (enemy.venomStacks||0) > 0){
      const b = document.createElement('div');
      b.className = 'status-badge venom-stack';
      b.textContent = `☠ 역병중첩 ${enemy.venomStacks}/10`;
      box.appendChild(b);
    }
    // 정예 특성 "복수" 상태 뱃지(사용자 기획 — 정예 대비 체감 개선 세트
    // C안). 예고라기보단 "내가 방금 뭘 건드렸는지"를 명확히 보여주는 쪽 —
    // revengeArmed는 enemy-turn.js의 handleEliteOnHitTraits()가 내가 공격을
    // 적중시킬 때마다 세우고, getEffectiveEnemyAtk()가 다음 적 턴에 소비한다.
    if(enemy && enemy.revengeArmed){
      const b = document.createElement('div');
      b.className = 'status-badge expose';
      b.textContent = '⚡ 복수 태세 — 다음 피격 강화';
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
    const scr = document.getElementById('bt-stage');
    if(scr) scr.classList.toggle('blood-imprint', !!(battleFlags && battleFlags.bloodImprintArmed));
    // 빙결/감전(사용자 요청 — "적이 걸린 UI와 구분되는" 강조 UI). 이 두 개만
    // player-badge가 아니라 전용 클래스(cc-badge)를 써서 펄스 애니메이션이
    // 붙는다 — 나머지 토글 배지(혈서/원소계약 등)는 그대로 정적 유지.
    if(player.freezeTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge cc-badge freeze';
      b.textContent = `❄ 빙결! 행동 불가`;
      b.title = '이번 턴 아무것도 할 수 없다.';
      box.appendChild(b);
    }
    if(player.shockSealTurns>0){
      const b = document.createElement('div');
      b.className = 'status-badge cc-badge shock';
      b.textContent = `⚡ 감전! 스킬 봉인 ${player.shockSealTurns}턴`;
      b.title = '스킬을 쓸 수 없다. 기본 공격/아이템은 가능.';
      box.appendChild(b);
    }
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
    // 메아리 타격(warriorPuristEcho, 일격의 구도자): 연속 기본 공격 스택(최대 5,
    // 스택당 +10%). battleFlags.puristComboStacks가 0이면 표시하지 않는다.
    if(player.skills.includes('warriorPuristEcho') && battleFlags && (battleFlags.puristComboStacks||0) > 0){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      b.textContent = `⚔ 연속 타격 ${battleFlags.puristComboStacks}/5 (+${battleFlags.puristComboStacks*10}%)`;
      b.title = '기본 공격을 연속으로 낼수록 위력이 오른다. 방어하거나 아이템을 쓰면 초기화된다.';
      box.appendChild(b);
    }
    // 분신 배가(rogueDoubleImage, 환영검사): 다음 공격형 스킬 1회에만 적용되는
    // 1회성 예약 상태다(스택 없음 — 재설계로 지속 토글에서 1회성으로 바뀜).
    // player.doubleImageArmed에 저장되므로(lightningCritArmed/stealthDmgBonusArmed와
    // 동일한 패턴 — 전투 중 계속 유지되다가 소모될 때 꺼짐) battleFlags가 아니라
    // player를 확인한다.
    if(battleFlags && battleFlags.bloodImprintArmed){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      b.textContent = '🩸 선혈각인 대기중';
      b.title = '다음 피해 스킬 1회에 피해 +30%, 출혈, 추가 HP 소모(최대HP 15%)가 적용된다.';
      box.appendChild(b);
    }
    if(player.doubleImageArmed){
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      b.textContent = '👻 분신 배가 대기중';
      b.title = '다음 공격형 스킬을 쓰면 잔영이 두 번, 더 강하게 나타난다. 한 번 쓰면 소모된다.';
      box.appendChild(b);
    }
    // 흡수한 공격력(mastery_venomstacks, 역병숙주, 사용자 요청 — "얼마나
    // 흡수했는지 안 보인다") — 체액 흡수를 쓸 때마다 battleFlags.venomAbsorbPoints에
    // 쌓이는 값을 getVenomAbsorbBonus()와 똑같은 공식(1포인트=1%, 최대 +30%)으로
    // 그대로 보여준다. 0이면 표시 안 함(아직 한 번도 안 썼다는 뜻).
    if(player.skills.includes('mastery_venomstacks') && battleFlags && (battleFlags.venomAbsorbPoints||0) > 0){
      const absorbPct = Math.min(30, battleFlags.venomAbsorbPoints);
      const b = document.createElement('div');
      b.className = 'status-badge player-badge';
      b.textContent = `⚔ 흡수 +${absorbPct}%`;
      b.title = `체액 흡수로 빼앗은 공격력 — 이번 전투 동안 유지된다(최대 +30%).`;
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
      // 패시브/액티브 구분(사용자 요청) — 1각/2각 구분은 이미 테두리 색으로
      // 쓰고 있어서, 여기에 또 색을 얹으면 두 구분이 헷갈린다. 대신 아이콘 +
      // 옅은 배경의 텍스트 태그로 구분해 색상 축과 완전히 분리했다.
      const isPassive = sk.type==='passive';
      const kindTag = isPassive
        ? `<span class="skill-kind-tag passive">⚙ 패시브</span>`
        : `<span class="skill-kind-tag active">⚔ 액티브</span>`;
      // 간파(일격의 구도자 전용) — 전투 중 스킬 목록과 동일한 이름/설명
      // 바꿔치기를 상태창에도 적용(사용자 요청).
      let skName = sk.name, skDesc = sk.desc||'';
      if(k==='guard' && player.specialization==='warrior_purist'){
        skName = '간파';
        skDesc = '적의 공격을 꿰뚫어보고 되받아친다. 40% 확률로 공격을 완전히 무효화하며 그 자리에서 곧장 반격한다. 성공하면 메아리 타격 스택도 2개 즉시 쌓인다. 실패해도 방어 효과는 그대로 유지된다.';
      }
      return `<div class="shop-item" style="border-left:3px solid ${borderColor}; padding-left:8px;">
        <span class="si-info"><span class="si-name"><b>${skName}</b></span> ${kindTag}<br>
        <span style="font-size:12px; color:var(--parchment-dim);">${skDesc}</span></span>
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
          // 토글은 턴을 쓰지 않는 준비 동작 — 창을 닫지 않고 다시 그려 켜짐 상태만 갱신한다.
          btn.addEventListener('click', ()=>{ playerSkill(k); openSub('skill'); });
          row.appendChild(btn);
        });
        wrap.appendChild(row);
        sub.appendChild(wrap);
      }
      normalKeys.forEach(k=>{
        const s = SKILLDB[k];
        // 찰나검사(warrior_chalna): 예약 스킬은 이제 독립된 항목으로 렌더링하지
        // 않는다(사용자 요청 — 목록이 너무 길어짐). 대신 짝이 되는 즉시시전
        // 스킬 항목 오른쪽에 작은 "예약" 버튼으로 통합해서 붙인다.
        if(s.type==='chalnaReserve') return;
        const mpCost = s.mp;
        const cdLeft = (battleFlags && battleFlags.skillCooldowns && battleFlags.skillCooldowns[k]) || 0;
        // 사기꾼 "운명 뒤바꾸기"(hpswap)는 전투당 1회 제한(겹패 각인이 있으면
        // 2회) — 상한에 도달했으면 비활성화.
        const wIdDS2 = player.equipment && player.equipment.weapon;
        const hasDoubleSwap2 = !!(wIdDS2 && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdDS2).includes('ju_doubleswap'));
        const fateSwapMax2 = hasDoubleSwap2 ? 2 : 1;
        const usedOnce = s.type==='hpswap' && battleFlags && (battleFlags.fateSwapUsedCount||0) >= fateSwapMax2;
        const canUse = !usedOnce && player.mp>=mpCost && cdLeft<=0
          && !(s.type==='tpVerify' && !((battleFlags && battleFlags.timeClues)>=2));
        const div = document.createElement('div');
        const tierClsN = getSkillTier(k);
        div.className = 'sub-item'+(canUse?'':' disabled')+(tierClsN?' skill-tier'+tierClsN:'');
        // 찰나검사: 찰나가 대기 중이면 즉시시전 3항목은 실제로 눌렀을 때 나갈
        // 콤보의 이름/설명으로 표시를 바꿔치기한다(원래 스킬 이름 대신).
        let displayName = s.name, displayDesc = s.desc, displayHanja = s.hanja;
        if(s.type==='chalnaStrike' && battleFlags && battleFlags.chalnaReserve){
          const combo = CHALNA_COMBOS[[battleFlags.chalnaReserve.beat, s.beat].sort().join('+')];
          if(combo){ displayName = combo.name; displayDesc = combo.desc; displayHanja = combo.hanja; }
        }
        // 간파(일격의 구도자 전용, 사용자 제보 — "방어를 간파로 바꾸는 건
        // 안 했냐"): activeSkillId 없이 방어태세(guard, 전 직업 공용)에 전용
        // 효과만 얹은 구조라(data/jobs.js 주석 참고) 실제 시전 로직은 그대로
        // guard 타입을 타지만, 목록 표시만 이 직업일 때 "간파"로 바꿔친다.
        if(s.type==='guard' && player.specialization==='warrior_purist'){
          displayName = '간파';
          displayDesc = '적의 공격을 꿰뚫어보고 되받아친다. 40% 확률로 공격을 완전히 무효화하며 그 자리에서 곧장 반격한다. 성공하면 메아리 타격 스택도 2개 즉시 쌓인다. 실패해도 방어 효과는 그대로 유지된다.';
        }
        // 원혼의 명령(necroCommand, 원혼강탈자 레벨12): 계약 중인 소환수가
        // 보스(data/monsters.js의 BOSS_SIGNATURE_SKILLS에 등록된 종류)면
        // 실제로 나갈 보스 스킬 이름 그대로, 일반 몬스터면 그 몬스터가 가진
        // 특성 태그를 이름처럼 이어붙여(NECRO_TRAIT_SKILL_NAMES) 보여준다
        // (사용자 요청 — player-actions.js의 necroCommand 분기와 이름을
        // 일치시킴). 특성이 하나도 없는 몬스터(슬라임 등)는 재현할 게 없어
        // 기존 이름("원혼의 명령") 그대로 둔다.
        if(s.type==='necroCommand' && battleFlags && battleFlags.necroPet){
          const petType = battleFlags.necroPet.monsterType;
          const petSig = (typeof BOSS_SIGNATURE_SKILLS!=='undefined') ? BOSS_SIGNATURE_SKILLS[petType] : null;
          if(petSig){
            displayName = petSig.label;
            displayDesc = `${battleFlags.necroPet.name}에게 명령해, 보스 본체와 같은 ${petSig.label}을(를) 그대로 재현한다.`;
          } else if(typeof NECRO_TRAIT_SKILL_NAMES!=='undefined' && battleFlags.necroPet.skills && battleFlags.necroPet.skills.length){
            const traitName = battleFlags.necroPet.skills.map(t=>NECRO_TRAIT_SKILL_NAMES[t]).filter(Boolean).join('·');
            if(traitName){
              displayName = traitName;
              displayDesc = `${battleFlags.necroPet.name}에게 명령해, ${traitName}을(를) 확실하게 발동시킨다.`;
            }
          }
        }
        // 타임패트롤 스킬은 설명 끝에 현재 단서 수를 붙여 보여준다.
        if(s.type==='tpReceive' || s.type==='tpVerify' || s.type==='tpLockdown'){
          displayDesc += ` [단서 ${(battleFlags && battleFlags.timeClues)||0}/${TP_MAX_CLUES}]`;
        }
        // 2차 전직(찰나검사 등) 스킬에 한해 이름 옆에 한자를 괄호로 병기(사용자 요청).
        if(displayHanja) displayName = `${displayName}(${displayHanja})`;
        // 찰나검사 예약 버튼 — 짝이 되는 예약 스킬 키는 이름 규칙(XxxStrike ↔
        // XxxReserve)으로 바로 유도한다. 이미 찰나가 대기 중이면(한 번에 하나만
        // 걸 수 있으므로) 버튼 자체를 렌더링하지 않는다.
        let reserveBtnHtml = '';
        let reserveKey = null;
        if(s.type==='chalnaStrike' && !(battleFlags && battleFlags.chalnaReserve)){
          const candidateKey = k.replace('Strike','Reserve');
          if(SKILLDB[candidateKey] && player.skills.includes(candidateKey)){
            reserveKey = candidateKey;
            reserveBtnHtml = `<button class="chalna-reserve-btn" data-reserve="${reserveKey}">⏱ 예약</button>`;
          }
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
        // 패시브/액티브 구분(사용자 요청 — 상태창뿐 아니라 전투 중 스킬
        // 목록에도 동일하게 적용). 여기도 1각/2각 테두리 색(skill-tier1/2)과
        // 겹치지 않도록 색 대신 아이콘+무채색 태그를 쓴다(상태창의
        // .skill-kind-tag와 완전히 동일한 스타일 재사용).
        const kindTagN = s.type==='passive'
          ? `<span class="skill-kind-tag passive">⚙ 패시브</span>`
          : `<span class="skill-kind-tag active">⚔ 액티브</span>`;
        div.innerHTML = `<div class="si-info"><div class="si-name">${displayName} ${kindTagN}</div><div class="si-desc">${displayDesc}</div>${extraInfo}</div><div class="si-cost">${costBadge}</div>${reserveBtnHtml}`;
        if(canUse) div.addEventListener('click', ()=>{ closeSub(); playerSkill(k); });
        if(reserveKey){
          const rBtn = div.querySelector('.chalna-reserve-btn');
          if(rBtn && canUse){
            rBtn.addEventListener('click', (e)=>{ e.stopPropagation(); closeSub(); playerSkill(reserveKey); });
          } else if(rBtn){
            rBtn.disabled = true;
          }
        }
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

// VFX 이미지 프리로드(사용자 피드백 — "게임 처음 첫 전투에서 VFX가 안 보일 때가
// 있다"). 이 이미지들은 스킬을 처음 쓰는 순간에야 브라우저가 다운로드를 시작해서,
// 큰 PNG(약 17MB)는 이펙트가 끝난 뒤에야 도착하곤 했다. 파일 로드 시점(타이틀
// 화면부터)에 미리 받고 디코딩까지 끝내둔다. 새 VFX 이미지를 추가하면 여기에도
// 파일명을 추가할 것.
(function preloadVfxImages(){
  const names = [
    'caliberx_finale','chalna_figure_1','chalna_figure_2','chalna_figure_3',
    'curse_bloom_ultimate','curse_brand','curse_nova','martyr_ultimate',
    'bloodpact_ultimate','fateswap_scale','coin_spin_1','coin_spin_2','coin_heads','coin_tails','venom_bite','venom_stream','venom_absorb','knight_holyrend','knight_darkprayer','martyr_judgment','time_haste','time_rewind','overload_explode','overload_jet','phantom_slash','slash_ice',
    'tg_frost','tg_return','tg_void','pact_fire_strike','pact_fire_wave','pact_fire_storm','pact_ice_strike','pact_ice_wave','pact_ice_storm','pact_lightning_strike','pact_lightning_wave','pact_lightning_storm','necro_release','necro_sig_watchertablet','necro_sig_hornedwarden','necro_sig_bladedbloom','necro_sig_clockheart','necro_sig_hollowprophet',
  ];
  for(let i=1;i<=24;i++) names.push('time_paradox_f'+String(i).padStart(2,'0'));
  names.forEach(n=>{
    const img = new Image();
    img.src = 'images/vfx/'+n+'.webp';
    if(img.decode) img.decode().catch(()=>{});
  });
})();
