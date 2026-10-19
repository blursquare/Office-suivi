'use strict';

// Biens d'un dossier d'Authentic (étude 19/10 : « il mélange les dossiers » — le bien d'une autre vente rangé dans GALLOYER / BORDAS ;
// « repérer dans la structure le nombre de biens du dossier et ne pas en rajouter d'autres »). Noms et adresses inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const PAGE = { texte: 'A 2025 00281\n1 - VTE MARTIN / DURAND\nComparants\nImmeubles (1)\n4 Grande Rue 41290 VIEVY LE RAYE Maison individuelle\nDocuments\nCompromis' };
const AUTRE = { adresse: { texte: '24 rue des Lilas 41190 SAINT LUBIN EN VERGONNOIS' }, parcelles: [{ section: 'ZN', numero: '4' }] };
const BON = { adresse: { texte: '4 Grande Rue 41290 VIEVY LE RAYE' }, parcelles: [{ section: 'B', numero: '234' }] };

test('rubrique « Immeubles (n) » de la page du dossier : nombre et biens cités', () => {
  const r = app.biensRubriqueAuthentic(PAGE);
  assert.equal(r.nombre, 1);
  assert.ok(r.texte.includes('VIEVY'));
  assert.equal(app.bienDansRubriqueAuthentic(BON.adresse, r), true);
  assert.equal(app.bienDansRubriqueAuthentic(AUTRE.adresse, r), false);
  assert.equal(app.bienDansRubriqueAuthentic('', r), null);
  assert.equal(app.bienDansRubriqueAuthentic(AUTRE.adresse, null), null);
  // Rubrique coupée (fin non trouvée, trop longue) : le nombre seul.
  assert.equal(app.biensRubriqueAuthentic({ texte: 'Immeubles (2)\n' + 'x '.repeat(900) }).texte, '');
  assert.equal(app.biensRubriqueAuthentic({ texte: 'Rien ici' }), null);
});

test('fiche bien ouverte hors de l’onglet d’un dossier : d’aucun dossier sûr', () => {
  assert.equal(app.ongletActifHorsDossierAuthentic({ onglets: [{ titre: 'Recherche d’immeubles', actif: true }] }), true);
  assert.equal(app.ongletActifHorsDossierAuthentic({ onglets: [{ titre: 'A 2025 00281 VTE MARTIN / DURAND', actif: true }] }), false);
  assert.equal(app.ongletActifHorsDossierAuthentic({ onglets: [{ titre: 'VTE MARTIN...', actif: true }] }), false);
  assert.equal(app.ongletActifHorsDossierAuthentic({ onglets: [] }), false);
  assert.equal(app.ongletActifHorsDossierAuthentic({}), false);
});

test('pas plus de biens que la page du dossier n’en annonce, jamais un bien absent de sa rubrique', () => {
  const d = { id: 'a', nom: 'MARTIN / DURAND', adresseBien: '4 Grande Rue 41290 VIEVY LE RAYE', bien: { cadastre: { parcelles: [{ section: 'B', numero: '234' }] } },
    authentic: { immeubles: [{ adresse: '4 Grande Rue 41290 VIEVY LE RAYE', parcelles: [{ section: 'B', numero: '234' }] }], biensDossier: app.biensRubriqueAuthentic(PAGE) } };
  assert.equal(app.retenirImmeubleVenteAuthentic(d, AUTRE, false), false);
  assert.equal(d.authentic.immeubles.length, 1);
  // Nombre seul (rubrique coupée) : un bien de plus que n refusé.
  d.authentic.biensDossier = { nombre: 1, texte: '' };
  assert.equal(app.retenirImmeubleVenteAuthentic(d, AUTRE, false), false);
  // Sans page du dossier lue : rien n'est refusé par cette règle.
  delete d.authentic.biensDossier;
  assert.notEqual(app.retenirImmeubleVenteAuthentic(d, AUTRE, false), false);
  assert.equal(d.authentic.immeubles.length, 2);
});

test('complément depuis Authentic : le bien d’un autre dossier ou absent de la rubrique est écarté', () => {
  const d = { id: 'a', adresseBien: '4 Grande Rue 41290 VIEVY LE RAYE', bien: {} };
  const donnees = { immeubles: [Object.assign({ id: 'i1' }, BON), Object.assign({ id: 'i2' }, AUTRE)], biens: ['i1', 'i2'], infosAuthentic: { biensDossier: app.biensRubriqueAuthentic(PAGE) } };
  const r = app.donneesSansBiensEtrangersAuthentic(d, donnees, []);
  assert.equal(r.immeubles.map(x => x.id).join(','), 'i1');
  assert.equal(r.biens.join(','), 'i1');
  // Bien principal d'un autre dossier de CLAIRE, même sans rubrique lue.
  const autre = { id: 'b', nom: 'X / Y', adresseBien: '24 rue des Lilas 41190 SAINT LUBIN EN VERGONNOIS', bien: {} };
  const sans = app.donneesSansBiensEtrangersAuthentic(d, { immeubles: donnees.immeubles, biens: [] }, [d, autre]);
  assert.equal(sans.immeubles.map(x => x.id).join(','), 'i1');
});

test('au démarrage : seul le bien principal d’un autre dossier quitte la fiche, avec ses parcelles', () => {
  const fiche = () => ({ id: 'a', nom: 'MARTIN / DURAND', adresseBien: '4 Grande Rue 41290 VIEVY LE RAYE', historique: [],
    bien: { cadastre: { section: 'B', numero: '234', parcelles: [{ section: 'B', numero: '234' }, { section: 'ZN', numero: '4' }] } },
    authentic: { biensDossier: app.biensRubriqueAuthentic(PAGE), immeubles: [
      { adresse: '4 Grande Rue 41290 VIEVY LE RAYE', parcelles: [{ section: 'B', numero: '234' }] },
      { adresse: '24 rue des Lilas 41190 SAINT LUBIN EN VERGONNOIS', parcelles: [{ section: 'ZN', numero: '4' }] }] } });
  // La rubrique seule ne retire rien au démarrage (relecture 19/10).
  const seul = fiche();
  assert.equal(app.retirerBiensDAutresDossiers(seul, [seul]), false);
  const d = fiche();
  const autre = { id: 'b', nom: 'X / Y', adresseBien: '24 rue des Lilas 41190 SAINT LUBIN EN VERGONNOIS', bien: {} };
  assert.equal(app.retirerBiensDAutresDossiers(d, [d, autre]), true);
  assert.equal(d.authentic.immeubles.length, 1);
  assert.equal(d.bien.cadastre.parcelles.map(p => p.section + p.numero).join(','), 'B234');
});

test('relecture 19/10 : abréviations, rubrique sans code postal, bien principal — jamais un vrai bien écarté', () => {
  const rub = app.biensRubriqueAuthentic({ texte: 'Immeubles (2)\n41000 BLOIS\n3 Fbg St Jean\n41000 BLOIS\n5 Fbg St Jean (garage)\nDocuments' });
  assert.equal(app.bienDansRubriqueAuthentic('BLOIS (41000), 5 Faubourg Saint-Jean', rub), true);
  assert.equal(app.bienDansRubriqueAuthentic('Résidence Les Tilleuls Bâtiment B 12 avenue Wilson 41000 BLOIS', rub), true);
  // Rubrique sans code postal, ou suivie d'autre chose : on ne sait pas.
  assert.equal(app.bienDansRubriqueAuthentic('La Hupinière 41350 VINEUIL', { nombre: 1, texte: 'La Hupinière VINEUIL' }), null);
  assert.equal(app.bienDansRubriqueAuthentic('8 rue des Lilas 41000 BLOIS', { nombre: 1, texte: 'Martel Julie Tél. 06 00 00 00 00' }), null);
  // Le bien principal (adresse ou parcelle commune) est toujours retenu, même le premier, même contredit par la rubrique.
  const d = { id: 'a', adresseBien: 'BLOIS (41000), 8 rue des Lilas', bien: { cadastre: { parcelles: [{ section: 'AB', numero: '12' }] } },
    authentic: { biensDossier: { nombre: 1, texte: '41100 VENDOME 2 rue Haute' } } };
  assert.notEqual(app.retenirImmeubleVenteAuthentic(d, { adresse: { texte: '8 Rue des Lilas Résidence Les Iris 41000 BLOIS' }, parcelles: [{ section: 'AB', numero: '12' }] }, false), false);
  assert.equal(d.authentic.immeubles.length, 1);
  // Rubrique remplacée en entier par la page suivante.
  const f = app.fusionnerInfosAuthentic({ biensDossier: { nombre: 1, texte: '8 rue des Lilas 41000 BLOIS' } }, { biensDossier: { nombre: 2, texte: '' } });
  assert.equal(`${f.biensDossier.nombre}|${f.biensDossier.texte}`, '2|');
});
