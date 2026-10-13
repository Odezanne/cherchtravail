"""Collecte des offres : flux RSS (CNRS et autres), alertes e-mail Gmail, API France Travail."""
import email
import email.header
import imaplib
import json
import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

from util import html_en_texte, identifiant, log, nettoyer, telecharger

IDF = ["paris", "ile-de-france", "île-de-france", "saclay", "gif sur yvette", "gif-sur-yvette", "orsay", "palaiseau",
       "jouy-en-josas", "jouy en josas", "versailles", "evry", "évry", "créteil", "creteil", "villejuif", "ivry",
       "meudon", "nanterre", "brunoy", "villetaneuse", "maisons-alfort", "maisons alfort", "montrouge", "bobigny",
       "saint-denis", "cergy", "marne-la-vallée", "champs-sur-marne", "fontenay", "vincennes", "boulogne",
       "issy", "clamart", "massy", "les ulis", "thiverval", "guyancourt", "saint-quentin-en-yvelines",
       "(75)", "(77)", "(78)", "(91)", "(92)", "(93)", "(94)", "(95)", " 75", " 91", " 92", " 93", " 94"]


def region_de(lieu):
    l = (lieu or "").lower()
    if not l:
        return "?"
    if any(k in l for k in IDF):
        return "idf"
    if re.search(r"\b(royaume-uni|uk|germany|allemagne|espagne|spain|italy|italie|belgique|belgium|suisse|"
                 r"switzerland|netherlands|pays-bas|usa|canada|sweden|suède|norway|denmark|portugal)\b", l):
        return "etranger"
    return "france"


# ---------------------------------------------------------------- RSS

def _rss_items(texte):
    racine = ET.fromstring(texte.encode("utf-8") if isinstance(texte, str) else texte)
    for it in racine.iter("item"):
        yield {k: (it.findtext(k) or "") for k in ("title", "link", "description", "pubDate", "guid")}
    ns = {"a": "http://www.w3.org/2005/Atom"}
    for it in racine.iter("{http://www.w3.org/2005/Atom}entry"):
        lien = it.find("a:link", ns)
        yield {"title": it.findtext("a:title", "", ns), "link": lien.get("href") if lien is not None else "",
               "description": it.findtext("a:summary", "", ns), "pubDate": it.findtext("a:updated", "", ns), "guid": ""}


def _date(s):
    try:
        return parsedate_to_datetime(s).date().isoformat()
    except Exception:
        return datetime.now(timezone.utc).date().isoformat()


CNRS_TITRE = re.compile(r"^Offre d'emploi (?P<type>.*?) : (?P<titre>.*) \((?P<lieu>[^()]*)\) Ref:(?P<ref>\S+)\s*$")


def collecter_cnrs(texte_rss=None):
    texte = texte_rss or telecharger("https://emploi.cnrs.fr/Rss/Offres.ashx")
    offres = []
    for it in _rss_items(texte):
        m = CNRS_TITRE.match(nettoyer(it["title"]))
        if not m:
            continue
        t = m.group("type")
        if any(x in t.lower() for x in ("stage", "apprentissage", "mobilité interne")):
            continue
        offres.append({
            "id": "cnrs-" + m.group("ref"),
            "source": "CNRS",
            "url": it["link"].strip(),
            "titre": m.group("titre").replace("(H/F)", "").replace("H/F", "").strip(" -–:"),
            "employeur": "CNRS",
            "lieu": m.group("lieu").split(" - ")[0].title(),
            "region": region_de(m.group("lieu")),
            "contrat": t.replace("en contrat ", "").replace("IT ", "Ingénieur/Technicien "),
            "type": "these" if "doctorant" in t.lower() else "emploi",
            "date_publication": _date(it["pubDate"]),
            "texte": "",
            "telechargeable": True,
        })
    log(f"CNRS : {len(offres)} offres dans le flux")
    return offres


def collecter_rss(url):
    offres = []
    try:
        texte = telecharger(url)
    except Exception as e:
        log(f"RSS {url} ignoré : {e}")
        return offres
    hote = urllib.parse.urlparse(url).netloc.replace("www.", "")
    for it in _rss_items(texte):
        titre = nettoyer(it["title"])
        if not titre:
            continue
        desc = html_en_texte(it["description"]) if "<" in it["description"] else nettoyer(it["description"])
        offres.append({
            "id": "rss-" + identifiant(it["link"] or titre),
            "source": hote, "url": it["link"].strip(), "titre": titre, "employeur": "", "lieu": "",
            "region": region_de(desc[:400]), "contrat": "", "type": "emploi",
            "date_publication": _date(it["pubDate"]), "texte": desc[:6000], "telechargeable": True,
        })
    log(f"RSS {hote} : {len(offres)} offres")
    return offres


# ---------------------------------------------------------------- Alertes e-mail (Gmail, IMAP)

def _entete(v):
    parts = email.header.decode_header(v or "")
    return "".join(p.decode(c or "utf-8", errors="replace") if isinstance(p, bytes) else p for p, c in parts)


def _corps(msg):
    html_part, txt_part = None, None
    for part in msg.walk():
        ct = part.get_content_type()
        if part.get_content_maintype() == "multipart" or part.get("Content-Disposition", "").startswith("attachment"):
            continue
        try:
            contenu = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
        except Exception:
            continue
        if ct == "text/html" and html_part is None:
            html_part = contenu
        elif ct == "text/plain" and txt_part is None:
            txt_part = contenu
    if html_part:
        return html_en_texte(html_part, avec_liens=True)
    return txt_part or ""


def lire_alertes_mail(libelle, jours):
    adresse, mdp = os.environ.get("GMAIL_ADRESSE"), os.environ.get("GMAIL_MOT_DE_PASSE_APPLI")
    if not (adresse and mdp):
        log("Alertes mail : identifiants Gmail absents, source ignorée")
        return []
    mails = []
    with imaplib.IMAP4_SSL("imap.gmail.com") as imap:
        imap.login(adresse, mdp.replace(" ", ""))
        statut, _ = imap.select(f'"{libelle}"', readonly=True)
        if statut != "OK":
            log(f"Alertes mail : libellé « {libelle} » introuvable dans Gmail")
            return []
        depuis = (datetime.now() - timedelta(days=jours)).strftime("%d-%b-%Y")
        _, ids = imap.search(None, f"(SINCE {depuis})")
        for num in ids[0].split()[-80:]:
            _, data = imap.fetch(num, "(RFC822)")
            msg = email.message_from_bytes(data[0][1])
            mails.append({
                "id": msg.get("Message-ID", num.decode()),
                "expediteur": _entete(msg.get("From")),
                "sujet": _entete(msg.get("Subject")),
                "date": _date(msg.get("Date")),
                "texte": _corps(msg),
            })
    log(f"Alertes mail : {len(mails)} e-mails lus dans « {libelle} »")
    return mails


def source_du_mail(expediteur, url=""):
    s = (expediteur + " " + url).lower()
    for cle, nom in [("linkedin", "LinkedIn"), ("indeed", "Indeed"), ("welcometothejungle", "Welcome to the Jungle"),
                     ("welcome to the jungle", "Welcome to the Jungle"), ("apec", "APEC"), ("francetravail", "France Travail"),
                     ("france travail", "France Travail"), ("abg.asso", "ABG"), ("euraxess", "EURAXESS"),
                     ("inrae", "INRAE"), ("choisirleservicepublic", "Choisir le service public"),
                     ("hellowork", "HelloWork"), ("adum", "ADUM"), ("pasteur", "Institut Pasteur"),
                     ("inserm", "Inserm"), ("mnhn", "MNHN")]:
        if cle in s:
            return nom
    return "Alerte e-mail"


LIEN_OFFRE = re.compile(r"(?P<titre>[^\n<>]{12,160}?)\s*<(?P<url>https?://[^>\s]+)>")
MOTS_LIEN = ("job", "offre", "emploi", "view", "candidat", "vacanc", "position", "poste", "detail", "rc/clk", "pagead")


def extraire_offres_mail_sans_ia(mail):
    """Repli si l'IA est indisponible : chaque lien qui ressemble à une offre devient une offre."""
    offres, vus = [], set()
    for m in LIEN_OFFRE.finditer(mail["texte"]):
        titre, url = nettoyer(m.group("titre")).strip("-•· "), m.group("url")
        if not any(k in url.lower() for k in MOTS_LIEN):
            continue
        if re.search(r"(désinscri|unsubscribe|paramètre|setting|voir toutes|see all|privacy|aide|help|confidentialit)", titre, re.I):
            continue
        cle = titre.lower()
        if cle in vus:
            continue
        vus.add(cle)
        offres.append({"titre": titre, "url": url, "employeur": "", "lieu": "", "extrait": ""})
    return offres


def offre_depuis_mail(o, mail):
    src = source_du_mail(mail["expediteur"], o.get("url", ""))
    url = o.get("url") or ""
    return {
        "id": "mail-" + identifiant(o.get("titre"), o.get("employeur"), src),
        "source": src, "url": url, "titre": nettoyer(o.get("titre")), "employeur": nettoyer(o.get("employeur")),
        "lieu": nettoyer(o.get("lieu")), "region": region_de(o.get("lieu")), "contrat": nettoyer(o.get("contrat")),
        "type": "these" if re.search(r"th[eè]se|phd|doctora|cifre", o.get("titre", ""), re.I) else "emploi",
        "date_publication": mail["date"], "texte": nettoyer(o.get("extrait"))[:1500],
        "salaire_texte": nettoyer(o.get("salaire")),
        "telechargeable": False,
    }


# ---------------------------------------------------------------- API France Travail (si accès accordé)

def collecter_france_travail(cfg):
    cid, secret = os.environ.get("FT_CLIENT_ID"), os.environ.get("FT_CLIENT_SECRET")
    if not (cid and secret):
        return []
    try:
        donnees = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": cid,
                                          "client_secret": secret, "scope": "api_offresdemploiv2 o2dsoffre"}).encode()
        req = urllib.request.Request(
            "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire", data=donnees,
            headers={"Content-Type": "application/x-www-form-urlencoded"})
        jeton = json.load(urllib.request.urlopen(req, timeout=30))["access_token"]
    except Exception as e:
        log(f"France Travail : authentification impossible ({e}), source ignorée")
        return []
    offres, vus = [], set()
    for mc in cfg.get("motscles", []):
        for dep in cfg.get("departements", ["75"]):
            q = urllib.parse.urlencode({"motsCles": mc, "departement": dep, "range": "0-49", "publieeDepuis": 7})
            req = urllib.request.Request(f"https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?{q}",
                                         headers={"Authorization": f"Bearer {jeton}", "Accept": "application/json"})
            try:
                r = urllib.request.urlopen(req, timeout=30)
                resultats = json.load(r).get("resultats", []) if r.status == 200 else []
            except Exception as e:
                log(f"France Travail « {mc} » {dep} : {e}")
                continue
            for o in resultats:
                if o["id"] in vus:
                    continue
                vus.add(o["id"])
                sal = (o.get("salaire") or {}).get("libelle", "")
                offres.append({
                    "id": "ft-" + o["id"], "source": "France Travail",
                    "url": (o.get("origineOffre") or {}).get("urlOrigine")
                    or f"https://candidat.francetravail.fr/offres/recherche/detail/{o['id']}",
                    "titre": o.get("intitule", ""), "employeur": (o.get("entreprise") or {}).get("nom", ""),
                    "lieu": (o.get("lieuTravail") or {}).get("libelle", ""), "region": "idf",
                    "contrat": f"{o.get('typeContratLibelle', '')}", "type": "emploi",
                    "date_publication": (o.get("dateCreation") or "")[:10],
                    "texte": (o.get("description") or "")[:6000]
                    + "\nExpérience : " + (o.get("experienceLibelle") or "")
                    + "\nCompétences : " + ", ".join(c.get("libelle", "") for c in o.get("competences", []) or []),
                    "salaire_texte": sal, "telechargeable": False,
                })
    log(f"France Travail : {len(offres)} offres")
    return offres
