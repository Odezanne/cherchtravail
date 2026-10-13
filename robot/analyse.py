"""Préfiltre par mots-clés, analyse IA des offres (note d'intérêt, compétences, blocages) et repli sans IA."""
import json
import re

from llm import QuotaEpuise
from util import log, sans_accents

NIVEAUX = [(75, "coeur"), (60, "tres_proche"), (45, "proche"), (25, "eloigne"), (0, "hors")]


def niveau(score):
    return next(n for seuil, n in NIVEAUX if score >= seuil)


def exclue(offre, cfg):
    t = sans_accents(offre.get("titre", "") + " " + offre.get("contrat", ""))
    return any(sans_accents(x) in t for x in cfg.get("exclusions", []))


def prefiltre(offre, cfg):
    """Score rapide (0-100) à partir des mots-clés, pour choisir quelles offres envoyer à l'IA."""
    t = " " + sans_accents(" ".join([offre.get("titre", "")] * 3 + [offre.get("texte", "")[:3000]])) + " "
    points = 0
    for poids, mots in (cfg.get("mots_cles") or {}).items():
        for m in mots:
            if sans_accents(m) in t:
                points += int(poids)
    bonus = 10 if offre.get("region") == "idf" else 0
    if re.search(r"ingenieur d.?etudes?|ingenieur de recherche|biostatisticien|data (analyst|manager)|charge.? d.?etudes?", t):
        bonus += 10
    return min(100, points * 4 + bonus)


# ---------------------------------------------------------------- Repli sans IA

RE_EXP = re.compile(r"(\d+)\s*(?:a|à|-)?\s*\d*\s*(?:ans|annees|years?)\s*(?:minimum\s*)?(?:d.?experience|of experience|experience)", re.I)
RE_SAL = re.compile(r"(\d[\d\s.,]{2,8})\s*(?:€|euros?|eur)\s*(brut|net)?\s*(?:/|par)?\s*(mois|mensuel|an|annuel)?", re.I)


def salaire(texte):
    vals = []
    for m in RE_SAL.finditer(texte or ""):
        try:
            v = float(re.sub(r"[\s.]", "", m.group(1)).replace(",", "."))
        except ValueError:
            continue
        per = (m.group(3) or "").lower()
        if per.startswith("an") or v > 9000:
            v = v / 12
        if 1000 <= v <= 15000:
            vals.append(round(v))
    return (min(vals), max(vals)) if vals else (None, None)


# Sans au moins un de ces mots, l'offre n'est pas dans le domaine du candidat (biologie, écologie, comportement…)
DOMAINE = re.compile(r"comportement|etholog|behavio|primat|zebrafish|poisson|ecolog|biodiversit|faune|wildlife|"
                     r"genetique|genomique|biolog|animal|animaux|zoolog|biologie evolutive|neuroscien|epidemiolog|"
                     r"biostatisti|vivant|naturaliste|especes?\b|oiseau|insecte|pollinisat|vegetal|plante")


def score_heuristique(offre, cfg):
    """Note sans IA, volontairement prudente : plafonnée à 30 hors domaine, à 80 dans le domaine."""
    titre = sans_accents(offre.get("titre", ""))
    t = " " + sans_accents(titre + " " + offre.get("texte", "")[:3000]) + " "
    points = 0
    for poids, mots in (cfg.get("mots_cles") or {}).items():
        for m in mots:
            m = sans_accents(m)
            if m in titre:
                points += 2 * int(poids)
            elif m in t:
                points += int(poids)
    score = points * 3 + (8 if offre.get("region") == "idf" else 0)
    if re.search(r"ingenieur d.?etudes?|ingenieur de recherche|biostatisticien|charge.? d.?etudes?", titre):
        score += 8
    # Spécialités de paillasse ou hors biologie des organismes : le profil ne les couvre pas
    if re.search(r"moleculaire|biochimi|bioinformati|chimi|cellulaire|\barn\b|epigenet|physique|informatique|"
                 r"geodynami|microbio|proteom|imagerie medicale|mecanique", titre):
        score -= 15
    if not DOMAINE.search(t):
        return max(0, min(score, 30))
    return max(0, min(score, 80))


def heuristique(offre, cfg):
    t = sans_accents(offre.get("titre", "") + "\n" + offre.get("texte", ""))
    score = score_heuristique(offre, cfg)
    bloquants = []
    m = RE_EXP.search(t)
    if m and int(m.group(1)) >= 1:
        bloquants.append({"type": "experience", "texte": f"{m.group(1)} an(s) d'expérience demandé(s)"})
    elif re.search(r"experience (significative|confirmee|reussie|professionnelle (de|d.au moins|minimum))", t):
        bloquants.append({"type": "experience", "texte": "Expérience professionnelle demandée"})
    if re.match(r"\s*chercheu", sans_accents(offre.get("titre", ""))):
        bloquants.append({"type": "diplome", "texte": "Poste de chercheur : doctorat généralement exigé"})
    elif re.search(r"(titulaire d.un doctorat|doctorat (exige|requis|obligatoire)|phd (required|is required)|docteur en)", t):
        bloquants.append({"type": "diplome", "texte": "Doctorat demandé"})
    smin, smax = salaire(offre.get("salaire_texte", "") + " " + offre.get("texte", ""))
    return {
        "score": score, "niveau": niveau(score), "mode": "mots-cles",
        "resume": "Analyse automatique simplifiée (IA indisponible ce jour-là). Ouvre l'offre pour le détail.",
        "missions": [], "prerequis": [], "competences": [], "atouts": [], "manques": [],
        "bloquants": bloquants,
        "conseil": conseil_par_defaut(bloquants),
        "salaire_min": smin, "salaire_max": smax, "duree_mois": None, "date_limite": None,
        "contact": None, "lien_these": False,
    }


def conseil_par_defaut(bloquants):
    if not bloquants:
        return ""
    if any(b["type"] == "experience" for b in bloquants):
        return ("L'offre demande de l'expérience, mais les recruteurs en recherche publique acceptent souvent un jeune "
                "diplômé solide. Tente quand même : écris au contact en mettant en avant tes 10 mois de stages de recherche, "
                "tes analyses sous R et ta publication dans Scientific Reports.")
    return "Un critère ne colle pas avec ton profil. Si le sujet te plaît, contacte quand même le responsable pour en discuter."


# ---------------------------------------------------------------- Analyse IA

SYSTEME_ANALYSE = """Tu es un conseiller en recrutement scientifique. Tu évalues des offres d'emploi pour UN candidat
dont le profil est fourni. Réponds UNIQUEMENT avec du JSON valide, en français, sans texte autour.

Pour chaque offre, renvoie un objet :
{
 "id": "<id fourni>",
 "score": <entier 0-100 : intérêt de l'offre pour CE candidat, en tenant compte de l'adéquation compétences,
           du domaine (comportement animal, écologie, biostatistique en tête), du fait que ce soit un tremplin
           vers une thèse, du type de contrat (CDD 6-18 mois idéal) et du lieu (Île-de-France idéal).
           Ne baisse PAS le score à cause d'un blocage d'expérience : c'est signalé à part.>,
 "resume": "<2 phrases : le poste et pourquoi il est (ou non) intéressant pour le candidat>",
 "missions": ["<3 à 5 missions principales, courtes>"],
 "prerequis": ["<diplôme, expérience, habilitations, langues exigés, tels qu'écrits dans l'offre>"],
 "competences": [{"nom": "<compétence attendue>", "ok": <true si le candidat l'a d'après son profil, sinon false>}],
 "atouts": ["<points forts du candidat pour ce poste>"],
 "manques": ["<ce qui manque au candidat>"],
 "bloquants": [{"type": "experience|diplome|autre", "texte": "<ex : 3 ans d'expérience exigés>"}],
 "conseil": "<si bloquants : comment tenter quand même (qui contacter, quoi mettre en avant). Sinon : un conseil de candidature.>",
 "salaire_min": <salaire mensuel brut minimum en euros ou null>, "salaire_max": <idem ou null>,
 "duree_mois": <durée du contrat en mois ou null>,
 "date_limite": "<AAAA-MM-JJ ou null>",
 "contact": "<nom et/ou e-mail du contact s'il est indiqué, sinon null>",
 "contrat": "<CDD, CDI, contrat doctoral, CIFRE...>",
 "lieu": "<ville>",
 "region": "idf|france|etranger",
 "lien_these": <true si le poste rapproche clairement d'une thèse (labo, équipe, CIFRE, contrat doctoral)>
}
Règles : le candidat cherche son PREMIER emploi. Toute expérience professionnelle exigée (hors stages) est un bloquant.
Un doctorat exigé est un bloquant. Ne jamais inventer de compétence au candidat. Si l'offre est un simple titre sans
description, note prudemment et dis-le dans le résumé.
Format de sortie : {"offres": [ ... ]}"""


def analyser(ia, profil, offres, cfg):
    """Analyse les offres par lots de 4. Renvoie {id: analyse}. Les offres non traitées reçoivent le repli."""
    resultats = {}
    lots = [offres[i:i + 4] for i in range(0, len(offres), 4)]
    for lot in lots:
        if not ia.disponible:
            break
        message = "PROFIL DU CANDIDAT :\n" + profil + "\n\nOFFRES :\n" + "\n\n".join(
            f"### id: {o['id']}\nTitre : {o['titre']}\nEmployeur : {o.get('employeur', '')}\nLieu : {o.get('lieu', '')}\n"
            f"Contrat : {o.get('contrat', '')}\nSalaire indiqué : {o.get('salaire_texte', '')}\n"
            f"Texte :\n{(o.get('texte') or '(pas de description, seulement le titre)')[:3500]}" for o in lot)
        try:
            rep = ia.json(SYSTEME_ANALYSE, message)
        except QuotaEpuise:
            log("IA : quota épuisé, repli sur l'analyse par mots-clés")
            break
        for a in (rep.get("offres", rep) if isinstance(rep, dict) else rep) or []:
            if isinstance(a, dict) and a.get("id") in {o["id"] for o in lot}:
                resultats[a["id"]] = normaliser(a)
    for o in offres:
        if o["id"] not in resultats:
            resultats[o["id"]] = heuristique(o, cfg)
    return resultats


def normaliser(a):
    try:
        score = max(0, min(100, int(a.get("score", 0))))
    except (TypeError, ValueError):
        score = 0
    bloquants = [b for b in a.get("bloquants") or [] if isinstance(b, dict) and b.get("texte")]
    comp = [c for c in a.get("competences") or [] if isinstance(c, dict) and c.get("nom")]

    def num(x):
        try:
            return round(float(x)) if x not in (None, "", "null") else None
        except (TypeError, ValueError):
            return None

    return {
        "score": score, "niveau": niveau(score), "mode": "ia",
        "resume": a.get("resume") or "", "missions": a.get("missions") or [], "prerequis": a.get("prerequis") or [],
        "competences": [{"nom": c["nom"], "ok": bool(c.get("ok"))} for c in comp],
        "atouts": a.get("atouts") or [], "manques": a.get("manques") or [], "bloquants": bloquants,
        "conseil": a.get("conseil") or conseil_par_defaut(bloquants),
        "salaire_min": num(a.get("salaire_min")), "salaire_max": num(a.get("salaire_max")),
        "duree_mois": num(a.get("duree_mois")),
        "date_limite": a.get("date_limite") if re.match(r"^\d{4}-\d{2}-\d{2}$", str(a.get("date_limite") or "")) else None,
        "contact": a.get("contact") or None, "lien_these": bool(a.get("lien_these")),
        "contrat": a.get("contrat"), "lieu": a.get("lieu"), "region": a.get("region"),
    }


# ---------------------------------------------------------------- Extraction des offres dans les alertes e-mail

SYSTEME_MAIL = """Tu reçois le texte d'e-mails d'alertes emploi (Indeed, LinkedIn, Welcome to the Jungle, APEC,
France Travail, ABG, etc.). Les liens apparaissent entre chevrons <https://...>.
Extrais CHAQUE offre d'emploi ou de thèse présente. Ignore publicités, liens de désinscription et menus.
Réponds UNIQUEMENT en JSON : {"offres": [{"mail": <numéro du mail>, "titre": "...", "employeur": "...", "lieu": "...",
"contrat": "...", "salaire": "<tel qu'écrit ou vide>", "url": "<lien de l'offre>", "extrait": "<texte descriptif présent dans l'e-mail>"}]}"""


def extraire_offres_mails(ia, mails):
    """Renvoie [(mail, offre_brute)]. Utilise l'IA par paquets de mails, sinon le repli par liens."""
    from sources import extraire_offres_mail_sans_ia
    sortie, restants = [], list(mails)
    while restants and ia.disponible:
        paquet, taille = [], 0
        while restants and (taille + len(restants[0]["texte"][:12000]) < 30000 or not paquet):
            m = restants.pop(0)
            paquet.append(m)
            taille += len(m["texte"][:12000])
        message = "\n\n".join(f"=== MAIL {i} | De : {m['expediteur']} | Sujet : {m['sujet']}\n{m['texte'][:12000]}"
                              for i, m in enumerate(paquet))
        try:
            rep = ia.json(SYSTEME_MAIL, message, max_tokens=8000)
        except QuotaEpuise:
            restants = paquet + restants
            break
        for o in rep.get("offres", []) if isinstance(rep, dict) else []:
            try:
                sortie.append((paquet[int(o.get("mail", 0))], o))
            except (ValueError, IndexError, TypeError):
                continue
    for m in restants:
        sortie += [(m, o) for o in extraire_offres_mail_sans_ia(m)]
    log(f"Alertes mail : {len(sortie)} offres extraites")
    return sortie


def json_compact(x):
    return json.dumps(x, ensure_ascii=False)
