import json, glob, sys, collections, statistics as S

rows = []
for f in glob.glob(sys.argv[1] if len(sys.argv) > 1 else 'out/*.jsonl'):
    for l in open(f, encoding='utf-8'):
        try: rows.append(json.loads(l))
        except Exception: pass
runs = collections.defaultdict(list)
for r in rows: runs[r['run']].append(r)

def med(x): return round(S.median(x), 1) if x else '-'

summary = collections.defaultdict(list)
tier_gold = collections.defaultdict(list)     # (diff, tier) -> 구간 진입 골드
tier_lv = collections.defaultdict(list)
deaths_at = collections.Counter()             # (diff, tier, node)
node_gold = collections.defaultdict(list)     # (diff, node type) -> 칸에서 얻은 골드
spend = collections.defaultdict(float)        # diff -> 총 지출
spend_kind = collections.Counter()
end_gold = collections.defaultdict(list)
for rid, evs in runs.items():
    diff, job = evs[0]['diff'], evs[0]['job']
    end = [e for e in evs if e['kind'] == 'end']
    res = end[0]['result'] if end else next((e['kind'] for e in evs if e['kind'] in ('stuck', 'error')), 'unfinished')
    d = [e for e in evs if e['kind'] == 'death']
    summary[(diff, job)].append((res, len(d), end[0]['secs'] if end else None, end[0]['st']['gold'] if end else None))
    if end and res == 'clear': end_gold[diff].append(end[0]['st']['gold'])
    for e in d: deaths_at[(diff, e['st']['tier'], e.get('node'))] += 1
    seen = set()
    nodes = [e for e in evs if e['kind'] in ('node', 'death', 'end', 'spend')]
    for i, e in enumerate(nodes):
        if e['kind'] == 'spend':
            price = int(e['what'].split(':')[-1]); spend[diff] += price; spend_kind[(diff, e['what'].split(':')[0])] += price
        if e['kind'] != 'node': continue
        st = e['st']
        if st['tier'] not in seen and st['row'] == -1:
            seen.add(st['tier']); tier_gold[(diff, st['tier'])].append(st['gold']); tier_lv[(diff, st['tier'])].append(st['lv'])
        # 다음 node까지의 골드 변화(사이에 사망/지출 없을 때만)
        j = i + 1
        spent = 0
        while j < len(nodes) and nodes[j]['kind'] == 'spend':
            spent += int(nodes[j]['what'].split(':')[-1]); j += 1
        if j < len(nodes) and nodes[j]['kind'] == 'node' and nodes[j]['st']['deaths'] == st['deaths'] and nodes[j]['st']['tier'] == st['tier']:
            node_gold[(diff, e['type'])].append(nodes[j]['st']['gold'] - st['gold'] + spent)

print('== 런 결과 (결과, 사망수, 걸린초, 끝 골드)')
for k in sorted(summary): print(k, summary[k])
print('\n== 구간 진입 시 골드/레벨 중앙값 (diff, tier): gold, lv, n')
for k in sorted(tier_gold): print(k, med(tier_gold[k]), med(tier_lv[k]), len(tier_gold[k]))
print('\n== 칸 종류별 골드 획득 (평균, 중앙값, n)')
for k in sorted(node_gold):
    v = node_gold[k]; print(k, round(S.mean(v), 1), med(v), len(v))
print('\n== 지출 합계/런수', {d: round(spend[d] / max(1, sum(1 for r in runs.values() if r[0]['diff'] == d))) for d in spend})
print('   종류별', dict(spend_kind))
print('\n== 클리어 시 남은 골드', {d: (med(v), min(v), max(v)) for d, v in end_gold.items()})
print('\n== 사망 위치 (diff, tier, 칸)')
for k, v in sorted(deaths_at.items(), key=lambda x: (x[0][0], x[0][1], str(x[0][2]))): print(k, v)
