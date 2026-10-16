'use strict';
// Clients et biens (étude 16/10) : base calculée depuis les dossiers, homonymes proposés, conjoints reliés, biens réunis par parcelle.
// Noms, adresses et parcelles inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { construireBase, chercherClientsBiens, fichesDuDossier, assainirReglagesClientsBiens } = require('../src/clientsBiens');

const fiche = (o) => Object.assign({ nom: '', nomFamille: '', prenom: '', civilite: 'M', dateNaissance: '', domicile: '', emails: [], telephones: [], vuLe: '2026-10-01T10:00:00Z' }, o);

const dossiers = () => [
  { id: 'v1', nom: 'MOREAU / LAMBERT', adresseBien: 'VINEUIL (41350), 12 rue des Vignes', typeVente: 'maison',
    parties: [{ role: 'VENDEUR', nom: 'Paul MOREAU' }, { role: 'VENDEUR', nom: 'Léa MOREAU' }, { role: 'ACQUEREUR', nom: 'Claire LAMBERT' }],
    bien: { cadastre: { section: 'EV', numero: '10', parcelles: [{ section: 'EV', numero: '10', surface: '606' }, { section: 'EV', numero: '11', surface: '00ha 05a 98ca' }] } },
    authentic: { fichesClients: {
      a: fiche({ nom: 'Paul MOREAU', nomFamille: 'MOREAU', prenom: 'Paul', dateNaissance: '1961-03-12', profession: 'Retraité', domicile: '4 allée des Saules 41350 VINEUIL',
        situationMatrimoniale: { situation: 'Marié', conjoint: 'Mme MOREAU Léa' }, telephones: ['06 11 22 33 44'] }),
      b: fiche({ nom: 'Léa MOREAU', nomFamille: 'MOREAU', prenom: 'Léa', civilite: 'Mme', dateNaissance: '1963-07-01', situationMatrimoniale: { situation: 'Mariée', conjoint: 'M. MOREAU Paul' } })
    } } },
  // Paul MOREAU revend un autre bien, même date de naissance → même personne. La parcelle EV 11 revient : même bien que v1.
  { id: 'v2', nom: 'MOREAU / PETIT', adresseBien: 'VINEUIL (41350), 12 rue des Vignes', archive: true,
    parties: [{ role: 'VENDEUR', nom: 'Paul MOREAU' }, { role: 'ACQUEREUR', nom: 'Jean PETIT' }],
    bien: { cadastre: { parcelles: [{ section: 'EV', numero: '11' }] } },
    authentic: { fichesClients: { a: fiche({ nom: 'Paul MOREAU', nomFamille: 'MOREAU', prenom: 'Paul', dateNaissance: '1961-03-12', vuLe: '2026-10-10T10:00:00Z', profession: 'Sans profession' }) } } },
  // Un Jean PETIT sans date de naissance ailleurs : proposé, jamais réuni.
  { id: 'v3', nom: 'PETIT / ROUX', adresseBien: 'BLOIS (41000), 3 rue Haute', parties: [{ role: 'VENDEUR', nom: 'Jean PETIT' }, { role: 'ACQUEREUR', nom: 'Anne ROUX' }] },
  // Un autre Paul MOREAU, né une autre année : jamais la même personne.
  { id: 'v4', nom: 'MOREAU / DURAND', adresseBien: 'BLOIS (41000), 8 rue Basse', parties: [{ role: 'VENDEUR', nom: 'Paul MOREAU' }],
    authentic: { fichesClients: { a: fiche({ nom: 'Paul MOREAU', nomFamille: 'MOREAU', prenom: 'Paul', dateNaissance: '1990-01-01' }) } } },
  { id: 's1', nom: 'Gérard PRADEL', typeAffaire: 'succession', parties: [{ role: 'PARTIE', nom: 'Sylvie PRADEL' }],
    authentic: { comparants: [{ role: 'DEFUNT', nom: 'PRADEL Gérard' }, { role: 'HERITIER', nom: 'PRADEL Sylvie' }],
      fichesClients: { g: fiche({ nom: 'Gérard PRADEL', nomFamille: 'PRADEL', prenom: 'Gérard', deces: { date: '2026-05-02' } }) },
      immeubles: [{ adresse: '3 rue Haute 41000 BLOIS', parcelles: [{ section: 'AB', numero: '12', surface: '512' }] }] } },
  { id: 'x', nom: 'SUPPRIMÉ', deleted: true, parties: [{ role: 'VENDEUR', nom: 'Paul MOREAU' }] }
];

test('personnes : même nom, prénom et naissance réunis ; autre naissance distinct ; homonyme sans date proposé', () => {
  const { personnes } = construireBase(dossiers());
  const paul = personnes.filter((p) => p.nomComplet === 'Paul MOREAU');
  assert.equal(paul.length, 2, 'deux Paul MOREAU : nés en 1961 et en 1990');
  const p61 = paul.find((p) => p.champs.dateNaissance === '1961-03-12');
  assert.deepEqual(p61.dossiers.map((x) => x.id).sort(), ['v1', 'v2']);
  assert.equal(p61.champs.profession, 'Sans profession', 'la fiche d’Authentic la plus récente l’emporte');
  assert.ok(!p61.dossiers.some((x) => x.id === 'x'), 'jamais un dossier supprimé');
  const petit = personnes.filter((p) => p.nomComplet === 'Jean PETIT');
  assert.equal(petit.length, 2, 'sans date de naissance : pas réunis seuls');
  assert.equal(petit[0].peutEtre.length, 1);
  assert.equal(petit[0].peutEtre[0].id, petit[1].id);
});

test('homonymes : « même personne » confirmé → réunis ; « distinct » → plus proposé', () => {
  const base0 = construireBase(dossiers());
  const petit = base0.personnes.find((p) => p.nomComplet === 'Jean PETIT');
  const { occA, occB } = petit.peutEtre[0];
  const meme = construireBase(dossiers(), assainirReglagesClientsBiens({ liaisons: { [`${occA}#${occB}`]: 'meme' } }));
  const reunis = meme.personnes.filter((p) => p.nomComplet === 'Jean PETIT');
  assert.equal(reunis.length, 1);
  assert.deepEqual(reunis[0].dossiers.map((x) => x.id).sort(), ['v2', 'v3']);
  const distinct = construireBase(dossiers(), assainirReglagesClientsBiens({ liaisons: { [`${occB}#${occA}`]: 'distinct' } }));
  assert.ok(distinct.personnes.filter((p) => p.nomComplet === 'Jean PETIT').every((p) => !p.peutEtre.length));
});

test('conjoints reliés comme dans Authentic ; défunt et héritier d’une succession', () => {
  const { personnes } = construireBase(dossiers());
  const paul = personnes.find((p) => p.champs.dateNaissance === '1961-03-12');
  const lea = personnes.find((p) => p.nomComplet === 'Léa MOREAU');
  assert.equal(paul.conjoint.id, lea.id);
  assert.equal(lea.conjoint.id, paul.id);
  assert.equal(paul.conjoint.situation, 'Marié');
  const gerard = personnes.find((p) => p.nomComplet === 'Gérard PRADEL');
  assert.equal(gerard.dossiers[0].roleLibelle, 'Défunt');
  assert.equal(gerard.deces.date, '2026-05-02');
  assert.equal(personnes.find((p) => p.nomComplet === 'Sylvie PRADEL').dossiers[0].roleLibelle, 'Héritier');
});

test('biens : une parcelle commune réunit deux dossiers ; surfaces des fiches ; succession comprise', () => {
  const { biens } = construireBase(dossiers());
  const vineuil = biens.find((b) => b.commune === 'VINEUIL');
  assert.deepEqual(vineuil.dossiers.map((x) => x.id).sort(), ['v1', 'v2']);
  assert.deepEqual(vineuil.parcelles.map((p) => `${p.section}${p.numero}=${p.surface}`), ['EV10=606', 'EV11=598']);
  assert.equal(vineuil.surfaceTotale, 1204);
  const blois = biens.filter((b) => b.commune === 'BLOIS');
  assert.ok(blois.some((b) => b.dossiers.some((x) => x.id === 's1') && b.parcelles[0].surface === 512));
});

test('corrections à la main : appliquées ; Authentic qui change ensuite → à revoir, rien d’écrasé', () => {
  const b0 = construireBase(dossiers());
  const lea = b0.personnes.find((p) => p.nomComplet === 'Léa MOREAU');
  const occ = lea.occurrences[0];
  const r = assainirReglagesClientsBiens({ corrections: [{ occ, champ: 'profession', valeur: 'Infirmière', authentic: '' }] });
  assert.equal(construireBase(dossiers(), r).personnes.find((p) => p.nomComplet === 'Léa MOREAU').champs.profession, 'Infirmière');
  const ds = dossiers();
  ds[0].authentic.fichesClients.b.profession = 'Enseignante';
  const apres = construireBase(ds, r).personnes.find((p) => p.nomComplet === 'Léa MOREAU');
  assert.equal(apres.champs.profession, 'Infirmière');
  assert.equal(apres.aRevoir[0].authentic, 'Enseignante');
});

test('recherche et fiches d’un dossier', () => {
  const base = construireBase(dossiers());
  const r = chercherClientsBiens(base, 'moreau');
  assert.ok(r.personnes.length >= 3 && r.personnes.every((p) => /MOREAU/.test(p.nom)));
  assert.equal(chercherClientsBiens(base, 'EV 11').biens.length, 1);
  assert.equal(chercherClientsBiens(base, 'vineuil').biens[0].commune, 'VINEUIL');
  const f = fichesDuDossier(base, 'v1');
  assert.deepEqual(f.personnes.map((p) => `${p.nom}:${p.role}`).sort(), ['Claire LAMBERT:Acquéreur', 'Léa MOREAU:Vendeur', 'Paul MOREAU:Vendeur']);
  assert.equal(f.personnes.find((p) => p.nom === 'Paul MOREAU').autresDossiers, 1);
  assert.equal(f.biens.length, 1);
});

test('route : liste, fiche, liaison et correction gardées', async () => {
  const os = require('os');
  const { ouvrirDb } = require('../src/db');
  const { creerApp } = require('../src/app');
  const db = ouvrirDb(':memory:');
  const { app, depot } = creerApp({ db, config: { racineRepo: os.tmpdir(), port: 0, authActive: false } });
  dossiers().filter((d) => !d.deleted).forEach((d) => depot.creer(d));
  const serveur = app.listen(0);
  await new Promise((r) => serveur.once('listening', r));
  try {
    const base = `http://127.0.0.1:${serveur.address().port}/api`;
    const json = async (u, o) => (await fetch(base + u, o)).json();
    const liste = await json('/clients-biens?q=petit');
    assert.equal(liste.personnes.length, 2);
    const fiche1 = await json('/clients-biens/personne/' + liste.personnes[0].id);
    const { occA, occB } = fiche1.personne.peutEtre[0];
    const post = await fetch(base + '/clients-biens/liaison', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ occA, occB, decision: 'meme' }) });
    assert.equal(post.status, 200);
    assert.equal((await json('/clients-biens?q=petit')).personnes.length, 1);
    const lea = (await json('/clients-biens?q=lea')).personnes[0];
    const fl = await json('/clients-biens/personne/' + lea.id);
    const put = await fetch(base + '/clients-biens/correction', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ occ: fl.personne.occurrences[0], champ: 'profession', valeur: 'Infirmière' }) });
    assert.equal(put.status, 200);
    assert.equal((await json('/clients-biens/personne/' + lea.id)).personne.champs.profession, 'Infirmière');
    assert.equal((await fetch(base + '/clients-biens/personne/zz')).status, 400);
    const mauvais = await fetch(base + '/clients-biens/correction', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ occ: fl.personne.occurrences[0], champ: 'role', valeur: 'x' }) });
    assert.equal(mauvais.status, 400);
  } finally {
    serveur.close(); db.close();
  }
});
