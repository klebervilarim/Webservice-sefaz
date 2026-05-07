# SEFAZ DistDFe Worker

Microservico Node que consulta a SEFAZ Nacional usando seu certificado A1 e envia as notas para o webhook do app Lovable.

## Como subir gratis no Render

1. Crie conta em https://render.com
2. Crie um repo no GitHub (publico ou privado) e suba esta pasta
3. No Render: **New > Web Service** > conecte seu repo
4. Tipo: **Node**, plano: **Free**
5. Antes do deploy, va em **Environment** e adicione:
   - `CERT_PASSWORD` = senha do seu .pfx
   - `WEBHOOK_SECRET` = mesmo valor do SEFAZ_WEBHOOK_SECRET no Lovable
   - `USER_ID` = seu user id (ja esta = 5f6ba09b-aa02-40dd-9da6-c8493c2cce06)
6. Em **Secret Files** adicione o arquivo `cert.pfx` (seu certificado A1)
7. Deploy

A cada 15 minutos o worker pergunta pra SEFAZ se tem nota nova e manda pro app.

## Rodar local
```
cp .env.example .env   # preencha
cp seu_certificado.pfx cert.pfx
npm install
npm start
```
