"use strict";
/* Synchronisation entre appareils (téléphone, ordinateur) via un dépôt GitHub PRIVÉ.
   La clé d'accès est saisie une fois par appareil et reste dans ce navigateur : elle n'est jamais dans le code du site.
   Fusion à trois voies : ce qui a changé ici depuis la dernière synchro gagne, le reste vient de l'autre appareil. */

const Sync = (() => {
  const CLES = ["suivi", "perso", "lettres", "lettre-modele", "profil", "cv", "recherches", "evenements", "actualisations", "labos", "contacts"];
  const PAR_ID = { perso: true, evenements: true, labos: true, contacts: true }; // tableaux d'objets {id}
  const API = "https://api.github.com";
  let reglages = lire("sync", {});
  let minuteur = null, enCours = null, dernierEtat = "";

  const actif = () => !!(reglages.token && reglages.depot);
  function entetes(extra = {}) {
    return Object.assign({ Authorization: "Bearer " + reglages.token, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28" }, extra);
  }
  function b64Texte(t) {
    const o = new TextEncoder().encode(t); let s = "";
    for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function texteB64(b) {
    const s = atob(b.replace(/\s/g, "")); const o = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
    return new TextDecoder().decode(o);
  }
  async function b64Blob(blob) {
    const o = new Uint8Array(await blob.arrayBuffer()); let s = "";
    for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function chemin(p) { return `${API}/repos/${reglages.depot}/contents/${p.split("/").map(encodeURIComponent).join("/")}`; }

  async function lireJson(p) {
    const r = await fetch(chemin(p) + "?t=" + Date.now(), { headers: entetes(), cache: "no-store" });
    if (r.status === 404) return { contenu: null, sha: null };
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const j = await r.json();
    if (j.content) return { contenu: JSON.parse(texteB64(j.content)), sha: j.sha };
    // fichier de plus d'1 Mo : lecture brute
    const brut = await fetch(chemin(p), { headers: entetes({ Accept: "application/vnd.github.raw+json" }), cache: "no-store" });
    return { contenu: await brut.json(), sha: j.sha };
  }
  async function ecrireFichier(p, contenuB64, sha, message) {
    const r = await fetch(chemin(p), { method: "PUT", headers: entetes({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: message || "Mise à jour depuis le site", content: contenuB64, ...(sha ? { sha } : {}) }) });
    if (r.status === 409 || r.status === 422) { const e = new Error("conflit"); e.conflit = true; throw e; }
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return (await r.json()).content.sha;
  }
  const ecrireJson = (p, obj, sha, msg) => ecrireFichier(p, b64Texte(JSON.stringify(obj, null, 1)), sha, msg);
  async function supprimer(p, sha) {
    const r = await fetch(chemin(p), { method: "DELETE", headers: entetes({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: "Suppression depuis le site", sha }) });
    if (!r.ok && r.status !== 404) throw new Error(`GitHub ${r.status}`);
  }
  async function supprimerChemin(p) {
    const r = await fetch(chemin(p), { headers: entetes(), cache: "no-store" });
    if (r.status === 404) return;
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    await supprimer(p, (await r.json()).sha);
  }
  async function lireBlob(p) {
    const r = await fetch(chemin(p), { headers: entetes({ Accept: "application/vnd.github.raw+json" }), cache: "no-store" });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return r.blob();
  }

  /* ---------- fusion */
  const egal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  function enMap(v, cle) { return PAR_ID[cle] ? Object.fromEntries((v || []).map((x) => [x.id, x])) : (v || {}); }
  function fusion(cle, base, ici, la) {
    // Clé absente du dépôt (écrit par une ancienne version du site) : on ne supprime rien, on garde ce qui est ici
    if (la === undefined || la === null) return ici ?? null;
    const objet = !["suivi", "lettres", "perso", "evenements", "labos", "actualisations", "contacts"].includes(cle);
    if (objet) return !egal(ici, base) ? ici : (la ?? ici);
    const B = enMap(base, cle), I = enMap(ici, cle), L = enMap(la, cle), R = {};
    for (const id of new Set([...Object.keys(B), ...Object.keys(I), ...Object.keys(L)])) {
      const changeIci = !egal(I[id], B[id]);
      const v = changeIci ? I[id] : (id in L ? L[id] : (id in B ? undefined : I[id]));
      if (v !== undefined && v !== null) R[id] = v;
    }
    return PAR_ID[cle] ? Object.values(R) : R;
  }
  function etatLocal() { return Object.fromEntries(CLES.map((k) => [k, lire(k, null)])); }

  async function synchroniser() {
    if (!actif()) return;
    if (enCours) return enCours;
    enCours = (async () => {
      for (let essai = 0; essai < 3; essai++) {
        const { contenu, sha } = await lireJson("etat.json");
        const distant = (contenu && contenu.donnees) || {};
        const base = lire("sync-base", {});
        const ici = etatLocal();
        const fusionne = {};
        for (const k of CLES) fusionne[k] = fusion(k, base[k], ici[k], distant[k]);
        for (const k of CLES) if (fusionne[k] != null) ecrire(k, fusionne[k], true);
        const nouveau = JSON.stringify(fusionne);
        try {
          if (!egal(fusionne, distant)) {
            await ecrireJson("etat.json", { maj: new Date().toISOString(), donnees: Object.assign({}, distant, fusionne) }, sha);
          }
          ecrire("sync-base", fusionne, true);
          reglages.derniere = new Date().toISOString(); ecrire("sync", reglages, true);
          const change = nouveau !== dernierEtat; dernierEtat = nouveau;
          return change;
        } catch (e) { if (!e.conflit) throw e; }
      }
      throw new Error("conflit persistant");
    })();
    try { return await enCours; } finally { enCours = null; }
  }

  function planifier() {
    if (!actif()) return;
    clearTimeout(minuteur);
    minuteur = setTimeout(() => synchroniser().catch((e) => console.warn("Synchro", e)), 2500);
  }

  async function tester(token, depot) {
    const r = await fetch(`${API}/repos/${depot}`, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" } });
    if (r.status === 401) throw new Error("clé refusée par GitHub");
    if (r.status === 404) throw new Error(`dépôt ${depot} introuvable avec cette clé`);
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const j = await r.json();
    if (!j.private) throw new Error("ce dépôt est public : choisis un dépôt privé pour tes données");
    if (j.permissions && !j.permissions.push) throw new Error("la clé n'a pas le droit d'écrire dans ce dépôt (Contents : Read and write)");
    return true;
  }

  async function configurer(token, depot) {
    await tester(token, depot);
    reglages = { token, depot }; ecrire("sync", reglages, true);
    await synchroniser();
  }
  function deconnecter() { reglages = {}; ecrire("sync", {}, true); ecrire("sync-base", {}, true); }

  /* Lance un workflow GitHub Actions du site (recherche à la demande, nouvelle analyse) */
  async function lancer(workflow, inputs) {
    const r = await fetch(`${API}/repos/${reglages.depotSite || "Odezanne/cherchtravail"}/actions/workflows/${workflow}/dispatches`, {
      method: "POST", headers: entetes({ "Content-Type": "application/json" }), body: JSON.stringify({ ref: "main", inputs }) });
    if (r.status === 403 || r.status === 404) throw new Error("la clé n'a pas le droit de lancer le robot (Actions : Read and write sur cherchtravail)");
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
  }

  return { actif, reglages: () => reglages, synchroniser, planifier, configurer, deconnecter, CLES,
    lireJson, ecrireJson, ecrireFichier, supprimer, supprimerChemin, lireBlob, b64Blob, lancer };
})();

/* ecrire() du site : on déclenche la synchro pour les données partagées */
const _ecrireLocal = ecrire;
ecrire = function (cle, val, sansSynchro) { // eslint-disable-line no-global-assign
  _ecrireLocal(cle, val);
  if (!sansSynchro && Sync.CLES.includes(cle)) Sync.planifier();
};

/* Version du site : un appareil resté sur une vieille version se recharge tout seul avant de synchroniser
   (une vieille version ne connaît pas les nouvelles données et pourrait les écraser). */
const VERSION_SITE = 15;
async function versionAJour() {
  try {
    const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    const v = (await r.json()).v;
    if (v > VERSION_SITE && sessionStorage.getItem("recharge") !== String(v)) {
      sessionStorage.setItem("recharge", String(v)); location.reload(); return false;
    }
  } catch { /* hors connexion : on continue */ }
  return true;
}

async function synchroDemarrage() {
  if (!(await versionAJour())) return;
  if (!Sync.actif()) return;
  try {
    const change = await Sync.synchroniser();
    suivi = lire("suivi", {}); perso = lire("perso", []);
    if (typeof recherches !== "undefined") recherches = lire("recherches", []);
    if (typeof evenements !== "undefined") evenements = lire("evenements", []);
    if (typeof actualisations !== "undefined") actualisations = lire("actualisations", {});
    if (typeof labos !== "undefined") labos = lire("labos", []);
    if (typeof contacts !== "undefined") contacts = lire("contacts", []);
    if (typeof rechargerLettres === "function") rechargerLettres();
    if (typeof rechargerProfil === "function") rechargerProfil();
    if (typeof rechargerCv === "function") rechargerCv();
    if (change) afficher();
  } catch (e) { toast("Synchro impossible : " + e.message); }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") synchroDemarrage(); });
