import { card, listRow, coverEl, button } from "../components/ui.js";
import { store } from "../store.js";
import { toast } from "../utils.js";

export async function render(root){
  const favs = store.get().library.favourites;

  const c = card({ title:"Favoris", subtitle:"Albums / stations / playlists (mock)" });
  const list = document.createElement("div");
  list.className = "list";

  if(!favs.length){
    list.innerHTML = '<div class="muted">Aucun favori (démo).</div>';
  } else {
    for(const f of favs){
      list.append(listRow({
        title: f.title,
        subtitle: f.subtitle,
        left: coverEl("sm", f.title),
        right: button("Ouvrir", {onClick:(ev)=>{ev.stopPropagation(); toast("Démo.");}})
      }));
    }
  }

  c.body.append(list);
  root.append(c.root);
}
