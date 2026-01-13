import { card, listRow, coverEl, chip } from "../components/ui.js";
import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { navigate } from "../router.js";
import { playPaths, showAddMenu, playPlaylist, queuePlaylist } from "../services/library.js";
import { formatTime } from "../utils.js";

export async function render(root, params){
  const q = (params.get("q") || "").trim();
  const typeFilter = (params.get("type") || "").trim();
  const c = card({
    title:"Recherche avancée",
    subtitle: q ? `Résultats pour “${q}”` : "Tape quelque chose dans la barre de recherche.",
  });

  if(!q){
    c.body.append(renderExamples());
    root.append(c.root);
    return;
  }

  const parsed = parseQuery(q);
  const st = store.get().library || {};
  const results = buildResults(st, parsed, typeFilter);
  const sections = renderSections(results, parsed, typeFilter, q);
  c.body.append(sections);
  root.append(c.root);

  const unsubscribe = store.subscribe(()=>{
    if(!root.contains(c.root)){
      unsubscribe();
      return;
    }
    const next = buildResults(store.get().library || {}, parsed, typeFilter);
    sections.replaceWith(renderSections(next, parsed, typeFilter, q));
  });
}

function renderExamples(){
  const wrap = document.createElement("div");
  wrap.className = "list";
  const examples = [
    'blind melon',
    'artist:"Ariane Moffatt"',
    'album:"Bigger, Better, Faster, More!"',
    'title:"What’s Up"',
    'genre:rock',
    'year:1992',
    'composer:"Linda Perry"',
    'work:"What’s Up?"',
    'playlist:tesy',
    'folder:"Ariane Moffatt"',
    'type:tracks "train"',
    'type:albums santana',
  ];
  const hint = document.createElement("div");
  hint.className = "muted";
  hint.textContent = "Exemples (tape et valide avec Entrée) :";
  wrap.append(hint);

  const row = document.createElement("div");
  row.className = "rowbar";
  examples.forEach((ex)=>{
    row.append(chip(ex, {onClick: ()=>navigate("search", new URLSearchParams({q: ex}))}));
  });
  wrap.append(row);
  return wrap;
}

function parseQuery(q){
  const filters = {};
  const free = [];
  const pattern = /(\w+):"([^"]+)"|(\w+):(\S+)|"([^"]+)"|(\S+)/g;
  let m;
  while((m = pattern.exec(q)) !== null){
    const field = m[1] || m[3];
    const value = m[2] || m[4] || m[5] || m[6];
    if(field){
      const key = normalizeField(field);
      if(!key){
        free.push(`${field}:${value}`);
        continue;
      }
      if(!filters[key]) filters[key] = [];
      filters[key].push(value);
    } else if(value) {
      free.push(value);
    }
  }
  return {filters, free};
}

function normalizeField(field){
  const f = field.toLowerCase();
  const map = {
    type: "type",
    section: "type",
    artist: "artist",
    artiste: "artist",
    album: "album",
    title: "title",
    titre: "title",
    track: "title",
    piste: "title",
    genre: "genre",
    year: "year",
    annee: "year",
    année: "year",
    composer: "composer",
    compositeur: "composer",
    work: "work",
    oeuvre: "work",
    œuvre: "work",
    playlist: "playlist",
    folder: "folder",
    dossier: "folder",
  };
  return map[f] || null;
}

function buildResults(lib, parsed, typeFilter){
  const tracks = [];
  (lib.albums || []).forEach((al)=>{
    (al.tracks || []).forEach((t)=>{
      tracks.push({
        title: t.title,
        artist: t.artist,
        album: t.album,
        year: t.year,
        duration: t.duration,
        path: t.path,
      });
    });
  });

  const results = {
    tracks: filterTracks(tracks, parsed),
    artists: filterNameItems(lib.artists || [], parsed, "artist"),
    albumartists: filterNameItems(lib.albumartists || [], parsed, "artist"),
    albums: filterAlbums(lib.albums || [], parsed),
    genres: filterCountItems(lib.genres || [], parsed, "genre"),
    years: filterYearItems(lib.years || [], parsed),
    composers: filterCountItems(lib.composers || [], parsed, "composer"),
    works: filterCountItems(lib.works || [], parsed, "work"),
    playlists: filterPlaylistItems(lib.playlists || [], parsed),
    folders: filterCountItems(lib.folders || [], parsed, "folder"),
  };

  const allowed = normalizeTypes(parsed.filters.type || [], typeFilter);
  if(allowed.length){
    Object.keys(results).forEach((key)=>{
      if(!allowed.includes(key)) results[key] = [];
    });
  }
  return results;
}

function renderSections(results, parsed, typeFilter, q){
  const wrap = document.createElement("div");
  wrap.className = "list";

  const total = Object.values(results).reduce((acc, list)=>acc + list.length, 0);
  if(!total){
    wrap.innerHTML = '<div class="muted">Aucun résultat.</div>';
    return wrap;
  }

  const sections = [
    ["tracks", "Titres"],
    ["artists", "Artistes"],
    ["albumartists", "Artistes d’album"],
    ["albums", "Albums"],
    ["genres", "Genres"],
    ["years", "Années"],
    ["composers", "Compositeurs"],
    ["works", "Œuvres"],
    ["playlists", "Playlists"],
    ["folders", "Dossiers"],
  ];

  sections.forEach(([key, label])=>{
    const items = results[key];
    if(!items || !items.length) return;
    const limit = typeFilter ? items.length : 10;
    const cardWrap = card({ title: `${label} (${items.length})` });
    const list = document.createElement("div");
    list.className = "list";
    items.slice(0, limit).forEach((item)=>{
      list.append(renderRowFor(key, item));
    });
    cardWrap.body.append(list);
    if(!typeFilter && items.length > limit){
      const more = document.createElement("div");
      more.className = "rowbar";
      more.append(chip(`Voir tout ${label}`, {onClick: ()=>{
        const params = new URLSearchParams({q, type: key});
        navigate("search", params);
      }}));
      cardWrap.body.append(more);
    }
    wrap.append(cardWrap.root);
  });
  return wrap;
}

function renderRowFor(key, item){
  if(key === "tracks"){
    const cover = coverEl("sm", item.title || "");
    hydrateAlbumCover(cover, item.artist, item.album);
    const actions = document.createElement("div");
    actions.className = "row__actions";
    actions.append(
      actionBtn("▶", "Lire", (ev)=>{ev.stopPropagation(); playPaths([item.path].filter(Boolean));}),
      actionBtn("+", "Ajouter", (ev)=>{ev.stopPropagation(); showAddMenu(ev.currentTarget, {title: item.title, paths: [item.path].filter(Boolean)});})
    );
    return listRow({
      title: item.title || "—",
      subtitle: `${item.artist || "—"} • ${item.album || "—"} • ${formatTime(item.duration || 0)}`,
      left: cover,
      right: actions
    });
  }

  if(key === "artists" || key === "albumartists"){
    const cover = coverEl("sm", item.name || "");
    hydrateArtistCover(cover, item.name);
    const actions = document.createElement("div");
    actions.className = "row__actions";
    const paths = flattenArtistPaths(item);
    actions.append(
      actionBtn("▶", "Lire", (ev)=>{ev.stopPropagation(); playPaths(paths);}),
      actionBtn("+", "Ajouter", (ev)=>{ev.stopPropagation(); showAddMenu(ev.currentTarget, {title: item.name, paths});})
    );
    return listRow({
      title: item.name || "—",
      subtitle: `${item.albums?.length || 0} albums`,
      left: cover,
      right: actions,
      onClick: ()=>navigate("artist", new URLSearchParams({id: item.id}))
    });
  }

  if(key === "albums"){
    const cover = coverEl("sm", item.title || "");
    hydrateAlbumCover(cover, item.artist, item.title);
    const actions = document.createElement("div");
    actions.className = "row__actions";
    const paths = (item.tracks || []).map(t=>t.path).filter(Boolean);
    actions.append(
      actionBtn("▶", "Lire", (ev)=>{ev.stopPropagation(); playPaths(paths);}),
      actionBtn("+", "Ajouter", (ev)=>{ev.stopPropagation(); showAddMenu(ev.currentTarget, {title: item.title, paths});})
    );
    return listRow({
      title: item.title || "—",
      subtitle: `${item.artist || "—"} • ${item.year || "—"}`,
      left: cover,
      right: actions,
      onClick: ()=>navigate("album", new URLSearchParams({id: item.id}))
    });
  }

  if(key === "playlists"){
    const cover = coverEl("sm", item.name || "");
    const actions = document.createElement("div");
    actions.className = "row__actions";
    actions.append(
      actionBtn("▶", "Lecture + file", (ev)=>{ev.stopPropagation(); playPlaylist(item.name);}),
      actionBtn("+", "Ajouter à la file", (ev)=>{ev.stopPropagation(); queuePlaylist(item.name);})
    );
    return listRow({
      title: item.name || "—",
      subtitle: `${item.tracks || 0} titres`,
      left: cover,
      right: actions,
      onClick: ()=>navigate("playlists", new URLSearchParams({name: item.name}))
    });
  }

  if(key === "years"){
    return listRow({
      title: String(item.year),
      subtitle: `${item.count} titres`,
      left: coverEl("sm", String(item.year)),
      onClick: ()=>navigate("search", new URLSearchParams({q: `year:${item.year}`}))
    });
  }

  if(key === "genres"){
    return listRow({
      title: item.name,
      subtitle: `${item.count} titres`,
      left: coverEl("sm", item.name),
      onClick: ()=>navigate("search", new URLSearchParams({q: `genre:"${item.name}"`}))
    });
  }

  if(key === "composers"){
    return listRow({
      title: item.name,
      subtitle: `${item.count} titres`,
      left: coverEl("sm", item.name),
      onClick: ()=>navigate("search", new URLSearchParams({q: `composer:"${item.name}"`}))
    });
  }

  if(key === "works"){
    return listRow({
      title: item.name,
      subtitle: `${item.count} titres`,
      left: coverEl("sm", item.name),
      onClick: ()=>navigate("search", new URLSearchParams({q: `work:"${item.name}"`}))
    });
  }

  if(key === "folders"){
    return listRow({
      title: item.name,
      subtitle: `${item.count} titres`,
      left: coverEl("sm", item.name),
      onClick: ()=>navigate("search", new URLSearchParams({q: `folder:"${item.name}"`}))
    });
  }

  return listRow({ title: item.name || item.title || "—" });
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

function normalizeTypes(filterValues, typeFilter){
  const values = [];
  if(typeFilter) values.push(typeFilter);
  filterValues.forEach((v)=>{
    v.split(",").forEach((s)=>{
      const val = s.trim().toLowerCase();
      if(val) values.push(val);
    });
  });
  const map = {
    tracks: "tracks",
    track: "tracks",
    titres: "tracks",
    artists: "artists",
    artistes: "artists",
    albumartists: "albumartists",
    "artistes-dalbum": "albumartists",
    albums: "albums",
    genres: "genres",
    years: "years",
    annees: "years",
    années: "years",
    composers: "composers",
    compositeurs: "composers",
    works: "works",
    œuvres: "works",
    playlists: "playlists",
    dossiers: "folders",
    folders: "folders",
  };
  return values.map(v=>map[v] || v).filter(Boolean);
}

function filterTracks(tracks, parsed){
  const {filters, free} = parsed;
  return tracks.filter((t)=>(
    matchFilters(t, filters, {
      artist: t.artist,
      album: t.album,
      title: t.title,
      year: t.year,
    }) && matchFree([t.title, t.artist, t.album], free)
  ));
}

function filterAlbums(albums, parsed){
  const {filters, free} = parsed;
  return albums.filter((a)=>(
    matchFilters(a, filters, {
      artist: a.artist,
      album: a.title,
      title: a.title,
      year: a.year,
    }) && matchFree([a.title, a.artist, a.year], free)
  ));
}

function filterNameItems(items, parsed, field){
  const {filters, free} = parsed;
  return items.filter((it)=>(
    matchFilters(it, filters, {[field]: it.name}) && matchFree([it.name], free)
  ));
}

function filterCountItems(items, parsed, field){
  const {filters, free} = parsed;
  return items.filter((it)=>(
    matchFilters(it, filters, {[field]: it.name}) && matchFree([it.name], free)
  ));
}

function filterYearItems(items, parsed){
  const {filters, free} = parsed;
  return items.filter((it)=>(
    matchFilters(it, filters, {year: it.year}) && matchFree([String(it.year)], free)
  ));
}

function filterPlaylistItems(items, parsed){
  const {filters, free} = parsed;
  return items.filter((it)=>(
    matchFilters(it, filters, {playlist: it.name}) && matchFree([it.name], free)
  ));
}

function matchFilters(item, filters, map){
  for(const [key, vals] of Object.entries(filters || {})){
    if(key === "type") continue;
    const value = map[key];
    if(value == null) return false;
    if(!vals.every((v)=>matches(String(value), v))) return false;
  }
  return true;
}

function matchFree(values, terms){
  if(!terms.length) return true;
  return terms.every((t)=>values.some((v)=>matches(String(v || ""), t)));
}

function matches(hay, needle){
  if(!needle) return true;
  return String(hay || "").toLowerCase().includes(String(needle).toLowerCase());
}

function flattenArtistPaths(artist){
  const paths = [];
  (artist.albums || []).forEach((al)=>{
    (al.tracks || []).forEach((t)=>{
      if(t.path) paths.push(t.path);
    });
  });
  return paths;
}

function hydrateArtistCover(el, name){
  if(AppConfig.transport !== "rest" || !name) return;
  const url = new URL(`${AppConfig.restBaseUrl}/docs/artist/photo`, window.location.origin);
  url.searchParams.set("name", name);
  url.searchParams.set("size", "140");
  el.style.backgroundImage = `url("${url.toString()}")`;
  el.style.backgroundSize = "cover";
  el.style.backgroundPosition = "center";
}

function hydrateAlbumCover(el, artist, album){
  if(AppConfig.transport !== "rest" || !artist || !album) return;
  const url = new URL(`${AppConfig.restBaseUrl}/docs/album/art`, window.location.origin);
  url.searchParams.set("artist", artist);
  url.searchParams.set("album", album);
  url.searchParams.set("size", "140");
  el.style.backgroundImage = `url("${url.toString()}")`;
  el.style.backgroundSize = "cover";
  el.style.backgroundPosition = "center";
}
