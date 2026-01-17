import { card, listRow, coverEl, button, pill } from "../components/ui.js";
import { store } from "../store.js";
import { toast } from "../utils.js";
import { AppConfig } from "../config.js";
import { renderRoute } from "../router.js";

export async function render(root){
  const st = store.get();

  const c = card({ title:"Appareils", subtitle:"Sélection & volume" });

  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.flexWrap = "wrap";
  top.style.gap = "10px";
  top.append(
    pill(`Actif : ${st.player.name}`),
    pill(`Volume : ${st.player.volume}%`),
  );

  c.body.append(top);

  const outputCard = card({ title:"Sorties audio", subtitle:"Changer la destination" });
  const outputList = document.createElement("div");
  outputList.className = "list";
  outputList.style.marginTop = "10px";
  outputCard.body.append(outputList);
  root.append(outputCard.root);

  const list = document.createElement("div");
  list.className = "list";
  list.style.marginTop = "12px";

  if(AppConfig.transport === "rest"){
    await renderOutputTargets(outputList);
    await renderSnapcastDevices(list);
  } else {
    const devices = [
      {name:"Meuble Stéréo TouNe-O-Matic", type:"MPD", online:true},
      {name:"Salon", type:"MPD", online:true},
      {name:"Atelier", type:"MPD", online:false},
      {name:"Cuisine", type:"MPD", online:true},
    ];
    for(const d of devices){
      list.append(listRow({
        title: d.name,
        subtitle: `${d.type} • ${d.online ? "en ligne" : "hors ligne"}`,
        left: coverEl("sm", d.name),
        right: button("Sélectionner", {onClick:(ev)=>{ev.stopPropagation(); toast("Démo : switch player plus tard.");}}),
      }));
    }
  }

  c.body.append(list);

  const g = card({ title:"Groupes", subtitle:"Snapcast" });
  g.body.innerHTML = `
    <div class="muted">Aucun groupe.</div>
  `;

  root.append(c.root, g.root);

  if(AppConfig.transport === "rest"){
    await renderSnapcastGroups(g);
  }
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
      subtitle: active === "local" ? "Local • actif" : "Local",
      left: coverEl("sm", "local"),
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
        left: coverEl("sm", s.display || s.description || s.name),
        right: button(isActive ? "Actif" : "Sélectionner", {
          disabled: isActive,
          onClick: async (ev)=>{
            ev.stopPropagation();
            await outputSelect("airplay", s.name);
          }
        }),
      }));
    });

    (bt.sinks || []).forEach((s)=>{
      const isActive = active === "bluetooth" && bt.current === s.name;
      list.append(listRow({
        title: s.description || s.name,
        subtitle: isActive ? "Bluetooth • actif" : "Bluetooth",
        left: coverEl("sm", s.description || s.name),
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
