FROM node:24-bookworm-slim AS compilacion
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY apps/api/package.json apps/api/package-lock.json ./
COPY apps/api/prisma ./prisma
COPY apps/api/prisma.config.ts ./
RUN npm ci --ignore-scripts
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json ./
COPY apps/api/src ./src
RUN npx prisma generate && npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS produccion
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=compilacion --chown=node:node /app/package.json ./
COPY --from=compilacion --chown=node:node /app/node_modules ./node_modules
COPY --from=compilacion --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
