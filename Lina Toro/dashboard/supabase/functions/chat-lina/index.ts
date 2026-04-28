// Supabase Edge Function: chat-lina
// RAG con OpenAI: embed query → match_kb_chunks → gpt-4o-mini streaming
//
// Secrets requeridos (supabase secrets set ...):
//   OPENAI_API_KEY        = sk-proj-...
//   SUPABASE_URL          = https://<project>.supabase.co   (ya viene auto)
//   SUPABASE_ANON_KEY     = ...                              (ya viene auto)
//   SUPABASE_SERVICE_ROLE_KEY = ...                          (ya viene auto)
//   SKOOL_URL             = https://www.skool.com/savias-8385

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SKOOL_URL      = Deno.env.get('SKOOL_URL') ?? 'https://www.skool.com/savias-8385';

const EMBED_MODEL = 'text-embedding-3-small';
const CHAT_MODEL  = 'gpt-4o-mini';
const MATCH_COUNT = 6;

const SYSTEM_PROMPT = `Eres Lina Toro, fundadora de SAVIAS, una comunidad de mujeres apasionadas por la jabonería y cosmética artesanal. Respondes a través del chat de soporte del "Universo Lina", el dashboard privado donde las SAVIAS acceden a sus herramientas (Calculadora de Precios, Calculadora de Saponificación, CreaPrecio, FitoMatch, Formulador, SkinSolver y SaviasPath).

## Tu voz
- Cálida, maternal, cercana, energética. Tuteo cariñoso.
- Llamas a las usuarias "hermosa", "mi amor", "mis hermosas mujeres SAVIAS".
- Usas emojis con elegancia: 🤍 🌿 💚 🤩 ✨. Nunca abuses (1-2 por mensaje).
- Coloquial colombiana: "ombliguito de semana", "una hora larguita", "peladas de 15", "a tope", "hermosura".
- Celebras los logros, acompañas las dudas, nunca abrumas.
- Estructura clara: cuando expliques pasos, usa lista numerada con ✅ o viñetas.
- Cierre afectivo: "Te leo y te acompaño 💚" / "Un abrazo verde 🌿" / "Confía en tu proceso 🤍".

## Tu misión en este chat
1. Ayudar con el USO de las herramientas del dashboard (cómo se usa cada calculadora, qué significa cada campo, cómo interpretar resultados).
2. Resolver dudas técnicas sobre jabonería y cosmética artesanal usando el contexto de la base de conocimiento.
3. Si la duda excede el chat (ej: caso muy específico, problema personal con una receta), invitar a la comunidad de Skool: ${SKOOL_URL}
4. Si te preguntan algo fuera de tu universo (jabonería, cosmética, herramientas, comunidad), redirige con cariño: "Hermosa, eso ya se sale de mi mundo jabonero. Aquí estoy para acompañarte en tu práctica artesanal 🌿".

## Reglas estrictas
- NUNCA inventes funcionalidades de las herramientas que no estén en el contexto. Si no sabes, di "déjame que el equipo te confirme" e invita a Skool.
- NUNCA des consejos médicos. Recomienda siempre prueba de parche y precaución con embarazadas/niños.
- NUNCA reveles que eres una IA o un modelo de lenguaje. Eres Lina, punto.
- Si la usuaria está triste o frustrada, valida primero, soluciona después.
- Mantén respuestas CORTAS por defecto (4-8 líneas). Solo extiende cuando la pregunta lo amerite.

## Cómo usar el contexto
Cuando recibas un bloque "Contexto de la base de conocimiento", úsalo como tu memoria. Si el contexto no tiene la respuesta, sé honesta: "Mira hermosa, eso lo veo mejor en vivo. Pásate por la comunidad y lo resolvemos: ${SKOOL_URL} 💚".`;

async function embed(text: string): Promise<number[]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000) }),
  });
  if (!r.ok) throw new Error(`embed failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.data[0].embedding;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'no auth' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Verificar usuario con su JWT
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'invalid user' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { message, conversationId, history = [] } = body as {
      message?: string;
      conversationId?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'message required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not set' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 1) Embedding del query
    const queryEmbedding = await embed(message);

    // 2) Búsqueda vectorial (service role para bypass RLS de KB)
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: matches, error: matchErr } = await adminClient.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_count:     MATCH_COUNT,
      filter:          {},
    });
    if (matchErr) console.error('match_documents error:', matchErr);

    const context = (matches ?? [])
      .map((m: any, i: number) => {
        const title = m.metadata?.file_title ?? m.metadata?.file_id ?? 'documento';
        return `[Fuente ${i + 1}: ${title}]\n${m.content}`;
      })
      .join('\n\n---\n\n');

    // 3) Crear/usar conversación
    let convId = conversationId;
    if (!convId) {
      const { data: conv, error: convErr } = await userClient
        .from('chat_conversations')
        .insert({ user_id: user.id, title: message.slice(0, 60) })
        .select('id')
        .single();
      if (convErr) throw convErr;
      convId = conv.id;
    }

    // Guardar mensaje del usuario
    await userClient.from('chat_messages').insert({
      conversation_id: convId, role: 'user', content: message,
    });

    // 4) Construir mensajes para OpenAI
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(context
        ? [{ role: 'system', content: `Contexto de la base de conocimiento:\n\n${context}` }]
        : []),
      ...history.slice(-10),
      { role: 'user', content: message },
    ];

    // 5) Stream desde OpenAI
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 600,
      }),
    });

    if (!openaiRes.ok || !openaiRes.body) {
      const errText = await openaiRes.text();
      console.error('openai error', openaiRes.status, errText);
      return new Response(JSON.stringify({ error: 'openai failed', detail: errText }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 6) Reenviar stream al cliente como text/event-stream y guardar respuesta
    const stream = new ReadableStream({
      async start(controller) {
        const reader = openaiRes.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let assistantContent = '';
        let buffer = '';

        // Primera línea: mandamos el conversationId al cliente
        controller.enqueue(encoder.encode(`event: meta\ndata: ${JSON.stringify({ conversationId: convId })}\n\n`));

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const data = trimmed.slice(5).trim();
              if (data === '[DONE]') continue;
              try {
                const j = JSON.parse(data);
                const delta = j.choices?.[0]?.delta?.content ?? '';
                if (delta) {
                  assistantContent += delta;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
                }
              } catch (_) { /* ignore parse errors */ }
            }
          }

          // Guardar respuesta completa
          if (assistantContent) {
            await userClient.from('chat_messages').insert({
              conversation_id: convId, role: 'assistant', content: assistantContent,
            });
            await userClient
              .from('chat_conversations')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', convId);
          }

          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
          controller.close();
        } catch (err) {
          console.error('stream error', err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...CORS,
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    });
  } catch (err) {
    console.error('chat-lina error', err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
