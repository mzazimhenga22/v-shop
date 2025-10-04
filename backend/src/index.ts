import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as expressModule from "express";
import * as corsModule from "cors";
import { fileURLToPath, pathToFileURL } from "url";

/**
 * ESM compatibility: recreate __filename and __dirname
 *
 * Avoid using `import.meta.url` here so TypeScript can compile under module targets
 * that do not support `import.meta` — use the process argv/cwd as a reliable fallback.
 */
const __filename = process.argv[1] ? path.resolve(process.argv[1]) : path.join(process.cwd(), "index.js");
const __dirname = path.dirname(__filename);

/**
 * Compatibility: prefer default export if available, otherwise use the namespace.
 */
const express: typeof import("express") = (expressModule as any).default ?? expressModule;
const cors: any = (corsModule as any).default ?? corsModule;

// load .env (search a few likely locations)
function loadEnv() {
  try {
    if (!path || typeof path.resolve !== "function") {
      dotenv.config();
      console.warn("[ENV] `path` unavailable; used default dotenv.config()");
      return null as any;
    }
  } catch {
    // proceed
  }

  const candidates = [
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, ".env"),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        console.log(`[ENV] Loaded env from: ${p}`);
        return p;
      }
    } catch (err) {
      // ignore
    }
  }

  dotenv.config();
  console.warn("[ENV] No explicit .env file found in standard locations — using default dotenv behaviour.");
  return null as any;
}

const loadedEnvPath = loadEnv();

function checkEnv(name: string) {
  return process.env[name] ? "Set" : "Not set";
}

console.log("SUPABASE_URL:", checkEnv("SUPABASE_URL"));
console.log("SUPABASE_SERVICE_ROLE_KEY:", checkEnv("SUPABASE_SERVICE_ROLE_KEY"));
console.log("PORT:", process.env.PORT ?? "(using default 4000)");

// ---- Utility: resilient dynamic import that works from compiled locations ----
const tryImport = async (modPath: string) => {
  const candidates: string[] = [];

  // If passed a relative path, try resolving relative to this file and cwd
  if (modPath.startsWith(".") || modPath.startsWith("/")) {
    const abs = path.resolve(__dirname, modPath);
    candidates.push(abs + ".js");
    candidates.push(abs + ".cjs");
    candidates.push(abs + ".mjs");
    candidates.push(path.join(abs, "index.js"));
    candidates.push(path.join(abs, "index.cjs"));
    candidates.push(path.join(abs, "index.mjs"));

    // also try from process.cwd() in case build layout differs
    const cwdAbs = path.resolve(process.cwd(), modPath);
    candidates.push(cwdAbs + ".js");
    candidates.push(cwdAbs + ".cjs");
    candidates.push(path.join(cwdAbs, "index.js"));
  } else {
    // bare specifier (package) — import as-is and let node resolve
    candidates.push(modPath);
  }

  for (const candidate of candidates) {
    try {
      const url = path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate;
      console.log(`[ROUTE][tryImport] trying: ${url}`);
      const imported = await import(url);
      console.log(`[ROUTE][tryImport] IMPORT OK: ${modPath} -> ${url}`);
      return imported;
    } catch (err: any) {
      console.warn(`[ROUTE][tryImport] failed candidate: ${candidate}`);
      console.warn(err && err.stack ? err.stack.split("\n")[0] : String(err)); // single-line hint
      // continue to next candidate
    }
  }

  console.warn(`[ROUTE] Failed to import any candidate for ${modPath}`);
  return null;
};


// ---- Main ----
(async function main() {
  const app = express();
  const PORT = Number(process.env.PORT) || 4000;

  // Allow CORS
  app.use(cors({ origin: true, credentials: true }));

  // ---- Payments module (special-case) ----
  const paymentsModule = await tryImport("./api/payment");
  if (paymentsModule) {
    // Register top-level Stripe webhook BEFORE express.json()
    if (paymentsModule.stripeWebhookHandler) {
      app.post(
        "/stripe/webhook",
        express.raw({ type: "application/json" }),
        paymentsModule.stripeWebhookHandler
      );
      console.log("Registered top-level Stripe webhook: POST /stripe/webhook");
    }

    // Stripe create-payment-intent
    if (paymentsModule.createPaymentIntentHandler) {
      app.post(
        "/stripe/create-payment-intent",
        express.json(),
        paymentsModule.createPaymentIntentHandler
      );
      console.log("Registered top-level Stripe create-payment-intent: POST /stripe/create-payment-intent");
    }

    // Mount payments router
    const paymentsRouter = paymentsModule.default ?? paymentsModule.router ?? paymentsModule;
    if (paymentsRouter) {
      app.use("/api/payments", express.json(), paymentsRouter);
      console.log("Mounted payments router at /api/payments (mpesa, user payment info endpoints)");
    }
  } else {
    console.warn("[ROUTE] payments module not loaded; skipping payments mounting");
  }

  // ---- General body parsing AFTER webhook ----
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // ---- Other routes ----
  const routeDefs: { path: string; module: string }[] = [
    { path: "/admin", module: "./routes/admin" },
    { path: "/promote", module: "./routes/promote" },
    { path: "/orders", module: "./routes/orders" },
    { path: "/api", module: "./routes/mergedProducts" }, 
    { path: "/api/products", module: "./api/products" },
    { path: "/api/categories", module: "./api/categories" },
    { path: "/api/vendors", module: "./routes/vendorsapp" },
    { path: "/api/vendor", module: "./api/vendor" },
    { path: "/analytics", module: "./routes/analytics" },
  ];

  for (const def of routeDefs) {
    const mod = await tryImport(def.module);
    if (mod) {
      const router = mod.default ?? mod.router ?? mod;
      app.use(def.path, router);
      console.log(`Registered route: ${def.path} -> ${def.module}`);
    } else {
      console.warn(`Skipping route ${def.path} (import failed): ${def.module}`);
    }
  }

  // ---- Frontend static serving and SPA fallback ----
  const frontendPath = process.env.FRONTEND_DIST
    ? path.resolve(process.env.FRONTEND_DIST)
    : path.resolve(process.cwd(), "dist");
  console.log("[STATIC] Frontend dist folder:", frontendPath);

  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    console.log("[STATIC] Serving static assets from:", frontendPath);
  } else {
    console.warn(`[STATIC] Warning: frontend dist folder does not exist at: ${frontendPath}`);
    console.warn(`[STATIC] If you have a separate frontend project, build it and set FRONTEND_DIST to its dist path.`);
  }

  const indexFile = path.join(frontendPath, "index.html");
  app.use((req, res, next) => {
    try {
      if (req.method !== "GET") return next();
      const accepts = req.headers.accept || "";
      const wantsHtml = typeof accepts === "string" ? accepts.includes("text/html") : false;
      if (!wantsHtml) return next();
      if (!fs.existsSync(indexFile)) {
        // index.html missing; skip SPA fallback
        return next();
      }
      res.sendFile(indexFile, (err) => {
        if (err) {
          console.error("[STATIC] error sending index.html:", err);
          return next(err);
        }
      });
    } catch (err) {
      console.error("[STATIC] SPA fallback middleware error:", err);
      return next(err as any);
    }
  });

  // Basic ping route
  app.get("/ping", (_req, res) => res.send("pong"));

  // Health route
  app.get("/health", async (_req, res) => {
    const report: Record<string, any> = {
      envLoadedFrom: loadedEnvPath ?? "default",
      supabaseEnv: !!process.env.SUPABASE_URL,
    };

    if (process.env.SUPABASE_URL) {
      try {
        const url = process.env.SUPABASE_URL;
        const resp = await fetch(url, { method: "GET" });
        report.supabase = { reachable: true, status: resp.status, statusText: resp.statusText };
      } catch (err: any) {
        report.supabase = { reachable: false, error: err?.message ?? String(err) };
      }
    } else {
      report.supabase = { configured: false };
    }

    res.json({ ok: true, report });
  });

  // Start server
  const server = app.listen(PORT, "0.0.0.0", () => {
    const addr = server.address();
    try {
      if (addr && typeof addr === "object") {
        const host = addr.address === "::" || addr.address === "0.0.0.0" ? "0.0.0.0" : addr.address;
        console.log(`✅ Server listening on http://${host}:${addr.port}`);
      } else {
        console.log(`✅ Server listening on port ${PORT}`);
      }
    } catch (e) {
      console.log(`✅ Server listening on port ${PORT}`);
    }
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n[SHUTDOWN] Received ${signal}. Closing server...`);
    server.close(() => {
      console.log("[SHUTDOWN] Server closed.");
      process.exit(0);
    });
    setTimeout(() => {
      console.warn("[SHUTDOWN] Forcing exit after timeout.");
      process.exit(1);
    }, 5000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Global error handlers
  process.on("unhandledRejection", (reason) => {
    console.error("[UNHANDLED REJECTION]", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[UNCAUGHT EXCEPTION]", err);
    // do not exit immediately here — allow graceful shutdown if desired
  });

})().catch((err) => {
  console.error("[FATAL] Uncaught error starting server:", err);
  process.exit(1);
});
