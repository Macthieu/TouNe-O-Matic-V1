import { card, coverEl, listRow, chip, button } from "../components/ui.js";
import { navigate } from "../router.js";
import { store } from "../store.js";
import { toast } from "../utils.js";

const tabs = [
  {key:"artists", label:"Artistes"},
  {key:"albums", label:"Albums"},
  {key:"genres", label:"Genres"},
  {key:"years", label:"Années"},
  {key:"tracks", label:"Titres"},
];

export async function render(root, params){
  const tab = params.get("tab") || "artists";
  const focus = params.get("focus");

  const c = card({ title:"Bibliothèque", subtitle:"Vue liste/grille (mock)" });
  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.flexWrap = "wrap";
  top.style.gap = "8px";
  for(const t of tabs){
    top.append(chip(t.label, {onClick:()=>navigate("library", new URLSearchParams({tab:t.key}))}));
  }
  c.body.append(top);

  const list = document.createElement("div");
  list.className = "list";
  list.style.marginTop = "12px";

  const st = store.get();
  if(tab === "artists"){
    for(const a of st.library.artists){
      list.append(listRow({
        title: a.name,
        subtitle: `${a.albums} albums • ${a.tracks} titres`,
        left: coverEl("sm", a.name),
        right: button("Ouvrir", {onClick:(ev)=>{ev.stopPropagation(); toast("Démo : page artiste à venir.");}}),
      }));
    }
  } else if(tab === "albums"){
    for(const a of st.library.albums){
      list.append(listRow({
        title: a.title,
        subtitle: `${a.artist} • ${a.year}`,
        left: coverEl("sm", a.title),
        right: button("Lire", {onClick:(ev)=>{ev.stopPropagation(); toast("Démo : lecture via MPD plus tard.");}}),
      }));
    }
  } else if(tab === "genres"){
    for(const g of st.library.genres){
      list.append(listRow({
        title: g.name,
        subtitle: `${g.albums} albums`,
        left: coverEl("sm", g.name),
      }));
    }
  } else if(tab === "years"){
    for(const y of st.library.years){
      list.append(listRow({
        title: String(y.year),
        subtitle: `${y.albums} albums`,
        left: coverEl("sm", String(y.year)),
      }));
    }
  } else {
    // tracks
    for(const t of st.library.albums.flatMap(a=>a.tracks).slice(0, 80)){
      list.append(listRow({
        title: t.title,
        subtitle: `${t.artist} • ${t.album}`,
        left: coverEl("sm", t.title),
        right: button("Ajouter", {onClick:(ev)=>{ev.stopPropagation(); toast("Ajouté à la file (démo).");}}),
      }));
    }
  }

  c.body.append(list);
  root.append(c.root);

  if(focus){
    // In demo, just show toast
    toast("Focus: " + focus);
  }
}
