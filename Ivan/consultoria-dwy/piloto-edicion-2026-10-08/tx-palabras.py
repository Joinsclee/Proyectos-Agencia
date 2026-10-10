import sys, json, wave, numpy as np
from faster_whisper import WhisperModel
w = wave.open(sys.argv[1]); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32)/32768
m = WhisperModel("medium", device="cpu", compute_type="int8")
segs, _ = m.transcribe(a, language="es", word_timestamps=True, vad_filter=False)
out = [{"w": x.word.strip(), "s": round(x.start,3), "e": round(x.end,3)} for s in segs for x in s.words]
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False)
print(len(out), "palabras")
