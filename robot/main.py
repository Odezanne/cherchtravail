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
from util import JOURNAL, identifiant, log, sans_accents, telecharger, html_en_texte  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
DONNEES = RACINE / "docs" / "data" / "offres.json"
ETAT = RACINE / "data" / "etat.json"
JOURNAL_TXT = RACINE / "data" / "journal.txt"
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
    log("Secrets présents : " + ", ".join(f"{k}={'oui' if os.environ.get(k) else 'non'}" for k in (
        "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GMAIL_ADRESSE", "GMAIL_MOT_DE_PASSE_APPLI", "NTFY_SUJET", "FT_CLIENT_ID")))
    aujourd_hui = date.today().isoformat()

    # 1. Collecte
    brutes = []
    menage, mode_menage = [], "non"
    if not hors_ligne:
        if src.get("cnrs", True):
            try:
                brutes += sources.collecter_cnrs()
            except Exception as e:
                log(f"CNRS indisponible : {e}")
        if (src.get("choisir_le_service_public") or {}).get("actif", True):
            try:
                brutes += sources.collecter_csp(src.get("choisir_le_service_public") or {"motscles": ["mnhn"]})
            except Exception as e:
                log(f"Choisir le service public indisponible : {e}")
        for url in src.get("rss_supplementaires") or []:
            brutes += sources.collecter_rss(url)
        brutes += sources.collecter_france_travail(src.get("france_travail") or {})
        am = src.get("alertes_mail") or {}
        if am.get("actif", True):
            try:
                mails = sources.lire_alertes_mail(am.get("libelle_gmail", "Alertes emploi"), int(am.get("jours", 3)),
                                                  am.get("expediteurs"))
            except Exception as e:
                log(f"Lecture Gmail impossible : {e}")
                mails = []
            deja = set(etat.get("mails_traites", []))
            nouveaux_mails = [m for m in mails if identifiant(m["id"]) not in deja]
            for mail, o in analyse.extraire_offres_mails(ia, nouveaux_mails):
                if o.get("titre"):
                    brutes.append(sources.offre_depuis_mail(o, mail))
            etat["mails_traites"] = (etat.get("mails_traites", []) + [identifiant(m["id"]) for m in nouveaux_mails])[-3000:]
            mode_menage = str(am.get("menage", "essai")).lower()
            if mode_menage in ("essai", "actif"):
                try:
                    menage = sources.menage_mails(am.get("libelle_gmail", "Alertes emploi"), int(am.get("jours", 3)),
                                                  set(etat["mails_traites"]), mode_menage, am.get("expediteurs"))
                    for d, e, suj in menage[:60]:
                        log(f"  {'corbeille' if mode_menage == 'actif' else 'essai'} : {d} · {e[:40]} · {suj[:80]}")
                except Exception as e:
                    log(f"Ménage des mails impossible : {e}")
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
    candidates = [o for o in nouvelles if not o.get("flux_large") or o["prefiltre"] >= 12]
    candidates.sort(key=lambda o: -o["prefiltre"])
    quota = int(cfg.get("max_analyses_par_jour", 60))
    a_analyser = candidates[:quota]
    # Offres des flux larges au lien faible avec le profil : gardées sans IA, visibles en élargissant au maximum.
    # Toutes les offres du MNHN sont gardées, même hors profil.
    eloignees = [o for o in nouvelles if o.get("flux_large") and o["prefiltre"] < 12
                 and (o["prefiltre"] >= 4 or o["source"] == "MNHN")]
    eloignees += [o for o in candidates[quota:]]
    # Anciennes offres notées sans IA (IA indisponible un jour) : nouvelle tentative s'il reste du quota
    reprises = []
    for o in connues.values():
        a = o.get("analyse") or {}
        if ia.disponible and a.get("mode") == "mots-cles" and len(a_analyser) + len(reprises) < quota:
            o["prefiltre"] = analyse.prefiltre(dict(o, texte=o.get("extrait", "")), cfg)
            if o["prefiltre"] >= 12:
                o["telechargeable"] = o["source"] in ("CNRS", "MNHN", "Choisir le service public") or o.get("url", "").startswith("https://emploi.cnrs.fr")
                reprises.append(o)
            else:
                o.pop("prefiltre", None)
    a_analyser += reprises
    ids_reprises = {o["id"] for o in reprises}
    log(f"{len(brutes)} offres collectées, {len(nouvelles)} nouvelles, {len(a_analyser)} retenues pour l'analyse "
        f"(dont {len(reprises)} anciennes à réanalyser), {len(eloignees)} gardées sans IA")

    # 3. Texte complet quand le site l'autorise
    for o in a_analyser:
        if o.get("telechargeable") and not o.get("texte") and not hors_ligne:
            try:
                page = telecharger(o["url"])
                texte = sources.texte_offre_csp(page) if "choisirleservicepublic" in o["url"] else html_en_texte(page)
                # On saute les menus du site : le texte utile commence au titre de l'offre
                debut = sans_accents(texte).find(sans_accents(o["titre"])[:25])
                o["texte"] = (texte[debut:] if debut > 0 else texte)[:8000]
            except Exception as e:
                log(f"Détail indisponible ({o['url']}) : {e}")

    # 4. Analyse
    analyses = analyse.analyser(ia, profil, a_analyser, cfg)
    for o in eloignees:
        analyses[o["id"]] = analyse.heuristique(o, cfg)
        analyses[o["id"]]["resume"] = ("Offre éloignée de ton profil d'après les mots-clés : pas d'analyse détaillée. "
                                       "Ouvre l'offre d'origine si le titre t'intrigue.")
    for o in a_analyser + eloignees:
        a = analyses[o["id"]]
        for champ in ("contrat", "lieu", "region"):
            if a.get(champ) and (not o.get(champ) or o.get(champ) == "?"):
                o[champ] = a[champ]
            a.pop(champ, None)
        o["analyse"] = a
        if o["id"] not in ids_reprises:
            o["vu_le"] = aujourd_hui
        o["extrait"] = (o.get("texte") or o.get("extrait") or "")[:400]
        for champ in ("texte", "telechargeable", "prefiltre", "flux_large", "reprise_ia"):
            o.pop(champ, None)
        connues[o["id"]] = o
    log(f"Appels IA : {ia.appels}, offres analysées par IA : {sum(1 for o in a_analyser if o['analyse'].get('mode') == 'ia')}"
        f" / {len(a_analyser)}")
    ids_analyses = {o["id"] for o in a_analyser}
    # Les offres déjà notées sans IA sont recalculées avec la notation actuelle
    for o in connues.values():
        a = o.get("analyse") or {}
        if a.get("mode") == "mots-cles" and o["id"] not in ids_analyses:
            a["score"] = analyse.score_heuristique(dict(o, texte=o.get("extrait", "")), cfg)
            a["niveau"] = analyse.niveau(a["score"])

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
        condense.envoyer([o for o in a_analyser + eloignees if o["id"] not in ids_reprises], len(garder), menage, mode_menage)
    etat["dernier_condense"] = datetime.now(ZoneInfo("Europe/Paris")).date().isoformat()
    ETAT.parent.mkdir(parents=True, exist_ok=True)
    ETAT.write_text(json.dumps(etat, ensure_ascii=False, indent=1), encoding="utf-8")


def ecrire_journal():
    try:
        JOURNAL_TXT.parent.mkdir(parents=True, exist_ok=True)
        JOURNAL_TXT.write_text("\n".join(JOURNAL) + "\n", encoding="utf-8")
    except Exception:
        pass


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        log("ERREUR :\n" + traceback.format_exc())
        ecrire_journal()
        raise
    if len(JOURNAL) > 1:
        ecrire_journal()
