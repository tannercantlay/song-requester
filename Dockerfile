FROM node:22-bookworm-slim AS build

# Insurance, not a libc workaround: argon2@0.44.0 ships prebuilds for both
# glibc and musl, but if the prebuild for this platform/NAPI version ever
# fails to resolve, node-gyp falls back to a source build, and without a
# toolchain the image build dies with no recovery path.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.9.0

WORKDIR /app

COPY . .

# Deliberately NOT setting NODE_ENV=production here: pnpm would skip
# devDependencies and typescript/tsx/vite would go missing, breaking the
# workspace build below. NODE_ENV=production is set only in the runtime
# stage.
RUN pnpm install --frozen-lockfile
RUN pnpm -r build

FROM node:22-bookworm-slim

# No dbmate binary here any more. Migrations run through node-postgres, the
# same driver the app uses — dbmate's lib/pq could not talk to Neon (see
# docker-entrypoint.sh). That also drops the release download, the
# architecture juggling it needed, and a whole second driver from the image.

WORKDIR /app

# Copy the entire build output wholesale, node_modules included. pnpm's
# node_modules is a lattice of relative symlinks into .pnpm; pruning it with
# pnpm deploy or a partial COPY is the most common way this image breaks.
# Docker preserves the symlinks and they stay valid because their targets
# are inside the copied tree.
COPY --from=build /app /app

RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
