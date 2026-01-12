export const $ = (sel, root=document) => root.querySelector(sel);
export const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

/** Create DOM element quickly */
export function el(tag, attrs = {}, children = []){
  const node = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs || {})){
    if(k === "class" || k === "className") node.className = String(v);
    else if(k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if(v === true) node.setAttribute(k, "");
    else if(v !== false && v != null) node.setAttribute(k, String(v));
  }
  for(const ch of (children || [])){
    if(ch == null) continue;
    node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
  }
  return node;
}

export function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

export function formatTime(sec){
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2,"0")}`;
}

export function escapeHtml(str=""){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function toast(message, ms=2200){
  const el = document.getElementById("toast");
  if(!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ el.hidden = true; }, ms);
}

export function onOutsideClick(targetEl, closeFn){
  const handler = (ev)=>{
    if(!targetEl.hidden && !targetEl.contains(ev.target)){
      closeFn();
    }
  };
  setTimeout(()=>document.addEventListener("pointerdown", handler, {capture:true}), 0);
  return ()=>document.removeEventListener("pointerdown", handler, {capture:true});
}
