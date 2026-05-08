v1.0-stable — Quiz Profil Mental à Cheval
Date : 2026-05-08
Statut : fonctionnel en local (netlify dev) et prêt pour déploiement Netlify

Ce que fait cette version
Quiz de 12 questions qui détermine le profil mental d'un cavalier parmi 5 profils :

Le Survivant (peur / trauma / hypervigilance)
Le Contrôlant (surcontrôle / crispation)
Le Perfectionniste (auto-critique / pression)
L'Hypermental (surcharge mentale / trop penser)
Le Mental Stable (profil rassurant / équilibré)
L'IA (Claude Haiku via API Anthropic) lit les 12 réponses en langage naturel et détermine le profil de façon qualitative, sans scoring algorithmique. Le résultat est sauvegardé dans Supabase.

Organisation des fichiers
quiz-cheval/
├── index.html                        # Quiz complet (UI + logique frontend)
├── netlify.toml                      # Config Netlify (publish, functions, headers)
├── netlify/functions/
│   └── quiz-proxy.js                 # Fonction serverless unique (/api/quiz)
├── .env                              # Variables locales (non committé)
├── .gitignore
└── VERSION.md                        # Ce fichier
Comment ça fonctionne
Frontend (index.html)
3 sections : Hero → Quiz → Résultat
Navigation question par question avec barre de progression
Collecte les réponses dans answers[] (valeurs 1-4 par question)
À la validation : appelle /api/quiz deux fois — d'abord pour le profil IA, ensuite pour sauvegarder
Backend (netlify/functions/quiz-proxy.js)
Une seule fonction avec deux actions POST :

action: get_profile

Convertit answers[] en texte lisible (ex: "Q1 → Je réfléchis trop à tout")
Envoie à Claude Haiku via https://api.anthropic.com/v1/messages
Retourne un JSON : { profil, emoji, sous_titre, pourcentage, description, conseil_cle, profil_secondaire }
action: save_result

Insère dans la table Supabase quiz_resultats : réponses, profil, description IA, timestamp
Variables d'environnement requises
Variable	Description
SUPABASE_URL	URL du projet Supabase
SUPABASE_ANON_KEY	Clé anon Supabase
AI_SECRET	Clé API Anthropic (nommée ainsi car Netlify filtre *_API_KEY)
Table Supabase
create table quiz_resultats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  reponses jsonb not null,
  profil text,
  profil_secondaire text,
  description_ia text
);
Lancer en local
cd C:\Users\ADH\quiz-cheval
netlify dev --port 8889
# → http://localhost:8889
Déployer
Push sur main → Netlify redéploie automatiquement (si site connecté au repo GitHub ADH-FR/quiz-cheval).
