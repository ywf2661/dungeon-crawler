"use strict";
/*
업적 정의 데이터.
hidden:true인 항목은 도감(records.js의 showAchievements())에서 달성 전까지
이름/설명이 "???"로 가려지고, 달성 시점에만 공개된다.
실제 판정 로직은 records.js의 checkAchievements()에 있다 — 여기는 데이터만 담는다.
export(전역): ACHIEVEMENTS
의존성 없음.
*/

  const ACHIEVEMENTS = [
    {id:'ach_new_guardian',      name:'회랑의 새로운 파수꾼', desc:'회랑의 가장 깊은 곳에서 최종보스를 물리쳤으나, 그 자신이 새로운 파수꾼이 되었다.'},
    {id:'ach_progenitor_rest',   name:'회랑, 안식에 들다',   desc:'회랑의 시조를 물리치고, 진정한 엔딩을 보았다.'},
    {id:'ach_witch_time',        name:'회랑, 시간을 되찾다', desc:'시간의 마녀 Aiōn을 물리치고, 멈춰 있던 회랑의 시간을 되찾았다.', hidden:true},
    {id:'ach_hardcore_clear',    name:'하드코어 클리어',     desc:'하드코어 난이도로 엔딩을 보았다.'},
    {id:'ach_flawless',          name:'무결 클리어',         desc:'단 한 번도 쓰러지지 않고 진 최종보스를 물리쳤다.'},
    {id:'ach_relicdex_complete', name:'유물 감정가',         desc:'세상의 모든 유물을 도감에 기록했다.'},
    {id:'ach_achos_keepsake',    name:'낡은 반지',           desc:'낡은 병사의 반지를 손에 넣었다.'},
    {id:'ach_triple_curse',      name:'저주받은 자',         desc:'저주 3종 이상을 짊어진 채 엔딩을 보았다.'},
    {id:'ach_pure_misfortune',   name:'순수한 불행',         desc:'축복은 하나도 없이, 저주만 짊어진 채 엔딩을 보았다.'},
    {id:'ach_contract_incarnate',name:'계약의 화신',         desc:'보유한 유물이 전부 계약형뿐인 채로 엔딩을 보았다.'},
    {id:'ach_all_rounder',       name:'만능 모험가',         desc:'여섯 직업 모두로 엔딩을 보았다.'},
    {id:'ach_frequent_flyer',    name:'회랑의 단골',         desc:'누적으로 엔딩을 10회 보았다.'},
    {id:'ach_undying_will',      name:'불굴',               desc:'누적으로 10번 쓰러졌다.'},
  ];
