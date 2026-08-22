"use strict";
/*
몬스터 도감 데이터 테이블(정적 데이터, 로직 없음).
의존성 없음.
export(전역): MONSTERS, BOSSES, LOCATIONS
*/

  /* ============ 몬스터 도감 ============ */
  const MONSTERS = [
    {type:'slime',   name:'끈적 슬라임',   minDepth:0,  hp:16, atk:4,  def:1,  spd:3,  exp:8,  gold:[4,9],   skills:[]},
    {type:'goblin',  name:'숲 고블린',     minDepth:0,  hp:22, atk:6,  def:2,  spd:6,  exp:12, gold:[6,14],  skills:[]},
    {type:'bat',     name:'박쥐 떼',       minDepth:1,  hp:14, atk:5,  def:1,  spd:12, exp:10, gold:[5,10],  skills:['bite']},
    {type:'bandit',  name:'떠돌이 도적',   minDepth:1,  hp:24, atk:7,  def:2,  spd:8,  exp:14, gold:[10,20], skills:['steal']},
    {type:'wolf',    name:'검은 늑대',     minDepth:2,  hp:26, atk:8,  def:2,  spd:10, exp:16, gold:[5,12],  skills:['bite']},
    {type:'spider',  name:'독거미',        minDepth:3,  hp:28, atk:9,  def:3,  spd:7,  exp:18, gold:[9,16],  skills:['bite']},
    {type:'skeleton',name:'해골 전사',     minDepth:3,  hp:32, atk:9,  def:4,  spd:5,  exp:20, gold:[8,18],  skills:[]},
    {type:'ghost',   name:'원혼',          minDepth:5,  hp:30, atk:10, def:2,  spd:11, exp:24, gold:[12,20], skills:['curse']},
    {type:'orc',     name:'오크 전사',     minDepth:5,  hp:44, atk:12, def:5,  spd:4,  exp:28, gold:[14,26], skills:['smash']},
    {type:'mimic',   name:'미믹',          minDepth:6,  hp:26, atk:15, def:3,  spd:4,  exp:30, gold:[25,40], skills:['smash']},
    {type:'witch',   name:'숲의 마녀',     minDepth:6,  hp:34, atk:6,  def:3,  spd:9,  exp:26, gold:[16,28], skills:['curse','heal']},
    {type:'knight',  name:'언데드 기사',   minDepth:8,  hp:52, atk:13, def:8,  spd:5,  exp:36, gold:[20,34], skills:['smash']},
    {type:'ogre',    name:'오우거',        minDepth:9,  hp:58, atk:14, def:6,  spd:3,  exp:40, gold:[18,30], skills:['smash']},
    {type:'harpy',   name:'하피',          minDepth:11, hp:38, atk:12, def:3,  spd:14, exp:34, gold:[16,26], skills:['bite']},
    {type:'wraith',  name:'레이스',        minDepth:13, hp:48, atk:13, def:6,  spd:8,  exp:42, gold:[20,32], skills:['curse','heal']},
    {type:'cultist', name:'광신도',        minDepth:14, hp:40, atk:11, def:4,  spd:7,  exp:40, gold:[22,34], skills:['curse','heal']},
    {type:'minotaur',name:'미노타우로스',  minDepth:17, hp:66, atk:18, def:8,  spd:6,  exp:56, gold:[28,42], skills:['smash']},
    {type:'golem',   name:'돌 골렘',       minDepth:20, hp:90, atk:16, def:14, spd:2,  exp:68, gold:[30,48], skills:['smash']},
    {type:'treant',  name:'고목 정령',     minDepth:22, hp:95, atk:15, def:10, spd:3,  exp:70, gold:[32,50], skills:['heal']},
    {type:'demon',   name:'하급 악마',     minDepth:26, hp:80, atk:22, def:10, spd:8,  exp:90, gold:[45,65], skills:['smash','curse']},
  ];
  const BOSSES = [
    {type:'dragon',  name:'붉은 유해룡',     minDepth:5,  hp:90,  atk:16, def:6,  spd:7, exp:80,  gold:[60,90],   skills:['bite','smash']},
    {type:'wraithqueen', name:'심연의 망령여왕', minDepth:12, hp:145, atk:21, def:9,  spd:12, exp:150, gold:[105,145], skills:['wraithWail','curse','heal']},
    {type:'lich',    name:'회랑의 리치',     minDepth:10, hp:130, atk:20, def:10, spd:9, exp:140, gold:[100,150], skills:['curse','heal','smash']},
    {type:'ogre',    name:'오우거 대족장',   minDepth:15, hp:150, atk:24, def:10, spd:5, exp:160, gold:[110,150], skills:['smash']},
      {type:'kraken',  name:'심해의 크라켄',   minDepth:20, hp:180, atk:23, def:12, spd:6, exp:200, gold:[130,170], skills:['krakenGrip','bite']},
    {type:'lich',    name:'회랑의 리치',     minDepth:10, hp:130, atk:20, def:10, spd:9, exp:140, gold:[100,150], skills:['curse','heal','smash']},
    {type:'golem',   name:'태고의 파수꾼',   minDepth:25, hp:210, atk:26, def:18, spd:3, exp:260, gold:[160,220], skills:['smash']},
     {type:'ironjudge', name:'폭주 강철 처형자', minDepth:30, hp:235, atk:27, def:20, spd:4, exp:300, gold:[170,230], skills:['ironCrush','smash']},
    {type:'demon',   name:'심연의 악마 군주', minDepth:35, hp:260, atk:32, def:16, spd:9, exp:380, gold:[220,300], skills:['smash','curse','heal']},
  ];


  const LOCATIONS = [
    {max:2, name:'이끼 낀 입구', desc:'축축한 돌벽 사이로 곰팡이 냄새가 스며든다. 아직은 얕은 곳이다.'},
    {max:5, name:'무너진 회랑', desc:'천장이 군데군데 무너져 내린 통로. 저 멀리서 무언가 움직이는 소리가 들린다.'},
    {max:9, name:'망자의 묘실', desc:'벽마다 새겨진 이름들이 횃불 빛에 일렁인다. 뼈 부딪는 소리가 가까워진다.'},
    {max:14,name:'저주받은 지하 신전', desc:'보랏빛 안개가 바닥을 타고 흐른다. 이곳의 공기는 살아있는 것을 거부한다.'},
    {max:99,name:'용의 둥지', desc:'열기가 벽을 타고 올라온다. 이 아래 무언가 거대한 것이 잠들어 있다.'},
  ];

