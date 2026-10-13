"""La voix du condensé : un majordome numérique un brin taquin (façon Jarvis), jamais méchant.
Les phrases changent chaque jour (tirage fixé par la date, donc stable si le robot repasse le même jour)."""
import random
from datetime import date, timedelta


def _tirage():
    return random.Random(date.today().toordinal())


def sujet(n_emplois, n_theses, meilleur):
    r = _tirage()
    if n_emplois or n_theses:
        n = n_emplois + n_theses
        s = "s" if n > 1 else ""
        return r.choice([
            f"Monsieur, {n} offre{s} vous attend{'ent' if n > 1 else ''}. Le café est facultatif, la candidature beaucoup moins.",
            f"Rapport du matin : {n} offre{s} digne{s} de votre CV",
            f"{n} piste{s} sérieuse{s} ce matin. J'ai fait le tri, à vous l'honneur.",
            f"J'ai trouvé {n} offre{s}. La meilleure affiche {meilleur} %, je me permets d'insister.",
            f"{n} offre{s} repérée{s} pendant votre sommeil. Je ne dors pas, moi.",
        ])
    return r.choice([
        "Matinée calme sur le front de l'emploi, Monsieur. Même moi, je ne peux pas inventer des postes.",
        "Rien de renversant aujourd'hui. Parfait pour peaufiner le CV, non ?",
        "Pas de nouvelle pépite ce matin. Les recruteurs font la grasse matinée.",
    ])


def intro(n_analysees, n_retenues, nb_total, meilleur_titre, meilleur_score):
    r = _tirage()
    salut = r.choice(["Bonjour Monsieur.", "Bonjour Eliott.", "Debout, Monsieur, le marché de l'emploi n'attend pas.",
                      "Bonjour. J'espère que la nuit a été plus reposante que la mienne."])
    if n_retenues:
        corps = r.choice([
            f"J'ai passé au crible {n_analysees} nouvelles offres, j'en garde {n_retenues}.",
            f"Sur {n_analysees} nouvelles offres, {n_retenues} méritent votre attention. Les autres, je m'en suis occupé.",
            f"{n_analysees} offres examinées, {n_retenues} retenues. Oui, je suis exigeant, vous aussi.",
        ])
        if meilleur_titre:
            corps += " " + r.choice([
                f"Mention spéciale à « {meilleur_titre} », à {meilleur_score} % : si j'étais vous, je commencerais par là.",
                f"La favorite du jour : « {meilleur_titre} » ({meilleur_score} %). Je dis ça, je ne dis rien.",
                f"« {meilleur_titre} » sort du lot avec {meilleur_score} %. Vous savez ce qu'il vous reste à faire.",
            ])
    else:
        corps = r.choice([
            f"J'ai examiné {n_analysees} nouvelles offres : rien qui soit à votre hauteur aujourd'hui.",
            "Rien de pertinent ce matin. Le curseur « Élargir » du site est là si vous vous sentez aventureux.",
        ])
    return f"{salut} {corps} Le site en compte {nb_total} en tout."


def rappels(etat_prive, offres_par_id):
    """Petites relances : candidatures gardées dont la date limite approche, entretiens et rendez-vous imminents,
    félicitations pour les candidatures envoyées. Renvoie une liste de phrases."""
    if not etat_prive:
        return []
    r = _tirage()
    auj = date.today()
    phrases = []
    suivi = etat_prive.get("suivi") or {}
    perso = {o.get("id"): o for o in (etat_prive.get("perso") or []) if isinstance(o, dict)}

    def offre(i):
        return offres_par_id.get(i) or perso.get(i) or {}

    # Offres gardées « à postuler » dont la date limite approche
    urgentes = []
    for i, s in suivi.items():
        if isinstance(s, dict) and s.get("statut") == "a_postuler" and not s.get("masque"):
            o = offre(i)
            dl = ((o.get("analyse") or {}).get("date_limite")) or ""
            try:
                j = (date.fromisoformat(dl) - auj).days
            except ValueError:
                continue
            if 0 <= j <= 5:
                urgentes.append((j, o.get("titre", "une offre")))
    for j, titre in sorted(urgentes)[:3]:
        quand = "aujourd'hui" if j == 0 else "demain" if j == 1 else f"dans {j} jours"
        phrases.append(r.choice([
            f"« {titre} » attend toujours votre candidature, et la date limite tombe {quand}. Je dis ça, je ne dis rien.",
            f"Petit rappel amical : « {titre} », date limite {quand}. Amical, mais insistant.",
        ]))

    # Offres gardées qui ont disparu du site d'origine (vu par le recoupement du jour)
    for i, s in suivi.items():
        if isinstance(s, dict) and s.get("statut") == "a_postuler" and not s.get("masque"):
            o = offre(i)
            if o.get("disponibilite") == "expiree" and o.get("expiree_le") == auj.isoformat():
                phrases.append(r.choice([f"Mauvaise nouvelle : « {o.get('titre', 'une offre gardée')} » n'est plus en ligne. Pourvue, sans doute. On passe à la suivante.",
                                         f"« {o.get('titre', 'une offre gardée')} » a disparu de son site d'origine. Je l'ai marquée, inutile d'y passer la soirée."]))

    # Entretiens et événements d'aujourd'hui et demain
    demain = auj + timedelta(days=1)
    for i, s in suivi.items():
        for e in (s.get("entretiens") or []) if isinstance(s, dict) else []:
            if e.get("date") in (auj.isoformat(), demain.isoformat()):
                quand = "Aujourd'hui" if e["date"] == auj.isoformat() else "Demain"
                heure = f" à {e['heure'].replace(':', ' h ')}" if e.get("heure") else ""
                phrases.append(f"{quand}{heure} : entretien pour « {offre(i).get('titre', 'votre candidature')} ». "
                               + r.choice(["Vous allez les impressionner. Respirez, souriez, parlez de vos macaques.",
                                           "Relisez l'offre, préparez deux questions, et tout ira bien.",
                                           "Je ne peux pas y aller à votre place, mais je crois en vous."]))
    for e in etat_prive.get("evenements") or []:
        if isinstance(e, dict) and e.get("date") in (auj.isoformat(), demain.isoformat()):
            quand = "Aujourd'hui" if e["date"] == auj.isoformat() else "Demain"
            heure = f" à {e['heure'].replace(':', ' h ')}" if e.get("heure") else ""
            oblig = " Présence obligatoire, je préfère le préciser." if e.get("obligatoire") else ""
            phrases.append(f"{quand}{heure} : {e.get('titre', 'rendez-vous')}{' (' + e['lieu'] + ')' if e.get('lieu') else ''}.{oblig}")

    # Labos à relancer
    dus = [l for l in (etat_prive.get("labos") or []) if isinstance(l, dict) and l.get("statut") in ("contacte", "relance")
           and l.get("relance_le") and l["relance_le"] <= auj.isoformat()]
    if dus:
        noms = ", ".join(l.get("nom", "un labo").split(",")[0] for l in dus[:3])
        phrases.append(r.choice([f"Il est temps de relancer : {noms}. Poliment, mais fermement.",
                                 f"Relance prévue aujourd'hui pour {noms}. Un petit mail, et on n'en parle plus."]))

    # Candidatures envoyées ces 7 derniers jours
    semaine = (auj - timedelta(days=7)).isoformat()
    n = sum(1 for s in suivi.values() if isinstance(s, dict) and s.get("statut") in ("postule", "entretien", "offre")
            and (s.get("date_postule") or "") >= semaine)
    if n >= 3:
        phrases.append(r.choice([f"{n} candidatures envoyées cette semaine. Respect, Monsieur.",
                                 f"{n} candidatures en sept jours : on sent la détermination."]))
    elif n == 0 and suivi:
        phrases.append(r.choice(["Aucune candidature envoyée cette semaine. Je ne juge pas. Je constate.",
                                 "La semaine est encore jeune pour une première candidature, non ?"]))
    return phrases


def periode_actualisation(auj=None):
    """Actualisation France Travail : du 28 au 15 du mois suivant. Renvoie (clé AAAA-MM, nom du mois, date de clôture) ou None."""
    auj = auj or date.today()
    if auj.day >= 28:
        m = auj.replace(day=1)
    elif auj.day <= 15:
        m = (auj.replace(day=1) - timedelta(days=1)).replace(day=1)
    else:
        return None
    fin = (m.replace(day=28) + timedelta(days=10)).replace(day=15)
    mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    return f"{m.year}-{m.month:02d}", mois[m.month - 1], fin


def rappels_admin(etat_prive):
    """Actualisation mensuelle et export avant un rendez-vous France Travail."""
    r = _tirage()
    auj = date.today()
    phrases = []
    per = periode_actualisation(auj)
    faites = (etat_prive or {}).get("actualisations") or {}
    if per and not faites.get(per[0]):
        cle, nom, fin = per
        j = (fin - auj).days
        if auj.day == 28:
            phrases.append(f"L'actualisation France Travail du mois de {nom} est ouverte. Deux minutes maintenant, zéro stress plus tard.")
        elif j <= 3:
            phrases.append(r.choice([f"Actualisation France Travail ({nom}) : clôture le 15 à minuit, il reste {j} jour{'s' if j > 1 else ''}. "
                                     "Je me permets d'insister, Monsieur.",
                                     f"Dernier appel pour l'actualisation de {nom} : {j} jour{'s' if j > 1 else ''} avant la clôture."]))
        elif auj.weekday() == 0:
            phrases.append(f"Actualisation de {nom} pas encore cochée sur le site. Si c'est fait, cochez-la, sinon faites-la, je ne suis pas difficile.")
    demain2 = auj + timedelta(days=2)
    for e in (etat_prive or {}).get("evenements") or []:
        try:
            d = date.fromisoformat(e.get("date", ""))
        except ValueError:
            continue
        if e.get("type") == "rdv_ft" and auj <= d <= demain2:
            phrases.append(f"Rendez-vous France Travail le {d.day}/{d.month} : pensez à exporter vos candidatures (Suivi > Exporter) "
                           "pour votre conseillère. Elle sera impressionnée, je le sens.")
    return phrases


def bilan_semaine(etat_prive, offres_par_id):
    """Le dimanche : bilan de la semaine. Renvoie du texte ou None."""
    if date.today().weekday() != 6 or not etat_prive:
        return None
    suivi = etat_prive.get("suivi") or {}
    semaine = (date.today() - timedelta(days=7)).isoformat()
    envoyees = [s for s in suivi.values() if isinstance(s, dict) and s.get("statut") in ("postule", "entretien", "offre", "refus")]
    cette_semaine = sum(1 for s in envoyees if (s.get("date_postule") or "") >= semaine)
    gardees = sum(1 for s in suivi.values() if isinstance(s, dict) and s.get("statut") == "a_postuler" and not s.get("masque"))
    reponses = sum(1 for s in envoyees if s.get("statut") in ("entretien", "offre", "refus"))
    entretiens = sum(1 for s in envoyees if s.get("statut") in ("entretien", "offre"))
    taux = f"{round(100 * reponses / len(envoyees))} %" if envoyees else "pas encore calculable"
    commentaire = ("Belle semaine. Continuez comme ça." if cette_semaine >= 3 else
                   "Semaine tranquille. La prochaine sera meilleure, j'y veillerai." if cette_semaine else
                   "Zéro candidature cette semaine. Je ne juge pas, mais les offres gardées vous regardent.")
    return (f"Bilan de la semaine : {cette_semaine} candidature(s) envoyée(s), {len(envoyees)} au total, "
            f"{entretiens} entretien(s) décroché(s), taux de réponse {taux}. {gardees} offre(s) gardée(s) attendent encore. {commentaire}")


def menage(n, actif):
    r = _tirage()
    if actif:
        return r.choice([f"J'ai fait un peu de ménage : {n} mail(s) de sites d'emploi sont partis à la corbeille, leurs offres sont sur le site. "
                         "Récupérables 30 jours, je ne suis pas un monstre.",
                         f"{n} mail(s) d'alertes rangés à la corbeille. Votre boîte vous remercie."])
    return (f"Ménage en mode essai : je mettrais {n} mail(s) à la corbeille, mais j'attends votre feu vert. "
            "Jetez un œil à la liste, puis dites-moi de passer à l'action.")


def signature():
    return _tirage().choice(["À demain, même heure. Je serai là, je suis toujours là.", "Bonne chasse, Monsieur.",
                             "Je retourne surveiller les offres. Vous, allez briller.", "Courage, la bonne est peut-être pour aujourd'hui."])


def push(top, sujet_txt):
    r = _tirage()
    if top:
        return "\n".join(top) + "\n" + r.choice(["Je vous laisse choisir.", "À vous de jouer.", "On y va ?"])
    return r.choice(["Rien de neuf de très pertinent. Je reste à l'affût.", "Calme plat. J'en profite pour polir mes circuits."])
