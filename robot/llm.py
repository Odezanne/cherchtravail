"""Appels aux modèles gratuits (OpenRouter, avec repli Gemini si une clé Google est fournie)."""
import json
import os
import re
import time
import urllib.error
import urllib.request

from util import log


class QuotaEpuise(Exception):
    pass


class IA:
    def __init__(self, modeles):
        self.cle_or = os.environ.get("OPENROUTER_API_KEY")
        self.cle_gemini = os.environ.get("GEMINI_API_KEY")
        self.modeles = list(modeles)
        self.morts = set()
        self.appels = 0

    @property
    def disponible(self):
        return bool(self.cle_or or self.cle_gemini) and (len(self.morts) < len(self.cibles()))

    def cibles(self):
        c = []
        if self.cle_or:
            c += [("openrouter", m) for m in self.modeles]
        if self.cle_gemini:
            c.append(("gemini", os.environ.get("GEMINI_MODELE", "gemini-flash-latest")))
        return c

    def _post(self, fournisseur, modele, systeme, message, max_tokens):
        if fournisseur == "openrouter":
            url, cle = "https://openrouter.ai/api/v1/chat/completions", self.cle_or
        else:
            url, cle = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", self.cle_gemini
        corps = {"model": modele, "max_tokens": max_tokens, "temperature": 0.2,
                 "messages": [{"role": "system", "content": systeme}, {"role": "user", "content": message}]}
        if fournisseur == "openrouter":
            corps["reasoning"] = {"effort": "low", "exclude": True}
        req = urllib.request.Request(url, data=json.dumps(corps).encode(), headers={
            "Authorization": f"Bearer {cle}", "Content-Type": "application/json",
            "HTTP-Referer": "https://odezanne.github.io/cherchtravail/", "X-Title": "Cherchtravail"})
        with urllib.request.urlopen(req, timeout=180) as r:
            rep = json.load(r)
        if "error" in rep:
            raise RuntimeError(str(rep["error"])[:300])
        return rep["choices"][0]["message"]["content"] or ""

    def json(self, systeme, message, max_tokens=6000):
        """Renvoie la réponse JSON du premier modèle disponible. Lève QuotaEpuise si tous échouent."""
        for fournisseur, modele in self.cibles():
            if (fournisseur, modele) in self.morts:
                continue
            for essai in range(2):
                try:
                    self.appels += 1
                    texte = self._post(fournisseur, modele, systeme, message, max_tokens)
                    return extraire_json(texte)
                except urllib.error.HTTPError as e:
                    detail = e.read().decode(errors="replace")[:200]
                    if e.code == 429 and essai == 0 and "per-day" not in detail and "daily" not in detail:
                        time.sleep(20)
                        continue
                    log(f"IA {modele} : HTTP {e.code} {detail}")
                    if e.code in (401, 402, 403, 404, 429):
                        self.morts.add((fournisseur, modele))
                    break
                except (ValueError, KeyError, IndexError) as e:
                    log(f"IA {modele} : réponse illisible ({e}), nouvel essai")
                    if essai == 1:
                        break
                except Exception as e:
                    log(f"IA {modele} : {e}")
                    break
        raise QuotaEpuise("aucun modèle disponible")


def extraire_json(texte):
    texte = re.sub(r"<think>.*?</think>", "", texte, flags=re.S).strip()
    texte = re.sub(r"^```(?:json)?|```$", "", texte.strip(), flags=re.M).strip()
    debut = min([i for i in (texte.find("{"), texte.find("[")) if i >= 0], default=-1)
    if debut < 0:
        raise ValueError("pas de JSON")
    fin = max(texte.rfind("}"), texte.rfind("]"))
    return json.loads(texte[debut:fin + 1])
