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
      // tierIndex=현재 몇 번째 5층 구간을 도는 중인지(0-based, 0이면 1~5층 구간),
      // nodeMap=현재 구간의 노드 배치(행 배열, 마지막 행이 항상 보스),
      // nodeRow=지금 서 있는 행 인덱스(-1=아직 첫 노드도 안 고름),
      // nodeCurrentId=지금 서 있는 노드 id, nodeVisited=지나온 노드 id 목록(지도
      // 다시 볼 때 발자국 표시용). nodeMap이 null이면 "구간 시작 전/보스 방금
      // 클리어함" 상태 — 이때 나아가다를 누르면 새 지도가 생성된다.
      tierIndex:0, nodeMap:null, nodeRow:-1, nodeCurrentId:null, nodeVisited:[],
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
