'use strict';

// Onglets de travail (étude 11/10, client/60-onglets-travail.js) : fiches et outils ouverts, fermés, réordonnés, gardés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const cles = (l) => l.map(o => app.cleOngletTravail(o)).join(',');

test('ouvrir : ajouté à la fin, jamais en double ; au-delà de 12, le plus ancien non actif part', () => {
  let l = [];
  l = app.ajouterOngletTravailListe(l, { type: 'dossier', id: 'a' }, 'd:a');
  l = app.ajouterOngletTravailListe(l, { type: 'outil', nom: 'quotites' }, 'o:quotites');
  l = app.ajouterOngletTravailListe(l, { type: 'dossier', id: 'a' }, 'd:a');
  assert.equal(cles(l), 'd:a,o:quotites');
  let p = [];
  for (let i = 0; i < 12; i++) p = app.ajouterOngletTravailListe(p, { type: 'dossier', id: String(i) }, 'd:0');
  p = app.ajouterOngletTravailListe(p, { type: 'dossier', id: 'x' }, 'd:0');
  assert.equal(p.length, 12);
  assert.ok(cles(p).startsWith('d:0,d:2'), 'l’actif reste, le suivant le plus ancien part : ' + cles(p));
  assert.ok(cles(p).endsWith('d:x'));
});

test('fermer : on passe au suivant, sinon au précédent, sinon à rien', () => {
  const l = [{ type: 'dossier', id: 'a' }, { type: 'dossier', id: 'b' }, { type: 'outil', nom: 'prorata' }];
  assert.equal(app.cleOngletTravail(app.voisinOngletTravail(l, 0)), 'd:b');
  assert.equal(app.cleOngletTravail(app.voisinOngletTravail(l, 2)), 'd:b');
  assert.equal(app.voisinOngletTravail([l[0]], 0), null);
});

test('réordonner : l’onglet glissé prend la place visée', () => {
  const l = ['a', 'b', 'c', 'd'].map(id => ({ type: 'dossier', id }));
  assert.equal(cles(app.deplacerOngletTravailListe(l, 0, 2)), 'd:b,d:c,d:a,d:d');
  assert.equal(cles(app.deplacerOngletTravailListe(l, 3, 0)), 'd:d,d:a,d:b,d:c');
  assert.equal(cles(app.deplacerOngletTravailListe(l, 1, 9)), 'd:a,d:b,d:c,d:d', 'index hors liste : rien ne bouge');
});

test('au chargement : formes abîmées, dossiers disparus, écrans inconnus et doublons écartés', () => {
  const lus = [{ type: 'dossier', id: 'a' }, { type: 'dossier', id: 'disparu' }, { type: 'outil', nom: 'reglages' },
    { type: 'outil', nom: 'appel-fonds' }, null, 'x', { type: 'dossier', id: 'a' }, { type: 'outil', nom: 'appel-fonds', extra: 1 }];
  assert.equal(cles(app.ongletsTravailValides(lus, ['a', 'b'])), 'd:a,o:appel-fonds');
  assert.equal(app.ongletsTravailValides('pas une liste', ['a']).length, 0);
});

test('fiche à côté : largeur bornée — 480 px au moins, et 480 px laissés à l’écran d’à côté', () => {
  assert.equal(app.largeurFicheCoteBornee(600, 1400), 600);
  assert.equal(app.largeurFicheCoteBornee(200, 1400), 480);
  assert.equal(app.largeurFicheCoteBornee(1300, 1400), 920);
  assert.equal(app.largeurFicheCoteBornee(0, 1400), 644, 'sans largeur gardée : 46 % de la place');
  assert.equal(app.largeurFicheCoteBornee('abc', 900), 480);
});
