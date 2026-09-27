import { Resolver } from 'node:dns/promises';
import { logger } from '../logger.js';

/**
 * Vérification qu'un domaine est en mesure de RECEVOIR du courrier.
 *
 * Un email bien formé sur un domaine sans enregistrement MX ne recevra
 * jamais l'email de confirmation : le compte resterait bloqué, et
 * potentiellement de l'argent en séquestre si on le laissait passer. C'est
 * le seul contrôle qui distingue « adresse valide » de « adresse qui
 * fonctionnera ».
 *
 * Principe directeur : NE JAMAIS bloquer une inscription parce que le DNS a
 * échoué. Les resolveurs publics tombent, sont lents en mobile, et une panne
 * transitoire ne doit pas priver un client de son compte. On ne déclare
 * « indélivrable » que sur une preuve formelle (NXDOMAIN, ou domaine existant
 * sans MX ni A/AAAA) ; tout le reste est « inconnu » et passe.
 */

const resolver = new Resolver({ timeout: 2000, tries: 2 });

/** Garde-fou : l'inscription ne doit pas rester pendante sur un DNS lent. */
const LOOKUP_TIMEOUT_MS = 3000;

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 5000;

export type DomainVerdict = 'deliverable' | 'undeliverable' | 'unknown';

const cache = new Map<string, { verdict: DomainVerdict; expiresAt: number }>();

/**
 * Erreurs DNS qui prouvent que le domaine n'existe pas, et non que la
 * résolution a échoué. `ENOTFOUND` = NXDOMAIN.
 */
const NXDOMAIN_CODES = new Set(['ENOTFOUND', 'NXDOMAIN', 'NODATA_ENTRIES_EXHAUSTED']);
/** Le domaine existe mais ne publie aucun MX : il faut l'A/AAAA. */
const NO_MX_CODES = new Set(['ENODATA', 'NOERROR_EMPTY']);

/** Résout en annulant si le délai est dépassé. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('DNS_TIMEOUT')), ms);
      // `unref` : un timer pendant ne doit pas empêcher le process de sortir.
      timer.unref?.();
    }),
  ]);
}

function codeOf(err: unknown): string {
  return (err as { code?: string })?.code ?? '';
}

async function hasAddressRecord(domain: string): Promise<boolean> {
  // RFC 5321 §5.1 : en l'absence de MX, un enregistrement A implicite est
  // accepté. C'est le cas de beaucoup de petites structures.
  const results = await Promise.allSettled([
    withTimeout(resolver.resolve4(domain), LOOKUP_TIMEOUT_MS),
    withTimeout(resolver.resolve6(domain), LOOKUP_TIMEOUT_MS),
  ]);
  return results.some((r) => r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length > 0);
}

async function resolveVerdict(domain: string): Promise<DomainVerdict> {
  try {
    const records = await withTimeout(resolver.resolveMx(domain), LOOKUP_TIMEOUT_MS);
    if (records.length > 0) {
      return 'deliverable';
    }
    // Pas de MX mais le domaine existe peut-être via A/AAAA.
    return (await hasAddressRecord(domain)) ? 'deliverable' : 'undeliverable';
  } catch (err) {
    const code = codeOf(err);

    if (NXDOMAIN_CODES.has(code)) {
      return 'undeliverable';
    }

    if (NO_MX_CODES.has(code)) {
      try {
        return (await hasAddressRecord(domain)) ? 'deliverable' : 'undeliverable';
      } catch {
        return 'unknown';
      }
    }

    // Timeout, SERVFAIL, EAI_AGAIN, resolver injoignable : on ne conclut rien.
    logger.warn(
      { domain, code: code || String(err) },
      'Résolution MX inconclusive — inscription laissée passer',
    );
    return 'unknown';
  }
}

/**
 * Verdict de délivrabilité pour un domaine, mis en cache une heure.
 *
 * Le cache évite de re-solvers le même domaine à chaque inscription (les
 * grands fournisseurs sont interrogés des milliers de fois) et sert de
 * protection indirecte : au-delà du plafond, le cache est vidé plutôt que de
 * grossir indéfiniment sous l'effet d'un flot de domaines aléatoires.
 */
export async function checkEmailDomain(domain: string): Promise<DomainVerdict> {
  const key = domain.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.verdict;
  }

  const verdict = await resolveVerdict(key);

  if (cache.size >= CACHE_MAX_ENTRIES) {
    cache.clear();
  }
  // Seuls les verdicts DÉFINITIFS sont mémorisés. Un `unknown` traduit une
  // panne passagère du resolver : le conserver une heure masquerait le retour
  // du DNS et laisserait un domaine sain marqué « douteux » bien après la
  // résolution du problème. Ne rien mettre en cache ne coûte qu'une
  // résolution de plus, et l'échec étant fail-open, l'utilisateur n'en subit
  // aucune conséquence.
  if (verdict !== 'unknown') {
    cache.set(key, { verdict, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  if (verdict === 'undeliverable') {
    logger.warn({ domain: key }, 'Domaine sans possibility de réception mail');
  }

  return verdict;
}
