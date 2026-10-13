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
        # Gemini d'abord (plus fiable pour produire du JSON), puis les modèles gratuits d'OpenRouter
        c = []
        if self.cle_gemini:
            c += [("gemini", m) for m in (os.environ.get("GEMINI_MODELE", "gemini-flash-latest"), "gemini-flash-lite-latest")]
        if self.cle_or:
            c += [("openrouter", m) for m in self.modeles]
        return c

    def _post(self, fournisseur, modele, systeme, message, max_tokens, format_json=True):
        if fournisseur == "openrouter":
            url, cle = "https://openrouter.ai/api/v1/chat/completions", self.cle_or
        else:
            url, cle = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", self.cle_gemini
        corps = {"model": modele, "max_tokens": max_tokens, "temperature": 0.2,
                 "messages": [{"role": "system", "content": systeme}, {"role": "user", "content": message}]}
        if fournisseur == "openrouter":
            corps["reasoning"] = {"effort": "low", "exclude": True}
        if format_json:
            corps["response_format"] = {"type": "json_object"}
        req = urllib.request.Request(url, data=json.dumps(corps).encode(), headers={
            "Authorization": f"Bearer {cle}", "Content-Type": "application/json",
            "HTTP-Referer": "https://odezanne.github.io/cherchtravail/", "X-Title": "Cherchtravail"})
        with urllib.request.urlopen(req, timeout=180) as r:
            rep = json.load(r)
        if "error" in rep:
            raise RuntimeError(str(rep["error"])[:300])
        return rep["choices"][0]["message"]["content"] or ""

    def json(self, systeme, message, max_tokens=8000):
        """Renvoie la réponse JSON du premier modèle qui répond correctement. Lève QuotaEpuise si aucun n'y arrive."""
        for fournisseur, modele in self.cibles():
            if (fournisseur, modele) in self.morts:
                continue
            format_json = True
            for essai in range(3):
                try:
                    self.appels += 1
                    texte = self._post(fournisseur, modele, systeme, message, max_tokens, format_json)
                    return extraire_json(texte)
                except urllib.error.HTTPError as e:
                    detail = e.read().decode(errors="replace")[:200].replace("\n", " ")
                    if e.code == 400 and format_json:
                        format_json = False  # certains modèles refusent l'option « JSON uniquement »
                        continue
                    quotidien = any(k in detail.lower() for k in ("per-day", "daily", "per day", "quota"))
                    if e.code in (429, 500, 502, 503, 504) and not quotidien and essai < 2:
                        time.sleep(15 * (essai + 1))
                        continue
                    log(f"IA {modele} : HTTP {e.code} {detail}")
                    if e.code in (401, 402, 403, 404) or (e.code == 429 and quotidien):
                        self.morts.add((fournisseur, modele))
                    break
                except (ValueError, KeyError, IndexError, TypeError) as e:
                    log(f"IA {modele} : réponse illisible ({str(e)[:80]})")
                    if essai == 1:
                        break
                except Exception as e:
                    log(f"IA {modele} : {str(e)[:120]}")
                    if essai == 1:
                        break
                    time.sleep(10)
        raise QuotaEpuise("aucun modèle n'a répondu")


def extraire_json(texte):
    texte = re.sub(r"<think>.*?</think>", "", texte, flags=re.S).strip()
    texte = re.sub(r"^```(?:json)?|```$", "", texte.strip(), flags=re.M).strip()
    debut = min([i for i in (texte.find("{"), texte.find("[")) if i >= 0], default=-1)
    if debut < 0:
        raise ValueError("pas de JSON")
    fin = max(texte.rfind("}"), texte.rfind("]"))
    try:
        return json.loads(texte[debut:fin + 1])
    except ValueError:
        # Réponse coupée ou mal formée : on récupère les objets complets un par un
        dec, objets, i = json.JSONDecoder(), [], texte.find("{", debut + 1)
        while i >= 0:
            try:
                obj, fin_obj = dec.raw_decode(texte, i)
                if isinstance(obj, dict) and ("id" in obj or "titre" in obj):
                    objets.append(obj)
                    i = texte.find("{", fin_obj)
                    continue
            except ValueError:
                pass
            i = texte.find("{", i + 1)
        if not objets:
            raise
        return {"offres": objets}
