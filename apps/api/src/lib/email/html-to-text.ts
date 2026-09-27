/**
 * Conversion HTML -> texte brut pour la partie `text` d'un email.
 *
 * Pourquoi c'est indispensable : sans version texte brut, l'email part en
 * `multipart/alternative` avec un seul `text/html`. Les filtres antispam les
 * plus agressifs — en tête Apple Mail / iCloud Mail — sanctionnent
 * lourdement le HTML-only : le message imite alors parfaitement une
 * page de phishing, où la seule action possible est un gros bouton. Gmail et
 * Outlook sont bien plus tolérants, d'où un problème visible uniquement sur
 * iOS. Fournir `text` en plus de `html` est le correctif le plus rentable
 * pour la délivrabilité.
 *
 * On dérive `text` du HTML existant plutôt que de du maintenir en double :
 * les deux parties ne peuvent pas diverger, et les 16 templates n'ont pas à
 * être réécrits.
 */

const BLOCK_TAGS =
  'address|article|aside|blockquote|div|dl|dt|dd|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul';

/**
 * Les entités qui apparaissent réellement dans nos templates. Le HTML n'est
 * jamais passé par un encodeur complet, on couvre donc explicitement le
 * ponctuation française (`&mdash;`, `&nbsp;`…) plutôt que de décoder toute
 * la spec HTML, inutile ici et source de surprises.
 */
const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&mdash;': '-',
  '&ndash;': '-',
  '&laquo;': '<<',
  '&raquo;': '>>',
  '&hellip;': '...',
  '&eacute;': 'e',
  '&egrave;': 'e',
  '&agrave;': 'a',
  '&ccedil;': 'c',
  '&ugrave;': 'u',
  '&icirc;': 'i',
  '&ocirc;': 'o',
  '&rsquo;': "'",
  '&lsquo;': "'",
  '&ldquo;': '"',
  '&rdquo;': '"',
  '&euro;': '€',
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&[a-z]+;|&#\d+;/gi, (entity) => {
      const direct = NAMED_ENTITIES[entity.toLowerCase()];
      return direct !== undefined ? direct : ' ';
    });
}

/**
 * Un email sans lien visible en clair est très suspect : on affiche donc
 * l'URL entre parenthèses après le libellé du lien. Si l'ancre ne contient
 * que le lien (ou rien d'utile), on ne sort que l'URL.
 */
function anchorToText(anchor: string, href: string | undefined): string {
  const label = anchor
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!href || href === '#') return label;
  if (!label || label.toLowerCase() === href.toLowerCase()) return href;
  return `${label} (${href})`;
}

export function htmlToText(html: string): string {
  let out = html;

  // 1. Supprimer ce qui n'a aucun sens en texte brut, y compris le contenu de
  //    <style>/<script> qu'un simple strip de balises laisserait passer.
  out = out
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<title[\s\S]*?<\/title>/gi, '')
    .replace(/<meta[^>]*>/gi, '');

  // 2. Liens -> "libellé (url)".
  out = out.replace(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, href, anchor) =>
    anchorToText(anchor, decodeEntities(href)),
  );

  // 3. Balises de bloc -> sauts de ligne (avant de retirer les balises, sinon
  //    l'information de structure est perdue).
  out = out
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:blockquote|div|dl|dt|dd|figure|figcaption|h[1-6]|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi, '\n');

  // 4. Tout le reste : suppression des balises restantes.
  out = out.replace(/<[^>]*>/g, '');

  // 5. Entités, espaces, sauts.
  out = decodeEntities(out);
  out = out
    // Espaces fins (y compris insécables) -> espace normal.
    .replace(/[ \t ]+/g, ' ')
    // Lignes vides issues des balites fermantes/ouvrantes.
    .replace(/ *\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // CRLF : séparateur de ligne canonique en MIME (RFC 5322). Un LF seul
  // s'affiche mal dans plusieurs clients texte.
  return out.replace(/\n/g, '\r\n');
}
