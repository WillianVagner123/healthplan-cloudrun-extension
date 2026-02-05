/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": ["body"],
  "actions": { "focus": "body" }
}*/

(() => {

  // ===============================
  // UI
  // ===============================

  const old = document.getElementById("hp_case_btn");
  if (old) {
    old.remove();
    document.getElementById("hp_case_wrap")?.remove();
  }

  const wrap = document.createElement("div");
  wrap.id = "hp_case_wrap";
  wrap.style.cssText =
    "position:fixed;right:12px;bottom:12px;width:420px;z-index:999999999;pointer-events:none;";

  const box = document.createElement("div");
  box.style.cssText =
    "background:#000;color:#0f0;padding:10px;font:11px monospace;border-radius:8px;max-height:220px;overflow:auto;pointer-events:auto;";
  wrap.appendChild(box);

  const btn = document.createElement("button");
  btn.id = "hp_case_btn";
  btn.textContent = "⚡ Inserir Procedimentos";
  btn.style.cssText =
    "position:fixed;right:12px;top:12px;padding:14px 22px;background:#0d6efd;color:#fff;border:none;border-radius:30px;font-weight:bold;cursor:pointer;z-index:999999999;";

  document.body.append(wrap, btn);

  const log = m => {
    const t = new Date().toLocaleTimeString();
    box.textContent = `[${t}] ${m}\n` + box.textContent;
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ===============================
  // FRAME SCANNER (recursivo)
  // ===============================

  function getAllFrames(win = window, list = []) {
    list.push(win);
    const iframes = win.document.querySelectorAll("iframe");
    for (const f of iframes) {
      try {
        if (f.contentWindow) getAllFrames(f.contentWindow, list);
      } catch {}
    }
    return list;
  }

  function findContext() {
    const frames = getAllFrames();

    for (const f of frames) {
      try {
        const doc = f.document;

        const hasGrid = doc.querySelector("tr.grid-record");
        const hasAddIcon = [...doc.querySelectorAll(".wf-icons")]
          .some(i => i.textContent.trim() === "add");

        if (hasGrid && hasAddIcon) {
          log("✅ Grid encontrado em iframe");
          return f;
        }

      } catch {}
    }

    return null;
  }

  // ===============================
  // GRID HELPERS
  // ===============================

  function findInsertBtn(doc) {
    const icon = [...doc.querySelectorAll(".wf-icons")]
      .find(i => i.textContent.trim() === "add");

    return icon?.closest("button") || null;
  }

  function findDoneBtn(doc) {
    const icon = [...doc.querySelectorAll(".wf-icons")]
      .find(i => i.textContent.trim() === "done");

    return icon?.closest("button") || null;
  }

  async function waitRow(doc, oldCount) {
    for (let i = 0; i < 40; i++) {
      const rows = doc.querySelectorAll("tr.grid-record");
      if (rows.length > oldCount) return rows[rows.length - 1];
      await sleep(150);
    }
    return null;
  }

  function setValue(win, el, v) {
    el.focus();
    el.value = v;
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
    el.dispatchEvent(new win.Event("change", { bubbles: true }));
    el.blur();
  }

  async function editCell(win, row, field) {
    const td = row.querySelector(`td[fieldname='${field}']`);
    if (!td) return null;

    td.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));

    for (let i = 0; i < 10; i++) {
      const inp = td.querySelector("input");
      if (inp) return inp;
      await sleep(120);
    }

    return null;
  }

  // ===============================
  // MAIN
  // ===============================

  btn.onclick = async () => {

    const payload = window.__HP_PAYLOAD__ || {
      codes: ["40301273"] // <-- teste
    };

    if (!payload.codes?.length) {
      log("❌ Nenhum código");
      return;
    }

    btn.disabled = true;

    const ctx = findContext();

    if (!ctx) {
      log("❌ Grid não encontrado");
      btn.disabled = false;
      return;
    }

    const doc = ctx.document;
    const addBtn = findInsertBtn(doc);

    if (!addBtn) {
      log("❌ Botão inserir não achado");
      btn.disabled = false;
      return;
    }

    for (const code of payload.codes) {

      log("Inserindo " + code);

      const before = doc.querySelectorAll("tr.grid-record").length;

      addBtn.click();

      const row = await waitRow(doc, before);

      if (!row) {
        log("❌ Linha não criada");
        continue;
      }

      const tab = await editCell(ctx, row, "TABELACOBRANCA");
      if (tab) setValue(ctx, tab, "22");

      await sleep(300);

      const proc = await editCell(ctx, row, "PROCEDIMENTO");
      if (proc) {
        setValue(ctx, proc, code);
        proc.dispatchEvent(
          new ctx.KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true
          })
        );
      }

      await sleep(500);

      const qtd = await editCell(ctx, row, "COBRADOQDE");
      if (qtd) setValue(ctx, qtd, "1");

      await sleep(300);

      findDoneBtn(doc)?.click();

      await sleep(800);
    }

    log("✅ Concluído");
    btn.disabled = false;
  };

  log("Sistema pronto.");

})();
