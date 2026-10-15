# Dispatcher web app: static Vite build served on $PORT.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Public client config, baked in at build time (set as Railway service variables).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL
ARG VITE_WEBSOCKET_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve@14.2.4
COPY --from=build /app/dist ./dist
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT}"]
