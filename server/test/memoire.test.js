'use strict';

// Mémoire de CLAIRE (étude 15/10) : reconnaissance des quatre dossiers, texte des Word, passages, recherche en plein texte, parcours d'un
// NAS inventé, routes (aucun nom de fichier dans une recherche, confinement), et « rien de nominatif ne part » vers l'IA. Données inventées.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const M = require('../src/memoire');
const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');
const { creerRouteurMemoire } = require('../src/routes/memoire');
const { tourAgent, viderConversationsAgent, OUTILS_AGENT } = require('../src/assistantAgent');

/** Un .docx minimal (ZIP déflaté) dont word/document.xml porte ces paragraphes. */
function docx(paragraphes, { supprime = '' } = {}) {
  const xml = '<?xml version="1.0"?><w:document><w:body>' + paragraphes.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p.replace(/&/g, '&amp;')}</w:t></w:r></w:p>`).join('')
    + (supprime ? `<w:p><w:del><w:r><w:delText>${supprime}</w:delText><w:t>${supprime}</w:t></w:r></w:del></w:p>` : '') + '</w:body></w:document>';
  const donnees = zlib.deflateRawSync(Buffer.from(xml, 'utf8'));
  const nom = Buffer.from('word/document.xml');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(donnees.length, 18); local.writeUInt32LE(xml.length, 22); local.writeUInt16LE(nom.length, 26);
  const corps = Buffer.concat([local, nom, donnees]);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(donnees.length, 20); central.writeUInt32LE(xml.length, 24); central.writeUInt16LE(nom.length, 28); central.writeUInt32LE(0, 42);
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10); fin.writeUInt32LE(46 + nom.length, 12); fin.writeUInt32LE(corps.length, 16);
  return Buffer.concat([corps, central, nom, fin]);
}

test('les quatre dossiers sont reconnus par leur nom (casse, accents et ponctuation indifférents)', () => {
  assert.equal(M.rubriqueDuNom('DECENNALES ENTREPRISES').cle, 'decennales');
  assert.equal(M.rubriqueDuNom('Décennales  entreprises').cle, 'decennales');
  assert.equal(M.rubriqueDuNom('FAUSSES MINUTES').cle, 'fausses-minutes');
  assert.equal(M.rubriqueDuNom('MODELES - OUTILS').cle, 'modeles-outils');
  assert.equal(M.rubriqueDuNom('Modèles – Outils').cle, 'modeles-outils');
  assert.equal(M.rubriqueDuNom('RAPPEL DE PROCEDURES').cle, 'rappel-procedures');
  assert.equal(M.rubriqueDuNom('MAISON'), null);
  assert.equal(M.extensionLue('Attestation.PDF'), 'pdf');
  assert.equal(M.extensionLue('x.xlsx'), '');
});

test('Word : le texte des paragraphes, sans les passages supprimés ; archive illisible refusée', async () => {
  const buf = docx(['Modèle de procuration', 'Le mandant & le mandataire'], { supprime: 'TEXTE SUPPRIMÉ' });
  const t = await M.texteDocx(buf);
  assert.equal(t, 'Modèle de procuration\nLe mandant & le mandataire');
  await assert.rejects(() => M.texteDocx(Buffer.from('pas un zip')));
});

test('passages : 700 à 1 000 caractères, jamais coupés au milieu d’un mot, numérotés par page', () => {
  const long = Array.from({ length: 60 }, (_, i) => `Phrase numéro ${i} de la procédure de l’étude.`).join(' ');
  const passages = M.decouperTexte(long);
  assert.ok(passages.length >= 3);
  assert.ok(passages.every((p) => p.length <= 1000), passages.map((p) => p.length).join(','));
  assert.equal(passages.join(' ').replace(/\s+/g, ' ').length >= long.length - 5, true);
  const p = M.passagesDesPages([{ n: 1, texte: 'un texte court' }, { n: 2, texte: 'un autre' }]);
  assert.deepEqual(p.map((x) => x.page), [1, 2]);
});

test('requête : mots utiles sans accent ni pluriel, ET puis OU, en préfixe', () => {
  assert.deepEqual(M.motsDeRecherche('Quelle est la décennale des entreprises de maçonnerie ?'), ['decennale', 'entreprise', 'maconnerie']);
  assert.equal(M.requeteFts(['decennale', 'entreprise'], 'et'), '"decennale"* AND "entreprise"*');
  assert.equal(M.requeteFts([], 'ou'), '');
});

test('base : indexation, recherche plein texte sans accent, remplacement d’un document changé, retrait d’un absent', () => {
  const memoire = M.creerMemoire(new DatabaseSync(':memory:'));
  assert.equal(memoire.voirFichier('decennales', 'a/Attestation maçon.pdf', 'Attestation maçon.pdf', 'pdf', 1000, 1), 'nouveau');
  assert.equal(memoire.voirFichier('decennales', 'a/Attestation maçon.pdf', 'Attestation maçon.pdf', 'pdf', 1000, 1), 'inchange');
  const id = memoire.aLire('pdf', 5)[0].id;
  memoire.enregistrerTexte(id, [{ n: 1, texte: 'Assurance responsabilité décennale, garantie de dix ans pour les travaux de maçonnerie.' }, { n: 2, texte: 'Validité du 1er janvier au 31 décembre.' }], { ocr: true });
  assert.equal(memoire.aLire('pdf', 5).length, 0);
  const r = memoire.chercher('décennale maçonnerie');
  assert.equal(r.passages.length, 1);
  assert.equal(r.passages[0].page, 1);
  assert.equal(r.passages[0].rubrique, 'decennales');
  assert.deepEqual(Object.keys(r.passages[0]).sort(), ['doc', 'extrait', 'page', 'rubrique']);
  assert.equal(memoire.chercher('décennale', { rubrique: 'fausses-minutes' }).passages.length, 0);
  assert.equal(memoire.chercher('zzzzz').passages.length, 0);
  // Le fichier change : ses anciens passages disparaissent et il redevient « à lire ».
  assert.equal(memoire.voirFichier('decennales', 'a/Attestation maçon.pdf', 'Attestation maçon.pdf', 'pdf', 1200, 2), 'change');
  assert.equal(memoire.chercher('décennale').passages.length, 0);
  assert.equal(memoire.aLire('pdf', 5).length, 1);
  assert.equal(memoire.retirerAbsents('decennales', []), 1);
  assert.equal(memoire.etat().lignes.length, 0);
  // Un PDF trop gros n'est pas lu.
  memoire.voirFichier('decennales', 'gros.pdf', 'gros.pdf', 'pdf', 61 * 1024 * 1024, 1);
  assert.equal(memoire.aLire('pdf', 5).length, 0);
});

function nasInvente() {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-memoire-'));
  const commun = path.join(racine, 'COMMUN');
  fs.mkdirSync(path.join(commun, 'DOSSIERS'), { recursive: true });
  const dec = path.join(racine, 'DECENNALES ENTREPRISES', 'Maçonnerie');
  const proc = path.join(racine, 'RAPPEL DE PROCEDURES');
  fs.mkdirSync(dec, { recursive: true }); fs.mkdirSync(proc, { recursive: true });
  fs.writeFileSync(path.join(dec, 'Attestation DURAND Maçonnerie.pdf'), '%PDF-1.4 faux');
  fs.writeFileSync(path.join(proc, 'Procédure SAFER.docx'), docx(['Notifier la SAFER par Vigifoncier', 'Délai de deux mois']));
  fs.writeFileSync(path.join(proc, 'notes.txt'), 'Rappel : vérifier la purge du droit de préemption urbain.');
  fs.writeFileSync(path.join(proc, '~$Procédure SAFER.docx'), 'verrou Word');
  fs.writeFileSync(path.join(proc, 'tableau.xlsx'), 'ignoré');
  return { racine, config: { nasRacine: path.join(commun, 'DOSSIERS') } };
}

test('parcours d’un NAS inventé : dossiers trouvés à côté de la racine, Word et texte lus, PDF laissés au poste, verrous ignorés', async () => {
  const { racine, config } = nasInvente();
  const memoire = M.creerMemoire(new DatabaseSync(':memory:'));
  const etat = {};
  await M.parcourirMemoire({ config, memoire, etat });
  assert.equal(etat.erreur, '');
  assert.deepEqual(etat.dossiers.map((d) => d.cle).sort(), ['decennales', 'rappel-procedures']);
  assert.equal(etat.vus, 3);
  assert.equal(etat.luServeur, 2);
  assert.equal(memoire.chercher('vigifoncier').passages.length, 1);
  assert.equal(memoire.chercher('purge préemption').passages.length, 1);
  assert.equal(memoire.aLire('pdf', 5).length, 1);
  // Un second parcours ne relit rien ; un fichier disparu quitte la mémoire.
  await M.parcourirMemoire({ config, memoire, etat });
  assert.equal(etat.nouveaux, 0);
  fs.rmSync(path.join(racine, 'RAPPEL DE PROCEDURES', 'notes.txt'));
  await M.parcourirMemoire({ config, memoire, etat });
  assert.equal(etat.retires, 1);
  assert.equal(memoire.chercher('purge préemption').passages.length, 0);
  fs.rmSync(racine, { recursive: true, force: true });
});

test('confinement : un chemin hors du dossier ou un lien symbolique qui en sort est refusé', async () => {
  const { racine } = nasInvente();
  const dossier = path.join(racine, 'RAPPEL DE PROCEDURES');
  assert.ok(await M.cheminDocumentMemoire(dossier, 'notes.txt'));
  assert.equal(await M.cheminDocumentMemoire(dossier, '../DECENNALES ENTREPRISES/Maçonnerie/Attestation DURAND Maçonnerie.pdf'), null);
  fs.symlinkSync(path.join(racine, 'DECENNALES ENTREPRISES'), path.join(dossier, 'lien'));
  assert.equal(await M.cheminDocumentMemoire(dossier, 'lien/Maçonnerie/Attestation DURAND Maçonnerie.pdf'), null);
  assert.equal(await M.cheminDocumentMemoire(dossier, 'x\0y'), null);
  fs.rmSync(racine, { recursive: true, force: true });
});

async function avecServeur(config, fn) {
  const db = ouvrirDb(':memory:');
  const routeur = creerRouteurMemoire(config, db, creerRepoParametres(db));
  const app = express(); app.use(express.json({ limit: '5mb' })); app.use('/api', routeur);
  const serveur = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${serveur.address().port}/api`;
  try { await fn(base, routeur); } finally { serveur.close(); }
}

test('routes : parcours, texte posté par le poste, recherche sans nom de fichier, fichier PDF confiné', async () => {
  const { racine, config } = nasInvente();
  await avecServeur(config, async (base, routeur) => {
    assert.equal((await (await fetch(base + '/memoire/parcourir', { method: 'POST' })).json()).lance, true);
    for (let i = 0; i < 100 && routeur.etatParcours.enCours; i++) await new Promise((ok) => setTimeout(ok, 20));
    const etat = await (await fetch(base + '/memoire/etat')).json();
    const dec = etat.rubriques.find((r) => r.cle === 'decennales');
    assert.equal(dec.trouve, true); assert.equal(dec.aLire, 1);
    assert.equal(etat.rubriques.find((r) => r.cle === 'fausses-minutes').trouve, false);
    const { documents } = await (await fetch(base + '/memoire/a-lire')).json();
    assert.equal(documents.length, 1);
    const pdf = await fetch(base + `/memoire/document/${documents[0].id}/fichier`);
    assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.match(await pdf.text(), /%PDF/);
    const post = await fetch(base + `/memoire/document/${documents[0].id}/texte`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: [{ n: 1, texte: 'Attestation d’assurance décennale de l’entreprise DURAND, maçonnerie, valable en 2026.' }], ocr: true }) });
    assert.equal(post.status, 200);
    const r = await (await fetch(base + '/memoire/chercher?q=' + encodeURIComponent('décennale maçonnerie'))).json();
    assert.equal(r.passages.length, 1);
    assert.equal(r.passages[0].libelle, 'Décennales des entreprises');
    assert.equal(r.passages[0].page, 1);
    assert.doesNotMatch(JSON.stringify(r), /Attestation DURAND Maçonnerie\.pdf|\.pdf|Ma[cç]onnerie\//, 'aucun nom de fichier ni chemin');
    assert.equal((await fetch(base + '/memoire/document/999/fichier')).status, 404);
    assert.equal((await fetch(base + '/memoire/document/1/texte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pages: 'x' }) })).status, 400);
    assert.equal((await (await fetch(base + '/memoire/chercher?q=zzzz')).json()).passages.length, 0);
  });
  fs.rmSync(racine, { recursive: true, force: true });
});

test('agent : l’outil existe ; un tiers cité dans un extrait ne part pas chez l’IA', async () => {
  assert.ok(OUTILS_AGENT.some((t) => t.name === 'chercher_dans_la_memoire' && t.strict === true && t.input_schema.additionalProperties === false));
  viderConversationsAgent();
  const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const requetes = [];
  const reponses = [
    { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 'm1', name: 'chercher_dans_la_memoire', input: { recherche: 'décennale maçonnerie', rubrique: '' } }] },
    { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Voici ce que dit la mémoire.' }] }
  ];
  const client = { beta: { messages: { create: async (req) => { requetes.push(JSON.parse(JSON.stringify(req))); return reponses.shift(); } } } };
  const o = { cle: 'k', client };
  let r = await tourAgent({ texte: 'Quelle décennale pour le maçon ?', dossiers: [], contexte: { aujourdhui: '2026-10-15', prenom: 'Bastien' } }, o);
  assert.equal(r.appels[0].nom, 'chercher_dans_la_memoire');
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 'm1', contenu: { nombre: 1, passages: [{ rubrique: 'Décennales des entreprises', page: 1,
    extrait: 'Attestation de la société MARTIN BATIMENT, représentée par Monsieur Gérard LEMAIRE, tél. 02 54 12 34 56, contact g.lemaire@exemple.fr. Garantie dix ans.' }] } }] }, o);
  assert.equal(r.reponse, 'Voici ce que dit la mémoire.');
  const envoye = JSON.stringify(requetes[1].messages);
  assert.doesNotMatch(envoye, /LEMAIRE|Gérard|MARTIN|g\.lemaire|02 54 12 34 56/, envoye.slice(-700));
  assert.match(envoye, /dix ans/);
});

test('extraits d’actes : naissances, adresses et codes postaux retirés (audit 15/10)', () => {
  const t = M.expurgerExtrait('Madame Léa DURAND, née à Tours le 12 mars 1980, demeurant 12 bis rue des Tanneurs, 41000 BLOIS. Prix : 245 000 euros, acte du 20 novembre 2026.');
  assert.doesNotMatch(t, /1980|Tanneurs|41000|BLOIS|Tours/);
  assert.match(t, /245 000 euros/);
  assert.match(t, /20 novembre 2026/);
});

test('NAS indisponible un instant : un Word reste à lire et le listage incomplet ne retire rien (audit 15/10)', async () => {
  const { racine, config } = nasInvente();
  const memoire = M.creerMemoire(new DatabaseSync(':memory:'));
  const etat = {};
  await M.parcourirMemoire({ config, memoire, etat });
  assert.equal(memoire.chercher('vigifoncier').passages.length, 1);
  // Un sous-dossier qui ne répond plus : rien n'est retiré.
  const fsPanne = { ...require('node:fs/promises'), readdir: async (c, o) => { if (/RAPPEL/.test(c)) throw new Error('NAS'); return require('node:fs/promises').readdir(c, o); } };
  await M.parcourirMemoire({ config, memoire, etat, fsImpl: fsPanne });
  assert.equal(etat.retires, 0);
  assert.equal(memoire.chercher('vigifoncier').passages.length, 1);
  // Un fichier illisible : « erreur », retenté au parcours suivant.
  fs.writeFileSync(path.join(racine, 'RAPPEL DE PROCEDURES', 'cassé.docx'), 'pas un zip');
  await M.parcourirMemoire({ config, memoire, etat });
  assert.equal(etat.erreurs, 1);
  fs.writeFileSync(path.join(racine, 'RAPPEL DE PROCEDURES', 'cassé.docx'), docx(['Réparé : procédure de purge']), { flag: 'w' });
  const t = new Date(Date.now() + 5000); fs.utimesSync(path.join(racine, 'RAPPEL DE PROCEDURES', 'cassé.docx'), t, t);
  await M.parcourirMemoire({ config, memoire, etat });
  assert.equal(memoire.chercher('purge procédure').passages.length >= 1, true);
  fs.rmSync(racine, { recursive: true, force: true });
});

test('index plein texte : retirer un document ne touche pas aux autres ; mémoire indisponible → 503 sans empêcher le démarrage', async () => {
  const memoire = M.creerMemoire(new DatabaseSync(':memory:'));
  memoire.voirFichier('decennales', 'a.pdf', 'a.pdf', 'pdf', 10, 1); memoire.voirFichier('decennales', 'b.pdf', 'b.pdf', 'pdf', 10, 1);
  const [a, b] = memoire.aLire('pdf', 5);
  memoire.enregistrerTexte(a.id, [{ n: 1, texte: 'alpha maçonnerie' }]); memoire.enregistrerTexte(b.id, [{ n: 1, texte: 'beta maçonnerie' }]);
  memoire.retirerAbsents('decennales', ['b.pdf']);
  const r = memoire.chercher('maçonnerie');
  assert.equal(r.passages.length, 1);
  assert.equal(r.passages[0].doc, b.id);
  // Base sans FTS5 exploitable : le routeur se monte quand même.
  const cassee = { exec() { throw new Error('no such module: fts5'); }, prepare() { throw new Error('x'); } };
  const routeur = creerRouteurMemoire({}, cassee, { ecrire() {}, lire() {} });
  const app = express(); app.use('/api', routeur);
  const serveur = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try { assert.equal((await fetch(`http://127.0.0.1:${serveur.address().port}/api/memoire/etat`)).status, 503); } finally { serveur.close(); }
});
