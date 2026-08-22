# 어둠의 회랑 — 리팩토링 구조 안내

STEP 2: 단일 파일(`index__10_.html`, JS 4,300여 줄)을 **원본 코드를 한 줄도 재작성하지 않고**
기능별 22개 파일로 분리했습니다. (CSS/HTML은 원본 그대로, 손대지 않음)

## 핵심 방식 — 왜 안전한가

기존 코드는 `<script>(function(){ "use strict"; ... })();</script>` 형태의 **단일 IIFE**였습니다.
이 구조를 깨지 않으면서 여러 파일로 나누기 위해, 다음 원리를 이용했습니다.

> 브라우저에서 여러 개의 `<script>` 태그(모듈이 아닌 일반 classic script)를 로드하면,
> 최상위(top-level)의 `let`/`const`/`function` 선언은 **같은 문서 안의 모든 script 태그가 공유하는
> 하나의 전역 렉시컬 스코프**에 등록됩니다. `window.x` 프로퍼티는 아니지만, 이름으로 서로 참조할 수 있습니다.

그래서 원본의 감싸는 IIFE(`(function(){...})()`)만 제거하고, 원본 순서 그대로 파일 경계에서
자른 뒤 `<script src>`로 같은 순서로 로드하면 **동작이 완전히 동일**합니다.
(각 파일 맨 위에 `"use strict";`를 개별적으로 넣어 원본의 strict mode도 그대로 유지했습니다.)

## 검증 방법

1. `node --check`로 22개 파일 전체 문법 검사 통과.
2. 분리한 파일들을 원본 순서대로 다시 이어 붙였을 때 **원본 스크립트 본문과 바이트 단위로 100% 동일**함을
   Python 스크립트로 대조 확인.
3. `jsdom` + 로컬 HTTP 서버로 실제 브라우저와 동일한 `<script src>` 로딩 방식을 재현하여 스모크 테스트 실행:
   - 캐릭터 생성(`startGame`) → 전투 시작(`startBattle`) → 공격(`playerAttack`) → 스킬 사용(`playerSkill`)
     → 아이템 사용(`playerItem`) → 적 처치까지 → 승리 처리(경험치/골드 획득) → 저장(`saveGame`,
     localStorage 폴백 확인)까지 전체 플로우가 원본과 동일하게 동작함을 확인했습니다.
   - JOBS(6개), SKILLDB(93개 스킬), RELICS(27개), EQUIPMENT(15개) 등 모든 데이터 테이블도 정상 로드됨을 확인.

## 파일 구조

```
index.html                        메인 HTML (CSS/마크업 원본 그대로 + <script src> 22개)
js/
├─ main.js                        진입점 — init() 호출 (반드시 맨 마지막에 로드)
├─ bootstrap.js                   init() 정의, DOM 이벤트 바인딩, 패치노트 모달
├─ sound.js                       Web Audio 기반 BGM/SFX 엔진
├─ monster-visuals.js             몬스터/보스 SVG 생성
├─ storage.js                     저장/불러오기, 기록, 유물도감, 패치노트 영속화
├─ state.js                       전역 게임 상태(player/enemy/depth 등) + 직업 선택 화면
├─ player.js                      신규 캐릭터 생성
├─ records.js                     이전 기록/유물도감 렌더
├─ relics.js                      유물 시스템 + 드랍 테이블 조회
├─ explore.js                     탐험 화면(진행, 휴식, 보스소굴 등)
├─ shop.js                        상점
├─ data/
│  ├─ monsters.js                 MONSTERS/BOSSES/LOCATIONS
│  ├─ jobs.js                     JOBS/JOB_HYBRIDS
│  ├─ equipment.js                장비 데이터 + 착용 로직 + 에픽 세트효과
│  └─ skills.js                   SKILLDB (전 직업 스킬)
├─ ui/
│  ├─ difficulty.js               난이도 선택 UI
│  └─ equipment-ui.js             장비 관리 화면
└─ combat/
   ├─ battle-setup.js             전투 시작, 최종보스, 광폭화 시스템
   ├─ battle-fx.js                전투 연출/이펙트
   ├─ battle-end.js               승패 판정, 엔딩, 경험치/드랍 토스트
   ├─ job-advancement.js          레벨10 전직 UI
   ├─ enemy-turn.js               적 턴 AI 체인
   └─ player-actions.js           공격/스킬/아이템/도망
```

각 파일 최상단 주석에 **역할 / export되는 함수·변수 / 의존하는 다른 파일**을 적어뒀습니다.
"인벤토리 기능 수정" 같은 작업이 필요하면 `js/data/equipment.js`와 `js/ui/equipment-ui.js`만
열어 보면 되고, 스킬 밸런스 조정이면 `js/data/skills.js`와 `js/combat/player-actions.js`(playerSkill)만
보면 됩니다.

## 로드 순서(중요)

`index.html`의 `<script src>` 순서가 곧 실행 순서이며, 원본 코드의 원래 순서와 100% 동일합니다.
새 파일을 추가하거나 순서를 바꿀 때는, 해당 코드가 상단(top-level, 함수 밖)에서 다른 파일의
전역 변수/함수를 즉시 참조하는지 확인해야 합니다. (함수 안에서의 참조는 실행 시점이 로드 완료 이후라
순서 문제가 없습니다 — 대부분의 코드가 이 경우에 해당합니다.)

## 주의사항 (원본 그대로 유지된 위험 포인트)

- `combat/enemy-turn.js`의 `enemyTurn → tickActiveRig → enemyTurnReal → enemyAction` 4단 래핑
  순서를 절대 바꾸지 마세요(마녀의 시계 유물, 자동 포탑 기능이 이 순서에 의존).
- `data/equipment.js`의 에픽 세트효과 함수들(`rogueRegisterHit` 등)은 호출 횟수/순서에 민감한
  "소비형" 로직입니다. 옮기거나 리팩토링할 때 호출 순서를 유지하세요.
