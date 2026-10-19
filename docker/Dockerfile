# Base images are pinned by digest (multi-architecture indexes); bump them deliberately.
# ---- build stage: compile the SPA -------------------------------------------
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime: nginx serves the SPA and proxies /api/admin to IRIS ------------
# nginx 1.30, the stable line in September 2026
FROM nginx:1.31-alpine@sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV IRIS_UPSTREAM=http://iris:52773 \
    IRIS_API_PREFIX=/api/admin \
    IRIS_ALLOWED_ORIGINS=""
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
