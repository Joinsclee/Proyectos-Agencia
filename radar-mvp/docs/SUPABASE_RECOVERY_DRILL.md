# Radar CRECE — ensayo de recuperación de Supabase

Este procedimiento convierte el respaldo y la restauración en evidencia
repetible. Nunca debe ejecutarse una restauración directamente sobre producción.

## Estado actual

- Herramientas locales `pg_dump` y `pg_restore`: verificadas.
- Generación de backup custom, checksum SHA-256 y manifiesto: automatizada.
- Verificación de integridad sin restaurar: automatizada.
- Restauración real en un proyecto Supabase de ensayo: pendiente de una URL de
  base de datos independiente y una ventana autorizada.

El service role de Supabase no reemplaza la contraseña PostgreSQL. Para el
backup lógico se necesita la cadena de conexión de base de datos
`RADAR_DATABASE_URL`, obtenida desde el panel del proyecto y manejada únicamente
como variable de entorno.

## 1. Preflight

```bash
npm run backup:preflight
```

El preflight comprueba versiones de `pg_dump` y `pg_restore`, y declara si están
configurados la conexión y el directorio. No abre conexiones ni genera archivos.

## 2. Crear una copia verificable

El directorio debe estar fuera del repositorio y preferiblemente en un volumen
cifrado con permisos restringidos:

```bash
export RADAR_DATABASE_URL='postgresql://...'
export RADAR_BACKUP_DIR='/ruta/cifrada/radar-backups'
npm run backup:create
```

La herramienta:

1. convierte la URL a variables `PG*` para no pasar la contraseña como argumento;
2. genera un archivo PostgreSQL custom, sin propietarios ni privilegios;
3. ejecuta `pg_restore --list`;
4. calcula SHA-256;
5. escribe un manifiesto sin credenciales junto al archivo;
6. elimina cualquier archivo incompleto si falla el proceso.

## 3. Verificar una copia existente

```bash
npm run backup:verify -- /ruta/cifrada/radar-backups/radar-fecha.dump
```

La verificación exige que exista el manifiesto adyacente, compara el checksum y
comprueba que el archivo contenga entradas restaurables.

## 4. Restaurar solo en ensayo

Crear primero un proyecto Supabase separado y vacío. Configurar las variables
PostgreSQL del destino de ensayo sin guardarlas en archivos del repositorio:

```bash
export PGHOST='host-del-proyecto-de-ensayo'
export PGPORT='5432'
export PGUSER='postgres'
export PGPASSWORD='...'
export PGDATABASE='postgres'
export PGSSLMODE='require'

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  /ruta/cifrada/radar-backups/radar-fecha.dump
```

Antes de confirmar el comando, verificar visualmente que `PGHOST` pertenece al
proyecto de ensayo. No usar `--create` ni apuntar al host productivo.

## 5. Validaciones del ensayo

Registrar, sin copiar datos personales:

- duración de backup y restauración;
- tamaño y SHA-256;
- número de entradas restaurables;
- conteos agregados de inmuebles por fuente;
- presencia de constraints, índices y políticas RLS;
- lectura de Portal, Bancos y Remates;
- cálculo de comparables e Índice CRECE;
- configuración de `radar_cron_jobs`;
- confirmación de que `alertas.habilitado=false`;
- resultado de typecheck, pruebas y E2E contra el entorno de ensayo.

Supabase Auth se valida por separado: una copia lógica de PostgreSQL no debe
considerarse por sí sola una prueba completa del plan de recuperación de Auth,
Storage ni de secretos.

## 6. Criterio de aprobación

El ensayo se aprueba únicamente cuando:

- el checksum coincide antes y después de mover el archivo;
- `pg_restore` termina sin errores no explicados;
- los conteos agregados son consistentes;
- los recorridos críticos funcionan;
- los trabajos automáticos permanecen deshabilitados;
- quedan documentados RPO, RTO observado, fecha y responsable.

Hasta completar este ensayo no debe prometerse al cliente un RTO contractual.
