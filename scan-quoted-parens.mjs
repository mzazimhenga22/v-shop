// tools/scan-quoted-parens.mjs
import fs from "fs";
import path from "path";

function walk(dir, cb) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      walk(full, cb);
    } else {
      if (full.endsWith(".js") || full.endsWith(".ts") || full.endsWith(".mjs"))
        cb(full);
    }
  }
}

const projectRoot = process.cwd();
const backendDir = path.join(projectRoot, "backend");
const regex = /(['"`])([^'"\n]*\([^'"\n]*)\1/; // any quoted string with '(' inside

walk(backendDir, (file) => {
  const txt = fs.readFileSync(file, "utf8");
  const lines = txt.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = regex.exec(line);
    if (m) {
      console.log(`${file}:${i + 1} -> ${m[2].trim()}`);
    }
  }
});
