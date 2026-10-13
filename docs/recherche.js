"use strict";
/* Barre « Chercher partout » : lance le robot de recherche (GitHub Actions), qui interroge Adzuna, Choisir le service
   public, le CNRS et le web (Tavily), vérifie que chaque offre est encore en ligne et calcule le %.
   Les résultats arrivent dans le dépôt privé : il faut la synchronisation active (onglet Profil). */

let recherches = lire("recherches", []);
let resultats = {};       // id -> contenu de recherches/<id>.json
let vueRecherche = null;  // id affiché, ou null
let sondages = {};
let saisieRecherche = "";

function offresRecherches() {
  const ids = new Set(donnees.offres.map((o) => o.id));
  const out = [];
  for (const r of Object.values(resultats)) for (const o of r.offres || []) if (!ids.has(o.id)) { ids.add(o.id); out.push(o); }
  return out;
}
/* Une offre trouvée par recherche que je garde ou à laquelle je postule est recopiée dans mes données */
function conserverSiRecherche(id) {
  if (donnees.offres.some((o) => o.id === id) || perso.some((o) => o.id === id)) return;
  const o = offresRecherches().find((x) => x.id === id);
  if (o) { perso.push(Object.assign({}, o, { perso: false, depuisRecherche: true })); ecrire("perso", perso); }
}

function barreRecherche() {
  const passees = recherches.slice(-6).reverse();
  return `<form class="barre-recherche" data-recherche-form>
      <input type="search" id="q-web" placeholder="Chercher partout : ex. biostatisticien Inserm" value="${esc(saisieRecherche)}" enterkeyhint="search">
      <button class="bouton principal" type="submit">Chercher</button>
    </form>
    ${passees.length ? `<div class="puces recherches-passees">${passees.map((r) => `<button class="puce-r ${r.id === vueRecherche ? "active" : ""}" data-recherche="voir" data-id="${esc(r.id)}">${esc(r.requete)}</button>`).join("")}</div>` : ""}`;
}

function rendreResultats() {
  const r = resultats[vueRecherche];
  const meta = recherches.find((x) => x.id === vueRecherche) || {};
  let h = barreRecherche() + `<div class="entete-resultats"><button class="lien" data-recherche="fermer">← Offres du jour</button>
    <strong>« ${esc(meta.requete || r?.requete || "")} »</strong></div>`;
  if (!r || r.statut === "en_cours") {
    return h + `<div class="vide"><div class="tourne"></div>${esc(r?.etape || "Le robot démarre…")}<br>
      <small>Compte 3 à 8 minutes : il cherche, vérifie chaque offre et calcule le %. Tu peux fermer le site, les résultats t'attendront ici.</small></div>`;
  }
  if (r.statut === "erreur") return h + `<div class="vide">La recherche a échoué. Réessaie, ou dis-le-moi pour que je regarde le journal.</div>`;
  const ids = new Set(donnees.offres.map((o) => o.id));
  const liste = (r.offres || []).filter((o) => !(suivi[o.id] || {}).masque);
  const deja = liste.filter((o) => ids.has(o.id)).length;
  h += `<p class="vide-petit">${liste.length} offre${liste.length > 1 ? "s" : ""} trouvée${liste.length > 1 ? "s" : ""}${deja ? `, dont ${deja} déjà dans tes offres du jour` : ""}. Les offres expirées ont été retirées.</p>`;
  return h + (liste.length ? liste.map(carte).join("") : `<div class="vide">Rien de pertinent. Essaie des mots plus larges.</div>`);
}

async function lancerRecherche(requete) {
  if (!Sync.actif()) { toast("Active d'abord la synchronisation dans l'onglet Profil"); return; }
  const id = Date.now().toString(36);
  try {
    await Sync.lancer("recherche.yml", { requete, id });
  } catch (e) { toast("Erreur : " + e.message); return; }
  recherches.push({ id, requete, date: new Date().toISOString() }); recherches = recherches.slice(-20);
  ecrire("recherches", recherches);
  resultats[id] = { statut: "en_cours", etape: "Le robot démarre…" };
  vueRecherche = id; afficher(); sonder(id);
}

async function chargerResultat(id) {
  try {
    const { contenu } = await Sync.lireJson(`recherches/${id}.json`);
    if (contenu) resultats[id] = contenu;
  } catch (e) { console.warn(e); }
  return resultats[id];
}
function sonder(id, debut = Date.now()) {
  clearTimeout(sondages[id]);
  sondages[id] = setTimeout(async () => {
    const r = await chargerResultat(id);
    if (vueRecherche === id && ONGLETS_OFFRES.includes(etat.onglet)) afficher();
    if ((!r || r.statut === "en_cours") && Date.now() - debut < 30 * 60000) sonder(id, debut);
    else if (r && r.statut === "termine") toast(`Recherche « ${recherches.find((x) => x.id === id)?.requete || ""} » terminée`);
  }, 12000);
}

document.addEventListener("submit", (e) => {
  if (!e.target.matches("[data-recherche-form]")) return;
  e.preventDefault();
  const q = $("#q-web").value.trim(); saisieRecherche = q;
  if (q.length < 3) return toast("Tape au moins un mot-clé");
  lancerRecherche(q);
});
document.addEventListener("input", (e) => { if (e.target.id === "q-web") saisieRecherche = e.target.value; });
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-recherche]"); if (!b) return;
  if (b.dataset.recherche === "fermer") { vueRecherche = null; return afficher(); }
  if (b.dataset.recherche === "voir") {
    vueRecherche = b.dataset.id; afficher();
    const r = await chargerResultat(b.dataset.id);
    if (r && r.statut === "en_cours") sonder(b.dataset.id);
    afficher();
  }
});
