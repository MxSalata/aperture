# Base images are pinned by digest (multi-architecture indexes); bump them deliberately.
# ---- build stage: compile the SPA -------------------------------------------
FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime: nginx serves the SPA and proxies /api/admin to IRIS ------------
# nginx 1.30, the stable line in September 2026
FROM nginx:1.30-alpine@sha256:985220252f3863977e468f611ef118ebd01421289dd86ee1ae99cb068c3bce2b
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV IRIS_UPSTREAM=http://iris:52773 \
    IRIS_API_PREFIX=/api/admin \
    IRIS_ALLOWED_ORIGINS=""
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
