import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { onOutsideClick, toast } from "../utils.js";

export async function playPaths(paths){
  try {
    await postJson("/mpd/add-many", {paths, clear: true, play: true});
  } catch (e){
    toast("Erreur: lecture impossible");
  }
}

export async function queuePaths(paths){
  try {
    await postJson("/mpd/add-many", {paths, clear: false, play: false});
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
