'use strict';
// Extension Chrome « CLAIRE — Assistant de saisie » (extension-chrome/) : la fiche d'un dossier servie par le serveur
// (server/src/gnau.js) passée par les scénarios CUa / DIA et les formats du guichet (lib/fiche.js) — données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ficheGnau } = require('../server/src/gnau');

const racine = path.join(__dirname, '..', 'extension-chrome');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(racine, 'lib', 'fiche.js'), 'utf8'), ctx);
const { resolveField, expandFields } = ctx.ClaireFiche;
const scenario = (f) => JSON.parse(fs.readFileSync(path.join(racine, 'scenarios', f), 'utf8'));

const dossier = {
  id: 'v1', nom: 'MOREAU / LAMBERT', adresseBien: 'VINEUIL (41350), 12 rue des Vignes', prixVente: 92500, prixMobilier: 3000,
  honoraires: { montantTTC: 4500, charge: 'VENDEUR', nom: 'AGENCE' },
  parties: [{ role: 'VENDEUR', nom: 'Paul MOREAU', civilite: 'M' }, { role: 'VENDEUR', nom: 'Léa MOREAU', civilite: 'Mme' }, { role: 'ACQUEREUR', nom: 'Claire LAMBERT' }],
  bien: { lots: [{ numero: '4', batiment: 'B', etage: '1', tantiemes: 128, designation: 'Un appartement', surfaceCarrez: 44 }], tantiemesTotal: 1000 },
  authentic: { immeubles: [{ commune: 'VINEUIL', codePostal: '41350', parcelles: [{ section: 'EV', numero: '10', surface: '606' }, { section: 'EV', numero: '11', surface: '5 a 98 ca' }] }],
    fichesClients: { a: { nom: 'Paul MOREAU', nomFamille: 'MOREAU', prenom: 'Paul', dateNaissance: '1961-03-12', lieuNaissance: '41000 BLOIS', domicile: '4 allée des Saules 41350 VINEUIL', profession: 'Retraité' } } }
};

const valeurs = (sc, fiche) => {
  const r = {};
  for (const page of sc.pages) for (const f of expandFields(page, fiche)) { const x = resolveField(f, fiche); r[f.label] = x.missing ? null : x.invalid ? 'INVALIDE ' + x.error : x.value; }
  return r;
};

test('CUa : terrain, parcelles au format du guichet, superficie, signature', () => {
  const v = valeurs(scenario('cua-gnau.json'), ficheGnau(dossier, 'cua', '2026-10-16'));
  assert.equal(v['Terrain — voie (code T2V)'], 'rue des Vignes');
  assert.equal(v['Terrain — numéro (code T2Q, à confirmer)'], '12');
  assert.equal(v['Parcelles (format du guichet, à coller si besoin)'], '¢EV¢10¢606¢¡¢EV¢11¢598¢');
  assert.equal(v['Superficie totale du terrain, m² (code D5T)'], '1204');
  assert.equal(v['Le (code E1D)'], '16102026');
  assert.equal(v['Signataire (code E1S)'], 'Maître Sophie GOSSART');
});

test('DIA : vendeur, codemandeur, naissance JJMMAAAA, prix en lettres, lots, commission', () => {
  const v = valeurs(scenario('dia-gnau.json'), ficheGnau(dossier, 'dia', '2026-10-16'));
  assert.equal(v['Vendeur — nom (code AI1NP1)'], 'MOREAU');
  assert.equal(v['Vendeur — prénom (code AI1PP1)'], 'Paul');
  assert.equal(v['Vendeur — date de naissance'], '12031961');
  assert.equal(v['Vendeur — commune de naissance'], 'BLOIS');
  assert.equal(v['2ᵉ propriétaire — prénom (code AI1PP2)'], 'Léa');
  assert.equal(v['Codemandeur 1 — prénom'], 'Léa');
  assert.equal(v['Prix, en chiffres'], '92500');
  assert.equal(v['Prix, en lettres'], 'quatre-vingt-douze-mille-cinq-cents euros');
  assert.equal(v['Mobilier, en chiffres'], '3000');
  assert.equal(v['Parcelles (format du guichet, à coller si besoin)'], '¢EV¢10¢¢12 RUE DES VIGNES¢VINEUIL¢606¢¡¢EV¢11¢¢12 RUE DES VIGNES¢VINEUIL¢598¢');
  assert.equal(v['Lots de copropriété (format du guichet, à coller si besoin)'], '4¢B¢1¢128/1000¢Un appartement¢44');
  assert.equal(v['Commission (format du guichet, à coller si besoin)'], '0¢false¢true¢4500¢4500¢false¢true¢');
  // Pas de fiche client lue pour Léa : sa date de naissance reste vide, jamais devinée.
  assert.equal(v['Codemandeur 1 — date de naissance'], null);
});

function forbiddenDuContent() {
  const content = fs.readFileSync(path.join(racine, 'content', 'content.js'), 'utf8');
  const m = /const FORBIDDEN = \/(.+)\/i;/.exec(content);
  return new RegExp(m[1], 'i');
}

test('manifeste : les guichets connus, CLAIRE sur autorisation, jamais localhost', () => {
  const m = JSON.parse(fs.readFileSync(path.join(racine, 'manifest.json'), 'utf8'));
  assert.ok(m.host_permissions.includes('https://demande-urbanisme.agglopolys.fr/*'));
  assert.ok(!JSON.stringify(m).includes('localhost') && !JSON.stringify(m).includes('127.0.0.1'));
  assert.deepEqual(m.content_scripts[0].matches, m.host_permissions);
  assert.ok(m.optional_host_permissions.includes('http://*/*'));
  // Les boutons de validation restent interdits, quel que soit le scénario.
  const FORBIDDEN = forbiddenDuContent();
  for (const t of ['valider', 'envoyer', 'signer', 'transmettre', 'deposer une demande', 'Déposer', 'depot du dossier', 'confirmer']) assert.ok(FORBIDDEN.test(t), t);
  assert.ok(!FORBIDDEN.test('suivant'));
});

test('prix en lettres : millions au pluriel et « d’euros » pour un nombre rond de millions (relecture 16/10)', () => {
  const t = ctx.ClaireFiche.TRANSFORMS.prix_lettres;
  assert.equal(t(80000000), 'quatre-vingts-millions d\'euros');
  assert.equal(t(200000000), 'deux-cents-millions d\'euros');
  assert.equal(t(1000000), 'un-million d\'euros');
  assert.equal(t(1250000), 'un-million-deux-cent-cinquante-mille euros');
  assert.equal(t(80), 'quatre-vingts euros');
  assert.equal(t(81000), 'quatre-vingt-un-mille euros');
});

test('CLAIRE pilote le guichet : ouverture de la démarche par le texte, champs par code puis libellé, jamais un bouton de validation', () => {
  for (const f of ['cua-gnau.json', 'dia-gnau.json']) {
    const sc = scenario(f);
    assert.equal(sc.auto, true);
    assert.ok(sc.etapes.length >= 2 && sc.etapes.every((e) => e.label && e.textes.length));
    const FORBIDDEN = forbiddenDuContent();
    // « Suivant » ne vise jamais un bouton de la liste noire ; seule l'étape d'ouverture (lien de l'accueil) peut dire « Déposer une demande ».
    for (const motif of sc.suivant) assert.ok(!FORBIDDEN.test(motif.replace(/\\./g, '')), motif);
    for (const motif of sc.etapes.slice(1).flatMap((e) => e.textes)) assert.ok(!FORBIDDEN.test(motif.replace(/\\./g, '')), motif);
    // Étapes ancrées : un libellé de case ou un lien d'aide qui CONTIENT « information » n'est pas une étape.
    for (const motif of sc.etapes.flatMap((e) => e.textes)) assert.ok(motif.startsWith('^'), motif);
    const champs = sc.pages.flatMap((p) => p.fields);
    // Tout champ a un code CERFA, un libellé, ou se copie (format du guichet) — jamais rien.
    for (const c of champs.flatMap((c) => c.forEach ? c.fields : [c])) assert.ok(c.code || (c.libelles && c.libelles.length) || c.choix || c.encoded || /Codemandeur|propriétaire/.test(c.label), c.label);
  }
  assert.ok(scenario('dia-gnau.json').etapes.some((e) => e.textes.some((t) => new RegExp(t).test("declaration d'intention d'aliener (dia)"))));
  assert.ok(scenario('cua-gnau.json').etapes.some((e) => e.textes.some((t) => new RegExp(t).test("certificat d'urbanisme"))));
});

test('guichet d’Agglopolys : scénarios par les codes du CERFA, entrée par la commune de dépôt, jamais un champ calculé par le site', () => {
  const index = JSON.parse(fs.readFileSync(path.join(racine, 'scenarios', 'index.json'), 'utf8'));
  const content = fs.readFileSync(path.join(racine, 'content', 'content.js'), 'utf8');
  const FORBIDDEN = forbiddenDuContent();
  const JAMAIS = new RegExp(/const JAMAIS_ECRIRE = \/(.+)\/i;/.exec(content)[1], 'i');
  for (const t of ['OPLSTPARCELLE', 'OPLSTCOPRO', 'COMMISSION', 'FI1C', 'GI1DA1', 'GI5AA1', 'GI6AA1']) assert.ok(JAMAIS.test(t), t);
  assert.ok(!JAMAIS.test('FI1B') && !JAMAIS.test('FI2MB2'));
  // « Transmettre ma demande » (ng-click transmettreSaisie) : refusé par son texte comme par son attribut.
  assert.ok(FORBIDDEN.test('transmettre ma demande') && FORBIDDEN.test('vm.transmettresaisie()'));
  assert.ok(!FORBIDDEN.test('vm.nextpage()'));
  for (const proc of ['cua', 'dia']) {
    const e = index.find((x) => x.procedure === proc && (x.hotes || []).includes('demande-urbanisme.agglopolys.fr'));
    assert.ok(e, proc);
    const sc = scenario(e.file);
    assert.equal(sc.suivantSelecteur, '[ng-click="vm.nextPage()"]');
    assert.ok(sc.entree.commune.valider.some((m) => new RegExp(m).test('valider la commune de depot')));
    assert.ok(new RegExp(sc.entree.sessionExpiree).test('me connecter a mon compte'));
    assert.ok(sc.entree.fenetresNon.some((m) => new RegExp(m).test('voulez-vous recuperer les donnees non sauvegardees ?')));
    const champs = sc.pages[0].fields.flatMap((c) => (c.forEach ? c.fields : [c]));
    for (const c of champs) if (c.code) assert.ok(!JAMAIS.test(c.code.replace(/\{.*\}/, '')), c.code);
    assert.equal(sc.pagesMax, proc === 'cua' ? 7 : 10);
  }
  // Une ligne de parcelle DIA par code de ligne (A1, B5, B6, puis A2…) ; codes CUa réels (T2L = localité, T2C = code postal).
  const fiche = { parcelles: [{ section: 'AB', numero: '1' }, { section: 'AB', numero: '2' }, { section: 'AB', numero: '3' }, { section: 'AB', numero: '4' }] };
  const dia = scenario('dia-gnau-agglopolys.json');
  const codes = ctx.ClaireFiche.expandFields(dia.pages[0], fiche).map((f) => f.code).filter((c) => /^BI3S/.test(c)).join(',');
  assert.equal(codes, 'BI3SA1,BI3SB5,BI3SB6,BI3SA2');
  const cua = scenario('cua-gnau-agglopolys.json').pages[0].fields;
  assert.equal(cua.find((f) => f.code === 'T2L_localite').source, 'terrain.commune');
  assert.equal(cua.find((f) => f.code === 'T2C_code').source, 'terrain.codePostal');
  // Une case du CERFA vaut oui seulement quand la fiche dit vrai.
  assert.equal(ctx.ClaireFiche.resolveField({ type: 'case', source: 'x' }, { x: true }).value, true);
  assert.equal(ctx.ClaireFiche.resolveField({ type: 'case', source: 'x' }, { x: null }).missing, true);
});
