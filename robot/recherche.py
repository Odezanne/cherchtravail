"""Recherche à la demande, lancée depuis la barre de recherche du site.

Sources : Jooble et Adzuna (API, regroupent de nombreux sites d'emploi ; Adzuna est payant, facultatif), Choisir le service public, flux CNRS,
recherche web Tavily (API). Chaque offre est vérifiée (page encore en ligne ?) quand le site l'autorise,
puis notée par l'IA selon le profil. Résultat écrit dans le dépôt privé : recherches/<id>.json
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import yaml

sys.path.insert(0, str(Path(__file__).parent))
import analyse  # noqa: E402
import donnees  # noqa: E402
import sources  # noqa: E402
from llm import IA  # noqa: E402
from util import JOURNAL, NE_JAMAIS_TELECHARGER, autorise, html_en_texte, identifiant, log, sans_accents, telecharger  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
EXPIREE = re.compile(r"(offre (n.est plus|a expir|expir[ée]e|pourvue|cl[ôo]tur[ée]e|n.existe plus|introuvable)|"
                     r"(poste|annonce) (d[ée]j[àa] )?pourvu|recrutement (est )?(termin|clos|cl[ôo]tur)|candidatures? (sont )?(closes|cl[ôo]tur)|"
                     r"no longer (available|accepting)|this job (has expired|is closed)|annonce (expir|n.est plus)|"
                     r"date limite de candidature est d[ée]pass[ée]e)", re.I)


def tavily(requete, n=12):
    cle = os.environ.get("TAVILY_API_KEY")
    if not cle:
        return []
    corps = {"api_key": cle, "query": f"offre d'emploi {requete} France", "max_results": n, "search_depth": "basic",
             "include_answer": False}
    req = urllib.request.Request("https://api.tavily.com/search", data=json.dumps(corps).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            res = json.load(r).get("results", [])
    except Exception as e:
        log(f"Tavily : {e}")
        return []
    offres = []
    for x in res:
        hote = urlparse(x.get("url", "")).netloc.replace("www.", "")
        offres.append({"id": "web-" + identifiant(x.get("url", "")), "source": hote, "url": x.get("url", ""),
                       "titre": sources.nettoyer(x.get("title", ""))[:160], "employeur": "", "lieu": "",
                       "region": sources.region_de(x.get("content", "")[:600]), "contrat": "", "type": "emploi",
                       "date_publication": "", "texte": sources.nettoyer(x.get("content", ""))[:3000]})
    log(f"Tavily : {len(offres)} pages trouvées")
    return offres


def verifier(o):
    """Renvoie (disponibilite, texte). disponibilite : 'disponible', 'expiree' ou 'non_verifiable'."""
    url = o.get("url") or ""
    hote = urlparse(url).netloc.lower()
    if not url or any(b in hote for b in NE_JAMAIS_TELECHARGER):
        return "non_verifiable", ""
    try:
        if not autorise(url):
            return "non_verifiable", ""
        page = telecharger(url, timeout=30, verifier_robots=False)
    except urllib.error.HTTPError as e:
        return ("expiree" if e.code in (404, 410) else "non_verifiable"), ""
    except Exception:
        return "non_verifiable", ""
    texte = sources.texte_offre_csp(page) if "choisirleservicepublic" in url else html_en_texte(page)
    debut = sans_accents(texte).find(sans_accents(o.get("titre", ""))[:25])
    texte = texte[debut:] if debut > 0 else texte
    if EXPIREE.search(texte[:4000]):
        return "expiree", texte[:6000]
    # Choisir le service public garde parfois en ligne une offre que l'employeur a déjà retirée de son propre site :
    # on suit le bouton « Postuler sur le site employeur » et c'est l'employeur qui fait foi.
    if "choisirleservicepublic" in url:
        lien = sources.lien_employeur_csp(page)
        if lien:
            o["url_employeur"] = lien
            etat = verifier_page_employeur(lien)
            if etat == "expiree":
                return "expiree", texte[:6000]
            if etat == "disponible":
                o["employeur_confirme"] = True
    return "disponible", texte[:6000]


def verifier_page_employeur(url):
    """'disponible', 'expiree' ou 'non_verifiable' pour la page de l'offre sur le site de l'employeur."""
    hote = urlparse(url).netloc.lower()
    if any(b in hote for b in NE_JAMAIS_TELECHARGER):
        return "non_verifiable"
    try:
        if not autorise(url):
            return "non_verifiable"
        page = telecharger(url, timeout=30, verifier_robots=False)
    except urllib.error.HTTPError as e:
        return "expiree" if e.code in (404, 410) else "non_verifiable"
    except Exception:
        return "non_verifiable"
    t = html_en_texte(page)
    if EXPIREE.search(t[:6000]):
        return "expiree"
    return "disponible" if len(t) > 300 else "non_verifiable"


def main():
    requete = os.environ.get("REQUETE", "").strip()
    rid = re.sub(r"[^\w-]", "", os.environ.get("RECHERCHE_ID", "")) or str(int(time.time()))
    chemin = f"recherches/{rid}.json"
    cfg = yaml.safe_load((RACINE / "config" / "recherche.yaml").read_text(encoding="utf-8"))
    profil = (RACINE / "config" / "profil.md").read_text(encoding="utf-8")
    etat_prive = (donnees.lire_json("etat.json", {}) or {}).get("donnees") or {}
    cfg, profil = donnees.appliquer_profil(cfg, profil, etat_prive)
    zones = ((etat_prive.get("profil") or {}).get("zones")) or ["idf"]
    base = {"id": rid, "requete": requete, "date": datetime.now(ZoneInfo("Europe/Paris")).isoformat(timespec="minutes")}
    donnees.ecrire_json(chemin, {**base, "statut": "en_cours", "etape": "Recherche des offres…"}, f"Recherche : {requete}")

    brutes = []
    brutes += sources.collecter_adzuna({"motscles": [requete], "jours": 30}, zones)
    try:
        brutes += sources.lire_page_csp(telecharger(
            f"{sources.CSP}/nos-offres/filtres/mot-cles/{urllib.parse.quote(requete)}/", timeout=60))
    except Exception as e:
        log(f"Choisir le service public : {e}")
    try:
        mots = [sans_accents(m) for m in requete.split() if len(m) > 2]
        brutes += [o for o in sources.collecter_cnrs() if all(m in sans_accents(o["titre"]) for m in mots)]
    except Exception as e:
        log(f"CNRS : {e}")
    if (cfg.get("sources", {}).get("jooble") or {}).get("actif", True):
        brutes += sources.collecter_jooble([requete], "Île-de-France" if zones == ["idf"] else "France", 1)
    brutes += tavily(requete)

    vus, offres = set(), []
    for o in brutes:
        cle = sans_accents(o["titre"])[:60] + "|" + sans_accents(o.get("employeur", ""))[:30]
        if o["id"] in vus or cle in vus or analyse.exclue(o, cfg):
            continue
        vus.update({o["id"], cle})
        o["prefiltre"] = analyse.prefiltre(o, cfg)
        offres.append(o)
    offres.sort(key=lambda o: -o["prefiltre"])
    offres = offres[:30]
    log(f"{len(brutes)} résultats, {len(offres)} retenus pour vérification et analyse")
    donnees.ecrire_json(chemin, {**base, "statut": "en_cours", "etape": f"Vérification et analyse de {len(offres)} offres…"})

    for o in offres:
        o["disponibilite"], texte = verifier(o)
        if len(texte) > len(o.get("texte") or ""):
            o["texte"] = texte
    offres = [o for o in offres if o["disponibilite"] != "expiree"]

    ia = IA(cfg.get("modeles", []))
    ia.echeance = time.time() + 10 * 60
    analyses = analyse.analyser(ia, profil, offres, cfg)
    resultats = []
    for o in offres:
        a = analyses[o["id"]]
        if a.get("resume", "").lower().startswith("pas une offre"):
            continue
        for champ in ("contrat", "lieu", "region"):
            if a.get(champ) and not o.get(champ):
                o[champ] = a[champ]
            a.pop(champ, None)
        o["analyse"] = a
        o["extrait"] = (o.get("texte") or "")[:400]
        o["vu_le"] = datetime.now(ZoneInfo("Europe/Paris")).date().isoformat()
        o["recherche"] = rid
        for champ in ("texte", "telechargeable", "prefiltre", "flux_large"):
            o.pop(champ, None)
        resultats.append(o)
    resultats.sort(key=lambda o: -o["analyse"]["score"])
    donnees.ecrire_json(chemin, {**base, "statut": "termine", "offres": resultats,
                                 "journal": JOURNAL[-40:]}, f"Recherche terminée : {requete}")
    log(f"Recherche terminée : {len(resultats)} offres")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        log("ERREUR :\n" + traceback.format_exc())
        rid = re.sub(r"[^\w-]", "", os.environ.get("RECHERCHE_ID", ""))
        if rid:
            donnees.ecrire_json(f"recherches/{rid}.json", {"id": rid, "requete": os.environ.get("REQUETE", ""),
                                                          "statut": "erreur", "journal": JOURNAL[-40:]})
        raise
