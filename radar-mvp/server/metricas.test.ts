/**
 * Las gráficas del panel son la respuesta a «¿la máquina que consigue el
 * inventario está viva?». Un conteo mal agrupado no rompe la pantalla: dibuja
 * una columna donde no la había y hace creer que el scraping corrió. Por eso la
 * agregación y las escalas se prueban enteras, sin red y sin navegador.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  diaBogota,
  estadoTrabajos,
  marcasDeEje,
  serieCorridasPorDia,
  type FilaCorrida,
  type FilaTrabajo,
} from './metricas.js';

const HASTA = new Date('2026-07-28T12:00:00.000Z');
const corrida = (started_at: string, status = 'success', extra: Partial<FilaCorrida> = {}): FilaCorrida =>
  ({ source: 'fincaraiz', status, started_at, records_found: 10, records_inserted: 8, ...extra });

/* ─────────────────────────────  Día colombiano  ───────────────────────────── */

test('métricas: una corrida de la noche cuenta en el día que la vivió el operador', () => {
  // 20:00 de Bogotá del 27 son las 01:00 UTC del 28. Agrupando por UTC, la
  // corrida aparecería al día siguiente y el operador buscaría en el día
  // equivocado al revisar por qué falló.
  assert.equal(diaBogota('2026-07-28T01:00:00.000Z'), '2026-07-27');
  assert.equal(diaBogota('2026-07-28T05:00:00.000Z'), '2026-07-28');
});

test('métricas: una fecha ilegible no inventa un día', () => {
  assert.equal(diaBogota('no-es-una-fecha'), '');
});

/* ───────────────────────────  Corridas por día  ─────────────────────────── */

test('métricas: los días sin corridas existen igual en la serie', () => {
  // LOS HUECOS SON EL DATO. Si solo se pintaran los días con actividad, una
  // semana entera sin scrapear se vería como columnas juntas y parecería normal.
  const serie = serieCorridasPorDia([corrida('2026-07-28T12:00:00.000Z')], { dias: 7, hasta: HASTA });
  assert.equal(serie.dias.length, 7);
  assert.equal(serie.dias.at(-1)?.dia, '2026-07-28');
  assert.equal(serie.dias.at(0)?.dia, '2026-07-22');
  assert.equal(serie.dias.filter((d) => d.total === 0).length, 6);
});

test('métricas: cada estado cae en su cubo y el total los suma', () => {
  const serie = serieCorridasPorDia([
    corrida('2026-07-28T12:00:00.000Z', 'success'),
    corrida('2026-07-28T13:00:00.000Z', 'partial'),
    corrida('2026-07-28T14:00:00.000Z', 'error'),
    corrida('2026-07-28T15:00:00.000Z', 'running'),
  ], { dias: 3, hasta: HASTA });
  const hoy = serie.dias.at(-1)!;
  assert.deepEqual(
    { exito: hoy.exito, parcial: hoy.parcial, error: hoy.error, enCurso: hoy.enCurso, total: hoy.total },
    { exito: 1, parcial: 1, error: 1, enCurso: 1, total: 4 },
  );
});

test('métricas: un estado desconocido cuenta como error, nunca como éxito', () => {
  // Un estado nuevo que el panel no conoce es justo lo que hay que ir a mirar;
  // asumirlo bueno lo escondería.
  const serie = serieCorridasPorDia([corrida('2026-07-28T12:00:00.000Z', 'cancelado')], { dias: 1, hasta: HASTA });
  assert.equal(serie.dias.at(-1)?.error, 1);
  assert.equal(serie.totalFallidas, 1);
});

test('métricas: lo que cae fuera de la ventana no crea una columna extra', () => {
  const serie = serieCorridasPorDia([
    corrida('2026-06-01T12:00:00.000Z'),
    corrida('2026-07-28T12:00:00.000Z'),
  ], { dias: 5, hasta: HASTA });
  assert.equal(serie.dias.length, 5);
  assert.equal(serie.totalCorridas, 1, 'solo se cuenta lo que se dibuja');
});

test('métricas: los insertados se suman aunque lleguen como texto', () => {
  const serie = serieCorridasPorDia([
    corrida('2026-07-28T12:00:00.000Z', 'success', { records_inserted: '101' }),
    corrida('2026-07-28T13:00:00.000Z', 'success', { records_inserted: 4 }),
    corrida('2026-07-28T14:00:00.000Z', 'success', { records_inserted: null }),
  ], { dias: 1, hasta: HASTA });
  assert.equal(serie.dias.at(-1)?.insertados, 105);
});

test('métricas: las fuentes salen ordenadas y sin repetir', () => {
  const serie = serieCorridasPorDia([
    corrida('2026-07-28T12:00:00.000Z', 'success', { source: 'davivienda' }),
    corrida('2026-07-28T12:00:00.000Z', 'success', { source: 'aval' }),
    corrida('2026-07-28T12:00:00.000Z', 'success', { source: 'davivienda' }),
    corrida('2026-07-28T12:00:00.000Z', 'success', { source: '  ' }),
  ], { dias: 1, hasta: HASTA });
  assert.deepEqual(serie.fuentes, ['aval', 'davivienda']);
});

test('métricas: una fila sin fecha se ignora en vez de tumbar la serie', () => {
  const serie = serieCorridasPorDia(
    [{ status: 'success' }, corrida('2026-07-28T12:00:00.000Z')],
    { dias: 2, hasta: HASTA },
  );
  assert.equal(serie.totalCorridas, 1);
});

test('métricas: el eje siempre cubre la columna más alta', () => {
  // La garantía que hace que ninguna barra se salga del marco ni se recorte.
  const serie = serieCorridasPorDia(
    Array.from({ length: 11 }, () => corrida('2026-07-28T12:00:00.000Z')),
    { dias: 2, hasta: HASTA },
  );
  assert.ok(serie.maxEje >= 11, `el eje (${serie.maxEje}) tiene que llegar a 11`);
});

/* ────────────────────────  Trabajos del planificador  ──────────────────── */

const AHORA = new Date('2026-07-28T12:00:00.000Z');
const trabajo = (extra: Partial<FilaTrabajo> = {}): FilaTrabajo => ({
  nombre: 'motor', cadencia_dias: 1, habilitado: true,
  ultima_corrida: '2026-07-28T06:00:00.000Z', ultimo_estado: 'ok', ...extra,
});

test('trabajos: cada uno se mide contra SU cadencia, no contra los demás', () => {
  // «Hace 3 días» es normal para los bancos (semanal) y es un incendio para el
  // motor (diario). Compararlos entre sí sería la conclusión equivocada.
  const [motor, bancos] = estadoTrabajos([
    trabajo({ nombre: 'motor', cadencia_dias: 1, ultima_corrida: '2026-07-25T12:00:00.000Z' }),
    trabajo({ nombre: 'bancos', cadencia_dias: 7, ultima_corrida: '2026-07-25T12:00:00.000Z' }),
  ], AHORA);
  assert.equal(motor.nombre, 'motor');
  assert.equal(motor.vencido, true, 'el motor lleva 3 días con cadencia de 1');
  assert.equal(bancos.vencido, false, 'los bancos van al día con cadencia de 7');
  assert.ok((motor.avance ?? 0) > (bancos.avance ?? 0), 'los vencidos van primero');
});

test('trabajos: un trabajo deshabilitado nunca se marca vencido', () => {
  // Marcar en rojo algo que nadie espera enseña al operador a ignorar el rojo,
  // que es peor que no tener color.
  const [alertas] = estadoTrabajos([
    trabajo({ nombre: 'alertas', habilitado: false, cadencia_dias: 7, ultima_corrida: '2026-01-01T00:00:00.000Z' }),
  ], AHORA);
  assert.equal(alertas.vencido, false);
  assert.equal(alertas.habilitado, false);
});

test('trabajos: el que nunca corrió no finge estar al día', () => {
  // Un avance de 0 se leería como «recién corrido», que es lo contrario.
  const [nuevo] = estadoTrabajos([trabajo({ ultima_corrida: null, ultimo_estado: null })], AHORA);
  assert.equal(nuevo.avance, null);
  assert.equal(nuevo.diasDesde, null);
  assert.equal(nuevo.estado, 'sin-datos');
  assert.equal(nuevo.vencido, false, 'sin fecha de referencia no se puede afirmar que está vencido');
});

test('trabajos: el avance se topa en 1 para que la barra no se salga', () => {
  const [viejo] = estadoTrabajos([
    trabajo({ cadencia_dias: 1, ultima_corrida: '2026-01-01T00:00:00.000Z' }),
  ], AHORA);
  assert.equal(viejo.avance, 1);
  assert.ok((viejo.diasDesde ?? 0) > 200, 'el dato real sigue disponible aunque la barra se tope');
});

test('trabajos: un estado que no es «ok» se muestra como error', () => {
  const [roto] = estadoTrabajos([trabajo({ ultimo_estado: 'error' })], AHORA);
  assert.equal(roto.estado, 'error');
});

test('trabajos: los vencidos se ordenan primero y por retraso relativo', () => {
  const orden = estadoTrabajos([
    trabajo({ nombre: 'aldia', cadencia_dias: 7, ultima_corrida: '2026-07-28T00:00:00.000Z' }),
    trabajo({ nombre: 'poco', cadencia_dias: 7, ultima_corrida: '2026-07-20T00:00:00.000Z' }),
    trabajo({ nombre: 'mucho', cadencia_dias: 1, ultima_corrida: '2026-07-01T00:00:00.000Z' }),
  ], AHORA).map((t) => t.nombre);
  assert.deepEqual(orden, ['mucho', 'poco', 'aldia']);
});

test('trabajos: una cadencia ausente o cero no provoca una división por cero', () => {
  const [t] = estadoTrabajos([trabajo({ cadencia_dias: 0 })], AHORA);
  assert.equal(t.cadenciaDias, 1);
  assert.ok(Number.isFinite(t.avance ?? Number.NaN));
});

/* ──────────────────────────────  Escalas  ────────────────────────────── */

test('escala: el tope del eje nunca queda por debajo del máximo', () => {
  // Es LA garantía del gráfico: un eje corto dibuja la barra más alta recortada
  // y el operador lee un número que no es, sin ningún error de por medio.
  for (const max of [1, 3, 7, 11, 12, 47, 99, 100, 101, 4321, 0.3, 2.5]) {
    const marcas = marcasDeEje(max);
    assert.ok(marcas.at(-1)! >= max, `eje ${marcas.at(-1)} < máximo ${max}`);
    assert.equal(marcas[0], 0, 'el eje arranca en cero: las barras se comparan por área');
  }
});

test('escala: los pasos son de la familia 1 · 2 · 5 y son uniformes', () => {
  for (const max of [7, 11, 47, 230, 4321]) {
    const marcas = marcasDeEje(max);
    const paso = marcas[1] - marcas[0];
    for (let i = 1; i < marcas.length; i += 1) {
      assert.ok(
        Math.abs((marcas[i] - marcas[i - 1]) - paso) < 1e-9,
        `paso irregular en ${JSON.stringify(marcas)}`,
      );
    }
    const mantisa = paso / 10 ** Math.floor(Math.log10(paso));
    assert.ok([1, 2, 5].includes(Math.round(mantisa)), `paso ${paso} no es 1·2·5×10ⁿ`);
  }
});

test('escala: sin datos el eje sigue existiendo', () => {
  // Un gráfico vacío con eje 0–1 se lee como «no hubo nada»; uno sin eje se lee
  // como «esto está roto».
  assert.deepEqual(marcasDeEje(0), [0, 1]);
  assert.deepEqual(marcasDeEje(Number.NaN), [0, 1]);
  assert.deepEqual(marcasDeEje(-5), [0, 1]);
});

test('escala: no aparece la basura del coma flotante en las marcas', () => {
  // Un «0,30000000000000004» en un eje hace que el cliente deje de creerle al
  // resto de los números de la pantalla.
  for (const marca of marcasDeEje(0.7)) {
    assert.ok(String(marca).length <= 6, `marca fea: ${marca}`);
  }
});
