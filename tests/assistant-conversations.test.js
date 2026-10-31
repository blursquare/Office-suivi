'use strict';

// « Demander à CLAIRE » : plusieurs conversations (étude 12/10, client/63-assistant-conversations.js) — gardées sur le poste,
// 30 jours, 20 au plus, sans les boutons ; titres ; groupes de la colonne.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const MAINTENANT = new Date(2026, 9, 12, 15, 0).getTime();
const conv = (id, ilYaJours, titre) => ({ id, majLe: MAINTENANT - ilYaJours * 86400000, creeLe: MAINTENANT - ilYaJours * 86400000,
  messages: [{ role: 'moi', html: escape(titre), quand: 1 }, { role: 'claire', html: '<p>Réponse</p>', boutons: [{ libelle: 'Annuler', action: () => {} }], quand: 2 }],
  contexte: { dossierId: 'd1', attente: { type: 'dossier' }, historique: [], echanges: [] } });
function escape(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;'); }

test('titre : la première demande, en texte, 60 caractères au plus', () => {
  assert.equal(app.titreConversationAssistant([{ role: 'claire', html: '<p>Bonjour</p>' }, { role: 'moi', html: 'Où en est l&#39;offre &amp; le RIB ?' }]), 'Où en est l\'offre & le RIB ?');
  assert.equal(app.titreConversationAssistant([]), 'Nouvelle conversation');
  assert.ok(app.titreConversationAssistant([{ role: 'moi', html: 'x'.repeat(100) }]).length <= 60);
});

test('gardées : non vides, moins de 30 jours, 20 au plus, la plus récente d’abord ; écrites sans boutons ni attente', () => {
  const liste = [conv('a', 2, 'Deux'), conv('b', 0, 'Zéro'), conv('c', 40, 'Vieille'), { id: 'v', majLe: MAINTENANT, messages: [] }];
  for (let i = 0; i < 25; i++) liste.push(conv('n' + i, 1 + i / 100, 'N' + i));
  const g = app.conversationsAGarderAssistant(liste, MAINTENANT);
  assert.equal(g.length, 20);
  assert.equal(g[0].id, 'b');
  assert.ok(!g.some(c => c.id === 'c' || c.id === 'v'));
  const ecrit = app.serialiserConversationsAssistant([conv('a', 2, 'Deux')], MAINTENANT);
  assert.doesNotMatch(ecrit, /boutons|attente|Annuler/);
  const relu = app.lireConversationsAssistant(ecrit, MAINTENANT);
  assert.equal(relu.length, 1);
  assert.equal(relu[0].titre, 'Deux');
  assert.equal(relu[0].messages[1].boutons.length, 0);
  assert.equal(relu[0].contexte.attente, null);
  assert.equal(relu[0].contexte.dossierId, 'd1');
  assert.equal(app.lireConversationsAssistant('{illisible', MAINTENANT).length, 0);
  assert.equal(app.lireConversationsAssistant('{"a":1}', MAINTENANT).length, 0);
});

test('groupes : Aujourd’hui, Hier, 7 derniers jours, Plus anciennes', () => {
  const g = app.groupesConversationsAssistant([conv('a', 0.1, 'A'), conv('b', 1, 'B'), conv('c', 3, 'C'), conv('d', 20, 'D')], MAINTENANT);
  assert.equal(g.map(x => x.titre + ':' + x.conversations.map(c => c.id).join('')).join(','), 'Aujourd’hui:a,Hier:b,7 derniers jours:c,Plus anciennes:d');
});

test('étude 12/10 : jamais « Sauf erreur de ma part » — filtre des réponses de l’IA et textes d’emails de CLAIRE', () => {
  const A = require('../commun/assistant.js');
  assert.equal(A.sansSaufErreur('Sauf erreur de ma part, les fonds ne sont pas arrivés.'), 'Les fonds ne sont pas arrivés.');
  assert.equal(A.sansSaufErreur('Bonjour,\n\nSauf erreur de notre part, il manque le RIB.'), 'Bonjour,\n\nIl manque le RIB.');
  assert.equal(A.sansSaufErreur('Le RIB, sauf erreur de ma part, manque.'), 'Le RIB manque.');
  assert.equal(A.sansSaufErreur('Le prêt est accordé, sauf erreur ou omission de notre part.'), 'Le prêt est accordé.');
  assert.equal(A.sansSaufErreur('Il manque (sauf erreur de ma part) le RIB.'), 'Il manque le RIB.');
  assert.equal(A.sansSaufErreur('Le RIB manque. Sauf erreur de notre part. Merci.'), 'Le RIB manque. Merci.');
  assert.equal(A.sansSaufErreur('Le RIB manque — sauf erreur de ma part.'), 'Le RIB manque.');
  assert.equal(A.sansSaufErreur('- Sauf erreur de ma part, le RIB manque'), '- Le RIB manque');
  assert.equal(A.sansSaufErreur('Sauf erreur de ma part, **le prêt** est accordé.'), '**Le prêt** est accordé.');
  assert.equal(A.sansSaufErreur('Sauf  erreur, de ma part, il manque.'), 'Il manque.');
  assert.equal(A.sansSaufErreur('Bonjour !  Ça va ?'), 'Bonjour !  Ça va ?', 'un texte sans la formule reste tel quel');
  // Aucun texte de CLAIRE ne la contient (seules les consignes « jamais … » la citent).
  const fs = require('node:fs');
  const path = require('node:path');
  const racine = path.join(__dirname, '..');
  const lister = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? lister(path.join(d, e.name)) : /\.(js|html|gs)$/.test(e.name) ? [path.join(d, e.name)] : []);
  for (const f of ['client', 'commun', 'server/src', 'page-sondage'].flatMap(d => fs.existsSync(path.join(racine, d)) ? lister(path.join(racine, d)) : [])) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (/sauf\s+erreur(\s+ou\s+omission)?\s+de\s+(ma|notre)\s+part/i.test(l) && !/jamais|ne pas mettre|sansSaufErreur|MOTS_SAUF_ERREUR|«\s*\(?sauf erreur|Sauf erreur ou omission de notre part le RIB|\/\/|^\s*\*/i.test(l)) assert.fail(`${path.relative(racine, f)}:${i + 1} contient la formule`);
    });
  }
});

test('conversation unique (0.404.0) : nouveau sujet sur un autre dossier ou après trois heures ; sujets précédents de moins de 7 jours', () => {
  const t0 = Date.UTC(2026, 9, 30, 9, 0);
  const msgs = [{ role: 'moi', html: 'x', quand: t0 }];
  assert.equal(app.nouveauSujetAssistant([], 'd1', 'd2', t0), false, 'sujet vide : on y reste');
  assert.equal(app.nouveauSujetAssistant(msgs, 'd1', 'd2', t0 + 60000), true, 'autre dossier cité');
  assert.equal(app.nouveauSujetAssistant(msgs, 'd1', 'd1', t0 + 60000), false);
  assert.equal(app.nouveauSujetAssistant(msgs, 'd1', '', t0 + 60000), false, 'aucun dossier cité');
  assert.equal(app.nouveauSujetAssistant(msgs, '', 'd2', t0 + 60000), false, 'sujet sans dossier : le dossier cité s’y rattache');
  assert.equal(app.nouveauSujetAssistant(msgs, 'd1', '', t0 + 4 * 3600000), true, 'trois heures sans échange');
  const conv = (id, majLe) => ({ id, majLe, messages: [{ role: 'moi', html: id }] });
  const liste = [conv('a', t0 - 8 * 86400000), conv('b', t0 - 86400000), conv('c', t0 - 3600000), conv('d', t0 - 60000), conv('e', t0 - 120000)];
  assert.equal(app.sujetsPrecedentsAssistant(liste, 'd', t0).map(c => c.id).join(','), 'b,c,e');
  assert.equal(app.sujetAReprendreAssistant(liste, t0).id, 'd');
  assert.equal(app.sujetAReprendreAssistant([conv('x', t0 - 4 * 3600000)], t0), null);
});

test('CLAIRE flottante : écran d’outil ou fiche en page, jamais sur Discussions, sur l’ordinateur de CLAIRE ni sans agent', () => {
  assert.equal(app.claireFlottanteVisible('appel-fonds', false, true, false), true);
  assert.equal(app.claireFlottanteVisible('dashboard', true, true, false), true, 'fiche en page');
  assert.equal(app.claireFlottanteVisible('dashboard', false, true, false), false, 'le tableau de bord a son widget');
  assert.equal(app.claireFlottanteVisible('assistant', true, true, false), false);
  assert.equal(app.claireFlottanteVisible('quotites', false, false, false), false, 'agent indisponible');
  assert.equal(app.claireFlottanteVisible('quotites', false, true, true), false, 'ordinateur de CLAIRE');
});

test('htmlAncienMessageAssistant : un ancien sujet se lit sans boutons, champs ni gestionnaires (audit 0.404.0, B9)', () => {
  const h = app.htmlAncienMessageAssistant('<p id="x" onclick="f()">Texte</p><wa-button onclick="g()">Corriger</wa-button><textarea>a</textarea><input id="y">');
  assert.equal(h, '<p>Texte</p>');
});

test('CLAIRE flottante : les collègues cités par @, jamais soi-même ni CLAIRE (étude 31/10)', () => {
  const { chargerApplication } = require('./helpers/load-app.js');
  const app = chargerApplication();
  require('node:vm').runInContext("utilisateurPoste = 'Bastien ANGLUMENT'; canaux.collaborateurs = [];", app);
  const cites = app.collegueCitesClaireFlottante('@julie peux-tu regarder ? @Bastien @CLAIRE @jérémy');
  assert.equal(cites.join('|'), 'Julie VASSELIN|Jérémy SAUJOT');
  assert.equal(app.collegueCitesClaireFlottante('écrire à julie@exemple.fr').length, 0);
});
