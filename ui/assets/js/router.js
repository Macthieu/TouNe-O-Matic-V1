import { store } from "./store.js";
import { $ } from "./utils.js";

export const routes = new Map(); // route -> {title, render}
export function registerRoute(name, cfg){ routes.set(name, cfg); }

export function parseHash(){
  const hash = (location.hash || "#/home").replace(/^#\/?/, "");
  const [path, qs] = hash.split("?");
  const parts = (path || "home").split("/").filter(Boolean);
  const route = parts[0] || "home";
  const subroute = parts.slice(1).join("/") || "";
  const params = new URLSearchParams(qs || "");
  return { route, subroute, parts, params };
}

export async function navigate(route, params){
  const qs = params ? `?${params.toString()}` : "";
  location.hash = `#/${route}${qs}`;
}

export async function renderRoute(){
  const { route, subroute, parts, params } = parseHash();
  const cfg = routes.get(route) || routes.get("home");
  store.set({ route, query: params.get("q") || "", nav: { subroute, parts } });

  document.title = `TouNe • ${cfg?.title || "Accueil"}`;
  const titleEl = $("#appTitle");
  if(titleEl) titleEl.textContent = cfg?.title || "Accueil";

  const view = $("#view");
  if(!view) return;
  view.className = "view";

  // remove focus from previous element
  const content = $("#content");
  if(content) content.focus({preventScroll:true});

  // render
  view.innerHTML = "";
  await cfg?.render?.(view, params, { route, subroute, parts });
}
