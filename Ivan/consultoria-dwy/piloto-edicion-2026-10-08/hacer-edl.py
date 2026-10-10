import json, sys
# uso: hacer-edl.py palabras.json desde hasta fps salida.json
pal, t0, t1, fps, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
GAP, PRE, POST = 0.7, 0.15, 0.25
q = lambda t: round(round(t*fps)/fps, 6)
ws = [w for w in json.load(open(pal)) if w["s"] >= t0 and w["e"] <= t1]
segs, cur = [], None
for w in ws:
    s, e = max(t0, w["s"]-PRE), min(t1, w["e"]+POST)
    if cur and s - cur[1] < GAP - PRE - POST: cur[1] = e
    elif cur and w["s"] - prev_e < GAP: cur[1] = e
    else:
        if cur: segs.append(cur)
        cur = [s, e]
    prev_e = w["e"]
if cur: segs.append(cur)
dur = t1 - t0; res, acc, last = [], 0.0, 0.0
for s, e in segs:
    a, b = q(max(s - t0, last)), min(q(e - t0), int(dur*fps)/fps)
    if b - a < 1/fps: continue
    res.append({"srcStart": a, "srcEnd": b, "editedStart": round(acc, 6)}); acc += b - a; last = b
edl = {"fps": fps, "sourceDuration": round(dur, 6), "editedDuration": round(acc, 6), "segments": res}
json.dump(edl, open(out, "w"), indent=1)
print(f"{len(res)} segmentos · {acc:.1f}s de {dur:.1f}s · quitados {dur-acc:.1f}s ({100*(dur-acc)/dur:.0f}%)")
