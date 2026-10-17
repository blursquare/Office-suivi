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
  id: 'v1', nom: 'MOREAU / LAMBERT', responsable: 'Julie VASSELIN', adresseBien: 'VINEUIL (41350), 12 rue des Vignes', prixVente: 92500, prixMobilier: 3000,
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
  assert.equal(v['Signataire (code E1S)'], 'P/O Julie VASSELIN');
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
  assert.ok(!JAMAIS.test('FI1B') && !JAMAIS.test('FI2MB2') && !JAMAIS.test('FI1CA'));
  for (const t of ['vm.saisie.GI1DA1', 'x_FI1C', 'liste[COMMISSION]', 'OPLSTPARCELLE_1']) assert.ok(JAMAIS.test(t), t);
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
    assert.ok(sc.entree.fenetresNonEntree.some((m) => new RegExp(m).test('voulez-vous recuperer les donnees non sauvegardees ?')));
    assert.ok(sc.entree.fenetresNon.some((m) => new RegExp(m).test('voulez-vous vous deconnecter ?')));
    // NON jamais sur « rester connecté ? » ni « enregistrer avant de quitter ? » (relecture 16/10).
    for (const t of ['vous allez etre deconnecte. voulez-vous rester connecte ?', 'enregistrer les donnees non sauvegardees avant de quitter ?'])
      assert.ok(![...sc.entree.fenetresNon, ...sc.entree.fenetresNonEntree].some((m) => new RegExp(m).test(t)), t);
    // Boutons d'entrée ancrés : un lien d'aide qui cite la démarche n'est pas la démarche.
    assert.ok(!sc.entree.bouton.some((m) => new RegExp(m).test("notice du certificat d'urbanisme d'information et formulaire")), proc);
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

test('guichet d’Agglopolys : toutes les parcelles de la fiche (lignes lues dans le modèle du formulaire) et plan cadastral joint', () => {
  const fiche = { parcelles: Array.from({ length: 20 }, (_, i) => ({ section: 'AB', numero: String(i + 1), surface: 100 + i })) };
  for (const f of ['cua-gnau-agglopolys.json', 'dia-gnau-agglopolys.json']) {
    const sc = scenario(f);
    const champs = ctx.ClaireFiche.expandFields(sc.pages[0], fiche);
    // Autant de parcelles que la fiche en porte (20 ici), chacune avec sa superficie.
    assert.equal(champs.filter((c) => /superficie/.test(c.label) && c.famille).length, 20, f);
    assert.ok(champs.filter((c) => c.famille).every((c) => /^\d+$/.test(c.rang)), f);
    const plan = sc.pages[0].fields.find((c) => c.type === 'fichier');
    assert.ok(plan && plan.piece.some((m) => new RegExp(m).test('dia1 - plan cadastral')) && plan.piece.some((m) => new RegExp(m).test('cu1 - un plan de situation du terrain')), f);
  }
});

// Vidéo de l'étude (17/10) : adresse et parcelles par les assistants du guichet d'Agglopolys, CU et DIA.
test('guichet d’Agglopolys : adresse et parcelles par les assistants du guichet (CU et DIA)', () => {
  for (const [nom, voie, section, famille] of [['cua-gnau-agglopolys.json', 'T2V_voie', 'T2S', 'T2S'], ['dia-gnau-agglopolys.json', 'BI1V', 'BI3SA1', 'BI3S']]) {
    const sc = scenario(nom);
    const adr = sc.assistants.find((a) => a.type === 'adresse' && (a.id || 'adresse') === 'adresse'); // l'adresse du bien (la DIA en a aussi pour le propriétaire, l'acquéreur, l'office)
    const cad = sc.assistants.find((a) => a.type === 'parcelles');
    assert.ok(adr && cad, nom);
    assert.equal(adr.voieCode, voie);
    assert.equal(cad.sectionCode, section);
    assert.ok(new RegExp(adr.titre).test("assistant de saisie d'adresse"));
    assert.ok(new RegExp(cad.titre).test('assistant de saisie des references cadastrales'));
    // Chaque champ d'adresse et de parcelle du scénario est couvert par son assistant (jamais écrit directement).
    const champs = sc.pages[0].fields.flatMap((c) => (c.forEach ? c.fields : [c]));
    for (const c of champs.filter((c) => c.code && (c.code.startsWith(voie.slice(0, 3)) || c.famille === famille))) {
      const code = String(c.famille || c.code);
      assert.ok([...adr.codes, ...cad.codes].some((x) => code.startsWith(x)), `${nom} : ${code}`);
    }
  }
  // Relevé de l'étude (17/10, DIA) : les lignes de parcelles s'appellent BI3SA1, BI3SB5… — sans « _ », le code de famille seul ne les trouve pas.
  assert.equal(scenario('dia-gnau-agglopolys.json').assistants.find((a) => a.type === 'parcelles').declencheur[0], 'BI3SA1');
  const src = fs.readFileSync(path.join(racine, 'content', 'content.js'), 'utf8');
  // « Valider » et « Je valide mon adresse » : seulement dans leur assistant (boutonDansFenetre), jamais par cliquableParTexte.
  assert.ok(/boutonDansFenetre\(fen, \["\^je valide mon adresse\$"\]\)/.test(src));
  assert.ok(/boutonDansFenetre\(fen, \["\^valider\$"\]\)/.test(src));
  assert.ok(!/cliquableParTexte\(\[[^\]]*valid/.test(src));
});
