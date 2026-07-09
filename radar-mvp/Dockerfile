# Radar de Oportunidades — servidor web (sirve dashboard + /api/* desde Supabase).
# Funciona en Railway, Render, Fly o cualquier VPS con Docker.
FROM node:22-slim

WORKDIR /app

# Dependencias primero (mejor cache). Requiere package-lock.json en sync.
COPY package.json package-lock.json ./
RUN npm ci

# Código
COPY . .

# El server lee PORT del entorno (Railway/Render lo inyectan). 8787 por defecto.
ENV PORT=8787
EXPOSE 8787

CMD ["npm", "run", "serve"]
