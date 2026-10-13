# Cherchtravail

Mon agrégateur personnel d'offres d'emploi et de thèse, trié selon mon CV.

**Site :** https://odezanne.github.io/cherchtravail/ (à épingler sur l'iPhone : Safari > Partager > Sur l'écran d'accueil)

## Comment ça marche

Chaque matin, un robot GitHub (gratuit) :

1. **ramasse les offres** :
   - flux officiel du CNRS (CDD d'ingénieurs et contrats doctoraux) ;
   - Choisir le service public : toutes les offres du MNHN et une recherche par mots-clés dans la fonction publique
     (le site autorise la lecture de ses offres) ;
   - mes **alertes e-mail** Indeed, LinkedIn, Welcome to the Jungle, APEC, France Travail, ABG, EURAXESS,
     INRAE, Choisir le service public… rangées dans le libellé Gmail « Alertes emploi » ;
   - l'API France Travail, dès que l'accès sera accordé ;
2. **les analyse avec une IA gratuite** (OpenRouter) : note d'intérêt en %, missions, prérequis, compétences
   attendues (✓ j'ai / ✗ il me manque), blocages (expérience ou doctorat exigés) et conseil pour tenter quand même ;
3. **met à jour le site** et m'envoie **le condensé** par e-mail (et notification ntfy si configurée) ;
4. **fait le ménage dans Gmail** : les mails d'alertes et des sites d'emploi partent à la corbeille (récupérables
   30 jours) une fois leurs offres recopiées sur le site. Jamais les mails de candidature, d'entretien ou de recruteurs.
   Réglage `menage` dans `config/recherche.yaml` : `essai` (liste seulement), `actif` ou `non`.

Le robot écrit son compte rendu dans `data/journal.txt` à chaque passage.

## Sur le site

- **Emplois / Thèses** : sur chaque carte, « Voir sur… » ouvre l'offre d'origine, « Garder » la remonte en tête
  (« À ne pas oublier ») jusqu'à ma candidature, « Pas pour moi » la fait disparaître pour de bon.
- **Suivi** : statuts, entretiens, calendrier, export Word des candidatures pour France Travail.
- **Lettre** : lettre pré-remplie pour l'offre choisie, vérifications (une page, pas de tirets longs), export Word.
- **Dossier** : mes CV et lettres (PDF, Word) rangés sur le téléphone, à partager vers Mail, Canva ou Word.

Pourquoi les alertes e-mail ? Indeed, LinkedIn, Welcome to the Jungle et l'APEC interdisent l'extraction automatique
de leurs pages. Le robot ne visite jamais ces sites : il lit seulement les alertes que je reçois.

## Réglages

- `config/recherche.yaml` : heure du condensé, mots-clés, exclusions, nombre d'offres analysées par jour.
- `config/profil.md` : le profil que l'IA utilise pour noter les offres.

Pour modifier : ouvrir le fichier sur GitHub, cliquer sur le crayon, enregistrer (« Commit changes »).

## Clés (Settings > Secrets and variables > Actions)

| Nom | Rôle |
|---|---|
| `OPENROUTER_API_KEY` | IA gratuite (obligatoire) |
| `GMAIL_ADRESSE` | adresse Gmail |
| `GMAIL_MOT_DE_PASSE_APPLI` | mot de passe d'application Google (lecture des alertes, envoi du condensé) |
| `NTFY_SUJET` | facultatif : notification sur le téléphone via l'appli ntfy |
| `GEMINI_API_KEY` | facultatif : IA de secours |
| `FT_CLIENT_ID`, `FT_CLIENT_SECRET` | API France Travail, quand l'accès sera accordé |

## Lancer une recherche tout de suite

Onglet **Actions** > **Robot quotidien** > **Run workflow**.
