"use strict";
/*
난이도 선택 데이터 및 UI 렌더.
export(전역): DIFFICULTIES, selectedDifficulty, normalUnlocked, hardcoreUnlocked,
              isDifficultyUnlocked, showToast, renderDifficultySelect
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

  function isDifficultyUnlocked(id){
    if(id==='easy') return true;
    if(id==='normal') return normalUnlocked;
    if(id==='hardcore') return hardcoreUnlocked;
    return false;
  }
  function showToast(html, borderColor){
    const t = document.createElement('div');
    t.className = 'toast';
    if(borderColor) t.style.borderColor = borderColor;
    t.innerHTML = html;
    document.getElementById('app').appendChild(t);
    setTimeout(()=>t.remove(), 1800);
  }
  function renderDifficultySelect(){
    const wrap = document.getElementById('difficulty-select');
    if(!wrap) return;
    wrap.innerHTML = DIFFICULTIES.map(d=>{
      const unlocked = isDifficultyUnlocked(d.id);
      return `<div class="diff-card type-${d.id}${d.id===selectedDifficulty?' selected':''}${unlocked?'':' locked'}" data-diff="${d.id}">
        <div class="di-name">${unlocked?'':'🔒 '}${d.name}</div>
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

