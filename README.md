# HealthPlan Cloud Run + Extensão (sem Python)

Este repositório tem **2 partes**:

- **cloudrun-service/** → API Node.js (Cloud Run) que serve:
  - lista de planos: `GET /v1/plans`
  - scripts por plano: `GET /v1/scripts/:planId`
- **chrome-extension/** → extensão Chrome (MV3) que:
  - busca planos/scripts na API
  - deixa **copiar** e **executar** o script na aba atual
  - mostra **logs** no popup

> ✅ Cada plano tem seu **próprio arquivo de script** em `cloudrun-service/data/scripts/`.

---

## 1) Rodar a API local (teste)

```bash
cd cloudrun-service
npm install
npm run start
```

API local:
- http://localhost:8080/health
- http://localhost:8080/v1/plans
- http://localhost:8080/v1/scripts/GEAP

---

## 2) Deploy no Cloud Run (resumo)

Dentro de `cloudrun-service/`:

```bash
gcloud run deploy healthplan-cloudrun-service \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

### Segurança opcional (Client Key)
Você pode exigir uma chave:

- `REQUIRE_CLIENT_KEY=true`
- `CLIENT_KEYS=chave1,chave2`

A extensão envia no header: `X-Client-Key` (configurável no ⚙️).

---

## 3) Credenciais (NÃO COMMITAR)

Para **não vazar login/senha** no GitHub:

- Copie `cloudrun-service/data/credentials.example.json` para:
  - `cloudrun-service/data/credentials.json`
- Preencha os logins/senhas
- Esse arquivo está no `.gitignore`

Para a API retornar login/senha no `/v1/plans`, defina:
- `INCLUDE_CREDENTIALS=true`

---

## 4) Instalar a extensão no Chrome

1. Chrome → `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação**
4. Selecione a pasta: `chrome-extension/`

No popup (⚙️):
- cole a URL do seu Cloud Run (ex.: `https://SEU-SERVICE.run.app`)
- (opcional) client key

---

## 5) Onde editar planos e scripts

- Planos: `cloudrun-service/data/plans/*.json`
- Scripts: `cloudrun-service/data/scripts/*.js`

Exemplo:
- `data/plans/GEAP.json` aponta para `data/scripts/GEAP.AMBOS.js`

---

## 6) Observação sobre pausa em `debugger`

Alguns portais têm `debugger;` no código deles.  
Se o DevTools estiver aberto e pausar, basta:
- pressionar **F8**, ou
- desativar “Pause on debugger statements”.
