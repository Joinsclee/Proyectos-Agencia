import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  // Firecrawl
  FIRECRAWL_API_KEY: z.string().min(5),
  FIRECRAWL_API_URL: z.string().url().optional(),    // vacío = cloud; set si self-host

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Defaults
  DEFAULT_COUNTRY_CODE: z.string().length(2).default('CO'),
  SCRAPE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Fase 2
  REMATES_USERNAME: z.string().optional(),
  REMATES_PASSWORD: z.string().optional(),

  // Fase 3
  FINCARAIZ_API_KEY: z.string().optional(),
});

export const env = (() => {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Variables de entorno inválidas:', parsed.error.format());
    throw new Error('Configuración .env incompleta. Revisa .env.example.');
  }
  return parsed.data;
})();
