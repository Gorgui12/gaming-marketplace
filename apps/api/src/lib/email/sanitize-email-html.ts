/**
 * Désinfection du HTML rédigé par un admin avant envoi.
 *
 * Le contenu commercial des templates de `email.templates.ts` échappe chaque
 * valeur insérée via `escapeHtml`. Le HTML saisi dans l'admin, lui, échappe
 * cette règle par construction : c'est la contrepartie assumée d'un outil
 * d-authored. Cette fonction en borne les conséquences.
 *
 * Ce n'est pas un pare-feu. Un admin est un acteur de confiance, au même titre
 * que le developer qui écrit un template. Le but est de fermer les deux
 * vecteurs qui échappent à ce contrôle :
 *
 *  1. Le HTML est rendu dans l'admin (aperçu) ET stocké en base. Un
 *     `<script>` ou un `onerror=` glissé dans le textarea deviendrait un XSS
 *     persistant qui s'exécute à chaque consultation de l'historique. On
 *     retire donc le script, pas seulement son effet.
 *  2. `<base href>` réécrit silencieusement la résolution de TOUS les liens
 *     relatifs du message. Un message dont les liens pointent vers un site
 *     tiers — alors que le domaine d'envoi est le nôtre — est le premier
 *     signal d'un filtre antispam, et pour le lecteur c'est une redirection
 *     invisible.
 *
 * `<style>` est en revanche conservé : beaucoup de clients mail le supportent,
 * et le supprimer produirait un email visuellement cassé — un défaut que
 * l'utilisateur voit immédiatement, là où le risque résiduel est déjà
 * neutralisé par les clients eux-mêmes (aucun n'exécute de CSS distant).
 */

/**
 * Éléments retirés avec leur contenu.
 *
 * `script` est le seul dont le contenu doit disparaître : le JavaScript n'a
 * rien à faire dans un email, alors que le `<style>` est conservé pour sa mise
 * en forme. Pour les autres (`iframe`, `form`…), le contenu texte n'est pas
 * sensible — on retire l'élément et sa charge utile par précaution.
 */
const STRIPPED_ELEMENTS = [
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'meta',
  'link',
  'base',
] as const;

/** Attributs retirés quel que soit l'élément. */
const STRIPPED_ATTRIBUTES = ['srcdoc', 'formaction', 'xlink:href'] as const;

/**
 * Retire les éléments dangerous, leur contenu, et les attributs `on*` +
 * `srcdoc`/`base`.
 *
 * La suppression par expression régulière est un choix assumé : aucun
 * parseur HTML n'est disponible dans les dépendances de l'API, et les
 * navigateurs mail n'utilisent de toute façon qu'un sous-ensemble étroit de
 * HTML. Une liste blanche stricte serait plus correcte sur le papier, mais
 * casserait les `<style>` et les attributs `class`/`id` que les messages
 * légitimes utilisent.
 */
export function sanitizeEmailHtml(html: string): string {
  let out = html;

  // 1. Commentaires conditionnels et commentaires simples : `<!--[if mso]>…`
  //    contient du markup destine a Outlook, mais un commentaire peut
  //    aussi dissimuler une charge utile (`<!--><script>…`). On retire tout.
  out = out.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Éléments avec contenu. Le `[\s\S]*?` est volontairement non-greedy pour
  //    s'arrêter à la première fermeture et ne pas embarquer la suite du
  //    message. Un `<script>` non fermé est un cas dégénéré : le reste du
  //    document part avec, ce qui est le comportement sûr.
  for (const tag of STRIPPED_ELEMENTS) {
    const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    out = out.replace(paired, '');
    // Élément auto-fermant, ou ouvrante dont la fermeture a été mangée par un
    // saut de ligne. Le CONTENU éventuel reste en texte : le risque est
    // l'exécution de balises, pas la présence de caractères, et sans parseur
    // on ne peut pas distinguer « fin du script » de « suite du message ».
    // Un `onerror=` resté dans ce texte est retiré par l'étape 3.
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  // 3. Attributs `on*` : gestionnaires d'événements, seul vecteur d'exécution
  //    restant une fois `script` retiré (`<img onerror=…>`). Le motif exige un
  //    nom d'attribut d'au moins deux caractères pour ne pas attraper un
  //    éventuel attribut `o` isolé.
  out = out.replace(/\son[a-z]{2,}\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  for (const attr of STRIPPED_ATTRIBUTES) {
    out = out.replace(new RegExp(`\\s${attr}\\s*=\\s*("[^"]*"|'[^']*'|[^\s>]+)`, 'gi'), '');
  }

  return out;
}

/**
 * Variables attendues dans le corps d'un email admin.
 *
 * Volontairement restreint : uniquement des champs scalaires déjà présents sur
 * `UserModel`, tous echappés avant interpolation. Aucune variable ne donne
 * accès à un objet ni à un document — un `{{user}}` qui sérialiserait en JSON
 * dans le mail serait une fuite de données vers la boîte de réception.
 */
export const TEMPLATE_VARIABLES = [
  'firstName',
  'lastName',
  'email',
  'username',
  'country',
  'currency',
  'unsubscribeUrl',
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

/** Détecte les `{{…}}` présents dans le corps, sans valider leur nom. */
export function extractVariables(html: string): string[] {
  const found = new Set<string>();
  const rx = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    // `noUncheckedIndexedAccess` rend `m[1]` optionnel : le groupe existe
    // nécessairement (il est le cœur du motif), mais le type ne le sait pas.
    // `if` documente cette invariant sans ajouter d'assertion.
    if (m[1] !== undefined) found.add(m[1]);
  }
  return [...found];
}

/**
 * Échappe une valeur destinée à une substitution dans du HTML.
 *
 * Même fonction que celle de `email.templates.ts`, reproduite ici pour que ce
 * module n'ait pas à exporter une dépendance interne du fichier de templates.
 * L'échappement est indispensable : `{{firstName}}` vient de la base, et un
 * utilisateur dont le prénom contient `<script>` casserait le layout de tous
 * les messages ou, pire, injecterait du markup chez tous les destinataires.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type TemplateContext = Record<TemplateVariable, string>;

/**
 * Remplace les `{{variable}}` par les valeurs du contexte.
 *
 * La substitution se fait sur le HTML BRUT, pas sur le texte rendu : les
 * valeurs sont échappées, donc aucune ne peut réintroduire de balise. La
 * syntaxe tolerate les espaces (`{{ firstName }}`) parce que c'est ce que
 * tape un humain, et `unsubscribeUrl` apparaît souvent au milieu d'une URL
 * qu'on recopie.
 *
 * Une variable inconnue est laissée telle quelle plutôt que remplacée par une
 * chaîne vide : l'admin voit alors `{{foo}}` dans l'aperçu et dans l'email
 * reçu, ce qui l'avertit. La vider produirait un trou invisible.
 */
export function renderTemplate(html: string, context: TemplateContext): string {
  return html.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(context, name)) return match;
    const value = context[name as TemplateVariable];
    return escapeHtml(value ?? '');
  });
}
