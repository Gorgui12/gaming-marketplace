import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * La règle qui gouverne ce module : on ne refuse JAMAIS une inscription sur
 * une panne DNS, mais on refuse sur une preuve que le domaine n'existe pas.
 *
 * Ces tests verrouillent cette frontière, en simulant les codes d'erreur réels
 * du resolver Node. C'est la partie la plus subtilement risquée : une
 * inversion anywhere se traduit soit par des inscriptions volées en masse
 * (domaines inexistants acceptés), soit par des clients bloqués (DNS
 * indisponible = marketplace coupée).
 */

const resolveMx = vi.fn();
const resolve4 = vi.fn();
const resolve6 = vi.fn();

vi.mock('node:dns/promises', () => ({
  Resolver: class {
    resolveMx = resolveMx;
    resolve4 = resolve4;
    resolve6 = resolve6;
  },
}));

const { checkEmailDomain } = await import('../src/lib/email/email-deliverability.js');

function dnsError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe('checkEmailDomain', () => {
  beforeEach(() => {
    resolveMx.mockReset();
    resolve4.mockReset();
    resolve6.mockReset();
    resolve4.mockResolvedValue([]);
    resolve6.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('déclare délivrable un domaine avec des MX', async () => {
    resolveMx.mockResolvedValue([{ exchange: 'mx.google.com', priority: 10 }]);

    await expect(checkEmailDomain('gmail.com')).resolves.toBe('deliverable');
  });

  it('déclare indélivrable un domaine qui n\'existe pas (NXDOMAIN)', async () => {
    resolveMx.mockRejectedValue(dnsError('ENOTFOUND'));

    await expect(checkEmailDomain('domaine-inexistant.xyz')).resolves.toBe('undeliverable');
  });

  it('accepte un domaine sans MX mais avec un enregistrement A', async () => {
    // RFC 5321 §5.1 : le A joue le rôle de MX implicite. Beaucoup de petites
    // structures sont dans ce cas, les bloquer serait un faux positif.
    resolveMx.mockResolvedValue([]);
    resolve4.mockResolvedValue([{ address: '203.0.113.10' }]);

    await expect(checkEmailDomain('petit-comptoir.sn')).resolves.toBe('deliverable');
  });

  it('déclare indélivrable un domaine sans MX ni A', async () => {
    resolveMx.mockRejectedValue(dnsError('ENODATA'));
    resolve4.mockResolvedValue([]);
    resolve6.mockResolvedValue([]);

    await expect(checkEmailDomain('domaine-muet.com')).resolves.toBe('undeliverable');
  });

  it('Laisse PASSER une inscription quand le resolver tombe (fail-open)', async () => {
    // Le point critique : une panne de DNS ne doit priver personne de compte.
    for (const code of ['ESERVFAIL', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEOUT']) {
      resolveMx.mockReset();
      resolveMx.mockRejectedValue(dnsError(code));

      await expect(checkEmailDomain(`panne-${code}.com`)).resolves.toBe('unknown');
    }
  });

  it('laisse passer une inscription sur expiration du délai DNS', async () => {
    vi.useFakeTimers();
    resolveMx.mockImplementation(() => new Promise(() => {}));

    const pending = checkEmailDomain('tres-lent.com');
    await vi.advanceTimersByTimeAsync(3100);

    await expect(pending).resolves.toBe('unknown');
  });

  it('met en cache le verdict et ne re-sol pas le même domaine', async () => {
    resolveMx.mockResolvedValue([{ exchange: 'mx.google.com', priority: 10 }]);

    await checkEmailDomain('cacheable.com');
    await checkEmailDomain('cacheable.com');
    await checkEmailDomain('CACHEABLE.COM');

    // Une seule résolution : le casse est normalisé, le cache fait le reste.
    expect(resolveMx).toHaveBeenCalledTimes(1);
  });

  it('ne met pas en cache un verdict "unknown" comme un fait acquis', async () => {
    // Un DNS qui tombe puis revient ne doit pas laisser le domaine « inconnu »
    // marqué pendant une heure entière.
    resolveMx.mockRejectedValue(dnsError('ESERVFAIL'));
    await expect(checkEmailDomain('instable.com')).resolves.toBe('unknown');

    resolveMx.mockReset();
    resolveMx.mockResolvedValue([{ exchange: 'mx.test.com', priority: 1 }]);
    await expect(checkEmailDomain('instable.com')).resolves.toBe('deliverable');
  });
});
