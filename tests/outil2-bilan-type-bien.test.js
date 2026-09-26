'use strict';

// Relecture d'actes : grille adaptée au type de bien, bilan (validé / à surveiller côte à côte),
// analyses enregistrées, et délai avant la date butoir de prêt au tableau de bord.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();
const ids = (liste) => liste.map(p => p.id);

test('grille : un terrain à bâtir ne pose ni diagnostics du bâti ni copropriété, mais ses propres points', () => {
  const terrain = ids(app.grillePourModeOutil2('compromis', 'terrain'));
  for (const absent of ['dpe', 'amiante', 'plomb', 'electricite', 'gaz', 'termites', 'carrez', 'alur_charges', 'conformite_travaux']) {
    assert.ok(terrain.indexOf(absent) < 0, absent + ' ne doit pas être posé sur un terrain');
  }
  for (const present of ['erp', 'terrain_bornage', 'terrain_viabilisation', 'terrain_etude_sol', 'terrain_permis', 'terrain_constructibilite']) {
    assert.ok(terrain.indexOf(present) >= 0, present + ' doit être posé sur un terrain');
  }
  assert.ok(ids(app.grillePourModeOutil2('acte', 'terrain')).indexOf('terrain_permis_purge') >= 0);
});

test('grille : la copropriété seule porte les points ALUR et Carrez, la maison aucun', () => {
  const copro = ids(app.grillePourModeOutil2('compromis', 'copropriete'));
  const maison = ids(app.grillePourModeOutil2('compromis', 'maison'));
  for (const id of ['alur_charges', 'alur_fonds_travaux', 'copro_multiples', 'carrez']) {
    assert.ok(copro.indexOf(id) >= 0, id);
    assert.ok(maison.indexOf(id) < 0, id);
  }
  assert.ok(maison.indexOf('dpe') >= 0 && maison.indexOf('terrain_bornage') < 0);
  // Sans type connu, tout reste posé (le modèle marque « sans objet »).
  const tout = ids(app.grillePourModeOutil2('compromis'));
  assert.ok(tout.indexOf('carrez') >= 0 && tout.indexOf('terrain_bornage') >= 0);
});

test('grille : les retours de l’étude deviennent des consignes durables', () => {
  const g = app.grillePourModeOutil2('compromis');
  const consigne = id => (g.find(p => p.id === id) || {}).consigne || '';
  assert.match(consigne('termites'), /hors d'une zone contaminée/);
  assert.match(consigne('plomb'), /1er janvier 1949/);
  assert.match(consigne('amiante'), /1er juillet 1997/);
  assert.match(consigne('electricite'), /en l'état/);
  assert.match(consigne('date_acte_authentique'), /à définir/);
  assert.match(consigne('situation_urbanisme'), /monument historique/);
});

test('bilan : les points d’un thème filtrés par type de bien, puis répartis validé / à surveiller', () => {
  const analyse = { points: [
    { id: 'dpe', statut: 'present', commentaire: 'DPE du 3 mars 2024.', citations: [] },
    { id: 'terrain_bornage', statut: 'absent', commentaire: 'Aucun bornage.', citations: [] },
    { id: 'erp', statut: 'a_verifier', commentaire: '', citations: [] }
  ] };
  const diag = app.sectionsTableauDeBordOutil2(analyse, 'compromis', 'terrain').find(s => s.cle === 'diagnostics');
  assert.ok(!diag.lignes.some(l => l.id === 'dpe'), 'pas de DPE sur un terrain');
  const r = app.repartirLignesThemeRelecture([
    { id: 'a', niveau: 'valide' }, { id: 'b', niveau: 'surveiller' }, { id: 'c', niveau: 'critique' }, { id: 'd', niveau: 'na' }
  ]);
  assert.equal(r.aTraiter.map(l => l.id).join(','), 'c,b', 'le critique d’abord');
  assert.equal(r.valides.map(l => l.id).join(','), 'a');
  assert.equal(r.na.map(l => l.id).join(','), 'd');
});

test('bilan : le contrôle CLAIRE n’affiche que « Ce que dit l’acte »', () => {
  const cats = app.categoriesClaireBilanRelecture();
  assert.ok(cats.has('DIAGNOSTICS') && cats.has('TRAVAUX_REALISES'));
  assert.ok(!cats.has('COMPARAISON_COMPROMIS') && !cats.has('ETAT_DATE') && !cats.has('URBANISME'));
});

test('analyses enregistrées : recherche sans accents sur le dossier et le document', () => {
  const liste = [
    { id: '1', dossierNom: 'DÉPONT / MARTIN', libelle: 'Projet.pdf', mode: 'acte' },
    { id: '2', dossierNom: '', libelle: 'Compromis LEROY.pdf', mode: 'compromis' }
  ];
  assert.equal(app.filtrerHistoriqueRelectures(liste, 'depont').map(h => h.id).join(','), '1');
  assert.equal(app.filtrerHistoriqueRelectures(liste, 'leroy').map(h => h.id).join(','), '2');
  assert.equal(app.filtrerHistoriqueRelectures(liste, '').length, 2);
});

