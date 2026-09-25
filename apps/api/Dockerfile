# Image de l'API pour la démo (Railway, ADR-009). Contexte de build : racine du monorepo.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@clone/api..." --filter "@clone/db"
RUN pnpm --filter @clone/api build
# API : dépendances de production + bundle. db : drizzle-kit et migrations, pour le pré-déploiement.
RUN pnpm deploy --legacy --filter @clone/api --prod /out/api && cp -r apps/api/dist /out/api/dist
RUN pnpm deploy --legacy --filter @clone/db /out/db

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./api
COPY --from=build --chown=node:node /out/db ./db
USER node
WORKDIR /app/api
# Migrations : `npm --prefix /app/db run db:migrate`, lancé par la *Pre-deploy Command* du service Railway (README § 7).
CMD ["node", "dist/main.mjs"]
