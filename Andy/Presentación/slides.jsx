/* ========== DESIGN TOKENS ========== */
const C = {
  bg: '#0a0a0a',
  surface: '#1a1a1a',
  surfaceAlt: '#141414',
  primary: '#c9a961',
  primarySoft: 'rgba(201, 169, 97, 0.12)',
  primaryBorder: 'rgba(201, 169, 97, 0.28)',
  text: '#f5f1e8',
  muted: '#8a8a8a',
  divider: 'rgba(245, 241, 232, 0.08)',
};

const TYPE = {
  title: 88,
  titleLg: 120,
  subtitle: 44,
  body: 32,
  small: 24,
  mega: 220,
  eyebrow: 18,
};

const SP = {
  px: 120,
  py: 100,
  titleGap: 56,
  itemGap: 32,
};

const FRAUNCES = "'Fraunces', 'Times New Roman', serif";
const INTER = "'Inter', -apple-system, system-ui, sans-serif";

/* ========== PRIMITIVES ========== */
function Slide({ children, bg = C.bg, style = {} }) {
  return (
    <div style={{
      width: '100%', height: '100%', background: bg,
      color: C.text, fontFamily: INTER,
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  );
}

function Eyebrow({ children, color = C.primary, style = {} }) {
  return (
    <div style={{
      fontFamily: INTER, fontSize: TYPE.eyebrow, fontWeight: 500,
      letterSpacing: '0.32em', textTransform: 'uppercase',
      color, ...style,
    }}>{children}</div>
  );
}

function GoldRule({ width = 80, style = {} }) {
  return <div style={{ width, height: 1, background: C.primary, ...style }} />;
}

function Watermark({ idx, total }) {
  return (
    <div style={{
      position: 'absolute', bottom: 36, left: SP.px,
      display: 'flex', alignItems: 'center', gap: 18,
      fontFamily: INTER, fontSize: 14, color: C.muted,
      letterSpacing: '0.24em', textTransform: 'uppercase',
    }}>
      <span style={{ color: C.primary, fontWeight: 600 }}>VUELA</span>
      <span style={{ width: 32, height: 1, background: C.divider }} />
      <span>{String(idx).padStart(2,'0')} / {String(total).padStart(2,'0')}</span>
    </div>
  );
}

function Brand({ style = {} }) {
  return (
    <div style={{
      position: 'absolute', top: 44, right: SP.px,
      display: 'flex', alignItems: 'center', gap: 14,
      ...style,
    }}>
      <span style={{
        fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 24,
        color: C.primary, fontWeight: 400,
      }}>vuela</span>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.primary }} />
      <span style={{
        fontFamily: INTER, fontSize: 13, color: C.muted,
        letterSpacing: '0.28em', textTransform: 'uppercase',
      }}>90 días</span>
    </div>
  );
}

/* Decorative grain overlay for luxury feel */
function Grain() {
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      backgroundImage: 'radial-gradient(rgba(255,255,255,0.018) 1px, transparent 1px)',
      backgroundSize: '3px 3px',
      opacity: 0.6,
    }} />
  );
}

/* ========== SLIDE 1 — COVER ========== */
function S01_Cover() {
  return (
    <Slide>
      <Grain />
      {/* Big serif backdrop */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        fontFamily: FRAUNCES, fontStyle: 'italic',
        fontSize: 980, fontWeight: 300, color: 'rgba(201,169,97,0.05)',
        letterSpacing: '-0.04em', lineHeight: 1, userSelect: 'none',
      }}>v</div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${SP.px}px`, position: 'relative' }}>
        <Eyebrow style={{ marginBottom: 40 }}>Programa de transformación · Edición 2026</Eyebrow>

        <div style={{
          fontFamily: FRAUNCES, fontSize: 320, fontWeight: 300,
          lineHeight: 0.88, letterSpacing: '-0.04em',
          color: C.text,
        }}>
          Vue<span style={{ fontStyle: 'italic', color: C.primary }}>la</span>.
        </div>

        <div style={{ marginTop: 56, maxWidth: 1100 }}>
          <div style={{
            fontFamily: FRAUNCES, fontSize: TYPE.subtitle, fontWeight: 300,
            color: C.text, lineHeight: 1.25, letterSpacing: '-0.01em',
          }}>
            El sistema para convertir tu conocimiento <br/>
            en un negocio rentable <span style={{ fontStyle: 'italic', color: C.primary }}>en 90 días.</span>
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: 100, left: SP.px, right: SP.px, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <GoldRule width={56} />
            <span style={{ fontFamily: INTER, fontSize: 16, color: C.muted, letterSpacing: '0.24em', textTransform: 'uppercase' }}>
              Inicio · 13 de mayo
            </span>
          </div>
          <div style={{
            fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 28,
            color: C.primary, fontWeight: 400,
          }}>20 plazas</div>
        </div>
      </div>
    </Slide>
  );
}

/* ========== SLIDE 2 — NOT A MENTORSHIP ========== */
function S02_NotMentorship() {
  return (
    <Slide>
      <Grain />
      <Brand />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${SP.px}px` }}>
        <div style={{ marginBottom: 56 }}>
          <Eyebrow>El reframe</Eyebrow>
        </div>
        <div style={{ fontFamily: FRAUNCES, fontSize: 96, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em', maxWidth: 1500 }}>
          <div style={{ color: C.muted, textDecoration: 'line-through', textDecorationThickness: 2, textDecorationColor: 'rgba(138,138,138,0.5)' }}>
            No es una mentoría.
          </div>
          <div style={{ marginTop: 32 }}>
            Es un <span style={{ fontStyle: 'italic', color: C.primary }}>sistema intensivo</span><br/>
            de transformación.
          </div>
        </div>

        <div style={{ marginTop: 72, display: 'flex', gap: 80, alignItems: 'flex-start' }}>
          <GoldRule width={80} style={{ marginTop: 18 }} />
          <div style={{ fontFamily: INTER, fontSize: TYPE.body, lineHeight: 1.5, color: C.text, maxWidth: 800, fontWeight: 300 }}>
            Diseñado para personas que <em style={{ fontFamily: FRAUNCES, color: C.primary }}>saben mucho</em>, pero aún no han convertido ese conocimiento en un negocio real.
          </div>
        </div>
      </div>
      <Watermark idx={2} total={18} />
    </Slide>
  );
}

/* ========== SLIDE 3 — DON'T COME TO LEARN ========== */
function S03_NotToLearn() {
  return (
    <Slide bg={C.surface}>
      <Grain />
      <Brand />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: `0 ${SP.px}px`, gap: 80 }}>
        <div>
          <Eyebrow style={{ marginBottom: 40 }}>La diferencia</Eyebrow>
          <div style={{ fontFamily: FRAUNCES, fontSize: 80, fontWeight: 300, lineHeight: 1.08, letterSpacing: '-0.02em' }}>
            Aquí no vienes <br/>
            <span style={{ color: C.muted }}>a aprender más.</span>
          </div>
          <div style={{ marginTop: 48, paddingLeft: 32, borderLeft: `2px solid ${C.primary}` }}>
            <div style={{ fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 56, lineHeight: 1.15, color: C.primary }}>
              Vienes a estructurar,<br/>
              empaquetar y vender<br/>
              lo que ya sabes.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <FromTo from="Acumular información" to="Ejecutar con dirección" />
          <FromTo from="Saber mucho" to="Ser vendible" />
          <FromTo from="Consumir contenido" to="Producir resultados" />
          <FromTo from="Esperar el momento" to="Salir al mercado" />
        </div>
      </div>
      <Watermark idx={3} total={18} />
    </Slide>
  );
}

function FromTo({ from, to }) {
  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.divider}`,
      padding: '28px 36px', display: 'flex', alignItems: 'center', gap: 32,
    }}>
      <div style={{ flex: 1, fontFamily: INTER, fontSize: 26, color: C.muted, fontWeight: 400 }}>{from}</div>
      <div style={{ width: 40, height: 1, background: C.primary }} />
      <div style={{ flex: 1, fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 32, color: C.text, fontWeight: 400 }}>{to}</div>
    </div>
  );
}

/* ========== SLIDE 4 — TRANSFORMATION ========== */
function S04_Transformation() {
  return (
    <Slide>
      <Grain />
      <Brand />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${SP.px}px` }}>
        <Eyebrow style={{ marginBottom: 48 }}>La transformación</Eyebrow>
        <div style={{ fontFamily: FRAUNCES, fontSize: 84, fontWeight: 300, lineHeight: 1.1, letterSpacing: '-0.02em', maxWidth: 1600 }}>
          En 90 días dejas de ser <br/>
          alguien con <span style={{ color: C.muted }}>conocimiento</span><br/>
          y te conviertes en alguien <br/>
          con <span style={{ fontStyle: 'italic', color: C.primary }}>estructura.</span>
        </div>

        <div style={{ marginTop: 72, display: 'flex', alignItems: 'center', gap: 24 }}>
          <GoldRule width={56} />
          <span style={{ fontFamily: INTER, fontSize: 18, color: C.muted, letterSpacing: '0.24em', textTransform: 'uppercase' }}>
            Día 1 → Día 90
          </span>
        </div>
      </div>
      <Watermark idx={4} total={18} />
    </Slide>
  );
}

/* ========== SLIDE 5 — WHAT YOU LEAVE WITH (6 PILLARS GRID) ========== */
function S05_Outcomes() {
  const outcomes = [
    { n: '01', label: 'Método propio', desc: 'Claro, replicable y diferenciador.' },
    { n: '02', label: 'Oferta premium', desc: 'Con nombre, promesa y precio definido.' },
    { n: '03', label: 'Posicionamiento', desc: 'Sólido. Dejas de competir por atención.' },
    { n: '04', label: 'Estrategia de contenido', desc: 'Con intención. No improvisación.' },
    { n: '05', label: 'IA aplicada', desc: 'No como adorno. Como sistema.' },
    { n: '06', label: 'Sistema comercial', desc: 'Listo para generar conversaciones de venta.' },
  ];
  return (
    <Slide>
      <Grain />
      <Brand />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: `${SP.py}px ${SP.px}px ${SP.py + 40}px` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 64 }}>
          <div>
            <Eyebrow style={{ marginBottom: 28 }}>Sales con</Eyebrow>
            <div style={{ fontFamily: FRAUNCES, fontSize: 76, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
              Seis activos<br/>
              que <span style={{ fontStyle: 'italic', color: C.primary }}>antes no tenías.</span>
            </div>
          </div>
          <div style={{ fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 32, color: C.muted, paddingBottom: 12 }}>
            entregables núcleo
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 0, border: `1px solid ${C.divider}` }}>
          {outcomes.map((o, i) => (
            <div key={o.n} style={{
              padding: '40px 44px',
              borderRight: (i % 3 !== 2) ? `1px solid ${C.divider}` : 'none',
              borderBottom: (i < 3) ? `1px solid ${C.divider}` : 'none',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              minHeight: 220,
            }}>
              <div style={{
                fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 28,
                color: C.primary, fontWeight: 400,
              }}>{o.n}</div>
              <div>
                <div style={{ fontFamily: FRAUNCES, fontSize: 36, lineHeight: 1.15, fontWeight: 400, marginBottom: 12 }}>{o.label}</div>
                <div style={{ fontFamily: INTER, fontSize: 20, color: C.muted, lineHeight: 1.4, fontWeight: 300 }}>{o.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Watermark idx={5} total={18} />
    </Slide>
  );
}

/* ========== SLIDE 6 — TRACTION QUOTE ========== */
function S06_Traction() {
  return (
    <Slide bg={C.surface}>
      <Grain />
      <Brand />
      <div style={{
        position: 'absolute', top: '50%', left: SP.px,
        transform: 'translateY(-50%)',
        fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 480,
        color: 'rgba(201,169,97,0.08)', lineHeight: 1, userSelect: 'none',
      }}>"</div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${SP.px}px`, paddingLeft: 280, position: 'relative' }}>
        <div style={{ fontFamily: FRAUNCES, fontSize: 110, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em', maxWidth: 1400 }}>
          Aquí no terminas<br/>
          con <span style={{ color: C.muted }}>teoría.</span>
        </div>
        <div style={{ marginTop: 32, fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 130, fontWeight: 300, color: C.primary, letterSpacing: '-0.02em' }}>
          Terminas con tracción.
        </div>
      </div>
      <Watermark idx={6} total={18} />
    </Slide>
  );
}

/* ========== SLIDE 7 — THE 90-DAY PATH (SECTION HEADER) ========== */
function S07_PathHeader() {
  return (
    <Slide>
      <Grain />
      <Brand />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.4fr', padding: `0 ${SP.px}px`, alignItems: 'center', gap: 80 }}>
        <div>
          <div style={{ fontFamily: INTER, fontSize: 14, color: C.primary, letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 32 }}>
            Capítulo · 02
          </div>
          <div style={{ fontFamily: FRAUNCES, fontSize: 96, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em' }}>
            El camino<br/>
            de los <span style={{ fontStyle: 'italic', color: C.primary }}>90 días.</span>
          </div>
          <div style={{ marginTop: 48, fontFamily: INTER, fontSize: 22, color: C.muted, lineHeight: 1.5, maxWidth: 540, fontWeight: 300 }}>
            Tres meses. Tres transformaciones. <br/>
            Un proceso diseñado para que ejecutes,<br/>
            ajustes y salgas <em style={{ fontFamily: FRAUNCES, color: C.text }}>vendiendo.</em>
          </div>
        </div>

        <Timeline />
      </div>
      <Watermark idx={7} total={18} />
    </Slide>
  );
}

function Timeline() {
  const months = [
    { n: '01', name: 'Despertar', sub: 'De confundido a estructurado', focus: 'Identidad' },
    { n: '02', name: 'Construcción', sub: 'De saber a ser vendible', focus: 'Oferta' },
    { n: '03', name: 'Exposición', sub: 'De proyecto a negocio real', focus: 'Mercado' },
  ];
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ position: 'absolute', left: 38, top: 38, bottom: 38, width: 1, background: `linear-gradient(${C.primary}, ${C.divider})` }} />
      {months.map((m, i) => (
        <div key={m.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 36, padding: '24px 0', position: 'relative' }}>
          <div style={{
            width: 76, height: 76, borderRadius: '50%',
            border: `1px solid ${C.primary}`,
            background: C.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 30, color: C.primary,
            flexShrink: 0, zIndex: 1,
          }}>{m.n}</div>
          <div style={{ flex: 1, paddingTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 8 }}>
              <div style={{ fontFamily: FRAUNCES, fontSize: 48, fontWeight: 400, letterSpacing: '-0.01em' }}>{m.name}</div>
              <div style={{ fontFamily: INTER, fontSize: 14, color: C.primary, letterSpacing: '0.28em', textTransform: 'uppercase' }}>{m.focus}</div>
            </div>
            <div style={{ fontFamily: INTER, fontSize: 22, color: C.muted, fontWeight: 300 }}>{m.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ========== SLIDE 8 — MES 1 ========== */
function S08_Mes1() {
  return (
    <MonthSlide
      idx={8}
      label="Mes 01 · Despertar"
      headline={<>De humano <span style={{ color: C.muted }}>confundido</span><br/>a mente <em style={{ fontFamily: FRAUNCES, color: C.primary, fontStyle:'italic' }}>estructurada.</em></>}
      lede="Aquí muere el experto genérico. Trabajamos lo interno antes que lo externo. Sin identidad, cualquier estrategia fracasa."
      pillars={[
        { name: 'Conocerte', desc: 'Identidad, esencia y talento monetizable' },
        { name: 'Proyectarte', desc: 'Confianza, arquetipos y narrativa personal' },
      ]}
      results={[
        'Entiendes qué sabes realmente',
        'Identificas tu talento con la fórmula P + H = T',
        'Defines para quién es tu conocimiento',
        'Construyes tu Manifiesto de Marca',
      ]}
      session="Sesión 1:1 #1 — Validación de base"
      sessionDesc="Aterrizamos tu identidad y evitamos que construyas sobre humo."
      accent={C.primary}
    />
  );
}

function S09_Mes2() {
  return (
    <MonthSlide
      idx={9}
      label="Mes 02 · Construcción"
      headline={<>De saber<br/>a <em style={{ fontFamily: FRAUNCES, color: C.primary, fontStyle:'italic' }}>ser vendible.</em></>}
      lede="Aquí el conocimiento deja de ser abstracto y se convierte en producto."
      pillars={[
        { name: 'Impactar', desc: 'Construcción de oferta con dirección' },
        { name: 'Conectar', desc: 'Estrategia de contenido + ventas consultivas' },
      ]}
      results={[
        'Tu oferta premium estructurada',
        'Nombre, promesa, beneficios y precio definidos',
        'Tu MiniApp diseñada como activo de valor',
        'Tu sistema de ventas montado',
      ]}
      session="Sesión 1:1 #2 — Auditoría de oferta"
      sessionDesc="Reviso lo que vas a vender como si fuera un cliente real."
    />
  );
}

function S10_Mes3() {
  return (
    <MonthSlide
      idx={10}
      label="Mes 03 · Exposición"
      headline={<>De proyecto bonito<br/>a <em style={{ fontFamily: FRAUNCES, color: C.primary, fontStyle:'italic' }}>negocio real.</em></>}
      lede="Aquí se acaba la teoría y empieza la magia. Sales al mercado."
      pillars={[
        { name: 'Responder', desc: 'Cómo gestionar mensajes y conversaciones' },
        { name: 'Cerrar', desc: 'Manejar objeciones de precio sin parecer vendedor' },
      ]}
      results={[
        'Publicas tu oferta',
        'Tienes tus primeras conversaciones de venta',
        'Manejas objeciones reales',
        'Recibes tus primeros "no"… y sigues',
        'Idealmente, tu primer "sí"',
      ]}
      session="Sesión 1:1 #3 — Dirección en ejecución"
      sessionDesc="Ajustamos en tiempo real lo que estás haciendo en el mercado."
    />
  );
}

function MonthSlide({ idx, label, headline, lede, pillars, results, session, sessionDesc }) {
  return (
    <Slide>
      <Grain />
      <Brand />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.05fr 1fr', padding: `${SP.py}px ${SP.px}px ${SP.py + 40}px`, gap: 90, alignItems: 'stretch' }}>
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <Eyebrow style={{ marginBottom: 36 }}>{label}</Eyebrow>
            <div style={{ fontFamily: FRAUNCES, fontSize: 84, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
              {headline}
            </div>
            <div style={{ marginTop: 40, paddingLeft: 28, borderLeft: `1px solid ${C.primary}`, fontFamily: INTER, fontSize: 22, color: C.text, lineHeight: 1.5, fontWeight: 300, maxWidth: 600 }}>
              {lede}
            </div>
          </div>

          <div style={{ marginTop: 48 }}>
            <Eyebrow style={{ marginBottom: 24, color: C.muted }}>Pilares</Eyebrow>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {pillars.map(p => (
                <div key={p.name} style={{ borderTop: `1px solid ${C.primaryBorder}`, paddingTop: 18 }}>
                  <div style={{ fontFamily: FRAUNCES, fontSize: 32, fontWeight: 400, marginBottom: 8 }}>{p.name}</div>
                  <div style={{ fontFamily: INTER, fontSize: 18, color: C.muted, lineHeight: 1.45, fontWeight: 300 }}>{p.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ background: C.surface, padding: '44px 48px', border: `1px solid ${C.divider}`, flex: 1 }}>
            <Eyebrow style={{ marginBottom: 28 }}>Resultado</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {results.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: FRAUNCES, fontStyle: 'italic', color: C.primary, fontSize: 22, paddingTop: 4, minWidth: 36 }}>0{i+1}</span>
                  <span style={{ fontFamily: INTER, fontSize: 22, color: C.text, fontWeight: 400, lineHeight: 1.4 }}>{r}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '32px 36px', border: `1px solid ${C.primaryBorder}`, background: C.primarySoft }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.primary }} />
              <span style={{ fontFamily: INTER, fontSize: 13, letterSpacing: '0.32em', textTransform: 'uppercase', color: C.primary, fontWeight: 600 }}>Sesión estratégica 1:1</span>
            </div>
            <div style={{ fontFamily: FRAUNCES, fontSize: 28, fontWeight: 400, marginBottom: 8 }}>{session}</div>
            <div style={{ fontFamily: INTER, fontSize: 17, color: C.muted, lineHeight: 1.45, fontStyle: 'italic' }}>{sessionDesc}</div>
          </div>
        </div>
      </div>
      <Watermark idx={idx} total={18} />
    </Slide>
  );
}

/* ========== SLIDE 11 — DAY 91 ========== */
function S11_Day91() {
  return (
    <Slide>
      <Grain />
      <Brand />
      <div style={{
        position: 'absolute', top: -40, right: -80,
        fontFamily: FRAUNCES, fontStyle: 'italic',
        fontSize: 1100, fontWeight: 300, color: 'rgba(201,169,97,0.06)',
        letterSpacing: '-0.04em', lineHeight: 0.85, userSelect: 'none',
      }}>91</div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${SP.px}px`, position: 'relative', zIndex: 1, overflow: 'hidden' }}>
        <Eyebrow style={{ marginBottom: 40 }}>Día 91</Eyebrow>
        <div style={{ fontFamily: FRAUNCES, fontSize: 76, fontWeight: 300, lineHeight: 1.1, letterSpacing: '-0.02em', color: C.muted, maxWidth: 1200 }}>
          Mientras otros siguen<br/>organizando ideas…
        </div>
        <div style={{ marginTop: 48, fontFamily: FRAUNCES, fontSize: 100, fontWeight: 300, color: C.text, letterSpacing: '-0.02em' }}>
          Tú ya tienes:
        </div>

        <div style={{ marginTop: 64, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32, maxWidth: 1500 }}>
          {['Oferta', 'Sistema', 'Conversaciones', 'Dirección'].map((w, i) => (
            <div key={w} style={{
              borderTop: `2px solid ${C.primary}`,
              paddingTop: 24,
            }}>
              <div style={{ fontFamily: INTER, fontSize: 14, color: C.primary, letterSpacing: '0.32em', marginBottom: 12 }}>0{i+1}</div>
              <div style={{ fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 56, fontWeight: 300, color: C.text, letterSpacing: '-0.01em' }}>{w}.</div>
            </div>
          ))}
        </div>
      </div>
      <Watermark idx={11} total={18} />
    </Slide>
  );
}

/* ========== SLIDE 12 — DELIVERABLES ========== */
function S12_Deliverables() {
  const items = [
    { t: 'Formación completa', d: 'Sesiones grupales en vivo cada semana, del 13 mayo al 11 agosto.' },
    { t: '3 sesiones 1:1 estratégicas', d: 'Conmigo, en los momentos clave de tu proceso.' },
    { t: 'Manifiesto de Marca', d: 'Método propio y oferta documentada.' },
    { t: 'Estrategia validada', d: 'Comunicación y sistema de ventas testeados en mercado.' },
    { t: 'Sistema comercial', d: 'Montado + software listo para operar desde el día uno.' },
    { t: 'MiniApps de IA', d: 'Desarrolladas por mi equipo. No por ti.' },
  ];
  return (
    <Slide>
      <Grain />
      <Brand />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: `${SP.py}px ${SP.px}px ${SP.py + 40}px` }}>
        <div style={{ marginBottom: 64 }}>
          <Eyebrow style={{ marginBottom: 28 }}>Lo que te llevas</Eyebrow>
          <div style={{ fontFamily: FRAUNCES, fontSize: 80, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            Seis entregables núcleo. <span style={{ fontStyle: 'italic', color: C.primary }}>Cero teoría suelta.</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {items.map((it, i) => (
            <div key={it.t} style={{
              padding: '36px 48px 36px 0',
              borderBottom: i < items.length - 2 ? `1px solid ${C.divider}` : 'none',
              borderRight: i % 2 === 0 ? `1px solid ${C.divider}` : 'none',
              paddingLeft: i % 2 === 1 ? 48 : 0,
              display: 'flex', gap: 36, alignItems: 'flex-start',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                border: `1px solid ${C.primary}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 22, color: C.primary,
                flexShrink: 0,
              }}>{String(i+1).padStart(2,'0')}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FRAUNCES, fontSize: 36, fontWeight: 400, lineHeight: 1.15, marginBottom: 10 }}>{it.t}</div>
                <div style={{ fontFamily: INTER, fontSize: 20, color: C.muted, lineHeight: 1.45, fontWeight: 300 }}>{it.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Watermark idx={12} total={18} />
    </Slide>
  );
}

/* ========== SLIDE 13 — BONUSES ========== */
function S13_Bonuses() {
  const bonuses = [
    { name: 'Software de ventas y operación', meta: '12 meses · valor $1,164 USD' },
    { name: 'Copiloto de IA', meta: 'Entrenado con tu método y voz' },
    { name: 'Sistema de contenido', meta: 'Para creadores de marca personal' },
    { name: 'Panel financiero', meta: 'Personalizado para tu negocio' },
    { name: 'Acceso VIP a Ovejas Voladoras', meta: '12 meses de comunidad' },
    { name: 'WhatsApp directo', meta: 'Conmigo y el equipo · 90 días' },
    { name: 'Evento presencial', meta: 'Medellín · Agosto 2026' },
    { name: 'Informe final estructurado', meta: 'De todo tu proyecto' },
  ];
  return (
    <Slide bg={C.surface}>
      <Grain />
      <Brand />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: `${SP.py}px ${SP.px}px ${SP.py + 40}px` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 56 }}>
          <div>
            <Eyebrow style={{ marginBottom: 24 }}>Bonos · incluidos</Eyebrow>
            <div style={{ fontFamily: FRAUNCES, fontSize: 84, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
              Ocho activos<br/>
              que <span style={{ fontStyle: 'italic', color: C.primary }}>multiplican el sistema.</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: INTER, fontSize: 13, color: C.muted, letterSpacing: '0.32em', textTransform: 'uppercase', marginBottom: 8 }}>Valor agregado</div>
            <div style={{ fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 56, color: C.primary }}>+ $1,164 USD</div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, border: `1px solid ${C.divider}`, background: C.bg }}>
          {bonuses.map((b, i) => (
            <div key={b.name} style={{
              padding: '36px 32px',
              borderRight: (i % 4 !== 3) ? `1px solid ${C.divider}` : 'none',
              borderBottom: (i < 4) ? `1px solid ${C.divider}` : 'none',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              minHeight: 240,
            }}>
              <div style={{ fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 26, color: C.primary, fontWeight: 400 }}>0{i+1}</div>
              <div>
                <div style={{ fontFamily: FRAUNCES, fontSize: 28, fontWeight: 400, lineHeight: 1.15, marginBottom: 12 }}>{b.name}</div>
                <div style={{ fontFamily: INTER, fontSize: 16, color: C.muted, lineHeight: 1.4, fontWeight: 300 }}>{b.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Watermark idx={13} total={18} />
    </Slide>
  );
}

/* ========== SLIDE 14 — INVESTMENT REFRAME ========== */
function S14_Investment() {
  return (
    <Slide>
      <Grain />
      <Brand />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: `0 ${SP.px}px`, gap: 100 }}>
        <div>
          <Eyebrow style={{ marginBottom: 36 }}>La inversión</Eyebrow>
          <div style={{ fontFamily: FRAUNCES, fontSize: 96, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em' }}>
            Esto no cuesta<br/>
            <span style={{ color: C.muted, textDecoration: 'line-through', textDecorationColor: 'rgba(138,138,138,0.6)', textDecorationThickness: 3 }}>$2,000.</span>
          </div>
          <div style={{ marginTop: 40, fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 56, fontWeight: 300, color: C.primary, lineHeight: 1.1 }}>
            Cuesta seguir otro año…
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {[
            { n: '01', t: 'Dudando qué vender' },
            { n: '02', t: 'Sin estructura' },
            { n: '03', t: 'Consumiendo contenido sin dirección' },
          ].map(c => (
            <div key={c.n} style={{
              background: C.surface, border: `1px solid ${C.divider}`,
              padding: '32px 40px',
              display: 'flex', alignItems: 'center', gap: 32,
            }}>
              <div style={{ fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 36, color: C.primary }}>{c.n}</div>
              <div style={{ width: 1, height: 56, background: C.divider }} />
              <div style={{ fontFamily: FRAUNCES, fontSize: 32, fontWeight: 400, color: C.text }}>{c.t}</div>
            </div>
          ))}

          <div style={{ marginTop: 16, padding: '32px 40px', background: C.primarySoft, border: `1px solid ${C.primaryBorder}` }}>
            <div style={{ fontFamily: INTER, fontSize: 13, letterSpacing: '0.32em', textTransform: 'uppercase', color: C.primary, fontWeight: 600, marginBottom: 12 }}>
              Punto de equilibrio
            </div>
            <div style={{ fontFamily: FRAUNCES, fontSize: 30, fontWeight: 400, lineHeight: 1.3 }}>
              Con <em style={{ fontStyle: 'italic', color: C.primary }}>2 clientes</em> bien estructurados recuperas la inversión.
            </div>
          </div>
        </div>
      </div>
      <Watermark idx={14} total={18} />
    </Slide>
  );
}

/* ========== SLIDE 15 — IT'S NOT ABOUT MONEY ========== */
function S15_NotAboutMoney() {
  return (
    <Slide bg={C.surface}>
      <Grain />
      <Brand />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: `0 ${SP.px}px`, textAlign: 'center' }}>
        <div style={{ fontFamily: INTER, fontSize: 16, color: C.primary, letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 48 }}>
          Pero esto no va de recuperar dinero.
        </div>
        <div style={{ fontFamily: FRAUNCES, fontSize: 130, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.03em', maxWidth: 1500 }}>
          Va de recuperar <em style={{ fontStyle: 'italic', color: C.primary }}>control</em>
          <br/>
          y hacer que tu negocio<br/>
          <span style={{ color: C.text }}>funcione.</span>
        </div>
      </div>
      <Watermark idx={15} total={18} />
    </Slide>
  );
}

/* ========== SLIDE 16 — GUARANTEE ========== */
function S16_Guarantee() {
  return (
    <Slide>
      <Grain />
      <Brand />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: `0 ${SP.px}px`, gap: 100 }}>
        <div>
          <Eyebrow style={{ marginBottom: 36 }}>Garantía</Eyebrow>
          <div style={{ fontFamily: FRAUNCES, fontSize: 88, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            No te dejamos solo<br/>
            con <span style={{ fontStyle: 'italic', color: C.primary }}>teoría.</span>
          </div>
          <div style={{ marginTop: 40, fontFamily: INTER, fontSize: 22, color: C.text, lineHeight: 1.5, fontWeight: 300, maxWidth: 600 }}>
            Sistemas, apps y estructura con <em style={{ fontFamily: FRAUNCES, color: C.primary }}>soporte directo</em> de mi equipo durante 3 meses completos.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: `1px solid ${C.primaryBorder}` }}>
          {[
            { k: 'Soporte', v: '90 días' },
            { k: 'Cobertura', v: 'Sistemas + Apps + Estructura' },
            { k: 'Equipo', v: 'Acceso directo' },
            { k: 'Modalidad', v: 'WhatsApp + sesiones grupales' },
          ].map((row, i, arr) => (
            <div key={row.k} style={{
              padding: '32px 40px',
              borderBottom: i < arr.length - 1 ? `1px solid ${C.primaryBorder}` : 'none',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ fontFamily: INTER, fontSize: 14, color: C.muted, letterSpacing: '0.32em', textTransform: 'uppercase' }}>{row.k}</div>
              <div style={{ fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 30, color: C.primary, fontWeight: 400 }}>{row.v}</div>
            </div>
          ))}
        </div>
      </div>
      <Watermark idx={16} total={18} />
    </Slide>
  );
}

/* ========== SLIDE 17 — 20 SEATS / DATES ========== */
function S17_Seats() {
  return (
    <Slide bg={C.surface}>
      <Grain />
      <Brand />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${SP.px}px` }}>
        <Eyebrow style={{ marginBottom: 56 }}>¿Cuántas plazas hay?</Eyebrow>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 100, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32 }}>
              <div style={{
                fontFamily: FRAUNCES, fontStyle: 'italic',
                fontSize: 360, fontWeight: 300, lineHeight: 0.85,
                color: C.primary, letterSpacing: '-0.05em',
              }}>20</div>
              <div style={{ paddingTop: 56 }}>
                <div style={{ fontFamily: FRAUNCES, fontSize: 56, fontWeight: 300, lineHeight: 1.1 }}>
                  expertos<br/>
                  <span style={{ color: C.muted, fontStyle: 'italic' }}>seleccionados.</span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 48, fontFamily: INTER, fontSize: 22, color: C.muted, lineHeight: 1.5, fontWeight: 300, maxWidth: 600 }}>
              No todos entran. <br/>
              No todos están <em style={{ fontFamily: FRAUNCES, color: C.text }}>listos.</em>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <DateCard label="Apertura" date="30 de abril" time="9:00 AM (Colombia)" />
            <DateCard label="Inicio" date="13 de mayo" time="Sesiones grupales semanales" highlight />
            <DateCard label="Cierre" date="11 de agosto" time="Día 91 · Tu negocio en marcha" />
          </div>
        </div>
      </div>
      <Watermark idx={17} total={18} />
    </Slide>
  );
}

function DateCard({ label, date, time, highlight }) {
  return (
    <div style={{
      padding: '32px 40px',
      background: highlight ? C.primarySoft : C.bg,
      border: `1px solid ${highlight ? C.primaryBorder : C.divider}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        <div style={{ fontFamily: INTER, fontSize: 13, color: highlight ? C.primary : C.muted, letterSpacing: '0.32em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>{label}</div>
        <div style={{ fontFamily: INTER, fontSize: 16, color: C.muted, fontWeight: 300 }}>{time}</div>
      </div>
      <div style={{ fontFamily: FRAUNCES, fontStyle: highlight ? 'italic' : 'normal', fontSize: 40, fontWeight: 400, color: highlight ? C.primary : C.text }}>{date}</div>
    </div>
  );
}

/* ========== SLIDE 18 — CLOSING ========== */
function S18_Close() {
  return (
    <Slide>
      <Grain />
      <Brand />
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        fontFamily: FRAUNCES, fontStyle: 'italic',
        fontSize: 1200, fontWeight: 300, color: 'rgba(201,169,97,0.04)',
        letterSpacing: '-0.04em', lineHeight: 1, userSelect: 'none',
      }}>.</div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${SP.px}px`, position: 'relative', zIndex: 1 }}>
        <Eyebrow style={{ marginBottom: 48 }}>Cierre</Eyebrow>

        <div style={{ fontFamily: FRAUNCES, fontSize: 88, fontWeight: 300, lineHeight: 1.1, letterSpacing: '-0.02em', color: C.muted, maxWidth: 1500 }}>
          El problema no es que <span style={{ color: C.text }}>no sepas.</span>
        </div>

        <div style={{ marginTop: 36, fontFamily: FRAUNCES, fontSize: 96, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.02em', maxWidth: 1500 }}>
          El problema es que <em style={{ fontStyle: 'italic', color: C.primary }}>no has estructurado</em> lo que sabes.
        </div>

        <div style={{ marginTop: 80, display: 'flex', alignItems: 'center', gap: 32 }}>
          <GoldRule width={120} />
          <div style={{ fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 38, color: C.text, fontWeight: 300, letterSpacing: '-0.01em' }}>
            Y en este mercado, lo que no se estructura <span style={{ color: C.primary }}>no se vende.</span>
          </div>
        </div>

        <div style={{ marginTop: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: INTER, fontSize: 14, color: C.muted, letterSpacing: '0.32em', textTransform: 'uppercase', marginBottom: 16 }}>Próximo paso</div>
            <div style={{ fontFamily: FRAUNCES, fontSize: 56, fontWeight: 400, color: C.text }}>
              Aplica antes del <em style={{ fontStyle: 'italic', color: C.primary }}>13 de mayo.</em>
            </div>
          </div>
          <div style={{ fontFamily: FRAUNCES, fontStyle: 'italic', fontSize: 80, color: C.primary, fontWeight: 300 }}>vuela.</div>
        </div>
      </div>
    </Slide>
  );
}

/* ========== EXPORT ALL ========== */
Object.assign(window, {
  S01_Cover, S02_NotMentorship, S03_NotToLearn, S04_Transformation,
  S05_Outcomes, S06_Traction, S07_PathHeader, S08_Mes1, S09_Mes2, S10_Mes3,
  S11_Day91, S12_Deliverables, S13_Bonuses, S14_Investment, S15_NotAboutMoney,
  S16_Guarantee, S17_Seats, S18_Close,
});
