# HANDOFF

## 현재 작업

전사 리뉴얼 1단계. **인내의 파훼자(warrior_endurance) 분기를 삭제하고, "오직
기본 공격만 쓰는" 신규 분기 「일격의 구도자(warrior_purist)」로 교체했다.**
혈맹의 검투사는 이전 세션에서 이미 완료된 상태를 그대로 유지(무수정). 나머지
5개 직업(마법사·도적·성기사·메카닉·도박사)은 이번 세션에서 손대지 않았다.

이번 세션은 사용자가 실제 최신 파일 5개(`skills.js`, `jobs.js`,
`player-actions.js`, `enemy-turn.js`, `battle-end.js`)를 채팅에 직접
붙여넣어 제공했다. 그 중 실제로 수정이 필요했던 4개 파일(`enemy-turn.js`는
수정 불필요로 제외)을 컨테이너에 그대로 써넣고 수정한 뒤 `node --check`로
검증했다.

## 일격의 구도자(warrior_purist) 설계

- **액티브 스킬이 없다.** 레벨10 마스터리 + 레벨12 + 레벨15, 총 3개
  패시브만 습득한다(사용자 요청 그대로).
- **레벨10 마스터리 "순일격"(`mastery_purestrike`)**: 기본 공격
  (`playerAttack()`) 피해가 항상 **+25%**.
- **레벨12 "메아리 타격"(`warriorPuristEcho`)**: 기본 공격을 낼 때마다
  `battleFlags.basicAtkCount`를 세어, 짝수 번째(2타/4타/6타…) 기본 공격에
  **+40%** 추가.
- **레벨15 "쌍격의 파문"(`warriorPuristDoubleStrike`)**: 기존에 이미 있던
  "희귀 장비로 확률에 따라 기본 공격이 한 번 더 나가는" 시스템
  (`getSpecialSum('doubleStrikeChance')`)에 **+30%p**를 그대로 얹어서
  재사용했다. 사용자가 "일정확률로 한번더 때리는 희귀아이템처럼"이라고
  직접 요청한 방식과 정확히 같은 메커니즘이라 신규 로직 없이 기존 확률
  변수에 가산하는 것만으로 구현됨.

## 변경된 파일

- `data/skills.js` — `mastery_purestrike`, `warriorPuristEcho`,
  `warriorPuristDoubleStrike` 3개 신규 스킬 추가. 기존 `mastery_endurance`/
  `warriorEnduranceActive`는 **삭제하지 않고 그대로 유지**했다(아래 "주의사항"
  참고).
- `data/jobs.js` — `JOB_SPECIALIZATIONS.warrior` 배열에서 `warrior_endurance`
  항목을 제거하고 `warrior_purist`(이름: "일격의 구도자", 아이콘 🎯)로 교체.
  `activeName`/`activeDesc`/`activeSkillId`를 모두 `null`로 비워둠.
  `skillLevels: {12:'warriorPuristEcho', 15:'warriorPuristDoubleStrike'}`는
  혈맹의 검투사가 이미 쓰던 것과 동일한 구조라 `combat/battle-end.js`의
  `grantExp()`를 전혀 수정하지 않고도 레벨12/15 자동 지급이 그대로 동작한다
  (실제로 grantExp 쪽 파일은 이번에 열람만 하고 손대지 않았다).
- `combat/player-actions.js` — `playerAttack()`에 위 3개 패시브의 실제
  피해 계산 로직 추가. 계율(`mastery_creed`) 관련 기존 코드는 그대로 두고,
  그 아래에 이어 붙이는 방식으로 삽입해 기존 로직 순서를 건드리지 않았다.
- `combat/job-advancement.js` — `resolveJobAdvancement()`의 각성 안내
  로그 문구를 **수정**. 기존 코드는 `spec.activeName`이 항상 존재한다고
  가정하고 `「${spec.activeName}」을(를) 익혔다`를 무조건 붙였는데,
  일격의 구도자는 `activeName`이 `null`이라 그대로 두면 `「null」을(를)
  익혔다`라고 출력되는 문제가 있어 마스터리/액티브 각각 실제로 존재할
  때만 문구에 포함하도록 고쳤다. **이번 세션에서 기존 코드 라인 자체를
  수정한 유일한 파일이다.**

`combat/enemy-turn.js`는 열람은 했으나 이번 신규 분기가 요구하는 로직이
전부 `playerAttack()` 안에서 끝나(별도의 턴 흐름 훅이 필요 없어) 수정하지
않았다.

## 현재 정상 동작(확인 수준)

- 4개 수정 파일 전부 `node --check` 문법 통과
- `jobs.js`에서 `JOB_SPECIALIZATIONS.warrior`가 정확히
  `['warrior_bloodpact', 'warrior_purist']` 2개만 남아있음을 스크립트로 확인
- `skills.js`에 신규 3개 키가 존재하고, 레거시 `mastery_endurance`/
  `warriorEnduranceActive`도 그대로 남아있음을 확인
- `jobs.js`의 `warrior_purist.skillLevels`가 `warrior_bloodpact`와 동일한
  `{12: ..., 15: ...}` 형태임을 확인(= `battle-end.js`의 기존 `grantExp()`
  루프가 무수정으로도 정상 동작할 것으로 예상)
- **실제 브라우저/jsdom 스모크 테스트는 이번 세션에서 하지 않았다** — 다른
  18개 파일(state.js, storage.js, explore.js, battle-fx.js, battle-setup.js
  등)이 이번 대화에 없어 전체 게임을 조립해 실행할 수 없었다. 문법 검사와
  4개 파일 사이의 상호 참조(스킬 키 일치 여부 등) 확인까지만 가능했다

## 테스트 필요

- 실제 게임에서 레벨10에 일격의 구도자를 선택했을 때 전직 UI/로그 메시지가
  깨지지 않고 자연스럽게 나오는지(활성 스킬 문구가 빠진 채로)
- 레벨12/15 도달 시 `warriorPuristEcho`/`warriorPuristDoubleStrike`가 실제로
  `grantExp()`를 통해 지급되는지
- 순일격(+25%) · 메아리 타격(+40%, 짝수타) · 쌍격의 파문(+30%p)이 함께
  중첩됐을 때 체감 밸런스가 적절한지(수치는 전부 다른 유사 패시브와 감으로
  맞춘 가배치값 — 검증 안 됨)
- `battleFlags.basicAtkCount`가 전투마다 실제로 초기화되는지(`battleFlags`
  자체가 매 전투 새로 생성된다는 것은 이전 세션에서 `battle-setup.js`를
  통해 이미 확인된 사실이라 문제 없을 것으로 예상하지만, 이번 세션엔
  `battle-setup.js`가 없어 재확인은 못함)
- 이전부터 누적된 테스트 필요 항목(다른 5개 직업 12분기, 유물/저주 제단,
  storage.js 저장 확인, 전체 브라우저 테스트 등) 전부 여전히 미해결

## 알려진 문제 / 미해결

- **기존 `mastery_endurance`/`warriorEnduranceActive` SKILLDB 항목을
  의도적으로 남겨뒀다.** `JOB_SPECIALIZATIONS.warrior`에서는 빠졌으니 새로
  선택할 수는 없지만, 혹시 이미 그 분기를 선택한 테스트 캐릭터(저장 데이터)가
  있다면 `getSpecialization(player)`이 더 이상 해당 분기를 찾지 못해
  `null`을 반환하게 된다 — `player.skills` 안의 스킬 자체는 여전히
  SKILLDB에 남아있어 사용은 계속 가능하지만, 분기 이름/아이콘 표시가
  필요한 화면(있다면)에서 빈 값이 나올 수 있다. 실제 테스트 캐릭터가 있는지
  사용자 확인 필요
- 마스터리/패시브 3개의 수치(25%/40%/+30%p)는 전부 가배치값, 밸런스 조정
  여지 있음
- 나머지 5개 직업(12분기 중 10분기)은 이번 리뉴얼 대상이 아니었음 —
  전사 리뉴얼이 끝나면 다른 직업도 리뉴얼할 계획인지 사용자 확인 필요
- 이전부터 누적: `paladinJudgmentLight`/`divinejudgment` 이름 중복,
  데토네이터 스택/운 게이지/카드 손 전용 UI 부재, `storage.js` 미확보,
  CSS 분리·GitHub 반영 등 전부 미착수

## 주의사항

- **`playerAttack()` 안에서 신규 패시브 3개는 전부 `dmg` 계산 초반부
  (`applyOutgoingDamageMods` 호출 전)에서 처리**하도록 배치했다. 다른
  전역 배율 시스템(유물 배율 등)과 곱연산 순서가 꼬이지 않도록, 새 패시브를
  추가할 때도 이 위치(초기 dmg 계산 직후, `applyOutgoingDamageMods` 호출
  전)에 이어 붙이는 관례를 유지할 것
- **`warriorPuristDoubleStrike`는 별도 변수를 만들지 않고 기존
  `doubleChance` 변수에 직접 가산**하는 방식으로 구현했다(사용자가 명시적으로
  "희귀아이템처럼"이라고 요청했기 때문). 다음에 비슷한 "확률로 한 번 더"
  계열 패시브를 만들 때 이 전례를 참고할 것
- **레거시 SKILLDB 항목 삭제 금지 원칙**: 이번에 `mastery_endurance`/
  `warriorEnduranceActive`를 지우지 않은 것처럼, 앞으로 분기를 교체/삭제할
  때도 이미 지급됐을 수 있는 스킬의 SKILLDB 항목 자체는 남겨두고
  `JOB_SPECIALIZATIONS`에서만 빼는 방식을 기본으로 할 것(기존 세이브 크래시
  방지)
- `combat/job-advancement.js`의 각성 로그가 이제 `masteryName`/`activeName`
  각각의 존재 여부를 개별 확인하므로, 액티브가 없는 분기를 또 추가하게
  되면 별도 수정 없이 자동으로 잘 처리된다

## 다음 작업

1. 사용자에게 이번 4개 파일을 실제 프로젝트에 반영해달라고 요청(이 세션은
   파일을 직접 프로젝트에 반영할 수단이 없음 — 채팅으로 받은 내용을
   수정해 다시 전달하는 방식으로 작업함)
2. 반영 후 전사 리뉴얼 실동작 확인(위 "테스트 필요" 참고)
3. 다른 5개 직업(마법사·도적·성기사·메카닉·도박사)도 리뉴얼할지 여부와
   방향 사용자 확인
4. 이전부터 밀려있는 항목(스토리지 확인, 전체 브라우저 테스트, CSS 분리,
   GitHub 반영, 이름 중복 문제 등) 우선순위 재확인

## 다음 작업 시 확인할 파일

- 이번에 수정한 4개 파일(`data/skills.js`, `data/jobs.js`,
  `combat/player-actions.js`, `combat/job-advancement.js`)이 최신 상태 —
  실제 프로젝트에 반영한 뒤 결과를 다음 세션 시작 시 알려줄 것
- `combat/battle-setup.js` — `battleFlags.basicAtkCount`가 매 전투 정상
  초기화되는지 재확인하려면 필요(이번 세션엔 없었음)
- 다른 5개 직업 리뉴얼을 진행하게 되면 동일하게 `skills.js`/`jobs.js`/
  `player-actions.js`/`enemy-turn.js` 최신본이 필요

## 작업 중단 지점

전사의 인내의 파훼자 → 일격의 구도자 교체(패시브 3개, 액티브 없음) 구현과
문법 검증까지 완료. 실제 프로젝트 반영과 브라우저 실행 테스트는 아직
이루어지지 않았다. 다음 세션(또는 이 대화의 다음 턴)은 사용자가 파일을
실제로 반영한 뒤 "테스트 필요" 항목부터 확인하거나, 다른 직업 리뉴얼
여부를 지시하면 이어가면 된다.
