import { clamp } from "./utils.js";

/** Tiny state store (observable) */
export const store = (() => {
  const state = {
    route: "home",
    query: "",
    nav: {
      subroute: "",
      parts: ["home"],
    },
    ui: {
      theme: localStorage.getItem("toune.theme") || "dark", // "dark" | "light"
      layout: localStorage.getItem("toune.layout") || "list", // "list" | "grid"
      drawerOpen: false,
      queueOpen: false,
    },
    player: {
      connected: false,
      name: "Meuble Stéréo TouNe-O-Matic",
      volume: 29,
      state: "pause", // "play" | "pause" | "stop"
      repeat: "off", // "off" | "one" | "all"
      random: false,
      elapsed: 0,
      duration: 0,
      track: null,
      queue: [],
      index: -1,
    },
    library: {
      artists: [],
      albums: [],
      genres: [],
      years: [],
      playlists: [],
      radios: [],
      favourites: [],
      apps: [],
    }
  };

  const subs = new Set();
  function set(patch){
    deepMerge(state, patch);
    subs.forEach(fn=>fn(state));
  }
  function get(){ return state; }
  function subscribe(fn){ subs.add(fn); return ()=>subs.delete(fn); }

  function deepMerge(dst, patch){
    for(const [k,v] of Object.entries(patch || {})){
      if(v && typeof v === "object" && !Array.isArray(v) && dst[k] && typeof dst[k] === "object" && !Array.isArray(dst[k])){
        deepMerge(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
  }

  // helpers
  function setTheme(theme){
    theme = (theme === "light") ? "light" : "dark";
    localStorage.setItem("toune.theme", theme);
    set({ui:{theme}});
  }

  function setLayout(layout){
    layout = (layout === "grid") ? "grid" : "list";
    localStorage.setItem("toune.layout", layout);
    set({ui:{layout}});
  }

  function setVolume(vol){
    vol = clamp(vol, 0, 100);
    set({player:{volume: vol}});
  }

  return { set, get, subscribe, setTheme, setLayout, setVolume };
})();
