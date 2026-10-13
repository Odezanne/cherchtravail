"use strict";
/* Onglet Profil : ce que je cherche et ce que je sais faire. Le robot s'en sert pour calculer le % de chaque offre
   (dès le prochain passage, ou tout de suite avec « Relancer l'analyse »). Contient aussi la synchronisation. */

const PROFIL_DEFAUT = {
  postes: "Ingénieur d'études / de recherche contractuel en biologie, écologie, éthologie\nBiostatisticien·ne\n"
    + "Chargé·e d'analyse de données en biologie, écologie ou santé animale\nIngénieur en modélisation ou génétique des populations\n"
    + "Ingénieur de terrain en écologie comportementale ou suivi de faune\nIngénieur en suivi comportemental (modèles animaux, zebrafish, rongeurs)\n"
    + "Data manager scientifique\nChargé·e d'études biodiversité (sciences participatives, Vigie-Nature)",
  essentiels: "comportement, éthologie, behaviour, biostatistique, primates, écologie comportementale, cognition animale, bien-être animal, zebrafish",
  importants: "écologie, biodiversité, faune, conservation, génétique des populations, modèles mixtes, GLMM, statistiques, analyse de données, modélisation",
  bonus: "biologie, animal, zoologie, évolution, neurosciences, épidémiologie, santé animale, One Health, sciences participatives, Muséum, MNHN, INRAE, Anses, OFB",
  exclusions: "stage, alternance, apprentissage, postdoc, post-doctorant, volontariat, service civique, bénévolat",
  recherches: "biostatisticien\ningénieur d'études biologie\ncomportement animal\nécologie\nbiodiversité\nanalyse de données biologie",
  contrats: ["cdd", "cdi", "these"], dureeMin: 6, dureeMax: 18,
  zones: ["idf"], salaire: 2500,
  projet: "Préparer ensuite une thèse en comportement animal ou dans un domaine proche (écologie comportementale, cognition, "
    + "bien-être animal, interactions homme-faune, conservation). Privilégier les postes qui rapprochent d'un labo, d'une école doctorale ou d'une CIFRE.",
  competences: "R (modèles mixtes GLMM/LMM, lme4, glmmTMB, emmeans, DHARMa, ggplot2), biostatistique, génétique des populations, "
    + "conception de protocoles, éthologie de terrain (échantillonnage comportemental, primates), CyberTracker, QGIS, ViewPoint (tracking), "
    + "médiation scientifique, anglais courant (IELTS 8.5), espagnol B1, Pack Office",
  nouveautes: "",
  manques: "Python, bioinformatique, biologie moléculaire de paillasse, habilitation à l'expérimentation animale, SQL, permis de conduire",
  premierEmploi: true,
};
let profil = Object.assign({}, PROFIL_DEFAUT, lire("profil", {}));
function rechargerProfil() { profil = Object.assign({}, PROFIL_DEFAUT, lire("profil", {})); }

function blocSynchro() {
  const r = Sync.reglages();
  if (Sync.actif()) {
    return `<div class="bloc-export">
      <p style="margin:0 0 8px"><b>✓ Synchronisation active</b> avec <code>${esc(r.depot)}</code>${r.derniere ? ` · dernière synchro ${dateFr(r.derniere, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}.
      Candidatures, lettres, profil, CV et documents sont partagés entre ton téléphone et ton ordinateur.</p>
      <div class="actions-ligne deux">
        <button class="bouton" data-profil="synchro">Synchroniser</button>
        <button class="bouton" data-profil="deconnecter">Déconnecter</button>
      </div></div>`;
  }
  return `<div class="bloc-export">
    <p style="margin:0 0 8px"><b>Utiliser le site sur ton téléphone et ton ordinateur</b><br>
    Colle la clé d'accès GitHub que tu as créée (elle reste dans ce navigateur, elle n'est jamais publiée). À faire une fois par appareil.</p>
    <label class="champ-l">Clé d'accès (commence par github_pat_)<input type="password" id="sync-token" autocomplete="off" placeholder="github_pat_…"></label>
    <label class="champ-l">Dépôt privé<input id="sync-depot" value="Odezanne/cherchtravail-donnees"></label>
    <button class="bouton principal" data-profil="connecter" style="margin-top:8px">Connecter cet appareil</button>
  </div>`;
}

function champTexte(cle, titre, aide, lignes = 3) {
  return `<label class="champ-l">${titre}${aide ? `<small>${aide}</small>` : ""}<textarea data-profil-champ="${cle}" rows="${lignes}">${esc(profil[cle])}</textarea></label>`;
}
function puces(cle, options) {
  return `<div class="puces">${options.map(([v, n]) => `<label><input type="checkbox" data-profil-liste="${cle}" value="${v}" ${profil[cle].includes(v) ? "checked" : ""}><span>${n}</span></label>`).join("")}</div>`;
}

function rendreProfil() {
  return `<div class="lettre profil">
    <h2 class="groupe">Synchronisation</h2>
    ${blocSynchro()}

    <h2 class="groupe">Ce que je cherche</h2>
    ${champTexte("postes", "Postes visés", "Un par ligne, du plus important au moins important.", 6)}
    ${champTexte("projet", "Mon projet à moyen terme", "", 3)}
    <div class="champ-l">Contrats qui m'intéressent${puces("contrats", [["cdd", "CDD"], ["cdi", "CDI"], ["these", "Thèse / CIFRE"], ["autre", "Autres"]])}</div>
    <div class="suivi-champs">
      <label class="champ-l">Durée min. (mois)<input type="number" min="0" data-profil-champ="dureeMin" value="${esc(profil.dureeMin)}"></label>
      <label class="champ-l">Durée max. (mois)<input type="number" min="0" data-profil-champ="dureeMax" value="${esc(profil.dureeMax)}"></label>
    </div>
    <div class="champ-l">Zones prioritaires${puces("zones", [["idf", "Île-de-France"], ["france", "Reste de la France"], ["etranger", "Étranger"]])}</div>
    <label class="champ-l">Salaire souhaité (brut par mois)<input type="number" step="100" min="0" data-profil-champ="salaire" value="${esc(profil.salaire)}"><small>Sert à trier, jamais à éliminer.</small></label>

    <h2 class="groupe">Mots-clés qui font monter le %</h2>
    ${champTexte("essentiels", "Essentiels", "Séparés par des virgules.", 3)}
    ${champTexte("importants", "Importants", "", 3)}
    ${champTexte("bonus", "Bonus", "", 3)}
    ${champTexte("exclusions", "À exclure (dans le titre)", "", 2)}
    ${champTexte("recherches", "Recherches automatiques chaque matin", "Une par ligne : le robot les lance sur Choisir le service public et Adzuna.", 5)}

    <h2 class="groupe">Mon parcours</h2>
    ${champTexte("competences", "Compétences que j'ai", "Séparées par des virgules. Ajoute ce que tu apprends.", 5)}
    ${champTexte("nouveautes", "Nouvelles formations, certifications, expériences", "Une par ligne, avec la date. Ex. : « 11/2026 : MOOC Python pour la biologie (FUN) ».", 4)}
    ${champTexte("manques", "Ce qui me manque encore", "Ce qui compte comme un manque dans les offres.", 3)}
    <label class="case"><input type="checkbox" data-profil-champ="premierEmploi" ${profil.premierEmploi ? "checked" : ""}> Je cherche mon premier emploi (hors stages)</label>

    <div class="actions">
      <button class="bouton principal" data-profil="relancer">Relancer l'analyse des offres avec ce profil</button>
      <p class="vide-petit">Sinon, ton profil est pris en compte au prochain passage du robot (chaque matin). Le CV marqué ★ dans Dossier est aussi lu par le robot.</p>
      <button class="lien" data-profil="defaut">Revenir au profil d'origine</button>
    </div>
  </div>`;
}

async function actionProfil(el, evt) {
  const nom = el.dataset.profil;
  try {
    switch (nom) {
      case "connecter": {
        const token = $("#sync-token").value.trim(), depot = $("#sync-depot").value.trim();
        if (!/^(github_pat_|ghp_)/.test(token)) return toast("La clé doit commencer par github_pat_");
        toast("Connexion…");
        await Sync.configurer(token, depot);
        suivi = lire("suivi", {}); perso = lire("perso", []); rechargerLettres(); rechargerProfil(); if (typeof rechargerCv === "function") rechargerCv();
        toast("Appareil connecté, tes données sont synchronisées"); return afficher();
      }
      case "synchro":
        await synchroDemarrage(); toast("Synchronisé"); return afficher();
      case "deconnecter":
        if (!confirm("Déconnecter cet appareil ? Tes données restent dans ton espace privé et sur cet appareil.")) return;
        Sync.deconnecter(); return afficher();
      case "relancer":
        if (!Sync.actif()) return toast("Active d'abord la synchronisation (en haut de cet onglet)");
        await Sync.synchroniser();
        await Sync.lancer("robot.yml", { forcer: "true", reanalyser: "true" });
        return toast("Le robot recalcule les % : résultats dans 10 à 20 minutes");
      case "defaut":
        if (!confirm("Revenir au profil d'origine ? Tes modifications seront perdues.")) return;
        profil = Object.assign({}, PROFIL_DEFAUT); ecrire("profil", profil); return afficher();
    }
  } catch (e) { toast("Erreur : " + e.message); }
}

document.addEventListener("click", (e) => { const el = e.target.closest("button[data-profil]"); if (el) actionProfil(el, e); });
document.addEventListener("input", (e) => {
  const el = e.target.closest("[data-profil-champ]");
  if (el) {
    const c = el.dataset.profilChamp;
    profil[c] = el.type === "checkbox" ? el.checked : el.type === "number" ? (el.value === "" ? null : +el.value) : el.value;
    profil._maj = new Date().toISOString(); ecrire("profil", profil);
  }
  const li = e.target.closest("[data-profil-liste]");
  if (li) {
    const c = li.dataset.profilListe;
    profil[c] = [...document.querySelectorAll(`[data-profil-liste="${c}"]:checked`)].map((x) => x.value);
    profil._maj = new Date().toISOString(); ecrire("profil", profil);
  }
});

synchroDemarrage();
