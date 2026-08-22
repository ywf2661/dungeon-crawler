"use strict";
/*
게임 전역 상태 변수 선언 + 타이틀 화면의 직업 선택 렌더.
다른 거의 모든 모듈이 이 파일의 전역 변수(player, enemy, depth, town 등)를 참조/변경한다.
반드시 JOBS(data/jobs.js) 로드 이후, 그리고 대부분의 로직 파일보다 먼저 로드되어야 한다.
export(전역): player, enemy, depth, town, log, battleOver, subMode, battleFlags,
              inBossDen, bossDenFloor, selectedJobId, renderJobSelect
의존성: JOBS (data/jobs.js)
*/

  /* ============ 게임 상태 ============ */
  let player, enemy, depth, town, log, battleOver, subMode, battleFlags;
  let inBossDen, bossDenFloor;
  let selectedJobId = 'warrior';

  function renderJobSelect(){
    const wrap = document.getElementById('job-select');
    wrap.innerHTML = JOBS.map(j=>`
      <div class="job-card${j.id===selectedJobId?' selected':''}" data-job="${j.id}">
        <div class="ji-icon">${j.icon}</div>
        <div class="ji-name">${j.name}</div>
        <div class="ji-desc">${j.desc}</div>
      </div>
    `).join('');
    wrap.querySelectorAll('.job-card').forEach(c=>{
      c.addEventListener('click', ()=>{
        selectedJobId = c.dataset.job;
        renderJobSelect();
      });
    });
  }

