'use strict';

// « Demander à CLAIRE » en agent (étude 11/10) : mise en forme de la réponse (échappée, listes, gras), sans jamais de HTML venu de l'IA.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('réponse de l’agent : paragraphes, listes à puces, gras ; tout le reste échappé', () => {
  const h = app.htmlReponseAgentAssistant('Le dossier est **en attente**.\n\n- Offre de prêt\n- Titre <script>x</script>\n\nVoulez-vous que je relance ?');
  assert.equal(h, '<p>Le dossier est <b>en attente</b>.</p><ul class="asst-liste"><li>Offre de prêt</li><li>Titre &lt;script&gt;x&lt;/script&gt;</li></ul><p>Voulez-vous que je relance ?</p>');
  assert.equal(app.htmlReponseAgentAssistant('1. un\n2) deux'), '<ul class="asst-liste"><li>un</li><li>deux</li></ul>');
  assert.equal(app.htmlReponseAgentAssistant('ligne 1\nligne 2'), '<p>ligne 1<br>ligne 2</p>');
  assert.equal(app.htmlReponseAgentAssistant(''), '<p></p>');
});
