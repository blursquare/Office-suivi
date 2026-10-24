'use strict';

// Lecture libre du NAS par l'agent (21/10, palier 2) : éteinte par défaut, confinée, exclusions, rien d'exécutable ni de caché.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const nl = require('../src/nasLibre');

function nasInvente() {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-libre-'));
  const ecrire = (rel, texte) => { const abs = path.join(racine, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, texte); };
  ecrire('MODELES - OUTILS/Modele procuration.txt', 'Je soussigné(e) ... donne pouvoir');
  ecrire('MODELES - OUTILS/Compta/Bilan 2025.txt', 'secret comptable');
  ecrire('MODELES - OUTILS/outil.exe', 'MZ');
  ecrire('MODELES - OUTILS/.cache/x.txt', 'caché');
  ecrire('AUTRES/Courrier divers.txt', 'autre');
  ecrire('AUTRES/Modele hors zone.txt', 'hors zone');
  return racine;
}

test('jamais réglée : ouverte sur tout le NAS avec des mots d’exclusion (24/10) ; réglages assainis (chemins propres, mots simplifiés, bornes)', () => {
  assert.equal(nl.assainirNasLibre(undefined).actif, false);
  const defaut = nl.lireNasLibre({ lireJsonBrut: (c, d) => d });
  assert.deepEqual([defaut.actif, defaut.racines, defaut.exclus], [true, [], nl.EXCLUS_PAR_DEFAUT]);
  assert.equal(nl.lireNasLibre({ lireJsonBrut: () => ({ actif: false }) }).actif, false, 'un réglage enregistré fait foi');
  assert.equal(nl.assainirNasLibre({ actif: 'oui' }).actif, false);
  const r = nl.assainirNasLibre({ actif: true, racines: ['../x', 'A/../B', ' MODELES - OUTILS/ ', '.cache', 'MODELES - OUTILS'], exclus: ['Compta', 'é', '  RH  '] });
  assert.deepEqual(r.racines, ['MODELES - OUTILS']);
  assert.deepEqual(r.exclus, ['compta', 'rh']);
  assert.equal(r.actif, true);
});

test('chemins : jamais « .. » ni dossier caché ; permis selon racines et exclusions', () => {
  assert.equal(nl.cheminRelatifPropre('a/../b'), null);
  assert.equal(nl.cheminRelatifPropre('a/.git/x'), null);
  assert.equal(nl.cheminRelatifPropre('/a//b/'), 'a/b');
  const r = { racines: ['MODELES - OUTILS'], exclus: ['compta'] };
  assert.equal(nl.cheminPermis('MODELES - OUTILS/x.txt', r), true);
  assert.equal(nl.cheminPermis('MODELES - OUTILS/Compta/Bilan.txt', r), false);
  assert.equal(nl.cheminPermis('AUTRES/x.txt', r), false);
  assert.equal(nl.cheminPermis('MODELES - OUTILS 2/x.txt', r), false, 'un dossier voisin au nom proche n’est pas la racine');
  assert.equal(nl.cheminPermis('', r), false);
  assert.equal(nl.cheminPermis('', { racines: [], exclus: [] }), true);
});

test('lister : seulement le permis, sans caché ni exécutable ; la racine ne montre que les dossiers ouverts', async () => {
  const nas = nasInvente();
  const r = { racines: ['MODELES - OUTILS'], exclus: ['compta'] };
  const racine = await nl.listerNasLibre(nas, '', r);
  assert.deepEqual(racine.dossiers.map((d) => d.nom), ['MODELES - OUTILS']);
  const niveau = await nl.listerNasLibre(nas, 'MODELES - OUTILS', r);
  assert.deepEqual(niveau.fichiers.map((f) => f.nom), ['Modele procuration.txt']);
  assert.deepEqual(niveau.dossiers, [], 'Compta est écarté, .cache est caché');
  assert.equal((await nl.listerNasLibre(nas, 'AUTRES', r)).statut, 403);
  assert.equal((await nl.listerNasLibre(nas, '../', r)).statut, 400);
});

test('chercher : tous les mots du chemin, dans la zone permise seulement', async () => {
  const nas = nasInvente();
  const r = { racines: ['MODELES - OUTILS'], exclus: ['compta'] };
  const trouve = await nl.chercherNasLibre(nas, 'modèle PROCURATION', '', r);
  assert.deepEqual(trouve.resultats.map((x) => x.chemin), ['MODELES - OUTILS/Modele procuration.txt']);
  assert.deepEqual((await nl.chercherNasLibre(nas, 'modele hors', '', r)).resultats, [], 'hors des dossiers ouverts');
  assert.deepEqual((await nl.chercherNasLibre(nas, 'bilan', '', r)).resultats, [], 'nom écarté');
  assert.ok(!(await nl.chercherNasLibre(nas, 'outil', '', r)).resultats.some((x) => /\.exe$/.test(x.chemin)), 'jamais un exécutable');
  assert.equal((await nl.chercherNasLibre(nas, 'a', '', r)).statut, 400);
  // Toute la racine ouverte : l'autre dossier se cherche aussi.
  assert.equal((await nl.chercherNasLibre(nas, 'modele hors', '', { racines: [], exclus: [] })).resultats.length, 1);
});

test('lire : texte seulement, permis seulement, repris par tranches ; un PDF et un exécutable refusés', async () => {
  const nas = nasInvente();
  const r = { racines: ['MODELES - OUTILS'], exclus: ['compta'] };
  const ok = await nl.lireTexteNasLibre(nas, 'MODELES - OUTILS/Modele procuration.txt', 0, r);
  assert.match(ok.texte, /donne pouvoir/);
  assert.equal((await nl.lireTexteNasLibre(nas, 'MODELES - OUTILS/Compta/Bilan 2025.txt', 0, r)).statut, 403);
  assert.equal((await nl.lireTexteNasLibre(nas, 'AUTRES/Courrier divers.txt', 0, r)).statut, 403);
  assert.equal((await nl.lireTexteNasLibre(nas, 'MODELES - OUTILS/outil.exe', 0, r)).statut, 400);
  assert.equal((await nl.lireTexteNasLibre(nas, 'MODELES - OUTILS/a.pdf', 0, r)).statut, 415);
  assert.equal((await nl.lireTexteNasLibre(nas, 'MODELES - OUTILS/.cache/x.txt', 0, r)).statut, 400);
  fs.writeFileSync(path.join(nas, 'MODELES - OUTILS', 'long.txt'), 'x'.repeat(nl.MAX_CARACTERES_TEXTE + 10));
  const p1 = await nl.lireTexteNasLibre(nas, 'MODELES - OUTILS/long.txt', 0, r);
  assert.equal(p1.suite, nl.MAX_CARACTERES_TEXTE);
  const p2 = await nl.lireTexteNasLibre(nas, 'MODELES - OUTILS/long.txt', p1.suite, r);
  assert.equal(p2.texte.length, 10);
  assert.equal(p2.suite, undefined);
});

test('un lien symbolique ne sort jamais de la racine du NAS', async (t) => {
  const nas = nasInvente();
  const dehors = fs.mkdtempSync(path.join(os.tmpdir(), 'hors-nas-'));
  fs.writeFileSync(path.join(dehors, 'secret.txt'), 'hors du NAS');
  try { fs.symlinkSync(dehors, path.join(nas, 'MODELES - OUTILS', 'lien')); } catch (_) { t.skip('liens symboliques indisponibles'); return; }
  const r = { racines: [], exclus: [] };
  assert.ok((await nl.lireTexteNasLibre(nas, 'MODELES - OUTILS/lien/secret.txt', 0, r)).erreur);
  assert.deepEqual((await nl.chercherNasLibre(nas, 'secret', '', r)).resultats, []);
});

test('routes : 403 tant que c’est éteint, puis lister / chercher / texte / pdf confinés aux réglages', async () => {
  const express = require('express');
  const { creerRouteurNasLibre } = require('../src/routes/nasLibre');
  const nas = nasInvente();
  fs.writeFileSync(path.join(nas, 'MODELES - OUTILS', 'Modele.pdf'), '%PDF-1.4 inventé');
  fs.writeFileSync(path.join(nas, 'AUTRES', 'Dehors.pdf'), '%PDF-1.4 inventé');
  // Réglage jamais fait = ouverte (24/10) ; ici l'étude l'a éteinte.
  const stock = { 'agent-nas-libre': { actif: false, racines: [], exclus: [] } };
  const repo = { lireJsonBrut: (cle, defaut) => (cle in stock ? stock[cle] : defaut), ecrireJsonBrut: (cle, v) => { stock[cle] = v; } };
  const app = express();
  app.use(express.json());
  app.use('/api', creerRouteurNasLibre({ nasRacine: nas }, repo));
  const serveur = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${serveur.address().port}/api/nas-libre`;
  try {
    for (const u of ['/lister', '/chercher?texte=modele', '/texte?chemin=a.txt', '/pdf?chemin=a.pdf']) assert.equal((await fetch(base + u)).status, 403, `${u} éteint`);
    const put = await fetch(base + '/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actif: true, racines: ['MODELES - OUTILS'], exclus: ['compta'] }) });
    assert.equal((await put.json()).actif, true);
    assert.equal((await (await fetch(base + '/lister?sous=MODELES%20-%20OUTILS')).json()).fichiers.length, 2);
    assert.equal((await fetch(base + '/lister?sous=AUTRES')).status, 403);
    assert.equal((await (await fetch(base + '/chercher?texte=procuration')).json()).resultats.length, 1);
    assert.equal((await fetch(base + '/texte?chemin=' + encodeURIComponent('MODELES - OUTILS/Modele procuration.txt'))).status, 200);
    const pdf = await fetch(base + '/pdf?chemin=' + encodeURIComponent('MODELES - OUTILS/Modele.pdf'));
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal((await fetch(base + '/pdf?chemin=' + encodeURIComponent('AUTRES/Dehors.pdf'))).status, 403);
    assert.equal((await fetch(base + '/pdf?chemin=' + encodeURIComponent('MODELES - OUTILS/Modele procuration.txt'))).status, 400);
    assert.equal((await fetch(base + '/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ racines: 'x' }) })).status, 400);
  } finally { serveur.close(); }
});

test('relecture 21/10 : des dossiers saisis tous refusés n’ouvrent jamais tout le NAS ; un lien vers un dossier exclu ne contourne rien', async (t) => {
  assert.deepEqual(nl.racinesRefusees(['..\\MODELES', '.', ' ', 'MODELES - OUTILS', '.archives']), ['..\\MODELES', '.', '.archives']);
  const nas = nasInvente();
  const r = { racines: [], exclus: ['compta'] };
  try { fs.symlinkSync(path.join(nas, 'MODELES - OUTILS', 'Compta'), path.join(nas, 'MODELES - OUTILS', 'raccourci')); } catch (_) { t.skip('liens symboliques indisponibles'); return; }
  assert.equal((await nl.lireTexteNasLibre(nas, 'MODELES - OUTILS/raccourci/Bilan 2025.txt', 0, r)).statut, 403, 'chemin réel exclu');
  assert.equal((await nl.listerNasLibre(nas, 'MODELES - OUTILS/raccourci', r)).statut, 403);
});

test('audit 21/10 : tout le NAS seulement sur demande explicite ; HTML forgé en temps linéaire ; Word forgé aussi', async () => {
  const express = require('express');
  const { creerRouteurNasLibre } = require('../src/routes/nasLibre');
  const stock = {};
  const repo = { lireJsonBrut: (cle, defaut) => (cle in stock ? stock[cle] : defaut), ecrireJsonBrut: (cle, v) => { stock[cle] = v; } };
  const app = express(); app.use(express.json()); app.use('/api', creerRouteurNasLibre({ nasRacine: nasInvente() }, repo));
  const serveur = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const url = `http://127.0.0.1:${serveur.address().port}/api/nas-libre/reglages`;
  const put = (corps) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  try {
    assert.equal((await put({ actif: true, racines: [] })).status, 400);
    assert.equal((await put({ actif: true })).status, 400);
    assert.equal((await put({ actif: true, racines: [], toutLeNas: true })).status, 200);
    assert.equal((await put({ actif: false, racines: [] })).status, 200, 'éteindre ne demande rien');
  } finally { serveur.close(); }
  const nas = nasInvente();
  fs.writeFileSync(path.join(nas, 'AUTRES', 'forge.html'), '<script>'.repeat(200000) + 'texte');
  const t0 = Date.now();
  const rep = await nl.lireTexteNasLibre(nas, 'AUTRES/forge.html', 0, { racines: [], exclus: [] });
  assert.ok(Date.now() - t0 < 3000, 'html forgé : ' + (Date.now() - t0) + ' ms');
  assert.ok(rep.texte !== undefined);
  const { texteDocumentXml } = require('../src/memoire');
  const t1 = Date.now();
  texteDocumentXml('<w:document>' + '<w:del '.repeat(200000) + '<w:p><w:r><w:t>vrai</w:t></w:r></w:p>');
  texteDocumentXml('<w:p>'.repeat(200000));
  assert.ok(Date.now() - t1 < 3000, 'xml forgé : ' + (Date.now() - t1) + ' ms');
  assert.match(texteDocumentXml('<w:p><w:r><w:t>a</w:t></w:r><w:del w:id="1"><w:r><w:delText>x</w:delText></w:r></w:del></w:p><w:p><w:r><w:t>b</w:t></w:r></w:p>'), /a[\s\S]*b/);
});

test('23/10 : un dossier voisin de la racine (MODELES - OUTILS dans le partage Commun) se lit seulement s’il est nommé dans « Dossiers ouverts », sans jamais en sortir', async () => {
  const commun = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-commun-'));
  const ecrire = (rel, texte) => { const abs = path.join(commun, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, texte); };
  ecrire('CLIENTS/VTE X/fiche.txt', 'client');
  ecrire('MODELES - OUTILS/Note honoraires.txt', 'modele de note');
  ecrire('RAPPEL DE PROCEDURES/p.txt', 'procedure');
  ecrire('SECRET/s.txt', 'secret');
  const racine = path.join(commun, 'CLIENTS');
  const dossiers = [{ nom: 'MODELES - OUTILS', chemin: path.join(commun, 'MODELES - OUTILS') }, { nom: 'RAPPEL DE PROCEDURES', chemin: path.join(commun, 'RAPPEL DE PROCEDURES') }];
  const r = { racines: ['MODELES - OUTILS'], exclus: [] };
  const supp = nl.supplementairesPermis(dossiers, r);
  assert.deepEqual(supp.map((d) => d.nom), ['MODELES - OUTILS'], 'seul le dossier nommé');
  assert.deepEqual(nl.supplementairesPermis(dossiers, { racines: [], exclus: [] }), [], 'jamais sans dossier nommé');
  assert.deepEqual(nl.supplementairesPermis(dossiers, { racines: ['MODELES - OUTILS'], exclus: ['outils'] }), [], 'un nom exclu n’apparaît pas');
  const racineListe = await nl.listerNasLibre(racine, '', r, supp);
  assert.deepEqual(racineListe.dossiers.map((d) => d.nom), ['MODELES - OUTILS']);
  const dedans = await nl.listerNasLibre(racine, 'MODELES - OUTILS', r, supp);
  assert.deepEqual(dedans.fichiers.map((f) => f.nom), ['Note honoraires.txt']);
  const trouve = await nl.chercherNasLibre(racine, 'note honoraires', '', r, {}, supp);
  assert.deepEqual(trouve.resultats.map((x) => x.chemin), ['MODELES - OUTILS/Note honoraires.txt']);
  const texte = await nl.lireTexteNasLibre(racine, 'MODELES - OUTILS/Note honoraires.txt', 0, r, supp);
  assert.equal(texte.texte, 'modele de note');
  assert.equal((await nl.lireTexteNasLibre(racine, 'SECRET/s.txt', 0, r, supp)).statut, 403);
  assert.ok((await nl.listerNasLibre(racine, 'SECRET', r, supp)).erreur, 'un voisin non nommé reste fermé');
  // un lien du dossier nommé vers un voisin ne le contourne pas
  try { fs.symlinkSync(path.join(commun, 'SECRET'), path.join(commun, 'MODELES - OUTILS', 'lien')); } catch (_) { return; }
  const via = await nl.lireTexteNasLibre(racine, 'MODELES - OUTILS/lien/s.txt', 0, r, supp);
  assert.ok(via.erreur, 'le lien ne sort pas du dossier nommé');
});
