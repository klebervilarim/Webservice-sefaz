import nfePkg from "node-sped-nfe";

const NFE = nfePkg.NFE || nfePkg.default || nfePkg;

async function main() {
  console.log(`[${new Date().toISOString()}] Iniciando DistDFe...`);

  try {
    const nfe = new NFE({
      cert: process.env.CERT_BASE64,
      password: process.env.CERT_PASSWORD,
      cnpj: process.env.CNPJ,
      uf: process.env.UF,
      tpAmb: process.env.TP_AMB || "1",
    });

    const ultNSU = String(process.env.ULT_NSU || "0").padStart(15, "0");

    console.log(`[${new Date().toISOString()}] DistDFe ultNSU=${ultNSU}`);

    // resto da sua lógica aqui...

    console.log("✅ Concluído");
    process.exit(0);
  } catch (err) {
    console.error("❌ ERRO:", err?.message || err);
    console.error(err?.stack);
    process.exit(1);
  }
}

main();
