"""Envoi du condensé quotidien : e-mail (Gmail) et notification sur le téléphone (ntfy, facultatif)."""
import html
import json
import os
import smtplib
import urllib.request
from email.mime.text import MIMEText

from util import log

SITE = os.environ.get("SITE_URL", "https://odezanne.github.io/cherchtravail/")
NOMS = {"coeur": "Cœur de cible", "tres_proche": "Très proche", "proche": "Proche", "eloigne": "Plus éloigné"}


def _ligne(o):
    a = o["analyse"]
    sal = ""
    if a.get("salaire_min"):
        sal = f" · {a['salaire_min']} €" + (f"–{a['salaire_max']} €" if a.get("salaire_max") and a["salaire_max"] != a["salaire_min"] else "") + " brut/mois"
    bloc = ""
    if a.get("bloquants"):
        bloc = (f'<div style="color:#8a5a00;font-size:13px">⚠ {html.escape(a["bloquants"][0]["texte"])} '
                f', tente quand même</div>')
    return (f'<tr><td style="padding:10px 0;border-bottom:1px solid #eee{";opacity:.6" if a.get("bloquants") else ""}">'
            f'<div><b style="color:#2f6b4f">{a["score"]} %</b> &nbsp;<a href="{html.escape(o["url"])}" '
            f'style="color:#1c2b24;font-weight:600;text-decoration:none">{html.escape(o["titre"])}</a></div>'
            f'<div style="color:#5b6b63;font-size:13px">{html.escape(o.get("employeur") or o["source"])} · '
            f'{html.escape(o.get("lieu") or "")}{sal}</div>'
            f'<div style="font-size:13px;margin-top:3px">{html.escape(a.get("resume", ""))}</div>{bloc}</td></tr>')


def envoyer(nouvelles, nb_total, menage=(), mode_menage="non"):
    emplois = [o for o in nouvelles if o["type"] == "emploi" and o["analyse"]["score"] >= 45]
    theses = [o for o in nouvelles if o["type"] == "these" and o["analyse"]["score"] >= 45]
    sujet = f"Cherchtravail : {len(emplois)} nouvelle(s) offre(s) pour toi" + (f", {len(theses)} thèse(s)" if theses else "")
    corps = [f'<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:640px;color:#1c2b24">',
             f'<h2 style="margin:0 0 4px">Ton condensé du jour</h2>',
             f'<p style="color:#5b6b63;margin:0 0 16px">{len(nouvelles)} nouvelles offres analysées, {nb_total} en tout sur le site. '
             f'<a href="{SITE}">Ouvrir Cherchtravail</a></p>']
    for titre, groupe in (("Emplois", emplois), ("Thèses et CIFRE", theses)):
        if groupe:
            corps.append(f'<h3 style="margin:18px 0 0">{titre}</h3><table style="width:100%;border-collapse:collapse">')
            corps += [_ligne(o) for o in sorted(groupe, key=lambda o: -o["analyse"]["score"])[:25]]
            corps.append("</table>")
    if not emplois and not theses:
        corps.append("<p>Rien de très pertinent aujourd'hui. Utilise le curseur « Élargir » sur le site pour voir les offres plus éloignées.</p>")
    if menage:
        if mode_menage == "actif":
            corps.append(f'<h3 style="margin:22px 0 4px">Ménage de ta boîte mail</h3><p style="font-size:13px;color:#5b6b63">'
                         f'{len(menage)} mail(s) d\'alertes et de sites d\'emploi mis à la corbeille : leurs offres sont sur le site. '
                         f'Ils restent récupérables 30 jours dans la Corbeille de Gmail.</p>')
        else:
            corps.append(f'<h3 style="margin:22px 0 4px">Ménage de ta boîte mail (essai, rien n\'a été supprimé)</h3>'
                         f'<p style="font-size:13px;color:#5b6b63">{len(menage)} mail(s) seraient mis à la corbeille. Vérifie la liste, '
                         f'puis dis-moi de mettre le tri en marche.</p><ul style="font-size:12.5px;padding-left:18px">')
            corps += [f'<li>{html.escape(d)} · {html.escape(e[:45])} · {html.escape(suj[:90])}</li>' for d, e, suj in menage[:80]]
            if len(menage) > 80:
                corps.append(f"<li>… et {len(menage) - 80} autres</li>")
            corps.append("</ul>")
    corps.append("</div>")

    adresse, mdp = os.environ.get("GMAIL_ADRESSE"), os.environ.get("GMAIL_MOT_DE_PASSE_APPLI")
    if adresse and mdp:
        msg = MIMEText("".join(corps), "html", "utf-8")
        msg["Subject"], msg["From"], msg["To"] = sujet, f"Cherchtravail <{adresse}>", adresse
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
                s.login(adresse, mdp.replace(" ", ""))
                s.send_message(msg)
            log("Condensé envoyé par e-mail")
        except Exception as e:
            log(f"Envoi e-mail impossible : {e}")

    sujet_ntfy = os.environ.get("NTFY_SUJET")
    if sujet_ntfy:
        top = sorted(emplois, key=lambda o: -o["analyse"]["score"])[:3]
        texte = "\n".join(f"{o['analyse']['score']} % · {o['titre'][:70]}" for o in top) or "Rien de nouveau de très pertinent."
        corps_json = json.dumps({"topic": sujet_ntfy, "title": sujet, "message": texte, "click": SITE,
                                 "tags": ["briefcase"]}).encode()
        req = urllib.request.Request("https://ntfy.sh/", data=corps_json, headers={"Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=20)
            log("Notification envoyée")
        except Exception as e:
            log(f"Notification impossible : {e}")
