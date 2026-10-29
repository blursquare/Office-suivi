'use strict';

// Index du NAS des dossiers en cours (voir src/indexNas.js) : rubriques « d:<id> » séparées de la mémoire, Word/texte lus par le serveur,
// PDF laissés au poste, résumés par l'IA sur un texte MASQUÉ (jamais une pièce d'identité), dossier archivé retiré. Aucun accès réseau.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { ouvrirDb } = require('../src/db');
const { creerMemoire } = require('../src/memoire');
const I = require('../src/indexNas');
const { sousDossierDe } = require('../src/routes/indexNas');

function nas() {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'idxnas-'));
  fs.mkdirSync(path.join(racine, 'MARTEL', '3 - AAE'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'MARTEL', '3 - AAE', 'Permis.txt'), 'Permis de construire accordé à Camille FOURNIER pour une extension de 20 m2, le 12 mars 2014.');
  fs.writeFileSync(path.join(racine, 'MARTEL', 'Passeport.txt'), 'Passeport de Camille FOURNIER numéro 12AB34567 valable dix ans.');
  fs.writeFileSync(path.join(racine, 'MARTEL', 'Offre.pdf'), '%PDF-1.4 faux');
  return racine;
}
const etatVide = () => ({ enCours: false });

test('parcours : rubrique du dossier, texte lu par le serveur, PDF au poste, jamais mêlé à la mémoire, archivé retiré', async () => {
  const racine = nas();
  const db = ouvrirDb(':memory:');
  try {
    const memoire = creerMemoire(db);
    const dossiers = [{ id: 'd1', nom: 'MARTEL / FOURNIER', nasDossier: 'MARTEL', parties: [{ nom: 'FOURNIER', prenom: 'Camille' }] }];
    const depot = { tousActifs: () => dossiers, trouverParId: (id) => dossiers.find((d) => d.id === id) || null };
    const etat = etatVide();
    await I.parcourirDossiersEnCours({ config: { nasRacine: racine }, memoire, depot, etat });
    assert.equal(etat.erreur, '');
    assert.equal(etat.dossiers, 1);
    assert.equal(etat.luServeur, 2, 'les deux textes sont lus par le serveur');
    assert.equal(memoire.aLire('pdf', 10, { dossiers: true }).length, 1, 'le PDF attend le poste');
    assert.equal(memoire.aLire('pdf', 10).length, 0, 'jamais dans la lecture de la mémoire');
    assert.equal(memoire.chercher('permis construire', { rubrique: 'd:d1' }).passages.length, 1);
    assert.equal(memoire.chercher('permis construire').passages.length, 0, 'une recherche de la mémoire ne voit pas les dossiers');
    assert.equal(sousDossierDe(memoire.documentsRubrique('d:d1').find((x) => /Permis/.test(x.chemin)).chemin), '3 - AAE');
    // Archivage : l'index du dossier disparaît.
    dossiers[0].archive = true;
    await I.parcourirDossiersEnCours({ config: { nasRacine: racine }, memoire, depot: { tousActifs: () => dossiers, trouverParId: (id) => dossiers.find((d) => d.id === id) }, etat });
    assert.deepEqual(memoire.rubriquesDossiers(), []);
  } finally { db.close(); fs.rmSync(racine, { recursive: true, force: true }); }
});

test('résumés : texte masqué avant l’IA, pièce d’identité jamais envoyée, résumé rétabli, deux essais au plus', async () => {
  const racine = nas();
  const db = ouvrirDb(':memory:');
  try {
    const memoire = creerMemoire(db);
    const dossiers = [{ id: 'd1', nom: 'MARTEL / FOURNIER', nasDossier: 'MARTEL', parties: [{ nom: 'FOURNIER', prenom: 'Camille' }] }];
    const depot = { tousActifs: () => dossiers, trouverParId: (id) => dossiers.find((d) => d.id === id) || null };
    await I.parcourirDossiersEnCours({ config: { nasRacine: racine }, memoire, depot, etat: etatVide() });
    const envoyes = [];
    const ia = { disponible: () => ({ ok: true }), json: async (prompt) => { envoyes.push(prompt); const code = (/accordé à (\[[A-Z]+\d+\](?: \[[A-Z]+\d+\])?)/.exec(prompt) || [])[1] || '[NOM9]'; return { type: 'permis de construire', emetteur: 'Mairie', date: '2014-03-12', resume: `Permis accordé à ${code} pour une extension de 20 m2.` }; } };
    const r = await I.resumerDocuments({ memoire, depot, ia, limite: 10 });
    assert.equal(r.resumes, 1);
    assert.equal(r.ignores, 1, 'le passeport n’est pas résumé en ligne');
    assert.equal(envoyes.length, 1);
    assert.doesNotMatch(envoyes[0], /FOURNIER|Camille/, 'aucun nom ne part');
    assert.doesNotMatch(envoyes.join(''), /12AB34567/);
    const doc = memoire.documentsRubrique('d:d1').find((x) => /Permis/.test(x.chemin));
    assert.match(doc.resume, /FOURNIER/, 'code rétabli sur le serveur du bureau');
    assert.equal(doc.type, 'permis de construire');
    assert.equal(doc.date_doc, '2014-03-12');
    const passeport = memoire.documentsRubrique('d:d1').find((x) => /Passeport/.test(x.chemin));
    assert.match(passeport.resume, /non résumée/);
    // Échec : deux essais, puis plus rien à résumer.
    const db2 = ouvrirDb(':memory:');
    const m2 = creerMemoire(db2);
    m2.voirFichier('d:d1', 'a.txt', 'a.txt', 'txt', 10, 1); m2.enregistrerTexte(1, [{ n: 0, texte: 'x'.repeat(200) }]);
    const iaKo = { disponible: () => ({ ok: true }), json: async () => { throw new Error('boum'); } };
    await I.resumerDocuments({ memoire: m2, depot, ia: iaKo }); await I.resumerDocuments({ memoire: m2, depot, ia: iaKo });
    assert.equal(m2.aResumer(5).length, 0);
    db2.close();
    // IA indisponible (plafond) : rien n'est tenté ni marqué.
    const m3db = ouvrirDb(':memory:'); const m3 = creerMemoire(m3db);
    m3.voirFichier('d:d1', 'b.txt', 'b.txt', 'txt', 10, 1); m3.enregistrerTexte(1, [{ n: 0, texte: 'y'.repeat(200) }]);
    const rr = await I.resumerDocuments({ memoire: m3, depot, ia: { disponible: () => ({ ok: false, raison: 'plafond' }), json: async () => { throw new Error('jamais'); } } });
    assert.equal(rr.raison, 'plafond');
    assert.equal(m3.aResumer(5).length, 1);
    m3db.close();
  } finally { db.close(); fs.rmSync(racine, { recursive: true, force: true }); }
});

test('pur : sensibilité du nom, résumé assaini', () => {
  assert.equal(I.cheminSensible('Vendeur/Pièce d’identité.pdf'), true);
  assert.equal(I.cheminSensible('RIB acquereur.pdf'), true);
  assert.equal(I.cheminSensible('Offre de prêt.pdf'), false);
  assert.equal(I.resumeAssaini({ resume: '  Un  permis ', type: 'permis', emetteur: '', date: '2014-13' }).date, '2014-13'.match(/^\d{4}-\d{2}-\d{2}$/) ? '2014-13' : '');
  assert.equal(I.resumeAssaini({ resume: '' }), null);
  assert.equal(I.dossierDeRubrique('d:abc'), 'abc');
  assert.equal(I.dossierDeRubrique('decennales'), '');
});

test('route chercher : extraits et résumé par document, sous-dossier seulement (jamais un nom de fichier), inventaire sans recherche', async () => {
  const express = require('express');
  const { creerRouteurIndexNas } = require('../src/routes/indexNas');
  const racine = nas();
  const db = ouvrirDb(':memory:');
  const memoire = creerMemoire(db);
  const dossiers = [{ id: 'd1', nom: 'MARTEL / FOURNIER', nasDossier: 'MARTEL', parties: [] }];
  const depot = { tousActifs: () => dossiers, trouverParId: (id) => dossiers.find((d) => d.id === id) || null };
  await I.parcourirDossiersEnCours({ config: { nasRacine: racine }, memoire, depot, etat: etatVide() });
  const app = express(); app.use(express.json());
  app.use('/api', creerRouteurIndexNas({ nasRacine: racine }, depot, { lireJsonBrut: () => null, ecrireJsonBrut: () => {} }, memoire));
  const srv = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
  try {
    const base = `http://127.0.0.1:${srv.address().port}/api/index-nas`;
    const r = await (await fetch(`${base}/chercher?dossier=d1&q=permis`)).json();
    assert.equal(r.passages.length, 1);
    assert.equal(r.passages[0].sous_dossier, '3 - AAE');
    assert.doesNotMatch(JSON.stringify(r), /Permis\.txt|\.txt|\.pdf/);
    const inv = await (await fetch(`${base}/chercher?dossier=d1&q=`)).json();
    assert.equal(inv.inventaire.length, 3);
    assert.doesNotMatch(JSON.stringify(inv), /Passeport\.txt|Offre\.pdf/);
    assert.equal((await fetch(`${base}/chercher?dossier=zzz&q=x`)).status, 404);
    const aLire = await (await fetch(`${base}/a-lire`)).json();
    assert.equal(aLire.documents.length, 1);
    assert.equal(memoire.aLire('pdf', 5, { dossiers: true }).length, 0, 'réservé à la fenêtre qui l’a pris');
    const f = await fetch(`${base}/document/${aLire.documents[0].id}/fichier`);
    assert.equal(f.status, 200);
  } finally { srv.close(); db.close(); fs.rmSync(racine, { recursive: true, force: true }); }
});
