FROM oven/bun:1 AS base

WORKDIR /app

COPY package.json bun.lockb* ./
COPY prisma ./prisma/
RUN bun install

COPY . .
RUN bunx prisma generate

FROM base AS dev

CMD ["bun", "run", "--watch", "src/main.ts"]

FROM base AS prod

RUN bun run build

CMD ["node", "dist/main.js"]
