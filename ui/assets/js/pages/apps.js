import { card, listRow, coverEl } from "../components/ui.js";
import { store } from "../store.js";
import { toast } from "../utils.js";

export async function render(root){
  const c = card({ title:"Apps", subtitle:"Plugins / services (UI démo)" });
  const list = document.createElement("div");
  list.className = "list";

  for(const a of store.get().library.apps){
    list.append(listRow({
      title: a.name,
      subtitle: a.desc,
      left: coverEl("sm", a.name),
      onClick: ()=>toast("Démo : ouvrir app " + a.name)
    }));
  }

  c.body.append(list);
  root.append(c.root);
}
