"use strict";
/*
딜러의 장갑 — 숨겨진 장소 화면: 진실의 조각(이야기 칸) + 숨겨진 도박장.
설계: docs/superpowers/specs/2026-10-06-jester-hidden-places-design.md
export(전역): JESTER_TRUTH_FRAGMENTS, jesterTruthSeen, JESTER_DEN_GAMES, showJesterTruthRoom, showJesterDen,
       grantDenPrize, showRatRace, showThiefGame
의존성: jester-shell.js(nextTruthIndex/JESTER_TRUTH_COUNT/pickDenTables), storage.js(loadJesterTruth/addJesterTruth),
       events.js(eventOverlay/closeMysteryEvent/showJesterTableEvent/showJesterShellEvent/grantRandomPotion/
       grantEliteSealFragments), jester-table.js(jesterTableStake), jester-den-games.js(쥐 경주/도둑잡기 순수 로직),
       blacksmith.js(grantReinforceStones), relics.js(유물 획득), ui/dialogue.js
2차(2026-10-07): 도박장 전용 게임 쥐 경주/도둑잡기 + 대승 보상 벼랑 끝의 촛불
       (docs/superpowers/specs/2026-10-07-jester-den-games-design.md).
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
    {id:'rats', name:'쥐 경주', desc:'쥐 네 마리, 배당은 저마다. 반환점에서 한 번 더 걸 수 있다.', start:()=> showRatRace()},
    {id:'thief', name:'도둑잡기', desc:'세 장으로 겨룬다. 딜러의 손이 거짓말을 할 때가 있다.', start:()=> showThiefGame()},
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

  // 도박장 전용 게임 공통 정산: 골드 + 작은 현물 1개, 대승이면 50%로 벼랑 끝의 촛불(그때 이미 있으면 판돈 2배 골드).
  // 유물이 나오면 오버레이를 닫고 대화창 → 획득(슬롯이 차면 교체 화면). 아니면 바로 노드맵으로.
  function grantDenItem(kind){
    if(kind==='potion') return grantRandomPotion();
    if(kind==='stone'){ grantReinforceStones(1); return '강화석 +1'; }
    return grantEliteSealFragments(1);
  }
  function grantDenPrize(overlay, o){
    player.gold += o.gold;
    const prize = grantDenItem(pickDenPrizeKind());
    const roll = denRelicRoll(o.bigWin, (player.relics||[]).includes(EDGE_CANDLE_RELIC));
    let bonus = '';
    if(roll==='gold'){ player.gold += o.stake*2; bonus = ` 딜러가 골드를 더 밀어 준다(+${o.stake*2}G).`; }
    addLog(`${o.logText} 골드 +${o.gold}G. ${prize}${bonus}`, 'gold');
    if(roll!=='relic'){ renderStatus(); saveGame(); closeMysteryEvent(overlay); return; }
    overlay.remove();
    const done = ()=>{ renderStatus(); saveGame(); renderExplore([]); };
    showDialogueSequence([
      '딜러의 손이 탁자 위 촛불 하나를 집어, 이쪽으로 밀어 준다.',
      '거의 다 타 버린 몽당초다. 그런데 불꽃이 낮게 내려앉을수록, 더 밝게 타오른다.',
    ], {onDone: ()=>{
      if(getRelicSlotUsage() >= player.relicSlots) showRelicSwapPrompt(EDGE_CANDLE_RELIC, null, false, done);
      else { finalizeRelicPick(EDGE_CANDLE_RELIC, false); done(); }
    }});
  }

  // 버튼 영역 갈아 끼우기(카드판/야바위와 같은 패턴 — 클릭 즉시 비워 연타 방지).
  function denButtons(btns, list){
    btns.innerHTML = list.map((b,i)=>`<button class="btn" data-i="${i}" ${b.disabled?'disabled':''}>${b.label}</button>`).join('');
    btns.querySelectorAll('button').forEach(el=> el.addEventListener('click', ()=>{
      denButtons(btns, []);
      list[+el.dataset.i].on();
    }, {once:true}));
  }
  const DEN_INTRO_STYLE = 'text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;';
  const DEN_INFO_STYLE = 'text-align:center;color:var(--gold-bright);font-size:13px;min-height:18px;margin:0 0 10px;';

  // 쥐 경주(js/jester-den-games.js). 쥐 고르기(= 판돈) → 틱마다 0.6초 재생 → 반환점에서 멈춰
  // 올리기/절반 빼기/그대로 → 결승. 사기꾼은 경주 중 1회 발 걸기(고르는 동안 경주가 멈춘다).
  // 타이머는 오버레이가 닫혔으면 아무것도 하지 않는다(later).
  const RAT_TICK_MS = 600;
  function showRatRace(){
    const stake = jesterTableStake(player, depth);
    const lineup = ratLineup(), crumbs = ratCrumbs();
    const odds = ratOdds(lineup, crumbs);
    const st = ratNewRace(lineup, crumbs);
    const {overlay, panel} = eventOverlay('쥐 경주',
      `<p style="${DEN_INTRO_STYLE}">촛불 아래 좁은 홈통 네 줄. 손이 쥐 꼬리를 하나씩 집어 출발선에 세운다.</p>
      <div class="jr-track" id="jr-track"></div>
      <p id="jr-info" style="${DEN_INFO_STYLE}">판돈 ${stake}G — 이길 쥐에 건다. 반환점에서 한 번 더 걸 수 있다.</p>`,
      `<div id="jr-btns" style="display:flex; flex-direction:column; gap:8px;"></div>`);
    const track = panel.querySelector('#jr-track');
    const info = panel.querySelector('#jr-info');
    const btns = panel.querySelector('#jr-btns');
    let pick = -1, raised = false, cashedOut = false, tripping = false;
    let tripLeft = player.specialization==='jester_debtcollector' ? 1 : 0;
    const later = (fn, ms)=> setTimeout(()=>{ if(overlay.isConnected) fn(); }, ms);
    const at = f=> `calc((100% - 22px) * ${Math.min(1, f)})`;
    track.innerHTML = lineup.map((k,i)=>`<div class="jr-lane" data-i="${i}">
        <div class="jr-label"><b>${RAT_KINDS[k].name}</b> · ${RAT_KINDS[k].desc}<span class="jr-odds">${odds[i]}배</span></div>
        <div class="jr-run">${k==='glutton' ? crumbs.map(c=>`<i class="jr-crumb" data-c="${c}" style="left:${at(c/RAT_TRACK)}"></i>`).join('') : ''}<span class="jr-rat">🐀</span></div>
      </div>`).join('');
    const lanes = [...track.querySelectorAll('.jr-lane')];
    const name = i=> RAT_KINDS[lineup[i]].name;
    const draw = ()=>{
      lanes.forEach((ln,i)=>{
        ln.querySelector('.jr-rat').style.left = at(st.rats[i].pos/RAT_TRACK);
        ln.querySelectorAll('.jr-crumb').forEach(c=>{ if(!st.crumbs.includes(+c.dataset.c)) c.remove(); });
      });
    };
    const end = (text, cls)=>{ addLog(text, cls); renderStatus(); saveGame(); closeMysteryEvent(overlay); };
    const runButtons = ()=> denButtons(btns, tripLeft>0 ? [{label:'🦶 발 걸기 (1회)', on:()=>{
      tripLeft--; tripping = true; track.classList.add('tripping');
      info.textContent = '발을 걸 쥐의 레인을 고르세요.';
    }}] : []);
    lanes.forEach((ln,i)=> ln.addEventListener('click', ()=>{
      if(!tripping) return;
      tripping = false; track.classList.remove('tripping');
      st.rats[i].tripped = true;
      ln.classList.add('tripped'); later(()=> ln.classList.remove('tripped'), 700);
      info.textContent = `${name(i)}의 발을 슬쩍 걸었다.`;
    }));
    const tick = ()=>{
      if(tripping){ later(tick, 150); return; }
      const res = ratStep(st);
      draw();
      if(res.finished){ later(finish, 700); return; }
      if(res.half && !cashedOut){ later(halfway, 450); return; }
      later(tick, RAT_TICK_MS);
    };
    const halfway = ()=>{
      const rank = 1 + st.rats.filter((r,i)=> i!==pick && r.pos > st.rats[pick].pos).length;
      info.textContent = `반환점. ${name(pick)}은(는) 지금 ${rank}위.`;
      denButtons(btns, [
        {label:`판돈 올리기 (+${stake}G, ${odds[pick]}배 그대로)`, disabled: player.gold<stake, on:()=>{
          raised = true; player.gold -= stake; renderStatus(); saveGame();
          info.textContent = `판돈을 ${stake*2}G로 올렸다.`; runButtons(); later(tick, 400);
        }},
        {label:`절반 빼기 (${ratPayout(stake, odds[pick], {cashedOut:true})}G 돌려받기)`, on:()=>{
          cashedOut = true; player.gold += ratPayout(stake, odds[pick], {cashedOut:true}); renderStatus(); saveGame();
          info.textContent = '판돈 절반을 챙겨 물러났다. 경주는 계속된다.'; later(tick, 400);
        }},
        {label:'그대로', on:()=>{ info.textContent = '쥐들이 다시 달린다.'; runButtons(); later(tick, 300); }},
      ]);
    };
    const finish = ()=>{
      denButtons(btns, []);
      lanes[st.winner].classList.add('winner');
      const won = st.winner===pick;
      if(cashedOut){
        info.textContent = `${name(st.winner)}이(가) 들어왔다.`;
        denButtons(btns, [{label:'일어선다', on:()=> end(`쥐 경주에서 판돈 절반을 빼고 물러났다(${name(st.winner)} 우승). 골드 +${ratPayout(stake, odds[pick], {cashedOut:true})}G`)}]);
        return;
      }
      if(!won){
        info.textContent = `${name(st.winner)}이(가) 먼저 들어왔다. 손가락이 판돈을 쓸어 간다.`;
        denButtons(btns, [{label:'일어선다', on:()=> end(`쥐 경주에서 졌다(${name(st.winner)} 우승). 판돈 ${raised ? stake*2 : stake}G를 잃었다.`, 'warn')}]);
        return;
      }
      const gold = ratPayout(stake, odds[pick], {won:true, raised});
      info.textContent = `${name(pick)}이(가) 들어왔다!${raised ? ' 올린 판돈까지 전부.' : ''}`;
      denButtons(btns, [{label:`정산한다 (${gold}G)`, on:()=> grantDenPrize(overlay, {gold, stake, bigWin:raised,
        logText:`쥐 경주에서 ${name(pick)}이(가) 이겼다(${odds[pick]}배${raised ? ', 판돈 올림' : ''}).`})}]);
    };
    draw();
    denButtons(btns, lineup.map((k,i)=>({label:`${RAT_KINDS[k].name}에 건다 (${odds[i]}배)`, disabled: player.gold<stake, on:()=>{
      pick = i; lanes[i].classList.add('mine');
      // 판돈을 낸 즉시 저장 — 지고 새로고침해 판돈을 되찾는 걸 막는다(카드판/야바위와 같음).
      player.gold -= stake; renderStatus(); saveGame();
      info.textContent = `${name(i)}에 ${stake}G. 손가락이 탁자를 두드리자, 쥐들이 달린다.`;
      runButtons();
      later(tick, 500);
    }})).concat([{label:'지나간다', on:()=> end('쥐 경주를 지나쳤다.')}]));
  }

  // 도둑잡기(js/jester-den-games.js). 내 차례: 딜러 카드를 가리키면 손이 반응(움찔/태연) → 이걸 뽑는다/다른 걸 뽑는다.
  // 딜러 차례: 손이 내 카드 위를 머뭇거리다 무작위 한 장. phase로 연타를 막는다
  // (point: 가리킬 카드 고르기, pick: 가리킨 것 말고 고르기, peek: 사기꾼 훔쳐보기, busy: 입력 무시).
  function thiefCardHtml(card, faceUp){
    const label = card===THIEF_JOKER ? '🃏' : card;
    return `<div class="jt-card${faceUp ? ' face-up' : ''}"><div class="jt-back"></div><div class="jt-front">${label}</div></div>`;
  }
  function showThiefGame(){
    const stake = jesterTableStake(player, depth);
    const {overlay, panel} = eventOverlay('도둑잡기',
      `<p style="${DEN_INTRO_STYLE}">촛불 아래, 손만 남은 딜러가 카드를 갈라 쥔다. 그중 한 장은 웃는 얼굴이다.</p>
      <div class="th-row" id="th-dealer"></div>
      <p class="jt-hint">딜러의 패</p>
      <div class="th-row" id="th-me"></div>
      <p class="jt-hint">나의 패 — 짝이 맞으면 버린다. 먼저 다 털면 이기고, 🃏를 끝까지 쥐면 진다.</p>
      <p id="th-info" style="${DEN_INFO_STYLE}">판돈 ${stake}G — 이기면 두 배.</p>`,
      `<div id="th-btns" style="display:flex; flex-direction:column; gap:8px;"></div>`);
    const dealerEl = panel.querySelector('#th-dealer');
    const meEl = panel.querySelector('#th-me');
    const info = panel.querySelector('#th-info');
    const btns = panel.querySelector('#th-btns');
    let me = [], dealer = [], phase = 'busy', pointed = -1, drewJoker = false;
    let peekLeft = player.specialization==='jester_debtcollector' ? 1 : 0;
    const later = (fn, ms)=> setTimeout(()=>{ if(overlay.isConnected) fn(); }, ms);
    const end = (text, cls)=>{ addLog(text, cls); renderStatus(); saveGame(); closeMysteryEvent(overlay); };
    const draw = ()=>{
      dealerEl.innerHTML = dealer.map(c=> thiefCardHtml(c, false)).join('');
      meEl.innerHTML = me.map(c=> thiefCardHtml(c, true)).join('');
      dealerEl.classList.toggle('pickable', phase==='point' || phase==='pick' || phase==='peek');
      if(phase==='pick' && dealerEl.children[pointed]) dealerEl.children[pointed].classList.add('th-dim');
    };
    const checkEnd = ()=>{
      const w = thiefWinner(me, dealer);
      if(!w) return false;
      phase = 'busy'; draw();
      if(w==='me'){
        const gold = thiefPayout(stake, true);
        info.textContent = drewJoker ? '패를 다 털었다!' : '패를 다 털었다 — 🃏는 한 번도 뽑지 않았다.';
        denButtons(btns, [{label:`정산한다 (${gold}G)`, on:()=> grantDenPrize(overlay, {gold, stake, bigWin:!drewJoker,
          logText:`도둑잡기에서 이겼다${drewJoker ? '' : '(🃏를 한 번도 뽑지 않음)'}.`})}]);
      } else {
        info.textContent = '딜러가 패를 다 털었다. 내 손에 🃏만 남았다.';
        denButtons(btns, [{label:'일어선다', on:()=> end(`도둑잡기에서 졌다. 판돈 ${stake}G를 잃었다.`, 'warn')}]);
      }
      return true;
    };
    const myTurn = ()=>{
      if(checkEnd()) return;
      phase = 'point'; pointed = -1; draw();
      info.textContent = '딜러의 카드 한 장을 가리키세요.';
      denButtons(btns, peekLeft>0 ? [{label:'👁 훔쳐보기 (1회)', on:()=>{
        peekLeft--; phase = 'peek'; draw();
        info.textContent = '몰래 볼 카드를 고르세요.';
      }}] : []);
    };
    const take = i=>{
      phase = 'busy'; denButtons(btns, []);
      const res = thiefTake(dealer, i, me);
      if(res.card===THIEF_JOKER) drewJoker = true;
      draw();
      info.textContent = res.card===THIEF_JOKER ? '🃏 — 웃는 얼굴이다…' : res.paired ? `${res.card} — 짝이 맞아 버렸다.` : `${res.card}을(를) 뽑았다.`;
      later(()=>{ if(!checkEnd()) dealerTurn(); }, 900);
    };
    const dealerTurn = ()=>{
      info.textContent = '딜러의 손이 내 패 위를 맴돈다…';
      const hover = Math.floor(Math.random()*me.length);
      if(meEl.children[hover]) meEl.children[hover].classList.add('th-pointed');
      later(()=>{
        const i = thiefDealerPick(me);
        [...meEl.children].forEach(el=> el.classList.remove('th-pointed'));
        if(meEl.children[i]) meEl.children[i].classList.add('th-pointed');
        later(()=>{
          const res = thiefTake(me, i, dealer);
          draw();
          info.textContent = res.card===THIEF_JOKER ? '딜러가 🃏를 가져갔다!' : res.paired ? `딜러가 ${res.card}을(를) 가져가 짝을 버렸다.` : `딜러가 ${res.card}을(를) 가져갔다.`;
          later(myTurn, 900);
        }, 500);
      }, 550);
    };
    const onPoint = i=>{
      phase = 'busy'; pointed = i;
      dealerEl.children[i].classList.add('th-pointed');
      const tell = thiefTell(dealer[i]===THIEF_JOKER);
      if(tell==='flinch') dealerEl.classList.add('th-flinch');
      later(()=>{
        dealerEl.classList.remove('th-flinch');
        info.textContent = tell==='flinch' ? '🫳 딜러의 손가락이 미세하게 떨린다…' : '🫳 딜러의 손은 태연하다.';
        const opts = [{label:'이걸 뽑는다', on:()=> take(i)}];
        if(dealer.length > 1) opts.push({label:'다른 걸 뽑는다', on:()=>{
          phase = 'pick'; draw();
          info.textContent = '가리킨 카드 말고, 뽑을 카드를 고르세요.';
        }});
        denButtons(btns, opts);
      }, 450);
    };
    dealerEl.addEventListener('click', e=>{
      const el = e.target.closest('.jt-card');
      if(!el) return;
      const i = [...dealerEl.children].indexOf(el);
      if(phase==='peek'){
        phase = 'busy';
        el.classList.add('face-up');
        later(()=>{ el.classList.remove('face-up'); phase = 'point'; info.textContent = '딜러의 카드 한 장을 가리키세요.'; draw(); }, 1000);
      } else if(phase==='point') onPoint(i);
      else if(phase==='pick' && i!==pointed) take(i);
    });
    draw();
    denButtons(btns, [
      {label:`판에 앉는다 (판돈 ${stake}G)`, disabled: player.gold<stake, on:()=>{
        // 판돈을 낸 즉시 저장 — 새로고침으로 무르기 방지.
        player.gold -= stake; renderStatus(); saveGame();
        const d = thiefDeal(); me = d.me; dealer = d.dealer;
        draw();
        info.textContent = d.jokerMine ? '내 패에 🃏가 섞여 들어왔다.' : '🃏는 딜러 쪽에 있다.';
        later(myTurn, 900);
      }},
      {label:'지나간다', on:()=> end('도둑잡기 판을 지나쳤다.')},
    ]);
  }
