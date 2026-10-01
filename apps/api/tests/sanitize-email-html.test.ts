import { describe, it, expect } from 'vitest';
import {
  sanitizeEmailHtml,
  extractVariables,
  renderTemplate,
  TEMPLATE_VARIABLES,
} from '../src/lib/email/sanitize-email-html.js';

describe('sanitizeEmailHtml', () => {
  it('retire le script et son contenu', () => {
    const out = sanitizeEmailHtml('<p>Bonjour</p><script>alert(1)</script><p>Suite</p>');
    expect(out).not.toMatch(/script/i);
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('Bonjour');
    expect(out).toContain('Suite');
  });

  it('retire les gestionnaires on* — vecteur restant apres suppression du script', () => {
    const out = sanitizeEmailHtml('<img src="x" onerror="alert(1)"><p>ok</p>');
    expect(out).not.toMatch(/onerror/i);
    expect(out).toContain('ok');
  });

  it('retire iframe, form et object', () => {
    const out = sanitizeEmailHtml(
      '<iframe src="https://x.test"></iframe><form action="/x"><input name="a"></form><object data="x"></object><p>ok</p>',
    );
    expect(out).not.toMatch(/iframe|form|input|object/i);
    expect(out).toContain('ok');
  });

  it('retire base href, qui reecrit la resolution de tous les liens', () => {
    // Cas concret : le message part de notre domaine mais tous les liens
    // relatifs pointent vers le site de l'attaquant.
    const out = sanitizeEmailHtml(
      '<base href="https://evil.test"><a href="/marketplace">Voir</a>',
    );
    expect(out).not.toMatch(/base/i);
    expect(out).not.toContain('evil.test');
    expect(out).toContain('Voir');
  });

  it('retire meta et link', () => {
    const out = sanitizeEmailHtml('<meta http-equiv="refresh" content="0;url=https://evil.test"><link rel="stylesheet" href="https://evil.test/x.css"><p>ok</p>');
    expect(out).not.toMatch(/meta|link|evil\.test/i);
    expect(out).toContain('ok');
  });

  it('retire les commentaires, y compris conditionnels Outlook', () => {
    const out = sanitizeEmailHtml('<!--[if mso]><script>alert(1)</script><![endif]--><p>ok</p>');
    expect(out).not.toMatch(/script|mso/i);
    expect(out).toContain('ok');
  });

  it('conserve <style> — le supprimer casse la mise en forme des messages legitimes', () => {
    const out = sanitizeEmailHtml('<style>.btn{color:#fff}</style><p>ok</p>');
    expect(out).toContain('<style>');
    expect(out).toContain('.btn{color:#fff}');
  });

  it('conserve le style inline et les attributs de presentation', () => {
    const html =
      '<table width="100%" cellpadding="0" style="background:#fff"><tr><td align="center" class="c">x</td></tr></table>';
    const out = sanitizeEmailHtml(html);
    expect(out).toContain('width="100%"');
    expect(out).toContain('style="background:#fff"');
    expect(out).toContain('align="center"');
    expect(out).toContain('class="c"');
  });

  it('ne retire aucun attribut d email legitime', () => {
    // Le motif `on[a-z]{2,}` retire tout attribut commencant par « on ». Il
    // n'existe aucun attribut HTML standard de ce type qui ne soit un
    // gestionnaire d'evenement, donc le prefixe est le bon discriminant — et
    // ce test verrouille que le motif ne déborde pas sur les attributs de
    // presentation, que les clients mail supportent tous.
    const html =
      '<td colspan="2" bgcolor="#fff" border="0" valign="top" width="600" ' +
      'style="color:#111" class="btn" id="cta" dir="ltr" lang="fr" title="x">c</td>';
    const out = sanitizeEmailHtml(html);
    for (const attr of [
      'colspan="2"',
      'bgcolor="#fff"',
      'border="0"',
      'valign="top"',
      'width="600"',
      'style="color:#111"',
      'class="btn"',
      'id="cta"',
      'dir="ltr"',
      'lang="fr"',
      'title="x"',
    ]) {
      expect(out).toContain(attr);
    }
  });

  it('retire les gestionnaires sur balise auto-fermetante', () => {
    const out = sanitizeEmailHtml('<img src="x" onerror="alert(1)"/><br onload="x">');
    expect(out).not.toMatch(/onerror|onload/i);
    expect(out).toContain('<img src="x"');
  });

  it('neutralise un script non ferme : plus de balise, texte inerte', () => {
    // Cas degenere. Ce qui protege est l'absence de balise executable, pas
    // l'absence de caracteres : sans parseur, on ne peut pas savoir ou finit
    // un script non ferme. Si le texte résiduel contenait un gestionnaire,
    // l'étape  des attributs `on*` le rattrape — vérifié ci-dessous.
    const out = sanitizeEmailHtml('<p>ok</p><script>alert(1)');
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain('ok');
  });

  it('neutralise un script non ferme contenant un gestionnaire on*', () => {
    const out = sanitizeEmailHtml('<script>var s = "<img src=x onerror=alert(1)>"');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/onerror/i);
  });

  it('conserve charset et viewport, sans quoi le mail est illisible', () => {
    // `charset` absent : Outlook (moteur Word) lit les accents en latin-1.
    // `viewport` absent : un telephone rend dans une fenetre de 980 px, donc
    // un email de 600 px s'affiche a un tiers de sa taille.
    const out = sanitizeEmailHtml(
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><p>Accents : éàçù</p>',
    );
    expect(out).toContain('<meta charset="utf-8">');
    expect(out).toContain('name="viewport"');
    expect(out).toContain('éàçù');
  });

  it('conserve plusieurs meta sans les confondre entre eux', () => {
    const out = sanitizeEmailHtml(
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>',
    );
    expect(out.match(/<meta/g)).toHaveLength(2);
  });

  it('retire un meta qui fait autre chose que declarer', () => {
    // `<meta http-equiv="refresh">` est une redirection : c'est un vecteur,
    // pas une declaration, et la liste blanche ne l'ouvre pas.
    expect(
      sanitizeEmailHtml('<meta http-equiv="refresh" content="0;url=https://exemple.test">'),
    ).not.toMatch(/meta/i);
    expect(sanitizeEmailHtml('<meta name="robots" content="noindex">')).not.toMatch(/meta/i);
  });

  it('retire un charset Accompagne d\'un gestionnaire on*', () => {
    // La liste blanche exige que la balise se termine juste apres `charset` ;
    // un `onload` derriere ne matche donc pas, et la balise part entiere.
    const out = sanitizeEmailHtml('<meta charset="utf-8" onload="alert(1)">');
    expect(out).not.toMatch(/onload/i);
    expect(out).not.toMatch(/meta/i);
  });

  it('ne touche pas a un texte qui ressemble a un sentinelle interne', () => {
    // Le sentinelle de protection est delimite par NUL : du texte ordinaire
    // qui y ressemble doit rester intact, sans quoi une variable ou une URL
    // disparaîtrait du mail.
    const out = sanitizeEmailHtml('<p>gm-meta-0 et \u0000gm-meta-9\u0000</p>');
    expect(out).toContain('gm-meta-0');
    expect(out).toContain('gm-meta-9');
  });
});

describe('extractVariables', () => {
  it('detecte les variables declarees', () => {
    const found = extractVariables('Bonjour {{firstName}}, voir {{unsubscribeUrl}}');
    expect(found.sort()).toEqual(['firstName', 'unsubscribeUrl']);
  });

  it('tolere les espaces et dedoublonne', () => {
    const found = extractVariables('{{ firstName }} {{firstName}}');
    expect(found).toEqual(['firstName']);
  });

  it('ignore une syntaxe non conforme', () => {
    expect(extractVariables('{{1abc}} {{}} {{ spaced name }}')).toEqual([]);
  });
});

describe('renderTemplate', () => {
  const ctx = {
    firstName: 'Awa',
    lastName: 'Diop',
    email: 'awa@test.sn',
    username: 'awa',
    country: 'SN',
    currency: 'XOF',
    unsubscribeUrl: 'https://api.test/unsub/abc',
  };

  it('substitue les variables connues', () => {
    const out = renderTemplate('Bonjour {{firstName}} {{lastName}}', ctx);
    expect(out).toBe('Bonjour Awa Diop');
  });

  it('tolere les espaces autour du nom', () => {
    expect(renderTemplate('Bonjour {{ firstName }}', ctx)).toBe('Bonjour Awa');
  });

  it('echappe une valeur contenant du markup', () => {
    // Cas critique : le prenom vient de la base. Sans echappement, un prenom
    // malveillant casserait le layout chez TOUS les destinataires.
    const out = renderTemplate('Bonjour {{firstName}}', {
      ...ctx,
      firstName: '<script>alert(1)</script>',
    });
    expect(out).not.toMatch(/<script>/);
    expect(out).toContain('&lt;script&gt;');
  });

  it('echappe les quotes pour ne pas casser un attribut', () => {
    const out = renderTemplate('<a href="{{unsubscribeUrl}}">x</a>', {
      ...ctx,
      unsubscribeUrl: 'https://x.test/?a=1&b="2"',
    });
    expect(out).toContain('&amp;');
    expect(out).not.toContain('b="2"');
  });

  it('laisse une variable inconnue visible plutot que de la vider', () => {
    // Vider produirait un trou invisible ; laisser `{{foo}` avertit l'admin.
    expect(renderTemplate('Bonjour {{unknownVar}}', ctx)).toBe('Bonjour {{unknownVar}}');
  });

  it('accepte toutes les variables declarees', () => {
    for (const name of TEMPLATE_VARIABLES) {
      const out = renderTemplate(`{{${name}}}`, ctx);
      expect(out).toBe(ctx[name]);
    }
  });
});
