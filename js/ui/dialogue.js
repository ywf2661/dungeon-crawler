"use strict";
/*
공용 "대화 팝업" 시퀀스 컴포넌트(사용자 요청 — 오프닝 설문/최종층 진입/엔딩을
그냥 화면에 텍스트 뭉치로 뿌리는 대신, 한 줄씩 페이드인/페이드아웃되는 모달
팝업으로 대화하듯 보여주기 위함).
export(전역): showDialogueSequence
의존성: index.html의 .dialogue-overlay/.dialogue-box류 CSS(페이드 애니메이션)

사용법:
  showDialogueSequence(['대사1', '대사2', ...], {
    title: '문지기',           // 선택. 팝업 상단에 작은 라벨(없으면 생략)
    tone: 'default'|'grand',   // 'grand'면 대사 간 페이드 시간이 더 길다(진엔딩 등 장엄한 연출용)
    onDone: ()=>{ ... },       // 마지막 대사를 탭해서 넘긴 뒤 호출
  });
클릭/탭으로 다음 대사로 넘어간다(자동 진행 없음 — 사용자 페이스를 존중).
lines가 비어 있으면 즉시 onDone()만 호출하고 아무것도 띄우지 않는다.
*/
  function showDialogueSequence(lines, opts){
    opts = opts || {};
    if(!lines || !lines.length){
      if(typeof opts.onDone==='function') opts.onDone();
      return;
    }
    const grand = opts.tone === 'grand';
    const fadeOutMs = grand ? 550 : 260;
    let idx = 0;

    const overlay = document.createElement('div');
    overlay.className = 'dialogue-overlay';
    const box = document.createElement('div');
    box.className = 'dialogue-box' + (grand ? ' dialogue-grand' : '');
    overlay.appendChild(box);
    document.getElementById('app').appendChild(overlay);

    function renderLine(){
      const titleHtml = opts.title ? `<div class="dialogue-title">${opts.title}</div>` : '';
      box.innerHTML = `${titleHtml}<p class="dialogue-line">${lines[idx]}</p><div class="dialogue-hint">▼ 탭하여 계속</div>`;
      idx++;
      box.classList.remove('fade-out');
      // 리플로우를 강제해 같은 클래스를 다시 넣어도 애니메이션이 재시작되게 한다.
      void box.offsetWidth;
      box.classList.add('fade-in');
    }
    function advance(){
      if(idx >= lines.length){
        overlay.remove();
        if(typeof opts.onDone==='function') opts.onDone();
        return;
      }
      box.classList.remove('fade-in');
      box.classList.add('fade-out');
      setTimeout(renderLine, fadeOutMs);
    }
    overlay.addEventListener('click', advance);
    renderLine(); // 첫 대사는 곧바로 페이드인
  }
