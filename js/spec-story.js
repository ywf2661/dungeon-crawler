"use strict";
/*
전직별 물음표 이벤트 · 엔딩 분기(스토리 연결 5종) — 데이터와 순수 로직.
설계: docs/superpowers/specs/2026-10-02-spec-events-endings-design.md
export(전역): SPEC_EVENT_WEIGHT, SPEC_PERK, hasSpecPerk, specEventEligible, SPEC_EVENTS
의존성(호출 시점에만): events.js(applyNextBattleCurse/grantSpecificPotion)
주의: 화면(오버레이/버튼)은 events.js의 showSpecEvent()가 맡는다. 이 파일은 DOM을
     만지지 않는다(tests/spec-story.test.js가 node vm으로 바로 불러 쓴다).
*/

  // 전직 후 이벤트 풀 가중치(다른 이벤트 1 대비). 런당 1회(player.specEventSeen).
  const SPEC_EVENT_WEIGHT = 5;
  // 이벤트 ①(메커닉 강화)을 고르면 player.specEventPerk=true — 아래 값이 각 공식에 한 줄씩 들어간다.
  const SPEC_PERK = {
    paladin_knight: 1.15,      // 성휘참 피해 배율(combat/player-actions.js)
    mage_time: 0.05,           // 시간 왜곡 확률 가산(combat/enemy-turn.js getTimeWarpExtraChance)
    warrior_chalna: 1.15,      // 찰나 콤보 배율(combat/player-actions.js chalnaStrike)
    rogue_alchemist: 1.2,      // 잠식 스택당 피해 배율(combat/enemy-turn.js getVenomDmgPerStack)
    mechanic_timepatrol: 1,    // 전투 시작 단서(combat/battle-setup.js battleFlags 초기화)
  };

  // specialization까지 확인한다 — 타임패트롤이 잔상으로 성휘참을 빌려 써도 기사 퍼크는 안 붙는다.
  function hasSpecPerk(p, specId){
    return !!(p && p.specEventPerk && p.specialization===specId);
  }
  function specEventEligible(p){
    return !!(p && p.specialization && !p.specEventSeen && SPEC_EVENTS[p.specialization]);
  }

  // 기존 이벤트 관례(낡은 서고 등): 스탯의 5%, 최소 1.
  function specSmallGain(p, stat){
    const d = Math.max(1, Math.round((p[stat]||0)*0.05));
    p[stat] += d;
    if(stat==='maxmp') p.mp = Math.min(p.maxmp, (p.mp||0)+d);
    return d;
  }
  function specLoseMaxHp(p, pct){
    const d = Math.max(1, Math.round(p.maxhp*pct));
    p.maxhp -= d;
    p.hp = Math.min(p.hp, p.maxhp);
    return d;
  }

  const SPEC_EVENTS = {
    // 회랑의 기사 — 칼리버 X 단계(caliberx_1/2/3)에 따라 검의 반응이 갈린다.
    paladin_knight: {
      title:'빈 검집',
      intro:'부서진 갑주 걸이 옆, 주인 없는 검집 하나가 걸려 있다. 가죽은 다 삭았지만, 칼리버 X와 길이도 폭도 꼭 맞을 것 같다.',
      perkLabel:'검을 꽂아본다 (성휘참 피해 +15%, 최대HP -5% · 영구)',
      safeLabel:'검집만 챙긴다 (방어력 소량 · 영구)',
      skipLog:'검집을 그대로 두고 지나쳤다.',
      perk(p){
        const w = p.equipment && p.equipment.weapon;
        const stageLine = w==='caliberx_3' ? '검집이 검을 알아보지 못한다. 억지로 밀어 넣자, 무언가가 손목을 타고 조금 빠져나간다.'
          : w==='caliberx_2' ? '검이 잠시 망설이다, 이윽고 들어간다. 손끝에 낯선 저릿함이 남는다.'
          : '검이 편안하게 미끄러져 들어간다. 마치 오래전부터 이곳이 제자리였던 것처럼.';
        const lost = specLoseMaxHp(p, 0.05);
        return {lines:['칼리버 X를 검집에 천천히 밀어 넣는다.', stageLine, '다시 뽑아 든 검신이, 아까보다 조금 더 무겁다.'],
          log:`빈 검집에 칼리버 X를 꽂았다. 성휘참 피해 +15% (영구), 최대HP -${lost} (영구).`, cls:'gold'};
      },
      safe(p){ const d = specSmallGain(p, 'def'); return {log:`빈 검집을 챙겼다. 방어력 +${d} (영구)`, cls:'gold'}; },
    },
    mage_time: {
      title:'거꾸로 흐르는 모래시계',
      intro:'작업대 위에 모래시계 하나가 놓여 있다. 모래가 아래에서 위로 떨어지고 있다. 이상하게도, 그게 전혀 이상하게 느껴지지 않는다.',
      perkLabel:'뒤집는다 (시간 왜곡 확률 +5%p · 영구, 대신 다음 전투에서 저주)',
      safeLabel:'모래를 한 줌 쥔다 (최대MP 소량 · 영구)',
      skipLog:'모래시계를 그대로 두고 지나쳤다.',
      perk(p){
        applyNextBattleCurse();
        return {lines:['모래시계를 뒤집는다. 모래가, 이번엔 제대로 아래로 떨어지기 시작한다.', '그 순간 몸속의 시간이 한 박자 앞서 나간다. 대신 무언가가, 비어버린 그 한 박자를 노려본다.'],
          log:'모래시계를 뒤집었다. 시간 왜곡 확률 +5%p (영구). 불길한 기운이 스며든다(다음 전투 받는 피해 +15%).', cls:'warn'};
      },
      safe(p){ const d = specSmallGain(p, 'maxmp'); return {log:`거꾸로 흐르던 모래를 한 줌 쥐었다. 최대MP +${d} (영구)`, cls:'gold'}; },
    },
    warrior_chalna: {
      title:'끝나지 않은 검격',
      intro:'허공에, 누군가 베다 만 검의 궤적이 반쯤 그어진 채 멈춰 있다. 칼날이 지나간 자리만 빛나고, 그 끝은 어디에도 닿지 않았다.',
      perkLabel:'궤적을 이어 벤다 (찰나 콤보 피해 +15% · 영구, 현재 HP -20%)',
      safeLabel:'궤적을 따라 휘둘러 본다 (속도 소량 · 영구)',
      skipLog:'멈춘 궤적을 건드리지 않고 지나쳤다.',
      perk(p){
        const lost = Math.max(0, Math.min(p.hp-1, Math.round(p.hp*0.2)));
        p.hp -= lost;
        return {lines:['멈춘 궤적의 끝에서부터 검을 이어 휘두른다.', '찰나가 닫히는 순간 — 남의 찰나가, 거꾸로 나를 벤다.'],
          log:`끝나지 않은 검격을 이어 벴다. 찰나 콤보 피해 +15% (영구). HP -${lost}`, cls:'gold'};
      },
      safe(p){ const d = specSmallGain(p, 'spd'); return {log:`궤적을 따라 검을 휘둘러 봤다. 속도 +${d} (영구)`, cls:'gold'}; },
    },
    // 역병숙주 — 진료 기록의 "그 손님"은 역병 시절의 일기장의 "낯선 손님"과 이어진다(이름은 말하지 않는다).
    rogue_alchemist: {
      title:'역병 의원의 진료실',
      intro:'역병 의원의 진료실이다. 선반엔 표본 병들이 늘어서 있고, 진료 기록 마지막 장만 겨우 읽힌다.<br>"그 손님이 다녀간 뒤로 환자가 더는 늘지 않는다. …줄지도 않는다."',
      perkLabel:'남은 표본을 몸에 받아들인다 (잠식 피해 +20%, 최대HP -8% · 영구)',
      safeLabel:'약병을 챙긴다 (물약 2개)',
      skipLog:'진료실 문을 조용히 닫고 나왔다.',
      perk(p){
        const lost = specLoseMaxHp(p, 0.08);
        return {lines:['표본 병의 마개를 연다. 검은 기운이 기다렸다는 듯 손끝으로 스며든다.', '몸 안의 역병이, 오래된 친척을 맞이하듯 낮게 웅성거린다.'],
          log:`역병 표본을 받아들였다. 잠식 피해 +20% (영구), 최대HP -${lost} (영구).`, cls:'gold'};
      },
      safe(p){ return {log:`약병을 챙겼다. ${grantSpecificPotion('potion')} ${grantSpecificPotion('potion')}`, cls:'gold'}; },
    },
    // 타임패트롤 — 몸 주인(기관사)과 목소리("???")가 처음으로 의견이 갈린다. 정체는 끝까지 말하지 않는다.
    mechanic_timepatrol: {
      title:'두 번 찍힌 발자국',
      intro:'바닥에 발자국이 찍혀 있다. 같은 자리에, 똑같은 발자국이 두 번 — 한 치의 어긋남도 없이 겹쳐서.',
      perkLabel:'목소리를 따른다 (매 전투 단서 1개로 시작 · 영구)',
      safeLabel:'내 손으로 고친다 (마력 소량 · 영구)',
      skipLog:'발자국을 밟지 않게 비켜 지나갔다.',
      perk(p){
        return {lines:[{text:'…증거다. 같은 순간이 두 번 지나갔다는.', title:'???'}, {text:'기록해 둬라. 앞으로 어느 현장에 가든, 이걸 들고 시작한다.', title:'???'}],
          log:'발자국을 기록해 두었다. 매 전투를 단서 1개로 시작한다 (영구).', cls:'gold'};
      },
      safe(p){
        const d = specSmallGain(p, 'mag');
        return {lines:[{text:'…증거다. 건드리지 마라.', title:'???'}, {text:'내 몸이야. 어긋난 건, 내 손으로 맞춘다.', title:p.name},
          '공구 끝으로 발자국 하나를 조심스럽게 긁어내, 겹친 자국을 하나로 맞춘다.', {text:'…고집하고는.', title:'???'}],
          log:`겹친 발자국을 손수 맞춰 놓았다. 마력 +${d} (영구)`, cls:'gold'};
      },
    },
  };
