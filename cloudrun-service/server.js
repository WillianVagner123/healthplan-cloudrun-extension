import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

/* =======================
   BOOTSTRAP
======================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;

/* =======================
   FLAGS / ENV
======================= */

const INCLUDE_CREDENTIALS =
  String(process.env.INCLUDE_CREDENTIALS || "false").toLowerCase() === "true";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

/* =======================
   PATHS
======================= */

const DATA_DIR = path.join(__dirname, "data");

const PLANS_DIR = path.join(DATA_DIR, "plans");
const SCRIPTS_DIR = path.join(DATA_DIR, "scripts");
const CODES_DIR = path.join(DATA_DIR, "codes");
const KITS_DIR = path.join(DATA_DIR, "kits");

const CREDENTIALS_FILE = path.join(DATA_DIR, "credentials.json");
const AUTH_USERS_FILE = path.join(DATA_DIR, "authorized_users.json");

const SHARED_CODES_FILE = path.join(CODES_DIR, "shared_codes.json");
const KITS_FILE = path.join(KITS_DIR, "kits.json");

/* =======================
   APP
======================= */

const app = express();
app.use(express.json({ limit: "1mb" }));

/* =======================
   HELPERS
======================= */

async function safeReadJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function originAllowed(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes("*")) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

/* =======================
   CORS
======================= */

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (originAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-User-Email");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

/* =======================
   AUTH (GOOGLE ACCOUNT)
======================= */

let authorizedUsersCache = null;

async function loadAuthorizedUsers() {
  if (authorizedUsersCache) return authorizedUsersCache;
  const data = await safeReadJson(AUTH_USERS_FILE, { users: [] });
  authorizedUsersCache = data.users || [];
  return authorizedUsersCache;
}

app.use(async (req, res, next) => {
  const email = req.headers["x-user-email"];

  if (!email) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Conta Google não informada"
    });
  }

  const allowed = await loadAuthorizedUsers();

  if (!allowed.includes(email)) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Usuário não autorizado"
    });
  }

  next();
});

/* =======================
   CACHE
======================= */

let plansCache = null;
let credentialsCache = null;
let kitsCache = null;
let sharedCodesCache = null;

/* =======================
   LOADERS
======================= */

async function listPlanFiles() {
  const files = await fs.readdir(PLANS_DIR);
  return files
    .filter(f => f.toLowerCase().endsWith(".json"))
    .map(f => path.join(PLANS_DIR, f));
}

async function loadPlans() {
  if (plansCache) return plansCache;

  const files = await listPlanFiles();
  const plans = [];

  for (const file of files) {
    const p = await safeReadJson(file, null);
    if (p?.id) plans.push(p);
  }

  plans.sort((a, b) =>
    String(a.name || a.id).localeCompare(String(b.name || b.id), "pt-BR")
  );

  plansCache = plans;
  return plans;
}

async function loadCredentials() {
  if (!credentialsCache) {
    credentialsCache = await safeReadJson(CREDENTIALS_FILE, {});
  }
  return credentialsCache;
}

async function loadKits() {
  if (!kitsCache) {
    kitsCache = await safeReadJson(KITS_FILE, { version: 1, kits: [] });
  }
  return kitsCache;
}

async function loadSharedCodes() {
  if (!sharedCodesCache) {
    sharedCodesCache = await safeReadJson(SHARED_CODES_FILE, {});
  }
  return sharedCodesCache;
}

/* =======================
   TRANSFORMS
======================= */

function toPublicPlan(plan, creds) {
  const out = {
    id: plan.id,
    name: plan.name,
    vendor: plan.vendor || "",
    portal_url: plan.portal_url || "",
    version: plan.version || "0.0.0",
    script_keys: (plan.script_groups || []).map(s => s.key),
    default_script:
      plan.default_script || plan.script_groups?.[0]?.key || ""
  };

  if (INCLUDE_CREDENTIALS) {
    const c = creds?.[plan.id];
    out.login = c?.login || "";
    out.senha = c?.senha || "";
  }

  return out;
}

async function getPlanById(id) {
  const plans = await loadPlans();
  return plans.find(p => p.id.toLowerCase() === id.toLowerCase()) || null;
}

async function readScriptFile(relFile) {
  const filePath = path.join(SCRIPTS_DIR, relFile);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return `alert("Script não encontrado: ${relFile}")`;
  }
}

/* =======================
   ROUTES
======================= */

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/v1/plans", async (_req, res) => {
  const plans = await loadPlans();
  const creds = INCLUDE_CREDENTIALS ? await loadCredentials() : {};

  res.json({
    version: 1,
    generated_at: new Date().toISOString(),
    plans: plans.map(p => toPublicPlan(p, creds))
  });
});

app.get("/v1/scripts/:planId", async (req, res) => {
  const plan = await getPlanById(req.params.planId);
  if (!plan) {
    return res.status(404).json({ error: "not_found" });
  }

  const scripts = {};
  for (const g of plan.script_groups || []) {
    scripts[g.key] = await readScriptFile(g.file);
  }

  res.json({
    planId: plan.id,
    name: plan.name,
    scripts,
    default_script: plan.default_script || plan.script_groups?.[0]?.key
  });
});

app.get("/v1/kits", async (_req, res) => {
  const data = await loadKits();
  res.json({
    version: data.version,
    generated_at: data.generated_at,
    kits: data.kits.map(k => ({ key: k.key, label: k.label, codes_ref: k.codes_ref }))
  });
});

app.get("/v1/codes/shared", async (_req, res) => {
  const data = await loadSharedCodes();
  res.json(data);
});

/* =======================
   START
======================= */

app.listen(PORT, () => {
  console.info(`🚀 Cloud Run listening on port ${PORT}`);
});
