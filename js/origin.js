"use strict";
/*
오프닝 심리테스트 — 신규 캐릭터 생성 직후, 마을 진입 전 1회 등장한다(이어하기는
해당 없음). 두 질문으로 캐릭터의 "기원"을 정하고, 각 선택마다 작은 영구 보너스
(사용자 확정 8%, 체감은 되지만 게임을 쉽게 만들 정도는 아닌 수준)를 부여한다.
1번 질문(동기 — 황금/진실/생존/속죄)은 오프닝 스토리 텍스트까지 함께 결정하고,
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
      {key:'atonement', text:'"속죄를 위해서요. 씻어내야 할 죄가 있소, 이 어둠 속에서라도."'},
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
    atonement: '문지기의 표정이 굳는다.\n"속죄라... 그것은 이 회랑이 가장 즐겨 삼키는 이유지."',
  };
  const ORIGIN_Q2_REACTIONS = {
    strength: '"완력이라. 이 회랑은 힘없는 자에게 자비를 베풀지 않는다."',
    swiftness: '"재빠름이라... 나쁘지 않지. 다만 이 회랑에서는, 빠른 자가 먼저 함정을 밟기도 한다."',
    spirit: '"정신력이라... 이 회랑은 몸보다 마음을 먼저 부러뜨리려 든다는 걸, 곧 알게 될 것이다."',
  };

  // 사용자 요청 — 8줄 나레이션 나열을 4팝업으로 줄이고, 문지기/주인공이 실제로
  // 대사를 주고받는 형태로 재구성(나머지 나레이션 줄에는 장면 라벨을 붙임).
  // 문자열=기존처럼 opts.title 사용, 객체{text,title}=화자별 라벨을 갖는 대사.
  // player.name은 showOriginQuiz() 시점엔 이미 newPlayer()로 정해져 있다.
  // 이후 사용자 요청 — 주인공 대사 자리는 고정 한 줄이 아니라 Q1/Q2처럼 버튼
  // 선택지 3개 중 고르게 한다(순수 대사 톤 차이일 뿐, 보너스 수치엔 영향 없음).
  // 그래서 각 동기는 before(선택 전 팝업들)/playerOptions(선택지)/after(선택 후
  // 팝업들) 세 구간으로 나뉜다.
  function originStories(){
    return {
      gold: {
        before: [
          {text:'오랫동안 떠돌던 소문이 있었다. 이 땅 깊은 곳, 어둠의 회랑에 태고의 황금이 잠들어 있다는 이야기. 누군가는 헛소리라 했고, 누군가는 그 말 하나에 목숨을 걸었다. 그대는 오랫동안 굶주려온 자였다 — 동전 한 닢에도 손이 떨리던 시절을 기억한다.', title:'오래된 소문'},
          {text:'문지기가 낡은 문의 빗장을 천천히 당기며 말한다.\n"황금은 이 안에서 사람을 고르지 않는다. 살아 나가는 자에게만 곁을 내줄 뿐."', title:'문지기'},
        ],
        playerOptions: [
          {key:'resolve', text:'"...상관없다. 살아서 나가겠다. 그리고 반드시, 손에 쥐고 나가겠다."'},
          {key:'stubborn', text:'"곁을 내줄 때까지, 몇 번이고 다시 이 문을 두드리겠다."'},
          {key:'defiant', text:'"그렇다면 내가 이 회랑의 예외가 되어 보이겠다."'},
        ],
        after: [
          {text:'등 뒤로 익숙한 삶이 멀어지고, 이제 어둠과 부(富)의 갈림길만이 남았다. 횃불 하나를 손에 쥔 채, 그대는 첫걸음을 내디딘다.', title:'회랑 앞에서'},
        ],
      },
      truth: {
        before: [
          {text:'누구도 이 회랑에 대해 제대로 아는 자가 없었다. 들어간 자는 많았으나 돌아온 자는 손에 꼽았고, 그나마도 온전한 정신으로 돌아온 이는 없었다. 반복되는 소문, 지워진 기록, 침묵하는 생존자들 — 단순한 던전이라기엔 너무 많은 것이 감춰져 있었다.', title:'지워진 기록'},
          {text:'문지기가 낡은 문의 빗장을 당기며 나직이 경고한다.\n"진실을 좇는 자들은 대개, 알고 싶지 않았던 것까지 알게 되어 돌아오지 못했다."', title:'문지기'},
        ],
        playerOptions: [
          {key:'resolve', text:'"그렇다면 더더욱 알아야겠소. 감춰진 것일수록, 감춰진 이유가 있는 법이니."'},
          {key:'debt', text:'"돌아오지 못한 자들 대신, 내가 그 답을 가지고 나가겠소."'},
          {key:'cold', text:'"모르고 사는 것보다, 알고 죽는 편이 낫겠지."'},
        ],
        after: [
          {text:'그래서 그대는 등불을 준비하는 대신, 질문을 준비했다. 회랑의 입구에 선 지금, 그 질문들이 하나씩 대답을 받을 것이다 — 설령 그 대답이 그대를 집어삼킬지라도.', title:'회랑 앞에서'},
        ],
      },
      survival: {
        before: [
          {text:'그대에게 선택의 여지는 많지 않았다. 위에서는 이미 살아갈 곳이 없었다 — 빚이든, 죄든, 혹은 그저 운이 다한 삶이든. 어둠의 회랑은 마지막으로 남은 길이었다. 앞으로 나아가거나, 그 자리에서 스러지거나.', title:'마지막 길'},
          {text:'문지기가 무심한 눈으로 그대를 훑어보며 말한다.\n"돌아갈 곳이 없는 자들이 종종 이 문을 두드리지. 그들 중 몇이나 살아나갔는지는, 나도 세지 않는다."', title:'문지기'},
        ],
        playerOptions: [
          {key:'resolve', text:'"세지 않아도 좋다. 나는 살아서 나갈 테니까."'},
          {key:'habit', text:'"지금까지 그래왔듯, 이번에도 어떻게든 버텨내겠다."'},
          {key:'ready', text:'"죽음 따위, 이미 몇 번이고 각오했다."'},
        ],
        after: [
          {text:'그대는 낡은 무기를 고쳐 쥐고, 어둠을 향해 걸음을 옮긴다 — 이번에도, 반드시 살아남을 것이다.', title:'회랑 앞에서'},
        ],
      },
      atonement: {
        before: [
          {text:'그대에게는 씻어내지 못한 죄가 있었다. 누군가에게 진 빚, 혹은 그보다 무거운 무언가. 사람들은 시간이 흐르면 잊혀진다 했지만, 그대의 죄는 오히려 해가 갈수록 무거워져만 갔다.', title:'씻지 못한 죄'},
          {text:'문지기가 낡은 문의 빗장을 당기며 나직이 말한다.\n"이 안에서 죄는 사라지지 않는다. 다만, 견뎌낼 수는 있겠지."', title:'문지기'},
        ],
        playerOptions: [
          {key:'resolve', text:'"견뎌내겠소. 그것이 내가 할 수 있는 유일한 속죄이니."'},
          {key:'surrender', text:'"차라리 이 어둠이 날 삼켜준다면, 그것도 속죄가 되겠지."'},
          {key:'stand', text:'"죄값은 치르되, 여기서 무릎 꿇진 않겠다."'},
        ],
        after: [
          {text:'그대는 두 팔을 들어 스스로를 감싸듯 몸을 세운다. 무너지지 않는 것 — 그것이 이번 걸음의 유일한 목표다.', title:'회랑 앞에서'},
        ],
      },
    };
  }

  // 실제 화면에는 표시하지 않는다(사용자 요청 — "이게 뭔가 싶어야 한다", 정확한
  // 수치를 알려주면 신비로움이 깨짐). combat/battle-end.js에서 실제 수치를 어떻게
  // 적용하는지 찾아볼 때 참고하는 개발자용 문서 역할만 한다.
  const ORIGIN_BONUS_LABEL = {
    gold: '전투 승리 시 골드 획득 +8%',
    truth: '경험치 획득 +8%',
    survival: '레벨업 시 최대HP 상승량 +8%',
    atonement: '레벨업 시 방어력 상승량 +8%',
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
      // before 팝업들 → 플레이어 대답 선택지(모달) → 선택한 대사 팝업 → after
      // 팝업들 순서로 진행하고, 다 넘기면 별도 확인 버튼 없이 바로 적용/시작한다.
      body.innerHTML = '';
      const stories = originStories();
      const s = stories[originAnswers.q1] || stories.survival;
      showDialogueSequence(s.before, {onDone:()=>renderOriginPlayerChoice(s)});
    }
  }

  // 사용자 요청 — 스토리 중 주인공 대사 자리를 고정 한 줄이 아니라 Q1/Q2와
  // 같은 방식의 버튼 선택지 모달로 고르게 한다. 선택은 순수 대사 톤 차이일
  // 뿐 originBonuses 수치에는 영향을 주지 않는다.
  function renderOriginPlayerChoice(s){
    const body = document.getElementById('origin-body');
    if(!body) return;
    const who = (player && player.name) || '그대';
    body.innerHTML = `
      <p style="text-align:center;color:var(--parchment-dim); font-size:13px; letter-spacing:.05em; margin-bottom:14px; font-style:italic;">— 어떻게 대답하겠는가? —</p>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${s.playerOptions.map(o=>`<button class="btn" data-key="${o.key}" style="text-align:left; height:auto; padding:12px 14px; white-space:normal; line-height:1.5;">${o.text}</button>`).join('')}
      </div>`;
    body.querySelectorAll('[data-key]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        Sound.click();
        const opt = s.playerOptions.find(o=>o.key===btn.dataset.key);
        body.innerHTML = '';
        showDialogueSequence([{text:opt.text, title:who}], {onDone:()=>{
          showDialogueSequence(s.after, {onDone:applyOriginAndStart});
        }});
      });
    });
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