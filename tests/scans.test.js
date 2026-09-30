'use strict';
// Classeur des scans du copieur (30/09) : reconnaissance du type de pièce sur le haut de la
// première page, du dossier client par ses parties / l'adresse / le cadastre, nom de la copie et
// rubrique. Textes reprenant la structure des documents réels reçus (en-têtes d'états datés,
// d'offres de prêt, d'actes notariés, OCR de compromis scannés), noms et adresses inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const type = (app, texte) => { const t = app.typePieceScan(app.enTeteScan(texte)); return t ? t.cle : null; };

test('type : états datés reconnus même sans le titre « état daté » en haut de page', () => {
  const app = chargerApplication();
  assert.equal(type(app, '1 IMMEUBLE SIS A : 12 RUE DES LILAS 41000 BLOIS COORDONNÉES DU COPROPRIÉTAIRE CÉDANT : DURAND 3 rue Haute 41000 BLOIS MUTATION N° DES LOTS : 09, 08'), 'etatDate');
  assert.equal(type(app, 'SYNDIC TRANSACTION Objet : État daté - Mutation lot 12'), 'etatDate');
  assert.equal(type(app, 'PRÉ-ÉTAT DATÉ établi à la demande du vendeur'), 'preEtatDate');
});

test('type : la mention la plus haute l’emporte, pas ce qu’un courrier cite plus bas', () => {
  const app = chargerApplication();
  // Décompte réel : « quote-part de taxes foncières » plus bas ne fait pas un avis de taxe foncière.
  assert.equal(type(app, 'Références dossier : VENTE MARTIN/DURAND DECOMPTE PREVISIONNEL Madame Sophie DURAND Prix d’acquisition 165.000,00 € quote-part de taxes foncières 2026 230,13 €'), 'decompte');
  // Convocation réelle qui cite la promesse de vente plus bas.
  assert.equal(type(app, 'Nos Réf : VTE MARTIN / DURAND Madame, j’ai le plaisir de vous confirmer le rendez-vous pour la signature de l’acte de vente… conformément à la promesse de vente'), 'convocation');
  // Offre réelle dont les conditions citent un « diagnostic de performance énergétique ».
  assert.equal(type(app, 'MME DURAND OFFRE DE CREDIT VALANT CONTRAT En application des articles L313-1… prêt vert sous réserve du diagnostic de performance énergétique'), 'offrePret');
});

test('type : acte notarié — promesse, compromis ou titre de propriété', () => {
  const app = chargerApplication();
  const preambule = "L'AN DEUX MILLE VINGT-SIX LE ONZE JUIN Maître Claire NOTAIRE, notaire à BLOIS (41000), soussigné, a reçu le présent acte authentique entre les personnes ci-après identifiées : ";
  assert.equal(type(app, preambule + "PROMESSE UNILATERALE DE VENTE D'IMMEUBLE 1) promettants Monsieur Paul MARTIN, marié sans contrat de mariage"), 'promesse');
  // Un acte de vente reçu : le titre de propriété du vendeur, pas un « état civil » parce que le
  // préambule parle de contrat de mariage.
  assert.equal(type(app, preambule + "VENTE IDENTIFICATION DES PARTIES Monsieur Paul MARTIN, marié sans contrat de mariage préalable"), 'titrePropriete');
});

test('type : compromis d’agence et avant-contrat sous seing privé scannés (texte OCR réel)', () => {
  const app = chargerApplication();
  assert.equal(type(app, 'HUMAN » Immobilier VENTE DE BIENS IMMOBILIERS SOUS CONDITIONS SUSPENSIVES IMMEUBLE HORS COPROPRIÉTÉ Entre les soussignés : Monsieur Paul MARTIN'), 'avantContrat');
  assert.equal(type(app, "100110602 MLC/AVI/ INFORMATION PREALABLE Les parties ci-après nommées, devant conclure entre elles un avant-contrat portant sur la vente d’un bien immobilier"), 'avantContrat');
});

test('type : avis de taxe foncière, appel de charges, offre, relevé — et rien d’inventé', () => {
  const app = chargerApplication();
  assert.equal(type(app, 'AVIS_TF_RG MONTOIRE SUR LE LOIR CENTRE DES FINANCES PUBLIQUES Montant de vos taxes foncières 921,00 €'), 'avisTaxeFonciere');
  assert.equal(type(app, "RÉPUBLIQUE FRANÇAISE BLOIS AVIS D'IMPÔTS LOCAUX Vos références Numéro fiscal"), 'avisTaxeFonciere');
  assert.equal(type(app, 'ref : 2202-042175 APPEL TRIMESTRIEL Période du 01/10/2025 au 31/12/2025 Copropriétaire : DURAND Sophie'), 'appelCharges');
  assert.equal(type(app, 'COURVILLE OFFRE DE CREDIT(S) IMMOBILIER(S) Suivi par …'), 'offrePret');
  assert.equal(type(app, 'Maître Claire NOTAIRE Relevé de compte Client Référence 3154'), 'releveCompte');
  // Courrier de mairie sur termites, mérules et plomb : aucun type, il reste à trier.
  assert.equal(type(app, 'Pôle Transition Écologique Objet : certificat Maître, suite à votre demande concernant la délivrance de certificats relatifs à l’immeuble sis 3 rue Haute, concernant les insectes xylophages (termites)'), null);
  assert.equal(type(app, ''), null);
});

test('type : pièces d’urbanisme et combinée alignement + numérotage', () => {
  const app = chargerApplication();
  assert.equal(type(app, "MAIRIE DE BLOIS CERTIFICAT D'URBANISME d'information"), 'certificatUrbanisme');
  assert.equal(type(app, "Arrêté portant certificat d'alignement et de numérotage"), 'alignementNumerotage');
  assert.equal(type(app, 'Décision de ne pas exercer le droit de préemption urbain'), 'renonciationPreemption');
  assert.equal(type(app, "DOSSIER DE DIAGNOSTIC TECHNIQUE Maison individuelle"), 'diagnosticsTechniques');
  assert.equal(type(app, 'ÉTAT DES RISQUES ET POLLUTIONS aléas naturels'), 'erp');
});

test('copie nommée d’après la checklist : la pièce passe « reçue » au parcours suivant du NAS', () => {
  const app = chargerApplication();
  const toutes = app.PIECES_URBANISME.concat(app.PIECES_AUTRES, app.PIECES_COPROPRIETE, app.PIECES_TERRAIN_AUTRES, app.PIECES_ENGAGEMENTS_AUTO);
  const echecs = [];
  for (const ty of app.TYPES_SCAN.filter(t => t.piece)) {
    const nom = app.normaliserNomPourMotif(app.nomCibleScan(ty, { date: '2026-10-01' }) + '.pdf');
    for (const cle of [ty.piece].concat(ty.piecesAussi || [])) {
      const piece = toutes.find(p => p.cle === cle);
      if (!piece || app.correspondancePieceNom(piece, nom) !== 'exact') echecs.push(`${ty.cle} → ${cle} (« ${nom} »)`);
    }
  }
  assert.equal(echecs.join(' | '), '');
  // Offre de prêt et avant-contrat : reconnus par leurs propres règles de nom.
  assert.equal(app.nomDitOffrePret(app.normaliserNomPourMotif('Offre de prêt - scan du 01-10-2026.pdf')), true);
  assert.equal(app.RE_NOM_COMPROMIS.test('Compromis signé - scan du 01-10-2026.pdf'), true);
});

test('checklist : un pré-état daté ne fait plus passer l’état daté « reçu »', () => {
  const app = chargerApplication();
  const etatDate = app.PIECES_COPROPRIETE.find(p => p.cle === 'etatDate');
  assert.equal(app.correspondancePieceNom(etatDate, app.normaliserNomPourMotif('Pré-état daté - scan du 01-10-2026.pdf')), null);
  assert.equal(app.correspondancePieceNom(etatDate, app.normaliserNomPourMotif('Pre etat date.pdf')), null);
  assert.equal(app.correspondancePieceNom(etatDate, app.normaliserNomPourMotif('État daté - scan du 01-10-2026.pdf')), 'exact');
  assert.equal(app.correspondancePieceNom(etatDate, app.normaliserNomPourMotif('Etat_date_POMONE.pdf')), 'exact');
});

const DOSSIERS = [
  { id: 'd1', nom: 'MARTIN / DURAND', nasDossier: 'MARTIN DURAND', adresseBien: 'BLOIS (41000), 12 rue des Lilas',
    bien: { cadastre: { section: 'AB', numero: '123', parcelles: [{ section: 'AB', numero: '123' }] } },
    parties: [{ nom: 'Paul MARTIN', role: 'VENDEUR' }, { nom: 'Sophie DURAND', role: 'ACQUEREUR', nomUsage: 'LEROY' }] },
  { id: 'd2', nom: 'MARTIN / BERNARD', nasDossier: 'MARTIN BERNARD', adresseBien: 'VINEUIL (41350), 5 impasse des Roses',
    parties: [{ nom: 'Jean MARTIN', role: 'VENDEUR' }, { nom: 'Luc BERNARD', role: 'ACQUEREUR' }] },
  { id: 'd3', nom: 'ANCIEN / DOSSIER', archive: true, nasDossier: 'ANCIEN', parties: [{ nom: 'Paul MARTIN', role: 'VENDEUR' }] }
];

test('dossier : deux parties nommées suffisent, un homonyme partiel ne compte pas', () => {
  const app = chargerApplication();
  const r = app.identifierDossierScan('Entre les soussignés Monsieur Paul MARTIN, vendeur, et Madame Sophie DURAND, acquéreur', DOSSIERS);
  assert.equal(r.dossier.id, 'd1');
  assert.equal(r.sur, true);
  assert.equal(r.score, 6);
  // Le dossier archivé portant le même vendeur n'est jamais candidat.
  assert.equal(r.candidats.map(c => c.id).join(','), 'd1');
});

test('dossier : l’adresse au format de CLAIRE et la parcelle sont reconnues', () => {
  const app = chargerApplication();
  assert.equal(app.voieAdresseScan('BLOIS (41000), 12 rue des Lilas'), '12 rue des lilas');
  assert.equal(app.voieAdresseScan('12 rue des Lilas 41000 BLOIS'), '12 rue des lilas');
  assert.equal(app.voieAdresseScan('BLOIS (41000)'), '');
  const r = app.identifierDossierScan('IMMEUBLE SIS A : 12 RUE DES LILAS 41000 BLOIS, cadastré section AB n° 0123', DOSSIERS);
  assert.equal(r.dossier.id, 'd1');
  assert.equal(r.sur, true);
  assert.equal(r.raisons.join(', '), 'adresse du bien, parcelle AB 123');
});

test('dossier : une seule personne nommée reste une suggestion, avec son rôle', () => {
  const app = chargerApplication();
  // Pièce d'identité : un nom seul. Nom d'usage accepté (« Sophie LEROY »).
  const r = app.identifierDossierScan('CARTE NATIONALE D’IDENTITÉ Nom : LEROY Prénom(s) : Sophie', DOSSIERS);
  assert.equal(r.dossier.id, 'd1');
  assert.equal(r.sur, false);
  assert.equal(r.role, 'ACQUEREUR');
  // « MARTIN » seul ne désigne personne : les deux MARTIN ont un prénom.
  assert.equal(app.identifierDossierScan('Monsieur MARTIN', DOSSIERS).dossier, null);
});

test('proposition : nom, rubrique selon la partie, rangement automatique seulement si tout est sûr', () => {
  const app = chargerApplication();
  const id = app.propositionScan({ texte: 'CARTE NATIONALE D’IDENTITÉ Nom : LEROY Prénom(s) : Sophie' }, DOSSIERS, '2026-10-01T09:00:00Z');
  assert.equal(id.type, 'identite');
  assert.equal(id.rubriques.join(','), 'acquereur');
  assert.equal(id.nomCible, 'Pièce d’identité - Sophie DURAND - scan du 01-10-2026'.replace('’', "'"));
  assert.equal(id.automatique, false);
  const ed = app.propositionScan({ texte: 'IMMEUBLE SIS A : 12 RUE DES LILAS 41000 BLOIS COPROPRIÉTAIRE CÉDANT : Paul MARTIN, lots AB 123' }, DOSSIERS, '2026-10-01');
  assert.equal(ed.type, 'etatDate');
  assert.equal(ed.rubriques.join(','), 'etatDate,copro');
  assert.equal(ed.nomCible, 'État daté - scan du 01-10-2026');
  assert.equal(ed.automatique, true);
  // Dossier sûr mais pas relié au NAS : jamais rangé seul.
  const sansNas = DOSSIERS.map(d => Object.assign({}, d, { nasDossier: null }));
  assert.equal(app.propositionScan({ texte: 'IMMEUBLE SIS A : 12 RUE DES LILAS 41000 BLOIS COPROPRIÉTAIRE CÉDANT : Paul MARTIN' }, sansNas, '2026-10-01').automatique, false);
});

test('nom d’un scan non reconnu : « Scan du JJ-MM-AAAA »', () => {
  const app = chargerApplication();
  assert.equal(app.nomCibleScan(null, { date: '2026-10-01T08:00:00Z' }), 'Scan du 01-10-2026');
  assert.equal(app.nomCibleScan(null, {}), 'Scan');
});
