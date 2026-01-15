import { store } from "./store.js";
import { $, $$, formatTime, toast, onOutsideClick, clamp } from "./utils.js";
import { registerRoute, renderRoute, navigate } from "./router.js";
import { buildMockLibrary } from "./services/mockdata.js";
import { MPDClient } from "./services/mpd.js";
import { fetchQueueStatus, fetchCmdStatus } from "./services/library.js";
import { fetchAirplayStatus } from "./services/airplay.js";
import { AppConfig } from "./config.js";

// Pages
import * as Home from "./pages/home.js";
import * as Music from "./pages/music.js";
import * as Artist from "./pages/artist.js";
import * as Album from "./pages/album.js";
import * as Radio from "./pages/radio.js";
import * as Favourites from "./pages/favourites.js";
import * as Playlists from "./pages/playlists.js";
import * as Apps from "./pages/apps.js";
import * as Now from "./pages/now.js";
import * as Queue from "./pages/queue.js";
import * as Players from "./pages/players.js";
import * as Settings from "./pages/settings.js";
import * as About from "./pages/about.js";
import * as Search from "./pages/search.js";

// Routes
registerRoute("home",      { title: "Accueil", render: Home.render });
registerRoute("music",     { title: "Ma musique", render: Music.render });
registerRoute("artist",    { title: "Artiste", render: Artist.render });
registerRoute("album",     { title: "Album", render: Album.render });
registerRoute("radio",     { title: "Radio", render: Radio.render });
registerRoute("favourites",{ title: "Favoris", render: Favourites.render });
registerRoute("playlists", { title: "Playlists", render: Playlists.render });
registerRoute("apps",      { title: "Apps", render: Apps.render });
registerRoute("now",       { title: "En lecture", render: Now.render });
registerRoute("queue",     { title: "File d’attente", render: Queue.render });
registerRoute("players",   { title: "Appareils", render: Players.render });
registerRoute("settings",  { title: "Paramètres", render: Settings.render });
registerRoute("about",     { title: "À propos", render: About.render });
registerRoute("search",    { title: "Recherche", render: Search.render });

// Init UI
applyTheme(store.get().ui.theme);
store.subscribe((st)=>applyTheme(st.ui.theme));

// Build mock library (fallback for empty or unavailable API)
const lib = buildMockLibrary();
store.set({ library: lib });

// Seed a demo queue only in mock mode
if(AppConfig.transport === "mock"){
  const seedQueue = [
    ...lib.albums[0].tracks,
    ...lib.albums[1].tracks,
    ...lib.albums[3].tracks,
  ].map((t)=>({ ...t }));

  const initial = store.get();
  store.set({
    player: {
      ...initial.player,
      connected: true,
      queue: seedQueue,
      index: 0,
      track: seedQueue[0],
      duration: seedQueue[0]?.duration || 0,
      elapsed: 0,
      state: "pause",
    }
  });
}

// MPD client (mock)
const mpd = new MPDClient({refreshMs: AppConfig.refreshMs});
await mpd.connect(store.get());

await loadLibrary();

// Keep store updated from mpd
mpd.onUpdate((nextState)=>{
  // mpd emits whole state; merge only player for now
  store.set({ player: nextState.player });
});

// AirPlay status (best-effort)
  if(AppConfig.transport !== "mock"){
    const airplayRefreshMs = Math.max(2000, AppConfig.refreshMs || 1000);
    const refreshAirplay = async ()=>{
      const data = await fetchAirplayStatus();
      store.set({
        airplay: data || { active: false, status: "Unavailable", title: "", artist: "", album: "", art: "", source: "airplay" }
      });
    };
  await refreshAirplay();
  setInterval(refreshAirplay, airplayRefreshMs);
}

// Drawer behavior
const drawer = $("#drawer");
const btnMenu = $("#btnMenu");
btnMenu?.addEventListener("click", ()=>{
  if(window.matchMedia("(max-width: 980px)").matches){
    drawer?.classList.toggle("open");
  }
});

// Player chip
$("#btnPlayer")?.addEventListener("click", ()=>navigate("players"));

// Fullscreen
$("#btnFullscreen")?.addEventListener("click", async ()=>{
  try {
    if(document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast("Plein écran indisponible");
  }
});

// Highlight active nav
function syncNav(route){
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  let view = params.get("view") || "";
  if(route === "favourites" && !view) view = "tracks";
  $$(".nav-item").forEach(a=>{
    const r = a.getAttribute("data-route");
    const v = a.getAttribute("data-view") || "";
    const matches = r === route && (!v || v === view);
    if(matches) a.setAttribute("aria-current","page");
    else a.removeAttribute("aria-current");
  });
}
store.subscribe((st)=>syncNav(st.route));

// Close drawer on mobile route change
window.addEventListener("hashchange", ()=>{
  if(window.matchMedia("(max-width: 980px)").matches){
    drawer?.classList.remove("open");
  }
});

// Router
window.addEventListener("hashchange", renderRoute);
await renderRoute();
syncNav(store.get().route);

// Search
const searchInput = $("#searchInput");
const btnSearchClear = $("#btnSearchClear");

btnSearchClear?.addEventListener("click", ()=>{
  if(searchInput){ searchInput.value = ""; searchInput.focus(); }
  navigate("home");
});

searchInput?.addEventListener("keydown", (ev)=>{
  if(ev.key === "Enter"){
    const q = (searchInput.value || "").trim();
    if(q){
      const params = new URLSearchParams({q});
      navigate("search", params);
    } else {
      navigate("home");
    }
  }
});

// Keyboard shortcuts (avoid when typing)
window.addEventListener("keydown", (ev)=>{
  const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : "";
  const isTyping = tag === "input" || tag === "textarea" || ev.target?.isContentEditable;
  if(isTyping) return;
  if(ev.metaKey || ev.ctrlKey || ev.altKey) return;

  if(ev.key === " "){
    ev.preventDefault();
    $("#btnPlayPause")?.click();
  } else if(ev.key === "n" || ev.key === "N"){
    $("#btnNext")?.click();
  } else if(ev.key === "p" || ev.key === "P"){
    $("#btnPrev")?.click();
  } else if(ev.key === "m" || ev.key === "M" || ev.key === "s" || ev.key === "S"){
    $("#btnShuffle")?.click();
  } else if(ev.key === "r" || ev.key === "R"){
    $("#btnRepeat")?.click();
  } else if(ev.key === "/" || ev.key === "f" || ev.key === "F"){
    ev.preventDefault();
    searchInput?.focus();
  } else if(ev.key === "Escape"){
    if(searchInput?.value){
      $("#btnSearchClear")?.click();
    }
  } else if(ev.key === "q" || ev.key === "Q"){
    navigate("queue");
  } else if(ev.key === "l" || ev.key === "L"){
    navigate("now");
  }
});

// Theme toggle
$("#btnTheme")?.addEventListener("click", ()=>{
  const cur = store.get().ui.theme;
  store.setTheme(cur === "light" ? "dark" : "light");
  toast(cur === "light" ? "Thème sombre" : "Thème clair");
});

// Volume slider (appbar)
const volRange = $("#volRange");
volRange?.addEventListener("input", async ()=>{
  const v = Number(volRange.value || 0);
  await mpd.setVolume(v);
});

// More menu
const menu = $("#menuMore");
const menuOutput = $("#menuOutput");
let detachOutside = null;
let detachOutputOutside = null;

function openMenu(){
  menu.hidden = false;
  detachOutside?.();
  detachOutside = onOutsideClick(menu, closeMenu);
}
function closeMenu(){
  menu.hidden = true;
  detachOutside?.(); detachOutside = null;
}
$("#btnMore")?.addEventListener("click", ()=>{
  if(menu.hidden) openMenu();
  else closeMenu();
});
$("#mnuGoNow")?.addEventListener("click", ()=>{ closeMenu(); navigate("now"); });
$("#mnuGoPlayers")?.addEventListener("click", ()=>{ closeMenu(); navigate("players"); });
$("#mnuGoSettings")?.addEventListener("click", ()=>{ closeMenu(); navigate("settings"); });
$("#mnuResetDemo")?.addEventListener("click", ()=>{
  closeMenu();
  localStorage.removeItem("toune.theme");
  location.reload();
});

function openOutputMenu(){
  if(!menuOutput) return;
  menuOutput.hidden = false;
  refreshOutputMenu();
  detachOutputOutside?.();
  detachOutputOutside = onOutsideClick(menuOutput, closeOutputMenu);
}
function closeOutputMenu(){
  if(!menuOutput) return;
  menuOutput.hidden = true;
  detachOutputOutside?.(); detachOutputOutside = null;
}
$("#btnOutput")?.addEventListener("click", async ()=>{
  if(!menuOutput) return;
  if(menuOutput.hidden) openOutputMenu();
  else closeOutputMenu();
});
$("#mnuOutputSettings")?.addEventListener("click", ()=>{
  closeOutputMenu();
  navigate("settings");
});

// Mini player click -> now playing
$("#playerbarLeft")?.addEventListener("click", ()=>navigate("now"));

// Player controls
$("#btnPlayPause")?.addEventListener("click", async ()=>{
  await mpd.toggle();
});
$("#btnPrev")?.addEventListener("click", async ()=>{ await mpd.prev(); });
$("#btnNext")?.addEventListener("click", async ()=>{ await mpd.next(); });

const seek = $("#seek");
let seeking = false;
seek?.addEventListener("pointerdown", ()=>{ seeking = true; });
seek?.addEventListener("pointerup", async ()=>{
  seeking = false;
  const st = store.get().player;
  const ratio = (Number(seek.value) || 0) / 1000;
  await mpd.seek(ratio * (st.duration || 0));
});
seek?.addEventListener("input", ()=>{
  // live preview of time
  const st = store.get().player;
  const ratio = (Number(seek.value) || 0) / 1000;
  $("#tCur").textContent = formatTime(ratio * (st.duration || 0));
});

// Queue sheet
const sheetBackdrop = $("#sheetBackdrop");
const queueSheet = $("#queueSheet");
function openSheet(){
  sheetBackdrop.hidden = false;
  queueSheet.hidden = false;
}
function closeSheet(){
  sheetBackdrop.hidden = true;
  queueSheet.hidden = true;
}
$("#btnQueue")?.addEventListener("click", ()=>{
  const isMobile = window.matchMedia("(max-width: 980px)").matches;
  if(isMobile){
    if(queueSheet.hidden) openSheet();
    else closeSheet();
  } else {
    navigate("queue");
  }
});
$("#btnSheetClose")?.addEventListener("click", closeSheet);
sheetBackdrop?.addEventListener("click", closeSheet);

// Shuffle/Repeat chips
$("#btnShuffle")?.addEventListener("click", async ()=>{
  const cur = store.get().player.random;
  await mpd.setRandom(!cur);
  toast(!cur ? "Aléatoire: ON" : "Aléatoire: OFF");
});
$("#btnRepeat")?.addEventListener("click", async ()=>{
  await mpd.cycleRepeat();
  toast("Répéter: " + store.get().player.repeat);
});

// Volume quick control (simple)
$("#btnVol")?.addEventListener("click", async ()=>{
  const cur = store.get().player.volume;
  const next = (cur >= 100) ? 0 : Math.min(100, cur + 10);
  await mpd.setVolume(next);
  toast("Volume: " + next + "%");
});

// Bind store -> UI
store.subscribe((st)=>{
  renderPlayerBar(st);
  renderQueuePane(st.player);
  renderHeader(st.player);
});
renderPlayerBar(store.get());
renderQueuePane(store.get().player);
renderHeader(store.get().player);
initQueueBadge();
initCmdToast();

function applyTheme(theme){
  document.documentElement.dataset.theme = theme;
}

async function loadLibrary(){
  if(AppConfig.transport !== "rest") return;
  try {
    const res = await fetch(`${AppConfig.restBaseUrl}/library/summary`);
    const body = await res.json();
    if(body?.ok && body.data){
      store.set({ library: body.data });
    }
  } catch {
    // keep mock library as fallback
  }
}

function renderPlayerBar(state){
  const p = state.player;
  const ap = state.airplay || {};
  const airplayActive = !!ap.active;
  const displayTitle = airplayActive ? (ap.title || "AirPlay") : (p.track?.title || "—");
  const displayArtist = airplayActive ? (ap.artist || ap.album || "Source externe") : (p.track?.artist || "—");
  const displayArt = airplayActive ? airplayArtUrl(ap) : albumArtUrl(p.track, 160);

  // mini meta
  $("#miniTitle").textContent = displayTitle;
  $("#miniArtist").textContent = displayArtist;
  const miniCover = $("#miniCover");
  if(miniCover){
    miniCover.style.backgroundImage = displayArt ? `url("${displayArt}")` : "";
    miniCover.style.backgroundSize = "cover";
    miniCover.style.backgroundPosition = "center";
  }

  if(airplayActive){
    $("#tCur").textContent = "—";
    $("#tDur").textContent = "—";
    if(seek){
      seek.value = "0";
      seek.setAttribute("disabled", "disabled");
      seek.classList.add("is-disabled");
    }
  } else {
    $("#tCur").textContent = formatTime(p.elapsed || 0);
    $("#tDur").textContent = formatTime(p.duration || 0);
    if(seek){
      seek.removeAttribute("disabled");
      seek.classList.remove("is-disabled");
    }
  }

  // progress bar (avoid snapping while user is seeking)
  if(!seeking && seek){
    const ratio = (p.duration ? (p.elapsed / p.duration) : 0);
    seek.value = String(Math.round(clamp(ratio, 0, 1) * 1000));
  }

  // icon play/pause
  const icon = $("#iconPlayPause");
  if(icon){
    icon.innerHTML = (p.state === "play")
      ? '<path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/>'
      : '<path d="M8 5v14l11-7z"/>';
  }

  const lockMsg = "Lecture via AirPlay — contrôle depuis l’app source";
  const lockControls = airplayActive;
  for(const id of ["btnPlayPause", "btnNext", "btnPrev"]){
    const btn = document.getElementById(id);
    if(!btn) continue;
    if(lockControls){
      btn.setAttribute("disabled", "disabled");
      btn.classList.add("is-disabled");
      btn.title = lockMsg;
    } else {
      btn.removeAttribute("disabled");
      btn.classList.remove("is-disabled");
      btn.title = btn.getAttribute("aria-label") || "";
    }
  }

  // queue sheet
  $("#queueSummary").textContent = `${p.queue.length} titres • ${p.name} • Vol ${p.volume}%`;
  renderQueueSheet(p);
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

async function fetchJson(path, opts){
  const res = await fetch(`${AppConfig.restBaseUrl}${path}`, opts);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if(!body?.ok) throw new Error(body?.error || "API error");
  return body.data;
}

async function refreshOutputMenu(){
  const airplayBtn = $("#mnuOutputAirplay");
  const btBtn = $("#mnuOutputBluetooth");
  if(!airplayBtn || !btBtn || AppConfig.transport !== "rest") return;
  try {
    const ap = await fetchJson("/airplay/targets");
    const apLabel = ap?.active ? `AirPlay: ON (${ap.current || "—"})` : "AirPlay: OFF";
    airplayBtn.textContent = apLabel;
    airplayBtn.onclick = async ()=>{
      const next = !ap?.active;
      await fetchJson("/airplay/send", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({enabled: next})
      });
      await refreshOutputMenu();
    };
  } catch {
    airplayBtn.textContent = "AirPlay: —";
  }
  try {
    const bt = await fetchJson("/bluetooth/targets");
    const btLabel = bt?.active ? `Bluetooth: ON (${bt.current || "—"})` : "Bluetooth: OFF";
    btBtn.textContent = btLabel;
    btBtn.onclick = async ()=>{
      const next = !bt?.active;
      await fetchJson("/bluetooth/send", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({enabled: next})
      });
      await refreshOutputMenu();
    };
  } catch {
    btBtn.textContent = "Bluetooth: —";
  }
}

function renderHeader(p){
  const name = $("#playerName");
  if(name) name.textContent = p.name || "Lecteur";
  const pct = $("#volPct");
  if(pct) pct.textContent = `${p.volume ?? 0}%`;
  if(volRange && document.activeElement !== volRange) volRange.value = String(p.volume ?? 0);
}

function renderQueuePane(p){
  const pane = $("#queuePane");
  if(!pane) return;
  const sum = $("#queuePaneSummary");
  const list = $("#queuePaneList");
  const isWide = window.matchMedia("(min-width: 1100px)").matches;
  pane.hidden = !isWide;
  if(!isWide) return;

  const total = (p.queue || []).reduce((acc,t)=>acc + (t.duration||0), 0);
  if(sum) sum.textContent = `${p.queue?.length || 0} titres • ${formatTime(total)}`;
  if(!list) return;
  list.innerHTML = "";
  (p.queue || []).forEach((t, i)=>{
    const row = document.createElement("button");
    row.type = "button";
    row.className = "qrow" + (i === p.index ? " is-current" : "");
    row.innerHTML = `
      <div class="qrow__left">
        <div class="qrow__cover"></div>
      </div>
      <div class="qrow__main">
        <div class="qrow__title ellipsis">${t.title || "—"}</div>
        <div class="qrow__sub ellipsis muted">${t.artist || ""}</div>
      </div>
      <div class="qrow__right muted">${formatTime(t.duration || 0)}</div>
    `;
    const cover = row.querySelector(".qrow__cover");
    if(cover){
      const art = albumArtUrl(t, 120);
      if(art){
        cover.style.backgroundImage = `url("${art}")`;
        cover.style.backgroundSize = "cover";
        cover.style.backgroundPosition = "center";
      }
    }
    row.addEventListener("click", ()=>mpd.playAt(i));
    list.appendChild(row);
  });
}

async function initQueueBadge(){
  const badge = $("#queueSyncBadge");
  if(!badge) return;
  async function refresh(){
    const st = await fetchQueueStatus();
    if(!badge.isConnected) return;
    if(!st){
      badge.classList.remove("is-bad");
      badge.querySelector(".sync-text").textContent = "sync";
      return;
    }
    const ok = !!st.match;
    badge.classList.toggle("is-bad", !ok);
    badge.querySelector(".sync-text").textContent = ok ? "sync" : "désync";
  }
  await refresh();
  setInterval(refresh, 5000);
}

async function initCmdToast(){
  const toastEl = $("#cmdToast");
  if(!toastEl) return;
  let lastTs = 0;
  async function refresh(){
    const st = await fetchCmdStatus();
    if(!toastEl.isConnected) return;
    if(!st){
      toastEl.hidden = true;
      return;
    }
    const ts = Number(st.last_cmd_ts || 0);
    if(!st.last_error){
      toastEl.hidden = true;
      lastTs = ts || lastTs;
      return;
    }
    if(ts && ts === lastTs){
      return;
    }
    lastTs = ts || lastTs;
    const cmd = st.last_cmd_line || st.last_cmd || "cmd";
    toastEl.textContent = `Erreur cmd: ${cmd} — ${st.last_error}`;
    toastEl.hidden = false;
  }
  await refresh();
  setInterval(refresh, 3000);
}

// Desktop queue clear
$("#btnQueueClear")?.addEventListener("click", async ()=>{
  await mpd.clearQueue();
  toast("File vidée");
});

// Swipe between Browse ↔ Now ↔ Queue (mobile)
let lastBrowseHash = location.hash || "#/home";
window.addEventListener("hashchange", ()=>{
  const r = store.get().route;
  if(r !== "now" && r !== "queue") lastBrowseHash = location.hash || "#/home";
});

(()=>{
  const target = $("#content");
  if(!target) return;
  let x0 = null;
  let y0 = null;
  target.addEventListener("touchstart", (e)=>{
    if(!window.matchMedia("(max-width: 980px)").matches) return;
    const t = e.touches?.[0];
    if(!t) return;
    x0 = t.clientX;
    y0 = t.clientY;
  }, {passive:true});
  target.addEventListener("touchend", (e)=>{
    if(x0 == null || y0 == null) return;
    const t = e.changedTouches?.[0];
    if(!t) return;
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;
    x0 = y0 = null;
    if(Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    const r = store.get().route;
    if(dx < 0){
      // swipe left
      if(r !== "now" && r !== "queue") navigate("now");
      else if(r === "now") navigate("queue");
    } else {
      // swipe right
      if(r === "queue") navigate("now");
      else if(r === "now") location.hash = lastBrowseHash || "#/home";
    }
  }, {passive:true});
})();

function renderQueueSheet(p){
  const list = $("#queueList");
  if(!list) return;
  list.innerHTML = "";
  for(const [i,t] of p.queue.entries()){
    const row = document.createElement("div");
    row.className = "row";
    row.style.cursor = "pointer";
    row.innerHTML = `
      <div class="cover cover--sm" aria-hidden="true"></div>
      <div class="row__grow">
        <div class="ellipsis strong">${escapeHtml(t.title)}</div>
        <div class="ellipsis muted small">${escapeHtml(t.artist)} • ${escapeHtml(t.album)}</div>
      </div>
      <div class="pill">${i===p.index ? "▶" : String(i+1)}</div>
    `;
    const cover = row.querySelector(".cover");
    if(cover){
      const art = albumArtUrl(t, 120);
      if(art){
        cover.style.backgroundImage = `url("${art}")`;
        cover.style.backgroundSize = "cover";
        cover.style.backgroundPosition = "center";
      }
    }
    row.addEventListener("click", async ()=>{
      await mpd.playAt(i);
      toast("Lecture: " + t.title);
    });
    list.append(row);
  }
}

// simple HTML escape helper for queue sheet
function escapeHtml(str=""){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
