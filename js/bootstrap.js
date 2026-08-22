"use strict";
/*
앱 부트스트랩 — init() 함수(모든 DOM 이벤트 바인딩) + 패치노트 모달.
반드시 다른 모든 모듈이 로드된 뒤, 파일 로드 순서상 가장 마지막에 위치해야 한다(index.html 참고).
export(전역): init, showPatchNoteModal
의존성: 사실상 전체 모듈(이벤트 핸들러 안에서 다른 모든 모듈의 함수를 호출함)
*/

  function init(){
    town = true; depth = 0; battleOver=false; subMode=null;
    inBossDen = false; bossDenFloor = 0;
    renderJobSelect();
    renderDifficultySelect();

    // 사운드 토글 버튼 — 최초 클릭 시 AudioContext를 깨워 브라우저 자동재생 제한을 해제한다
    const soundBtn = document.getElementById('sound-toggle');
    function refreshSoundBtn(){
      const m = Sound.isMuted();
      soundBtn.textContent = m ? '🔇' : '🔊';
      soundBtn.classList.toggle('muted', m);
    }
    refreshSoundBtn();
    soundBtn.addEventListener('click', ()=>{
      Sound.ensureCtx();
      Sound.toggleMuted();
      refreshSoundBtn();
      if(!Sound.isMuted()){ Sound.click(); Sound.ensureBgmRunning(); }
    });
    // 화면 어디를 처음 눌러도 오디오가 자연스럽게 깨어나도록 한 번만 걸어둔다
    const wakeAudioOnce = ()=>{ Sound.ensureCtx(); Sound.ensureBgmRunning(); document.removeEventListener('pointerdown', wakeAudioOnce); };
    document.addEventListener('pointerdown', wakeAudioOnce, {once:true});

    document.getElementById('btn-start').addEventListener('click', ()=>startGame(false));
    document.getElementById('btn-continue').addEventListener('click', startGame.bind(null, true));
    document.getElementById('btn-delete-save').addEventListener('click', async ()=>{
      await deleteSave();
      document.getElementById('continue-info').style.display='none';
      document.getElementById('btn-continue').style.display='none';
      document.getElementById('btn-delete-save').style.display='none';
    });
    document.getElementById('btn-relicdex').addEventListener('click', ()=>{ showRelicDex(); });
    document.getElementById('btn-restart').addEventListener('click', ()=>{
      // player는 이미 쓰러진 시점에 마을로 옮겨져 체력이 회복되고 골드가 절반이 되었다.
      showScreen('explore');
      renderStatus();
      renderExplore(['다시 회랑 어귀에 섰다. 소지품과 체력이 정비되었다.']);
      saveGame();
    });
    document.getElementById('btn-ending-title').addEventListener('click', async ()=>{
      const job = getJob(player);
      const hybrid = getHybrid(player);
      const jobLabel = hybrid ? `${hybrid.icon} ${hybrid.name}` : `${job.icon} ${job.name}`;
      const record = {
        name: player.name, jobLabel, level: player.level,
        deathCount: player.deathCount||0, ts: Date.now(),
        difficulty: player.difficulty||'easy',
        trueEnding: !!player.trueEndingSeen,
      };
      await addRecord(record);
      await deleteSave();
      window.__savedGame = null;
      document.getElementById('continue-info').style.display='none';
      document.getElementById('btn-continue').style.display='none';
      document.getElementById('btn-delete-save').style.display='none';
      document.getElementById('statusbar').style.display='none';
      showScreen('title');
      loadRecords().then(records=>{
        renderRecords(records);
        normalUnlocked = records.length > 0;
        hardcoreUnlocked = records.some(r=> r.difficulty==='normal' || r.difficulty==='hardcore');
        easyFlawless = records.some(r=> r.difficulty==='easy' && r.trueEnding);
        normalFlawless = records.some(r=> r.difficulty==='normal' && r.trueEnding);
        hardcoreFlawless = records.some(r=> r.difficulty==='hardcore' && r.trueEnding);
        renderDifficultySelect();
      });
    });
    document.getElementById('btn-advance').addEventListener('click', onAdvance);
    document.getElementById('btn-rest').addEventListener('click', onRest);
    document.getElementById('btn-shop').addEventListener('click', openShop);
    document.getElementById('btn-equip').addEventListener('click', openEquipment);
    document.getElementById('btn-relics').addEventListener('click', showMyRelics);
    document.getElementById('btn-town').addEventListener('click', onReturnTown);
    document.getElementById('btn-bossden').addEventListener('click', enterBossDen);
    document.getElementById('cmd-attack').addEventListener('click', ()=>{ Sound.click(); playerAttack(); });
    document.getElementById('cmd-skill').addEventListener('click', ()=>{ Sound.click(); openSub('skill'); });
    document.getElementById('cmd-item').addEventListener('click', ()=>{ Sound.click(); openSub('item'); });
    document.getElementById('cmd-run').addEventListener('click', ()=>{ Sound.click(); playerRun(); });
    document.getElementById('cmd-back').addEventListener('click', ()=>{ Sound.click(); closeSub(); });
    document.getElementById('name-input').addEventListener('keydown', e=>{ if(e.key==='Enter') startGame(false); });

    loadGame().then(saved=>{
      if(saved && saved.player){
        window.__savedGame = saved;
        const savedJob = getJob(saved.player);
        const savedHybrid = getHybrid(saved.player);
        const jobLabel = savedHybrid ? `${savedHybrid.icon} ${savedHybrid.name}` : `${savedJob.icon} ${savedJob.name}`;
        document.getElementById('continue-info').textContent =
          `${saved.player.name} · ${jobLabel} · Lv.${saved.player.level} · ${saved.town?'마을':'깊이 '+saved.depth}`;
        document.getElementById('continue-info').style.display='block';
        document.getElementById('btn-continue').style.display='inline-block';
        document.getElementById('btn-delete-save').style.display='inline-block';
      }
    }).catch(e=>{ console.warn('불러오기 실패(무시):', e); });

    loadRecords().then(records=>{
      renderRecords(records);
      normalUnlocked = records.length > 0;
      hardcoreUnlocked = records.some(r=> r.difficulty==='normal' || r.difficulty==='hardcore');
      easyFlawless = records.some(r=> r.difficulty==='easy' && r.trueEnding);
      normalFlawless = records.some(r=> r.difficulty==='normal' && r.trueEnding);
      hardcoreFlawless = records.some(r=> r.difficulty==='hardcore' && r.trueEnding);
      renderDifficultySelect();
    }).catch(e=>{ console.warn('기록 불러오기 실패(무시):', e); });

    loadDismissedPatchNote().then(dismissedVersion=>{
      if(dismissedVersion !== PATCHNOTE_VERSION) showPatchNoteModal();
    }).catch(e=>{ console.warn('패치노트 상태 불러오기 실패(무시):', e); });
  }

  function showPatchNoteModal(){
    if(document.getElementById('patchnote-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'patchnote-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    panel.innerHTML = `
      <h3 style="color:var(--gold-bright);">📜 패치노트</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 12px;">⚙️ 메카닉 직업 리뉴얼</p>
      <div style="font-size:13px; line-height:1.75; color:var(--parchment);">
        <p style="margin:0 0 8px;">메카닉이 상태이상 위주의 화학자에서, <b style="color:var(--gold-bright);">장치를 전개해 함께 싸우는 진짜 기계공학자</b>로 새로 태어났다.</p>
        <p style="margin:0 0 4px;"><b style="color:#8fd0ff;">⚙ 가동 중인 장치(Active Rig)</b></p>
        <p style="margin:0 0 8px; color:var(--parchment-dim);">포탑·드론·전투로봇 중 하나를 전개하면, 이후 몇 턴간 무엇을 하든 매 턴 자동으로 추가 사격이 나간다.</p>
        <p style="margin:0 0 4px;"><b style="color:#8fd0ff;">신규 스킬 5종</b></p>
        <p style="margin:0 0 2px; color:var(--parchment-dim);">· 자동 포탑 설치 — 즉시 첫 사격 + 3턴 자동사격</p>
        <p style="margin:0 0 2px; color:var(--parchment-dim);">· 정비 신호 — 장치 지속시간·위력 강화 (없으면 대체 버프)</p>
        <p style="margin:0 0 2px; color:var(--parchment-dim);">· 정찰 드론 투입 — 적의 급소를 노출시켜 방어력 관통</p>
        <p style="margin:0 0 2px; color:var(--parchment-dim);">· 자폭 기동 — 장치를 즉발 버스트 피해로 전환</p>
        <p style="margin:0 0 8px; color:var(--parchment-dim);">· 오메가 유닛 기동 — 강력한 자동사격 + 피해 일부 흡수(탱킹)</p>
        <p style="margin:0; color:var(--parchment-dim);">에픽 세트 「종말기계 Mk.Ω」도 새 장치 시스템에 맞춰 함께 조정되었다.</p>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px;">
        <button class="btn" id="patchnote-dismiss">다시 보지 않기</button>
        <button class="btn btn-primary" id="patchnote-close">닫기</button>
      </div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    panel.querySelector('#patchnote-close').addEventListener('click', ()=> overlay.remove());
    panel.querySelector('#patchnote-dismiss').addEventListener('click', async ()=>{
      await dismissPatchNoteForever();
      overlay.remove();
    });
  }
