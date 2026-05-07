import "dotenv/config";
import { Tools, docZip } from "node-sped-nfe";
import fs from "node:fs";

const {
  CERT_BASE64, CERT_PATH, CERT_PASSWORD,
  CNPJ, UF, TP_AMB = "1",
  WEBHOOK_URL, WEBHOOK_SECRET,
} = process.env;

function carregarPfx() {
  if (CERT_BASE64) return Buffer.from(CERT_BASE64, "base64").toString("binary");
  if (CERT_PATH) return fs.readFileSync(CERT_PATH, "binary");
  throw new Error("Defina CERT_BASE64 ou CERT_PATH");
}

async function enviarParaWebhook(documentos) {
  if (!documentos.length) return;
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": WEBHOOK_SECRET ?? "",
    },
    body: JSON.stringify({ cnpj: CNPJ, documentos }),
  });
  console.log(`📤 Webhook: ${res.status}`);
}

async function main() {
  const tools = new Tools(
    {
      mod: "55",
      xmllint: "xmllint",
      UF,
      tpAmb: Number(TP_AMB),
      CSC: "",
      CSCid: "",
      versao: "4.00",
      timeout: 60000,
      openssl: null,
      CPF: "",
      CNPJ,
    },
    { pfx: carregarPfx(), senha: CERT_PASSWORD }
  );

  let ultNSU = process.env.ULT_NSU || "000000000000000";
  console.log(`[${new Date().toISOString()}] Iniciando DistDFe ultNSU=${ultNSU}`);

  for (let i = 1; i <= 20; i++) {
    console.log(`🔄 Consulta #${i} — ultNSU=${ultNSU}`);
    const xmlResp = await tools.sefazDistDFe({ ultNSU });
    const json = await tools.xml2json(xmlResp);

    // Navega no retorno SOAP -> retDistDFeInt
    const ret =
      json?.["soap:Envelope"]?.["soap:Body"]?.nfeDistDFeInteresseResponse
        ?.nfeDistDFeInteresseResult?.retDistDFeInt ??
      json?.retDistDFeInt;

    const cStat = ret?.cStat;
    const novoUltNSU = ret?.ultNSU ?? ultNSU;
    const maxNSU = ret?.maxNSU ?? ultNSU;
    console.log(`   cStat=${cStat} ultNSU=${novoUltNSU} maxNSU=${maxNSU}`);

    const docs = ret?.loteDistDFeInt?.docZip;
    if (docs) {
      const arr = Array.isArray(docs) ? docs : [docs];
      const documentos = arr.map((d) => ({
        nsu: d?.["@_NSU"] ?? d?.NSU,
        schema: d?.["@_schema"] ?? d?.schema,
        xml: docZip(typeof d === "string" ? d : d["#text"] ?? d._),
      }));
      await enviarParaWebhook(documentos);
    }

    ultNSU = novoUltNSU;
    if (cStat !== "138") {
      console.log(`   Fim do loop (cStat=${cStat}).`);
      break;
    }
    if (novoUltNSU === maxNSU) break;
  }

  console.log("✅ Concluído");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ ERRO:", e?.message);
  console.error(e);
  process.exit(1);
});
