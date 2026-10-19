'use strict';
// Fiche d'une vente : parcelles et surfaces (étude 16/10). Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();


test('fiche : les parcelles avec leur surface (étude 16/10 : « les surfaces des parcelles ne remontent pas dans la fiche dossier »)', () => {
  const d = { bien: { cadastre: { section: 'EV', numero: '10', parcelles: [
    { section: 'EV', numero: '0010', surface: '00ha 06a 06ca', nature: 'Sol' }, { section: 'ev', numero: '11', surface: '1 206', lieuDit: 'Les Vignes' }] } } };
  const p = app.parcellesAfficheesFiche(d);
  assert.equal(p.lignes.map((l) => `${l.ref}=${l.surface}`).join(' | '), 'EV 10=6 a 6 ca | EV 11=12 a 6 ca');
  assert.equal(p.total, '18 a 12 ca');
  const html = app.renderParcellesFiche(d);
  assert.ok(/EV 10/.test(html) && /Les Vignes/.test(html) && /Total/.test(html));
  // Une surface manquante : dite, jamais devinée, pas de total.
  const sans = app.parcellesAfficheesFiche({ bien: { cadastre: { parcelles: [{ section: 'AB', numero: '1' }, { section: 'AB', numero: '2', surface: '512' }] } } });
  assert.equal(sans.total, '');
  assert.equal(sans.manquantes, 1);
  assert.equal(app.renderParcellesFiche({}), '');
});

test('parcelles : contenance nulle = inconnue, complétée par le cadastre lu dans le contrôle de l\'urbanisme (étude 19/10)', () => {
  const d = { bien: { cadastre: { parcelles: [{ section: 'A', numero: '221', surface: '0' }, { section: 'A', numero: '222', surface: '00 ca' }, { section: 'A', numero: '223' }] } },
    preemption: { parcelles: [{ parcelle: 'A 221', contenance: 1038 }, { parcelle: 'A 222', contenance: 153 }] } };
  const p = app.parcellesAfficheesFiche(d);
  assert.equal(p.lignes.map(l => l.m2).join('|'), '1038|153|');
  assert.equal(p.manquantes, 1);
  // Authentic qui donne la contenance complète une parcelle à « 0 ».
  const dd = { bien: { cadastre: { section: 'A', numero: '221', parcelles: [{ section: 'A', numero: '221', surface: '0' }] } } };
  app.appliquerBienAuthentic(dd, { adresse: null, parcelles: [{ section: 'A', numero: '221', surface: '1038' }] }, () => {}, { modifie: false }, { sansRetenir: true });
  assert.equal(dd.bien.cadastre.parcelles[0].surface, '1038');
});
