# Guide de démarrage local — Gaming Marketplace

Ce guide t'emmène de "j'ai le zip" à "les 3 apps tournent en local et je peux tester le parcours complet". Suis les étapes dans l'ordre — chaque section dépend de la précédente.

---

## 0. Vue d'ensemble

Le projet est un monorepo pnpm avec 3 applications et 5 packages partagés :

```
apps/
  api/      → Express + MongoDB, port 4000  (le cœur : auth, escrow, paiement, affiliation)
  web/      → Next.js, port 3000            (marketplace publique + dashboards)
  admin/    → Next.js, port 3002            (back-office : affiliés, codes promo, payouts)
packages/
  types, config, validation, utils, ui → partagés par les 3 apps
```

**Règle d'or à retenir** : les packages partagés doivent être **buildés** (`pnpm run build`) avant que `api`, `web` ou `admin` ne puissent démarrer, sinon tu auras des erreurs `Cannot find module '@gm/types'`. Ce n'est pas une option, c'est obligatoire à chaque fois que tu modifies un fichier dans `packages/*`.

---

## 1. Prérequis

Installe ces outils avant de commencer.

### Node.js 20+
Vérifie ta version :
```powershell
node -v
```
Si tu as moins que `v20`, télécharge la dernière version LTS sur [nodejs.org](https://nodejs.org).

### pnpm
```powershell
npm install -g pnpm
pnpm -v
```

### MongoDB — choisis UNE des 3 options

**Option A — MongoDB Atlas (le plus simple, gratuit, recommandé pour démarrer)**
1. Crée un compte sur [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Crée un cluster gratuit (M0)
3. Dans "Database Access", crée un utilisateur avec mot de passe
4. Dans "Network Access", autorise ton IP (ou `0.0.0.0/0` pour du dev local, jamais en prod)
5. Récupère la chaîne de connexion (`Connect` → `Drivers`), elle ressemble à :
   ```
   mongodb+srv://monuser:monpassword@cluster0.xxxxx.mongodb.net/gaming-marketplace-dev
   ```
   Garde cette chaîne, tu en auras besoin à l'étape 3.

**Option B — MongoDB local sur Windows**
1. Télécharge MongoDB Community Server : [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)
2. Installe-le en tant que service Windows (l'installeur propose cette option par défaut)
3. Il tourne automatiquement sur `mongodb://localhost:27017`
4. Vérifie qu'il tourne : ouvre les Services Windows (`services.msc`) et cherche "MongoDB"

**Option C — Docker (si tu l'as déjà)**
```powershell
docker run -d -p 27017:27017 --name gm-mongo mongo:7
```

---

## 2. Extraire et installer le projet

```powershell
# Dézippe le projet, puis place-toi dedans
cd gaming-marketplace

# Installe TOUTES les dépendances de TOUTES les apps/packages en une fois
pnpm install
```

Ça peut prendre 1-2 minutes la première fois.

---

## 3. Configurer les variables d'environnement

Chaque app a besoin de son propre fichier d'environnement. Un fichier `.env.example` existe déjà à la racine avec la liste complète — copie-le et adapte-le.

### 3.1 — `apps/api/.env` (le plus important)

Crée le fichier `apps/api/.env` :

```env
NODE_ENV=development
API_PORT=4000
API_PUBLIC_URL=http://localhost:4000

# Colle ici ta chaîne de connexion MongoDB (Atlas ou locale)
MONGODB_URI=mongodb://localhost:27017/gaming-marketplace-dev

# Génère une chaîne aléatoire d'au moins 32 caractères (voir commande plus bas)
SESSION_SECRET=change-moi-avec-une-vraie-chaine-aleatoire-de-32-caracteres-minimum
SESSION_COOKIE_NAME=gm_session
SESSION_TTL_DAYS=7

# CinetPay — tant que tu n'as pas de vrai compte sandbox PayDunya, mets des
# valeurs factices : l'API démarre quand même (ces champs sont juste
# "obligatoires mais non vérifiés" au démarrage), mais le VRAI paiement ne
# fonctionnera pas tant que ce ne sont pas de vraies clés. Voir section 9.
PAYDUNYA_MASTER_KEY=placeholder
PAYDUNYA_PRIVATE_KEY=placeholder
PAYDUNYA_PUBLIC_KEY=placeholder
PAYDUNYA_TOKEN=placeholder
PAYDUNYA_MODE=test
PAYDUNYA_IPN_PATH=/api/v1/payments/paydunya/ipn
PAYDUNYA_STORE_NAME="Gaming Market"

STORAGE_PROVIDER=cloudinary

CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# Génère aussi une chaîne d'au moins 32 caractères, différente de SESSION_SECRET
ACCOUNT_CREDENTIALS_ENCRYPTION_KEY=change-moi-aussi-32-caracteres-minimum-different
```

**Pour générer une chaîne aléatoire de 32+ caractères**, ouvre PowerShell :
```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```
Fais-le deux fois (une pour `SESSION_SECRET`, une pour `ACCOUNT_CREDENTIALS_ENCRYPTION_KEY`), ce sont deux secrets différents.

### 3.2 — `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3.3 — `apps/admin/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## 4. Builder les packages partagés

**Cette étape est obligatoire avant le tout premier démarrage**, et à refaire à chaque fois que tu modifies un fichier dans `packages/*` :

```powershell
pnpm --filter="./packages/*" build
```

Tu dois voir `Done` pour chacun des 5 packages (`types`, `config`, `validation`, `utils`, `ui`) sans erreur.

---

## 5. Lancer les 3 apps

Ouvre **3 fenêtres PowerShell séparées** (une par app) — elles doivent tourner en même temps.

**Terminal 1 — API**
```powershell
pnpm --filter @gm/api dev
```
Tu dois voir `API démarrée sur le port 4000 (development)`. Si tu vois une erreur `Variables d'environnement invalides ou manquantes`, relis la section 3.1 — un champ obligatoire manque dans `apps/api/.env`.

**Terminal 2 — Web (marketplace publique)**
```powershell
pnpm --filter @gm/web dev
```
Ouvre [http://localhost:3000](http://localhost:3000)

**Terminal 3 — Admin**
```powershell
pnpm --filter @gm/admin dev
```
Ouvre [http://localhost:3002](http://localhost:3002)

---

## 6. Créer les données de départ (seed)

Avec MongoDB connecté et l'API lancée, dans un **4ème terminal** :

```powershell
pnpm --filter @gm/api seed
```

Ça crée :
- Le jeu `eFootball` en base (mais **désactivé commercialement** par défaut — `marketplaceEnabled: false`, voir section 7, c'est volontaire pour la conformité CGU Konami)
- Un compte admin de développement : `admin@dev.local` / `ChangeMe123!` — **change ce mot de passe avant toute mise en production**

---

## 7. Activer eFootball pour pouvoir tester les achats

Par sécurité (voir `docs` du projet sur la conformité CGU Konami), **aucun jeu n'est activé commercialement par défaut**. Sans ça, tu ne pourras ni créer d'annonce ni acheter.

**C'est maintenant possible directement depuis l'interface admin** (plus besoin de MongoDB Compass) :

1. Connecte-toi sur [http://localhost:3002/login](http://localhost:3002/login)
2. Va sur la page **Jeux** (premier lien du menu)
3. Clique sur le bouton **"Désactivée"** en face d'eFootball pour basculer `marketplaceEnabled` sur `true`
4. Tu peux aussi y créer de nouveaux jeux et gérer leur `termsStatus` (CGU)

---

## 8. Tester le parcours complet

1. Va sur [http://localhost:3000/register](http://localhost:3000/register), crée un compte acheteur/vendeur
2. Connecte-toi sur [http://localhost:3002/login](http://localhost:3002/login) avec `admin@dev.local` / `ChangeMe123!` pour accéder au back-office admin
3. Active eFootball (section 7 ci-dessus)
4. Depuis ton compte web, va sur [](http://http://localhost:3000/dashboard/seller/listings/new localhost:3000/dashboard/seller/listings/new) et crée une annonce — elle part en `PENDING_REVIEW`
5. Retourne dans l'admin, page **Annonces**, et clique **Approuver** — elle passe en `PUBLISHED`
6. Elle apparaît maintenant sur [http://localhost:3000/marketplace/efootball](http://localhost:3000/marketplace/efootball)
7. Le bouton "Acheter" redirige vers PayDunya — **ça échouera avec de fausses clés** (section 3.1), c'est normal tant que tu n'as pas de vrai compte PayDunya sandbox (section 9)
8. Le programme d'affiliation, lui, est testable de bout en bout sans PayDunya : va sur `/affiliate`, candidate, approuve-toi depuis l'admin (`/affiliates`), puis va sur `/dashboard/affiliate` pour voir ton lien et ton code

---

## 9. PayDunya — pour que les paiements réels fonctionnent

Le projet utilise **PayDunya** (bascule depuis CinetPay, qui exigeait un registre de commerce non disponible) via leur API **PAR (Paiement Avec Redirection)** et le SDK Node.js officiel.

1. Crée un compte sur [paydunya.com](https://paydunya.com) — compte PayDunya Business
2. Connecte-toi, clique sur **"Intégrez notre API"** dans le menu de gauche
3. Clique sur **"Configurer une nouvelle application"**, choisis **MODE TEST**
4. Ouvre les détails de l'application créée pour récupérer tes 4 clés : `Master Key`, `Private Key`, `Public Key`, `Token`
5. Remplace les valeurs `placeholder` dans `apps/api/.env` :
   ```env
   PAYDUNYA_MASTER_KEY=ta-vraie-master-key
   PAYDUNYA_PRIVATE_KEY=ta-vraie-private-key
   PAYDUNYA_PUBLIC_KEY=ta-vraie-public-key
   PAYDUNYA_TOKEN=ton-vrai-token
   PAYDUNYA_MODE=test
   ```
6. Crée un **compte client fictif** (onglet "Clients fictifs") pour simuler des paiements de test sans vrai argent
7. Pour recevoir les notifications de paiement (IPN) en local, tu as besoin d'une URL publique — utilise [ngrok](https://ngrok.com) :
   ```powershell
   ngrok http 4000
   ```
   Puis mets à jour `API_PUBLIC_URL` dans `apps/api/.env` avec l'URL ngrok (ex: `https://xxxx.ngrok-free.app`)

**Opérateurs Mobile Money disponibles au Sénégal via PayDunya** : `orange-money-senegal`, `wave-senegal`, `free-money-senegal`, `expresso-sn`, `wizall-senegal`, plus `card` (carte bancaire).

---

## 10. Lancer les tests

```powershell
# Depuis la racine — build les packages avant de tester (obligatoire)
pnpm run test
```

Tu dois voir `62 passed` au total (41 côté API, 21 côté packages partagés). Ces tests n'utilisent PAS une vraie MongoDB (voir `apps/api/tests/README.md` pour le détail de ce qu'ils couvrent et ne couvrent pas).

---

## 11. Build de production (pour vérifier que tout compile avant de déployer)

```powershell
pnpm run build
```

Doit se terminer sans erreur pour les 5 packages + les 3 apps.

---

## 12. Résumé des ports et URLs

| App | Commande dev | URL |
|---|---|---|
| API | `pnpm --filter @gm/api dev` | http://localhost:4000 |
| Web (marketplace) | `pnpm --filter @gm/web dev` | http://localhost:3000 |
| Admin | `pnpm --filter @gm/admin dev` | http://localhost:3002 |

---

## 13. Dépannage — erreurs fréquentes

**`Cannot find module '@gm/types'` (ou tout autre `@gm/*`)**
→ Tu as sauté l'étape 4. Lance `pnpm --filter="./packages/*" build`.

**`Variables d'environnement invalides ou manquantes` au démarrage de l'API**
→ Un champ obligatoire manque dans `apps/api/.env`. Le message liste précisément lequel — relis la section 3.1.

**`ECONNREFUSED` ou timeout MongoDB**
→ Vérifie que MongoDB tourne (service Windows démarré, conteneur Docker actif, ou cluster Atlas accessible) et que `MONGODB_URI` est correcte.

**Le frontend n'arrive pas à parler à l'API (erreurs CORS dans la console navigateur)**
→ Vérifie que `CORS_ALLOWED_ORIGINS` dans `apps/api/.env` contient bien `http://localhost:3000,http://localhost:3002` (les deux, séparés par une virgule, sans espace).

**Je me connecte sur le web mais je ne suis pas reconnu comme connecté**
→ Le cookie de session est `httpOnly` et lié au domaine de l'API. En local avec des ports différents (3000/3002 vs 4000), ça fonctionne grâce à `credentials: 'include'` déjà câblé dans le client — assure-toi juste que `CORS_ALLOWED_ORIGINS` est bien configuré (point précédent).

**Après avoir modifié un fichier dans `apps/api/src`, rien ne change**
→ Le mode dev (`tsx watch`) recharge automatiquement. Si ça ne suffit pas, arrête (Ctrl+C) et relance `pnpm --filter @gm/api dev`.

**`pnpm install` échoue ou est très lent**
→ Vérifie ta connexion, puis réessaie. En dernier recours : `pnpm install --force`.

---

## 14. Ce qui n'est PAS encore fait (pour ne pas être surpris)

- Pas d'upload d'image intégré pour les annonces — colle une URL d'image déjà hébergée en attendant l'intégration Cloudinary
- Pas de page listant toutes tes annonces avec filtres avancés côté admin (seulement les annonces en attente de modération sur `/listings`)
- L'intégration PayDunya utilise leur vrai SDK et leur vraie documentation Node.js, mais n'a jamais été testée contre un vrai paiement réel — teste avec un compte fictif PayDunya avant toute mise en production (section 9)
- Documentation technique complète (`ARCHITECTURE.md`, `SECURITY.md`, `DATABASE.md`, `DEPLOYMENT.md`) — seul `PAYMENTS.md` existe pour l'instant
- Pas de tests d'intégration contre une vraie MongoDB (seulement des mocks — voir `apps/api/tests/README.md`)
- Pas de payout vendeur automatisé — le transfert réel de l'argent au vendeur après une vente reste une action manuelle à faire toi-même (voir docs/PAYMENTS.md pour la piste PayDunya PER)

Si un point bloque, dis-le moi et on le débloque en priorité.
