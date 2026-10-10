/* ========================================
   Mi Barco — Lógica + sincronización con Supabase
   Sistema de hábitos de Paulina Valencia
   Basado en los libros "No eres tú, son tus hábitos" y "Hábitos con cerebro"
   --------------------------------------------------------------
   IMPORTANTE: el progreso de la usuaria NO se guarda en localStorage.
   Todo vive en Supabase (tabla mi_barco_state). Aquí solo mantenemos una
   copia EN MEMORIA que se hidrata al iniciar sesión y se sincroniza
   (upsert con debounce) en cada cambio.
   ======================================== */

/* ====== CONFIGURACIÓN (EDITAR ANTES DE PUBLICAR) ======
   1) Crea el proyecto en https://supabase.com y corre las migraciones de
      Paulina/supabase/migrations/.
   2) Pega aquí la URL y la anon key (Project Settings → API).
   3) (Opcional) Pega la URL del video .mp4 del login tras subirlo a GHL.
   Vuelve a ejecutar build-ghl.sh después de editar este archivo. */
window.MI_BARCO_CONFIG = {
  SUPABASE_URL: 'https://octilxlxwewlfbaoeihr.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdGlseGx4d2V3bGZiYW9laWhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzY1MDUsImV4cCI6MjA5NjYxMjUwNX0.IciEMKNMKznyAsq4GtM9TINtnm7bSpgSf15rQi9CK0A',
  // Video Mi Barco (Remotion) — subido a la biblioteca de medios de GHL.
  VIDEO_URL: 'https://assets.cdn.filesafe.space/3BzYvWc86annqh6ryPC9/media/6a28d9ed77feef7e78d36de8.mp4',
  // Niveles permitidos (case-insensitive). Si un profile.skool_level no coincide
  // con ninguno de estos, se muestra view-blocked con CTA a UPGRADE_URL.
  ALLOWED_LEVELS: ['premium', 'vip'],
  // URL a donde redirigir el botón "Adquirir Premium o VIP" del bloqueo.
  // Es la página de planes de la comunidad Skool de Paulina.
  UPGRADE_URL: 'https://www.skool.com/barco-de-papel-6471/plans'
};

(function (global) {
  'use strict';

  // ----- Estado EN MEMORIA (la única fuente de verdad vive en Supabase) -----
  const _store = { name: '', rueda: null, tracker: null, plan: null, matriz: null };
  let _userId = null;

  const _hasContent = (v) => v && typeof v === 'object' && Object.keys(v).length > 0;

  // Hidrata el estado desde una fila de Supabase (o vacío si la cuenta es nueva).
  function hydrate(row, name) {
    _store.name = name || '';
    _store.rueda = _hasContent(row && row.rueda) ? row.rueda : null;
    _store.tracker = _hasContent(row && row.tracker) ? row.tracker : null;
    _store.plan = _hasContent(row && row.plan) ? row.plan : null;
    _store.matriz = _hasContent(row && row.matriz) ? row.matriz : null;
  }

  function setUserId(id) { _userId = id; }
  function getUserId() { return _userId; }

  // Snapshot serializable para el upsert a Supabase.
  function getState() {
    return {
      rueda: _store.rueda || {},
      tracker: _store.tracker || {},
      plan: _store.plan || {},
      matriz: _store.matriz || {}
    };
  }

  // Limpia el estado en memoria (al cerrar sesión).
  function resetState() {
    _store.name = '';
    _store.rueda = null;
    _store.tracker = null;
    _store.plan = null;
    _store.matriz = null;
    _userId = null;
  }

  // Avisa a la capa de nube que hay cambios pendientes por sincronizar.
  function _schedulePush() {
    if (global.MiBarcoCloud && typeof global.MiBarcoCloud.schedulePush === 'function') {
      global.MiBarcoCloud.schedulePush();
    }
  }

  // ----- Identidad de usuario (el nombre proviene de la sesión de Supabase) -----
  function getUserName() { return _store.name || ''; }
  function setUserName(name) { if (name) { _store.name = name; } }

  // ----- Acceso al estado en memoria (reemplaza por completo a localStorage) -----
  function load(scope, fallback) {
    return _store[scope] != null ? _store[scope] : fallback;
  }

  function save(scope, data) {
    _store[scope] = data;
    _schedulePush();
    return true;
  }

  // ----- Pilares de la Rueda (del libro de Paulina, pág. 188-190) -----
  const PILARES_DEFAULT = [
    { id: 'salud_fisica', nombre: 'Salud física', habitosSugeridos: ['Ejercicio regular', 'Alimentación saludable', 'Descanso y sueño adecuados'] },
    { id: 'bienestar_emocional', nombre: 'Bienestar emocional', habitosSugeridos: ['Gestión del estrés', 'Tiempo para el autocuidado', 'Resiliencia emocional'] },
    { id: 'productividad', nombre: 'Productividad', habitosSugeridos: ['Establecimiento de metas', 'Planificación del tiempo', 'Eliminar hábitos perjudiciales'] },
    { id: 'salud_mental', nombre: 'Salud mental', habitosSugeridos: ['Mindfulness o meditación', 'Apoyo profesional', 'Hábitos de salud mental'] },
    { id: 'relaciones', nombre: 'Relaciones', habitosSugeridos: ['Habilidades sociales', 'Límites saludables', 'Empatía y comunicación'] },
    { id: 'desarrollo_personal', nombre: 'Desarrollo personal', habitosSugeridos: ['Lectura/podcast/audiolibros', 'Cursos o actividades', 'Crecimiento personal'] },
    { id: 'financieros', nombre: 'Hábitos financieros', habitosSugeridos: ['Presupuesto y planificación', 'Ahorro regular', 'Eliminar hábitos financieros dañinos'] },
    { id: 'autodisciplina', nombre: 'Autodisciplina', habitosSugeridos: ['Rutinas diarias', 'Desarrollo de la autodisciplina', 'Superar obstáculos'] },
    { id: 'conexion_social', nombre: 'Conexión social', habitosSugeridos: ['Relaciones saludables', 'Actividades sociales', 'Apoyo emocional'] },
    { id: 'ambiente', nombre: 'Ambiente y organización', habitosSugeridos: ['Entorno propicio para el éxito', 'Organización del espacio', 'Eliminar distracciones'] }
  ];

  // ============================================================
  // NEUROPLIEGUES — Herramientas conductuales de Paulina
  // Basadas en el libro "Hábitos con cerebro"
  // Cada Neuropliegue es un pilar con N herramientas.
  // ============================================================
  const NEUROPLIEGUES = [
    {
      id: 'reducir_friccion',
      nombre: 'Reducir fricción',
      icono: 'zap',
      color: '#d94534',
      explicacionCorta: 'Identifica qué dificulta que te pongas en acción — un pensamiento, un desplazamiento, un horario — y elige una herramienta para reducirlo.',
      obstaculo: 'No tengo tiempo / Me cuesta empezar',
      proximamente: false,
      herramientas: [
        {
          id: 'ley_5_segundos',
          nombre: 'Ley de los 5 segundos',
          autor: 'Mel Robbins',
          explicacion: 'Cuando aparece una acción importante, tu cerebro abre una ventana de negociación. Mientras más tiempo permanezcas pensando, más probabilidades hay de que aparezcan excusas, dudas o distracciones. La ley te propone actuar inmediatamente: cuenta 5-4-3-2-1 y muévete. No pienses, actúa.',
          fundamentoCientifico: 'Se apoya en mecanismos de interrupción de patrones automáticos. La cuenta regresiva desplaza la atención de circuitos automáticos hacia sistemas ejecutivos asociados con la corteza prefrontal. Esto reduce temporalmente la rumiación y facilita la acción.',
          comoAplicarlo: 'Identifica una acción que sueles posponer. Cuando aparezca el momento de hacerla, cuenta 5-4-3-2-1 y muévete físicamente antes de terminar de pensar.',
          ejemploPractico: 'Suena la alarma para entrenar. Antes de negociar contigo mismo: cuenta 5-4-3-2-1 y te levantas de la cama.',
          formularioAplicacion: {
            descripcion: 'Define la acción que aplicarás con esta herramienta:',
            campos: [
              { id: 'accion', label: '¿Qué acción vas a aplicar contando 5-4-3-2-1?', placeholder: 'Ej: Levantarme de la cama cuando suene la alarma', tipo: 'textarea' },
              { id: 'momento', label: '¿Cuándo aparecerá esa acción?', placeholder: 'Ej: Todas las mañanas a las 6:00 a.m.', tipo: 'text' }
            ],
            habitoSugerido: 'Cuenta 5-4-3-2-1 antes de {accion}'
          }
        },
        {
          id: 'acciones_implementacion',
          nombre: 'Acciones de implementación',
          autor: 'Peter Gollwitzer',
          explicacion: 'Tu cerebro ejecuta mejor las acciones cuando sabe exactamente cuándo y dónde ocurrirán. No basta con decir "voy a leer más"; debes definir: "Leeré 10 páginas después del desayuno en la mesa del comedor."',
          fundamentoCientifico: 'Basado en los estudios de Peter Gollwitzer sobre "Implementation Intentions". Las personas que definen contexto específico muestran significativamente mayor adherencia conductual.',
          comoAplicarlo: 'Completa esta frase: "Cuando ocurra __________, entonces haré __________."',
          ejemploPractico: 'Cuando termine de cepillarme los dientes, leeré una página.',
          formularioAplicacion: {
            descripcion: 'Completa tu frase de implementación:',
            campos: [
              { id: 'cuando', label: 'Cuando ocurra...', placeholder: 'Ej: Termine de cepillarme los dientes', tipo: 'text' },
              { id: 'entonces', label: '...entonces haré', placeholder: 'Ej: Leer una página de mi libro', tipo: 'text' }
            ],
            habitoSugerido: '{entonces} cuando {cuando}'
          }
        },
        {
          id: 'pre_decision',
          nombre: 'Pre-decisión',
          autor: null,
          explicacion: 'Las decisiones consumen energía mental. Cada vez que debes decidir nuevamente si actuar o no, aumentan las probabilidades de abandonar. La pre-decisión elimina esa negociación.',
          fundamentoCientifico: 'Cada decisión consume energía mental (decision fatigue). Cuando debes decidir repetidamente si actuar, aumentan las probabilidades de posponer o abandonar. La pre-decisión reduce la fatiga al definir con anticipación qué, cuándo y cómo. Menos decisiones = más consistencia.',
          comoAplicarlo: 'Decide hoy algo que ejecutarás mañana. Define qué harás, cuándo lo harás, dónde lo harás… y no vuelvas a discutirlo contigo mismo.',
          ejemploPractico: 'No decidir mañana si entrenarás. Decidir hoy: "Entreno lunes, miércoles y viernes a las 6:00 a.m."',
          formularioAplicacion: {
            descripcion: 'Pre-decide ahora para no negociar después:',
            campos: [
              { id: 'que', label: '¿Qué harás?', placeholder: 'Ej: Entrenar 45 minutos', tipo: 'text' },
              { id: 'cuando', label: '¿Cuándo lo harás?', placeholder: 'Ej: Lunes, miércoles y viernes a las 6:00 a.m.', tipo: 'text' },
              { id: 'donde', label: '¿Dónde lo harás?', placeholder: 'Ej: En el gimnasio del barrio', tipo: 'text' }
            ],
            habitoSugerido: '{que} — {cuando}'
          }
        }
      ]
    },
    {
      id: 'disenar_entorno',
      nombre: 'Diseña tu entorno',
      icono: 'layout',
      color: '#08315C',
      explicacionCorta: 'Tu entorno influye más en tus decisiones de lo que imaginas. Observa qué te rodea y elige una herramienta para que la mejor decisión sea también la más fácil.',
      obstaculo: 'Siempre me distraigo / Mi entorno me sabotea',
      proximamente: false,
      herramientas: [
        {
          id: 'haz_que_estorbe',
          nombre: 'Haz que estorbe',
          autor: null,
          explicacion: 'Tu cerebro tiende a olvidar lo que no ve. Una de las formas más efectivas de recordar un hábito es convertirlo en algo imposible de ignorar. Pon a la vista, justo donde más interrumpa tu rutina automática, aquello que quieres recordar.',
          fundamentoCientifico: 'Cerca de la mitad de la corteza cerebral participa en el procesamiento de información visual. Lo que está a la vista tiende a ocurrir; lo que no, tiende a olvidarse. Tu entorno funciona como un sistema de recordatorios neuronales.',
          comoAplicarlo: 'Identifica el hábito o la acción que quieres recordar. Elige un objeto que represente esa acción y ubícalo en un lugar donde interrumpa tu comportamiento habitual. La señal debe ser visible y difícil de ignorar.',
          ejemploPractico: '¿Quieres entrenar temprano? Deja la ropa de entrenamiento sobre la silla donde te sientas cada mañana. ¿Quieres leer antes de dormir? Deja el libro sobre la almohada.',
          formularioAplicacion: {
            descripcion: 'Diseña tu señal visual:',
            campos: [
              { id: 'habito', label: '¿Qué hábito quieres recordar?', placeholder: 'Ej: Entrenar en la mañana', tipo: 'text' },
              { id: 'objeto', label: 'Objeto que lo represente', placeholder: 'Ej: Mi ropa de entrenamiento', tipo: 'text' },
              { id: 'lugar', label: '¿Dónde lo pondrás para que estorbe?', placeholder: 'Ej: Sobre la silla donde me siento al despertar', tipo: 'text' }
            ],
            habitoSugerido: '{habito} (señal: {objeto} en {lugar})'
          }
        },
        {
          id: 'anclaje_habitos',
          nombre: 'Anclaje de hábitos',
          autor: null,
          explicacion: 'Los hábitos nuevos sobreviven mejor cuando se conectan con hábitos existentes. Aprovecha una rutina que ya tienes automatizada como gancho para la nueva.',
          fundamentoCientifico: 'El anclaje de hábitos se basa en aprendizaje asociativo. Cuando repites una nueva conducta inmediatamente después de una acción ya automatizada, tu cerebro vincula ambas. Con el tiempo, el hábito antiguo se convierte en la señal que dispara el nuevo.',
          comoAplicarlo: 'Después de un hábito establecido, añade uno nuevo. Fórmula: "Después de [hábito viejo], haré [hábito nuevo]."',
          ejemploPractico: 'Después de servir el café: escribiré tres líneas en el diario.',
          formularioAplicacion: {
            descripcion: 'Ancla tu nuevo hábito a uno existente:',
            campos: [
              { id: 'habito_viejo', label: 'Después de... (hábito ya establecido)', placeholder: 'Ej: Servir mi café de la mañana', tipo: 'text' },
              { id: 'habito_nuevo', label: '...haré (nuevo hábito)', placeholder: 'Ej: Escribir tres líneas en mi diario', tipo: 'text' }
            ],
            habitoSugerido: '{habito_nuevo} después de {habito_viejo}'
          }
        },
        {
          id: 'partner_in_crime',
          nombre: 'Partner in crime',
          autor: null,
          explicacion: 'El cambio es más fácil cuando no ocurre en soledad. La rendición de cuentas aumenta la adherencia.',
          fundamentoCientifico: 'Las personas tienen más probabilidades de sostener un hábito cuando existe algún nivel de rendición de cuentas. La psicología social ha demostrado que compartir compromisos aumenta la adherencia. Cuando alguien conoce tu objetivo, tu cerebro percibe un mayor compromiso.',
          comoAplicarlo: 'Comparte tu compromiso con alguien. Elige un partner que: te anime sin juzgarte, celebre tus avances, te recuerde tu compromiso, respete tu proceso, no te avergüence cuando falles, no compita contigo, no intente hacerlo por ti.',
          ejemploPractico: 'Enviarle a tu partner una foto diaria después de entrenar.',
          formularioAplicacion: {
            descripcion: 'Define tu acuerdo de rendición de cuentas:',
            campos: [
              { id: 'partner', label: '¿Quién será tu partner in crime?', placeholder: 'Ej: María, mi mejor amiga', tipo: 'text' },
              { id: 'compromiso', label: '¿Cuál será tu compromiso con él/ella?', placeholder: 'Ej: Enviarle una foto cada día después de entrenar', tipo: 'textarea' }
            ],
            habitoSugerido: 'Compromiso con {partner}: {compromiso}'
          }
        }
      ]
    },
    {
      id: 'empezar_pequeno',
      nombre: 'Empieza pequeño',
      icono: 'sprout',
      color: '#2f9e6f',
      explicacionCorta: 'Si el cambio parece enorme, tu cerebro percibirá más esfuerzo y resistencia. Reduce la meta hasta una versión tan pequeña que te resulte fácil comenzar.',
      obstaculo: 'Empiezo motivada y abandono / Lo veo muy grande',
      proximamente: false,
      herramientas: [
        {
          id: 'habito_absurdo',
          nombre: 'Hábito absurdo',
          autor: 'BJ Fogg (Tiny Habits)',
          explicacion: 'Reduce el hábito hasta un nivel tan pequeño que resulte imposible rechazarlo. Pregúntate: ¿cuál es la versión ridículamente fácil?',
          fundamentoCientifico: 'Basado en la metodología Tiny Habits de BJ Fogg. Cuando una acción parece demasiado grande, el cerebro genera resistencia. Al reducir el hábito a una versión absurdamente pequeña, disminuye la barrera de entrada y aumenta la probabilidad de actuar. La consistencia es más importante que la intensidad.',
          comoAplicarlo: 'Pregúntate: ¿cuál es la versión ridículamente fácil? Y empieza por ahí, sin culpa.',
          ejemploPractico: 'No leer 20 páginas: leer una sola línea.',
          formularioAplicacion: {
            descripcion: 'Reduce tu hábito a su versión imposible de fallar:',
            campos: [
              { id: 'habito_original', label: 'Hábito original (cómo lo pensabas)', placeholder: 'Ej: Leer 20 páginas al día', tipo: 'text' },
              { id: 'version_absurda', label: 'Versión ridículamente fácil', placeholder: 'Ej: Leer una sola línea al día', tipo: 'text' }
            ],
            habitoSugerido: '{version_absurda}'
          }
        },
        {
          id: 'no_rompas_cadena',
          nombre: 'No rompas la cadena',
          autor: 'Jerry Seinfeld',
          explicacion: 'Muchas personas abandonan un hábito porque fallan un día y sienten que arruinaron todo. La estrategia "no rompas la cadena" propone otro enfoque: el objetivo no es hacerlo perfecto, sino mantener la continuidad. Cada día cumplido es un eslabón.',
          fundamentoCientifico: 'Basado en principios de seguimiento conductual y refuerzo visual. Cuando registras tus acciones, tu progreso se vuelve visible. Cada día cumplido actúa como una pequeña recompensa para tu cerebro y se convierte en evidencia de la identidad que estás construyendo.',
          comoAplicarlo: 'Elige un hábito. Cada día que lo completes, márcalo en tu tracker. Concéntrate en mantener viva la cadena. Si fallas, tu única misión es volver al hábito lo antes posible.',
          ejemploPractico: 'Treinta días consecutivos registrando lectura en el Tracker de Hábitos de esta app.',
          formularioAplicacion: {
            descripcion: 'Define la cadena que vas a sostener:',
            campos: [
              { id: 'habito', label: '¿Qué hábito vas a sostener?', placeholder: 'Ej: Leer al menos una página antes de dormir', tipo: 'text' },
              { id: 'meta_dias', label: 'Meta de días consecutivos (opcional)', placeholder: 'Ej: 30 días', tipo: 'text' }
            ],
            habitoSugerido: '{habito}'
          }
        },
        {
          id: 'ley_50',
          nombre: 'La Ley del 50%',
          autor: null,
          explicacion: 'Cuando definimos un hábito, solemos planearlo desde nuestra mejor versión: la que tiene energía, tiempo, motivación. El problema es que no vivimos todos los días en esa versión. Comprométete inicialmente con solo la mitad de lo que crees que podrías hacer.',
          fundamentoCientifico: 'Las metas excesivamente exigentes aumentan la percepción de esfuerzo y elevan las probabilidades de abandono. Reducir la exigencia inicial disminuye la resistencia conductual, facilita la repetición y favorece la adherencia. Los hábitos sostenibles se construyen a partir de acciones que puedes repetir consistentemente.',
          comoAplicarlo: 'Pregúntate: ¿qué cantidad de este hábito podría cumplir incluso en un día difícil? Reduce tu expectativa inicial aproximadamente a la mitad.',
          ejemploPractico: 'Si pensabas leer 20 páginas diarias: ahora lee 10 páginas diarias.',
          formularioAplicacion: {
            descripcion: 'Define tu versión al 50%:',
            campos: [
              { id: 'habito_100', label: 'Hábito al 100% (tu versión ideal)', placeholder: 'Ej: Correr 30 minutos cada mañana', tipo: 'text' },
              { id: 'habito_50', label: 'Versión al 50% (la que puedes cumplir hasta en un día difícil)', placeholder: 'Ej: Correr 15 minutos cada mañana', tipo: 'text' }
            ],
            habitoSugerido: '{habito_50}'
          }
        }
      ]
    },
    {
      id: 'construir_identidad',
      nombre: 'Construye identidad',
      icono: 'sailboat',
      color: '#F4C94A',
      explicacionCorta: 'Los hábitos no solo cambian lo que haces, transforman quién eres. Cada acción repetida es evidencia para tu cerebro sobre el tipo de persona que eres capaz de ser.',
      obstaculo: 'No me siento capaz / Siempre he sido así',
      proximamente: false,
      herramientas: [
        {
          id: 'vota_identidad',
          nombre: 'Vota por tu identidad',
          autor: null,
          explicacion: 'Cada vez que realizas una acción, le envías información a tu cerebro sobre quién eres. No te conviertes en una persona disciplinada porque lo afirmes, sino porque actúas como tal. Cada hábito completado es un voto a favor de la identidad que quieres construir.',
          fundamentoCientifico: 'Tu cerebro construye la identidad a partir de la evidencia que acumula sobre ti mismo. Cada acción repetida fortalece la percepción de quién eres y genera coherencia entre tus comportamientos y tu autoconcepto. Cuando actúas consistentemente con una identidad, tu cerebro comienza a considerarla parte de ti.',
          comoAplicarlo: 'Pregúntate: ¿qué identidad quiero construir? Y luego: ¿qué acción pequeña sería un voto a favor de esa identidad hoy? No busques perfección, busca acumular votos.',
          ejemploPractico: 'Quieres convertirte en alguien que lee a diario. Leer una página no te convierte inmediatamente en ese tipo de persona, pero sí representa un voto a favor de esa identidad.',
          formularioAplicacion: {
            descripcion: 'Define tu identidad y el voto de hoy:',
            campos: [
              { id: 'identidad', label: '¿Qué identidad quieres construir?', placeholder: 'Ej: Una persona consistente con el ejercicio', tipo: 'text' },
              { id: 'voto', label: '¿Qué acción pequeña será un voto a favor de esa identidad?', placeholder: 'Ej: Salir a caminar 10 min cada mañana', tipo: 'text' }
            ],
            habitoSugerido: '{voto} (voto por: {identidad})'
          }
        },
        {
          id: 'reescribe_narrativa',
          nombre: 'Reescribe la narrativa',
          autor: null,
          explicacion: 'Tu cerebro construye constantemente una historia sobre quién eres. Esa historia influye en lo que crees posible. Si durante años te has dicho que eres inconstante, actuarás en coherencia con esa narrativa. Reescribirla no es mentirte: es construir una historia más útil basada en quién estás eligiendo ser.',
          fundamentoCientifico: 'La Red Neuronal por Defecto (Default Mode Network) participa en la construcción de la narrativa personal y el autoconcepto. Tu cerebro organiza las experiencias en forma de historias. Cuando cambias la narrativa que repites sobre ti y la acompañas con nuevas acciones, fortaleces una identidad diferente.',
          comoAplicarlo: 'Completa: "Hasta hoy me he contado que soy ___. A partir de ahora elijo contarme que soy ___." Asegúrate de que la nueva narrativa refleje una identidad en construcción, no una perfección imposible.',
          ejemploPractico: 'Antes: "Soy una persona inconstante." Ahora: "Soy una persona que está aprendiendo a ser consistente."',
          formularioAplicacion: {
            descripcion: 'Reescribe tu historia interna:',
            campos: [
              { id: 'narrativa_vieja', label: 'Hasta hoy me he contado que soy...', placeholder: 'Ej: Una persona inconstante', tipo: 'textarea' },
              { id: 'narrativa_nueva', label: 'A partir de ahora elijo contarme que soy...', placeholder: 'Ej: Una persona que está aprendiendo a ser consistente', tipo: 'textarea' }
            ],
            habitoSugerido: 'Repetir diariamente: "{narrativa_nueva}"'
          }
        },
        {
          id: 'elige_referente',
          nombre: 'Elige un referente',
          autor: 'Albert Bandura',
          explicacion: 'Cuando no sabes qué hacer, puedes apoyarte en alguien que ya representa la persona que quieres ser. Un referente funciona como una brújula. Ante una situación difícil, pregúntate: ¿qué haría mi referente si estuviera en mi lugar?',
          fundamentoCientifico: 'Basada en el aprendizaje observacional de Albert Bandura. Los seres humanos aprendemos observando comportamientos, estrategias y modelos que admiramos. Tener un referente facilita la adopción de nuevas conductas porque le proporciona al cerebro un ejemplo concreto.',
          comoAplicarlo: 'Elige una persona que represente la identidad que quieres construir. Puede ser alguien cercano, una figura pública o incluso un personaje histórico. Ante una decisión importante, pregúntate: ¿qué haría esta persona en mi lugar? Actúa de acuerdo con la respuesta.',
          ejemploPractico: 'Quieres ser más constante con el ejercicio. Cuando aparezca la tentación de saltártelo: ¿qué haría mi referente? Actúa desde esa identidad, no desde la emoción del momento.',
          formularioAplicacion: {
            descripcion: 'Elige tu referente y la pregunta clave:',
            campos: [
              { id: 'referente', label: '¿Quién es tu referente?', placeholder: 'Ej: Mi tía María, que lleva años entrenando', tipo: 'text' },
              { id: 'por_que', label: '¿Por qué la elegiste? ¿Qué representa?', placeholder: 'Ej: Consistencia y disciplina sin perder la calma', tipo: 'textarea' },
              { id: 'pregunta', label: 'Pregunta clave que te harás en momentos difíciles', placeholder: 'Ej: ¿Qué haría María si estuviera en mi lugar?', tipo: 'text' }
            ],
            habitoSugerido: 'Preguntarme: "{pregunta}"'
          }
        }
      ]
    },
    {
      id: 'gestiona_cerebro',
      nombre: 'Gestiona tu cerebro',
      icono: 'brain',
      color: '#6c4fa5',
      explicacionCorta: 'Herramientas para regular emociones, manejar el estrés y recuperar el control cuando tu cerebro te sabotea. Próximamente.',
      obstaculo: 'Mis emociones me sabotean',
      proximamente: true,
      herramientas: []
    }
  ];

  // ----- API pública: Rueda -----
  function getRueda() {
    const stored = load('rueda', null);
    if (stored && stored.pilares) {
      // Verificar si hay que resetear por cambio de mes
      const mesActual = getMesActual();
      if (stored.mesAsignado && stored.mesAsignado !== mesActual) {
        // El mes cambió: archivar snapshot y resetear
        return resetearRuedaMensual(stored, mesActual);
      }
      return stored;
    }
    return crearRuedaNueva();
  }

  function crearRuedaNueva() {
    return {
      pilares: PILARES_DEFAULT.map(p => ({ ...p, valor: 5 })),
      ultimaActualizacion: null,
      mesAsignado: getMesActual(),
      historial: []
    };
  }

  function resetearRuedaMensual(ruedaAnterior, mesActual) {
    // Archivar snapshot del mes anterior
    const snapshot = {
      mes: ruedaAnterior.mesAsignado,
      fecha: ruedaAnterior.ultimaActualizacion || new Date().toISOString(),
      valores: ruedaAnterior.pilares.map(p => ({ id: p.id, nombre: p.nombre, valor: p.valor })),
      promedio: ruedaAnterior.pilares.reduce((acc, p) => acc + p.valor, 0) / ruedaAnterior.pilares.length,
      // Cada mes la rueda arranca con todo en 5. Si nadie la tocó, ese 5 no es
      // una respuesta: se marca para que el historial no lo presente como tal.
      calificada: !!ruedaAnterior.ultimaActualizacion
    };
    const nueva = crearRuedaNueva();
    nueva.historial = [snapshot, ...(ruedaAnterior.historial || [])].slice(0, 24);
    save('rueda', nueva);
    return nueva;
  }

  function saveRueda(rueda) {
    rueda.ultimaActualizacion = new Date().toISOString();
    if (!rueda.mesAsignado) rueda.mesAsignado = getMesActual();
    return save('rueda', rueda);
  }

  function getPilarMasBajo(rueda) {
    if (!rueda || !rueda.pilares) return null;
    return [...rueda.pilares].sort((a, b) => a.valor - b.valor)[0];
  }

  function getPromedioRueda(rueda) {
    if (!rueda || !rueda.pilares || !rueda.pilares.length) return 0;
    const suma = rueda.pilares.reduce((acc, p) => acc + p.valor, 0);
    return suma / rueda.pilares.length;
  }

  // ----- API pública: Tracker -----
  function getTracker() {
    return load('tracker', {
      habitos: [],
      registros: {},
      metas: {},
      notas: {}
    });
  }

  function saveTracker(tracker) {
    return save('tracker', tracker);
  }

  function getMesActual() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function getDiasDelMes(yyyyMm) {
    const [year, month] = yyyyMm.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  }

  function getDiaActual() {
    return new Date().getDate();
  }

  function agregarHabito(tracker, nombre, pilarId) {
    const id = 'hab_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const colores = ['#6cae8f', '#1f3a5f', '#d4756b', '#e8a94e', '#9b7cb9', '#5fa8a8'];
    const color = colores[tracker.habitos.length % colores.length];
    tracker.habitos.push({ id, nombre, color, pilarId: pilarId || null });
    return id;
  }

  function eliminarHabito(tracker, habitoId) {
    tracker.habitos = tracker.habitos.filter(h => h.id !== habitoId);
    Object.keys(tracker.registros).forEach(mes => {
      if (tracker.registros[mes][habitoId]) delete tracker.registros[mes][habitoId];
    });
  }

  // Editar un hábito existente (nombre y pilar) SIN perder su historial:
  // conserva el mismo id, color y todos los registros ya marcados.
  function editarHabito(tracker, habitoId, nombre, pilarId) {
    const h = tracker.habitos.find(x => x.id === habitoId);
    if (!h) return false;
    h.nombre = nombre;
    h.pilarId = pilarId || null;
    return true;
  }

  function marcarDia(tracker, habitoId, mes, dia, estado) {
    if (!tracker.registros[mes]) tracker.registros[mes] = {};
    if (!tracker.registros[mes][habitoId]) tracker.registros[mes][habitoId] = {};
    if (estado === null || estado === 'empty') {
      delete tracker.registros[mes][habitoId][dia];
    } else {
      tracker.registros[mes][habitoId][dia] = estado;
    }
  }

  function getEstadoDia(tracker, habitoId, mes, dia) {
    return tracker.registros[mes]?.[habitoId]?.[dia] || 'empty';
  }

  function getResumenMes(tracker, mes) {
    const dias = getDiasDelMes(mes);
    return tracker.habitos.map(h => {
      const reg = tracker.registros[mes]?.[h.id] || {};
      const done = Object.values(reg).filter(v => v === 'done').length;
      const partial = Object.values(reg).filter(v => v === 'partial').length;
      const skip = Object.values(reg).filter(v => v === 'skip').length;
      const total = done + partial + skip;
      const porcentaje = total > 0 ? Math.round((done / dias) * 100) : 0;
      return { habito: h, done, partial, skip, dias, porcentaje };
    });
  }

  // ----- API pública: Mi Plan (Neuropliegues guardados) -----
  // Estructura: { herramientas: [{ neuropliegueId, herramientaId, fechaGuardado, estado, notas }] }
  function getPlan() {
    return load('plan', { herramientas: [] });
  }

  function savePlan(plan) {
    return save('plan', plan);
  }

  function findNeuropliegue(neuropliegueId) {
    return NEUROPLIEGUES.find(n => n.id === neuropliegueId);
  }

  function findHerramienta(neuropliegueId, herramientaId) {
    const np = findNeuropliegue(neuropliegueId);
    if (!np) return null;
    return np.herramientas.find(h => h.id === herramientaId);
  }

  function agregarHerramientaAlPlan(plan, neuropliegueId, herramientaId, estado, aplicacion) {
    // Si ya existe, actualiza el estado y la aplicación
    const existente = plan.herramientas.find(
      h => h.neuropliegueId === neuropliegueId && h.herramientaId === herramientaId
    );
    if (existente) {
      existente.estado = estado || existente.estado;
      if (aplicacion) existente.aplicacion = aplicacion;
      existente.fechaActualizacion = new Date().toISOString();
    } else {
      plan.herramientas.unshift({
        neuropliegueId,
        herramientaId,
        estado: estado || 'guardado',  // 'guardado' | 'aplicando' | 'completado'
        fechaGuardado: new Date().toISOString(),
        aplicacion: aplicacion || null,  // { campos: { campoId: 'valor', ... } }
        notas: ''
      });
    }
  }

  function quitarHerramientaDelPlan(plan, neuropliegueId, herramientaId) {
    plan.herramientas = plan.herramientas.filter(
      h => !(h.neuropliegueId === neuropliegueId && h.herramientaId === herramientaId)
    );
  }

  function estaEnPlan(plan, neuropliegueId, herramientaId) {
    return plan.herramientas.some(
      h => h.neuropliegueId === neuropliegueId && h.herramientaId === herramientaId
    );
  }

  // ============================================================
  // ONBOARDING — slides de bienvenida (primera vez)
  // ============================================================
  const ONBOARDING_SLIDES = [
    {
      icono: 'sailboat',
      eyebrow: 'Te damos la bienvenida',
      titulo: 'Llegaste a Mi Barco',
      texto: 'Esta es tu bitácora de hábitos. Aquí vas a construir tu identidad un pliegue a la vez. En 5 pasos te mostramos cómo funciona.',
      bullets: null
    },
    {
      icono: 'target',
      eyebrow: 'Paso 1 · Diagnóstico',
      titulo: 'Diagnostica tu realidad',
      texto: 'Califica del 1 al 10 los 10 pilares de tu vida. La Rueda te muestra dónde un nuevo hábito haría más diferencia.',
      bullets: [
        'Toca un pilar para calificarlo',
        'Tu pilar más bajo es por donde empezar',
        'Se resetea cada mes para que vuelvas a evaluarte'
      ]
    },
    {
      icono: 'brain',
      eyebrow: 'Paso 2 · Implementación',
      titulo: 'Comprende tu cerebro',
      texto: 'Los Neuropliegues son herramientas basadas en neurociencia para superar la barrera específica que te está bloqueando.',
      bullets: [
        'Elige según lo que más te cuesta',
        '4 pilares · 12 herramientas',
        'Aplícalas con un formulario guiado'
      ]
    },
    {
      icono: 'calendar',
      eyebrow: 'Paso 3 · Identidad',
      titulo: 'Construye tu identidad',
      texto: 'Marca cada día en el anillo circular del Tracker. Cada hábito cumplido es un voto a favor de quién estás siendo.',
      bullets: [
        'Verde = cumplí · Coral = no pude',
        'Anota metas y notas mensuales',
        'Observa cómo crece tu constancia anual'
      ]
    },
    {
      icono: 'clipboard',
      eyebrow: 'Tu caja de herramientas',
      titulo: 'Mi Plan',
      texto: 'Las herramientas que aplicas viven aquí, con tus respuestas guardadas. Edítalas cuando quieras y regístralas como hábitos en el Tracker.',
      bullets: null
    },
    {
      icono: 'sparkles',
      eyebrow: 'Todo listo para empezar',
      titulo: 'Tu primer pliegue empieza aquí',
      texto: 'Empieza por la Rueda para descubrir tu pilar más bajo. Ahí está tu primer paso. Pequeño no es débil — es estratégico.',
      bullets: null,
      ctaLabel: 'Comenzar mi diagnóstico'
    }
  ];

  // Helpers del onboarding (persistencia en plan.meta)
  function getOnboardingCompletado(plan) {
    return !!(plan && plan.meta && plan.meta.onboardingCompletado);
  }
  function marcarOnboardingCompletado(plan) {
    if (!plan.meta) plan.meta = {};
    plan.meta.onboardingCompletado = true;
    plan.meta.onboardingFecha = new Date().toISOString();
  }
  function resetOnboarding(plan) {
    if (plan.meta) delete plan.meta.onboardingCompletado;
  }

  // ----- Mapeo obstáculo → Neuropliegue (Quiz inicial) -----
  const OBSTACULOS = [
    { id: 'tiempo', label: 'No tengo tiempo / Me cuesta empezar', neuropliegueId: 'reducir_friccion' },
    { id: 'distraigo', label: 'Siempre me distraigo / Mi entorno me sabotea', neuropliegueId: 'disenar_entorno' },
    { id: 'abandono', label: 'Empiezo motivada y abandono / Lo veo muy grande', neuropliegueId: 'empezar_pequeno' },
    { id: 'capaz', label: 'No me siento capaz / Siempre he sido así', neuropliegueId: 'construir_identidad' },
    { id: 'emociones', label: 'Mis emociones me sabotean', neuropliegueId: 'gestiona_cerebro' }
  ];

  // ============================================================
  // BIBLIOTECA DE ICONOS (estilo Lucide, trazo 1.8, monocromáticos)
  // Heredan currentColor del padre. Usar con x-html="icon('name')"
  // ============================================================
  const ICONS = {
    home: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12L12 3l9 9"/><path d="M5 10v10a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V10"/></svg>',
    target: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    brain: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>',
    calendar: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>',
    clipboard: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/></svg>',
    grid: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>',
    zap: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    layout: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="9" height="7" rx="1"/><rect x="16" y="14" width="5" height="7" rx="1"/></svg>',
    sprout: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5 8-6 8-10a3 3 0 0 0-3-3 3 3 0 0 0-3 3c0 1.5-.5 3-2 4"/><path d="M12 20c-4-2-7-4-7-9a3 3 0 0 1 3-3 3 3 0 0 1 3 3c0 .5.1 1 .2 1.5"/></svg>',
    compass: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    sparkles: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L13.5 8.5 19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"/><path d="M19 16l.8 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6z"/><path d="M5 4l.6 1.6L7 6l-1.4.4L5 8l-.4-1.6L3 6l1.6-.4z"/></svg>',
    checkCircle: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    xCircle: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
    halfCircle: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/></svg>',
    chevronLeft: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
    chevronRight: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    arrowRight: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
    bookmark: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>',
    bookmarkCheck: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" fill="currentColor" fill-opacity="0.12"/><path d="m9 10 2 2 4-4"/></svg>',
    plus: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    edit: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    sailboat: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 18H2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4Z"/><path d="M21 14 10 2 3 14h18Z"/><path d="M10 2v16"/></svg>',
    sparkle: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 6.5L20 11l-6.1 1.5L12 19l-1.9-6.5L4 11l6.1-1.5z"/></svg>',
    book: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    refresh: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
    save: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>',
    flag: '<svg class="pv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22V15"/></svg>'
  };

  function icon(name) {
    return ICONS[name] || '';
  }

  // ----- Exponer API -----
  global.MisPliegues = {
    getUserId, getUserName, setUserName,
    hydrate, setUserId, getState, resetState,
    load, save,   // acceso genérico por scope (lo usa la Matriz: 'matriz')
    PILARES_DEFAULT, NEUROPLIEGUES, OBSTACULOS, ICONS, icon,
    ONBOARDING_SLIDES, getOnboardingCompletado, marcarOnboardingCompletado, resetOnboarding,
    getRueda, saveRueda, getPilarMasBajo, getPromedioRueda,
    getTracker, saveTracker, getMesActual, getDiasDelMes, getDiaActual,
    agregarHabito, editarHabito, eliminarHabito, marcarDia, getEstadoDia, getResumenMes,
    getPlan, savePlan, agregarHerramientaAlPlan, quitarHerramientaDelPlan, estaEnPlan,
    findNeuropliegue, findHerramienta
  };
  // Helper global directo
  global.icon = icon;
  // Alias para la nueva marca
  global.MiBarco = global.MisPliegues;
})(window);


/* ============================================================
   MiBarcoCloud + Autenticación (Supabase)
   - Gate de login obligatorio (estilo dashboard de Lina, branding Paulina)
   - Sincroniza el estado de Mi Barco con la tabla `mi_barco_state`
   - El progreso NO se guarda en localStorage; vive solo en Supabase.
   ============================================================ */
(function (global) {
  'use strict';

  const CFG = global.MI_BARCO_CONFIG || {};
  const SUPABASE_URL = CFG.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = CFG.SUPABASE_ANON_KEY || '';
  const VIDEO_URL = CFG.VIDEO_URL || '';
  const ALLOWED_LEVELS = (CFG.ALLOWED_LEVELS || ['premium', 'vip']).map((s) => String(s).toLowerCase());
  const UPGRADE_URL = CFG.UPGRADE_URL || 'https://www.skool.com/';

  const isConfigured = () =>
    !!SUPABASE_URL && !!SUPABASE_ANON_KEY &&
    !/TU-PROYECTO/.test(SUPABASE_URL) && !/TU_ANON_KEY/.test(SUPABASE_ANON_KEY);

  let sb = null;
  if (global.supabase && isConfigured()) {
    sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
    });
  }

  // ---------- Helpers de DOM ----------
  const $ = (s) => document.querySelector(s);

  function showAlert(id, msg, type = 'error') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = `alert show ${type}`;
  }
  function clearAlert(id) {
    const el = document.getElementById(id);
    if (el) { el.className = 'alert'; el.textContent = ''; }
  }
  function clearAuthAlerts() {
    ['alert-login', 'alert-register', 'alert-forgot', 'alert-reset'].forEach(clearAlert);
  }
  function setLoading(form, on) {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    const sp = btn.querySelector('.spinner');
    const txt = btn.querySelector('.txt');
    btn.disabled = on;
    if (sp) sp.classList.toggle('show', on);
    if (txt) txt.style.opacity = on ? 0.6 : 1;
  }
  function showAuthCard(name) {
    ['login', 'register', 'forgot', 'reset'].forEach((n) => {
      const c = document.getElementById(`card-${n}`);
      if (c) c.style.display = n === name ? 'block' : 'none';
    });
  }
  function initials(name, email) {
    const src = (name || '').trim() || (email || '').trim();
    const parts = src.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (src[0] || '·').toUpperCase();
  }
  function traducirError(msg = '') {
    const m = msg.toLowerCase();
    if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
    if (m.includes('user already registered')) return 'Ya existe una cuenta con ese correo.';
    if (m.includes('password should be')) return 'La contraseña debe tener al menos 8 caracteres.';
    if (m.includes('email rate limit')) return 'Demasiados intentos. Espera unos minutos.';
    if (m.includes('unable to validate email')) return 'Correo inválido.';
    if (m.includes('failed to fetch')) return 'No hay conexión con el servidor. Revisa tu internet.';
    return msg || 'Ocurrió un error. Intenta de nuevo.';
  }
  function notifyToast(message) {
    window.dispatchEvent(new CustomEvent('mibarco:toast', { detail: { message } }));
  }

  // ---------- Sincronización con Supabase ----------
  let _ready = false;
  let _pushTimer = null;
  let _pushing = false;
  let _pendingPush = false;
  // La columna `matriz` llegó después (migración 20261006000001). Si la app
  // se publica antes que la migración, se trabaja sin ella: la Matriz guarda
  // en el navegador y el resto de la app sigue sincronizando como siempre.
  let _hasMatriz = true;
  // Si la lectura inicial falla, NO se escribe: el upsert mandaría el estado
  // vacío y pisaría en la nube todo el progreso real de la usuaria.
  let _readFailed = false;

  const _faltaColumnaMatriz = (err) => !!err &&
    (err.code === '42703' || err.code === 'PGRST204') && /matriz/.test(err.message || '');

  async function hydrate(session) {
    const user = session.user;
    const name = (user.user_metadata && user.user_metadata.full_name) ||
      (user.email || '').split('@')[0] || '';
    MisPliegues.setUserId(user.id);
    let row = null;
    _readFailed = false;
    const leer = (cols) => sb.from('mi_barco_state').select(cols).eq('user_id', user.id).maybeSingle();
    try {
      let res = await leer('rueda,tracker,plan,matriz');
      if (_faltaColumnaMatriz(res.error)) {
        _hasMatriz = false;
        res = await leer('rueda,tracker,plan');
      }
      if (res.error) throw res.error;
      row = res.data;
    } catch (e) {
      console.warn('No se pudo leer el estado de la nube:', e);
      _readFailed = true;
      notifyToast('No pudimos cargar tu progreso. Recarga la página antes de seguir para no perder cambios.');
    }
    MisPliegues.hydrate(row || {}, name);
    _ready = true;
    MiBarcoCloud.ready = true;
    MiBarcoCloud.hasMatriz = _hasMatriz;
  }

  function schedulePush() {
    if (!sb || !_ready || _readFailed) return;
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(flushPush, 600);
  }

  async function flushPush() {
    if (!sb || !_ready || _readFailed) return;
    if (_pushing) { _pendingPush = true; return; }
    const userId = MisPliegues.getUserId();
    if (!userId) return;
    _pushing = true;
    try {
      const payload = Object.assign(
        { user_id: userId, updated_at: new Date().toISOString() },
        MisPliegues.getState()
      );
      if (!_hasMatriz) delete payload.matriz;
      let { error } = await sb.from('mi_barco_state').upsert(payload, { onConflict: 'user_id' });
      if (_faltaColumnaMatriz(error)) {
        _hasMatriz = false;
        MiBarcoCloud.hasMatriz = false;
        delete payload.matriz;
        ({ error } = await sb.from('mi_barco_state').upsert(payload, { onConflict: 'user_id' }));
      }
      if (error) throw error;
    } catch (e) {
      console.error('Error guardando en Supabase:', e);
      notifyToast('No se pudo guardar en la nube. Reintentando…');
      _pendingPush = true;
    } finally {
      _pushing = false;
      if (_pendingPush) { _pendingPush = false; setTimeout(flushPush, 1500); }
    }
  }

  // ---------- Flujos de autenticación ----------
  async function handleLogin(e) {
    e.preventDefault();
    clearAlert('alert-login');
    const f = e.target;
    setLoading(f, true);
    const { email, password } = Object.fromEntries(new FormData(f));
    const { data, error } = await sb.auth.signInWithPassword({
      email: (email || '').trim().toLowerCase(), password
    });
    setLoading(f, false);
    if (error) { showAlert('alert-login', traducirError(error.message)); return; }
    enterApp(data.session);
  }

  async function handleRegister(e) {
    e.preventDefault();
    clearAlert('alert-register');
    const f = e.target;
    setLoading(f, true);
    const { name, email, password } = Object.fromEntries(new FormData(f));
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();
    const { data, error } = await sb.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { full_name: cleanName } }
    });
    if (error) { setLoading(f, false); showAlert('alert-register', traducirError(error.message)); return; }

    // Sin verificación por email: si hay sesión entramos directo; si no, login.
    let session = data.session;
    if (!session) {
      const login = await sb.auth.signInWithPassword({ email: cleanEmail, password });
      if (login.error) {
        setLoading(f, false);
        showAlert('alert-register', 'Cuenta creada. Inicia sesión para continuar.', 'success');
        setTimeout(() => showAuthCard('login'), 1200);
        return;
      }
      session = login.data.session;
    }
    setLoading(f, false);
    enterApp(session);
  }

  async function handleForgot(e) {
    e.preventDefault();
    clearAlert('alert-forgot');
    const f = e.target;
    setLoading(f, true);
    const { email } = Object.fromEntries(new FormData(f));
    const { error } = await sb.auth.resetPasswordForEmail((email || '').trim().toLowerCase(), {
      redirectTo: window.location.origin + window.location.pathname
    });
    setLoading(f, false);
    if (error) { showAlert('alert-forgot', traducirError(error.message)); return; }
    showAlert('alert-forgot', 'Te enviamos un enlace. Revisa tu correo (y spam por si acaso).', 'success');
  }

  async function handleReset(e) {
    e.preventDefault();
    clearAlert('alert-reset');
    const f = e.target;
    const { password, password2 } = Object.fromEntries(new FormData(f));
    if (password !== password2) { showAlert('alert-reset', 'Las contraseñas no coinciden.'); return; }
    setLoading(f, true);
    const { error } = await sb.auth.updateUser({ password });
    setLoading(f, false);
    if (error) { showAlert('alert-reset', traducirError(error.message)); return; }
    showAlert('alert-reset', 'Contraseña actualizada. Iniciando sesión…', 'success');
    setTimeout(async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (session) enterApp(session); else showAuthCard('login');
    }, 900);
  }

  async function doLogout() {
    try { if (sb) await sb.auth.signOut(); } catch (e) { /* noop */ }
    MisPliegues.resetState();
    location.reload();
  }

  // ---------- Gating Skool (Premium / VIP) ----------
  // Lee public.profiles.skool_level. Si está vacío y la usuaria acaba de
  // registrarse, hace polling con backoff (el trigger handle_new_user dispara
  // sync dirigido async; demora ~1-4s sin cold start, hasta ~12s con cold start).
  //
  // Estados que distingue:
  //   'access'    → level válido (en ALLOWED_LEVELS)
  //   'invalid'   → level presente pero no permitido (downgrade explícito)
  //   'pending'   → aún no sincronizado (polling no llegó a synced=true)
  //   'no_member' → sincronizado y NO está en la comunidad
  //   'auth'      → sin sesión válida (token expirado, etc.)
  //   'error'     → red caída u otro fallo
  async function fetchProfileLevel(userId) {
    // Sin fallback a anon: si no hay token de sesión válido, devolver 'auth'
    // para forzar relogueo, no enmascarar como 'sin plan'.
    let session;
    try {
      const sess = await sb.auth.getSession();
      session = sess?.data?.session;
    } catch (e) {
      return { state: 'error', level: null, synced: false };
    }
    if (!session || !session.access_token) {
      return { state: 'auth', level: null, synced: false };
    }
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?select=skool_level,skool_synced_at,is_admin&user_id=eq.${userId}&limit=1`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      if (r.status === 401 || r.status === 403) {
        return { state: 'auth', level: null, synced: false };
      }
      if (!r.ok) {
        return { state: 'error', level: null, synced: false };
      }
      const rows = await r.json();
      const row = rows[0] || {};
      const level = row.skool_level || null;
      const synced = !!row.skool_synced_at;
      const isAdmin = !!row.is_admin;

      // Admins entran inmediatamente, sin esperar sync de Skool ni tener plan.
      if (isAdmin) return { state: 'access', level: level || 'admin', synced: true, isAdmin: true };

      if (!synced) return { state: 'pending', level: null, synced: false };
      if (!level)  return { state: 'no_member', level: null, synced: true };
      if (hasAccess(level)) return { state: 'access', level, synced: true };
      return { state: 'invalid', level, synced: true };
    } catch (e) {
      console.warn('fetchProfileLevel error:', e);
      return { state: 'error', level: null, synced: false };
    }
  }

  function hasAccess(level) {
    if (!level) return false;
    return ALLOWED_LEVELS.includes(String(level).toLowerCase());
  }

  // Polling con backoff. Budget total ~12s para tolerar cold starts.
  // Termina EARLY si el estado es terminal (access, invalid, no_member, auth).
  // Solo sigue polling mientras esté en 'pending' o 'error' transitorio.
  async function resolveLevelWithRetry(userId) {
    const steps = [
      { wait: 0,    label: 'Verificando tu acceso…' },
      { wait: 1200, label: 'Sincronizando con la comunidad…' },
      { wait: 1800, label: 'Sincronizando con la comunidad…' },
      { wait: 2400, label: 'Casi listo…' },
      { wait: 3000, label: 'Último intento…' },
      { wait: 3500, label: 'Último intento…' },
    ];
    let last = { state: 'pending', level: null, synced: false };
    for (const s of steps) {
      if (s.wait) await new Promise((r) => setTimeout(r, s.wait));
      setBlockedStatus(s.label);
      last = await fetchProfileLevel(userId);
      if (last.state === 'access' || last.state === 'invalid' || last.state === 'no_member' || last.state === 'auth') {
        return last;
      }
      // 'pending' o 'error' → seguir intentando
    }
    return last; // mejor esfuerzo
  }

  function setBlockedStatus(text) {
    const el = document.getElementById('blockedStatus');
    if (!el) return;
    el.innerHTML = text ? `<span class="blocked-spinner" aria-hidden="true"></span> ${text}` : '';
  }

  // Wire global de retry/logout. Lo hacemos UNA sola vez al cargar la página
  // para evitar fugas si el usuario hace logout-login y showBlocked corre 2+ veces.
  let _blockedWired = false;
  function wireBlockedHandlers() {
    if (_blockedWired) return;
    _blockedWired = true;
    const retry = document.getElementById('blockedRetry');
    const logout = document.getElementById('blockedLogout');
    if (retry) retry.addEventListener('click', async (e) => {
      e.preventDefault();
      const sess = await sb.auth.getSession();
      const user = sess?.data?.session?.user;
      if (!user) return doLogout(); // sin sesión, mandar al login
      setBlockedStatus('Reintentando sincronización…');
      const res = await resolveLevelWithRetry(user.id);
      if (res.state === 'access') {
        await enterApp(sess.data.session);
      } else {
        showBlocked(user, res);
      }
    });
    if (logout) logout.addEventListener('click', (e) => {
      e.preventDefault();
      doLogout();
    });
  }

  function showBlocked(user, result) {
    // result = { state, level, synced }
    const auth = document.getElementById('view-auth');
    const app = document.getElementById('view-app');
    const blocked = document.getElementById('view-blocked');
    if (auth) auth.style.display = 'none';
    if (app) app.style.display = 'none';
    if (blocked) blocked.style.display = '';
    // Re-mostrar contenido del card (puede estar oculto por showBlockedShell)
    const card = blocked?.querySelector('.blocked-card');
    if (card) {
      card.querySelectorAll('.blocked-title, .blocked-text, .blocked-pill, .blocked-cta, .blocked-secondary')
        .forEach((el) => { el.style.visibility = ''; });
    }

    const name = (user?.user_metadata?.full_name) || (user?.email || '').split('@')[0] || 'amiga';
    const elName = document.getElementById('blockedName');
    if (elName) elName.textContent = name.split(' ')[0];

    const pill = document.getElementById('blockedLevelPill');
    const elLevel = document.getElementById('blockedLevel');
    if (result?.level) {
      if (pill) pill.style.display = '';
      if (elLevel) elLevel.textContent = result.level;
    } else {
      if (pill) pill.style.display = 'none';
    }
    const cta = document.getElementById('blockedCta');
    if (cta) cta.href = UPGRADE_URL;

    // Status según estado
    let status = '';
    if (result?.state === 'auth') status = 'Sesión expirada — vuelve a iniciar sesión.';
    else if (result?.state === 'error') status = 'No pudimos verificar tu acceso. Revisa tu conexión.';
    else if (result?.state === 'pending') status = 'Aún sincronizando con la comunidad…';
    setBlockedStatus(status);

    wireBlockedHandlers();
  }

  // ---------- Cambio de vista ----------
  async function enterApp(session) {
    const user = session.user;
    const name = (user.user_metadata && user.user_metadata.full_name) ||
      (user.email || '').split('@')[0] || '';
    const elName = document.getElementById('userName');
    const elAvatar = document.getElementById('userAvatar');
    if (elName) elName.textContent = name || 'Mi cuenta';
    if (elAvatar) elAvatar.textContent = initials(name, user.email);

    // ───── Gate: verificar plan Skool antes de mostrar la app ─────
    showBlockedShell();
    const res = await resolveLevelWithRetry(user.id);
    if (res.state !== 'access') {
      showBlocked(user, res);
      return;
    }

    const auth = document.getElementById('view-auth');
    const app = document.getElementById('view-app');
    const blocked = document.getElementById('view-blocked');
    if (auth) auth.style.display = 'none';
    if (blocked) blocked.style.display = 'none';
    if (app) app.style.display = '';

    await hydrate(session);
    window.dispatchEvent(new CustomEvent('mibarco:ready'));

    // Re-check al volver del background. Si Paulina cancela el plan de una
    // usuaria y el cron de las 6h lo detecta, en el próximo focus la usuaria
    // ve bloqueo sin esperar al siguiente reload. Lo hacemos una sola vez
    // por sesión (idempotente con visibilityChange).
    if (!_visibilityCheckWired) {
      _visibilityCheckWired = true;
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState !== 'visible') return;
        // Throttle: no re-checkear más de cada 30s
        if (Date.now() - lastCheck < 30_000) return;
        lastCheck = Date.now();
        const r = await fetchProfileLevel(user.id);
        if (r.state === 'access') return; // sigue OK
        if (r.state === 'pending' || r.state === 'error') return; // tolerar
        // Perdió acceso → mostrar bloqueo
        showBlocked(user, r);
      });
    }
  }

  let _visibilityCheckWired = false;

  // Muestra solo el shell del view-blocked (sin contenido) con loader visible
  // mientras corremos el polling. Si pasa el gate, lo ocultamos sin parpadeo.
  function showBlockedShell() {
    const auth = document.getElementById('view-auth');
    const blocked = document.getElementById('view-blocked');
    if (auth) auth.style.display = 'none';
    if (blocked) blocked.style.display = '';
    // Ocultar contenido excepto status mientras verificamos
    const card = blocked?.querySelector('.blocked-card');
    if (card) {
      card.querySelectorAll('.blocked-title, .blocked-text, .blocked-pill, .blocked-cta, .blocked-secondary')
        .forEach((el) => { el.style.visibility = 'hidden'; });
    }
    setBlockedStatus('Verificando tu acceso…');
  }

  // ---------- Video del hero (login) ----------
  function initHeroVideo() {
    const v = document.getElementById('heroVideo');
    if (!v) return;
    if (!VIDEO_URL) { v.remove(); return; } // sin video: queda el fondo gradiente navy/gold
    v.src = VIDEO_URL;
    v.play().catch(() => { /* autoplay bloqueado: el loop arranca con gesto */ });
  }

  // ---------- Toggle mostrar/ocultar contraseña ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pwd-toggle]');
    if (!btn) return;
    const wrap = btn.closest('.pwd-wrap');
    if (!wrap) return;
    const input = wrap.querySelector('input');
    if (!input) return;
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    btn.classList.toggle('is-visible', !visible);
    btn.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });

  // ---------- API pública ----------
  const MiBarcoCloud = {
    ready: false,
    hasMatriz: true,
    schedulePush,
    flushPush,
    hydrate,
    logout: doLogout,
    getClient: () => sb,
    isConfigured
  };
  global.MiBarcoCloud = MiBarcoCloud;

  // ---------- Arranque ----------
  document.addEventListener('DOMContentLoaded', async () => {
    initHeroVideo();

    // Navegación entre tarjetas de auth (data-nav="login|register|forgot")
    document.body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-nav]');
      if (a) { e.preventDefault(); clearAuthAlerts(); showAuthCard(a.dataset.nav); }
    });

    // Envío de formularios
    const fl = $('#form-login'); if (fl) fl.addEventListener('submit', handleLogin);
    const fr = $('#form-register'); if (fr) fr.addEventListener('submit', handleRegister);
    const ff = $('#form-forgot'); if (ff) ff.addEventListener('submit', handleForgot);
    const frs = $('#form-reset'); if (frs) frs.addEventListener('submit', handleReset);

    // Menú de cuenta (chip + cerrar sesión)
    const chip = $('#userChip');
    if (chip) chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = $('#userMenu'); if (m) m.classList.toggle('show');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-chip-wrap')) {
        const m = $('#userMenu'); if (m) m.classList.remove('show');
      }
    });
    const lo = $('#btnLogout'); if (lo) lo.addEventListener('click', doLogout);

    const boot = document.getElementById('boot');

    // Supabase sin configurar: mostramos login con aviso claro.
    if (!sb) {
      showAuthCard('login');
      showAlert('alert-login', '⚙️ Falta configurar Supabase en app.js (SUPABASE_URL y anon key).');
      if (boot) boot.classList.add('hide');
      return;
    }

    // Flujo de recuperación de contraseña (Supabase redirige con token en la URL)
    const hash = window.location.hash || '';
    const isRecovery = hash.includes('type=recovery') ||
      new URL(window.location.href).searchParams.get('type') === 'recovery';

    sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        const auth = document.getElementById('view-auth');
        const app = document.getElementById('view-app');
        if (auth) auth.style.display = '';
        if (app) app.style.display = 'none';
        showAuthCard('reset');
        if (boot) boot.classList.add('hide');
      }
    });

    const { data: { session } } = await sb.auth.getSession();
    if (isRecovery) {
      showAuthCard('reset');
    } else if (session) {
      await enterApp(session);
    } else {
      showAuthCard('login');
    }
    if (boot) setTimeout(() => boot.classList.add('hide'), 200);
  });
})(window);


/* ============================================================
   Matriz de Urgencia e Importancia dentro de Mi Barco
   - Misma lógica que la página pública matriz-urgencia-importancia.html
     (criterio del Paso 3 incluido). Si se recalibra allá, se copia aquí.
   - Clases y ids con prefijo mz- para no chocar con los pv- de Mi Barco.
   - Guarda en mi_barco_state.matriz vía MisPliegues.save('matriz').
   ============================================================ */
(function (global) {
  'use strict';
  var STORAGE_KEY = 'pv_matriz_urgencia_v2';
  var LEGACY_KEY  = 'pv_matriz_urgencia_v1';

  /**
   * @type {{id:string, text:string, quad:'q1'|'q2'|'q3'|'q4'|null,
   *         answers:{due:string, cost:string, align:string}|null,
   *         done:boolean, doneAt:number|null}[]}
   */
  var tasks = [];
  var root = null;          // contenedor .mz dentro de Mi Barco
  var guardado = '';        // última versión escrita (evita upserts sin cambios)
  var importadas = 0;       // tareas traídas de la página pública en esta carga
  var selectedId = null;   // tarea en modo "la ubico yo a mano"
  var wizardId   = null;   // tarea abierta en el asistente de criterio
  var doneExpanded = false; // lista de completadas desplegada
  var DONE_PREVIEW = 5;     // cuántas completadas se ven antes de plegar el resto

  var QUAD_LABEL = { q1: 'Hazlo ahora', q2: 'Prográmalo', q3: 'Delégalo', q4: 'Elimínalo' };
  var QUAD_TAG   = {
    q1: 'Urgente · Importante', q2: 'No urgente · Importante',
    q3: 'Urgente · No importante', q4: 'No urgente · No importante'
  };

  /* ==========================================================================
     CRITERIOS DE SUGERENCIA — PROVISIONALES
     --------------------------------------------------------------------------
     Este es el ÚNICO bloque con lógica de criterio. Cuando Paulina nos pase su
     metodología, se recalibra la herramienta entera cambiando aquí: los textos
     de las preguntas, las opciones, sus puntajes y los dos umbrales. Nada de
     esto está repartido por el resto del archivo, a propósito.
     ========================================================================== */
  var QUESTIONS = [
    {
      key: 'due',
      title: '¿Para cuándo tiene que estar lista?',
      hint: 'La fecha real, no la que te gustaría.',
      options: [
        { v: 'hoy',    label: 'Hoy o mañana',   score: 3 },
        { v: 'semana', label: 'Esta semana',    score: 2 },
        { v: 'mes',    label: 'Este mes',       score: 1 },
        { v: 'nunca',  label: 'No tiene fecha', score: 0 }
      ]
    },
    {
      key: 'cost',
      title: 'Si no la haces tú, ¿qué pasa de verdad?',
      hint: 'La consecuencia concreta, no la culpa que sentirías.',
      options: [
        { v: 'alta',  label: 'Hay un costo real: dinero, salud o alguien que cuenta conmigo', score: 3 },
        { v: 'media', label: 'Se complica un poco, pero se resuelve',                          score: 1.5 },
        { v: 'otro',  label: 'Alguien más lo puede hacer, no depende de mí',                   score: 1.5 },
        { v: 'baja',  label: 'La verdad, no pasa nada',                                        score: 0 }
      ]
    },
    {
      key: 'align',
      title: '¿Esto te acerca a la vida que quieres construir?',
      hint: 'Aquí no importa el reloj: importa hacia dónde te mueve.',
      options: [
        { v: 'mucho', label: 'Sí, es de lo que más me mueve hacia allá', score: 3 },
        { v: 'algo',  label: 'Un poco: ayuda, pero no es clave',         score: 1.5 },
        { v: 'nada',  label: 'No, esto es de la agenda de alguien más',  score: 0 }
      ]
    }
  ];

  var URGENT_MIN    = 2;   // desde qué puntaje de plazo se considera urgente
  var IMPORTANT_MIN = 2;   // desde qué puntaje se considera importante

  function scoreOf(key, value) {
    var q = QUESTIONS.filter(function (x) { return x.key === key; })[0];
    if (!q) return 0;
    var opt = q.options.filter(function (o) { return o.v === value; })[0];
    return opt ? opt.score : 0;
  }

  // Importancia = el mayor de los dos ejes, no su promedio: pagar impuestos no
  // te acerca a la vida que quieres y aun así es importante (tiene costo real),
  // y meditar no tiene costo si no lo haces y aun así construye.
  function importanceOf(a) {
    var cost = scoreOf('cost', a.cost), align = scoreOf('align', a.align);
    // El eje fuerte manda (pagar impuestos importa aunque no te acerque a nada),
    // pero el otro suma un poco: dos respuestas medias no pueden acabar en
    // "Elimínalo", que es el consejo más difícil de deshacer.
    return Math.max(cost, align) + Math.min(cost, align) * 0.4;
  }

  function isComplete(a) {
    return !!(a && a.due && a.cost && a.align);
  }

  // "Delégalo" solo tiene sentido si la tarea PUEDE salir de tus manos. Antes,
  // todo lo urgente y poco importante caía ahí — incluso lo que depende 100% de
  // ti, que es indelegable por definición. Ahora hace falta decirlo de forma
  // explícita en la pregunta 2, y lo indelegable se programa en vez de delegarse.
  function isDelegable(a) { return a.cost === 'otro'; }

  function suggestQuad(a) {
    var urgent    = scoreOf('due', a.due) >= URGENT_MIN;
    var important = importanceOf(a) >= IMPORTANT_MIN;

    // Marcar "alguien más puede hacerlo" ya afirma que la tarea hay que hacerla.
    // Solo se descarta si además no aporta nada y no corre el reloj.
    if (isDelegable(a)) return (urgent || a.align !== 'nada') ? 'q3' : 'q4';

    if (urgent && important) return 'q1';
    if (important)           return 'q2';
    return urgent ? 'q2' : 'q4';   // urgente pero solo tú: se agenda, no se delega
  }

  function suggestWhy(quad, a) {
    // Caso propio: corre el reloj, no es de lo importante, y solo tú puedes hacerla.
    if (quad === 'q2' && scoreOf('due', a.due) >= URGENT_MIN) {
      return 'Corre el reloj y solo tú puedes hacerla, así que delegarla no es una opción. Dale un hueco concreto en la agenda y sácala de en medio, sin que desplace lo importante.';
    }

    var base = {
      q1: 'Tiene una fecha real encima y un costo concreto si no pasa. Es de las pocas cosas que sí van hoy.',
      q2: 'El reloj no te está apretando, pero esto es de lo que construye la vida que quieres. Si no le pones fecha tú, tarde o temprano se te vuelve urgencia.',
      q3: 'Marcaste que alguien más puede hacerla, y ese es justo el criterio de este cuadrante: puede importar, pero no tiene que salir de tus manos.',
      q4: 'Ni corre el reloj ni cambia nada si desaparece de la lista. Puedes soltarla sin culpa.'
    }[quad];

    var extra = '';
    if (quad === 'q1' && a.align === 'nada') {
      extra = ' Ojo: dijiste que no te acerca a donde vas. Hazla porque hay un costo real, no porque te la pidieron.';
    } else if (quad === 'q2' && a.due === 'nunca') {
      extra = ' Como no tiene fecha, ponle una tú ahora mismo: sin fecha, esto no se hace nunca.';
    } else if (quad === 'q3' && a.align === 'mucho') {
      extra = ' Y aunque te acerque a donde vas, soltarla es lo que te deja tiempo para la parte que sí depende de ti.';
    } else if (quad === 'q4' && a.due !== 'nunca') {
      extra = ' Tiene fecha, pero nada cambia si no pasa. Esa fecha te la pusiste tú.';
    }
    return base + extra;
  }

  /* ========================== Persistencia ========================== */
  function normalize(t) {
    return {
      id: t.id,
      text: t.text,
      quad: t.quad || null,
      answers: t.answers || null,
      done: !!t.done,
      doneAt: t.doneAt || null
    };
  }

  // Lo que la página pública de la Matriz guardó en ESTE navegador (mismo
  // dominio, así que su localStorage es visible desde aquí).
  function leerLocal() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(LEGACY_KEY); // migración desde v1
      return raw ? JSON.parse(raw).map(normalize) : [];
    } catch (e) { return []; }
  }
  function sinColumnaEnLaNube() {
    return !!(global.MiBarcoCloud && global.MiBarcoCloud.hasMatriz === false);
  }

  // Dentro de Mi Barco las tareas viven en la cuenta (mi_barco_state.matriz).
  // La primera vez que se abre, si la cuenta aún no tiene Matriz, se traen las
  // tareas que la persona ya tenía en la página pública. No se borran de allá:
  // la página pública sigue siendo una herramienta aparte.
  function load() {
    importadas = 0;
    if (sinColumnaEnLaNube()) { tasks = leerLocal(); guardado = JSON.stringify(tasks); return; }
    var nube = MisPliegues.load('matriz', null);
    if (nube && Array.isArray(nube.tasks)) {
      tasks = nube.tasks.map(normalize);
      guardado = JSON.stringify(tasks);
      return;
    }
    tasks = leerLocal();
    importadas = tasks.length;
    guardado = importadas ? '' : JSON.stringify(tasks);   // si trajo algo, se sube
  }
  // render() llama a save() siempre; solo se escribe cuando las tareas cambian,
  // para no mandar un upsert a Supabase por abrir un desplegable.
  function save() {
    var json = JSON.stringify(tasks);
    if (json === guardado) return;
    guardado = json;
    if (sinColumnaEnLaNube()) {
      try { localStorage.setItem(STORAGE_KEY, json); } catch (e) {}
      return;
    }
    MisPliegues.save('matriz', { tasks: tasks });
  }
  function uid() { return 't' + Math.random().toString(36).slice(2, 10); }
  function byId(id) { return tasks.filter(function (t) { return t.id === id; })[0]; }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function agoLabel(ts) {
    if (!ts) return '';
    var days = Math.floor((Date.now() - ts) / 86400000);
    if (days <= 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 7) return 'hace ' + days + ' días';
    if (days < 14) return 'hace una semana';
    if (days < 31) return 'hace ' + Math.floor(days / 7) + ' semanas';
    return 'hace más de un mes';
  }

  /* ========================== Render ========================== */
  function render() {
    renderDump();
    renderUnsorted();
    renderWizard();
    renderQuadrants();
    renderDone();
    renderDiagnostic();
    renderImportNote();
    save();
  }

  function renderImportNote() {
    var note = document.getElementById('mzImportNote');
    if (!note) return;
    if (importadas > 0) {
      note.style.display = 'block';
      note.textContent = importadas === 1
        ? 'Trajimos la tarea que tenías en la Matriz de este navegador. Desde ahora se guarda en tu cuenta.'
        : 'Trajimos las ' + importadas + ' tareas que tenías en la Matriz de este navegador. Desde ahora se guardan en tu cuenta.';
    } else {
      note.style.display = 'none';
    }
  }

  // ---- Paso 1: lista de lo que sigue abierto (las completadas viven abajo) ----
  function renderDump() {
    var list  = document.getElementById('mzDumpList');
    var empty = document.getElementById('mzDumpEmpty');
    var open  = tasks.filter(function (t) { return !t.done; });
    list.innerHTML = '';
    if (open.length === 0) {
      empty.style.display = 'block';
      empty.textContent = tasks.length
        ? 'Vaciaste la lista: todo lo que agregaste ya está en Completadas.'
        : 'Todavía no has agregado nada. Empieza escribiendo arriba y no te detengas a pensar si es importante o no.';
      return;
    }
    empty.style.display = 'none';
    open.forEach(function (t) {
      var chip = document.createElement('span');
      chip.className = 'mz-chip';
      chip.style.cursor = 'default';
      var tag = t.quad ? ' · ' + QUAD_LABEL[t.quad] : '';
      chip.innerHTML =
        '<span class="mz-chip__label">' + escapeHtml(t.text) +
        '<span style="color:var(--pv-ink-soft);font-weight:600;">' + tag + '</span></span>' +
        '<button type="button" class="mz-chip__del" data-del="' + t.id + '" aria-label="Eliminar tarea">✕</button>';
      list.appendChild(chip);
    });
  }

  // ---- Paso 3: bandeja de sin-clasificar ----
  function renderUnsorted() {
    var list  = document.getElementById('mzUnsortedList');
    var empty = document.getElementById('mzUnsortedEmpty');
    var label = document.getElementById('mzUnsortedLabel');
    var open     = tasks.filter(function (t) { return !t.done; });
    var unsorted = open.filter(function (t) { return !t.quad; });

    list.innerHTML = '';
    if (open.length === 0) {
      empty.style.display = 'block';
      empty.textContent = 'Agrega tareas en el Paso 1 para empezar a ubicarlas aquí.';
      label.style.display = 'none';
      return;
    }
    label.style.display = 'block';
    if (unsorted.length === 0) {
      empty.style.display = 'block';
      empty.textContent = '¡Ya ubicaste todas tus tareas! Revisa el diagnóstico más abajo.';
      return;
    }
    empty.style.display = 'none';
    unsorted.forEach(function (t) {
      var chip = document.createElement('span');
      var on = (t.id === selectedId || t.id === wizardId);
      chip.className = 'mz-chip' + (on ? ' is-selected' : '');
      chip.setAttribute('data-select', t.id);
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.innerHTML = '<span class="mz-chip__label">' + escapeHtml(t.text) + '</span>';
      list.appendChild(chip);
    });
  }

  // ---- Paso 3: asistente de criterio ----
  function renderWizard() {
    var box  = document.getElementById('mzWizard');
    var hint = document.getElementById('mzManualHint');
    var t = wizardId ? byId(wizardId) : null;

    hint.style.display = (selectedId && !wizardId) ? 'block' : 'none';

    if (!t || t.done || t.quad) { box.style.display = 'none'; box.innerHTML = ''; wizardId = null; return; }
    box.style.display = 'block';

    var a = t.answers || {};
    var html =
      '<div class="mz-wizard__head">' +
        '<span>' +
          '<span class="mz-wizard__eyebrow">Ayúdame a ubicarla</span>' +
          '<span class="mz-wizard__task">' + escapeHtml(t.text) + '</span>' +
        '</span>' +
        '<button type="button" class="mz-wizard__close" data-wizard-close aria-label="Cerrar">✕</button>' +
      '</div>';

    QUESTIONS.forEach(function (q, i) {
      html +=
        '<div class="mz-wizard__q">' +
          '<p class="mz-wizard__qtitle">' + (i + 1) + ' · ' + q.title + '</p>' +
          '<p class="mz-wizard__qhint">' + q.hint + '</p>' +
          '<div class="mz-wizard__opts">' +
            q.options.map(function (o) {
              return '<button type="button" class="mz-opt' + (a[q.key] === o.v ? ' is-on' : '') +
                     '" data-q="' + q.key + '" data-v="' + o.v + '">' + o.label + '</button>';
            }).join('') +
          '</div>' +
        '</div>';
    });

    if (isComplete(a)) {
      var quad = suggestQuad(a);
      html +=
        '<div class="mz-wizard__result">' +
          '<span class="mz-quad-action mz-badge--' + quad + '">' + QUAD_TAG[quad] + '</span>' +
          '<p class="mz-wizard__verdict">Va en «' + QUAD_LABEL[quad] + '»</p>' +
          '<p class="mz-wizard__why">' + suggestWhy(quad, a) + '</p>' +
          '<div class="mz-wizard__cta">' +
            '<button type="button" class="mz-btn" data-accept="' + quad + '">Ubicarla ahí</button>' +
            '<button type="button" class="mz-btn-outline-navy" data-manual>Prefiero elegir yo</button>' +
          '</div>' +
        '</div>';
    } else {
      html += '<p class="mz-wizard__pending">Responde las tres y te digo en qué cuadrante va y por qué.</p>';
    }

    box.innerHTML = html;
  }

  // ---- Paso 3: cuadrantes ----
  function renderQuadrants() {
    ['q1', 'q2', 'q3', 'q4'].forEach(function (q) {
      var listEl  = root.querySelector('[data-list="' + q + '"]');
      var emptyEl = root.querySelector('[data-empty="' + q + '"]');
      var items = tasks.filter(function (t) { return t.quad === q && !t.done; });
      listEl.innerHTML = '';
      emptyEl.style.display = items.length ? 'none' : 'block';
      items.forEach(function (t) {
        var note = '';
        if (isComplete(t.answers)) {
          var sug = suggestQuad(t.answers);
          if (sug !== t.quad) {
            note = '<span class="mz-task-suggest">Por tus respuestas iría en «' + QUAD_LABEL[sug] + '»</span>';
          }
        }
        var row = document.createElement('div');
        row.className = 'mz-task-in-quad';
        row.innerHTML =
          '<button type="button" class="mz-check" data-done="' + t.id + '" title="Marcar como hecha" aria-label="Marcar como hecha">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' +
          '</button>' +
          '<span style="flex:1;">' + escapeHtml(t.text) + note + '</span>' +
          '<button type="button" data-unassign="' + t.id + '" title="Quitar de este cuadrante">↩</button>';
        listEl.appendChild(row);
      });
    });
  }

  // ---- Completadas ----
  function renderDone() {
    var section = document.getElementById('mzDoneSection');
    var list    = document.getElementById('mzDoneList');
    var count   = document.getElementById('mzDoneCount');
    var done = tasks.filter(function (t) { return t.done; })
                    .sort(function (x, y) { return (y.doneAt || 0) - (x.doneAt || 0); });

    if (done.length === 0) { section.style.display = 'none'; doneExpanded = false; return; }
    section.style.display = 'block';
    count.textContent = done.length === 1 ? '1 tarea cerrada' : done.length + ' tareas cerradas';

    // No se borra nada solo: si son muchas, se pliegan. Ver el avance es parte
    // del método; perderlo sin pedirlo, no.
    var hidden = 0;
    var visible = done;
    if (!doneExpanded && done.length > DONE_PREVIEW) {
      visible = done.slice(0, DONE_PREVIEW);
      hidden = done.length - DONE_PREVIEW;
    }

    list.innerHTML = '';
    visible.forEach(function (t) {
      var meta = [t.quad ? QUAD_LABEL[t.quad] : 'Sin clasificar', agoLabel(t.doneAt)]
                 .filter(Boolean).join(' · ');
      var row = document.createElement('div');
      row.className = 'mz-done-row';
      row.innerHTML =
        '<span class="mz-done-mark"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>' +
        '<span class="mz-done-row__body">' +
          '<span class="mz-done-row__text">' + escapeHtml(t.text) + '</span>' +
          '<span class="mz-done-row__meta">' + meta + '</span>' +
        '</span>' +
        '<button type="button" class="mz-done-row__btn" data-undone="' + t.id + '" title="Devolver a la matriz">↩</button>' +
        '<button type="button" class="mz-done-row__btn" data-del-done="' + t.id + '" title="Eliminar definitivamente">✕</button>';
      list.appendChild(row);
    });

    if (hidden > 0 || doneExpanded) {
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'mz-done-toggle';
      toggle.setAttribute('data-done-toggle', '');
      toggle.textContent = doneExpanded
        ? 'Ver menos'
        : 'Ver las ' + hidden + (hidden === 1 ? ' anterior' : ' anteriores');
      list.appendChild(toggle);
    }
  }

  // ---- Diagnóstico ----
  function renderDiagnostic() {
    var section = document.getElementById('mzDiagSection');
    var alertEl = document.getElementById('mzDiagAlert');
    var placed = tasks.filter(function (t) { return t.quad && !t.done; });
    if (placed.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';

    var counts = { q1: 0, q2: 0, q3: 0, q4: 0 };
    placed.forEach(function (t) { counts[t.quad]++; });
    document.getElementById('mzCountQ1').textContent = counts.q1;
    document.getElementById('mzCountQ2').textContent = counts.q2;
    document.getElementById('mzCountQ3').textContent = counts.q3;
    document.getElementById('mzCountQ4').textContent = counts.q4;

    var msg;
    if (counts.q1 > 0) {
      msg = 'Tienes ' + counts.q1 + (counts.q1 === 1 ? ' tarea urgente e importante' : ' tareas urgentes e importantes') +
            '. Empieza por ahí: es lo que no puede esperar.';
    } else if (counts.q2 > 0) {
      msg = 'No tienes urgencias activas ahora mismo. Aprovecha para agendar tus ' + counts.q2 +
            (counts.q2 === 1 ? ' tarea de "Prográmalo"' : ' tareas de "Prográmalo"') +
            '. Ahí es donde se construye lo importante, antes de que se vuelva urgente.';
    } else if (counts.q3 + counts.q4 > 0) {
      msg = 'Lo que has ubicado hasta ahora no es ni urgente ni clave para tus objetivos. Antes de ejecutarlo, pregúntate qué se puede delegar o soltar.';
    } else {
      msg = 'Sigue ubicando tus tareas para ver el diagnóstico completo.';
    }
    document.getElementById('mzDiagMessage').textContent = msg;

    // Dos señales, una a la vez para no hacer ruido. La saturación de "Hazlo
    // ahora" manda, porque es el error que trae a la gente a la matriz; si no
    // está, revisamos el cuadrante donde vive lo que la persona quiere construir.
    if (placed.length >= 4 && counts.q1 / placed.length >= 0.5) {
      alertEl.style.display = 'block';
      alertEl.innerHTML =
        'Marcaste <strong>' + counts.q1 + ' de ' + placed.length + '</strong> como urgente e importante. ' +
        'Cuando casi todo cae en el mismo cuadrante, rara vez es que todo sea urgente: es que la urgencia se está midiendo ' +
        'con la sensación y no con la consecuencia. Vuelve sobre esas tareas y quédate solo con las que tienen una fecha que no te pusiste tú.';
    } else if (placed.length >= 4 && counts.q2 === 0) {
      alertEl.style.display = 'block';
      alertEl.innerHTML =
        'De las ' + placed.length + ' tareas que ubicaste, <strong>ninguna quedó en «Prográmalo»</strong>. ' +
        'Ese es el cuadrante donde vive lo que quieres construir. Si está vacío, tu semana entera es responder a lo urgente ' +
        'y a la agenda de otros. Busca una, solo una, que sea tuya.';
    } else {
      alertEl.style.display = 'none';
    }
  }

  /* ========================== Acciones ========================== */
  function assign(id, quad) {
    var t = byId(id);
    if (!t) return;
    t.quad = quad;
    selectedId = null;
    wizardId = null;
    render();
  }
  function markDone(id) {
    var t = byId(id);
    if (!t) return;
    t.done = true;
    t.doneAt = Date.now();
    if (selectedId === id) selectedId = null;
    if (wizardId === id) wizardId = null;
    render();
  }

  /* ========================== Eventos ========================== */
  function bindEvents() {
    document.getElementById('mzDumpForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('mzDumpInput');
      var val = input.value.trim();
      if (!val) return;
      tasks.push({ id: uid(), text: val, quad: null, answers: null, done: false, doneAt: null });
      input.value = '';
      render();
      input.focus();
    });

    document.getElementById('mzDumpList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-del]');
      if (!btn) return;
      var id = btn.getAttribute('data-del');
      tasks = tasks.filter(function (t) { return t.id !== id; });
      if (selectedId === id) selectedId = null;
      if (wizardId === id) wizardId = null;
      render();
    });

    // Tocar una tarea sin clasificar abre el asistente de criterio.
    document.getElementById('mzUnsortedList').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-select]');
      if (!chip) return;
      var id = chip.getAttribute('data-select');
      wizardId = (wizardId === id) ? null : id;
      selectedId = null;
      render();
    });

    document.getElementById('mzWizard').addEventListener('click', function (e) {
      var t = wizardId ? byId(wizardId) : null;
      if (!t) return;

      if (e.target.closest('[data-wizard-close]')) { wizardId = null; render(); return; }

      var opt = e.target.closest('[data-q]');
      if (opt) {
        t.answers = t.answers || {};
        t.answers[opt.getAttribute('data-q')] = opt.getAttribute('data-v');
        render();
        return;
      }

      var accept = e.target.closest('[data-accept]');
      if (accept) { assign(t.id, accept.getAttribute('data-accept')); return; }

      if (e.target.closest('[data-manual]')) {
        selectedId = t.id;
        wizardId = null;
        render();
      }
    });

    root.querySelectorAll('.mz-quad').forEach(function (quadEl) {
      quadEl.addEventListener('click', function (e) {
        var doneBtn = e.target.closest('[data-done]');
        if (doneBtn) { markDone(doneBtn.getAttribute('data-done')); return; }

        var unBtn = e.target.closest('[data-unassign]');
        if (unBtn) {
          var t = byId(unBtn.getAttribute('data-unassign'));
          if (t) t.quad = null;
          render();
          return;
        }

        if (!selectedId) {
          quadEl.classList.add('is-target');
          setTimeout(function () { quadEl.classList.remove('is-target'); }, 260);
          return;
        }
        assign(selectedId, quadEl.getAttribute('data-quad'));
      });
    });

    document.getElementById('mzDoneList').addEventListener('click', function (e) {
      var undo = e.target.closest('[data-undone]');
      if (undo) {
        var t = byId(undo.getAttribute('data-undone'));
        if (t) { t.done = false; t.doneAt = null; }
        render();
        return;
      }
      if (e.target.closest('[data-done-toggle]')) {
        doneExpanded = !doneExpanded;
        render();
        return;
      }
      var del = e.target.closest('[data-del-done]');
      if (del) {
        var id = del.getAttribute('data-del-done');
        tasks = tasks.filter(function (x) { return x.id !== id; });
        render();
      }
    });

    document.getElementById('mzClearDoneBtn').addEventListener('click', function () {
      var done = tasks.filter(function (t) { return t.done; });
      if (done.length === 0) return;
      if (!confirm('¿Borrar definitivamente las ' + done.length + ' tareas completadas? Lo que sigue abierto no se toca.')) return;
      tasks = tasks.filter(function (t) { return !t.done; });
      render();
    });

    document.getElementById('mzResetBtn').addEventListener('click', function () {
      if (tasks.length === 0) return;
      if (!confirm('Esto borra TODO: las tareas abiertas y también las completadas. Si solo quieres sacarte de encima lo ya hecho, usa «Limpiar completadas». ¿Reiniciar de todos modos?')) return;
      tasks = [];
      selectedId = null;
      wizardId = null;
      doneExpanded = false;
      render();
    });
  }

  /* ========================== Arranque ========================== */
  var listo = false;
  function init() {
    root = document.getElementById('mz-root');
    if (!root || listo) return;
    listo = true;
    bindEvents();
  }

  // Se recarga desde la cuenta cada vez que la nube termina de hidratar.
  var pintado = false;
  function sync() {
    init();
    if (!root) return;
    pintado = true;
    selectedId = null;
    wizardId = null;
    load();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
  global.addEventListener('mibarco:ready', sync);

  global.MatrizMiBarco = {
    // Al entrar a la pestaña: si la nube ya hidrató pero aún no se pintó, pinta.
    open: function () { if (!pintado && global.MiBarcoCloud && global.MiBarcoCloud.ready) sync(); }
  };
})(window);
