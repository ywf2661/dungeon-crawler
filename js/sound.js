"use strict";
/*
사운드 엔진 — Web Audio API 실시간 합성 BGM/SFX + 실제 음원 파일 BGM(하이브리드).
완전히 캡슐화된 Sound 모듈(IIFE)만 정의. 외부 의존성 없음.
export(전역): const Sound
*/

  /* ============ 사운드 엔진 ============
     SFX와, 음원 파일이 없는 BGM 모드는 여전히 Web Audio 실시간 합성.
     사용자가 제공한 실제 음원 파일이 있는 모드(BGM_FILES에 등록된 모드)는
     <audio> 엘리먼트로 재생한다(합성 BGM은 그 모드 동안 꺼둠). 두 시스템은
     setBgmMode() 안에서 배타적으로 전환된다. */
  const Sound = (function(){
    let ctx = null, master = null, bgmGain = null, sfxGain = null;
    let muted = false;
    let bgmTimer = null, bgmStep = 0, bgmMode = ''; // 'explore' | 'dungeon' | 'battle' | 'dread' | 'finalboss' | 'truefinalboss' | 'off'
    // (초기값을 일부러 빈 문자열로 둔다 — 'explore'로 두면 최초 setBgmMode('explore')
    // 호출이 "이미 같은 모드"로 판정돼 조기 반환되면서 파일 BGM이 아예 시작을
    // 안 하는 버그가 있었다.)

    // 사용자 제공 실제 음원(60초 트림, mp3 128kbps) — 모드별 트랙 목록.
    // 목록이 2개 이상이면 순서대로(무작위 시작 후 순환) 재생해 플레이리스트처럼 돈다.
    // 여기 없는 모드('explore'=마을/타이틀, 'battle'=일반 전투)는 기존 합성 BGM을 그대로 쓴다
    // (사용자가 해당 모드용 음원을 추가로 구하면 여기에 등록만 하면 됨).
    const BGM_FILES = {
      explore: ['audio/bgm/town1.mp3','audio/bgm/town2.mp3'],
      dungeon: ['audio/bgm/dungeon1.mp3','audio/bgm/dungeon2.mp3','audio/bgm/dungeon3.mp3','audio/bgm/dungeon4.mp3','audio/bgm/dungeon5.mp3'],
      battle: ['audio/bgm/battle1.mp3','audio/bgm/battle2.mp3','audio/bgm/battle3.mp3','audio/bgm/battle4.mp3','audio/bgm/battle5.mp3'],
      dread: ['audio/bgm/dread.mp3'],
      finalboss: ['audio/bgm/finalboss.mp3'],
      truefinalboss: ['audio/bgm/truefinalboss.mp3','audio/bgm/truefinalboss2.mp3'],
    };
    let bgmAudioEl = null, bgmPlaylist = [], bgmPlaylistIdx = 0;

    try{
      const saved = window.localStorage ? window.localStorage.getItem('lc_muted') : null;
      if(saved === '1') muted = true;
    }catch(e){ /* ignore */ }

    function ensureBgmAudioEl(){
      if(bgmAudioEl) return bgmAudioEl;
      bgmAudioEl = document.createElement('audio');
      bgmAudioEl.preload = 'auto';
      bgmAudioEl.volume = muted ? 0 : 0.5;
      bgmAudioEl.addEventListener('ended', ()=>{
        // 트랙이 2개 이상인 모드(dungeon)만 플레이리스트처럼 다음 곡으로 순환.
        // 1개뿐인 모드는 loop=true로 두므로 이 리스너 자체가 발동하지 않는다.
        if(bgmPlaylist.length>1){
          bgmPlaylistIdx = (bgmPlaylistIdx+1) % bgmPlaylist.length;
          playBgmTrack(bgmPlaylist[bgmPlaylistIdx]);
        }
      });
      document.body.appendChild(bgmAudioEl);
      return bgmAudioEl;
    }
    function playBgmTrack(src){
      const el = ensureBgmAudioEl();
      el.loop = bgmPlaylist.length<=1;
      el.src = src;
      el.currentTime = 0;
      if(!muted) el.play().catch(()=>{}); // 브라우저 자동재생 정책상 실패할 수 있음 — ensureBgmRunning()에서 재시도
    }
    function stopBgmAudioEl(){
      if(bgmAudioEl) bgmAudioEl.pause();
      bgmPlaylist = [];
    }

    function ensureCtx(){
      if(!ctx){
        const AC = window.AudioContext || window.webkitAudioContext;
        if(!AC) return null;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
        bgmGain = ctx.createGain(); bgmGain.gain.value = 0.16; bgmGain.connect(master);
        sfxGain = ctx.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(master);
      }
      if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
      return ctx;
    }

    function noiseBuffer(c, dur){
      const n = Math.max(1, Math.floor(c.sampleRate*dur));
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for(let i=0;i<n;i++) d[i] = (Math.random()*2-1) * (1 - i/n); // 살짝 감쇠하는 노이즈
      return buf;
    }

    // ---- 개별 효과음 ----
    function slash(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 0.16);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(4200, t); bp.frequency.exponentialRampToValueAtTime(600, t+0.14);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.7, t+0.008); g.gain.exponentialRampToValueAtTime(0.0001, t+0.16);
      src.connect(bp); bp.connect(g); g.connect(sfxGain);
      src.start(t); src.stop(t+0.17);
    }
    function multiSlash(n){
      for(let i=0;i<Math.max(1,n||2);i++) setTimeout(slash, i*130);
    }
    function bomb(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      const osc = c.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(32, t+0.38);
      const og = c.createGain(); og.gain.setValueAtTime(0.85, t); og.gain.exponentialRampToValueAtTime(0.001, t+0.42);
      osc.connect(og); og.connect(sfxGain); osc.start(t); osc.stop(t+0.42);

      const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 0.55);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(120, t+0.55);
      const ng = c.createGain(); ng.gain.setValueAtTime(0.55, t); ng.gain.exponentialRampToValueAtTime(0.001, t+0.55);
      src.connect(lp); lp.connect(ng); ng.connect(sfxGain);
      src.start(t); src.stop(t+0.55);
    }
    function magic(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      [0, 0.04].forEach((delay, i)=>{
        const osc = c.createOscillator(); osc.type = i===0?'triangle':'sine';
        const start = 520 + i*180;
        osc.frequency.setValueAtTime(start, t+delay);
        osc.frequency.exponentialRampToValueAtTime(start*2.1, t+delay+0.22);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t+delay);
        g.gain.exponentialRampToValueAtTime(0.32, t+delay+0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t+delay+0.3);
        osc.connect(g); g.connect(sfxGain);
        osc.start(t+delay); osc.stop(t+delay+0.32);
      });
    }
    function heal(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      [0,0.09,0.18].forEach((delay,i)=>{
        const osc = c.createOscillator(); osc.type = 'sine';
        osc.frequency.setValueAtTime([523,659,784][i], t+delay);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t+delay);
        g.gain.exponentialRampToValueAtTime(0.28, t+delay+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t+delay+0.35);
        osc.connect(g); g.connect(sfxGain);
        osc.start(t+delay); osc.stop(t+delay+0.36);
      });
    }
    function guard(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      const osc = c.createOscillator(); osc.type = 'square';
      osc.frequency.setValueAtTime(180, t);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t+0.01); g.gain.exponentialRampToValueAtTime(0.0001, t+0.2);
      const lp = c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = 900;
      osc.connect(lp); lp.connect(g); g.connect(sfxGain);
      osc.start(t); osc.stop(t+0.2);
    }
    function buff(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      const osc = c.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t); osc.frequency.exponentialRampToValueAtTime(660, t+0.3);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t+0.05); g.gain.exponentialRampToValueAtTime(0.0001, t+0.32);
      const lp = c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = 1800;
      osc.connect(lp); lp.connect(g); g.connect(sfxGain);
      osc.start(t); osc.stop(t+0.33);
    }
    function hit(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      const osc = c.createOscillator(); osc.type='triangle';
      osc.frequency.setValueAtTime(160, t); osc.frequency.exponentialRampToValueAtTime(60, t+0.18);
      const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.2);
      osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t+0.2);
    }
    function poisonHit(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 0.22);
      const bp = c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=900; bp.Q.value=4;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001,t);
      g.gain.exponentialRampToValueAtTime(0.3, t+0.02); g.gain.exponentialRampToValueAtTime(0.0001, t+0.22);
      src.connect(bp); bp.connect(g); g.connect(sfxGain); src.start(t); src.stop(t+0.22);
    }
    function coin(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      [0,0.06].forEach((delay,i)=>{
        const osc = c.createOscillator(); osc.type='square';
        osc.frequency.setValueAtTime(i===0?988:1318, t+delay);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t+delay);
        g.gain.exponentialRampToValueAtTime(0.16, t+delay+0.01); g.gain.exponentialRampToValueAtTime(0.0001, t+delay+0.18);
        osc.connect(g); g.connect(sfxGain); osc.start(t+delay); osc.stop(t+delay+0.19);
      });
    }
    function fail(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      const osc = c.createOscillator(); osc.type='sawtooth';
      osc.frequency.setValueAtTime(300, t); osc.frequency.exponentialRampToValueAtTime(90, t+0.3);
      const g = c.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.32);
      osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t+0.32);
    }
    function potion(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      [0,0.05,0.1].forEach((delay,i)=>{
        const osc = c.createOscillator(); osc.type='sine';
        osc.frequency.setValueAtTime(700-i*90, t+delay);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t+delay);
        g.gain.exponentialRampToValueAtTime(0.2, t+delay+0.015); g.gain.exponentialRampToValueAtTime(0.0001, t+delay+0.12);
        osc.connect(g); g.connect(sfxGain); osc.start(t+delay); osc.stop(t+delay+0.13);
      });
    }
    function click(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      const osc = c.createOscillator(); osc.type='square'; osc.frequency.setValueAtTime(700, t);
      const g = c.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.05);
      osc.connect(g); g.connect(sfxGain); osc.start(t); osc.stop(t+0.05);
    }
    function levelUp(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      [0,0.1,0.2,0.32].forEach((delay,i)=>{
        const osc = c.createOscillator(); osc.type='triangle';
        osc.frequency.setValueAtTime([523,659,784,1047][i], t+delay);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t+delay);
        g.gain.exponentialRampToValueAtTime(0.3, t+delay+0.02); g.gain.exponentialRampToValueAtTime(0.0001, t+delay+0.4);
        osc.connect(g); g.connect(sfxGain); osc.start(t+delay); osc.stop(t+delay+0.4);
      });
    }
    function victory(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      [[0,523],[0.14,659],[0.28,784],[0.42,1047],[0.56,1319]].forEach(([delay,freq])=>{
        const osc = c.createOscillator(); osc.type='triangle'; osc.frequency.setValueAtTime(freq, t+delay);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t+delay);
        g.gain.exponentialRampToValueAtTime(0.32, t+delay+0.02); g.gain.exponentialRampToValueAtTime(0.0001, t+delay+0.5);
        osc.connect(g); g.connect(sfxGain); osc.start(t+delay); osc.stop(t+delay+0.5);
      });
    }
    function gameOver(){
      const c = ensureCtx(); if(!c || muted) return;
      const t = c.currentTime;
      [[0,392],[0.22,349],[0.44,261]].forEach(([delay,freq])=>{
        const osc = c.createOscillator(); osc.type='sine'; osc.frequency.setValueAtTime(freq, t+delay);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t+delay);
        g.gain.exponentialRampToValueAtTime(0.3, t+delay+0.04); g.gain.exponentialRampToValueAtTime(0.0001, t+delay+0.7);
        osc.connect(g); g.connect(sfxGain); osc.start(t+delay); osc.stop(t+delay+0.7);
      });
    }

    // 상태이상 부여음: burn=폭발음, poison=산성 지글거림, bleed=베인 소리
    function statusApply(type){
      if(type==='burn') bomb();
      else if(type==='poison') poisonHit();
      else if(type==='bleed') slash();
    }

    // ---- 배경음(BGM): 저음 드론 + 간헐적 아르페지오를 실시간 스케줄링하는 루프 ----
    const SCALE_EXPLORE = [220, 261.6, 293.7, 329.6, 392, 440]; // A minor 계열, 잔잔하게
    const SCALE_BATTLE   = [220, 246.9, 277.2, 329.6, 369.9, 440]; // 살짝 긴장감 있는 스케일
    // 사용자 요청 — 최종 노드맵("고요한 제단")/최종보스전 전용 긴박한 스케일.
    // 반음 간격(220-233.1)과 트라이톤(220-311.1)을 섞어 불협화음을 만든다.
    const SCALE_DREAD    = [220, 233.1, 277.2, 311.1, 349.2, 415.3];
    const SCALE_FINALBOSS = [220, 233.1, 277.2, 311.1, 369.9, 415.3, 466.2];
    let droneOsc = [];

    function stopDrone(){
      droneOsc.forEach(o=>{ try{ o.stop(); }catch(e){} });
      droneOsc = [];
    }
    function startDrone(){
      const c = ensureCtx(); if(!c) return;
      stopDrone();
      const t = c.currentTime;
      // 최종보스전은 저음역에 트라이톤(불협화음) 간격을 준 드론으로 다른 전투보다
      // 훨씬 불안하게, 고요한 제단은 explore보다 좁고 팽팽한 간격으로 긴장감만 더한다.
      const freqs = bgmMode==='finalboss' ? [82.4, 116.5]
        : bgmMode==='dread' ? [110, 155.6]
        : bgmMode==='battle' ? [110, 164.8] : [110, 146.8];
      freqs.forEach((f,i)=>{
        const osc = c.createOscillator(); osc.type = i===0?'sine':'triangle';
        osc.frequency.setValueAtTime(f, t);
        const g = c.createGain(); g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(i===0?0.5:0.28, t+2.2);
        const lp = c.createBiquadFilter(); lp.type='lowpass';
        lp.frequency.value = bgmMode==='finalboss' ? 2000 : (bgmMode==='dread' ? 1100 : (bgmMode==='battle'?1400:900));
        osc.connect(lp); lp.connect(g); g.connect(bgmGain);
        osc.start(t);
        droneOsc.push(osc); droneOsc.push(g);
      });
    }
    function scheduleBgmStep(){
      const c = ensureCtx(); if(!c || bgmMode==='off') return;
      const scale = bgmMode==='finalboss' ? SCALE_FINALBOSS
        : bgmMode==='dread' ? SCALE_DREAD
        : bgmMode==='battle' ? SCALE_BATTLE : SCALE_EXPLORE;
      const interval = bgmMode==='finalboss' ? 650 : bgmMode==='dread' ? 1100 : bgmMode==='battle' ? 900 : 1500;
      const prob = bgmMode==='finalboss' ? 0.7 : bgmMode==='dread' ? 0.45 : bgmMode==='battle' ? 0.55 : 0.35;
      // 확률적으로 짧은 아르페지오 음을 하나 얹어 심심하지 않게 한다(음소거 시엔 건너뜀)
      if(!muted && Math.random() < prob){
        const t = c.currentTime;
        const freq = scale[Math.floor(Math.random()*scale.length)] * (Math.random()<0.5?2:1);
        const osc = c.createOscillator(); osc.type='sine'; osc.frequency.setValueAtTime(freq, t);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(bgmMode==='finalboss'?0.13:0.1, t+0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t+0.9);
        osc.connect(g); g.connect(bgmGain);
        osc.start(t); osc.stop(t+0.95);
      }
      bgmTimer = setTimeout(scheduleBgmStep, interval);
    }
    function setBgmMode(mode){
      if(bgmMode === mode) return;
      bgmMode = mode;
      const files = BGM_FILES[mode];
      if(files){
        // 실제 음원 파일이 있는 모드 — 합성 BGM은 끄고 파일 재생으로 전환.
        stopDrone();
        if(bgmTimer) clearTimeout(bgmTimer);
        bgmPlaylist = files;
        bgmPlaylistIdx = Math.floor(Math.random()*files.length);
        playBgmTrack(bgmPlaylist[bgmPlaylistIdx]);
        return;
      }
      // 파일 없는 모드 — 기존 합성 BGM('explore'=마을/타이틀, 'battle'=일반 전투 등).
      stopBgmAudioEl();
      const c = ensureCtx(); if(!c) return;
      if(mode==='off'){
        stopDrone();
        if(bgmTimer) clearTimeout(bgmTimer);
        return;
      }
      startDrone();
      if(bgmTimer) clearTimeout(bgmTimer);
      scheduleBgmStep();
    }
    function ensureBgmRunning(){
      // 최초 사용자 입력 시 오디오를 깨운다(합성 BGM용 AudioContext + 파일 BGM
      // <audio> 재생 둘 다 브라우저 자동재생 정책의 영향을 받는다).
      const c = ensureCtx(); if(!c) return;
      if(BGM_FILES[bgmMode]){
        if(bgmAudioEl && bgmAudioEl.paused && !muted) bgmAudioEl.play().catch(()=>{});
        return;
      }
      if(droneOsc.length===0 && bgmMode!=='off') startDrone();
      if(!bgmTimer && bgmMode!=='off') scheduleBgmStep();
    }

    function setMuted(v){
      muted = v;
      if(master) master.gain.value = muted ? 0 : 1;
      if(bgmAudioEl){
        if(muted) bgmAudioEl.pause();
        else { bgmAudioEl.volume = 0.5; bgmAudioEl.play().catch(()=>{}); }
      }
      try{ if(window.localStorage) window.localStorage.setItem('lc_muted', muted?'1':'0'); }catch(e){}
    }
    function toggleMuted(){ setMuted(!muted); return muted; }
    function isMuted(){ return muted; }

    return {
      ensureCtx, ensureBgmRunning, setBgmMode,
      slash, multiSlash, bomb, magic, heal, guard, buff, hit, poisonHit, coin, fail, potion, click,
      levelUp, victory, gameOver, statusApply,
      setMuted, toggleMuted, isMuted,
    };
  })();

