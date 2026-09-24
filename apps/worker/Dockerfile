# Image du worker pour la démo (Railway, ADR-009), avec ffmpeg (ADR-008). Contexte de build : racine du monorepo.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@clone/worker..."
RUN pnpm --filter @clone/worker build
RUN pnpm deploy --legacy --filter @clone/worker --prod /out/worker && cp -r apps/worker/dist /out/worker/dist

FROM node:24-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/worker ./
USER node
CMD ["node", "dist/main.mjs"]
