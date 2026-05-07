FROM node:20-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends libxml2-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY patch-node-sped-nfe.js ./

RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
