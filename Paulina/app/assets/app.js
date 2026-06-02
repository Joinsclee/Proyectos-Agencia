/* ========================================
   Mi Barco — Lógica compartida
   Sistema de hábitos de Paulina Valencia
   Basado en los libros "No eres tú, son tus hábitos" y "Hábitos con cerebro"
   ======================================== */

(function (global) {
  'use strict';

  const STORAGE_PREFIX = 'mi_barco_v2';

  // ----- Identidad de usuario -----
  function getUserId() {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');
    if (emailParam) return emailParam.trim().toLowerCase();

    let anon = localStorage.getItem(`${STORAGE_PREFIX}__anon_id`);
    if (!anon) {
      anon = 'anon_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(`${STORAGE_PREFIX}__anon_id`, anon);
    }
    return anon;
  }

  function getUserName() {
    const params = new URLSearchParams(window.location.search);
    const nameParam = params.get('name');
    if (nameParam) return nameParam.trim();
    return localStorage.getItem(`${STORAGE_PREFIX}__name`) || '';
  }

  function setUserName(name) {
    if (name) localStorage.setItem(`${STORAGE_PREFIX}__name`, name);
  }

  function storageKey(scope) {
    return `${STORAGE_PREFIX}__${getUserId()}__${scope}`;
  }

  function load(scope, fallback) {
    try {
      const raw = localStorage.getItem(storageKey(scope));
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('Error leyendo storage:', e);
      return fallback;
    }
  }

  function save(scope, data) {
    try {
      localStorage.setItem(storageKey(scope), JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Error guardando en storage:', e);
      return false;
    }
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
            habitoSugerido: 'Cuenta 5-4-3-2-1 antes de [acción]'
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
            habitoSugerido: '[Acción] después de [contexto]'
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
            habitoSugerido: '[Qué] – [Cuándo]'
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
            habitoSugerido: '[Hábito] (señal: [objeto] en [lugar])'
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
            habitoSugerido: '[Hábito nuevo] después de [hábito viejo]'
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
            habitoSugerido: 'Compromiso con [partner]: [compromiso]'
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
            habitoSugerido: '[Versión absurda]'
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
            habitoSugerido: '[Hábito]'
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
            habitoSugerido: '[Habito 50%]'
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
          ejemploPractico: 'Quieres convertirte en una buena lectora. Leer una página no te convierte inmediatamente en lectora, pero sí representa un voto a favor de esa identidad.',
          formularioAplicacion: {
            descripcion: 'Define tu identidad y el voto de hoy:',
            campos: [
              { id: 'identidad', label: '¿Qué identidad quieres construir?', placeholder: 'Ej: Una persona consistente con el ejercicio', tipo: 'text' },
              { id: 'voto', label: '¿Qué acción pequeña será un voto a favor de esa identidad?', placeholder: 'Ej: Salir a caminar 10 min cada mañana', tipo: 'text' }
            ],
            habitoSugerido: '[Voto] (voto por: [identidad])'
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
            habitoSugerido: 'Repetir narrativa nueva diariamente: "[Narrativa nueva]"'
          }
        },
        {
          id: 'elige_referente',
          nombre: 'Elige un referente',
          autor: 'Albert Bandura',
          explicacion: 'Cuando no sabes qué hacer, puedes apoyarte en alguien que ya representa la persona que quieres ser. Un referente funciona como una brújula. Ante una situación difícil, pregúntate: ¿qué haría mi referente si estuviera en mi lugar?',
          fundamentoCientifico: 'Basada en el aprendizaje observacional de Albert Bandura. Los seres humanos aprendemos observando comportamientos, estrategias y modelos que admiramos. Tener un referente facilita la adopción de nuevas conductas porque le proporciona al cerebro un ejemplo concreto.',
          comoAplicarlo: 'Elige una persona que represente la identidad que quieres construir. Puede ser alguien cercano, una figura pública o incluso un personaje histórico. Ante una decisión importante, pregúntate: ¿qué haría esta persona en mi lugar? Actúa de acuerdo con la respuesta.',
          ejemploPractico: 'Quieres ser más disciplinada con el ejercicio. Cuando aparezca la tentación de saltártelo: ¿qué haría mi referente? Actúa desde esa identidad, no desde la emoción del momento.',
          formularioAplicacion: {
            descripcion: 'Elige tu referente y la pregunta clave:',
            campos: [
              { id: 'referente', label: '¿Quién es tu referente?', placeholder: 'Ej: Mi tía María, que lleva años entrenando', tipo: 'text' },
              { id: 'por_que', label: '¿Por qué la elegiste? ¿Qué representa?', placeholder: 'Ej: Consistencia y disciplina sin perder la calma', tipo: 'textarea' },
              { id: 'pregunta', label: 'Pregunta clave que te harás en momentos difíciles', placeholder: 'Ej: ¿Qué haría María si estuviera en mi lugar?', tipo: 'text' }
            ],
            habitoSugerido: 'Preguntarme: "[Pregunta clave]"'
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
      promedio: ruedaAnterior.pilares.reduce((acc, p) => acc + p.valor, 0) / ruedaAnterior.pilares.length
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
    PILARES_DEFAULT, NEUROPLIEGUES, OBSTACULOS, ICONS, icon,
    getRueda, saveRueda, getPilarMasBajo, getPromedioRueda,
    getTracker, saveTracker, getMesActual, getDiasDelMes, getDiaActual,
    agregarHabito, eliminarHabito, marcarDia, getEstadoDia, getResumenMes,
    getPlan, savePlan, agregarHerramientaAlPlan, quitarHerramientaDelPlan, estaEnPlan,
    findNeuropliegue, findHerramienta
  };
  // Helper global directo
  global.icon = icon;
  // Alias para la nueva marca
  global.MiBarco = global.MisPliegues;
})(window);
