# Imagem para Easypanel (Node 22). O Prisma precisa de openssl.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# O postinstall roda "prisma generate": o schema precisa existir antes do npm ci
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
ENV PORT=3000
EXPOSE 3000

# Confere o banco alvo, aplica migrations (somente "deploy") e sobe o servidor
CMD ["npm", "run", "start:prod"]
