/**
 * Tests del planificador. Lo que se prueba aquí es la decisión de "¿le toca?",
 * que es donde un error se traduce en que el radar deje de actualizarse en
 * silencio — o en que se scrapee de más y se queme la cuota de Firecrawl.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toca,
  tomarCerrojoCon,
  soltarCerrojoCon,
  crearRevisionSerializada,
  subtareasCaidas,
  type ActualizarCerrojo,
  type LiberarCerrojo,
} from './scheduler.js';

const AHORA = new Date('2026-07-20T12:00:00Z');
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000).toISOString();
const job = (o: Partial<Parameters<typeof toca>[0]> = {}) => ({
  nombre: 'x', cadencia_dias: 7, habilitado: true,
  ultima_corrida: null, corriendo_desde: null, ...o,
}) as Parameters<typeof toca>[0];

test('cron: si nunca ha corrido, toca', () => {
  assert.ok(toca(job({ ultima_corrida: null }), AHORA));
});

test('cron: respeta la cadencia de 7 días', () => {
  assert.ok(!toca(job({ ultima_corrida: haceDias(6) }), AHORA));
  assert.ok(toca(job({ ultima_corrida: haceDias(7) }), AHORA));
  assert.ok(toca(job({ ultima_corrida: haceDias(9) }), AHORA));
});

test('cron: los bancos se verifican cada 7 días', () => {
  const bancos = job({ nombre: 'bancos', cadencia_dias: 7, ultima_corrida: haceDias(6) });
  assert.ok(!toca(bancos, AHORA), 'a los 6 días todavía no');
  assert.ok(toca(job({ nombre: 'bancos', cadencia_dias: 7, ultima_corrida: haceDias(7) }), AHORA));
});

test('cron: las alertas respetan la cadencia semanal y el interruptor operativo', () => {
  const alertaReciente = job({
    nombre: 'alertas',
    cadencia_dias: 7,
    ultima_corrida: haceDias(6),
  });
  assert.ok(!toca(alertaReciente, AHORA), 'a los 6 días todavía no');
  assert.ok(toca(job({
    nombre: 'alertas',
    cadencia_dias: 7,
    ultima_corrida: haceDias(7),
  }), AHORA));
  assert.ok(!toca(job({
    nombre: 'alertas',
    cadencia_dias: 7,
    habilitado: false,
    ultima_corrida: haceDias(30),
  }), AHORA), 'no se activa antes del canary');
});

test('cron: un trabajo deshabilitado nunca corre', () => {
  assert.ok(!toca(job({ habilitado: false, ultima_corrida: haceDias(90) }), AHORA));
});

test('cron: el cerrojo evita que dos procesos corran lo mismo', () => {
  const tomado = job({ ultima_corrida: haceDias(30), corriendo_desde: haceDias(0) });
  assert.ok(!toca(tomado, AHORA), 'otro proceso lo tiene tomado');
});

test('cron: un cerrojo viejo se ignora (el proceso anterior murió)', () => {
  // Sin esto, un contenedor que muere a mitad de un scrape dejaría el trabajo
  // bloqueado para siempre y el radar se congelaría sin avisar.
  const zombi = job({ ultima_corrida: haceDias(30), corriendo_desde: haceDias(1) });
  assert.ok(toca(zombi, AHORA), 'cerrojo de más de 6 h debe liberarse');
});

test('cron: tras una caída larga recupera lo pendiente', () => {
  // El calendario vive en la base, así que estar caído 20 días no salta corridas.
  assert.ok(toca(job({ cadencia_dias: 7, ultima_corrida: haceDias(20) }), AHORA));
});

const resultado = (tomado: boolean, error?: string) => ({
  data: tomado ? [{ nombre: 'motor' }] : [],
  error: error ? { message: error } : null,
});

test('cron: toma un cerrojo libre sin consultar vencimiento', async () => {
  const llamadas: Parameters<ActualizarCerrojo>[] = [];
  const actualizar: ActualizarCerrojo = async (...args) => {
    llamadas.push(args);
    return resultado(true);
  };

  assert.equal(await tomarCerrojoCon(actualizar, 'motor', AHORA), AHORA.toISOString());
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0][0], 'libre');
  assert.equal(llamadas[0][1], 'motor');
  assert.equal(llamadas[0][2], AHORA.toISOString());
  assert.equal(llamadas[0][3], new Date(AHORA.getTime() - 6 * 60 * 60_000).toISOString());
});

test('cron: recupera un cerrojo vencido después de comprobar que no está libre', async () => {
  const estados: string[] = [];
  const actualizar: ActualizarCerrojo = async (estado) => {
    estados.push(estado);
    return resultado(estado === 'vencido');
  };

  assert.equal(await tomarCerrojoCon(actualizar, 'motor', AHORA), AHORA.toISOString());
  assert.deepEqual(estados, ['libre', 'vencido']);
});

test('cron: no toma un cerrojo ocupado y vigente', async () => {
  const actualizar: ActualizarCerrojo = async () => resultado(false);
  assert.equal(await tomarCerrojoCon(actualizar, 'motor', AHORA), null);
});

test('cron: un error al comprobar el cerrojo libre corta sin una segunda escritura', async () => {
  let llamadas = 0;
  const actualizar: ActualizarCerrojo = async () => {
    llamadas++;
    return resultado(false, 'fallo PostgREST');
  };

  assert.equal(await tomarCerrojoCon(actualizar, 'motor', AHORA), null);
  assert.equal(llamadas, 1);
});

test('cron: un error al recuperar el cerrojo vencido también impide ejecutar', async () => {
  const actualizar: ActualizarCerrojo = async (estado) => (
    estado === 'libre' ? resultado(false) : resultado(false, 'fallo PostgREST')
  );
  assert.equal(await tomarCerrojoCon(actualizar, 'motor', AHORA), null);
});

test('cron: soltar el cerrojo escribe el estado de la corrida y lo confirma', async () => {
  const escrituras: Array<Parameters<LiberarCerrojo>> = [];
  const liberar: LiberarCerrojo = async (...args) => {
    escrituras.push(args);
    return resultado(true);
  };

  assert.equal(
    await soltarCerrojoCon(liberar, 'motor', 'token-1', 'ok', '{"evaluated":10}', 42, AHORA),
    true,
  );
  assert.equal(escrituras.length, 1);
  const [nombre, token, cambios] = escrituras[0];
  assert.equal(nombre, 'motor');
  assert.equal(token, 'token-1');
  assert.equal(cambios.corriendo_desde, null);
  assert.equal(cambios.ultima_corrida, AHORA.toISOString());
  assert.equal(cambios.ultimo_estado, 'ok');
  assert.equal(cambios.duracion_seg, 42);
});

test('cron: el detalle del cerrojo se recorta a 500 caracteres', async () => {
  // `ultimo_detalle` guarda el JSON del resultado; una corrida de FincaRaíz puede
  // traer miles de errores de validación y reventaría la columna.
  let guardado = '';
  const liberar: LiberarCerrojo = async (_n, _t, cambios) => {
    guardado = String(cambios.ultimo_detalle);
    return resultado(true);
  };

  await soltarCerrojoCon(liberar, 'fincaraiz', 'token-1', 'error', 'x'.repeat(2000), 1, AHORA);
  assert.equal(guardado.length, 500);
});

test('cron: si la liberación falla se informa y no se da por soltado', async () => {
  // Sin esto el trabajo quedaba bloqueado hasta que venciera el cerrojo (6 h) y
  // el radar se congelaba en silencio.
  const liberar: LiberarCerrojo = async () => resultado(false, 'fallo PostgREST');
  assert.equal(
    await soltarCerrojoCon(liberar, 'motor', 'token-1', 'ok', '{}', 1, AHORA),
    false,
  );
});

test('cron: si el cerrojo ya no es propio no se sobrescribe el estado ajeno', async () => {
  // Cero filas: el cerrojo venció y otra réplica recuperó el trabajo.
  const liberar: LiberarCerrojo = async () => resultado(false);
  assert.equal(
    await soltarCerrojoCon(liberar, 'motor', 'token-viejo', 'ok', '{}', 1, AHORA),
    false,
  );
});

test('cron: dos ticks solapados no abren dos revisiones', async () => {
  // El cerrojo impide repetir el MISMO trabajo, no que un tick lance otro trabajo
  // mientras un scraper largo todavía inserta.
  let corridas = 0;
  let liberar!: () => void;
  const enEspera = new Promise<void>((resolve) => { liberar = resolve; });
  const revisar = crearRevisionSerializada(async () => { corridas++; await enEspera; });

  const primera = revisar();
  const segunda = revisar();
  assert.equal(corridas, 1, 'el segundo tick se engancha al primero');

  liberar();
  await Promise.all([primera, segunda]);
  assert.equal(corridas, 1);
});

test('cron: terminada una revisión, el siguiente tick vuelve a entrar', async () => {
  let corridas = 0;
  const revisar = crearRevisionSerializada(async () => { corridas++; });

  await revisar();
  await revisar();
  assert.equal(corridas, 2);
});

test('cron: una pasada colgada no enmudece el planificador para siempre', async () => {
  // Sin techo, un `fetch` sin `signal` en un scraper dejaría la promesa sin
  // asentarse y TODOS los ticks siguientes se engancharían a ella: el radar
  // dejaría de scrapear, reclasificar y alertar en absoluto silencio.
  let corridas = 0;
  let reloj = 0;
  const revisar = crearRevisionSerializada(
    async () => { corridas++; await new Promise<void>(() => {}); },
    () => reloj,
  );

  void revisar();
  assert.equal(corridas, 1);

  reloj += 4 * 60 * 60_000; // 4 h: todavía dentro del margen
  void revisar();
  assert.equal(corridas, 1, 'a las 4 h sigue esperando a la pasada en curso');

  reloj += 2 * 60 * 60_000; // 6 h en total: se da por colgada
  void revisar();
  assert.equal(corridas, 2, 'pasado el techo se abre una pasada nueva');
});

test('cron: el techo de la revisión es menor que el del cerrojo', async () => {
  // Si fuese al revés, el tick que entra encontraría el cerrojo todavía vigente
  // y `toca()` lo descartaría: no se recuperaría nada.
  let reloj = 0;
  let corridas = 0;
  const revisar = crearRevisionSerializada(
    async () => { corridas++; await new Promise<void>(() => {}); },
    () => reloj,
  );
  void revisar();
  reloj += 6 * 60 * 60_000; // CERROJO_MAX_MS
  void revisar();
  assert.equal(corridas, 2, 'a las 6 h el cerrojo ya venció y la revisión ya se soltó');
});

test('cron: una revisión que falla no deja el planificador bloqueado', async () => {
  // Si el `finally` no limpiara la promesa en curso, un error dejaría el cron
  // mudo para siempre.
  let corridas = 0;
  const revisar = crearRevisionSerializada(async () => {
    corridas++;
    throw new Error('Supabase caído');
  });

  await assert.rejects(revisar());
  await assert.rejects(revisar());
  assert.equal(corridas, 2);
});

test('un job con subtareas caídas NO se registra como «ok»', () => {
  // El caso real: la corrida de bancos del 25 de agosto. Davivienda y
  // Bancolombia guardaron; BBVA y AVAL murieron con `pdfinfo: not found` y
  // devolvieron cero. El job entero se anotó como «ok» y así estuvo doce días.
  const bancos = [
    { portal: 'davivienda', status: 'partial', found: 29, inserted: 28, errors: 1 },
    { portal: 'bancolombia', status: 'ok', found: 13, inserted: 13, errors: 0 },
    { portal: 'bbva', status: 'error', found: 0, inserted: 0, errors: 1 },
    { portal: 'aval', status: 'error', found: 0, inserted: 0, errors: 1 },
  ];
  assert.deepEqual(subtareasCaidas(bancos), ['bbva', 'aval']);

  // «Parcial» NO es caída: Davivienda dejó 28 de 29 y ese registro perdido no
  // justifica declarar vencido todo el inventario de bancos.
  assert.deepEqual(subtareasCaidas([bancos[0], bancos[1]]), []);

  // El ruido de validación de FincaRaíz tampoco: cientos de avisos mal formados
  // conviven con 106.000 filas insertadas en un scrape perfectamente sano. Si
  // esto encendiera el aviso, el aviso estaría encendido siempre.
  assert.deepEqual(subtareasCaidas({
    venta: { records_found: 108624, records_inserted: 106197, errors: [{ message: 'area_m2: Number must be greater than 0' }] },
  }), []);

  // Y el motor, que no tiene subtareas, no puede caerse por accidente.
  assert.deepEqual(subtareasCaidas({ evaluated: 144730, opportunities: 25662, written: 73887 }), []);
  assert.deepEqual(subtareasCaidas(null), []);
});
