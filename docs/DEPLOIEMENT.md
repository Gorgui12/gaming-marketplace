# Déploiement de l'API

Cible de production : **Render** (plan gratuit, sans carte bancaire).

Instance `free` : 0,1 CPU / 512 Mo de RAM, région Frankfurt, domaine
`https://<service>.onrender.com`.

> **Pourquoi pas les autres ?** Tous les autres hébergeurs compatibles avec ce
> projet exigent une carte bancaire, ce qui bloque le déploiement :
>
> - **Fly.io** — l'allowance gratuite est conditionnée à une carte enregistrée sur
>   le compte. Sans carte valide, le compte ne peut ni déployer ni démarrer une
>   machine : le proxy edge accepte le TCP puis coupe, d'où un handshake TLS
>   avorté sur `:443` et un `502 ROUTER_EXTERNAL_TARGET_HANDSHAKE_ERROR` du côté
>   Vercel. Le message d'erreur ne mentionne ni la carte ni le compte : c'est ce
>   qui rend le diagnostic trompeur.
> - **Koyeb** — l'offre gratuite a été fermée aux nouveaux comptes après le
>   rachat par Mistral AI (février 2026). La page tarifaire ne propose plus que
>   Pro / Scale / Enterprise, et la création de Web Service est redirigée vers un
>   plan payant. La FAQ du site mentionne encore l'Instance gratuite : elle est
>   périmée.
> - **Railway** — même refus de carte que Fly.
>
> `fly.toml` est conservé : il documente la sonde, la région et le découpage
> env/secrets. Il n'est pas utilisé. Il redeviendra valide le jour où une carte
> passe sur le compte Fly.

## 1. Prérequis

- Le code poussé sur la branche de production (le build Render part du dépôt).
- Les secrets copiés depuis `apps/api/.env` (voir §4).
- Noter l'URL finale `https://<service>.onrender.com` : elle revient dans
  `API_PUBLIC_URL` et `API_URL`.

## 2. Création du service

Dans le dashboard Render, créer un **Web Service** depuis le dépôt GitHub :

| Réglage            | Valeur                                          |
| ------------------ | ----------------------------------------------- |
| Runtime            | **Node**                                        |
| Root Directory     | racine du monorepo **obligatoirement**           |
| Build Command      | voir §2.1                                        |
| Start Command      | `node apps/api/dist/server.js`                   |
| Instance Type      | `free` (0,1 CPU / 512 Mo)                        |
| Region             | Frankfurt                                        |
| Health Check Path  | `/health`                                       |

Runtime `Node`, pas `Docker` : le `Dockerfile` reste dans le dépôt pour un
déploiement conteneur (Fly, ou un futur hébergeur) mais n'est pas utilisé ici.

### 2.1 Build Command

```
pnpm install --frozen-lockfile --filter "@gm/api..." && pnpm --filter @gm/types --filter @gm/config --filter @gm/validation --filter @gm/utils build && pnpm --filter @gm/api build
```

Trois parties, et l'ordre compte :

1. `pnpm install --filter "@gm/api..."` installe l'API **et ses dépendances de
   workspace** (`@gm/types`, `@gm/config`, `@gm/validation`, `@gm/utils`), sans
   installer Next.js pour `apps/web` et `apps/admin`. Le `...` final est ce qui
   sélectionne l'arbre complet.
2. Les quatre `build` de paquets : leur `package.json` pointe `main` sur
   `./dist/index.js`, donc **ils doivent être compilés avant l'API**, sinon `tsc`
   ne résout pas leurs pointages et l'API démarre sur un import cassé.
   `@gm/ui` est volontairement exclu : l'API n'en dépend pas.
3. `pnpm --filter @gm/api build` compile enfin l'API.

> Si Render lance lui-même `pnpm install` avant votre Build Command, le second
> `install` est un no-op coûteux mais sans conséquence. Vous pouvez le retirer si
> le build semble les doublonner.

### 2.2 Ce que le code gère déjà

Quatre points à ne pas « corriger » :

- Le port d'écoute vient de `PORT` (`server.ts:17`), pas de `API_PORT`. C'est ce
  que la plateforme injecte (Render : 10000 par défaut). Le `Dockerfile` ne fige
  volontairement pas `PORT`, et en mode natif il n'est de toute façon pas lu.
- L'écoute se fait sur `0.0.0.0` (`server.ts:21`). Sur `127.0.0.1` l'API est
  injoignable depuis l'extérieur, sans erreur dans les logs.
- `trust proxy` vaut 1 (`app.ts:40`), soit le proxy Render. Sans cela tous les
  clients partagent l'IP du proxy et tombent dans un seul bucket de rate limit.
- `NODE_ENV=production` est indispensable : il pilote les cookies de session
  (`secure: true`, `sameSite: 'none'`).

`/health` est déclarée **avant** le rate limiter global (`app.ts:64`) : la sonde
de la plateforme ne consomme pas le quota des utilisateurs et ne peut pas être
tuée par lui.

### 2.3 Seule vraie fragilité : argon2

`argon2` est un module natif. En build natif, soit un binaire précompilé pour
linux-x64 est téléchargé, soit il est compilé depuis les sources — Render fournit
la chaîne de compilation pendant le build. Si le build échoue sur ce point, le
message contient `node-gyp` ou `prebuild-install`, et c'est le seul obstacle
prévu ici. Le `Dockerfile` multi-stage reste le plan B s'il se pose.


## 3. Variables d'environnement (non secrètes)

À poser dans les réglages du service. `API_PUBLIC_URL` est le **seul** champ à
adapter à l'URL Render choisie ; le reste reprend les valeurs de `fly.toml`.

```
NODE_ENV=production
NODE_VERSION=22
API_PORT=4000
API_PUBLIC_URL=https://<service>.onrender.com
APP_URL=https://gamingmarket.store
SESSION_COOKIE_NAME=gm_session
SESSION_TTL_DAYS=7
PAYMENT_PROVIDER=unitechpay
UNITECHPAY_BASE_URL=https://api.unitech.sn/api.php
STORAGE_PROVIDER=cloudinary
CORS_ALLOWED_ORIGINS=https://gamingmarket.store,https://admin.gamingmarket.store
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
RESEND_FROM=Gaming Marketplace <noreply@gamingmarket.store>
RESEND_REPLY_TO=support@gamingmarket.store
EMAIL_SUPPORT_ADDRESS=support@gamingmarket.store
GOOGLE_CLIENT_ID=931697051716-3h1m5velt5e7kev2n5srdpfonvuhc1ja.apps.googleusercontent.com
TRUST_PROXY_HOPS=2
NODE_OPTIONS=--max-old-space-size=384
```

Quatre de ces variables ne sont pas décoratives :

- `NODE_ENV=production` pilote les cookies de session : `secure: true` et
  `sameSite: 'none'` (`auth.controller.ts:15-21`). Sans lui les cookies partent en
  `lax` et la connexion échoue.
- `NODE_VERSION=22` épingle la version de Node. Le `engines` du `package.json`
  racine dit `>=20`, ce qui laisse Render choisir — argon2 et mongoose 8 sont
  validés sur 22, autant le fixer.
- `CORS_ALLOWED_ORIGINS` doit contenir l'origine exacte de l'admin, qui appelle
  l'API en cross-origin depuis le navigateur.
- `NODE_OPTIONS` bride le heap V8 sous la limite de 512 Mo du conteneur. À
  retirer si les logs ne montrent aucun `JavaScript heap out of memory`.

### 3.1 TRUST_PROXY_HOPS : à ne pas oublier

**2 sur Render, 1 sur Fly.io, 0 en local.** Le nombre de proxies devant l'API
dépend de l'hébergeur, et une valeur fausse dégrade deux choses en silence :

- **Rate limit** — les clients dont les requêtes traversent le même proxy de bord
  partagent un bucket. Sur l'instance gratuite, cela réduit la protection contre
  le brute-force.
- **Anti-fraude affiliés** — `affiliates.controller.ts:43` hache `req.ip` pour
  détecter un débit de clics anormal depuis une même origine. Si `req.ip` vaut
  l'IP de Cloudflare, tous les visiteurs du monde sont vus comme une seule
  origine : la détection ne peut plus rien distinguer.

Le cas Render vaut 2, et c'est vérifiable dans les logs. Render place l'instance
derrière Cloudflare, d'où trois entrées :

```
x-forwarded-for: <IP client>, <IP Cloudflare>, <IP proxy Render>
```

À `0` ou `1`, `req.ip` s'arrête à l'IP Cloudflare au lieu du client. Pour
vérifier après avoir posé la variable : dans les logs Render, `remoteAddress` reste
`127.0.0.1` (c'est normal, le proxy est local), mais le `req.ip` exploité par le
rate limiter doit correspondre à l'IP du visiteur.

### 3.2 Email : délivrabilité (SPF / DKIM / DMARC)

Les emails ne partent que par l'API HTTP de Resend (`email.service.ts`), aucun port
SMTP n'est ouvert. Trois éléments conditionnent la délivrabilité, et **les deux
premiers se règlent chez Resend et chez le registrar, pas dans le code**.

**1. Le domaine doit être vérifié dans Resend.** Dashboard Resend → *Domains* →
*Add Domain* → `gamingmarket.store`. Resend n'affiche `verified` que lorsque ses
records sont posés **et** détectés. Sans cela, aucun envoi n'aboutit.

**2. Les records DNS doivent être posés chez le registrar** (LWS Hosting, ou
l'hébergeur du site). Resend en fournit trois ; tous doivent exister :

| Type | Nom | Valeur |
| --- | --- | --- |
| TXT | `resend._domainkey` | la clé publique affichée par Resend |
| CNAME | `send` | `send.forge.rmta.net` |
| CNAME | `rsend` | `rsend-euw1.forge.rmta.net` |

`send` et `rsend` pointent vers la région du compte : **eu-west-1** pour
l'Europe. Les copier depuis le dashboard plutôt que de les deviner.

En complément, à la racine du domaine :

| Type | Nom | Valeur |
| --- | --- | --- |
| TXT | `@` | `v=spf1 include:amazonses.com ~all` |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarcreports@gamingmarket.store; sp=quarantine` |

L'enregistrement SPF est **unique** : s'il en existe déjà un (le domaine a une
boîte mail chez LWS), le fusionner, sinon l'alignement DMARC échoue. Un SPF à
`-all` est correct et plus strict que `~all` — le laisser.

Deux points de vigilance sur `_dmarc` :

- `rua=mailto:dmarcreports@…` n'est exploitable que si la boîte
  `dmarcreports@gamingmarket.store` **existe** (MX → `mail.gamingmarket.store`).
  Sinon les rapports partent en bounce.
- Une fois DMARC en place et les rapportsconsultés, passer de `p=quarantine` à
  `p=reject` : c'est ce qui verrouille l'alignement.

**3. Côté code**, ce qui a été fait et ne doit pas être annulé
(`apps/api/src/lib/email/`) :

- **Chaque email part en `multipart/alternative` avec une partie texte**
  (`htmlToText()`). Un email HTML-only est la première cause de mise en
  indésirables sur iPhone : le filtre d'iCloud Mail le traite comme du phishing
  alors que Gmail le tolère.
- **Thème clair, pas de fond marine.** Fond sombre + bandeau doré + un unique
  bouton pilule est la structure exacte des mails de hameçonnage, et c'est ce
  que le classifieur de contenu d'Apple reconnaissait.
- **`Reply-To` systématique** (`RESEND_REPLY_TO`) et emails en `text/html`
  **et** `text/plain`.
- Contrat de code : un échec d'envoi remonte (`email.service.ts` ne l'avale
  plus) et chaque email porte un `tag` de catégorie, ce qui permet de filtrer
  les envois par type dans le dashboard Resend.

Pas de `List-Unsubscribe` ici : tous nos emails sont transactionnels
(confirmation, paiement, modération) et l'option s'y opposerait à une
désinscription qui casserait le parcours. L'en-tête est réservé au cas où une
campagne commerciale serait ajoutée.

## 4. Secrets

À poser dans les réglages du service, **jamais** dans un fichier versionné :

```
MONGODB_URI                        identifiants MongoDB Atlas
SESSION_SECRET                     >= 32 caractères
ACCOUNT_CREDENTIALS_ENCRYPTION_KEY  >= 32 caractères, différent du précédent
RESEND_API_KEY
UNITECHPAY_API_KEY
STORAGE_API_KEY
STORAGE_API_SECRET
STORAGE_CLOUD_NAME
```

Ils sont tous présents dans `apps/api/.env` en local. `apps/api/.env` est exclu du
contexte de build par `.dockerignore` : sans cela ces identifiants finiraient
dans une couche d'image.

## 5. Rebrancher les frontends

Les deux frontends sont sur Vercel et ne changent pas de plateforme. Seul
l'URL cible change, dans les projets Vercel concernés :

- **apps/web** — variable `API_URL` (serveur uniquement, jamais exposée au
  navigateur). C'est elle qu'utilisent le proxy `/backend/*` (`next.config.ts:29`)
  et l'`api-client.ts`. Le navigateur ne voit que l'origine du site, ce qui garde
  le cookie de session first-party — nécessaire pour Safari iOS.
- **apps/admin** — variable `NEXT_PUBLIC_API_URL`, à ajouter à
  `CORS_ALLOWED_ORIGINS` côté API.

Redéployer les deux projets Vercel après avoir changé la variable.

## 6. Migrer l'URL de webhook du prestataire de paiement

**Étape obligatoire, facile à oublier.** Tant que le prestataire pointe encore
vers l'ancien domaine, les paiements sont créés mais aucune confirmation
n'arrive, et les annonces restent bloquées en `PAYMENT_PENDING`.

Le chemin **diffère selon le provider actif**, et c'est une piège :

- `PAYMENT_PROVIDER=unitechpay` — l'URL de webhook **n'est pas envoyée à
  UnitechPay** lors de la création du paiement. `unitechpay.provider.ts:97-106`
  ne transmet que `callback_success` et `callback_cancel` (les URL de retour
  navigateur), jamais `notifyUrl`. L'IPN doit donc être reconfigurée **chez
  UnitechPay**, via un appel unique de l'action `configure_webhook` pointant
  vers `https://<service>.onrender.com/api/v1/payments/unitechpay/webhook`.
  Voir `docs/PAYMENTS.md` §« Configuration du webhook côté UnitechPay ».
  Concrètement : `API_PUBLIC_URL` n'intervient pas dans ce chemin.
- `PAYMENT_PROVIDER=paydunya` — là, `API_PUBLIC_URL` est bien utilisé : il
  compose le `callbackURL` envoyé au prestataire à chaque initiation
  (`payments.service.ts:66` et `paydunya.provider.ts:90`).

`API_PUBLIC_URL` reste à maintenir exact dans tous les cas : c'est lui qui
servira le jour où le provider basculera sur PayDunya, et c'est la seule
référence de l'URL publique côté API.


## 7. Garder le service éveillé

**Le point le plus important du plan gratuit.** Une Instance `free` Render
s'endort après 15 minutes d'inactivité, et le redémarrage prend 30 à 60 secondes.

Conséquence sur les **webhooks de paiement** : un service endormi qui reçoit la
notification d'un paiement peut ne pas répondre à temps. Selon le délai
imposé par le prestataire, la notification est perdue et la transaction reste
bloquée en `PAYMENT_PENDING` — c'est précisément le scénario que le commit
`0e15602` avait corrigé à la main.

La parade est un rappel externe sur `/health` toutes les 5 à 10 minutes, qui
maintient le conteneur chaud. Deux options gratuites, sans carte :

- **UptimeRobot** — moniteur HTTP sur `/health`, intervalle de 5 min. Offre le
  plus simple, et sert en plus d'alerte de panne.
- **cron-job.org** — un cron toutes les 10 min sur `/health`.

Le cron de Vercel ne convient pas ici : le plan Hobby est limité à une
exécution par jour, ce qui est très en dessous du délai d'endormissement.

Tant que le service dort, le balayage des paiements abandonnés (`server.ts:51`,
toutes les 5 min) ne tourne pas. Ce n'est pas grave en soi — un service qui dort
n'a pas d'utilisateur, donc pas de paiement abandonné en cours — mais cela rend le
rappel externe encore plus utile.

## 8. Vérification

```bash
curl -i https://<service>.onrender.com/health          # 200 {"success":true,...}
curl -i https://gamingmarket.store/backend/health      # 200, le proxy Vercel suit
```

Puis, dans le navigateur : inscription puis connexion. Si le cookie `gm_session`
n'apparaît pas dans les DevTools, c'est `NODE_ENV` ou `CORS_ALLOWED_ORIGINS`.

## 9. Autres limites du plan gratuit

- **750 heures d'instance par mois et par workspace.** Une instance toujours
  chaude en consomme ~720 : la marge est mince, une seconde instance ferait
  basculer le service en pause jusqu'au mois suivant.
- **Pas de cron ni de background worker** sur le gratuit. Le balayage est fait
  dans le process via `setInterval`, ce qui suffit ici.
- **Pas de disque persistant.** L'API est sans état, la base est sur Atlas.
- **Une seule Instance par service**, donc pas de rolling deploy : chaque
  redéploiement coupe le service le temps du restart.
- La base PostgreSQL gratuite Render expire après 30 jours — sans objet ici, la
  base est sur MongoDB Atlas.
