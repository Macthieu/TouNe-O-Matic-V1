import { card, listRow, coverEl, button } from "../components/ui.js";
import { store } from "../store.js";
import { toast } from "../utils.js";

export async function render(root){
  const c = card({ title:"Radio", subtitle:"Stations (mock)" });

  const list = document.createElement("div");
  list.className = "list";

  for(const r of store.get().library.radios){
    list.append(listRow({
      title: r.name,
      subtitle: r.genre,
      left: coverEl("sm", r.name),
      right: button("Lire", {onClick:(ev)=>{ev.stopPropagation(); toast("Démo : lecture radio via MPD/API plus tard.");}})
    }));
  }

  c.body.append(list);
  root.append(c.root);
}
