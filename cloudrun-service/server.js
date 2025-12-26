import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const REQUIRE_CLIENT_KEY = String(process.env.REQUIRE_CLIENT_KEY || "false").toLowerCase() === "true";
const CLIENT_KEYS = (process.env.CLIENT_KEYS || "").split(",").map(s => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim()).filter(Boolean);
const INCLUDE_CREDENTIALS = String(process.env.INCLUDE_CREDENTIALS || "false").toLowerCase() === "true";

const DATA_DIR = path.join(__dirname, "data");
const PLANS_DIR = path.join(DATA_DIR, "plans");
const SCRIPTS_DIR = path.join(DATA_DIR, "scripts");
const CODES_DIR = path.join(DATA_DIR, "codes");
const CREDENTIALS_FILE = path.join(DATA_DIR, "credentials.json");
const KITS_DIR = path.join(DATA_DIR, "kits");
const KITS_FILE = path.join(KITS_DIR, "kits.json");
const SHARED_CODES_FILE = path.join(CODES_DIR, "shared_codes.json");


const app = express();
app.use(express.json({ limit: "1mb" }));

function originAllowed(origin) {
  if (!origin) return true; // curl / server-to-server
  if (ALLOWED_ORIGINS.includes("*")) return true;
  return ALLOWED_ORIGINS.includes(origin);
}
let kitsCache = null;
let sharedCodesCache = null;

async function loadKits() {
  if (!kitsCache) {
    kitsCache = await safeReadJson(KITS_FILE, { kits: [] });
  }
  return kitsCache;
}

async function loadSharedCodes() {
  if (!sharedCodesCache) {
    sharedCodesCache = await safeReadJson(SHARED_CODES_FILE, {});
  }
  return sharedCodesCache;
}

async function resolveKitCodes(kit) {
  const shared = await loadSharedCodes();
  const ref = kit.codes_ref;
  const codes = Array.isArray(shared?.[ref]) ? shared[ref] : [];
  return codes;
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (originAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Client-Key");
}

app.use((req, res, next) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  // Minimal request log
  console.info(`[${new Date().toISOString()}] ${req.method} ${req.url} origin=${req.headers.origin || "-"} ua=${req.headers["user-agent"] || "-"}`);

  // Optional client-key gate
  if (REQUIRE_CLIENT_KEY) {
    const key = req.headers["x-client-key"];
    if (!key || !CLIENT_KEYS.includes(String(key))) {
      return res.status(401).json({ error: "unauthorized", message: "Missing/invalid X-Client-Key." });
    }
  }
  next();
});

async function safeReadJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

async function listPlanFiles() {
  const files = await fs.readdir(PLANS_DIR);
  return files.filter(f => f.toLowerCase().endsWith(".json")).map(f => path.join(PLANS_DIR, f));
}

let plansCache = null;
let credentialsCache = null;

async function loadPlans() {
  const files = await listPlanFiles();
  const all = [];
  for (const f of files) {
    const p = await safeReadJson(f, null);
    if (p && p.id) all.push(p);
  }
  // stable order
  all.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "pt-BR"));
  plansCache = all;
  return all;
}

async function loadCredentials() {
  credentialsCache = (await safeReadJson(CREDENTIALS_FILE, {})) || {};
  return credentialsCache;
}

function toPublicPlan(plan, creds) {
  const out = {
    id: plan.id,
    name: plan.name,
    vendor: plan.vendor || "",
    portal_url: plan.portal_url || "",
    version: plan.version || "0.0.0",
    script_keys: (plan.script_groups || []).map(s => s.key),
    default_script: plan.default_script || (plan.script_groups?.[0]?.key || ""),
  };

  if (INCLUDE_CREDENTIALS) {
    const c = creds?.[plan.id];
    if (c && typeof c === "object") {
      out.login = c.login || "";
      out.senha = c.senha || "";
    } else {
      out.login = "";
      out.senha = "";
    }
  }

  return out;
}

async function getPlanById(id) {
  if (!plansCache) await loadPlans();
  return plansCache.find(p => String(p.id).toLowerCase() === String(id).toLowerCase()) || null;
}

async function readScriptFile(relFile) {
  const filePath = path.join(SCRIPTS_DIR, relFile);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (e) {
    return `alert("Script não encontrado: ${relFile}. Edite cloudrun-service/data/scripts.");`;
  }
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/v1/plans", async (_req, res) => {
  const plans = plansCache || (await loadPlans());
  const creds = INCLUDE_CREDENTIALS ? (credentialsCache || (await loadCredentials())) : {};
  res.json({
    version: 1,
    generated_at: new Date().toISOString(),
    plans: plans.map(p => toPublicPlan(p, creds)),
  });
});

app.get("/v1/scripts/:planId", async (req, res) => {
  const { planId } = req.params;
  const plan = await getPlanById(planId);
  if (!plan) return res.status(404).json({ error: "not_found", message: `Plan not found: ${planId}` });

  const scripts = {};
  const groups = plan.script_groups || [];
  for (const g of groups) {
    scripts[g.key] = await readScriptFile(g.file);
  }

  res.json({
    planId: plan.id,
    name: plan.name,
    version: plan.version || "0.0.0",
    scripts,
    default_script: plan.default_script || (groups?.[0]?.key || ""),
  });
});

app.get("/v1/codes/shared", async (_req, res) => {
  const filePath = path.join(CODES_DIR, "shared_codes.json");
  const data = await safeReadJson(filePath, { version: 1, codes: [] });
  res.json(data);
});
app.get("/v1/kits", async (_req, res) => {
  const kitsData = await loadKits();
  const kits = kitsData.kits || [];

  res.json({
    version: kitsData.version || 1,
    generated_at: kitsData.generated_at || new Date().toISOString(),
    kits: kits.map(k => ({
      key: k.key,
      label: k.label
    }))
  });
});

app.listen(PORT, () => {
  console.info(`Cloud Run service listening on port ${PORT}`);
});
