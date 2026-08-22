# PROJECT — 어둠의 회랑 (Corridor of Darkness)

이 문서는 여러 Claude 계정이 이어서 개발할 때 사용하는 프로젝트 기준 문서다.
전체 소스를 다시 읽지 않고도 "어떤 파일을 확인해야 하는가"를 판단하는 용도이며,
소스코드 자체에 대한 장황한 설명은 담지 않는다.

---

## 1. 프로젝트 개요

- **장르**: 1인칭 시점 턴제 던전 크롤러 RPG (중세 판타지)
- **기술 스택**: 순수 Vanilla JavaScript, HTML, CSS. Web Audio API로 BGM/SFX를 실시간 합성(외부 음원 파일 없음). 프레임워크/번들러/빌드도구 없음
- **실행 방법**: `index.html`을 정적 웹서버로 서빙(또는 그냥 브라우저로 열기)하면 바로 동작. 별도 빌드 과정 없음
- **배포 방식**: GitHub Pages (`https://github.com/ywf2661/dungeon-crawler`)
- **주요 특징**:
  - PWA 지원(iPhone 홈 화면 설치)
  - 저장은 `window.storage`(Claude 아티팩트 환경) 우선 사용, 없으면 `localStorage` 폴백
  - 6개 직업 + 레벨10 하이브리드 2차 전직, 장비/희귀/에픽 세트 아이템, 유물(Relic) 시스템, 심도 50 최종보스

---

## 2. 폴더 구조

```
index.html              전체 HTML 마크업 + CSS(<style>, 인라인) + <script src> 22개 로드
README.md                리팩토링 배경 및 검증 방법 설명
js/
├─ main.js                진입점(init() 호출, 파일 목록 최후단)
├─ bootstrap.js            init() 정의, 전체 DOM 이벤트 바인딩, 패치노트 모달
├─ state.js                전역 게임 상태 변수 선언 + 직업 선택 화면 렌더
├─ player.js               신규 캐릭터 생성(newPlayer)
├─ storage.js              저장/불러오기, 기록, 유물도감, 패치노트 상태 영속화
├─ records.js              이전 모험 기록 화면, 유물도감 화면
├─ relics.js               유물 데이터/효과, 유물·저주 제단 UI, 깊이별 드랍 테이블 조회
├─ explore.js              탐험 화면(층 진행, 휴식, 마을 귀환, 보스소굴)
├─ shop.js                 상점 데이터 및 UI
├─ sound.js                Web Audio 기반 BGM/SFX 엔진(Sound 모듈)
├─ monster-visuals.js      몬스터/보스 SVG 생성
├─ data/
│  ├─ monsters.js           MONSTERS, BOSSES, LOCATIONS 데이터
│  ├─ jobs.js                JOBS, JOB_HYBRIDS 데이터 및 조회 함수
│  ├─ equipment.js           장비 데이터(일반/희귀/에픽) + 착용 로직 + 에픽 세트효과 로직
│  └─ skills.js              SKILLDB(전 직업 스킬 데이터)
├─ ui/
│  ├─ difficulty.js          난이도 데이터 및 선택 화면
│  └─ equipment-ui.js        장비 관리 화면
└─ combat/
   ├─ battle-setup.js        최종보스 데이터, 광폭화 시스템, 적 선택, 전투 시작
   ├─ battle-fx.js           전투 연출/이펙트(HP바, 데미지 팝업, 서브메뉴 등)
   ├─ battle-end.js          승패 판정, 엔딩, 경험치/드랍 토스트
   ├─ job-advancement.js     레벨10 하이브리드 전직 선택 UI
   ├─ enemy-turn.js          적 턴 AI 처리 체인
   └─ player-actions.js      플레이어 턴 행동(공격/스킬/아이템/도망)
```

---

## 3. 모듈 구조

이 프로젝트는 **ES Modules(import/export)를 사용하지 않는다.** 대신 원본이 하나의
IIFE(`(function(){...})()`)였던 것을 그 감싸는 함수만 제거하고 classic `<script src>`
22개로 순서대로 로드하는 방식이다. 브라우저는 같은 문서 안의 여러 `<script>` 태그에서
선언된 최상위 `let`/`const`/`function`을 하나의 공유 전역 렉시컬 스코프로 취급하므로,
`import/export` 없이도 파일 간에 이름으로 서로 참조할 수 있다. (`window.x` 프로퍼티가
아니라 식별자 스코프 공유이므로, 콘솔에서 `window.player`로는 접근할 수 없고 `player`로만
접근 가능하다.)

**로드 순서(= `index.html`의 `<script src>` 순서, 절대 임의로 바꾸지 말 것)**

```
sound.js → monster-visuals.js → data/monsters.js → storage.js → state.js
→ ui/difficulty.js → data/jobs.js → data/equipment.js → relics.js → player.js
→ data/skills.js → records.js → bootstrap.js → explore.js → shop.js
→ ui/equipment-ui.js → combat/battle-setup.js → combat/battle-fx.js
→ combat/battle-end.js → combat/job-advancement.js → combat/enemy-turn.js
→ combat/player-actions.js → main.js
```

**모듈 책임 요약**

| 모듈 | 책임 |
|---|---|
| `state.js` | player/enemy/depth 등 전역 상태의 선언(값 초기화는 아님) |
| `player.js` | 상태(state.js)를 바탕으로 실제 `player` 객체 생성 |
| `storage.js` | 상태(state.js)를 읽어 저장/복원 |
| `data/*.js` | 순수 데이터 테이블(로직 없음, `data/equipment.js`는 예외) |
| `relics.js` | 유물 데이터 + 장비 데이터(`data/equipment.js`)를 참조하는 효과 계산 |
| `explore.js` | 탐험 화면 흐름 제어, 전투 진입 시 `combat/battle-setup.js`의 `startBattle` 호출 |
| `combat/*.js` | 전투 전 과정. 서로 강하게 의존(아래 10번 참고) |
| `bootstrap.js` | 다른 모든 모듈의 함수를 이벤트 핸들러에 연결하는 조립 지점 |
| `main.js` | `init()` 한 줄만 호출하는 최종 진입점 |

---

## 4. 게임 실행 흐름

```
페이지 로드
→ 22개 스크립트 순서대로 실행(각 파일의 최상위 데이터/함수 선언)
→ main.js: init() 호출 (bootstrap.js)
  → 상태 초기값 세팅, 직업/난이도 선택 화면 렌더, 전체 DOM 이벤트 바인딩
  → 이전 저장 데이터 있으면 "이어하기" 버튼 노출(storage.js: loadGame 사전 조회)
→ 사용자가 "시작" 또는 "이어하기" 클릭 → startGame() (explore.js)
  → newPlayer()(player.js)로 캐릭터 생성 또는 loadGame()으로 복원
  → showScreen('explore') 후 탐험 화면 진입
→ 탐험 루프: onAdvance()/onRest() 등 사용자 입력에 반응해 상태 변경 → renderStatus()/renderExplore() 재렌더
→ 층 진행 중 몬스터 조우 시 pickEnemy() → startBattle() (combat/battle-setup.js) → showScreen('battle')
→ 전투 루프: 사용자가 공격/스킬/아이템/도망 클릭
  → playerAttack/playerSkill/playerItem/playerRun (combat/player-actions.js)
  → checkBattleEnd() (combat/battle-end.js)로 승패 판정
  → 미종료 시 enemyTurn() (combat/enemy-turn.js) → 다시 checkBattleEnd()
→ 승리 시 grantExp(), 드랍/레벨업 처리 후 showScreen('explore')로 복귀, saveGame()
→ 패배 시 showScreen('gameover')
→ 심도 50 최종보스 처치 시 showEnding() → showScreen('ending')
```

이 전체 흐름은 setInterval 기반의 실시간 게임 루프가 아니라, **사용자 입력 이벤트에
반응해 상태를 바꾸고 다시 그리는 이벤트 기반 구조**다(오디오 스케줄링만 내부적으로
`setTimeout`을 사용, `sound.js`의 `scheduleBgmStep`).

---

## 5. 핵심 게임 상태

모두 `state.js`에서 `let`으로 선언되며, 대부분의 모듈이 참조/변경한다.

| 상태 | 역할 |
|---|---|
| `player` | 플레이어 전체 상태(스탯, 장비, 인벤토리, 유물, 스킬 등). `player.js`의 `newPlayer()`가 생성 |
| `enemy` | 현재 전투 중인 적의 상태. `combat/battle-setup.js`의 `pickEnemy()`/`startBattle()`이 생성 |
| `depth` | 현재 탐험 층(심도). 0 = 마을 |
| `town` | 마을에 있는지 여부(boolean) |
| `battleOver` | 현재 전투가 종료되었는지 여부 |
| `subMode` | 전투 중 서브메뉴 상태('skill' \| 'item' \| null) — `combat/battle-fx.js`의 `openSub/closeSub`가 변경 |
| `battleFlags` | 현재 전투 한정 임시 플래그 모음(예: 주사위 효과 `diceEffect`) — `relics.js`에서 주로 사용 |
| `inBossDen`, `bossDenFloor` | 보스소굴 진입 여부와 층수 — `explore.js`에서 관리 |
| `selectedJobId` | 타이틀 화면에서 선택 중인 직업 — `state.js`(선언) / `bootstrap.js`(초기화) |

---

## 6. 주요 시스템

| 시스템 | 담당 파일 |
|---|---|
| 캐릭터 생성/직업 | `player.js`, `data/jobs.js`, `ui/difficulty.js` |
| 탐험(층 진행, 휴식, 보스소굴) | `explore.js` |
| 상점 | `shop.js` |
| 장비/인벤토리(착용, 에픽 세트효과) | `data/equipment.js`, `ui/equipment-ui.js` |
| 유물(획득, 저주, 드랍 테이블) | `relics.js` |
| 전투 시작/최종보스/광폭화 | `combat/battle-setup.js` |
| 전투 연출/이펙트 | `combat/battle-fx.js` |
| 전투 종료 판정/엔딩/보상 | `combat/battle-end.js` |
| 전직(레벨10 하이브리드) | `combat/job-advancement.js` |
| 적 AI | `combat/enemy-turn.js` |
| 플레이어 턴 행동(공격/스킬/아이템/도망) | `combat/player-actions.js` |
| 몬스터 데이터/도감/SVG | `data/monsters.js`, `monster-visuals.js` |
| 스킬 데이터 | `data/skills.js` |
| 저장/불러오기 | `storage.js` |
| 사운드(BGM/SFX) | `sound.js` |
| 이전 기록/유물도감 화면 | `records.js` |

---

## 7. 주요 함수

**startGame(isContinue)**
- 파일: `explore.js`
- 역할: 새 게임 시작 또는 저장 데이터 이어하기
- 호출: `newPlayer()`(player.js), `loadGame()`(storage.js), `showScreen()`

**startBattle(isBoss, isFinal, isTrueFinal)**
- 파일: `combat/battle-setup.js`
- 역할: 전투 시작 세팅(적 배치, 화면 전환, 커맨드 UI 초기화)
- 호출: `pickEnemy()`, `showScreen('battle')`, `resetCommandUI()`(battle-fx.js)

**playerAttack() / playerSkill(key) / playerItem(key) / playerRun()**
- 파일: `combat/player-actions.js`
- 역할: 플레이어 턴의 4가지 행동 처리(데미지 계산, 상태이상 적용, 연출 트리거, 다음 턴 전환)
- 호출: `applyOutgoingDamageMods()`(relics.js), `checkBattleEnd()`(battle-end.js), `enemyTurn()`(enemy-turn.js)

**enemyTurn() → tickActiveRig() → enemyTurnReal() → enemyAction()**
- 파일: `combat/enemy-turn.js`
- 역할: 적 턴 처리 4단 래핑 체인. 이 호출 순서를 바꾸면 마녀의 시계 유물, 자동 포탑 기능이 깨진다
- 호출: `applyDot()`, `checkBattleEnd()`(battle-end.js)

**checkBattleEnd()**
- 파일: `combat/battle-end.js`
- 역할: 매 행동 직후 승/패/광폭화 여부를 판정하고 다음 상태로 분기
- 호출: `grantExp()`, `showEnding()`, `triggerEnragePhase()`(battle-setup.js)

**equipItem(slot, id) / unequipItem(slot)**
- 파일: `data/equipment.js`
- 역할: 장비 착용/해제 및 스탯 재계산, 에픽 세트효과 재판정
- 호출: `applyEquipStats()`, `checkEpicSetToast()`

**applyRelicEffect(id) / removeRelic(id)**
- 파일: `relics.js`
- 역할: 유물 획득/제거 시 스탯·플래그 반영
- 호출: 유물 제단 UI(`showRelicAltar`, `showCurseAltar`)에서 호출

**saveGame() / loadGame()**
- 파일: `storage.js`
- 역할: `window.storage` 또는 `localStorage`에 게임 상태 영속화/복원(디바운스 처리 포함)
- 호출: `explore.js`, `combat/battle-end.js` 등 상태 변경 지점 다수

---

## 8. 데이터 구조

**player** (`player.js`의 `newPlayer()` 반환값)
스탯(`hp/mp/atk/def/mag/spd`), `job`/`job2`(전직 후), `level/exp/expNext`, `gold`,
`inv`(포션류 개수), `skills`(보유 스킬 id 배열), `equipment`(슬롯별 장착 id),
`equipOwned`(보유 장비 id 배열), `relics`(보유 유물 id 배열)와 관련 슬롯/카운트 필드,
버프 지속 턴/배율 필드 다수.

**enemy** (`combat/battle-setup.js`에서 `MONSTERS`/`BOSSES` 원본을 복제해 생성)
`name/hp/maxhp/atk/def/spd` 등 기본 스탯 + 전투 중 상태이상(dot) 목록.

**JOBS** (`data/jobs.js`) — 배열. 각 원소: `{id, name, icon, desc, statMods, skillLevels}`.
`skillLevels`는 `{레벨: 스킬id}` 맵으로, 레벨업 시 어떤 스킬을 배우는지 결정.

**JOB_HYBRIDS** (`data/jobs.js`) — 두 직업 id 조합(`sortedPairKey`로 정렬된 키)별
레벨10 하이브리드 전직 데이터.

**EQUIPMENT / RARE_EQUIPMENT / EPIC_EQUIPMENT** (`data/equipment.js`) — id를 키로 하는
객체. 각 값: `{name, slot, desc, stats, price, minDepth}`.

**EPIC_SETS** (`data/equipment.js`) — 세트 이름별 필요 장비 id 목록과 세트효과 정의.

**RELICS** (`relics.js`) — id를 키로 하는 객체. 유물별 효과 설명과 적용 로직 연결.

**SKILLDB** (`data/skills.js`) — 스킬 id를 키로 하는 객체. `combat/player-actions.js`의
`playerSkill()`이 이 테이블을 읽어 실제 효과를 실행.

**MONSTERS / BOSSES / LOCATIONS** (`data/monsters.js`) — 층별로 등장 가능한 몬스터/보스
및 층 이름 데이터.

---

## 9. UI 구조

화면은 `index.html`에 5개의 `<div class="screen" id="screen-...">`로 존재하며,
`explore.js`의 `showScreen(id)`가 `.active` 클래스를 토글해 전환한다.

| DOM id | 화면 | 관련 렌더 함수 |
|---|---|---|
| `screen-title` | 타이틀(이름 입력, 직업/난이도 선택) | `renderJobSelect()`(state.js), `renderDifficultySelect()`(ui/difficulty.js) |
| `screen-explore` | 탐험 | `renderStatus()`, `renderExplore()`(explore.js) |
| `screen-battle` | 전투 | `updateEnemyHpBar()`, `setBattleMsg()`, `updateStatusBadges()`(combat/battle-fx.js) |
| `screen-gameover` | 게임오버 | — |
| `screen-ending` | 엔딩 | `showEnding()`(combat/battle-end.js) |

**게임 로직 → UI 연결 방식**: 상태 변경 함수(`playerAttack` 등)가 로직 처리 직후 같은
함수 안에서 곧바로 DOM을 갱신하는 방식(로직과 UI 갱신이 함수 단위로는 분리되어 있지
않음 — `document.getElementById(...)`를 직접 호출). 이번 리팩토링은 파일 분리까지만
진행했고, 로직/UI 함수 자체의 재작성은 하지 않았다.

**이벤트 바인딩**: 모든 `addEventListener`는 `bootstrap.js`의 `init()` 한 곳에 집중되어
있다. 새 버튼을 추가하면 여기에 바인딩을 등록해야 한다.

---

## 10. 파일 간 의존관계

특정 기능을 고칠 때 함께 확인해야 하는 파일 묶음:

- **인벤토리/장비 수정** → `data/equipment.js` + `ui/equipment-ui.js`
- **스킬 밸런스/효과 수정** → `data/skills.js`(데이터) + `combat/player-actions.js`의 `playerSkill()`(실행 로직)
- **유물 추가/수정** → `relics.js` (데이터+로직 함께 있음) + 필요 시 `data/equipment.js`(BLADE_HILT_IDS 등 장비 참조)
- **몬스터/보스 추가** → `data/monsters.js`(데이터) + `combat/battle-setup.js`(pickEnemy/스탯 보정) + `monster-visuals.js`(SVG 추가 시)
- **전투 연출/이펙트 추가** → `combat/battle-fx.js`
- **적 AI 수정** → `combat/enemy-turn.js` (단, 4단 래핑 순서 유지 필수 — 6번 항목 참고)
- **직업/전직 추가** → `data/jobs.js` + `combat/job-advancement.js` + `data/skills.js`(신규 스킬 필요 시)
- **저장 데이터 필드 추가** → `storage.js`(saveGame/loadGame) + `player.js`(newPlayer 기본값) + `state.js`(신규 전역 변수 필요 시)
- **새 버튼/화면 요소 추가** → `index.html`(마크업) + `bootstrap.js`(이벤트 바인딩)

`state.js`는 사실상 모든 파일이 참조하는 공통 의존성이므로, `player`/`enemy` 등의
필드 이름을 바꾸는 변경은 전체 파일에 영향을 줄 수 있다.

---

## 11. 코딩 규칙 (실제 사용 중인 규칙)

- **파일명**: 소문자 kebab-case (`battle-setup.js`, `job-advancement.js`)
- **함수명**: camelCase, 동사로 시작(`renderXxx`, `showXxx`, `applyXxx`, `getXxx`)
- **변수명**: camelCase. 게임 데이터 상수는 대문자 SNAKE_CASE(`JOBS`, `EQUIPMENT`, `SKILLDB`)
- **모듈 작성 방식**: ES Modules 아님. 각 파일 최상단에 `"use strict";` + 역할/export/의존성을
  설명하는 한글 주석 블록을 둔다. `import/export` 문법은 사용하지 않으며, 파일 로드 순서로만
  의존성을 해결한다(3번 항목 참고)
- **상태 관리**: 별도 상태관리 라이브러리 없음. `state.js`의 전역 `let` 변수를 각 파일이
  직접 읽고 쓴다
- **DOM 접근**: `document.getElementById(...)`를 필요한 곳에서 직접 호출(가상 DOM, 템플릿
  엔진 없음). 목록형 UI는 `innerHTML` 템플릿 리터럴로 생성

---

## 12. 리팩토링 완료 상태

- 원본: HTML/CSS/JS가 한 파일(`index__10_.html`, JS 약 4,300줄)에 있던 단일 IIFE 구조
- 변경: 원본 코드를 **한 줄도 재작성하지 않고**, 감싸는 IIFE만 제거한 뒤 원본 순서 그대로
  22개 파일로 분리. 분리 기준은 원본 코드에 이미 있던 섹션 주석(`/* ==== ... ==== */`)
  경계이며, 서로 다른 위치의 코드를 재배치하거나 합치지 않았다
- CSS/HTML 마크업은 이번 리팩토링 범위에 포함되지 않음(원본 그대로 `index.html`에 인라인)
- 검증: 분리된 파일을 원본 순서대로 재결합했을 때 원본 스크립트 본문과 바이트 단위로 동일함을
  확인. jsdom 기반 스모크 테스트로 캐릭터 생성 → 전투 → 스킬/아이템 사용 → 승리 → 저장까지
  전 플로우 정상 동작 확인

---

## 13. 현재 구현 상태

| 기능 | 상태 |
|---|---|
| 캐릭터 생성/직업 선택 | 완료 |
| 난이도 선택(easy/normal/hardcore) | 완료 |
| 탐험(층 진행, 휴식, 마을) | 완료 |
| 전투(공격/스킬/아이템/도망) | 완료 |
| 레벨10 하이브리드 전직 | 완료 |
| 장비(일반/희귀/에픽) 및 세트효과 | 완료 |
| 유물/저주 제단 시스템 | 완료 |
| 보스소굴 | 완료 |
| 최종보스(심도 50) + 광폭화 페이즈 | 완료 |
| 저장/불러오기(아티팩트 스토리지 + localStorage 폴백) | 완료 |
| 사운드(BGM/SFX 실시간 합성) | 완료 |
| PWA(홈 화면 설치) | 완료(단, 이번 리팩토링에서 손대지 않음 — index.html에 원본 그대로 존재) |
| CSS 별도 파일 분리 | 미착수(index.html에 인라인 유지) |
| UI/게임 로직 완전 분리 | 미착수(로직 함수 안에서 직접 DOM 갱신하는 원본 방식 유지) |

---

## 14. 알려진 문제 및 주의사항

- **`enemyTurn` 4단 래핑 순서 고정**: `enemyTurn → tickActiveRig → enemyTurnReal → enemyAction`
  순서를 바꾸면 마녀의 시계 유물, 자동 포탑(가동 장치) 기능이 깨진다(`combat/enemy-turn.js`)
- **소비형 로직의 호출 횟수/순서 민감성**: `data/equipment.js`의 `rogueRegisterHit`,
  `consumeOnHitBonuses`(relics.js) 등은 정확히 1회 호출을 전제로 한다. 리팩토링/기능 추가 시
  호출 순서를 유지해야 한다
- **파일 로드 순서 고정**: `index.html`의 `<script src>` 순서를 바꾸면, 특정 파일의
  최상위(top-level, 함수 밖) 코드가 아직 로드되지 않은 다른 파일의 데이터를 참조할 경우
  `ReferenceError`가 발생할 수 있다. 예: `relics.js`는 최상위에서 `RELIC_ALTAR_POOL`을
  `RELICS`로부터 즉시 계산하므로 `RELICS` 선언이 같은 파일 안에서 앞서 있어야 한다
- **UI/로직 미분리**: 게임 로직 함수 안에서 직접 `document.getElementById`로 DOM을 갱신하므로,
  로직만 따로 테스트하기 어렵다(원본 동작 유지를 위해 이번 리팩토링에서는 그대로 둠)
- **`data/equipment.js`가 데이터+로직 혼재**: 에픽 세트효과 함수들이 장비 데이터와 강하게
  결합되어 있어 파일명은 `equipment.js`이지만 순수 데이터 파일이 아니다

---

## 15. 향후 개발 방향

- CSS를 `styles.css`로 분리 (검토)
- 게임 로직과 DOM 갱신을 분리해 로직 단위 테스트를 쉽게 만드는 것 (검토, 현재는 원본 동작
  유지가 우선이라 미착수)
- `data/equipment.js`의 에픽 세트효과 로직을 별도 파일(`combat/epic-set-effects.js` 등)로
  분리하는 것 (검토, 소비형 호출 순서 검증이 선행되어야 함)
- 신규 직업/스킬/유물/장비 추가는 현재 구조에서 각각 `data/*.js` + 관련 로직 파일에
  이어서 작업하면 됨(10번 항목 참고)
