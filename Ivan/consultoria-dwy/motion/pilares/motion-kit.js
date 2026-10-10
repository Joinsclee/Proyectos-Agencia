/* motion-kit.js — ayudas para composiciones de motion graphics CLEE.
 * Todo es una FUNCIÓN DEL TIEMPO: frame(t) debe dejar la escena exacta del segundo t, sin depender
 * de lo que se dibujó antes, de Date.now(), de Math.random() sin semilla ni de animaciones CSS.
 * Así cada fotograma se puede dibujar suelto, en cualquier orden, y el vídeo sale idéntico siempre.
 */
(function () {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  /** Progreso 0-1 de t entre a y b (segundos). */
  const tramo = (t, a, b) => clamp((t - a) / (b - a));
  // Curvas: el movimiento con carácter no es lineal ni «fade». Entrada rápida y frenada suave.
  const ease = {
    lineal: (p) => p,
    salida: (p) => 1 - Math.pow(1 - p, 3),                  // easeOutCubic: entra decidido, se posa
    salidaFuerte: (p) => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)), // easeOutExpo: golpe y calma
    entradaSalida: (p) => (p < 0.5 ? 8 * p ** 4 : 1 - Math.pow(-2 * p + 2, 4) / 2), // easeInOutQuart: cámara
    rebote: (p, s = 1.4) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2), // easeOutBack: solo acentos
    muelle: (p, k = 7) => 1 - Math.exp(-k * p) * Math.cos(k * 1.4 * p),
  };
  /** Valor animado: anima(t, inicio, dur, de, a, curva). */
  const anima = (t, t0, dur, de, a, curva = ease.salida) => lerp(de, a, curva(tramo(t, t0, t0 + dur)));
  /** Escalonado: el elemento i de n entra en su turno dentro de [t0, t0+span]. */
  const escalon = (t, i, n, t0, span, dur, curva = ease.salida) => {
    const ini = t0 + (n > 1 ? (span * i) / (n - 1) : 0);
    return curva(tramo(t, ini, ini + dur));
  };
  /** Rejilla de beats: tiempo del beat k a bpm; y cuánto queda de «golpe» tras el último beat. */
  const beat = (k, bpm) => (60 / bpm) * k;
  const pulso = (t, bpm, decae = 6) => { const b = 60 / bpm, f = (t % b) / b; return Math.exp(-decae * f); };
  /** Aleatorio con semilla (determinista). */
  const azar = (semilla) => { let s = semilla >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
  /** Aplica estilos a un elemento por id. */
  const $ = (id) => document.getElementById(id);
  const pon = (id, estilos) => { const e = typeof id === 'string' ? $(id) : id; if (e) Object.assign(e.style, estilos); return e; };
  const texto = (n, dec = 0) => n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  // ---------- sonido sintetizado (OfflineAudioContext) ----------
  // Solo para piezas de motion. Sobre una persona hablando, la doctrina pide voz limpia y, como
  // mucho, tres acentos grabados: no se usa aquí.
  const ruido = (ctx, dur) => {
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0), r = azar(7);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    return b;
  };
  const env = (g, t, a, d, pico = 1, fin = 0.0001) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pico, t + a); g.gain.exponentialRampToValueAtTime(fin, t + a + d); };
  const sinte = {
    bombo(ctx, dest, t, nivel = 0.9) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18); env(g, t, 0.004, 0.32, nivel); o.connect(g).connect(dest); o.start(t); o.stop(t + 0.4); },
    hat(ctx, dest, t, nivel = 0.18) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = ruido(ctx, 0.08); f.type = 'highpass'; f.frequency.value = 7000; env(g, t, 0.002, 0.05, nivel); s.connect(f).connect(g).connect(dest); s.start(t); },
    pulsacion(ctx, dest, t, frec, nivel = 0.22, dur = 0.5) { const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = frec; f.type = 'lowpass'; f.frequency.value = 2400; env(g, t, 0.005, dur, nivel); o.connect(f).connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05); },
    pad(ctx, dest, t, dur, frecs, nivel = 0.06) { const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(nivel, t + Math.min(1.2, dur / 3)); g.gain.setValueAtTime(nivel, t + dur - 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); f.connect(g).connect(dest);
      for (const fr of frecs) for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det; o.connect(f); o.start(t); o.stop(t + dur + 0.1); } },
    barrido(ctx, dest, t, dur = 0.6, nivel = 0.12, sube = true) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = ruido(ctx, dur); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(sube ? 400 : 6000, t); f.frequency.exponentialRampToValueAtTime(sube ? 6000 : 400, t + dur); env(g, t, dur * 0.8, dur * 0.2, nivel); s.connect(f).connect(g).connect(dest); s.start(t); },
  };
  /** Bus maestro con compresor suave, para que nada sature. */
  const maestro = (ctx) => { const c = ctx.createDynamicsCompressor(); c.threshold.value = -16; c.ratio.value = 3; c.connect(ctx.destination); return c; };
  /** Nota a frecuencia (A4 = 440). */
  const nota = (n) => 440 * Math.pow(2, (n - 69) / 12);

  window.MK = { clamp, lerp, tramo, ease, anima, escalon, beat, pulso, azar, $, pon, texto, sinte, maestro, nota, ruido };
})();
