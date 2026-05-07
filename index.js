// index.js
import { Tools } from "node-sped-nfe";
import fs from "fs";

const CNPJ = String(process.env.CNPJ || "").replace(/\D/g, "");
const UF = process.env.UF;
const TP_AMB = Number(process.env.TP_AMB || 1);
const CERT_PATH = process.env.CERT_PATH || "./cert.pfx";
const CERT_PASSWORD = process.env.CERT_PASSWORD;
const ULT_NSU_INICIAL = process.env.ULT_NSU || "000000000000000";
const MAX_CONSULTAS = Number(process.env.MAX_CONSULTAS || 20);

if (!CNPJ || CNPJ.length !== 14) {
  console.error("❌ CNPJ inválido. Defina a variável CNPJ com 14 dígitos.");
  process.exit(1);
}
if (!UF) {
  console.error("❌ UF não definida.");
  process.exit(1);
}
if (!CERT_PASSWORD) {
  console.error("❌ CERT_PASSWORD não definida.");
  process.exit(1);
}
if (!fs.existsSync(CERT_PATH)) {
  console.error(`❌ Certificado não encontrado em ${CERT_PATH}`);
  process.exit(1);
}

const pfx = fs.readFileSync(CERT_PATH);

const tools = new Tools(
  {
    UF,
    tpAmb: TP_AMB,
    versao: "4.00",
    CNPJ,
    timeout: 30,
  },
  {
    pfx,
    senha: CERT_PASSWORD,
  }
);

async function main() {
  let ultNSU = String(ULT_NSU_INICIAL).padStart(15, "0");
  console.log(`[${new Date().toISOString()}] Iniciando DistDFe ultNSU=${ultNSU}`);

  for (let i = 1; i <= MAX_CONSULTAS; i++) {
    console.log(`\n🔄 Consulta #${i} — ultNSU=${ultNSU}`);

    let resp;
    try {
      resp = await tools.sefazDistDFe({ ultNSU });
    } catch (err) {
      console.error("❌ ERRO na chamada sefazDistDFe:", err?.message || err);
      throw err;
    }

    const retorno = resp?.data?.retDistDFeInt || resp?.retDistDFeInt || resp;
    const cStat = retorno?.cStat;
    const xMotivo = retorno?.xMotivo;
    const novoUltNSU = retorno?.ultNSU || ultNSU;
    const maxNSU = retorno?.maxNSU;

    console.log(`   cStat=${cStat} | ${xMotivo}`);
    console.log(`   ultNSU=${novoUltNSU} | maxNSU=${maxNSU}`);

    const loteDocs = retorno?.loteDistDFeInt?.docZip;
    if (loteDocs) {
      const docs = Array.isArray(loteDocs) ? loteDocs : [loteDocs];
      console.log(`   📦 ${docs.length} documento(s) recebido(s).`);
      // TODO: processar/salvar docs aqui (descompactar gzip + base64).
    }

    // 137 = Nenhum documento localizado / 138 = Documento localizado
    if (cStat === "137" || cStat === "656" || !maxNSU || novoUltNSU >= maxNSU) {
      console.log("✅ Fim das consultas.");
      break;
    }

    ultNSU = String(novoUltNSU).padStart(15, "0");
  }
}

main().catch((err) => {
  console.error("❌ ERRO:", err?.message || err);
  process.exit(1);
});
