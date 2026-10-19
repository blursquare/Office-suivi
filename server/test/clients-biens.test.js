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

test('relecture : jamais deux naissances différentes réunies de proche en proche, ni le père et le fils par la ligne de la maison', () => {
  const ds = [
    { id: 'a', nom: 'MARTIN / X', parties: [{ role: 'VENDEUR', nom: 'Jean MARTIN' }], authentic: { fichesClients: { f: fiche({ nom: 'Jean MARTIN', nomFamille: 'MARTIN', prenom: 'Jean', dateNaissance: '1950-01-01', telephones: ['02 54 00 00 00'], emails: ['famille@exemple.fr'] }) } } },
    { id: 'b', nom: 'MARTIN / Y', parties: [{ role: 'VENDEUR', nom: 'Jean MARTIN' }], authentic: { fichesClients: { f: fiche({ nom: 'Jean MARTIN', nomFamille: 'MARTIN', prenom: 'Jean', telephones: ['02 54 00 00 00'], emails: ['famille@exemple.fr'] }) } } },
    { id: 'c', nom: 'MARTIN / Z', parties: [{ role: 'VENDEUR', nom: 'Jean MARTIN' }], authentic: { fichesClients: { f: fiche({ nom: 'Jean MARTIN', nomFamille: 'MARTIN', prenom: 'Jean', dateNaissance: '1980-01-01', emails: ['famille@exemple.fr'] }) } } }
  ];
  const sans = construireBase(ds).personnes.filter((p) => p.nomComplet === 'Jean MARTIN');
  assert.equal(sans.length, 3, 'un contact commun ne réunit pas');
  // « Même personne » pour a-b puis b-c : b rejoint a, mais c (né en 1980) ne peut plus rejoindre le groupe de a (né en 1950).
  const occ = (id) => sans.find((p) => p.dossiers[0].id === id).occurrences[0];
  const r = assainirReglagesClientsBiens({ liaisons: { [`${occ('a')}#${occ('b')}`]: 'meme', [`${occ('b')}#${occ('c')}`]: 'meme' } });
  const avec = construireBase(ds, r).personnes.filter((p) => p.nomComplet === 'Jean MARTIN');
  assert.equal(avec.length, 2);
  assert.ok(avec.every((p) => new Set(p.dossiers.map((x) => x.id)).size <= 2));
});

test('relecture : pas de bien réuni sans commune, ni deux lots d’un même immeuble', () => {
  const ds = [
    { id: 'a', nom: 'A', adresseBien: '', bien: { cadastre: { parcelles: [{ section: 'AB', numero: '12' }] } } },
    { id: 'b', nom: 'B', adresseBien: '', bien: { cadastre: { parcelles: [{ section: 'AB', numero: '12' }] } } },
    { id: 'c', nom: 'C', adresseBien: 'BLOIS (41000), 5 rue Haute', typeVente: 'copropriete', bien: { cadastre: { parcelles: [{ section: 'CD', numero: '9' }] }, lots: [{ numero: '3' }] } },
    { id: 'd', nom: 'D', adresseBien: 'BLOIS (41000), 5 rue Haute', typeVente: 'copropriete', bien: { cadastre: { parcelles: [{ section: 'CD', numero: '9' }] }, lots: [{ numero: '7' }] } },
    { id: 'e', nom: 'E', adresseBien: 'BLOIS (41000), 5 rue Haute', typeVente: 'copropriete', bien: { cadastre: { parcelles: [{ section: 'CD', numero: '9' }] }, lots: [{ numero: '3' }] } }
  ];
  const biens = construireBase(ds).biens;
  assert.ok(!biens.some((b) => b.dossiers.length > 1 && b.dossiers.some((x) => x.id === 'a')), 'sans commune : jamais réunis');
  const lot3 = biens.find((b) => b.dossiers.some((x) => x.id === 'c'));
  assert.deepEqual(lot3.dossiers.map((x) => x.id).sort(), ['c', 'e']);
  assert.ok(!lot3.dossiers.some((x) => x.id === 'd'));
});

test('relecture : conjoint seulement dans un même dossier ou réciproque ; « épouse de » n’est pas un nom', () => {
  const ds = [
    { id: 'a', nom: 'DURAND / X', parties: [{ role: 'VENDEUR', nom: 'Marie DURAND' }], authentic: { fichesClients: { f: fiche({ nom: 'Marie DURAND', nomFamille: 'DURAND', prenom: 'Marie', situationMatrimoniale: { situation: 'Mariée', conjoint: 'Monsieur Paul MOREAU' } }) } } },
    { id: 'b', nom: 'MOREAU / Y', parties: [{ role: 'VENDEUR', nom: 'Paul MOREAU' }], authentic: { fichesClients: { f: fiche({ nom: 'Paul MOREAU', nomFamille: 'MOREAU', prenom: 'Paul', dateNaissance: '1990-01-01' }) } } },
    { id: 'c', nom: 'DUPONT', parties: [{ role: 'VENDEUR', nom: 'Marie DUPONT épouse MARTIN' }] }
  ];
  const ps = construireBase(ds).personnes;
  assert.equal(ps.find((p) => p.nomComplet === 'Marie DURAND').conjoint.id, null);
  assert.ok(ps.some((p) => p.nomComplet === 'Marie DUPONT'));
});

test('relecture : une correction suit l’occurrence quand Authentic ajoute le prénom', () => {
  const ds = (prenom) => [{ id: 'a', nom: 'MOREAU', parties: [{ role: 'VENDEUR', nom: prenom ? `${prenom} MOREAU` : 'MOREAU' }] }];
  const occ = construireBase(ds('')).personnes[0].occurrences[0];
  const r = assainirReglagesClientsBiens({ corrections: [{ occ, champ: 'profession', valeur: 'Retraité', authentic: '' }] });
  assert.equal(construireBase(ds('Paul'), r).personnes[0].champs.profession, 'Retraité');
});

test('relecture : la base de 3 000 dossiers avec conjoints se calcule vite', () => {
  const ds = [];
  for (let i = 0; i < 3000; i++) {
    const n = 'NOM' + String.fromCharCode(65 + (i % 26)) + (i % 400);
    ds.push({ id: 'd' + i, nom: n, adresseBien: `BLOIS (41000), ${i} rue Haute`, bien: { cadastre: { parcelles: [{ section: 'AB', numero: String(i) }] } },
      parties: [{ role: 'VENDEUR', nom: `Paul ${n}` }, { role: 'VENDEUR', nom: `Léa ${n}` }],
      authentic: { fichesClients: { a: fiche({ nom: `Paul ${n}`, nomFamille: n, prenom: 'Paul', dateNaissance: `19${50 + (i % 40)}-01-01`, situationMatrimoniale: { situation: 'Marié', conjoint: `Mme ${n} Léa` } }),
        b: fiche({ nom: `Léa ${n}`, nomFamille: n, prenom: 'Léa', dateNaissance: `19${51 + (i % 40)}-02-02`, situationMatrimoniale: { situation: 'Mariée', conjoint: `M. ${n} Paul` } }) } } });
  }
  const t0 = Date.now();
  construireBase(ds);
  assert.ok(Date.now() - t0 < 5000, `${Date.now() - t0} ms`);
});

test('fiche client : le reste de la fiche d’Authentic suit, celui de la plus récente, borné', () => {
  const ds = [
    { id: 'c1', nom: 'MARTIN / X', parties: [{ role: 'VENDEUR', nom: 'Hugo MARTIN' }],
      authentic: { fichesClients: { a: fiche({ nom: 'Hugo MARTIN', nomFamille: 'MARTIN', prenom: 'Hugo', dateNaissance: '1975-05-05', vuLe: '2026-10-01T10:00:00Z',
        autresPrenoms: 'Paul', complement: { capacite: 'Majeur', mariage: { regime: 'Ancien régime' } } }) } } },
    { id: 'c2', nom: 'MARTIN / Y', parties: [{ role: 'VENDEUR', nom: 'Hugo MARTIN' }],
      authentic: { fichesClients: { a: fiche({ nom: 'Hugo MARTIN', nomFamille: 'MARTIN', prenom: 'Hugo', dateNaissance: '1975-05-05', vuLe: '2026-10-12T10:00:00Z',
        complement: { capacite: 'Majeur', mariage: { regime: 'Communauté légale nouvelle', situationActe: 'x'.repeat(900) }, '<script>': 'non', historique: Array(30).fill({ situation: 'Marié' }) } }) } } }
  ];
  const p = construireBase(ds, {}).personnes.find((x) => x.nomComplet === 'Hugo MARTIN');
  assert.equal(p.complement.mariage.regime, 'Communauté légale nouvelle');
  assert.equal(p.complement.mariage.situationActe.length, 400);
  assert.equal(p.complement.historique.length, 12);
  assert.equal(p.complement['<script>'], undefined);
  assert.equal(p.autresPrenoms, 'Paul');
});

// Étude 17/10 : « les biens des successions et des ventes, s'ils sont les mêmes, rattachés à la même fiche » ; tout ce que dit Authentic.
test('même bien dans une vente et une succession, commune écrite autrement : une seule fiche, détails d’Authentic réunis', () => {
  const vente = { id: 'v1', nom: 'ESSAI / EXEMPLE', adresseBien: 'SAINT-AIGNAN (41110), 2 rue des Essais',
    bien: { adresse: { codePostal: '41110', commune: 'SAINT-AIGNAN' }, cadastre: { parcelles: [{ section: 'AB', numero: '12', zone: 'UA' }] } },
    authentic: { immeubles: [{ adresse: 'SAINT-AIGNAN (41110), 2 rue des Essais', codePostal: '41110', commune: 'SAINT-AIGNAN', description: 'Une maison',
      details: [{ libelle: 'Type de bien', valeur: 'Maison' }], parcelles: [{ section: 'AB', numero: '12', zone: 'UA' }] }] } };
  const succ = { id: 's1', nom: 'ESSAI', typeAffaire: 'succession',
    biens: [{ adresse: 'ST AIGNAN SUR CHER (41110), 2 rue des Essais', parcelles: [{ section: 'AB', numero: '12', commune: 'ST AIGNAN SUR CHER' }],
      details: [{ libelle: 'Usage', valeur: 'Habitation' }] }] };
  const { biens } = construireBase([vente, succ]);
  assert.equal(biens.length, 1);
  assert.equal(biens[0].dossiers.map((x) => x.id).sort().join(','), 's1,v1');
  assert.equal(biens[0].details.map((x) => x.libelle).sort().join(','), 'Type de bien,Usage');
  assert.equal(biens[0].description, 'Une maison');
  assert.equal(biens[0].parcelles[0].zone, 'UA');
});

test('deux communes « -sur-… » différentes (Chaumont-sur-Loire 41150 / Chaumont-sur-Tharonne 41600) : deux fiches', () => {
  const d = (id, adr, cp, commune) => ({ id, nom: id, adresseBien: adr, bien: { adresse: { codePostal: cp, commune }, cadastre: { parcelles: [{ section: 'AB', numero: '12' }] } } });
  const { biens } = construireBase([d('v1', 'CHAUMONT-SUR-LOIRE (41150), 1 rue Fictive', '41150', 'CHAUMONT-SUR-LOIRE'), d('v2', 'CHAUMONT-SUR-THARONNE (41600), 1 rue Fictive', '41600', 'CHAUMONT-SUR-THARONNE')]);
  assert.equal(biens.length, 2);
  const autres = fichesDuDossier(construireBase([d('v1', 'BLOIS (41000), 1 rue Fictive', '41000', 'BLOIS'), d('v2', 'BLOIS (41000), 1 rue Fictive', '41000', 'BLOIS')]), 'v1');
  assert.equal(autres.biens[0].autres[0].id, 'v2', 'le même bien : l’autre dossier est nommé sur sa fiche');
});

test('deux communes homonymes de départements différents (SAINT-CYR 41000 / 86130) : deux fiches', () => {
  const d = (id, cp) => ({ id, nom: id, adresseBien: `SAINT-CYR (${cp}), 1 rue Fictive`, bien: { adresse: { codePostal: cp, commune: 'SAINT-CYR' }, cadastre: { parcelles: [{ section: 'AB', numero: '12' }] } } });
  assert.equal(construireBase([d('v1', '41000'), d('v2', '86130')]).biens.length, 2);
  assert.equal(construireBase([d('v1', '41000'), d('v2', '41000')]).biens.length, 1);
});

test('fiches du dossier : une personne du même nom sans preuve montre ses autres dossiers « peut-être »', () => {
  const v = { id: 'v1', nom: 'MOREAU / LAMBERT', parties: [{ role: 'VENDEUR', nom: 'Paul MOREAU' }, { role: 'ACQUEREUR', nom: 'Claire LAMBERT' }] };
  const s = { id: 's1', nom: 'MOREAU', typeAffaire: 'succession', parties: [{ role: 'PARTIE', nom: 'Paul MOREAU' }] };
  const f = fichesDuDossier(construireBase([v, s]), 'v1');
  const paul = f.personnes.find((p) => p.nom === 'Paul MOREAU');
  assert.equal(paul.autresDossiers, 0);
  assert.ok(paul.peutEtreAutres.some((x) => x.id === 's1'));
});

test('partie sans fiche d\'Authentic retenue : coordonnées du côté et situation reprises (étude 19/10, carte vide)', () => {
  const base = construireBase([{ id: 'v1', nom: 'EXEMPLE - ESSAI', typeAffaire: 'vente',
    emailAcquereur: 'paul.essai@exemple.fr; direction@exemple.fr', telephoneAcquereur: '06 00 00 00 01',
    parties: [{ nom: 'Jean EXEMPLE', role: 'VENDEUR' }, { nom: 'Paul ESSAI', role: 'ACQUEREUR', civilite: 'M' }],
    authentic: { personnes: [{ nom: 'Paul ESSAI', role: 'ACQUEREUR', situationMatrimoniale: { situation: 'Marié(e)', conjoint: 'Mme TEST Léa' } }] } }]);
  const paul = base.personnes.find(p => p.champs.nomFamille === 'ESSAI');
  assert.deepEqual(paul.champs.emails, ['paul.essai@exemple.fr', 'direction@exemple.fr']);
  assert.deepEqual(paul.champs.telephones, ['06 00 00 00 01']);
  assert.equal(base.personnes.find(p => p.champs.nomFamille === 'EXEMPLE').champs.emails.length, 0);
});

test('import du fichier clients et immeubles d\'Authentic : fiches de base, complétées par les dossiers (étude 19/10)', () => {
  const { assainirImport } = require('../src/importClientsBiens');
  const imp = assainirImport({
    personnes: [{ nom: 'ESSAI', prenom: 'Paul', civilite: 'M', dateNaissance: '12/03/1970', telephones: ['06 00 00 00 01'], emails: ['p.essai@exemple.fr'], domicile: '3 rue Exemple 41000 BLOIS' },
      { nom: 'TEST', prenom: 'Léa', emails: ['pas un email'] }, { nom: '' }],
    biens: [{ adresse: '24 rue des Exemples 41190 SAINT LUBIN EN VERGONNOIS', parcelles: [{ section: 'ZN', numero: '0004' }] }, { adresse: '', parcelles: [] }]
  });
  assert.equal(imp.personnes.length, 2);
  assert.equal(imp.personnes[0].dateNaissance, '1970-03-12');
  assert.equal(imp.personnes[1].emails.length, 0);
  assert.equal(imp.biens.length, 1);
  // Un dossier où Paul ESSAI est acquéreur (fiche du dossier, sans date) : une seule fiche, ses dossiers, et les coordonnées du fichier.
  const base = construireBase([{ id: 'v1', nom: 'EXEMPLE - ESSAI', parties: [{ nom: 'Jean EXEMPLE', role: 'VENDEUR' }, { nom: 'Paul ESSAI', role: 'ACQUEREUR' }] }], {}, imp);
  const paul = base.personnes.filter(p => p.champs.nomFamille === 'ESSAI');
  assert.equal(paul.length, 1);
  assert.equal(paul[0].dossiers.length, 1);
  assert.deepEqual(paul[0].champs.emails, ['p.essai@exemple.fr']);
  assert.equal(paul[0].champs.dateNaissance, '1970-03-12');
  // Léa TEST, seulement dans le fichier : une fiche sans dossier.
  assert.equal(base.personnes.find(p => p.champs.nomFamille === 'TEST').dossiers.length, 0);
  assert.equal(base.biens.length >= 1, true);
  assert.equal(base.biens.find(b => b.parcelles.some(p => p.section === 'ZN')).dossiers.length, 0);
});

test('route d\'import : remplace le fichier du même genre, ne rend que des nombres', async () => {
  const os = require('os');
  const { ouvrirDb } = require('../src/db');
  const { creerApp } = require('../src/app');
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { racineRepo: os.tmpdir(), port: 0, authActive: false } });
  const serveur = app.listen(0);
  await new Promise((r) => serveur.once('listening', r));
  try {
    const url = `http://127.0.0.1:${serveur.address().port}/api/clients-biens/import`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ genre: 'personnes', fichier: 'export.xls', lignes: [{ nom: 'ESSAI', prenom: 'Paul' }] }) });
    const j = await r.json();
    assert.equal(j.personnes, 1);
    assert.equal(JSON.stringify(j).includes('ESSAI'), false, 'aucun nom dans la réponse');
    const liste = await (await fetch(`http://127.0.0.1:${serveur.address().port}/api/clients-biens?q=essai`)).json();
    assert.equal(JSON.stringify(liste).includes('ESSAI'), true);
    const d = await (await fetch(url + '?genre=personnes', { method: 'DELETE' })).json();
    assert.equal(d.personnes, 0);
  } finally { serveur.close(); db.close(); }
});

test('import : jamais le lien entre deux homonymes des dossiers, identifiant stable, appartements distincts (relecture 19/10)', () => {
  const { assainirImport } = require('../src/importClientsBiens');
  const dossiersH = [
    { id: 'a1', nom: 'EXEMPLE - ESSAI', parties: [{ nom: 'Jean ESSAI', role: 'ACQUEREUR' }] },
    { id: 'b2', nom: 'ESSAI - TEST', parties: [{ nom: 'Jean ESSAI', role: 'VENDEUR' }] }
  ];
  const imp = assainirImport({ personnes: [{ nom: 'ESSAI', prenom: 'Jean', dateNaissance: '01/02/1950' }],
    biens: [{ adresse: '3 rue Exemple 41000 BLOIS', parcelles: [{ section: 'AB', numero: '12' }] }, { adresse: '3 rue Exemple 41000 BLOIS', parcelles: [{ section: 'AB', numero: '12' }] }] });
  const base = construireBase(dossiersH, {}, imp);
  const jean = base.personnes.filter(p => p.champs.nomFamille === 'ESSAI');
  assert.equal(jean.some(p => p.dossiers.length === 2), false, 'le père et le fils ne sont pas réunis par le fichier');
  const idImport = jean.flatMap(p => p.occurrences).find(o => o.startsWith('import:'));
  assert.equal(idImport, 'import:essai|jean~19500201');
  // L'occurrence d'un dossier passe avant celle du fichier (les corrections s'y rattachent).
  assert.equal(jean.every(p => !p.occurrences[0].startsWith('import:') || p.occurrences.length === 1), true);
  assert.equal(base.biens.filter(b => b.parcelles.some(p => p.section === 'AB')).length, 2, 'deux lignes sur la même parcelle restent deux biens');
});
