"use strict";
/*
몬스터 도감 데이터 테이블(정적 데이터, 로직 없음).
의존성 없음.
export(전역): MONSTERS, TIER_MONSTER_POOLS, BOSSES, LOCATIONS
*/

  /* ============ 몬스터 도감 ============ */
  const MONSTERS = [
    // ---------- 초반 5종 컨셉 재설계(사용자 요청 — 슬스처럼 독창적이고
    // 신비로운 느낌이되, 초반 몬스터 특유의 "약해 보이는" 인상은 유지). type과
    // 이미지 경로(monster-visuals.js의 MONSTER_IMG)는 그대로 둬서 기존에
    // 넣어두신 파일 구조를 안 건드린다 — 새로 만드실 그림을 같은 경로/파일명에
    // 덮어쓰기만 하면 된다. 이름만 새 컨셉으로 교체했다.
    {type:'slime',   name:'번진 잉크방울', minDepth:0,  hp:16, atk:4,  def:1,  spd:3,  exp:8,  gold:[4,9],   skills:[]},
    {type:'goblin',  name:'이끼 진 잔가지꾼', minDepth:0,  hp:22, atk:6,  def:2,  spd:6,  exp:12, gold:[6,14],  skills:[]},
    {type:'bat',     name:'찢긴 속삭임들', minDepth:1,  hp:14, atk:5,  def:1,  spd:12, exp:10, gold:[5,10],  skills:['bite']},
    {type:'bandit',  name:'누더기 좀도둑', minDepth:1,  hp:24, atk:7,  def:2,  spd:8,  exp:14, gold:[10,20], skills:['steal']},
    {type:'wolf',    name:'떠도는 발자국', minDepth:2,  hp:26, atk:8,  def:2,  spd:10, exp:16, gold:[5,12],  skills:['bite']},
    {type:'spider',  name:'숲망꾼',        minDepth:3,  hp:28, atk:9,  def:3,  spd:7,  exp:18, gold:[9,16],  skills:['bite']},
    {type:'skeleton',name:'해골 전사',     minDepth:3,  hp:32, atk:9,  def:4,  spd:5,  exp:20, gold:[8,18],  skills:[]},
    {type:'ghost',   name:'옭아맨 통곡',   minDepth:5,  hp:30, atk:10, def:2,  spd:11, exp:24, gold:[12,20], skills:['curse']},
    {type:'knight',  name:'짓눌린 맹세',   minDepth:8,  hp:52, atk:13, def:8,  spd:5,  exp:36, gold:[20,34], skills:['smash']},
    {type:'ogre',    name:'회랑의 정령',        minDepth:9,  hp:58, atk:14, def:6,  spd:3,  exp:40, gold:[18,30], skills:['smash']},
    {type:'harpy',   name:'울부짖는 깃털비', minDepth:11, hp:38, atk:12, def:3,  spd:14, exp:34, gold:[16,26], skills:['bite']},
    {type:'wraith',  name:'얼어붙은 유언', minDepth:13, hp:48, atk:13, def:6,  spd:8,  exp:42, gold:[20,32], skills:['curse','heal']},
    {type:'cultist', name:'천 개의 기도',  minDepth:14, hp:40, atk:11, def:4,  spd:7,  exp:40, gold:[22,34], skills:['curse','heal']},
    {type:'egg',name:'회랑의 껍질',  minDepth:17, hp:66, atk:18, def:8,  spd:6,  exp:56, gold:[28,42], skills:['smash']},
    {type:'golem',   name:'회랑의 굴착꾼',       minDepth:20, hp:90, atk:16, def:14, spd:2,  exp:68, gold:[30,48], skills:['smash']},
    {type:'jack',  name:'회랑의 인형수집가 잭',     minDepth:22, hp:95, atk:15, def:10, spd:3,  exp:70, gold:[32,50], skills:['heal']},
    {type:'demon',   name:'회랑의 어릿광대',     minDepth:26, hp:80, atk:22, def:10, spd:8,  exp:90, gold:[45,65], skills:['smash','curse']},
    // 신규 3종(사용자 요청 — 미믹/오크전사/마녀 삭제 후 3·4구간용으로 추가).
    // 데몬(minDepth26) 이후로 이어지는 구간이라 데몬보다 소폭씩 더 강하게 잡았다.
    {type:'tome',    name:'회랑의 금서',        minDepth:30, hp:75, atk:20, def:9,  spd:10, exp:96,  gold:[42,62], skills:['curse','heal']},
    {type:'tailor',  name:'회랑의 재단사',      minDepth:33, hp:88, atk:22, def:10, spd:7,  exp:104, gold:[45,66], skills:['smash','curse']},
    {type:'hornbeast', name:'회랑의 뿔짐승',    minDepth:37, hp:98, atk:26, def:13, spd:8,  exp:120, gold:[50,72], skills:['smash']},
  ];

  // 구간(타이어)별 몬스터 풀(사용자 요청 — 몬스터 강함이 층수로만 정해지다
  // 보니, 강타(smash) 계열처럼 센 몬스터가 그 구간 "주력"으로 자주 나오는
  // 문제가 있었다. 이제 구간마다 "주력"(native) 풀과 "희귀 조우"(reach) 풀을
  // 나눈다 — native는 그 구간에서 흔하게, reach는 낮은 확률로만 나온다(다음
  // 구간을 미리 살짝 맛보여주는 긴장감용). combat/battle-setup.js의
  // pickWeightedMonster()가 이 풀을 소비한다. tier3/4는 기존 몬스터 수
  // 자체가 이 두 구간에 새로 추가된 것 없이 재사용되므로(더 강한 신규
  // 몬스터가 아직 없음) reach를 비워뒀다 — depth 스케일링만으로 충분히
  // 강해진다.
  const TIER_MONSTER_POOLS = [
    { native:['slime','goblin','bat','bandit','wolf','spider','skeleton'],
      reach:['ghost','knight','ogre'], reachChance:0.08 },
    { native:['ghost','knight','ogre','harpy','wraith','cultist','egg'],
      reach:['golem'], reachChance:0.08 },
    { native:['harpy','wraith','cultist','egg','golem','jack'],
      reach:['demon'], reachChance:0.08 },
    { native:['egg','golem','jack','demon','tome','tailor'], reach:['hornbeast'], reachChance:0.08 },
    { native:['golem','jack','demon','tome','tailor','hornbeast'], reach:[], reachChance:0 },
  ];

  const BOSSES = [
    // ---------- 신규 8종 보스로 전면 교체(사용자 요청) ----------
    // 기존 8마리(붉은 유해룡/회랑의 리치/심연의 망령여왕/오우거 대족장/심해의
    // 크라켄/태고의 파수꾼/폭주 강철 처형자/심연의 악마 군주)는 더 이상 뽑히지
    // 않도록 이 배열에서 뺐다 — 대신 새로 만든 8마리 슬레이 더 스파이어식
    // 보스에게 "능력치만"(hp/atk/def/spd/exp/gold) 깊이 순서대로 그대로
    // 이관했다. 스킬은 각 신규 보스 고유의 것을 그대로 쓴다(이관 안 함).
    // 매칭 순서: 유해룡→감시자의 석판, 리치→빈 옷의 예언자, 망령여왕→뿔 두른
    // 파수인, 오우거→재봉인형, 크라켄→칼날꽃, 파수꾼→등롱, 처형자→태엽 심장,
    // 악마 군주→모래. (참고: 기존 데이터에 '회랑의 리치'가 실수로 두 번 중복
    // 등록되어 있었는데, 이번에 함께 정리했다.)
    {type:'watchertablet',  name:'감시자의 석판',     minDepth:6,  hp:90,  atk:16, def:6,  spd:7,  exp:80,  gold:[60,90],   skills:['carvedBrand','unblinkingGaze']},
    {type:'hollowprophet',  name:'빈 옷의 예언자',    minDepth:8,  hp:130, atk:20, def:10, spd:9,  exp:140, gold:[100,150], skills:['lockedVoices','prophecyFlame'], weakness:'dot'},
    {type:'hornedwarden',   name:'뿔 두른 파수인',    minDepth:12, hp:145, atk:21, def:9,  spd:12, exp:150, gold:[105,145], skills:['judgmentKey','whisperingHorn']},
    {type:'threadmannequin',name:'붉은 실의 재봉인형', minDepth:14, hp:150, atk:24, def:10, spd:5,  exp:160, gold:[110,150], skills:['threadWinds','scissorGreeting']},
    {type:'bladedbloom',    name:'넝쿨진 칼날꽃',     minDepth:16, hp:180, atk:23, def:12, spd:6,  exp:200, gold:[130,170], skills:['petalBloodletting','bladeStemSweep']},
    {type:'sinlantern',     name:'죄의 등롱',         minDepth:18, hp:210, atk:26, def:18, spd:3,  exp:260, gold:[160,220], skills:['burningSin','lanternChorus']},
    {type:'clockheart',     name:'잠들지 않는 태엽 심장', minDepth:20, hp:235, atk:27, def:20, spd:4, exp:300, gold:[170,230], skills:['pulseShockwave','rustedChainBind'], weakness:'dot'},
    {type:'unstoppingsand', name:'멈추지 않는 모래',   minDepth:28, hp:260, atk:32, def:16, spd:9,  exp:380, gold:[220,300], skills:['crumblingSand','timeTurningBack'], weakness:'dot'},
  ];


  // 10층 단위로 재편성했다(사용자 요청). 각 구역은 배경 이미지(dungeon1.png~
  // dungeon6.png, images/backgrounds/)와 1:1로 대응되며, monster-visuals.js의
  // DUNGEON_BG_ZONES가 이 depth 구간을 그대로 참고해 배경을 고른다 — 여기서
  // max 값을 바꾸면 그쪽도 반드시 맞춰서 바꿔야 한다(정확히 동일한
  // 10/20/30/40/50 경계를 쓰도록 맞춰뒀다 — 타이어 보스 층수(tierIndex*10+10)와
  // 정확히 일치시켜, 보스전 시점에 구역/배경이 미리 다음 걸로 안 넘어가게
  // 수정했다). 층이 깊어질수록 이름과 묘사가 점점 더 불길해지도록 순서대로 배치했다.
  const LOCATIONS = [
    {max:10, name:'이끼 낀 입구',        desc:'축축한 돌벽 사이로 곰팡이 냄새가 스며든다. 아직은 얕은 곳이다.'},
    {max:20, name:'무너진 회랑',         desc:'천장이 군데군데 무너져 내린 통로. 저 멀리서 무언가 움직이는 소리가 들린다.'},
    {max:30, name:'망자의 묘실',         desc:'벽마다 새겨진 이름들이 횃불 빛에 일렁인다. 뼈 부딪는 소리가 가까워진다.'},
    {max:40, name:'저주받은 지하 신전',   desc:'보랏빛 안개가 바닥을 타고 흐른다. 이곳의 공기는 살아있는 것을 거부한다.'},
    {max:50, name:'타오르는 심연의 경계', desc:'벽 틈새로 붉은 열기가 스며 나온다. 발밑에서부터 무언가가 꿈틀거리는 것 같다.'},
    // 사용자 요청 — 최종보스 직전의 특수 2노드 구간("고요한 제단",
    // tierIndex===5, nodemap.js의 generateSilentAltarMap 참고). 여기서부터
    // 진짜 최종보스 노드까지 이어진다.
    {max:60, name:'고요한 제단', desc:'모든 소리가 잦아든다. 횃불조차 흔들리지 않는 이곳, 무언가가 조용히 기다리고 있다.'},
    // [수정됨] 원래 "용의 둥지"였으나, 50층 최종보스가 용이 아니라 잠식된 용사들
    // (직업별 타락한 모습) 또는 진 최종보스 "회랑의 시조"라 이름이 안 맞았다.
    // 실제 최종보스 컨셉에 맞춰 "회랑의 심장부"로 교체 — 태초부터 이 회랑에
    // 있었던 무언가라는 뉘앙스로, 어떤 최종보스가 나오든 자연스럽게 어울린다.
    {max:9999, name:'회랑의 심장부', desc:'차갑고 무거운 공기가 짓누른다. 이 회랑의 가장 깊은 곳, 태초부터 있었던 무언가가 아직 잠들지 않았다.'},
  ];
