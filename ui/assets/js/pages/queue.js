import { card, listRow, coverEl, button } from "../components/ui.js";
import { store } from "../store.js";
import { toast } from "../utils.js";

export async function render(root){
  const st = store.get();
  const c = card({
    title:"File d’attente",
    subtitle:"Drag & drop (démo UI)",
    actions:[button("Ouvrir en bas", {onClick: ()=>document.getElementById("btnQueue")?.click()})]
  });

  const help = document.createElement("div");
  help.className = "muted small";
  help.textContent = "Astuce : tu peux déplacer les lignes (drag & drop) — c’est seulement visuel pour l’instant.";
  c.body.append(help);

  const list = document.createElement("div");
  list.className = "list";
  list.style.marginTop = "10px";

  // build reorderable list
  for(const [i,t] of st.player.queue.entries()){
    const row = listRow({
      title: t.title,
      subtitle: `${t.artist} • ${t.album}`,
      left: coverEl("sm", t.title),
      right: button(i===st.player.index ? "En cours" : "Lire", {onClick:(ev)=>{ev.stopPropagation(); toast("Démo : jump-to via MPD plus tard.");}}),
      draggable: true,
      data: {i}
    });
    row.style.opacity = (i===st.player.index) ? "1" : "0.94";
    row.addEventListener("dragstart", ev=>{
      ev.dataTransfer.setData("text/plain", String(i));
      ev.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", ()=>row.classList.remove("dragging"));
    row.addEventListener("dragover", ev=>{
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      row.style.outline = "2px solid rgba(124,58,237,.35)";
    });
    row.addEventListener("dragleave", ()=>row.style.outline = "");
    row.addEventListener("drop", ev=>{
      ev.preventDefault();
      row.style.outline = "";
      const from = Number(ev.dataTransfer.getData("text/plain"));
      const to = i;
      if(Number.isFinite(from) && from!==to){
        toast(`Démo : déplacer ${from+1} → ${to+1}`);
      }
    });
    list.append(row);
  }

  c.body.append(list);
  root.append(c.root);
}
