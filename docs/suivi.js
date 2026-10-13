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
let moisAffiche = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();

function suiviDe(id) { return (suivi[id] = suivi[id] || {}); }
function statutDe(id) {
  const s = suivi[id] || {};
  return s.statut || (s.postule ? "postule" : s.fav ? "a_postuler" : null);
}
function toutesOffres() { return donnees.offres.concat(perso); }
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
      <button class="bouton principal" data-suivi="ajouter">+ Ajouter une candidature</button>
      <button class="bouton" data-suivi="sauvegarde">Sauvegarder / restaurer</button>
    </div>`;

  h += `<h2 class="groupe">Prochains entretiens</h2>`;
  h += avenir.length ? avenir.map(({ o, e, i }) => `
      <div class="entretien-ligne">
        <div class="entretien-date"><b>${dateFr(e.date, { day: "numeric" })}</b><span>${dateFr(e.date, { month: "short" })}</span></div>
        <button class="entretien-corps" data-ouvrir="${esc(o.id)}">
          <strong>${esc(o.titre)}</strong>
          <span>${esc([e.heure, e.lieu, o.employeur].filter(Boolean).join(" · "))}</span>
        </button>
        <button class="mini" data-suivi="ics" data-id="${esc(o.id)}" data-i="${i}" aria-label="Ajouter au calendrier du téléphone">📅</button>
      </div>`).join("")
    : `<p class="vide-petit">Aucun entretien prévu. Ajoute-en un depuis la fiche d'une offre.</p>`;

  h += rendreCalendrier(entretiens);

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
  return h;
}

function rendreCalendrier(entretiens) {
  const jours = new Set(entretiens.map((x) => x.e.date));
  const an = moisAffiche.getFullYear(), m = moisAffiche.getMonth();
  const premier = (new Date(an, m, 1).getDay() + 6) % 7; // lundi = 0
  const nb = new Date(an, m + 1, 0).getDate();
  const auj = aujourdHui();
  let cases = "";
  for (let i = 0; i < premier; i++) cases += `<span></span>`;
  for (let j = 1; j <= nb; j++) {
    const iso = `${an}-${String(m + 1).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
    cases += `<span class="${jours.has(iso) ? "a-rdv" : ""} ${iso === auj ? "auj" : ""}">${j}</span>`;
  }
  return `<div class="calendrier">
    <div class="cal-tete">
      <button class="mini" data-suivi="mois" data-d="-1" aria-label="Mois précédent">‹</button>
      <strong>${moisAffiche.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</strong>
      <button class="mini" data-suivi="mois" data-d="1" aria-label="Mois suivant">›</button>
    </div>
    <div class="cal-grille"><i>L</i><i>M</i><i>M</i><i>J</i><i>V</i><i>S</i><i>D</i>${cases}</div>
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

function telechargerIcs(o, e) {
  const d = e.date.replace(/-/g, "");
  const h = (e.heure || "09:00").replace(":", "") + "00";
  const fin = String(Math.min(23, +h.slice(0, 2) + 1)).padStart(2, "0") + h.slice(2);
  const echap = (t) => String(t || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cherchtravail//FR", "BEGIN:VEVENT",
    `UID:${o.id}-${d}${h}@cherchtravail`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Paris:${d}T${h}`, `DTEND;TZID=Europe/Paris:${d}T${fin}`,
    `SUMMARY:${echap("Entretien : " + o.titre)}`, `LOCATION:${echap(e.lieu)}`,
    `DESCRIPTION:${echap([o.employeur, o.url].filter(Boolean).join("\n"))}`,
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Entretien demain", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "entretien.ics" });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
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
    case "cocher":
      if (el.checked) { s.statut = s.statut && s.statut !== "a_postuler" ? s.statut : "postule"; s.date_postule = s.date_postule || aujourdHui(); }
      else { s.statut = "a_postuler"; }
      enregistrer(); return afficher();
    case "statut":
      if (evt.type !== "change") return;
      s.statut = el.value || undefined; s.fav = false; s.postule = false;
      if (["postule", "entretien", "offre", "refus"].includes(el.value) && !s.date_postule) s.date_postule = aujourdHui();
      enregistrer(); afficher(); return ouvrirFiche(id);
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
