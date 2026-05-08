# v1.1-stable — Quiz Profil Mental à Cheval

**Date** : 2026-05-08
**Statut** : fonctionnel en local (netlify dev) et prêt pour déploiement Netlify

## Nouveautés par rapport à v1.0

- Flow lead magnet : pré-résultat avec tension avant la capture email
- Capture email avant le résultat complet
- Envoi automatique d'un compte rendu personnalisé par email via Resend
- Compte rendu généré par Claude : diagnostic, pourquoi tu bloques, projection, micro-solution
- Sauvegarde de l'email dans Supabase

---

## Ce que fait cette version

Quiz de 12 questions qui détermine le profil mental d'un cavalier parmi 5 profils :
- Le Survivant (peur / trauma / hypervigilance)
- Le Contrôlant (surcontrôle / crispation)
- Le Perfectionniste (auto-critique / pression)
- L'Hypermental (surcharge mentale / trop penser)
- Le Mental Stable (profil rassurant / équilibré)

L'IA (Claude Haiku via API Anthropic) lit les 12 réponses en langage naturel et détermine le profil de façon qualitative, sans scoring algorithmique. Le résultat est affiché sur place et envoyé par email via Resend.

---

## Flow utilisateur

1. **Hero** — accroche, bouton démarrer
2. **Quiz** — 12 questions, navigation fluide
3. **Loading** — analyse IA en cours
4. **Pré-résultat** — profil + emoji révélé, tension créée, capture email
5. **Résultat complet** — analyse détaillée affichée + email envoyé en arrière-plan

---

## Organisation des fichiers

```
quiz-cheval/
├── index.html                        # Quiz complet (UI + logique frontend)
├── netlify.toml                      # Config Netlify (publish, functions, headers)
├── netlify/functions/
│   └── quiz-proxy.js                 # Fonction serverless unique (/api/quiz)
├── .env                              # Variables locales (non committé)
├── .gitignore
└── VERSION.md                        # Ce fichier
```

---

## Comment ça fonctionne

### Frontend (index.html)
- 5 sections : Hero → Quiz → Loading → Pré-résultat → Résultat
- Après le quiz : appel `get_profile` → affichage pré-résultat avec email form
- Après saisie email : appels parallèles `save_result` + `send_email` → résultat complet

### Backend (netlify/functions/quiz-proxy.js)
Une seule fonction avec trois actions POST :

**`action: get_profile`**
1. Convertit les réponses en texte lisible
2. Envoie à Claude Haiku
3. Retourne `{ profil, emoji, sous_titre, pourcentage, description, conseil_cle, profil_secondaire }`

**`action: save_result`**
1. Insère dans Supabase `quiz_resultats` : email, réponses, profil, description IA, timestamp

**`action: send_email`**
1. Génère le contenu de l'email via Claude (diagnostic / pourquoi tu bloques / projection / micro-solution)
2. Envoie via Resend API

### Variables d'environnement requises
| Variable | Description |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | Clé anon Supabase |
| `AI_SECRET` | Clé API Anthropic (nommée ainsi car Netlify filtre `*_API_KEY`) |
| `RESEND_SECRET` | Clé API Resend (même raison) |
| `SENDER_EMAIL` | Adresse expéditeur (défaut : `onboarding@resend.dev` pour les tests) |

### Table Supabase
```sql
create table quiz_resultats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  email text,
  reponses jsonb not null,
  profil text,
  profil_secondaire text,
  description_ia text
);
```

---

## Lancer en local

```bash
cd C:\Users\ADH\quiz-cheval
netlify dev --port 8889
# → http://localhost:8889
```

## Déployer

Push sur `main` → Netlify redéploie automatiquement.

## Versions

| Tag | Description |
|---|---|
| `v1.0-stable` | Version initiale — quiz + profil IA, sans email |
| `v1.1-stable` | Ajout lead magnet — capture email + compte rendu par email |
