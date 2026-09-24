'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

// Premier passage de l'étude dans la relecture d'actes (24/09/2026) : ses commentaires sont devenus
// des consignes de la grille, et la visionneuse montre la page entière.

const app = chargerApplication();

function point(mode, id) {
  return app.grillePourModeOutil2(mode).find(p => p.id === id);
}

test('grille : les points demandés par l’étude existent, avec leur consigne', () => {
  for (const id of ['notaire_redacteur', 'ddt_recapitulatif', 'usage_location_touristique', 'alur_travaux_copro']) {
    const p = point('compromis', id);
    assert.ok(p, id);
    assert.ok(p.consigne.length > 30, id);
  }
  assert.match(point('compromis', 'designation_bien').consigne, /5 %/);
  assert.match(point('compromis', 'dpe').consigne, /plusieurs DPE/);
  assert.match(point('compromis', 'date_acte_authentique').consigne, /mandat de vente/);
  assert.match(point('compromis', 'conformite_travaux').consigne, /VENDEUR[\s\S]*copropriété/);
  assert.match(point('compromis', 'honoraires').consigne, /compris dans le prix/);
  assert.match(point('compromis', 'alur_fonds_travaux').consigne, /rembourse/);
  assert.match(point('compromis', 'alur_pv_ag').consigne, /dernière assemblée[\s\S]*prochaine/);
  assert.match(point('compromis', 'alur_charges').consigne, /pré-état daté/);
  // Un point sans consigne en transmet une vide, jamais undefined.
  assert.equal(point('compromis', 'amiante').consigne, '');
});

test('quotités : la consigne dépend du stade de l’acte', () => {
  assert.match(point('compromis', 'quotites').consigne, /sans incidence immédiate[\s\S]*jamais « absent »/);
  assert.match(point('acte', 'quotites').consigne, /concordance avec l'avant-contrat/);
});

const base = { dossierCle: 'document:x', constat: { titre: 'Titre' } };

test('consignes : un avis juste avec remarque est transmis, sans remarque non', () => {
  const c = app.consignesDepuisRetours([
    { ...base, verdict: 'juste', portee: 'tous', commentaire: 'Vérifier un écart de plus de 5 %' },
    { ...base, verdict: 'juste', portee: 'tous', commentaire: '' }
  ], 'document:x');
  assert.equal(c.length, 1);
  assert.match(c[0], /jugé juste[\s\S]*5 %/);
});

test('consignes : gravité transmise même sans commentaire, dans la portée du dossier seulement', () => {
  const r = { ...base, verdict: 'gravite', portee: 'dossier', commentaire: '', graviteSouhaitee: 'INFORMATION' };
  assert.match(app.consignesDepuisRetours([r], 'document:x')[0], /gravité attendue information$/);
  assert.equal(app.consignesDepuisRetours([r], 'document:autre').length, 0);
});

test('consignes : un oubli sur plusieurs lignes donne une consigne par ligne', () => {
  const c = app.consignesDepuisRetours([
    { dossierCle: 'document:x', verdict: 'manque', portee: 'tous', constat: null, commentaire: 'Préciser le notaire rédacteur\n\nDonner la date de la dernière AG\n' }
  ], null);
  assert.equal(c.join('|'), 'Vérifie aussi : Préciser le notaire rédacteur|Vérifie aussi : Donner la date de la dernière AG');
});

test('visionneuse : la page entière tient dans la zone, sans déformation', () => {
  // A4 portrait (595 × 842) dans un panneau de 600 × 700 : c'est la hauteur qui limite.
  const t = app.tailleAjusteePage(595, 842, 600, 700);
  assert.equal(t.hauteur, 676);
  assert.ok(t.largeur <= 576);
  assert.ok(Math.abs(t.largeur / t.hauteur - 595 / 842) < 0.01);
  // Panneau large et bas : la hauteur limite ; panneau étroit et haut : la largeur limite.
  const etroit = app.tailleAjusteePage(595, 842, 300, 2000);
  assert.equal(etroit.largeur, 276);
  assert.ok(etroit.hauteur < 2000 - 24);
});
