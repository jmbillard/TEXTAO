# 1) Gera o site estático
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2) Servidor: entrega o site, guarda os roteiros em SQLite e sincroniza a edição simultânea
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=80 DADOS=/dados ESTATICOS=/app/dist NODE_NO_WARNINGS=1
COPY servidor ./servidor
# a regra da data da claquete é a do navegador: a manutenção (servidor/corrigir-datas.mjs) lê o .ts direto, sem os tipos
COPY src/modelo ./src/modelo
RUN cd servidor && npm ci --omit=dev
COPY --from=build /app/dist ./dist
VOLUME /dados
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/api/eu >/dev/null || exit 1
CMD ["node", "servidor/index.mjs"]
