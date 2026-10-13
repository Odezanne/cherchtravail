"use strict";
/* Onglet Lettre : lettre de motivation pré-remplie à partir de l'offre et de mon modèle, modifiable, exportée en Word.
   Tout reste sur l'appareil (localStorage). */

const MODELE_DEFAUT = {
  coordonnees: "Eliott Mestrallet\nAdresse\nTéléphone\nAdresse e-mail",
  formation: "Ce master m'a formé à la modélisation statistique sous R, à la biostatistique et à la génétique des populations, "
    + "toujours en lien avec l'expérimentation et le terrain. Il faisait suite à une licence Diversité du vivant à Sorbonne Université, "
    + "avec une mineure en histoire naturelle.",
  competences: "Lors de mon stage de fin d'études à l'Université de Cambridge, j'ai conçu un protocole d'observation des macaques de Gibraltar, "
    + "recueilli 571 observations sur quatre groupes et analysé ces données sous R avec des modèles mixtes (GLMM, LMM, diagnostics DHARMa). "
    + "À l'INRAE de Jouy-en-Josas, j'ai développé des approches de suivi comportemental de larves de zebrafish et écrit des scripts d'analyse réutilisables. "
    + "Ces travaux de terrain ont contribué à un article publié dans Scientific Reports en 2026.",
  mediation: "Mon service civique au Jardin des Serres d'Auteuil, où j'ai conçu et animé des visites et des ateliers sur la biodiversité, "
    + "m'a appris à présenter des connaissances scientifiques à des publics variés. Mon anglais courant (IELTS 8.5) me permet par ailleurs "
    + "de travailler sans difficulté dans un environnement international.",
  dispo: "Disponible immédiatement, je serais heureux de vous présenter plus en détail mon parcours et ma motivation lors d'un entretien.",
  signature: "Eliott Mestrallet",
};
const A_COMPLETER = "[À compléter : ce qui t'attire précisément dans ce poste, cette équipe ou ce projet.]";
const BLOCS = [
  ["p1", "Candidature et diplôme"], ["p2", "Formation"], ["p3", "Compétences et expériences"],
  ["p4", "Communication"], ["p5", "Intérêt pour ce poste"], ["p6", "Disponibilité"],
];

let modele = Object.assign({}, MODELE_DEFAUT, lire("lettre-modele", {}));
let lettres = lire("lettres", {});
let lettreCourante = lire("lettre-courante", null);
let modeleOuvert = false;

function minusculeInitiale(t) {
  t = String(t || "").trim();
  return /^[A-ZÉÈ]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1);
}
function sansPoint(t) { return String(t || "").trim().replace(/[.;]+$/, ""); }
function enumeration(l) { return l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " et " + l[l.length - 1]; }
function referenceDe(o) {
  const m = /^(?:cnrs|csp)-(.+)$/.exec(o.id || ""); return m ? m[1] : "";
}
const NOMS_EMPLOYEURS = {
  cnrs: "le CNRS", inrae: "l'INRAE", mnhn: "le Muséum national d'Histoire naturelle", inserm: "l'Inserm",
  "institut pasteur": "l'Institut Pasteur", ird: "l'IRD", anses: "l'Anses", ofb: "l'Office français de la biodiversité",
  cea: "le CEA", agroparistech: "AgroParisTech",
};
function avecArticle(e) { return NOMS_EMPLOYEURS[String(e || "").trim().toLowerCase()] || e; }
const SOURCES_PHRASE = {
  CNRS: "le portail emploi du CNRS", MNHN: "le site Choisir le service public", "Choisir le service public": "le site Choisir le service public",
  "France Travail": "le site de France Travail", "Welcome to the Jungle": "Welcome to the Jungle",
};
function de(t) { return /^[aeiouyéèêàâîôûh]/i.test(t) ? "d'" + t : "de " + t; }
function propre(t) { return String(t || "").replace(/\s+/g, " ").trim(); }
function dateLongue() { return new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); }

function brouillon(o) {
  const a = o.analyse || {};
  const these = o.type === "these";
  const ref = referenceDe(o);
  const employeur = avecArticle(propre(o.employeur));
  const titre = propre(o.titre);
  const vu = o.source && !["Alerte e-mail", "Ajout manuel"].includes(o.source) ? `, dont j'ai pris connaissance sur ${SOURCES_PHRASE[o.source] || o.source}` : "";
  const poste = these ? `pour le sujet de thèse « ${titre} »` : `au poste ${de(minusculeInitiale(titre))}`;
  const p1 = `Je vous adresse ma candidature ${poste}${ref ? ` (référence ${ref})` : ""}${employeur ? ` proposé par ${employeur}` : ""}`
    + `${o.lieu ? ` à ${o.lieu}` : ""}${vu}. Titulaire d'un master en biologie quantitative (parcours PRIAM, AgroParisTech et Université Paris-Saclay, `
    + `mention Bien), je souhaite mettre au service de votre équipe mes compétences en analyse de données et en étude du comportement animal.`;
  const ok = (a.competences || []).filter((c) => c.ok).map((c) => minusculeInitiale(sansPoint(c.nom))).slice(0, 4);
  let p3 = modele.competences;
  if (ok.length) p3 += ` Ces expériences m'ont permis d'acquérir plusieurs des compétences que vous recherchez : ${enumeration(ok)}.`;
  if ((a.bloquants || []).some((b) => b.type === "experience")) {
    p3 += " S'il s'agit de mon premier emploi, mes dix mois de stages de recherche m'ont confronté à toutes les étapes d'un projet, "
      + "de la conception du protocole jusqu'à la publication.";
  }
  const missions = (a.missions || []).slice(0, 2).map((m) => minusculeInitiale(sansPoint(m)));
  let p5 = missions.length
    ? `Les missions proposées, en particulier ${enumeration(missions)}, correspondent exactement à ce que je souhaite développer. ${A_COMPLETER}`
    : A_COMPLETER;
  if (these || a.lien_these) p5 += " Ce poste s'inscrit aussi pleinement dans mon projet de préparer une thèse en comportement animal.";
  return {
    destinataire: [propre(o.employeur), o.lieu].filter(Boolean).join("\n") || "Service recrutement",
    date: `Paris, le ${dateLongue()}`,
    objet: `Candidature ${these ? "au sujet de thèse " + minusculeInitiale(titre) : "au poste " + de(minusculeInitiale(titre))}${ref ? ` (réf. ${ref})` : ""}`,
    appel: "Madame, Monsieur,",
    p1, p2: modele.formation, p3, p4: modele.mediation, p5, p6: modele.dispo,
    formule: "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.",
  };
}

function offresPourLettre() {
  const suivies = offresSuivies();
  const ids = new Set(suivies.map((o) => o.id));
  const autres = donnees.offres.filter((o) => !ids.has(o.id) && !(suivi[o.id] || {}).masque && (o.analyse?.score ?? 0) >= 45)
    .sort((x, y) => (y.analyse?.score ?? 0) - (x.analyse?.score ?? 0)).slice(0, 40);
  return { suivies, autres };
}

function texteLettre(l) {
  return [modele.coordonnees, "", l.destinataire, "", l.date, "", "Objet : " + l.objet, "", l.appel, "",
    ...BLOCS.map(([k]) => l[k]).filter(Boolean).flatMap((t) => [t, ""]), l.formule, "", modele.signature].join("\n");
}

function verifications(l) {
  const corps = [l.objet, l.appel, ...BLOCS.map(([k]) => l[k]), l.formule].join(" ");
  const mots = corps.split(/\s+/).filter(Boolean).length;
  const res = [];
  res.push(mots <= 400 ? { ok: true, t: `${mots} mots : tient sur une page` } : { ok: false, t: `${mots} mots : risque de dépasser une page (vise 400 au maximum)` });
  const tirets = (corps.match(/[—–]/g) || []).length;
  res.push(tirets ? { ok: false, t: `${tirets} tiret(s) long(s) à remplacer par des virgules` } : { ok: true, t: "Aucun tiret long" });
  if (/\bNature\b/.test(corps)) res.push({ ok: false, t: "Écris « Scientific Reports », pas « Nature »" });
  if (corps.includes("[À compléter")) res.push({ ok: false, t: "Il reste un passage [À compléter]" });
  if (/serres d'auteuil/i.test(corps) && /\bje (fais|suis en|réalise) (un|mon) service civique/i.test(corps)) {
    res.push({ ok: false, t: "Le service civique est terminé : parles-en au passé" });
  }
  return res;
}
function rendreVerifs(l) {
  return verifications(l).map((v) => `<li class="${v.ok ? "ok" : "ko"}">${v.ok ? "✓" : "!"} ${esc(v.t)}</li>`).join("");
}

function rendreLettre() {
  const { suivies, autres } = offresPourLettre();
  const o = lettreCourante && toutesOffres().find((x) => x.id === lettreCourante);
  const opt = (x) => `<option value="${esc(x.id)}" ${o && x.id === o.id ? "selected" : ""}>${esc(x.titre.slice(0, 70))}${x.employeur ? " · " + esc(x.employeur.slice(0, 25)) : ""}</option>`;
  let h = `<div class="lettre">
    <label class="champ-l">Offre visée
      <select data-lettre="choix"><option value="">Choisis une offre…</option>
        ${suivies.length ? `<optgroup label="Mes candidatures">${suivies.map(opt).join("")}</optgroup>` : ""}
        ${autres.length ? `<optgroup label="Offres les plus proches de mon profil">${autres.map(opt).join("")}</optgroup>` : ""}
      </select></label>`;
  if (!o) {
    h += `<p class="vide-petit">Choisis une offre : la lettre se remplit toute seule avec le poste, l'employeur, tes compétences qui collent
      à l'offre et ton modèle. Tu peux aussi partir d'une fiche d'offre avec le bouton « Adapter ma lettre à cette offre ».</p>`;
  } else {
    const l = lettres[o.id] || (lettres[o.id] = brouillon(o));
    h += `<ul class="verifs" id="verifs">${rendreVerifs(l)}</ul>
      <div class="lettre-papier">
        <label class="champ-l">Destinataire<textarea data-lettre="destinataire" rows="2">${esc(l.destinataire)}</textarea></label>
        <label class="champ-l">Lieu et date<input data-lettre="date" value="${esc(l.date)}"></label>
        <label class="champ-l">Objet<input data-lettre="objet" value="${esc(l.objet)}"></label>
        <label class="champ-l">Appel<input data-lettre="appel" value="${esc(l.appel)}"></label>
        ${BLOCS.map(([k, nom]) => `<label class="champ-l">${nom}<textarea data-lettre="${k}" rows="5" class="${String(l[k]).includes("[À compléter") ? "a-completer" : ""}">${esc(l[k])}</textarea></label>`).join("")}
        <label class="champ-l">Formule de politesse<textarea data-lettre="formule" rows="2">${esc(l.formule)}</textarea></label>
      </div>
      <div class="actions">
        <button class="bouton principal" data-lettre="word">Télécharger en Word</button>
        <div class="actions-ligne deux">
          <button class="bouton" data-lettre="dossier">Ranger dans Dossier</button>
          <button class="bouton" data-lettre="copier">Copier le texte</button>
        </div>
        <button class="bouton" data-lettre="claude">Faire relire par Claude</button>
        <button class="lien" data-lettre="refaire">Repartir du modèle pour cette offre</button>
      </div>`;
  }
  h += `<details class="modele" ${modeleOuvert ? "open" : ""} data-lettre-details>
      <summary>Mon modèle (coordonnées et paragraphes communs à toutes les lettres)</summary>
      <p class="vide-petit">Ces textes servent de base à chaque nouvelle lettre. Tes coordonnées restent sur ce téléphone.</p>
      <label class="champ-l">Coordonnées (en haut à gauche)<textarea data-modele="coordonnees" rows="4">${esc(modele.coordonnees)}</textarea></label>
      <label class="champ-l">Formation<textarea data-modele="formation" rows="4">${esc(modele.formation)}</textarea></label>
      <label class="champ-l">Compétences et expériences<textarea data-modele="competences" rows="6">${esc(modele.competences)}</textarea></label>
      <label class="champ-l">Communication<textarea data-modele="mediation" rows="4">${esc(modele.mediation)}</textarea></label>
      <label class="champ-l">Disponibilité<textarea data-modele="dispo" rows="2">${esc(modele.dispo)}</textarea></label>
      <label class="champ-l">Signature<input data-modele="signature" value="${esc(modele.signature)}"></label>
      <button class="lien" data-lettre="modele-defaut">Revenir au modèle d'origine</button>
    </details></div>`;
  return h;
}

function rechargerLettres() {
  lettres = lire("lettres", {}); modele = Object.assign({}, MODELE_DEFAUT, lire("lettre-modele", {}));
}
function ajuster(t) { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; }
function ajusterTout() { document.querySelectorAll("#liste textarea").forEach(ajuster); }

function ouvrirLettre(id) {
  lettreCourante = id; ecrire("lettre-courante", id);
  etat.onglet = "lettre"; afficher(); window.scrollTo(0, 0);
}

function nomFichier(o, ext) {
  const base = (o.employeur || o.titre || "offre").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `Lettre-Mestrallet-${base}.${ext}`;
}

function lettreDocx(l) {
  const P = Docx.p;
  const corps = P(modele.coordonnees, { apres: 12 })
    + P(l.destinataire, { align: "right", apres: 12 })
    + P(l.date, { align: "right", apres: 18 })
    + P("Objet : " + l.objet, { gras: true, apres: 18 })
    + P(l.appel, { apres: 10 })
    + BLOCS.map(([k]) => l[k]).filter(Boolean).map((t) => P(t, { align: "both", apres: 8 })).join("")
    + P(l.formule, { align: "both", apres: 24 })
    + P(modele.signature, { align: "right" });
  return Docx.document(corps, { titre: "Lettre de motivation", auteur: modele.signature, taille: 11 });
}

async function actionLettre(el, evt) {
  const nom = el.dataset.lettre;
  const o = lettreCourante && toutesOffres().find((x) => x.id === lettreCourante);
  const l = o && lettres[o.id];
  if (nom === "choix") { if (evt.type === "change") ouvrirLettre(el.value || null); return; }
  if (["destinataire", "date", "objet", "appel", "formule", ...BLOCS.map(([k]) => k)].includes(nom)) {
    if (!l) return;
    l[nom] = el.value; ecrire("lettres", lettres);
    if (el.tagName === "TEXTAREA") { el.classList.toggle("a-completer", el.value.includes("[À compléter")); ajuster(el); }
    const v = $("#verifs"); if (v) v.innerHTML = rendreVerifs(l);
    return;
  }
  if (evt.type !== "click") return;
  switch (nom) {
    case "word": return Docx.telecharger(lettreDocx(l), nomFichier(o, "docx"));
    case "dossier":
      await ajouterAuDossier(lettreDocx(l), nomFichier(o, "docx"), "lettre");
      return toast("Lettre rangée dans l'onglet Dossier");
    case "copier":
      try { await navigator.clipboard.writeText(texteLettre(l)); toast("Lettre copiée"); } catch { toast("Copie impossible sur cet appareil"); }
      return;
    case "claude": {
      const a = o.analyse || {};
      const demande = `Relis et améliore ma lettre de motivation pour cette offre, en respectant les règles du projet (« Madame, Monsieur, » seul sur sa ligne, candidature puis diplôme, pas de tirets longs, une page maximum, ton sobre et concret, rien d'inventé). Complète le passage [À compléter] à partir de l'offre.

OFFRE
Poste : ${o.titre}
Employeur : ${o.employeur || "?"} · ${o.lieu || ""}
Lien : ${o.url || "?"}
Résumé : ${a.resume || ""}
Missions : ${(a.missions || []).join(" ; ")}
Compétences attendues : ${(a.competences || []).map((c) => c.nom).join(", ")}

MA LETTRE
${texteLettre(l)}`;
      try { await navigator.clipboard.writeText(demande); toast("Demande copiée : colle-la dans ton projet Claude"); }
      catch { toast("Copie impossible sur cet appareil"); }
      setTimeout(() => window.open("https://claude.ai/", "_blank", "noopener"), 600);
      return;
    }
    case "refaire":
      if (!confirm("Remplacer cette lettre par une nouvelle version tirée du modèle ?")) return;
      lettres[o.id] = brouillon(o); ecrire("lettres", lettres); return afficher();
    case "modele-defaut":
      if (!confirm("Revenir au modèle d'origine ? Tes coordonnées seront conservées.")) return;
      modele = Object.assign({}, MODELE_DEFAUT, { coordonnees: modele.coordonnees }); ecrire("lettre-modele", modele); return afficher();
  }
}

document.addEventListener("input", (e) => {
  const el = e.target.closest("[data-lettre]");
  if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) actionLettre(el, e);
  const m = e.target.closest("[data-modele]");
  if (m) { modele[m.dataset.modele] = m.value; ecrire("lettre-modele", modele); if (m.tagName === "TEXTAREA") ajuster(m); }
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("select[data-lettre]"); if (el) actionLettre(el, e);
});
document.addEventListener("click", (e) => {
  const el = e.target.closest("button[data-lettre]"); if (el) actionLettre(el, e);
});
document.addEventListener("toggle", (e) => {
  if (e.target.matches && e.target.matches("[data-lettre-details]")) { modeleOuvert = e.target.open; ajusterTout(); }
}, true);
