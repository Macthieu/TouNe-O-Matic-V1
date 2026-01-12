import { card, listRow, coverEl, button, pill } from "../components/ui.js";
import { store } from "../store.js";
import { toast } from "../utils.js";

export async function render(root){
  const st = store.get();

  const c = card({ title:"Appareils", subtitle:"Sélection & volume (mock)" });

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

  c.body.append(list);

  const g = card({ title:"Groupes", subtitle:"Créer/éditer (démo UI)" });
  g.body.innerHTML = `
    <div class="muted">Exemples :</div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px">
      <span class="pill">Rez-de-chaussée</span>
      <span class="pill">Party mode</span>
      <span class="pill">Silence</span>
    </div>
    <div style="margin-top:12px">
      <button class="btn">Créer un groupe</button>
      <button class="btn">Éditer</button>
    </div>
  `;

  root.append(c.root, g.root);
}
