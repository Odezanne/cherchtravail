"""Outils communs : téléchargement poli, robots.txt, HTML -> texte, normalisation."""
import hashlib
import html
import re
import time
import unicodedata
import urllib.error
import urllib.request
import urllib.robotparser
from html.parser import HTMLParser
from urllib.parse import urlparse

USER_AGENT = "Jobot/1.0 (agregateur personnel, usage non commercial)"

# Sites dont les conditions d'utilisation interdisent l'extraction automatique :
# on n'ouvre jamais leurs pages, on se contente du contenu des alertes e-mail reçues.
NE_JAMAIS_TELECHARGER = (
    "linkedin.com", "indeed.", "welcometothejungle.com", "apec.fr", "glassdoor.",
    "hellowork.com", "monster.", "francetravail.fr", "pole-emploi.fr",
)

_robots_cache = {}
JOURNAL = []  # lignes du journal, enregistrées dans data/journal.txt à chaque passage


def log(*args):
    ligne = " ".join([time.strftime("%H:%M:%S")] + [str(a) for a in args])
    JOURNAL.append(ligne)
    print(ligne, flush=True)


def autorise(url):
    host = urlparse(url).netloc.lower()
    if any(b in host for b in NE_JAMAIS_TELECHARGER):
        return False
    base = f"{urlparse(url).scheme}://{host}"
    rp = _robots_cache.get(base)
    if rp is None:
        # On lit robots.txt nous-mêmes, avec notre User-Agent : certains serveurs refusent celui de Python par défaut
        # (ce que la bibliothèque standard prend à tort pour « tout est interdit »), d'autres renvoient une page HTML.
        rp = urllib.robotparser.RobotFileParser()
        try:
            req = urllib.request.Request(base + "/robots.txt", headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=20) as r:
                corps = r.read(200000).decode("utf-8", errors="replace")
                html_page = "html" in (r.headers.get("Content-Type") or "").lower() or "<html" in corps[:500].lower()
            rp.parse([] if html_page else corps.splitlines())
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                rp.disallow_all = True
            else:
                rp.parse([])
        except Exception:
            rp = False
        _robots_cache[base] = rp
    if rp is False:
        return True
    return rp.can_fetch(USER_AGENT, url)


def telecharger(url, timeout=30, verifier_robots=True):
    if verifier_robots and not autorise(url):
        raise PermissionError(f"Extraction non autorisée pour {url}")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "fr,en"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        brut = r.read()
        charset = r.headers.get_content_charset() or "utf-8"
    time.sleep(1)  # politesse
    return brut.decode(charset, errors="replace")


class _Texte(HTMLParser):
    BLOCS = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "section", "article", "td", "ul", "ol", "table"}
    IGNORES = {"script", "style", "noscript", "head", "svg", "nav", "footer", "form"}

    def __init__(self, avec_liens=False):
        super().__init__(convert_charrefs=True)
        self.morceaux, self.ignore, self.avec_liens, self._lien = [], 0, avec_liens, None

    def handle_starttag(self, tag, attrs):
        if tag in self.IGNORES:
            self.ignore += 1
        elif tag in self.BLOCS:
            self.morceaux.append("\n")
        if tag == "a" and self.avec_liens:
            self._lien = dict(attrs).get("href")
        if tag == "li":
            self.morceaux.append("- ")

    def handle_endtag(self, tag):
        if tag in self.IGNORES and self.ignore:
            self.ignore -= 1
        elif tag in self.BLOCS:
            self.morceaux.append("\n")
        if tag == "a" and self._lien:
            if self._lien.startswith("http"):
                self.morceaux.append(f" <{self._lien}> ")
            self._lien = None

    def handle_data(self, data):
        if not self.ignore:
            self.morceaux.append(data)


def html_en_texte(contenu, avec_liens=False):
    p = _Texte(avec_liens)
    p.feed(contenu)
    t = "".join(p.morceaux)
    t = re.sub(r"[ \t\xa0]+", " ", t)
    t = re.sub(r"\n\s*\n+", "\n\n", t)
    return t.strip()


def sans_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").lower()


def identifiant(*parties):
    cle = "|".join(sans_accents(p or "").strip() for p in parties)
    return hashlib.sha1(cle.encode()).hexdigest()[:12]


def nettoyer(s):
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip()


MOIS = {m: i + 1 for i, m in enumerate(["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout",
                                        "septembre", "octobre", "novembre", "decembre"])}
MOIS.update({m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                             "september", "october", "november", "december"])})
# « Date limite de candidature : jeudi 15 octobre 2026 », « Date limite : 30/05/2027 », « Date limite du dépôt des
# candidatures : 20/11/2026 », « Clôture des candidatures le 4 novembre 2026 », « Application deadline: 15 November 2026 ».
# Entre le libellé et la date : ni chiffre, ni point, ni retour à la ligne (sinon on attraperait une autre date).
_DATE_LIMITE = re.compile(
    r"(?:date limite|cloture des candidatures|candidater avant|candidatures? (?:jusqu.au|avant)|deadline)"
    r"[^:.\d\n]{0,45}:?\s*(?:le\s+)?(?:[a-z]+,?\s+)?(\d{1,2})(?:er)?[\s/.-]+(\d{1,2}|[a-z]+)[\s/.-]+(\d{4})\b")


def date_limite(texte):
    """Date limite de candidature trouvée dans le texte d'une offre (AAAA-MM-JJ), sans IA. None si absente ou
    invraisemblable (déjà passée ou à plus de 18 mois : probablement une autre date)."""
    from datetime import date, timedelta
    auj = date.today()
    for m in _DATE_LIMITE.finditer(sans_accents(texte or "")):
        j, mois, a = m.groups()
        mois = int(mois) if mois.isdigit() else MOIS.get(mois)
        try:
            d = date(int(a), mois, int(j))
        except (TypeError, ValueError):
            continue
        if auj <= d <= auj + timedelta(days=550):
            return d.isoformat()
    return None
