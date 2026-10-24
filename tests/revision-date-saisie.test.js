// Étape « Vérifier » de Nouveau dossier : une date n'est retenue qu'en quittant le champ ou par Entrée
// (étude 23/10 : « il valide la date avant même que j'ai terminé d'écrire »).
const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app.js');

test('le champ date du panneau Vérifier ne réagit pas à change, seulement à blur et Entrée', () => {
  const app = chargerApplication();
  const html = app.champSaisieRevision({ cle: 'pret', type: 'date' }, { valeur: '2026-11-15' });
  assert.ok(!/onchange=/.test(html), html);
  assert.ok(/onblur="validerDateRevision\(this, 'pret'\)"/.test(html), html);
  assert.ok(/event\.key==='Enter'/.test(html), html);
});

test('validerDateRevision ne retient qu’une date changée et complète', () => {
  const app = chargerApplication();
  const appels = [];
  app.modifierDonneeRevision = (cle, v) => appels.push(cle + '=' + v);
  app.validerDateRevision({ value: '2026-11-15', defaultValue: '2026-11-15' }, 'pret');
  app.validerDateRevision({ value: '0002-11-15', defaultValue: '2026-11-15' }, 'pret');
  const champ = { value: '2026-11-20', defaultValue: '2026-11-15' };
  app.validerDateRevision(champ, 'pret');
  app.validerDateRevision(champ, 'pret');
  assert.strictEqual(appels.join('|'), 'pret=2026-11-20');
});
