import 'dotenv/config';
import { UserRole, UserAccountStatus } from '@gm/types';
import { connectDb, disconnectDb } from '../lib/db.js';
import { UserModel } from '../modules/users/user.model.js';

/**
 * Audit EN LECTURE SEULE des comptes dont l'adresse email est douteuse.
 *
 * Aucune écriture n'est possible dans ce fichier, volontairement : la décision
 * de suspendre, valider ou supprimer un compte reste humaine. Le script se
 * contente de produire la liste de travail, classée par gravité.
 *
 * Les signaux sont STRUCTURELS (aucun appel DNS, aucun fournisseur externe) :
 * c'est instantané, gratuit, et ça ne fait pas sortir les adresses des
 * clients. Un contrôle de délivrabilité réel (MX, boîte existante) est
 * volontairement laissé de côté : il rendrait l'inscription dépendante d'un
 * appel réseau à chaque fois.
 */

/** Domaines jetables connus : une adresse ici ne peut servir à rien. */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'yopmail.com',
  'trashmail.com',
  'getnada.com',
  'sharklasers.com',
  'grr.la',
  'dispostable.com',
  'maildrop.cc',
  'fakeinbox.com',
  'mintemail.com',
  'mytemp.email',
  'emailondeck.com',
  'moakt.com',
  'spamgourmet.com',
]);

/** TLD réservés (RFC 2606 / 6761) : aucun domain public ne peut les porter. */
const RESERVED_TLDS = new Set(['test', 'invalid', 'example', 'localhost', 'local']);

/**
 * Partie locale « évidement factice ». Liste volontairement courte et
 * non exhaustive : elle sert à remonter les comptes de test oubliés, pas à
 * statuer sur la légitimité d'une adresse.
 */
const FAKE_LOCAL_PARTS = [
  'test',
  'testing',
  'tester',
  'teste',
  'fake',
  'faux',
  'dummy',
  'sample',
  'example',
  'temp',
  'tmp',
  'spam',
  'junk',
  'bot',
  'asdf',
  'qwerty',
  'azerty',
  'admin',
  'administrator',
  'user',
  'utilisateur',
  'moi',
  'me',
];

interface Finding {
  id: string;
  email: string;
  username: string;
  status: string;
  roles: string[];
  emailVerified: boolean | undefined;
  createdAt: Date;
  transactionCount: number;
  successfulSales: number;
  successfulPurchases: number;
  signals: string[];
}

function analyse(email: string, emailVerified: boolean | undefined): string[] {
  const signals: string[] = [];
  const at = email.lastIndexOf('@');

  if (emailVerified === false) {
    signals.push('email non confirmé');
  } else if (emailVerified === undefined) {
    signals.push('champ emailVerified absent (compte antérieur à la confirmation)');
  }

  if (at <= 0) {
    signals.push('adresse sans partie domaine');
    return signals;
  }

  const local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1).toLowerCase();
  const tld = domain.split('.').pop() ?? '';

  if (DISPOSABLE_DOMAINS.has(domain)) {
    signals.push('domaine jetable connu');
  }
  if (RESERVED_TLDS.has(tld)) {
    signals.push(`TLD réservé (.${tld})`);
  }
  if (!domain.includes('.')) {
    signals.push('domaine sans point');
  }
  if (FAKE_LOCAL_PARTS.includes(local)) {
    signals.push('partie locale factice');
  }
  if (/^(.)\1{3,}$/.test(local)) {
    signals.push('partie locale répétitive');
  }
  if (/\d{5,}/.test(local) && local.length < 14) {
    signals.push('partie locale numérique (compte généré ?)');
  }

  return signals;
}

async function audit(): Promise<void> {
  await connectDb();

  const users = await UserModel.find({})
    .select(
      'email username roles status emailVerified createdAt transactionCount successfulSales successfulPurchases',
    )
    .lean();

  const findings: Finding[] = [];
  for (const u of users) {
    const signals = analyse(String(u.email), u.emailVerified as boolean | undefined);
    if (signals.length === 0) continue;
    findings.push({
      id: String(u._id),
      email: String(u.email),
      username: String(u.username),
      status: String(u.status),
      roles: (u.roles ?? []) as string[],
      emailVerified: u.emailVerified as boolean | undefined,
      createdAt: u.createdAt as Date,
      transactionCount: u.transactionCount ?? 0,
      successfulSales: u.successfulSales ?? 0,
      successfulPurchases: u.successfulPurchases ?? 0,
      signals,
    });
  }

  // Priorité : ce qui a déjà transacté passe devant, car un compte non
  // confirmé qui a vendu ou acheté est soit un vrai client bloqué par un
  // problème technique, soit la cible la plus urgente.
  const severity = (f: Finding): number => {
    let s = 0;
    if (f.signals.some((x) => x.includes('jetable') || x.includes('réservé'))) s += 100;
    if (f.signals.some((x) => x.includes('factice'))) s += 50;
    if (f.emailVerified === false) s += 40;
    if (f.emailVerified === undefined) s += 10;
    if (f.signals.some((x) => x.includes('sans point') || x.includes('sans partie'))) s += 30;
    if (f.transactionCount > 0) s += 5;
    if (f.successfulSales > 0 || f.successfulPurchases > 0) s += 5;
    return s;
  };

  findings.sort((a, b) => severity(b) - severity(a));

  const total = users.length;
  const unverified = users.filter((u) => u.emailVerified === false).length;
  const legacy = users.filter((u) => u.emailVerified === undefined).length;
  const suspicious = findings.filter((f) =>
    f.signals.some((s) => !s.startsWith('champ emailVerified')),
  ).length;

  // eslint-disable-next-line no-console
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  AUDIT DES EMAILS — lecture seule, aucune modification       ║
╚══════════════════════════════════════════════════════════════╝
  Comptes au total ..................... ${String(total).padStart(6)}
  Email NON confirmé ................... ${String(unverified).padStart(6)}
  Sans champ emailVerified (legacy) ..... ${String(legacy).padStart(6)}
  Adresses structuralement douteuses ... ${String(suspicious).padStart(6)}
`);

  if (findings.length === 0) {
    // eslint-disable-next-line no-console
    console.log('  Aucun compte suspect. Rien à faire.\n');
    await disconnectDb();
    return;
  }

  // eslint-disable-next-line no-console
  console.log('  Détail des comptes à examiner (gravité décroissante) :\n');
  for (const f of findings) {
    const engagement =
      f.transactionCount > 0 || f.successfulSales > 0 || f.successfulPurchases > 0
        ? ` [${f.transactionCount} tx, ${f.successfulSales} ventes, ${f.successfulPurchases} achats]`
        : '';
    // eslint-disable-next-line no-console
    console.log(
      `  ${f.email}\n` +
        `    id=${f.id}  @${f.username}  ${f.status}  ${f.roles.join(',')}${engagement}\n` +
        `    → ${f.signals.join(' | ')}\n`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(`  ${findings.length} compte(s) signalé(s).\n`);
  // eslint-disable-next-line no-console
  console.log(`  Pour agir ensuite :
    - valider un email manuellement    : PATCH /api/v1/admin/users/:id/email-verified
    - filtrer les non vérifiés         : GET  /api/v1/admin/users?emailVerified=false
    - suspendre / bannir / supprimer   : outils habituels de l'admin
    - demander un nouveau lien         : le bouton sur /verify-email côté client
`);
  // eslint-disable-next-line no-console
  console.log(
    `  Rappel : un compte non confirmé est dès à présent bloqué pour vendre,\n` +
      `  acheter, envoyer un message, poster un avis et modifier son profil.\n`,
  );

  // Garde-fou : le rôle est informative, on rappelle qui échappe au filtre
  // pour qu'aucun administrateur ne se bloque lui-même par surprise.
  const adminsSansEmail = findings.filter((f) =>
    (f.roles ?? []).some((r) => r === UserRole.ADMIN || r === UserRole.SUPER_ADMIN),
  );
  if (adminsSansEmail.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`  ⚠ ${adminsSansEmail.length} compte(s) administrateur dans la liste.`);
    // eslint-disable-next-line no-console
    console.log(`    Les administrateurs ne sont pas bloqués par le garde-fou email.`);
    // eslint-disable-next-line no-console
    console.log(`    Statut de référence : ${UserAccountStatus.ACTIVE}\n`);
  }

  await disconnectDb();
}

audit().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
