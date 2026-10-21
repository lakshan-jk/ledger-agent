# ledger-agent API — runs on Node 24 (built-in node:sqlite, no native build).
# The agent still talks to a local Ollama; point OLLAMA_URL at your host.
FROM node:24-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# On Docker Desktop, the host's Ollama is reachable at host.docker.internal.
ENV OLLAMA_URL=http://host.docker.internal:11434
ENV API_PORT=8787
EXPOSE 8787

# Seed once at container start if the DB is empty, then serve.
CMD ["sh", "-c", "npm run setup && npm run serve"]
