FROM node:20-slim

# Dependências de sistema exigidas pelo node-sped-nfe
RUN apt-get update \
 && apt-get install -y libxml2-utils openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/render/project/src

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
