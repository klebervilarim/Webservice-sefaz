import 'dotenv/config';
import fs from 'node:fs';
import cron from 'node-cron';
import { NFE } from 'node-sped-nfe';

const {
  CERT_PATH, CERT_PASSWORD, CNPJ, AMBIENTE = '1', UF = 'SP',
  WEBHOOK_URL, WEBHOOK_SECRET, USER_ID, CRON = '*/15 * * * *'
} = process.env;

if (!CERT_PATH || !CERT_PASSWORD || !CNPJ || !WEBHOOK_URL || !WEBHOOK_SECRET || !USER_ID) {
  console.error('Faltam variaveis de ambiente. Veja .env.example');
  process.exit(1);
}

let ultimoNSU = '0';

const cfg = {
  ambiente: Number(AMBIENTE),
  estado: UF,
  CPFCNPJ: CNPJ,
  versao: '4.00',
  pfx: fs.readFileSync(CERT_PATH),
  senha: CERT_PASSWORD,
};

function parseChave(xml) {
  const m = xml.match(/Id="NFe(\d{44})"/);
  return m ? m[1] : null;
}
function tag(xml, t) {
  const m = xml.match(new RegExp(`<${t}>([^<]+)</${t}>`));
  return m ? m[1] : '';
}

async function consultar() {
  console.log(`[${new Date().toISOString()}] Consultando SEFAZ NSU=${ultimoNSU}...`);
  try {
    const nfe = new NFE(cfg);
    const resp = await nfe.NFEDistribuicaoDFe({ ultNSU: ultimoNSU });
    const docs = resp?.loteDistDFeInt?.docZip ?? [];
    const lista = Array.isArray(docs) ? docs : [docs];

    const notas = [];
    for (const d of lista) {
      const xml = Buffer.from(d._ ?? d, 'base64').toString('utf8');
      if (!xml.includes('<NFe')) continue;
      const chave = parseChave(xml);
      if (!chave) continue;
      notas.push({
        user_id: USER_ID,
        chave,
        numero: tag(xml, 'nNF'),
        serie: tag(xml, 'serie') || '1',
        emitente_nome: tag(xml, 'xNome'),
        emitente_cnpj: tag(xml, 'CNPJ'),
        destinatario_cnpj: CNPJ,
        data_emissao: tag(xml, 'dhEmi') || new Date().toISOString(),
        valor: Number(tag(xml, 'vNF') || 0),
        status: 'Pendente',
        xml,
        ambiente: AMBIENTE === '1' ? 'producao' : 'homologacao',
      });
    }

    if (resp?.ultNSU) ultimoNSU = resp.ultNSU;

    if (notas.length === 0) {
      console.log('Nenhuma nota nova.');
      return;
    }

    const r = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': WEBHOOK_SECRET },
      body: JSON.stringify({ notas }),
    });
    console.log(`Enviadas ${notas.length} notas -> webhook status ${r.status}`);
  } catch (e) {
    console.error('Erro ao consultar SEFAZ:', e.message);
  }
}

console.log('Worker SEFAZ iniciado. Cron:', CRON);
cron.schedule(CRON, consultar);
consultar();

// keep-alive http para Render Web Service free tier
import http from 'node:http';
http.createServer((_, res) => res.end('ok')).listen(process.env.PORT || 3000);
