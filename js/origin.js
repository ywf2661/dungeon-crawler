"use strict";
/*
오프닝 심리테스트 — 신규 캐릭터 생성 직후, 마을 진입 전 1회 등장한다(이어하기는
해당 없음). 두 질문으로 캐릭터의 "기원"을 정하고, 각 선택마다 작은 영구 보너스
(사용자 확정 8%, 체감은 되지만 게임을 쉽게 만들 정도는 아닌 수준)를 부여한다.
1번 질문(동기 — 황금/진실/생존)은 오프닝 스토리 텍스트까지 함께 결정하고,
2번 질문(기질 — 완력/신속/정신력)은 보너스만 조용히 준다.
export(전역): showOriginQuiz
의존성: player(state.js), Sound(sound.js), explore.js(showScreen/finishNewGameStart)
주의: 실제 보너스 수치 반영은 이 파일이 아니라 combat/battle-end.js(레벨업 성장치,
     경험치, 승리 골드 계산식)에서 player.originBonuses를 확인해 처리한다 — 이
     파일은 오직 "질문 → 선택 → 저장 → finishNewGameStart() 호출"만 담당한다.
*/

  const ORIGIN_Q1 = {
    question: '어둠의 회랑 앞에 선 그대에게, 문지기가 묻는다.\n"그대는 무엇을 위해 이 문턱을 넘으려 하는가?"',
    options: [
      {key:'gold', text:'"부(富)를 위해서요. 이 저주받은 삶에서 벗어날 유일한 길이니까."'},
      {key:'truth', text:'"알아야 할 것이 있소. 이 회랑이 감추고 있는 진실을."'},
      {key:'survival', text:'"...살아남기 위해서. 그 외의 이유는 필요치 않소."'},
    ],
  };
  const ORIGIN_Q2 = {
    question: '문지기가 다시 묻는다.\n"그대는 스스로를 어떻게 벼려왔는가?"',
    options: [
      {key:'strength', text:'"오직 완력으로. 힘이 없는 자에게 정의는 없소."'},
      {key:'swiftness', text:'"재빠름으로. 먼저 움직이는 자만이 살아남소."'},
      {key:'spirit', text:'"인내와 정신으로. 몸이 아니라 의지가 나를 지켜왔소."'},
    ],
  };

  // 선택지별 문지기의 짧은 반응 대사(사용자 요청 — 설문조사 다양화). 답변
  // 직후 showDialogueSequence()로 한 번씩 보여준 뒤 다음 단계로 넘어간다.
  const ORIGIN_Q1_REACTIONS = {
    gold: '문지기가 나직이 웃는다.\n"부(富)라... 흔한 대답이다. 하나 흔하다고 틀린 것은 아니지."',
    truth: '문지기의 눈빛이 잠시 흔들린다.\n"진실이라... 오랜만에 듣는 대답이군."',
    survival: '문지기가 천천히 고개를 끄덕인다.\n"생존... 그것이야말로 가장 정직한 이유겠지."',
  };
  const ORIGIN_Q2_REACTIONS = {
    strength: '"완력이라. 이 회랑은 힘없는 자에게 자비를 베풀지 않는다."',
    swiftness: '"재빠름이라... 나쁘지 않지. 다만 이 회랑에서는, 빠른 자가 먼저 함정을 밟기도 한다."',
    spirit: '"정신력이라... 이 회랑은 몸보다 마음을 먼저 부러뜨리려 든다는 걸, 곧 알게 될 것이다."',
  };

  const ORIGIN_STORIES = {
    gold: [
      '오랫동안 떠돌던 소문이 있었다.',
      '이 땅 깊은 곳, 어둠의 회랑에 태고의 황금이 잠들어 있다는 이야기였다.',
      '누군가는 헛소리라 했고, 누군가는 그 말 하나에 목숨을 걸었다.',
      '그대는 오랫동안 굶주려온 자였다. 동전 한 닢에도 손이 떨리던 시절을 기억한다.',
      '이유는 결국 하나로 모였다 — 황금이 그대를 이 지긋지긋한 삶에서 건져올리리라는 확신.',
      '그 확신 하나로, 그대는 마침내 회랑의 입구 앞에 섰다.',
      '등 뒤로 익숙한 삶이 멀어지고, 이제 어둠과 부(富)의 갈림길만이 남았다.',
      '횃불 하나를 손에 쥔 채, 그대는 첫걸음을 내디딘다.',
    ],
    truth: [
      '누구도 이 회랑에 대해 제대로 아는 자가 없었다.',
      '들어간 자는 많았으나 돌아온 자는 손에 꼽았고, 그나마도 온전한 정신으로 돌아온 이는 없었다.',
      '그대는 그것이 이상하다고 생각한 유일한 사람이었다.',
      '반복되는 소문, 지워진 기록, 침묵하는 생존자들 — 단순한 던전이라기엔 너무 많은 것이 감춰져 있었다.',
      '학자로서든 방랑자로서든, 그대는 답을 모르고는 견딜 수 없는 성미였다.',
      '진실은 언제나 가장 어두운 곳에 묻혀 있다고 믿었다.',
      '그래서 그대는 등불을 준비하는 대신, 질문을 준비했다.',
      '회랑의 입구에 선 지금, 그 질문들이 하나씩 대답을 받을 것이다 — 설령 그 대답이 그대를 집어삼킬지라도.',
    ],
    survival: [
      '그대에게 선택의 여지는 많지 않았다.',
      '위에서는 이미 살아갈 곳이 없었다 — 빚이든, 죄든, 혹은 그저 운이 다한 삶이든.',
      '어둠의 회랑은 마지막으로 남은 길이었다. 앞으로 나아가거나, 그 자리에서 스러지거나.',
      '그대는 살아남는 법을 몸으로 배워온 사람이었다. 화려한 명분 따위는 필요치 않았다.',
      '숨을 쉬고, 다음 순간을 맞이하는 것 — 그것만이 유일한 목표였다.',
      '회랑 안에 무엇이 기다리고 있는지는 중요치 않았다.',
      '중요한 건 오직, 그것을 뚫고 살아서 나가는 것뿐이었다.',
      '그대는 낡은 무기를 고쳐 쥐고, 어둠을 향해 걸음을 옮긴다 — 이번에도, 반드시 살아남을 것이다.',
    ],
  };

  // 실제 화면에는 표시하지 않는다(사용자 요청 — "이게 뭔가 싶어야 한다", 정확한
  // 수치를 알려주면 신비로움이 깨짐). combat/battle-end.js에서 실제 수치를 어떻게
  // 적용하는지 찾아볼 때 참고하는 개발자용 문서 역할만 한다.
  const ORIGIN_BONUS_LABEL = {
    gold: '전투 승리 시 골드 획득 +8%',
    truth: '경험치 획득 +8%',
    survival: '레벨업 시 최대HP 상승량 +8%',
    strength: '레벨업 시 공격력 상승량 +8%',
    swiftness: '레벨업 시 속도 상승량 +8%',
    spirit: '레벨업 시 최대MP 상승량 +8%',
  };

  let originAnswers = {q1:null, q2:null};

  function showOriginQuiz(){
    originAnswers = {q1:null, q2:null};
    renderOriginStep('q1');
  }

  function renderOriginStep(step){
    showScreen('origin');
    const body = document.getElementById('origin-body');
    if(!body) return;
    if(step==='q1' || step==='q2'){
      const q = step==='q1' ? ORIGIN_Q1 : ORIGIN_Q2;
      body.innerHTML = `
        <p style="text-align:center;color:var(--parchment-dim); font-size:14px; line-height:1.9; font-style:italic; margin-bottom:22px; white-space:pre-line;">${q.question}</p>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${q.options.map(o=>`<button class="btn" data-key="${o.key}" style="text-align:left; height:auto; padding:12px 14px; white-space:normal; line-height:1.5;">${o.text}</button>`).join('')}
        </div>
        <div style="text-align:center; margin-top:18px;">
          <img src="images/npc/gatekeeper.png" alt="문지기" style="max-width:220px; width:60%; filter:drop-shadow(0 8px 14px #00000099);">
        </div>`;
      body.querySelectorAll('[data-key]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          Sound.click();
          const key = btn.dataset.key;
          if(step==='q1'){
            originAnswers.q1 = key;
            showDialogueSequence([ORIGIN_Q1_REACTIONS[key]], {title:'문지기', onDone:()=>renderOriginStep('q2')});
          } else {
            originAnswers.q2 = key;
            showDialogueSequence([ORIGIN_Q2_REACTIONS[key]], {title:'문지기', onDone:()=>renderOriginStep('story')});
          }
        });
      });
    } else if(step==='story'){
      // 한 화면에 몰아서 보여주던 8줄을 대화 팝업으로 한 줄씩 넘긴다(사용자 요청).
      // 다 넘기면 별도 확인 버튼 없이 바로 적용/시작한다.
      body.innerHTML = '';
      const lines = ORIGIN_STORIES[originAnswers.q1] || ORIGIN_STORIES.survival;
      showDialogueSequence(lines, {onDone:applyOriginAndStart});
    }
  }

  function applyOriginAndStart(){
    Sound.click();
    // 두 선택 모두 영구 보너스로 기록한다 — 실제 수치 반영은
    // combat/battle-end.js(레벨업 성장치/경험치/승리 골드 계산식)에서
    // player.originBonuses를 확인해 처리한다.
    player.originBonuses = {};
    player.originBonuses[originAnswers.q1] = 0.08;
    player.originBonuses[originAnswers.q2] = 0.08;
    player.originTraits = [originAnswers.q1, originAnswers.q2];
    saveGame();
    finishNewGameStart();
  }