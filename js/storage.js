"use strict";
/*
저장/불러오기 — window.storage(Claude 아티팩트) 또는 localStorage 폴백.
세이브 데이터, 모험 기록, 유물 도감, 패치노트 상태를 영속화한다.
의존성 없음(이 파일 내부에서 SAVE_KEY 등 상수도 함께 선언).
export(전역): SAVE_KEY, saveGame, loadGame, deleteSave, RECORDS_KEY, addRecord, loadRecords,
              RELICDEX_KEY, 관련 함수들, PATCHNOTE_VERSION, PATCHNOTE_KEY,
              loadDismissedPatchNote, markPatchNoteDismissed 등
주의: saveGame()은 player/depth/town 등 게임 상태 전역 변수(state.js)를 참조한다.
*/

  /* ============ 저장/불러오기 ============ */
  const SAVE_KEY = 'savegame';
  // Claude 아티팩트 환경(window.storage)이 있으면 그것을 쓰고,
  // 독립 실행(파일로 열거나 호스팅된 페이지)인 경우 localStorage로 대체한다.
  function hasArtifactStorage(){
    return typeof window !== 'undefined' && window.storage
      && typeof window.storage.set === 'function'
      && typeof window.storage.get === 'function';
  }
  function hasLocalStorage(){
    try{
      if(typeof window === 'undefined' || !window.localStorage) return false;
      const t = '__lc_test__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return true;
    }catch(e){ return false; }
  }
  function storageAvailable(){
    return hasArtifactStorage() || hasLocalStorage();
  }

  // 짧은 시간 안에 saveGame()이 여러 번 호출되어도 실제 저장 요청은
  // 한 번만(디바운스) 나가도록 하고, 동시에 여러 요청이 겹치지 않게 큐잉한다.
  let saveDebounceTimer = null;
  let saveInFlight = false;
  let saveQueuedAgain = false;

  function saveGame(){
    if(!player) return;
    if(!storageAvailable()) return;
    if(saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(performSave, 400);
  }

  async function performSave(attempt){
    attempt = attempt || 1;
    if(saveInFlight){ saveQueuedAgain = true; return; }
    saveInFlight = true;
    const payload = JSON.stringify({player, depth, town, inBossDen, bossDenFloor});
    try{
      if(hasArtifactStorage()){
        await window.storage.set(SAVE_KEY, payload, false);
      } else if(hasLocalStorage()){
        window.localStorage.setItem(SAVE_KEY, payload);
      }
    }catch(e){
      const msg = e && e.message ? e.message : e;
      if(attempt < 3){
        // 서버 일시 오류일 수 있으므로 잠시 후 재시도
        saveInFlight = false;
        setTimeout(()=>performSave(attempt+1), 600*attempt);
        return;
      }
      console.warn('저장을 사용할 수 없습니다(재시도 실패):', msg);
    } finally {
      saveInFlight = false;
    }
    if(saveQueuedAgain){
      saveQueuedAgain = false;
      saveDebounceTimer = setTimeout(performSave, 400);
    }
  }

  async function loadGame(){
    if(!storageAvailable()) return null;
    try{
      if(hasArtifactStorage()){
        const res = await window.storage.get(SAVE_KEY, false);
        if(res && res.value) return JSON.parse(res.value);
      } else if(hasLocalStorage()){
        const raw = window.localStorage.getItem(SAVE_KEY);
        if(raw) return JSON.parse(raw);
      }
    }catch(e){ /* 저장 데이터 없음, 정상 */ }
    return null;
  }
  async function deleteSave(){
    if(!storageAvailable()) return;
    try{
      if(hasArtifactStorage()) await window.storage.delete(SAVE_KEY, false);
      else if(hasLocalStorage()) window.localStorage.removeItem(SAVE_KEY);
    }catch(e){ /* ignore */ }
  }

  // ---------- 이전 모험 기록(엔딩을 본 캐릭터들의 발자취) ----------
  const RECORDS_KEY = 'gamerecords';
  async function loadRecords(){
    if(!storageAvailable()) return [];
    try{
      if(hasArtifactStorage()){
        const res = await window.storage.get(RECORDS_KEY, false);
        if(res && res.value) return JSON.parse(res.value);
      } else if(hasLocalStorage()){
        const raw = window.localStorage.getItem(RECORDS_KEY);
        if(raw) return JSON.parse(raw);
      }
    }catch(e){ /* 기록 없음, 정상 */ }
    return [];
  }
  async function addRecord(record){
    const records = await loadRecords();
    records.push(record);
    while(records.length > 30) records.shift();
    const payload = JSON.stringify(records);
    try{
      if(hasArtifactStorage()) await window.storage.set(RECORDS_KEY, payload, false);
      else if(hasLocalStorage()) window.localStorage.setItem(RECORDS_KEY, payload);
    }catch(e){ /* ignore */ }
    return records;
  }

  // ---------- 유물 도감(발견한 유물은 런이 끝나도 영구히 기록된다) ----------
  const RELICDEX_KEY = 'relicdex';
  async function loadRelicDex(){
    if(!storageAvailable()) return [];
    try{
      if(hasArtifactStorage()){
        const res = await window.storage.get(RELICDEX_KEY, false);
        if(res && res.value) return JSON.parse(res.value);
      } else if(hasLocalStorage()){
        const raw = window.localStorage.getItem(RELICDEX_KEY);
        if(raw) return JSON.parse(raw);
      }
    }catch(e){ /* 기록 없음, 정상 */ }
    return [];
  }
  async function addToRelicDex(id){
    const dex = await loadRelicDex();
    if(dex.includes(id)) return dex;
    dex.push(id);
    const payload = JSON.stringify(dex);
    try{
      if(hasArtifactStorage()) await window.storage.set(RELICDEX_KEY, payload, false);
      else if(hasLocalStorage()) window.localStorage.setItem(RELICDEX_KEY, payload);
    }catch(e){ /* ignore */ }
    return dex;
  }
  // 패치노트 — 버전 문자열을 바꾸면 "다시 보지 않기"를 눌렀던 사람에게도 새 패치노트가 다시 뜬다.
  const PATCHNOTE_VERSION = 'mechanic-renewal-1';
  const PATCHNOTE_KEY = 'patchnote_dismissed';
  async function loadDismissedPatchNote(){
    if(!storageAvailable()) return null;
    try{
      if(hasArtifactStorage()){
        const res = await window.storage.get(PATCHNOTE_KEY, false);
        if(res && res.value) return res.value;
      } else if(hasLocalStorage()){
        return window.localStorage.getItem(PATCHNOTE_KEY);
      }
    }catch(e){ /* ignore */ }
    return null;
  }
  async function dismissPatchNoteForever(){
    try{
      if(hasArtifactStorage()) await window.storage.set(PATCHNOTE_KEY, PATCHNOTE_VERSION, false);
      else if(hasLocalStorage()) window.localStorage.setItem(PATCHNOTE_KEY, PATCHNOTE_VERSION);
    }catch(e){ /* ignore */ }
  }
  // 저장 기능에서 발생하는 예기치 못한 오류가 게임 전체를 멈추지 않도록 방지
  window.addEventListener('unhandledrejection', function(ev){
    if(ev && ev.reason){ console.warn('처리되지 않은 오류(무시됨):', ev.reason); }
    ev.preventDefault && ev.preventDefault();
  });

