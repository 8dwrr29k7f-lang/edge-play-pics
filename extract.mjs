/** Unpack src.zip → src/ using adm-zip (available after npm install) */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const indexPath = path.join("src", "index.js");
if (fs.existsSync(indexPath)) {
  console.log("src/index.js already present — skip unpack");
  process.exit(0);
}

if (!fs.existsSync("src.zip")) {
  console.error("FATAL: no src/index.js and no src.zip");
  process.exit(1);
}

const require = createRequire(import.meta.url);
let AdmZip;
try {
  AdmZip = require("adm-zip");
} catch {
  console.error("FATAL: adm-zip not installed. Run npm install.");
  process.exit(1);
}

console.log("Unpacking src.zip into src/ (node adm-zip)...");
fs.mkdirSync("src", { recursive: true });
const zip = new AdmZip("src.zip");
zip.extractAllTo("src", true);

if (!fs.existsSync(indexPath)) {
  console.error("FATAL: src/index.js still missing after unpack");
  try {
    console.error(fs.readdirSync("src").join(", "));
  } catch {}
  process.exit(1);
}
console.log("Unpack OK");
