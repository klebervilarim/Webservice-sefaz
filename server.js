const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("API ONLINE");
});

app.post("/buscar-notas", (req, res) => {

  console.log("BODY:", req.body);

  return res.json({
    sucesso: true,
    recebido: req.body
  });

});

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});