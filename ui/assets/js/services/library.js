import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { onOutsideClick, toast } from "../utils.js";

export async function playPaths(paths){
  try {
    await postJson("/mpd/add-many", {paths, clear: true, play: true});
    await setQueue(paths);
  } catch (e){
    toast("Erreur: lecture impossible");
  }
}

export async function queuePaths(paths){
  try {
    await postJson("/mpd/add-many", {paths, clear: false, play: false});
    const current = (store.get().player.queue || []).map(t=>t.path).filter(Boolean);
    await setQueue(current.concat(paths));
  } catch (e){
    toast("Erreur: ajout à la file");
  }
}

export async function addToPlaylist(paths, name){
  try {
    await postJson("/playlists/append", {paths, name});
    await refreshPlaylists();
  } catch (e){
    toast("Erreur: ajout à la playlist");
  }
}

export async function createPlaylist(name){
  try {
    await postJson("/playlists/create", {name});
    await refreshPlaylists();
  } catch (e){
    toast("Erreur: création playlist");
  }
}

export async function playPlaylist(name){
  try {
    const url = `${AppConfig.restBaseUrl}/playlists/load?name=${encodeURIComponent(name)}`;
    await fetch(url, {method: "POST"});
  } catch (e){
    toast("Erreur: lecture playlist");
  }
}

export async function queuePlaylist(name){
  try {
    const url = `${AppConfig.restBaseUrl}/playlists/queue?name=${encodeURIComponent(name)}`;
    await fetch(url, {method: "POST"});
    toast("Playlist ajoutée à la file");
  } catch (e){
    toast("Erreur: ajout playlist");
  }
}

export async function playRadio(url, {replace=true, play=true} = {}){
  if(!url) return;
  try {
    await postJson("/radio/play", {url, replace, play});
  } catch (e){
    toast("Erreur: lecture radio");
  }
}

export async function queueRandomNext(){
  if(AppConfig.transport !== "rest") return;
  try {
    const res = await fetch(`${AppConfig.restBaseUrl}/library/queue/random-next`, {method: "POST"});
    const body = await res.json().catch(()=>null);
    if(!res.ok || body?.ok === false){
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    toast("Suivant aléatoire ajouté");
  } catch {
    toast("Erreur: suivant aléatoire");
  }
}

export async function moveQueue(from, to){
  if(from === to) return;
  try {
    const url = `${AppConfig.restBaseUrl}/mpd/move?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    await fetch(url, {method: "POST"});
  } catch {
    toast("Erreur: déplacement file");
  }
}

export async function deleteQueue(pos){
  try {
    const url = `${AppConfig.restBaseUrl}/mpd/delete?pos=${encodeURIComponent(pos)}`;
    await fetch(url, {method: "POST"});
  } catch {
    toast("Erreur: suppression file");
  }
}

export async function clearQueue(){
  try {
    await postJson("/cmd", {cmd: "clear"});
    await postJson("/queue", {paths: [], apply: false});
  } catch {
    toast("Erreur: vider la file");
  }
}

export async function reorderQueue(paths){
  try {
    return await postJson("/queue", {paths, apply: true});
  } catch {
    toast("Erreur: réorganisation file");
  }
  return null;
}

export async function syncQueue(){
  try {
    return await postJson("/queue/sync");
  } catch {
    toast("Erreur: synchro file");
  }
  return null;
}

export async function fetchQueueStatus(){
  if(AppConfig.transport !== "rest") return null;
  try {
    const res = await fetch(`${AppConfig.restBaseUrl}/state?with_status=1`);
    const body = await res.json().catch(()=>null);
    if(!res.ok || body?.ok === false){
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    return body.data?.queue_status || null;
  } catch {
    return null;
  }
}

export async function fetchCmdStatus(){
  if(AppConfig.transport !== "rest") return null;
  try {
    const res = await fetch(`${AppConfig.restBaseUrl}/cmd/status`);
    const body = await res.json().catch(()=>null);
    if(!res.ok || body?.ok === false){
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    return body.data || null;
  } catch {
    return null;
  }
}

export async function removeFromPlaylist(name, path){
  try {
    await postJson("/playlists/remove", {name, path});
    toast("Piste retirée");
  } catch {
    toast("Erreur: suppression playlist");
  }
}

export async function moveInPlaylist(name, from, to){
  try {
    await postJson("/playlists/move", {name, from, to});
  } catch {
    toast("Erreur: déplacement playlist");
  }
}

export async function renamePlaylist(from, to){
  try {
    await postJson("/playlists/rename", {from, to});
    await refreshPlaylists();
  } catch {
    toast("Erreur: renommage playlist");
  }
}

export async function deletePlaylist(name){
  try {
    await postJson("/playlists/delete", {name});
    await refreshPlaylists();
  } catch {
    toast("Erreur: suppression playlist");
  }
}

export async function repairPlaylist(name){
  try {
    const url = `${AppConfig.restBaseUrl}/playlists/repair?name=${encodeURIComponent(name)}`;
    const res = await fetch(url, {method: "POST"});
    const data = await res.json().catch(()=>null);
    if(!res.ok || data?.ok === false){
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (e){
    toast(`Erreur: réparation playlist (${e?.message || "échec"})`);
  }
  return null;
}

export async function importPlaylist(name, content){
  try {
    const res = await postJson("/playlists/import", {name, content});
    await refreshPlaylists();
    return res;
  } catch {
    toast("Erreur: import playlist");
  }
  return null;
}

export async function importPlaylistFile(name, file){
  if(AppConfig.transport !== "rest") return null;
  try {
    const form = new FormData();
    if(name) form.set("name", name);
    form.set("file", file);
    const res = await fetch(`${AppConfig.restBaseUrl}/playlists/import-file`, {
      method: "POST",
      body: form,
    });
    const data = await res.json().catch(()=>null);
    if(!res.ok || data?.ok === false){
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    await refreshPlaylists();
    return data;
  } catch (e){
    toast(`Erreur: import playlist (${e?.message || "échec"})`);
  }
  return null;
}

export async function fetchFavourites(){
  if(AppConfig.transport !== "rest") return [];
  try {
    const res = await fetch(`${AppConfig.restBaseUrl}/favourites`);
    const body = await res.json();
    if(body?.ok && Array.isArray(body.data)){
      store.set({ library: { favourites: body.data } });
      return body.data;
    }
  } catch {}
  return [];
}

export async function addFavourite(payload){
  try {
    await postJson("/favourites/add", payload);
    await fetchFavourites();
  } catch {
    toast("Erreur: ajout favori");
  }
}

export async function removeFavourite(payload){
  try {
    await postJson("/favourites/remove", payload);
    await fetchFavourites();
  } catch {
    toast("Erreur: suppression favori");
  }
}

export async function toggleTrackFavourite(track){
  if(!track?.path) return;
  const favs = store.get().library.favourites || [];
  const key = `track:${track.path}`;
  const exists = favs.some(f=>f.key === key);
  if(exists){
    await removeFavourite({key});
  } else {
    await addFavourite({
      type: "track",
      path: track.path,
      title: track.title || "",
      artist: track.artist || "",
      album: track.album || "",
      subtitle: `${track.artist || "—"} • ${track.album || "—"}`,
    });
  }
}

export function showAddMenu(targetEl, {title, paths}){
  if(!paths || !paths.length){
    toast("Aucun titre à ajouter");
    return;
  }
  const playlists = (store.get().library.playlists || []).map(p=>p.name);
  const menu = document.createElement("div");
  menu.className = "menu menu--context";

  const rect = targetEl.getBoundingClientRect();
  const width = 260;
  menu.style.top = `${Math.min(window.innerHeight - 220, rect.bottom + 8)}px`;
  menu.style.left = `${Math.min(window.innerWidth - width - 10, rect.left)}px`;
  menu.style.right = "auto";

  const heading = document.createElement("div");
  heading.className = "menu__heading";
  heading.textContent = title || "Ajouter";
  menu.append(heading);

  menu.append(
    menuItem("Ajouter à la file", async ()=>{
      await queuePaths(paths);
      toast("Ajouté à la file");
    })
  );

  if(playlists.length){
    menu.append(menuSep());
    const label = document.createElement("div");
    label.className = "menu__label";
    label.textContent = "Playlists";
    menu.append(label);
    playlists.slice(0, 12).forEach((name)=>{
      menu.append(menuItem(name, async ()=>{
        await addToPlaylist(paths, name);
        toast(`Ajouté à ${name}`);
      }));
    });
  }

  menu.append(menuSep());
  menu.append(menuItem("Nouvelle playlist…", async ()=>{
    const name = window.prompt("Nom de la nouvelle playlist");
    if(!name) return;
    await createPlaylist(name);
    await addToPlaylist(paths, name);
    toast(`Ajouté à ${name}`);
  }));

  document.body.append(menu);
  const detach = onOutsideClick(menu, ()=>{ menu.remove(); detach?.(); });
}

function menuItem(label, onClick){
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "menu__item";
  btn.textContent = label;
  btn.addEventListener("click", async (ev)=>{
    ev.stopPropagation();
    btn.closest(".menu")?.remove();
    await onClick();
  });
  return btn;
}

function menuSep(){
  const el = document.createElement("div");
  el.className = "menu__sep";
  return el;
}

async function postJson(path, body){
  if(AppConfig.transport !== "rest") return;
  const res = await fetch(`${AppConfig.restBaseUrl}${path}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(()=>null);
  if(!res.ok || data?.ok === false){
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

async function setQueue(paths){
  if(AppConfig.transport !== "rest") return;
  const list = (paths || []).filter(Boolean);
  if(!list.length) return;
  await postJson("/queue", {paths: list, apply: false});
}

async function refreshPlaylists(){
  if(AppConfig.transport !== "rest") return;
  try {
    const res = await fetch(`${AppConfig.restBaseUrl}/playlists`);
    const body = await res.json();
    if(body?.ok && Array.isArray(body.data)){
      store.set({ library: { playlists: body.data } });
    }
  } catch {}
}
