import { card, listRow, coverEl, button, pill } from "../components/ui.js";
import { store } from "../store.js";
import { toast } from "../utils.js";
import { AppConfig } from "../config.js";

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

  const list = document.createElement("div");
  list.className = "list";
  list.style.marginTop = "12px";

  if(AppConfig.transport === "rest"){
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
