# syntax=docker/dockerfile:1

# ---- deps: shared node_modules ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- dev: vite dev server / tests / sim (source is bind-mounted) ----
FROM deps AS dev
ENV VITE_POLL=1
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---- build: typecheck, tests, production bundle ----
FROM deps AS build
COPY . .
RUN npm test && npm run build

# ---- prod: static files behind nginx ----
FROM nginx:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
