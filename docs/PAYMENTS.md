# PAYMENTS.md — Architecture de paiement

## Prestataire : PayDunya

Le projet utilise **PayDunya** comme agrégateur de paiement, via leur API
**PAR (Paiement Avec Redirection)** et le SDK Node.js officiel (`paydunya`
sur npm). CinetPay avait été envisagé initialement mais exige un registre
de commerce — non disponible au moment du développement — d'où la bascule.

Opérateurs Mobile Money disponibles au Sénégal via PayDunya :
`orange-money-senegal`, `wave-senegal`, `free-money-senegal`,
`expresso-sn`, `wizall-senegal`, plus `card` (carte bancaire).

## Séquestre : purement logique, pas de blocage réel de fonds

**Ni PayDunya ni CinetPay ne proposent de mécanisme natif de séquestre.**
Quand une transaction passe en `ESCROW_ACTIVE`, ça signifie uniquement
"le paiement a été reçu par la plateforme", pas "les fonds sont gelés chez
le prestataire". Le payout vendeur (transfert réel de l'argent) est une
action distincte, non automatisée aujourd'hui (voir plus bas).

## Flux d'initiation

1. `TransactionsService.createFromListing` crée la transaction en base
   avec une `paymentReference` interne générée par la plateforme
   (`GM-XXXX-XXXXXX`, voir `packages/utils/src/reference.ts`).
2. `PaymentService.initiateForTransaction` appelle
   `PayDunyaProvider.initiatePayment`, qui crée une facture PayDunya
   (`CheckoutInvoice`) et y attache notre `paymentReference` via
   `addCustomData('internal_reference', ...)`.
3. **Point d'architecture important** : PayDunya ne permet pas de définir
   sa propre référence de transaction — c'est PayDunya qui génère son
   propre `token`. Notre `paymentReference` reste donc la clé primaire
   côté plateforme (utilisée pour tout l'historique et l'audit), tandis
   que le `token` PayDunya devient `providerTransactionId`, utile
   uniquement pour un appel de vérification active (`confirm()`).
4. Le client est redirigé vers `invoice.url` (la page de paiement
   PayDunya).

## Confirmation : IPN (Instant Payment Notification)

PayDunya notifie la plateforme via un **IPN** — une requête `POST` en
`application/x-www-form-urlencoded` (pas JSON) vers
`API_PUBLIC_URL + PAYDUNYA_IPN_PATH` (par défaut
`/api/v1/payments/paydunya/ipn`).

Format du payload (imbriqué, style PHP) :
```
data[status]=completed
data[hash]=<sha512 de votre master key>
data[invoice][token]=test_xxxxx
data[custom_data][internal_reference]=GM-XXXX-XXXXXX
```

Express parse ça avec `express.urlencoded({ extended: true })` (voir
`app.ts`), ce qui reconstruit correctement `req.body.data.invoice.token`
etc. grâce à la librairie `qs`.

### Vérification de sécurité

Le champ `data.hash` est le **SHA-512 de votre Master Key**, calculé côté
serveurs PayDunya. On le recalcule nous-mêmes et on compare — ça prouve
que l'appel vient bien de PayDunya (eux seuls connaissent votre clé pour
le hasher correctement). Voir `PayDunyaProvider.parseWebhook`.

**Ce n'est PAS une signature par message** (contrairement à un HMAC classique
avec un payload signé) — c'est un secret partagé statique. Si jamais ta
Master Key fuite, ce mécanisme de vérification est compromis. Garde-la
strictement hors du code source (variable d'environnement uniquement,
jamais commit).

### Idempotence

Chaque IPN génère un `providerEventId` = `${token}-${status}`, stocké dans
la collection `PaymentEvent` avec un index unique. Un même IPN reçu
plusieurs fois (retry réseau, replay) est détecté via l'erreur de clé
dupliquée MongoDB (code `11000`) et ignoré silencieusement — voir
`PaymentService.handleWebhook`.

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
section 9 pour la procédure complète d'obtention des clés PayDunya.

```
PAYDUNYA_MASTER_KEY
PAYDUNYA_PRIVATE_KEY
PAYDUNYA_PUBLIC_KEY
PAYDUNYA_TOKEN
PAYDUNYA_MODE          # "test" ou "live"
PAYDUNYA_IPN_PATH       # défaut: /api/v1/payments/paydunya/ipn
PAYDUNYA_STORE_NAME
```

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
