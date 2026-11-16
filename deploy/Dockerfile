# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run lint && npm run typecheck && npm run build && node scripts/check-boundary.mjs --compiled
FROM nginx:1.30.6-alpine@sha256:901e593c95dc85f5a729f5765516321366ef4ac401821431d408897e95287d0a
RUN apk upgrade --no-cache \
    && apk del nginx-module-xslt nginx-module-njs nginx-module-image-filter nginx-module-geoip nginx-module-acme
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/customers/browser /usr/share/nginx/html
EXPOSE 80
