import { card, listRow, coverEl } from "../components/ui.js";
import { AppConfig } from "../config.js";

export async function render(root, params){
  const q = (params.get("q") || "").trim();
  const c = card({ title:"Recherche", subtitle: q ? `Résultats pour “${q}”` : "Tape quelque chose dans la barre de recherche." });

  if(!q){
    c.body.innerHTML = '<div class="muted">Aucun terme de recherche.</div>';
    root.append(c.root);
    return;
  }

  const res = await fetchResults(q);

  const list = document.createElement("div");
  list.className = "list";
  if(!res.length){
    list.innerHTML = '<div class="muted">Aucun résultat.</div>';
  } else {
    for(const t of res){
      list.append(listRow({
        title: t.title || "—",
        subtitle: `${t.artist || "—"} • ${t.album || "—"}`,
        left: coverEl("sm", t.title),
      }));
    }
  }

  c.body.append(list);
  root.append(c.root);
}

async function fetchResults(q){
  if(AppConfig.transport !== "rest") return [];
  try {
    const url = new URL(`${AppConfig.restBaseUrl}/library/search`, window.location.origin);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "60");
    const res = await fetch(url.toString());
    const body = await res.json();
    if(body?.ok && Array.isArray(body.data)) return body.data;
  } catch {
    // fall through
  }
  return [];
}
