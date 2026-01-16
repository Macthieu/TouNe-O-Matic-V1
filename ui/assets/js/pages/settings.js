import { card, listRow, coverEl, button } from "../components/ui.js";
import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { toast } from "../utils.js";
import { renderRoute } from "../router.js";

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
    subtitle: st.ui.layout === "grid" ? "Grille" : "Liste",
    left: coverEl("sm","layout"),
    right: button("Basculer", {onClick:(ev)=>{
      ev.stopPropagation();
      const next = st.ui.layout === "grid" ? "list" : "grid";
      store.setLayout(next);
      toast(next === "grid" ? "Vue grille" : "Vue liste");
      renderRoute();
    }})
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
  const btnDocsForce = button("Forcer", {onClick: async (ev)=>{
    ev.stopPropagation();
    if(!window.confirm("Forcer va réécrire les fichiers existants. Continuer ?")) return;
    await startDocsFetch(true);
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
  docsActions.append(btnDocs, btnDocsForce, btnDocsExport);
  docsWrap.append(docsProgress, docsStats, docsErr, docsLogBox, docsActions);
  docs.body.append(docsWrap);
  root.append(docs.root);

  const cmdCard = card({ title:"Commandes", subtitle:"Historique daemon" });
  const cmdWrap = document.createElement("div");
  cmdWrap.style.display = "grid";
  cmdWrap.style.gap = "10px";

  const cmdLogBox = document.createElement("div");
  cmdLogBox.className = "logbox";
  cmdLogBox.hidden = true;
  const cmdLogPre = document.createElement("pre");
  cmdLogPre.className = "logbox__pre";
  cmdLogBox.append(cmdLogPre);

  const cmdActions = document.createElement("div");
  cmdActions.style.display = "flex";
  cmdActions.style.gap = "8px";
  const cmdRefresh = button("Rafraîchir", {onClick: async (ev)=>{
    ev.stopPropagation();
    cmdLogs = await fetchCmdLogs();
    renderLogs(cmdLogBox, cmdLogPre, cmdLogs, false);
  }});
  const cmdExport = button("Exporter logs (JSON)", {onClick:(ev)=>{
    ev.stopPropagation();
    exportLogs(cmdLogs, "cmd-logs.json");
  }});
  cmdActions.append(cmdRefresh, cmdExport);

  cmdWrap.append(cmdLogBox, cmdActions);
  cmdCard.body.append(cmdWrap);
  root.append(cmdCard.root);

  const sources = card({ title:"Sources audio", subtitle:"AirPlay, Spotify, Snapclient" });
  const sourcesWrap = document.createElement("div");
  sourcesWrap.style.display = "grid";
  sourcesWrap.style.gap = "10px";
  const sourcesList = document.createElement("div");
  sourcesList.className = "list";
  sourcesWrap.append(sourcesList);
  sources.body.append(sourcesWrap);
  root.append(sources.root);

  const airplayOut = card({ title:"Sortie AirPlay", subtitle:"Envoyer le son vers un appareil AirPlay" });
  const airplayWrap = document.createElement("div");
  airplayWrap.style.display = "grid";
  airplayWrap.style.gap = "10px";
  const airplayInfo = document.createElement("div");
  airplayInfo.className = "muted small";
  const airplayRow = document.createElement("div");
  airplayRow.style.display = "grid";
  airplayRow.style.gridTemplateColumns = "1fr auto";
  airplayRow.style.alignItems = "center";
  airplayRow.style.gap = "12px";
  const airplaySelect = document.createElement("select");
  airplaySelect.className = "input";
  airplaySelect.style.height = "36px";
  airplaySelect.style.padding = "0 10px";
  airplaySelect.style.maxWidth = "420px";
  const airplayApply = button("Appliquer", {onClick: async (ev)=>{
    ev.stopPropagation();
    const sink = airplaySelect.value;
    if(!sink) return;
    await setAirplayTarget(sink);
    await refreshAirplayTargets();
  }});
  const airplayToggle = button("Activer envoi", {onClick: async (ev)=>{
    ev.stopPropagation();
    const next = airplayToggle.getAttribute("data-active") !== "true";
    await toggleAirplaySend(next);
    await refreshAirplayTargets();
  }});
  const airplayRefresh = button("Rafraîchir", {onClick: async (ev)=>{
    ev.stopPropagation();
    await refreshAirplayTargets();
  }});
  airplayRow.append(airplaySelect, airplayApply, airplayToggle, airplayRefresh);
  airplayWrap.append(airplayInfo, airplayRow);
  airplayOut.body.append(airplayWrap);
  root.append(airplayOut.root);

  const btOut = card({ title:"Sortie Bluetooth", subtitle:"Connecter un appareil et envoyer le son (PulseAudio)" });
  const btWrap = document.createElement("div");
  btWrap.style.display = "grid";
  btWrap.style.gap = "10px";
  const btInfo = document.createElement("div");
  btInfo.className = "muted small";
  const btRow = document.createElement("div");
  btRow.style.display = "grid";
  btRow.style.gridTemplateColumns = "1fr auto";
  btRow.style.alignItems = "center";
  btRow.style.gap = "12px";
  const btSelect = document.createElement("select");
  btSelect.className = "input";
  btSelect.style.height = "36px";
  btSelect.style.padding = "0 10px";
  btSelect.style.maxWidth = "420px";
  const btApply = button("Appliquer sortie", {onClick: async (ev)=>{
    ev.stopPropagation();
    const sink = btSelect.value;
    if(!sink) return;
    await setBluetoothTarget(sink);
    await refreshBluetoothTargets();
  }});
  const btToggle = button("Activer envoi", {onClick: async (ev)=>{
    ev.stopPropagation();
    const next = btToggle.getAttribute("data-active") !== "true";
    await toggleBluetoothSend(next);
    await refreshBluetoothTargets();
  }});
  const btRefresh = button("Rafraîchir sorties", {onClick: async (ev)=>{
    ev.stopPropagation();
    await refreshBluetoothTargets();
  }});
  btRow.append(btSelect, btApply, btToggle, btRefresh);
  const btLatencyRow = document.createElement("div");
  btLatencyRow.style.display = "grid";
  btLatencyRow.style.gridTemplateColumns = "1fr auto";
  btLatencyRow.style.alignItems = "center";
  btLatencyRow.style.gap = "12px";
  const btLatencyLabel = document.createElement("div");
  btLatencyLabel.className = "muted small";
  btLatencyLabel.textContent = "Latence BT: — ms";
  const btLatencySelect = document.createElement("select");
  btLatencySelect.className = "input";
  btLatencySelect.style.height = "36px";
  btLatencySelect.style.padding = "0 10px";
  btLatencySelect.style.maxWidth = "240px";
  [0, 50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000].forEach((ms)=>{
    const opt = document.createElement("option");
    opt.value = String(ms);
    opt.textContent = `${ms} ms`;
    btLatencySelect.append(opt);
  });
  const btLatencyApply = button("Appliquer latence", {onClick: async (ev)=>{
    ev.stopPropagation();
    const val = Number(btLatencySelect.value || 0);
    await applyBluetoothLatency(val);
  }});
  const btLatencyNote = document.createElement("div");
  btLatencyNote.className = "muted small";
  btLatencyNote.textContent = "Utile si le son saccade (plus haut = plus stable).";
  btLatencyRow.append(btLatencySelect, btLatencyApply);

  const btDevList = document.createElement("div");
  btDevList.className = "list";
  const btDevActions = document.createElement("div");
  btDevActions.style.display = "flex";
  btDevActions.style.gap = "8px";
  const btScanBtn = button("Scanner Bluetooth", {onClick: async (ev)=>{
    ev.stopPropagation();
    await scanBluetooth();
    await refreshBluetoothDevices();
  }});
  const btListBtn = button("Rafraîchir appareils", {onClick: async (ev)=>{
    ev.stopPropagation();
    await refreshBluetoothDevices();
  }});
  const btBeatsBtn = button("Activer sortie Beats", {onClick: async (ev)=>{
    ev.stopPropagation();
    await activateBeatsOutput();
  }});
  const btPairBtn = button("Pairer Beats", {onClick: async (ev)=>{
    ev.stopPropagation();
    await pairBeats();
    await refreshBluetoothDevices();
  }});
  const btResetBtn = button("Réinitialiser BT", {kind:"danger", onClick: async (ev)=>{
    ev.stopPropagation();
    await resetBluetooth();
    await refreshBluetoothDevices();
    await refreshBluetoothTargets();
  }});
  btDevActions.append(btScanBtn, btListBtn, btBeatsBtn, btPairBtn, btResetBtn);

  btWrap.append(btInfo, btRow, btLatencyLabel, btLatencyRow, btLatencyNote, btDevActions, btDevList);
  btOut.body.append(btWrap);
  root.append(btOut.root);

  const multi = card({ title:"Multiroom (Snapcast)", subtitle:"Latence clients (ms)" });
  const multiWrap = document.createElement("div");
  multiWrap.style.display = "grid";
  multiWrap.style.gap = "10px";
  const streamRow = document.createElement("div");
  streamRow.style.display = "grid";
  streamRow.style.gridTemplateColumns = "1fr auto";
  streamRow.style.alignItems = "center";
  streamRow.style.gap = "12px";
  const streamLabel = document.createElement("div");
  streamLabel.className = "muted small";
  streamLabel.textContent = "Source Snapcast: —";
  const streamSelect = document.createElement("select");
  streamSelect.className = "input";
  streamSelect.style.height = "36px";
  streamSelect.style.padding = "0 10px";
  streamSelect.style.maxWidth = "320px";
  const streamApply = button("Appliquer source", {onClick: async (ev)=>{
    ev.stopPropagation();
    const nextStream = streamSelect.value;
    const groupId = streamSelect.getAttribute("data-group");
    if(!nextStream || !groupId) return;
    await applyStream(groupId, nextStream);
  }});
  const streamSetup = button("Configurer sources", {onClick: async (ev)=>{
    ev.stopPropagation();
    await enableSnapcastSources();
  }});
  streamRow.append(streamSelect, streamApply, streamSetup);
  const multiRow = document.createElement("div");
  multiRow.style.display = "grid";
  multiRow.style.gridTemplateColumns = "1fr auto";
  multiRow.style.alignItems = "center";
  multiRow.style.gap = "12px";
  const latencyLabel = document.createElement("div");
  latencyLabel.className = "muted small";
  latencyLabel.textContent = "Latence: — ms";
  const latencyRange = document.createElement("input");
  latencyRange.type = "range";
  latencyRange.min = "50";
  latencyRange.max = "5000";
  latencyRange.step = "50";
  latencyRange.value = "1000";
  const latencyApply = button("Appliquer", {onClick: async (ev)=>{
    ev.stopPropagation();
    await applyLatency(Number(latencyRange.value || 0));
  }});
  const latencyNote = document.createElement("div");
  latencyNote.className = "muted small";
  latencyNote.textContent = "Appliqué aux clients Snapcast connectés.";
  const latencyList = document.createElement("div");
  latencyList.className = "list";
  latencyList.style.marginTop = "8px";
  multiRow.append(latencyRange, latencyApply);
  multiWrap.append(streamLabel, streamRow, latencyLabel, multiRow, latencyNote, latencyList);
  multi.body.append(multiWrap);
  root.append(multi.root);

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

  const libs = card({ title:"Bibliothèques externes", subtitle:"Détection auto des montages /mnt/media" });
  const libsWrap = document.createElement("div");
  libsWrap.style.display = "grid";
  libsWrap.style.gap = "10px";
  const libsList = document.createElement("div");
  libsList.className = "list";
  const libsInfo = document.createElement("div");
  libsInfo.className = "muted small";
  const libsStats = document.createElement("div");
  libsStats.className = "muted small";
  const libsResult = document.createElement("div");
  libsResult.className = "logbox";
  libsResult.hidden = true;
  const libsResultPre = document.createElement("pre");
  libsResultPre.className = "logbox__pre";
  libsResult.append(libsResultPre);
  const libsSubdirRow = document.createElement("div");
  libsSubdirRow.style.display = "flex";
  libsSubdirRow.style.gap = "8px";
  libsSubdirRow.style.alignItems = "center";
  const libsSubdirLabel = document.createElement("div");
  libsSubdirLabel.className = "muted small";
  libsSubdirLabel.textContent = "Sous-dossier forcé (optionnel)";
  const libsSubdirInput = document.createElement("input");
  libsSubdirInput.className = "input";
  libsSubdirInput.placeholder = "ex: Musique, Music";
  libsSubdirInput.style.maxWidth = "220px";
  const libsActions = document.createElement("div");
  libsActions.style.display = "flex";
  libsActions.style.gap = "8px";
  const btnLibsDry = button("Dry‑run", {onClick: async (ev)=>{
    ev.stopPropagation();
    const res = await syncLibraryRoots(true);
    if(res?.ok){
      toast(`Dry‑run: +${res.data?.actions?.created || 0} / ~${res.data?.actions?.updated || 0}`);
      renderLibsResult(res.data);
    }
  }});
  const btnLibsCleanup = button("Supprimer liens obsolètes", {kind:"danger", onClick: async (ev)=>{
    ev.stopPropagation();
    if(!window.confirm("Supprimer les liens qui ne correspondent plus aux montages détectés ?")) return;
    const res = await syncLibraryRoots(false);
    if(res?.ok){
      libsData = await fetchLibraryRoots();
      renderLibraryRoots();
      toast("Liens obsolètes supprimés");
      renderLibsResult(res.data);
    }
  }});
  const btnLibsDetect = button("Détecter", {onClick: async (ev)=>{
    ev.stopPropagation();
    libsData = await fetchLibraryRoots();
    renderLibraryRoots();
  }});
  const btnLibsSync = button("Sync liens", {onClick: async (ev)=>{
    ev.stopPropagation();
    const res = await syncLibraryRoots(false);
    if(res?.ok){
      libsData = await fetchLibraryRoots();
      renderLibraryRoots();
      toast("Liens synchronisés");
      renderLibsResult(res.data);
    }
  }});
  libsActions.append(btnLibsDry, btnLibsCleanup, btnLibsDetect, btnLibsSync);
  libsSubdirRow.append(libsSubdirLabel, libsSubdirInput);
  libsWrap.append(libsInfo, libsStats, libsSubdirRow, libsList, libsResult, libsActions);
  libs.body.append(libsWrap);
  root.append(libs.root);

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
  let cmdLogs = [];
  let servicesStatus = [];
  let libsData = null;
  let lastDocsRunning = false;
  let docsPoll = null;
  let airplayState = {sinks: [], current: "", active: false};
  let btState = {sinks: [], current: "", active: false};
  let btDevices = [];

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

  async function refreshLatency(){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/snapcast/latency`);
      const body = await res.json();
      if(body?.ok){
        const ms = body.data?.latency_ms;
        if(typeof ms === "number"){
          latencyRange.value = String(ms);
          latencyLabel.textContent = `Latence: ${ms} ms`;
        } else {
          latencyLabel.textContent = "Latence: — ms";
        }
        if(!body.data?.clients){
          latencyNote.textContent = "Aucun client Snapcast connecté.";
        } else {
          latencyNote.textContent = `Clients connectés: ${body.data.clients}`;
        }
      }
    } catch {}
  }

  async function refreshSnapcastStatus(){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/snapcast/status`);
      const body = await res.json();
      if(!body?.ok) return;
      const groups = body.data?.groups || [];
      const streams = body.data?.streams || [];
      const clients = [];
      groups.forEach((g)=>{
        (g.clients || []).forEach((c)=>{
          clients.push({group: g.name, ...c});
        });
      });
      if(groups.length && streams.length){
        const group = groups[0];
        streamSelect.setAttribute("data-group", group.id || "");
        streamSelect.innerHTML = "";
        streams.forEach((s)=>{
          const opt = document.createElement("option");
          opt.value = s.id;
          opt.textContent = s.name || s.id;
          if(group.stream_id && s.id === group.stream_id) opt.selected = true;
          streamSelect.append(opt);
        });
        streamLabel.textContent = `Source Snapcast: ${group.name || "Groupe"}`;
      } else {
        streamSelect.innerHTML = "";
        streamLabel.textContent = "Source Snapcast: —";
      }
      if(!clients.length){
        latencyList.innerHTML = '<div class="muted">Aucun client Snapcast connecté.</div>';
        return;
      }
      latencyList.innerHTML = "";
      clients.forEach((c)=>{
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <div class="row__main">
            <div class="row__title ellipsis">${c.name || c.host?.name || c.id || "Client"}</div>
            <div class="row__sub ellipsis muted small">Snapcast • ${c.connected ? "en ligne" : "hors ligne"} • ${c.group || "Groupe"}</div>
          </div>
          <div class="row__trail muted small">${c.latency ?? "—"} ms</div>
        `;
        latencyList.append(row);
      });
    } catch {}
  }

  async function refreshAirplayTargets(){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/airplay/targets`);
      const body = await res.json();
      if(!body?.ok) return;
      airplayState = body.data || airplayState;
      const sinks = airplayState.sinks || [];
      airplaySelect.innerHTML = "";
      if(!sinks.length){
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Aucun appareil AirPlay détecté";
        airplaySelect.append(opt);
        airplaySelect.disabled = true;
      } else {
        airplaySelect.disabled = false;
        sinks.forEach((s)=>{
          const opt = document.createElement("option");
          opt.value = s.name;
          opt.textContent = s.description || s.name;
          if(airplayState.current && s.name === airplayState.current) opt.selected = true;
          airplaySelect.append(opt);
        });
      }
      airplayInfo.textContent = airplayState.active
        ? `Envoi actif • Cible: ${airplayState.current || "—"}`
        : "Envoi inactif";
      airplayToggle.textContent = airplayState.active ? "Arrêter envoi" : "Activer envoi";
      airplayToggle.setAttribute("data-active", airplayState.active ? "true" : "false");
    } catch {}
  }

  async function refreshBluetoothTargets(){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/bluetooth/targets`);
      const body = await res.json();
      if(!body?.ok) return;
      btState = body.data || btState;
      const latencyMs = Number(btState.latency_ms);
      if(!Number.isNaN(latencyMs)){
        btLatencySelect.value = String(latencyMs);
        btLatencyLabel.textContent = `Latence BT: ${latencyMs} ms`;
      }
      const sinks = btState.sinks || [];
      btSelect.innerHTML = "";
      if(!sinks.length){
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Aucune sortie Bluetooth";
        btSelect.append(opt);
        btSelect.disabled = true;
      } else {
        btSelect.disabled = false;
        sinks.forEach((s)=>{
          const opt = document.createElement("option");
          opt.value = s.name;
          opt.textContent = s.description || s.name;
          if(btState.current && s.name === btState.current) opt.selected = true;
          btSelect.append(opt);
        });
      }
      btInfo.textContent = btState.active
        ? `Envoi actif • Cible: ${btState.current || "—"}`
        : "Envoi inactif";
      btToggle.textContent = btState.active ? "Arrêter envoi" : "Activer envoi";
      btToggle.setAttribute("data-active", btState.active ? "true" : "false");
    } catch {}
  }

  async function refreshBluetoothDevices(){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/bluetooth/devices`);
      const body = await res.json();
      if(!body?.ok) return;
      btDevices = body.data || [];
      renderBluetoothDevices();
    } catch {}
  }

  async function activateBeatsOutput(){
    if(AppConfig.transport !== "rest") return;
    await refreshBluetoothTargets();
    const sinks = btState.sinks || [];
    const beats = sinks.find((s)=>{
      const label = `${s.description || ""} ${s.name || ""}`.toLowerCase();
      return label.includes("beats");
    });
    if(!beats){
      toast("Aucune sortie Beats détectée");
      return;
    }
    await setBluetoothTarget(beats.name);
    await toggleBluetoothSend(true);
    toast("Sortie Beats activée");
    await refreshBluetoothTargets();
  }

  function renderBluetoothDevices(){
    btDevList.innerHTML = "";
    if(!btDevices.length){
      btDevList.innerHTML = '<div class="muted">Aucun appareil Bluetooth.</div>';
      return;
    }
    btDevices.forEach((d)=>{
      const subtitle = d.connected
        ? "connecté"
        : (d.paired ? "appairé" : "détecté");
      const actionBtn = d.connected
        ? button("Déconnecter", {onClick: async (ev)=>{
            ev.stopPropagation();
            await bluetoothDisconnect(d.mac);
            await refreshBluetoothDevices();
            await refreshBluetoothTargets();
          }})
        : button("Connecter", {onClick: async (ev)=>{
            ev.stopPropagation();
            const btn = ev.currentTarget;
            btn.disabled = true;
            btn.textContent = "Connexion…";
            toast(`Connexion à ${d.name || d.mac}…`);
            await bluetoothConnect(d.mac, d.name);
            const start = Date.now();
            const poll = async ()=>{
              await refreshBluetoothDevices();
              await refreshBluetoothTargets();
              const found = (btDevices || []).find((x)=>x.mac === d.mac);
              if(found?.connected || Date.now() - start > 12000){
                btn.disabled = false;
                btn.textContent = "Connecter";
                if(!found?.connected){
                  toast("Connexion Bluetooth échouée");
                }
                return;
              }
              setTimeout(poll, 1500);
            };
            poll();
          }});
      btDevList.append(listRow({
        title: d.name || d.mac,
        subtitle,
        left: coverEl("sm", d.name || "bt"),
        right: actionBtn
      }));
    });
  }

  async function scanBluetooth(){
    if(AppConfig.transport !== "rest") return;
    try {
      toast("Scan Bluetooth en cours…");
      fetch(`${AppConfig.restBaseUrl}/bluetooth/scan`, {method: "POST"})
        .then((res)=>res.json())
        .then((body)=>{
          if(!body?.ok) toast(body?.error || "Erreur Bluetooth");
        })
        .catch(()=>toast("Erreur Bluetooth"));
      setTimeout(refreshBluetoothDevices, 1200);
    } catch {
      toast("Erreur Bluetooth");
    }
  }

  async function resetBluetooth(){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/bluetooth/reset`, {method: "POST"});
      const body = await res.json();
      if(body?.ok){
        toast("Bluetooth réinitialisé");
      } else {
        toast(body?.error || "Erreur Bluetooth");
      }
    } catch {
      toast("Erreur Bluetooth");
    }
  }

  async function pairBeats(){
    if(AppConfig.transport !== "rest") return;
    try {
      toast("Pairing Beats en cours…");
      const res = await fetch(`${AppConfig.restBaseUrl}/bluetooth/pair`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({mac: "4C:97:CC:19:9F:15", name: "Beats Solo 4"})
      });
      const body = await res.json();
      if(body?.ok){
        toast("Pairing Beats lancé");
      } else {
        toast(body?.detail || body?.error || "Erreur Bluetooth");
      }
    } catch {
      toast("Erreur Bluetooth");
    }
  }

  async function bluetoothConnect(mac, name){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/bluetooth/connect`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({mac, name, async: true})
      });
      const body = await res.json();
      if(body?.ok){
        toast("Connexion Bluetooth lancée");
      } else {
        toast(body?.detail || body?.error || "Erreur Bluetooth");
      }
    } catch {
      toast("Erreur Bluetooth");
    }
  }

  async function bluetoothDisconnect(mac){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/bluetooth/disconnect`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({mac})
      });
      const body = await res.json();
      if(body?.ok){
        toast("Bluetooth déconnecté");
      } else {
        toast(body?.detail || body?.error || "Erreur Bluetooth");
      }
    } catch {
      toast("Erreur Bluetooth");
    }
  }

  async function setBluetoothTarget(sink){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/bluetooth/target`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({sink})
      });
      const body = await res.json();
      if(body?.ok){
        toast("Sortie Bluetooth mise à jour");
      } else {
        toast(body?.detail || body?.error || "Erreur Bluetooth");
      }
    } catch {
      toast("Erreur Bluetooth");
    }
  }

  async function toggleBluetoothSend(enabled){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/bluetooth/send`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({enabled})
      });
      const body = await res.json();
      if(body?.ok){
        toast(enabled ? "Envoi Bluetooth activé" : "Envoi Bluetooth arrêté");
      } else {
        toast(body?.detail || body?.error || "Erreur Bluetooth");
      }
    } catch {
      toast("Erreur Bluetooth");
    }
  }

  async function applyBluetoothLatency(ms){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/bluetooth/latency`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({latency_ms: ms})
      });
      const body = await res.json();
      if(body?.ok){
        btLatencyLabel.textContent = `Latence BT: ${body.data.latency_ms} ms`;
        toast("Latence Bluetooth appliquée");
      } else {
        toast(body?.error || "Erreur Bluetooth");
      }
    } catch {
      toast("Erreur Bluetooth");
    }
  }

  async function setAirplayTarget(sink){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/airplay/target`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({sink})
      });
      const body = await res.json();
      if(body?.ok){
        toast("Sortie AirPlay mise à jour");
      } else {
        toast(body?.error || "Erreur AirPlay");
      }
    } catch {
      toast("Erreur AirPlay");
    }
  }

  async function toggleAirplaySend(enabled){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/airplay/send`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({enabled})
      });
      const body = await res.json();
      if(body?.ok){
        toast(enabled ? "Envoi AirPlay activé" : "Envoi AirPlay arrêté");
      } else {
        toast(body?.error || "Erreur AirPlay");
      }
    } catch {
      toast("Erreur AirPlay");
    }
  }

  async function applyLatency(ms){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/snapcast/latency`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({latency_ms: ms})
      });
      const body = await res.json();
      if(body?.ok){
        latencyLabel.textContent = `Latence: ${body.data.latency_ms} ms`;
        toast("Latence Snapcast appliquée");
        await refreshSnapcastStatus();
      } else {
        toast(body?.error || "Erreur Snapcast");
      }
    } catch {
      toast("Erreur Snapcast");
    }
  }

  async function applyStream(groupId, streamId){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/snapcast/stream`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({group_id: groupId, stream_id: streamId})
      });
      const body = await res.json();
      if(body?.ok){
        toast("Source Snapcast appliquée");
        await refreshSnapcastStatus();
      } else {
        toast(body?.error || "Erreur Snapcast");
      }
    } catch {
      toast("Erreur Snapcast");
    }
  }

  async function enableSnapcastSources(){
    if(AppConfig.transport !== "rest") return;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/snapcast/sources/enable`, {method: "POST"});
      const body = await res.json();
      if(body?.ok){
        toast(`Sources configurées (${body.data?.result || "ok"})`);
        await refreshSnapcastStatus();
      } else {
        toast(body?.error || "Erreur configuration sources");
      }
    } catch {
      toast("Erreur configuration sources");
    }
  }

  async function fetchServicesStatus(){
    if(AppConfig.transport !== "rest") return [];
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/services/status`);
      const body = await res.json();
      if(body?.ok && Array.isArray(body.data)) return body.data;
    } catch {}
    return [];
  }

  async function fetchLibraryRoots(){
    if(AppConfig.transport !== "rest") return null;
    try {
      const subdir = (libsSubdirInput.value || "").trim();
      const url = new URL(`${AppConfig.restBaseUrl}/library/roots`, window.location.origin);
      if(subdir) url.searchParams.set("subdir", subdir);
      const res = await fetch(url.toString());
      const body = await res.json();
      if(body?.ok) return body.data;
    } catch {}
    return null;
  }

  async function syncLibraryRoots(dry=true){
    if(AppConfig.transport !== "rest") return null;
    try {
      const subdir = (libsSubdirInput.value || "").trim();
      const res = await fetch(`${AppConfig.restBaseUrl}/library/roots/sync`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({dry, subdir})
      });
      const body = await res.json();
      if(body?.ok) return body;
      toast(body?.error || "Erreur sync libs");
    } catch {
      toast("Erreur sync libs");
    }
    return null;
  }

  function renderLibraryRoots(){
    libsList.innerHTML = "";
    if(!libsData){
      libsInfo.textContent = "Aucune donnée chargée.";
      libsStats.textContent = "";
      return;
    }
    const detected = libsData.detected || [];
    libsInfo.textContent = `Racines détectées: ${detected.length} • Liens: ${libsData.link_root}`;
    libsStats.textContent = libsData?.actions
      ? `Actions: +${libsData.actions.created || 0} ~${libsData.actions.updated || 0} -${libsData.actions.removed || 0} =${libsData.actions.kept || 0}`
      : "";
    if(!detected.length){
      libsList.innerHTML = '<div class="muted">Aucune bibliothèque détectée.</div>';
      return;
    }
    detected.forEach((r)=>{
      const subtitle = r.linked ? `lié → ${r.link}` : "non lié";
      libsList.append(listRow({
        title: r.name,
        subtitle,
        left: coverEl("sm", r.name),
        right: r.linked ? button("OK", {disabled:true}) : button("Lier", {onClick: async (ev)=>{
          ev.stopPropagation();
          const res = await syncLibraryRoots(false);
          if(res?.ok){
            libsData = await fetchLibraryRoots();
            renderLibraryRoots();
          }
        }})
      }));
    });
  }

  function renderLibsResult(data){
    if(!data?.detail){
      libsResult.hidden = true;
      return;
    }
    libsResult.hidden = false;
    libsData = { ...(libsData || {}), actions: data.actions || null };
    renderLibraryRoots();
    const sections = [
      ["created", "CREATED"],
      ["updated", "UPDATED"],
      ["removed", "REMOVED"],
      ["kept", "KEPT"],
    ];
    const lines = [];
    const clsMap = {
      created: "log-created",
      updated: "log-updated",
      removed: "log-removed",
      kept: "log-kept",
    };
    const esc = (s)=>String(s || "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;");
    sections.forEach(([key, label])=>{
      const items = data.detail?.[key] || [];
      if(!items.length) return;
      lines.push(`<span class="log-tag ${clsMap[key] || ""}">[${label}]</span>`);
      items.forEach((r)=>{
        const link = r.link || "";
        const path = r.path || "";
        lines.push(`${esc(link)} -> ${esc(path)}`);
      });
      lines.push("");
    });
    libsResultPre.innerHTML = lines.join("\n").trim();
  }

  async function serviceAction(name, action){
    if(AppConfig.transport !== "rest") return null;
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/services/action`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name, action})
      });
      const body = await res.json();
      if(body?.ok) return body.data;
      toast(body?.error || "Erreur service");
    } catch {
      toast("Erreur service");
    }
    return null;
  }

  function renderSources(){
    sourcesList.innerHTML = "";
    if(!servicesStatus.length){
      sourcesList.innerHTML = '<div class="muted">Aucune source détectée.</div>';
      return;
    }
    servicesStatus.forEach((s)=>{
      const label = s.name?.replace(".service", "") || "Service";
      const subtitle = s.installed
        ? (s.active ? "en cours" : "arrêté")
        : "non installé";
      const actionBtn = s.installed
        ? button(s.active ? "Stop" : "Start", {onClick: async (ev)=>{
            ev.stopPropagation();
            const res = await serviceAction(s.name, s.active ? "stop" : "start");
            if(res) {
              servicesStatus = await fetchServicesStatus();
              renderSources();
            }
          }})
        : button("Installer", {onClick: (ev)=>{ev.stopPropagation(); toast("Installe via apt (shairport-sync/librespot)");}});
      sourcesList.append(listRow({
        title: label,
        subtitle,
        left: coverEl("sm", label),
        right: actionBtn
      }));
    });
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

  async function startDocsFetch(force=false){
    if(AppConfig.transport !== "rest") return;
    try {
      const url = `${AppConfig.restBaseUrl}/docs/fetch${force ? "?force=1" : ""}`;
      await fetch(url, {method: "POST"});
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

  async function fetchCmdLogs(){
    if(AppConfig.transport !== "rest") return [];
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/cmd/logs?limit=300`);
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
  await refreshLatency();
  await refreshSnapcastStatus();
  await refreshAirplayTargets();
  await refreshBluetoothDevices();
  await refreshBluetoothTargets();
  cmdLogs = await fetchCmdLogs();
  renderLogs(cmdLogBox, cmdLogPre, cmdLogs, false);
  servicesStatus = await fetchServicesStatus();
  renderSources();
  libsData = await fetchLibraryRoots();
  renderLibraryRoots();
}
