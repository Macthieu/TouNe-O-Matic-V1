import { card, pill, button } from "../components/ui.js";
import { toast } from "../utils.js";

export async function render(root){
  const c = card({ title:"À propos", subtitle:"TouNe Material GUI (UI only)" });

  c.body.innerHTML = `
    <div class="muted">
      Cette interface est une base “from scratch” inspirée par le style et les parcours d’un WebGUI Material pour serveurs musicaux.
      Elle est prévue pour être branchée plus tard sur un backend (MPD, etc.).
    </div>

    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px">
      <span class="pill">SPA • Hash routing</span>
      <span class="pill">Vanilla JS</span>
      <span class="pill">Responsive</span>
      <span class="pill">Mock data</span>
    </div>

    <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap">
      <button class="btn" id="btnDiag">Diagnostic UI</button>
      <button class="btn" id="btnLic">Licences & crédits</button>
    </div>
  `;

  c.root.querySelector("#btnDiag")?.addEventListener("click", ()=>toast("OK • UI démo chargée."));
  c.root.querySelector("#btnLic")?.addEventListener("click", ()=>toast("Démo : ajouter page licences plus tard."));

  root.append(c.root);
}
