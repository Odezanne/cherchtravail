"use strict";
/* Onglet Dossier : CV, lettres et autres documents (PDF, Word…) rangés sur l'appareil (IndexedDB).
   Rien n'est envoyé en ligne. */

const CATEGORIES = { cv: "CV", lettre: "Lettres de motivation", autre: "Autres documents" };
let urlsDossier = [];

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
const tousFichiers = () => operation("readonly", (s) => s.getAll());
const majFichier = (f) => operation("readwrite", (s) => s.put(f));
const supprFichier = (id) => operation("readwrite", (s) => s.delete(id));

function categorieDevinee(nom) {
  const n = nom.toLowerCase();
  if (/(^|[^a-z])cv([^a-z]|$)|curriculum|resume/.test(n)) return "cv";
  if (/lettre|motivation|(^|[^a-z])lm([^a-z]|$)|cover/.test(n)) return "lettre";
  return "autre";
}
async function ajouterAuDossier(blob, nom, categorie) {
  try { navigator.storage?.persist?.(); } catch { /* facultatif */ }
  await majFichier({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), nom, type: blob.type || "", taille: blob.size,
    date: new Date().toISOString(), categorie: categorie || categorieDevinee(nom), blob });
}
function taille(o) { return o < 1e6 ? Math.max(1, Math.round(o / 1024)) + " Ko" : (o / 1e6).toFixed(1).replace(".", ",") + " Mo"; }
function icone(f) {
  const n = f.nom.toLowerCase();
  if (n.endsWith(".pdf")) return ["PDF", "pdf"];
  if (/\.(docx?|odt|rtf|pages)$/.test(n)) return ["DOC", "doc"];
  if (/\.(png|jpe?g|heic|webp)$/.test(n)) return ["IMG", "img"];
  return ["FIC", ""];
}

async function rendreDossier() {
  const zone = $("#liste");
  urlsDossier.forEach((u) => URL.revokeObjectURL(u)); urlsDossier = [];
  let fichiers = [];
  try { fichiers = await tousFichiers(); } catch {
    zone.innerHTML = `<div class="vide">Le stockage de fichiers n'est pas disponible dans ce navigateur (navigation privée ?).</div>`;
    return;
  }
  if (etat.onglet !== "dossier") return;
  fichiers.sort((a, b) => b.date.localeCompare(a.date));
  let h = `<div class="suivi-actions un">
      <label class="bouton principal">+ Ajouter des fichiers (PDF, Word…)
        <input type="file" multiple hidden data-dossier="ajouter"
          accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.pages,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
      </label></div>
    <p class="vide-petit">Tes documents restent sur ce téléphone, rien n'est envoyé en ligne. « Partager » les envoie vers Mail, Canva, Word ou un site de candidature.</p>`;
  for (const [cat, nomCat] of Object.entries(CATEGORIES)) {
    const groupe = fichiers.filter((f) => f.categorie === cat);
    h += `<h2 class="groupe">${nomCat} (${groupe.length})</h2>`;
    if (!groupe.length) {
      h += `<p class="vide-petit">${cat === "lettre" ? "Les lettres préparées dans l'onglet Lettre peuvent être rangées ici." : "Aucun fichier."}</p>`;
      continue;
    }
    h += groupe.map((f) => {
      const url = URL.createObjectURL(f.blob); urlsDossier.push(url);
      const [ic, cl] = icone(f);
      return `<div class="fichier">
        <span class="fichier-icone ${cl}">${ic}</span>
        <a class="fichier-corps" href="${url}" target="_blank" rel="noopener" ${/\.(docx?|odt|rtf|pages)$/i.test(f.nom) ? `download="${esc(f.nom)}"` : ""}>
          <strong>${esc(f.nom)}</strong>
          <span>${taille(f.taille)} · ajouté le ${dateFr(f.date)}</span>
        </a>
        <button class="mini" data-dossier="partager" data-id="${esc(f.id)}" aria-label="Partager ${esc(f.nom)}">⇪</button>
        <details class="fichier-menu"><summary class="mini" aria-label="Options">⋯</summary>
          <div class="fichier-options">
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
}

async function actionDossier(el, evt) {
  const nom = el.dataset.dossier, id = el.dataset.id;
  const fichiers = id ? await tousFichiers() : [];
  const f = fichiers.find((x) => x.id === id);
  switch (nom) {
    case "ajouter":
      if (evt.type !== "change") return;
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
    case "categorie":
      if (evt.type !== "change") return;
      f.categorie = el.value; await majFichier(f); return rendreDossier();
    case "renommer": {
      const ext = (f.nom.match(/\.[^.]+$/) || [""])[0];
      const n = prompt("Nouveau nom", f.nom.replace(/\.[^.]+$/, ""));
      if (!n) return;
      f.nom = n.trim() + (n.toLowerCase().endsWith(ext.toLowerCase()) ? "" : ext); await majFichier(f); return rendreDossier();
    }
    case "supprimer":
      if (!confirm(`Supprimer « ${f.nom} » de ce téléphone ?`)) return;
      await supprFichier(id); toast("Fichier supprimé"); return rendreDossier();
  }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("button[data-dossier]"); if (el) actionDossier(el, e);
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-dossier]"); if (el && el.tagName !== "BUTTON") actionDossier(el, e);
});
