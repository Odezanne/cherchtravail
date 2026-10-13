"use strict";
/* Suivi des candidatures : statuts, cases « postulé », entretiens, calendrier, export vers le calendrier iPhone.
   Tout est enregistré sur l'appareil (localStorage) ; un bouton permet de sauvegarder / restaurer. */

const STATUTS = {
  a_postuler: { nom: "À postuler", couleur: "neutre" },
  postule: { nom: "Postulé", couleur: "vert" },
  entretien: { nom: "Entretien", couleur: "ambre" },
  offre: { nom: "Offre reçue", couleur: "vert" },
  refus: { nom: "Refus", couleur: "gris" },
};
let perso = lire("perso", []);
/* Formations, rendez-vous France Travail, ateliers… : à part des candidatures, jamais dans l'export Word */
let evenements = lire("evenements", []);
let formEvt = null; // null = fermé ; {} = nouvel événement ; {id…} = modification
const TYPES_EVT = { formation: "Formation", rdv_ft: "Rendez-vous France Travail", atelier: "Atelier / réunion", autre: "Autre" };
let moisAffiche = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();

function suiviDe(id) { return (suivi[id] = suivi[id] || {}); }
function statutDe(id) {
  const s = suivi[id] || {};
  return s.statut || (s.postule ? "postule" : s.fav ? "a_postuler" : null);
}
function toutesOffres() {
  const ids = new Set(donnees.offres.map((o) => o.id));
  const base = donnees.offres.concat(perso.filter((o) => !ids.has(o.id)));
  return typeof offresRecherches === "function" ? base.concat(offresRecherches().filter((o) => !perso.some((p) => p.id === o.id))) : base;
}
function offresSuivies() { return toutesOffres().filter((o) => statutDe(o.id)); }
function nbSuivis() { return offresSuivies().length; }
function enregistrer() { ecrire("suivi", suivi); ecrire("perso", perso); }
function aujourdHui() { return new Date().toISOString().slice(0, 10); }

function tousEntretiens() {
  const liste = [];
  for (const o of toutesOffres()) {
    for (const [i, e] of ((suivi[o.id] || {}).entretiens || []).entries()) liste.push({ o, e, i });
  }
  return liste.sort((a, b) => (a.e.date + (a.e.heure || "")).localeCompare(b.e.date + (b.e.heure || "")));
}

/* ------------------------------------------------------------- Onglet Candidatures */

function rendreSuivi() {
  const entretiens = tousEntretiens();
  const avenir = entretiens.filter((x) => x.e.date >= aujourdHui());
  const suivies = offresSuivies();
  let h = `<div class="suivi-actions">
      <button class="bouton principal" data-suivi="ajouter">+ Candidature</button>
      <button class="bouton evt" data-suivi="evt-nouveau">+ Formation ou rendez-vous</button>
    </div>`;
  if (formEvt) h += formulaireEvt(formEvt);

  // Agenda : entretiens (liés aux candidatures) et événements (formations, rendez-vous), bien distingués
  const evtsAvenir = evenements.filter((e) => e.date >= aujourdHui());
  const agenda = avenir.map((x) => ({ date: x.e.date, heure: x.e.heure || "", x, genre: "entretien" }))
    .concat(evtsAvenir.map((e) => ({ date: e.date, heure: e.heure || "", e, genre: "evt" })))
    .sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
  h += `<h2 class="groupe">À venir</h2>`;
  h += agenda.length ? agenda.map((it) => it.genre === "entretien" ? `
      <div class="entretien-ligne">
        <div class="entretien-date"><b>${dateFr(it.x.e.date, { day: "numeric" })}</b><span>${dateFr(it.x.e.date, { month: "short" })}</span></div>
        <button class="entretien-corps" data-ouvrir="${esc(it.x.o.id)}">
          <strong>Entretien · ${esc(it.x.o.titre)}</strong>
          <span>${esc([it.x.e.heure, it.x.e.lieu, it.x.o.employeur].filter(Boolean).join(" · "))}</span>
        </button>
        <button class="mini" data-suivi="ics" data-id="${esc(it.x.o.id)}" data-i="${it.x.i}" aria-label="Ajouter au calendrier du téléphone">📅</button>
      </div>` : `
      <div class="entretien-ligne evt-ligne">
        <div class="entretien-date evt-date"><b>${dateFr(it.e.date, { day: "numeric" })}</b><span>${dateFr(it.e.date, { month: "short" })}</span></div>
        <button class="entretien-corps" data-suivi="evt-modifier" data-id="${esc(it.e.id)}">
          <strong>${esc(it.e.titre)}${it.e.obligatoire ? ` <span class="tag-oblig">Obligatoire</span>` : ""}</strong>
          <span>${esc([TYPES_EVT[it.e.type] || "", it.e.heure && (it.e.heure + (it.e.fin ? "–" + it.e.fin : "")), it.e.lieu].filter(Boolean).join(" · "))}</span>
        </button>
        <button class="mini" data-suivi="evt-ics" data-id="${esc(it.e.id)}" aria-label="Ajouter au calendrier du téléphone">📅</button>
      </div>`).join("")
    : `<p class="vide-petit">Rien de prévu. Les entretiens s'ajoutent depuis la fiche d'une offre, les formations et rendez-vous avec le bouton ci-dessus.</p>`;

  h += rendreCalendrier(entretiens);

  const exp = lire("export-periode", {});
  const nbPostulees = suivies.filter((o) => statutDe(o.id) !== "a_postuler").length;
  h += `<h2 class="groupe">Pour ma conseillère France Travail</h2>
    <div class="bloc-export">
      <p class="vide-petit" style="margin:0 0 8px">Tableau Word de tes candidatures envoyées : date, intitulé, employeur, salaire, résumé de l'offre et suite donnée.
        Tes formations et rendez-vous n'y figurent pas.</p>
      <div class="suivi-champs">
        <label>Du<input type="date" data-suivi="export-du" value="${esc(exp.du || "")}"></label>
        <label>Au<input type="date" data-suivi="export-au" value="${esc(exp.au || "")}"></label>
      </div>
      <button class="bouton principal" data-suivi="export-word" ${nbPostulees ? "" : "disabled"}>Exporter en Word (${nbPostulees} candidature${nbPostulees > 1 ? "s" : ""})</button>
    </div>`;

  const passes = evenements.filter((e) => e.date < aujourdHui()).sort((a, b) => b.date.localeCompare(a.date));
  if (passes.length) {
    h += `<details class="evts-passes"><summary>Formations et rendez-vous passés (${passes.length})</summary>${passes.map((e) => `
      <button class="evt-passe" data-suivi="evt-modifier" data-id="${esc(e.id)}">${dateFr(e.date, { day: "numeric", month: "short", year: "numeric" })} · ${esc(e.titre)} <span>${esc(TYPES_EVT[e.type] || "")}</span></button>`).join("")}</details>`;
  }

  h += `<h2 class="groupe">Mes candidatures (${suivies.length})</h2>`;
  if (!suivies.length) {
    h += `<p class="vide-petit">Ouvre une offre et choisis un statut (« À postuler », « Postulé »…) pour la suivre ici.</p>`;
  }
  for (const [cle, st] of Object.entries(STATUTS)) {
    const groupe = suivies.filter((o) => statutDe(o.id) === cle);
    if (!groupe.length) continue;
    h += `<h3 class="sous-groupe">${st.nom} · ${groupe.length}</h3>`;
    h += groupe.map((o) => {
      const s = suivi[o.id] || {};
      const fait = cle !== "a_postuler";
      return `<div class="case-ligne ${fait ? "faite" : ""}">
        <input type="checkbox" ${fait ? "checked" : ""} data-suivi="cocher" data-id="${esc(o.id)}"
          aria-label="Marquer comme postulé : ${esc(o.titre)}">
        <button class="case-corps" data-ouvrir="${esc(o.id)}">
          <strong>${esc(o.titre)}</strong>
          <span>${esc([o.employeur, o.lieu].filter(Boolean).join(" · "))}${s.date_postule ? ` · postulé le ${dateFr(s.date_postule)}` : ""}</span>
        </button>
        <span class="pastille-statut ${st.couleur}">${st.nom}</span>
      </div>`;
    }).join("");
  }
  h += `<p class="vide-petit" style="margin-top:14px"><button class="lien" data-suivi="sauvegarde">Sauvegarder / restaurer mes candidatures dans un fichier</button></p>`;
  return h;
}

function formulaireEvt(e) {
  return `<div class="bloc-export bloc-evt">
    <h3 class="sous-groupe" style="margin-top:0">${e.id ? "Modifier" : "Nouvel"} événement</h3>
    <label>Intitulé<input id="evt-titre" value="${esc(e.titre || "")}" placeholder="ex. Atelier CV France Travail"></label>
    <label>Type<select id="evt-type">${Object.entries(TYPES_EVT).map(([k, v]) => `<option value="${k}" ${k === (e.type || "formation") ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <div class="suivi-champs">
      <label>Date<input type="date" id="evt-date" value="${esc(e.date || "")}"></label>
      <label>Début<input type="time" id="evt-heure" value="${esc(e.heure || "")}"></label>
    </div>
    <div class="suivi-champs">
      <label>Fin<input type="time" id="evt-fin" value="${esc(e.fin || "")}"></label>
      <label>Lieu ou lien<input id="evt-lieu" value="${esc(e.lieu || "")}" placeholder="Agence, visio…"></label>
    </div>
    <label class="case"><input type="checkbox" id="evt-oblig" ${e.obligatoire !== false ? "checked" : ""}> Présence obligatoire</label>
    <label>Notes<textarea id="evt-notes" rows="2" placeholder="Documents à apporter, contact…">${esc(e.notes || "")}</textarea></label>
    <div class="actions-ligne deux">
      <button class="bouton principal" data-suivi="evt-enregistrer">Enregistrer</button>
      <button class="bouton" data-suivi="evt-annuler">Annuler</button>
    </div>
    ${e.id ? `<button class="lien rouge" data-suivi="evt-supprimer" data-id="${esc(e.id)}">Supprimer cet événement</button>` : ""}
  </div>`;
}

function rendreCalendrier(entretiens) {
  const jours = new Set(entretiens.map((x) => x.e.date));
  const joursEvt = new Set(evenements.map((e) => e.date));
  const an = moisAffiche.getFullYear(), m = moisAffiche.getMonth();
  const premier = (new Date(an, m, 1).getDay() + 6) % 7; // lundi = 0
  const nb = new Date(an, m + 1, 0).getDate();
  const auj = aujourdHui();
  let cases = "";
  for (let i = 0; i < premier; i++) cases += `<span></span>`;
  for (let j = 1; j <= nb; j++) {
    const iso = `${an}-${String(m + 1).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
    cases += `<span class="${jours.has(iso) ? "a-rdv" : ""} ${joursEvt.has(iso) ? "a-evt" : ""} ${iso === auj ? "auj" : ""}">${j}</span>`;
  }
  return `<div class="calendrier">
    <div class="cal-tete">
      <button class="mini" data-suivi="mois" data-d="-1" aria-label="Mois précédent">‹</button>
      <strong>${moisAffiche.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</strong>
      <button class="mini" data-suivi="mois" data-d="1" aria-label="Mois suivant">›</button>
    </div>
    <div class="cal-grille"><i>L</i><i>M</i><i>M</i><i>J</i><i>V</i><i>S</i><i>D</i>${cases}</div>
    <div class="cal-legende"><span class="pt rdv"></span>Entretien <span class="pt evt"></span>Formation ou rendez-vous</div>
  </div>`;
}

/* ------------------------------------------------------------- Bloc « Ma candidature » dans la fiche */

function blocSuivi(o) {
  const s = suivi[o.id] || {};
  const st = statutDe(o.id) || "";
  const options = `<option value="">Pas suivie</option>` + Object.entries(STATUTS)
    .map(([k, v]) => `<option value="${k}" ${k === st ? "selected" : ""}>${v.nom}</option>`).join("");
  const ent = (s.entretiens || []).map((e, i) => `
    <li><span>${dateFr(e.date, { weekday: "short", day: "numeric", month: "short" })}${e.heure ? " à " + esc(e.heure) : ""}${e.lieu ? " · " + esc(e.lieu) : ""}</span>
      <button class="mini" data-suivi="ics" data-id="${esc(o.id)}" data-i="${i}" aria-label="Ajouter au calendrier du téléphone">📅</button>
      <button class="mini" data-suivi="suppr-entretien" data-id="${esc(o.id)}" data-i="${i}" aria-label="Supprimer cet entretien">×</button></li>`).join("");
  return `<div class="bloc-suivi">
    <h4>Ma candidature</h4>
    <div class="suivi-champs">
      <label>Statut<select data-suivi="statut" data-id="${esc(o.id)}">${options}</select></label>
      <label>Postulé le<input type="date" value="${esc(s.date_postule || "")}" data-suivi="date" data-id="${esc(o.id)}"></label>
    </div>
    <h4>Entretiens</h4>
    ${ent ? `<ul class="liste-entretiens">${ent}</ul>` : ""}
    <div class="suivi-champs">
      <label>Date<input type="date" id="ent-date"></label>
      <label>Heure<input type="time" id="ent-heure"></label>
    </div>
    <label class="large">Lieu ou lien visio<input type="text" id="ent-lieu" placeholder="ex. Saclay, bâtiment 680 ou Teams"></label>
    <button class="bouton" data-suivi="ajout-entretien" data-id="${esc(o.id)}">+ Ajouter cet entretien</button>
    <h4>Notes</h4>
    <textarea data-suivi="notes" data-id="${esc(o.id)}" rows="3" placeholder="Contact, relance prévue, impressions…">${esc(s.notes || "")}</textarea>
    ${o.perso ? `<button class="lien rouge" data-suivi="suppr-perso" data-id="${esc(o.id)}">Supprimer cette candidature</button>` : ""}
  </div>`;
}

/* ------------------------------------------------------------- Calendrier du téléphone (.ics) */

function telechargerIcs(o, e, opts = {}) {
  const d = e.date.replace(/-/g, "");
  const h = (e.heure || "09:00").replace(":", "") + "00";
  const fin = e.fin ? e.fin.replace(":", "") + "00" : String(Math.min(23, +h.slice(0, 2) + 1)).padStart(2, "0") + h.slice(2);
  const echap = (t) => String(t || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cherchtravail//FR", "BEGIN:VEVENT",
    `UID:${o.id}-${d}${h}@cherchtravail`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Paris:${d}T${h}`, `DTEND;TZID=Europe/Paris:${d}T${fin}`,
    `SUMMARY:${echap(opts.titre || "Entretien : " + o.titre)}`, `LOCATION:${echap(e.lieu)}`,
    `DESCRIPTION:${echap(opts.description ?? [o.employeur, o.url].filter(Boolean).join("\n"))}`,
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${echap(opts.rappel || "Entretien demain")}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: opts.fichier || "entretien.ics" });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ------------------------------------------------------------- Export Word pour France Travail */

function resumeCourt(o) {
  const a = o.analyse || {}; const s = suivi[o.id] || {};
  let t = a.resume || (a.missions || []).slice(0, 3).join(" ; ") || o.extrait || "";
  if (/^Analyse automatique simplifiée|^Offre éloignée/.test(t)) t = o.extrait || "";
  if (/Aller au contenu|Se connecter|sur le Web/.test(t)) t = "";
  t = String(t).replace(/\s+/g, " ").trim();
  if (t.length > 320) t = t.slice(0, 317).replace(/\s+\S*$/, "") + "…";
  return t || s.notes || "";
}

function exporterWord() {
  const p = lire("export-periode", {});
  const lignes = offresSuivies()
    .filter((o) => statutDe(o.id) !== "a_postuler")
    .map((o) => ({ o, s: suivi[o.id] || {} }))
    .filter(({ s }) => (!p.du || (s.date_postule || "") >= p.du) && (!p.au || (s.date_postule || "9999") <= p.au))
    .sort((x, y) => (x.s.date_postule || "").localeCompare(y.s.date_postule || ""));
  if (!lignes.length) return toast("Aucune candidature sur cette période");
  const a = (o) => o.analyse || {};
  const suite = (o, s) => {
    const st = statutDe(o.id);
    const ent = (s.entretiens || []).map((e) => "entretien le " + dateFr(e.date, { day: "numeric", month: "long" })).join(", ");
    return [STATUTS[st]?.nom, ent].filter(Boolean).join(", ");
  };
  const colonnes = [
    { titre: "Date de candidature", largeur: 2.4 }, { titre: "Intitulé du poste", largeur: 5 },
    { titre: "Employeur et lieu", largeur: 3.8 }, { titre: "Contrat", largeur: 2.2 }, { titre: "Salaire", largeur: 2.6 },
    { titre: "Résumé de l'offre", largeur: 7.4 }, { titre: "Suite donnée", largeur: 2.6 },
  ];
  const rangs = lignes.map(({ o, s }) => [
    s.date_postule ? dateFr(s.date_postule, { day: "2-digit", month: "2-digit", year: "numeric" }) : "",
    o.titre + (o.url ? "\n" + o.url : ""),
    [o.employeur, o.lieu].filter(Boolean).join(", "),
    [o.contrat, a(o).duree_mois ? a(o).duree_mois + " mois" : ""].filter(Boolean).join(", "),
    salaireTexte(a(o)) || o.salaire_texte || "Non précisé",
    resumeCourt(o),
    suite(o, s),
  ]);
  const periode = p.du || p.au
    ? `Période : ${p.du ? "du " + dateFr(p.du, { day: "numeric", month: "long", year: "numeric" }) : "depuis le début"} ${p.au ? "au " + dateFr(p.au, { day: "numeric", month: "long", year: "numeric" }) : "à aujourd'hui"}`
    : `Toutes mes candidatures au ${dateFr(aujourdHui(), { day: "numeric", month: "long", year: "numeric" })}`;
  const P = Docx.p;
  const corps = P("Suivi de mes candidatures", { gras: true, taille: 16, apres: 2 })
    + P(`Eliott Mestrallet · ${periode} · ${lignes.length} candidature${lignes.length > 1 ? "s" : ""}`, { couleur: "5D6A62", apres: 10 })
    + Docx.tableau(colonnes, rangs, { taille: 9 });
  Docx.telecharger(Docx.document(corps, { paysage: true, marge: 850, titre: "Suivi de mes candidatures", auteur: "Eliott Mestrallet", taille: 10 }),
    `Candidatures-Mestrallet-${aujourdHui()}.docx`);
}

/* ------------------------------------------------------------- Sauvegarde / ajout manuel */

function sauvegarde() {
  const choix = prompt("Tape 1 pour SAUVEGARDER tes candidatures dans un fichier, 2 pour en RESTAURER un.");
  if (choix === "1") {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ suivi, perso }, null, 1)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `cherchtravail-${aujourdHui()}.json` });
    document.body.appendChild(a); a.click(); a.remove();
  } else if (choix === "2") {
    const inp = Object.assign(document.createElement("input"), { type: "file", accept: "application/json,.json" });
    inp.onchange = async () => {
      try {
        const d = JSON.parse(await inp.files[0].text());
        suivi = d.suivi || {}; perso = d.perso || [];
        enregistrer(); afficher(); toast("Candidatures restaurées");
      } catch { toast("Fichier illisible"); }
    };
    inp.click();
  }
}

function ajouterPerso() {
  const titre = prompt("Intitulé du poste (ou « Candidature spontanée »)");
  if (!titre) return;
  const employeur = prompt("Employeur / laboratoire") || "";
  const url = prompt("Lien de l'offre (facultatif)") || "";
  const o = { id: "perso-" + Date.now(), perso: true, source: "Ajout manuel", titre, employeur, url, lieu: "", type: "emploi", analyse: {} };
  perso.push(o);
  suiviDe(o.id).statut = "a_postuler";
  enregistrer(); afficher(); ouvrirFiche(o.id);
}

/* ------------------------------------------------------------- Événements */

function actionSuivi(el, evt) {
  const nom = el.dataset.suivi, id = el.dataset.id;
  const o = id && toutesOffres().find((x) => x.id === id);
  const s = id ? suiviDe(id) : null;
  switch (nom) {
    case "ajouter": return ajouterPerso();
    case "sauvegarde": return sauvegarde();
    case "mois": moisAffiche = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + +el.dataset.d, 1); return afficher();
    case "ics": return telechargerIcs(o, s.entretiens[+el.dataset.i]);
    case "evt-nouveau": formEvt = {}; afficher(); return document.getElementById("evt-titre")?.focus();
    case "evt-modifier": formEvt = Object.assign({}, evenements.find((e) => e.id === el.dataset.id)); afficher(); return window.scrollTo(0, 0);
    case "evt-annuler": formEvt = null; return afficher();
    case "evt-enregistrer": {
      const v = (k) => document.getElementById(k).value.trim();
      if (!v("evt-titre") || !v("evt-date")) return toast("Indique au moins un intitulé et une date");
      const e = { id: formEvt.id || "evt-" + Date.now(), titre: v("evt-titre"), type: v("evt-type"), date: v("evt-date"),
        heure: v("evt-heure"), fin: v("evt-fin"), lieu: v("evt-lieu"), notes: v("evt-notes"), obligatoire: document.getElementById("evt-oblig").checked };
      evenements = evenements.filter((x) => x.id !== e.id).concat(e);
      ecrire("evenements", evenements); formEvt = null; afficher();
      return toast("Événement enregistré. Touche 📅 pour l'ajouter au calendrier du téléphone");
    }
    case "evt-supprimer":
      if (!confirm("Supprimer cet événement ?")) return;
      evenements = evenements.filter((x) => x.id !== el.dataset.id); ecrire("evenements", evenements); formEvt = null; return afficher();
    case "evt-ics": {
      const e = evenements.find((x) => x.id === el.dataset.id);
      return telechargerIcs({ id: e.id }, e, { titre: (e.obligatoire ? "[Obligatoire] " : "") + e.titre,
        description: [TYPES_EVT[e.type], e.notes].filter(Boolean).join("\n"), rappel: e.titre + " demain", fichier: "evenement.ics" });
    }
    case "cocher":
      conserverSiRecherche(id);
      if (el.checked) { s.statut = s.statut && s.statut !== "a_postuler" ? s.statut : "postule"; s.date_postule = s.date_postule || aujourdHui(); }
      else { s.statut = "a_postuler"; }
      enregistrer(); return afficher();
    case "statut":
      if (evt.type !== "change") return;
      conserverSiRecherche(id);
      s.statut = el.value || undefined; s.fav = false; s.postule = false;
      if (["postule", "entretien", "offre", "refus"].includes(el.value) && !s.date_postule) s.date_postule = aujourdHui();
      enregistrer(); afficher(); return ouvrirFiche(id);
    case "export-du": case "export-au":
      if (evt.type === "change") { const p = lire("export-periode", {}); p[nom.slice(7)] = el.value; ecrire("export-periode", p); }
      return;
    case "export-word": return exporterWord();
    case "date": if (evt.type === "change") { s.date_postule = el.value; enregistrer(); afficher(); } return;
    case "notes": if (evt.type === "change") { s.notes = el.value; enregistrer(); } return;
    case "ajout-entretien": {
      const date = $("#ent-date").value;
      if (!date) return toast("Choisis d'abord une date");
      (s.entretiens = s.entretiens || []).push({ date, heure: $("#ent-heure").value, lieu: $("#ent-lieu").value.trim() });
      s.statut = s.statut === "offre" ? "offre" : "entretien";
      enregistrer(); afficher(); ouvrirFiche(id);
      return toast("Entretien ajouté. Touche 📅 pour l'envoyer dans le calendrier du téléphone");
    }
    case "suppr-entretien": s.entretiens.splice(+el.dataset.i, 1); enregistrer(); afficher(); return ouvrirFiche(id);
    case "suppr-perso":
      if (!confirm("Supprimer cette candidature ?")) return;
      perso = perso.filter((x) => x.id !== id); delete suivi[id];
      enregistrer(); $("#fiche").close(); return afficher();
  }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-suivi]");
  if (el && el.tagName !== "SELECT" && el.tagName !== "TEXTAREA" && !(el.tagName === "INPUT" && el.type !== "checkbox")) actionSuivi(el, e);
  const ouv = e.target.closest("[data-ouvrir]");
  if (ouv) ouvrirFiche(ouv.dataset.ouvrir);
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-suivi]");
  if (el && el.type !== "checkbox") actionSuivi(el, e);
});
