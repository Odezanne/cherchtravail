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
            "flux_large": True,
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


# ---------------------------------------------------------------- Choisir le service public (MNHN, INRAE, universités…)
# robots.txt du site : seules /wp-admin/ et les PDF sont interdits, les pages d'offres sont autorisées.

CSP = "https://choisirleservicepublic.gouv.fr"
MOIS = {m: i + 1 for i, m in enumerate(["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout",
                                         "septembre", "octobre", "novembre", "decembre"])}


def _csp_champ(bloc, nom):
    m = re.search(r'<span class="sr-only">\s*' + nom + r'\s*:\s*</span>(.*?)</li>', bloc, re.S)
    return nettoyer(re.sub(r"<[^>]+>", " ", m.group(1))) if m else ""


def _csp_date(bloc):
    from util import sans_accents
    m = re.search(r"En ligne depuis le (\d{1,2}) (\S+) (\d{4})", sans_accents(bloc))
    if m and m.group(2) in MOIS:
        return f"{m.group(3)}-{MOIS[m.group(2)]:02d}-{int(m.group(1)):02d}"
    return datetime.now(timezone.utc).date().isoformat()


def lire_page_csp(texte):
    offres = []
    for bloc in texte.split('class="fr-card__title"')[1:]:
        bloc = bloc[:6000]
        m = re.search(r'href="(https://choisirleservicepublic\.gouv\.fr/offre-emploi/[^"]+)"[^>]*>(.*?)</a>', bloc, re.S)
        if not m:
            continue
        url, titre = m.group(1), nettoyer(re.sub(r"<[^>]+>", " ", m.group(2)))
        ref = re.search(r"reference-([\w-]+?)/?$", url)
        lieu = _csp_champ(bloc, "Localisation")
        employeur = _csp_champ(bloc, "Employeur")
        if "(MNHN)" in employeur:
            employeur = "MNHN"
        offres.append({
            "id": "csp-" + (ref.group(1) if ref else identifiant(url)),
            "source": "MNHN" if employeur == "MNHN" else "Choisir le service public",
            "url": url,
            "titre": re.sub(r"\s*\((?:F/H|H/F)\)\s*$", "", titre).strip(),
            "employeur": employeur, "lieu": lieu, "region": region_de(lieu),
            "contrat": "", "type": "these" if re.search(r"th[eè]se|doctorant|cifre", titre, re.I) else "emploi",
            "date_publication": _csp_date(bloc), "texte": "", "telechargeable": True, "flux_large": True,
        })
    return offres


def collecter_csp(cfg):
    """Recherche par mots-clés sur Choisir le service public. cfg = {motscles: [...], pages: 1}."""
    offres, vus = [], set()
    for mc in cfg.get("motscles") or []:
        pages = int(cfg.get("pages_mnhn", 2)) if mc.lower() == "mnhn" else int(cfg.get("pages", 1))
        for p in range(1, pages + 1):
            url = f"{CSP}/nos-offres/filtres/mot-cles/{urllib.parse.quote(mc)}/" + (f"page/{p}/" if p > 1 else "")
            try:
                lot = lire_page_csp(telecharger(url, timeout=60))
            except Exception as e:
                log(f"Choisir le service public « {mc} » page {p} : {e}")
                break
            nouv = [o for o in lot if o["id"] not in vus]
            vus.update(o["id"] for o in nouv)
            offres += nouv
            if len(lot) < 20:
                break
    log(f"Choisir le service public : {len(offres)} offres ({sum(o['source'] == 'MNHN' for o in offres)} du MNHN)")
    return offres


def texte_offre_csp(page):
    """Garde la partie utile d'une page d'offre (de « Date limite » / « Nature de l'emploi » à la fin des missions)."""
    t = html_en_texte(page)
    debut = min([i for i in (t.find("Référence"), t.find("Date limite")) if i >= 0], default=0)
    t = t[debut:]
    for parasite in ("Partager la page", "Partager sur Facebook", "Partager sur X (anciennement Twitter) - nouvelle fenêtre",
                     "Partager sur LinkedIn", "Partager par email", "Copier dans le presse-papier", "Ajouter aux favoris"):
        t = t.replace(parasite, "")
    return re.sub(r"\n\s*\n+", "\n", t).strip()


# ---------------------------------------------------------------- Adzuna (API officielle gratuite, regroupe de nombreux sites)

def collecter_adzuna(cfg, zones=("idf",), par_page=50):
    app_id, app_key = os.environ.get("ADZUNA_APP_ID"), os.environ.get("ADZUNA_APP_KEY")
    if not (app_id and app_key):
        return []
    offres, vus = [], set()
    for mc in cfg.get("motscles") or []:
        params = {"app_id": app_id, "app_key": app_key, "what": mc, "results_per_page": par_page,
                  "max_days_old": cfg.get("jours", 14), "content-type": "application/json", "sort_by": "date"}
        if list(zones) == ["idf"]:
            params.update({"where": "Paris", "distance": 60})
        url = "https://api.adzuna.com/v1/api/jobs/fr/search/1?" + urllib.parse.urlencode(params)
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "cherchtravail"})
            with urllib.request.urlopen(req, timeout=40) as r:
                res = json.load(r).get("results", [])
        except Exception as e:
            log(f"Adzuna « {mc} » : {e}")
            continue
        for j in res:
            oid = "adz-" + str(j.get("id"))
            if oid in vus:
                continue
            vus.add(oid)
            lieu = (j.get("location") or {}).get("display_name", "")
            zone = " ".join((j.get("location") or {}).get("area") or [])
            smin, smax = j.get("salary_min"), j.get("salary_max")
            sal = ""
            if smin and not j.get("salary_is_predicted") in ("1", 1, True):
                sal = f"{round(smin)}" + (f"-{round(smax)}" if smax and smax != smin else "") + " € par an"
            offres.append({
                "id": oid, "source": "Adzuna", "url": j.get("redirect_url", ""), "titre": nettoyer(re.sub(r"<[^>]+>", "", j.get("title", ""))),
                "employeur": nettoyer((j.get("company") or {}).get("display_name", "")), "lieu": lieu,
                "region": region_de(zone + " " + lieu), "contrat": {"contract": "CDD", "permanent": "CDI"}.get(j.get("contract_type"), ""),
                "type": "these" if re.search(r"th[eè]se|doctorant|cifre", j.get("title", ""), re.I) else "emploi",
                "date_publication": (j.get("created") or "")[:10], "texte": nettoyer(re.sub(r"<[^>]+>", "", j.get("description", ""))),
                "salaire_texte": sal, "telechargeable": False, "flux_large": True,
            })
    log(f"Adzuna : {len(offres)} offres")
    return offres


# ---------------------------------------------------------------- Jooble (API gratuite, regroupe de nombreux sites ; quota limité)

def collecter_jooble(motscles, lieu="Île-de-France", max_appels=3):
    cle = os.environ.get("JOOBLE_API_KEY")
    if not cle:
        return []
    offres, vus = [], set()
    for mc in list(motscles)[:max_appels]:
        corps = json.dumps({"keywords": mc, "location": lieu, "page": "1"}).encode()
        res = None
        for hote in ("fr.jooble.org", "jooble.org"):  # la clé France répond sur fr.jooble.org
            req = urllib.request.Request(f"https://{hote}/api/{cle}", data=corps,
                                         headers={"Content-Type": "application/json", "User-Agent": "cherchtravail"})
            try:
                with urllib.request.urlopen(req, timeout=40) as r:
                    res = json.load(r).get("jobs", [])
                break
            except Exception as e:
                log(f"Jooble {hote} « {mc} » : {str(e).replace(cle, '***')}")
        if res is None:
            continue
        for j in res:
            oid = "joo-" + identifiant(str(j.get("id") or j.get("link", "")))
            if oid in vus:
                continue
            vus.add(oid)
            titre = nettoyer(re.sub(r"<[^>]+>", "", j.get("title", "")))
            offres.append({
                "id": oid, "source": nettoyer(j.get("source", "")) or "Jooble", "url": j.get("link", ""), "titre": titre,
                "employeur": nettoyer(j.get("company", "")), "lieu": nettoyer(j.get("location", "")),
                "region": region_de(j.get("location", "")), "contrat": nettoyer(j.get("type", "")),
                "type": "these" if re.search(r"th[eè]se|doctorant|cifre", titre, re.I) else "emploi",
                "date_publication": (j.get("updated") or "")[:10],
                "texte": nettoyer(re.sub(r"<[^>]+>", " ", j.get("snippet", ""))), "salaire_texte": nettoyer(j.get("salary", "")),
                "telechargeable": False, "flux_large": True,
            })
    log(f"Jooble : {len(offres)} offres")
    return offres


# ---------------------------------------------------------------- Alertes e-mail (Gmail, IMAP)

def _entete(v):
    parts = email.header.decode_header(v or "")
    def dec(p, c):
        if not isinstance(p, bytes):
            return p
        try:
            return p.decode(c or "utf-8", errors="replace")
        except LookupError:
            return p.decode("utf-8", errors="replace")
    return "".join(dec(p, c) for p, c in parts)


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


# Sites d'emploi dont les mails (alertes, récaps, relances, newsletters) sont lus puis rangés à la corbeille.
# Jamais : indeedemail.com (réponses d'employeurs), France Travail (convocations), messages LinkedIn.
EXPEDITEURS_EMPLOI = [
    "indeed.com", "welcometothejungle.com", "wttj.co", "apec.fr", "hellowork.com", "jobteaser.com", "glassdoor.com",
    "glassdoor.fr", "monster.fr", "meteojob.com", "cadremploi.fr", "keljob.com", "jooble.org", "talent.com",
    "jobijoba.com", "optioncarriere.com", "jobintree.com", "regionsjob.com", "abg.asso.fr", "euraxess.ec.europa.eu",
    "choisirleservicepublic.gouv.fr", "talent-soft.com", "adum.fr",
    "jobalerts-noreply@linkedin.com", "jobs-noreply@linkedin.com", "jobs-listings@linkedin.com",
]
# Un mail dont le sujet contient l'un de ces mots n'est jamais touché (suivi de candidature, recruteur, entretien…)
PROTEGE = re.compile(r"candidatur|entretien|convocation|rendez-vous|\brdv\b|message|r[ée]ponse|recruteu|retenu|"
                     r"s[ée]lectionn|proposition|f[ée]licitation|malheureusement|suite [àa] votre|votre dossier|visio|"
                     r"invitation|contrat de travail|disponibilit|^\s*(re|tr|fwd?)\s*:", re.I)


def _imap():
    adresse, mdp = os.environ.get("GMAIL_ADRESSE"), os.environ.get("GMAIL_MOT_DE_PASSE_APPLI")
    if not (adresse and mdp):
        return None
    imap = imaplib.IMAP4_SSL("imap.gmail.com")
    imap.login(adresse, mdp.replace(" ", ""))
    return imap


def _dossier_special(imap, drapeau):
    """Nom réel d'un dossier Gmail (« Tous les messages », « Corbeille »… selon la langue du compte)."""
    _, lignes = imap.list()
    for l in lignes or []:
        l = l.decode(errors="replace") if isinstance(l, bytes) else str(l)
        if drapeau in l:
            m = re.search(r'"([^"]+)"\s*$', l) or re.search(r"(\S+)\s*$", l)
            return m.group(1)
    return None


def _requete(libelle, expediteurs, suite=""):
    etiquette = re.sub(r"[^\w]+", "-", libelle.strip().lower())
    return f"(label:{etiquette} OR from:({' OR '.join(expediteurs)})) -in:trash -is:starred {suite}".strip()


def _uids(imap, requete):
    statut, data = imap.uid("SEARCH", None, "X-GM-RAW", '"' + requete.replace('"', "") + '"')
    if statut != "OK":
        raise RuntimeError(f"recherche Gmail refusée : {data}")
    return data[0].split() if data and data[0] else []


def lire_alertes_mail(libelle, jours, expediteurs=None):
    """Mails des derniers jours venant du libellé d'alertes ou d'un site d'emploi, hors mails protégés."""
    imap = _imap()
    if imap is None:
        log("Alertes mail : identifiants Gmail absents, source ignorée")
        return []
    mails = []
    with imap:
        tous = _dossier_special(imap, "\\All")
        if not tous:
            log("Alertes mail : dossier « Tous les messages » introuvable (IMAP Gmail)")
            return []
        imap.select(f'"{tous}"', readonly=True)
        uids = _uids(imap, _requete(libelle, expediteurs or EXPEDITEURS_EMPLOI, f"newer_than:{jours}d"))
        for uid in uids[-80:]:
            _, data = imap.uid("FETCH", uid, "(RFC822)")
            if not data or not isinstance(data[0], tuple):
                continue
            msg = email.message_from_bytes(data[0][1])
            sujet = _entete(msg.get("Subject"))
            if PROTEGE.search(sujet):
                continue
            mails.append({
                "id": msg.get("Message-ID", uid.decode()),
                "expediteur": _entete(msg.get("From")),
                "sujet": sujet,
                "date": _date(msg.get("Date")),
                "texte": _corps(msg),
            })
    log(f"Alertes mail : {len(uids)} mails d'emploi récents, {len(mails)} lus (hors candidatures et échanges protégés)")
    return mails


def menage_mails(libelle, jours, traites, mode="essai", expediteurs=None, maximum=1500):
    """Range à la corbeille Gmail (récupérable 30 jours) les mails d'alertes et des sites d'emploi :
    ceux dont les offres ont déjà été recopiées sur le site, et ceux de plus de `jours` jours.
    mode « essai » : ne touche à rien, renvoie seulement la liste. Renvoie [(date, expéditeur, sujet)]."""
    from util import identifiant
    imap = _imap()
    if imap is None:
        return []
    choisis, uids_choisis = [], []
    limite = (datetime.now(timezone.utc) - timedelta(days=jours)).date().isoformat()
    with imap:
        tous = _dossier_special(imap, "\\All")
        imap.select(f'"{tous}"', readonly=(mode != "actif"))
        uids = _uids(imap, _requete(libelle, expediteurs or EXPEDITEURS_EMPLOI))[-maximum:]
        for i in range(0, len(uids), 100):
            lot = b",".join(uids[i:i + 100])
            _, data = imap.uid("FETCH", lot, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)])")
            for part in data or []:
                if not isinstance(part, tuple):
                    continue
                m = re.search(rb"UID (\d+)", part[0])
                if not m:
                    continue
                h = email.message_from_bytes(part[1])
                sujet, exp = _entete(h.get("Subject")), _entete(h.get("From"))
                if PROTEGE.search(sujet):
                    continue
                date_mail = _date(h.get("Date"))
                deja_lu = identifiant(h.get("Message-ID", "")) in traites
                if deja_lu or date_mail < limite:
                    choisis.append((date_mail, exp, sujet))
                    uids_choisis.append(m.group(1))
        if mode == "actif" and uids_choisis:
            for i in range(0, len(uids_choisis), 200):
                imap.uid("STORE", b",".join(uids_choisis[i:i + 200]), "+X-GM-LABELS", "(\\Trash)")
    log(f"Ménage des mails ({mode}) : {len(choisis)} mail(s) {'mis à la corbeille' if mode == 'actif' else 'seraient mis à la corbeille'}")
    return choisis


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
