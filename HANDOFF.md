# HANDOFF

## 현재 작업

이전 세션에서 완료한 "22개 파일 분리 리팩토링" 이후, 이번 세션은 **신규 기능 추가** 세
가지를 진행했다. 파일 구조 변경은 없고, 기존 22개 파일 중 6개(`relics.js`,
`equipment.js`, `shop.js`, `records.js`, `battle-end.js`, `bootstrap.js`)에 최소
diff로 코드를 추가했다.

## 이번 세션에서 진행한 작업

**1. 신규 유물 2종 추가**
- **빈 자루의 각오**(`relic_emptysack`, 변칙): 물약/상급 물약/에테르가 모두 0개일 때
  가한 피해 +40%. 실시간 조건부 배율(포션을 다 쓰는 순간 발동, 다시 얻으면 즉시 해제)
- **상인의 그림자 인장**(`relic_merchantseal`, 축복): 상점에서 구매할 때마다 스택 +1
  (최대 10), 스택당 구매 시점 현재 공격력의 +2%를 즉시 반영. `relicAppliedDeltas`에
  누적 기록해 슬롯 교체로 내려놓을 때 정확히 원복됨

**2. 유물 도감(`showRelicDex`)에 능력 설명 표시**
- 기존에는 발견한 유물이 이름/타입만 보였는데, 그 아래 한 줄로 유물 설명(`desc`)이
  보이도록 수정. 미발견 유물은 기존처럼 `？？？ / 🔒`만 표시

**3. "무결 클리어"(사망 0회로 진 최종보스 처치) 기록·표시 시스템**
- 진 최종보스 처치 시 보이는 `showEnding(isTrueEnding)`에서 `player.trueEndingSeen`
  플래그를 남기도록 함
- 엔딩 후 "메인화면으로" 클릭 시 저장되는 기록(record)에 `trueEnding` 필드 추가
- 기록 화면(`records.js`)에서 무결 클리어 기록은 "👑 무결" 골드색 배지로 표시
- 타이틀 화면의 난이도 선택 버튼(`difficulty.js`)에, 해당 난이도에서 무결 클리어
  기록이 하나라도 있으면 난이도 이름 앞에 👑 증표가 표시됨(`easyFlawless`/
  `normalFlawless`/`hardcoreFlawless` 모듈 상태 + `isDifficultyFlawless()` 헬퍼)

## 변경된 파일

- `relics.js` — RELICS에 유물 2종 추가, `removeRelic()`에 인장 스택 리셋,
  `applyMerchantSealPurchase()` 신규 함수(+export 주석 갱신)
- `equipment.js` — `getEmptySackMult()` 신규 함수, `applyOutgoingDamageMods()`
  배율 체인에 한 줄 추가
- `shop.js` — 구매 성공 공통 지점에 `applyMerchantSealPurchase()` 호출 추가
  (+의존성 주석 갱신)
- `records.js` — 유물 도감 표시에 설명 한 줄 추가, `getRelicDisplayDesc()`에
  두 신규 유물의 동적 상태 표시 추가, `renderRecords()`에 무결 배지 추가
- `battle-end.js` — `showEnding()`에 `player.trueEndingSeen` 기록 한 줄 추가
- `bootstrap.js` — 기록 저장 시 `trueEnding` 필드 추가, 기록 로드하는 두 지점
  모두에서 난이도별 무결 플래그(`easyFlawless` 등) 계산 로직 추가
- `difficulty.js` — `easyFlawless`/`normalFlawless`/`hardcoreFlawless` 상태,
  `isDifficultyFlawless()`, 카드 렌더링에 👑 표시 로직 추가(+export 주석 갱신)

## 현재 정상 동작(확인 수준)

- 6개 파일 전부 `node --check` 문법 통과
- 각 파일을 수정 전 원본과 `diff`로 비교해, 의도한 부분 외에는 원본 코드가 그대로
  유지됨을 확인함
- **주의**: 이번 세션은 브라우저 실행/jsdom 스모크 테스트를 하지 않았다. 문법 검증과
  diff 대조만 마친 상태이며, 실제 동작(스탯 반영, 저장/불러오기, 화면 렌더링)은
  아직 확인되지 않았다

## 테스트 필요

- **빈 자루의 각오**: 전투 중 포션류를 모두 소진했을 때 실제로 피해량이 오르는지,
  포션을 다시 얻으면 즉시 해제되는지
- **상인의 그림자 인장**: 상점에서 연속 구매 시 스택이 정확히 10에서 멈추는지,
  "내 유물" 화면에 스택이 올바르게 표시되는지, 슬롯 교체로 내려놓을 때 공격력이
  정확히 원복되는지(특히 중간에 장비 착용/해제 등으로 공격력이 바뀐 상태에서도
  델타 값이 꼬이지 않는지)
- **유물 도감 설명 표시**: `.relicdex-row`의 실제 CSS를 확인하지 않은 채 마크업
  구조를 1줄→2줄로 바꿨다. 좁은 화면에서 레이아웃이 깨지거나 답답해 보이지 않는지
  실제로 확인 필요
- **무결 클리어 배지/증표**: 진 최종보스를 사망 없이 처치 → 엔딩 → 메인화면 이동
  흐름에서 기록이 정확히 저장되는지, 난이도 버튼에 👑가 뜨는지, 하드코어처럼
  `checkBattleEnd()`에서 사망 시 캐릭터가 재생성되는 특수 케이스에서도
  `player.trueEndingSeen`이 의도대로 동작하는지(재생성 로직은 이번 세션에서
  손대지 않음)
- 이전 세션의 "테스트 필요" 목록(유물/저주 제단 UI, 장비 세트효과, 보스소굴,
  최종보스, 사운드, PWA 등)은 여전히 미해결 상태로 남아있음

## 알려진 문제

현재 확인된 문제 없음(단, 위 "테스트 필요" 항목 전체가 미검증 상태).

## 주의사항

- `relic_merchantseal`은 `player.merchantSealStack`이라는 새 필드를 쓰는데,
  `storage.js`의 저장 방식(player 객체 전체를 `JSON.stringify`하는 방식으로 추정)이
  화이트리스트 없이 통째로 직렬화한다는 전제 하에 별도 저장 로직을 손대지 않았다.
  이 전제가 맞는지는 실제 저장/불러오기 테스트로 확인해야 한다
- `RELICS`에 새 유물을 추가할 때 기존 관례대로 `relic_` 접두사 id, `type`/`name`/
  `desc`/`effect` 형태를 그대로 따름. 새 `effect` 키(`emptySackDmg`, `merchantSeal`)는
  `hasRelicFlag()`로만 조회되며 `getRelicSum()` 대상(숫자형)이 아님 — 이후 이
  유물들의 수치를 조정하고 싶다면 `equipment.js`의 `getEmptySackMult()`와
  `relics.js`의 `applyMerchantSealPurchase()` 안의 하드코딩된 배율(1.4배, 2%)을
  직접 수정해야 함(RELICS 데이터의 effect 값을 읽어오는 방식이 아님)
- 무결 클리어 판정 자체(진 최종보스가 언제 `isTrueFinal`이 되는지)는 이번 세션에서
  건드리지 않았다 — 이미 이전 세션에 구현되어 있던 것을 전제로, 그 결과를
  기록·표시하는 레이어만 새로 얹었다. 판정 로직 자체를 확인하려면
  `combat/battle-setup.js`를 봐야 함(이번 세션에서 열람하지 않음)

## 현재 개발 상태

| 작업 | 상태 |
|---|---|
| 신규 유물 2종(빈 자루의 각오/상인의 그림자 인장) 구현 | 완료(미검증) |
| 유물 도감 설명 표시 | 완료(미검증) |
| 무결 클리어 기록·배지·난이도 증표 | 완료(미검증) |
| 브라우저 실동작 테스트 | 미착수 |
| CSS 파일 분리 | 미착수 |
| UI/게임 로직 분리 | 미착수 |
| GitHub 리포지토리(`ywf2661/dungeon-crawler`)에 반영 | 미착수 |

## 다음 작업

1. 이번 세션에서 수정한 6개 파일을 실제 프로젝트에 반영한 뒤, 위 "테스트 필요"
   목록을 브라우저에서 직접 플레이하며 확인
2. 특히 상인의 그림자 인장의 스택 원복 로직과, 하드코어 난이도 사망 후 재생성
   케이스에서의 `trueEndingSeen` 동작을 우선 확인 권장
3. 문제 없이 확인되면 이전 세션부터 밀려있는 "GitHub 리포지토리 반영" 작업과
   함께 정리해서 반영
4. (검토, 확정 아님) CSS를 `styles.css`로 분리하는 건도 여전히 보류 중 — 진행
   여부 재확인 필요

## 다음 작업 시 확인할 파일

- `relics.js`, `equipment.js`, `shop.js`, `records.js` — 신규 유물 2종 관련 문제
  발견 시 우선 확인
- `battle-end.js`, `bootstrap.js`, `difficulty.js` — 무결 클리어 기록/표시 관련
  문제 발견 시 우선 확인
- `combat/battle-setup.js` — 진 최종보스(`isTrueFinal`) 판정 로직 자체를 확인해야
  할 경우(이번 세션에서 열람하지 않은 파일)
- `storage.js` — `player.merchantSealStack` 저장/복원이 실제로 잘 되는지 확인할 때

## 작업 중단 지점

세 가지 신규 기능 모두 코드 작성과 문법 검증(`node --check`)·원본 대비 diff 확인까지
마친 상태에서 중단됨. 브라우저 실행 테스트는 진행하지 않았다. 사용자로부터 아직
테스트 결과나 GitHub 반영 여부에 대한 지시가 없는 상태. 다음 세션은 "다음 작업" 1번
(수정된 6개 파일 반영 후 브라우저 테스트)부터 시작하면 된다.
