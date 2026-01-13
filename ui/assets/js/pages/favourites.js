import { card, listRow, coverEl, button } from "../components/ui.js";
import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { playPaths, playPlaylist, removeFavourite, fetchFavourites } from "../services/library.js";

export async function render(root){
  const c = card({ title:"Favoris", subtitle:"Pistes / playlists" });
  const list = document.createElement("div");
  list.className = "list";

  function renderList(){
    const favs = store.get().library.favourites || [];
    list.innerHTML = "";
    if(!favs.length){
      list.innerHTML = '<div class="muted">Aucun favori.</div>';
      return;
    }
    for(const f of favs){
      const cover = coverEl("sm", f.title || "");
      if(f.type === "track" && f.artist && f.album){
        const url = new URL(`${AppConfig.restBaseUrl}/docs/album/art`, window.location.origin);
        url.searchParams.set("artist", f.artist);
        url.searchParams.set("album", f.album);
        url.searchParams.set("size", "120");
        cover.style.backgroundImage = `url("${url.toString()}")`;
        cover.style.backgroundSize = "cover";
        cover.style.backgroundPosition = "center";
      } else if(f.type === "playlist" && f.playlist){
        hydratePlaylistCover(cover, f.playlist);
      }
      const openBtn = button("Lire", {onClick:(ev)=>{
        ev.stopPropagation();
        if(f.type === "playlist" && f.playlist){
          playPlaylist(f.playlist);
        } else if(f.type === "track" && f.path){
          playPaths([f.path]);
        }
      }});
      const delBtn = button("Retirer", {onClick: async (ev)=>{
        ev.stopPropagation();
        await removeFavourite({key: f.key});
        await fetchFavourites();
      }});
      list.append(listRow({
        title: f.title || "—",
        subtitle: f.subtitle || f.playlist || "",
        left: cover,
        right: (()=>{ const wrap = document.createElement("div"); wrap.className = "row__actions"; wrap.append(openBtn, delBtn); return wrap; })(),
      }));
    }
  }

  c.body.append(list);
  root.append(c.root);

  renderList();
  await fetchFavourites();
  const unsubscribe = store.subscribe(()=>{
    if(!root.contains(c.root)){
      unsubscribe();
      return;
    }
    renderList();
  });
}

async function hydratePlaylistCover(coverEl, name){
  try {
    const url = new URL(`${AppConfig.restBaseUrl}/playlists/info`, window.location.origin);
    url.searchParams.set("name", name);
    const res = await fetch(url.toString());
    const body = await res.json();
    const first = body?.data?.tracks?.[0];
    if(!first?.artist || !first?.album) return;
    const art = new URL(`${AppConfig.restBaseUrl}/docs/album/art`, window.location.origin);
    art.searchParams.set("artist", first.artist);
    art.searchParams.set("album", first.album);
    art.searchParams.set("size", "120");
    coverEl.style.backgroundImage = `url("${art.toString()}")`;
    coverEl.style.backgroundSize = "cover";
    coverEl.style.backgroundPosition = "center";
  } catch {}
}
