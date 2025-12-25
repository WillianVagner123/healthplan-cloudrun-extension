import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

// CORS: por padrão, permite a extensão e localhost.
// Em produção, restrinja para o ID da sua extensão.
const allowedOrigins = (process.env.CORS_ALLOW || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl/postman
    if (allowedOrigins.length === 0) return cb(null, true); // DEV: aberto
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked"), false);
  }
}));

// ----
// (Opcional) Proteção simples por "API key" compartilhada.
// A extensão envia header: X-Client-Key: <valor>
// Configure no Cloud Run: CLIENT_KEY=...
// ----
function requireClientKey(req, res, next) {
  const required = process.env.CLIENT_KEY;
  if (!required) return next(); // DEV: sem chave
  const got = req.header("X-Client-Key");
  if (!got || got !== required) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

const DATA_DIR = path.join(__dirname, "data");
const plansPath = path.join(DATA_DIR, "plans_base.json");
const scriptsPath = path.join(DATA_DIR, "scripts.json");

function readJson(p) {
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

app.get("/health", (req, res) => res.json({ ok: true }));

// Lista de planos (sem scripts pesados)
app.get("/v1/plans", requireClientKey, (req, res) => {
  const plans = readJson(plansPath);
  res.json(plans);
});

app.get("/v1/scripts/:planId", (req, res) => {
  const scripts = readJson(scriptsPath);
  const entry = scripts.scripts_by_plan?.[req.params.planId];

  if (!entry) return res.status(404).json({ error: "not_found" });

  if (entry.AMBOS?.file) {
    const filePath = path.join(DATA_DIR, entry.AMBOS.file);
    const code = fs.readFileSync(filePath, "utf-8");
    return res.json({ code });
  }

  res.status(500).json({ error: "invalid_script_config" });
});


// Para atualizar dados sem redeploy:
// - Coloque plans_base.json e scripts.json num bucket e leia via URL
// (deixei pronto como opção, mas desligado por padrão)
app.get("/v1/about", (req, res) => {
  res.json({
    name: "HealthPlan Plans API",
    mode: "local-json",
    note: "Para produção, considere autenticação (Google Identity / Firebase) e armazenamento em GCS/Firestore."
  });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`✅ API rodando na porta ${port}`));
