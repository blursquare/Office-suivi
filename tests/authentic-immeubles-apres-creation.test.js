'use strict';
// Fiche bien d'Authentic lue APRÈS la création d'une vente (17/10) : elle rejoint les immeubles du dossier, que la Constitution, la fiche,
// l'urbanisme et l'extension GNAU lisent tous (commun/donnees-dossier.js). Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const dossier = () => ({
  id: 'v1', nom: 'EXEMPLE / ESSAI', typeVente: 'maison', adresseBien: 'BLOIS (41000), 3 rue Imaginaire',
  bien: { adresse: { codePostal: '41000', commune: 'BLOIS' }, cadastre: { parcelles: [{ section: 'AB', numero: '12' }] } },
  authentic: { immeubles: [
    { adresse: 'BLOIS (41000), 3 rue Imaginaire', codePostal: '41000', commune: 'BLOIS', parcelles: [{ section: 'AB', numero: '12' }] },
    { adresse: 'VINEUIL (41350), Les Prés', codePostal: '41350', commune: 'VINEUIL', parcelles: [{ section: 'ZC', numero: '45' }] }
  ] }
});
const noter = () => {};

test('fiche bien du bien principal : parcelle ajoutée sur la fiche ET dans les immeubles, vue par tous les outils', () => {
  const d = dossier();
  const r = app.appliquerBienAuthentic(d, { adresse: { texte: '3 rue Imaginaire 41000 BLOIS', codePostal: '41000' }, parcelles: [{ section: 'AB', numero: '12', surface: '512' }, { section: 'AB', numero: '13', surface: '88' }] }, noter, { modifie: false });
  assert.equal(r.modifie, true);
  assert.equal(d.bien.cadastre.parcelles.map((p) => p.numero).join(','), '12,13');
  assert.equal(d.authentic.immeubles[0].parcelles.map((p) => p.numero).join(','), '12,13');
  assert.equal(app.parcellesAfficheesFiche(d).lignes.length, 3, 'la fiche montre aussi la parcelle de Vineuil');
  assert.equal(app.groupesParcellesConstitution(d).length, 2);
});

test('fiche bien d’un autre bien DÉJÀ retenu (autre commune) : complété dans les immeubles, la fiche ne change pas', () => {
  const d = dossier();
  const r = app.appliquerBienAuthentic(d, { adresse: { texte: 'Les Prés 41350 VINEUIL', codePostal: '41350' }, parcelles: [{ section: 'ZC', numero: '45', surface: '5000', nature: 'T' }, { section: 'ZC', numero: '46' }] }, noter, { modifie: false });
  assert.equal(r.modifie, true);
  assert.equal(r.raison, undefined);
  assert.equal(d.bien.cadastre.parcelles.length, 1, 'le bien principal de la fiche est intact');
  assert.equal(d.authentic.immeubles[1].parcelles.map((p) => p.numero).join(','), '45,46');
  assert.equal(d.authentic.immeubles[1].parcelles[0].surface, '5000');
});

test('fiche bien inconnue qui contredit le dossier : toujours écartée (page d’un autre dossier)', () => {
  const d = dossier();
  const r = app.appliquerBienAuthentic(d, { adresse: { texte: '9 route Fictive 41300 SALBRIS', codePostal: '41300' }, parcelles: [{ section: 'B', numero: '9' }] }, noter, { modifie: false });
  assert.ok(r.raison);
  assert.equal(d.authentic.immeubles.length, 2);
});

// Relecture du 17/10 : la même parcelle dans deux communes, la page d'un autre dossier, une commune écrite autrement, un immeuble abîmé.
test('page d’un AUTRE dossier qui partage « AB 12 » dans une autre commune : écartée, le dossier ne change pas', () => {
  const d = dossier();
  const avant = JSON.stringify(d.authentic.immeubles);
  const r = app.appliquerBienAuthentic(d, { adresse: { texte: '9 route Fictive 41300 SALBRIS', codePostal: '41300' }, parcelles: [{ section: 'AB', numero: '12' }, { section: 'C', numero: '400' }] }, noter, { modifie: false });
  assert.ok(r.raison);
  assert.equal(JSON.stringify(d.authentic.immeubles), avant);
  assert.equal(app.groupesParcellesConstitution(d).map((g) => g.commune).join(','), 'BLOIS,VINEUIL');
});

test('même parcelle dans deux communes : deux biens, chacun sa commune', () => {
  const D = require('../commun/donnees-dossier');
  const d = { authentic: { immeubles: [
    { adresse: 'BLOIS (41000), 1 rue Fictive', codePostal: '41000', commune: 'BLOIS', parcelles: [{ section: 'AB', numero: '12' }] },
    { adresse: 'VINEUIL (41350), Les Prés', codePostal: '41350', commune: 'VINEUIL', parcelles: [{ section: 'AB', numero: '12' }, { section: 'ZC', numero: '7' }] }] } };
  assert.equal(D.biensDossier(d).length, 2);
  assert.equal(D.parcellesDossier(d).map((p) => `${p.commune} ${p.section}${p.numero}`).join(','), 'BLOIS AB12,VINEUIL AB12,VINEUIL ZC7');
  assert.equal(D.memeCommune({ commune: 'ST AIGNAN' }, { commune: 'SAINT-AIGNAN-SUR-CHER', codePostal: '41110' }), true);
  assert.equal(D.memeCommune({ codePostal: '41000' }, { codePostal: '41350' }), false);
  assert.equal(D.communeNette('Saint-Aignan-sur-Cher'), 'st aignan s cher');
});

test('contrôle de l’urbanisme : parcelles du bien principal toujours, commune écrite autrement comprise, autre commune ou commune inconnue exclue', () => {
  const d = { adresseBien: 'SAINT-AIGNAN (41110), 2 rue des Essais', typeVente: 'maison',
    bien: { adresse: { codePostal: '41110', commune: 'SAINT-AIGNAN' }, cadastre: { parcelles: [{ section: 'AB', numero: '12', commune: 'ST AIGNAN' }, { section: 'AB', numero: '13', commune: 'SAINT AIGNAN SUR CHER' }] } },
    authentic: { immeubles: [{ adresse: 'Les Prés', parcelles: [{ section: 'ZC', numero: '45' }] }, { adresse: 'NOYERS-SUR-CHER (41140), 1 rue Fictive', codePostal: '41140', commune: 'NOYERS-SUR-CHER', parcelles: [{ section: 'B', numero: '2' }] }] } };
  assert.equal(app.prefillPreemption(d).parcelles, 'AB 12, AB 13');
});

test('lots de la fiche (tenus à jour) avant ceux d’un immeuble retenu ; immeuble abîmé sans erreur', () => {
  const D = require('../commun/donnees-dossier');
  const d = { adresseBien: 'BLOIS (41000), 1 rue Fictive', bien: { lots: [{ numero: '1' }, { numero: '7' }], cadastre: { parcelles: [{ section: 'AB', numero: '12' }] } },
    authentic: { immeubles: [{ adresse: 'BLOIS (41000), 1 rue Fictive', lots: [{ numero: '1' }], parcelles: {} }, 'abîmé', null] } };
  assert.equal(D.biensDossier(d)[0].lots.map((l) => l.numero).join(','), '1,7');
  assert.equal(D.personneDossier({}, { nom: 'Léa ESSAI', emails: 'a@x.fr; b@y.fr' }).emails.join(','), 'a@x.fr,b@y.fr');
});

// Seconde relecture (17/10) : même code postal, autre commune ; immeuble retenu sans lieu ; « -sur-… » seulement.
test('page d’un autre dossier au MÊME code postal (Villebarou / Blois, 41000) : écartée', () => {
  const d = dossier();
  const r = app.appliquerBienAuthentic(d, { adresse: { texte: '9 route Fictive 41000 VILLEBAROU', codePostal: '41000', commune: 'VILLEBAROU' }, parcelles: [{ section: 'AB', numero: '12' }, { section: 'C', numero: '400' }] }, noter, { modifie: false });
  assert.ok(r.raison);
  assert.equal(d.bien.cadastre.parcelles.length, 1);
  assert.equal(d.authentic.immeubles.length, 2);
});

test('immeuble retenu sans adresse ni commune : la fiche de cet autre bien le complète encore', () => {
  const D = require('../commun/donnees-dossier');
  const l = D.fusionnerImmeubleAuthentic([{ adresse: 'Les Prés', parcelles: [{ section: 'ZC', numero: '45' }] }],
    { adresse: 'VINEUIL (41350), Les Prés', codePostal: '41350', parcelles: [{ section: 'ZC', numero: '45', surface: '5000' }] }, { seulementCompleter: true });
  assert.equal(l.length, 1);
  assert.equal(l[0].parcelles[0].surface, '5000');
  assert.equal(D.memeCommune({ commune: 'SAINT-DENIS', codePostal: '41000' }, { commune: 'SAINT-DENIS-SUR-LOIRE', codePostal: '41000' }), true, '« -sur-… » ajouté');
  assert.equal(D.memeCommune({ commune: 'SAINT-LAURENT', codePostal: '41220' }, { commune: 'SAINT-LAURENT-NOUAN', codePostal: '41220' }), false);
});
