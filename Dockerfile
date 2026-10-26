# Gut Check server edition: serves the app, syncs your journal, keeps backups, sends reminders,
# and talks to the local AI model (Ollama) for the devil's advocate. No npm dependencies.
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
WORKDIR /app
COPY package.json ./
COPY server/ ./server/
COPY public/ ./public/
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q --spider http://127.0.0.1:8080/api/status || exit 1
CMD ["node", "server/server.js"]
