"use strict";
/*
딜러의 장갑 — 숨겨진 장소 화면: 진실의 조각(이야기 칸) + 숨겨진 도박장.
설계: docs/superpowers/specs/2026-10-06-jester-hidden-places-design.md
export(전역): JESTER_TRUTH_FRAGMENTS, jesterTruthSeen, JESTER_DEN_GAMES, showJesterTruthRoom, showJesterDen
의존성: jester-shell.js(nextTruthIndex/JESTER_TRUTH_COUNT/pickDenTables), storage.js(loadJesterTruth/addJesterTruth),
       events.js(eventOverlay/closeMysteryEvent/showJesterTableEvent/showJesterShellEvent), ui/dialogue.js
주의: 진실의 조각은 "도박사만 아는 진실" — 주민들이 모르는 거래의 실상(story.md 2장)을 간접 서술로만 드러낸다.
     이름(아이온/아코스)은 쓰지 않는다. 왕자의 병상은 "잠긴 육아실"이 다루므로 쓰지 않는다.
*/

  const JESTER_TRUTH_FRAGMENTS = [
    {title:'봉인된 서신함', lines:[
      '먼지 쌓인 서신함. 왕실 문장이 찍힌 편지 한 통이, 먼 길을 오가며 닳은 듯 다시 접혀 있다.',
      '「시간을 다룬다는 그대에게. 내 아이가 변해 가고 있소. 왕관이든 보물고든, 원하는 값을 말해 주시오.」',
      '여백에, 다른 필체로. 「값은 받지 않겠습니다. 제게도 지키고 싶은 사람이 있으니까요.」',
      '왕국을 바쳤다는 소문과는, 값부터가 달랐다.',
    ]},
    {title:'기사단 숙소의 침상', lines:[
      '기사단 숙소. 침상 하나만 유독 가지런하다. 벽에는 칼을 걸던 자국만 남았다 — 칼은 없다.',
      '머리맡에 보랏빛 실로 수놓은 손수건. 땀이 삐뚤빼뚤하다. 바늘을 처음 쥐어 본 손이다.',
      '베개 밑의 쪽지. 「그대가 마법을 끝내면, 이번엔 내가 그대를 지키겠소.」',
    ]},
    {title:'미완성 마법진', lines:[
      '바닥을 뒤덮은 거대한 마법진. 절반만 빛을 머금었고, 나머지 절반은 아직 분필 선이다.',
      '벽에 날짜를 센 금이 빼곡하다. 어느 날부터는 금이 두 줄씩 그어져 있다 — 하루를 이틀처럼 쓴 것처럼.',
      '「조금만 더.」 같은 글씨가, 갈수록 흐트러진 채 몇 번이고 적혀 있다.',
    ]},
    {title:'격리 병동의 침상', lines:[
      '봉쇄된 병동 맨 안쪽. 이불 위로 검은 얼룩이 번진 침상 하나. 곁에 칼을 세워 두었던 자국.',
      '머리맡의 모래시계는 모래가 전부 아래로 흘러내린 채 서 있다 — 이 회랑에서 유일하게, 끝까지 흐른 시간.',
      '창밖으로 탑 꼭대기가 보인다. 보랏빛이 새어 나온다. 마법은, 아직 끝나지 않았다.',
    ]},
    {title:'시계탑 꼭대기', lines:[
      '마법진이 남김없이 빛나고 있다. 완성된 것이다.',
      '그 한가운데, 누군가 오래 무릎 꿇었던 자국. 곁에 떨어진 보랏빛 손수건 — 숙소 침상에 있던 그것이다.',
      '오래 멈춰 있던 탑의 종이 단 한 번 울렸고, 모든 것이 멈췄다. 한 걸음, 늦게.',
      '아무도 왕국을 팔지 않았다. 둘 다 각자의 하나를 붙들려 했고, 둘 다 놓쳤을 뿐이다.',
    ]},
  ];

  // 본 조각 번호(판 밖 영구 기록)의 캐시 — 엔딩(battle-end.js)이 동기적으로 읽는다.
  let jesterTruthSeen = [];
  if(typeof loadJesterTruth==='function'){
    loadJesterTruth().then(v=>{ jesterTruthSeen = Array.isArray(v) ? v : []; });
  }

  // 숨겨진 도박장 게임 등록부. 새 미니게임은 여기에 항목을 추가하는 것만으로 붙는다.
  const JESTER_DEN_GAMES = [
    {id:'table', name:'뒷골목 카드판', desc:'높다/낮다, 세 판을 내리 이기면 소매 속의 것을.', start:()=> showJesterTableEvent({den:true})},
    {id:'shell', name:'야바위 컵', desc:'섞이는 컵을 눈으로 따라간다. 세 판.', start:()=> showJesterShellEvent({den:true})},
  ];

  // 이야기 칸: 다음 조각을 화면 전에 기록하고(새로고침으로 잃지 않게), 최대HP 20% 회복.
  // 다섯 조각을 이미 다 봤으면(다른 캐릭터로 모은 경우 등) 도박장으로 대신 연다.
  function showJesterTruthRoom(){
    const idx = nextTruthIndex(jesterTruthSeen);
    if(idx<0){ showJesterDen(); return; }
    const frag = JESTER_TRUTH_FRAGMENTS[idx-1];
    jesterTruthSeen = jesterTruthSeen.concat([idx]);
    if(typeof addJesterTruth==='function') addJesterTruth(idx);
    const heal = Math.round(player.maxhp*0.2);
    player.hp = Math.min(player.maxhp, player.hp+heal);
    renderStatus(); saveGame();
    showDialogueSequence(frag.lines, {title:`🕯 ${frag.title}`, onDone: ()=>{
      addLog(`🕯 진실의 조각 ${idx}/${JESTER_TRUTH_COUNT} — ${frag.title}. (HP +${heal})`, 'gold');
      renderExplore([]);
    }});
  }

  // 숨겨진 도박장: 탁자 최대 2개 중 하나를 골라 한 판. 각 게임이 자기 판돈/지나가기 버튼을 가진다.
  function showJesterDen(){
    const tables = pickDenTables(JESTER_DEN_GAMES, 2);
    const {overlay, panel} = eventOverlay('숨겨진 도박장',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        계단 끝, 촛불 하나 아래에 탁자들이 놓여 있다.<br>손만 남은 딜러가 소매를 걷으며 빈자리를 가리킨다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">`
      + tables.map((g,i)=>`<button class="btn" data-den="${i}">${g.name}<br><span style="opacity:.7;font-size:11px;">${g.desc}</span></button>`).join('')
      + `<button class="btn" id="den-leave">그냥 나간다</button></div>`);
    panel.querySelectorAll('[data-den]').forEach(b=> b.addEventListener('click', ()=>{
      overlay.remove();
      tables[+b.dataset.den].start();
    }, {once:true}));
    panel.querySelector('#den-leave').addEventListener('click', ()=>{
      addLog('숨겨진 도박장을 그냥 나왔다.');
      closeMysteryEvent(overlay);
    }, {once:true});
  }
