'use strict';

// Étude 18/10 : animations qui aident à comprendre (client/86-animations.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('montants : lus depuis l’affichage, valeur exacte à l’arrivée', () => {
  assert.equal(app.nombreDepuisMontantAffiche('24.145,55 €'), 24145.55);
  assert.equal(app.nombreDepuisMontantAffiche('1.200 €'), 1200);
  assert.equal(app.nombreDepuisMontantAffiche('—'), null);
  assert.equal(app.nombreDepuisMontantAffiche('12 jours'), null, 'pas un montant en euros');
  assert.equal(app.montantIntermediaire(100, 200, 1), 200);
  assert.equal(app.montantIntermediaire(100, 200, 0), 100);
  const milieu = app.montantIntermediaire(100, 200, 0.5);
  assert.ok(milieu > 150 && milieu < 200, 'courbe douce : plus de la moitié du chemin à mi-temps');
});

test('« Enregistré » sur le bouton : seulement pour une confirmation simple', () => {
  assert.equal(app.messageEnregistrementSimple('Modèle enregistré.'), true);
  assert.equal(app.messageEnregistrementSimple('Modifications enregistrées.'), true);
  assert.equal(app.messageEnregistrementSimple('Réglage non enregistré : refus'), false);
  assert.equal(app.messageEnregistrementSimple('Serveur injoignable : la modification sera enregistrée dès son retour.'), false);
  assert.equal(app.messageEnregistrementSimple('Dossier archivé.'), false);
});

test('« réduire les animations » : tout mouvement de CLAIRE a sa règle d’arrêt', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  const bloc = css.slice(css.indexOf('/* ==== Animations qui aident à comprendre'));
  const reduit = bloc.slice(bloc.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  for (const sel of ['.anim-etape-coche.anim-trace path', '.ja.fait.vient-de-finir .ja-coche', '.app-main > .onglet-panel', '.widgets-grille > .widget.anim-entree', '.sidebar-sousmenu:not(.ferme) > *', '.piece-tuile.anim-pose .piece-tuile-etat']) {
    assert.ok(reduit.includes(sel), `arrêt manquant pour ${sel}`);
  }
  // Jamais la taille de la mise en page : aucune animation de width, height, margin ou padding dans le bloc.
  const images = bloc.match(/@keyframes [\s\S]*?\}\s*\}/g) || [];
  for (const k of images) assert.doesNotMatch(k, /\b(width|height|margin|padding|top|left)\s*:/, k.slice(0, 60));
});

test('« Enregistré » : un message qui demande d’enregistrer n’est pas une confirmation (relecture)', () => {
  assert.equal(app.messageEnregistrementSimple('Saisissez le prix et le département avant d’enregistrer.'), false);
});
