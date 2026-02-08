import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { el } from "../utils.js";
import { navigate } from "../router.js";

function tile(icon, label, onClick){
  const t = el("button", { className: "tile", type: "button" }, [
    el("div", { className: "tile__icon", "aria-hidden": "true" }, [icon]),
    el("div", { className: "tile__label" }, [label]),
  ]);
  t.addEventListener("click", onClick);
  return t;
}

export async function render(root){
  const st = store.get();

  const page = el("div", { className: "page" }, [
    el("div", { className: "page__header" }, [
      el("div", { className: "page__title" }, ["Music sources"]),
      el("div", { className: "page__meta muted" }, ["Accueil style Material (UI only)"]),
    ]),
  ]);

  const body = el("div", { className: "page__body" });
  page.appendChild(body);

  // Pinned tiles (desktop screenshot vibe)
  body.appendChild(el("div", { className: "card" }, [
    el("div", { className: "card__title" }, ["Épingles"]),
    el("div", { className: "tilegrid" }, [
      tile("👤", "Artists", () => navigate("music", new URLSearchParams({cat:"artists"}))),
      tile("🆕", "New Music", () => navigate("music", new URLSearchParams({cat:"newmusic"}))),
      tile("🟢", "Spotty", () => navigate("apps")),
      tile("📻", "Radio", () => navigate("radio")),
      tile("⭐", "Favourites", () => navigate("favourites")),
      tile("🧩", "Apps", () => navigate("apps")),
    ])
  ]));

  // Quick browse
  const recentAlbums = (st.library.newmusic || st.library.albums || []).slice(0, 8);
  body.appendChild(el("div", { className: "card" }, [
    el("div", { className: "card__title" }, ["Récents"]),
    el("div", { className: "hscroll" }, recentAlbums.map(a=>
      el("button", { className: "albumcard", type: "button", onclick: ()=>navigate("album", new URLSearchParams({id:a.id})) }, [
        el("div", { className: "cover", style: coverStyle(a) }, []),
        el("div", { className: "albumcard__title ellipsis" }, [a.title]),
        el("div", { className: "albumcard__sub ellipsis muted" }, [a.artist]),
      ])
    ))
  ]));

  // Hint
  body.appendChild(el("div", { className: "hint muted" }, [
    "Mobile: glisse ↔ pour changer de vue (Parcourir ↔ Lecture ↔ File).",
  ]));

  root.appendChild(page);
}

function coverStyle(album){
  if(!album?.artist || !album?.title) return "";
  const url = new URL(`${AppConfig.restBaseUrl}/docs/album/art`, window.location.origin);
  url.searchParams.set("artist", album.artist);
  url.searchParams.set("album", album.title);
  url.searchParams.set("size", "200");
  return `background-image:url("${url.toString()}");background-size:cover;background-position:center;`;
}
