import { card, listRow, coverEl, button } from "../components/ui.js";
import { store } from "../store.js";
import { toast } from "../utils.js";

export async function render(root){
  const c = card({ title:"Playlists", subtitle:"Créer / renommer / éditer (UI démo)" });
  const list = document.createElement("div");
  list.className = "list";

  for(const p of store.get().library.playlists){
    list.append(listRow({
      title: p.name,
      subtitle: `${p.tracks} titres`,
      left: coverEl("sm", p.name),
      right: button("Éditer", {onClick:(ev)=>{ev.stopPropagation(); toast("Démo : édition playlist plus tard.");}})
    }));
  }

  c.body.append(list);
  root.append(c.root);
}
