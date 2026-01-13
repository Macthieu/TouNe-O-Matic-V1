import { card, listRow, coverEl, button } from "../components/ui.js";
import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { formatTime, toast } from "../utils.js";
import { navigate } from "../router.js";
import { playPaths, showAddMenu, playPlaylist, queuePlaylist } from "../services/library.js";

export async function render(root, params){
  const name = params?.get("name") || "";
  if(name){
    await renderPlaylistDetail(root, name);
    return;
  }

  const c = card({ title:"Playlists", subtitle:"Créer / renommer / éditer (UI démo)" });
  const list = document.createElement("div");
  list.className = "list";

  for(const p of store.get().library.playlists){
    list.append(listRow({
      title: p.name,
      subtitle: `${p.tracks} titres`,
      left: coverEl("sm", p.name),
      right: button("Ouvrir", {onClick:(ev)=>{ev.stopPropagation(); navigate("playlists", new URLSearchParams({name: p.name}));}})
    }));
  }

  c.body.append(list);
  root.append(c.root);
}

async function renderPlaylistDetail(root, name){
  const c = card({ title: name, subtitle:"Playlist" });
  const list = document.createElement("div");
  list.className = "list";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.gap = "8px";
  header.style.marginBottom = "10px";
  header.append(
    button("Lecture", {onClick: async ()=>playPlaylist(name)}),
    button("Ajouter à la file", {onClick: async ()=>queuePlaylist(name)}),
  );
  c.body.append(header);

  const items = await fetchPlaylistInfo(name);
  if(!items.length){
    list.innerHTML = '<div class="muted">Playlist vide ou introuvable.</div>';
  } else {
    items.forEach((t, idx)=>{
      const row = listRow({
        title: t.title || "—",
        subtitle: `${t.artist || "—"} • ${t.album || "—"}`,
        left: coverEl("sm", t.title || ""),
        right: actionBtn("▶", "Lire", (ev)=>{ev.stopPropagation(); playPaths([t.path].filter(Boolean));}),
      });
      const addBtn = actionBtn("+", "Ajouter", (ev)=>{ev.stopPropagation(); showAddMenu(ev.currentTarget, {title: t.title, paths:[t.path].filter(Boolean)});});
      row.append(addBtn);
      list.append(row);
    });
  }
  c.body.append(list);
  root.append(c.root);
}

function actionBtn(label, title, onClick){
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

async function fetchPlaylistInfo(name){
  if(AppConfig.transport !== "rest") return [];
  try {
    const url = new URL(`${AppConfig.restBaseUrl}/playlists/info`, window.location.origin);
    url.searchParams.set("name", name);
    const res = await fetch(url.toString());
    const body = await res.json();
    if(body?.ok && body.data?.tracks) return body.data.tracks;
  } catch {}
  return [];
}
