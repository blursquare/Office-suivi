// Sites consultés par CLAIRE (client/69-sites-claire.js, étude 14/10) : ce qui manque pour lancer une consultation, commune de
// l'outil, compte rendu Géofoncier gardé sur la fiche (rien d'autre que ce que l'agent a lu, borné). Cas inventés.
const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

test('consultation : la commune puis les parcelles de l’outil sont exigées', () => {
  assert.match(app.manqueConsultationSites(null), /commune/);
  assert.match(app.manqueConsultationSites({ insee: '', parcelles: 'AL 694' }), /commune/);
  assert.match(app.manqueConsultationSites({ insee: '41018', parcelles: '' }), /parcelles/);
  assert.strictEqual(app.manqueConsultationSites({ insee: '41018', parcelles: 'AL 694, AL 887' }), '');
});

test('commune de l’outil : le nom de la commune choisie', () => {
  const e = { insee: '41018', communes: [{ insee: '41269', nom: 'Vineuil' }, { insee: '41018', nom: 'Blois' }] };
  assert.strictEqual(app.communeOutilSites(e), 'Blois');
  assert.strictEqual(app.communeOutilSites({ insee: '99999', communes: [] }), '');
});

test('compte rendu Géofoncier pour la fiche : champs bornés, pourcentage arrondi, statut des monuments contrôlé', () => {
  const maintenant = new Date('2026-10-14T18:00:00Z');
  const g = app.geofoncierPourFiche({
    compte_rendu: 'Parcelle en zone UB.',
    zonages: [{ parcelle: 'AL 694', zone: 'UB', libelle: 'Zone urbaine', pourcentage: 87.44 }, { parcelle: 'AL 694', zone: 'N', libelle: '', pourcentage: -1 }],
    monuments_historiques: { statut: 'peut-être', detail: 'x' },
    bornages: [{ parcelle: 'AL 694', nature: 'Bornage', date: '2019', geometre: 'Cabinet Exemple', reference: 'B-1' }],
    a_signaler: '', complet: true
  }, maintenant);
  assert.strictEqual(g.le, '2026-10-14T18:00:00.000Z');
  assert.strictEqual(g.zonages[0].pourcentage, 87.4);
  assert.strictEqual(g.zonages[1].pourcentage, null, '-1 = part non indiquée');
  assert.strictEqual(g.monuments.statut, 'non_lu', 'un statut inconnu est ramené à « non lu »');
  assert.strictEqual(g.bornages.length, 1);
  assert.strictEqual(g.complet, true);
  const vide = app.geofoncierPourFiche(null, maintenant);
  assert.strictEqual(vide.zonages.length + vide.bornages.length, 0);
  assert.strictEqual(vide.compteRendu, '');
  const long = app.geofoncierPourFiche({ compte_rendu: 'x'.repeat(5000), zonages: Array.from({ length: 60 }, () => ({ parcelle: 'A 1', zone: 'U', libelle: '', pourcentage: 1 })) }, maintenant);
  assert.strictEqual(long.compteRendu.length, 3000);
  assert.strictEqual(long.zonages.length, 40);
});

test('fiche : le compte rendu Géofoncier enregistré s’affiche sous le Contrôle de l’urbanisme, échappé', () => {
  assert.strictEqual(app.renderGeofoncierFicheUrbanisme({}), '');
  const html = app.renderGeofoncierFicheUrbanisme({ geofoncier: { le: '2026-10-14T18:00:00Z', compteRendu: '<b>x</b>',
    zonages: [{ parcelle: 'AL 694', zone: 'UB', libelle: '', pourcentage: 100 }], monuments: { statut: 'oui', detail: 'Abords de l’église <script>' }, bornages: [] } });
  assert.match(html, /Géofoncier — lu par CLAIRE le/);
  assert.match(html, /AL 694/);
  assert.match(html, /100 %/);
  assert.match(html, /En zone protégée/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Aucune opération de géomètre relevée/);
});
