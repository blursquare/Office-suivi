'use strict';

// Relecture indépendante du 12/10 : agenda, Exchange, réglages.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NOMS_COLLABORATEURS, ecrireCompte, marquerRefus, lireComptes } = require('../src/comptesCollaborateurs');
const { assainirReglagesExchange } = require('../src/parametres/assainir');
const { horaireModifie } = require('../src/exchange/ews');
const { fusionnerTourSondages } = require('../src/sondagesCreneaux');
const { comparerNomsSauvegarde, RE_NOM_SAUVEGARDE } = require('../src/sauvegarde');

function fauxRepo() {
  const m = new Map();
  return { lireJsonBrut: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), ecrireJsonBrut: (k, v) => { m.set(k, JSON.stringify(v)); return v; } };
}

test('compte Exchange d’un collaborateur : réenregistrer sans changement garde le refus', () => {
  const repo = fauxRepo();
  const nom = NOMS_COLLABORATEURS[0];
  ecrireCompte(repo, nom, { identifiant: 'jdupont', motDePasse: 'secret' });
  marquerRefus(repo, nom);
  ecrireCompte(repo, nom, { identifiant: 'jdupont' });
  assert.ok(lireComptes(repo)[nom].refuseLe, 'refus gardé');
  ecrireCompte(repo, nom, { identifiant: 'jdupont', motDePasse: 'nouveau' });
  assert.ok(!lireComptes(repo)[nom].refuseLe, 'refus levé au changement');
});

test('réglages Exchange : actif absent = inchangé ; calendrier partagé vidable', () => {
  const avant = assainirReglagesExchange({ actif: true, email: 'a@b.fr', motDePasse: 'x', calendrierPartage: 'sophie@b.fr' }, {});
  const apres = assainirReglagesExchange({ pageSondage: '' }, avant);
  assert.equal(apres.actif, true);
  assert.equal(apres.calendrierPartage, 'sophie@b.fr');
  assert.equal(assainirReglagesExchange({ calendrierPartage: '' }, avant).calendrierPartage, '');
  assert.equal(assainirReglagesExchange({ actif: false }, avant).actif, false);
});

test('rendez-vous horaire sur plusieurs jours : la fin garde son jour', () => {
  const h = horaireModifie({ date: '2026-10-20', heure: '14:00', heureFin: '10:00', dateFin: '2026-10-21' });
  assert.ok(h && h.fin.startsWith('2026-10-21'));
  assert.equal(horaireModifie({ date: '2026-10-20', heure: '14:00', heureFin: '10:00' }), null);
});

test('tour des sondages : un sondage clos pendant le tour n’est pas rouvert, ses nouvelles réponses gardées', () => {
  const s = { id: 'S1', statut: 'ouvert', reponses: [] };
  const avant = new Map([['S1', JSON.stringify(s)]]);
  const duTour = [{ ...s, reponses: [{ cle: 'A', n: 1 }] }];
  const actuels = [{ ...s, statut: 'annule' }, { id: 'S2', statut: 'ouvert', reponses: [] }];
  const r = fusionnerTourSondages(actuels, duTour, avant);
  assert.equal(r.find(x => x.id === 'S1').statut, 'annule');
  assert.equal(r.find(x => x.id === 'S1').reponses.length, 1);
  assert.ok(r.some(x => x.id === 'S2'), 'sondage créé pendant le tour gardé');
  // Changé par le tour seul : la version du tour.
  assert.equal(fusionnerTourSondages([s], duTour, avant)[0].reponses.length, 1);
});

test('sauvegardes : une seconde le même jour a son heure, l’ordre reste chronologique', () => {
  assert.ok(RE_NOM_SAUVEGARDE.test('claire-2026-10-12-143000.db'));
  const noms = ['claire-2026-10-12-143000.db', 'claire-2026-10-13.db', 'claire-2026-10-12.db'].sort(comparerNomsSauvegarde);
  assert.equal(noms.join(','), 'claire-2026-10-12.db,claire-2026-10-12-143000.db,claire-2026-10-13.db');
});
