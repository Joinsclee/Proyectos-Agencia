#!/usr/bin/env bash
# ============================================================================
#  JoinsClee · Comunidad Skool → GHL
#  Smoke tests OBLIGATORIOS antes de poner el sistema en producción.
#
#  Estos tests resuelven las incertidumbres que la investigación NO pudo
#  confirmar con fuente pública. Cada uno imprime un veredicto claro.
#
#  Uso:
#     cp .env.example .env && nano .env      # rellena los valores
#     ./smoke-test.sh                        # corre todos los de lectura
#     ./smoke-test.sh T3                     # corre solo uno
#     ./smoke-test.sh T2 --confirm-destructive   # los destructivos exigen flag
#
#  NINGÚN test destructivo corre sin --confirm-destructive.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/../.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
else
  echo "!! No existe $ENV_FILE — copia .env.example a .env y rellénalo." >&2
  exit 1
fi

GHL_API="https://services.leadconnectorhq.com"
GHL_VERSION="2021-07-28"
SKOOL_BASE="https://www.skool.com"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

DESTRUCTIVE=0
WANTED=""
for arg in "$@"; do
  case "$arg" in
    --confirm-destructive) DESTRUCTIVE=1 ;;
    T*) WANTED="$WANTED $arg" ;;
  esac
done

c_ok()   { printf '\033[32m✔ %s\033[0m\n' "$1"; }
c_bad()  { printf '\033[31m✘ %s\033[0m\n' "$1"; }
c_warn() { printf '\033[33m▲ %s\033[0m\n' "$1"; }
c_head() { printf '\n\033[1;36m━━━ %s ━━━\033[0m\n' "$1"; }

want() { [[ -z "$WANTED" ]] || [[ " $WANTED " == *" $1 "* ]]; }

need() {
  local missing=0
  for v in "$@"; do
    if [[ -z "${!v:-}" ]]; then c_bad "falta la variable $v en $ENV_FILE"; missing=1; fi
  done
  return $missing
}

ghl() { # ghl <METHOD> <PATH> [curl args...]
  local method="$1"; shift
  local path="$1"; shift
  curl -sS -X "$method" "${GHL_API}${path}" \
    -H "Authorization: Bearer ${GHL_AGENCY_PIT}" \
    -H "Version: ${GHL_VERSION}" \
    -H "Accept: application/json" \
    -w $'\n__HTTP__%{http_code}' "$@"
}

split_body() { sed 's/__HTTP__[0-9]*$//'; }
split_code() { grep -o '__HTTP__[0-9]*$' | tr -d 'A-Z_'; }

# ============================================================================
# T1 · ¿El PIT de AGENCIA tiene realmente users.write?  (resuelve U1)
#      Es el test que bloquea todo el diseño. Si falla, hay que usar OAuth.
# ============================================================================
t1() {
  c_head "T1 · ¿El PIT de agencia puede LEER usuarios? (scope users.readonly)"
  need GHL_AGENCY_PIT GHL_COMPANY_ID || return 1

  local out code body
  out="$(ghl GET "/users/search?companyId=${GHL_COMPANY_ID}&limit=1")"
  code="$(printf '%s' "$out" | split_code)"
  body="$(printf '%s' "$out" | split_body)"

  echo "HTTP $code"
  printf '%s\n' "$body" | head -c 700; echo

  case "$code" in
    200) c_ok "users.readonly CONFIRMADO. El PIT de agencia lee usuarios."
         c_warn "Ojo: leer no prueba escribir. users.write se confirma en T2." ;;
    401) c_bad "401 — el token no es de agencia, o no tiene el scope users.readonly."
         echo "   → Panel de AGENCIA (no de sub-cuenta) → Settings → Private Integrations"
         echo "     → crea/edita el PIT y marca users.readonly + users.write." ;;
    422) c_bad "422 — normalmente significa companyId ausente o inválido."
         echo "   → GHL_COMPANY_ID debe ser el ID de la AGENCIA, no de una location." ;;
    403) c_bad "403 — token válido pero sin permiso sobre ese companyId." ;;
    *)   c_warn "HTTP $code inesperado. Revisa el cuerpo de arriba." ;;
  esac
}

# ============================================================================
# T1b · ¿Aparecen los scopes de users en el selector del PIT? (manual)
# ============================================================================
t1b() {
  c_head "T1b · Verificación MANUAL del selector de scopes"
  cat <<'TXT'
  HighLevel no publica qué scopes ofrece el selector del PIT de agencia.
  Compruébalo a ojo — 60 segundos:

    1. Entra al panel de AGENCIA (no a una sub-cuenta).
    2. Settings → Private Integrations → Create new integration.
    3. En el selector de scopes busca:
         [ ] users.readonly
         [ ] users.write
         [ ] locations.readonly
         [ ] locations.write
         [ ] snapshots.readonly     (necesario si aprovisionas desde snapshot)
         [ ] saas/... (cualquiera)  (para el pause; puede no existir)

  Si users.write NO aparece → el PIT no sirve para revocar y hay que crear una
  app OAuth de Marketplace con Target User = Agency. Avísame y reescribo la capa
  de auth; el resto del sistema no cambia.
TXT
}

# ============================================================================
# T2 · DELETE /users/{id}  (resuelve C4 + latencia real)  ⚠ DESTRUCTIVO
# ============================================================================
t2() {
  c_head "T2 · DELETE /users/{userId} sobre un usuario DESECHABLE  ⚠ DESTRUCTIVO"
  need GHL_AGENCY_PIT GHL_COMPANY_ID TEST_GHL_USER_ID || return 1

  if [[ "$DESTRUCTIVE" != "1" ]]; then
    c_warn "Saltado. Re-ejecuta con:  ./smoke-test.sh T2 --confirm-destructive"
    echo "   Borrará el usuario ${TEST_GHL_USER_ID}. Crea uno de prueba antes."
    return 0
  fi

  echo "→ Borrando ${TEST_GHL_USER_ID} …"
  local out code body
  out="$(ghl DELETE "/users/${TEST_GHL_USER_ID}")"
  code="$(printf '%s' "$out" | split_code)"; body="$(printf '%s' "$out" | split_body)"
  echo "HTTP $code"; printf '%s\n' "$body"; echo

  if printf '%s' "$body" | grep -q '"succeded"'; then
    c_ok "El campo es 'succeded' (typo de HighLevel, una sola e)."
  elif printf '%s' "$body" | grep -q '"succeeded"'; then
    c_ok "El campo es 'succeeded' (bien escrito)."
  else
    c_warn "No apareció ni succeded ni succeeded — revisa el cuerpo."
  fi

  [[ "$code" == "200" ]] && c_ok "users.write CONFIRMADO." || c_bad "users.write NO confirmado (HTTP $code)."

  echo
  echo "→ El borrado es ASÍNCRONO. Espera ~5 min y corre T2b para verificarlo."
}

t2b() {
  c_head "T2b · Verificar el borrado diferido (filter-by-email, deleted:true)"
  need GHL_AGENCY_PIT GHL_COMPANY_ID TEST_GHL_USER_EMAIL || return 1

  local out code body
  out="$(ghl POST "/users/search/filter-by-email" \
    -H "Content-Type: application/json" \
    -d "{\"companyId\":\"${GHL_COMPANY_ID}\",\"emails\":\"${TEST_GHL_USER_EMAIL}\",\"deleted\":true,\"projection\":\"all\"}")"
  code="$(printf '%s' "$out" | split_code)"; body="$(printf '%s' "$out" | split_body)"
  echo "HTTP $code"; printf '%s\n' "$body" | head -c 900; echo
  case "$code" in
    200) c_ok "El endpoint de verificación funciona. Si el usuario aparece aquí con deleted=true, el borrado se consumó." ;;
    401) c_bad "401 — este endpoint SOLO acepta Agency-Access. Confirma que el PIT es de agencia." ;;
    *)   c_warn "HTTP $code — revisa el cuerpo." ;;
  esac
}

# ============================================================================
# T3 · Skool: ¿qué devuelve cada pestaña?  (resuelve U6, U8, U11)
#      Es el test más importante para la detección. NO es destructivo.
# ============================================================================
t3() {
  c_head "T3 · Skool · barrido de las 4 pestañas del grupo real"
  need SKOOL_AUTH_TOKEN SKOOL_CLIENT_ID SKOOL_GROUP || return 1

  local cookie="auth_token=${SKOOL_AUTH_TOKEN}; client_id=${SKOOL_CLIENT_ID}"
  local html build_id final_url

  echo "→ Extrayendo buildId de /${SKOOL_GROUP}/-/members …"
  html="$(curl -sS -L "${SKOOL_BASE}/${SKOOL_GROUP}/-/members" \
      -H "Cookie: $cookie" -H "User-Agent: $UA" \
      -H 'Accept: text/html,application/xhtml+xml' \
      -w $'\n__URL__%{url_effective}')"
  final_url="$(printf '%s' "$html" | grep -o '__URL__.*$' | sed 's/__URL__//')"
  html="$(printf '%s' "$html" | sed 's/__URL__.*$//')"

  if printf '%s' "$final_url" | grep -q '/login'; then
    c_bad "La cookie de Skool está VENCIDA (redirigió a $final_url)."
    echo "   → Abre skool.com logueado como admin, DevTools → Application → Cookies,"
    echo "     copia auth_token y client_id al .env."
    return 1
  fi

  build_id="$(printf '%s' "$html" | grep -o '"buildId":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')"
  if [[ -z "$build_id" ]]; then
    c_bad "No se pudo extraer el buildId. Skool pudo cambiar su HTML."
    return 1
  fi
  c_ok "buildId = $build_id"

  local tmp; tmp="$(mktemp -d)"
  for T in active cancelling churned banned; do
    echo
    printf '\033[1m── t=%s ──\033[0m\n' "$T"
    local url="${SKOOL_BASE}/_next/data/${build_id}/${SKOOL_GROUP}/-/members.json?t=${T}&p=1&group=${SKOOL_GROUP}"
    curl -sS "$url" -H "Cookie: $cookie" -H "User-Agent: $UA" \
      -H 'x-nextjs-data: 1' -H "Referer: ${SKOOL_BASE}/${SKOOL_GROUP}/-/members" \
      -o "$tmp/$T.json" -w 'HTTP %{http_code}\n'

    python3 - "$tmp/$T.json" "$T" <<'PY'
import json, sys
path, tab = sys.argv[1], sys.argv[2]
try:
    j = json.load(open(path))
except Exception as e:
    print("  !! no es JSON válido:", e); raise SystemExit
pp = j.get("pageProps", j)
rd = pp.get("renderData", {}) or {}
print("  pageProps keys :", sorted(pp.keys())[:14])
print("  renderData keys:", sorted(rd.keys())[:14])
for k in ("totalMembers","totalCancellingMembers","totalChurnedMembers","totalBannedMembers","totalPages"):
    if k in pp: print(f"  pageProps.{k} = {pp[k]}")
    if k in rd: print(f"  renderData.{k} = {rd[k]}")

users = pp.get("users") or pp.get("members") or []
print(f"  registros en la página: {len(users)}")
emails = []
for u in users[:60]:
    m = u.get("member") or {}
    md = m.get("metadata") or {}
    e = md.get("mbme") or u.get("email") or m.get("inviteEmail")
    if e: emails.append(str(e).lower())
if users:
    m = (users[0].get("member") or {})
    md = m.get("metadata") or {}
    print("  member keys    :", sorted(m.keys())[:18])
    print("  metadata keys  :", sorted(md.keys())[:22])
    print("  billingCanceled:", m.get("billingCanceled"))
    print("  billingDeclined:", m.get("billingDeclined"))
    print("  churned        :", m.get("churned"))
    print("  mbscpe (corte) :", md.get("mbscpe"))
    print("  mbsfprt        :", md.get("mbsfprt"))
    print("  mmbp (plan)    :", str(md.get("mmbp"))[:160])
    e0 = md.get("mbme")
    if e0:
        ok = "@" in str(e0) and "*" not in str(e0)
        print(f"  mbme sample    : {e0}   → {'EMAIL REAL ✔' if ok else 'OFUSCADO ✘'}")
    else:
        print("  mbme sample    : AUSENTE")
open(path + ".emails", "w").write("\n".join(sorted(set(emails))))
PY
  done

  echo
  printf '\033[1m── Solapamiento entre pestañas (resuelve U6) ──\033[0m\n'
  if [[ -s "$tmp/active.json.emails" && -s "$tmp/cancelling.json.emails" ]]; then
    local overlap
    overlap="$(comm -12 "$tmp/active.json.emails" "$tmp/cancelling.json.emails" | wc -l | tr -d ' ')"
    echo "  emails en active     : $(wc -l < "$tmp/active.json.emails" | tr -d ' ')"
    echo "  emails en cancelling : $(wc -l < "$tmp/cancelling.json.emails" | tr -d ' ')"
    echo "  en AMBAS             : $overlap"
    if [[ "$overlap" -gt 0 ]]; then
      c_warn "SOLAPAN → un miembro que canceló SIGUE saliendo en t=active."
      echo "     Consecuencia: el diff contra active NO detecta cancelaciones."
      echo "     Solo t=cancelling las ve. El diseño ya asume esto — correcto."
    else
      c_ok "NO solapan → cancelling saca al miembro de active."
    fi
  else
    c_warn "Una de las dos pestañas vino vacía; no se pudo comparar."
    echo "     (Normal si la comunidad es nueva y nadie ha cancelado todavía.)"
  fi
  echo
  echo "JSONs crudos guardados en: $tmp"
}

# ============================================================================
# T4 · SaaS pause  (resuelve U2, U3)   ⚠ ALTERA una sub-cuenta
# ============================================================================
t4() {
  c_head "T4 · POST /saas/pause/{locationId}  ⚠ pausa una sub-cuenta real"
  need GHL_AGENCY_PIT GHL_COMPANY_ID TEST_GHL_LOCATION_ID || return 1
  if [[ "$DESTRUCTIVE" != "1" ]]; then
    c_warn "Saltado. Re-ejecuta con --confirm-destructive (usa una sub-cuenta de prueba)."
    return 0
  fi

  local out code body
  echo "→ Intento 1: solo headers de la spec"
  out="$(ghl POST "/saas/pause/${TEST_GHL_LOCATION_ID}" -H "Content-Type: application/json" \
        -d "{\"paused\":true,\"companyId\":\"${GHL_COMPANY_ID}\"}")"
  code="$(printf '%s' "$out" | split_code)"; body="$(printf '%s' "$out" | split_body)"
  echo "HTTP $code"; printf '%s\n' "$body" | head -c 500; echo

  if [[ "$code" == "401" || "$code" == "403" ]]; then
    echo
    echo "→ Intento 2: + headers no documentados (channel/source) que reporta la comunidad"
    out="$(ghl POST "/saas/pause/${TEST_GHL_LOCATION_ID}" -H "Content-Type: application/json" \
          -H "channel: OAUTH" -H "source: INTEGRATION" \
          -d "{\"paused\":true,\"companyId\":\"${GHL_COMPANY_ID}\"}")"
    code="$(printf '%s' "$out" | split_code)"; body="$(printf '%s' "$out" | split_body)"
    echo "HTTP $code"; printf '%s\n' "$body" | head -c 500; echo
  fi

  case "$code" in
    200|201) c_ok "El pause por API FUNCIONA. Se puede automatizar la suspensión." ;;
    401|403) c_bad "El pause NO acepta el PIT. Queda como tarea manual en Slack (ya contemplado)." ;;
    404)     c_warn "404 — ¿SaaS Mode habilitado en esa sub-cuenta? ¿locationId correcto?" ;;
    *)       c_warn "HTTP $code — revisa el cuerpo." ;;
  esac
}

# ============================================================================
# T5 · DELETE /locations/{id}  (resuelve C1)   ⚠⚠ IRREVERSIBLE
# ============================================================================
t5() {
  c_head "T5 · DELETE /locations/{locationId}  ⚠⚠ DESTRUYE LA SUB-CUENTA ENTERA"
  need GHL_AGENCY_PIT TEST_GHL_LOCATION_ID || return 1
  if [[ "$DESTRUCTIVE" != "1" ]]; then
    c_warn "Saltado. Este test BORRA una sub-cuenta y todo su contenido."
    echo "   Solo córrelo sobre una sub-cuenta creada a propósito para tirarla."
    echo "   ./smoke-test.sh T5 --confirm-destructive"
    return 0
  fi
  read -r -p "Escribe BORRAR para confirmar que ${TEST_GHL_LOCATION_ID} es desechable: " ans
  [[ "$ans" == "BORRAR" ]] || { c_warn "Cancelado."; return 0; }

  local out code body
  out="$(ghl DELETE "/locations/${TEST_GHL_LOCATION_ID}?deleteTwilioAccount=false")"
  code="$(printf '%s' "$out" | split_code)"; body="$(printf '%s' "$out" | split_body)"
  echo "HTTP $code"; printf '%s\n' "$body" | head -c 500; echo
  case "$code" in
    200|201) c_ok "El DELETE de locations SÍ funciona con PIT de agencia."
             echo "   → Se puede automatizar el borrado de sub-cuenta (con período de gracia)." ;;
    401|403) c_bad "401/403 — confirma el conflicto de scope (locations.internal-access-only)."
             echo "   → Borrar sub-cuentas queda como operación MANUAL. El diseño ya lo asume." ;;
    *)       c_warn "HTTP $code — revisa el cuerpo." ;;
  esac
}

# ============================================================================
# T6 · POST /locations/  (resuelve U5: ¿el plan permite crear sub-cuentas?)
# ============================================================================
t6() {
  c_head "T6 · POST /locations/  ⚠ crea una sub-cuenta real"
  need GHL_AGENCY_PIT GHL_COMPANY_ID || return 1
  if [[ "$DESTRUCTIVE" != "1" ]]; then
    c_warn "Saltado (crea una sub-cuenta). Re-ejecuta con --confirm-destructive."
    return 0
  fi
  local stamp; stamp="$(date +%s)"
  local payload
  payload="$(cat <<JSON
{
  "name": "SMOKE TEST ${stamp} (borrar)",
  "companyId": "${GHL_COMPANY_ID}",
  "address": "Calle 1", "city": "Medellin", "state": "Antioquia",
  "country": "CO", "postalCode": "050001", "timezone": "America/Bogota"
  ${GHL_SNAPSHOT_ID:+, "snapshotId": "${GHL_SNAPSHOT_ID}"}
}
JSON
)"
  local out code body
  out="$(ghl POST "/locations/" -H "Content-Type: application/json" -d "$payload")"
  code="$(printf '%s' "$out" | split_code)"; body="$(printf '%s' "$out" | split_body)"
  echo "HTTP $code"; printf '%s\n' "$body" | head -c 700; echo
  case "$code" in
    200|201) c_ok "Se pueden crear sub-cuentas por API en el plan actual."
             echo "   → El aprovisionamiento automático es viable. ANOTA el id creado y bórralo a mano." ;;
    401|403) c_bad "No permitido — puede exigir Agency Pro o el scope locations.write." ;;
    *)       c_warn "HTTP $code — revisa el cuerpo." ;;
  esac
}

# ============================================================================
# T7 · Slack: ¿el webhook publica?  (no destructivo, manda 1 mensaje de prueba)
# ============================================================================
t7() {
  c_head "T7 · Slack Incoming Webhook"
  need SLACK_WEBHOOK_URL || return 1
  local code
  code="$(curl -sS -o /tmp/jc_slack.out -w '%{http_code}' -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d '{"text":"✅ JoinsClee · Comunidad — smoke test del webhook. Si ves esto, el canal está listo."}')"
  echo "HTTP $code · $(cat /tmp/jc_slack.out)"
  [[ "$code" == "200" ]] && c_ok "Webhook operativo." || c_bad "El webhook falló."
}

# ============================================================================
main() {
  echo "JoinsClee · Comunidad Skool → GHL · smoke tests"
  echo "env: $ENV_FILE   destructivos: $([[ $DESTRUCTIVE == 1 ]] && echo SÍ || echo no)"
  want T1  && t1
  want T1b && t1b
  want T3  && t3
  want T7  && t7
  want T2  && t2
  want T2b && t2b
  want T4  && t4
  want T6  && t6
  want T5  && t5
  echo
  c_head "Fin"
  cat <<'TXT'
  Pásame los veredictos de T1, T2 y T3 — son los que definen si el sistema
  puede revocar solo o si hay que cambiar la capa de autenticación.
TXT
}
main
