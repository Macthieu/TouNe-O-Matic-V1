import { card, coverEl, button, pill, listRow } from "../components/ui.js";
import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { formatTime, toast } from "../utils.js";
import { queueRandomNext, toggleTrackFavourite, fetchFavourites, showAddMenu } from "../services/library.js";

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
  cover.style.marginTop = "6px";

  const meta = document.createElement("div");
  meta.innerHTML = `
    <div class="h1" id="npTitle">—</div>
    <div class="muted" id="npSubtitle">—</div>
    <div style="margin-top:10px" class="muted small" id="npDetail">—</div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px">
      <button class="btn primary" id="npPlay">${st.player.state === "play" ? "Pause" : "Lecture"}</button>
      <button class="btn" id="npNext">Suivant</button>
      <button class="btn" id="npMix">Mix</button>
      <button class="btn" id="npRandomNext">Suivant aléatoire</button>
      <button class="btn" id="npAdd">Ajouter à une playlist</button>
      <button class="btn" id="npFav">Ajouter aux favoris</button>
    </div>
    <div class="now__progress">
      <input id="seekNow" type="range" min="0" max="1000" value="0" aria-label="Position" />
      <div class="now__times">
        <span class="time muted" id="npCur">0:00</span>
        <span class="time muted" id="npDur">0:00</span>
      </div>
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
    const cover = coverEl("sm", n.title);
    const artNext = albumArtUrl(n, 120);
    if(artNext){
      cover.style.backgroundImage = `url("${artNext}")`;
      cover.style.backgroundSize = "cover";
      cover.style.backgroundPosition = "center";
    }
    list.append(listRow({
      title: n.title,
      subtitle: `${n.artist} • ${n.album}`,
      left: cover,
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
  const titleEl = meta.querySelector("#npTitle");
  const subtitleEl = meta.querySelector("#npSubtitle");
  const detailEl = meta.querySelector("#npDetail");
  const favBtn = meta.querySelector("#npFav");
  const addBtn = meta.querySelector("#npAdd");
  const lockIds = ["npPlay", "npNext", "npMix", "npRandomNext"];

  function applyState(state){
    const track = state.player.track;
    const ap = state.airplay || {};
    const airplayActive = !!ap.active;
    const displayTitle = airplayActive ? (ap.title || "AirPlay") : (track?.title || "—");
    const displayArtist = airplayActive ? (ap.artist || "") : (track?.artist || "—");
    const displayAlbum = airplayActive ? (ap.album || "") : (track?.album || "—");

    if(titleEl) titleEl.textContent = displayTitle;
    if(subtitleEl){
      subtitleEl.textContent = displayAlbum
        ? `${displayArtist || "—"} • ${displayAlbum}`
        : (displayArtist || "—");
    }
    if(detailEl){
      detailEl.textContent = airplayActive
        ? "Source externe (AirPlay) • Contrôle via l’app source"
        : (track ? `Piste ${track.trackNo} • ${formatTime(track.duration)} • ${track.year}` : "—");
    }

    const art = airplayActive ? airplayArtUrl(ap) : albumArtUrl(track, 420);
    if(art){
      cover.style.backgroundImage = `url("${art}")`;
      cover.style.backgroundSize = "cover";
      cover.style.backgroundPosition = "center";
    } else {
      cover.style.backgroundImage = "";
    }

    if(addBtn){
      if(airplayActive || !track?.path){
        addBtn.setAttribute("disabled", "disabled");
        addBtn.classList.add("is-disabled");
      } else {
        addBtn.removeAttribute("disabled");
        addBtn.classList.remove("is-disabled");
      }
    }

    if(favBtn){
      const favs = state.library.favourites || [];
      const isFav = track?.path ? favs.some(f=>f.key === `track:${track.path}`) : false;
      favBtn.textContent = isFav ? "Retirer des favoris" : "Ajouter aux favoris";
      if(airplayActive || !track?.path){
        favBtn.setAttribute("disabled", "disabled");
        favBtn.classList.add("is-disabled");
      } else {
        favBtn.removeAttribute("disabled");
        favBtn.classList.remove("is-disabled");
      }
    }

    for(const id of lockIds){
      const btn = c.root.querySelector(`#${id}`);
      if(!btn) continue;
      if(airplayActive){
        btn.setAttribute("disabled", "disabled");
        btn.classList.add("is-disabled");
        btn.title = "Lecture via AirPlay — contrôle depuis l’app source";
      } else {
        btn.removeAttribute("disabled");
        btn.classList.remove("is-disabled");
        btn.title = "";
      }
    }
  }

  addBtn?.addEventListener("click", (ev)=>{
    const track = store.get().player.track;
    if(!track?.path) return;
    showAddMenu(ev.currentTarget, {title: track.title, paths: [track.path]});
  });
  favBtn?.addEventListener("click", async ()=>{
    const track = store.get().player.track;
    if(!track?.path) return;
    await toggleTrackFavourite(track);
    await fetchFavourites();
  });

  applyState(store.get());
  store.subscribe(applyState);
}

function albumArtUrl(track, size){
  if(!track?.artist || !track?.album) return "";
  const url = new URL(`${AppConfig.restBaseUrl}/docs/album/art`, window.location.origin);
  url.searchParams.set("artist", track.artist);
  url.searchParams.set("album", track.album);
  if(size) url.searchParams.set("size", String(size));
  return url.toString();
}

function airplayArtUrl(ap){
  if(!ap?.art) return "";
  try {
    return new URL(ap.art, window.location.origin).toString();
  } catch {
    return "";
  }
}
