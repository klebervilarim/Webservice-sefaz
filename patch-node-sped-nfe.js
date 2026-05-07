import fs from "fs";
import path from "path";

const file = path.resolve(
  "node_modules/node-sped-nfe/dist/utils/eventos.js"
);

if (!fs.existsSync(file)) {
  console.log("node-sped-nfe não encontrado para aplicar patch.");
  process.exit(0);
}

let content = fs.readFileSync(file, "utf8");

const original = `function urlEventos(UF, versao) {
    switch (\`\${versao}\`) {
        case "4.00":
            return {
                mod65: event65.eventos(UF),
                mod55: event55.eventos(UF)
            };
        default:
            throw \`Versão incompativel! Tools({...versao:\${versao}})\`;
            break;
    }
}`;

const patched = `function urlEventos(UF, versao) {
    switch (\`\${versao}\`) {
        case "4.00":
            if (UF === "AN") {
                return {
                    mod55: event55.eventos(UF)
                };
            }

            return {
                mod65: event65.eventos(UF),
                mod55: event55.eventos(UF)
            };
        default:
            throw \`Versão incompativel! Tools({...versao:\${versao}})\`;
            break;
    }
}`;

if (content.includes(original)) {
  content = content.replace(original, patched);
  fs.writeFileSync(file, content);
  console.log("Patch aplicado em node-sped-nfe para DistDFe AN.");
} else if (content.includes(`if (UF === "AN")`)) {
  console.log("Patch node-sped-nfe já estava aplicado.");
} else {
  console.log("Não foi possível aplicar o patch automaticamente.");
}
