# Build from the repo root:  docker build -f packages/control/Dockerfile -t matador-control .
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm -r build
RUN pnpm --filter @matadormq/control deploy --prod /out

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S matador && adduser -S matador -G matador
COPY --from=builder /out ./
USER matador
EXPOSE 4319
# Override the command with "doctor" to run the connectivity probe instead.
ENTRYPOINT ["node", "dist/cli.js"]
