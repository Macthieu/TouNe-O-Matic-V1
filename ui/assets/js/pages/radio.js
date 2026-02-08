import { card, listRow, coverEl, button } from "../components/ui.js";
import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { addFavourite, fetchFavourites, playRadio, removeFavourite } from "../services/library.js";
import { toast } from "../utils.js";

export async function render(root){
  const c = card({ title:"Radio", subtitle:"Stations du monde (Radio-Browser)" });

  const controls = document.createElement("div");
  controls.style.display = "grid";
  controls.style.gap = "8px";

  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "1fr auto";
  row.style.gap = "8px";
  const qInput = document.createElement("input");
  qInput.className = "input";
  qInput.placeholder = "Rechercher une station, un style...";
  const btnSearch = button("Rechercher", {onClick: async (ev)=>{
    ev.stopPropagation();
    await runSearch();
  }});
  row.append(qInput, btnSearch);

  const row2 = document.createElement("div");
  row2.style.display = "grid";
  row2.style.gridTemplateColumns = "1fr 1fr 1fr auto";
  row2.style.gap = "8px";
  const countrySelect = document.createElement("select");
  countrySelect.className = "input";
  const tagSelect = document.createElement("select");
  tagSelect.className = "input";
  const sortSelect = document.createElement("select");
  sortSelect.className = "input";
  sortSelect.append(
    new Option("Tri: pertinence", "relevance"),
    new Option("Tri: langue", "language"),
    new Option("Tri: bitrate", "bitrate")
  );
  const btnTop = button("Top mondial", {onClick: async (ev)=>{
    ev.stopPropagation();
    qInput.value = "";
    countrySelect.value = "";
    tagSelect.value = "";
    sortSelect.value = "relevance";
    await loadTop();
  }});
  row2.append(countrySelect, tagSelect, sortSelect, btnTop);

  const row3 = document.createElement("div");
  row3.style.display = "grid";
  row3.style.gridTemplateColumns = "1fr 1fr auto";
  row3.style.gap = "8px";
  const cityInput = document.createElement("input");
  cityInput.className = "input";
  cityInput.placeholder = "Ville (optionnel)";
  const stateInput = document.createElement("input");
  stateInput.className = "input";
  stateInput.placeholder = "Région / province (optionnel)";
  const btnSearchLoc = button("Filtrer", {onClick: async (ev)=>{
    ev.stopPropagation();
    await runSearch();
  }});
  row3.append(cityInput, stateInput, btnSearchLoc);

  controls.append(row, row2, row3);

  const list = document.createElement("div");
  list.className = "list";

  const empty = document.createElement("div");
  empty.className = "muted small";
  empty.textContent = "Chargement des stations...";

  c.body.append(controls, list, empty);
  root.append(c.root);

  await loadFilters();
  let lastResults = [];
  let lastLabel = "";

  await fetchFavourites();
  await loadTop();

  sortSelect.addEventListener("change", ()=>{
    if(lastResults.length){
      renderStations(lastResults, lastLabel);
    }
  });

  async function loadFilters(){
    const [countries, tags] = await Promise.all([fetchCountries(), fetchTags()]);
    countrySelect.innerHTML = "";
    tagSelect.innerHTML = "";
    countrySelect.append(new Option("Pays (tous)", ""));
    tagSelect.append(new Option("Genre / tag (tous)", ""));
    for(const c of countries){
      countrySelect.append(new Option(`${c.name} (${c.count})`, c.name));
    }
    for(const t of tags){
      tagSelect.append(new Option(`${t.name} (${t.count})`, t.name));
    }
  }

  async function runSearch(){
    const q = qInput.value.trim();
    const country = countrySelect.value || "";
    const tag = tagSelect.value || "";
    const city = cityInput.value.trim();
    const state = stateInput.value.trim();
    if(!q && !country && !tag && !city && !state){
      toast("Entrez un mot-clé ou choisissez un filtre.");
      return;
    }
    const res = await fetchStations({q, country, tag, city, state});
    renderStations(res, q || tag || country || city || state);
  }

  async function loadTop(){
    const res = await fetchTop();
    renderStations(res, "Top mondial");
  }

  function renderStations(stations, label){
    lastResults = stations.slice();
    lastLabel = label;
    list.innerHTML = "";
    if(!stations.length){
      empty.textContent = `Aucun résultat (${label}).`;
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    const sortMode = sortSelect.value || "relevance";
    const items = stations.slice();
    if(sortMode === "language"){
      items.sort((a,b)=>String(a.language||"").localeCompare(String(b.language||"")));
    } else if(sortMode === "bitrate"){
      items.sort((a,b)=>(Number(b.bitrate)||0) - (Number(a.bitrate)||0));
    }
    for(const r of items){
      const left = coverEl("sm", r.name);
      if(r.favicon){
        left.style.backgroundImage = `url("${r.favicon}")`;
        left.style.backgroundSize = "cover";
        left.style.backgroundPosition = "center";
      }
      const subtitle = [r.country, r.state, r.language, r.tags].filter(Boolean).join(" • ");
      const favKey = `radio:${r.url}`;
      const favs = store.get().library.favourites || [];
      const isFav = favs.some(f=>f.key === favKey || (f.type === "radio" && f.path === r.url));
      const actions = document.createElement("div");
      actions.className = "row__actions";
      actions.append(
        button("Lire", {onClick: async (ev)=>{
          ev.stopPropagation();
          await playStation(r);
        }}),
        button("+", {onClick: async (ev)=>{
          ev.stopPropagation();
          await addStation(r);
        }}),
        button(isFav ? "★" : "☆", {onClick: async (ev)=>{
          ev.stopPropagation();
          await toggleFav(r);
          renderStations(stations, label);
        }})
      );
      if(r.homepage){
        actions.append(button("Site", {onClick:(ev)=>{
          ev.stopPropagation();
          window.open(r.homepage, "_blank", "noopener");
        }}));
      }
      list.append(listRow({
        title: r.name,
        subtitle,
        left,
        right: actions,
        onClick: ()=>playStation(r),
      }));
    }
  }

  async function fetchTop(){
    if(AppConfig.transport !== "rest") return [];
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/radio/top?limit=50`);
      const body = await res.json();
      return body?.ok ? (body.data || []) : [];
    } catch {
      return [];
    }
  }

  async function fetchStations({q, country, tag, city, state}){
    if(AppConfig.transport !== "rest") return [];
    try {
      const url = new URL(`${AppConfig.restBaseUrl}/radio/search`, window.location.origin);
      if(q) url.searchParams.set("q", q);
      if(country) url.searchParams.set("country", country);
      if(tag) url.searchParams.set("tag", tag);
      if(city) url.searchParams.set("city", city);
      if(state) url.searchParams.set("state", state);
      url.searchParams.set("limit", "80");
      const res = await fetch(url.toString());
      const body = await res.json();
      return body?.ok ? (body.data || []) : [];
    } catch {
      return [];
    }
  }

  async function fetchCountries(){
    if(AppConfig.transport !== "rest") return [];
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/radio/countries?limit=80`);
      const body = await res.json();
      return body?.ok ? (body.data || []) : [];
    } catch {
      return [];
    }
  }

  async function fetchTags(){
    if(AppConfig.transport !== "rest") return [];
    try {
      const res = await fetch(`${AppConfig.restBaseUrl}/radio/tags?limit=60`);
      const body = await res.json();
      return body?.ok ? (body.data || []) : [];
    } catch {
      return [];
    }
  }

  async function playStation(station){
    if(!station?.url) return toast("URL radio manquante.");
    await playRadio(station.url, {replace: true, play: true});
    toast("Lecture radio");
  }

  async function addStation(station){
    if(!station?.url) return toast("URL radio manquante.");
    await playRadio(station.url, {replace: false, play: false});
    toast("Ajouté à la file");
  }

  async function toggleFav(station){
    const key = `radio:${station.url}`;
    const favs = store.get().library.favourites || [];
    const existing = favs.find(f=>f.key === key || (f.type === "radio" && f.path === station.url));
    if(existing){
      await removeFavourite({key: existing.key});
      await fetchFavourites();
      return;
    }
    await addFavourite({
      type: "radio",
      path: station.url,
      title: station.name,
      subtitle: [station.country, station.state, station.language, station.tags].filter(Boolean).join(" • "),
      album: station.favicon || "",
    });
    await fetchFavourites();
  }
}
