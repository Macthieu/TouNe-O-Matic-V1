import { card, listRow, coverEl, button, pill } from "../components/ui.js";
import { store } from "../store.js";
import { toast } from "../utils.js";
import { AppConfig } from "../config.js";
import { renderRoute } from "../router.js";

function iconEl(emoji, label){
  const el = document.createElement("div");
  el.className = "row__icon";
  el.textContent = emoji;
  if(label) el.setAttribute("aria-label", label);
  return el;
}

export async function render(root){
  const st = store.get();

  const c = card({ title:"Sorties", subtitle:"Résumé" });

  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.flexWrap = "wrap";
  top.style.gap = "10px";
  top.append(
    pill(`Actif : ${st.player.name}`),
    pill(`Volume : ${st.player.volume}%`),
  );

  c.body.append(top);
  const hint = document.createElement("div");
  hint.className = "muted small";
  hint.style.marginTop = "8px";
  hint.textContent = "Sortie principale = mode exclusif. Mixeur multi-sorties = sorties simultanées.";
  c.body.append(hint);

  root.append(c.root);

  const outputCard = card({ title:"Sortie principale", subtitle:"Mode exclusif (désactive les autres sorties)" });
  const outputList = document.createElement("div");
  outputList.className = "list";
  outputList.style.marginTop = "10px";
  outputCard.body.append(outputList);
  root.append(outputCard.root);

  if(AppConfig.transport === "rest"){
    await renderOutputTargets(outputList);
    await renderOutputConsole(root);
  } else {
    toast("Mode démo : console sorties indisponible.");
  }

  const g = card({ title:"Groupes", subtitle:"Snapcast" });
  g.body.innerHTML = `
    <div class="muted">Aucun groupe.</div>
  `;

  root.append(g.root);

  if(AppConfig.transport === "rest"){
    await renderSnapcastGroups(g);
  }
}

async function renderOutputConsole(root){
  const consoleCard = card({
    title: "Mixeur multi-sorties",
    subtitle: "Volumes par zone + sorties simultanées",
  });
  const list = document.createElement("div");
  list.className = "list";
  list.style.marginTop = "10px";
  consoleCard.body.append(list);
  root.append(consoleCard.root);

  async function refresh(){
    list.innerHTML = '<div class="muted">Chargement des sorties…</div>';
    try {
      const [mpdRes, snapRes] = await Promise.all([
        fetchJson("/mpd/outputs").catch(()=>({outputs: []})),
        fetchJson("/snapcast/status").catch(()=>({clients: []})),
      ]);
      const mpdOutputs = mpdRes.outputs || [];
      const snapClients = snapRes.clients || [];
      list.innerHTML = "";

      const mpdLabel = document.createElement("div");
      mpdLabel.className = "muted small";
      mpdLabel.textContent = "MPD (sorties locales)";
      list.append(mpdLabel);

      if(!mpdOutputs.length){
        list.append(listRow({
          title: "Aucune sortie MPD",
          subtitle: "Liste indisponible",
          left: coverEl("sm", "mpd"),
          right: button("OK", {onClick:null}),
        }));
      } else {
        const mpdSorted = mpdOutputs.slice().sort((a, b)=>{
          const aScore = a.bit_perfect ? 0 : 1;
          const bScore = b.bit_perfect ? 0 : 1;
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
            ? (isActive ? "Meuble Stéréo (DAC analogique) • active" : "Meuble Stéréo (DAC analogique)")
            : (isActive ? "Locale • active" : "Locale");
          const icon = out.bit_perfect ? "🔌" : "🎛️";
          list.append(listRow({
            title: out.name || "Sortie MPD",
            subtitle,
            left: iconEl(icon, out.name || "Sortie MPD"),
            right: actions,
          }));
        });
      }

      const snapLabel = document.createElement("div");
      snapLabel.className = "muted small";
      const onlineClients = snapClients.filter((c)=>c.connected);
      const offlineCount = snapClients.length - onlineClients.length;
      snapLabel.textContent = offlineCount > 0
        ? `Snapcast (AirPlay/Bluetooth/Salles) • ${offlineCount} hors ligne`
        : "Snapcast (AirPlay/Bluetooth/Salles)";
      snapLabel.style.marginTop = "8px";
      list.append(snapLabel);

      if(!onlineClients.length){
        list.append(listRow({
          title: "Aucun client Snapcast en ligne",
          subtitle: "Aucune sortie réseau active",
          left: coverEl("sm", "snap"),
          right: button("OK", {onClick:null}),
        }));
        return;
      }

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
        list.append(listRow({
          title: label,
          subtitle,
          left: iconEl(icon, label),
          right: actions,
        }));
      });
    } catch {
      list.innerHTML = '<div class="muted">Sorties indisponibles.</div>';
    }
  }

  await refresh();
}

async function renderOutputTargets(list){
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

    list.append(listRow({
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
    }));

    airplaySinks.forEach((s)=>{
      const isActive = active === "airplay" && airplay.current === s.name;
      list.append(listRow({
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
      }));
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
      list.append(listRow({
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
      }));
    });

    if(!airplaySinks.length && !bt.sinks?.length){
      list.append(listRow({
        title: "Aucune sortie distante",
        subtitle: "AirPlay/Bluetooth non détectés",
        left: coverEl("sm", "output"),
        right: button("OK", {disabled: true}),
      }));
    }
  } catch {
    list.innerHTML = '<div class="muted">Sorties audio indisponibles.</div>';
  }
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
