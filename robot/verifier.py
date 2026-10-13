"""Vérifie les branchements (clés, Gmail, dépôt privé, API) sans jamais afficher de secret.
Résultat dans data/verification.txt."""
import imaplib
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent))
import donnees  # noqa: E402
from llm import IA  # noqa: E402

lignes = []


def note(ok, quoi, detail=""):
    lignes.append(f"{'OK ' if ok else 'NON'}  {quoi}{' : ' + detail if detail else ''}")


def http(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.status, r.read()


for nom in ("OPENROUTER_API_KEY", "GEMINI_API_KEY", "GMAIL_ADRESSE", "GMAIL_MOT_DE_PASSE_APPLI", "NTFY_SUJET",
            "DONNEES_TOKEN", "TAVILY_API_KEY", "JOOBLE_API_KEY", "ADZUNA_APP_ID", "FT_CLIENT_ID"):
    note(bool(os.environ.get(nom)), f"secret {nom} présent")

# Gmail
adr, mdp = os.environ.get("GMAIL_ADRESSE", ""), os.environ.get("GMAIL_MOT_DE_PASSE_APPLI", "")
if adr and mdp:
    try:
        with imaplib.IMAP4_SSL("imap.gmail.com") as im:
            im.login(adr, mdp.replace(" ", ""))
            note(True, "connexion Gmail", f"adresse {adr.split('@')[0][:3]}…@{adr.split('@')[-1]}")
    except Exception as e:
        note(False, "connexion Gmail", str(e)[:120] + (" (adresse sans @ ?)" if "@" not in adr else ""))

# Dépôt privé
if donnees.actif():
    try:
        req = urllib.request.Request(f"https://api.github.com/repos/{donnees.DEPOT}", headers={
            "Authorization": "Bearer " + os.environ["DONNEES_TOKEN"], "User-Agent": "cherchtravail"})
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.load(r)
        note(j.get("private", False), f"dépôt {donnees.DEPOT} trouvé", "privé" if j.get("private") else "ATTENTION : public")
        ok = donnees.ecrire_json("verification.json", {"date": datetime.now().isoformat()}, "Robot : vérification")
        note(ok, "écriture dans le dépôt privé")
        etat = donnees.lire_json("etat.json", None)
        note(etat is not None, "données du site synchronisées (etat.json)",
             "présentes" if etat else "pas encore : connecte le site dans l'onglet Profil")
    except urllib.error.HTTPError as e:
        note(False, f"dépôt {donnees.DEPOT}", f"HTTP {e.code} (nom du dépôt ou droits de la clé)")
    except Exception as e:
        note(False, "dépôt privé", str(e)[:120])
    try:
        req = urllib.request.Request("https://api.github.com/repos/Odezanne/cherchtravail/actions/workflows", headers={
            "Authorization": "Bearer " + os.environ["DONNEES_TOKEN"], "User-Agent": "cherchtravail"})
        with urllib.request.urlopen(req, timeout=30):
            note(True, "la clé peut voir les workflows de cherchtravail (barre de recherche)")
    except urllib.error.HTTPError as e:
        note(False, "accès de la clé à cherchtravail", f"HTTP {e.code} : ajoute cherchtravail aux dépôts de la clé, Actions en Read and write")

# Tavily
if os.environ.get("TAVILY_API_KEY"):
    try:
        st, b = http("https://api.tavily.com/search", json.dumps({"api_key": os.environ["TAVILY_API_KEY"],
                     "query": "ingénieur d'études biostatistique Paris", "max_results": 2}).encode(), {"Content-Type": "application/json"})
        note(True, "Tavily", f"{len(json.loads(b).get('results', []))} résultats")
    except Exception as e:
        note(False, "Tavily", str(e)[:120])

# Jooble
if os.environ.get("JOOBLE_API_KEY"):
    try:
        for hote, mots, lieu in (("fr.jooble.org", "biostatisticien", "Île-de-France"), ("jooble.org", "biostatisticien", "Paris")):
            st, b = http(f"https://{hote}/api/{os.environ['JOOBLE_API_KEY']}",
                         json.dumps({"keywords": mots, "location": lieu, "page": "1"}).encode(), {"Content-Type": "application/json"})
            j = json.loads(b)
            note(True, f"Jooble {hote}", f"{j.get('totalCount', '?')} offres « {mots} » / {lieu} ; ex. : "
                 + "; ".join((x.get('title', '')[:40] + ' (' + x.get('location', '')[:20] + ')') for x in j.get('jobs', [])[:2]))
    except Exception as e:
        note(False, "Jooble (erreur sur l'un des deux sites)", str(e).replace(os.environ["JOOBLE_API_KEY"], "***")[:120])

# Dernière recherche lancée depuis le site
rid = os.environ.get("RECHERCHE_ID")
if rid and donnees.actif():
    r = donnees.lire_json(f"recherches/{rid}.json", None)
    if r:
        note(r.get("statut") == "termine", f"recherche « {r.get('requete')} »", f"{r.get('statut')}, {len(r.get('offres', []))} offres : "
             + "; ".join(f"{o['analyse']['score']} % {o['titre'][:45]} ({o['source']}, {o.get('disponibilite')})" for o in r.get("offres", [])[:6]))
        lignes.extend("     " + l[:160] for l in (r.get("journal") or [])[-15:])
    else:
        note(False, f"recherche {rid}", "fichier introuvable")

# IA
ia = IA(["nvidia/nemotron-3-super-120b-a12b:free"])
for f, m in ia.cibles()[:3]:
    try:
        t = ia._post(f, m, "Réponds en JSON.", 'Renvoie {"ok": true}', 50)
        note("ok" in t, f"IA {m}", "répond")
    except urllib.error.HTTPError as e:
        note(False, f"IA {m}", f"HTTP {e.code} {e.read().decode(errors='replace')[:100]}")
    except Exception as e:
        note(False, f"IA {m}", str(e)[:100])

texte = f"Vérification du {datetime.now(ZoneInfo('Europe/Paris')):%d/%m/%Y %H:%M}\n" + "\n".join(lignes) + "\n"
print(texte)
Path(__file__).resolve().parent.parent.joinpath("data", "verification.txt").write_text(texte, encoding="utf-8")
