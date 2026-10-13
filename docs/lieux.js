"use strict";
/* Localisation des offres : ville, département, région, pays, déduits du texte « lieu » de chaque offre.
   Sert au filtre « Localisation » (Emplois, Thèses, résultats de recherche). */

const DEPS = {
  "01": "Ain|ARA", "02": "Aisne|HDF", "03": "Allier|ARA", "04": "Alpes-de-Haute-Provence|PACA", "05": "Hautes-Alpes|PACA",
  "06": "Alpes-Maritimes|PACA", "07": "Ardèche|ARA", "08": "Ardennes|GE", "09": "Ariège|OCC", "10": "Aube|GE",
  "11": "Aude|OCC", "12": "Aveyron|OCC", "13": "Bouches-du-Rhône|PACA", "14": "Calvados|NOR", "15": "Cantal|ARA",
  "16": "Charente|NA", "17": "Charente-Maritime|NA", "18": "Cher|CVL", "19": "Corrèze|NA", "2A": "Corse-du-Sud|COR",
  "2B": "Haute-Corse|COR", "21": "Côte-d'Or|BFC", "22": "Côtes-d'Armor|BRE", "23": "Creuse|NA", "24": "Dordogne|NA",
  "25": "Doubs|BFC", "26": "Drôme|ARA", "27": "Eure|NOR", "28": "Eure-et-Loir|CVL", "29": "Finistère|BRE",
  "30": "Gard|OCC", "31": "Haute-Garonne|OCC", "32": "Gers|OCC", "33": "Gironde|NA", "34": "Hérault|OCC",
  "35": "Ille-et-Vilaine|BRE", "36": "Indre|CVL", "37": "Indre-et-Loire|CVL", "38": "Isère|ARA", "39": "Jura|BFC",
  "40": "Landes|NA", "41": "Loir-et-Cher|CVL", "42": "Loire|ARA", "43": "Haute-Loire|ARA", "44": "Loire-Atlantique|PDL",
  "45": "Loiret|CVL", "46": "Lot|OCC", "47": "Lot-et-Garonne|NA", "48": "Lozère|OCC", "49": "Maine-et-Loire|PDL",
  "50": "Manche|NOR", "51": "Marne|GE", "52": "Haute-Marne|GE", "53": "Mayenne|PDL", "54": "Meurthe-et-Moselle|GE",
  "55": "Meuse|GE", "56": "Morbihan|BRE", "57": "Moselle|GE", "58": "Nièvre|BFC", "59": "Nord|HDF", "60": "Oise|HDF",
  "61": "Orne|NOR", "62": "Pas-de-Calais|HDF", "63": "Puy-de-Dôme|ARA", "64": "Pyrénées-Atlantiques|NA",
  "65": "Hautes-Pyrénées|OCC", "66": "Pyrénées-Orientales|OCC", "67": "Bas-Rhin|GE", "68": "Haut-Rhin|GE",
  "69": "Rhône|ARA", "70": "Haute-Saône|BFC", "71": "Saône-et-Loire|BFC", "72": "Sarthe|PDL", "73": "Savoie|ARA",
  "74": "Haute-Savoie|ARA", "75": "Paris|IDF", "76": "Seine-Maritime|NOR", "77": "Seine-et-Marne|IDF",
  "78": "Yvelines|IDF", "79": "Deux-Sèvres|NA", "80": "Somme|HDF", "81": "Tarn|OCC", "82": "Tarn-et-Garonne|OCC",
  "83": "Var|PACA", "84": "Vaucluse|PACA", "85": "Vendée|PDL", "86": "Vienne|NA", "87": "Haute-Vienne|NA",
  "88": "Vosges|GE", "89": "Yonne|BFC", "90": "Territoire de Belfort|BFC", "91": "Essonne|IDF",
  "92": "Hauts-de-Seine|IDF", "93": "Seine-Saint-Denis|IDF", "94": "Val-de-Marne|IDF", "95": "Val-d'Oise|IDF",
  "971": "Guadeloupe|OM", "972": "Martinique|OM", "973": "Guyane|OM", "974": "La Réunion|OM", "976": "Mayotte|OM",
  "987": "Polynésie française|OM", "988": "Nouvelle-Calédonie|OM",
};
const REGIONS = {
  IDF: "Île-de-France", ARA: "Auvergne-Rhône-Alpes", HDF: "Hauts-de-France", PACA: "Provence-Alpes-Côte d'Azur",
  GE: "Grand Est", OCC: "Occitanie", NOR: "Normandie", NA: "Nouvelle-Aquitaine", CVL: "Centre-Val de Loire",
  COR: "Corse", BFC: "Bourgogne-Franche-Comté", BRE: "Bretagne", PDL: "Pays de la Loire", OM: "Outre-mer",
};
/* Villes fréquentes dans les offres de recherche → département */
const VILLES = {
  "paris": "75", "palaiseau": "91", "gif sur yvette": "91", "orsay": "91", "saclay": "91", "evry": "91", "evry courcouronnes": "91",
  "massy": "91", "les ulis": "91", "brunoy": "91", "bures sur yvette": "91", "saint aubin": "91", "jouy en josas": "78",
  "versailles": "78", "guyancourt": "78", "thiverval grignon": "78", "plaisir": "78", "saint quentin en yvelines": "78",
  "rambouillet": "78", "meudon": "92", "nanterre": "92", "montrouge": "92", "clamart": "92", "boulogne billancourt": "92",
  "issy les moulineaux": "92", "chatenay malabry": "92", "sevres": "92", "antony": "92", "villetaneuse": "93",
  "bobigny": "93", "saint denis": "93", "aubervilliers": "93", "bondy": "93", "pantin": "93", "villejuif": "94",
  "creteil": "94", "ivry sur seine": "94", "vincennes": "94", "maisons alfort": "94", "charenton le pont": "94",
  "fontenay sous bois": "94", "vitry sur seine": "94", "champs sur marne": "77", "marne la vallee": "77",
  "fontainebleau": "77", "cergy": "95", "cergy pontoise": "95",
  "montpellier": "34", "sete": "34", "beziers": "34", "toulouse": "31", "castanet tolosan": "31", "auzeville tolosane": "31",
  "nimes": "30", "perpignan": "66", "banyuls sur mer": "66", "moulis": "09", "albi": "81", "montauban": "82",
  "marseille": "13", "aix en provence": "13", "arles": "13", "avignon": "84", "nice": "06", "valbonne": "06",
  "sophia antipolis": "06", "antibes": "06", "villefranche sur mer": "06", "toulon": "83", "la seyne sur mer": "83",
  "lyon": "69", "villeurbanne": "69", "bron": "69", "grenoble": "38", "saint martin d heres": "38", "la tronche": "38",
  "clermont ferrand": "63", "aubiere": "63", "saint etienne": "42", "chambery": "73", "le bourget du lac": "73",
  "annecy": "74", "thonon les bains": "74", "bordeaux": "33", "talence": "33", "pessac": "33", "cestas": "33",
  "arcachon": "33", "la rochelle": "17", "poitiers": "86", "limoges": "87", "pau": "64", "anglet": "64", "bayonne": "64",
  "rennes": "35", "brest": "29", "plouzane": "29", "roscoff": "29", "concarneau": "29", "lorient": "56", "vannes": "56",
  "nantes": "44", "angers": "49", "le mans": "72", "caen": "14", "rouen": "76", "le havre": "76", "lille": "59",
  "villeneuve d ascq": "59", "dunkerque": "59", "boulogne sur mer": "62", "amiens": "80", "strasbourg": "67",
  "illkirch graffenstaden": "67", "colmar": "68", "mulhouse": "68", "nancy": "54", "vandoeuvre les nancy": "54",
  "champenoux": "54", "metz": "57", "reims": "51", "dijon": "21", "besancon": "25", "orleans": "45", "tours": "37",
  "nouzilly": "37", "chartres": "28", "blois": "41", "bourges": "18", "ajaccio": "2A", "bastia": "2B", "corte": "2B",
  "biguglia": "2B", "cayenne": "973", "kourou": "973", "saint denis de la reunion": "974", "pointe a pitre": "971",
};
const PAYS = ["Royaume-Uni", "Allemagne", "Espagne", "Italie", "Belgique", "Suisse", "Pays-Bas", "Luxembourg", "Portugal",
  "Suède", "Norvège", "Danemark", "Finlande", "Irlande", "Autriche", "États-Unis", "Canada", "Australie", "Japon"];
const PAYS_ALIAS = { "uk": "Royaume-Uni", "united kingdom": "Royaume-Uni", "england": "Royaume-Uni", "germany": "Allemagne",
  "spain": "Espagne", "italy": "Italie", "belgium": "Belgique", "switzerland": "Suisse", "netherlands": "Pays-Bas",
  "sweden": "Suède", "norway": "Norvège", "denmark": "Danemark", "finland": "Finlande", "ireland": "Irlande",
  "austria": "Autriche", "usa": "États-Unis", "united states": "États-Unis", "japan": "Japon", "australia": "Australie",
  "cambridge": "Royaume-Uni", "london": "Royaume-Uni", "londres": "Royaume-Uni", "oxford": "Royaume-Uni",
  "edinburgh": "Royaume-Uni", "geneve": "Suisse", "lausanne": "Suisse", "zurich": "Suisse", "bruxelles": "Belgique",
  "barcelona": "Espagne", "barcelone": "Espagne", "madrid": "Espagne", "berlin": "Allemagne", "munich": "Allemagne",
  "amsterdam": "Pays-Bas", "gibraltar": "Royaume-Uni" };

const normLieu = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/['’\-_.,/]/g, " ").replace(/\bst(e?)\b/g, "saint$1").replace(/\s+/g, " ").trim();
const DEP_PAR_NOM = Object.fromEntries(Object.entries(DEPS).map(([k, v]) => [normLieu(v.split("|")[0]), k]));
DEP_PAR_NOM["reunion"] = "974";
const PAYS_PAR_NOM = Object.assign(Object.fromEntries(PAYS.map((p) => [normLieu(p), p])), PAYS_ALIAS);
const titreVille = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Sur|Sous|Les|Le|La|En|De|Du|Des|D|L|Aux?)\b/g, (m) => m.toLowerCase())
  .replace(/^./, (c) => c.toUpperCase());

const _cacheLieu = new Map();
function localiser(o) {
  const brut = o.lieu || "";
  const cle = brut + "§" + (o.region || "");
  if (_cacheLieu.has(cle)) return _cacheLieu.get(cle);
  const n = normLieu(brut);
  let dep = null, ville = null, pays = null;
  const m = brut.match(/\((\d{2,3}|2[ab])\)/i) || brut.match(/\b(\d{5})\b/);
  if (m) {
    const c = m[1].toUpperCase();
    dep = c.length === 5 ? (c.startsWith("97") ? c.slice(0, 3) : c.startsWith("20") ? (+c < 20200 ? "2A" : "2B") : c.slice(0, 2)) : c;
    if (!DEPS[dep]) dep = null;
  }
  const sansNum = n.replace(/\(.*?\)/g, "").replace(/\b\d+\b/g, "").replace(/\b(cedex|france)\b/g, "").replace(/\s+/g, " ").trim();
  if (!dep && DEP_PAR_NOM[sansNum]) dep = DEP_PAR_NOM[sansNum];
  if (VILLES[sansNum]) { ville = titreVille(sansNum); dep = dep || VILLES[sansNum]; }
  if (!dep && !pays) {
    for (const [nom, p] of Object.entries(PAYS_PAR_NOM)) if (new RegExp(`\\b${nom}\\b`).test(n)) { pays = p; break; }
  }
  if (!dep && !pays && sansNum) {
    // ville inconnue de la table : on cherche un morceau connu (« Montpellier Cedex 5 », « Paris La Defense »…)
    for (const v of Object.keys(VILLES)) if (new RegExp(`^${v}\\b`).test(sansNum)) { ville = titreVille(v); dep = VILLES[v]; break; }
  }
  if (!ville && dep && sansNum && !DEP_PAR_NOM[sansNum] && !/^(ile de france|europe|teletravail)/.test(sansNum)) ville = titreVille(sansNum);
  let reg = dep ? DEPS[dep].split("|")[1] : null;
  if (!reg && /ile de france/.test(n)) reg = "IDF";
  if (!pays) pays = dep || reg || o.region === "idf" || o.region === "france" ? "France" : o.region === "etranger" ? "Étranger (autre)" : null;
  const r = { ville, dep, depNom: dep ? DEPS[dep].split("|")[0] : null, reg, regNom: reg ? REGIONS[reg] : null, pays };
  _cacheLieu.set(cle, r);
  return r;
}

/* Clés de filtre : r:IDF, d:34, v:Montpellier, p:Espagne */
function clesLieu(o) {
  const l = localiser(o);
  return [l.reg && "r:" + l.reg, l.dep && "d:" + l.dep, l.ville && "v:" + l.ville, l.pays && "p:" + l.pays].filter(Boolean);
}
function nomCleLieu(k) {
  const [t, v] = [k.slice(0, 1), k.slice(2)];
  return t === "r" ? REGIONS[v] || v : t === "d" ? `${DEPS[v]?.split("|")[0] || v} (${v})` : v;
}
function passeLieu(o) {
  const choix = etat.lieux || [];
  if (!choix.length) return true;
  const cles = clesLieu(o);
  const dedans = choix.some((k) => cles.includes(k));
  return etat.lieuxMode === "exclure" ? !dedans : dedans || (!cles.length && etat.zones.includes("?"));
}
/* Texte affiché sur la carte : on ajoute le département quand le lieu ne le dit pas */
function lieuAffiche(o) {
  const l = localiser(o);
  if (!o.lieu) return "";
  if (l.dep && l.dep !== "75" && !/\(|\b\d{2,5}\b/.test(o.lieu) && !DEP_PAR_NOM[normLieu(o.lieu)]) return `${o.lieu} (${l.dep})`;
  return o.lieu;
}

/* Rappel du filtre au-dessus de la liste, avec accès direct */
function bandeauLieux() {
  const choix = etat.lieux || [];
  const tete = etat.lieuxMode === "exclure" ? "Sauf" : "📍";
  return `<div class="bandeau-lieux">${choix.length
    ? `<span>${tete}</span>${choix.map((k) => `<button class="puce-lieu" data-lieu-retirer="${esc(k)}">${esc(nomCleLieu(k))} ✕</button>`).join("")}`
    : ""}<button class="lien" data-lieu-ouvrir>${choix.length ? "Modifier" : "📍 Filtrer par lieu"}</button></div>`;
}
document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-lieu-ouvrir]")) return;
  const p = document.getElementById("panneau");
  p.hidden = false; document.getElementById("btn-filtres").setAttribute("aria-expanded", "true");
  rendreFiltreLieux(); window.scrollTo(0, 0);
  setTimeout(() => document.getElementById("lieux-saisie")?.focus(), 50);
});

/* ---------- Interface du filtre (dans le panneau Filtres) */
function optionsLieux() {
  const vus = new Map();
  for (const o of donnees.offres.concat(typeof resultats !== "undefined" ? Object.values(resultats).flatMap((r) => r?.offres || []) : [])) {
    for (const k of clesLieu(o)) vus.set(k, (vus.get(k) || 0) + 1);
  }
  for (const r of Object.keys(REGIONS)) if (!vus.has("r:" + r)) vus.set("r:" + r, 0);
  for (const d of Object.keys(DEPS)) if (!vus.has("d:" + d)) vus.set("d:" + d, 0);
  return vus;
}
function rendreFiltreLieux() {
  const zone = document.getElementById("lieux-filtre");
  if (!zone) return;
  const vus = optionsLieux();
  const choix = etat.lieux || [];
  const typeOrdre = { r: 0, d: 1, v: 2, p: 3 };
  const tous = [...vus.entries()].sort((a, b) => typeOrdre[a[0][0]] - typeOrdre[b[0][0]] || b[1] - a[1] || nomCleLieu(a[0]).localeCompare(nomCleLieu(b[0])));
  const raccourcis = tous.filter(([k, n]) => k.startsWith("r:") && n > 0 && !choix.includes(k)).slice(0, 6);
  const libelle = (k) => ({ r: "région", d: "département", v: "ville", p: "pays" })[k[0]];
  zone.innerHTML = `
    <div class="lieux-mode">
      <label><input type="radio" name="lieux-mode" value="inclure" ${etat.lieuxMode !== "exclure" ? "checked" : ""}><span>Seulement ces lieux</span></label>
      <label><input type="radio" name="lieux-mode" value="exclure" ${etat.lieuxMode === "exclure" ? "checked" : ""}><span>Tout sauf ces lieux</span></label>
    </div>
    <div class="puces lieux-choix">${choix.map((k) => `<button class="puce-lieu" data-lieu-retirer="${esc(k)}">${esc(nomCleLieu(k))} ✕</button>`).join("")}</div>
    <input list="lieux-liste" id="lieux-saisie" placeholder="Ville, département, région ou pays" autocomplete="off">
    <datalist id="lieux-liste">${tous.map(([k, n]) => `<option value="${esc(nomCleLieu(k))}" label="${libelle(k)}${n ? " · " + n + " offre" + (n > 1 ? "s" : "") : ""}"></option>`).join("")}</datalist>
    ${raccourcis.length ? `<div class="puces raccourcis">${raccourcis.map(([k, n]) => `<button class="puce-lieu legere" data-lieu-ajouter="${esc(k)}">+ ${esc(nomCleLieu(k))} (${n})</button>`).join("")}</div>` : ""}
    ${choix.length && etat.lieuxMode !== "exclure" ? `<p class="aide">Quand des lieux sont choisis ici, les cases « Zone » ci-dessus sont ignorées.</p>` : ""}`;
  zone._index = new Map(tous.map(([k]) => [normLieu(nomCleLieu(k)), k]));
}
function ajouterLieu(k) {
  if (!k) return;
  etat.lieux = [...new Set([...(etat.lieux || []), k])];
  rendreFiltreLieux(); afficher();
}
document.addEventListener("change", (e) => {
  if (e.target.id === "lieux-saisie") {
    const zone = document.getElementById("lieux-filtre");
    const v = normLieu(e.target.value);
    let k = zone._index?.get(v);
    if (!k && v) { // saisie libre : département par numéro, ou ville
      if (DEPS[v.toUpperCase()]) k = "d:" + v.toUpperCase();
      else if (VILLES[v]) k = "v:" + titreVille(v);
      else k = "v:" + titreVille(v);
    }
    ajouterLieu(k);
  }
  if (e.target.name === "lieux-mode") { etat.lieuxMode = e.target.value; rendreFiltreLieux(); afficher(); }
});
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-lieu-ajouter]"); if (a) return ajouterLieu(a.dataset.lieuAjouter);
  const r = e.target.closest("[data-lieu-retirer]");
  if (r) { etat.lieux = (etat.lieux || []).filter((k) => k !== r.dataset.lieuRetirer); rendreFiltreLieux(); afficher(); }
});
