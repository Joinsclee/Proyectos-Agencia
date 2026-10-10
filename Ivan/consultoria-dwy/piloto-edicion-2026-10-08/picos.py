import json,wave,sys,numpy as np
S=sys.argv[1]
w=wave.open(f"{S}/salida48k.wav");a=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768;sr=48000
e=json.load(open(f"{S}/edl-completa.json"))
d=np.abs(np.diff(a)); base=np.percentile(d,99.9)
p=[d[max(0,int(s["editedStart"]*sr)-480):int(s["editedStart"]*sr)+480].max()/base for s in e["segments"][1:]]
print("uniones",len(p),"| salto máx/p99.9 global: máx",round(max(p),2),"mediana",round(float(np.median(p)),2),"| por encima del p99.9:",sum(x>1 for x in p))
