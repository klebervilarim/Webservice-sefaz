const fs = require("fs");
const https = require("https");

const certificado = fs.readFileSync("cert.pfx");

const agent = new https.Agent({
  pfx: certificado,
  passphrase: "Kc12345@",
});

console.log("CERTIFICADO OK");