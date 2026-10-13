"""Robot quotidien Cherchtravail : collecte, analyse, mise à jour du site et condensé.

Usage : python robot/main.py            (respecte l'heure du condensé)
        FORCER=1 python robot/main.py   (exécute tout de suite)
        HORS_LIGNE=1 ...                (aucun accès réseau, pour les tests)
"""
import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

sys.path.insert(0, str(Path(__file__).parent))
import analyse  # noqa: E402
import condense  # noqa: E402
import sources  # noqa: E402
from llm import IA  # noqa: E402
from util import identifiant, log, sans_accents, telecharger, html_en_texte  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
DONNEES = RACINE / "docs" / "data" / "offres.json"
ETAT = RACINE / "data" / "etat.json"
GARDER_JOURS = 45


def charger(p, defaut):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return defaut


def doit_tourner(cfg, etat):
    if os.environ.get("FORCER") == "1":
        return True
    maintenant = datetime.now(ZoneInfo("Europe/Paris"))
    heure_lancement = (int(cfg.get("heure_condense", 8)) - 1) % 24
    if maintenant.hour != heure_lancement:
        log(f"Il est {maintenant:%H:%M} à Paris, le robot tourne à {heure_lancement}h40. Rien à faire.")
        return False
    if etat.get("dernier_condense") == maintenant.date().isoformat():
        log("Condensé déjà envoyé aujourd'hui.")
        return False
    return True


def cle_doublon(o):
    return identifiant(sans_accents(o.get("titre", ""))[:60], sans_accents(o.get("employeur", ""))[:30])


def main():
    cfg = yaml.safe_load((RACINE / "config" / "recherche.yaml").read_text(encoding="utf-8"))
    profil = (RACINE / "config" / "profil.md").read_text(encoding="utf-8")
    etat = charger(ETAT, {})
    base = charger(DONNEES, {"offres": []})
    connues = {o["id"]: o for o in base.get("offres", [])}
    doublons = {cle_doublon(o) for o in connues.values()}
    if not doit_tourner(cfg, etat):
        return
    hors_ligne = os.environ.get("HORS_LIGNE") == "1"
    src = cfg.get("sources", {})
    ia = IA(cfg.get("modeles", []))
    aujourd_hui = date.today().isoformat()

    # 1. Collecte
    brutes = []
    if not hors_ligne:
        if src.get("cnrs", True):
            try:
                brutes += sources.collecter_cnrs()
            except Exception as e:
                log(f"CNRS indisponible : {e}")
        for url in src.get("rss_supplementaires") or []:
            brutes += sources.collecter_rss(url)
        brutes += sources.collecter_france_travail(src.get("france_travail") or {})
        am = src.get("alertes_mail") or {}
        if am.get("actif", True):
            try:
                mails = sources.lire_alertes_mail(am.get("libelle_gmail", "Alertes emploi"), int(am.get("jours", 3)))
            except Exception as e:
                log(f"Lecture Gmail impossible : {e}")
                mails = []
            deja = set(etat.get("mails_traites", []))
            nouveaux_mails = [m for m in mails if identifiant(m["id"]) not in deja]
            for mail, o in analyse.extraire_offres_mails(ia, nouveaux_mails):
                if o.get("titre"):
                    brutes.append(sources.offre_depuis_mail(o, mail))
            etat["mails_traites"] = (list(deja) + [identifiant(m["id"]) for m in nouveaux_mails])[-500:]
    else:
        brutes += json.loads(os.environ.get("OFFRES_TEST", "[]"))

    # 2. Tri : nouvelles offres, sans doublon ni exclusion
    nouvelles = []
    for o in brutes:
        if o["id"] in connues or analyse.exclue(o, cfg):
            continue
        cd = cle_doublon(o)
        if cd in doublons:
            continue
        doublons.add(cd)
        o["prefiltre"] = analyse.prefiltre(o, cfg)
        nouvelles.append(o)
    # Les offres des alertes e-mail viennent de recherches choisies : toujours analysées.
    # Les flux larges (CNRS) : seulement celles qui contiennent au moins un mot-clé du profil.
    candidates = [o for o in nouvelles if o["source"] != "CNRS" or o["prefiltre"] >= 12]
    candidates.sort(key=lambda o: -o["prefiltre"])
    a_analyser = candidates[: int(cfg.get("max_analyses_par_jour", 60))]
    # Offres CNRS au lien faible avec le profil : gardées sans IA, visibles en élargissant au maximum
    eloignees = [o for o in nouvelles if o["source"] == "CNRS" and 4 <= o["prefiltre"] < 12]
    log(f"{len(brutes)} offres collectées, {len(nouvelles)} nouvelles, {len(a_analyser)} retenues pour l'analyse")

    # 3. Texte complet quand le site l'autorise
    for o in a_analyser:
        if o.get("telechargeable") and not o.get("texte") and not hors_ligne:
            try:
                o["texte"] = html_en_texte(telecharger(o["url"]))[:8000]
            except Exception as e:
                log(f"Détail indisponible ({o['url']}) : {e}")

    # 4. Analyse
    analyses = analyse.analyser(ia, profil, a_analyser, cfg)
    for o in eloignees:
        analyses[o["id"]] = analyse.heuristique(o, cfg)
    for o in a_analyser + eloignees:
        a = analyses[o["id"]]
        for champ in ("contrat", "lieu", "region"):
            if a.get(champ) and (not o.get(champ) or o.get(champ) == "?"):
                o[champ] = a[champ]
            a.pop(champ, None)
        o["analyse"] = a
        o["vu_le"] = aujourd_hui
        o["extrait"] = (o.get("texte") or "")[:400]
        for champ in ("texte", "telechargeable", "prefiltre"):
            o.pop(champ, None)
        connues[o["id"]] = o
    log(f"Appels IA : {ia.appels}")

    # 5. Nettoyage : offres trop anciennes ou date limite dépassée
    limite = (date.today() - timedelta(days=GARDER_JOURS)).isoformat()
    garder = []
    for o in connues.values():
        dl = o.get("analyse", {}).get("date_limite")
        if o.get("vu_le", aujourd_hui) < limite or (dl and dl < aujourd_hui):
            continue
        garder.append(o)
    garder.sort(key=lambda o: (-o["analyse"]["score"], o["titre"]))

    DONNEES.parent.mkdir(parents=True, exist_ok=True)
    DONNEES.write_text(json.dumps({"maj": datetime.now(ZoneInfo("Europe/Paris")).isoformat(timespec="minutes"),
                                   "offres": garder}, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"Site mis à jour : {len(garder)} offres")

    # 6. Condensé
    if not hors_ligne:
        condense.envoyer([o for o in a_analyser], len(garder))
    etat["dernier_condense"] = datetime.now(ZoneInfo("Europe/Paris")).date().isoformat()
    ETAT.parent.mkdir(parents=True, exist_ok=True)
    ETAT.write_text(json.dumps(etat, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
