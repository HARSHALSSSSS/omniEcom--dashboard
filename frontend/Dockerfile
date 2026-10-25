# syntax=docker/dockerfile:1.7
# Frontend image: Vite build (node) -> static files served by nginx-unprivileged (non-root, port 8080).
#   docker build -t oms-frontend frontend/
#   docker run -p 8080:8080 -e API_UPSTREAM=http://host.docker.internal:3000 oms-frontend
# Runtime config: API_UPSTREAM = where nginx forwards /api/ (default http://oms-api, the k8s Service name).
# VITE_* values are baked in at BUILD time (see .env.production); override with --build-arg if needed.

FROM node:26-alpine AS build
WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_USE_MOCKS=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_USE_MOCKS=$VITE_USE_MOCKS
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
ENV API_UPSTREAM=http://oms-api
# the image's entrypoint renders *.template files through envsubst into /etc/nginx/conf.d at start
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1
