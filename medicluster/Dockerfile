# MediCluster web service: builds the React frontend, then runs the Express API,
# which also serves the built frontend from the same origin.

# ── Frontend build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Build-time public config (set in the Render dashboard; optional).
ARG VITE_GOOGLE_MAPS_KEY=""
ENV VITE_GOOGLE_MAPS_KEY=$VITE_GOOGLE_MAPS_KEY
RUN npm run build

# ── API + static server ──────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend /frontend/dist ./public
# Render injects PORT; server.js falls back to 5000 locally.
EXPOSE 5000
CMD ["node", "server.js"]
