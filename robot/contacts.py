"""Vérifie que mes contacts professionnels travaillent toujours au même endroit, dans le même secteur.
Recherche limitée à l'affiliation professionnelle publique (pages d'établissements, annuaires de labos, HAL, ORCID,
profils publics) : on ne cherche jamais le numéro de téléphone, on n'utilise de l'e-mail que son nom de domaine.
Lancé depuis l'onglet Contacts (CONTACT_IDS = ids séparés par des virgules, vide = tous) et une fois par mois.
Résultat dans le dépôt privé : contacts/verifications.json = {id: {statut, organisation, poste, resume, sources, date}}."""
import json
import os
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))
import donnees  # noqa: E402
from llm import IA, QuotaEpuise  # noqa: E402
from util import log, nettoyer  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
FICHIER = "contacts/verifications.json"
WEBMAILS = ("gmail.", "yahoo.", "hotmail.", "outlook.", "live.", "icloud.", "orange.fr", "free.fr", "sfr.fr", "laposte.net",
            "wanadoo.", "protonmail.", "proton.me", "gmx.")

SYSTEME = """Tu vérifies l'affiliation professionnelle actuelle d'une personne à partir de résultats de recherche web.
Ne déduis rien qui ne soit pas écrit dans les résultats. Attention aux homonymes : ne retiens une page que si elle
correspond clairement à la même personne (même domaine, même établissement, ou même spécialité que ce qu'on sait d'elle).
Ne rapporte AUCUNE information personnelle (adresse, famille, vie privée) : seulement l'établissement, le poste, l'équipe.
Réponds en JSON :
{"statut": "confirme" | "a_change" | "incertain",
 "organisation": "<établissement ou entreprise actuel le plus probable, ou null>",
 "poste": "<intitulé actuel si indiqué, ou null>",
 "secteur": "<domaine en quelques mots, ou null>",
 "meme_secteur": true | false | null,
 "resume": "<une ou deux phrases en français, sobres : ce qui confirme ou ce qui a changé, avec l'année des pages si connue>",
 "sources": ["<url des 1 à 3 pages qui le justifient>"]}
- "confirme" : des pages récentes montrent la personne dans l'organisation connue (ou le même service).
- "a_change" : des pages récentes la montrent clairement ailleurs (préciser où dans organisation).
- "incertain" : rien de clair, pages anciennes, ou homonymes possibles."""


def domaine(email):
    d = (email or "").split("@")[-1].lower().strip() if "@" in (email or "") else ""
    return "" if not d or any(w in d for w in WEBMAILS) else d


def tavily(requete, n=8):
    cle = os.environ.get("TAVILY_API_KEY")
    if not cle:
        return []
    corps = {"api_key": cle, "query": requete, "max_results": n, "search_depth": "basic", "include_answer": False}
    req = urllib.request.Request("https://api.tavily.com/search", data=json.dumps(corps).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r).get("results", [])
    except Exception as e:
        log(f"Tavily : {e}")
        return []


def verifier_contact(ia, c):
    nom = nettoyer(c.get("nom", ""))
    org = nettoyer(c.get("organisation", ""))
    dom = domaine(c.get("email"))
    requetes = [f"\"{nom}\" {org}".strip()]
    if dom and dom not in org.lower():
        requetes.append(f"\"{nom}\" {dom}")
    if not org and not dom:
        requetes.append(f"\"{nom}\" {c.get('secteur') or c.get('poste') or 'chercheur'}")
    vus, res = set(), []
    for q in requetes[:2]:
        for x in tavily(q):
            if x.get("url") not in vus:
                vus.add(x.get("url"))
                res.append(x)
    if not res:
        return {"statut": "incertain", "organisation": None, "poste": None, "resume": "Aucune page publique trouvée à ce nom.",
                "sources": [], "date": date.today().isoformat()}
    connu = (f"Nom : {nom}\nOrganisation connue : {org or 'inconnue'}\nPoste connu : {c.get('poste') or 'inconnu'}\n"
             f"Secteur connu : {c.get('secteur') or 'inconnu'}\nDomaine de son e-mail professionnel : {dom or 'aucun'}\n")
    pages = "\n\n".join(f"[{i + 1}] {x.get('url')}\nTitre : {x.get('title', '')}\n{(x.get('content') or '')[:700]}"
                        for i, x in enumerate(res[:12]))
    try:
        r = ia.json(SYSTEME, connu + "\nRésultats de recherche :\n" + pages, 1200)
    except QuotaEpuise:
        return None
    if not isinstance(r, dict):
        return None
    st = r.get("statut") if r.get("statut") in ("confirme", "a_change", "incertain") else "incertain"
    sources = [u for u in (r.get("sources") or []) if isinstance(u, str) and u in vus][:3]
    return {"statut": st, "organisation": r.get("organisation"), "poste": r.get("poste"), "secteur": r.get("secteur"),
            "meme_secteur": r.get("meme_secteur"), "resume": nettoyer(str(r.get("resume") or ""))[:400],
            "sources": sources, "date": date.today().isoformat()}


def main():
    if not donnees.actif():
        log("Pas d'accès au dépôt privé : rien à vérifier.")
        return
    cfg = yaml.safe_load((RACINE / "config" / "recherche.yaml").read_text(encoding="utf-8"))
    contacts = ((donnees.lire_json("etat.json", {}) or {}).get("donnees") or {}).get("contacts") or []
    ids = {i.strip() for i in os.environ.get("CONTACT_IDS", "").split(",") if i.strip()}
    a_faire = [c for c in contacts if isinstance(c, dict) and c.get("nom") and (not ids or c.get("id") in ids)]
    resultats = donnees.lire_json(FICHIER, {}) or {}
    ia = IA(cfg.get("modeles", []))
    log(f"Contacts à vérifier : {len(a_faire)}")
    faits = 0
    for c in a_faire[:40]:
        v = verifier_contact(ia, c)
        if v is None:
            log(f"  {c['nom']} : IA indisponible, on réessaiera")
            continue
        resultats[c["id"]] = v
        log(f"  {c['nom']} : {v['statut']} ({v.get('organisation') or '?'})")
        faits += 1
        if faits % 5 == 0:
            donnees.ecrire_json(FICHIER, resultats, "Contacts : vérification en cours")
    if faits:
        donnees.ecrire_json(FICHIER, resultats, f"Contacts : {faits} vérifié(s)")


if __name__ == "__main__":
    main()
