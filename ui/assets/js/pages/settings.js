import { card, listRow, coverEl, button } from "../components/ui.js";
import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { toast } from "../utils.js";

export async function render(root){
  const st = store.get();

  const ui = card({ title:"Paramètres UI", subtitle:"Thème, listes, comportement (UI only)" });
  const list = document.createElement("div");
  list.className = "list";

  list.append(listRow({
    title:"Thème",
    subtitle: st.ui.theme === "light" ? "Clair" : "Sombre",
    left: coverEl("sm","theme"),
    right: button("Basculer", {onClick:(ev)=>{ev.stopPropagation(); document.getElementById("btnTheme")?.click();}})
  }));

  list.append(listRow({
    title:"Mode liste/grille",
    subtitle:"Démo : listes seulement",
    left: coverEl("sm","layout"),
    right: button("Configurer", {onClick:(ev)=>{ev.stopPropagation(); toast("Démo : plus tard.");}})
  }));

  list.append(listRow({
    title:"Couleurs",
    subtitle:"Palette (démo)",
    left: coverEl("sm","colors"),
    right: button("Changer", {onClick:(ev)=>{ev.stopPropagation(); toast("Démo : plus tard.");}})
  }));

  ui.body.append(list);
  root.append(ui.root);

  const lib = card({ title:"Bibliothèque", subtitle:"Scan & indexation" });
  const libWrap = document.createElement("div");
  libWrap.style.display = "grid";
  libWrap.style.gap = "10px";

  const btnScan = button("Scanner", {onClick: async (ev)=>{
    ev.stopPropagation();
    await startScan();
  }});
  const btnScanExport = button("Exporter logs (JSON)", {onClick:(ev)=>{
    ev.stopPropagation();
    exportLogs(scanLogs, "scan-logs.json");
  }});

  const progress = document.createElement("div");
  progress.className = "progress";
  const bar = document.createElement("div");
  bar.className = "progress__bar";
  progress.append(bar);

  const stats = document.createElement("div");
  stats.className = "muted small";
  const extras = document.createElement("div");
  extras.className = "muted small";
  const err = document.createElement("div");
  err.className = "muted small";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.append(btnScan, btnScanExport);

  const scanLogBox = document.createElement("div");
  scanLogBox.className = "logbox";
  scanLogBox.hidden = true;
  const scanLogPre = document.createElement("pre");
  scanLogPre.className = "logbox__pre";
  scanLogBox.append(scanLogPre);

  libWrap.append(progress, stats, extras, err, scanLogBox, actions);
  lib.body.append(libWrap);
  root.append(lib.root);

  const docs = card({ title:"Docs web", subtitle:"Biographies, critiques, photos, pochettes" });
  const docsWrap = document.createElement("div");
  docsWrap.style.display = "grid";
  docsWrap.style.gap = "10px";

  const btnDocs = button("Récupérer (web)", {onClick: async (ev)=>{
    ev.stopPropagation();
    await startDocsFetch();
  }});
  const btnDocsExport = button("Exporter logs (JSON)", {onClick:(ev)=>{
    ev.stopPropagation();
    exportLogs(docsLogs, "docs-logs.json");
  }});
  const docsProgress = document.createElement("div");
  docsProgress.className = "progress";
  const docsBar = document.createElement("div");
  docsBar.className = "progress__bar";
  docsProgress.append(docsBar);
  const docsStats = document.createElement("div");
  docsStats.className = "muted small";
  const docsErr = document.createElement("div");
  docsErr.className = "muted small";
  const docsLogBox = document.createElement("div");
  docsLogBox.className = "logbox";
  docsLogBox.hidden = true;
  const docsLogPre = document.createElement("pre");
  docsLogPre.className = "logbox__pre";
  docsLogBox.append(docsLogPre);
  const docsActions = document.createElement("div");
  docsActions.style.display = "flex";
  docsActions.style.gap = "8px";
  docsActions.append(btnDocs, btnDocsExport);
  docsWrap.append(docsProgress, docsStats, docsErr, docsLogBox, docsActions);
  docs.body.append(docsWrap);
  root.append(docs.root);

  const pl = card({ title:"Paramètres lecteur", subtitle:"Crossfade, replay gain, etc. (UI only)" });
  const list2 = document.createElement("div");
  list2.className = "list";
  const rows = [
    ["Crossfade", "0 s (démo)"],
    ["ReplayGain", "Off (démo)"],
    ["Random", st.player.random ? "On" : "Off"],
    ["Repeat", st.player.repeat],
  ];
  for(const [t,sub] of rows){
    list2.append(listRow({
      title:t,
      subtitle:sub,
      left: coverEl("sm", t),
      right: button("Modifier", {onClick:(ev)=>{ev.stopPropagation(); toast("Démo : brancher plus tard.");}})
    }));
  }
  pl.body.append(list2);
  root.append(pl.root);

  const srv = card({ title:"Serveur", subtitle:"Infos & maintenance (UI only)" });
  srv.body.innerHTML = `
    <div class="muted small">Plus tard : stats, rescan, logs, plugins, etc.</div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px">
      <button class="btn">Rescan bibliothèque</button>
      <button class="btn">Voir les logs</button>
      <button class="btn">Infos système</button>
    </div>
  `;
  root.append(srv.root);

  let lastRunning = false;
  let pollTimer = null;
  let scanLogs = [];
  let docsLogs = [];
  let lastDocsRunning = false;
  let docsPoll = null;

  async function refreshStatus(){
    const status = await fetchStatus();
    if(!status) return;
    const total = status.total || 0;
    const done = status.done || 0;
    const remaining = Math.max(0, total - done);
    const pct = total ? Math.round((done / total) * 100) : (status.running ? 5 : 0);
    bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    const phase = status.phase ? `Phase: ${status.phase}` : "";
    stats.textContent = `Fait ${done} / ${total} • Restant ${remaining}${phase ? " • " + phase : ""}`;
    extras.textContent = `Ajoutés ${status.added} • Mis à jour ${status.updated} • Supprimés ${status.removed} • Erreurs ${status.errors}`;
    err.textContent = status.last_error ? `Dernière erreur: ${status.last_error}` : "";
    btnScan.disabled = !!status.running;
    btnScan.textContent = status.running ? "Scan en cours..." : "Scanner";

    scanLogs = await fetchScanLogs();
    renderLogs(scanLogBox, scanLogPre, scanLogs, status.running);

    if(lastRunning && !status.running){
      await refreshLibrary();
    }
    lastRunning = !!status.running;

    if(status.running){
      pollTimer = setTimeout(refreshStatus, 1000);
    } else if(pollTimer){
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  async function startScan(){
    if(AppConfig.transport !== "rest") return;
    try {
      await fetch(`${AppConfig.restBaseUrl}/library/scan`, {method: "POST"});
    } catch {}
    await refreshStatus();
  }

  async function fetchStatus(){
    if(AppConfig.transport !== "rest") return null;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/library/scan/status`);
      const body = await res.json();
      if(body?.ok) return body.data;
    } catch {}
    return null;
  }

  async function refreshLibrary(){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/library/summary`);
      const body = await res.json();
      if(body?.ok && body.data){
        store.set({ library: body.data });
      }
    } catch {}
  }

  async function fetchScanLogs(){
    if(AppConfig.transport !== "rest") return [];
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/library/scan/logs`);
      const body = await res.json();
      if(body?.ok && Array.isArray(body.data)) return body.data;
    } catch {}
    return [];
  }

  async function startDocsFetch(){
    if(AppConfig.transport !== "rest") return;
    try {
      await fetch(`${AppConfig.restBaseUrl}/docs/fetch`, {method: "POST"});
    } catch {}
    await refreshDocsStatus();
  }

  async function fetchDocsStatus(){
    if(AppConfig.transport !== "rest") return null;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/docs/fetch/status`);
      const body = await res.json();
      if(body?.ok) return body.data;
    } catch {}
    return null;
  }

  async function fetchDocsLogs(){
    if(AppConfig.transport !== "rest") return [];
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/docs/fetch/logs`);
      const body = await res.json();
      if(body?.ok && Array.isArray(body.data)) return body.data;
    } catch {}
    return [];
  }

  async function refreshDocsStatus(){
    const status = await fetchDocsStatus();
    if(!status) return;
    const total = (status.total_artists || 0) + (status.total_albums || 0);
    const done = (status.done_artists || 0) + (status.done_albums || 0);
    const remaining = Math.max(0, total - done);
    const pct = total ? Math.round((done / total) * 100) : (status.running ? 5 : 0);
    docsBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    const phase = status.phase ? `Phase: ${status.phase}` : "";
    docsStats.textContent = `Fait ${done} / ${total} • Restant ${remaining}${phase ? " • " + phase : ""}`;
    docsErr.textContent = status.last_error ? `Dernière erreur: ${status.last_error}` : "";
    btnDocs.disabled = !!status.running;
    btnDocs.textContent = status.running ? "Récupération..." : "Récupérer (web)";

    docsLogs = await fetchDocsLogs();
    renderLogs(docsLogBox, docsLogPre, docsLogs, status.running);

    if(lastDocsRunning && !status.running){
      await refreshLibrary();
    }
    lastDocsRunning = !!status.running;

    if(status.running){
      docsPoll = setTimeout(refreshDocsStatus, 1200);
    } else if(docsPoll){
      clearTimeout(docsPoll);
      docsPoll = null;
    }
  }

  function renderLogs(box, pre, logs, running){
    if(!logs.length && !running){
      box.hidden = true;
      return;
    }
    box.hidden = false;
    pre.textContent = logs.map((l)=>JSON.stringify(l)).join("\n");
    if(!running){
      clearTimeout(box._hideTimer);
      box._hideTimer = setTimeout(()=>{ box.hidden = true; }, 8000);
    }
  }

  function exportLogs(logs, filename){
    const blob = new Blob([JSON.stringify(logs || [], null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  await refreshStatus();
  await refreshDocsStatus();
}
