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
