# CURRENT_STATUS.md — 현재 개발 상태

> 이 문서는 과거 대화의 대체물이다.
> 새 Claude 대화를 시작할 때 현재 상태를 빠르게 전달하기 위한 문서다.
> 오래된 상세 작업 이력은 `HANDOFF.md`를 참고한다.

## 기준 브랜치

- `main` (이번 세션도 `main`/`mechanic-stoker-accumulator` 양쪽에 동일 반영)

## 현재 확인된 상태

- 프로젝트는 Vanilla JS/HTML/CSS 기반의 정적 브라우저 게임이다.
- 여러 classic `<script>`가 로드 순서에 따라 공유 전역 scope를 사용하는 구조다.
- 전투/탐험/직업/장비/유물/저장 등 기능이 여러 JS 파일로 분리되어 있다.
- `js/`에는 기존 문서에 적힌 파일 외에도 `events.js`, `nodemap.js`, `origin.js`가 존재한다.
- 기존 `PROJECT.md`는 일부 최신 파일/구조보다 뒤처져 있으므로 실제 코드를 우선한다.
- **`audio/bgm/`, `audio/sfx/`** 디렉터리가 신설되어 실제 음원 파일이 존재한다
  (이전엔 Web Audio 합성음뿐이었음 — 아래 참고).

## 현재 상태 요약

이번 세션은 **사운드 실음원화 + UI 리디자인**이 핵심이었다. 기존엔 BGM/SFX
전부 Web Audio 오실레이터 합성음이었는데, 사용자가 실제 음원 파일(BGM 16개,
SFX 9개)을 구해와서 하이브리드 구조(파일 있으면 파일 재생, 없으면 기존
합성음 폴백)로 전환했다. 그 과정에서 진짜 버그를 두 개 잡았다(아래 참고).
후반부에는 UI 폰트/버튼을 한글 미지원 장식체(Cinzel 등)에서 한글 정식
지원 폰트(Gowun Batang + IBM Plex Sans KR)로 교체하고 버튼을 평면화했다.
이전 세션(아이온 신설, 스토리 통합, 독사 밸런스)의 상세는 `HANDOFF.md`로
이동했다.

## 최근 작업

### 0. 역병숙주 리뉴얼 (구 독사, rogue_alchemist, 커밋 `7e69a28`)
- 목표: 15레벨 전까지 액티브(구 맹독 주입)를 쓸 이유가 없던 문제 해결. "기생형" 컨셉으로 전면 개편
- 변경 파일: `js/data/jobs.js`, `js/data/skills.js`, `js/data/equipment.js`, `js/combat/enemy-turn.js`, `js/combat/player-actions.js`
- 마스터리(역병 잠식): 기존 스택 축적/틱딜 유지 + 스택 1개당 적 ATK/DEF -2%(최대 -20%) 신규 추가
- 레벨10(체액 흡수): 자기 전용 스택 +1(레벨15면 +3, 스택 소모 없음) + 갱신 직후 스택의 절반(레벨15면 전부)만큼 ATK를 이번 전투 동안 영구 흡수(`battleFlags.venomAbsorbPoints`, `getVenomAbsorbBonus()`, 캡 +30%p)
- 레벨12(만성 기생): 잠식 dot 피해의 20% 자동 회복(구 "독성 정제" 틱딜+30%/+15% 효과는 코드에서 제거됨)
- 레벨15(완전 기생화): 자기 스택 보너스 +3, 흡수 비율 전량
- ⚠️ 미해결: 전용 각인 3종(`re_venomrush`/`re_venomburst`/`re_solovenom`)은 옛 "맹독 주입/독성 정제" 기준 텍스트라 안 맞음 — 다음 작업 참고

### 1. BGM 실음원화 (커밋 `2c9609e`~`6bfa566`)
- 사용자 제공 음원(원본 wav 130MB+)을 60초 트림 + 페이드 + mp3 128kbps로
  압축(최종 15MB, `audio/bgm/`)
- `sound.js`: `<audio>` 엘리먼트 기반 재생 인프라 신설(`BGM_FILES`,
  `bgmPlaylistIdxByMode`, `playBgmTrack()`, `setBgmMode(mode, {force})`)
- 모드 6종 완전 분리, 전부 실음원 확보:
  - `explore`(마을, 2곡) / `dungeon`(던전, 5곡 순환) / `battle`(일반 전투, 5곡 순환)
  - `dread`(고요한 제단, 1곡) / `finalboss`(잠식된 OO 용사, 1곡)
  - `truefinalboss`(회랑의 시조, 1곡) / `witchboss`(시간의 마녀 Aiōn, 1곡) — **시조와 마녀는 완전히 별개 트랙**(처음엔 착각해서 같이 묶었다가 사용자 지적으로 분리)
- **잡은 버그 2개**:
  1. `bgmMode` 초기값이 `'explore'`였던 탓에 최초 마을 진입 시 파일 BGM이
     전혀 시작 안 함 → 초기값을 빈 문자열로 변경
  2. "나아가기"로 마을→새 던전 진입 시 `showScreen('explore')`가 재호출
     안 되어 던전 BGM으로 전혀 안 바뀌던 실제 버그 → `enterNodeMapTier()`에서
     직접 `Sound.setBgmMode()` 호출하도록 수정(고요한 제단만 처리하던 걸
     일반 구간도 포함)
- **곡 유지/전환 규칙**(사용자 요청): 같은 노드맵 안에서 전투를 왕복해도
  곡 유지(모드별 마지막 트랙 인덱스를 `bgmPlaylistIdxByMode`에 기억) /
  새 노드맵(`enterNodeMapTier()` 호출 시점)마다 직전 곡과 무조건 다르게
  (`rerollDungeonTrack()`, force 옵션으로 조기 반환 우회)

### 2. SFX 실음원화 (커밋 `1543c55`)
- 사용자 제공 9개(Hit/Coin/Potion/Magic_heal/Magic_spell/Clock/Fireball/
  Slash/Levelup) → `audio/sfx/`
- BGM과 다른 방식: `fetch`+`decodeAudioData`로 프리로드 → `AudioBufferSourceNode`로
  즉시 재생(지연 없이 슬래시 연타 같은 중첩 재생 가능 — `<audio>` 태그로는
  안 됨)
- `slash/hit/coin/potion/heal/magic/bomb(=Fireball)/levelUp`: 음원 있으면
  우선, 없거나 로딩 전이면 기존 합성음 폴백
- 신규 `clockChime()`(Clock.wav) — 시간 왜곡/마녀의 시계로 추가 행동 발동하는
  순간 전용. `guard/poisonHit/fail/click/victory/gameOver/statusApply`는
  아직 음원 없어 합성음 유지(`SFX_FILES`에 추가만 하면 바로 전환됨)

### 3. UI 리디자인 (커밋 `88222c7`)
- 폰트: `Cinzel`/`Cinzel Decorative`/`EB Garamond`(전부 한글 미지원 —
  한글 텍스트는 브라우저 기본 폰트로 강제 대체되고 있었음) → **`Gowun
  Batang`(제목, `.dialogue-line` 포함)** + **`IBM Plex Sans KR`(그 외 UI/본문
  전체, 30여 곳 일괄 교체)**. `--font-title`/`--font-ui` CSS 변수로 관리
- 버튼(`.btn`): 그라데이션+이중 그림자(안쪽+바깥쪽) → 단색 배경+얇은
  테두리+단일 외곽 그림자로 평면화. hover도 배경/테두리 색만 변화(들썩이는
  transform 제거)
- 색상 토큰(`--void`/`--gold`/`--violet` 등)은 그대로 유지 — 문제는 색이
  아니라 타이포/버튼 질감이었음
- 작업 전 `ui_demo.html`로 이전/이후 비교 데모를 먼저 만들어 승인받고 진행함

### 4. 기타 소소한 반영
- admin3(무작위 유물)가 마녀의 시계를 항상 보유하도록 보장(`e54e711`)
- 시간의 마녀 이름을 "시간의 마녀 Aiōn"으로 명명, 조우 대사 제목도
  `enemy.name` 참조로 통일

## 최근 검증 상태

- `node --check` 전체 파일 통과.
- Playwright 헤드리스로 실제 검증:
  - BGM 6개 모드 전부 전환 시 정확한 파일 로드 확인(마을/던전/일반전투/
    고요한제단/잠식된보스/시조/마녀 — 실제 화면 전환으로)
  - 던전→전투→던전 3회 왕복 시 곡 유지, 노드맵 5회 연속 전환 시 매번
    직전과 다른 곡 확인
  - SFX 9개 파일 전부 200 응답 로드 확인, 17개 사운드 함수(신규
    `clockChime` 포함) 전부 에러 없이 실행
  - UI: 컴퓨티드 스타일로 폰트 변수 실제 적용 확인, 타이틀/탐험 화면
    스크린샷으로 시각 확인
  - 기존 회귀(오프닝 4종, 물음표 이벤트) 정상
- **미검증**: 실제 청취(헤드리스라 BGM/SFX 소리 자체는 확인 불가 — 파일
  로드/전환 로직만 검증됨), 모바일 사파리 등 실기기에서의 오디오 자동재생
  정책 동작
- 역병숙주(구 독사) 리뉴얼: `node --check` 5개 파일 통과, 브라우저 실플레이/Monte Carlo 밸런스 검증은 미실시(신규 수치 전부 초안)
- 이전 세션들(아이온 신설, 스토리 통합, 독사 밸런스) 상세는 `HANDOFF.md`로
  이동 — **역병숙주(구 독사)의 구조적 한계(checkBattleEnd 타이밍 이슈)는 여전히 미해결.**

## 완료된 것으로 취급할 수 있는 영역

프로젝트에는 다음 핵심 시스템이 이미 존재한다.

- 기본 직업 시스템 / 하이브리드 2차 전직(전 직업 완성)
- 턴제 1:1 전투 / 몬스터·보스(층별보스, 일반 최종보스, 진 최종보스 2종
  — 회랑의 시조/시간의 마녀 Aiōn, 마녀의 시계 보유 여부로 분기)
- 스킬 / 장비 / 유물 / 에픽 직업 각인 시스템(39개)
- 탐험 / 상점 / 대장간 / 저장·불러오기 / 기록·도감 / 상태창
- **실제 음원 기반 BGM(6모드 완전 분리) + SFX(9종, 하이브리드)** / 몬스터 시각화
- 세계관 스토리 레이어(오프닝 서사, 지역 묘사, 물음표 이벤트 28개, 특수
  조우 대사 다수, 아이온 보스 전체)
- **UI 타이포그래피/버튼 리디자인**(한글 정식 지원 폰트, 평면 버튼)

단, "완전히 테스트 완료"라는 의미는 아니다. 실제 테스트 여부는 해당 작업의 검증 결과를 따른다.

## 작업 시 주의

### 전투
전투 파일들은 서로 강하게 연결되어 있다. 작은 변경도 호출 순서와 턴 전환에 영향을 줄 수 있다. `player-actions.js`의 phys/magic 공용 대형 핸들러는 특례 분기가 얽혀있어 편집 후 반드시 재확인한다.

### 저장
저장 필드 변경은 `player.js`와 `storage.js`를 함께 확인한다. 단, `storage.js`가 `player` 객체를 통째로 직렬화하는 구조라(`JSON.stringify({player, ...})`), `player.xxx = player.xxx||기본값` 패턴으로 쓰는 새 필드는 두 파일을 안 건드려도 안전하다.

### 사운드
`sound.js`가 BGM/SFX 둘 다 관장한다. **BGM은 `<audio>` 엘리먼트**(모드별
파일 목록 `BGM_FILES`, 모드 전환은 `setBgmMode(mode, opts)` — `opts.force`로
같은 모드 안에서도 트랙 강제 갱신 가능), **SFX는 `AudioBufferSourceNode`**
(프리로드 `preloadSfx()`, 재생 `playSfxBuffer(name)`) — 서로 다른 재생
메커니즘이니 혼동하지 않는다. 새 BGM/SFX 파일이 생기면 `BGM_FILES`/`SFX_FILES`에
등록만 하면 자동으로 우선 사용된다(합성음은 자동 폴백).

### UI/타이포그래피
제목류(`h1,h2,h3`, `.title-font`, `.dialogue-line`)는 `var(--font-title)`
(Gowun Batang), 그 외 전부(버튼/라벨/뱃지/본문)는 `var(--font-ui)`(IBM
Plex Sans KR). 새 UI 텍스트를 추가할 때 이 규칙을 따른다. 색상 토큰은
`:root`의 기존 변수(`--gold`/`--violet`/`--rust` 등)를 그대로 재사용한다.

### 직업
직업/전직 변경은 `jobs.js`, `job-advancement.js`, 필요 시 `skills.js`, `battle-end.js`를 함께 확인한다.

### 스토리/서사
`origin.js`(오프닝), `events.js`(물음표 이벤트), `combat/battle-setup.js`(특수 조우 대사·진최종보스 데이터), `combat/enemy-turn.js`(보스 스킬 실행), `combat/battle-end.js`(엔딩)에 서사 레이어가 분산돼 있다. 새 서사 요소 추가 시 이 파일들이 기본 확인 대상.

### 진 최종보스 확장
새 진최종보스를 추가하려면: ① `battle-setup.js`에 스탯 데이터 + `pickEnemy()`의 `isTrueFinal` 분기에 조건 추가, ② 광폭화가 필요하면 `ENRAGE_STEPS_*` 배열 신설 후 `getEnrageSteps()`에 분기 추가(발동 로직 자체는 공용), ③ 포즈 이미지가 있으면 `monster-visuals.js`의 `BOSS_POSE_IMG_BY_TYPE`에 등록, ④ 후광 색상이 다르면 `index.html`에 새 CSS 클래스, ⑤ 엔딩 텍스트가 다르면 `battle-end.js`의 `showEnding()`에서 `enemy.type` 분기 추가, ⑥ 전투 BGM이 다르면 `explore.js`의 `id==='battle'` 분기와 `sound.js`의 `BGM_FILES`에 모드 추가. 전투 턴 흐름(`enemyTurn`/`checkBattleEnd`) 자체는 건드릴 필요 없다.

### 몬스터
데이터/전투 생성/시각화가 분리되어 있으므로 작업 성격에 맞는 파일만 선택한다. 몬스터에는 desc/도감 필드가 아직 없다(도감 UI 자체가 없음) — 로어 텍스트를 넣으려면 UI 신설이 먼저 필요.

## 다음 작업

```text
### 1순위 — 계약형 유물 4종 코드 구현
- 질주의 서약 / 정체된 맹세 / 결투자의 서약 / 무일푼의 각오(리턴값 미정)
- 스펙은 이미 확정돼 있음(과거 세션 기록 참고), 코드 반영만 남음

### 2순위 — 역병숙주 전용 각인 3종 리뉴얼
- `re_venomrush`/`re_venomburst`/`re_solovenom`(js/blacksmith.js)이 옛
  "맹독 주입/독성 정제" 메커니즘 기준 텍스트·설계라 새 스킬과 안 맞음

### 3순위 — 역병숙주 밸런스 Monte Carlo 검증 + 브라우저 플레이테스트
- 신규 수치(스택당 ATK/DEF -2%, ATK 흡수 캡 +30%p, 라이프스틸 20%)가
  다른 2차 전직(특히 저주술사/폭주화부) 대비 적정한지 확인

### 4순위 — 역병숙주(구 독사) 구조적 한계 재검토 + 아이온 밸런스 실전 검증
- checkBattleEnd() 타이밍 이슈로 인한 독틱 증발 문제(전투 체인을 건드려야
  해서 리스크 큼 — 손댈지 여부부터 논의 필요) / 아이온 하드코어 실클리어 검증

### 5순위 — 기타 후순위
- 남은 SFX 슬롯(guard/poisonHit/fail/click/victory/gameOver/statusApply) 및
  마을/일반전투 BGM 추가 음원 확보 여부 확인(준비되면 파일만 넣으면 됨)
- UI 리디자인 확장 여부(카드류 그라데이션 배경 평면화 등, 요청받지 않아 보류)
```

## 상태 업데이트 규칙

작업이 끝나면:

1. 완료된 작업을 추가한다.
2. 변경 파일을 기록한다.
3. 미검증 항목을 기록한다.
4. 다음 작업을 1~5개 이내로 적는다.
5. 오래된 완료 항목은 필요하면 별도 HANDOFF/CHANGELOG로 이동한다.

이 문서는 길게 만들지 않는다. 현재 상태만 유지한다.
