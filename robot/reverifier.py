"""Revérification de toutes les offres affichées sur le site, sans IA ni condensé : chaque page d'origine (et, pour
Choisir le service public, la page de l'employeur) est rouverte ; les offres retirées disparaissent du site, sauf
celles que j'ai gardées, qui restent avec la mention « Plus en ligne »."""
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent))
import donnees  # noqa: E402
import recherche  # noqa: E402
import recoupement  # noqa: E402
from util import JOURNAL, log  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
OFFRES = RACINE / "docs" / "data" / "offres.json"
ETAT = RACINE / "data" / "etat.json"


def main():
    base = json.loads(OFFRES.read_text(encoding="utf-8"))
    etat = json.loads(ETAT.read_text(encoding="utf-8")) if ETAT.exists() else {}
    prive = (donnees.lire_json("etat.json", {}) or {}).get("donnees") or {}
    suivi = prive.get("suivi") or {}
    gardees = {i for i, s in suivi.items() if isinstance(s, dict) and s.get("statut") == "a_postuler"}
    ecartees = {i for i, s in suivi.items() if isinstance(s, dict) and s.get("masque")}
    offres = [o for o in base["offres"] if o["id"] not in ecartees]
    if os.environ.get("MANUEL_SEUL") != "1":
        recoupement.recouper(offres, gardees, recherche.verifier,
                             max_tavily=int(os.environ.get("MAX_TAVILY", "4")), max_verif=int(os.environ.get("MAX_VERIF", "400")))
    recoupement.appliquer_manuelles(offres, donnees.lire_json(recoupement.FICHIER_MANUEL, {}))
    retirees = [o for o in base["offres"] if o.get("disponibilite") == "expiree" and o["id"] not in gardees]
    for o in retirees:
        log(f"  retirée : {o['titre'][:70]} ({o.get('lien_employeur') or o.get('url')})")
    ids = {o["id"] for o in retirees}
    base["offres"] = [o for o in base["offres"] if o["id"] not in ids]
    base["maj"] = datetime.now(ZoneInfo("Europe/Paris")).isoformat(timespec="minutes")
    OFFRES.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    etat["expirees"] = (etat.get("expirees", []) + sorted(ids))[-3000:]
    ETAT.parent.mkdir(parents=True, exist_ok=True)
    ETAT.write_text(json.dumps(etat, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"Revérification : {len(retirees)} offres retirées du site, {len(base['offres'])} restantes")
    (RACINE / "data" / "reverification.txt").write_text("\n".join(JOURNAL) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
