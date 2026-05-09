# v1.2-stable — Quiz Profil Mental à Cheval

**Date** : 2026-05-09
**Statut** : fonctionnel en local (netlify dev) et prêt pour déploiement Netlify

## Nouveautés par rapport à v1.1

- Écran pré-résultat enrichi : sous-titre personnalisé, social proof (% des cavalières), aperçu teasé de la description avec fondu
- Capture du prénom en plus de l'email (sauvegardé en base, utilisé dans l'email)
- Email personnalisé avec le prénom : objet, header et contenu IA adaptés
- Mention RGPD sur l'écran de capture (inscription newsletter, droit de désinscription)
- Fix : erreurs Resend silencieuses — la réponse HTTP est désormais vérifiée et affichée

---

## Ce que fait cette version

Quiz qui détermine le profil mental d'un cavalier parmi 5 profils :
- Le Survivant (peur / trauma / hypervigilance)
- Le Contrôlant (surcontrôle / crispation)
- Le Perfectionniste (auto-critique / pression)
- L'Hypermental (surcharge mentale / trop penser)
- Le Mental Stable (profil rassurant / équilibré)

L'IA (Claude Haiku via API Anthropic) lit les réponses en langage naturel et détermine le profil de façon qualitative, sans scoring algorithmique. Le résultat est affiché sur place et envoyé par email personnalisé via Resend.

---

## Flow utilisateur

1. **Hero** — accroche, bouton démarrer
2. **Quiz** — questions dynamiques (depuis Supabase ou défaut), navigation fluide
3. **Loading** — analyse IA en cours
4. **Pré-résultat** — profil + emoji + sous-titre + aperçu description teasée, capture email + prénom
5. **Résultat complet** — analyse détaillée affichée + email personnalisé envoyé

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
- Après le quiz : appel `get_profile` → affichage pré-résultat avec teaser + form email/prénom
- Après saisie : appels parallèles `save_result` + `send_email` → résultat complet affiché

### Backend (netlify/functions/quiz-proxy.js)
Une seule fonction avec actions POST :

**`action: get_active_quiz`**
Charge le modèle actif et ses questions depuis Supabase.

**`action: get_profile`**
1. Convertit les réponses en texte lisible
2. Envoie à Claude Haiku
3. Retourne `{ profil, emoji, sous_titre, pourcentage, description, conseil_cle, profil_secondaire }`

**`action: save_result`**
Insère dans Supabase `quiz_resultats` : email, prénom, réponses, profil, description IA, timestamp.

**`action: send_email`**
1. Génère le contenu personnalisé via Claude (diagnostic / pourquoi tu bloques / projection / micro-solution)
2. Envoie via Resend API avec objet et contenu incluant le prénom

### Variables d'environnement requises
| Variable | Description |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | Clé anon Supabase |
| `AI_SECRET` | Clé API Anthropic |
| `RESEND_SECRET` | Clé API Resend |
| `SENDER_EMAIL` | Adresse expéditeur vérifiée dans Resend |

### Table Supabase
```sql
create table quiz_resultats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  email text,
  prenom text,
  reponses jsonb not null,
  profil text,
  profil_secondaire text,
  description_ia text
);
```

---

## Lancer en local

```bash
cd C:\Users\ADH\BLOG-SEO\quiz-cheval
netlify dev --port 8889
# → http://localhost:8889
```

## Déployer

Push sur `main` → Netlify redéploie automatiquement.

## Versions

| Tag | Description |
|---|---|
| `v1.0-stable` | Version initiale — quiz + profil IA, sans email |
| `v1.1-stable` | Lead magnet — capture email + compte rendu par email |
| `v1.2-stable` | Prénom, teaser enrichi, RGPD, fix erreur Resend silencieuse |
