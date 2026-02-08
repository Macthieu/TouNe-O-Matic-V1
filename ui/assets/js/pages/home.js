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
  const isPhone = window.matchMedia("(max-width: 760px)").matches;
  const isTablet = !isPhone && window.matchMedia("(max-width: 1180px)").matches;

  const page = el("div", { className: "page" }, [
    el("div", { className: "page__header" }, [
      el("div", { className: "page__title" }, ["Music sources"]),
      el("div", { className: "page__meta muted" }, ["Accueil style Material (UI only)"]),
    ]),
  ]);

  const body = el("div", { className: "page__body" });
  page.appendChild(body);

  const pinItems = [
    tile("👤", "Artists", () => navigate("music", new URLSearchParams({cat:"artists"}))),
    tile("🆕", "New Music", () => navigate("music", new URLSearchParams({cat:"newmusic"}))),
    tile("🟢", "Spotty", () => navigate("apps")),
    tile("📻", "Radio", () => navigate("radio")),
    tile("⭐", "Favourites", () => navigate("favourites")),
    tile("🧩", "Apps", () => navigate("apps")),
  ];
  const visiblePins = isPhone ? pinItems.slice(0, 4) : isTablet ? pinItems.slice(0, 6) : pinItems;

  // Pinned tiles (desktop screenshot vibe)
  body.appendChild(el("div", { className: "card" }, [
    el("div", { className: "card__title" }, ["Épingles"]),
    el("div", { className: "tilegrid" }, visiblePins)
  ]));

  // Quick browse
  const recentLimit = isPhone ? 4 : isTablet ? 6 : 8;
  const recentAlbums = (st.library.newmusic || st.library.albums || []).slice(0, recentLimit);
  body.appendChild(el("div", { className: "card" }, [
    el("div", { className: "card__title" }, ["Récents"]),
    el("div", { className: "hscroll hscroll--home" }, recentAlbums.map(a=>
      el("button", { className: "albumcard", type: "button", onclick: ()=>navigate("album", new URLSearchParams({id:a.id})) }, [
        el("div", { className: "cover", style: coverStyle(a) }, []),
        el("div", { className: "albumcard__title ellipsis" }, [a.title]),
        el("div", { className: "albumcard__sub ellipsis muted" }, [a.artist]),
      ])
    ))
  ]));

  // Hint
  body.appendChild(el("div", { className: "hint muted" }, [
    "Mobile/Tablette: utilise les onglets en haut, et glisse ↔ entre Lecture et File.",
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
