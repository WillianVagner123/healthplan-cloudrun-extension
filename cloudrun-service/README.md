# Cloud Run service (API de planos/scripts)

## Endpoints
- GET /health
- GET /v1/plans
- GET /v1/scripts/:planId

## Segurança (mínimo viável)
- Defina `CLIENT_KEY` no Cloud Run (Secrets/Env Vars)
- A extensão envia `X-Client-Key: ...`
- Restrinja CORS com `CORS_ALLOW`

> Para produção real: usar autenticação Google (Identity/Firebase) e/ou allowlist de e-mails.
