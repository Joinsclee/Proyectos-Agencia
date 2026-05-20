# Playwright + Chrome (perfil clonado)

Automatización de navegador con Playwright usando un **clon de tu perfil real de Chrome**.
Así conservas logins/cookies y puedes seguir usando Chrome normal en paralelo.

## Setup inicial (una sola vez)

```bash
cd Playwright
npm install
```

## Clonar tu perfil de Chrome

**Cierra Chrome completamente (Cmd+Q)** antes de ejecutar:

```bash
npm run clonar-perfil
```

Esto copia `~/Library/Application Support/Google/Chrome/` a `Playwright/.chrome-profile-auto/`,
excluyendo cachés pesadas. Puedes re-ejecutarlo cuando quieras refrescar sesiones (cierra Chrome de nuevo).

## Abrir Chrome controlado por Playwright

```bash
npm run abrir
```

Abre Chrome con el perfil clonado. Ya puedes usar Chrome normal en otra ventana sin conflicto.

## Tests E2E

```bash
npm test
```

Corre los specs de `tests/` con perfil aislado (no usa el clon).

## Estructura

- `scripts/clonar-perfil.ts` — clona tu perfil real al directorio de automatización.
- `scripts/abrir-chrome.ts` — lanza Chrome con el perfil clonado vía `launchPersistentContext`.
- `tests/` — specs de Playwright Test.
- `playwright.config.ts` — configuración de tests (canal `chrome`, headed).
- `.chrome-profile-auto/` — perfil clonado (ignorado por git).

## Notas

- El clon ocupa ~varios cientos de MB. Está excluido de git.
- Si una sesión expira en el clon, vuelve a loguearte allí una vez (queda guardado).
- Para refrescar todo el perfil (cookies, extensiones recientes), cierra Chrome y `npm run clonar-perfil` de nuevo.
