"use strict";
/* Onglet Contacts : mon réseau professionnel (nom + téléphone ou e-mail au minimum).
   Le robot vérifie, à la demande et chaque mois, que chaque personne travaille toujours au même endroit,
   à partir de pages professionnelles publiques uniquement (jamais le numéro de téléphone). */

let contacts = lire("contacts", []);
let formContact = null;
let verifsContacts = lire("contacts-verifs", {}); // copie locale du résultat du robot (contacts/verifications.json)
let attenteVerif = null;

const STATUT_VERIF = {
  confirme: { nom: "✓ Toujours en poste", couleur: "vert" },
  a_change: { nom: "⚠ A changé de poste", couleur: "ambre" },
  incertain: { nom: "? Pas de confirmation", couleur: "gris" },
};

async function chargerVerifsContacts() {
  if (!Sync.actif()) return;
  try {
    const { contenu } = await Sync.lireJson("contacts/verifications.json");
    if (contenu && JSON.stringify(contenu) !== JSON.stringify(verifsContacts)) {
      verifsContacts = contenu; ecrire("contacts-verifs", contenu);
      if (etat.onglet === "contacts") afficher();
      return true;
    }
  } catch { /* hors connexion */ }
  return false;
}

function rendreContacts() {
  if (!rendreContacts.charge) { rendreContacts.charge = true; chargerVerifsContacts(); }
  let h = `<div class="suivi-actions">
      <button class="bouton principal" data-contact="nouveau">+ Ajouter un contact</button>
      ${contacts.length ? `<button class="bouton" data-contact="verifier-tous">${attenteVerif ? "Vérification en cours…" : "Tout vérifier"}</button>` : ""}
    </div>
    <p class="vide-petit">Les gens de ton réseau : anciens encadrants, chercheurs rencontrés, recruteurs. Jobot vérifie chaque mois,
      sur leurs pages professionnelles publiques, qu'ils travaillent toujours au même endroit et dans le même secteur.</p>`;
  if (formContact) h += formulaireContact(formContact);
  if (!contacts.length && !formContact) return h + `<div class="vide">Aucun contact pour l'instant.</div>`;
  const change = contacts.filter((c) => (verifsContacts[c.id] || {}).statut === "a_change");
  const autres = contacts.filter((c) => !change.includes(c)).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  if (change.length) h += `<h2 class="groupe">À mettre à jour (${change.length})</h2>` + change.map(carteContact).join("");
  if (autres.length) h += `<h2 class="groupe">Mon réseau (${autres.length})</h2>` + autres.map(carteContact).join("");
  return h;
}

function carteContact(c) {
  const v = verifsContacts[c.id];
  const st = v && STATUT_VERIF[v.statut];
  const sous = [c.poste, c.organisation].filter(Boolean).join(" · ");
  const tel = (c.telephone || "").replace(/[^\d+]/g, "");
  return `<div class="labo contact">
    <button class="labo-corps" data-contact="modifier" data-id="${esc(c.id)}">
      <strong>${esc(c.nom)}</strong>
      ${sous ? `<span>${esc(sous)}</span>` : ""}
      ${c.secteur ? `<span class="theme">${esc(c.secteur)}</span>` : ""}
      ${c.rencontre ? `<span>${esc(c.rencontre)}</span>` : ""}
    </button>
    <div class="labo-actions">
      ${c.email ? `<a class="mini" href="mailto:${esc(c.email)}" aria-label="Écrire à ${esc(c.nom)}">✉</a>` : ""}
      ${tel ? `<a class="mini" href="tel:${esc(tel)}" aria-label="Appeler ${esc(c.nom)}">☎</a>` : ""}
      ${c.lien ? `<a class="mini" href="${esc(c.lien)}" target="_blank" rel="noopener" aria-label="Page professionnelle">↗</a>` : ""}
      <button class="mini" data-contact="verifier" data-id="${esc(c.id)}" aria-label="Vérifier où travaille ${esc(c.nom)}">⟳</button>
    </div>
    ${v ? `<div class="verif-contact ${st?.couleur || ""}"><b>${esc(st?.nom || "")}</b>${v.organisation && v.statut !== "confirme" ? ` · maintenant : ${esc([v.poste, v.organisation].filter(Boolean).join(", "))}` : ""}
      <br>${esc(v.resume || "")} <small>(vérifié le ${dateFr(v.date)})</small>
      ${(v.sources || []).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">source ${i + 1} ↗</a>`).join(" ")}</div>` : ""}
  </div>`;
}

function formulaireContact(c) {
  const champ = (id, nom, val, ph = "", type = "text") =>
    `<label>${nom}<input id="contact-${id}" type="${type}" value="${esc(val || "")}" placeholder="${esc(ph)}"></label>`;
  const v = c.id && verifsContacts[c.id];
  return `<div class="bloc-export bloc-evt">
    <h3 class="sous-groupe" style="margin-top:0">${c.id ? "Modifier" : "Nouveau"} contact</h3>
    ${champ("nom", "Nom et prénom *", c.nom, "ex. Marie Dupont")}
    <div class="suivi-champs">${champ("telephone", "Téléphone", c.telephone, "06…", "tel")}${champ("email", "E-mail", c.email, "prenom.nom@…", "email")}</div>
    <p class="aide" style="margin-top:-4px">Au moins le téléphone ou l'e-mail.</p>
    <div class="suivi-champs">${champ("organisation", "Organisation", c.organisation, "ex. INRAE, MNHN, CNRS")}${champ("poste", "Poste", c.poste, "ex. chargée de recherche")}</div>
    ${champ("secteur", "Secteur ou domaine", c.secteur, "ex. éthologie, écologie de la conservation")}
    ${champ("rencontre", "Comment je le connais", c.rencontre, "ex. encadrante de stage INRAE 2024")}
    ${champ("lien", "Page professionnelle (facultatif)", c.lien, "https://…")}
    <label>Notes<textarea id="contact-notes" rows="3" placeholder="Dernier échange, ce qu'il peut m'apporter…">${esc(c.notes || "")}</textarea></label>
    ${v && v.statut === "a_change" && v.organisation ? `<button class="bouton" data-contact="appliquer" data-id="${esc(c.id)}" style="margin-bottom:8px">Mettre à jour avec : ${esc([v.poste, v.organisation].filter(Boolean).join(", "))}</button>` : ""}
    <div class="actions-ligne deux">
      <button class="bouton principal" data-contact="enregistrer">Enregistrer</button>
      <button class="bouton" data-contact="annuler">Annuler</button>
    </div>
    ${c.id ? `<button class="lien rouge" data-contact="supprimer" data-id="${esc(c.id)}">Supprimer ce contact</button>` : ""}
  </div>`;
}

async function lancerVerifContacts(ids) {
  if (!Sync.actif()) return toast("Active d'abord la synchronisation dans l'onglet Profil");
  try {
    await Sync.synchroniser(); // le robot lit les contacts dans le dépôt privé : on envoie d'abord les derniers
    await Sync.lancer("contacts.yml", { ids: ids.join(",") });
  } catch (e) { return toast("Erreur : " + e.message); }
  toast(ids.length === 1 ? "Je vérifie. Compte 1 à 3 minutes." : `Je vérifie ${contacts.length} contacts. Compte quelques minutes.`);
  const avant = JSON.stringify(verifsContacts);
  attenteVerif = Date.now(); afficher();
  const sonde = async () => {
    await chargerVerifsContacts();
    if (JSON.stringify(verifsContacts) !== avant && ids.length === 1) { attenteVerif = null; afficher(); return; }
    if (Date.now() - attenteVerif > 8 * 60000) { attenteVerif = null; afficher(); return; }
    setTimeout(sonde, 20000);
  };
  setTimeout(sonde, 45000);
}

async function actionContact(el) {
  const nom = el.dataset.contact, id = el.dataset.id;
  const c = id && contacts.find((x) => x.id === id);
  switch (nom) {
    case "nouveau": formContact = {}; afficher(); return window.scrollTo(0, 0);
    case "modifier": formContact = Object.assign({}, c); afficher(); return window.scrollTo(0, 0);
    case "annuler": formContact = null; return afficher();
    case "enregistrer": {
      const v = (k) => (document.getElementById("contact-" + k)?.value || "").trim();
      if (!v("nom")) return toast("Indique au moins le nom");
      if (!v("telephone") && !v("email")) return toast("Ajoute un téléphone ou un e-mail");
      if (v("email") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("email"))) return toast("L'e-mail ne semble pas valide");
      const n = { id: formContact.id || "contact-" + Date.now(), nom: v("nom"), telephone: v("telephone"), email: v("email"),
        organisation: v("organisation"), poste: v("poste"), secteur: v("secteur"), rencontre: v("rencontre"), lien: v("lien"),
        notes: v("notes"), ajoute_le: formContact.ajoute_le || aujourdHui() };
      const nouveau = !formContact.id;
      contacts = contacts.filter((x) => x.id !== n.id).concat(n); ecrire("contacts", contacts); formContact = null; afficher();
      if (nouveau && Sync.actif() && (n.organisation || n.email)) {
        toast("Enregistré. Je vérifie où il ou elle travaille…");
        return setTimeout(() => lancerVerifContacts([n.id]), 3000);
      }
      return toast("Enregistré");
    }
    case "appliquer": {
      const v = verifsContacts[id];
      Object.assign(formContact, { organisation: v.organisation || formContact.organisation, poste: v.poste || formContact.poste });
      afficher(); return toast("Champs mis à jour : vérifie puis enregistre");
    }
    case "verifier": return lancerVerifContacts([id]);
    case "verifier-tous": if (!attenteVerif) lancerVerifContacts([]); return;
    case "supprimer":
      if (!confirm(`Supprimer « ${c.nom} » ?`)) return;
      contacts = contacts.filter((x) => x.id !== id); ecrire("contacts", contacts); formContact = null; return afficher();
  }
}

document.addEventListener("click", (e) => { const el = e.target.closest("[data-contact]"); if (el) actionContact(el); });
