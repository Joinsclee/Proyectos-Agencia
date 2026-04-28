// Supabase Edge Function: send-welcome-email
// Envía correo de bienvenida brandeado a través de Resend
//
// Variables de entorno requeridas (Supabase → Project Settings → Edge Functions → Secrets):
//   RESEND_API_KEY  = re_xxx...
//   FROM_EMAIL      = "Lina Toro <hola@tudominio.com>"   (debe estar verificado en Resend)
//   DASHBOARD_URL   = https://tu-subdominio.gohighlevel.com/miembros   (URL final donde vive el HTML)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL')     ?? 'Lina Toro <onboarding@resend.dev>';
const DASHBOARD_URL  = Deno.env.get('DASHBOARD_URL')  ?? '#';

function template({ name, email, dashboardUrl }: { name: string; email: string; dashboardUrl: string }) {
  const firstName = (name || email.split('@')[0]).split(' ')[0];
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Bienvenida al Universo Lina Toro</title>
</head>
<body style="margin:0;padding:0;background:#fafaf7;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf7;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px -12px rgba(60,70,50,.15);">

        <!-- Hero -->
        <tr>
          <td style="background:linear-gradient(135deg,#9caf88 0%,#7d9169 100%);padding:56px 48px 48px;text-align:left;color:#ffffff;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;opacity:.9;margin-bottom:14px;">
              • Lina Toro · Universo Privado
            </div>
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.15;font-weight:700;margin:0 0 12px;letter-spacing:-.3px;">
              Bienvenida, <em style="font-weight:500;">${firstName}</em>.
            </h1>
            <p style="font-size:16px;line-height:1.6;margin:0;opacity:.95;max-width:420px;">
              Tu espacio está listo. Un lugar íntimo para formular con precisión y calma.
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:44px 48px 16px;">
            <p style="font-size:16px;line-height:1.7;color:#3a3a3a;margin:0 0 20px;">
              Gracias por unirte. A partir de hoy tienes acceso a tus herramientas esenciales, reunidas en un solo lugar para acompañar tu práctica jabonera paso a paso.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0;">
              <tr>
                <td style="padding:18px 20px;background:#f4f6f2;border-left:3px solid #9caf88;border-radius:10px;">
                  <div style="font-family:Georgia,serif;font-style:italic;color:#7d9169;font-size:14px;margin-bottom:6px;">Lo que encontrarás adentro</div>
                  <ul style="margin:8px 0 0;padding-left:20px;color:#3a3a3a;font-size:15px;line-height:1.85;">
                    <li>Calculadora de <strong>Precios</strong> profesional</li>
                    <li>Calculadora de <strong>Saponificación</strong> precisa</li>
                    <li>Biblioteca de <strong>Savias</strong> y sus propiedades</li>
                  </ul>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:32px 0 8px;">
              <tr>
                <td align="center">
                  <a href="${dashboardUrl}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:16px 34px;border-radius:10px;letter-spacing:.3px;">
                    Entrar a mi espacio →
                  </a>
                </td>
              </tr>
            </table>

            <p style="font-size:14px;line-height:1.7;color:#6b7164;margin:28px 0 0;text-align:center;">
              Si el botón no abre, copia este enlace:<br/>
              <a href="${dashboardUrl}" style="color:#7d9169;word-break:break-all;">${dashboardUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Firma -->
        <tr>
          <td style="padding:24px 48px 48px;">
            <p style="font-size:15px;line-height:1.7;color:#3a3a3a;margin:0 0 6px;">Con cariño,</p>
            <p style="font-family:Georgia,serif;font-style:italic;font-size:20px;color:#7d9169;margin:0;">Lina Toro</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f4f6f2;padding:24px 48px;text-align:center;font-size:12px;color:#6b7164;">
            Este correo fue enviado a ${email}. <br/>
            © Lina Toro · Hecho con calma
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...CORS, 'Content-Type':'application/json' } });
    }

    const { email, name } = await req.json().catch(() => ({}));
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'email inválido' }), { status: 400, headers: { ...CORS, 'Content-Type':'application/json' } });
    }

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY no configurada');
      return new Response(JSON.stringify({ error: 'email service not configured' }), { status: 500, headers: { ...CORS, 'Content-Type':'application/json' } });
    }

    const html = template({ name: name || '', email, dashboardUrl: DASHBOARD_URL });

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `Bienvenida a tu espacio privado, ${(name||email.split('@')[0]).split(' ')[0]} 🌿`,
        html,
      }),
    });

    const resendBody = await resendRes.text();
    if (!resendRes.ok) {
      console.error('Resend error:', resendRes.status, resendBody);
      return new Response(JSON.stringify({ error: 'resend failed', detail: resendBody }), { status: 502, headers: { ...CORS, 'Content-Type':'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type':'application/json' } });
  } catch (err) {
    console.error('send-welcome-email error', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { ...CORS, 'Content-Type':'application/json' } });
  }
});
