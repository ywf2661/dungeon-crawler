# ARCHITECTURE.md — 코드 구조와 의존관계

> Claude가 기능 수정 전에 필요한 파일만 선택하도록 만드는 기술 지도.
> 실제 코드와 이 문서가 다르면 실제 코드를 우선한다.

## 1. 가장 중요한 구조적 특징

이 프로젝트는 ES Module이 아니다.

`index.html`의 여러 `<script src>`가 정해진 순서로 실행되며, 파일 간 의존성을 **스크립트 로드 순서 + 공유 전역 lexical scope**로 해결한다.

따라서 다음은 위험하다.

- `import/export` 도입
- script 순서 변경
- 파일을 임의로 독립 모듈처럼 변경
- 동일한 전역 이름의 함수/변수 추가
- 전역 상태 변수 이름 변경

## 2. 실행 계층

```text
index.html
   │
   └─ script loading order
       │
       ├─ state / data / utility
       │
       ├─ player / exploration / UI
       │
       ├─ combat
       │
       └─ main.js
              │
              └─ init()
```

`main.js`는 실질적인 게임 로직 파일이 아니라 진입점 역할을 한다.

## 3. 초기화

```text
main.js
  → init() [bootstrap.js]
      → 초기 상태 준비
      → 타이틀/직업/난이도 UI
      → DOM 이벤트 연결
      → 저장 데이터 존재 여부 확인
```

`bootstrap.js`는 여러 시스템을 DOM 이벤트에 연결하는 조립 지점이다.

## 4. 탐험 흐름

```text
startGame()
  → newPlayer() 또는 loadGame()
  → showScreen('explore')
  → renderStatus()/renderExplore()
  → 사용자의 탐험 선택
  → depth / player / inventory / relic 상태 변경
  → UI 재렌더
  → 이벤트/노드/상점/전투 등으로 분기
```

탐험 관련 변경은 보통 다음 파일을 먼저 확인한다.

```text
explore.js
nodemap.js
events.js
shop.js
relics.js
```

필요하면 `player.js`, `storage.js`, 관련 UI 파일을 추가로 확인한다.

## 5. 전투 진입

```text
탐험
  → pickEnemy()
  → startBattle()
      → enemy 생성
      → battle state 초기화
      → battle UI 초기화
      → 전투 화면 표시
```

주요 파일:

- `combat/battle-setup.js`
- `data/monsters.js`
- `combat/battle-fx.js`

보스/최종보스/광폭화 관련 변경은 `battle-setup.js`를 반드시 확인한다.

## 6. 플레이어 턴

```text
playerAttack()
playerSkill(key)
playerItem(key)
playerRun()
        │
        ├─ 데미지/효과 계산
        ├─ 유물/장비/직업 효과 반영
        ├─ DOM 연출
        └─ checkBattleEnd()
               │
               ├─ 승리/패배
               └─ 계속 전투
                    ↓
                 enemyTurn()
```

스킬 수정 시 최소 확인 범위:

```text
data/skills.js
combat/player-actions.js
```

유물/장비가 스킬/데미지에 영향을 주는 경우:

```text
relics.js
data/equipment.js
```

도 함께 확인한다.

## 7. 적 턴

적 턴은 다음 체인을 중요하게 취급한다.

```text
enemyTurn()
  → tickActiveRig()
  → enemyTurnReal()
  → enemyAction()
```

이 호출 체인은 특정 유물/장비/자동화 효과가 개입할 수 있으므로 임의로 단순화하거나 순서를 바꾸지 않는다.

적 AI 수정 시 기본 범위:

```text
combat/enemy-turn.js
```

필요 시:

```text
combat/battle-end.js
relics.js
data/monsters.js
```

## 8. 전투 종료

```text
checkBattleEnd()
  ├─ enemy 사망
  │   ├─ 경험치
  │   ├─ 드랍
  │   ├─ 레벨업
  │   ├─ 전직
  │   └─ 탐험 복귀/저장
  │
  ├─ player 사망
  │   └─ gameover
  │
  ├─ 최종보스
  │   └─ ending
  │
  └─ 전투 계속
```

레벨업/보상 관련 변경은 `battle-end.js` 외에 직업/스킬 시스템과 저장 구조를 함께 고려한다.

## 9. 장비

장비 데이터와 착용 로직이 `data/equipment.js`에 함께 있다.

UI는 `ui/equipment-ui.js`가 담당한다.

장비 기능 수정:

```text
data/equipment.js
ui/equipment-ui.js
```

스탯 변화가 다른 시스템에 영향을 주면 `player.js`, `relics.js`, 전투 파일도 추가 확인한다.

## 10. 직업 / 2차 전직

직업 데이터:

```text
data/jobs.js
```

전직 UI/처리:

```text
combat/job-advancement.js
```

스킬이 추가되면:

```text
data/skills.js
combat/player-actions.js
combat/battle-end.js
```

를 확인한다.

특히 레벨 기반 스킬 지급 구조를 변경할 때는 `battle-end.js`의 레벨업 루프를 확인한다.

## 11. 유물

유물은 `relics.js`에 데이터와 효과 로직이 함께 존재한다.

따라서 유물 하나를 수정할 때:

```text
relics.js
```

가 기본이고, 특정 장비/특수 효과를 참조하면:

```text
data/equipment.js
combat/player-actions.js
combat/enemy-turn.js
```

를 추가 확인한다.

## 12. 몬스터

몬스터 데이터:

```text
data/monsters.js
```

전투 생성/스탯 보정:

```text
combat/battle-setup.js
```

시각화:

```text
monster-visuals.js
```

몬스터를 새로 추가하는 작업은 기본적으로 위 3개를 분리해서 생각한다.

- 데이터만 추가 → `data/monsters.js`
- 전투 특수 규칙 추가 → `battle-setup.js` 또는 관련 전투 파일
- 시각적 표현 추가 → `monster-visuals.js`

## 13. 저장/복원

```text
saveGame()
loadGame()
```

의 중심은 `storage.js`.

새 저장 필드:

```text
newPlayer() 기본값
→ storage.js 저장
→ storage.js 복원
→ 실제 사용 지점
```

이 세 단계가 모두 맞아야 한다.

## 14. UI / 이벤트

UI는 `index.html`에 마크업이 존재하고 JavaScript가 직접 DOM을 변경한다.

이벤트 연결 지점은 `bootstrap.js`를 우선 확인한다. 저장소의 최신 코드에서 이벤트 관련 로직이 `events.js`로 분리된 부분이 있다면 해당 기능의 실제 호출 관계를 코드에서 확인하고 문서 추측으로 판단하지 않는다.

새 버튼:

```text
index.html
→ 이벤트 연결 파일
→ 상태 변경 함수
→ 관련 렌더링
```

## 15. 변경 영향도

### 낮음
- 텍스트/설명 변경
- 데이터 숫자 소폭 조정
- CSS/단순 UI 스타일

### 중간
- 신규 몬스터 데이터
- 신규 아이템
- 신규 스킬
- 신규 유물
- 특정 UI 기능

### 높음
- `state.js` 상태 필드 변경
- `storage.js` 저장 구조 변경
- `index.html` script 순서 변경
- `bootstrap.js` 초기화 흐름 변경
- 전투 턴 흐름 변경
- `player` 객체 구조 변경
- 기존 전직/레벨업 처리 변경

### 매우 높음
- 전투 파일 간 호출 체인 재구성
- 전역 상태 구조 리팩토링
- ES Module 전환
- 대규모 파일 통합/분리

높은 영향도 작업은 구현 전에 영향 파일을 먼저 나열한다.

## 16. 작업별 최소 파일 선택표

| 요청 | 먼저 볼 파일 |
|---|---|
| 몬스터 외형 | `monster-visuals.js`, 필요 시 `data/monsters.js` |
| 몬스터 스탯 | `data/monsters.js`, `battle-setup.js` |
| 적 AI | `enemy-turn.js` |
| 기본 공격 | `player-actions.js` |
| 스킬 효과 | `data/skills.js`, `player-actions.js` |
| 전투 시작 | `battle-setup.js` |
| 전투 종료 | `battle-end.js` |
| 전직 | `jobs.js`, `job-advancement.js`, 필요 시 `skills.js` |
| 장비 | `equipment.js`, `equipment-ui.js` |
| 유물 | `relics.js` |
| 탐험 | `explore.js`, 필요 시 `nodemap.js/events.js` |
| 상점 | `shop.js` |
| 저장 | `storage.js`, `player.js`, 필요 시 `state.js` |
| 사운드 | `sound.js` |
| 타이틀/초기화 | `bootstrap.js`, `state.js`, `ui/difficulty.js` |
| 새 버튼 | `index.html`, 이벤트 연결 파일 |
