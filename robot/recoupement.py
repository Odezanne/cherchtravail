"""Recoupement des offres : l'offre existe-t-elle vraiment, et où ?
- vérifie que la page est toujours en ligne (offres gardées et meilleures offres, chaque jour) ;
- cherche la même offre sur le site de l'employeur et ailleurs (Tavily, quota gratuit), pour les nouvelles offres
  intéressantes ;
- note les autres sites où le robot a vu la même offre pendant la collecte.
Résultat dans o["recoupement"] = {statut, sites:[{nom, url}], url_employeur, verifie_le} et o["disponibilite"]."""
import json
import os
import re
import urllib.request
from datetime import date
from urllib.parse import urlparse

from util import log, sans_accents

DOMAINES = {
    "mnhn": "mnhn.fr", "museum national": "mnhn.fr", "inrae": "inrae.fr", "cnrs": "cnrs.fr", "inserm": "inserm.fr",
    "pasteur": "pasteur.fr", "agroparistech": "agroparistech.fr", "office francais de la biodiversite": "ofb.gouv.fr",
    "ofb": "ofb.gouv.fr", "anses": "anses.fr", "ird": "ird.fr", "cirad": "cirad.fr", "ifremer": "ifremer.fr",
    "cea": "cea.fr", "paris saclay": "universite-paris-saclay.fr", "sorbonne universite": "sorbonne-universite.fr",
    "universite paris cite": "u-paris.fr", "ens": "ens.psl.eu", "ephe": "ephe.psl.eu", "inria": "inria.fr",
    "ined": "ined.fr", "irstea": "inrae.fr", "ineris": "ineris.fr", "brgm": "brgm.fr", "ifremer": "ifremer.fr",
}
# Sources qui SONT le site de l'employeur
SOURCE_EST_EMPLOYEUR = {"CNRS": "cnrs.fr", "INRAE": "inrae.fr"}
PORTAILS_OFFICIELS = ("choisirleservicepublic.gouv.fr",)
SITES_EMPLOI = ("choisirleservicepublic", "francetravail", "apec.fr", "indeed", "linkedin", "welcometothejungle",
                "hellowork", "jooble", "abg.asso.fr", "euraxess", "emploi-territorial", "adum.fr", "academicpositions",
                "researchgate", "nature.com/naturecareers", "jobs.ac.uk", "sfecologie", "sfe2", "ecoemploi", "agrojob",
                "apecita", "biospace", "jobteaser", "glassdoor", "cadremploi", "meteojob", "profilculture", "inrae.fr",
                "cnrs.fr", "mnhn.fr", "inserm.fr", "pasteur.fr")
# Une page d'offre a presque toujours l'un de ces mots dans son adresse (on écarte les profils, actualités, annuaires)
OFFRE_URL = re.compile(r"job|offre|emploi|recrut|career|carriere|poste|vacanc|candidat|position|annonce|stellen|\.pdf$", re.I)
VIDE = {"de", "du", "des", "la", "le", "les", "et", "en", "a", "au", "aux", "pour", "d", "l", "un", "une", "h", "f", "hf", "fh"}


def mots(t):
    return {m for m in re.findall(r"[a-z0-9]+", sans_accents(t or "").lower()) if m not in VIDE and len(m) > 1}


def ressemble(titre_a, titre_b, seuil=0.6):
    a, b = mots(titre_a), mots(titre_b)
    return bool(a) and len(a & b) / len(a) >= seuil


def domaine_employeur(o):
    if o.get("source") in SOURCE_EST_EMPLOYEUR:
        return SOURCE_EST_EMPLOYEUR[o["source"]]
    e = " " + " ".join(sorted(mots(o.get("employeur", "") + " " + (o.get("source") if o.get("source") == "MNHN" else "")))) + " "
    for cle, dom in DOMAINES.items():
        if all(" " + m + " " in e for m in cle.split()):
            return dom
    return None


def nom_site(url):
    h = urlparse(url).netloc.lower().replace("www.", "")
    return {"choisirleservicepublic.gouv.fr": "Choisir le service public", "emploi.cnrs.fr": "CNRS",
            "jobs.inrae.fr": "INRAE", "abg.asso.fr": "ABG"}.get(h, h)


def noter_doublon(orig, autre):
    """Pendant la collecte : la même offre vue sur un autre site."""
    if not orig or not autre.get("url") or autre.get("source") == orig.get("source"):
        return
    rc = orig.setdefault("recoupement", {})
    sites = rc.setdefault("sites", [])
    if not any(s.get("url") == autre["url"] for s in sites):
        sites.append({"nom": autre.get("source") or nom_site(autre["url"]), "url": autre["url"]})


def _tavily(requete, n=8, domaines=None):
    cle = os.environ.get("TAVILY_API_KEY")
    if not cle:
        return None
    corps = {"api_key": cle, "query": requete, "max_results": n, "search_depth": "basic", "include_answer": False}
    if domaines:
        corps["include_domains"] = domaines
    req = urllib.request.Request("https://api.tavily.com/search", data=json.dumps(corps).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r).get("results", [])
    except Exception as e:
        log(f"Recoupement Tavily : {e}")
        return None


def chercher_ailleurs(o):
    """Cherche la même offre sur le web. Met à jour o["recoupement"]. Renvoie True si une recherche a été faite."""
    titre = re.sub(r"\s*\((?:H/F|F/H|H-F|F-H)\)\s*", " ", o.get("titre", "")).strip()
    if len(titre) < 8:
        return False
    dom = domaine_employeur(o)
    res = _tavily(f"\"{titre[:90]}\" {o.get('employeur') or ''} offre", 8)
    if res is None:
        return False
    hote_origine = urlparse(o.get("url", "")).netloc.lower()
    if dom and not hote_origine.endswith(dom) and not any(urlparse(x.get("url", "")).netloc.lower().endswith(dom) for x in res):
        res += _tavily(f"{titre[:90]} recrutement", 5, [dom]) or []  # deuxième essai, sur le seul site de l'employeur
    rc = o.setdefault("recoupement", {})
    sites = rc.setdefault("sites", [])
    norm = lambda u: u.split("?")[0].split("#")[0].rstrip("/").replace("://www.", "://")
    url_origine = norm(o.get("url", ""))
    for x in res:
        u = x.get("url", "")
        if not u or norm(u) == url_origine:
            continue
        pu = urlparse(u)
        if re.search(r"/(in|pub|people|profil|profile|annuaire|team|equipe|actualites?|news)/", pu.path, re.I) \
                or not OFFRE_URL.search(pu.netloc + pu.path):
            continue
        if not (ressemble(titre, x.get("title", "")) or ressemble(titre, (x.get("content") or "")[:400], 0.8)):
            continue
        h = urlparse(u).netloc.lower()
        if dom and h.endswith(dom):
            rc["url_employeur"] = u
        elif not any(s in u for s in SITES_EMPLOI):
            continue  # page sans rapport (actualité, PDF d'annuaire…)
        if not any(s.get("url") == u for s in sites):
            sites.append({"nom": nom_site(u), "url": u})
    rc["cherche_le"] = date.today().isoformat()
    return True


def statut(o):
    """employeur : confirmée par l'employeur ; plusieurs : vue sur 2 sites ou plus ; officiel : seulement sur le portail
    de l'État ; unique : un seul site ; inconnu : pas encore recoupée."""
    rc = o.get("recoupement") or {}
    dom = domaine_employeur(o)
    hote = urlparse(o.get("url", "")).netloc.lower()
    if (dom and hote.endswith(dom)) or rc.get("url_employeur"):
        return "employeur"
    if rc.get("sites"):
        return "plusieurs"
    if not rc.get("cherche_le"):
        return "inconnu"
    if any(p in hote for p in PORTAILS_OFFICIELS):
        return "officiel"
    return "unique"


def recouper(offres, gardees_ids, verifier, max_tavily=8, max_verif=220):
    """offres : toutes les offres du site. gardees_ids : offres gardées (« à postuler »).
    verifier(o) -> (disponibilite, texte) : la fonction de recherche.py."""
    auj = date.today().isoformat()
    # 1. Toujours en ligne ? Sur la page d'origine ET, pour Choisir le service public, sur le site de l'employeur.
    #    Toutes les offres du site sont revues chaque jour (offres gardées d'abord, puis les jamais vérifiées, puis par %).
    ordre = sorted(offres, key=lambda o: (o["id"] not in gardees_ids, bool(o.get("verifiee_le")),
                                          -(o.get("analyse") or {}).get("score", 0)))
    n_verif = n_mortes = 0
    for o in ordre:
        if n_verif >= max_verif:
            break
        if o.get("verifiee_le") == auj or o.get("perso"):
            continue
        dispo, _ = verifier(o)
        n_verif += 1
        o["verifiee_le"] = auj
        if o.get("url_employeur") and o.get("employeur_confirme"):
            o.setdefault("recoupement", {})["url_employeur"] = o["url_employeur"]
        if dispo == "expiree":
            if o.get("disponibilite") != "expiree":
                o["expiree_le"] = auj
                n_mortes += 1
                log(f"  plus en ligne : {o.get('titre', '')[:70]} ({o.get('url_employeur') or o.get('url')})")
            o["disponibilite"] = "expiree"
        elif dispo == "disponible":
            o["disponibilite"] = "disponible"
            o.pop("expiree_le", None)
        else:
            o.setdefault("disponibilite", "non_verifiable")
    # 2. Recherche ailleurs : offres gardées et nouvelles offres intéressantes jamais recoupées
    n_t = 0
    for o in ordre:
        if n_t >= max_tavily:
            break
        rc = o.get("recoupement") or {}
        if rc.get("cherche_le") or o.get("disponibilite") == "expiree":
            continue
        if o["id"] not in gardees_ids and (o.get("analyse") or {}).get("score", 0) < 55:
            continue
        if statut(o) == "employeur" and o["id"] not in gardees_ids:
            continue  # déjà publiée par l'employeur lui-même : inutile de dépenser une recherche
        if chercher_ailleurs(o):
            n_t += 1
    for o in offres:
        if o.get("recoupement") or statut(o) == "employeur":
            o.setdefault("recoupement", {})["statut"] = statut(o)
    log(f"Recoupement : {n_verif} pages revérifiées ({n_mortes} plus en ligne), {n_t} recherches sur le web")
    return n_mortes
