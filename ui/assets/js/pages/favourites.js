import { card, listRow, coverEl, button } from "../components/ui.js";
import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { playPaths, playPlaylist, playRadio, removeFavourite, fetchFavourites } from "../services/library.js";
import { navigate } from "../router.js";

export async function render(root){
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const view = params.get("view") || "tracks";
  const isRadioView = view === "radio";
  const c = card({ title:"Favoris", subtitle: isRadioView ? "Radios" : "Pistes / playlists" });
  const list = document.createElement("div");
  list.className = "list";

  function renderList(){
    const favs = store.get().library.favourites || [];
    const filtered = isRadioView
      ? favs.filter(f=>f.type === "radio")
      : favs.filter(f=>f.type !== "radio");
    list.innerHTML = "";
    if(!filtered.length){
      list.innerHTML = `<div class="muted">Aucun favori${isRadioView ? " radio" : ""}.</div>`;
      return;
    }
    for(const f of filtered){
      const cover = coverEl("sm", f.title || "");
      if(f.type === "track" && f.artist && f.album){
        const url = new URL(`${AppConfig.restBaseUrl}/docs/album/art`, window.location.origin);
        url.searchParams.set("artist", f.artist);
        url.searchParams.set("album", f.album);
        url.searchParams.set("size", "120");
        cover.style.backgroundImage = `url("${url.toString()}")`;
        cover.style.backgroundSize = "cover";
        cover.style.backgroundPosition = "center";
      } else if(f.type === "radio" && f.album){
        cover.style.backgroundImage = `url("${f.album}")`;
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
        } else if(f.type === "radio" && f.path){
          playRadio(f.path, {replace: true, play: true});
        }
      }});
      const delBtn = button("Supprimer", {onClick: async (ev)=>{
        ev.stopPropagation();
        await removeFavourite({key: f.key});
        await fetchFavourites();
      }});
      const subtitle = f.subtitle || f.playlist || (f.type === "radio" ? "Radio" : "");
      list.append(listRow({
        title: f.title || "—",
        subtitle,
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
