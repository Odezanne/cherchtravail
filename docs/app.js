"use strict";

const NIVEAUX_LARGEUR = [
  { nom: "Strict", min: 75, aide: "Seulement les offres très proches de ton CV." },
  { nom: "Proche", min: 60, aide: "Offres en lien direct avec ton parcours." },
  { nom: "Large", min: 45, aide: "Ajoute les offres dans des domaines voisins." },
  { nom: "Très large", min: 25, aide: "Ajoute les offres plus éloignées de ton CV." },
  { nom: "Tout", min: 0, aide: "Tout ce que le robot a trouvé, même hors profil." },
];
const GROUPES = { coeur: "Cœur de cible", tres_proche: "Très proche", proche: "Proche", eloigne: "Plus éloigné", hors: "Hors profil" };
const DEFAUTS = { onglet: "emploi", largeur: 1, recherche: "", salaire: 0, sansSalaire: true,
  zones: ["idf", "?"], contrats: ["cdd", "cdi", "autre"], cacherBloques: false, voirMasquees: false, lieux: [], lieuxMode: "inclure" };

let donnees = { offres: [], maj: null };
let etat = Object.assign({}, DEFAUTS, lire("filtres", {}));
if (etat.onglet === "favoris") etat.onglet = "suivi";
let suivi = lire("suivi", {});
const $ = (s) => document.querySelector(s);

function lire(cle, defaut) {
  try { return JSON.parse(localStorage.getItem("ct-" + cle)) ?? defaut; } catch { return defaut; }
}
function ecrire(cle, val) {
  try { localStorage.setItem("ct-" + cle, JSON.stringify(val)); } catch { /* stockage indisponible */ }
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toast(msg, annuler) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  if (annuler) {
    const b = Object.assign(document.createElement("button"), { textContent: "Annuler", className: "toast-annuler" });
    b.onclick = () => { annuler(); t.hidden = true; }; t.append(" ", b);
  }
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), annuler ? 5000 : 2600);
}
function sourceCourte(o) {
  const s = o.source || "";
  return s === "Choisir le service public" ? "Service public" : s === "Welcome to the Jungle" ? "WTTJ" : s === "Alerte e-mail" ? "le site" : s;
}
const ONGLETS_OFFRES = ["emploi", "these"];
function dateFr(iso, opts = { day: "numeric", month: "short" }) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", opts);
}
function joursAvant(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso + "T23:59:00") - new Date()) / 86400000);
}
function typeContrat(o) {
  const c = (o.contrat || "").toLowerCase();
  if (c.includes("cdi")) return "cdi";
  if (c.includes("cdd") || c.includes("durée déterminée") || c.includes("contrat de projet")) return "cdd";
  return "autre";
}
function salaireTexte(a) {
  if (!a.salaire_min) return "";
  const f = (n) => n.toLocaleString("fr-FR") + " €";
  return (a.salaire_max && a.salaire_max !== a.salaire_min ? `${f(a.salaire_min)}–${f(a.salaire_max)}` : f(a.salaire_min)) + " brut/mois";
}
/* Couleur du % par palier : rouge pastel près de 0 %, vert pastel près de 100 % */
function couleurScore(s) {
  return s >= 75 ? "var(--s5)" : s >= 60 ? "var(--s4)" : s >= 45 ? "var(--s3)" : s >= 25 ? "var(--s2)" : "var(--s1)";
}
function estNouveau(o) {
  return o.vu_le && (Date.now() - new Date(o.vu_le + "T00:00:00")) < 36 * 3600000;
}

function filtrer(onglet, largeur) {
  const min = NIVEAUX_LARGEUR[largeur].min;
  const q = etat.recherche.trim().toLowerCase();
  return donnees.offres.filter((o) => {
    const a = o.analyse || {}; const s = suivi[o.id] || {};
    if (o.type !== onglet) return false;
    if (s.masque && !etat.voirMasquees) return false;
    const st = typeof statutDe === "function" ? statutDe(o.id) : null;
    if (st && st !== "a_postuler") return false;
    if ((a.score ?? 0) < min) return false;
    const lieuxChoisis = (etat.lieux || []).length && etat.lieuxMode !== "exclure";
    if (!lieuxChoisis && !etat.zones.includes(o.region || "?")) return false;
    if (typeof passeLieu === "function" && !passeLieu(o)) return false;
    if (onglet === "emploi" && !etat.contrats.includes(typeContrat(o))) return false;
    if (etat.cacherBloques && a.bloquants?.length) return false;
    if (etat.salaire > 0) {
      if (a.salaire_min == null) { if (!etat.sansSalaire) return false; }
      else if ((a.salaire_max || a.salaire_min) < etat.salaire) return false;
    }
    if (q) {
      const txt = [o.titre, o.employeur, o.lieu, a.resume, ...(a.competences || []).map((c) => c.nom)].join(" ").toLowerCase();
      if (!q.split(/\s+/).every((m) => txt.includes(m))) return false;
    }
    return true;
  });
}

function carte(o) {
  const a = o.analyse || {}; const bloque = a.bloquants?.length > 0;
  const j = joursAvant(a.date_limite);
  const et = [];
  if (estNouveau(o)) et.push(`<span class="et nouveau">Nouveau</span>`);
  if (o.contrat) et.push(`<span class="et">${esc(o.contrat)}${a.duree_mois ? " · " + a.duree_mois + " mois" : ""}</span>`);
  const sal = salaireTexte(a); if (sal) et.push(`<span class="et">${sal}</span>`);
  if (j != null && j >= 0) et.push(`<span class="et ${j <= 7 ? "limite" : ""}">Limite ${dateFr(a.date_limite)}</span>`);
  if (a.lien_these && o.type === "emploi") et.push(`<span class="et these">Tremplin thèse</span>`);
  et.push(`<span class="et">${esc(o.source)}</span>`);
  const rc = badgeRecoupement(o); if (rc) et.push(rc);
  const alerte = bloque
    ? `<div class="alerte"><b>${esc(a.bloquants.map((b) => b.texte).join(" · "))}</b>. Tu peux quand même tenter ta chance.</div>` : "";
  const garde = statutDe(o.id) === "a_postuler";
  const masque = (suivi[o.id] || {}).masque;
  return `<article class="carte${bloque ? " bloquee" : ""}${garde ? " gardee" : ""}">
    <button class="carte-ouvrir" data-id="${esc(o.id)}">
      <div class="score" style="--p:${a.score ?? 0};--c:${couleurScore(a.score ?? 0)}" aria-label="Intérêt ${a.score ?? 0} %"><b>${a.score ?? 0}%</b></div>
      <div class="corps">
        <h3>${esc(o.titre)}</h3>
        <p class="sous">${esc([o.employeur, typeof lieuAffiche === "function" ? lieuAffiche(o) : o.lieu].filter(Boolean).join(" · ") || o.source)}</p>
        <div class="etiquettes">${et.join("")}</div>${alerte}
      </div></button>
    <div class="carte-actions">
      ${o.url ? `<a class="ca" href="${esc(o.url)}" target="_blank" rel="noopener">↗ Voir sur ${esc(sourceCourte(o))}</a>` : "<span></span>"}
      <button class="ca" data-carte="garder" data-id="${esc(o.id)}" aria-pressed="${garde}">${garde ? "📌 Gardée" : "📌 Garder"}</button>
      <button class="ca" data-carte="ecarter" data-id="${esc(o.id)}">${masque ? "↺ Remettre" : "✕ Pas pour moi"}</button>
    </div></article>`;
}

function afficher() {
  ecrire("filtres", etat);
  document.querySelectorAll(".onglets button").forEach((b) => b.setAttribute("aria-selected", b.dataset.onglet === etat.onglet));
  const niv = NIVEAUX_LARGEUR[etat.largeur];
  $("#largeur").value = etat.largeur; $("#largeur-nom").textContent = `${niv.nom} (≥ ${niv.min} %)`;
  $("#largeur-aide").textContent = niv.aide;
  const offres = ONGLETS_OFFRES.includes(etat.onglet);
  $(".elargir").hidden = !offres;
  $("#btn-filtres").hidden = !offres;
  if (!offres) $("#panneau").hidden = true;
  $("#salaire-val").textContent = etat.salaire ? `${etat.salaire.toLocaleString("fr-FR")} € brut/mois` : "Aucun";
  for (const t of ["emploi", "these"]) $("#c-" + t).textContent = filtrer(t, etat.largeur).length || "";
  $("#c-suivi").textContent = nbSuivis() || "";
  const nbFiltres = (etat.recherche ? 1 : 0) + (etat.salaire ? 1 : 0) + (etat.cacherBloques ? 1 : 0)
    + (JSON.stringify(etat.zones) !== JSON.stringify(DEFAUTS.zones) ? 1 : 0)
    + (etat.contrats.length !== 3 ? 1 : 0) + ((etat.lieux || []).length ? 1 : 0);
  $("#nb-filtres").hidden = !nbFiltres; $("#nb-filtres").textContent = nbFiltres;

  if (etat.onglet === "suivi") { $("#liste").innerHTML = rendreSuivi(); return; }
  if (etat.onglet === "lettre") { $("#liste").innerHTML = rendreLettre(); ajusterTout(); return; }
  if (etat.onglet === "cv") { $("#liste").innerHTML = rendreCv(); ajusterTout(); return; }
  if (etat.onglet === "labos") { $("#liste").innerHTML = rendreLabos(); return; }
  if (etat.onglet === "contacts") { $("#liste").innerHTML = rendreContacts(); return; }
  if (etat.onglet === "profil") { $("#liste").innerHTML = rendreProfil(); ajusterTout(); return; }
  if (etat.onglet === "dossier") { rendreDossier(); return; }
  if (vueRecherche) { $("#liste").innerHTML = rendreResultats(); return; }
  const barre = barreRecherche() + (typeof bandeauLieux === "function" ? bandeauLieux() : "");
  const tri = (x, y) => (y.analyse?.score ?? 0) - (x.analyse?.score ?? 0);
  // Offres gardées : toujours en tête, quels que soient les filtres, jusqu'à ce que je postule
  const gardees = donnees.offres.filter((o) => o.type === etat.onglet && statutDe(o.id) === "a_postuler" && !(suivi[o.id] || {}).masque).sort(tri);
  const idsGardees = new Set(gardees.map((o) => o.id));
  const liste = filtrer(etat.onglet, etat.largeur).filter((o) => !idsGardees.has(o.id)).sort(tri);
  const enTete = gardees.length ? `<h2 class="groupe">📌 À ne pas oublier (${gardees.length})</h2>${gardees.map(carte).join("")}` : "";
  if (!donnees.offres.length) {
    $("#liste").innerHTML = barre + `<div class="vide">Le robot n'a pas encore fait son premier passage.<br>Les offres apparaîtront ici après le prochain condensé.</div>`;
    return;
  }
  if (!liste.length) {
    if (enTete) { $("#liste").innerHTML = barre + enTete; return; }
    let suivant = etat.largeur + 1;
    while (suivant < NIVEAUX_LARGEUR.length && !filtrer(etat.onglet, suivant).length) suivant++;
    $("#liste").innerHTML = barre + `<div class="vide">Aucune offre avec ces réglages.${suivant < NIVEAUX_LARGEUR.length
      ? `<br><button id="btn-elargir" data-n="${suivant}">Élargir à « ${NIVEAUX_LARGEUR[suivant].nom} » (${filtrer(etat.onglet, suivant).length})</button>`
      : "<br>Essaie d'assouplir les filtres de zone ou de salaire."}</div>`;
    $("#btn-elargir")?.addEventListener("click", (e) => { etat.largeur = +e.target.dataset.n; afficher(); });
    return;
  }
  let html = barre + enTete, groupe = null;
  for (const o of liste) {
    const g = o.analyse?.niveau || "hors";
    if (g !== groupe) { html += `<h2 class="groupe">${GROUPES[g] || g}</h2>`; groupe = g; }
    html += carte(o);
  }
  $("#liste").innerHTML = html;
}

function liste(titre, items, rendu = (x) => esc(x)) {
  return items?.length ? `<h4>${titre}</h4><ul>${items.map((x) => `<li>${rendu(x)}</li>`).join("")}</ul>` : "";
}

/* Recoupement : l'offre existe-t-elle vraiment, et où ? (fait par le robot chaque jour) */
function badgeRecoupement(o) {
  if (o.disponibilite === "expiree") return `<span class="et limite">⚠ Plus en ligne</span>`;
  const r = o.recoupement || {}; const n = (r.sites || []).length;
  switch (r.statut) {
    case "employeur": return `<span class="et dispo">✓ Confirmée par l'employeur</span>`;
    case "plusieurs": return `<span class="et dispo">✓ Vue sur ${n + 1} sites</span>`;
    case "officiel": return `<span class="et">Portail de l'État seulement</span>`;
    case "unique": return `<span class="et">Vue sur 1 seul site</span>`;
  }
  return o.disponibilite === "disponible" ? `<span class="et dispo">✓ En ligne</span>` : "";
}
function blocRecoupement(o) {
  const r = o.recoupement || {};
  const lignes = [];
  if (o.disponibilite === "expiree") lignes.push(`<p class="alerte-texte">⚠ La page d'origine n'est plus en ligne depuis le ${dateFr(o.expiree_le || o.verifiee_le)} : l'offre est sans doute pourvue ou retirée.</p>`);
  else if (o.verifiee_le) lignes.push(`<p>Page d'origine revérifiée le ${dateFr(o.verifiee_le)} : toujours en ligne.</p>`);
  const sites = [{ nom: o.source, url: o.url }, ...(r.sites || [])];
  if (r.url_employeur && !sites.some((x) => x.url === r.url_employeur)) sites.push({ nom: "Site de l'employeur", url: r.url_employeur });
  if (sites.length > 1 || r.url_employeur) {
    lignes.push(`<p>Vue sur :</p><ul>${sites.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.nom || x.url)} ↗</a>${x.url === r.url_employeur ? " · <b>site de l'employeur</b>" : ""}</li>`).join("")}</ul>`);
  }
  if (r.statut === "officiel") lignes.push(`<p>Publiée seulement sur Choisir le service public, introuvable sur le site de l'employeur. C'est le portail officiel de l'emploi public, alimenté par les établissements eux-mêmes (MNHN, INRAE, universités…), donc l'offre est bien réelle. Les sites des établissements ne reprennent pas toujours toutes leurs annonces. Vérifie surtout la date limite et le contact indiqué.</p>`);
  if (r.statut === "unique") lignes.push(`<p>Vue sur un seul site pour l'instant. Avant de postuler, cherche l'offre sur le site de l'employeur ou écris au contact indiqué.</p>`);
  if (r.statut === "employeur") lignes.push(`<p>✓ Publiée par l'employeur lui-même.</p>`);
  if (!lignes.length) return "";
  return `<h4>Vérification de l'offre</h4><div class="recoupement">${lignes.join("")}</div>`;
}

function ouvrirFiche(id) {
  const o = toutesOffres().find((x) => x.id === id); if (!o) return;
  const a = o.analyse || {}; const s = suivi[o.id] || {};
  const comp = a.competences?.length
    ? `<h4>Compétences attendues</h4><ul class="comp">${a.competences.map((c) =>
      `<li class="${c.ok ? "ok" : "ko"}">${c.ok ? "✓" : "✗"} ${esc(c.nom)}</li>`).join("")}</ul>` : "";
  const blocage = a.bloquants?.length
    ? `<div class="bloc-blocage"><strong>⚠ ${esc(a.bloquants.map((b) => b.texte).join(" · "))}</strong>
       <p style="margin:6px 0 0">${esc(a.conseil)}</p>
       ${a.contact ? `<p style="margin:6px 0 0">Contact : <b>${esc(a.contact)}</b></p>` : ""}</div>`
    : a.conseil ? `<h4>Conseil</h4><p style="margin:0">${esc(a.conseil)}</p>` : "";
  const infos = [o.employeur, o.lieu, o.contrat && (o.contrat + (a.duree_mois ? ` · ${a.duree_mois} mois` : "")),
    salaireTexte(a), a.date_limite && `Date limite : ${dateFr(a.date_limite, { day: "numeric", month: "long", year: "numeric" })}`,
    `Source : ${o.source}`].filter(Boolean);
  $("#fiche-contenu").innerHTML = `<div class="fiche">
    <div class="fiche-haut"><div><p class="sous">${o.perso ? "Candidature ajoutée à la main" : `<b style="color:${couleurScore(a.score ?? 0)}">${a.score ?? 0} %</b> d'intérêt · ${GROUPES[a.niveau] || ""}`}</p>
      <h2 id="fiche-titre">${esc(o.titre)}</h2></div>
      <button class="fermer" aria-label="Fermer" data-action="fermer">×</button></div>
    <p class="sous" style="margin-top:6px">${infos.map(esc).join(" · ")}</p>
    ${blocage}
    ${a.resume ? `<p class="resume">${esc(a.resume)}</p>` : ""}
    ${comp}
    ${liste("Prérequis", a.prerequis)}
    ${liste("Missions", a.missions)}
    ${liste("Tes atouts", a.atouts)}
    ${liste("Ce qui te manque", a.manques)}
    ${!a.resume && o.extrait ? `<h4>Extrait</h4><p>${esc(o.extrait)}</p>` : ""}
    ${blocRecoupement(o)}
    <div class="actions">
      ${o.url ? `<a class="bouton principal" href="${esc(o.url)}" target="_blank" rel="noopener">Ouvrir l'offre sur ${esc(sourceCourte(o))} ↗</a>` : ""}
      <button class="bouton" data-action="lettre">Adapter ma lettre à cette offre</button>
      <button class="bouton" data-action="claude">Adapter mon CV avec Claude</button>
      ${o.perso ? "" : `<button class="bouton" data-action="masque" aria-pressed="${!!s.masque}">${s.masque ? "Remettre dans la liste" : "✕ Pas pour moi"}</button>`}
    </div>
    ${blocSuivi(o)}
    <p class="note-mode">${o.perso ? "" : a.mode === "ia" ? "Analyse faite par IA à partir de l'annonce : vérifie toujours l'offre d'origine."
      : "Analyse simplifiée par mots-clés (IA indisponible ce jour-là)."}</p></div>`;
  $("#fiche").dataset.id = id;
  $("#fiche").showModal();
  $("#fiche-contenu").scrollTop = 0;
}

function promptClaude(o) {
  const a = o.analyse || {};
  return `Voici une offre qui m'intéresse. Adapte mon CV (sans rien inventer) et rédige ma lettre de motivation en suivant les règles du projet.

Poste : ${o.titre}
Employeur : ${o.employeur || "?"} · ${o.lieu || ""}
Contrat : ${o.contrat || "?"}${a.duree_mois ? ` (${a.duree_mois} mois)` : ""}
Lien : ${o.url || "?"}
Résumé : ${a.resume || ""}
Prérequis : ${(a.prerequis || []).join(" ; ")}
Compétences attendues : ${(a.competences || []).map((c) => c.nom).join(", ")}
${a.bloquants?.length ? `Point faible à désamorcer : ${a.bloquants.map((b) => b.texte).join(", ")}` : ""}`;
}

async function action(nom) {
  const id = $("#fiche").dataset.id; const o = toutesOffres().find((x) => x.id === id);
  if (nom === "fermer") return $("#fiche").close();
  if (nom === "lettre") { $("#fiche").close(); return ouvrirLettre(id); }
  if (nom === "claude") {
    try { await navigator.clipboard.writeText(promptClaude(o)); toast("Demande copiée : colle-la dans ton projet Claude"); }
    catch { toast("Copie impossible sur cet appareil"); }
    setTimeout(() => window.open("https://claude.ai/", "_blank", "noopener"), 600);
    return;
  }
  suivi[id] = suivi[id] || {};
  suivi[id][nom] = !suivi[id][nom];
  ecrire("suivi", suivi);
  if (nom === "masque" && suivi[id].masque) {
    $("#fiche").close();
    toast("Offre écartée", () => { suivi[id].masque = false; ecrire("suivi", suivi); afficher(); });
  }
  else ouvrirFiche(id);
  afficher();
}

function actionCarte(nom, id) {
  const s = (suivi[id] = suivi[id] || {});
  if (nom === "garder") {
    const avant = statutDe(id);
    if (avant === "a_postuler") { s.statut = undefined; s.fav = false; toast("Retirée de « À ne pas oublier »"); }
    else if (!avant) { conserverSiRecherche(id); s.statut = "a_postuler"; s.masque = false; toast("Gardée en tête de liste jusqu'à ta candidature"); }
  } else if (nom === "ecarter") {
    s.masque = !s.masque;
    if (s.masque) {
      if (statutDe(id) === "a_postuler") s.statut = undefined;
      toast("Offre écartée, elle ne reviendra plus", () => { s.masque = false; ecrire("suivi", suivi); afficher(); });
    }
  }
  ecrire("suivi", suivi); afficher();
}

function relierFiltres() {
  $("#btn-filtres").addEventListener("click", () => {
    const p = $("#panneau"); p.hidden = !p.hidden; $("#btn-filtres").setAttribute("aria-expanded", !p.hidden);
    if (!p.hidden && typeof rendreFiltreLieux === "function") rendreFiltreLieux();
  });
  document.querySelectorAll(".onglets button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.onglet === etat.onglet && typeof vueRecherche !== "undefined") vueRecherche = null;
    etat.onglet = b.dataset.onglet; afficher(); window.scrollTo(0, 0);
  }));
  $("#largeur").addEventListener("input", (e) => { etat.largeur = +e.target.value; afficher(); });
  $("#recherche").value = etat.recherche;
  $("#recherche").addEventListener("input", (e) => { etat.recherche = e.target.value; afficher(); });
  $("#salaire").value = etat.salaire;
  $("#salaire").addEventListener("input", (e) => { etat.salaire = +e.target.value; afficher(); });
  $("#sans-salaire").checked = etat.sansSalaire;
  $("#sans-salaire").addEventListener("change", (e) => { etat.sansSalaire = e.target.checked; afficher(); });
  $("#cacher-bloques").checked = etat.cacherBloques;
  $("#cacher-bloques").addEventListener("change", (e) => { etat.cacherBloques = e.target.checked; afficher(); });
  $("#voir-masquees").checked = etat.voirMasquees;
  $("#voir-masquees").addEventListener("change", (e) => { etat.voirMasquees = e.target.checked; afficher(); });
  for (const [sel, cle] of [["#zones", "zones"], ["#contrats", "contrats"]]) {
    document.querySelectorAll(sel + " input").forEach((i) => {
      i.checked = etat[cle].includes(i.value);
      i.addEventListener("change", () => {
        etat[cle] = [...document.querySelectorAll(sel + " input:checked")].map((x) => x.value); afficher();
      });
    });
  }
  $("#reinit").addEventListener("click", () => {
    etat = Object.assign({}, DEFAUTS, { onglet: etat.onglet }); ecrire("filtres", etat); location.reload();
  });
  $("#liste").addEventListener("click", (e) => {
    const b = e.target.closest("[data-carte]");
    if (b) return actionCarte(b.dataset.carte, b.dataset.id);
    const c = e.target.closest(".carte-ouvrir"); if (c) ouvrirFiche(c.dataset.id);
  });
  $("#fiche").addEventListener("click", (e) => {
    if (e.target === $("#fiche")) return $("#fiche").close();
    const b = e.target.closest("[data-action]"); if (b) action(b.dataset.action);
  });
}

async function charger() {
  try {
    const r = await fetch("data/offres.json?t=" + Date.now(), { cache: "no-store" });
    donnees = await r.json();
    $("#maj").textContent = donnees.maj
      ? `Mis à jour ${dateFr(donnees.maj, { weekday: "long", day: "numeric", month: "long" })} · ${donnees.offres.length} offres`
      : "En attente du premier passage du robot";
  } catch {
    $("#maj").textContent = "Hors connexion : dernières offres connues";
  }
  afficher();
}

relierFiltres();
charger();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
