const express = require("express");
const axios = require("axios");
const https = require("https");
const cors = require("cors");
const xml2js = require("xml2js");
const zlib = require("zlib");

const app = express();

app.use(cors());
app.use(express.json());

// ========================================
// HEALTHCHECK
// ========================================

app.get("/", (req, res) => {
  res.send("API NF-e ONLINE");
});

// ========================================
// BUSCAR NOTAS
// ========================================

app.post("/buscar-notas", async (req, res) => {

  try {

    const { cnpj, ultNSU } = req.body;

    if (!cnpj) {
      return res.status(400).json({
        erro: "CNPJ obrigatório"
      });
    }

    // ========================================
    // CERTIFICADO VARIAVEIS RAILWAY
    // ========================================

    const cert = process.env.CERT_PEM;

    const key = process.env.CERT_KEY;

    if (!cert) {
      return res.status(500).json({
        erro: "CERT_PEM não configurado"
      });
    }

    if (!key) {
      return res.status(500).json({
        erro: "CERT_KEY não configurado"
      });
    }

    console.log("CERT_PEM OK");
    console.log("CERT_KEY OK");

    // ========================================
    // HTTPS AGENT
    // ========================================

    const agent = new https.Agent({
      cert,
      key,
      rejectUnauthorized: false,
    });

    console.log("HTTPS AGENT OK");

    // ========================================
    // SOAP XML
    // ========================================

    const soap = `
    <soapenv:Envelope
      xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
      xmlns:nfe="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">

      <soapenv:Header/>

      <soapenv:Body>

        <nfe:nfeDistDFeInteresse>

          <nfe:nfeDadosMsg>

            <distDFeInt
              xmlns="http://www.portalfiscal.inf.br/nfe"
              versao="1.01">

              <tpAmb>1</tpAmb>

              <cUFAutor>35</cUFAutor>

              <CNPJ>${cnpj}</CNPJ>

              <distNSU>
                <ultNSU>${ultNSU || "000000000000000"}</ultNSU>
              </distNSU>

            </distDFeInt>

          </nfe:nfeDadosMsg>

        </nfe:nfeDistDFeInteresse>

      </soapenv:Body>

    </soapenv:Envelope>
    `;

    console.log("Consultando SEFAZ...");

    // ========================================
    // CHAMADA SEFAZ
    // ========================================

    const response = await axios.post(
      "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
      soap,
      {
        httpsAgent: agent,
        headers: {
          "Content-Type": "text/xml;charset=UTF-8",
          SOAPAction:
            "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse",
        },
        timeout: 30000,
      }
    );

    console.log("SEFAZ respondeu");

    // ========================================
    // XML → JSON
    // ========================================

    const parser = new xml2js.Parser({
      explicitArray: false
    });

    const json = await parser.parseStringPromise(
      response.data
    );

    const ret =
      json["soap:Envelope"]
      ["soap:Body"]
      ["nfeDistDFeInteresseResponse"]
      ["nfeDistDFeInteresseResult"]
      ["retDistDFeInt"];

    // ========================================
    // STATUS
    // ========================================

    const cStat = ret.cStat;
    const xMotivo = ret.xMotivo;

    console.log("STATUS:", cStat);
    console.log("MOTIVO:", xMotivo);

    // ========================================
    // DOCUMENTOS
    // ========================================

    let notas = [];

    const lote = ret.loteDistDFeInt;

    if (lote && lote.docZip) {

      const docs = Array.isArray(lote.docZip)
        ? lote.docZip
        : [lote.docZip];

      for (const doc of docs) {

        try {

          const xml =
            zlib.gunzipSync(
              Buffer.from(doc._, "base64")
            ).toString("utf8");

          notas.push({
            nsu: doc.$.NSU,
            schema: doc.$.schema,
            xml
          });

        } catch (e) {

          console.error(
            "Erro descompactar XML",
            e.message
          );
        }
      }
    }

    // ========================================
    // RESPOSTA
    // ========================================

    return res.json({
      sucesso: true,
      cStat,
      xMotivo,
      ultNSU: ret.ultNSU,
      maxNSU: ret.maxNSU,
      quantidadeNotas: notas.length,
      notas
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      erro: error.message,
      detalhes:
        error.response?.data || null
    });
  }
});

// ========================================
// START SERVER
// ========================================

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando ${PORT}`);
});