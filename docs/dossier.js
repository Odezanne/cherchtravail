"use strict";
/* Onglet Dossier : CV, lettres et autres documents (PDF, Word…).
   Sans synchronisation : rangés sur cet appareil (IndexedDB).
   Avec synchronisation : rangés dans le dépôt privé (dossier fichiers/), donc visibles sur le téléphone et l'ordinateur,
   avec une copie locale pour les ouvrir vite. Le CV marqué « référence » sert au robot pour calculer le %. */

const CATEGORIES = { cv: "CV", lettre: "Lettres de motivation", autre: "Autres documents" };
let urlsDossier = [];
let indexDistant = null; // { fichiers: [...], sha }

function baseDossier() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open("cherchtravail", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("fichiers", { keyPath: "id" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function operation(mode, fn) {
  const db = await baseDossier();
  return new Promise((ok, ko) => {
    const tx = db.transaction("fichiers", mode);
    const req = fn(tx.objectStore("fichiers"));
    tx.oncomplete = () => ok(req && req.result);
    tx.onerror = () => ko(tx.error);
  });
}
const fichiersLocaux = () => operation("readonly", (s) => s.getAll());
const majLocal = (f) => operation("readwrite", (s) => s.put(f));
const supprLocal = (id) => operation("readwrite", (s) => s.delete(id));

function categorieDevinee(nom) {
  const n = nom.toLowerCase();
  if (/(^|[^a-z])cv([^a-z]|$)|curriculum|resume/.test(n)) return "cv";
  if (/lettre|motivation|(^|[^a-z])lm([^a-z]|$)|cover/.test(n)) return "lettre";
  return "autre";
}
function nomSur(nom) { return nom.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80); }

/* ---------- index distant */
async function chargerIndex(forcer) {
  if (!Sync.actif()) return null;
  if (indexDistant && !forcer) return indexDistant;
  const { contenu, sha } = await Sync.lireJson("fichiers/index.json");
  indexDistant = { fichiers: (contenu && contenu.fichiers) || [], sha };
  return indexDistant;
}
async function enregistrerIndex(modif) {
  for (let essai = 0; essai < 3; essai++) {
    const idx = await chargerIndex(true);
    modif(idx.fichiers);
    try {
      idx.sha = await Sync.ecrireJson("fichiers/index.json", { fichiers: idx.fichiers }, idx.sha, "Dossier : mise à jour");
      return;
    } catch (e) { if (!e.conflit) throw e; }
  }
}
function metadonnees(f) {
  const m = Object.assign({}, f); delete m.blob; delete m.distant; return m;
}

/* ---------- ajout (appelé aussi par les onglets Lettre et CV) */
async function ajouterAuDossier(blob, nom, categorie) {
  try { navigator.storage?.persist?.(); } catch { /* facultatif */ }
  const f = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), nom, type: blob.type || "", taille: blob.size,
    date: new Date().toISOString(), categorie: categorie || categorieDevinee(nom), reference: false, blob };
  await majLocal(f);
  if (Sync.actif()) await envoyer(f);
}
async function envoyer(f) {
  f.chemin = `fichiers/${f.id}-${nomSur(f.nom)}`;
  await Sync.ecrireFichier(f.chemin, await Sync.b64Blob(f.blob), null, "Dossier : " + f.nom);
  f.distant = true; await majLocal(f);
  await enregistrerIndex((liste) => { if (!liste.some((x) => x.id === f.id)) liste.push(metadonnees(f)); });
}

/* Liste fusionnée : index distant (si synchro) + copies locales */
async function tousFichiers() {
  const locaux = await fichiersLocaux();
  if (!Sync.actif()) return locaux;
  const idx = await chargerIndex();
  for (const f of locaux.filter((x) => !x.distant)) { // ajoutés ici avant la synchro : on les envoie
    try { await envoyer(f); } catch (e) { console.warn(e); }
  }
  const parId = Object.fromEntries(locaux.map((x) => [x.id, x]));
  const ids = new Set(idx.fichiers.map((x) => x.id));
  for (const f of locaux) if (f.distant && !ids.has(f.id)) await supprLocal(f.id); // supprimés ailleurs
  return idx.fichiers.map((m) => Object.assign({}, m, { blob: parId[m.id]?.blob || null }));
}
async function rapatrier(fichiers) {
  let n = 0;
  for (const f of fichiers.filter((x) => !x.blob && x.chemin)) {
    try { const blob = await Sync.lireBlob(f.chemin); await majLocal(Object.assign({}, f, { blob, distant: true })); n++; }
    catch (e) { console.warn(e); }
  }
  return n;
}

function taille(o) { return o < 1e6 ? Math.max(1, Math.round(o / 1024)) + " Ko" : (o / 1e6).toFixed(1).replace(".", ",") + " Mo"; }
function icone(f) {
  const n = f.nom.toLowerCase();
  if (n.endsWith(".pdf")) return ["PDF", "pdf"];
  if (/\.(docx?|odt|rtf|pages)$/.test(n)) return ["DOC", "doc"];
  if (/\.(png|jpe?g|heic|webp)$/.test(n)) return ["IMG", "img"];
  return ["FIC", ""];
}

async function rendreDossier(dejaRapatrie) {
  const zone = $("#liste");
  let fichiers = [];
  try { fichiers = await tousFichiers(); } catch (e) {
    zone.innerHTML = `<div class="vide">Impossible de lire le dossier : ${esc(e.message)}</div>`;
    return;
  }
  if (etat.onglet !== "dossier") return;
  urlsDossier.forEach((u) => URL.revokeObjectURL(u)); urlsDossier = [];
  fichiers.sort((a, b) => (!!b.reference - !!a.reference) || b.date.localeCompare(a.date));
  let h = `<div class="suivi-actions un">
      <label class="bouton principal">+ Ajouter des fichiers (PDF, Word…)
        <input type="file" multiple hidden data-dossier="ajouter"
          accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.pages,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
      </label></div>
    <p class="vide-petit">${Sync.actif()
      ? "Tes documents sont rangés dans ton espace privé : tu les retrouves sur ton téléphone et ton ordinateur."
      : "Tes documents restent sur cet appareil. Active la synchronisation dans l'onglet Profil pour les retrouver aussi sur ton ordinateur."}
      Marque ton CV de <b>référence</b> (★) : le robot s'en sert pour calculer le % de chaque offre.</p>`;
  for (const [cat, nomCat] of Object.entries(CATEGORIES)) {
    const groupe = fichiers.filter((f) => f.categorie === cat);
    h += `<h2 class="groupe">${nomCat} (${groupe.length})</h2>`;
    if (!groupe.length) {
      h += `<p class="vide-petit">${cat === "lettre" ? "Les lettres préparées dans l'onglet Lettre peuvent être rangées ici." : "Aucun fichier."}</p>`;
      continue;
    }
    h += groupe.map((f) => {
      const url = f.blob ? URL.createObjectURL(f.blob) : null; if (url) urlsDossier.push(url);
      const [ic, cl] = icone(f);
      const word = /\.(docx?|odt|rtf|pages)$/i.test(f.nom);
      return `<div class="fichier ${f.reference ? "reference" : ""}">
        <span class="fichier-icone ${cl}">${ic}</span>
        ${url ? `<a class="fichier-corps" href="${url}" target="_blank" rel="noopener" ${word ? `download="${esc(f.nom)}"` : ""}>`
              : `<span class="fichier-corps">`}
          <strong>${f.reference ? "★ " : ""}${esc(f.nom)}</strong>
          <span>${f.reference ? "Référence · " : ""}${taille(f.taille)} · ${dateFr(f.date)}${url ? "" : " · téléchargement…"}</span>
        ${url ? "</a>" : "</span>"}
        <button class="mini" data-dossier="partager" data-id="${esc(f.id)}" aria-label="Partager ${esc(f.nom)}" ${url ? "" : "disabled"}>⇪</button>
        <details class="fichier-menu"><summary class="mini" aria-label="Options">⋯</summary>
          <div class="fichier-options">
            ${cat !== "autre" ? `<button class="lien" data-dossier="reference" data-id="${esc(f.id)}">${f.reference ? "Ne plus utiliser comme référence" : "★ En faire ma référence"}</button>` : ""}
            <label>Ranger dans<select data-dossier="categorie" data-id="${esc(f.id)}">
              ${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${k === f.categorie ? "selected" : ""}>${v}</option>`).join("")}
            </select></label>
            <button class="lien" data-dossier="renommer" data-id="${esc(f.id)}">Renommer</button>
            <button class="lien rouge" data-dossier="supprimer" data-id="${esc(f.id)}">Supprimer</button>
          </div></details>
      </div>`;
    }).join("");
  }
  zone.innerHTML = h;
  if (!dejaRapatrie && fichiers.some((f) => !f.blob)) {
    if (await rapatrier(fichiers)) rendreDossier(true);
  }
}

async function modifierFichier(id, modif) {
  const locaux = await fichiersLocaux();
  const l = locaux.find((x) => x.id === id);
  if (l) { modif(l); await majLocal(l); }
  if (Sync.actif()) await enregistrerIndex((liste) => { const m = liste.find((x) => x.id === id); if (m) modif(m); });
}

async function actionDossier(el, evt) {
  const nom = el.dataset.dossier, id = el.dataset.id;
  try {
    const fichiers = id ? await tousFichiers() : [];
    const f = fichiers.find((x) => x.id === id);
    switch (nom) {
      case "ajouter":
        if (evt.type !== "change") return;
        toast("Envoi en cours…");
        for (const fi of el.files) await ajouterAuDossier(fi, fi.name);
        toast(el.files.length > 1 ? `${el.files.length} fichiers ajoutés` : "Fichier ajouté");
        return rendreDossier();
      case "partager": {
        const fichier = new File([f.blob], f.nom, { type: f.type || f.blob.type });
        if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
          try { await navigator.share({ files: [fichier], title: f.nom }); } catch { /* partage annulé */ }
        } else Docx.telecharger(f.blob, f.nom);
        return;
      }
      case "reference": {
        const devient = !f.reference;
        for (const x of fichiers.filter((x) => x.categorie === f.categorie && x.reference && x.id !== id)) {
          await modifierFichier(x.id, (m) => { m.reference = false; });
        }
        await modifierFichier(id, (m) => { m.reference = devient; });
        toast(devient ? (f.categorie === "cv" ? "CV de référence : le robot s'en servira pour le %" : "Lettre de référence enregistrée") : "Référence retirée");
        return rendreDossier();
      }
      case "categorie":
        if (evt.type !== "change") return;
        await modifierFichier(id, (m) => { m.categorie = el.value; if (el.value === "autre") m.reference = false; });
        return rendreDossier();
      case "renommer": {
        const ext = (f.nom.match(/\.[^.]+$/) || [""])[0];
        const n = prompt("Nouveau nom", f.nom.replace(/\.[^.]+$/, ""));
        if (!n) return;
        const nouveau = n.trim() + (n.toLowerCase().endsWith(ext.toLowerCase()) ? "" : ext);
        await modifierFichier(id, (m) => { m.nom = nouveau; });
        return rendreDossier();
      }
      case "supprimer":
        if (!confirm(`Supprimer « ${f.nom} »${Sync.actif() ? " de ton espace (téléphone et ordinateur)" : " de cet appareil"} ?`)) return;
        await supprLocal(id);
        if (Sync.actif() && f.chemin) {
          await enregistrerIndex((liste) => { const i = liste.findIndex((x) => x.id === id); if (i >= 0) liste.splice(i, 1); });
          try { await Sync.supprimerChemin(f.chemin); } catch (e) { console.warn(e); }
        }
        toast("Fichier supprimé"); return rendreDossier();
    }
  } catch (e) { toast("Erreur : " + e.message); }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("button[data-dossier]"); if (el) actionDossier(el, e);
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-dossier]"); if (el && el.tagName !== "BUTTON") actionDossier(el, e);
});
