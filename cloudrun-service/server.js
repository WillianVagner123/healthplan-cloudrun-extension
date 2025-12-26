import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

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
  .map((s) => s.trim())
  .filter(Boolean);

// Auth (Google Web App OAuth) + JWT do Maskara
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

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
app.use(express.urlencoded({ extended: true }));

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

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

/* =======================
   AUTHORIZED USERS (allowlist)
======================= */

let authorizedUsersCache = null;

async function loadAuthorizedUsers() {
  if (authorizedUsersCache) return authorizedUsersCache;
  const data = await safeReadJson(AUTH_USERS_FILE, { users: [] });
  authorizedUsersCache = data.users || [];
  return authorizedUsersCache;
}

/* =======================
   JWT (Maskara Token)
======================= */

function base64url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function signJWT(payload, expiresInSec = 60 * 60 * 12) {
  const header = { alg: "HS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSec;

  const h = base64url(JSON.stringify(header));
  const b = base64url(JSON.stringify({ ...payload, iat, exp }));
  const data = `${h}.${b}`;

  const sig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(data)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

  return `${data}.${sig}`;
}

function verifyJWT(token) {
  const [h, b, s] = String(token || "").split(".");
  if (!h || !b || !s) return null;

  const data = `${h}.${b}`;
  const expected = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(data)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

  if (expected !== s) return null;

  let payload = null;
  try {
    payload = JSON.parse(
      Buffer.from(b.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8")
    );
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) return null;

  return payload;
}

/* =======================
   DEVICE LOGIN (in-memory)
   ⚠️ Em produção, use Firestore/Redis.
======================= */

const deviceSessions = new Map();
// device_code -> { user_code, status, email, token, expiresAt }

function randomHex(len = 16) {
  return crypto.randomBytes(len).toString("hex");
}

function formatUserCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () => chars[Math.floor(Math.random() * chars.length)];
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
}

/* =======================
   AUTH MIDDLEWARE (Bearer)
======================= */

function isPublicPath(reqPath) {
  return (
    reqPath === "/health" ||
    reqPath === "/auth" ||
    reqPath.startsWith("/auth/") ||
    reqPath.startsWith("/v1/auth/")
  );
}

app.use(async (req, res, next) => {
  if (isPublicPath(req.path)) return next();

  const auth = String(req.headers.authorization || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);

  if (!m) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Token ausente (Authorization: Bearer ...)",
    });
  }

  const payload = verifyJWT(m[1]);
  if (!payload?.email) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Token inválido ou expirado",
    });
  }

  const allowed = await loadAuthorizedUsers();
  if (!allowed.includes(payload.email)) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Usuário não autorizado",
    });
  }

  req.user = payload; // { email, iat, exp }
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
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .map((f) => path.join(PLANS_DIR, f));
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
    script_keys: (plan.script_groups || []).map((s) => s.key),
    default_script: plan.default_script || plan.script_groups?.[0]?.key || "",
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
  return plans.find((p) => p.id.toLowerCase() === id.toLowerCase()) || null;
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
   ROUTES — PUBLIC
======================= */

app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * Device Start
 * Extensão chama e recebe user_code + verification_url
 */
app.post("/v1/auth/device/start", async (_req, res) => {
  const device_code = randomHex(16);
  const user_code = formatUserCode();
  const expires_in = 600; // 10 min
  const interval = 2; // segundos

  deviceSessions.set(device_code, {
    user_code,
    status: "pending",
    email: null,
    token: null,
    expiresAt: Date.now() + expires_in * 1000,
  });

  res.json({
    device_code,
    user_code,
    verification_url: `${BASE_URL}/auth`,
    expires_in,
    interval,
  });
});

/**
 * Device Poll
 * Extensão pergunta até virar approved
 */
app.post("/v1/auth/device/poll", async (req, res) => {
  const { device_code } = req.body || {};
  const s = deviceSessions.get(device_code);

  if (!s) return res.status(400).json({ status: "invalid_code" });
  if (Date.now() > s.expiresAt) return res.status(400).json({ status: "expired" });

  if (s.status === "approved") {
    return res.json({ status: "approved", token: s.token, email: s.email });
  }
  if (s.status === "denied") {
    return res.status(401).json({ status: "denied" });
  }

  return res.json({ status: "pending" });
});

/**
 * Página /auth
 * Usuário digita o código e inicia login Google
 */
app.get("/auth", (_req, res) => {
  res.type("html").send(`
<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Maskara Login</title>
  <style>
    body{font-family:system-ui,Segoe UI,Arial;margin:0;background:#0b1220;color:#e8eefc}
    .wrap{max-width:520px;margin:40px auto;padding:20px}
    .card{background:#101a30;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:18px}
    input{width:100%;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:#0b1220;color:#fff;font-size:16px}
    button{width:100%;margin-top:12px;padding:14px;border-radius:12px;border:0;background:linear-gradient(90deg,#22d3ee,#60a5fa);color:#05202a;font-weight:800;font-size:16px;cursor:pointer}
    .muted{opacity:.8;font-size:13px;margin-top:10px}
    .err{margin-top:12px;color:#ffb4b4}
  </style>
</head>
<body>
  <div class="wrap">
    <h2>🔐 Login do Maskara</h2>
    <div class="card">
      <div>Digite o código mostrado na extensão:</div>
      <form method="GET" action="/auth/start">
        <input name="user_code" placeholder="ABCD-EFGH" required />
        <button type="submit">Entrar com Google</button>
      </form>
      <div class="muted">Depois de logar, volte para a extensão.</div>
      <div class="muted">BASE_URL: ${BASE_URL}</div>
    </div>
  </div>
</body>
</html>
  `);
});

/**
 * Start OAuth (Web App)
 * - Procura a sessão pelo user_code
 * - Redireciona para Google com state=device_code
 */
app.get("/auth/start", async (req, res) => {
  const user_code = String(req.query.user_code || "").toUpperCase().trim();
  if (!user_code) return res.status(400).send("user_code ausente");

  // acha sessão
  let device_code = null;
  for (const [dc, sess] of deviceSessions.entries()) {
    if (sess.user_code === user_code) {
      if (Date.now() > sess.expiresAt) break;
      device_code = dc;
      break;
    }
  }

  if (!device_code) return res.status(400).send("Código inválido ou expirado");

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).send("OAuth ENV ausente: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
  }

  const redirect_uri = `${BASE_URL}/auth/callback`;
  const state = device_code;

  const url =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent("openid email profile")}` +
    `&prompt=select_account` +
    `&state=${encodeURIComponent(state)}`;

  res.redirect(url);
});

/**
 * OAuth callback
 * - troca code por access_token
 * - pega email no userinfo
 * - confere allowlist (authorized_users.json)
 * - emite JWT do Maskara e aprova o device_code
 */
app.get("/auth/callback", async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || ""); // device_code

  if (!code) return res.status(400).send("Sem code");
  const sess = deviceSessions.get(state);
  if (!sess) return res.status(400).send("Sessão inválida");
  if (Date.now() > sess.expiresAt) return res.status(400).send("Sessão expirada");

  try {
    const redirect_uri = `${BASE_URL}/auth/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri,
      }),
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text().catch(() => "");
      return res.status(400).send("Falha token: " + t);
    }

    const tokenJson = await tokenRes.json();
    const access_token = tokenJson.access_token;

    const ui = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!ui.ok) {
      const t = await ui.text().catch(() => "");
      return res.status(400).send("Falha userinfo: " + t);
    }

    const profile = await ui.json();
    const email = profile.email;

    // allowlist
    const allowed = await loadAuthorizedUsers();
    if (!allowed.includes(email)) {
      sess.status = "denied";
      deviceSessions.set(state, sess);
      return res.status(401).send("Usuário não autorizado");
    }

    const maskaraToken = signJWT({ email }, 60 * 60 * 12); // 12h
    sess.status = "approved";
    sess.email = email;
    sess.token = maskaraToken;
    deviceSessions.set(state, sess);

    res.type("html").send(`
      <h2>✅ Login OK</h2>
      <p>Você pode voltar para a extensão.</p>
      <p><b>${email}</b></p>
    `);
  } catch (e) {
    res.status(500).send("Erro: " + String(e?.message || e));
  }
});

/* =======================
   ROUTES — PROTECTED (Bearer)
======================= */

app.get("/v1/plans", async (_req, res) => {
  const plans = await loadPlans();
  const creds = INCLUDE_CREDENTIALS ? await loadCredentials() : {};

  res.json({
    version: 1,
    generated_at: new Date().toISOString(),
    plans: plans.map((p) => toPublicPlan(p, creds)),
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
    default_script: plan.default_script || plan.script_groups?.[0]?.key,
  });
});

app.get("/v1/kits", async (_req, res) => {
  const data = await loadKits();
  res.json({
    version: data.version,
    generated_at: data.generated_at,
    kits: data.kits.map((k) => ({ key: k.key, label: k.label, codes_ref: k.codes_ref })),
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
  console.info(`   BASE_URL=${BASE_URL}`);
});
