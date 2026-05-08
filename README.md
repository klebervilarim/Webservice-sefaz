# Backend NF-e (Railway)

Backend Node.js que faz `NFeDistribuicaoDFe` na SEFAZ via mTLS ICP-Brasil (cert A1 `.pfx`)
e grava as notas recebidas no Lovable Cloud (Supabase) na tabela `notas_recebidas`.

A tela `/fiscal/recebidas` no Lovable consome `GET /notas/:cnpj?ambiente=producao`.

## 1. Subir no Railway

1. Crie um novo projeto no Railway → **Deploy from GitHub** (ou faça upload desta pasta como repo).
2. Em **Variables**, adicione:

| Variável | Valor |
|---|---|
| `CERT_PASSWORD` | senha do seu `.pfx` |
| `CERT_PATH` | `/etc/secrets/cert.pfx` (padrão) ou caminho onde colocar o cert |
| `UF` | `SP` (sua UF) |
| `SUPABASE_URL` | `https://fkyggyiyvxfyylktsaba.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (pegue em Lovable Cloud → Backend → API) |
| `OWNER_USER_ID` | seu `user_id` no Lovable (uuid) — necessário para o RLS |
| `MAX_CONSULTAS` | `20` |
| `PORT` | (Railway define automaticamente) |

3. **Certificado `.pfx`**: como o Railway não tem "Secret Files" estilo Render, você tem duas opções:

   **Opção A (recomendada) — Volume persistente:**
   - No Railway, adicione um **Volume** ao serviço, montado em `/etc/secrets`.
   - Faça upload do `cert.pfx` via `railway run` ou conecte por shell e copie o arquivo.

   **Opção B — Variável Base64:**
   - Gere base64 do `.pfx`:
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Set-Clipboard
     ```
   - Adicione variável `CERT_PFX_BASE64` com o conteúdo.
   - Adicione no topo do `index.js` (antes de `readCert`):
     ```js
     if (process.env.CERT_PFX_BASE64 && !fs.existsSync(CERT_PATH)) {
       fs.mkdirSync(path.dirname(CERT_PATH), { recursive: true });
       fs.writeFileSync(CERT_PATH, Buffer.from(process.env.CERT_PFX_BASE64, "base64"));
     }
     ```

4. Após o deploy, copie a URL pública do Railway (ex: `https://meubackend.up.railway.app`).

## 2. Conectar no Lovable

Abra `/fiscal/recebidas` no app, cole a URL no campo **"URL do backend NF-e"**, escolha o ambiente e clique em **Consultar SEFAZ**.

## 3. Endpoints

- `GET /health` → healthcheck
- `GET /notas/:cnpj?ambiente=producao` → consulta DistDFe e grava em `notas_recebidas`

## 4. Onde achar o `OWNER_USER_ID`

No Lovable, abra o console do navegador logado e rode:
```js
(await (await fetch('https://fkyggyiyvxfyylktsaba.supabase.co/auth/v1/user', {
  headers: { Authorization: 'Bearer ' + JSON.parse(localStorage.getItem('sb-fkyggyiyvxfyylktsaba-auth-token')).access_token, apikey: 'PUBLISHABLE_KEY' }
})).json()).id
```
Ou consulte na tabela `auth.users` pelo Lovable Cloud → Backend.
