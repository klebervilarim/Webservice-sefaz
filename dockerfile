FROM node:20-slim

# Instala xmllint (libxml2-utils) — exigido pelo node-sped-nfe
RUN apt-get update \
 && apt-get install -y --no-install-recommends libxml2-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]

