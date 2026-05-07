import { Tools, docZip } from "node-sped-nfe";
import fs from "fs";
import path from "path";

// ===== Variáveis de ambiente (configurar no Render) =====
const {
  CERT_PATH,           // ex: ./cert.pfx  (ou caminho absoluto)
  CERT_BASE64,         // alternativa: certificado em base64
  CERT_PASSWORD,       // senha do .pfx
  CNPJ,                // CNPJ da empresa (somente números)
  UF,                  // ex: SP, MG, RS...
  TP_AMB = "1",        // 1=produção, 2=homologação
  WEBHOOK_URL,         // URL do endpoint Lovable que recebe as notas
  WEBHOOK_SECRET,      // segredo compartilhado p/ autenticar no webhook
  ULT_NSU = "000000000000000",
} = process.env;

if (!CERT_PASSWORD || !CNPJ || !UF || !WEBHOOK_URL) {
  console.error("❌ Variáveis obrigatórias ausentes: CERT_PASSWORD, CNPJ, UF, WEBHOOK_URL");
  process.exit(1);
}

// ===== Carrega o certificado =====
let pfxBuffer;
if (CERT_BASE64) {
  pfxBuffer = Buffer.from(CERT_BASE64, "base64");
} else if (CERT_PATH && fs.existsSync(CERT_PATH)) {
  pfxBuffer = fs.readFileSync(path.resolve(CERT_PATH));
} else {
  console.error("❌ Certificado não encontrado. Defina CERT_BASE64 ou CERT_PATH.");
  process.exit(1);
}

// ===== Instancia o Tools =====
const tools = new Tools(
  {
    mod: "55",
    UF,
    tpAmb: Number(TP_AMB),
    CNPJ,
    versao: "4.00",
    timeout: 60000,
    xmllint: "xmllint",
    openssl: "openssl",
  },
  {
    pfx: pfxBuffer,
    senha: CERT_PASSWORD,
  }
);

// ===== Envia notas para o webhook do Lovable =====
async function enviarParaWebhook(documentos) {
  if (!documentos || documentos.length === 0) {
    console.log("ℹ️ Nenhum documento novo.");
    return;
  }
  console.log(`📤 Enviando ${documentos.length} documento(s) ao webhook...`);
  const resp = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(WEBHOOK_SECRET ? { "x-webhook-secret": WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({ cnpj: CNPJ, documentos }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Webhook respondeu ${resp.status}: ${t}`);
  }
  console.log("✅ Webhook OK");
}

// ===== Loop DistDFe =====
async function main() {
  console.log(`[${new Date().toISOString()}] Iniciando DistDFe ultNSU=${ULT_NSU}`);
  try {
    let ultNSU = ULT_NSU;
    let maxNSU = "0";
    let iteracao = 0;

    do {
      iteracao++;
      console.log(`🔄 Consulta #${iteracao} — ultNSU=${ultNSU}`);

      const xmlResposta = await tools.distDFeInteresse(ultNSU);
      const documentos = await docZip(xmlResposta);

      // Extrai cStat / ultNSU / maxNSU da resposta
      const cStat = (xmlResposta.match(/<cStat>(\d+)<\/cStat>/) || [])[1];
      ultNSU = (xmlResposta.match(/<ultNSU>(\d+)<\/ultNSU>/) || [])[1] || ultNSU;
      maxNSU = (xmlResposta.match(/<maxNSU>(\d+)<\/maxNSU>/) || [])[1] || maxNSU;

      console.log(`📊 cStat=${cStat} ultNSU=${ultNSU} maxNSU=${maxNSU} docs=${documentos?.length || 0}`);

      await enviarParaWebhook(documentos);

      // 138 = documentos localizados (continuar)
      // 137 = nenhum documento (parar)
      if (cStat !== "138") break;
      if (iteracao >= 20) {
        console.log("⚠️ Limite de 20 iterações atingido, encerrando ciclo.");
        break;
      }
    } while (Number(ultNSU) < Number(maxNSU));

    console.log("✅ Concluído");
    process.exit(0);
  } catch (err) {
    console.error("❌ ERRO:", err?.message);
    console.error(err?.stack);
    process.exit(1);
  }
}

main();
