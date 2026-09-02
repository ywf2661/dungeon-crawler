"use strict";
/*
게임 전역 상태 변수 선언 + 타이틀 화면의 직업 선택 렌더.
다른 거의 모든 모듈이 이 파일의 전역 변수(player, enemy, depth, town 등)를 참조/변경한다.
반드시 JOBS(data/jobs.js) 로드 이후, 그리고 대부분의 로직 파일보다 먼저 로드되어야 한다.
export(전역): player, enemy, depth, town, log, battleOver, subMode, battleFlags,
              inBossDen, bossDenFloor, selectedJobId, renderJobSelect
의존성: JOBS (data/jobs.js)
주의: 사용자 요청으로 도박사(jester)/메카닉(mechanic) 두 직업을 "admin" 이름으로만
     선택 가능하게 잠갔다(플레이 완성도가 아직 부족하다고 판단 — 실제 게임 밸런스
     문제와는 별개로 임시 비공개 처리). renderJobSelect()가 #name-input의 현재
     값을 확인해 "admin"이 아니면 두 카드를 잠금 표시하고 클릭을 막는다. 이름
     입력칸에 input 이벤트를 걸어, 타이핑 중에도 실시간으로 잠금/해제가 반영된다.
*/

  /* ============ 게임 상태 ============ */
  let player, enemy, depth, town, log, battleOver, subMode, battleFlags;
  let inBossDen, bossDenFloor;
  let selectedJobId = 'warrior';

  // admin 전용 직업 목록. 여기 넣은 id는 이름이 정확히 "admin"(대소문자 무관)일
  // 때만 선택할 수 있다. 다른 직업을 추가로 잠그고 싶으면 이 배열에 id만 추가하면 된다.
  // (사용자 요청) 메카닉은 압력 게이지 시스템으로 리뉴얼 완료되어 잠금 해제.
  // 도박사도 1차/2차 스킬 리뉴얼이 끝나 잠금 해제되었다(2026-09-02).
  const ADMIN_ONLY_JOB_IDS = [];

  function isAdminNameEntered(){
    const input = document.getElementById('name-input');
    const raw = input ? input.value.trim().toLowerCase() : '';
    return raw === 'admin';
  }

  function renderJobSelect(){
    const wrap = document.getElementById('job-select');
    const adminUnlocked = isAdminNameEntered();
    // 현재 선택된 직업이 잠긴 상태로 바뀌었다면(예: admin이라고 쳤다가 지운 경우)
    // 시작 시 잠긴 직업으로 게임이 시작되는 사고를 막기 위해 기본 직업으로 되돌린다.
    if(!adminUnlocked && ADMIN_ONLY_JOB_IDS.includes(selectedJobId)){
      selectedJobId = (JOBS.find(j=>!ADMIN_ONLY_JOB_IDS.includes(j.id)) || JOBS[0]).id;
    }
    wrap.innerHTML = JOBS.map(j=>{
      const locked = ADMIN_ONLY_JOB_IDS.includes(j.id) && !adminUnlocked;
      return `
      <div class="job-card${j.id===selectedJobId?' selected':''}${locked?' locked':''}" data-job="${j.id}" data-locked="${locked}">
        <div class="ji-icon">${locked?'🔒':j.icon}</div>
        <div class="ji-name">${j.name}</div>
        <div class="ji-desc">${locked?'준비 중인 직업입니다.':j.desc}</div>
      </div>
    `;
    }).join('');
    wrap.querySelectorAll('.job-card').forEach(c=>{
      c.addEventListener('click', ()=>{
        if(c.dataset.locked === 'true') return;
        selectedJobId = c.dataset.job;
        renderJobSelect();
      });
    });
  }

  // 이름 입력칸을 타이핑하는 즉시 admin 잠금 상태가 갱신되게 한다. 이 스크립트는
  // body 하단에서 로드되므로, 이 시점엔 이미 #name-input이 DOM에 존재한다.
  const __nameInputForLock = document.getElementById('name-input');
  if(__nameInputForLock) __nameInputForLock.addEventListener('input', renderJobSelect);
