# ---- build stage: compile the SPA -------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime: nginx serves the SPA and proxies /api/admin to IRIS ------------
FROM nginx:1.27-alpine
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV IRIS_UPSTREAM=http://iris:52773 \
    IRIS_API_PREFIX=/api/admin
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
