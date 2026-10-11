'use strict';

// « Demander à CLAIRE » façon Slack (étude 11/10, client/49-assistant.js) : groupement des messages d'un même auteur,
// séparateur de jour, mention d'un dossier avec @, et suites rapides comprises sans IA.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const A = require('../commun/assistant');

const app = chargerApplication();
const t0 = new Date(2026, 9, 11, 9, 12).getTime();

test('messages : un groupe par auteur, nouveau groupe après 5 minutes ou au changement de jour', () => {
  const r = app.repereMessagesAssistant([
    { role: 'moi', quand: t0 },
    { role: 'moi', quand: t0 + 60000 },
    { role: 'claire', quand: t0 + 70000 },
    { role: 'claire', quand: t0 + 70000 + 6 * 60000 },
    { role: 'claire', quand: new Date(2026, 9, 12, 8, 0).getTime() }
  ]);
  assert.equal(JSON.stringify(r.map(x => x.debutGroupe)), '[true,false,true,true,true]');
  assert.equal(JSON.stringify(r.map(x => x.nouveauJour)), '[true,false,false,false,true]');
});

test('séparateur de jour : Aujourd’hui, Hier, puis la date', () => {
  const maintenant = new Date(2026, 9, 11, 15, 0).getTime();
  assert.equal(app.libelleJourAssistant(t0, maintenant), 'Aujourd’hui');
  assert.equal(app.libelleJourAssistant(t0 - 86400000, maintenant), 'Hier');
  assert.match(app.libelleJourAssistant(t0 - 3 * 86400000, maintenant), /octobre/);
});

test('@ : dossiers dont un mot commence par la saisie, en cours avant archivés, 6 au plus', () => {
  const liste = [
    { id: 'a', nom: 'MOREAU / LAMBERT', archive: true },
    { id: 'b', nom: 'MOREL / DUPONT' },
    { id: 'c', nom: 'LEROY', parties: [{ nom: 'Paul MORIN' }] },
    { id: 'd', nom: 'DURAND' }
  ];
  assert.equal(app.dossiersMentionAssistant(liste, 'mor').map(d => d.id).join(','), 'c,b,a');
  assert.equal(app.dossiersMentionAssistant(liste, 'lamb').map(d => d.id).join(','), 'a');
  assert.equal(app.dossiersMentionAssistant(liste, 'Dùp').map(d => d.id).join(','), 'b', 'sans accent ni casse');
  assert.equal(app.dossiersMentionAssistant(liste, 'zz').length, 0);
  const beaucoup = Array.from({ length: 10 }, (_, i) => ({ id: String(i), nom: 'MARTIN ' + i }));
  assert.equal(app.dossiersMentionAssistant(beaucoup, 'mar').length, 6);
});

test('suites rapides : comprises par les mots-clés, sans IA', () => {
  app.relancesAssistant().filter(r => !r.completer).forEach(r => {
    const c = A.interpreterParMotsCles(r.texte, { aujourdhui: '2026-10-11' });
    assert.equal(c.surete, 'haute', r.texte);
    assert.notEqual(c.intention, 'inconnu', r.texte);
  });
});

test('@ : le dossier choisi est imposé tant que son nom reste dans la phrase, le dernier choisi l’emporte', () => {
  const mentions = [{ nom: 'ROY', id: 'archive' }, { nom: 'MOREAU / LAMBERT', id: 'm' }];
  assert.equal(app.dossierMentionneAssistant('Relance ROY pour le prêt', mentions), 'archive');
  assert.equal(app.dossierMentionneAssistant('ROY et MOREAU / LAMBERT', mentions), 'm');
  assert.equal(app.dossierMentionneAssistant('Mes tâches du jour', mentions), '', 'nom effacé : rien d’imposé');
  assert.equal(app.dossierMentionneAssistant('ROY', []), '');
});
