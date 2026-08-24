# HANDOFF

## 현재 작업

전사 리뉴얼. **인내의 파훼자(warrior_endurance) 분기를 삭제하고, "오직 기본
공격만 쓰는" 신규 분기 「일격의 구도자(warrior_purist)」로 교체**했다.
혈맹의 검투사는 이전에 이미 완료된 상태 그대로 무수정. 나머지 5개 직업
(마법사·도적·성기사·메카닉·도박사)은 이번 작업 대상이 아니었다.

작업은 두 턴에 걸쳐 진행됐다: 1턴에서 분기 자체를 구현했고, 2턴에서
사용자 피드백에 따라 밸런스 수치를 하향 조정하고 마나를 0으로 고정했다.
이 문서는 두 턴을 합친 최종 상태 기준이다.

사용자가 실제 최신 파일(`skills.js`, `jobs.js`, `player-actions.js`,
`enemy-turn.js`, `battle-end.js`)을 채팅에 직접 붙여넣어 제공했고, 그 중
실제로 수정이 필요했던 파일들을 컨테이너에 써서 `node --check`로 검증했다.
`enemy-turn.js`는 이번 분기가 요구하는 로직이 전부 `playerAttack()` 안에서
끝나 수정하지 않았다.

## 일격의 구도자(warrior_purist) 최종 설계

- **액티브 스킬이 없다.** 레벨10 마스터리 + 레벨12 + 레벨15, 총 3개
  패시브만 습득한다.
- **레벨10 마스터리 "순일격"(`mastery_purestrike`)**: 기본 공격 피해
  **+15%**.
- **레벨12 "메아리 타격"(`warriorPuristEcho`)**: 기본 공격을 낼 때마다
  `battleFlags.basicAtkCount`를 세어, 짝수 번째(2타/4타/6타…) 기본 공격에
  **+25%** 추가.
- **레벨15 "쌍격의 파문"(`warriorPuristDoubleStrike`)**: 기존 희귀 장비의
  "확률로 기본 공격이 한 번 더 나가는" 시스템(`getSpecialSum
  ('doubleStrikeChance')`)에 **+20%p**를 그대로 얹어 재사용.
- **마나가 항상 0으로 고정된다.** 전직 시점(`combat/job-advancement.js`)과
  레벨업 시점(`combat/battle-end.js`) 양쪽에서 `player.maxmp`를 0으로
  강제한다(아래 "밸런스/마나 처리" 참고). 애초에 세 패시브 전부 `mp:0`이라
  마나가 필요 없는 컨셉을 스탯에도 그대로 반영한 것.

수치 조정 배경: 최초 구현(순일격 +25%, 메아리 타격 +40%, 쌍격의 파문
+30%p)은 세 패시브가 곱연산으로 겹치면 장기적으로 기본 공격 피해가 약
2배 가까이 뻥튀기되어, 다른 분기의 마스터리 단일 효과(보통 15~30%대)에
비해 과했다. 사용자 피드백에 따라 15%/25%/+20%p로 낮췄고, 조정 후 기대
배율은 대략 `1.15 × 1.125(짝/홀 평균) × 1.2(더블 확률) ≈ 1.55배` 수준이다.

## 변경된 파일

- **`data/skills.js`** — `mastery_purestrike`, `warriorPuristEcho`,
  `warriorPuristDoubleStrike` 3개 신규 스킬 추가(수치는 위 최종값
  15%/25%/20%로 반영됨). 기존 `mastery_endurance`/`warriorEnduranceActive`는
  **삭제하지 않고 그대로 유지**했다(아래 "주의사항" 참고).
- **`data/jobs.js`** — `JOB_SPECIALIZATIONS.warrior`에서 `warrior_endurance`
  항목을 제거하고 `warrior_purist`(이름: "일격의 구도자", 아이콘 🎯)로 교체.
  `activeName`/`activeDesc`/`activeSkillId`는 모두 `null`.
  `skillLevels: {12:'warriorPuristEcho', 15:'warriorPuristDoubleStrike'}`는
  혈맹의 검투사와 동일한 구조라 `battle-end.js`의 레벨업 스킬 지급 루프를
  그 부분은 수정하지 않고도 그대로 동작한다. `masteryDesc` 텍스트 수치도
  15%로 동기화.
- **`combat/player-actions.js`** — `playerAttack()`에 3개 패시브의 실제
  피해 계산 로직 추가(15%/25%/+20%p). 계율(`mastery_creed`) 관련 기존
  코드는 그대로 두고 그 아래에 이어 붙이는 방식으로 삽입.
- **`combat/job-advancement.js`** —
  1. `resolveJobAdvancement()`의 각성 안내 로그를 수정: `activeName`이
     없는(= `null`인) 분기에서 `「null」을(를) 익혔다`라고 출력되던 문제를
     고쳐, 마스터리/액티브 각각 실제로 존재할 때만 문구에 포함하도록 변경.
  2. `resolveJobAdvancement()`에 `specId === 'warrior_purist'` 분기 추가:
     전직 시점에 `player.maxmp`를 0으로 강제(기존에 붙던 `+8` 보너스까지
     포함해 완전히 0).
- **`combat/battle-end.js`** — `grantExp()`의 레벨업 루프에
  `player.specialization === 'warrior_purist'`일 때 `maxmp += 4`를
  건너뛰는 조건 추가. 그 외 로직은 원본과 100% 동일.

## 현재 정상 동작(확인 수준)

- 5개 파일 전부 `node --check` 문법 통과
- `jobs.js`에서 `JOB_SPECIALIZATIONS.warrior`가 정확히
  `['warrior_bloodpact', 'warrior_purist']` 2개만 남아있음을 스크립트로 확인
- `skills.js`/`jobs.js`/`player-actions.js` 세 파일의 수치(15%/25%/20%)가
  서로 일치함을 `grep`으로 교차 확인
- `job-advancement.js`와 `battle-end.js` 양쪽에 `warrior_purist` 마나 0
  처리가 정확히 들어갔음을 확인
- **실제 브라우저/jsdom 스모크 테스트는 하지 못했다** — `state.js`,
  `storage.js`, `explore.js`, `battle-fx.js`, `battle-setup.js` 등 나머지
  파일이 이 대화에 없어 전체 게임을 조립해 실행할 수 없었다. 문법 검사와
  파일 간 상호 참조(스킬 키 일치, 수치 동기화 등) 확인까지만 가능했다

## 테스트 필요

- 실제 게임에서 레벨10에 일격의 구도자를 선택했을 때 전직 UI/로그 메시지가
  자연스럽게 나오는지(활성 스킬 문구가 빠진 채로)
- 레벨12/15 도달 시 두 패시브가 실제로 `grantExp()`를 통해 지급되는지
- 조정된 수치(15%/25%/+20%p)의 실제 체감 밸런스가 혈맹의 검투사 대비
  적절한지
- 전직 직후와 이후 여러 번 레벨업을 거친 뒤에도 마나가 계속 0으로
  유지되는지(레벨업이 한 번에 여러 번 처리되는 경우 포함 — `grantExp()`의
  `while` 루프 안에서 매 반복 조건을 재확인하므로 문제없을 것으로 예상되나
  미검증)
- 마나 0 상태에서 전투 화면 MP 바 UI가 깨지지 않는지(UI 파일이 없어 확인
  못함)
- `battleFlags.basicAtkCount`가 전투마다 실제로 초기화되는지
- 이전부터 누적된 항목(다른 5개 직업 12분기, 유물/저주 제단, storage.js
  저장 확인, 전체 브라우저 테스트 등) 전부 여전히 미해결

## 알려진 문제 / 미해결

- **기존 `mastery_endurance`/`warriorEnduranceActive` SKILLDB 항목을
  의도적으로 남겨뒀다.** `JOB_SPECIALIZATIONS.warrior`에서는 빠졌으니 새로
  선택할 수는 없지만, 혹시 이미 그 분기를 선택한 테스트 캐릭터(저장
  데이터)가 있다면 `getSpecialization(player)`이 더 이상 해당 분기를
  찾지 못해 `null`을 반환한다 — `player.skills` 안의 스킬 자체는 여전히
  SKILLDB에 남아있어 사용은 계속 가능하지만, 분기 이름/아이콘 표시가
  필요한 화면(있다면)에서 빈 값이 나올 수 있다. 실제 테스트 캐릭터가
  있는지 사용자 확인 필요(없다면 완전 삭제해도 무방)
- 나머지 5개 직업(12분기 중 10분기)은 이번 리뉴얼 대상이 아니었음 — 계속
  리뉴얼할 계획인지 사용자 확인 필요
- 이전부터 누적: `paladinJudgmentLight`/`divinejudgment` 이름 중복,
  데토네이터 스택/운 게이지/카드 손 전용 UI 부재, `storage.js` 미확보,
  CSS 분리·GitHub 반영 등 전부 미착수

## 주의사항

- **`playerAttack()` 안에서 신규 패시브 3개는 전부 `dmg` 계산 초반부
  (`applyOutgoingDamageMods` 호출 전)에서 처리**하도록 배치했다. 다른
  전역 배율 시스템과 곱연산 순서가 꼬이지 않도록, 새 패시브를 추가할 때도
  이 위치에 이어 붙이는 관례를 유지할 것
- **`warriorPuristDoubleStrike`는 별도 변수를 만들지 않고 기존
  `doubleChance` 변수에 직접 가산**하는 방식으로 구현했다("희귀아이템처럼"
  사용자 요청). 비슷한 "확률로 한 번 더" 계열 패시브를 또 만들 때 이
  전례를 참고할 것
- **레거시 SKILLDB 항목 삭제 금지 원칙**: 분기를 교체/삭제할 때, 이미
  지급됐을 수 있는 스킬의 SKILLDB 항목 자체는 남겨두고
  `JOB_SPECIALIZATIONS`에서만 빼는 방식을 기본으로 할 것(기존 세이브
  크래시 방지)
- **`warrior_purist`의 "마나 0" 예외는 정확히 두 곳(전직 시점 `job-
  advancement.js` + 레벨업 시점 `battle-end.js`)에 나눠 걸려있다.** 나중에
  이 분기의 스탯 보너스 공식을 또 손보게 되면 이 두 지점을 함께 확인할 것
  — 한쪽만 고치면 마나가 다시 차오르는 회귀가 생긴다
- 밸런스 수치를 또 조정하게 되면 `data/skills.js`(desc) / `data/jobs.js`
  (masteryDesc) / `combat/player-actions.js`(실제 상수) 세 곳을 항상 함께
  맞출 것
- `combat/job-advancement.js`의 각성 로그가 이제 `masteryName`/`activeName`
  각각의 존재 여부를 개별 확인하므로, 액티브가 없는 분기를 또 추가해도
  별도 수정 없이 자동으로 잘 처리된다

## 다음 작업

1. 사용자에게 이번 5개 파일을 실제 프로젝트에 반영해달라고 요청(이 세션은
   파일을 직접 프로젝트에 반영할 수단이 없음 — 채팅으로 받은 내용을
   수정해 다시 전달하는 방식으로 작업함)
2. 반영 후 브라우저에서 일격의 구도자로 레벨10 전직 → 레벨12/15 추가
   레벨업까지 실제로 플레이하며 마나 0 유지·수치 체감 확인
3. 다른 5개 직업(마법사·도적·성기사·메카닉·도박사)도 리뉴얼할지 여부와
   방향 사용자 확인
4. 이전부터 밀려있는 항목(스토리지 확인, 전체 브라우저 테스트, CSS 분리,
   GitHub 반영, 이름 중복 문제 등) 우선순위 재확인

## 다음 작업 시 확인할 파일

- 이번에 수정한 5개 파일(`data/skills.js`, `data/jobs.js`,
  `combat/player-actions.js`, `combat/job-advancement.js`,
  `combat/battle-end.js`)이 최신 상태 — 실제 프로젝트에 반영한 뒤 결과를
  다음 세션 시작 시 알려줄 것
- `combat/battle-setup.js` — `battleFlags.basicAtkCount`가 매 전투 정상
  초기화되는지 재확인하려면 필요(이번에도 없었음)
- MP 바를 그리는 UI 파일(파일명 미상 — `state.js`의 `renderStatus()`일
  가능성이 높음) — 마나 0 표시가 깨지지 않는지 확인하려면 필요할 수 있음
- 다른 5개 직업 리뉴얼을 진행하게 되면 동일하게 `skills.js`/`jobs.js`/
  `player-actions.js`/`enemy-turn.js` 최신본이 필요

## 작업 중단 지점

전사의 인내의 파훼자 → 일격의 구도자 교체(패시브 3개, 액티브 없음)와
밸런스 조정(15%/25%/+20%p), 마나 0 고정(전직 시점 + 레벨업 시점 양쪽)까지
구현과 문법 검증 완료. 실제 프로젝트 반영과 브라우저 실행 테스트는 아직
이루어지지 않았다. 다음 세션(또는 이 대화의 다음 턴)은 사용자가 반영
결과를 알려주거나 새 지시를 주면 이어가면 된다.
