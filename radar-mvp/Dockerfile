# Radar de Oportunidades — servidor web (dashboard + /api/* contra Supabase).
# Probado en EasyPanel; sirve igual en Railway, Render, Fly o cualquier VPS con Docker.
FROM node:22-slim

WORKDIR /app

# Playwright está en las dependencias porque lo usa el scraper de remates, NO el
# servidor web. Sin esto, `npm ci` se baja ~300 MB de navegadores que este
# contenedor nunca abre (y que encima fallan en la imagen slim, a la que le faltan
# librerías del sistema que Chromium necesita).
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Dependencias primero (aprovecha la caché de capas de Docker).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# La plataforma inyecta PORT; 8787 si no lo hace.
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Health check: /health NO toca la base, así que un pico de latencia en Supabase
# no hace que la plataforma dé el contenedor por muerto y lo reinicie.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "serve"]
