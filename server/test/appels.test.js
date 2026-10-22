'use strict';

// Appels reçus par 3CX (voir src/appels3cx.js, src/routes/appels.js). Noms et numéros inventés.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const {
  normaliserNumero, cleNumero, formaterNumero, numerosDansTexte, reconnaitreAppelant,
  assainirJournalAppels, creerEntreeAppel, pageSonnerie, clePoste, valeur3cx
} = require('../src/appels3cx');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

test('numéros : +33, 0033, espaces et points ramenés à la même clé', () => {
  assert.equal(normaliserNumero('+33 6 12 34 56 78'), '0612345678');
  assert.equal(normaliserNumero('0033612345678'), '0612345678');
  assert.equal(normaliserNumero('00612345678'), '0612345678');
  assert.equal(cleNumero('06.12.34.56.78'), cleNumero('+33612345678'));
  assert.equal(cleNumero('123'), '');
  assert.equal(formaterNumero('+33254000000'), '02 54 00 00 00');
  assert.equal(numerosDansTexte('06 12 34 56 78 / 02.54.11.22.33').join(','), '612345678,254112233');
});

const dossiers = [
  { id: 'd1', nom: 'DURANDEAU / MARCHAIS', telephoneVendeur: '06 11 22 33 44', telephoneAcquereur: '07 55 66 77 88 / 02 54 99 88 77' },
  { id: 'd2', nom: 'VIEUX', telephoneAcquereur: '0755667788', archive: true },
  { id: 'd3', nom: 'LOUVEL / PICARDIN', notaireAcquereur: 'Maître Julien BRISSAC (Cellettes)' }
];
const carnet = [{ office: 'Étude BRISSAC', notaires: ['Julien BRISSAC'], telephone: '02 54 70 70 70' }];
const repertoire = [{ organisme: 'Banque Exemple', service: 'Crédits', telephones: ['09 69 00 00 01'] }];

test('reconnaitreAppelant : partie d’un dossier (en cours d’abord), confrère et ses dossiers, répertoire', () => {
  const acq = reconnaitreAppelant('+33 7 55 66 77 88', { dossiers, carnet, repertoire });
  assert.equal(acq.dossiers.map(x => `${x.id}:${x.partie}`).join(','), 'd1:acquereur,d2:acquereur');
  assert.equal(reconnaitreAppelant('0254998877', { dossiers }).dossiers[0].id, 'd1');
  assert.equal(reconnaitreAppelant('0611223344', { dossiers }).dossiers[0].partie, 'vendeur');
  const confrere = reconnaitreAppelant('0254707070', { dossiers, carnet, repertoire });
  assert.equal(confrere.contact.type, 'confrere');
  assert.equal(confrere.dossiers.map(x => x.id).join(','), 'd3');
  assert.equal(reconnaitreAppelant('0969000001', { dossiers, carnet, repertoire }).contact.libelle, 'Banque Exemple — Crédits');
  const inconnu = reconnaitreAppelant('0600000000', { dossiers, carnet, repertoire });
  assert.equal(inconnu.dossiers.length, 0);
  assert.equal(inconnu.contact, null);
});

test('creerEntreeAppel : numéro formaté, nom 3CX gardé sauf s’il répète le numéro', () => {
  const e = creerEntreeAppel({ numero: '+33755667788', nom: 'MARCHAIS Paul', poste: 'bastien' }, { dossiers }, new Date('2026-10-01T08:00:00Z'));
  assert.equal(e.numero, '07 55 66 77 88');
  assert.equal(e.nom, 'MARCHAIS Paul');
  assert.equal(e.dossiers[0].id, 'd1');
  assert.equal(creerEntreeAppel({ numero: '0755667788', nom: '+33755667788' }, { dossiers }).nom, '');
});

test('3CX V20 : « undefined » et variable non remplie ignorés, « +33 » lu comme une espace, poste écrit autrement', () => {
  assert.equal(valeur3cx('undefined'), '');
  assert.equal(valeur3cx('%CallerDisplayName%'), '');
  assert.equal(valeur3cx('MARCHAIS Paul'), 'MARCHAIS Paul');
  // ?numero=+33755667788 non encodé : Express lit « 33755667788 » précédé d'une espace.
  const e = creerEntreeAppel({ numero: ' 33755667788', nom: 'undefined', poste: 'Jérémy SAUJOT' }, { dossiers });
  assert.equal(e.numero, '07 55 66 77 88');
  assert.equal(e.nom, '');
  assert.equal(e.poste, 'jeremy');
  assert.equal(e.dossiers[0].id, 'd1');
  assert.equal(clePoste('Jeremy'), clePoste('jérémy'));
  assert.equal(creerEntreeAppel({ numero: '%CallerNumber%' }, { dossiers }).numero, '');
});

test('assainirJournalAppels : plus récent d’abord, plus d’un an écarté', () => {
  const j = assainirJournalAppels([
    { id: 'a', t: '2026-09-30T08:00:00.000Z', numero: '1', dossiers: [{ id: 'd1', partie: 'x' }] },
    { id: 'b', t: '2026-10-01T08:00:00.000Z', numero: '2' },
    { id: 'c', t: '2024-01-01T08:00:00.000Z', numero: '3' },
    { t: '2026-10-01T08:00:00.000Z' }
  ], Date.parse('2026-10-01T10:00:00Z'));
  assert.equal(j.map(a => a.id).join(','), 'b,a');
  assert.equal(j[1].dossiers[0].partie, 'acquereur');
});

test('pageSonnerie : se ferme si la fenêtre CLAIRE est visible, sinon ouvre CLAIRE sur l’appel ; aucune donnée', () => {
  assert.match(pageSonnerie({ id: 'ap-1', fenetreVisible: true }), /window\.close\(\)/);
  assert.match(pageSonnerie({ id: 'ap-1', fenetreVisible: false }), /index\.html#appel=ap-1/);
  // Appelant inconnu de CLAIRE : rien à ouvrir, l'onglet de 3CX se ferme (étude 05/10).
  assert.match(pageSonnerie({ id: 'ap-1', fenetreVisible: false, inconnu: true }), /window\.close\(\)/);
  assert.doesNotMatch(pageSonnerie({ id: 'ap-1', fenetreVisible: false, inconnu: true }), /#appel=/);
});

let db, serveurApp, baseUrl, jeton, depot;
before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth, depot: d } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0 } });
  depot = d;
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});
after(() => { serveurApp.close(); db.close(); });

test('route : la sonnerie note l’appel sans session ; la fenêtre du poste le relève', async () => {
  depot.creer({ id: 'd9', nom: 'TESTARD / BLANCHON', telephoneAcquereur: '06 98 76 54 32', historique: [] });
  const auth = { authorization: `Bearer ${jeton}` };
  // Aucune fenêtre CLAIRE visible : la page ouvre CLAIRE sur l'appel.
  const r1 = await fetch(`${baseUrl}/appel?numero=%2B33698765432&nom=BLANCHON&poste=julie`);
  assert.equal(r1.status, 200);
  const page1 = await r1.text();
  assert.match(page1, /#appel=ap-/);
  assert.doesNotMatch(page1, /BLANCHON|TESTARD|98 76/);
  // La fenêtre de Julie se signale visible, puis relève l'appel suivant ; celle de Bastien ne le voit pas.
  const depuis = new Date(Date.now() - 1000).toISOString();
  await fetch(`${baseUrl}/api/appels/nouveaux?poste=julie&visible=1&depuis=${encodeURIComponent(depuis)}`, { headers: auth });
  const r2 = await fetch(`${baseUrl}/appel?numero=0698765432&nom=&poste=julie`);
  assert.match(await r2.text(), /window\.close\(\)/);
  const j = await (await fetch(`${baseUrl}/api/appels/nouveaux?poste=julie&visible=1&depuis=${encodeURIComponent(depuis)}`, { headers: auth })).json();
  assert.equal(j.appels.length, 2);
  // Un numéro que CLAIRE ne connaît pas, fenêtre non visible : l'onglet de 3CX se ferme, l'appel est noté.
  const rInconnu = await (await fetch(`${baseUrl}/appel?numero=0611223344&poste=paul`)).text();
  assert.match(rInconnu, /window\.close\(\)/);
  assert.doesNotMatch(rInconnu, /#appel=/);
  assert.equal(j.appels[0].dossiers[0].id, 'd9');
  const b = await (await fetch(`${baseUrl}/api/appels/nouveaux?poste=bastien&depuis=${encodeURIComponent(depuis)}`, { headers: auth })).json();
  assert.equal(b.appels.length, 0);
  // Journal du dossier ; sans session, refusé.
  const jd = await (await fetch(`${baseUrl}/api/appels?dossierId=d9`, { headers: auth })).json();
  assert.equal(jd.appels.length, 2);
  assert.equal((await fetch(`${baseUrl}/api/appels`)).status, 401);
  // Adresse saisie à la main dans 3CX avec une majuscule ou un accent : relevée quand même.
  await fetch(`${baseUrl}/appel?numero=0600000001&poste=Julie`);
  const j3 = await (await fetch(`${baseUrl}/api/appels/nouveaux?poste=julie&visible=1&depuis=${encodeURIComponent(depuis)}`, { headers: auth })).json();
  assert.equal(j3.appels.length, 3);
  // Diagnostic des postes : fenêtre de Julie vue, dernière sonnerie notée ; aucune donnée d'appel.
  const p = await (await fetch(`${baseUrl}/api/appels/postes`, { headers: auth })).json();
  assert.equal(p.postes.julie.fenetre, true);
  assert.ok(p.postes.julie.derniereSonnerie);
  assert.equal(p.postes.bastien.visible, false);
  assert.doesNotMatch(JSON.stringify(p), /0600000001|BLANCHON|numero/);
});

test('route : adresses du serveur sur le réseau (pour l’adresse à coller dans 3CX)', async () => {
  const r = await (await fetch(`${baseUrl}/api/appels/adresses-serveur`, { headers: { authorization: `Bearer ${jeton}` } })).json();
  assert.ok(Array.isArray(r.adresses));
  assert.ok(r.adresses.every(a => !/^127\./.test(a)));
});

test('route : téléphonie coupée pour un collaborateur — ses appels ne sont ni notés ni relevés, les autres si', async () => {
  const auth = { authorization: `Bearer ${jeton}` };
  const json = { ...auth, 'Content-Type': 'application/json' };
  assert.equal((await (await fetch(`${baseUrl}/api/appels/reglages`, { headers: auth })).json()).postesCoupes.length, 0);
  assert.equal((await fetch(`${baseUrl}/api/appels/reglages`, { method: 'PUT', headers: json, body: JSON.stringify({ actif: false }) })).status, 400);
  const r = await (await fetch(`${baseUrl}/api/appels/reglages`, { method: 'PUT', headers: json, body: JSON.stringify({ poste: 'Julie', actif: false }) })).json();
  assert.equal(r.postesCoupes.join(','), 'julie');
  const nb = async () => (await (await fetch(`${baseUrl}/api/appels`, { headers: auth })).json()).appels.length;
  const avant = await nb();
  assert.match(await (await fetch(`${baseUrl}/appel?numero=0611111111&poste=julie`)).text(), /window\.close/);
  assert.equal(await nb(), avant);
  assert.equal((await (await fetch(`${baseUrl}/api/appels/nouveaux?poste=julie&depuis=2000-01-01`, { headers: auth })).json()).coupe, true);
  // Bastien n'est pas coupé.
  await fetch(`${baseUrl}/appel?numero=0611111112&poste=bastien`);
  assert.equal(await nb(), avant + 1);
  await fetch(`${baseUrl}/api/appels/reglages`, { method: 'PUT', headers: json, body: JSON.stringify({ poste: 'julie', actif: true }) });
  assert.equal((await (await fetch(`${baseUrl}/api/appels/reglages`, { headers: auth })).json()).postesCoupes.length, 0);
});

test('pageSonnerie avec le lien claire-devant (étude 12/10) : lance le lien, attend son signal, sinon CLAIRE dans l’onglet', () => {
  const p = pageSonnerie({ id: 'ap-1', fenetreVisible: false, relais: true });
  assert.match(p, /claire-devant:ap-1/);
  assert.match(p, /\/appel\/etat\?id=ap-1/);
  // Signal reçu → l'onglet se ferme ; aucun signal → CLAIRE dans l'onglet (jamais un onglet fermé sur rien).
  assert.match(p, /j\.vu[^;]*;[^;]*;[^;]*window\.close\(\)/);
  assert.match(p, /location\.replace\("\/index\.html#appel=ap-1"\)/);
  assert.doesNotMatch(p, /claire-appel:/);
  assert.match(p, /<title>Appel 3CX<\/title>/);
  // Fenêtre CLAIRE visible : le repli est la fermeture (bandeau dans la fenêtre), le lien est quand même lancé.
  const visible = pageSonnerie({ id: 'ap-1', fenetreVisible: true, relais: true });
  assert.match(visible, /claire-devant:ap-1/);
  assert.doesNotMatch(visible, /index\.html#appel=/);
  // Identifiant nettoyé ; appelant inconnu : fermeture seule.
  assert.doesNotMatch(pageSonnerie({ id: 'ap-1"<x>', fenetreVisible: false, relais: true }), /<x>/);
  assert.doesNotMatch(pageSonnerie({ id: 'ap-1', fenetreVisible: false, inconnu: true, relais: true }), /claire-devant/);
  // Sans lien : comme avant.
  assert.doesNotMatch(pageSonnerie({ id: 'ap-1', fenetreVisible: false }), /claire-devant/);
});

test('fichier .reg du lien claire-devant : PowerShell sans fichier, lien jamais lu comme du code, titre exact de la fenêtre', () => {
  const { fichierRegRelaisAppel, scriptRelaisReg, commandeRelaisReg, octetsRegRelaisAppel } = require('../src/relaisAppelReg');
  const o = { url: 'http://192.168.60.10:3000/', profil: 'Claire' };
  const reg = fichierRegRelaisAppel(o);
  assert.match(reg, /^Windows Registry Editor Version 5\.00\r\n/);
  assert.match(reg, /\[HKEY_CURRENT_USER\\Software\\Classes\\claire-devant\\shell\\open\\command\]/);
  assert.match(reg, /"URL Protocol"=""/);
  const script = scriptRelaisReg(o);
  // Aucun guillemet dans le script (il est entre guillemets dans la commande), aucun fichier ni code compilé.
  assert.doesNotMatch(script, /"/);
  assert.doesNotMatch(script, /-TypeDefinition|\.ps1|\.vbs|ExecutionPolicy|EncodedCommand/);
  assert.match(script, /GetCommandLineArgs\(\)\[-1\]/);
  assert.match(script, /-replace '\[\^A-Za-z0-9_-\]',''/);
  assert.match(script, /appel\/vu\?id=/);
  assert.match(script, /'http:\/\/192\.168\.60\.10:3000\/'/);
  assert.match(script, /'--profile-directory=Claire'/);
  assert.match(script, /\[char\]0x2014/);
  // Le lien de Chrome (%1) tombe dans le commentaire final : jamais exécuté.
  assert.match(commandeRelaisReg(o), / #" "%1"$/);
  // Dans le .reg : guillemets et barres échappés, ASCII hors commentaires ; UTF-16 avec BOM.
  const ligne = reg.split('\r\n').find(l => l.startsWith('@="powershell'));
  assert.ok(ligne && ligne.endsWith('#\\" \\"%1\\""'));
  assert.doesNotMatch(ligne, /[^\x00-\x7f]/);
  const b = octetsRegRelaisAppel(o);
  assert.equal(b[0], 0xff); assert.equal(b[1], 0xfe);
  // Une apostrophe dans l'adresse ne casse pas la chaîne PowerShell.
  assert.match(scriptRelaisReg({ url: "http://x/'a", profil: 'Claire' }), /'http:\/\/x\/''a\/'/);
});

test('route : lien claire-devant — .reg téléchargé = poste retenu ; signal de PowerShell attendu par l’onglet ; retiré à la demande', async () => {
  const auth = { authorization: `Bearer ${jeton}` };
  const json = { ...auth, 'Content-Type': 'application/json' };
  depot.creer({ id: 'd10', nom: 'RELAIS / ESSAI', telephoneAcquereur: '06 55 44 33 22', historique: [] });
  assert.equal((await fetch(`${baseUrl}/api/appels/relais/installateur`, { headers: auth })).status, 400);
  const inst = await fetch(`${baseUrl}/api/appels/relais/installateur?poste=Jeremy`, { headers: auth });
  assert.equal(inst.status, 200);
  assert.match(inst.headers.get('content-disposition'), /CLAIRE-appels-3CX\.reg/);
  // Téléchargé depuis le serveur lui-même (127.0.0.1) : profil de la fenêtre du serveur.
  const texte = Buffer.from(await inst.arrayBuffer()).toString('utf16le');
  assert.match(texte, /--profile-directory=ClaireServeur/);
  const reglages = await (await fetch(`${baseUrl}/api/appels/reglages`, { headers: auth })).json();
  assert.equal(reglages.postesRelais.join(','), 'jeremy');
  // Couper puis rétablir 3CX ne touche pas au lien.
  await fetch(`${baseUrl}/api/appels/reglages`, { method: 'PUT', headers: json, body: JSON.stringify({ poste: 'jeremy', actif: false }) });
  const coupe = await (await fetch(`${baseUrl}/api/appels/reglages`, { method: 'PUT', headers: json, body: JSON.stringify({ poste: 'jeremy', actif: true }) })).json();
  assert.equal(coupe.postesRelais.join(','), 'jeremy');
  const page = await (await fetch(`${baseUrl}/appel?numero=0655443322&poste=jeremy`)).text();
  const id = (page.match(/claire-devant:(ap-[A-Za-z0-9_-]+)/) || [])[1];
  assert.ok(id, 'le lien est lancé');
  // Signal hors session : pas encore vu, puis vu ; un identifiant invalide n'est jamais retenu.
  assert.equal((await (await fetch(`${baseUrl}/appel/etat?id=${id}`)).json()).vu, false);
  assert.equal((await fetch(`${baseUrl}/appel/vu?id=${id}`)).status, 200);
  assert.equal((await (await fetch(`${baseUrl}/appel/etat?id=${id}`)).json()).vu, true);
  // Un identifiant qui n'est pas celui d'une sonnerie récente n'est jamais retenu.
  await fetch(`${baseUrl}/appel/vu?id=ap-invente`);
  assert.equal((await (await fetch(`${baseUrl}/appel/etat?id=ap-invente`)).json()).vu, false);
  await fetch(`${baseUrl}/appel/vu?id=${encodeURIComponent('<x>')}`);
  assert.equal((await (await fetch(`${baseUrl}/appel/etat?id=${encodeURIComponent('<x>')}`)).json()).vu, false);
  const retire = await (await fetch(`${baseUrl}/api/appels/reglages`, { method: 'PUT', headers: json, body: JSON.stringify({ poste: 'jeremy', relais: false }) })).json();
  assert.equal(retire.postesRelais.length, 0);
  const sans = await (await fetch(`${baseUrl}/appel?numero=0655443322&poste=jeremy`)).text();
  assert.match(sans, /index\.html#appel=/);
  assert.doesNotMatch(sans, /claire-devant/);
});

test('reconnaitreAppelant : partie d’une succession reconnue par ses téléphones repris d’Authentic', () => {
  const { reconnaitreAppelant } = require('../src/appels3cx');
  const r = reconnaitreAppelant('06 12 34 56 78', { dossiers: [{ id: 's', typeAffaire: 'succession', parties: [{ nom: 'Marie DUPONT', telephones: ['06 12 34 56 78'] }] }] });
  assert.equal(r.dossiers.map(x => `${x.id}:${x.partie}`).join(','), 's:partie');
});

test('reconnaitreAppelant : le téléphone d’un confrère saisi sur la fiche reconnaît le dossier', () => {
  const { reconnaitreAppelant } = require('../src/appels3cx');
  const dossiers = [{ id: 'd1', telephoneNotaireParticipant: '06 00 00 00 01 / 02 38 00 00 00' }, { id: 'd2', telephoneConfrereVendeur: '06 11 22 33 44', archive: true }];
  assert.deepEqual(reconnaitreAppelant('0238000000', { dossiers }).dossiers, [{ id: 'd1', partie: 'confrere', archive: false }]);
  assert.deepEqual(reconnaitreAppelant('0611223344', { dossiers }).dossiers, [{ id: 'd2', partie: 'confrere', archive: true }]);
  assert.deepEqual(reconnaitreAppelant('0699999999', { dossiers }).dossiers, []);
});

test('autorisation du lien claire-devant : stratégie Chrome et Edge limitée à l’adresse du serveur', () => {
  const { fichierRegAutorisationLien, octetsRegAutorisationLien } = require('../src/relaisAppelReg');
  const t = fichierRegAutorisationLien({ origine: 'http://192.168.1.10:3000/' });
  // Stratégie « dictionnaire » de Chrome : une chaîne JSON (liste de règles) posée sur la clé du navigateur, pas une sous-clé numérotée.
  assert.match(t, /\[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\]\r\n"AutoLaunchProtocolsFromOrigins"="\[\{\\"allowed_origins\\":\[\\"http:\/\/192\.168\.1\.10:3000\\"\],\\"protocol\\":\\"claire-devant\\"\},\{\\"allowed_origins\\":\[\\"http:\/\/192\.168\.1\.10:3000\\"\],\\"protocol\\":\\"claire-web\\"\}\]"/);
  assert.match(t, /\[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Edge\]/);
  assert.doesNotMatch(t, /"1"=/);
  // Le fichier du poste la pose aussi pour la session Windows (sans administrateur).
  const { fichierRegRelaisAppel } = require('../src/relaisAppelReg');
  const u = fichierRegRelaisAppel({ url: 'http://192.168.1.10:3000/', profil: 'Claire' });
  assert.match(u, /\[HKEY_CURRENT_USER\\Software\\Policies\\Google\\Chrome\]\r\n"AutoLaunchProtocolsFromOrigins"="\[\{\\"allowed_origins\\":\[\\"http:\/\/192\.168\.1\.10:3000\\"\]/);
  assert.match(u, /\[HKEY_CURRENT_USER\\Software\\Policies\\Microsoft\\Edge\]/);
  assert.equal(octetsRegAutorisationLien({ origine: 'http://x:1' }).readUInt16LE(0), 0xFEFF);
});

test('lien claire-web : le fichier .reg du poste ouvre une adresse http(s) validée dans Chrome, jamais comme du code', () => {
  const { fichierRegLiensWeb, scriptLiensWeb, commandeLiensWeb, octetsRegLiensWeb } = require('../src/relaisAppelReg');
  const t = fichierRegLiensWeb({ url: 'http://192.168.1.10:3000/' });
  assert.match(t, /\[HKEY_CURRENT_USER\\Software\\Classes\\claire-web\\shell\\open\\command\]/);
  assert.match(t, /\[HKEY_CURRENT_USER\\Software\\Policies\\Google\\Chrome\]\r\n"AutoLaunchProtocolsFromOrigins"=.*claire-web/);
  const c = commandeLiensWeb();
  assert.ok(c.endsWith(' #" "%1"'), 'le lien reçu tombe dans le commentaire final');
  const s = scriptLiensWeb();
  assert.ok(!s.includes('"'), 'aucun guillemet double dans le script (la commande les utilise)');
  assert.match(s, /\^https\?:\/\//, 'seules les adresses http(s)');
  assert.match(s, /Start-Process chrome\.exe/);
  assert.equal(octetsRegLiensWeb({ url: 'http://x:1/' }).readUInt16LE(0), 0xFEFF);
});
