
import { NFE } from "node-sped-nfe";
// ... seus imports

async function main() {
  console.log(`[${new Date().toISOString()}] Iniciando DistDFe…`);
  
  try {
    const nfe = new NFE({
      // sua config: certificado, UF, CNPJ, ambiente, etc
    });

    const ultNSU = process.env.ULT_NSU || "000000000000000";
    console.log(`DistDFe ultNSU=${ultNSU}`);

    const result = await nfe.distDFeInteresse({ ultNSU });
    
    console.log("Resposta SEFAZ:", JSON.stringify(result, null, 2));

    const docs = result?.loteDistDFeInt?.docZip || [];
    console.log(`Recebidos ${Array.isArray(docs) ? docs.length : (docs ? 1 : 0)} documentos`);

    // Para cada doc, enviar webhook
    for (const doc of (Array.isArray(docs) ? docs : [docs].filter(Boolean))) {
      const resp = await fetch(process.env.WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": process.env.WEBHOOK_SECRET,
        },
        body: JSON.stringify({
          user_id: process.env.USER_ID,
          doc_zip: doc,
        }),
      });
      console.log(`Webhook → ${resp.status}`);
    }

    console.log("✅ Concluído");
    process.exit(0);
  } catch (err) {
    console.error("❌ ERRO:", err?.message || err);
    console.error(err?.stack);
    process.exit(1);
  }
}

main();
