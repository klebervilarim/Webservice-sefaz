// Backend NF-e — Railway
// Endpoint: GET /notas/:cnpj?ambiente=producao|homologacao
// Faz NFeDistribuicaoDFe via node-sped-nfe (mTLS ICP-Brasil A1)
// e grava cada documento em `notas_recebidas` no Supabase (Lovable Cloud).

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { parseStringPromise } from "xml2js";
import { createClient } from "@supabase/supabase-js";
import { Tools } from "node-sped-nfe";

// ---------- Config ----------
const PORT = process.env.PORT || 3000;
const UF = process.env.UF || "SP";
const CERT_PATH = process.env.CERT_PATH || "/etc/secrets/cert.pfx";
const CERT_PASSWORD = process.env.CERT_PASSWORD;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_USER_ID = process.env.OWNER_USER_ID; // user_id que vai "dono" das notas inseridas
const MAX_CONSULTAS = Number(process.env.MAX_CONSULTAS || 20);

if (!CERT_PASSWORD) console.warn("⚠️ CERT_PASSWORD não definido");
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) console.warn("⚠️ SUPABASE_URL/SERVICE_ROLE_KEY não definidos");
if (!OWNER_USER_ID) console.warn("⚠️ OWNER_USER_ID não definido — notas serão gravadas sem dono e RLS bloqueará leitura");

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// ---------- Helpers ----------
function readCert() {
  if (!fs.existsSync(CERT_PATH)) throw new Error(`Certificado não encontrado em ${CERT_PATH}`);
  return fs.readFileSync(CERT_PATH);
}

async function unzipDoc(docZipBase64) {
  const buf = Buffer.from(docZipBase64, "base64");
  return new Promise((resolve, reject) => {
    zlib.gunzip(buf, (err, out) => err ? reject(err) : resolve(out.toString("utf-8")));
  });
}

function pick(o, ...keys) {
  for (const k of keys) {
    if (o && o[k] != null) return Array.isArray(o[k]) ? o[k][0] : o[k];
  }
  return null;
}

async function parseResNFe(xmlStr) {
  // resNFe = resumo de NF-e destinada
  const j = await parseStringPromise(xmlStr, { explicitArray: false, ignoreAttrs: false });
  const r = j.resNFe || j;
  return {
    chave: pick(r, "chNFe"),
    cnpjEmit: pick(r, "CNPJ"),
    nomeEmit: pick(r, "xNome"),
    dataEmissao: pick(r, "dhEmi"),
    valor: Number(pick(r, "vNF") || 0),
    numero: pick(r, "chNFe")?.slice(25, 34) ?? null,
    serie: pick(r, "chNFe")?.slice(22, 25) ?? null,
    xml: xmlStr,
  };
}

async function parseProcNFe(xmlStr) {
  const j = await parseStringPromise(xmlStr, { explicitArray: false, ignoreAttrs: false });
  const inf = j?.nfeProc?.NFe?.infNFe || j?.NFe?.infNFe;
  if (!inf) return null;
  const ide = inf.ide || {};
  const emit = inf.emit || {};
  const tot = inf.total?.ICMSTot || {};
  const chave = inf?.$?.Id?.replace("NFe", "") ?? null;
  return {
    chave,
    cnpjEmit: emit.CNPJ || emit.CPF || null,
    nomeEmit: emit.xNome || null,
    dataEmissao: ide.dhEmi || ide.dEmi || null,
    valor: Number(tot.vNF || 0),
    numero: ide.nNF || null,
    serie: ide.serie || null,
    xml: xmlStr,
  };
}

async function upsertNota(cnpjDest, ambiente, doc) {
  if (!supabase || !OWNER_USER_ID || !doc?.chave) return { skipped: true };
  const row = {
    user_id: OWNER_USER_ID,
    chave: doc.chave,
    numero: String(doc.numero ?? doc.chave.slice(25, 34)),
    serie: doc.serie ? String(doc.serie) : null,
    emitente_nome: doc.nomeEmit || "Desconhecido",
    emitente_cnpj: doc.cnpjEmit || "",
    destinatario_cnpj: cnpjDest,
    data_emissao: doc.dataEmissao || new Date().toISOString(),
    valor: doc.valor || 0,
    status: "Pendente",
    xml: doc.xml || null,
    ambiente,
  };
  const { error } = await supabase
    .from("notas_recebidas")
    .upsert(row, { onConflict: "chave" });
  if (error) console.error("upsert erro:", error.message);
  return { ok: !error };
}

// ---------- SEFAZ DistDFe loop ----------
async function distDFe({ cnpj, ambiente }) {
  const tpAmb = ambiente === "homologacao" ? 2 : 1;
  const pfx = readCert();

  const tools = new Tools({
    mod: "55",
    pfx,
    passphrase: CERT_PASSWORD,
    cUF: UF,
    UF,
    tpAmb,
    CSC: "",
    CSCid: "",
  });

  let ultNSU = "000000000000000";
  const docs = [];

  for (let i = 0; i < MAX_CONSULTAS; i++) {
    const xml = await tools.sefazDistDFe({ cnpj, ultNSU });
    const j = await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: false });
    const ret = j?.["soap:Envelope"]?.["soap:Body"]?.nfeDistDFeInteresseResponse?.nfeDistDFeInteresseResult?.retDistDFeInt
             || j?.retDistDFeInt;
    if (!ret) break;

    const cStat = ret.cStat;
    const novoUltNSU = ret.ultNSU || ultNSU;
    const maxNSU = ret.maxNSU;
    const loteList = ret.loteDistDFeInt?.docZip;
    const lote = loteList ? (Array.isArray(loteList) ? loteList : [loteList]) : [];

    for (const item of lote) {
      const schema = item?.$?.schema || "";
      const b64 = item?._ ?? item;
      try {
        const xmlDoc = await unzipDoc(b64);
        let doc = null;
        if (schema.startsWith("resNFe")) doc = await parseResNFe(xmlDoc);
        else if (schema.startsWith("procNFe")) doc = await parseProcNFe(xmlDoc);
        if (doc) {
          docs.push(doc);
          await upsertNota(cnpj, ambiente, doc);
        }
      } catch (e) {
        console.warn("falha doc:", e.message);
      }
    }

    if (cStat === "137" || cStat === "656" || !maxNSU || Number(novoUltNSU) >= Number(maxNSU)) break;
    ultNSU = String(novoUltNSU).padStart(15, "0");
  }

  return { total: docs.length, docs };
}

// ---------- HTTP ----------
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/", (_req, res) => res.json({ ok: true, service: "nfe-distdfe" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/notas/:cnpj", async (req, res) => {
  try {
    const cnpj = String(req.params.cnpj).replace(/\D/g, "");
    const ambiente = req.query.ambiente === "homologacao" ? "homologacao" : "producao";
    if (cnpj.length !== 14) return res.status(400).json({ error: "CNPJ inválido" });

    const result = await distDFe({ cnpj, ambiente });
    res.json({ cnpj, ambiente, total: result.total, notas: result.docs.map(d => ({
      chave: d.chave, numero: d.numero, emitente: d.nomeEmit, valor: d.valor, dataEmissao: d.dataEmissao,
    })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.listen(PORT, () => console.log(`✅ Backend NF-e on :${PORT}`));
