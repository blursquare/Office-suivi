'use strict';

// « Demander à CLAIRE » façon Slack (étude 11/10, client/49-assistant.js) : groupement des messages d'un même auteur,
// séparateur de jour, mention d'un dossier avec @, et suites rapides comprises sans IA.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

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

test('@ : le dossier choisi est imposé tant que son nom reste dans la phrase, le dernier choisi l’emporte', () => {
  const mentions = [{ nom: 'ROY', id: 'archive' }, { nom: 'MOREAU / LAMBERT', id: 'm' }];
  assert.equal(app.dossierMentionneAssistant('Relance ROY pour le prêt', mentions), 'archive');
  assert.equal(app.dossierMentionneAssistant('ROY et MOREAU / LAMBERT', mentions), 'm');
  assert.equal(app.dossierMentionneAssistant('Mes tâches du jour', mentions), '', 'nom effacé : rien d’imposé');
  assert.equal(app.dossierMentionneAssistant('ROY', []), '');
});

test('pièce jointe : la légende dit la sorte et la taille, la carte porte un identifiant et jamais le nom dans un attribut de code', () => {
  assert.equal(app.legendePieceJointeAssistant('pdf', 2.4 * 1024 * 1024), 'PDF · 2,4 Mo');
  assert.equal(app.legendePieceJointeAssistant('image', 850 * 1024), 'Image · 850 Ko');
  assert.equal(app.legendePieceJointeAssistant('pdf', 0), 'PDF');
  const html = app.htmlCartePieceJointeAssistant({ id: 'pj3', nom: 'Compromis <MARTIN>.pdf', sorte: 'pdf', fichier: { size: 1024 } });
  assert.match(html, /ouvrirApercuPieceJointe\('pj3', ''\)/);
  assert.doesNotMatch(html, /<MARTIN>/);
  assert.match(html, /data-pj="pj3"/);
});

test('titre d’une conversation : sans le nom des pièces jointes', () => {
  const html = 'Que contient cet avis ?<div class="asst-pj-liste"><button class="asst-pj-carte"><span class="asst-pj-titre">avis-taxe-fonciere.png</span></button></div>';
  assert.equal(app.titreConversationAssistant([{ role: 'moi', html }]), 'Que contient cet avis ?');
});

test('pièce jointe d’un canal : carte avec son identifiant serveur, ou pastille du nom pour un message d’avant', () => {
  const avec = app.htmlPiecesCanal({ pj: [{ nom: 'Compromis.pdf', type: 'pdf', fichierId: 'a'.repeat(32), taille: 2048 }] });
  assert.match(avec, /asst-pj-carte/);
  assert.match(avec, new RegExp(`ouvrirApercuPieceJointe\\('', '${'a'.repeat(32)}'\\)`));
  assert.match(avec, /data-sorte="pdf"/);
  const sans = app.htmlPiecesCanal({ pj: [{ nom: 'Ancien.pdf', type: 'pdf' }] });
  assert.doesNotMatch(sans, /asst-pj-carte/);
  assert.match(sans, /Ancien\.pdf/);
});

test('modifier un message : le champ de correction est dans la liste ET dans le fil (il manquait au fil), sans doublon pour le message de départ', () => {
  const m = { id: 'm1', role: 'moi', texte: 'Bonjour', quand: t0, auteur: 'Bastien ANGLUMENT' };
  assert.match(app.htmlEditionMessageCanal(m), /id="canal-edition"[^>]*>Bonjour<\/textarea>/);
  app.canaux.edition = 'm1';
  app.canaux.fil = '';
  assert.match(app.htmlMessageFil(m), /id="canal-edition"/, 'réponse du fil en cours de correction');
  app.canaux.fil = 'm1';
  assert.doesNotMatch(app.htmlMessageFil(m), /id="canal-edition"/, 'le message de départ se corrige dans la liste, un seul champ');
  app.canaux.edition = ''; app.canaux.fil = '';
});
