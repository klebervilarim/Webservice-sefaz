const express = require("express");
const axios = require("axios");
const https = require("https");
const xml2js = require("xml2js");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());

app.use(express.json());

app.get("/", (req, res) => {
  res.send("API NF-e ONLINE");
});

app.post("/buscar-notas", async (req, res) => {

  try {

    const { cnpj, ultNSU } = req.body;

    const certificado = Buffer.from(
      process.env.CERT_BASE64,
      "base64"
    );

    const agent = new https.Agent({
      pfx: certificado,
      passphrase: process.env.CERT_PASS,
      rejectUnauthorized: false,
    });

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

    const parser = new xml2js.Parser({
      explicitArray: false
    });

    const json = await parser.parseStringPromise(
      response.data
    );

    return res.json(json);

  } catch (error) {

    console.error(error.response?.data || error.message);

    return res.status(500).json({
      erro: error.message,
      detalhes: error.response?.data || null
    });
  }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando ${PORT}`);
});