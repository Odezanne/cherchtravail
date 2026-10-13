"""Revérifie tout de suite toutes les offres du site (sans condensé ni nouvelle collecte) :
pages d'origine, site de l'employeur pour Choisir le service public, recoupement. Les offres retirées disparaissent du
site, sauf celles que j'ai gardées (elles restent avec le badge « Plus en ligne »)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import donnees  # noqa: E402
import recherche  # noqa: E402
import recoupement  # noqa: E402
from util import JOURNAL, log  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
FICHIER = RACINE / "docs" / "data" / "offres.json"

base = json.loads(FICHIER.read_text(encoding="utf-8"))
etat_prive = (donnees.lire_json("etat.json", {}) or {}).get("donnees") or {}
suivi = etat_prive.get("suivi") or {}
gardees = {i for i, s in suivi.items() if isinstance(s, dict) and s.get("statut") == "a_postuler"}
ecartees = {i for i, s in suivi.items() if isinstance(s, dict) and s.get("masque")}
offres = base["offres"]
for o in offres:
    o.pop("verifiee_le", None)  # on force une vraie revérification
recoupement.recouper([o for o in offres if o["id"] not in ecartees], gardees, recherche.verifier, max_verif=400)
avant = len(offres)
etat_robot_f = RACINE / "data" / "etat.json"
etat_robot = json.loads(etat_robot_f.read_text(encoding="utf-8")) if etat_robot_f.exists() else {}
mortes = {o["id"] for o in offres if o.get("disponibilite") == "expiree" and o["id"] not in gardees}
etat_robot["expirees"] = sorted(set(etat_robot.get("expirees", [])) | mortes)[-3000:]
etat_robot_f.parent.mkdir(exist_ok=True)
etat_robot_f.write_text(json.dumps(etat_robot, ensure_ascii=False, indent=1), encoding="utf-8")
base["offres"] = [o for o in offres if o.get("disponibilite") != "expiree" or o["id"] in gardees]
log(f"Revérification : {avant - len(base['offres'])} offres retirées du site, {len(base['offres'])} restantes")
FICHIER.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
(RACINE / "data").mkdir(exist_ok=True)
(RACINE / "data" / "revoir.txt").write_text("\n".join(JOURNAL) + "\n", encoding="utf-8")
