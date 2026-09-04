"use strict";
/*
난이도 선택 데이터 및 UI 렌더.
export(전역): DIFFICULTIES, selectedDifficulty, normalUnlocked, hardcoreUnlocked,
              easyFlawless, normalFlawless, hardcoreFlawless, isDifficultyUnlocked,
              isDifficultyFlawless, showToast, renderDifficultySelect
의존성: 없음(단, showToast는 다른 여러 모듈에서 범용 토스트 함수로 재사용됨)
*/

  /* ============ 난이도 ============
     쉬움: 항상 해금. 지금까지의 기본 난이도와 동일.
     보통: 클리어(엔딩) 기록이 하나라도 있으면 해금. 도망 불가, 몬스터가 소폭 강화.
     하드코어: "보통" 난이도로 클리어한 기록이 있으면 해금. 도망 불가, 몬스터가 더 강화되고
               사망 시 마을로 돌아가는 대신 레벨 1·1층부터 다시 시작한다.
               대신 유물 슬롯을 4개까지 지닐 수 있다. */
  const DIFFICULTIES = [
    {id:'easy',     name:'쉬움',     desc:'회랑을 처음 밟는 이들을 위한 기본 난이도.'},
    {id:'normal',   name:'보통',     desc:'도망칠 수 없다. 적들도 한층 거세진다.'},
    {id:'hardcore', name:'하드코어', desc:'도망칠 수 없고, 쓰러지면 레벨 1·1층부터 다시 시작한다. 대신 유물을 4개까지 지닐 수 있다.'},
  ];
  let selectedDifficulty = 'easy';
  let normalUnlocked = false;
  let hardcoreUnlocked = false;
  // 죽지 않고 진 최종보스(무결 엔딩)를 본 적이 있는 난이도인지 — 난이도별로 따로 기록된다.
  // bootstrap.js가 기록(records)을 불러온 뒤 계산해서 여기에 채워 넣는다.
  let easyFlawless = false;
  let normalFlawless = false;
  let hardcoreFlawless = false;

  function isDifficultyUnlocked(id){
    if(id==='easy') return true;
    // admin/admin2/admin3 테스트 계정은 이름을 입력하는 즉시 보통/하드코어가
    // 해금된 것처럼 취급한다(사용자 요청 — 매번 기록을 쌓아 해금할 필요 없이
    // 바로 테스트할 수 있게). state.js의 isAdminNameEntered()를 그대로 재사용.
    if((id==='normal' || id==='hardcore') && typeof isAdminNameEntered==='function' && isAdminNameEntered()) return true;
    if(id==='normal') return normalUnlocked;
    if(id==='hardcore') return hardcoreUnlocked;
    return false;
  }
  function isDifficultyFlawless(id){
    if(id==='easy') return easyFlawless;
    if(id==='normal') return normalFlawless;
    if(id==='hardcore') return hardcoreFlawless;
    return false;
  }
  // 토스트 겹침 버그 수정(사용자 제보) — 예전엔 showToast()를 연달아 부르면
  // (예: 정예 몬스터 조우 시 불확실성의 주사위+조작된 도박판+계율+정예 특성이
  // 한꺼번에 뜰 수 있음) 전부 화면 정중앙에 동시에 겹쳐 그려져서 뒤에 뜬
  // 토스트에 앞엣것들이 가려 무슨 내용인지 읽을 수가 없었다. 이제 큐에 쌓아
  // 하나씩 순서대로(각각 1.8초) 보여준다 — 호출부(showToast(...))는 그대로
  // 두고 이 함수 내부만 큐잉하도록 바꿔서 다른 파일은 손댈 필요가 없다.
  let toastQueue = [];
  let toastShowing = false;
  function showToast(html, borderColor){
    toastQueue.push({html, borderColor});
    processToastQueue();
  }
  function processToastQueue(){
    if(toastShowing || toastQueue.length===0) return;
    toastShowing = true;
    const {html, borderColor} = toastQueue.shift();
    const t = document.createElement('div');
    t.className = 'toast';
    if(borderColor) t.style.borderColor = borderColor;
    t.innerHTML = html;
    document.getElementById('app').appendChild(t);
    setTimeout(()=>{
      t.remove();
      toastShowing = false;
      processToastQueue();
    }, 1800);
  }
  function renderDifficultySelect(){
    const wrap = document.getElementById('difficulty-select');
    if(!wrap) return;
    wrap.innerHTML = DIFFICULTIES.map(d=>{
      const unlocked = isDifficultyUnlocked(d.id);
      const flawless = isDifficultyFlawless(d.id);
      const flawlessMark = flawless ? `<span class="di-flawless" title="이 난이도에서 한 번도 쓰러지지 않고 진 최종보스를 물리쳤다">👑</span> ` : '';
      return `<div class="diff-card type-${d.id}${d.id===selectedDifficulty?' selected':''}${unlocked?'':' locked'}${flawless?' flawless':''}" data-diff="${d.id}">
        <div class="di-name">${unlocked?'':'🔒 '}${flawlessMark}${d.name}</div>
        <div class="di-desc">${d.desc}</div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('.diff-card').forEach(c=>{
      c.addEventListener('click', ()=>{
        const id = c.dataset.diff;
        if(!isDifficultyUnlocked(id)){
          const d = DIFFICULTIES.find(x=>x.id===id);
          showToast(`<h3>🔒 잠김</h3><p>${d.name} 난이도는 아직 해금되지 않았습니다.</p>`, '#ff6a5a');
          return;
        }
        selectedDifficulty = id;
        renderDifficultySelect();
      });
    });
  }
