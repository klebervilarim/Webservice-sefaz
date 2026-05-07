import fs from 'fs';
import cron from 'node-cron';
import fetch from 'node-fetch';
import { Tools, xml2json, docZip } from 'node-sped-nfe';

const {
  CERT_BASE64,
  CERT_PATH,
  CERT_PASSWORD,
  CNPJ,
  UF = 'SP',
  TP_AMB = '1', // 1=produção, 2=homologação
  USER_ID,
  WEBHOOK_URL,
  WEBHOOK_SECRET,
  CRON = '*/15 * * * *'
} = process.env;

if (!CERT_PASSWORD || !CNPJ || !USER_ID || !WEBHOOK_URL || !WEBHOOK_SECRET) {
  console.error('Faltam variáveis de ambiente obrigatórias.');
  process.exit(1);
}

let pfxBuffer;
if (CERT_BASE64) {
  pfxBuffer = Buffer.from(CERT_BASE64, 'base64');
} else if (CERT_PATH && fs.existsSync(CERT_PATH)) {
  pfxBuffer = fs.readFileSync(CERT_PATH);
} else {
  console.error('Defina CERT_BASE64 ou CERT_PATH.');
  process.exit(1);
}

const tools = new Tools(
  { mod: '55', UF, tpAmb: Number(TP_AMB), CNPJ: CNPJ.replace(/\D/g, ''), versao: '4.00', timeout: 60 },
  { pfx: pfxBuffer, senha: CERT_PASSWORD }
);

let ultNSU = process.env.START_NSU || '000000000000000';

async function processar() {
  console.log(`[${new Date().toISOString()}] DistDFe ultNSU=${ultNSU}`);
  try {
    const xmlResp = await tools.sefazDistDFe({ ultNSU });
    const json = await xml2json(xmlResp);
    const ret = json?.['soap:Envelope']?.['soap:Body']?.['nfeDistDFeInteresseResponse']?.['nfeDistDFeInteresseResult']?.['retDistDFeInt'];
    if (!ret) { console.log('Sem retorno'); return; }
    const cStat = ret.cStat;
    const novoUltNSU = ret.ultNSU || ultNSU;
    console.log('cStat=', cStat, 'maxNSU=', ret.maxNSU, 'ultNSU=', novoUltNSU);
    let docs = ret?.loteDistDFe?.docZip || [];
    if (!Array.isArray(docs)) docs = [docs];
    const notas = [];
    for (const dz of docs) {
      try {
        const xml = await docZip(dz['#text'] || dz);
        const j = await xml2json(xml);
        const inf = j?.nfeProc?.NFe?.infNFe || j?.NFe?.infNFe || j?.resNFe;
        if (!inf) continue;
        const chave = (inf['@Id'] || '').replace(/^NFe/, '') || inf.chNFe;
        notas.push({
          user_id: USER_ID,
          chave,
          numero: inf?.ide?.nNF || '',
          serie: String(inf?.ide?.serie || '1'),
          emitente_nome: inf?.emit?.xNome || inf?.xNome || '',
          emitente_cnpj: inf?.emit?.CNPJ || inf?.CNPJ || '',
          destinatario_cnpj: inf?.dest?.CNPJ || CNPJ.replace(/\D/g, ''),
          data_emissao: inf?.ide?.dhEmi || inf?.dhEmi || new Date().toISOString(),
          valor: Number(inf?.total?.ICMSTot?.vNF || inf?.vNF || 0),
          status: 'Pendente',
          xml,
          ambiente: TP_AMB === '1' ? 'producao' : 'homologacao'
        });
      } catch (e) { console.error('docZip err', e.message); }
    }
    if (notas.length) {
      const r = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': WEBHOOK_SECRET },
        body: JSON.stringify({ notas })
      });
      console.log('webhook', r.status, await r.text());
    }
    ultNSU = novoUltNSU;
  } catch (e) {
    console.error('erro', e?.message || e);
  }
}

processar();
cron.schedule(CRON, processar);
console.log('Worker iniciado. CRON=', CRON);
