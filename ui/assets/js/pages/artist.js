import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { el } from "../utils.js";
import { navigate } from "../router.js";
import { playPaths, showAddMenu } from "../services/library.js";

export async function render(root, params){
  const id = params.get("id") || "";
  const st = store.get();
  const artist = (st.library.artists || []).find(a=>String(a.id)===String(id));

  const page = el("div", { className: "page" }, [
    el("div", { className: "page__header" }, [
      el("button", { className: "chip", type: "button", onclick: ()=>navigate("music", new URLSearchParams({cat:"artists"})) }, ["← Artistes"]),
      el("div", { className: "page__title" }, [artist?.name || "Artiste"]),
      el("div", { className: "page__meta muted" }, [artist ? `${artist.albums.length} albums` : "—"]),
    ])
  ]);

  const body = el("div", { className: "page__body" });
  page.appendChild(body);

  if(!artist){
    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "empty muted" }, ["Artiste introuvable dans les données de démonstration."])
    ]));
    root.appendChild(page);
    return;
  }

  const [bioText, photoUrl, albumReviews] = await Promise.all([
    fetchArtistBio(artist.name),
    Promise.resolve(getArtistPhotoUrl(artist.name)),
    fetchAlbumReviews(artist.albums || []),
  ]);

  // Artist hero
  const hero = el("div", { className: "card" }, [
    el("div", { className: "artist-hero" }, [
      el("div", { className: "artist-hero__photo" }, [
        el("img", {
          className: "artist-hero__img",
          src: photoUrl,
          alt: "",
          loading: "lazy",
          decoding: "async",
          onerror: (ev)=>{ ev.currentTarget.closest(".artist-hero__photo")?.classList.add("is-missing"); }
        })
      ]),
      el("div", { className: "artist-hero__bio" }, [
        el("div", { className: "artist-hero__head" }, [
          el("div", { className: "strong" }, ["Biographie"]),
          el("div", { className: "action-row" }, [
            actionBtn("▶", "Lire l’artiste", async (ev)=>{
              ev.stopPropagation();
              await playPaths(flattenArtistPaths(artist));
            }),
            actionBtn("+", "Ajouter l’artiste", (ev)=>{
              ev.stopPropagation();
              showAddMenu(ev.currentTarget, {title: artist.name, paths: flattenArtistPaths(artist)});
            }),
          ])
        ]),
        el("div", { className: "muted small artist-hero__text" }, [bioText || "Aucune biographie disponible."])
      ])
    ])
  ]);
  body.appendChild(hero);

  // Albums
  body.appendChild(el("div", { className: "card" }, [
    el("div", { className: "card__title" }, ["Albums"]),
    st.ui.layout === "grid"
      ? renderAlbumGrid(artist.albums || [])
      : el("div", { className: "list" }, (artist.albums || []).map((al)=>{
          const row = el("div", { className: "media-row", role: "button", tabindex: "0" });
          row.addEventListener("click", ()=>navigate("album", new URLSearchParams({id: al.id})));
          row.addEventListener("keydown", (ev)=>{
            if(ev.key === "Enter") navigate("album", new URLSearchParams({id: al.id}));
          });
          const artUrl = getAlbumArtUrl(al.artist, al.title, 220);
          const review = albumReviews.get(al.title) || "";
          row.append(
            el("div", { className: "media-row__art" }, [
              el("img", {
                className: "media-row__img",
                src: artUrl,
                alt: "",
                loading: "lazy",
                decoding: "async",
                onerror: (ev)=>{ ev.currentTarget.classList.add("is-missing"); }
              })
            ]),
            el("div", { className: "media-row__body" }, [
              el("div", { className: "media-row__title ellipsis" }, [al.title]),
              el("div", { className: "muted small" }, [`${al.year} • ${al.tracks.length} titres`]),
              el("div", { className: "media-row__text muted small" }, [review || "Aucune critique disponible."])
            ]),
            el("div", { className: "media-row__actions" }, [
              actionBtn("▶", "Lire l’album", async (ev)=>{
                ev.stopPropagation();
                await playPaths((al.tracks || []).map(t=>t.path).filter(Boolean));
              }),
              actionBtn("+", "Ajouter l’album", (ev)=>{
                ev.stopPropagation();
                showAddMenu(ev.currentTarget, {title: al.title, paths: (al.tracks || []).map(t=>t.path).filter(Boolean)});
              }),
            ])
          );
          return row;
        }))
  ]));

  root.appendChild(page);
}

async function fetchArtistBio(name){
  if(AppConfig.transport !== "rest") return "";
  try {
    const url = new URL(`${AppConfig.restBaseUrl}/docs/artist/bio`, window.location.origin);
    url.searchParams.set("name", name);
    const res = await fetch(url.toString());
    if(!res.ok) return "";
    const body = await res.json();
    if(body?.ok && body.data?.text) return body.data.text;
  } catch {}
  return "";
}

function getArtistPhotoUrl(name){
  const url = new URL(`${AppConfig.restBaseUrl}/docs/artist/photo`, window.location.origin);
  url.searchParams.set("name", name);
  url.searchParams.set("size", "320");
  return url.toString();
}

function getAlbumArtUrl(artist, album, size){
  const url = new URL(`${AppConfig.restBaseUrl}/docs/album/art`, window.location.origin);
  url.searchParams.set("artist", artist || "");
  url.searchParams.set("album", album || "");
  if(size) url.searchParams.set("size", String(size));
  return url.toString();
}

async function fetchAlbumReviews(albums){
  const map = new Map();
  if(AppConfig.transport !== "rest") return map;
  await Promise.all((albums || []).map(async (al)=>{
    try {
      const url = new URL(`${AppConfig.restBaseUrl}/docs/album/review`, window.location.origin);
      url.searchParams.set("title", al.title);
      const res = await fetch(url.toString());
      if(!res.ok) return;
      const body = await res.json();
      if(body?.ok && body.data?.text){
        map.set(al.title, body.data.text);
      }
    } catch {}
  }));
  return map;
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

function renderAlbumGrid(albums){
  return el("div", { className: "gridlist" }, albums.map((al)=>{
    const paths = (al.tracks || []).map(t=>t.path).filter(Boolean);
    const tile = el("button", { className: "albumtile", type: "button" });
    tile.addEventListener("click", ()=>navigate("album", new URLSearchParams({id: al.id})));
    const cover = el("div", { className: "albumtile__cover" });
    const artUrl = getAlbumArtUrl(al.artist, al.title, 220);
    cover.style.backgroundImage = `url("${artUrl}")`;
    cover.style.backgroundSize = "cover";
    cover.style.backgroundPosition = "center";
    const actions = el("div", { className: "albumtile__actions" }, [
      actionBtn("▶", "Lire l’album", async (ev)=>{
        ev.stopPropagation();
        await playPaths(paths);
      }),
      actionBtn("+", "Ajouter l’album", (ev)=>{
        ev.stopPropagation();
        showAddMenu(ev.currentTarget, {title: al.title, paths});
      }),
    ]);
    tile.append(
      cover,
      actions,
      el("div", { className: "albumtile__title ellipsis" }, [al.title]),
      el("div", { className: "albumtile__sub ellipsis muted" }, [`${al.year} • ${al.tracks.length} titres`])
    );
    return tile;
  }));
}
