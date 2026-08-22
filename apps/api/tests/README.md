# Stratégie de tests — état actuel

## Environnement de développement de ce projet n'a pas d'accès à une vraie MongoDB

Ni `mongodb-memory-server` (télécharge un binaire `mongod` depuis
`fastdl.mongodb.org`, domaine non accessible), ni une instance MongoDB
locale n'étaient disponibles au moment où ces tests ont été écrits. C'est
une contrainte de l'environnement de développement, pas un choix.

## Ce que ces tests couvrent réellement

Tests **unitaires** de la logique métier des services, avec les modèles
Mongoose remplacés par un faux modèle en mémoire (`tests/helpers/fake-model.ts`)
qui réimplémente un sous-ensemble de l'API Mongoose (`create`, `findById`,
`findOne`, `find().sort().skip().limit()`, `findByIdAndUpdate`,
`findOneAndUpdate`, `updateMany`, `.save()`).

Couverture actuelle (41 tests, `apps/api/tests/`):
- **State machine transactionnelle** — chemin heureux complet, rejet des
  sauts d'état, rejet des usurpations de rôle (acheteur ne peut pas agir
  comme vendeur et inversement), états terminaux sans issue.
- **`SecureAccountAccessService`** — chiffrement/déchiffrement round-trip,
  refus de libération hors des états autorisés, refus après invalidation.
- **`AffiliateCommissionService`** — calcul sur `NET_ORDER_AMOUNT`,
  **anti-double-commission** (contrainte critique §31), blocage
  auto-parrainage, blocage affilié `BLOCKED`, réversion sur remboursement,
  non-réversion d'une commission déjà `PAID`.
- **`PromoCodeService`** — toutes les règles de validation (expiration,
  limite d'usage, montant minimum), calcul de réduction (%, montant fixe,
  plafond, jamais négatif).
- **`PaymentService.handleWebhook`** — **idempotence webhook** (le test le
  plus critique du système: un même `providerEventId` reçu deux fois ne
  fait progresser la transaction qu'une seule fois), progression
  `PAYMENT_PENDING → ESCROW_ACTIVE`, gestion des échecs de paiement,
  déclenchement conditionnel de la création de conversion affiliée.
- **`TransactionsService`** — gardes-fous à l'achat (auto-achat, jeu
  désactivé, annonce non publiée), autorisation stricte sur `deliver()`/
  `confirm()` (rejet si l'appelant n'est ni acheteur ni vendeur).

Plus des tests purs sans mock sur `packages/utils` (arrondi monétaire,
génération de référence/code, slugification) et `packages/config` (calcul
de commission plateforme, registre pays/devises).

## Ce que ces tests NE couvrent PAS

- **Aucune requête MongoDB réelle** n'est exercée — pas d'index unique
  réellement testé (l'idempotence webhook simule l'erreur de clé
  dupliquée via `simulateDuplicateKeyError()`, elle ne teste pas que
  l'index Mongo `providerEventId` existe et fonctionne réellement en base).
- **Aucun test HTTP end-to-end** (pas de `supertest` contre l'app Express
  montée) — les middlewares (auth, RBAC, rate limiting, validation Zod au
  niveau route) ne sont pas exercés par ces tests.
- **Aucun test du scénario end-to-end complet** demandé en §34 du cahier
  des charges affiliation (clic → retour 2 jours après → inscription →
  achat → conversion → disponibilité commission) — chaque maillon est
  testé isolément, pas la chaîne complète.
- **CinetPay réel non testé** — `parseWebhook`/`initiatePayment` sont
  mockés au niveau du provider, pas exercés contre leur vraie API/doc.

## Avant la mise en production

Ces tests unitaires sont un filet de sécurité contre les régressions sur la
logique métier — pas un remplacement de tests d'intégration. Avant la
production, il faut ajouter, dans cet ordre de priorité:

1. Tests d'intégration avec une vraie instance MongoDB (locale, Docker, ou
   Atlas de test) pour valider que les index uniques (`paymentReference`,
   `providerEventId`, `AffiliateConversion.transaction`) fonctionnent
   réellement en base, pas seulement dans le fake en mémoire.
2. Tests HTTP end-to-end (`supertest` contre `createApp()`) pour couvrir
   les middlewares et la validation au niveau route.
3. Test du scénario §34 (parcours affilié complet).
4. Tests contre le vrai environnement sandbox CinetPay dès leur
   documentation confirmée (voir `TODO` dans `cinetpay.provider.ts`).

## Lancer les tests

```bash
# Depuis la racine — build les packages partagés d'abord (requis, sinon
# vitest ne résout pas @gm/types, @gm/config etc. en ESM)
pnpm run test

# Ou package par package
pnpm --filter @gm/api test
pnpm --filter @gm/utils test
pnpm --filter @gm/config test
```
