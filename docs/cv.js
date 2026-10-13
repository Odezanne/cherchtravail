"use strict";
/* Onglet CV : mon CV modifiable, une version adaptée par offre (rien n'est inventé : on réordonne et on met en avant),
   export Word. Le format texte est volontairement simple pour être modifiable au téléphone. */

const CV_DEFAUT = {
  nom: "Eliott Mestrallet",
  titre: "Ingénieur en biologie quantitative et biostatistique",
  coordonnees: "Paris 15e · téléphone · adresse e-mail",
  accroche: "Diplômé d'un master en biologie quantitative (AgroParisTech / Université Paris-Saclay, mention Bien), "
    + "spécialisé en biostatistique sous R, génétique des populations et étude du comportement animal. "
    + "Co-auteur d'un article publié dans Scientific Reports. Disponible immédiatement.",
  experiences: "Janv. – juin 2025 | Stage de fin d'études, McDonald Institute, Université de Cambridge | Gibraltar et Cambridge (Royaume-Uni)\n"
    + "- Conception d'un protocole d'étude du comportement des macaques de Gibraltar (interactions avec les touristes, apprentissage social)\n"
    + "- Collecte de terrain : 571 observations en 48 sessions sur 4 groupes, 48 essais de résolution de problème (CyberTracker, formulaire par QR code)\n"
    + "- Analyses sous R : GLMM (Poisson, binomiale négative), LMM, ANOVA et post hoc (emmeans), diagnostics DHARMa\n"
    + "- Résultats : la densité de visiteurs prédit la fréquence des interactions ; les signes de stress allongent la résolution de la tâche\n\n"
    + "Sept. 2025 – juin 2026 | Service civique, Jardin des Serres d'Auteuil (Ville de Paris) | Paris\n"
    + "- Conception et animation de visites scolaires et d'ateliers sur la biodiversité et les plantes exotiques\n\n"
    + "Avril – juillet 2024 | Stage de M1, unité IERP, INRAE | Jouy-en-Josas\n"
    + "- Développement d'approches de suivi comportemental de larves de zebrafish en contexte infectieux\n"
    + "- Traitement et modélisation des données sous R, scripts d'analyse réutilisables\n\n"
    + "Sept. 2024 – juil. 2025 | Membre du comité d'éthique et étudiant ambassadeur RSE, AgroParisTech | Palaiseau\n"
    + "- Examen de la conformité déontologique de projets de recherche, sensibilisation à l'intégrité scientifique",
  formation: "2023 – 2025 | Master Biologie intégrative et physiologie animale, parcours PRIAM, mention Bien | AgroParisTech / Université Paris-Saclay\n"
    + "2019 – 2022 | Licence Sciences de la vie, Diversité du vivant, mineure Histoire naturelle | Sorbonne Université",
  publication: "Frater J., …, Mestrallet E., …, Lemoine S. (2026). Geophagy in Gibraltar Barbary macaques is a primate tradition "
    + "anthropogenically induced. Scientific Reports 16, 13139. doi:10.1038/s41598-026-44607-0",
  competences: "Statistiques : R, modèles mixtes (GLMM, LMM), lme4, glmmTMB, emmeans, DHARMa, ggplot2\n"
    + "Biologie : éthologie, échantillonnage comportemental, génétique des populations, conception de protocoles\n"
    + "Outils : QGIS, CyberTracker, ViewPoint (tracking comportemental), Pack Office\n"
    + "Communication : médiation scientifique, animation d'ateliers, rédaction scientifique",
  langues: "Anglais courant (IELTS 8.5) · Espagnol B1",
  interets: "Karaté (ceinture marron, 10 ans) · Natation · Batterie · Trek en montagne · Dessin",
};
const SECTIONS_CV = [
  ["titre", "Titre sous le nom", 1], ["coordonnees", "Coordonnées", 2], ["accroche", "Accroche", 4],
  ["experiences", "Expériences", 14, "Une expérience = une ligne « dates | poste | lieu » puis des lignes « - réalisation ». Ligne vide entre deux expériences."],
  ["formation", "Formation", 4, "Une ligne par diplôme : « dates | diplôme | établissement »."],
  ["publication", "Publication", 3], ["competences", "Compétences", 5, "Une ligne par groupe : « Groupe : éléments »."],
  ["langues", "Langues", 1], ["interets", "Centres d'intérêt", 1],
];
/* Mes CV mis en page dans Canva (liens d'édition : ils ne s'ouvrent que connecté à mon compte Canva) */
const CANVA_DEFAUT = [
  { id: "DAHX6A-6xBY", nom: "CV français", lien: "https://www.canva.com/design/DAHX6A-6xBY/edit", langue: "fr" },
  { id: "DAHX6CAC0nA", nom: "CV anglais", lien: "https://www.canva.com/design/DAHX6CAC0nA/edit", langue: "en" },
];
let cvBase = Object.assign({}, CV_DEFAUT, lire("cv", {}).base || {});
let cvAdaptes = lire("cv", {}).adaptes || {};
let cvCanva = lire("cv", {}).canva || CANVA_DEFAUT;
let cvCourant = lire("cv-courant", "base");
let formCanva = null;
function rechargerCv() {
  const c = lire("cv", {}); cvBase = Object.assign({}, CV_DEFAUT, c.base || {}); cvAdaptes = c.adaptes || {}; cvCanva = c.canva || CANVA_DEFAUT;
}
function enregistrerCv() { ecrire("cv", { base: cvBase, adaptes: cvAdaptes, canva: cvCanva }); }

/* Lien d'intégration Canva (Partager > Intégrer) → adresse d'aperçu ; on n'accepte que canva.com */
function lienApercu(x) {
  const brut = (x.embed || "").trim();
  const m = brut.match(/https:\/\/www\.canva\.com\/design\/[\w-]+\/[\w-]+\/(?:view|watch)[^"'\s<]*/);
  if (!m) return "";
  const u = m[0].replace(/&amp;/g, "&");
  return u.includes("embed") ? u : u + (u.includes("?") ? "&" : "?") + "embed";
}

function blocCanva(o) {
  const cartes = cvCanva.map((x, i) => {
    const apercu = lienApercu(x);
    return `<div class="canva-carte">
      <div class="canva-tete">
        <strong>${esc(x.nom)}</strong>
        <button class="mini" data-cv="canva-modifier" data-i="${i}" aria-label="Réglages de ${esc(x.nom)}">⚙</button>
      </div>
      ${apercu ? `<div class="canva-apercu"><iframe loading="lazy" src="${esc(apercu)}" title="Aperçu ${esc(x.nom)}" allowfullscreen allow="fullscreen"></iframe></div>`
        : `<p class="vide-petit">Pas d'aperçu : ajoute le lien d'intégration Canva dans ⚙ si tu veux voir ton CV ici.</p>`}
      <div class="actions-ligne deux">
        <a class="bouton principal" href="${esc(x.lien)}" target="_blank" rel="noopener">Modifier dans Canva ↗</a>
        <button class="bouton" data-cv="canva-claude" data-i="${i}">${o ? "Adapter à l'offre avec Claude" : "Demander une modif à Claude"}</button>
      </div>
    </div>`;
  }).join("");
  return `<h2 class="groupe">Mon CV dans Canva</h2>
    <p class="vide-petit">« Modifier dans Canva » ouvre l'éditeur (l'appli Canva sur le téléphone). Canva n'autorise pas son éditeur à l'intérieur d'un autre site :
      ici tu as l'aperçu, la modification se fait dans Canva, ou par Claude qui travaille sur une copie et te la montre avant de valider.</p>
    ${cartes}
    ${formCanva ? formulaireCanva(formCanva) : `<button class="lien" data-cv="canva-ajouter">+ Ajouter un autre design Canva (version adaptée, autre langue…)</button>`}`;
}

function formulaireCanva(x) {
  return `<div class="bloc-export bloc-evt">
    <h3 class="sous-groupe" style="margin-top:0">${x.i != null ? "Réglages" : "Nouveau design"}</h3>
    <label class="champ-l">Nom<input id="canva-nom" value="${esc(x.nom || "")}" placeholder="ex. CV adapté MNHN"></label>
    <label class="champ-l">Lien du design<input id="canva-lien" value="${esc(x.lien || "")}" placeholder="https://www.canva.com/design/…/edit"></label>
    <label class="champ-l">Lien d'intégration (facultatif, pour l'aperçu)
      <small>Dans Canva : Partager › Plus › Intégrer › copier le code ou le lien. Attention : toute personne qui a ce lien peut voir le CV
        (avec ton téléphone et ton e-mail). Il reste rangé dans tes données privées, jamais dans le code du site.</small>
      <input id="canva-embed" value="${esc(x.embed || "")}" placeholder="https://www.canva.com/design/…/view?embed"></label>
    <div class="actions-ligne deux">
      <button class="bouton principal" data-cv="canva-enregistrer">Enregistrer</button>
      <button class="bouton" data-cv="canva-annuler">Annuler</button>
    </div>
    ${x.i != null ? `<button class="lien rouge" data-cv="canva-supprimer">Retirer de la liste</button>` : ""}
  </div>`;
}

/* ---------- adaptation à une offre : on remonte ce qui correspond, sans rien ajouter */
function motsOffre(o) {
  const a = o.analyse || {};
  const t = [o.titre, ...(a.competences || []).map((c) => c.nom), ...(a.missions || []), ...(a.prerequis || [])].join(" ");
  return [...new Set(sansAccents(t).split(/[^a-z0-9+]+/).filter((m) => m.length > 3 && !MOTS_VIDES.has(m)))];
}
const MOTS_VIDES = new Set("avec dans pour des les une sur par aux est sont votre vous nous leur plus etre avoir cette ainsi tout tous toutes ".split(" ").concat(
  "realiser assurer participer mettre place travail equipe projet poste mission missions profil connaissances capacite".split(" ")));
function sansAccents(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function pertinence(ligne, mots) { const l = sansAccents(ligne); return mots.reduce((n, m) => n + (l.includes(m) ? 1 : 0), 0); }

function adapter(o) {
  const mots = motsOffre(o);
  const cv = Object.assign({}, cvBase);
  // compétences : groupes et éléments les plus pertinents d'abord
  cv.competences = cvBase.competences.split("\n").filter(Boolean).map((l) => {
    const [g, reste] = l.includes(":") ? [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1)] : ["", l];
    const items = reste.split(",").map((x) => x.trim()).filter(Boolean)
      .map((x, i) => ({ x, p: pertinence(x, mots), i })).sort((a, b) => b.p - a.p || a.i - b.i);
    return { l: (g ? g.trim() + " : " : "") + items.map((y) => y.x).join(", "), p: items.reduce((n, y) => n + y.p, 0) };
  }).map((x, i) => Object.assign(x, { i })).sort((a, b) => b.p - a.p || a.i - b.i).map((x) => x.l).join("\n");
  // expériences : réalisations les plus pertinentes en tête de chaque expérience (l'ordre des expériences reste chronologique)
  cv.experiences = cvBase.experiences.split(/\n\s*\n/).map((bloc) => {
    const [tete, ...points] = bloc.split("\n");
    return [tete, ...points.map((x, i) => ({ x, p: pertinence(x, mots), i })).sort((a, b) => b.p - a.p || a.i - b.i).map((y) => y.x)].join("\n");
  }).join("\n\n");
  cv.offre = o.id;
  return cv;
}

function lignesCv(cv) {
  const exp = cv.experiences.split("\n").length, form = cv.formation.split("\n").length, comp = cv.competences.split("\n").length;
  return 8 + Math.ceil(cv.accroche.length / 95) + exp + Math.ceil(cv.experiences.length / 110) + form + comp + 6 + Math.ceil(cv.publication.length / 95);
}

function rendreCv() {
  const { suivies, autres } = offresPourLettre();
  const cv = cvCourant !== "base" && cvAdaptes[cvCourant] ? cvAdaptes[cvCourant] : cvBase;
  const o = cvCourant !== "base" && toutesOffres().find((x) => x.id === cvCourant);
  const opt = (x) => `<option value="${esc(x.id)}" ${x.id === cvCourant ? "selected" : ""}>${esc(x.titre.slice(0, 70))}${x.employeur ? " · " + esc(x.employeur.slice(0, 25)) : ""}</option>`;
  const lignes = lignesCv(cv);
  const manques = o ? (o.analyse?.competences || []).filter((c) => !c.ok).map((c) => c.nom) : [];
  return `<div class="lettre">
    <label class="champ-l">Pour quelle offre ?
      <select data-cv="choix">
        <option value="base" ${cvCourant === "base" ? "selected" : ""}>Aucune : mon CV général</option>
        ${suivies.length ? `<optgroup label="Adapter à une de mes candidatures">${suivies.map(opt).join("")}</optgroup>` : ""}
        ${autres.length ? `<optgroup label="Adapter à une offre proche de mon profil">${autres.map(opt).join("")}</optgroup>` : ""}
      </select></label>
    ${blocCanva(o)}
    <details class="cv-texte" ${lire("cv-texte-ouvert", false) ? "open" : ""}>
    <summary>Version texte et Word (adaptation automatique à une offre)</summary>

    <ul class="verifs">
      <li class="${lignes <= 62 ? "ok" : "ko"}">${lignes <= 62 ? "✓ Tient a priori sur une page" : "! Risque de dépasser une page : raccourcis les expériences"}</li>
      ${o ? `<li class="ok">✓ Version adaptée à « ${esc(o.titre.slice(0, 60))} » : compétences et réalisations utiles remontées en tête</li>` : `<li class="ok">✓ Les modifications du CV de base servent à toutes les futures versions adaptées</li>`}
      ${manques.length ? `<li class="ko">! Demandé par l'offre et absent de ton profil : ${esc(manques.slice(0, 5).join(", "))}. Ne l'ajoute que si c'est vrai.</li>` : ""}
      ${/\bNature\b/.test(Object.values(cv).join(" ")) ? `<li class="ko">! Écris « Scientific Reports », pas « Nature »</li>` : ""}
    </ul>
    ${SECTIONS_CV.map(([k, nom, rangs, aide]) => `<label class="champ-l">${nom}${aide ? `<small>${aide}</small>` : ""}<textarea data-cv-champ="${k}" rows="${rangs}">${esc(cv[k])}</textarea></label>`).join("")}
    <div class="actions">
      <button class="bouton principal" data-cv="word">Télécharger en Word</button>
      <div class="actions-ligne deux">
        <button class="bouton" data-cv="dossier">Ranger dans Dossier</button>
        <button class="bouton" data-cv="claude">Faire relire par Claude</button>
      </div>
      ${o ? `<button class="lien" data-cv="refaire">Refaire la version adaptée à partir du CV de base</button>` : ""}
    </div></details></div>`;
}

function cvDocx(cv) {
  const P = Docx.p;
  const titre = (t) => P(t.toUpperCase(), { gras: true, taille: 10.5, couleur: "2F6B4F", avant: 8, apres: 3, garder: true });
  let corps = P(cv.nom, { gras: true, taille: 20, apres: 0 }) + P(cv.titre, { taille: 12, couleur: "2F6B4F", apres: 2 })
    + P(cv.coordonnees, { taille: 9.5, couleur: "5D6A62", apres: 8 }) + P(cv.accroche, { align: "both", apres: 4 });
  corps += titre("Expériences");
  for (const bloc of cv.experiences.split(/\n\s*\n/).filter((b) => b.trim())) {
    const [tete, ...points] = bloc.split("\n");
    const [dates, poste, lieu] = tete.split("|").map((x) => x.trim());
    corps += P(`${poste || tete}`, { gras: true, avant: 4, apres: 0, garder: true }) + P([dates, lieu].filter(Boolean).join(" · "), { taille: 9.5, couleur: "5D6A62", apres: 2, garder: true });
    corps += points.filter((x) => x.trim()).map((x) => P("•  " + x.replace(/^\s*[-•]\s*/, ""), { apres: 1 })).join("");
  }
  corps += titre("Formation");
  corps += cv.formation.split("\n").filter(Boolean).map((l) => {
    const [dates, diplome, etab] = l.split("|").map((x) => x.trim());
    return P(diplome || l, { gras: true, apres: 0, garder: true }) + P([dates, etab].filter(Boolean).join(" · "), { taille: 9.5, couleur: "5D6A62", apres: 3 });
  }).join("");
  if (cv.publication.trim()) corps += titre("Publication") + P(cv.publication, { apres: 2 });
  corps += titre("Compétences") + cv.competences.split("\n").filter(Boolean).map((l) => {
    const i = l.indexOf(":");
    return i > 0 ? P(l, { apres: 1 }) : P(l, { apres: 1 });
  }).join("");
  if (cv.langues.trim()) corps += titre("Langues") + P(cv.langues, { apres: 1 });
  if (cv.interets.trim()) corps += titre("Centres d'intérêt") + P(cv.interets, { apres: 1 });
  return Docx.document(corps, { titre: "CV " + cv.nom, auteur: cv.nom, taille: 10, marge: 720, interligne: 245 });
}

async function actionCv(el, evt) {
  const nom = el.dataset.cv;
  const adapte = cvCourant !== "base" && cvAdaptes[cvCourant];
  const cv = adapte || cvBase;
  const o = cvCourant !== "base" && toutesOffres().find((x) => x.id === cvCourant);
  if (nom === "choix") {
    if (evt.type !== "change") return;
    cvCourant = el.value || "base"; ecrire("cv-courant", cvCourant);
    if (cvCourant !== "base" && !cvAdaptes[cvCourant]) {
      const offre = toutesOffres().find((x) => x.id === cvCourant);
      if (offre) { cvAdaptes[cvCourant] = adapter(offre); enregistrerCv(); }
    }
    return afficher();
  }
  if (evt.type !== "click") return;
  if (nom.startsWith("canva")) return actionCanva(nom, el, o);
  const fichier = `CV-Mestrallet${o ? "-" + (o.employeur || "offre").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").slice(0, 30) : ""}.docx`;
  switch (nom) {
    case "word": return Docx.telecharger(cvDocx(cv), fichier);
    case "dossier": await ajouterAuDossier(cvDocx(cv), fichier, "cv"); return toast("CV rangé dans l'onglet Dossier");
    case "refaire":
      if (!confirm("Remplacer cette version adaptée par une nouvelle, tirée du CV de base ?")) return;
      cvAdaptes[cvCourant] = adapter(o); enregistrerCv(); return afficher();
    case "claude": {
      const a = (o && o.analyse) || {};
      const texte = SECTIONS_CV.map(([k, n]) => `${n.toUpperCase()}\n${cv[k]}`).join("\n\n");
      const demande = `Relis mon CV${o ? " pour cette offre" : ""} en respectant les règles du projet : ne rien inventer, seulement réordonner, reformuler et mettre en avant ; une page ; écrire « Scientific Reports ».${o ? `

OFFRE : ${o.titre} · ${o.employeur || ""} · ${o.url || ""}
Compétences attendues : ${(a.competences || []).map((c) => c.nom).join(", ")}
Missions : ${(a.missions || []).join(" ; ")}` : ""}

MON CV
${nomCvTexte(cv)}
${texte}`;
      try { await navigator.clipboard.writeText(demande); toast("Demande copiée : colle-la dans ton projet Claude"); } catch { toast("Copie impossible"); }
      setTimeout(() => window.open("https://claude.ai/", "_blank", "noopener"), 600);
    }
  }
}
function nomCvTexte(cv) { return cv.nom; }

async function actionCanva(nom, el, o) {
  const i = el.dataset.i != null ? +el.dataset.i : null;
  switch (nom) {
    case "canva-ajouter": formCanva = {}; return afficher();
    case "canva-modifier": formCanva = Object.assign({ i }, cvCanva[i]); return afficher();
    case "canva-annuler": formCanva = null; return afficher();
    case "canva-supprimer":
      if (!confirm("Retirer ce design de la liste ? (il reste dans ton compte Canva)")) return;
      cvCanva = cvCanva.filter((_, k) => k !== formCanva.i); formCanva = null; enregistrerCv(); return afficher();
    case "canva-enregistrer": {
      const v = (k) => (document.getElementById("canva-" + k)?.value || "").trim();
      if (!/^https:\/\/(www\.)?canva\.com\//.test(v("lien"))) return toast("Colle un lien qui commence par https://www.canva.com/");
      if (v("embed") && !lienApercu({ embed: v("embed") })) return toast("Lien d'intégration non reconnu : copie-le depuis Partager › Intégrer");
      const id = (v("lien").match(/design\/([\w-]+)/) || [])[1] || "";
      const n = { id, nom: v("nom") || "CV Canva", lien: v("lien"), embed: v("embed") };
      if (formCanva.i != null) cvCanva[formCanva.i] = Object.assign({}, cvCanva[formCanva.i], n); else cvCanva = cvCanva.concat(n);
      formCanva = null; enregistrerCv(); afficher(); return toast("Enregistré");
    }
    case "canva-claude": {
      const x = cvCanva[i]; const a = (o && o.analyse) || {};
      const demande = o
        ? `Adapte mon CV Canva « ${x.nom} » (${x.lien}) à l'offre ci-dessous. Travaille sur une COPIE du design (ne touche pas à l'original), montre-moi les changements avant de valider. Règles du projet : ne rien inventer, seulement réordonner, reformuler et mettre en avant ; une page ; « Scientific Reports ».

OFFRE : ${o.titre} · ${o.employeur || ""} · ${o.lieu || ""} · ${o.url || ""}
Compétences attendues : ${(a.competences || []).map((c) => c.nom).join(", ")}
Missions : ${(a.missions || []).join(" ; ")}
Prérequis : ${(a.prerequis || []).join(" ; ")}`
        : `Modifie mon CV Canva « ${x.nom} » (${x.lien}). Ce que je veux changer : [écris ici]. Montre-moi avant de valider. Règles du projet : ne rien inventer, une page, « Scientific Reports ».`;
      try { await navigator.clipboard.writeText(demande); toast("Demande copiée : colle-la dans ton projet Claude"); } catch { toast("Copie impossible"); }
      return setTimeout(() => window.open("https://claude.ai/", "_blank", "noopener"), 600);
    }
  }
}
document.addEventListener("toggle", (e) => { if (e.target.classList?.contains("cv-texte")) ecrire("cv-texte-ouvert", e.target.open); }, true);

document.addEventListener("input", (e) => {
  const el = e.target.closest("[data-cv-champ]"); if (!el) return;
  const k = el.dataset.cvChamp;
  if (cvCourant !== "base" && cvAdaptes[cvCourant]) cvAdaptes[cvCourant][k] = el.value; else cvBase[k] = el.value;
  enregistrerCv(); ajuster(el);
});
document.addEventListener("change", (e) => { const el = e.target.closest("select[data-cv]"); if (el) actionCv(el, e); });
document.addEventListener("click", (e) => { const el = e.target.closest("button[data-cv]"); if (el) actionCv(el, e); });
