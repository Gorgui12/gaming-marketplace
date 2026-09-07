# PAYMENTS.md — Architecture de paiement

## Providers de paiement : PayDunya (dormant) et UnitechPay (actif)

Le système de paiement est **abstrait derrière une interface unique**
`PaymentProvider` (`apps/api/src/modules/payments/providers/`). Deux
implémentations existent et le provider actif se choisit **exclusivement**
via la variable `PAYMENT_PROVIDER` dans `.env` (`paydunya` ou `unitechpay`,
défaut `unitechpay`) — aucun autre code ne dépend du prestataire.

### UnitechPay (actif)

Agrégateur Mobile Money sénégalais (Wave branché sur
`action=create_wave_payment`). Identifie les transactions par **son
propre `transaction_id`**, stocké sur la transaction dans
`providerTransactionId` (champ déjà présent sur le modèle). Le webhook
référence donc la transaction par ce `transaction_id`, rapproché via la
recherche `$or` de `PaymentService.handleWebhook`.

### PayDunya (dormant)

Reste **pleinement fonctionnel et testé** via leur API **PAR (Paiement
Avec Redirection)** et le SDK Node.js officiel (`paydunya` sur npm).
Repasser `PAYMENT_PROVIDER=paydunya` dans `.env` le réactive à l'identique
(les 4 clés `PAYDUNYA_*` redeviennent alors obligatoires à l'arrêt de
l'API). CinetPay avait été envisagé initialement mais exige un registre de
commerce — non disponible au moment du développement — d'où la bascule.

Opérateurs Mobile Money disponibles au Sénégal via PayDunya :
`orange-money-senegal`, `wave-senegal`, `free-money-senegal`,
`expresso-sn`, `wizall-senegal`, plus `card` (carte bancaire).

## Bascule PayDunya ↔ UnitechPay

- **Le changement se fait uniquement via `PAYMENT_PROVIDER` dans `.env`**,
  plus aucun changement de code. `PayDunyaProvider` et
  `UnitechPayProvider` sont tous deux importés dans `payments.service.ts`,
  et c'est la variable qui choisit l'instance (`env.ts` valide en croisé
  les clés manquantes selon le provider).
- **PayDunya reste conservé en dormance** : route `/api/v1/payments/paydunya/ipn`
  inchangée, même vérification de hash, mêmes tests. Le retour à PayDunya
  se fait par la même variable d'environnement.
- **Différence d'architecture clé** :
  - PayDunya génère son propre `token` et ne permet pas de fournir notre
    référence — notre `paymentReference` (GM-XXXX) est attachée via
    `custom_data.internal_reference` et rapprochée sur cette valeur.
  - UnitechPay génère son propre `transaction_id` et le renvoie dans son
    webhook — c'est cette valeur (stockée dans `providerTransactionId`)
    qui sert de référence de rapprochement. `data.reference` du webhook
    n'est pas utilisé.
- **Point non documenté par UnitechPay** : `verifyTransaction` consulte
  `GET ?action=transactions` (liste complète) et filtre côté client, car
  la doc ne documente **aucun** endpoint de consultation d'une transaction
  précise. Les libellés exacts du `status` de cet endpoint ne sont pas
  listés non plus (mapping `pending/completed/failed/expired`). **À
  re-tester en sandbox réel avant la mise en production**, et à basculer
  vers un vrai endpoint/filtre par ID si l'API en expose un.

### Configuration du webhook côté UnitechPay

La configuration du webhook (`configure_webhook`) est **manuelle et non
automatisée dans le code** — l'ajouter au démarrage du serveur serait une
dépendance de boot trop fragile. Faire cet appel une seule fois, à la main
ou via un script ponctuel, en pointant vers :
`API_PUBLIC_URL + /api/v1/payments/unitechpay/webhook`.

## Séquestre : purement logique, pas de blocage réel de fonds

**Ni UnitechPay ni PayDunya ne proposent de mécanisme natif de séquestre.**
Quand une transaction passe en `ESCROW_ACTIVE`, ça signifie uniquement
"le paiement a été reçu par la plateforme", pas "les fonds sont gelés chez
le prestataire". Le payout vendeur (transfert réel de l'argent) est une
action distincte, non automatisée aujourd'hui (voir plus bas).

## Flux d'initiation

1. `TransactionsService.createFromListing` crée la transaction en base
   avec une `paymentReference` interne générée par la plateforme
   (`GM-XXXX-XXXXXX`, voir `packages/utils/src/reference.ts`).
2. `PaymentService.initiateForTransaction` appelle
   `provider.initiatePayment` (le provider actif), et stocke la référence
   retournée par le provider dans `providerTransactionId` :
   - PayDunya génère un `token` (et exige notre `paymentReference` attachée
     via `custom_data` pour le rapprochement IPN — cf. section "Bascule").
   - UnitechPay génère un `transaction_id`, utilisé tel quel pour le
     rapprochement webhook.
3. Le client est redirigé vers `paymentUrl` (la page de paiement du
   provider actif).

## Confirmation : webhook (IPN)

Chaque provider notifie la plateforme sur sa propre route (les deux
pointent vers le même contrôleur générique `handlePaymentWebhook` → 
`PaymentService.handleWebhook`) :
- **PayDunya** : `POST application/x-www-form-urlencoded` vers
  `API_PUBLIC_URL + PAYDUNYA_IPN_PATH` (défaut
  `/api/v1/payments/paydunya/ipn`).
- **UnitechPay** : webhook JSON vers
  `API_PUBLIC_URL + /api/v1/payments/unitechpay/webhook` (à configurer
  côté dashboard UnitechPay, voir section "Bascule").

Format du payload PayDunya (imbriqué, style PHP) :
```
data[status]=completed
data[hash]=<sha512 de votre master key>
data[invoice][token]=test_xxxxx
data[custom_data][internal_reference]=GM-XXXX-XXXXXX
```

Express parse ça avec `express.urlencoded({ extended: true })` (voir
`app.ts`), ce qui reconstruit correctement `req.body.data.invoice.token`
etc. grâce à la librairie `qs`.

Payload webhook UnitechPay (JSON) : `event`, `transaction_id`, `reference`,
`amount`, `status`, `method`, `commission`, `net_amount`, `timestamp`,
`signed_at`, `signature`.

### Vérification de sécurité

- **PayDunya** : le champ `data.hash` est le **SHA-512 de votre Master
  Key**, calculé côté serveurs PayDunya. On le recalcule nous-mêmes et on
  compare — ça prouve que l'appel vient bien de PayDunya (eux seuls
  connaissent votre clé pour le hasher correctement). Voir
  `PayDunyaProvider.parseWebhook`. **Ce n'est PAS une signature par
  message** (pas de HMAC sur un payload signé) — c'est un secret partagé
  statique. Si la Master Key fuite, le mécanisme est compromis.
- **UnitechPay** : **Méthode 2 (canonique)** de la doc — HMAC-SHA256 de la
  chaîne `event|reference|amount|status|signed_at` avec la clé API.
  Comparaison à temps constant (`crypto.timingSafeEqual`), plus robuste
  derrière un proxy/CDN (Railway) que la vérification par en-tête. Voir
  `UnitechPayProvider.parseWebhook`.

### Idempotence

Chaque webhook génère un `providerEventId` unique (`${token}-${status}`
pour PayDunya, `${transaction_id}-${event}` pour UnitechPay), stocké dans
la collection `PaymentEvent` avec un index unique, et la transaction est
retrouvée via la recherche `$or` (`paymentReference` OU
`providerTransactionId`). Un même webhook reçu plusieurs fois (retry
réseau, replay) est détecté via l'erreur de clé dupliquée MongoDB (code
`11000`) et ignoré silencieusement — voir `PaymentService.handleWebhook`.

## Ce qui n'est PAS automatisé

- **Payout vendeur** : après confirmation acheteur (`COMPLETED`), le
  virement réel vers le vendeur reste une action manuelle. PayDunya
  propose une API **PER (Paiement Et Redistribution)** qui pourrait
  automatiser ça — mais elle nécessite que le vendeur ait lui-même un
  compte PayDunya (`DirectPay.creditAccount(email_ou_numero, montant)`),
  ce qu'on ne peut pas supposer pour un vendeur particulier. À évaluer en
  Phase 5 si le volume le justifie.
- **Remboursement acheteur** : `TransactionsService.adminRefund` change le
  statut logique de la transaction et inverse la commission affiliée
  associée, mais ne déclenche aucun virement PayDunya réel. À faire
  manuellement, ou à automatiser après vérification du mécanisme de
  remboursement PayDunya avec leur support (`tech@paydunya.com`).

## Variables d'environnement requises

Voir `.env.example` à la racine et le guide `docs/GUIDE_DEMARRAGE_LOCAL.md`
section 9 pour la procédure complète d'obtention des clés.

```
PAYMENT_PROVIDER         # 'unitechpay' (défaut) | 'paydunya'

# UnitechPay — obligatoire quand PAYMENT_PROVIDER=unitechpay
UNITECHPAY_API_KEY
UNITECHPAY_BASE_URL      # défaut: https://api.unitech.sn/api.php

# PayDunya — obligatoires uniquement quand PAYMENT_PROVIDER=paydunya
PAYDUNYA_MASTER_KEY
PAYDUNYA_PRIVATE_KEY
PAYDUNYA_PUBLIC_KEY
PAYDUNYA_TOKEN
PAYDUNYA_MODE            # "test" ou "live"
PAYDUNYA_IPN_PATH        # défaut: /api/v1/payments/paydunya/ipn
PAYDUNYA_STORE_NAME
```

La validation croisée dans `config/env.ts` refuse de démarrer si le
provider choisi n'a pas ses secrets (`unitechpay` → `UNITECHPAY_API_KEY`,
`paydunya` → les 4 clés `PAYDUNYA_*`).

## Avant la mise en production

1. Passer `PAYDUNYA_MODE=live` et remplacer toutes les clés test par les
   clés production (dashboard PayDunya > Applications > Détails >
   Modifier la configuration > "Oui, l'application est prête").
2. Tester au moins un vrai paiement de bout en bout avec un petit montant
   avant d'ouvrir au public.
3. Vérifier avec le support PayDunya le mécanisme de remboursement exact
   pour chaque opérateur Mobile Money — ce n'est pas documenté de façon
   universelle dans leur doc générale.
4. S'assurer que `API_PUBLIC_URL` pointe vers une URL HTTPS publique
   stable (pas ngrok) pour que l'IPN soit fiable en production.
