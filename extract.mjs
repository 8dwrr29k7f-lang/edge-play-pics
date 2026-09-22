import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { execSync } from "child_process";

if (!fs.existsSync("src.zip")) {
  if (fs.existsSync(path.join("src", "index.js"))) {
    console.log("No src.zip — using existing src/");
    process.exit(0);
  }
  console.error("FATAL: no src.zip and no src/index.js");
  process.exit(1);
}

fs.mkdirSync("src", { recursive: true });
let ok = false;
try {
  const require = createRequire(import.meta.url);
  const AdmZip = require("adm-zip");
  console.log("Unpacking src.zip with adm-zip...");
  new AdmZip("src.zip").extractAllTo("src", true);
  ok = true;
} catch (e) {
  console.warn("adm-zip failed:", e.message);
}
if (!ok) {
  try {
    execSync("unzip -qo src.zip -d src", { stdio: "inherit" });
    ok = true;
  } catch (e) {
    console.warn("unzip failed:", e.message);
  }
}
if (!ok) {
  try {
    execSync("python3 -c \"import zipfile; zipfile.ZipFile('src.zip').extractall('src')\"", { stdio: "inherit" });
    ok = true;
  } catch (e) {
    console.warn("python extract failed:", e.message);
  }
}
if (!fs.existsSync(path.join("src", "index.js"))) {
  if (fs.existsSync(path.join("src", "src", "index.js"))) {
    execSync("cp -r src/src/* src/ && rm -rf src/src", { stdio: "inherit" });
  }
}
if (!fs.existsSync(path.join("src", "index.js"))) {
  console.error("FATAL: src/index.js missing after unpack");
  process.exit(1);
}
console.log("src.zip unpacked OK");
