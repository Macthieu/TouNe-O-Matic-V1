import { $, $$, escapeHtml } from "../utils.js";

export function h(tag, attrs={}, children=[]){
  const el = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs || {})){
    if(k === "class") el.className = v;
    else if(k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if(v === true) el.setAttribute(k, "");
    else if(v === false || v == null) {}
    else el.setAttribute(k, String(v));
  }
  for(const c of (Array.isArray(children) ? children : [children])){
    if(c == null) continue;
    if(typeof c === "string") el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}

export function card({title, subtitle, actions=[]} = {}){
  const root = h("section", {class:"card"});
  const head = h("div", {class:"card__head"}, [
    h("div", {}, [
      h("div", {class:"card__title"}, title || ""),
      subtitle ? h("div", {class:"card__sub"}, subtitle) : null,
    ]),
    h("div", {class:"actions"}, actions),
  ]);
  const body = h("div", {class:"card__body"});
  root.append(head, body);
  return { root, body };
}

export function listRow({title, subtitle, left=null, right=null, onClick=null, draggable=false, data=null} = {}){
  const row = h("div", {class:"row", ...(draggable?{draggable:true}:{})});
  if(data) row.dataset.payload = JSON.stringify(data);
  if(left) row.append(left);
  const grow = h("div", {class:"row__grow"}, [
    h("div", {class:"ellipsis strong"}, title || ""),
    subtitle ? h("div", {class:"ellipsis muted small"}, subtitle) : null,
  ]);
  row.append(grow);
  if(right) row.append(right);
  if(onClick) row.addEventListener("click", onClick);
  return row;
}

export function coverEl(size="md", label=""){
  const el = h("div", {class:`cover cover--${size}`, role:"img", "aria-label": label});
  return el;
}

export function pill(text){
  return h("span", {class:"pill"}, text);
}

export function button(label, {kind="default", onClick=null, disabled=false}={}){
  const cls = kind === "primary" ? "btn primary" : kind === "danger" ? "btn danger" : "btn";
  return h("button", {class:cls, type:"button", onclick:onClick, disabled}, label);
}

export function chip(label, {onClick=null}={}){
  return h("button", {class:"chip", type:"button", onclick:onClick}, label);
}

export function emptyState(title, subtitle){
  return h("div", {class:"card__body"}, [
    h("div", {class:"strong"}, title),
    h("div", {class:"muted"}, subtitle || ""),
  ]);
}
