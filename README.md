# Pacote: Cloud Run + Chrome Extension

## Pastas
- `cloudrun-service/` → API (Node/Express) para servir planos + scripts
- `chrome-extension/` → extensão Chrome (MV3) que consome a API

## Visão
- A extensão **busca** lista de planos e scripts via Cloud Run.
- O usuário seleciona o plano, abre o portal e copia o script para colar no Console (F12).

## Próximo passo (se você quiser produção de verdade)
- Autenticar usuário (Google Identity/Firebase) + allowlist de e-mails
- Armazenar JSON no GCS/Firestore e versionar
- Publicar no Chrome Web Store (paga uma taxa única de desenvolvedor)
