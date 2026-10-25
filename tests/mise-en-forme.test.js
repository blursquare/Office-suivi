'use strict';
// Mise en forme des messages façon Slack (étude 25/10, client/119) : gras, italique, barré, code, citation, listes, liens — toujours après échappement.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const f = (t) => app.htmlMiseEnFormeCanal(t);

test('marques : *gras*, _italique_, ~barré~, `code`, mais pas au milieu d’un mot', () => {
  assert.equal(f('un *mot* clé'), 'un <strong>mot</strong> clé');
  assert.equal(f('un **mot** clé'), 'un <strong>mot</strong> clé');
  assert.equal(f('_dit_ ainsi'), '<em>dit</em> ainsi');
  assert.equal(f('~faux~.'), '<del>faux</del>.');
  assert.equal(f('lancer `npm test` ici'), 'lancer <code>npm test</code> ici');
  assert.equal(f('snake_case_nom et 2*3*4'), 'snake_case_nom et 2*3*4');
});

test('listes, citation et bloc de code', () => {
  assert.equal(f('- un\n- deux'), '<ul><li>un</li><li>deux</li></ul>');
  assert.equal(f('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(f('> cité\nsuite'), '<blockquote class="cx-citation">cité</blockquote>suite');
  assert.match(f('avant\n```\nx *y* <b>\n```\naprès'), /<pre class="cx-code-bloc"><code>x \*y\* &lt;b&gt;<\/code><\/pre>/);
  assert.equal(f('ligne 1\nligne 2'), 'ligne 1<br>ligne 2');
});

test('liens : mots cliquables et adresses nues, jamais javascript:', () => {
  assert.match(f('[le site](https://exemple.fr/a?b=1&c=2)'), /<a href="https:\/\/exemple\.fr\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">le site<\/a>/);
  assert.match(f('voir https://exemple.fr/page.'), /<a href="https:\/\/exemple\.fr\/page"[^>]*>https:\/\/exemple\.fr\/page<\/a>\./);
  assert.doesNotMatch(f('[clic](javascript:alert(1))'), /<a /);
});

test('sécurité : le HTML saisi est échappé, les marqueurs internes ne se glissent pas', () => {
  assert.equal(f('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.doesNotMatch(f('\u00010\u0002 <script>'), /<script/);
  assert.equal(f('\u00010\u0002'), '0');
});

test('@mentions : colorées hors du code, comme avant', () => {
  const h = app.htmlTexteCanal('@Julie voici `@Julie` et *@Claire*', ['Julie VASSELIN', 'Bastien ANGLUMENT'], 'Bastien ANGLUMENT');
  assert.match(h, /<span class="cx-mention">@Julie<\/span> voici <code>@Julie<\/code>/);
  assert.match(h, /cx-mention-claire/);
});

test('recherche globale : « de:julie » vise un auteur, le reste cherche les mots', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(app.requeteRechercheGlobale('contrat de:julie signé'))), { q: 'contrat signé', auteur: 'julie' });
  assert.deepEqual(JSON.parse(JSON.stringify(app.requeteRechercheGlobale('pret'))), { q: 'pret', auteur: '' });
});

test('fils : les réponses d’un message, dans l’ordre, et leur compte', () => {
  const l = [{ id: 'a', quand: 1 }, { id: 'c', parent: 'a', quand: 5 }, { id: 'b', parent: 'a', quand: 3 }, { id: 'z', parent: 'x', quand: 2 }];
  assert.equal(app.reponsesFilCanal(l, 'a').map(m => m.id).join(''), 'bc');
  assert.equal(app.libelleReponsesFil(1), '1 réponse');
  assert.equal(app.libelleReponsesFil(3), '3 réponses');
});
