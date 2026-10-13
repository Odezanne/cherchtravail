"use strict";
/* Onglet Labos : laboratoires et équipes à contacter (candidatures spontanées, piste thèse ou CIFRE),
   avec contact, statut et date de relance. Jobot rappelle les relances dans le condensé. */

const STATUTS_LABO = {
  a_contacter: { nom: "À contacter", couleur: "" }, contacte: { nom: "Contacté", couleur: "bleu" },
  relance: { nom: "Relancé", couleur: "bleu" }, rdv: { nom: "Échange prévu", couleur: "ambre" },
  piste: { nom: "Piste ouverte", couleur: "vert" }, non: { nom: "Pas de suite", couleur: "gris" },
};
const LABOS_DEPART = [
  ["ESE, Écologie Systématique Évolution", "Université Paris-Saclay, CNRS, AgroParisTech", "Gif-sur-Yvette", "Écologie, évolution, comportement"],
  ["CESCO, Centre d'écologie et des sciences de la conservation", "MNHN", "Paris 5e", "Conservation, sciences participatives (Vigie-Nature)"],
  ["MECADEV, Mécanismes adaptatifs et évolution", "MNHN, CNRS", "Paris / Brunoy", "Adaptations, comportement, physiologie"],
  ["Éco-anthropologie", "MNHN, Musée de l'Homme", "Paris 16e", "Primatologie, interactions homme-nature"],
  ["iEES-Paris, Institut d'écologie et des sciences de l'environnement", "Sorbonne Université", "Paris 5e", "Écologie, écologie urbaine"],
  ["LEEC, Laboratoire d'éthologie expérimentale et comparée", "Université Sorbonne Paris Nord", "Villetaneuse", "Éthologie, cognition"],
  ["LECD, Laboratoire éthologie cognition développement", "Université Paris Nanterre", "Nanterre", "Éthologie, cognition animale"],
  ["NeuroPSI, Institut des neurosciences Paris-Saclay", "Université Paris-Saclay, CNRS", "Saclay", "Neurosciences comportementales"],
  ["GABI, Génétique animale et biologie intégrative", "INRAE, AgroParisTech", "Jouy-en-Josas", "Génétique des populations, conservation"],
  ["IERP, Infectiologie expérimentale des rongeurs et poissons", "INRAE", "Jouy-en-Josas", "Zebrafish, suivi comportemental"],
];
let labos = lire("labos", null);
if (!labos) {
  labos = LABOS_DEPART.map(([nom, institution, lieu, theme], i) => ({ id: "labo-" + i, nom, institution, lieu, theme, statut: "a_contacter" }));
  ecrire("labos", labos);
}
let formLabo = null;

function relanceDue(l) { return l.relance_le && l.relance_le <= aujourdHui() && ["contacte", "relance"].includes(l.statut); }
function plusJours(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

function rendreLabos() {
  let h = `<div class="suivi-actions un"><button class="bouton principal" data-labo="nouveau">+ Ajouter un labo ou une équipe</button></div>
    <p class="vide-petit">Pour les candidatures spontanées et la piste thèse ou CIFRE. Note qui tu as contacté et quand relancer : Jobot te le rappellera dans le condensé.</p>`;
  if (formLabo) h += formulaireLabo(formLabo);
  const dus = labos.filter(relanceDue);
  if (dus.length) {
    h += `<h2 class="groupe">À relancer (${dus.length})</h2>` + dus.map(carteLabo).join("");
  }
  for (const [cle, st] of Object.entries(STATUTS_LABO)) {
    const groupe = labos.filter((l) => l.statut === cle && !dus.includes(l));
    if (!groupe.length) continue;
    h += `<h2 class="groupe">${st.nom} (${groupe.length})</h2>` + groupe.map(carteLabo).join("");
  }
  return h;
}

function carteLabo(l) {
  const st = STATUTS_LABO[l.statut] || STATUTS_LABO.a_contacter;
  const due = relanceDue(l);
  const infos = [l.contact, l.date_contact && `contacté le ${dateFr(l.date_contact)}`,
    l.relance_le && ["contacte", "relance"].includes(l.statut) && `relance le ${dateFr(l.relance_le)}`].filter(Boolean);
  const recherche = "https://www.google.com/search?q=" + encodeURIComponent(l.nom + " " + (l.institution || "") + " équipe");
  return `<div class="labo ${due ? "due" : ""}">
    <button class="labo-corps" data-labo="modifier" data-id="${esc(l.id)}">
      <strong>${esc(l.nom)}</strong>
      <span>${esc([l.institution, l.lieu].filter(Boolean).join(" · "))}</span>
      ${l.theme ? `<span class="theme">${esc(l.theme)}</span>` : ""}
      ${infos.length ? `<span>${esc(infos.join(" · "))}</span>` : ""}
    </button>
    <div class="labo-actions">
      <span class="pastille-statut ${st.couleur}">${st.nom}</span>
      ${l.email ? `<a class="mini" href="mailto:${esc(l.email)}" aria-label="Écrire">✉</a>` : ""}
      <a class="mini" href="${esc(l.lien || recherche)}" target="_blank" rel="noopener" aria-label="${l.lien ? "Page du labo" : "Chercher le labo"}">↗</a>
      ${l.statut === "a_contacter" ? `<button class="mini" data-labo="contacte" data-id="${esc(l.id)}" aria-label="Je l'ai contacté aujourd'hui">✓</button>` : ""}
      ${["contacte", "relance"].includes(l.statut) ? `<button class="mini" data-labo="relance" data-id="${esc(l.id)}" aria-label="Je viens de relancer">↻</button>` : ""}
    </div></div>`;
}

function formulaireLabo(l) {
  const champ = (id, nom, val, ph = "") => `<label>${nom}<input id="labo-${id}" value="${esc(val || "")}" placeholder="${esc(ph)}"></label>`;
  return `<div class="bloc-export bloc-evt">
    <h3 class="sous-groupe" style="margin-top:0">${l.id ? "Modifier" : "Nouveau"} labo</h3>
    ${champ("nom", "Labo ou équipe", l.nom, "ex. Équipe Comportement, ESE")}
    ${champ("institution", "Institution", l.institution, "ex. Université Paris-Saclay, CNRS")}
    <div class="suivi-champs">${champ("lieu", "Lieu", l.lieu)}${champ("theme", "Thème", l.theme)}</div>
    <div class="suivi-champs">${champ("contact", "Contact", l.contact, "Nom, fonction")}${champ("email", "E-mail", l.email)}</div>
    ${champ("lien", "Page du labo ou des offres", l.lien, "https://…")}
    <label>Statut<select id="labo-statut">${Object.entries(STATUTS_LABO).map(([k, v]) => `<option value="${k}" ${k === (l.statut || "a_contacter") ? "selected" : ""}>${v.nom}</option>`).join("")}</select></label>
    <div class="suivi-champs">
      <label>Contacté le<input type="date" id="labo-date_contact" value="${esc(l.date_contact || "")}"></label>
      <label>Relancer le<input type="date" id="labo-relance_le" value="${esc(l.relance_le || "")}"></label>
    </div>
    <label class="case"><input type="checkbox" id="labo-these" ${l.these ? "checked" : ""}> Piste de thèse ou de CIFRE</label>
    <label>Notes<textarea id="labo-notes" rows="3" placeholder="Ce qui a été dit, sujet possible, prochaine étape…">${esc(l.notes || "")}</textarea></label>
    <div class="actions-ligne deux">
      <button class="bouton principal" data-labo="enregistrer">Enregistrer</button>
      <button class="bouton" data-labo="annuler">Annuler</button>
    </div>
    ${l.id ? `<button class="bouton" data-labo="claude" data-id="${esc(l.id)}" style="margin-top:8px">Préparer un mail de candidature spontanée avec Claude</button>
      <button class="lien rouge" data-labo="supprimer" data-id="${esc(l.id)}">Supprimer ce labo</button>` : ""}
  </div>`;
}

function enregistrerLabos() { ecrire("labos", labos); }

async function actionLabo(el) {
  const nom = el.dataset.labo, id = el.dataset.id;
  const l = id && labos.find((x) => x.id === id);
  switch (nom) {
    case "nouveau": formLabo = { statut: "a_contacter" }; afficher(); return window.scrollTo(0, 0);
    case "modifier": formLabo = Object.assign({}, l); afficher(); return window.scrollTo(0, 0);
    case "annuler": formLabo = null; return afficher();
    case "enregistrer": {
      const v = (k) => (document.getElementById("labo-" + k)?.value || "").trim();
      if (!v("nom")) return toast("Indique au moins le nom du labo");
      const n = { id: formLabo.id || "labo-" + Date.now(), nom: v("nom"), institution: v("institution"), lieu: v("lieu"), theme: v("theme"),
        contact: v("contact"), email: v("email"), lien: v("lien"), statut: v("statut"), date_contact: v("date_contact"),
        relance_le: v("relance_le"), notes: v("notes"), these: document.getElementById("labo-these").checked };
      if (["contacte", "relance"].includes(n.statut) && !n.relance_le) n.relance_le = plusJours(14);
      if (n.statut !== "a_contacter" && !n.date_contact) n.date_contact = aujourdHui();
      labos = labos.filter((x) => x.id !== n.id).concat(n); enregistrerLabos(); formLabo = null; afficher();
      return toast(n.relance_le && ["contacte", "relance"].includes(n.statut) ? `Enregistré. Relance prévue le ${dateFr(n.relance_le)}` : "Enregistré");
    }
    case "contacte":
      Object.assign(l, { statut: "contacte", date_contact: aujourdHui(), relance_le: plusJours(14) }); enregistrerLabos(); afficher();
      return toast("Noté. Je te rappelle de relancer dans 2 semaines");
    case "relance":
      Object.assign(l, { statut: "relance", date_contact: aujourdHui(), relance_le: plusJours(14) }); enregistrerLabos(); afficher();
      return toast("Relance notée. Prochain rappel dans 2 semaines");
    case "supprimer":
      if (!confirm(`Supprimer « ${l.nom} » ?`)) return;
      labos = labos.filter((x) => x.id !== id); enregistrerLabos(); formLabo = null; return afficher();
    case "claude": {
      const demande = `Rédige un mail court de candidature spontanée (ou de prise de contact pour une thèse ou une CIFRE) en suivant les règles du projet (« Madame, Monsieur, » ou appel nominatif, ton sobre et concret, pas de tirets longs, rien d'inventé).

Labo : ${l.nom}${l.institution ? " (" + l.institution + ")" : ""}, ${l.lieu || ""}
Thème : ${l.theme || ""}
Contact : ${l.contact || "inconnu"}
Ce que je vise : ${l.these ? "une thèse ou une CIFRE, ou un CDD d'ingénieur d'études qui y mène" : "un CDD d'ingénieur d'études ou de recherche"}
Notes : ${l.notes || ""}`;
      try { await navigator.clipboard.writeText(demande); toast("Demande copiée : colle-la dans ton projet Claude"); } catch { toast("Copie impossible"); }
      return setTimeout(() => window.open("https://claude.ai/", "_blank", "noopener"), 600);
    }
  }
}

document.addEventListener("click", (e) => { const el = e.target.closest("button[data-labo]"); if (el) actionLabo(el); });
