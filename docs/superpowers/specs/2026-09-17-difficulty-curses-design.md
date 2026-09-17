# 난이도 상승 장치: 확정 시작 저주 & 저주-유물 결속 시스템

## 배경 / 목표

보통/하드코어 난이도는 현재 "굴복만 가능(도망 불가)" 외에는 쉬움과 체감 난이도 차이가 크지 않다.
기존 저주 시스템(중간 저주 제단, `CURSE_ALTAR_POOL`)은 플레이어가 알고 선택하는 구간 한정
페널티만 존재한다. 여기에 "런 시작부터 붙어있는 저주"와 "예상치 못하게 걸리는 저주"를 추가해
보통/하드코어의 난이도를 실질적으로 올린다.

핵심 설계 원칙: **지속시간과 세기는 반비례한다.**
- 구간 한정(기존 저주 제단) = 강한 수치, 알고 선택, 보상 연계(`getCurseRewardMult`)
- 영구(신규 장치들) = 약한 수치, 대부분 모르고 걸림, 보상 없음

## 범위

이번 스펙은 아래 4개 장치를 다룬다.
1. 확정 시작 저주 (난이도 시작 시 자동 적용)
2. 저주받은 유물 (일반 유물 제단에서 확률적으로 숨어있는 저주)
3. 저주받은 유물함 (미지의 사건 전용, 유물+저주 동시 획득)
4. 속죄의 제단 (미지의 사건 전용, 저주 제거)

포함하지 않는 것: 쉬움 난이도, 저주술사(`mastery_curseweaver`) 관련 기존 로직 변경(기존 절반
경감/마력 보너스 규칙은 그대로 적용됨), 저주 제단(`showCurseAltar`) 자체의 UI 변경(수치 조정 없음,
그대로 유지).

## 1. 저주 데이터 — 신규/변형 RELICS 엔트리

### 1-1. 기존 5종의 "영구용 완화판" 신설 (새 id, 기존 id는 그대로 구간용으로 유지)

기존 구간용 5종(`relic_heartlessdoll`/`relic_hungrycorridor`/`relic_ragingshadow`/
`relic_flayedhide`/`relic_driedwell`)은 값과 동작을 전혀 바꾸지 않는다. 대신 영구 컨텍스트
전용으로 완화된 값의 **새 relic id**를 하나씩 추가한다.

| 신규 id | 이름 | 효과 | 원본 대비 |
|---|---|---|---|
| `relic_faintheart` | 여윈 심장 | `maxhpPct:-0.25` | 원본(-50%)의 절반 |
| `relic_mildhunger` | 옅은 굶주림 | `noPostBattleHeal:true` (포션은 정상 사용) | 원본에서 `potionLocked` 제거 |
| `relic_fadingshadow` | 옅어진 그림자 | `enemyAtkPct:0.15` | 원본(+30%)의 절반 |
| `relic_thinhide` | 얇아진 가죽 | `dmgTakenPctMult:0.10` | 원본(+20%)의 절반 |
| `relic_shallowwell` | 얕아진 샘 | `maxmpPct:-0.25` | 원본(-50%)의 절반 |

### 1-2. 신규 5종 (하나의 값으로 구간/영구 양쪽에 공용 사용)

이 5개는 처음부터 "영구로 걸어도 괜찮은 강도"로 설계되었으므로 별도 완화판을 만들지 않는다.
그대로 `CURSE_ALTAR_POOL`(구간용)과 신설할 `PERMANENT_CURSE_POOL`(영구용) 양쪽에 등록한다.

| id | 이름 | 효과(신규 effect 키) |
|---|---|---|
| `relic_fadedmap` | 빛바랜 지도 | `expGoldPct:-0.20` |
| `relic_rustedarmor` | 낡은 갑주 | `armorLocked:true` |
| `relic_forgottencharm` | 잊혀진 장신구 | `accessoryLocked:true` |
| `relic_barrenpurse` | 메마른 지갑 | `shopPricePct:0.30` |
| `relic_stiffhands` | 굳은 손 | `cooldownBonus:1` |

### 1-3. 풀 구성

```
CURSE_ALTAR_POOL (구간 한정, 기존 로직 그대로)
  = 기존 5종(heartlessdoll/hungrycorridor/ragingshadow/flayedhide/driedwell)
  + 신규 5종(fadedmap/rustedarmor/forgottencharm/barrenpurse/stiffhands)
  = 10개

PERMANENT_CURSE_POOL (영구, 신설)
  = 완화판 5종(faintheart/mildhunger/fadingshadow/thinhide/shallowwell)
  + 신규 5종(fadedmap/rustedarmor/forgottencharm/barrenpurse/stiffhands)  // 동일 id 재사용
  = 10개
```

`CURSE_ALTAR_POOL`은 `RELICS`에서 `type==='curse' && !deprecated`를 필터링하는 기존 방식을
그대로 쓰되, 완화판 5종은 `permanentOnly:true` 플래그를 붙여 이 필터에서 제외한다.
`PERMANENT_CURSE_POOL`은 완화판 5종 + 신규 5종의 id를 배열로 직접 나열한다(자동 필터링 X —
매핑 관계가 1:1이 아니라서 명시적 나열이 더 안전함).

## 2. 새 effect 키 구현 지점

기존 `getRelicSum(key)`/`hasRelicFlag(key)`([data/equipment.js:545-553](../../../js/data/equipment.js#L545-L553))가
`player.relics`를 실시간으로 훑어 합산하는 구조이므로, 새 키도 같은 방식으로 판정한다. 값을
한 번 적용하고 끝나는 `atkPct`류와 달리 아래 4개는 전부 "매번 조회형"이다.

| effect 키 | 판정 지점 | 방식 |
|---|---|---|
| `expGoldPct` | 경험치 지급(`combat/battle-end.js:840 grantExp`), 골드 지급 지점 | 지급량에 `(1+getRelicSum('expGoldPct'))` 곱함 |
| `armorLocked` / `accessoryLocked` | `data/equipment.js:222 equipItem()`, `:250 unequipItem()` | 해당 슬롯이면 `storyWeapon` 잠금과 같은 패턴으로 조기 return |
| `shopPricePct` | `shop.js:58 discountMult` | `discountMult = 1 + getRelicSum('shopPricePct')` (기존 하드코딩된 `1`을 대체) |
| `cooldownBonus` | `combat/player-actions.js:452 battleFlags.skillCooldowns[key]=s.cooldown` | `s.cooldown + getRelicSum('cooldownBonus')`로 대체 — 매 전투 쿨타임 리셋 구조이므로 "런 시작 1회성"이 아니라 스킬을 쓸 때마다 상시 가산되어야 함(중요 — 최초 설계였던 "시작 시 1회 적용"은 전투가 바뀌면 사라져 무의미하므로 폐기) |

## 3. 확정 시작 저주

- 적용 대상: 보통/하드코어 (쉬움 제외), 난이도별 수치 차등 없음(동일)
- 시점: 캐릭터 생성 확정 직후, 첫 전투 진입 전 (정확한 훅 지점은 구현 계획에서 확정 —
  `newPlayer()` 직후 난이도 확정 콜백)
- 로직: `PERMANENT_CURSE_POOL`에서 무작위 1개 선택 → `applyRelicEffect(id)` 호출 →
  `player.relics.push(id)` (기존 유물 획득 로직 재사용, 신규 코드 없음)
- 이 저주는 `player.tempCurses`에 기록하지 않는다(= 영구, 구간 보스로 안 풀림) — 기존
  "저주술사만 영구, 나머지는 구간 한정" 분기와 동일한 신호(그냥 안 넣으면 영구로 취급됨)를 재사용

## 4. 저주받은 유물 (일반 유물 제단)

- 발동 확률: 제단 방문마다 **20%**로 판정. 당첨 시 3개 선택지 중 무작위 위치 1곳에 저주를 예약.
  낙첨(80%)이면 완전히 평범한 3택1 (겉보기 구분 불가능은 두 경우 모두 동일).
- 예약된 저주: `PERMANENT_CURSE_POOL`에서 무작위 1개.
- 선택 시:
  1. 유물 효과 정상 적용 (`applyRelicEffect(relicId)`, `player.relics.push(relicId)`)
  2. 저주 효과 적용 (`applyRelicEffect(curseId)`, `player.relics.push(curseId)`) — `tempCurses`에 안 넣음(영구)
  3. `player.cursedRelicBundles[relicId] = curseId` 기록 (신규 필드, `{}` 기본값)
  4. 토스트: "저주받은 [유물명]... 영구히 당신을 옭아맨다" 노출
- 표시 이름: 이 relicId가 `cursedRelicBundles`에 키로 존재하면, 유물 카드/목록 어디서든
  이름 앞에 "저주받은 " 접두사를 붙인다(원본 `RELICS[id].name`은 건드리지 않고 렌더링 시점에
  접두사만 얹음).
- 연동 해제: 유물 슬롯이 가득 차 교체(`showRelicSwapPrompt` → `removeRelic`) 대상이 이
  relicId면, `removeRelic(relicId)` 직후 `cursedRelicBundles[relicId]`가 있으면 그 curseId도
  함께 `removeRelic()`하고 매핑에서 제거.

## 5. 저주받은 유물함 (미지의 사건 전용, 신규 이벤트)

- `events.js`에 신규 이벤트 함수 추가, 기존 이벤트 가중치 풀에 합류
- 열기 전: "저주받은 유물함" 존재를 밝히되 내용물은 비공개 (`?` 카드 톤 유지)
- 선택지: "연다" / "열지 않고 떠난다"
- "연다" 선택 시: 4번(저주받은 유물)과 동일한 절차 — 일반 유물 1개(RELIC_ALTAR_POOL 중 무작위,
  미보유 항목) + `PERMANENT_CURSE_POOL` 저주 1개를 동시 지급, `cursedRelicBundles`에 동일하게
  등록(유물 교체 시 저주도 같이 해제되는 규칙 공유)

## 6. 속죄의 제단 (미지의 사건 전용, 신규 이벤트)

- 등장 조건: `player.relics`에 `type==='curse'`인 항목이 1개 이상 있을 때만 이 이벤트가
  이벤트 풀에서 유효. 0개면 다른 이벤트로 대체(기존 이벤트 시스템의 조건부 이벤트 패턴 재사용)
- 선택 UI: 현재 보유한 저주 목록을 카드로 나열, 하나를 선택
- 선택 시: `removeRelic(curseId)` (연동된 유물이 있어도 유물은 그대로 유지 — 이 경로는
  저주만 단독 제거) + 대가로 `player.maxhp`를 영구 -15%(즉시 `Math.round` 적용, 현재 hp도
  비율 유지하며 감소)
- 대가 적용은 새 effect 키가 아니라 이벤트 함수 내부에서 직접 `player.maxhp`/`player.hp`를
  조정(1회성 이벤트 보상/대가는 기존에도 이 패턴 — 예: `showDevilsDiceEvent`의 골드 증감)

## 7. UI — 구간 한정 vs 영구 구분

- 위치: `records.js:250 renderRelicCardGroup()` (유물 버튼 → `showMyRelics()`가 호출하는
  카드 렌더 헬퍼) — 이 한 곳만 수정
- 판정: 저주 카드(`r.type==='curse'`) 렌더 시 `player.tempCurses[id]`가 있으면 구간 한정,
  없으면 영구
- 라벨: `⏳ 저주 (구간 한정)` / `⛓ 저주 (영구)` — 기존 "저주 (이 구간 한정)" 문구 관례를
  그대로 계승, 아이콘만 추가
- 이름 접두사: `cursedRelicBundles`에 등록된 relicId면 카드 이름 앞에 "저주받은 " 추가
  (저주 카드 자체가 아니라 그 저주와 묶인 유물 카드 쪽에 붙는다는 점 주의)
- 색/스타일: 기존 `.relic-card.type-curse` 보라색 테마 변경 없음 — 아이콘/텍스트만으로 구분

## 8. 신규 player 필드

```js
player.cursedRelicBundles = {};  // { [relicId]: curseId } — 유물↔저주 1:1 결속
```

`player.tempCurses`(기존)는 변경 없이 그대로 사용 — "이 curseId가 tempCurses에 없으면 영구"라는
기존 신호 체계를 그대로 재사용하고, 별도의 "영구 저주 목록"을 새로 만들지 않는다.

## 열린 질문 (구현 계획 단계에서 확정 필요)

1. 확정 시작 저주를 적용하는 정확한 코드 위치(캐릭터 생성 흐름 중 어느 시점) — bootstrap.js/
   explore.js 중 실제 "런 시작"이 확정되는 지점을 구현 계획에서 특정해야 함.
2. 골드 지급 지점이 `grantExp`처럼 단일 함수로 안 모여 있을 가능성 — `expGoldPct` 적용 시
   골드 지급 지점을 전부 찾아 훅을 걸어야 함(구현 계획에서 grep으로 확정).
3. `getRelicSlotUsage()`가 저주는 슬롯을 안 쓴다고 이미 처리하므로, `cursedRelicBundles`로
   묶인 저주도 동일하게 슬롯 미차감을 유지해야 함(회귀 확인 필요).
