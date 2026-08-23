# HANDOFF

## 현재 작업

전직 시스템 개편(`JOB_SPECIALIZATIONS` 2분기 선택) 진행. **6개 직업(전사·마법사·
도적·성기사·메카닉·도박사) 12분기 전부 코드 작성 완료.** 이번 세션에 메카닉
(로봇군단장/데토네이터)에 이어 도박사(운명의 반란자/패의 마술사)까지 마무리했다.
이번 메시지에서 4개 수정 파일(`skills.js`, `player-actions.js`, `enemy-turn.js`,
`battle-setup.js`)을 실제로 사용자에게 전달함.

## 이번 세션 진행 방식

사용자가 4개 파일(`data/skills.js`, `combat/player-actions.js`,
`combat/enemy-turn.js`, `combat/battle-setup.js`, `data/jobs.js`)의 실제 내용을
채팅에 직접 붙여넣어 제공했다. 실제로 컨테이너에 파일을 써서 `node --check` 문법
검증과 원본 대비 `diff` 대조를 메카닉·도박사 두 단계 모두에서 수행했다(브라우저/
jsdom 스모크 테스트는 여전히 못함 — 다른 22개 파일이 없어 실행 자체가 불가능,
문법과 라인 단위 diff까지만 확인 가능). 최종 산출물인 4개 파일을 present_files로
사용자에게 전달했다.

## 메카닉(로봇군단장/데토네이터) 구현 요약

구현 전 사용자에게 확인한 설계 두 가지:
1. 로봇군단장 동시 유지 로봇 수 상한 → **2기**
2. 데토네이터 "폭발물 개수" → **rig는 기존처럼 1개만 유지, 설치할 때마다 별도
   스택 카운터가 올라 기폭 시 스택만큼 배율이 곱해지는 방식**(다중 rig 방식 아님)

변경 내용:
- `data/skills.js` — `mastery_multideploy`, `mechanicRoleDeploy`,
  `mastery_chaindetonate`, `mechanicDetonate` 4개 스킬 추가(순수 추가)
- `combat/player-actions.js` — `playerSkill()` 진입부에 `mastery_multideploy`
  보유 시 `detonaterig` 타입 스킬 전체 차단, 신규 타입 `legiondeploy`(역할 배치:
  정찰/화력/방벽 무작위, 빈 슬롯 우선 배치) 핸들러 추가, 기존 `deployrig`에
  `mastery_chaindetonate` 스택 증가 로직 추가, 기존 `rigsupport`에 rig2 대상
  분기 추가, 기존 `detonaterig`에 스택×15% 배율 추가(순수 추가)
- `combat/enemy-turn.js` — **유일하게 기존 라인을 수정한 파일.**
  `tickActiveRig()`를 `tickActiveRig(slotKey, onDone)`로 시그니처 변경해
  `rig`/`rig2` 순차 처리(`tickRigsThenProceed()` 신설), 피해 경감 계산에
  `rig2.shieldPct` 합산 추가. 단일 rig만 쓰는 기존 직업은 `rig2`가 항상
  비어 있어 실행 흐름·결과는 원본과 동일할 것으로 예상(미검증)
- `combat/battle-setup.js` — `battleFlags.rig2 = null`,
  `battleFlags.detonatorStacks = 0` 초기화 추가(순수 추가)
- `data/jobs.js` — 열람만 함, 수정 안 함(masterySkillId/activeSkillId가 이미
  정확히 사전 정의되어 있었음)

## 도박사(운명의 반란자/패의 마술사) 구현 요약

- `data/skills.js` — `mastery_luckwave`, `jesterRideWave`, `mastery_drawcard`,
  `jesterExchange` 4개 스킬 추가(순수 추가)
- `combat/player-actions.js` —
  - `mastery_drawcard` 보유 시 턴 소모 스킬 사용마다 카드(1~7) 자동 드로우
    (최대 3장 유지) 훅 추가(계율 스택 증가 블록 다음, `cardexchange` 타입은
    중복 드로우 방지를 위해 제외)
  - 신규 타입 `ridewave`(파도타기: 운 게이지 즉시 +3) 핸들러 추가
  - 신규 타입 `cardexchange`(패 교환: 카드 1장 교체 후 조합 재판정) 핸들러 추가
  - `resolveCardCombo()` 헬퍼 함수 신설(트리플>페어>스트레이트 순 판정,
    완성 시 즉시 추가 피해 + `playBanner` 안내 + 손 초기화) — 마스터리 훅과
    `cardexchange` 액티브가 공유
  - 순수 추가만 있고 기존 라인은 diff상 전혀 변경되지 않음
- `combat/enemy-turn.js` —
  - `enemyTurnReal()`(적 실제 턴, 즉 라운드당 1회)에 `mastery_luckwave` 보유
    시 운 게이지 -1~+1 무작위 드리프트(±3 상한) 로직 추가
  - `getLuckWaveBonus()` 신설(게이지 1당 ±7%)
  - `effectiveAtk()`의 배율 계산에 `getLuckWaveBonus()`를 `getCreedAtkBonus()`와
    합산하도록 **기존 한 줄을 수정**(메카닉 단계의 `tickActiveRig` 시그니처
    변경과 마찬가지로, 이번 세션에서 기존 라인 자체를 건드린 두 번째 지점)
- `combat/battle-setup.js` — `battleFlags.luckGauge = 0`,
  `battleFlags.cardHand = []` 초기화 추가(순수 추가)

## 현재 정상 동작(확인 수준)

- 메카닉·도박사 두 단계 모두 4개 파일 전부 `node --check` 문법 통과 확인
- 메카닉 완료 시점 스냅샷과 도박사 반영 후를 diff로 대조해, 도박사 단계에서
  추가된 변경도 `effectiveAtk()`의 의도된 한 줄 수정 외에는 전부 순수 추가임을
  확인함
- **이번 세션 전체를 통틀어 기존 코드 라인 자체가 바뀐 곳은 정확히 두 곳**:
  (1) `enemy-turn.js`의 `tickActiveRig` 시그니처(메카닉 단계),
  (2) `enemy-turn.js`의 `effectiveAtk()` 배율 계산 한 줄(도박사 단계).
  둘 다 기존 마스터리가 없는 캐릭터에게는 결과적으로 영향이 없을 것으로
  설계했으나 실행 테스트로는 확인되지 않았다

## 테스트 필요

- 로봇군단장/데토네이터: 이전 HANDOFF와 동일(로봇 2기 동시사격, 슬롯 교체,
  폭발 스킬 차단 UI, 기폭 스택 상한/리셋)
- 운명의 반란자: 운 게이지가 실제로 라운드마다 오르내리는지, `effectiveAtk()`
  반영이 물리 스킬뿐 아니라 도박사의 다른 데미지 타입(coinflip/gamble/
  finalcard/dicecast — 이들은 `effectiveAtk()`를 그대로 가져다 쓰므로 이론상
  자동 반영되지만 실제 확인 안 됨)에도 자연스럽게 반영되는지, 파도타기 사용
  시 UI에 게이지 상태가 안 보이는데(현재 메시지 텍스트로만 안내) 이대로
  괜찮은지
- 패의 마술사: 카드 3장이 실제로 쌓이고 조합이 정확히 판정되는지(특히 페어
  판정 — `new Set(hand).size < hand.length` 로직이 2장/3장 모두에서 의도대로
  동작하는지), 패 교환 사용 시 카드가 중복으로 뽑히지 않는지, 조합 완성 후
  손이 실제로 비워지는지, 카드 손 UI 표시가 전혀 없는데 이대로 괜찮은지
- `effectiveAtk()` 한 줄 변경이 다른 모든 마스터리 없는 일반 캐릭터에게
  회귀를 일으키지 않는지(게이지가 0이면 `getLuckWaveBonus()`가 0을 반환하므로
  이론상 무영향이나 확인 안 됨)
- 이전 세션들의 테스트 필요 항목(전사~메카닉 전체, 유물/저주 제단, 장비
  세트효과, 보스소굴, 최종보스, 사운드, PWA, `storage.js` 저장 확인 등) 전부
  여전히 누적 미해결

## 알려진 문제 / 미해결

- `paladinJudgmentLight`/`divinejudgment` 이름 중복 — 여전히 미해결
- 데토네이터 기폭 스택, 도박사 운 게이지, 카드 손 — 셋 다 전용 UI 표시가
  전혀 없음(메시지 텍스트로만 안내). 12분기 전체 완료 시점에서 한 번에
  UI 필요 여부를 사용자와 재확인할 필요
- `storage.js` 여전히 미확보
- 이전부터 밀려있는 항목(저주 제단 보상, CSS 분리, GitHub 반영, 전체 브라우저
  테스트) 전부 여전히 미착수

## 주의사항

- `enemyTurn()` 디스패치 순서: 마녀의 시계/시간 왜곡 확률 체크 → 잔영 체크 →
  로봇 슬롯 순차 틱(rig → rig2) → `enemyTurnReal()`(여기서 행운의 파도 게이지
  드리프트 발생) → 상태이상(dot) 처리 → `enemyAction()`. 이 순서는 메카닉
  단계에서 정리된 그대로 유지됨
- `effectiveAtk()`는 이제 `getCreedAtkBonus()` + `getLuckWaveBonus()`를 함께
  합산한다 — 향후 마스터리가 추가로 필요해지면 같은 패턴(작은 get*Bonus 함수를
  만들어 합산식에 더하기)을 유지할 것
- `resolveCardCombo()`처럼 여러 스킬 타입에 걸쳐 공유해야 하는 로직은 별도
  헬퍼 함수로 분리하는 관례가 이번 세션에서도 유지됐다(메카닉의
  `tickActiveRig`, 도박사의 `resolveCardCombo`)

## 다음 작업

1. **최우선**: 이번 세션에서 전달한 4개 파일(및 이전 세션들의 성기사까지
   반영분 포함해 누적된 전체 diff)을 실제 프로젝트에 반영한 뒤, `node --check`
   전체 통과 및 jsdom/브라우저 스모크 테스트를 **처음으로** 실행 — 12분기
   전부 아직 한 번도 실행 테스트가 안 된 상태
2. 레벨10 도달 시 실제 전직 UI가 뜨는 트리거 지점을 확보해 전체 게임 플로우
   검증(선택 UI, 마스터리 자동 습득, 세이브/로드)
3. 데토네이터 스택/운 게이지/카드 손에 대한 전용 UI 표시 필요 여부 사용자
   확인
4. `paladinJudgmentLight` 이름 중복 문제 사용자 확인 후 결정
5. 이전부터 밀려있는 항목(저주 제단 보상, CSS 분리, GitHub 반영) 우선순위
   재확인

## 다음 작업 시 확인할 파일

- 이번 세션에서 전달한 4개 파일(`skills.js`, `player-actions.js`,
  `enemy-turn.js`, `battle-setup.js`)이 최신 상태 — 다음 세션은 이 파일들을
  다시 요청하지 않아도 되도록, 실제 프로젝트에 반영한 뒤 그 결과(반영 완료
  여부, 테스트 결과)를 다음 세션 시작 시 알려줄 것
- `data/jobs.js` — 12분기 전부 이미 정의되어 있어 추가 수정 불필요(확인만
  필요하다면 재요청)
- **`storage.js`는 여전히 미확보**
- 플레이어 턴이 실제로 다시 열리는 지점을 정의한 파일(파일명 미상) — 여전히
  미확보, 우선순위 낮음

## 작업 중단 지점

12분기(전사·마법사·도적·성기사·메카닉·도박사) 전체 코드 작성 완료. 이번
세션 산출물인 4개 파일을 사용자에게 전달함. 실제 프로젝트 반영과 첫 실행
테스트는 아직 이루어지지 않았다. 다음 세션은 "다음 작업" 1번(파일 반영 +
스모크 테스트)부터 시작하면 된다.
