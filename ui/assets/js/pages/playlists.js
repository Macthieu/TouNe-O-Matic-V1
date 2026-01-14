import { card, listRow, coverEl, button } from "../components/ui.js";
import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { formatTime, toast } from "../utils.js";
import { navigate } from "../router.js";
import { playPaths, showAddMenu, playPlaylist, queuePlaylist, removeFromPlaylist, moveInPlaylist, renamePlaylist, deletePlaylist, createPlaylist, importPlaylistFile } from "../services/library.js";

const playlistCoverCache = new Map();
const playlistCoverInFlight = new Map();
let lastPlaylistSig = "";

export async function render(root, params){
  const name = params?.get("name") || "";
  if(name){
    await renderPlaylistDetail(root, name);
    return;
  }

  const c = card({ title:"Playlists", subtitle:"Créer / renommer / éditer (UI démo)" });
  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.append(button("Nouvelle playlist", {onClick: async ()=>{
    const name = window.prompt("Nom de la nouvelle playlist");
    if(!name) return;
    await createPlaylist(name);
  }}));
  actions.append(button("Importer (.m3u)", {onClick: ()=>openImportDialog()}));
  actions.append(button("Rafraîchir pochettes", {onClick: ()=>{
    playlistCoverCache.clear();
    playlistCoverInFlight.clear();
    lastPlaylistSig = "";
    renderList();
  }}));
  c.body.append(actions);

  const list = document.createElement("div");
  list.className = "list";
  function renderList(){
    const items = store.get().library.playlists || [];
    const sig = items.map(p=>`${p.name}:${p.tracks}`).join("|");
    if(sig === lastPlaylistSig && list.childElementCount){
      return;
    }
    lastPlaylistSig = sig;
    list.innerHTML = "";
    for(const p of items){
      const cover = coverEl("sm", p.name);
      const cached = playlistCoverCache.get(p.name);
      if(cached){
        cover.style.backgroundImage = `url("${cached}")`;
        cover.style.backgroundSize = "cover";
        cover.style.backgroundPosition = "center";
      }
      hydratePlaylistCover(cover, p.name);
      const actions = document.createElement("div");
      actions.className = "row__actions";
      actions.append(
        actionBtn("▶", "Lecture + file", async (ev)=>{
          ev.stopPropagation();
          await playPlaylist(p.name);
        }),
        button("Ouvrir", {onClick:(ev)=>{ev.stopPropagation(); navigate("playlists", new URLSearchParams({name: p.name}));}})
      );
      const delBtn = actionBtn("🗑", "Supprimer", async (ev)=>{
        ev.stopPropagation();
        if(!window.confirm(`Supprimer ${p.name} ?`)) return;
        await deletePlaylist(p.name);
      });
      actions.append(delBtn);
      const row = listRow({
        title: p.name,
        subtitle: `${p.tracks} titres`,
        left: cover,
        right: actions,
        onClick: ()=>navigate("playlists", new URLSearchParams({name: p.name}))
      });
      list.append(row);
    }
  }

  c.body.append(list);
  root.append(c.root);

  renderList();
  const unsubscribe = store.subscribe(()=>{
    if(!root.contains(c.root)){
      unsubscribe();
      return;
    }
    renderList();
  });
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
    button("Renommer", {onClick: async ()=>{
      const next = window.prompt("Nouveau nom", name);
      if(!next || next === name) return;
      await renamePlaylist(name, next);
      navigate("playlists", new URLSearchParams({name: next.endsWith(".m3u") ? next : `${next}.m3u`}));
    }}),
    button("Supprimer", {kind:"danger", onClick: async ()=>{
      if(!window.confirm("Supprimer cette playlist ?")) return;
      await deletePlaylist(name);
      navigate("playlists");
    }}),
  );
  c.body.append(header);

  const items = await fetchPlaylistInfo(name);
  if(!items.length){
    list.innerHTML = '<div class="muted">Playlist vide ou introuvable.</div>';
  } else {
    items.forEach((t, idx)=>{
      const isMissing = t.available === false;
      const title = t.title || t.raw || "—";
      const subtitleBits = [t.artist || "—", t.album || "—"];
      if(isMissing){
        subtitleBits.push(`indisponible: ${t.reason || "fichier manquant"}`);
      }
      const actions = document.createElement("div");
      actions.className = "row__actions";
      const playBtn = actionBtn("▶", "Lire", (ev)=>{ev.stopPropagation(); playPaths([t.path].filter(Boolean));});
      if(isMissing) playBtn.disabled = true;
      actions.append(playBtn);
      const cover = coverEl("sm", t.title || "");
      if(t.artist && t.album){
        const url = new URL(`${AppConfig.restBaseUrl}/docs/album/art`, window.location.origin);
        url.searchParams.set("artist", t.artist);
        url.searchParams.set("album", t.album);
        url.searchParams.set("size", "120");
        cover.style.backgroundImage = `url("${url.toString()}")`;
        cover.style.backgroundSize = "cover";
        cover.style.backgroundPosition = "center";
      }
      const row = listRow({
        title,
        subtitle: subtitleBits.join(" • "),
        left: cover,
        right: actions,
        draggable: true,
        data: {i: idx}
      });
      if(isMissing){
        row.classList.add("row--missing");
      }
      const addBtn = actionBtn("+", "Ajouter", (ev)=>{ev.stopPropagation(); showAddMenu(ev.currentTarget, {title: t.title, paths:[t.path].filter(Boolean)});});
      if(isMissing) addBtn.disabled = true;
      const delBtn = actionBtn("🗑", "Supprimer", async (ev)=>{
        ev.stopPropagation();
        await removeFromPlaylist(name, t.path);
        await renderPlaylistDetail(root, name);
      });
      actions.append(addBtn);
      actions.append(delBtn);
      row.addEventListener("dragstart", ev=>{
        ev.dataTransfer.setData("text/plain", String(idx));
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
      row.addEventListener("drop", async ev=>{
        ev.preventDefault();
        row.style.outline = "";
        const from = Number(ev.dataTransfer.getData("text/plain"));
        const to = idx;
        if(Number.isFinite(from) && from!==to){
          await moveInPlaylist(name, from, to);
          await renderPlaylistDetail(root, name);
        }
      });
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

async function openImportDialog(){
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".m3u,.m3u8,.txt";
  input.addEventListener("change", async ()=>{
    const file = input.files?.[0];
    if(!file) return;
    const suggested = file.name.endsWith(".m3u") ? file.name : `${file.name}.m3u`;
    const name = window.prompt("Nom de la playlist importée", suggested);
    if(!name) return;
    try {
      const res = await importPlaylistFile(name, file);
      if(!res?.ok) return;
      const savedName = res?.data?.name || name;
      toast("Playlist importée");
      navigate("playlists", new URLSearchParams({name: savedName}));
    } catch {
      toast("Erreur: import playlist");
    }
  });
  input.click();
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

async function hydratePlaylistCover(coverEl, name){
  if(playlistCoverCache.has(name)){
    return;
  }
  if(playlistCoverInFlight.has(name)){
    return;
  }
  const inFlight = (async ()=>{
    const tracks = await fetchPlaylistInfo(name);
    const first = tracks[0];
    if(!first?.artist || !first?.album){
      playlistCoverInFlight.delete(name);
      return;
    }
    const url = new URL(`${AppConfig.restBaseUrl}/docs/album/art`, window.location.origin);
    url.searchParams.set("artist", first.artist);
    url.searchParams.set("album", first.album);
    url.searchParams.set("size", "140");
    const artUrl = url.toString();
    playlistCoverCache.set(name, artUrl);
    if(coverEl && coverEl.isConnected){
      coverEl.style.backgroundImage = `url("${artUrl}")`;
      coverEl.style.backgroundSize = "cover";
      coverEl.style.backgroundPosition = "center";
    }
    playlistCoverInFlight.delete(name);
  })();
  playlistCoverInFlight.set(name, inFlight);
  await inFlight;
}
