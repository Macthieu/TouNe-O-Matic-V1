import { AppConfig } from "../config.js";
import { store } from "../store.js";
import { el, formatTime } from "../utils.js";
import { navigate } from "../router.js";
import { playPaths, showAddMenu } from "../services/library.js";

export async function render(root, params){
  const id = params.get("id") || "";
  const st = store.get();
  const album = (st.library.albums || []).find(a=>String(a.id)===String(id));

  const page = el("div", { className: "page" }, [
    el("div", { className: "page__header" }, [
      el("button", { className: "chip", type: "button", onclick: ()=>navigate("music", new URLSearchParams({cat:"albums"})) }, ["← Albums"]),
      el("div", { className: "page__title" }, [album?.title || "Album"]),
      el("div", { className: "page__meta muted" }, [album ? `${album.artist} • ${album.year}` : "—"]),
    ]),
  ]);

  const body = el("div", { className: "page__body" });
  page.appendChild(body);

  if(!album){
    body.appendChild(el("div", { className: "card" }, [
      el("div", { className: "empty muted" }, ["Album introuvable dans les données de démonstration."])
    ]));
    root.appendChild(page);
    return;
  }

  const [reviewText, artUrl] = await Promise.all([
    fetchAlbumReview(album.title),
    Promise.resolve(getAlbumArtUrl(album.artist, album.title, 420)),
  ]);

  body.appendChild(el("div", { className: "card" }, [
    el("div", { className: "album-hero" }, [
      el("div", { className: "album-hero__art" }, [
        el("img", {
          className: "album-hero__img",
          src: artUrl,
          alt: "",
          loading: "lazy",
          decoding: "async",
          onerror: (ev)=>{ ev.currentTarget.classList.add("is-missing"); }
        })
      ]),
      el("div", { className: "album-hero__body" }, [
        el("div", { className: "album-hero__head" }, [
          el("div", { className: "strong" }, ["Histoire et critique de l’album"]),
          el("div", { className: "action-row" }, [
            actionBtn("▶", "Lire l’album", async (ev)=>{
              ev.stopPropagation();
              await playPaths((album.tracks || []).map(t=>t.path).filter(Boolean));
            }),
            actionBtn("+", "Ajouter l’album", (ev)=>{
              ev.stopPropagation();
              showAddMenu(ev.currentTarget, {title: album.title, paths: (album.tracks || []).map(t=>t.path).filter(Boolean)});
            }),
          ])
        ]),
        el("div", { className: "muted small album-hero__text" }, [reviewText || "Aucune critique disponible."])
      ])
    ])
  ]));

  // Track list
  const total = (album.tracks || []).reduce((acc,t)=>acc + (t.duration||0), 0);
  body.appendChild(el("div", { className: "card" }, [
    el("div", { className: "card__title" }, ["Pistes"]),
    el("div", { className: "muted small", style: "margin:-4px 0 10px" }, [`${album.tracks.length} pistes • ${formatTime(total)}`]),
    el("div", { className: "list" }, (album.tracks || []).map((t, idx)=>{
      const row = el("div", { className: "track-row" });
      row.append(
        el("div", { className: "track-row__num", "aria-hidden": "true" }, [String(idx+1)]),
        el("div", { className: "track-row__main" }, [
          el("div", { className: "ellipsis strong" }, [t.title]),
          el("div", { className: "ellipsis muted small" }, [t.artist || album.artist]),
        ]),
        el("div", { className: "track-row__meta muted" }, [formatTime(t.duration || 0)]),
        el("div", { className: "track-row__actions" }, [
          actionBtn("▶", "Lire la piste", async (ev)=>{
            ev.stopPropagation();
            await playPaths([t.path].filter(Boolean));
          }),
          actionBtn("+", "Ajouter la piste", (ev)=>{
            ev.stopPropagation();
            showAddMenu(ev.currentTarget, {title: t.title, paths: [t.path].filter(Boolean)});
          }),
        ])
      );
      return row;
    }))
  ]));

  root.appendChild(page);
}

async function fetchAlbumReview(title){
  if(AppConfig.transport !== "rest") return "";
  try {
    const url = new URL(`${AppConfig.restBaseUrl}/docs/album/review`, window.location.origin);
    url.searchParams.set("title", title);
    const res = await fetch(url.toString());
    if(!res.ok) return "";
    const body = await res.json();
    if(body?.ok && body.data?.text) return body.data.text;
  } catch {}
  return "";
}

function getAlbumArtUrl(artist, album, size){
  const url = new URL(`${AppConfig.restBaseUrl}/docs/album/art`, window.location.origin);
  url.searchParams.set("artist", artist || "");
  url.searchParams.set("album", album || "");
  if(size) url.searchParams.set("size", String(size));
  return url.toString();
}

function actionBtn(label, title, onClick){
  const btn = el("button", { className: "icon-btn", type: "button", title, "aria-label": title });
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}
