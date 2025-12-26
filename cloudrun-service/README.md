Cloud Run Service — API de Planos, Kits e Scripts

API backend executando no Google Cloud Run, responsável por fornecer planos de saúde, kits de procedimentos e scripts de automação para a extensão do Chrome.

📦 Funcionalidades

📋 Listagem de planos de saúde

🧩 Listagem de kits de procedimentos (globais)

📜 Scripts específicos por plano (quando aplicável)

🔐 Controle de acesso por conta Google (e-mail allowlist)

☁️ Pronto para rodar em Cloud Run

🌐 Base URL
https://<seu-servico>.run.app

🔎 Endpoints
Health check
GET /health


Resposta:

{ "ok": true }

Listar planos de saúde
GET /v1/plans


Resposta:

{
  "version": 1,
  "generated_at": "2025-12-26T12:00:00Z",
  "plans": [
    {
      "id": "geap",
      "name": "GEAP",
      "vendor": "GEAP",
      "portal_url": "https://...",
      "version": "1.0.0"
    }
  ]
}

Scripts de um plano (quando existir)
GET /v1/scripts/:planId


Exemplo:

GET /v1/scripts/geap


Resposta:

{
  "planId": "geap",
  "name": "GEAP",
  "scripts": {
    "default": "(function(){ ... })();"
  },
  "default_script": "default"
}

Listar kits de procedimentos (globais)
GET /v1/kits


Resposta:

{
  "version": 1,
  "generated_at": "2025-12-26T12:00:00Z",
  "kits": [
    { "key": "coleta_sangue", "label": "Coleta de Sangue" },
    { "key": "avaliacao_fisica", "label": "Avaliação Física" }
  ]
}

Códigos compartilhados (base de kits)
GET /v1/codes/shared


Resposta:

{
  "coleta_sangue": [
    "40301087",
    "40301150",
    "40301222"
  ]
}

🔐 Segurança (produção)
🔑 Autenticação por conta Google (ATUAL)

Todas as requisições devem enviar o header:

X-User-Email: usuario@dominio.com


O backend valida esse e-mail contra o arquivo:

data/authorized_users.json


Exemplo:

{
  "users": [
    "admin@empresa.com",
    "operador@empresa.com"
  ]
}


❌ Se o e-mail não estiver autorizado → 401 Unauthorized
❌ Se o header não for enviado → 401 Unauthorized

🌍 CORS

Controlado via variável de ambiente:

ALLOWED_ORIGINS=https://exemplo.com,chrome-extension://xxxxx


Para desenvolvimento:

ALLOWED_ORIGINS=*

⚙️ Variáveis de Ambiente
Variável	Descrição
PORT	Porta do Cloud Run (default: 8080)
ALLOWED_ORIGINS	Lista de origens permitidas (CORS)
INCLUDE_CREDENTIALS	true/false para enviar login/senha nos planos
📁 Estrutura de Dados
data/
├─ plans/
│  ├─ geap.json
│  └─ ...
├─ scripts/
│  ├─ geap_default.js
│  └─ ...
├─ kits/
│  └─ kits.json
├─ codes/
│  └─ shared_codes.json
├─ authorized_users.json
└─ credentials.json

🚀 Deploy (Cloud Run)
gcloud run deploy healthplan-api \
  --source . \
  --region southamerica-east1 \
  --allow-unauthenticated=false
