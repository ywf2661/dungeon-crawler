# HANDOFF

## 현재 작업

단일 파일(`index__10_.html`, JS 약 4,300줄, 단일 IIFE)을 22개 파일로 분리하는 리팩토링을
완료했다. 이어서 `PROJECT.md`(프로젝트 기준 문서)를 작성했다. 이번 세션에서 실제 게임
로직을 수정한 부분은 없다 — 전부 파일 분리와 문서화 작업이다.

## 리팩토링 결과

- **기존 구조**: `index__10_.html` 하나에 `<style>` + `(function(){ "use strict"; ... })()`
  단일 IIFE로 감싼 전체 JS 로직이 들어있었음
- **변경된 구조**: 감싸는 IIFE만 제거하고, 원본 코드를 한 줄도 재작성하지 않은 채 기존
  섹션 주석 경계에서 22개 파일로 분리. `index.html`이 이 파일들을 `<script src>`로 원본과
  동일한 순서로 로드
- **파일 분리 내용**: `js/`, `js/data/`, `js/ui/`, `js/combat/` 하위로 분리(전체 목록은
  PROJECT.md 2번 항목 참고)
- **모듈 간 의존관계**: import/export 없이, 여러 `<script>` 태그가 공유하는 전역 렉시컬
  스코프로 파일 간 참조를 해결(PROJECT.md 3번 항목에 상세 설명 있음)

## 변경된 파일

이번 세션은 아래 산출물을 **새로 생성**했다(기존에 변경할 파일이 없었음 — 원본
`index__10_.html`은 그대로 두고 별도 폴더에 결과물을 만든 것).

- `index.html` — 원본의 `<style>`/HTML 마크업 그대로 + `<script src>` 22개로 교체
- `js/*.js`, `js/data/*.js`, `js/ui/*.js`, `js/combat/*.js` (총 22개) — 원본 스크립트를
  섹션 경계에서 그대로 잘라낸 파일들. 각 파일 최상단에 `"use strict";` + 역할/export/의존성
  주석 추가(코드 자체는 원본과 동일)
- `README.md` — 리팩토링 방식(공유 렉시컬 스코프 원리)과 검증 방법 설명
- `PROJECT.md` — 프로젝트 전체 구조 기준 문서
- `HANDOFF.md` — 이 문서

## 현재 정상 동작

jsdom + 로컬 HTTP 서버로 `<script src>` 로딩을 재현한 스모크 테스트로 다음을 확인함:

- 22개 파일 전체 `node --check` 문법 통과
- 분리된 파일을 원본 순서대로 재결합 시 원본 스크립트 본문과 바이트 단위로 100% 동일
- 캐릭터 생성(`startGame`) → 전투 시작(`startBattle`) → 공격(`playerAttack`) →
  스킬 사용(`playerSkill`) → 아이템 사용(`playerItem`) → 적 처치 → 승리 처리(경험치 지급) →
  저장(`saveGame`, localStorage 폴백) 흐름 전체가 예외 없이 동작
- JOBS(6), SKILLDB(93), RELICS(27), EQUIPMENT(15) 등 데이터 테이블 전체 정상 로드

## 테스트 필요

스모크 테스트가 다루지 않은 영역 — 실제 브라우저에서 수동 확인 필요:

- 유물/저주 제단 UI(`showRelicAltar`, `showCurseAltar`) 및 유물 획득/교체 흐름
- 장비 착용/해제 및 에픽 세트효과 발동(`equipItem`, `checkEpicSetToast`)
- 레벨10 하이브리드 전직 UI(`showJobAdvancement`)
- 보스소굴 진입/진행(`enterBossDen`, `proceedBossDenAdvance`)
- 최종보스(depth 50) 및 광폭화 페이즈(`triggerEnragePhase`)
- 마녀의 시계 유물, 자동 포탑 등 `enemyTurn` 4단 래핑에 의존하는 기능
- 사운드(BGM/SFX) 실제 브라우저에서의 재생 여부(스모크 테스트는 Web Audio를 스텁 처리했음)
- PWA 설치(iPhone 홈 화면 추가) 동작
- `window.storage`(Claude 아티팩트 환경)를 통한 저장 — 스모크 테스트는 localStorage
  폴백 경로만 확인함

## 알려진 문제

현재 확인된 문제 없음.

## 주의사항

- `index.html`의 `<script src>` 순서를 절대 임의로 바꾸지 말 것 — 순서가 원본 코드 순서와
  동일해야 top-level 참조가 깨지지 않는다
- `js/combat/enemy-turn.js`의 `enemyTurn → tickActiveRig → enemyTurnReal → enemyAction`
  4단 래핑 순서 유지 필수
- `js/data/equipment.js`의 에픽 세트효과 함수들(`rogueRegisterHit` 등)과
  `js/relics.js`의 `consumeOnHitBonuses` 등은 호출 횟수/순서에 민감한 로직이므로 그대로 유지
- 원본 `index__10_.html`(업로드된 단일 파일)은 아직 리포지토리에 반영되지 않았고, 별도로
  전달된 산출물 폴더에만 존재함 — GitHub Pages 배포본을 교체하려면 이 폴더 내용을
  `ywf2661/dungeon-crawler` 리포지토리에 반영해야 함(아직 미실행)

## 현재 개발 상태

리팩토링 이전 게임 기능 자체의 구현 상태는 PROJECT.md 13번 항목과 동일(전부 "완료"
상태였던 기능을 그대로 파일만 분리했을 뿐, 기능 추가/변경 없음). 이번 세션에서 진행한
작업만 별도로 정리하면:

| 작업 | 상태 |
|---|---|
| JS 파일 분리(22개) | 완료 |
| 분리 결과 원본과 바이트 동일성 검증 | 완료 |
| jsdom 스모크 테스트(기본 플로우) | 완료 |
| PROJECT.md 작성 | 완료 |
| CSS 파일 분리(`styles.css`) | 미착수 |
| UI/게임 로직 분리 | 미착수 |
| GitHub 리포지토리(`ywf2661/dungeon-crawler`)에 반영 | 미착수 |
| 브라우저 수동 테스트("테스트 필요" 항목 전체) | 미착수 |

## 다음 작업

1. 이번 산출물 폴더(`index.html` + `js/`)를 실제 브라우저에서 열어 "테스트 필요" 목록을
   한 번씩 수동으로 플레이해보고 이상 없는지 확인
2. 이상이 없다면 `ywf2661/dungeon-crawler` 리포지토리에 반영(GitHub Pages 배포 갱신).
   기존 `index__10_.html` 단일 파일을 이 산출물로 교체할지, 별도 브랜치/경로로 먼저
   올릴지는 사용자 확인 필요
3. (검토, 확정 아님) CSS를 `styles.css`로 분리 — 사용자가 이전에 보류한 항목, 진행 여부
   재확인 필요

## 다음 작업 시 확인할 파일

- `README.md` — 이번 리팩토링이 어떤 원리로 동작하는지(공유 렉시컬 스코프) 설명되어 있어,
  수동 테스트 중 이상 동작이 발견되면 먼저 이 문서의 "핵심 방식" 부분을 참고해 원인이
  파일 분리 자체의 문제인지 원본에 있던 동작인지 구분하는 데 도움이 됨
- `index.html` — `<script src>` 순서 확인 시 여기를 봐야 함
- `js/combat/enemy-turn.js`, `js/relics.js`, `js/data/equipment.js` — "테스트 필요" 항목
  중 유물/에픽세트/적 AI 관련 문제가 발견되면 우선 확인할 파일들(주의사항 항목 참고)

## 작업 중단 지점

리팩토링과 문서화(PROJECT.md)까지 완료된 상태에서 중단됨. 코드 수정은 더 이상 진행하지
않았고, 산출물은 사용자에게 전달 완료. 다음 세션은 "다음 작업" 1번(브라우저 수동 테스트)부터
시작하면 된다. 사용자로부터 수동 테스트 결과나 GitHub 반영 여부에 대한 지시가 아직
없는 상태.
