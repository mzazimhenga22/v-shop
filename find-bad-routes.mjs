// tools/find-bad-routes.mjs
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
      if (
        full.endsWith(".js") ||
        full.endsWith(".ts") ||
        full.endsWith(".mjs")
      )
        cb(full);
    }
  }
}

const projectRoot = process.cwd();
const backend = path.join(projectRoot, "backend");
const files = [];
walk(backend, (f) => files.push(f));

const routeCallRegex =
  /\b(?:app|router)\.(use|get|post|put|delete|all|route)\s*\(\s*(['"`])((?:\\\2|.)*?)\2/;

function parenBalance(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    if (s[i] === ")") depth--;
    if (depth < 0) return { balanced: false, pos: i };
  }
  return { balanced: depth === 0, pos: depth === 0 ? -1 : s.lastIndexOf("(") };
}

let found = false;
for (const f of files) {
  const txt = fs.readFileSync(f, "utf8");
  const lines = txt.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = routeCallRegex.exec(line);
    if (m) {
      const route = m[3];
      if (route.includes("(") || route.includes(")")) {
        found = true;
        const bal = parenBalance(route);
        console.log(`${f}:${i + 1} -> ${route}`);
        console.log(
          `    contains '(' or ')'  balanced? ${bal.balanced}  pos:${bal.pos}`
        );
      }
    }
  }
}

if (!found) {
  console.log(
    "No route calls with ( or ) found. You may have a route built from a variable — inspect index.js/dist files or other route registration sites."
  );
}
