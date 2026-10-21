'use strict';

// « Demander à CLAIRE » en agent (étude 11/10) : mise en forme de la réponse (échappée, listes, gras), sans jamais de HTML venu de l'IA.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('réponse de l’agent : paragraphes, listes à puces, gras ; tout le reste échappé', () => {
  const h = app.htmlReponseAgentAssistant('Le dossier est **en attente**.\n\n- Offre de prêt\n- Titre <script>x</script>\n\nVoulez-vous que je relance ?');
  assert.equal(h, '<p>Le dossier est <b>en attente</b>.</p><ul class="asst-liste"><li>Offre de prêt</li><li>Titre &lt;script&gt;x&lt;/script&gt;</li></ul><p>Voulez-vous que je relance ?</p>');
  assert.equal(app.htmlReponseAgentAssistant('1. un\n2) deux'), '<ol class="asst-liste"><li>un</li><li>deux</li></ol>');
  assert.equal(app.htmlReponseAgentAssistant('ligne 1\nligne 2'), '<p>ligne 1<br>ligne 2</p>');
  assert.equal(app.htmlReponseAgentAssistant(''), '<p></p>');
});

test('réponse de l’agent façon Claude : titres, tableau, citation, filet, italique, code — jamais de HTML brut', () => {
  const h = app.htmlReponseAgentAssistant('## Synthèse\n\nUne *promesse* de vente.\n\n| Partie | Rôle |\n|---|:-:|\n| [NOM1] | Vendeur |\n| <b>x</b> | Acquéreur |\n\n> « la condition » [pj1 p. 3]\n\n---\n\n1. un\n- deux\n\n`code`');
  assert.match(h, /<h4 class="asst-titre asst-titre-2">Synthèse<\/h4>/);
  assert.match(h, /<i>promesse<\/i>/);
  assert.match(h, /<table class="asst-table"><thead><tr><th>Partie<\/th><th style="text-align:center">Rôle<\/th><\/tr><\/thead>/);
  assert.match(h, /<td>\[NOM1\]<\/td><td style="text-align:center">Vendeur<\/td>/);
  assert.match(h, /<td>&lt;b&gt;x&lt;\/b&gt;<\/td>/);
  assert.match(h, /<blockquote class="asst-citation">/);
  assert.match(h, /<hr class="asst-filet">/);
  assert.match(h, /<ol class="asst-liste"><li>un<\/li><\/ol><ul class="asst-liste"><li>deux<\/li><\/ul>/);
  assert.match(h, /<code>code<\/code>/);
  assert.doesNotMatch(h, /<b>x<\/b>/);
  assert.equal(app.htmlReponseAgentAssistant('a * b * c'), '<p>a * b * c</p>');
  assert.equal(app.htmlReponseAgentAssistant('| seule |'), '<p>| seule |</p>');
});

test('réponse de l’agent : liste numérotée interrompue par du texte ou une ligne vide garde sa numérotation, sous-puces rangées', () => {
  const h = app.htmlReponseAgentAssistant('1. **Condition de prêt**\n   Avant le 30 octobre.\n2. **Vente préalable**\n  - sans objet\n\n3. **Préemption**');
  assert.match(h, /<ol class="asst-liste"><li><b>Condition de prêt<\/b><br>Avant le 30 octobre\.<\/li><li><b>Vente préalable<\/b><ul class="asst-liste asst-sous-liste"><li>sans objet<\/li><\/ul><\/li><\/ol>/);
  assert.match(h, /<ol class="asst-liste" start="3"><li><b>Préemption<\/b><\/li><\/ol>/);
});

test('texte joint d’un acte : le plafond suit le modèle (Opus 700 000, les autres 180 000, Mistral 180 000)', () => {
  assert.equal(app.plafondCaracteresActeAssistant('claude-opus-5-5', '', false), 700000);
  assert.equal(app.plafondCaracteresActeAssistant('', 'claude-opus-5-5', false), 700000);
  assert.equal(app.plafondCaracteresActeAssistant('claude-sonnet-5-5', 'claude-opus-5-5', false), 180000);
  assert.equal(app.plafondCaracteresActeAssistant('claude-opus-5-5', '', true), 180000);
});

test('agenda lu par l’agent : la nature du rendez-vous, jamais son titre', () => {
  assert.equal(app.natureRendezVousAgent({ sujet: 'VTE - DUPONT / MARTIN' }), 'signature de vente');
  assert.equal(app.natureRendezVousAgent({ sujet: 'VTE - DUPONT ? — option CLAIRE, créneau 1/3' }), 'signature de vente (option, à confirmer)');
  assert.equal(app.natureRendezVousAgent({ sujet: 'Donation Lefebvre' }), 'donation');
  assert.equal(app.natureRendezVousAgent({ sujet: 'SUCC LEROY' }), 'succession');
  assert.equal(app.natureRendezVousAgent({ sujet: 'JV - appeler Karim' }), 'tâche d’un collaborateur');
  assert.equal(app.natureRendezVousAgent({ sujet: 'Déjeuner chez Paul' }), 'autre rendez-vous');
  assert.equal(app.natureRendezVousAgent(null), 'autre rendez-vous');
});

// ---- Plus de pouvoirs (étude 21/10) : client/96-assistant-pouvoirs.js ----
test('un lot d’actions : une phrase puis une ligne par action', () => {
  const app = chargerApplication();
  const t = app.descriptionLotAgent(['Marquer reçue la pièce « RIB » — VTE - MARTIN.', '', 'Noter dans l’historique : « relancé » — VTE - DURAND.']);
  assert.equal(t.split('\n')[0], '2 actions à faire, d’un seul coup :');
  assert.equal(t.split('\n').length, 3);
  assert.equal(app.descriptionLotAgent(['x']).split('\n')[0], '1 action à faire, d’un seul coup :');
  // La carte rend le lot en liste, échappée.
  const html = app.htmlAutorisationAgent(t.replace('relancé', '<b>relancé</b>'), '');
  assert.match(html, /<ul class="asst-liste"><li>/);
  assert.ok(!html.includes('<b>'));
});

test('identifiants opaques : un rendez-vous, un scan, un élément du NAS gardent le même identifiant', () => {
  const app = chargerApplication();
  const e = { itemId: 'AAMk-1', date: '2026-10-22' };
  const id = app.idEvenementAgent(e);
  assert.match(id, /^ev\d+$/);
  assert.equal(app.idEvenementAgent({ itemId: 'AAMk-1', date: '2026-10-22' }), id);
  assert.equal(app.idEvenementAgent({ date: '2026-10-22' }), '', 'sans identifiant Outlook, il ne se modifie pas');
  assert.equal(app.idScanAgent('SCAN_1.pdf'), app.idScanAgent('SCAN_1.pdf'));
  assert.notEqual(app.idScanAgent('SCAN_1.pdf'), app.idScanAgent('SCAN_2.pdf'));
  const f = app.idElementNasAgent('d1', '1 - Vendeur/CNI.pdf', 'fichier');
  const r = app.idElementNasAgent('d1', '1 - Vendeur', 'dossier');
  assert.match(f, /^nf\d+$/);
  assert.match(r, /^nd\d+$/);
  assert.equal(app.idElementNasAgent('d1', '1 - Vendeur/CNI.pdf', 'fichier'), f);
  app.reinitialiserPouvoirsAgent();
  assert.equal(app.idScanAgent('SCAN_9.pdf'), 'sc1');
});
