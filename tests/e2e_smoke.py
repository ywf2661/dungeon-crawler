"""브라우저 회귀 테스트(스모크). 실제 Chrome을 띄워 주요 흐름을 클릭으로 돌린다.

준비: pip install playwright   (브라우저는 설치된 Chrome을 쓴다 — playwright install 불필요)
실행: python -X utf8 tests/e2e_smoke.py            전부
      python -X utf8 tests/e2e_smoke.py 새게임 전투   이름에 해당 글자가 든 시나리오만
      --headed 를 붙이면 창을 띄워서 보여준다.

시나리오마다 콘솔 오류/페이지 예외가 하나라도 나면 실패로 친다.
실패하면 tests/e2e_shots/<시나리오>.png 에 마지막 화면을 남긴다.
"""
import functools, http.server, pathlib, sys, threading, time, traceback
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'tests' / 'e2e_shots'


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def serve():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(_Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{srv.server_address[1]}'


# ---------- 헬퍼 ----------

def open_game(ctx, base):
    """새 탭으로 게임을 연다. 외부 요청(구글 폰트 등)은 막는다 — 오프라인에서 load가 안 끝나는 것 방지."""
    page = ctx.new_page()
    page.errors = []
    page.route(lambda u: not u.startswith(base), lambda r: r.abort())
    page.on('pageerror', lambda e: page.errors.append(f'예외: {e}'))
    # 막아 둔 외부 요청이 남기는 "Failed to load resource"는 무시한다.
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text
            and page.errors.append(f'콘솔: {m.text}'))
    page.goto(base + '/index.html')
    page.wait_for_function('document.querySelector("#job-select").children.length>0')
    return page


def screen(page):
    return page.evaluate('document.querySelector(".screen.active").id.replace("screen-","")')


def g(page, expr):
    """게임 전역 값 읽기(예: g(page, 'player.gold'))."""
    return page.evaluate(f'() => ({expr})')


def dismiss_dialogues(page, limit=40):
    """대화 팝업(.dialogue-overlay)이 떠 있으면 다 넘긴다."""
    for _ in range(limit):
        ov = page.locator('.dialogue-overlay')
        if not ov.count():
            return
        ov.last.click()
        page.wait_for_timeout(320)  # 대사 페이드아웃(260ms) 동안의 클릭은 무시되므로 기다린다
    raise AssertionError('대화 팝업이 끝나지 않음')


def new_game(page, name='테스터', job='warrior', diff='easy'):
    """타이틀 → 이름/직업/난이도 → 오프닝 문답을 첫 번째 선택지로 넘겨 화면이 바뀔 때까지."""
    if page.locator('#btn-newgame-toggle').is_visible():
        page.click('#btn-newgame-toggle')
    page.fill('#name-input', name)
    page.dispatch_event('#name-input', 'input')
    page.click(f'.job-chip[data-job="{job}"]')
    page.click(f'.diff-card[data-diff="{diff}"]')
    page.click('#btn-start')
    for _ in range(20):
        page.wait_for_timeout(200)
        dismiss_dialogues(page)
        if screen(page) != 'origin':
            return
        opt = page.locator('#origin-body button[data-key], #origin-body button[data-choice]')
        if opt.count():
            opt.first.click()
    raise AssertionError('오프닝 문답을 빠져나오지 못함')


def enter_battle(page):
    """마을이면 출발하고, 노드맵에서 고를 수 있는 첫 칸을 눌러 전투 화면까지."""
    if page.locator('#btn-advance').is_visible():
        page.click('#btn-advance')
    page.locator('.node-btn.node-available').first.click()
    page.wait_for_function('document.querySelector("#screen-battle.active")')


def fight(page, max_turns=60):
    """전투 화면이 끝날 때까지 공격만 누른다. 끝난 뒤 화면 이름을 돌려준다."""
    for _ in range(max_turns):
        dismiss_dialogues(page)
        if screen(page) != 'battle':
            return screen(page)
        atk = page.locator('#cmd-attack')
        if atk.is_visible() and atk.is_enabled():
            atk.click()
        page.wait_for_timeout(300)
    page.wait_for_timeout(3000)  # 마지막 연출이 길 수 있다
    if screen(page) != 'battle':
        return screen(page)
    raise AssertionError(f'{max_turns}번 공격해도 전투가 안 끝남')


def reload_and_continue(page):
    """저장(0.4초 지연)이 끝나길 기다렸다가 새로고침 → 이어서 하다."""
    page.wait_for_timeout(900)
    page.reload()
    page.wait_for_function('document.querySelector("#job-select").children.length>0')
    page.locator('#btn-continue').click(timeout=5000)
    page.wait_for_timeout(600)
    dismiss_dialogues(page)


SNAP = '({lv:player.level, exp:player.exp, gold:player.gold, hp:player.hp, depth, town, node:player.nodeCurrentId})'


# ---------- 시나리오 ----------

def _job_battle(job):
    def sc(page):
        new_game(page, job=job)
        assert screen(page) == 'explore', screen(page)
        gold0 = g(page, 'player.gold')
        enter_battle(page)
        assert fight(page) == 'explore', '전투 후 탐험 화면이 아님'
        assert g(page, 'player.gold') > gold0, '승리 골드가 안 들어옴'
    sc.__name__ = f't_전투_{job}'
    return sc


def t_이어하기_승리후(page):
    """이긴 칸에서 새로고침해도 같은 전투가 다시 걸리지 않는다(보상 반복 획득 구멍 회귀)."""
    new_game(page)
    enter_battle(page)
    fight(page)
    before = g(page, SNAP)
    reload_and_continue(page)
    assert screen(page) == 'explore', f'이어하기 화면: {screen(page)}'
    after = g(page, SNAP)
    assert before == after, f'상태가 달라짐\n  전 {before}\n  후 {after}'


def t_이어하기_전투중(page):
    """싸우던 중 새로고침하면 그 칸의 같은 적과 다시 싸운다(적을 다시 뽑는 꼼수 방지).
    1층은 나오는 적이 거의 하나라 다시 뽑아도 같아 보이므로, 적 풀이 넓은 3구간(admin10)에서 본다."""
    new_game(page, name='admin10')
    enter_battle(page)
    node = g(page, 'player.nodeCurrentId')
    FOE = '({type:enemy.type, name:enemy.name, maxhp:enemy.maxhp, atk:enemy.atk, traits:enemy.eliteTraits||null})'
    foe = g(page, FOE)
    for _ in range(4):  # 우연히 같은 적이 뽑히는 경우를 줄이려 여러 번
        reload_and_continue(page)
        page.wait_for_function('document.querySelector("#screen-battle.active")', timeout=5000)
        after = g(page, FOE)
        assert after == foe, f'적이 바뀜: {foe} → {after}'
    assert g(page, 'player.nodeCurrentId') == node


def t_사망_마을복귀(page):
    """쉬움에서 쓰러지면 게임오버 → 마을에서 다시 일어서기(골드 절반)."""
    new_game(page)
    page.evaluate('player.gold = 100')
    enter_battle(page)
    page.evaluate('player.hp = 1; enemy.hp = enemy.maxhp = 99999; enemy.atk = 9999')
    assert fight(page) == 'gameover', screen(page)
    page.click('#btn-restart')
    page.wait_for_timeout(500)
    dismiss_dialogues(page)
    assert screen(page) == 'explore'
    assert g(page, 'town') is True
    assert g(page, 'player.gold') == 50, g(page, 'player.gold')
    assert g(page, 'player.hp') == g(page, 'player.maxhp')


def t_마을수련(page):
    """마을 상점의 수련: 능력치↑·골드↓·다음 가격 ×1.35, 새로고침해도 유지. 던전 상인에는 없다."""
    new_game(page)
    page.evaluate('player.gold = 1000')
    atk0 = g(page, 'player.atk')
    page.click('#btn-shop')
    btn = page.locator('.buy-btn[data-kind="train"][data-key="atk"]')
    assert btn.inner_text() == '150G 수련', btn.inner_text()
    btn.click()
    assert g(page, 'player.atk') == atk0 + 2
    assert g(page, 'player.gold') == 850
    assert page.locator('.buy-btn[data-kind="train"][data-key="atk"]').inner_text() == '203G 수련'
    reload_and_continue(page)
    assert g(page, 'player.trainCount') == 1 and g(page, 'player.atk') == atk0 + 2
    page.evaluate('town = false; openShop()')
    assert page.locator('.buy-btn[data-kind="train"]').count() == 0


# 연출을 300ms 동안 프레임마다 지켜보고 무엇이 일어났는지 돌려준다.
IMPACT_WATCH = '''trigger => new Promise(done => {
  const el = document.querySelector('#screen-battle'), seen = {stop:false, moved:false, flash:0};
  new MutationObserver(() => { if(el.classList.contains('hitstop')) seen.stop = true; })
    .observe(el, {attributes:true, attributeFilter:['class']});  // 50ms 멈춤은 프레임 사이에 끝날 수 있다
  eval(trigger); const t0 = performance.now();
  (function look(){
    if(!['', 'translate(0px, 0px)'].includes(el.style.transform)) seen.moved = true;
    const f = [...document.querySelectorAll('.impact-flash')].filter(x => getComputedStyle(x).display !== 'none');
    seen.flash = Math.max(seen.flash, f.length);
    if(performance.now() - t0 < 300) requestAnimationFrame(look); else done(seen);
  })();
})'''


def t_타격감(page):
    """타격 등급표: 2단계=멈춤+흔들림, 3단계=멈춤+흔들림+섬광, 겹치면 센 쪽 하나, 흔들림 줄이기면 멈춤만."""
    new_game(page, name='admin12')
    enter_battle(page)
    w = lambda t: (page.wait_for_timeout(400), page.evaluate(IMPACT_WATCH, t))[1]
    assert w('impactFx(2)') == {'stop': True, 'moved': True, 'flash': 0}
    assert w('impactFx(3)') == {'stop': True, 'moved': True, 'flash': 1}
    assert w('impactFx(2); impactFx(3); impactFx(2)')['flash'] == 1, '겹친 등급이 여러 번 터짐'
    page.click('#shake-toggle')
    assert w('impactFx(3)') == {'stop': True, 'moved': False, 'flash': 0}, '흔들림 줄이기가 안 먹음'
    page.reload()
    page.wait_for_function('document.querySelector("#job-select").children.length>0')
    assert g(page, 'document.body.classList.contains("reduce-shake")'), '흔들림 줄이기가 저장 안 됨'


# 테스트 모드(이름 adminN)는 각자 특수한 상황에서 시작한다. 오류 없이 게임 화면까지 오는지만 본다.
ADMIN_MODES = [('admin', 'warrior', 'easy'), ('admin2', 'warrior', 'easy'), ('admin3', 'mage', 'easy'),
               ('admin4', 'warrior', 'normal'), ('admin5', 'rogue', 'easy'), ('admin6', 'paladin', 'easy'),
               ('admin7', 'jester', 'easy'), ('admin8', 'jester', 'easy'), ('admin9', 'jester', 'easy'),
               ('admin10', 'warrior', 'easy'), ('admin11', 'rogue', 'easy'), ('admin12', 'warrior', 'easy')]


def _admin(name, job, diff):
    def sc(page):
        new_game(page, name=name, job=job, diff=diff)
        page.wait_for_timeout(800)
        dismiss_dialogues(page)
        if name == 'admin11':  # 타이틀 위에 엔딩 고르기 창이 뜬다
            page.locator('[data-end="watcher"]').click()
            page.wait_for_timeout(800)
            dismiss_dialogues(page, limit=80)
        assert screen(page) != 'title', '타이틀에 머묾'
    sc.__name__ = f't_{name}'
    return sc


SCENARIOS = ([_job_battle(j) for j in ['warrior', 'mage', 'rogue', 'paladin', 'mechanic', 'jester']]
             + [t_이어하기_승리후, t_이어하기_전투중, t_사망_마을복귀, t_마을수련, t_타격감]
             + [_admin(*m) for m in ADMIN_MODES])


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    headed = '--headed' in sys.argv
    picked = [s for s in SCENARIOS if not args or any(a in s.__name__ for a in args)]
    SHOTS.mkdir(exist_ok=True)
    base = serve()
    failed = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=not headed)
        for sc in picked:
            name = sc.__name__[2:]
            ctx = browser.new_context(viewport={'width': 480, 'height': 900})  # 시나리오마다 저장소 비움
            page = open_game(ctx, base)
            t0 = time.time()
            try:
                sc(page)
                if page.errors:
                    raise AssertionError('콘솔 오류:\n  ' + '\n  '.join(page.errors[:5]))
                print(f'  통과  {name}  ({time.time()-t0:.1f}s)')
            except Exception as e:
                failed.append(name)
                shot = SHOTS / f'{name}.png'
                try: page.screenshot(path=str(shot))
                except Exception: pass
                msg = str(e) or traceback.format_exc(limit=2)
                print(f'  실패  {name}: {msg.strip()}\n        화면: {shot}')
            ctx.close()
        browser.close()
    print(f'\n{len(picked)-len(failed)}/{len(picked)} 통과')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
