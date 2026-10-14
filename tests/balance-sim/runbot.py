"""밸런스 리뷰용 런 봇: 실제 게임을 헤드리스 Chrome에서 한 판 끝까지 돌리고 칸마다 기록을 JSONL로 남긴다.
python -X utf8 runbot.py <job> <diff> <runs> <out.jsonl> [--headed] [--smith] [--curse=<relic_id|none>]
  --smith: 마을에서 대장간 강화를 쓴다
  --curse: 시작 저주를 고정하고 첫 보스전(10층)까지만 돌린다
집계: python -X utf8 analyze.py 'out/*.jsonl'
"""
import collections, functools, http.server, json, pathlib, random, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]

class _Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

class _Srv(http.server.ThreadingHTTPServer):
    request_queue_size = 256

def serve():
    srv = _Srv(('127.0.0.1', 0), functools.partial(_Q, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{srv.server_address[1]}'

# 페이지 안에 심는 봇 도우미(전역 함수 이름만 쓴다)
HELPERS = r"""
window.__bot = {
  score(id){ const it = getItemDef(id); if(!it) return -1; const s = it.stats||{};
    const magJob = ['mage','mechanic'].includes(player.job);
    return (magJob? (s.mag||0)*1.2 + (s.atk||0)*0.3 : (s.atk||0)*1.2 + (s.mag||0)*0.3)
      + (s.def||0) + (s.spd||0)*0.5 + (s.maxhp||0)/5 + (s.maxmp||0)/10; },
  autoEquip(){ for(const slot of ['weapon','armor','accessory']){
      const cur = player.equipment[slot]; let best = cur, bs = cur? this.score(cur) : -1;
      for(const id of player.equipOwned){ const it = getItemDef(id); if(!it || it.slot!==slot) continue;
        const sc = this.score(id); if(sc>bs){ best=id; bs=sc; } }
      if(best && best!==cur) equipItem(best); } },
  topOverlay(){ const o = [...document.querySelectorAll('.shop-overlay')]; return o.length? o[o.length-1] : null; },
  state(){ return {screen: document.querySelector('.screen.active').id.replace('screen-',''),
    gold: player.gold, lv: player.level, hp: player.hp, maxhp: player.maxhp, mp: player.mp,
    tier: player.tierIndex, row: player.nodeRow, depth, town, deaths: player.deathCount||0,
    spec: player.specialization||null, seals: player.eliteSeals||0, stones: player.reinforceStones||0,
    relics: (player.relics||[]).length, inv: Object.assign({}, player.inv),
    atk: player.atk, def: player.def, mag: player.mag, spd: player.spd,
    equip: ['weapon','armor','accessory'].map(k=>{const id=player.equipment[k]; const d=id&&getItemDef(id); return d? d.name : null;}),
    relicNames: (player.relics||[]).map(id=> (typeof RELICS!=='undefined' && RELICS[id] && RELICS[id].name) || id),
    skillNames: (player.skills||[]).filter(k=>SKILLDB[k]).map(k=>SKILLDB[k].name)}; },
  enemyInfo(){ return (typeof enemy!=='undefined' && enemy) ? {name: enemy.name, hp: enemy.hp, maxhp: enemy.maxhp, atk: enemy.atk, def: enemy.def, isBoss: !!enemy.isBoss} : null; },
};
"""


def run_once(page, job, diff, log, run_id, max_steps=20000):
    page.evaluate(HELPERS)
    # 보통/하드코어 잠금 해제(기록 없는 새 브라우저라서)
    page.evaluate('() => { normalUnlocked = true; hardcoreUnlocked = true; renderDifficultySelect(); }')
    if page.locator('#btn-newgame-toggle').is_visible():
        page.click('#btn-newgame-toggle')
    page.fill('#name-input', '봇')
    page.dispatch_event('#name-input', 'input')
    if FIRSTBOSS:
        page.evaluate("c => { window.rollPermanentCurse = () => (c==='none' ? null : c); }", FIRSTBOSS)
    page.click(f'.job-chip[data-job="{job}"]')
    page.click(f'.diff-card[data-diff="{diff}"]')
    page.click('#btn-start')

    t0 = time.time()
    ev = lambda kind, **kw: log.write(json.dumps(dict(run=run_id, job=job, diff=diff, kind=kind, **kw), ensure_ascii=False) + '\n')
    battle_turns = 0
    errs_n = [0]
    cur_battle = None
    page.set_default_timeout(4000)
    last_sig, same = None, 0
    cur_node = None
    for step in range(max_steps):
        try:
            page.clock.run_for(900)
            dlg = page.locator('.dialogue-overlay')
            if dlg.count():
                dlg.last.click(force=True); page.clock.run_for(400); continue
            st = page.evaluate('__bot.state()')
            sig = json.dumps(st, sort_keys=True) + str(page.evaluate('document.querySelectorAll(".shop-overlay").length'))
            same = same + 1 if sig == last_sig else 0
            last_sig = sig
            if same > 4:
                page.wait_for_timeout(250)  # 실시간 애니메이션(Web Animations) 기다리기
            if same > 120:
                ov = page.evaluate('(()=>{const o=__bot.topOverlay(); return o? o.innerText.slice(0,300): null})()')
                ev('stuck', st=st, overlay=ov)
                page.screenshot(path=str(pathlib.Path(log.name).with_suffix(f'.stuck{run_id}.png')))
                return 'stuck'
            scr = st['screen']
            if scr != 'battle' and cur_battle is not None:
                ev('battle', node=cur_node, enemy=cur_battle['enemy'], emaxhp=cur_battle['maxhp'], eatk=cur_battle['eatk'], edef=cur_battle['edef'],
                   result='death' if scr == 'gameover' else 'win', enemy_hp_left=cur_battle['hp_left'], acts=dict(cur_battle['acts']), start=cur_battle['start'])
                if FIRSTBOSS and cur_node == 'boss' and cur_battle['start']['tier'] == 0:
                    ev('firstboss', curse=FIRSTBOSS, result='death' if scr == 'gameover' else 'win', enemy_hp_left=cur_battle['hp_left'], start=cur_battle['start'], acts=dict(cur_battle['acts']))
                    return 'firstboss'
                cur_battle = None
            if scr == 'ending':
                ev('end', result='clear', st=st, secs=round(time.time() - t0)); return 'clear'
            if scr == 'gameover':
                ev('death', st=st, node=cur_node)
                if st['deaths'] >= 30:
                    ev('end', result='giveup', st=st, secs=round(time.time() - t0)); return 'giveup'
                if diff == 'hardcore' and False:
                    return 'dead'
                page.click('#btn-restart', force=True); continue
            if scr == 'origin':
                if handle_overlay(page, st, ev): continue
                opt = page.locator('#origin-body button[data-key], #origin-body button[data-choice]')
                if opt.count(): opt.nth(random.randrange(opt.count())).click()
                continue
            if scr == 'battle':
                ei = page.evaluate('__bot.enemyInfo()')
                if cur_battle is None and ei:
                    cur_battle = dict(enemy=ei['name'], maxhp=ei['maxhp'], eatk=ei['atk'], edef=ei['def'], acts=collections.Counter(), hp_left=1.0, start=st)
                if cur_battle is not None and ei and ei['name'] == cur_battle['enemy']:
                    cur_battle['hp_left'] = round(ei['hp'] / max(1, ei['maxhp']), 2)
                try:
                    if handle_overlay(page, st, ev): continue
                    battle_turns += 1
                    if battle_turns > 400:
                        ev('stuck', st=st, overlay='battle too long'); return 'stuck'
                    a = battle(page, st)
                    if a and cur_battle is not None: cur_battle['acts'][a] += 1
                except Exception as e:
                    errs_n[0] += 1
                    if errs_n[0] > 60: raise
                continue
            if scr == 'explore':
                if handle_overlay(page, st, ev): continue
                page.evaluate('__bot.autoEquip()')
                if st['town']:
                    town(page, st, ev)
                    continue
                nodes = page.evaluate("""(()=>{ const r = player.nodeMap && player.nodeMap[player.nodeRow+1]; if(!r) return [];
                   const cur = player.nodeRow>=0 ? player.nodeMap[player.nodeRow].find(n=>n.id===player.nodeCurrentId) : null;
                   return r.filter(n=> !cur || cur.connections.includes(n.id)).map(n=>({id:n.id,type:n.type})); })()""")
                if not nodes:
                    if page.locator('#btn-advance').is_visible():
                        page.click('#btn-advance', force=True)
                    continue
                pick = choose_node(nodes, st)
                # 칸 기록: 직전 칸의 결과는 다음 칸 진입 시점 상태로 계산
                ev('node', type=pick['type'], st=st)
                cur_node = pick['type']
                battle_turns = 0
                page.evaluate(f'pickNode({json.dumps(pick["id"])})')
                continue
            # 기타 화면(타이틀 등)
            if scr == 'title':
                if page.locator('#btn-continue').is_visible(): page.click('#btn-continue')
                continue
        except Exception as e:
            if 'Timeout' not in str(e) and 'not visible' not in str(e): raise
            errs_n[0] += 1
            if errs_n[0] > 200: raise
    ev('stuck', st=st, overlay='max steps'); return 'stuck'


def choose_node(nodes, st):
    hp = st['hp'] / max(1, st['maxhp'])
    def w(t):
        if t in ('boss', 'midboss'): return 100
        if t == 'rest': return 4 if hp < 0.5 else 1
        if t == 'elite': return 0.5 if hp < 0.6 else 1.5
        return 1
    ws = [w(n['type']) for n in nodes]
    return random.choices(nodes, weights=ws)[0]


def battle(page, st):
    main = page.locator('#cmd-attack')
    if not (main.is_visible() and main.is_enabled()):
        # 서브메뉴가 열려 있을 수도 있다
        if page.locator('#cmd-back').is_visible(): page.click('#cmd-back', force=True)
        return
    hp = st['hp'] / max(1, st['maxhp'])
    if hp < 0.35 and (st['inv'].get('potion', 0) or st['inv'].get('hipotion', 0)):
        page.click('#cmd-item')
        btns = page.locator('#cmd-sub .sub-item:not(.disabled)')
        for i in range(btns.count()):
            t = btns.nth(i).inner_text()
            if '물약' in t:
                btns.nth(i).click(); return '아이템:' + t.split(chr(10))[0][:12]
        page.click('#cmd-back', force=True)
    sk = page.locator('#cmd-skill')
    if sk.is_visible() and sk.is_enabled() and random.random() < 0.6:
        page.click('#cmd-skill')
        btns = page.locator('#cmd-sub .sub-item:not(.disabled)')
        n = btns.count()
        if n:
            b = btns.nth(random.randrange(n)); t = b.inner_text().split(chr(10))[0][:16]
            b.click(); return '스킬:' + t
        page.click('#cmd-back', force=True)
    main.click()
    return '공격'


AVOID = ('떠나기', '닫기', '취소', '뒤로', '그만', '돌아', '나가', '거절', '지나')

def handle_overlay(page, st, ev):
    info = page.evaluate("""(()=>{ const o = __bot.topOverlay(); if(!o) return null;
       const bs = [...o.querySelectorAll('button, .relic-card, .job-card, .js-cup, [data-choice], [data-key]')].filter(b=>!b.disabled && b.offsetParent!==null);
       return {id:o.id||'', n: bs.length, labels: bs.map(b=>(b.innerText||'').trim().slice(0,30))}; })()""")
    if not info: return False
    oid = info['id']
    if oid == 'shop-overlay':
        bought = page.evaluate("""(()=>{ const o = __bot.topOverlay();
          // 물약 우선, 그다음 점수 오른 장비
          const items = [...o.querySelectorAll('.buy-btn[data-kind=item]:not([disabled])')];
          const prefer = ['potion','hipotion','ether','hiether'];
          for(const k of prefer){ const b = items.find(x=>x.dataset.key===k); if(b && player.gold - +b.dataset.price >= 0){ b.click(); return 'item:'+k+':'+b.dataset.price; } }
          const eq = [...o.querySelectorAll('.buy-btn[data-kind=equip]:not([disabled])')];
          for(const b of eq){ const id=b.dataset.key, slot=getItemDef(id).slot, cur=player.equipment[slot];
            if(__bot.score(id) > (cur? __bot.score(cur): -1)){ b.click(); return 'equip:'+id+':'+b.dataset.price; } }
          o.remove(); return null; })()""")
        if bought: ev('spend', what=bought, st=st)
        return True
    if oid == 'exchange-overlay':
        got = page.evaluate("""(()=>{ const o = __bot.topOverlay(); const b = o.querySelector('.buy-btn:not([disabled])');
          if(b){ const k=b.dataset.key; b.click(); return k; } o.remove(); return null; })()""")
        if got: ev('exchange', what=got, st=st)
        return True
    if oid == 'blacksmith-overlay':
        got = page.evaluate("""(()=>{ const o = __bot.topOverlay();
          const pick = [...o.querySelectorAll('.enhance-pick')];
          if(pick.length){ const job = pick.find(b=>b.style.borderColor); const b = job || pick[Math.floor(Math.random()*pick.length)]; const e=b.dataset.eid; b.click(); return 'enh:'+e; }
          if(o.querySelector('#blacksmith-back')){ o.remove(); return null; }
          const b = o.querySelector('.buy-btn[data-id]:not([disabled])');
          if(b){ b.click(); return 'open'; }
          o.remove(); return null; })()""")
        if got and got.startswith('enh:'): ev('enhance', what=got, st=st)
        return True
    labels = info['labels']
    if not labels:
        # 버튼 없는 오버레이(연출 중) — 시간만 흘린다
        return True
    idx = [i for i, l in enumerate(labels) if not any(a in l for a in AVOID)] or list(range(len(labels)))
    def wt(i):
        l = labels[i]
        if oid == 'relic-overlay':
            return 3 if l.startswith('축복') else 2 if l.startswith('변칙') else 1
        return 1
    pick = random.choices(idx, weights=[wt(i) for i in idx])[0]
    ev('choice', overlay=oid, labels=labels[:8], pick=labels[pick], st=st)
    page.evaluate(f"""(()=>{{ const o = __bot.topOverlay();
       const bs = [...o.querySelectorAll('button, .relic-card, .job-card, .js-cup, [data-choice], [data-key]')].filter(b=>!b.disabled && b.offsetParent!==null);
       bs[{pick}] && bs[{pick}].click(); }})()""")
    return True


_tried = set()
FIRSTBOSS = next((a.split('=')[1] for a in sys.argv if a.startswith('--curse=')), None)
BLACKSMITH = '--smith' in sys.argv
def town(page, st, ev):
    key = (st['tier'], st['seals'], st['deaths'])
    if page.locator('#btn-exchange').is_visible() and st['seals'] >= 5 and key not in _tried:
        _tried.add(key)
        page.click('#btn-exchange'); return
    bkey = ('bs', st['tier'], st['stones'], st['deaths'])
    if BLACKSMITH and st['stones'] >= 3 and bkey not in _tried:
        _tried.add(bkey)
        page.evaluate('openBlacksmith()'); return
    page.click('#btn-advance', force=True)


def main():
    job, diff, runs, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
    headed = '--headed' in sys.argv
    base = serve()
    with sync_playwright() as p, open(out, 'a', encoding='utf-8') as log:
        br = p.chromium.launch(channel='chrome', headless=not headed)
        for r in range(runs):
            ctx = br.new_context()
            page = ctx.new_page()
            page.route(lambda u: not u.startswith(base), lambda rt: rt.abort())
            errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.clock.install()
            page.goto(base + '/index.html', timeout=120000)
            CHECK = "['showMysteryEvent','SKILLDB','hasSpecPerk','pickNode','openShop','startBattle','showRelicAltar','showJobAdvancement','equipItem','showJesterDen','playerAttack'].every(n=>{try{return typeof eval(n)!=='undefined'}catch(e){return false}})"
            for attempt in range(5):
                for _ in range(40):
                    page.clock.run_for(500)
                    if page.evaluate('document.querySelector("#job-select").children.length>0'): break
                if page.evaluate(CHECK): break
                page.goto(base + '/index.html', timeout=120000)
            rid = f'{job}-{diff}-{int(time.time()*1000)%10**8}-{r}'
            try:
                res = run_once(page, job, diff, log, rid)
            except Exception as e:
                res = f'error: {e}'.splitlines()[0][:200]
                log.write(json.dumps(dict(run=rid, kind='error', msg=res), ensure_ascii=False) + '\n')
                try: page.screenshot(path=out + f'.err{r}.png')
                except Exception: pass
            if errs:
                log.write(json.dumps(dict(run=rid, kind='pageerrors', errs=errs[:5]), ensure_ascii=False) + '\n')
            log.flush()
            print(rid, res, flush=True)
            ctx.close()
        br.close()

if __name__ == '__main__':
    main()
