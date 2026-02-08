import { card, listRow, coverEl, button, pill } from "../components/ui.js";
import { store } from "../store.js";
import { toast } from "../utils.js";
import { AppConfig } from "../config.js";
import { renderRoute } from "../router.js";

const OUTPUT_VIEW_KEY = "toune.outputs.view";

function iconEl(emoji, label){
  const el = document.createElement("div");
  el.className = "row__icon";
  el.textContent = emoji;
  if(label) el.setAttribute("aria-label", label);
  return el;
}

function getOutputViewMode(){
  try {
    const hash = String(window.location.hash || "");
    const qs = hash.includes("?") ? hash.split("?")[1] : "";
    const forced = String(new URLSearchParams(qs).get("view") || "").toLowerCase();
    if(forced === "advanced" || forced === "simple"){
      localStorage.setItem(OUTPUT_VIEW_KEY, forced);
      return forced;
    }
  } catch {
    // ignore invalid hash/query
  }
  const raw = String(localStorage.getItem(OUTPUT_VIEW_KEY) || "simple").toLowerCase();
  return raw === "advanced" ? "advanced" : "simple";
}

function setOutputViewMode(mode){
  const safe = mode === "advanced" ? "advanced" : "simple";
  localStorage.setItem(OUTPUT_VIEW_KEY, safe);
}

export async function render(root){
  const st = store.get();
  const viewMode = getOutputViewMode();

  const c = card({
    title:"Sorties",
    subtitle: viewMode === "advanced" ? "Vue avancée" : "Vue simplifiée",
  });

  const top = document.createElement("div");
  top.className = "outputs__summary";
  top.append(
    pill(`Actif : ${st.player.name}`),
    pill(`Volume : ${st.player.volume}%`),
    pill(`Vue : ${viewMode === "advanced" ? "Avancée" : "Simple"}`),
  );

  c.body.append(top);
  const modeBar = document.createElement("div");
  modeBar.className = "rowbar outputs__modebar";
  const simpleBtn = button("Simple", {
    kind: viewMode === "simple" ? "primary" : "default",
    onClick: async ()=>{
      if(getOutputViewMode() === "simple") return;
      setOutputViewMode("simple");
      await renderRoute();
    },
  });
  const advancedBtn = button("Avancé", {
    kind: viewMode === "advanced" ? "primary" : "default",
    onClick: async ()=>{
      if(getOutputViewMode() === "advanced") return;
      setOutputViewMode("advanced");
      await renderRoute();
    },
  });
  if(viewMode === "simple"){
    simpleBtn.setAttribute("disabled", "disabled");
    simpleBtn.classList.add("is-disabled");
  } else {
    advancedBtn.setAttribute("disabled", "disabled");
    advancedBtn.classList.add("is-disabled");
  }
  modeBar.append(simpleBtn, advancedBtn);
  c.body.append(modeBar);

  const hint = document.createElement("div");
  hint.className = "muted small output__hint";
  hint.textContent = viewMode === "advanced"
    ? "Sortie principale + mixeur détaillé (MPD/Snapcast)."
    : "Mode simple : uniquement les commandes essentielles.";
  c.body.append(hint);

  root.append(c.root);

  const outputCard = card({
    title:"Sortie principale",
    subtitle: viewMode === "advanced"
      ? "Mode exclusif (désactive les autres sorties)"
      : "Mode exclusif simplifié",
  });
  const outputList = document.createElement("div");
  outputList.className = "list outputs__list";
  outputCard.body.append(outputList);
  root.append(outputCard.root);

  if(AppConfig.transport === "rest"){
    await renderOutputTargets(outputList, viewMode);
    await renderOutputConsole(root, viewMode);
  } else {
    toast("Mode démo : console sorties indisponible.");
  }
}

async function renderOutputConsole(root, viewMode = "simple"){
  const consoleCard = card({
    title: viewMode === "advanced" ? "Mixeur multi-sorties" : "Sorties locales",
    subtitle: viewMode === "advanced"
      ? "Volumes par zone + sorties simultanées"
      : "Activer/désactiver les sorties DAC locales",
  });
  const list = document.createElement("div");
  list.className = "list outputs__list";
  consoleCard.body.append(list);
  root.append(consoleCard.root);

  async function refresh(){
    list.innerHTML = '<div class="muted">Chargement des sorties…</div>';
    try {
      const [mpdRes, snapRes] = await Promise.all([
        fetchJson("/mpd/outputs").catch(()=>({outputs: []})),
        fetchJson("/snapcast/status").catch(()=>({clients: [], groups: []})),
      ]);
      const mpdOutputs = mpdRes.outputs || [];
      const snapClients = snapRes.clients || [];
      const snapGroups = snapRes.groups || [];
      list.innerHTML = "";

      if(viewMode === "advanced"){
        appendSectionTitle(list, "Sorties locales (MPD)");
      }

      if(!mpdOutputs.length){
        appendSectionEmpty(list, "Aucune sortie locale détectée.");
      } else {
        const mpdSorted = mpdOutputs.slice().sort((a, b)=>{
          const aScore = (a.enabled ? 0 : 2) + (a.bit_perfect ? 0 : 1);
          const bScore = (b.enabled ? 0 : 2) + (b.bit_perfect ? 0 : 1);
          if(aScore !== bScore) return aScore - bScore;
          return String(a.name || "").localeCompare(String(b.name || ""), "fr");
        });
        mpdSorted.forEach((out)=>{
          const actions = document.createElement("div");
          actions.className = "row__actions output__actions";

          const isActive = !!out.enabled;
          const toggle = button(isActive ? "Actif" : "Inactif", {
            onClick: async (ev)=>{
              ev.stopPropagation();
              await setMpdOutput(out.id, !isActive);
              await refresh();
            }
          });
          actions.append(toggle);

          const label = document.createElement("span");
          label.className = "pill";
          label.textContent = out.bit_perfect ? "Bit-perfect" : "Volume MPD (global)";
          actions.append(label);

          const subtitle = out.bit_perfect
            ? (isActive ? "DAC analogique • active" : "DAC analogique")
            : (isActive ? "Sortie locale • active" : "Sortie locale");
          const icon = out.bit_perfect ? "🔌" : "🎛️";
          const row = listRow({
            title: out.name || "Sortie MPD",
            subtitle,
            left: iconEl(icon, out.name || "Sortie MPD"),
            right: actions,
          });
          row.classList.add("row--output");
          list.append(row);
        });
      }

      if(viewMode !== "advanced"){
        return;
      }

      const snapLabel = document.createElement("div");
      snapLabel.className = "output__section-title";
      const onlineClients = snapClients.filter((c)=>c.connected);
      const offlineCount = snapClients.length - onlineClients.length;
      snapLabel.textContent = offlineCount > 0
        ? `Sorties réseau (Snapcast) • ${offlineCount} hors ligne`
        : "Sorties réseau (Snapcast)";
      list.append(snapLabel);

      if(!onlineClients.length){
        appendSectionEmpty(list, "Aucune sortie réseau active.");
      } else {
        const snapSorted = onlineClients.slice().sort((a, b)=>{
          const aName = String(a.name || a.host?.name || "").toLowerCase();
          const bName = String(b.name || b.host?.name || "").toLowerCase();
          const rank = (name)=>{
            if(name.includes("beats")) return 0;
            if(name.includes("airplay") || name.includes("raop") || name.includes("mac")) return 1;
            if(name.includes("toune")) return 2;
            return 3;
          };
          const aRank = rank(aName);
          const bRank = rank(bName);
          if(aRank !== bRank) return aRank - bRank;
          return aName.localeCompare(bName, "fr");
        });
        snapSorted.forEach((client)=>{
          const label = String(client.name || client.host?.name || "Client");
          const name = label.toLowerCase();
          const icon = name.includes("beats")
            ? "🎧"
            : (name.includes("airplay") || name.includes("raop") || name.includes("mac"))
              ? "📡"
              : (name.includes("toune") ? "🏠" : "🔊");
          const actions = document.createElement("div");
          actions.className = "row__actions output__actions";

          const isMuted = !!client.muted;
          const muteBtn = button(isMuted ? "Muet" : "Actif", {
            onClick: async (ev)=>{
              ev.stopPropagation();
              await setSnapcastMute(client.id, !isMuted);
              await refresh();
            }
          });
          if(!client.connected){
            muteBtn.setAttribute("disabled", "disabled");
            muteBtn.classList.add("is-disabled");
          }
          actions.append(muteBtn);

          const range = document.createElement("input");
          range.type = "range";
          range.min = "0";
          range.max = "100";
          range.value = String(client.volume ?? 0);
          range.className = "output__range";
          if(!client.connected || client.volume == null){
            range.setAttribute("disabled", "disabled");
            range.classList.add("is-disabled");
          }

          const pct = document.createElement("span");
          pct.className = "output__pct muted small";
          pct.textContent = `${client.volume ?? 0}%`;

          range.addEventListener("input", ()=>{
            pct.textContent = `${range.value}%`;
            clearTimeout(range._t);
            range._t = setTimeout(async ()=>{
              await setSnapcastVolume(client.id, Number(range.value || 0));
            }, 120);
          });

          actions.append(range, pct);

          const subtitle = `Snapcast • ${client.connected ? "en ligne" : "hors ligne"}`;
          const row = listRow({
            title: label,
            subtitle,
            left: iconEl(icon, label),
            right: actions,
          });
          row.classList.add("row--output");
          list.append(row);
        });
      }

      if(snapGroups.length){
        appendSectionTitle(list, "Groupes Snapcast");
        const line = document.createElement("div");
        line.className = "chips output__groups";
        snapGroups.forEach((g)=>{
          line.append(pill(`${g.name} • ${g.clients?.length || 0}`));
        });
        list.append(line);
      }
    } catch {
      list.innerHTML = '<div class="muted">Sorties indisponibles.</div>';
    }
  }

  await refresh();
}

async function renderOutputTargets(list, viewMode = "simple"){
  list.innerHTML = '<div class="muted">Chargement des sorties…</div>';
  try {
    const [airplayRes, btRes] = await Promise.all([
      fetch(`${AppConfig.restBaseUrl}/airplay/targets`).then((r)=>r.json()).catch(()=>null),
      fetch(`${AppConfig.restBaseUrl}/bluetooth/targets`).then((r)=>r.json()).catch(()=>null),
    ]);
    const airplay = airplayRes?.ok ? airplayRes.data : {sinks: [], current: "", active: false};
    const bt = btRes?.ok ? btRes.data : {sinks: [], current: "", active: false};

    const active = airplay.active ? "airplay" : (bt.active ? "bluetooth" : "local");
    list.innerHTML = "";

    const airplaySinks = normalizeAirplaySinks(airplay.sinks || [], airplay.current);

    const localRow = listRow({
      title: "Meuble Stéréo TouNe-O-Matic",
      subtitle: active === "local" ? "DAC analogique • actif" : "DAC analogique",
      left: iconEl("🔌", "DAC analogique"),
      right: button(active === "local" ? "Actif" : "Sélectionner", {
        disabled: active === "local",
        onClick: async (ev)=>{
          ev.stopPropagation();
          await outputSelect("local");
        }
      }),
    });
    localRow.classList.add("row--output");
    list.append(localRow);

    if(viewMode !== "advanced"){
      return;
    }

    airplaySinks.forEach((s)=>{
      const isActive = active === "airplay" && airplay.current === s.name;
      const row = listRow({
        title: s.display || s.description || s.name,
        subtitle: isActive ? "AirPlay • actif" : "AirPlay",
        left: iconEl("📡", "AirPlay"),
        right: button(isActive ? "Actif" : "Sélectionner", {
          disabled: isActive,
          onClick: async (ev)=>{
            ev.stopPropagation();
            await outputSelect("airplay", s.name);
          }
        }),
      });
      row.classList.add("row--output");
      list.append(row);
    });

    const btLatency = Number(bt.latency_ms);
    const btLatencyLabel = (bt.latency_set === false || Number.isNaN(btLatency))
      ? ""
      : ` • latence ${btLatency} ms`;
    (bt.sinks || []).forEach((s)=>{
      const sinkName = String(s.name || "");
      const sinkKind = sinkName.includes("handsfree") ? "HFP (mono)" : sinkName.includes("a2dp") ? "A2DP (stéréo)" : "";
      const sinkSuffix = sinkKind ? ` • ${sinkKind}` : "";
      const isActive = active === "bluetooth" && bt.current === s.name;
      const row = listRow({
        title: s.description || s.name,
        subtitle: isActive ? `Bluetooth • actif${btLatencyLabel}${sinkSuffix}` : `Bluetooth${btLatencyLabel}${sinkSuffix}`,
        left: iconEl("🎧", "Bluetooth"),
        right: button(isActive ? "Actif" : "Sélectionner", {
          disabled: isActive,
          onClick: async (ev)=>{
            ev.stopPropagation();
            await outputSelect("bluetooth", s.name);
          }
        }),
      });
      row.classList.add("row--output");
      list.append(row);
    });

    if(!airplaySinks.length && !bt.sinks?.length){
      const msg = document.createElement("div");
      msg.className = "muted small output__empty";
      msg.textContent = "Aucune sortie distante détectée (AirPlay/Bluetooth).";
      list.append(msg);
    }
  } catch {
    list.innerHTML = '<div class="muted">Sorties audio indisponibles.</div>';
  }
}

function appendSectionTitle(parent, text){
  const el = document.createElement("div");
  el.className = "output__section-title";
  el.textContent = text;
  parent.append(el);
}

function appendSectionEmpty(parent, text){
  const el = document.createElement("div");
  el.className = "muted small output__empty";
  el.textContent = text;
  parent.append(el);
}

function normalizeAirplaySinks(sinks, current){
  const byDesc = new Map();
  sinks.forEach((s)=>{
    const desc = s.description || s.name || "AirPlay";
    if(!byDesc.has(desc)) byDesc.set(desc, []);
    byDesc.get(desc).push(s);
  });
  const out = [];
  for(const [desc, items] of byDesc.entries()){
    if(items.length === 1){
      out.push({...items[0], display: desc});
      continue;
    }
    const sorted = items.slice().sort((a,b)=>String(a.name).length - String(b.name).length);
    sorted.forEach((s)=>{
      const suffix = (s.name || "").split(".").pop();
      const display = suffix && suffix !== "local" ? `${desc} (${suffix})` : desc;
      out.push({...s, display});
    });
  }
  return out;
}

async function outputSelect(type, target){
  if(AppConfig.transport !== "rest") return;
  try {
    const res = await fetch(`${AppConfig.restBaseUrl}/output/select`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({type, target})
    });
    const body = await res.json();
    if(body?.ok){
      toast(type === "local" ? "Sortie locale active" : "Sortie appliquée");
      await renderRoute();
    } else {
      toast(body?.detail || body?.error || "Erreur sortie");
    }
  } catch {
    toast("Erreur sortie");
  }
}

async function fetchJson(path, opts){
  const res = await fetch(`${AppConfig.restBaseUrl}${path}`, opts);
  const body = await res.json();
  if(!body?.ok) throw new Error(body?.detail || body?.error || "API error");
  return body.data;
}

async function setMpdOutput(id, enabled){
  try {
    await fetchJson("/mpd/output", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({id, enabled})
    });
  } catch {
    toast("Erreur sortie MPD");
  }
}

async function setSnapcastVolume(id, percent){
  try {
    await fetchJson("/snapcast/client/volume", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({id, percent})
    });
  } catch {
    toast("Erreur volume Snapcast");
  }
}

async function setSnapcastMute(id, muted){
  try {
    await fetchJson("/snapcast/client/mute", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({id, muted})
    });
  } catch {
    toast("Erreur mute Snapcast");
  }
}

async function renderSnapcastDevices(list){
  list.innerHTML = '<div class="muted">Chargement des appareils…</div>';
  try {
    const res = await fetch(`${AppConfig.restBaseUrl}/snapcast/status`);
    const body = await res.json();
    if(!body?.ok) throw new Error();
    const {groups, clients} = body.data || {};
    const byId = new Map();
    (clients || []).forEach((c)=>byId.set(c.id, c));
    const flat = [];
    (groups || []).forEach((g)=>{
      (g.clients || []).forEach((c)=>{
        flat.push({group: g.name, ...c});
      });
    });
    if(!flat.length){
      list.innerHTML = '<div class="muted">Aucun client Snapcast connecté.</div>';
      return;
    }
    list.innerHTML = "";
    flat.forEach((c)=>{
      const name = c.name || c.host?.name || c.id || "Client";
      const online = c.connected ? "en ligne" : "hors ligne";
      const latency = (c.latency != null) ? ` • ${c.latency} ms` : "";
      list.append(listRow({
        title: name,
        subtitle: `Snapcast • ${online}${latency} • ${c.group || "Groupe"}`,
        left: coverEl("sm", name),
        right: button("Sélectionner", {onClick:(ev)=>{ev.stopPropagation(); toast("Sélection plus tard.");}}),
      }));
    });
  } catch {
    list.innerHTML = '<div class="muted">Snapcast indisponible.</div>';
  }
}

async function renderSnapcastGroups(groupCard){
  try {
    const res = await fetch(`${AppConfig.restBaseUrl}/snapcast/status`);
    const body = await res.json();
    if(!body?.ok) throw new Error();
    const groups = body.data?.groups || [];
    if(!groups.length){
      groupCard.body.innerHTML = '<div class="muted">Aucun groupe.</div>';
      return;
    }
    const pills = groups.map((g)=>`<span class="pill">${g.name} • ${g.clients?.length || 0}</span>`).join("");
    groupCard.body.innerHTML = `
      <div class="muted">Groupes Snapcast :</div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px">${pills}</div>
    `;
  } catch {
    groupCard.body.innerHTML = '<div class="muted">Snapcast indisponible.</div>';
  }
}
