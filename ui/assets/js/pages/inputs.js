import { card, listRow, pill, button } from "../components/ui.js";

function iconEl(emoji, label){
  const el = document.createElement("div");
  el.className = "row__icon";
  el.textContent = emoji;
  if(label) el.setAttribute("aria-label", label);
  return el;
}

function plannedPill(){
  const el = pill("Futur");
  el.classList.add("pill--soon");
  return el;
}

export async function render(root){
  const STORAGE_KEY = "toune.inputs.v1";
  const ROUTE_KEY = "toune.inputs.routes.v1";
  const defaults = {
    analog: [
      {icon:"🎚️", title:"Ligne RCA (stéréo)", sub:"Lecteurs CD/DVD/BluRay/HD-DVD"},
      {icon:"🎛️", title:"Ligne XLR (symétrique)", sub:"Préamplis / console studio"},
      {icon:"🎙️", title:"Mic (XLR) + alim fantôme", sub:"Micros studio"},
      {icon:"📼", title:"Bande magnétique", sub:"Réel à réel / cassette"},
      {icon:"📀", title:"Toune Disc / 4 track / 8 track", sub:"Entrées multi-pistes"},
      {icon:"📺", title:"Télé / Aux", sub:"Sources externes diverses"},
    ],
    digital: [
      {icon:"🔌", title:"USB audio", sub:"Interfaces et convertisseurs"},
      {icon:"🧩", title:"S/PDIF coax/optique", sub:"Lecteurs numériques"},
      {icon:"🎥", title:"HDMI ARC/eARC", sub:"Télé et consoles"},
      {icon:"🧠", title:"AES/EBU", sub:"Matériel pro"},
    ],
    control: [
      {icon:"⚡", title:"Relais electromechaniques", sub:"Commutation des sources"},
      {icon:"🧪", title:"Preamp et ampli a tubes", sub:"Telemetrie et protection"},
      {icon:"🧭", title:"Scenes / presets", sub:"Routage et gains memorises"},
    ],
  };
  const outputs = [
    {id:"dac", label:"DAC analogique"},
    {id:"snapcast", label:"Snapcast"},
    {id:"beats", label:"Beats Solo 4"},
    {id:"airplay", label:"AirPlay / Mac"},
  ];

  let editMode = false;
  let data = loadEntries();
  let routes = loadRoutes();

  function loadEntries(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        analog: Array.isArray(parsed?.analog) ? parsed.analog : [],
        digital: Array.isArray(parsed?.digital) ? parsed.digital : [],
        control: Array.isArray(parsed?.control) ? parsed.control : [],
      };
    } catch {
      return {analog: [], digital: [], control: []};
    }
  }

  function loadRoutes(){
    try {
      const raw = localStorage.getItem(ROUTE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveEntries(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function saveRoutes(){
    localStorage.setItem(ROUTE_KEY, JSON.stringify(routes));
  }

  function slugify(text){
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function getAllInputs(){
    const list = [];
    defaults.analog.forEach((row)=>list.push({id:`analog-${slugify(row.title)}`, label: row.title, kind:"analog"}));
    defaults.digital.forEach((row)=>list.push({id:`digital-${slugify(row.title)}`, label: row.title, kind:"digital"}));
    defaults.control.forEach((row)=>list.push({id:`control-${slugify(row.title)}`, label: row.title, kind:"control"}));
    data.analog.forEach((row)=>list.push({id:`custom-analog-${slugify(row.name)}`, label: row.name, kind:"analog"}));
    data.digital.forEach((row)=>list.push({id:`custom-digital-${slugify(row.name)}`, label: row.name, kind:"digital"}));
    data.control.forEach((row)=>list.push({id:`custom-control-${slugify(row.name)}`, label: row.name, kind:"control"}));
    return list;
  }

  function toggleRoute(inputId, outputId){
    const key = `${inputId}:${outputId}`;
    routes[key] = !routes[key];
    saveRoutes();
  }

  function exportConfig(){
    const payload = {
      version: 1,
      entries: data,
      routes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "toune-inputs.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importConfig(file){
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try {
        const payload = JSON.parse(reader.result);
        if(payload?.entries){
          data = {
            analog: Array.isArray(payload.entries.analog) ? payload.entries.analog : [],
            digital: Array.isArray(payload.entries.digital) ? payload.entries.digital : [],
            control: Array.isArray(payload.entries.control) ? payload.entries.control : [],
          };
          saveEntries();
        }
        if(payload?.routes && typeof payload.routes === "object"){
          routes = payload.routes || {};
          saveRoutes();
        }
        renderPage();
      } catch {
        // ignore invalid file
      }
    };
    reader.readAsText(file);
  }

  function renderSection(key, title, subtitle){
    const section = card({ title, subtitle });
    const list = document.createElement("div");
    list.className = "list";
    list.style.marginTop = "10px";

    defaults[key].forEach((row)=>{
      list.append(listRow({
        title: row.title,
        subtitle: row.sub,
        left: iconEl(row.icon, row.title),
        right: plannedPill(),
      }));
    });

    if(editMode){
      const form = document.createElement("div");
      form.className = "entry-form";
      const nameInput = document.createElement("input");
      nameInput.className = "input";
      nameInput.placeholder = "Nom de l'entree";
      const typeInput = document.createElement("input");
      typeInput.className = "input";
      typeInput.placeholder = "Type / signal";
      const noteInput = document.createElement("input");
      noteInput.className = "input";
      noteInput.placeholder = "Notes (optionnel)";
      const addBtn = button("Ajouter", {
        onClick: ()=>{
          const name = (nameInput.value || "").trim();
          if(!name) return;
          data[key].push({
            name,
            type: (typeInput.value || "").trim(),
            note: (noteInput.value || "").trim(),
          });
          saveEntries();
          renderPage();
        }
      });
      form.append(nameInput, typeInput, noteInput, addBtn);
      section.body.append(form);

      if(data[key].length){
        const editList = document.createElement("div");
        editList.className = "entry-edit-list";
        data[key].forEach((entry, idx)=>{
          const row = document.createElement("div");
          row.className = "entry-edit";
          const name = document.createElement("input");
          name.className = "input";
          name.value = entry.name || "";
          const type = document.createElement("input");
          type.className = "input";
          type.value = entry.type || "";
          const note = document.createElement("input");
          note.className = "input";
          note.value = entry.note || "";
          const saveBtn = button("Sauver", {
            onClick: ()=>{
              data[key][idx] = {
                name: (name.value || "").trim(),
                type: (type.value || "").trim(),
                note: (note.value || "").trim(),
              };
              saveEntries();
              renderPage();
            }
          });
          const delBtn = button("Supprimer", {
            onClick: ()=>{
              data[key].splice(idx, 1);
              saveEntries();
              renderPage();
            }
          });
          row.append(name, type, note, saveBtn, delBtn);
          editList.append(row);
        });
        section.body.append(editList);
      }
    } else if(data[key].length){
      data[key].forEach((entry)=>{
        const icon = key === "analog" ? "🎚️" : key === "digital" ? "🔌" : "⚡";
        const sub = [entry.type, entry.note].filter(Boolean).join(" • ");
        list.append(listRow({
          title: entry.name || "Entree personnalisee",
          subtitle: sub || "Entree personnalisee",
          left: iconEl(icon, entry.name || "Entree"),
          right: pill("Perso"),
        }));
      });
    }

    section.body.append(list);
    return section;
  }

  function renderMatrix(){
    const matrix = card({ title: "Matrice de routage", subtitle: "Entrées ↔ sorties" });
    const wrap = document.createElement("div");
    wrap.className = "matrix";
    const head = document.createElement("div");
    head.className = "matrix__head";
    head.append(document.createElement("div"));
    outputs.forEach((out)=>{
      const cell = document.createElement("div");
      cell.className = "matrix__cell matrix__cell--head";
      cell.textContent = out.label;
      head.append(cell);
    });
    wrap.append(head);

    getAllInputs().forEach((input)=>{
      const row = document.createElement("div");
      row.className = "matrix__row";
      const label = document.createElement("div");
      label.className = "matrix__cell matrix__cell--label";
      label.textContent = input.label || "Entree";
      row.append(label);
      outputs.forEach((out)=>{
        const key = `${input.id}:${out.id}`;
        const on = !!routes[key];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `matrix__toggle${on ? " is-on" : ""}`;
        btn.textContent = on ? "ON" : "OFF";
        btn.addEventListener("click", ()=>{
          toggleRoute(input.id, out.id);
          btn.classList.toggle("is-on");
          btn.textContent = btn.classList.contains("is-on") ? "ON" : "OFF";
        });
        const cell = document.createElement("div");
        cell.className = "matrix__cell";
        cell.append(btn);
        row.append(cell);
      });
      wrap.append(row);
    });

    matrix.body.append(wrap);
    return matrix;
  }

  function renderDiagram(){
    const diagram = card({ title: "Schema de routage", subtitle: "Apercu du signal" });
    const wrap = document.createElement("div");
    wrap.className = "signal-map";
    const row1 = document.createElement("div");
    row1.className = "signal-row";
    row1.innerHTML = `
      <span class="signal-node">Entrees</span>
      <span class="signal-arrow">→</span>
      <span class="signal-node">Preamplis</span>
      <span class="signal-arrow">→</span>
      <span class="signal-node">Ampli a tubes</span>
      <span class="signal-arrow">→</span>
      <span class="signal-node">Matrice / Mix</span>
      <span class="signal-arrow">→</span>
      <span class="signal-node">Sorties</span>
    `;
    const row2 = document.createElement("div");
    row2.className = "signal-row";
    row2.innerHTML = `
      <span class="signal-sub">Arduino + GPIO • relais • scenes • telemetrie</span>
    `;
    wrap.append(row1, row2);
    diagram.body.append(wrap);
    return diagram;
  }

  function renderPage(){
    root.innerHTML = "";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json";
    fileInput.className = "input--file";
    fileInput.addEventListener("change", (ev)=>{
      const file = ev.target.files?.[0];
      importConfig(file);
      fileInput.value = "";
    });

    const summary = card({
      title: "Entrées",
      subtitle: "Console d'enregistrement (plan)",
      actions: [
        button("Importer", {
          onClick: ()=>fileInput.click(),
        }),
        button("Exporter", {
          onClick: exportConfig,
        }),
        button(editMode ? "Terminer" : "Mode edition", {
          onClick: ()=>{
            editMode = !editMode;
            renderPage();
          }
        })
      ],
    });
    summary.body.innerHTML = `
      <div class="muted">
        Objectif : gérer des entrées analogiques et numériques avec préamplis/amplis à tube,
        automatisation Arduino et commandes GPIO. Les sources seront ajoutées au fil des ans.
      </div>
    `;
    if(editMode){
      const note = document.createElement("div");
      note.className = "muted small";
      note.style.marginTop = "8px";
      note.textContent = "Mode edition actif : ajoute et renomme tes futures entrees.";
      summary.body.append(note);
    }

    const analog = renderSection("analog", "Entrées analogiques", "Préamplis + routing");
    const digital = renderSection("digital", "Entrées numériques", "Synchronisation + conversion");
    const control = renderSection("control", "Automation & controle", "Arduino + GPIO");
    const matrix = renderMatrix();
    const diagram = renderDiagram();

    root.append(summary.root, analog.root, digital.root, control.root, matrix.root, diagram.root, fileInput);
  }

  renderPage();
}
