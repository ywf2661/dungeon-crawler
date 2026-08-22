"use strict";
/*
적 턴 처리 체인 — enemyTurn(마녀의 시계 유물 래퍼) -> tickActiveRig(장치 자동사격)
-> enemyTurnReal -> enemyAction(실제 적 행동) -> finishEnemyTurn, 상태이상(dot) 적용.
주의: enemyTurn/tickActiveRig/enemyTurnReal/enemyAction의 호출 순서는 원본 그대로이며
반드시 이 순서를 유지해야 유물 효과(마녀의 시계, 가동 장치)가 정상 동작한다.
export(전역): getWitchClockExtraChance, enemyTurn, tickActiveRig, enemyTurnReal,
              processDotsSequentially, enemyAction, finishEnemyTurn, applyDot,
              applySkillDots, applySkillModifiers, effectiveAtk, consumeAtkBuff,
              getBloodPactDodgeBonus
의존성: state.js, relics.js, combat/battle-fx.js, combat/battle-end.js
*/

  function enemyTurn(){
    if(battleOver) return;
    if(battleFlags && !battleFlags.witchClockUsedThisTurn){
      const chance = getWitchClockExtraChance();
      if(chance>0 && Math.random()<chance){
        battleFlags.witchClockUsedThisTurn = true;
        resetCommandUI();
        popDamage('추가 행동!', 'heal');
        playCastBurst();
        Sound.buff();
        setBattleMsg(`${player.name}의 몸이 시간을 앞질러 움직인다!`, '마녀의 시계가 한 번 더 행동할 기회를 준다!');
        return;
      }
    }
    if(battleFlags) battleFlags.witchClockUsedThisTurn = false;
    if(battleFlags && battleFlags.rig && battleFlags.rig.turnsLeft>0){
      tickActiveRig();
      return;
    }
    enemyTurnReal();
  }
  // 가동 중인 장치(포탑/드론/오메가 유닛)가 있으면, 적의 턴이 시작되기 직전에 자동으로 한 발 쏜다.
  function tickActiveRig(){
    const rig = battleFlags.rig;
    setTimeout(()=>{
      if(battleOver) return;
      const dmg = Math.max(1, rig.dmgPerTick);
      enemy.hp = Math.max(0, enemy.hp - dmg);
      updateEnemyHpBar(); popDamage('-'+dmg, 'rig');
      Sound.hit();
      setBattleMsg(`${rig.name}이(가) 자동으로 사격한다!`, `${dmg}의 추가 피해!`);
      rig.turnsLeft -= 1;
      const expired = rig.turnsLeft<=0;
      if(expired) battleFlags.rig = null;
      renderStatus();
      if(checkBattleEnd()) return;
      setTimeout(()=>{
        if(expired){ setBattleMsg(`${rig.name}의 가동이 멈췄다.`, ''); }
        setTimeout(()=> enemyTurnReal(), expired?500:250);
      }, expired?250:0);
    }, 450);
  }
  function enemyTurnReal(){
    if(battleOver) return;
    if(enemy && enemy.exposedTurns>0){
      enemy.exposedTurns -= 1;
      updateStatusBadges();
    }
    if(battleFlags){
      battleFlags.hourglassTurn = (battleFlags.hourglassTurn||0) + 1;
      const limit = getRelicSum('turnLimitTurns');
      if(limit>0 && battleFlags.hourglassTurn>limit){
        const penaltyPct = getRelicSum('turnLimitPenaltyPct');
        if(penaltyPct>0 && player.hp>0){
          const selfDmg = Math.max(1, Math.round(player.maxhp*penaltyPct));
          player.hp = Math.max(0, player.hp-selfDmg);
          popDamage('-'+selfDmg, 'bleed');
          setBattleMsg('모래가 다 흘러내렸다…', `모래시계의 저주로 ${selfDmg}의 피해를 입었다.`);
          renderStatus();
          if(checkBattleEnd()) return;
        }
      }
    }
    const activeDots = (enemy.dots||[]).filter(d=>d.turns>0);
    if(activeDots.length){
      processDotsSequentially(activeDots, 0);
    } else {
      enemyAction();
    }
  }
  function processDotsSequentially(dots, idx){
    if(idx >= dots.length){
      enemy.dots = (enemy.dots||[]).filter(d=>d.turns>0);
      updateStatusBadges();
      if(checkBattleEnd()) return;
      enemyAction();
      return;
    }
    setTimeout(()=>{
      const d = dots[idx];
      enemy.hp = Math.max(0, enemy.hp - d.dmgPerTurn);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+d.dmgPerTurn, d.type);
      playStatusFx(d.type);
      Sound.poisonHit();
      setBattleMsg(`${enemy.name}이(가) ${d.label}(으)로 ${d.dmgPerTurn}의 피해를 입었다!`, '');
      d.turns -= 1;
      updateStatusBadges();
      if(checkBattleEnd()) return;
      processDotsSequentially(dots, idx+1);
    }, 500);
  }
  function enemyAction(){
    setTimeout(()=>{
      let skillKey = null;
      if(enemy.skills.length && Math.random()<(enemy.skillChance||0.4)){
        skillKey = enemy.skills[Math.floor(Math.random()*enemy.skills.length)];
      }
      if(skillKey==='heal' && enemy.hp < enemy.maxhp*0.5){
        const h = Math.round(enemy.maxhp*0.2);
        enemy.hp = Math.min(enemy.maxhp, enemy.hp+h);
        updateEnemyHpBar();
        popDamage('+'+h,'heal');
        setBattleMsg(`${enemy.name}이(가) 상처를 치유했다!`, `HP +${h}`);
        finishEnemyTurn();
        return;
      }
      let dmg;
      let label = `${enemy.name}의 공격!`;
      if(skillKey==='smash'){ dmg = Math.round(enemy.atk*1.6); label = `${enemy.name}이(가) 강타를 날린다!`; }
      else if(skillKey==='bite'){ dmg = Math.round(enemy.atk*1.4); label = `${enemy.name}이(가) 물어뜯는다!`; }
      else if(skillKey==='curse'){ dmg = Math.round(enemy.atk*1.3); label = `${enemy.name}이(가) 저주를 건다!`; }
      else if(skillKey==='heroWarriorSmite'){ dmg = Math.round(enemy.atk*2.0); label = `${enemy.name}이(가) 필멸의 참격을 내리찍는다!`; }
      else if(skillKey==='heroMageBurst'){ dmg = Math.round(enemy.atk*2.2); label = `${enemy.name}이(가) 멸망의 화염구를 쏘아보낸다!`; }
      else if(skillKey==='heroRogueSlash'){ dmg = Math.round(enemy.atk*1.9); label = `${enemy.name}이(가) 그림자처럼 스며들어 베어낸다!`; }
      else if(skillKey==='heroPaladinSmite'){ dmg = Math.round(enemy.atk*1.7); label = `${enemy.name}이(가) 심판의 빛을 내려찍는다!`; }
      else if(skillKey==='heroMechanicBlast'){ dmg = Math.round(enemy.atk*1.8); label = `${enemy.name}이(가) 장치를 기폭시킨다!`; }
      else if(skillKey==='heroJesterGamble'){
        if(Math.random()<0.5){ dmg = Math.round(enemy.atk*3.0); label = `${enemy.name}의 동전이 앞면으로 떨어진다! 회심의 일격!`; }
        else { dmg = 0; label = `${enemy.name}의 동전이 뒷면으로 떨어진다…`; }
      }
      else if(skillKey==='trueBossJudgment'){ dmg = Math.round(enemy.atk*1.9); label = `${enemy.name}이(가) 태초의 심판을 내리찍는다!`; }
      else if(skillKey==='krakenGrip'){ dmg = Math.round(enemy.atk*1.75); label = `${enemy.name}이(가) 촉수로 온몸을 옥죈다!`; }
      else if(skillKey==='ironCrush'){ dmg = Math.round(enemy.atk*1.9); label = `${enemy.name}이(가) 쇳덩이 같은 주먹을 내리찍는다!`; }
      else if(skillKey==='wraithWail'){ dmg = Math.round(enemy.atk*1.55); label = `${enemy.name}의 귀곡성이 정신을 뒤흔든다!`; }
      else if(skillKey==='eliteFerocity'){ dmg = Math.round(enemy.atk*2.1); label = `${enemy.name}이(가) 정예의 위압적인 기세로 짓쳐든다!`; }
      else { dmg = enemy.atk + Math.floor(Math.random()*3)-1; }

      if(dmg<=0){
        setBattleMsg(label, `공격이 완전히 빗나갔다!`);
        if(checkBattleEnd()) return;
        resetCommandUI();
        return;
      }

      const dodgeChance = getSpecialSum('dodgeChance') + getBloodPactDodgeBonus();
      if(dodgeChance>0 && Math.random()<dodgeChance){
        playBanner('회피!','dodge');
        setBattleMsg(label, `${player.name}이(가) 재빠르게 공격을 피했다!`);
        if(checkBattleEnd()) return;
        resetCommandUI();
        return;
      }

      let mitigated = Math.max(1, dmg - player.def);
      if(player.buffDefTurns > 0){
        mitigated = Math.max(1, Math.round(mitigated * player.buffDefMult));
        player.buffDefTurns -= 1;
        if(player.buffDefTurns <= 0){ player.buffDefTurns = 0; player.buffDefMult = 1; }
      }
      if(player.guardingNextHit){ mitigated = Math.round(mitigated*0.4); player.guardingNextHit=false; }

      let counterOathChance = 0;
      if(player.buffCounterTurns > 0){
        counterOathChance = player.buffCounterChance || 0;
        player.buffCounterTurns -= 1;
        if(player.buffCounterTurns <= 0){ player.buffCounterTurns = 0; player.buffCounterChance = 0; }
      }

      let reduceMult = 1;
      if(epicSetTier('paladin')>=2 && player.maxhp>0 && (player.hp/player.maxhp)>0.5){
        reduceMult -= 0.15;
      }
      if(battleFlags && battleFlags.rig && battleFlags.rig.shieldPct){
        reduceMult -= battleFlags.rig.shieldPct;
      }
      reduceMult += getRelicSum('dmgTakenPctMult');
      if(battleFlags && battleFlags.diceEffect==='dmgtaken') reduceMult += 0.3;
      reduceMult = Math.max(0.15, reduceMult);
      if(reduceMult!==1) mitigated = Math.max(1, Math.round(mitigated*reduceMult));

      let extraMsg = '';

      // 뱀의 허물: 이번 전투에서 실제로 HP 피해를 받는 첫 순간에만 발동(회피/빗나감엔 발동하지 않음 — 이 지점까지 오면 이미 그 조건은 통과한 것)
      if(mitigated>0 && hasRelicFlag('snakeskinFirstHit') && battleFlags && !battleFlags.snakeskinUsed){
        mitigated = Math.max(1, Math.round(mitigated*0.5));
        battleFlags.snakeskinUsed = true;
        extraMsg += ' 뱀의 허물이 충격을 완화했다!';
      }

      // 죽음을 막는 효과들의 우선순위: 꺼지지 않는 촛불(런 전체 1회) > 수호자의 부적(전투당 1회)
      if(mitigated >= player.hp && hasRelicFlag('undyingCandle') && !player.candleUsed){
        player.candleUsed = true;
        mitigated = player.hp - 1;
        playBanner('불멸의 빛!','phoenix');
        extraMsg += ' 꺼지지 않는 촛불이 마지막 빛을 밝혀 죽음을 막아냈다!';
      } else if(mitigated >= player.hp && battleFlags && !battleFlags.guardian && hasSpecial('guardianShield')){
        mitigated = 0;
        battleFlags.guardian = true;
        playBanner('완전 방어!','guardian');
        extraMsg += ' 수호자의 부적이 치명적인 일격을 완전히 막아냈다!';
      }

      player.hp = Math.max(0, player.hp - mitigated);
      checkPaladinAwoken();
      if(mitigated>0) Sound.hit();

      // 거울의 파편(반사) / 복수자의 반지(다음 공격 무장) — 실제로 HP 피해를 받았을 때만 발동
      if(mitigated>0){
        if(hasRelicFlag('mirrorReflectPct')){
          const reflectDmg = Math.max(0, Math.round(mitigated*getRelicSum('mirrorReflectPct')));
          if(reflectDmg>0){
            enemy.hp = Math.max(0, enemy.hp-reflectDmg);
            updateEnemyHpBar();
            popDamage('-'+reflectDmg,'counter');
            extraMsg += ` 거울의 파편이 ${reflectDmg}의 피해를 반사했다!`;
          }
        }
        if(hasRelicFlag('revengeArmBonus') && battleFlags){
          battleFlags.revengeArmed = true;
        }
        // 인내(mastery_endurance): 실제로 HP 피해를 입을 때마다 스택이 쌓인다.
        // 파훼일격(warriorEnduranceActive) 사용 시 전부 소모된다.
        if(player.skills && player.skills.includes('mastery_endurance') && battleFlags){
          battleFlags.enduranceStacks = (battleFlags.enduranceStacks||0) + 1;
        }
      }

      if(player.hp<=0 && battleFlags && !battleFlags.phoenix && hasSpecial('reviveOnce')){
        const ratio = getReviveRatio();
        player.hp = Math.max(1, Math.round(player.maxhp*ratio));
        battleFlags.phoenix = true;
        playBanner('부활!','phoenix');
        extraMsg += ` 불사조의 깃털이 타올라 되살아났다! (HP ${player.hp})`;
      }

      renderStatus();
      setBattleMsg(label, `${player.name}은(는) ${mitigated}의 피해를 입었다.${extraMsg}`);

      const counterChance = getSpecialSum('counterChance') + counterOathChance;
      if(player.hp>0 && counterChance>0 && Math.random()<counterChance){
        setTimeout(()=>{
          const counterDmg = Math.max(1, Math.round(effectiveAtk()*0.5) - getEffectiveEnemyDef(enemy.def));
          enemy.hp = Math.max(0, enemy.hp-counterDmg);
          updateEnemyHpBar(); shakeEnemy(); popDamage('-'+counterDmg,'counter');
          Sound.slash();
          setBattleMsg(`${player.name}의 반격!`, `${counterDmg}의 피해로 되갚아주었다!`);
          if(checkBattleEnd()) return;
          resetCommandUI();
        }, 400);
        return;
      }

      if(checkBattleEnd()) return;
      resetCommandUI();
    }, 700);
  }
  function finishEnemyTurn(){
    if(checkBattleEnd()) return;
    resetCommandUI();
  }

  function applyDot(spec){
    if(!spec) return;
    const basisVal = spec.basis==='atk' ? effectiveAtk() : player.mag;
    let dmgPerTurn = Math.max(1, Math.round(basisVal*spec.ratio));
    const boost = getDotBoostRatio(spec.type);
    if(boost>0) dmgPerTurn = Math.round(dmgPerTurn*(1+boost));
    if(!enemy.dots) enemy.dots = [];
    // 같은 종류의 상태이상은 갱신(덮어쓰기), 다른 종류는 함께 누적되어 동시에 적용된다
    const existing = enemy.dots.find(d=>d.type===spec.type);
    if(existing){
      existing.turns = spec.turns; existing.dmgPerTurn = dmgPerTurn; existing.label = spec.label;
    } else {
      enemy.dots.push({type:spec.type, turns:spec.turns, dmgPerTurn, label:spec.label});
    }
    playStatusFx(spec.type);
    Sound.statusApply(spec.type);
    updateStatusBadges();
  }
  // 스킬에 정의된 단일 dot(s.dot) 또는 다중 dot(s.dots) 배열을 모두 함께 적용하고,
  // 부여된 상태이상 이름들을 메시지용 문자열로 반환한다
  function applySkillDots(s){
    const specs = s.dots ? s.dots : (s.dot ? [s.dot] : []);
    specs.forEach(applyDot);
    return specs.map(sp=>sp.label).join(', ');
  }

  function applySkillModifiers(dmg, s){
    let d = dmg;
    let triggered = false;
    if(s.executeBonus && enemy.maxhp>0 && (enemy.hp/enemy.maxhp) <= s.executeBonus.vsHpPct){
      d = Math.round(d * s.executeBonus.mult); triggered = true;
    }
    if(s.executeVsStatus && enemy.dots && enemy.dots.some(dt=>dt.type===s.executeVsStatus && dt.turns>0)){
      d = Math.round(d * (s.executeVsStatusMult || 1.4)); triggered = true;
    }
    if(s.statusSynergyBonus){
      const activeTypes = new Set(((enemy && enemy.dots) ? enemy.dots : []).filter(dt=>dt.turns>0).map(dt=>dt.type)).size;
      if(activeTypes > 0){
        d = Math.round(d * (1 + activeTypes*s.statusSynergyBonus));
        triggered = true;
      }
    }
    if(s.selfHpBonusMax){
      const missingRatio = 1 - (player.hp/player.maxhp);
      d = Math.round(d * (1 + missingRatio*s.selfHpBonusMax));
    }
    return {value: Math.max(1, d), triggered};
  }

  function effectiveAtk(){
    let a = player.atk;
    if(player.buffAtkTurns > 0) a = Math.round(a * (player.buffAtkMult||1));
    return a;
  }
  function consumeAtkBuff(){
    if(player.buffAtkTurns > 0){
      player.buffAtkTurns -= 1;
      if(player.buffAtkTurns <= 0){ player.buffAtkTurns = 0; player.buffAtkMult = 1; }
    }
  }
  // 혈서(mastery_bloodpact): HP가 낮을수록 회피율이 오른다(체력 0에 가까울수록 최대 +35%p).
  function getBloodPactDodgeBonus(){
    if(!(player.skills && player.skills.includes('mastery_bloodpact'))) return 0;
    if(!player.maxhp) return 0;
    const missingRatio = 1 - (player.hp/player.maxhp);
    return missingRatio * 0.35;
  }
