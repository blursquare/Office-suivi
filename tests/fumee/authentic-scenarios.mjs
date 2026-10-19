// Banc d'essai Authentic → CLAIRE de bout en bout (étude 19/10 : « le plus gros souci vient de la liaison Authentic / CLAIRE ; avec
// toutes les modifications je ne sais plus ce qui fonctionne ; teste tous les scénarios possibles en sandbox »).
//
// Le vrai serveur (base en mémoire, dossiers inventés), une vraie fenêtre CLAIRE dans Chromium, et ce script dans le rôle de
// l'extension Firefox : chaque page d'Authentic part par la même route qu'elle (POST /api/authentic/releve), au même format (relevé de
// releve.js : onglets, champs, tableaux, texte — structures réelles relevées au bureau, noms et adresses inventés). La fenêtre la prend,
// l'applique, la sauvegarde ; on relit ensuite la fiche EN BASE et le journal du serveur. Lancé par `npm run scenarios-authentic`.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { creerApp } = require(path.join(racine, 'server', 'src', 'app.js'));
const { ouvrirDb } = require(path.join(racine, 'server', 'src', 'db.js'));

const dans = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const hist = [{ date: dans(-12) + 'T09:00:00', texte: 'Dossier créé' }];
const base = (o) => Object.assign({ responsable: 'Julie VASSELIN', typeVente: 'maison', roleNotaire: 'instrumentaire', pieces: {}, historique: hist.slice(), dossierLie: true }, o);

// ---- Dossiers de CLAIRE (inventés) ----
const DOSSIERS = [
  base({ id: 'galloyer', nom: 'GALOIS / BORDIER', referenceAuthentic: 'A 2025 00281', adresseBien: 'VIEVY-LE-RAYE (41290), 4 Grande Rue',
    bien: { adresse: 'VIEVY-LE-RAYE (41290), 4 Grande Rue', cadastre: { section: 'B', numero: '234', parcelles: [{ section: 'B', numero: '234' }] } },
    parties: [{ role: 'VENDEUR', nom: 'GALOIS', prenom: 'Sébastien' }, { role: 'ACQUEREUR', nom: 'BORDIER', prenom: 'Edwige' }] }),
  base({ id: 'monnier', nom: 'MONNIER / BESNARD', referenceAuthentic: 'A 2025 00138', adresseBien: 'SAINT-LUBIN-EN-VERGONNOIS (41190), 24 rue des Cyclamens',
    bien: { adresse: 'SAINT-LUBIN-EN-VERGONNOIS (41190), 24 rue des Cyclamens', cadastre: { section: 'ZN', numero: '4', parcelles: [{ section: 'ZN', numero: '4' }] } },
    parties: [{ role: 'VENDEUR', nom: 'MONNIER', prenom: 'Jacques' }, { role: 'ACQUEREUR', nom: 'BESNARD', prenom: 'Danny' }] }),
  // Dossier sans référence encore : rattaché par les noms à la première page, puis par la référence.
  base({ id: 'martel', nom: 'MARTEL / FOURNIER', adresseBien: 'VINEUIL (41350), 3 chemin des Vignes',
    parties: [{ role: 'VENDEUR', nom: 'MARTEL', prenom: 'Alexandre' }, { role: 'ACQUEREUR', nom: 'FOURNIER', prenom: 'Camille' }] }),
  // Même nom de famille des deux côtés.
  base({ id: 'roy', nom: 'ROY / ROY', referenceAuthentic: 'A 2026 00310', adresseBien: 'BLOIS (41000), 7 rue Porte Côté',
    parties: [{ role: 'VENDEUR', nom: 'ROY', prenom: 'Jean' }, { role: 'ACQUEREUR', nom: 'ROY', prenom: 'Marie' }] }),
  // Copropriété.
  base({ id: 'copro', nom: 'LEBRUN / MARCHAND', referenceAuthentic: 'A 2026 00320', typeVente: 'copropriete', adresseBien: 'BLOIS (41000), 9 rue des Tilleuls',
    parties: [{ role: 'VENDEUR', nom: 'LEBRUN', prenom: 'Agathe' }, { role: 'ACQUEREUR', nom: 'MARCHAND', prenom: 'Sylvie' }] }),
  // Succession.
  base({ id: 'succ', nom: 'BERNARD', typeAffaire: 'succession', sansPret: true, referenceAuthentic: 'A 2026 00330', typeVente: '',
    parties: [{ role: 'PARTIE', nom: 'BERNARD', prenom: 'Lucie' }], biens: [] }),
  // Ancien dossier signé des mêmes clients (archivé) et le nouveau.
  base({ id: 'ancien', nom: 'PETIT / BOSQUET', referenceAuthentic: 'A 2024 00050', archive: true, archiveLe: dans(-400), adresseBien: 'BLOIS (41000), 1 rue Ancienne',
    parties: [{ role: 'VENDEUR', nom: 'PETIT', prenom: 'Luc' }, { role: 'ACQUEREUR', nom: 'BOSQUET', prenom: 'Anne' }] }),
  base({ id: 'nouveau', nom: 'PETIT / BOSQUET', referenceAuthentic: 'A 2026 00106', adresseBien: 'BLOIS (41000), 15 rue Nouvelle',
    parties: [{ role: 'VENDEUR', nom: 'PETIT', prenom: 'Luc' }, { role: 'ACQUEREUR', nom: 'BOSQUET', prenom: 'Anne' }] })
];

// ---- Pages d'Authentic, à la manière de releve.js ----
const ID = 'ui-ficho-tabs:mainTabPanel:tabForm2:tabContent:';
const onglets = (actif, autres = []) => autres.map(t => ({ titre: t, actif: false })).concat(actif ? [{ titre: actif, actif: true }] : []);
function pageDossier({ ref, intitule, comparants = [], immeubles = [], documents = [], prix, sous = '2 - Vente d’immeuble', autresOnglets = [], sousDossiers = [] }) {
  const lignesComparants = comparants.flatMap(([nom, qualite]) => [nom, qualite]);
  const texte = ['Accueil', `${ref} ${intitule}`, `${sous} Importer avec 6e SENS`, `Comparants (${comparants.length})`, ...lignesComparants,
    ...(prix ? ['Informations financières', 'Capital', prix] : []), `Immeubles (${immeubles.length})`, ...immeubles.flat(), 'Documents', ...sousDossiers].join('\n');
  return { titre: 'Authentic', onglets: onglets(`${ref} ${intitule}`, autresOnglets), champs: [{ groupe: '', libelle: 'Rechercher', valeur: '' }],
    tableaux: documents.length ? [{ titre: '', entete: [], lignes: documents }] : [{ titre: '', entete: [], lignes: [['Compromis de vente', '', '01/09/2026', '', 'Signé']] }], texte };
}
function ficheClient({ civilite, nom, prenom, naissance = '14/02/1985', tel = '', email = '', ongletActif, autresOnglets = [], conjoint }) {
  const id = (s) => ID + 'tabView:' + s;
  const champs = [
    { groupe: '', libelle: id('ficheClientPhysiqueIdentite:etude_input'), valeur: 'oui' },
    { groupe: '', libelle: id('ficheClientPhysiqueIdentite:civilite:selectOneRadio'), valeur: civilite },
    { groupe: '', libelle: 'Nom de famille*', valeur: nom },
    { groupe: '', libelle: 'Prénom*', valeur: prenom },
    { groupe: '', libelle: id('ficheClientPhysiqueIdentite:naissanceDate:naissanceDate'), valeur: naissance },
    { groupe: '', libelle: 'N° de voie', valeur: '8' }, { groupe: '', libelle: 'Type de voie', valeur: 'rue' },
    { groupe: '', libelle: 'Nom de la voie', valeur: 'des Lilas' }, { groupe: '', libelle: 'CP - Ville', valeur: '41000 BLOIS' },
    { groupe: '', libelle: id('ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneePrincipaleW1:Telephone:inputTelephone'), valeur: tel },
    { groupe: '', libelle: 'Email', valeur: email }
  ];
  if (conjoint) {
    const c = (s) => ID + 'conjointComponent:' + s;
    champs.unshift(
      { groupe: '', libelle: c('ficheClientPhysiqueIdentite:etude_input'), valeur: 'oui' },
      { groupe: '', libelle: c('ficheClientPhysiqueIdentite:civilite:selectOneRadio'), valeur: conjoint.civilite },
      { groupe: '', libelle: 'Nom de famille*', valeur: conjoint.nom }, { groupe: '', libelle: 'Prénom*', valeur: conjoint.prenom },
      { groupe: '', libelle: c('ficheClientPhysiqueIdentite:naissanceDate:naissanceDate'), valeur: '02/03/1980' },
      { groupe: '', libelle: 'Email', valeur: conjoint.email || '' });
  }
  return { titre: 'Authentic', onglets: onglets(ongletActif, autresOnglets), champs, tableaux: [], texte: '' };
}
function ficheBien({ type = 'Maison individuelle', numero, voie, typeVoie = 'rue', cpVille, parcelles, ongletActif, autresOnglets = [] }) {
  const champs = [
    { groupe: 'Informations du bien', libelle: ID + 'ficheImmeubleTabView:infosComponent:ficheImmeubleIdentite:typeWithDialog:selectOneMenu_input', valeur: type },
    { groupe: 'Informations du bien', libelle: 'N° de voie', valeur: numero }, { groupe: 'Informations du bien', libelle: 'Type de voie', valeur: typeVoie },
    { groupe: 'Informations du bien', libelle: 'Nom de la voie', valeur: voie }, { groupe: 'Informations du bien', libelle: 'CP - Ville*', valeur: cpVille }];
  return { titre: 'Authentic', onglets: onglets(ongletActif, autresOnglets), champs,
    tableaux: [{ titre: 'Cadastre', entete: ['Commune', 'Préfixe', 'Section', 'Numéro', 'Adresse ou lieu-dit', 'Nature', 'Zone urbanisme', 'SPF', 'surface', ''],
      lignes: parcelles.map(([s, n, surf]) => [cpVille, '', s, n, `${numero} ${typeVoie} ${voie}`, '', '', 'BLOIS 1', surf || '512', '']) }], texte: '' };
}

// ---- Banc ----
const db = ouvrirDb(':memory:');
const { app, depot } = creerApp({ db, config: { racineRepo: racine, authActive: false, estSea: () => false } });
for (const d of DOSSIERS) depot.creer(d);
const serveur = app.listen(0);
await new Promise((r) => serveur.once('listening', r));
const B = 'http://127.0.0.1:' + serveur.address().port;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const resultats = [];
let echecs = 0;
const constat = (scenario, ok, texte) => { resultats.push({ scenario, ok, texte }); if (!ok) echecs++; };

async function envoyer(capture) {
  const r = await fetch(B + '/api/authentic/releve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(capture) });
  const j = await r.json();
  if (!j.id) return { etat: j.ignore ? 'ignoree' : j.deja ? 'doublon' : 'refusee' };
  for (let i = 0; i < 80; i++) {
    await pause(150);
    const jr = await (await fetch(B + '/api/authentic/journal')).json();
    const e = jr.entrees.find(x => x.id === j.id);
    if (e && e.etat !== 'en-file' && e.etat !== 'pris') { await pause(400); return e; }
  }
  return { etat: 'sans-reponse' };
}
const lire = async (id) => {
  const j = await (await fetch(B + '/api/dossiers')).json();
  return (j.dossiers || j).find(d => d.id === id);
};
const parties = (d) => (d.parties || []).map(p => `${p.role}:${[p.prenom, p.nom].filter(Boolean).join(' ')}`).sort().join(', ');
const immeubles = (d) => ((d.authentic && d.authentic.immeubles) || []).map(im => im.adresse || (im.parcelles || []).map(p => p.section + p.numero).join('+'));
const parcellesFiche = (d) => ((d.bien && d.bien.cadastre && d.bien.cadastre.parcelles) || []).map(p => p.section + p.numero).sort().join(',');

const navigateur = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await navigateur.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
await ctx.addInitScript(() => { localStorage.setItem('claire-utilisateur-poste', 'Julie VASSELIN'); });
const page = await ctx.newPage();
const erreursPage = [];
page.on('pageerror', (e) => erreursPage.push(e.message));
await page.goto(B + '/');
await page.waitForFunction(() => typeof window.appliquerReleveAuthentic === 'function' && Array.isArray(window.dossiers || []), null, { timeout: 30000 }).catch(() => {});
await pause(2500);

try {
  // 1. Dossier sans référence, retrouvé par les noms ; la référence est retenue, pièces/SAFER/prix repris.
  {
    const S = '1. Page du dossier sans référence connue';
    const e = await envoyer(pageDossier({ ref: 'A 2026 00500', intitule: 'VTE MARTEL / FOURNIER', prix: '240 000,00 €',
      comparants: [['M. MARTEL Alexandre', 'Vendeur'], ['Mme FOURNIER Camille', 'Acquéreur']], immeubles: [['41350 VINEUIL', '3 chemin des Vignes']],
      documents: [['Acte de naissance de M. MARTEL Alexandre', '', '03/09/2026', '', 'Reçu'], ['Notification SAFER', '', '10/09/2026', '25/09/2026', 'Non préemption']] }));
    // Étude 19/10 (« ne plus jamais deviner le dossier ») : retrouvé par les noms seulement → rien d'appliqué, la question d'un clic.
    const avant = await lire('martel');
    const toast = await page.textContent('#toast-message').catch(() => '');
    constat(S, e.etat === 'a-confirmer' && !avant.referenceAuthentic, `noms seuls : ${e.etat}, rien appliqué avant le clic (« ${toast} »)`);
    constat(S, /est-ce VTE - MARTEL \/ FOURNIER/.test(toast || ''), 'question posée : ' + toast);
    await page.click('#toast-undo-btn');
    let d = avant;
    for (let i = 0; i < 40 && !d.referenceAuthentic; i++) { await pause(150); d = await lire('martel'); }
    await pause(600);
    d = await lire('martel');
    const jr = (await (await fetch(B + '/api/authentic/journal')).json()).entrees.find(x => x.id === e.id) || {};
    constat(S, jr.dossierId === 'martel', `page rangée dans ${jr.dossierId || '—'} après « Oui » (${jr.etat || ''})`);
    constat(S, d.referenceAuthentic === 'A 2026 00500', `référence retenue : ${d.referenceAuthentic || '—'}`);
    constat(S, !!(d.authentic && d.authentic.biensDossier && d.authentic.biensDossier.nombre === 1), 'rubrique « Immeubles (1) » gardée : ' + JSON.stringify(d.authentic && d.authentic.biensDossier));
    constat(S, Object.keys(d.pieces || {}).some(k => d.pieces[k] === 'recue'), `pièces reçues : ${Object.keys(d.pieces || {}).filter(k => d.pieces[k] === 'recue').join(', ') || 'aucune'}`);
  }
  // 2. Fiches client dans l'onglet du dossier : identité, coordonnées du bon côté.
  {
    const S = '2. Fiches client du dossier';
    const tab = 'A 2026 00500 VTE MARTEL / FOURNIER';
    const e1 = await envoyer(ficheClient({ civilite: 'Madame', nom: 'Fournier', prenom: 'Camille', tel: '06 12 34 56 78', email: 'camille.fournier@exemple.fr', ongletActif: tab }));
    const e2 = await envoyer(ficheClient({ civilite: 'Monsieur', nom: 'Martel', prenom: 'Alexandre', tel: '06 98 76 54 32', email: 'a.martel@exemple.fr', ongletActif: tab }));
    const d = await lire('martel');
    constat(S, e1.dossierId === 'martel' && e2.dossierId === 'martel', `fiches rangées dans ${e1.dossierId || '—'} / ${e2.dossierId || '—'}`);
    constat(S, /camille\.fournier/.test(d.emailAcquereur || '') && !/camille/.test(d.emailVendeur || ''), `email acquéreur « ${d.emailAcquereur || ''} », vendeur « ${d.emailVendeur || ''} »`);
    constat(S, /a\.martel/.test(d.emailVendeur || ''), `email vendeur « ${d.emailVendeur || ''} »`);
    constat(S, parties(d) === 'ACQUEREUR:Camille FOURNIER, VENDEUR:Alexandre MARTEL', `parties : ${parties(d)}`);
  }
  // 3. Fiche bien du dossier (son onglet) : parcelles reprises, bien retenu.
  {
    const S = '3. Fiche bien du dossier';
    const e = await envoyer(ficheBien({ numero: '3', typeVoie: 'chemin', voie: 'des Vignes', cpVille: '41350 VINEUIL', parcelles: [['AB', '123'], ['AB', '124']], ongletActif: 'A 2026 00500 VTE MARTEL / FOURNIER' }));
    const d = await lire('martel');
    constat(S, e.dossierId === 'martel', `rangée dans ${e.dossierId || '—'} (${e.etat})`);
    constat(S, parcellesFiche(d) === 'AB123,AB124', `parcelles de la fiche : ${parcellesFiche(d) || 'aucune'}`);
    constat(S, immeubles(d).length === 1, `biens : ${immeubles(d).join(' | ') || 'aucun'}`);
  }
  // 4. Le cas du 19/10 : dernier dossier vu = GALOIS ; fiche bien de MONNIER ouverte depuis la recherche d'immeubles.
  {
    const S = '4. Fiche bien ouverte depuis la recherche d’immeubles';
    await envoyer(pageDossier({ ref: 'A 2025 00281', intitule: 'VTE GALOIS / BORDIER', comparants: [['M. GALOIS Sébastien', 'Vendeur'], ['Mme BORDIER Edwige', 'Acquéreur']],
      immeubles: [['41290 VIEVY LE RAYE', '4 Grande Rue']] }));
    const e = await envoyer(ficheBien({ numero: '24', voie: 'des Cyclamens', cpVille: '41190 SAINT LUBIN EN VERGONNOIS', parcelles: [['ZN', '4']], ongletActif: 'Recherche d’immeubles', autresOnglets: ['A 2025 00281 VTE GALOIS / BORDIER'] }));
    const d = await lire('galloyer');
    constat(S, e.dossierId !== 'galloyer', `fiche rangée dans ${e.dossierId || 'aucun dossier'} (${e.texte || ''})`);
    constat(S, !immeubles(d).some(a => /cyclamens/i.test(a)) && !/ZN4/.test(parcellesFiche(d)), `biens de GALOIS : ${immeubles(d).join(' | ') || 'aucun'} ; parcelles ${parcellesFiche(d)}`);
  }
  // 5. Même chose sans onglet relevé (ancienne extension), juste après la page de GALOIS : la rubrique « Immeubles » la refuse.
  {
    const S = '5. Fiche bien d’une autre vente sans onglet relevé';
    const b = ficheBien({ numero: '24', voie: 'des Cyclamens', cpVille: '41190 SAINT LUBIN EN VERGONNOIS', parcelles: [['ZN', '4'], ['ZN', '5']] });
    delete b.onglets;
    const e = await envoyer(b);
    const d = await lire('galloyer');
    constat(S, !immeubles(d).some(a => /cyclamens/i.test(a)) && !/ZN/.test(parcellesFiche(d)), `biens de GALOIS : ${immeubles(d).join(' | ') || 'aucun'} ; parcelles ${parcellesFiche(d)} (${e.etat} : ${e.texte || ''})`);
  }
  // 6. Fiche bien dans l'onglet d'un AUTRE dossier (référence différente) : jamais dans le dernier vu.
  {
    const S = '6. Fiche bien dans l’onglet d’un autre dossier';
    const e = await envoyer(ficheBien({ numero: '24', voie: 'des Cyclamens', cpVille: '41190 SAINT LUBIN EN VERGONNOIS', parcelles: [['ZN', '4']], ongletActif: 'A 2025 00138 VTE MONNIER / BESN...', autresOnglets: ['A 2025 00281 VTE GALOIS / BORDIER'] }));
    const g = await lire('galloyer');
    constat(S, e.dossierId !== 'galloyer', `rangée dans ${e.dossierId || 'aucun'}`);
    constat(S, !immeubles(g).some(a => /cyclamens/i.test(a)), `biens de GALOIS : ${immeubles(g).join(' | ') || 'aucun'}`);
  }
  // 7. Deux dossiers ouverts : la fiche client va au dossier de l'onglet ACTIF.
  {
    const S = '7. Deux dossiers ouverts, fiche client de l’onglet actif';
    const e = await envoyer(ficheClient({ civilite: 'Monsieur', nom: 'Monnier', prenom: 'Jacques', tel: '06 11 11 11 11', email: 'jacques.monnier@exemple.fr', ongletActif: 'A 2025 00138 VTE MONNIER / BESNARD', autresOnglets: ['A 2025 00281 VTE GALOIS / BORDIER'] }));
    const m = await lire('monnier'); const g = await lire('galloyer');
    constat(S, e.dossierId === 'monnier', `rangée dans ${e.dossierId || 'aucun'} (${e.texte || ''})`);
    constat(S, /jacques\.monnier/.test(m.emailVendeur || '') && !/jacques\.monnier/.test(JSON.stringify(g)), `email vendeur MONNIER « ${m.emailVendeur || ''} »`);
  }
  // 8. Fiche client d'une personne d'un autre dossier, dans l'onglet de GALOIS : rien dans GALOIS.
  {
    const S = '8. Fiche client étrangère dans l’onglet d’un dossier';
    const e = await envoyer(ficheClient({ civilite: 'Madame', nom: 'Besnard', prenom: 'Danny', email: 'danny.besnard@exemple.fr', ongletActif: 'A 2025 00281 VTE GALOIS / BORDIER' }));
    const g = await lire('galloyer');
    constat(S, !/besnard/i.test(parties(g)) && !/danny/.test(JSON.stringify([g.emailVendeur, g.emailAcquereur])), `GALOIS : ${parties(g)} (${e.etat} : ${e.texte || ''})`);
  }
  // 9. Page d'un dossier à une autre référence que celle retenue : jamais rattachée à GALOIS.
  {
    const S = '9. Référence rattachée : un autre numéro ne s’y rattache jamais';
    const e = await envoyer(pageDossier({ ref: 'A 2026 00999', intitule: 'VTE GALOIS / BORDIER', comparants: [['M. GALOIS Sébastien', 'Vendeur'], ['Mme BORDIER Edwige', 'Acquéreur']], immeubles: [['41000 BLOIS', '99 rue Autre']] }));
    const g = await lire('galloyer');
    constat(S, e.dossierId !== 'galloyer' && g.referenceAuthentic === 'A 2025 00281', `rangée dans ${e.dossierId || 'aucun'} ; référence de GALOIS ${g.referenceAuthentic}`);
  }
  // 10. Même nom des deux côtés : la fiche de Marie ROY va aux acquéreurs.
  {
    const S = '10. Vendeur et acquéreur du même nom';
    await envoyer(pageDossier({ ref: 'A 2026 00310', intitule: 'VTE ROY / ROY', comparants: [['M. ROY Jean', 'Vendeur'], ['Mme ROY Marie', 'Acquéreur']], immeubles: [['41000 BLOIS', '7 rue Porte Côté']] }));
    const e = await envoyer(ficheClient({ civilite: 'Madame', nom: 'Roy', prenom: 'Marie', email: 'marie.roy@exemple.fr', ongletActif: 'A 2026 00310 VTE ROY / ROY' }));
    const d = await lire('roy');
    constat(S, /marie\.roy/.test(d.emailAcquereur || '') && !/marie\.roy/.test(d.emailVendeur || ''), `acquéreur « ${d.emailAcquereur || ''} », vendeur « ${d.emailVendeur || ''} » (${e.texte || ''})`);
  }
  // 11. Volet du conjoint dans la fiche : seule la personne de la fiche est reprise ; un conjoint hors comparants n'entre pas.
  {
    const S = '11. Fiche client avec le volet du conjoint';
    const e = await envoyer(ficheClient({ civilite: 'Monsieur', nom: 'Roy', prenom: 'Jean', email: 'jean.roy@exemple.fr', ongletActif: 'A 2026 00310 VTE ROY / ROY',
      conjoint: { civilite: 'Madame', nom: 'Roy', prenom: 'Odile', email: 'odile.roy@exemple.fr' } }));
    const d = await lire('roy');
    constat(S, /jean\.roy/.test(d.emailVendeur || ''), `vendeur « ${d.emailVendeur || ''} » (${e.texte || ''})`);
    constat(S, !/odile/i.test(parties(d)) && !/odile/.test(JSON.stringify([d.emailVendeur, d.emailAcquereur])), `parties : ${parties(d)}`);
  }
  // 12. Changement d'email dans Authentic : proposé, jamais écrit d'office.
  {
    const S = '12. Email changé dans Authentic';
    const e = await envoyer(ficheClient({ civilite: 'Madame', nom: 'Fournier', prenom: 'Camille', tel: '06 12 34 56 78', email: 'camille.nouvelle@exemple.fr', ongletActif: 'A 2026 00500 VTE MARTEL / FOURNIER' }));
    const d = await lire('martel');
    const proposees = (d.authentic && d.authentic.majEnAttente) || [];
    constat(S, /camille\.fournier/.test(d.emailAcquereur || '') && !/nouvelle/.test(d.emailAcquereur || ''), `email gardé « ${d.emailAcquereur || ''} » (${e.texte || ''})`);
    constat(S, JSON.stringify(proposees).includes('nouvelle'), `mise à jour proposée : ${proposees.length}`);
  }
  // 13. Sous-dossier « Promesse » : rien appliqué.
  {
    const S = '13. Sous-dossier promesse';
    const avant = await lire('martel');
    const p = pageDossier({ ref: 'A 2026 00500', intitule: 'VTE MARTEL / FOURNIER', sous: '1 - Promesse VTE MARTEL / FOURNIER', comparants: [['M. MARTEL Alexandre', 'Vendeur'], ['Mme FOURNIER Camille', 'Acquéreur']],
      immeubles: [['41350 VINEUIL', '3 chemin des Vignes']], documents: [['Promesse de vente', '', '01/06/2026', '', 'Signé le 01/06/2026']] });
    const e = await envoyer(p);
    const d = await lire('martel');
    constat(S, !(d.echeancesValidees && d.echeancesValidees.acte) && JSON.stringify(d.pieces) === JSON.stringify(avant.pieces), `acte marqué signé : ${!!(d.echeancesValidees && d.echeancesValidees.acte)} (${e.texte || ''})`);
  }
  // 14. Ancien dossier signé des mêmes clients : la page de l'ancien numéro ne touche pas le nouveau.
  {
    const S = '14. Ancien dossier des mêmes clients';
    const e = await envoyer(pageDossier({ ref: 'A 2024 00050', intitule: 'VTE PETIT / BOSQUET', comparants: [['M. PETIT Luc', 'Vendeur'], ['Mme BOSQUET Anne', 'Acquéreur']], immeubles: [['41000 BLOIS', '1 rue Ancienne']],
      documents: [['Acte de vente', '', '01/06/2025', '', 'Signé le 01/06/2025']] }));
    const n = await lire('nouveau');
    constat(S, e.dossierId !== 'nouveau' && !(n.echeancesValidees && n.echeancesValidees.acte), `rangée dans ${e.dossierId || 'aucun'} ; nouveau signé : ${!!(n.echeancesValidees && n.echeancesValidees.acte)}`);
  }
  // 15. Copropriété : fiche bien (assise) puis page des lots.
  {
    const S = '15. Copropriété : bien puis lots';
    const tab = 'A 2026 00320 VTE LEBRUN / MARCHAND';
    await envoyer(pageDossier({ ref: 'A 2026 00320', intitule: 'VTE LEBRUN / MARCHAND', comparants: [['Mme LEBRUN Agathe', 'Vendeur'], ['Mme MARCHAND Sylvie', 'Acquéreur']], immeubles: [['41000 BLOIS', '9 rue des Tilleuls']] }));
    const infos = ficheBien({ type: 'Appartement', numero: '9', voie: 'des Tilleuls', cpVille: '41000 BLOIS', parcelles: [['DK', '412']], ongletActif: tab });
    infos.tableaux[0].titre = 'Parcelle Assise volumétrique';
    await envoyer(infos);
    const IDC = ID + 'ficheImmeubleTabView:';
    const lots = { titre: 'Authentic', onglets: onglets(tab), champs: [
      { groupe: '', libelle: IDC + 'lotsComponent:listeLotComponent:coproLotDatatable:selectAllCheckbox_input', valeur: 'non' },
      { groupe: '', libelle: 'Total Tantièmes immeuble', valeur: '10 000' },
      { groupe: '', libelle: IDC + 'lotsComponent:lotDetailsComponent:detailsTabView:infoGeneralComponent:type:selectonemenu_input', valeur: 'Appartement' },
      { groupe: '', libelle: 'N° de lot', valeur: '12' }, { groupe: '', libelle: 'Tantièmes lot', valeur: '125' }],
      tableaux: [{ titre: 'Liste des lots', entete: ['', 'N°Filter by N°', 'Ancien N°Filter by Ancien N°', 'TypeFilter by Type', 'BâtimentFilter by Bâtiment', 'EtageFilter by Etage', 'EntréeFilter by Entrée', 'Tantièmes lot', '', ''],
        lignes: [['', 'Total Tantièmes immeuble', '10 000', ''], ['non', '12', '', 'Appartement', '', '3', '', '125', '', ''], ['non', '34', '', 'Cave', 'A', '-1', '', '8', '', '']] }], texte: '' };
    const e = await envoyer(lots);
    const d = await lire('copro');
    constat(S, parcellesFiche(d) === 'DK412', `parcelles : ${parcellesFiche(d) || 'aucune'}`);
    constat(S, ((d.bien && d.bien.lots) || []).map(l => l.numero).join(',') === '12,34', `lots : ${((d.bien && d.bien.lots) || []).map(l => l.numero).join(',') || 'aucun'} (${e.texte || ''})`);
  }
  // 16. Deux biens annoncés : le second bien de l'onglet entre ; un troisième d'une autre commune, non.
  {
    const S = '16. Dossier de deux biens';
    const tab = 'A 2025 00281 VTE GALOIS / BORDIER';
    await envoyer(pageDossier({ ref: 'A 2025 00281', intitule: 'VTE GALOIS / BORDIER', comparants: [['M. GALOIS Sébastien', 'Vendeur'], ['Mme BORDIER Edwige', 'Acquéreur']],
      immeubles: [['41290 VIEVY LE RAYE', '4 Grande Rue'], ['41290 VIEVY LE RAYE', 'Les Grands Champs']] }));
    await envoyer(ficheBien({ numero: '4', voie: 'Grande', typeVoie: 'Rue', cpVille: '41290 VIEVY LE RAYE', parcelles: [['B', '234']], ongletActif: tab }));
    const e2 = await envoyer(ficheBien({ type: 'Terrain', numero: '', typeVoie: 'lieu-dit', voie: 'Les Grands Champs', cpVille: '41290 VIEVY LE RAYE', parcelles: [['ZE', '4']], ongletActif: tab }));
    const e3 = await envoyer(ficheBien({ numero: '24', voie: 'des Cyclamens', cpVille: '41190 SAINT LUBIN EN VERGONNOIS', parcelles: [['ZN', '9']], ongletActif: tab }));
    const d = await lire('galloyer');
    constat(S, immeubles(d).length === 2 && immeubles(d).some(a => /champs/i.test(a)), `biens : ${immeubles(d).join(' | ')} (${e2.texte || ''})`);
    constat(S, !immeubles(d).some(a => /cyclamens/i.test(a)) && !/ZN9/.test(parcellesFiche(d)), `troisième bien écarté (${e3.texte || ''}) ; parcelles ${parcellesFiche(d)}`);
  }
  // 17. Succession : page avec Défunt / Héritiers ; fiche client d'un héritier.
  {
    const S = '17. Succession';
    const e = await envoyer(pageDossier({ ref: 'A 2026 00330', intitule: 'SUCC BERNARD Paul', sous: '1 - Succession Paul BERNARD',
      comparants: [['M. BERNARD Paul', 'Défunt'], ['Mme BERNARD Lucie', 'Héritier'], ['M. BERNARD Marc', 'Héritier']], immeubles: [['41000 BLOIS', '5 rue Haute'], ['41100 VENDOME', '2 rue Basse']] }));
    const e2 = await envoyer(ficheClient({ civilite: 'Monsieur', nom: 'Bernard', prenom: 'Marc', email: 'marc.bernard@exemple.fr', ongletActif: 'A 2026 00330 SUCC BERNARD Paul' }));
    const d = await lire('succ');
    constat(S, e.dossierId === 'succ', `page rangée dans ${e.dossierId || 'aucun'} (${e.texte || ''})`);
    constat(S, /Marc BERNARD/.test(parties(d)), `parties : ${parties(d)} (${e2.texte || ''})`);
  }
  // 18. Navigation vers un dossier d'un autre type (donation) : la fiche suivante n'entre pas dans le dossier précédent.
  {
    const S = '18. Navigation vers une donation';
    await fetch(B + '/api/authentic/navigation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intitule: 'A 2026 00400 15 - Donation SIMOND' }) });
    await pause(1500);
    const e = await envoyer(ficheClient({ civilite: 'Madame', nom: 'Simond', prenom: 'Hélène', email: 'helene.simond@exemple.fr' }));
    const tous = await (await fetch(B + '/api/dossiers')).json();
    constat(S, !JSON.stringify(tous).includes('helene.simond'), `fiche de la donation rangée dans ${e.dossierId || 'aucun'} (${e.texte || ''})`);
  }
  // 19. « Relire depuis Authentic » sur MARTEL : rien de cassé, rien de mélangé.
  {
    const S = '19. Relire depuis Authentic';
    const ok = await page.evaluate(async () => { try { await relireDepuisAuthentic('martel'); return true; } catch (e) { return String(e && e.message); } });
    await pause(1500);
    const d = await lire('martel');
    constat(S, ok === true, `relecture : ${ok}`);
    constat(S, parcellesFiche(d) === 'AB123,AB124' && parties(d) === 'ACQUEREUR:Camille FOURNIER, VENDEUR:Alexandre MARTEL', `après relecture : ${parties(d)} ; parcelles ${parcellesFiche(d)}`);
  }
  // 20. Création : une vente absente de CLAIRE est proposée « à créer », avec ses personnes et son bien.
  {
    const S = '20. Vente absente de CLAIRE (à créer)';
    const tab = 'A 2026 00600 VTE LEGRAND / ROUX';
    const e = await envoyer(pageDossier({ ref: 'A 2026 00600', intitule: 'VTE LEGRAND / ROUX', prix: '180 000,00 €', comparants: [['M. LEGRAND Paul', 'Vendeur'], ['Mme ROUX Léa', 'Acquéreur']], immeubles: [['41000 BLOIS', '8 rue des Lilas']] }));
    await envoyer(ficheClient({ civilite: 'Monsieur', nom: 'Legrand', prenom: 'Paul', email: 'paul.legrand@exemple.fr', ongletActif: tab }));
    await envoyer(ficheClient({ civilite: 'Madame', nom: 'Roux', prenom: 'Léa', email: 'lea.roux@exemple.fr', ongletActif: tab }));
    await envoyer(ficheBien({ numero: '8', voie: 'des Lilas', cpVille: '41000 BLOIS', parcelles: [['AL', '10']], ongletActif: tab }));
    const groupe = await page.evaluate(async () => {
      const r = await fetchAvecAuth('/api/authentic/releves/recents');
      const g = dossiersDepuisRelevesAuthentic((await r.json()).releves || []).find(x => /LEGRAND/.test(x.intitule));
      return g ? { aCreer: g.aCreer, reference: g.reference, personnes: g.export.personnes.map(p => p.prenom + ' ' + p.nom), parties: partiesExportAuthentic(g.export).map(p => p.role + ':' + p.nom), immeubles: g.export.immeubles.map(i => (i.adresse || {}).texte) } : null;
    });
    constat(S, e.etat === 'a-creer', `page : ${e.etat} (${e.texte || ''})`);
    constat(S, !!groupe && groupe.aCreer && groupe.reference === 'A 2026 00600', `groupe : ${JSON.stringify(groupe)}`);
    constat(S, !!groupe && groupe.parties.join(',') === 'VENDEUR:Paul LEGRAND,ACQUEREUR:Léa ROUX' && groupe.immeubles.length === 1, 'parties et bien du dossier à créer');
  }
  // 21. Création réelle depuis « Nouveau dossier › Depuis Authentic », puis une page suivante va au nouveau dossier.
  {
    const S = '21. Création depuis Authentic puis suivi';
    const cree = await page.evaluate(async () => {
      definirOnglet('nouveau');
      choisirModeImport('seul');
      for (let i = 0; i < 40 && !groupesAuthenticRecents.some(g => /LEGRAND/.test(g.intitule)); i++) await new Promise(r => setTimeout(r, 150));
      const i = groupesAuthenticRecents.findIndex(g => /LEGRAND/.test(g.intitule));
      if (i < 0) return 'groupe absent';
      creerDepuisAuthentic(i);
      await new Promise(r => setTimeout(r, 400));
      const resp = document.getElementById('f-responsable');
      if (resp && !resp.value) resp.value = 'Julie VASSELIN';
      const avant = dossiers.length;
      await ajouterDossier(true);
      for (let k = 0; k < 40 && dossiers.length === avant; k++) await new Promise(r => setTimeout(r, 150));
      const d = dossiers.find(x => x.referenceAuthentic === 'A 2026 00600' || /LEGRAND/.test(x.nom || ''));
      return d ? d.id : 'pas créé';
    });
    await pause(1500);
    const d = (await (await fetch(B + '/api/dossiers')).json());
    const nouveau = (d.dossiers || d).find(x => x.id === cree);
    constat(S, !!nouveau, `dossier créé : ${cree}`);
    if (nouveau) {
      constat(S, nouveau.referenceAuthentic === 'A 2026 00600', `référence : ${nouveau.referenceAuthentic || '—'}`);
      constat(S, parties(nouveau) === 'ACQUEREUR:Léa ROUX, VENDEUR:Paul LEGRAND', `parties : ${parties(nouveau)}`);
      constat(S, /paul\.legrand/.test(nouveau.emailVendeur || '') && /lea\.roux/.test(nouveau.emailAcquereur || ''), `emails : ${nouveau.emailVendeur || '—'} / ${nouveau.emailAcquereur || '—'}`);
      constat(S, /AL10/.test(parcellesFiche(nouveau)), `parcelles : ${parcellesFiche(nouveau) || 'aucune'}`);
      const e = await envoyer(pageDossier({ ref: 'A 2026 00600', intitule: 'VTE LEGRAND / ROUX', prix: '180 000,00 €', comparants: [['M. LEGRAND Paul', 'Vendeur'], ['Mme ROUX Léa', 'Acquéreur']], immeubles: [['41000 BLOIS', '8 rue des Lilas']],
        documents: [['Acte de naissance de Mme ROUX Léa', '', '05/10/2026', '', 'Reçu']] }));
      constat(S, e.dossierId === cree, `page suivante rangée dans ${e.dossierId || 'aucun'} (${e.texte || ''})`);
    }
  }
  // 22. Même page relevée deux fois : rien en double.
  {
    const S = '22. Page relevée deux fois';
    const avant = await lire('martel');
    const p = pageDossier({ ref: 'A 2026 00500', intitule: 'VTE MARTEL / FOURNIER', prix: '240 000,00 €', comparants: [['M. MARTEL Alexandre', 'Vendeur'], ['Mme FOURNIER Camille', 'Acquéreur']], immeubles: [['41350 VINEUIL', '3 chemin des Vignes']],
      documents: [['Acte de naissance de M. MARTEL Alexandre', '', '03/09/2026', '', 'Reçu'], ['Notification SAFER', '', '10/09/2026', '25/09/2026', 'Non préemption']] });
    await pause(16000); // au-delà de la fenêtre des doublons : la page est relue
    const e = await envoyer(p);
    const d = await lire('martel');
    constat(S, (d.piecesPersonnalisees || []).length === (avant.piecesPersonnalisees || []).length && (d.historique || []).length - (avant.historique || []).length <= 1, `pièces ${ (avant.piecesPersonnalisees || []).length } → ${(d.piecesPersonnalisees || []).length}, historique +${(d.historique || []).length - (avant.historique || []).length} (${e.etat})`);
  }
  // 23. Fiche client ouverte hors d'un onglet de dossier : question posée, rien d'office.
  {
    const S = '23. Personne de deux dossiers en cours';
    const e = await envoyer(ficheClient({ civilite: 'Monsieur', nom: 'Petit', prenom: 'Luc', email: 'luc.petit@exemple.fr', ongletActif: 'Recherche clients' }));
    const n = await lire('nouveau');
    constat(S, (e.etat === 'a-choisir' || e.etat === 'a-confirmer') && !e.dossierId && !JSON.stringify(n).includes('luc.petit'), `${e.etat} → ${e.dossierId || '—'}, rien d’office (${e.texte || ''})`);
    constat(S, !JSON.stringify(await lire('ancien')).includes('luc.petit'), 'l’ancien dossier archivé ne reçoit rien');
    void n;
  }
  // 24. Acte signé dans le sous-dossier de vente : échéances marquées faites.
  {
    const S = '24. Acte signé dans Authentic';
    const e = await envoyer(pageDossier({ ref: 'A 2026 00310', intitule: 'VTE ROY / ROY', comparants: [['M. ROY Jean', 'Vendeur'], ['Mme ROY Marie', 'Acquéreur']], immeubles: [['41000 BLOIS', '7 rue Porte Côté']],
      documents: [['Acte de vente', '', '12/10/2026', '', 'Signé le 12/10/2026']] }));
    const d = await lire('roy');
    constat(S, !!(d.echeancesValidees && (d.echeancesValidees.acte || d.echeancesValidees.rendezVousSignature)), `échéances : ${JSON.stringify(d.echeancesValidees || {})} (${e.texte || ''})`);
  }
  // 25. Conjoint d'une partie, absent des comparants : sa fiche n'ajoute personne.
  {
    const S = '25. Conjoint non comparant';
    const avant = await lire('martel');
    const e = await envoyer(ficheClient({ civilite: 'Madame', nom: 'Martel', prenom: 'Sophie', email: 'sophie.martel@exemple.fr', ongletActif: 'A 2026 00500 VTE MARTEL / FOURNIER' }));
    const d = await lire('martel');
    constat(S, parties(d) === parties(avant) && !/sophie/.test(JSON.stringify([d.emailVendeur, d.emailAcquereur])), `parties : ${parties(d)} (${e.texte || ''})`);
  }
  // 26. Succession : fiche du défunt (décès) et fiche bien ajoutée.
  {
    const S = '26. Succession : défunt et biens';
    const tab = 'A 2026 00330 SUCC BERNARD Paul';
    const def = ficheClient({ civilite: 'Monsieur', nom: 'Bernard', prenom: 'Paul', naissance: '01/01/1940', ongletActif: tab });
    def.champs.push({ groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:deces_input', valeur: 'oui' }, { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:dateDeces:dateDeces', valeur: '02/09/2026' });
    const e1 = await envoyer(def);
    const e2 = await envoyer(ficheBien({ numero: '5', voie: 'Haute', cpVille: '41000 BLOIS', parcelles: [['CK', '50']], ongletActif: tab }));
    const e3 = await envoyer(ficheBien({ numero: '2', voie: 'Basse', cpVille: '41100 VENDOME', parcelles: [['AH', '7']], ongletActif: tab }));
    const d = await lire('succ');
    constat(S, ((d.biens || []).length >= 2) || immeubles(d).length >= 2, `biens : ${(d.biens || []).map(b => b.adresse).join(' | ') || immeubles(d).join(' | ') || 'aucun'} (${e2.texte || ''} / ${e3.texte || ''})`);
    constat(S, e1.dossierId === 'succ' && /Paul BERNARD/.test(parties(d) + JSON.stringify(d.defunt || {}) + JSON.stringify((d.authentic || {}).fichesClients || {})), `fiche du défunt : ${e1.dossierId || 'aucun'} (${e1.texte || e1.etat})`);
  }
  // 27. Fenêtre CLAIRE fermée : la page attend et s'applique à la réouverture.
  {
    const S = '27. Fenêtre CLAIRE fermée puis rouverte';
    await page.close();
    const r = await fetch(B + '/api/authentic/releve', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ficheClient({ civilite: 'Madame', nom: 'Marchand', prenom: 'Sylvie', email: 'sylvie.marchand@exemple.fr', ongletActif: 'A 2026 00320 VTE LEBRUN / MARCHAND' })) });
    const { id } = await r.json();
    await pause(1500);
    const p2 = await ctx.newPage();
    p2.on('pageerror', (e) => erreursPage.push(e.message));
    await p2.goto(B + '/');
    let entree = null;
    for (let i = 0; i < 480 && !(entree && entree.etat !== 'en-file' && entree.etat !== 'pris'); i++) {
      await pause(250);
      entree = ((await (await fetch(B + '/api/authentic/journal')).json()).entrees || []).find(x => x.id === id);
    }
    await pause(600);
    const d = await lire('copro');
    constat(S, /sylvie\.marchand/.test(d.emailAcquereur || ''), `acquéreur « ${d.emailAcquereur || ''} » (${entree && entree.etat})`);
  }
  // 28. SAFER notifiée sans réponse : « Réponse SAFER » attendue.
  {
    const S = '28. SAFER notifiée sans réponse';
    const e = await envoyer(pageDossier({ ref: 'A 2026 00106', intitule: 'VTE PETIT / BOSQUET', comparants: [['M. PETIT Luc', 'Vendeur'], ['Mme BOSQUET Anne', 'Acquéreur']], immeubles: [['41000 BLOIS', '15 rue Nouvelle']],
      documents: [['Formulaire A - DIA auprès de la SAFER', '', '10/10/2026', '', 'Pris en compte']] }));
    const d = await lire('nouveau');
    constat(S, e.dossierId === 'nouveau' && !!(d.authentic && d.authentic.safer), `safer : ${JSON.stringify(d.authentic && d.authentic.safer)} ; pièce ${d.pieces && d.pieces['perso-safer']} (${e.texte || ''})`);
    constat(S, !(d.pieces && d.pieces.renonciationPreemption === 'recue'), 'la DIA de la SAFER ne coche pas la renonciation de la mairie');
  }
  // 29. Ancienne extension (sans onglets) : la fiche client suit la page du dossier ouverte juste avant.
  {
    const S = '29. Extension sans onglets relevés';
    const pg = pageDossier({ ref: 'A 2025 00138', intitule: 'VTE MONNIER / BESNARD', comparants: [['M. MONNIER Jacques', 'Vendeur'], ['Mme BESNARD Danny', 'Acquéreur']], immeubles: [['41190 SAINT LUBIN EN VERGONNOIS', '24 rue des Cyclamens']],
      documents: [['Acte de naissance de M. MONNIER Jacques', '', '01/10/2026', '', 'Reçu']] });
    delete pg.onglets;
    const e1 = await envoyer(pg);
    const f = ficheClient({ civilite: 'Madame', nom: 'Besnard', prenom: 'Danny', tel: '06 22 22 22 22', email: 'danny.besnard@exemple.fr' });
    delete f.onglets;
    const e2 = await envoyer(f);
    const m = await lire('monnier');
    constat(S, e1.dossierId === 'monnier' && e2.dossierId === 'monnier', `page → ${e1.dossierId || '—'}, fiche → ${e2.dossierId || '—'} (${e2.texte || ''})`);
    constat(S, /22 22 22 22|06 22/.test(m.telephoneAcquereur || '') || /danny/.test(m.emailAcquereur || ''), `acquéreur : ${m.emailAcquereur || '—'} / ${m.telephoneAcquereur || '—'}`);
  }
  // 30. Succession absente de CLAIRE : proposée à créer.
  {
    const S = '30. Succession absente de CLAIRE';
    const e = await envoyer(pageDossier({ ref: 'A 2026 00700', intitule: 'SUCC DURAND Jean', sous: '1 - Succession Jean DURAND',
      comparants: [['M. DURAND Jean', 'Défunt'], ['Mme DURAND Léa', 'Héritier']], immeubles: [['41000 BLOIS', '3 rue Basse']] }));
    constat(S, e.etat === 'a-creer', `page : ${e.etat} (${e.texte || ''})`);
  }
  // 31. Deux fenêtres CLAIRE ouvertes : la page n'est appliquée qu'une fois.
  {
    const S = '31. Deux fenêtres CLAIRE ouvertes';
    const p3 = await ctx.newPage();
    await p3.goto(B + '/');
    await pause(3000);
    const avant = await lire('copro');
    const e = await envoyer(pageDossier({ ref: 'A 2026 00320', intitule: 'VTE LEBRUN / MARCHAND', comparants: [['Mme LEBRUN Agathe', 'Vendeur'], ['Mme MARCHAND Sylvie', 'Acquéreur']], immeubles: [['41000 BLOIS', '9 rue des Tilleuls']],
      documents: [['Acte de naissance de Mme LEBRUN Agathe', '', '02/10/2026', '', 'Reçu']] }));
    await pause(2500);
    const d = await lire('copro');
    const ajout = (d.historique || []).slice((avant.historique || []).length).filter(h => /naissance/i.test(h.texte));
    constat(S, e.dossierId === 'copro' && ajout.length === 1, `appliquée ${ajout.length} fois (${e.texte || ''})`);
    await p3.close();
  }
} catch (e) {
  constat('banc', false, 'le banc s’est arrêté : ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' '));
}
for (const m of erreursPage) constat('fenêtre CLAIRE', false, 'erreur de page : ' + m);

await navigateur.close();
serveur.close();
let courant = '';
for (const r of resultats) {
  if (r.scenario !== courant) { courant = r.scenario; console.log('\n' + courant); }
  console.log(`  ${r.ok ? 'ok  ' : 'ÉCHEC'} ${r.texte}`);
}
console.log(`\n${resultats.length - echecs}/${resultats.length} constats vérifiés`);
process.exit(echecs ? 1 : 0);
