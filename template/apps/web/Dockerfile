FROM oven/bun:1 AS base

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install

COPY . .

FROM base AS dev

CMD ["bun", "run", "vite", "--host", "0.0.0.0"]

FROM base AS build

RUN bun run build

FROM caddy:2-alpine AS prod

COPY caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
