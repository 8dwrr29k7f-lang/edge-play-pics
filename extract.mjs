/** Always unpack src.zip → src/ so Railway gets latest desk code */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

if (!fs.existsSync("src.zip")) {
  if (fs.existsSync(path.join("src", "index.js"))) {
    console.log("No src.zip — using existing src/");
    process.exit(0);
  }
  console.error("FATAL: no src.zip and no src/index.js");
  process.exit(1);
}

const require = createRequire(import.meta.url);
let AdmZip;
try {
  AdmZip = require("adm-zip");
} catch {
  console.error("FATAL: adm-zip missing — npm install failed?");
  process.exit(1);
}

console.log("Unpacking src.zip into src/ (node adm-zip)...");
fs.mkdirSync("src", { recursive: true });
const zip = new AdmZip("src.zip");
zip.extractAllTo("src", true);

const indexPath = path.join("src", "index.js");
if (!fs.existsSync(indexPath)) {
  console.error("FATAL: src/index.js missing after unpack");
  try {
    console.error(fs.readdirSync("src").join(", "));
  } catch {}
  process.exit(1);
}
console.log(
  "Unpack OK — modules:",
  fs.readdirSync("src").filter((f) => f.endsWith(".js")).length
);
