# syntax=docker/dockerfile:1
#
# Image de production de l'API (@gm/api).
#
# Contexte de build : la RACINE du monorepo (obligatoire — pnpm a besoin du
# lockfile et des package.json de tous les workspaces pour résoudre les
# dépendances `workspace:*`).
#
#   docker build -f Dockerfile -t gm-api .
#
# pnpm : les 4 paquets @gm/* dont dépend l'API pointent `main` sur ./dist/,
# ils doivent donc être compilés AVANT l'API (cf. docs/GUIDE_DEMARRAGE_LOCAL.md,
# "Règle d'or"). D'où l'ordre des deux commandes de build plus bas.

# node:22-slim (Debian/glibc) et non alpine : les binaires précompilés
# d'argon2 existent pour musl, mais glibc est la cible la mieux couverte par
# l'ensemble des dépendances natives transitives. Coût : ~40 Mo de plus.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# pnpm est figé par le champ packageManager du package.json racine. On
# l'installe via npm plutôt que via `corepack enable` : corepack vérifie la
# signature du tarball npm au téléchargement et échoue sur les rotations de
# clé ("Cannot find matching keyid"), ce qui casse le build de façon opaque.
# GARDER CETTE VERSION SYNCHRONISÉE AVEC packageManager du package.json racine.
RUN npm install --global pnpm@9.0.0
WORKDIR /app

# ---------------------------------------------------------------------------
# Étape deps : installation seule des manifestes, pour que la couche soit
# réutilisée tant que les dépendances ne changent pas (le COPY du code source
# ci-dessous ne l'invalide pas).
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/validation/package.json packages/validation/
COPY packages/utils/package.json packages/utils/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Étape build : compilation TS des packages partagés puis de l'API.
# ---------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm --filter "./packages/*" build \
 && pnpm --filter @gm/api build

# ---------------------------------------------------------------------------
# Étape prod-deps : réinstallation sans les devDependencies, limitée à l'API et
# ses dépendances de workspace (le `...` sélectionne l'arbre @gm/api inclus).
# Partir d'une installation fraîche plutôt que de reprendre celle du build
# évite d'embarquer vitest/typescript/next dans l'image finale.
# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/validation/package.json packages/validation/
COPY packages/utils/package.json packages/utils/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --prod --filter "@gm/api..."

# ---------------------------------------------------------------------------
# Étape runtime : image finale.
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
# PORT n'est volontairement PAS figé ici. Les PaaS l'injectent dans
# l'environnement du conteneur (Render : 10000 par défaut) et c'est cette valeur
# que server.ts lit en priorité. Un `ENV PORT=...` dans l'image risquerait de la
# figer et de désaccorder le port d'écoute du port réellement routé, ce qui rend
# l'API injoignable sans la moindre erreur visible dans les logs.
# Sans PORT injecté, server.ts retombe sur env.API_PORT (4000) : l'image reste
# donc lançable seule en local.

# Les produits compilés d'abord, puis les node_modules de production PAR-DESSUS.
# L'ordre est essential : le COPY de /app/packages/ depuis le build embarquerait
# sinon les node_modules du build (avec les devDependencies : tsc, vitest).
# Un second COPY ne remplace que les fichiers presents cote source, les dist/
# deja copies survivent. Ne pas « optimiser » en supprimant ces node_modules :
# @gm/validation a zod pour vraie dependance, et la resolution Node remonte de
# packages/validation/dist/ vers /app/node_modules ou pnpm ne l'expose pas.
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/packages/ /app/packages/

COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=prod-deps /app/packages/ /app/packages/
COPY --from=prod-deps /app/apps/api/package.json /app/apps/api/package.json

# Sources et tsconfig des paquets partages : inutiles au runtime (ils
# n'exportent que dist/ via leur package.json).
RUN rm -rf packages/*/src packages/*/tsconfig.json

WORKDIR /app/apps/api

# Node reçoit SIGTERM même en PID 1 et le handler de server.ts assure l'arrêt
# propre ; pas besoin de tini ici (l'API ne spawn aucun enfant de long durée).
CMD ["node", "dist/server.js"]
