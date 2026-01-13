import { card, coverEl, button, pill, listRow } from "../components/ui.js";
import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { formatTime, toast } from "../utils.js";
import { queueRandomNext } from "../services/library.js";

export async function render(root){
  const st = store.get();
  const tr = st.player.track;

  const c = card({
    title: "En lecture",
    subtitle: tr ? `${tr.artist} • ${tr.album}` : "Aucun titre (démo)",
    actions: [
      pill(st.player.name),
      button("Infos", {onClick: ()=>toast("Démo : infos détaillées plus tard.")})
    ]
  });

  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "220px 1fr";
  wrap.style.gap = "16px";
  wrap.style.alignItems = "start";

  const cover = coverEl("lg", tr?.title || "Couverture");
  const art = albumArtUrl(tr, 420);
  if(art){
    cover.style.backgroundImage = `url("${art}")`;
    cover.style.backgroundSize = "cover";
    cover.style.backgroundPosition = "center";
  }
  cover.style.marginTop = "6px";

  const meta = document.createElement("div");
  meta.innerHTML = `
    <div class="h1">${tr ? tr.title : "—"}</div>
    <div class="muted">${tr ? tr.artist : "—"} • ${tr ? tr.album : "—"}</div>
    <div style="margin-top:10px" class="muted small">
      ${tr ? `Piste ${tr.trackNo} • ${formatTime(tr.duration)} • ${tr.year}` : ""}
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px">
      <button class="btn primary" id="npPlay">${st.player.state === "play" ? "Pause" : "Lecture"}</button>
      <button class="btn" id="npNext">Suivant</button>
      <button class="btn" id="npMix">Mix</button>
      <button class="btn" id="npRandomNext">Suivant aléatoire</button>
      <button class="btn" id="npAdd">Ajouter à une playlist</button>
      <button class="btn" id="npFav">${tr?.fav ? "Retirer des favoris" : "Ajouter aux favoris"}</button>
    </div>
  `;

  wrap.append(cover, meta);
  c.body.append(wrap);

  // Next up
  const next = st.player.queue.slice(st.player.index+1, st.player.index+4);
  const nextCard = document.createElement("div");
  nextCard.style.marginTop = "14px";
  nextCard.innerHTML = `<div class="strong">À suivre</div><div class="muted small">Prochaines pistes dans la file</div>`;
  const list = document.createElement("div");
  list.className = "list";
  list.style.marginTop = "10px";
  for(const n of next){
    list.append(listRow({
      title: n.title,
      subtitle: `${n.artist} • ${n.album}`,
      left: coverEl("sm", n.title),
    }));
  }
  if(!next.length){
    list.innerHTML = '<div class="muted">Rien après (démo).</div>';
  }
  nextCard.append(list);
  c.body.append(nextCard);

  root.append(c.root);

  // wire buttons (UI only; real control is in app.js via transport)
  c.root.querySelector("#npPlay")?.addEventListener("click", ()=>document.getElementById("btnPlayPause")?.click());
  c.root.querySelector("#npNext")?.addEventListener("click", ()=>document.getElementById("btnNext")?.click());
  c.root.querySelector("#npRandomNext")?.addEventListener("click", queueRandomNext);
  const mixBtn = c.root.querySelector("#npMix");
  if(mixBtn){
    mixBtn.classList.toggle("is-active", !!st.player.random);
    mixBtn.addEventListener("click", async ()=>{
      const next = !store.get().player.random;
      try {
        await fetch(`${AppConfig.restBaseUrl}/mpd/random?value=${next ? 1 : 0}`, {method: "POST"});
      } catch {}
    });
    store.subscribe((next)=>{
      mixBtn.classList.toggle("is-active", !!next.player.random);
    });
  }
  c.root.querySelector("#npAdd")?.addEventListener("click", ()=>toast("Démo : ajout playlist plus tard."));
  c.root.querySelector("#npFav")?.addEventListener("click", ()=>toast("Démo : favoris plus tard."));
}

function albumArtUrl(track, size){
  if(!track?.artist || !track?.album) return "";
  const url = new URL(`${AppConfig.restBaseUrl}/docs/album/art`, window.location.origin);
  url.searchParams.set("artist", track.artist);
  url.searchParams.set("album", track.album);
  if(size) url.searchParams.set("size", String(size));
  return url.toString();
}
