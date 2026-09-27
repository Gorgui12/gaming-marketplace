import { describe, it, expect } from 'vitest';
import { htmlToText } from '../src/lib/email/html-to-text.js';

describe('htmlToText', () => {
  it('retire balises, styles et attributs', () => {
    const html = `<div style="padding:24px;background:#020617;">
      <h1 style="margin:0;">Titre</h1>
      <style>.a{color:red}</style>
      <p>Un <strong>paragraphe</strong>.</p>
    </div>`;
    const text = htmlToText(html);
    expect(text).not.toMatch(/</);
    expect(text).not.toMatch(/style=/i);
    expect(text).not.toMatch(/\.a\{/);
    expect(text).toContain('Titre');
    expect(text).toContain('Un paragraphe.');
  });

  it('affiche les URL des liens en clair', () => {
    const text = htmlToText(
      '<a href="https://gamingmarket.store/verify-email?token=abc">Confirmer mon email</a>',
    );
    expect(text).toContain('Confirmer mon email');
    expect(text).toContain('https://gamingmarket.store/verify-email?token=abc');
  });

  it('decode les entités HTML', () => {
    const text = htmlToText('<p>Raison &mdash; &lt;test&gt; &amp; co &#39;ok&#39;</p>');
    expect(text).toContain('Raison - <test> & co \'ok\'');
  });

  it('utilise CRLF comme separateur de ligne', () => {
    const text = htmlToText('<p>a</p><p>b</p>');
    expect(text).toBe('a\r\n\r\nb');
  });

  it('supprime le script et le head', () => {
    const text = htmlToText(
      '<!DOCTYPE html><html><head><title>Objet</title></head><body><script>alert(1)</script><p>ok</p></body></html>',
    );
    expect(text).toBe('ok');
  });

  it('n emet aucune balise residuelle sur un email reel', () => {
    // Un nom contenant du markup doit rester du texte : c'est le rôle de la
    // partie texte (les templates échappent déjà le HTML en amont).
    const text = htmlToText('<p>Bonjour Bob &lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(text).toBe('Bonjour Bob <script>alert(1)</script>');
  });
});
