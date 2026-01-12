import { store } from "../store.js";
import { el } from "../utils.js";
import { navigate } from "../router.js";
import { playPaths, showAddMenu, playPlaylist, queuePlaylist } from "../services/library.js";

function row(icon, title, subtitle, onClick, trailing = "⋮"){
  const a = document.createElement("button");
  a.className = "row";
  a.type = "button";
  a.innerHTML = `
    <div class="row__icon" aria-hidden="true">${icon}</div>
    <div class="row__main">
      <div class="row__title ellipsis">${title}</div>
      ${subtitle ? `<div class="row__sub ellipsis muted">${subtitle}</div>` : ""}
    </div>
    <div class="row__trail" aria-hidden="true">${trailing}</div>
  `;
  a.addEventListener("click", onClick);
  return a;
}

function rowWithActions(icon, title, subtitle, onClick, actions){
  const wrap = document.createElement("div");
  wrap.className = "row row--actions";
  wrap.setAttribute("role", "button");
  wrap.setAttribute("tabindex", "0");
  wrap.innerHTML = `
    <div class="row__icon" aria-hidden="true">${icon}</div>
    <div class="row__main">
      <div class="row__title ellipsis">${title}</div>
      ${subtitle ? `<div class="row__sub ellipsis muted">${subtitle}</div>` : ""}
    </div>
  `;
  wrap.addEventListener("click", onClick);
  wrap.addEventListener("keydown", (ev)=>{
    if(ev.key === "Enter") onClick();
  });
  if(actions) wrap.append(actions);
  return wrap;
}

export async function render(root, params){
  const cat = params.get("cat") || "";
  const st = store.get();

  root.appendChild(el("div", { className: "page" }, [
    el("div", { className: "page__header" }, [
      el("div", { className: "page__title" }, ["Ma musique"]),
      el("div", { className: "page__meta muted" }, ["Parcourir la bibliothèque (UI only)"]),
    ]),
  ]));

  const page = root.querySelector(".page");
  const body = el("div", { className: "page__body" });
  page.appendChild(body);

  if(!cat){
    const categories = [
      { key: "artists",        icon: "👤", title: "Artistes" },
      { key: "albumartists",   icon: "👥", title: "Artistes d’album" },
      { key: "albums",         icon: "💿", title: "Albums" },
      { key: "genres",         icon: "🏷️", title: "Genres" },
      { key: "years",          icon: "📆", title: "Années" },
      { key: "composers",      icon: "🎼", title: "Compositeurs" },
      { key: "works",          icon: "📚", title: "Œuvres" },
      { key: "newmusic",       icon: "🆕", title: "Nouveautés" },
      { key: "randommix",      icon: "🔀", title: "Mix aléatoire" },
      { key: "playlists",      icon: "📋", title: "Playlists" },
      { key: "folder",         icon: "📁", title: "Dossier musique" },
    ];

    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "card__title" }, ["Catégories"]),
      el("div", { className: "list" }, categories.map(c =>
        row(c.icon, c.title, "", ()=>navigate("music", new URLSearchParams({cat: c.key})))
      ))
    ]));
    return;
  }

  // back chip
  const back = el("button", { className: "chip", type: "button" }, ["← Catégories"]);
  back.addEventListener("click", ()=>navigate("music"));
  body.appendChild(el("div", { className: "rowbar" }, [
    back,
    el("div", { className: "muted small" }, ["Astuce: sur mobile, glisse vers la gauche/droite pour changer de vue (parcours ↔ lecture ↔ file)"])
  ]));

  // category views
  if(cat === "artists" || cat === "albumartists"){
    const items = (cat === "albumartists" ? (st.library.albumartists || []) : (st.library.artists || [])).slice().sort((a,b)=>a.name.localeCompare(b.name));
    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "card__title" }, [cat === "artists" ? "Artistes" : "Artistes d’album"]),
      el("div", { className: "list" }, items.map(a =>{
        const paths = flattenArtistPaths(a);
        const actions = el("div", { className: "row__actions" }, [
          actionBtn("▶", "Lire l’artiste", async (ev)=>{
            ev.stopPropagation();
            await playPaths(paths);
          }),
          actionBtn("+", "Ajouter l’artiste", (ev)=>{
            ev.stopPropagation();
            showAddMenu(ev.currentTarget, {title: a.name, paths});
          }),
        ]);
        const r = rowWithActions("👤", a.name, `${a.albums.length} albums`, ()=>navigate("artist", new URLSearchParams({id: a.id})), actions);
        return r;
      }))
    ]));
    return;
  }

  if(cat === "albums"){
    const albums = (st.library.albums || []).slice().sort((a,b)=>a.title.localeCompare(b.title));
    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "card__title" }, ["Albums"]),
      el("div", { className: "list" }, albums.map(al =>{
        const paths = (al.tracks || []).map(t=>t.path).filter(Boolean);
        const actions = el("div", { className: "row__actions" }, [
          actionBtn("▶", "Lire l’album", async (ev)=>{
            ev.stopPropagation();
            await playPaths(paths);
          }),
          actionBtn("+", "Ajouter l’album", (ev)=>{
            ev.stopPropagation();
            showAddMenu(ev.currentTarget, {title: al.title, paths});
          }),
        ]);
        const r = rowWithActions("💿", al.title, `${al.artist} • ${al.year}`, ()=>navigate("album", new URLSearchParams({id: al.id})), actions);
        return r;
      }))
    ]));
    return;
  }

  if(cat === "genres"){
    const genres = (st.library.genres || []).slice().sort((a,b)=>a.name.localeCompare(b.name));
    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "card__title" }, ["Genres"]),
      el("div", { className: "list" }, genres.map(g =>
        row("🏷️", g.name, `${g.count} titres`, ()=>navigate("search", new URLSearchParams({q: g.name})))
      ))
    ]));
    return;
  }

  if(cat === "years"){
    const years = (st.library.years || []).slice().sort((a,b)=>b.year-a.year);
    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "card__title" }, ["Années"]),
      el("div", { className: "list" }, years.map(y =>
        row("📆", String(y.year), `${y.count} titres`, ()=>navigate("search", new URLSearchParams({q: String(y.year)})))
      ))
    ]));
    return;
  }

  if(cat === "composers"){
    const items = (st.library.composers || []).slice().sort((a,b)=>a.name.localeCompare(b.name));
    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "card__title" }, ["Compositeurs"]),
      el("div", { className: "list" }, items.map(c =>
        row("🎼", c.name, `${c.count} titres`, ()=>navigate("search", new URLSearchParams({q: c.name})))
      ))
    ]));
    return;
  }

  if(cat === "works"){
    const items = (st.library.works || []).slice().sort((a,b)=>a.name.localeCompare(b.name));
    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "card__title" }, ["Œuvres"]),
      el("div", { className: "list" }, items.map(w =>
        row("📚", w.name, `${w.count} titres`, ()=>navigate("search", new URLSearchParams({q: w.name})))
      ))
    ]));
    return;
  }

  if(cat === "newmusic"){
    const items = (st.library.newmusic || []).slice();
    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "card__title" }, ["Nouveautés"]),
      el("div", { className: "list" }, items.map(al =>{
        const paths = (al.tracks || []).map(t=>t.path).filter(Boolean);
        const actions = el("div", { className: "row__actions" }, [
          actionBtn("▶", "Lire l’album", async (ev)=>{
            ev.stopPropagation();
            await playPaths(paths);
          }),
          actionBtn("+", "Ajouter l’album", (ev)=>{
            ev.stopPropagation();
            showAddMenu(ev.currentTarget, {title: al.title, paths});
          }),
        ]);
        return rowWithActions("🆕", al.title, `${al.artist} • ${al.year}`, ()=>navigate("album", new URLSearchParams({id: al.id})), actions);
      }))
    ]));
    return;
  }

  if(cat === "randommix"){
    const items = (st.library.randommix || []).slice();
    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "card__title" }, ["Mix aléatoire"]),
      el("div", { className: "list" }, items.map((t, idx)=>{
        const actions = el("div", { className: "row__actions" }, [
          actionBtn("▶", "Lire la piste", async (ev)=>{
            ev.stopPropagation();
            await playPaths([t.path].filter(Boolean));
          }),
          actionBtn("+", "Ajouter la piste", (ev)=>{
            ev.stopPropagation();
            showAddMenu(ev.currentTarget, {title: t.title, paths: [t.path].filter(Boolean)});
          }),
        ]);
        return rowWithActions("🔀", t.title || "—", `${t.artist || "—"} • ${t.album || "—"}`, ()=>{}, actions);
      }))
    ]));
    return;
  }

  if(cat === "playlists"){
    const items = (st.library.playlists || []).slice();
    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "card__title" }, ["Playlists"]),
      el("div", { className: "list" }, items.map(pl =>{
        const actions = el("div", { className: "row__actions" }, [
          actionBtn("▶", "Lire la playlist", async (ev)=>{
            ev.stopPropagation();
            await playPlaylist(pl.name);
          }),
          actionBtn("+", "Ajouter la playlist", async (ev)=>{
            ev.stopPropagation();
            await queuePlaylist(pl.name);
          }),
        ]);
        return rowWithActions("📋", pl.name, `${pl.tracks} titres`, ()=>{}, actions);
      }))
    ]));
    return;
  }

  if(cat === "folder"){
    const items = (st.library.folders || []).slice().sort((a,b)=>a.name.localeCompare(b.name));
    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "card__title" }, ["Dossier musique"]),
      el("div", { className: "list" }, items.map(f =>
        row("📁", f.name, `${f.count} titres`, ()=>navigate("search", new URLSearchParams({q: f.name})))
      ))
    ]));
    return;
  }

  // Placeholder categories
  const placeholderTitle = {
    composers: "Compositeurs",
    works: "Œuvres",
    newmusic: "Nouveautés",
    randommix: "Mix aléatoire",
    playlists: "Playlists",
    folder: "Dossier musique",
  }[cat] || "Liste";

  body.appendChild(el("div", { className: "card" }, [
    el("div", { className: "card__title" }, [placeholderTitle]),
    el("div", { className: "empty muted" }, [
      "UI prête — cette section sera branchée plus tard sur les sources (MPD + services du progiciel).",
    ])
  ]));
}

function flattenArtistPaths(artist){
  const paths = [];
  for(const al of (artist.albums || [])){
    for(const t of (al.tracks || [])){
      if(t.path) paths.push(t.path);
    }
  }
  return paths;
}

function actionBtn(label, title, onClick){
  const btn = el("button", { className: "icon-btn", type: "button", title, "aria-label": title });
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}
