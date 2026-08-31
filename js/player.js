"use strict";
/*
신규 캐릭터 생성.
export(전역): newPlayer
의존성: JOBS(data/jobs.js)
*/
  function newPlayer(name, jobId, difficulty){
    const job = JOBS.find(j=>j.id===jobId) || JOBS[0];
    const m = job.statMods;
    const diff = difficulty || 'easy';
    const p = {
      name: name || '용사',
      difficulty: diff,
      job: job.id, job2: null, specialization: null, jobChosenAt10:false,
      level:1, exp:0, expNext:24,
      maxhp:32+m.maxhp, hp:0, maxmp:12+m.maxmp, mp:0,
      atk:7+m.atk, def:3+m.def, mag:6+m.mag, spd:6+m.spd,
      gold:40,
      inv:{ potion:3, hipotion:0, ether:1 },
      skills:[job.skillLevels[1]],
      buffAtkTurns:0, buffAtkMult:1, guardingNextHit:false,
      buffDefTurns:0, buffDefMult:1,
      buffCounterTurns:0, buffCounterChance:0,
      fateBoostChance:0, fateBoostMult:0,
      equipment:{weapon:null, armor:null, accessory:null},
      equipOwned:[],
      relics:[], relicSlots: diff==='hardcore'?4:(diff==='normal'?3:2), relicAltarsSeen:[], curseAltarsSeen:[], relicSkipsUsed:0, relicSkipsMax:2, ledgerStack:0, relicAppliedDeltas:{},
      candleUsed:false, diceDelta:null,
      endingSeen:false, deathCount:0,
      // 외상 도박사(jester_debtor) 전용 — 다른 직업이면 전부 기본값 그대로 남아
      // 아무 영향이 없다. debt=현재 남은 빚(이자로 증가, 상환으로 감소),
      // debtPrincipal=지금까지 빌린 총액(대출 시에만 증가 — 상환 비율 계산의
      // 분모), loanCounts=대출 종류별 누적 횟수(전액 상환 시 전부 0으로 리셋),
      // debtAppliedDelta=대출로 실제 오른 공격력/마력 수치(전액 상환 시 정확히
      // 회수하기 위한 기록 — relics.js의 relicAppliedDeltas와 동일한 설계
      // 원칙), debtBorrowedAtDepth=이번 빚 사이클을 시작한 깊이(황금고블린
      // 유예기간 계산 기준, 빚이 없으면 null), debtFreezeFloors=만기 연장 효과가
      // 남은 층 수, debtCollectorImminent=올인 대출 사용 후 다음 층에 황금고블린을
      // 강제로 불러오는 플래그.
      debt:0, debtPrincipal:0, loanCounts:{small:0, medium:0, large:0},
      debtAppliedDelta:{}, debtBorrowedAtDepth:null, debtFreezeFloors:0, debtCollectorImminent:false,
      // 노드맵 시스템(사용자 요청 — 슬레이 더 스파이어식 절차적 경로 선택) 전용.
      // tierIndex=현재 몇 번째 10층 구간을 도는 중인지(0-based, 0이면 1~10층 구간),
      // nodeMap=현재 구간의 노드 배치(행 배열, 마지막 행이 항상 보스),
      // nodeRow=지금 서 있는 행 인덱스(-1=아직 첫 노드도 안 고름),
      // nodeCurrentId=지금 서 있는 노드 id, nodeVisited=지나온 노드 id 목록(지도
      // 다시 볼 때 발자국 표시용). nodeMap이 null이면 "구간 시작 전/보스 방금
      // 클리어함" 상태 — 이때 나아가다를 누르면 새 지도가 생성된다.
      tierIndex:0, nodeMap:null, nodeRow:-1, nodeCurrentId:null, nodeVisited:[],
      // 정예의 인장(사용자 요청 — 확정 희귀템 대신 "모아서 원하는 에픽과
      // 교환"하는 방식으로 재설계). 정예 몬스터를 처치할 때마다 쌓이고,
      // 마을의 교환소(exchange.js)에서 에픽 장비와 교환해 소비한다.
      eliteSeals:0,
      // 정예의 인장 획득 팝업(사용자 요청) — 캐릭터 생애 최초 1회만 큰
      // 토스트 팝업을 띄우고, 이후엔 탐험 로그 텍스트로만 안내한다.
      eliteSealFirstSeen:false,
      // 마을 체크포인트(사용자 요청) — 타이어 보스를 잡고 마을에 도착하는
      // 시점의 상태 스냅샷. 사망 시(쉬움/보통 난이도) 이 상태로 되돌아간다.
      // combat/battle-end.js가 보스 클리어 시 갱신, 사망 시 복원한다.
      townCheckpoint:null,
      // 오프닝 심리테스트(origin.js) — 실제 값은 퀴즈 완료 시 채워진다. 여기서는
      // 안전한 빈 기본값만 둔다(전투 스케일링 등 다른 계산식이 undefined를 0으로
      // 처리하므로 없어도 안전하지만, 명시적으로 두는 편이 읽기 좋다).
      originBonuses:{}, originTraits:[], originGrowthRemainder:{hp:0, mp:0, atk:0, spd:0},
      // 임시 저주 시스템(사용자 요청 — 저주술사가 아니면 저주가 "이 구간 한정"이
      // 되도록 재설계). {저주id: 받아들인 시점의 tierIndex} 형태로 기록해두고,
      // 그 구간의 보스를 잡는 순간 combat/battle-end.js가 이 목록을 확인해
      // 해당 저주를 해제(removeRelic)하고 정화 보상을 지급한다. 저주술사
      // (mastery_curseweaver)는 이 목록에 아예 안 들어가고 기존처럼 영구 저주로
      // 남는다(relics.js의 showCurseAltar 참고).
      tempCurses:{},
      // 미지의 사건 "수상한 지도 조각"(events.js) 전용 — 아주 가벼운 연쇄
      // 이벤트 하나만 허용한다(지속 상태 추적은 최소화한다는 원칙 유지). 이
      // 플래그가 있으면 나중에 "봉인된 관" 이벤트가 자동으로 좋은 결과로
      // 확정된다.
      hasMapFragment:false,
      // ---- 이벤트 시스템 신규 필드(사용자 요청) ----
      // 정예의 인장 조각: 4개 모이면 자동으로 인장 1개로 전환(초과분은 유지).
      eliteSealFragments:0,
      // "다음 전투"에 한해 적 공격력을 낮추는 단발성 배율(촛불 이벤트 등).
      // combat/battle-setup.js의 startBattle()에서 소비 즉시 null로 되돌아간다.
      nextBattleEnemyAtkMult:null,
      // "다음 N전투" 동안 지속되는 버프(수수께끼의 마법사). type: 'atk'|'mitigate'|'mpcost'.
      // startBattle()에서 매 전투 시작 시 반영하고, combat/battle-end.js의
      // checkBattleEnd()에서 승/패 판정마다 battlesLeft를 1씩 깎는다.
      multiBattleBuff:null,
      // "마을 도착 전까지" 유지되는 계약형 버프(악마의 계약). 전투 승리마다
      // hpDrainPct만큼 HP를 추가로 깎는 대신 공격력이 오른다. 보스를 잡고
      // 마을에 도착하는 순간(showBossRewardChoice의 finish()) 자동 해제된다.
      contractBuff:null,
      // 부상당한 모험가 이벤트(사용자 요청 — 연계 이벤트). 도와준 적이 있으면
      // 다음에 "재회" 이벤트가 이벤트 풀에 포함된다(1회성 소비).
      helpedInjuredAdventurer:false,
    };
    p.hp = p.maxhp; p.mp = p.maxmp;
    // 테스트용: 아이디(이름)가 'admin'이면 레벨 9부터 시작한다. combat/battle-end.js의
    // grantExp() 레벨업 공식(HP+9/MP+4/ATK+2/DEF+1/MAG+2/SPD+1, expNext = round(expNext*1.28+6))을
    // 그대로 재현해 레벨 1→9까지의 스탯 증가분·필요경험치·스킬 습득을 미리 적용한다.
    // 1.28은 grantExp()에서 레벨 20 미만(난이도 무관)일 때 쓰는 성장률이며, 목표 레벨이
    // 9이므로 항상 이 값만 해당된다.
    if(p.name === 'admin'){
      const startLevel = 9;
      while(p.level < startLevel){
        p.level += 1;
        p.expNext = Math.round(p.expNext*1.28 + 6);
        p.maxhp += 9; p.maxmp += 4;
        p.atk += 2; p.def += 1; p.mag += 2; p.spd += 1;
        const unlockKey = job.skillLevels[p.level];
        if(unlockKey && !p.skills.includes(unlockKey)) p.skills.push(unlockKey);
      }
      // 몬스터 한 마리만 잡아도 바로 레벨업하도록, 레벨9 요구 경험치의 99%를 채워서 시작한다.
      p.exp = Math.floor(p.expNext * 0.99);
      p.hp = p.maxhp; p.mp = p.maxmp;
    }
    return p;
  }