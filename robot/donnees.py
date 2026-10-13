"""Accès au dépôt PRIVÉ des données (profil, suivi, documents, résultats de recherche) via l'API GitHub.
Clé : secret DONNEES_TOKEN. Sans clé, tout est ignoré et le robot fonctionne comme avant."""
import base64
import io
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from util import log

DEPOT = os.environ.get("DONNEES_DEPOT", "Odezanne/cherchtravail-donnees")
API = "https://api.github.com"


def actif():
    return bool(os.environ.get("DONNEES_TOKEN"))


def _req(chemin, methode="GET", corps=None, brut=False):
    url = f"{API}/repos/{DEPOT}/contents/{urllib.parse.quote(chemin)}"
    entetes = {"Authorization": "Bearer " + os.environ["DONNEES_TOKEN"], "X-GitHub-Api-Version": "2022-11-28",
               "Accept": "application/vnd.github.raw+json" if brut else "application/vnd.github+json",
               "User-Agent": "cherchtravail-robot"}
    data = None
    if corps is not None:
        data = json.dumps(corps).encode()
        entetes["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=entetes, method=methode)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def lire_json(chemin, defaut=None):
    if not actif():
        return defaut
    try:
        return json.loads(_req(chemin, brut=True).decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code != 404:
            log(f"Données privées : lecture de {chemin} impossible (HTTP {e.code})")
        return defaut
    except Exception as e:
        log(f"Données privées : lecture de {chemin} impossible ({e})")
        return defaut


def lire_brut(chemin):
    return _req(chemin, brut=True)


def ecrire_json(chemin, obj, message="Robot : mise à jour"):
    if not actif():
        return False
    contenu = base64.b64encode(json.dumps(obj, ensure_ascii=False, indent=1).encode()).decode()
    for _ in range(3):
        sha = None
        try:
            sha = json.loads(_req(chemin))["sha"]
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
        try:
            _req(chemin, "PUT", {"message": message, "content": contenu, **({"sha": sha} if sha else {})})
            return True
        except urllib.error.HTTPError as e:
            if e.code not in (409, 422):
                raise
    return False


def texte_document(nom, octets):
    """Texte d'un PDF (pypdf) ou d'un Word .docx (XML), pour donner le CV de référence à l'IA."""
    n = nom.lower()
    try:
        if n.endswith(".pdf"):
            from pypdf import PdfReader
            return "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(octets)).pages)
        if n.endswith(".docx"):
            with zipfile.ZipFile(io.BytesIO(octets)) as z:
                xml = z.read("word/document.xml").decode("utf-8", errors="replace")
            xml = re.sub(r"</w:p>", "\n", xml)
            return re.sub(r"<[^>]+>", "", xml)
        if n.endswith(".txt"):
            return octets.decode("utf-8", errors="replace")
    except Exception as e:
        log(f"Lecture du document {nom} impossible : {e}")
    return ""


def cv_reference():
    idx = lire_json("fichiers/index.json", {}) or {}
    for f in idx.get("fichiers", []):
        if f.get("categorie") == "cv" and f.get("reference") and f.get("chemin"):
            try:
                t = texte_document(f["nom"], lire_brut(f["chemin"]))
                if t.strip():
                    log(f"CV de référence lu : {f['nom']} ({len(t)} caractères)")
                    return re.sub(r"\n\s*\n+", "\n", t).strip()[:6000]
            except Exception as e:
                log(f"CV de référence illisible : {e}")
    return ""


def liste(txt, sep=","):
    return [x.strip() for x in re.split(sep, txt or "") if x.strip()]


def appliquer_profil(cfg, profil_md, etat_prive):
    """Adapte la configuration et le texte du profil à ce que j'ai saisi dans l'onglet Profil du site."""
    p = (etat_prive or {}).get("profil") or {}
    if p:
        mc = {}
        for poids, cle in ((5, "essentiels"), (4, "importants"), (3, "bonus")):
            if liste(p.get(cle)):
                mc[poids] = liste(p.get(cle))
        if mc:
            mc[1] = (cfg.get("mots_cles") or {}).get(1, [])
            cfg["mots_cles"] = mc
        if liste(p.get("exclusions")):
            cfg["exclusions"] = liste(p.get("exclusions"))
        rech = liste(p.get("recherches"), r"\n")
        if rech:
            csp = cfg.setdefault("sources", {}).setdefault("choisir_le_service_public", {})
            csp["motscles"] = ["mnhn"] + [r for r in rech if r.lower() != "mnhn"]
            cfg["sources"].setdefault("adzuna", {})["motscles"] = rech
        zones = {"idf": "Île-de-France", "france": "reste de la France", "etranger": "étranger"}
        contrats = {"cdd": "CDD", "cdi": "CDI", "these": "thèse ou CIFRE", "autre": "autres contrats"}
        profil_md += "\n\n## MISE À JOUR PAR LE CANDIDAT (onglet Profil du site, prioritaire sur ce qui précède)\n"
        profil_md += f"Postes visés, du plus au moins prioritaire :\n{p.get('postes', '')}\n"
        profil_md += f"Projet : {p.get('projet', '')}\n"
        profil_md += f"Contrats acceptés : {', '.join(contrats.get(c, c) for c in p.get('contrats', []))}"
        if p.get("dureeMin") or p.get("dureeMax"):
            profil_md += f" (durée idéale {p.get('dureeMin') or '?'} à {p.get('dureeMax') or '?'} mois)"
        profil_md += f"\nZones prioritaires : {', '.join(zones.get(z, z) for z in p.get('zones', []))}\n"
        if p.get("salaire"):
            profil_md += f"Salaire souhaité : {p['salaire']} € brut par mois (critère de tri, pas d'élimination)\n"
        profil_md += f"Compétences : {p.get('competences', '')}\n"
        if (p.get("nouveautes") or "").strip():
            profil_md += f"Nouvelles formations et expériences :\n{p['nouveautes']}\n"
        profil_md += f"Compétences qui manquent (à compter comme manques) : {p.get('manques', '')}\n"
        profil_md += "Le candidat cherche son premier emploi (hors stages).\n" if p.get("premierEmploi", True) else \
            "Le candidat a déjà une expérience professionnelle.\n"
        log("Profil personnalisé du site appliqué")
    cv = cv_reference() if actif() else ""
    if cv:
        profil_md += "\n\n## CV DE RÉFÉRENCE DU CANDIDAT (texte extrait)\n" + cv
    return cfg, profil_md
