import { card, listRow, coverEl, button } from "../components/ui.js";
import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { toast } from "../utils.js";
import { moveQueue, deleteQueue, reorderQueue, syncQueue, clearQueue, fetchQueueStatus } from "../services/library.js";

export async function render(root){
  const st = store.get();
  const mixBtn = button("Mix", {onClick: async ()=>{
    const next = !store.get().player.random;
    try {
      await fetch(`${AppConfig.restBaseUrl}/mpd/random?value=${next ? 1 : 0}`, {method: "POST"});
    } catch {}
  }});
  mixBtn.classList.toggle("is-active", !!st.player.random);
  const syncBtn = button("Sync", {onClick: async ()=>{
    const res = await syncQueue();
    if(res?.ok) toast("File synchronisée");
  }});
  syncBtn.hidden = true;
  const c = card({
    title:"File d’attente",
    subtitle:"Drag & drop (démo UI)",
    actions:[
      mixBtn,
      syncBtn,
      button("Vider", {kind:"danger", onClick: async ()=>{
        if(!window.confirm("Vider complètement la file ?")) return;
        await clearQueue();
        toast("File vidée");
      }}),
      button("Ouvrir en bas", {onClick: ()=>document.getElementById("btnQueue")?.click()})
    ]
  });

  const help = document.createElement("div");
  help.className = "muted small";
  help.textContent = "Astuce : tu peux déplacer les lignes (drag & drop) — c’est seulement visuel pour l’instant.";
  c.body.append(help);
  const status = document.createElement("div");
  status.className = "muted small";
  status.style.marginTop = "6px";
  c.body.append(status);

  const list = document.createElement("div");
  list.className = "list";
  list.style.marginTop = "10px";

  // build reorderable list
  for(const [i,t] of st.player.queue.entries()){
    const cover = coverEl("sm", t.title);
    const art = albumArtUrl(t, 120);
    if(art){
      cover.style.backgroundImage = `url("${art}")`;
      cover.style.backgroundSize = "cover";
      cover.style.backgroundPosition = "center";
    }
    const row = listRow({
      title: t.title,
      subtitle: `${t.artist} • ${t.album}`,
      left: cover,
      right: button(i===st.player.index ? "En cours" : "Lire", {onClick:(ev)=>{ev.stopPropagation(); toast("Démo : jump-to via MPD plus tard.");}}),
      draggable: true,
      data: {i}
    });
    row.style.opacity = (i===st.player.index) ? "1" : "0.94";
    row.addEventListener("dragstart", ev=>{
      ev.dataTransfer.setData("text/plain", String(i));
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
      const to = i;
      if(Number.isFinite(from) && from!==to){
        const next = [...st.player.queue];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        const paths = next.map(t=>t.path).filter(Boolean);
        const res = await reorderQueue(paths);
        if(res?.ok){
          toast(`Déplacé ${from+1} → ${to+1}`);
        }
      }
    });
    list.append(row);
  }

  c.body.append(list);
  root.append(c.root);

  async function refreshStatus(){
    const st = await fetchQueueStatus();
    if(!status.isConnected) return;
    if(!st){
      status.textContent = "";
      syncBtn.hidden = true;
      return;
    }
    const badge = st.match ? "✓ synchro" : `⚠ désync (${st.queue_len}/${st.mpd_len})`;
    status.textContent = `État: ${badge}`;
    syncBtn.hidden = !!st.match;
  }

  store.subscribe((next)=>{
    mixBtn.classList.toggle("is-active", !!next.player.random);
  });
  await refreshStatus();
  const statusTimer = setInterval(refreshStatus, 5000);
  if(root){
    const stop = store.subscribe(()=>{
      if(!root.isConnected){
        clearInterval(statusTimer);
        stop();
      }
    });
  }
}

function albumArtUrl(track, size){
  if(!track?.artist || !track?.album) return "";
  const url = new URL(`${AppConfig.restBaseUrl}/docs/album/art`, window.location.origin);
  url.searchParams.set("artist", track.artist);
  url.searchParams.set("album", track.album);
  if(size) url.searchParams.set("size", String(size));
  return url.toString();
}
