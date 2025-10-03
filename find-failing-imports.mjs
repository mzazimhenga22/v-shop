// find-failing-imports.mjs
// Put this in the project root and run: node find-failing-imports.mjs
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const projectRoot = process.cwd();

const candidates = [
  // compiled dist versions (where your server crashed)
  path.join(projectRoot, "backend", "dist", "index.js"),
  path.join(projectRoot, "backend", "dist", "routes", "admin.js"),
  path.join(projectRoot, "backend", "dist", "routes", "promote.js"),
  path.join(projectRoot, "backend", "dist", "routes", "orders.js"),
  path.join(projectRoot, "backend", "dist", "api", "products.js"),
  path.join(projectRoot, "backend", "dist", "routes", "payment.js"),
  path.join(projectRoot, "backend", "dist", "api", "categories.js"),
  path.join(projectRoot, "backend", "dist", "routes", "vendorsapp.js"),
  path.join(projectRoot, "backend", "dist", "api", "vendor.js"),
  path.join(projectRoot, "backend", "dist", "routes", "analytics.js"),
  // also try source files (in case of ESM imports)
  path.join(projectRoot, "backend", "src", "index.ts"),
  path.join(projectRoot, "backend", "src", "routes", "admin.ts"),
  path.join(projectRoot, "backend", "src", "routes", "orders.ts"),
  path.join(projectRoot, "backend", "src", "api", "products.ts"),
  path.join(projectRoot, "backend", "src", "api", "vendor.ts"),
];

console.log("Trying to dynamically import candidate modules (safe; won't start server)\n");

// --- helpers to scan for suspicious route strings in backend JS/TS files ---
function readAllBackendFiles() {
  const backendDir = path.join(projectRoot, "backend");
  const files = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        walk(full);
      } else if (e.isFile()) {
        if (full.endsWith(".js") || full.endsWith(".ts") || full.endsWith(".mjs")) {
          files.push(full);
        }
      }
    }
  }
  if (fs.existsSync(backendDir)) walk(backendDir);
  return files;
}

// find route registration strings like app.use('/foo'), router.get('/bar'), etc.
function scanFileForRoutes(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const matches = [];

  // regex to capture route registration with a quoted first arg:
  // e.g. app.use('/path'), app.get("/x"), router.post(`/y`)
  const routePattern = /\b(?:app|router)\.(?:use|get|post|put|delete|all|route)\s*\(\s*(['"`])((?:\\\1|.)*?)\1/;

  // any quoted string containing '(' (likely literal parentheses)
  const literalWithParen = /(['"`])([^'"\n]*\([^'"\n]*)\1/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m = routePattern.exec(line);
    if (m) {
      matches.push({
        type: "route-registration",
        file: filePath,
        line: i + 1,
        text: m[2],
      });
      continue;
    }
    m = literalWithParen.exec(line);
    if (m) {
      matches.push({
        type: "quoted-with-paren",
        file: filePath,
        line: i + 1,
        text: m[2],
      });
    }
  }
  return matches;
}

function scanBackendForSuspects(limit = 200) {
  const files = readAllBackendFiles();
  const suspects = [];
  for (const f of files) {
    try {
      const found = scanFileForRoutes(f);
      for (const s of found) {
        suspects.push(s);
        if (suspects.length >= limit) return suspects;
      }
    } catch (e) {
      // ignore unreadable files
    }
  }
  return suspects;
}

// Pretty-print suspects
function printSuspects(suspects) {
  if (!suspects || suspects.length === 0) {
    console.log("No quoted path strings with '(' found in backend JS/TS files.");
    return;
  }
  console.log("\nPossible offending route strings (file:line) --- showing up to 200 matches:");
  for (const s of suspects) {
    console.log(` - [${s.type}] ${s.file}:${s.line}  ->  "${s.text}"`);
  }
  console.log("");
}

// --- import loop ---
for (const candidate of candidates) {
  if (!fs.existsSync(candidate)) {
    console.log(`SKIP (not found): ${candidate}`);
    continue;
  }
  console.log(`\nIMPORT -> ${candidate}`);
  try {
    // import as file URL
    const url = pathToFileURL(candidate).href;
    // dynamic import
    const mod = await import(url);
    console.log("  OK imported. Export keys:", Object.keys(mod).join(", ") || "(none)");
  } catch (err) {
    console.error("  IMPORT FAILED!");
    if (err && err.stack) {
      // print top of stack
      const stackTop = err.stack.split("\n").slice(0, 12).join("\n");
      console.error(stackTop);
    } else {
      console.error(err);
    }

    // Additional helpful diagnostics:
    // 1) If the thrown error message contains "Unexpected ( at", print it plainly.
    const msg = err && err.message ? err.message.toString() : "";
    if (msg.includes("Unexpected (")) {
      console.error("\nDetected a path-to-regexp parse error (Unexpected '(').");
    }

    // 2) Scan backend source for suspicious route strings and print them.
    try {
      const suspects = scanBackendForSuspects();
      printSuspects(suspects);
    } catch (scanErr) {
      console.error("Error while scanning files for suspicious routes:", scanErr);
    }

    console.error("\n===== END OF ERROR FOR THIS MODULE =====\n");
    // keep going to find other failing modules
  }
}

console.log("\nDone. If any IMPORT FAILED blocks appeared above, copy the full failure (file path + stack) and paste it here and I'll point the exact line to fix.");
