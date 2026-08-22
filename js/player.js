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
      job: job.id, job2: null, jobChosenAt10:false,
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
      relics:[], relicSlots: diff==='hardcore'?4:2, relicAltarsSeen:[], curseAltarsSeen:[], relicSkipsUsed:0, relicSkipsMax:2, ledgerStack:0, relicAppliedDeltas:{},
      candleUsed:false, diceDelta:null,
      endingSeen:false, deathCount:0,
    };
    p.hp = p.maxhp; p.mp = p.maxmp;
    return p;
  }

