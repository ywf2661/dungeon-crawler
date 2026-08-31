"use strict";
/*
앱 부트스트랩 — init() 함수(모든 DOM 이벤트 바인딩) + 점검중(관리자 전용) 모달.
반드시 다른 모든 모듈이 로드된 뒤, 파일 로드 순서상 가장 마지막에 위치해야 한다(index.html 참고).
export(전역): init, showMaintenanceModal, isAdminName
의존성: 사실상 전체 모듈(이벤트 핸들러 안에서 다른 모든 모듈의 함수를 호출함)
*/

  // 현재는 별도의 로그인/계정 시스템이 없어, 타이틀 화면의 이름 입력 필드(#name-input)
  // 값을 "아이디"로 취급한다. 이 값이 정확히 'admin'일 때만 정식 접속을 허용한다.
  function isAdminName(){
    const raw = document.getElementById('name-input').value || '';
    return raw.trim() === 'admin';
  }

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

    // 점검 중: 아이디(이름 입력)가 'admin'이 아니면 시작/이어하기 모두 점검중 모달만 띄운다.
    document.getElementById('btn-start').addEventListener('click', ()=>{
      //if(!isAdminName()){ showMaintenanceModal(); return; }
      startGame(false);
    });
    document.getElementById('btn-continue').addEventListener('click', ()=>{
      //if(!isAdminName()){ showMaintenanceModal(); return; }
      startGame(true);
    });
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
      const spec = getSpecialization(player);
      const hybrid = !spec ? getHybrid(player) : null; // 레거시 하이브리드 과도기 캐릭터용 폴백
      const jobLabel = spec ? `${spec.icon} ${spec.name}` : (hybrid ? `${hybrid.icon} ${hybrid.name}` : `${job.icon} ${job.name}`);
      const record = {
        name: player.name, jobLabel, level: player.level,
        deathCount: player.deathCount||0, ts: Date.now(),
        difficulty: player.difficulty||'easy',
        // 일반 최종보스("잠식된 OO 용사")가 이 기록의 이름/직업을 따르게
        // 하려면 원문 job id가 필요하다(jobLabel은 이미 아이콘까지 붙은
        // 표시용 문자열이라 역으로 파싱하기엔 부적합).
        job: player.job,
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
        renderDifficultySelect();
      });
    });
    document.getElementById('btn-advance').addEventListener('click', onAdvance);
    document.getElementById('btn-rest').addEventListener('click', onRest);
    document.getElementById('btn-shop').addEventListener('click', openShop);
    document.getElementById('btn-equip').addEventListener('click', openEquipment);
    document.getElementById('btn-relics').addEventListener('click', showMyRelics);
    document.getElementById('btn-exchange').addEventListener('click', openExchange);
    document.getElementById('cmd-attack').addEventListener('click', ()=>{ Sound.click(); playerAttack(); });
    document.getElementById('cmd-skill').addEventListener('click', ()=>{ Sound.click(); openSub('skill'); });
    document.getElementById('cmd-item').addEventListener('click', ()=>{ Sound.click(); openSub('item'); });
    document.getElementById('cmd-run').addEventListener('click', ()=>{ Sound.click(); playerRun(); });
    document.getElementById('cmd-back').addEventListener('click', ()=>{ Sound.click(); closeSub(); });
    document.getElementById('name-input').addEventListener('keydown', e=>{
      if(e.key==='Enter'){
        //if(!isAdminName()){ showMaintenanceModal(); return; }
        startGame(false);
      }
    });

    loadGame().then(saved=>{
      if(saved && saved.player){
        window.__savedGame = saved;
        const savedJob = getJob(saved.player);
        const savedSpec = getSpecialization(saved.player);
        const savedHybrid = !savedSpec ? getHybrid(saved.player) : null; // 레거시 하이브리드 과도기 캐릭터용 폴백
        const jobLabel = savedSpec ? `${savedSpec.icon} ${savedSpec.name}` : (savedHybrid ? `${savedHybrid.icon} ${savedHybrid.name}` : `${savedJob.icon} ${savedJob.name}`);
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
      renderDifficultySelect();
    }).catch(e=>{ console.warn('기록 불러오기 실패(무시):', e); });
  }

  // 점검 중 안내 모달 — 아이디가 관리자가 아닐 때 시작/이어하기 버튼을 누르면 뜬다.
  // 확인 버튼 외에는 아무 동작도 하지 않으며(게임 진입 불가), 닫으면 그대로 타이틀 화면에 남는다.
  function showMaintenanceModal(){
    if(document.getElementById('maintenance-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'maintenance-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    panel.innerHTML = `
      <h3 style="color:var(--rust-bright);">🛠 점검 중</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:13px;line-height:1.7;margin:0 0 16px;">
        회랑의 입구가 막혔다.<br>
      </p>
      <button class="btn btn-primary btn-wide" id="maintenance-close">확인</button>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
    panel.querySelector('#maintenance-close').addEventListener('click', ()=> overlay.remove());
  }
