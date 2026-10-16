'use strict';
// Pages d'Authentic lues par CLAIRE (relevé de l'extension Firefox) — structure des pages réelles
// relevées au bureau le 02/10 (gestion du dossier, fiche client, fiche bien), noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const ID = 'ui-ficho-tabs:mainTabPanel:tabForm2:tabContent:';
const gestion = {
  titre: 'Authentic',
  champs: [
    { groupe: '', libelle: 'Rechercher', valeur: '' },
    { groupe: '', libelle: '12 - Vente MARTEL/FOURNIER Importer avec 2e SENSComparants (3) personM. MARTEL Alexandre et Mme MARTEL personMme FOURNIER CamilleAcquéreur Immeubles (1) 41000 BLOIS L', valeur: '' }
  ],
  tableaux: [
    { titre: '', entete: [], lignes: [['Acte de naissance de M. MARTEL Alexandre', '', '03/09/2026', '', 'Reçu']] },
    { titre: '', entete: [], lignes: [['Notification SAFER', '', '10/09/2026', '25/09/2026', 'Non préemption']] },
    { titre: '', entete: [], lignes: [['Demande de certificat d’urbanisme', '', '01/09/2026', '', 'Envoyé'], ['Certificat d’urbanisme', '', '20/09/2026', '', '']] },
    { titre: '', entete: [], lignes: [['Déclaration d’intention d’aliéner', '', '05/09/2026', '', 'En attente']] }
  ],
  texte: '12 - Vente MARTEL/FOURNIER\nComparants'
};

const client = {
  titre: 'Authentic',
  champs: [
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:etude_input', valeur: 'oui' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:civilite:selectOneRadio', valeur: 'Madame' },
    { groupe: '', libelle: 'Nom de famille*', valeur: 'Fournier' },
    { groupe: '', libelle: 'Prénom*', valeur: 'Camille' },
    { groupe: '', libelle: 'Autre(s) Prénom(s)', valeur: 'Louise' },
    { groupe: '', libelle: "Dénomination d'usage", valeur: '' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:naissanceDate:naissanceDate', valeur: '14/02/1985' },
    { groupe: '', libelle: 'CP, Ville (naissance)', valeur: '37000 TOURS' },
    { groupe: '', libelle: 'Profession', valeur: 'Infirmière' },
    { groupe: '', libelle: 'N° de voie', valeur: '8' },
    { groupe: '', libelle: 'Type de voie', valeur: 'rue' },
    { groupe: '', libelle: 'Nom de la voie', valeur: 'des Lilas' },
    { groupe: '', libelle: 'CP - Ville', valeur: '41000 BLOIS' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneePrincipaleW1:Telephone:inputTelephone', valeur: '06 12 34 56 78' },
    { groupe: '', libelle: 'Email', valeur: 'camille.fournier@exemple.fr' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneeSecondaireW1:Telephone:inputTelephone', valeur: '02 54 00 00 01' },
    { groupe: '', libelle: 'Email', valeur: '' },
    { groupe: '', libelle: 'CP, Ville', valeur: '41000 BLOIS' }
  ],
  tableaux: [],
  texte: ''
};

const bien = {
  titre: 'Authentic',
  champs: [
    { groupe: 'Informations du bien', libelle: ID + 'ficheImmeubleTabView:infosComponent:ficheImmeubleIdentite:typeWithDialog:selectOneMenu_input', valeur: 'Maison individuelle' },
    { groupe: 'Informations du bien', libelle: 'N° de voie', valeur: '3' },
    { groupe: 'Informations du bien', libelle: 'Type de voie', valeur: 'chemin' },
    { groupe: 'Informations du bien', libelle: 'Nom de la voie', valeur: 'des Vignes' },
    { groupe: 'Informations du bien', libelle: 'CP - Ville*', valeur: '41350 VINEUIL' }
  ],
  tableaux: [{ titre: 'Cadastre', entete: ['Commune', 'Préfixe', 'Section', 'Numéro', 'Adresse ou lieu-dit', 'Nature', 'Zone urbanisme', 'SPF', 'surface', ''],
    lignes: [['41350 VINEUIL', '', 'ab', '0123', 'Les Vignes', '', '', 'BLOIS 1', '512', ''], ['41350 VINEUIL', '', 'AB', '124', 'Les Vignes', '', '', 'BLOIS 1', '80', '']] }],
  texte: ''
};

test('typePageAuthentic : gestion, fiche client, fiche bien', () => {
  assert.equal(app.typePageAuthentic(gestion), 'gestion');
  assert.equal(app.typePageAuthentic(client), 'client');
  assert.equal(app.typePageAuthentic(bien), 'bien');
  assert.equal(app.typePageAuthentic({ champs: [{ libelle: 'Rechercher', valeur: '' }] }), 'autre');
});

test('intituleDossierAuthentic et dossierPourIntituleAuthentic : mêmes noms des deux côtés, jamais deviné', () => {
  assert.equal(app.intituleDossierAuthentic(gestion), 'Vente MARTEL / FOURNIER');
  const dossiers = [{ id: 'a', nom: 'MARTEL / FOURNIER' }, { id: 'b', nom: 'MARTEL / DURAND' }, { id: 'c', nom: 'MARTIN / FOURNIER' }];
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/FOURNIER', dossiers).id, 'a');
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/LEROY', dossiers), null);
  // Deux dossiers en cours du même nom : rien n'est choisi.
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/FOURNIER', dossiers.concat({ id: 'd', nom: 'Martel / Fournier' })), null);
});

test('piecesRecuesAuthentic : seulement état civil, casier judiciaire et réponse SAFER ; jamais une demande ni une pièce en attente', () => {
  const lignes = app.lignesDocumentsAuthentic(gestion);
  assert.equal(lignes.length, 5);
  const r = app.piecesRecuesAuthentic(lignes, app.checklistPieces('maison'));
  // Étude, 02/10 : seuls l'état civil, les casiers judiciaires et la SAFER arrivent dans Authentic ;
  // le reste (urbanisme, diagnostics…) par email ou courrier — jamais repris, même sans « demande ».
  assert.equal(r.map(x => x.label).join(' | '), 'Acte de naissance de M. MARTEL Alexandre | Réponse SAFER');
  const safer = r.find(x => x.cle === 'perso-safer');
  assert.equal(safer.nouvelle, true);
  assert.equal(safer.date, '2026-09-10');
  const naissance = r.find(x => /naissance/i.test(x.label));
  assert.equal(naissance.nouvelle, true);
  assert.equal(naissance.date, '2026-09-03');
  // Succession : pas davantage de pièce d'urbanisme.
  assert.ok(!app.piecesRecuesAuthentic(lignes, app.checklistPieces('maison'), 'succession').some(x => x.cle === 'certificatUrbanisme'));
  // Casier judiciaire reçu : pièce du dossier ; sa demande : rien.
  const casier = app.piecesRecuesAuthentic([
    { titre: 'Bulletin n°3 du casier judiciaire de Mme FOURNIER Camille', date: '2026-09-12', etat: 'Reçu', texte: 'Bulletin n°3 du casier judiciaire de Mme FOURNIER Camille · 12/09/2026 · Reçu' },
    { titre: 'Demande de casier judiciaire de M. MARTEL Alexandre', date: '2026-09-01', etat: 'Envoyé', texte: 'Demande de casier judiciaire · 01/09/2026 · Envoyé' }
  ], []);
  assert.equal(casier.map(x => x.label).join(' | '), 'Bulletin n°3 du casier judiciaire de Mme FOURNIER Camille');
  // « Réponse SAFER — non préemption » n'est jamais la renonciation au droit de préemption urbain.
  const rs = app.piecesRecuesAuthentic([{ titre: 'Réponse SAFER non préemption', date: '2026-09-25', etat: 'Reçu', texte: 'Réponse SAFER non préemption · 25/09/2026 · Reçu' }], app.checklistPieces('maison'));
  assert.equal(rs.map(x => x.cle).join(','), 'perso-safer');
  // Notification SAFER sans non-préemption : rien.
  const sansDecision = app.piecesRecuesAuthentic([{ titre: 'Notification SAFER', date: '2026-09-10', etat: '', texte: 'Notification SAFER · 10/09/2026' }], []);
  assert.equal(sansDecision.length, 0);
});

test('clientDepuisFicheAuthentic : état civil, adresse, téléphones et emails', () => {
  const p = app.clientDepuisFicheAuthentic(client);
  assert.equal(p.nom, 'FOURNIER');
  assert.equal(p.prenom, 'Camille');
  assert.equal(p.civilite, 'Madame');
  assert.equal(p.autresPrenoms, 'Louise');
  assert.equal(p.dateNaissance, '1985-02-14');
  assert.equal(p.lieuNaissance, '37000 TOURS');
  assert.equal(p.profession, 'Infirmière');
  assert.equal(p.adresse.texte, '8 rue des Lilas 41000 BLOIS');
  assert.equal(p.telephones.join(' / '), '06 12 34 56 78 / 02 54 00 00 01');
  assert.equal(p.emails.join(','), 'camille.fournier@exemple.fr');
});

test('bienDepuisFicheAuthentic : type, adresse et parcelles du cadastre', () => {
  const b = app.bienDepuisFicheAuthentic(bien);
  assert.equal(b.type, 'maison');
  assert.equal(b.adresse.texte, '3 chemin des Vignes 41350 VINEUIL');
  assert.equal(b.parcelles.map(x => x.section + x.numero).join(','), 'AB123,AB124');
});

test('dossiersDepuisRelevesAuthentic : pages regroupées par dossier ; parties retrouvées par l’intitulé', () => {
  const vendeur = JSON.parse(JSON.stringify(client));
  vendeur.champs.find(c => c.libelle === 'Nom de famille*').valeur = 'Martel';
  vendeur.champs.find(c => c.libelle === 'Prénom*').valeur = 'Alexandre';
  vendeur.champs.find(c => /naissanceDate/.test(c.libelle)).valeur = '02/06/1970';
  const releves = [
    { recueLe: '2026-10-02T09:00:00Z', capture: gestion },
    { recueLe: '2026-10-02T09:01:00Z', capture: vendeur },
    { recueLe: '2026-10-02T09:02:00Z', capture: client },
    { recueLe: '2026-10-02T09:02:30Z', capture: client },   // même fiche relevée deux fois
    { recueLe: '2026-10-02T09:03:00Z', capture: bien }
  ];
  const groupes = app.dossiersDepuisRelevesAuthentic(releves);
  assert.equal(groupes.length, 1);
  const ex = groupes[0].export;
  assert.equal(ex.intitule, 'Vente MARTEL / FOURNIER');
  assert.equal(ex.personnes.length, 2);
  assert.equal(ex.immeubles.length, 1);
  const parties = app.partiesExportAuthentic(ex);
  assert.equal(parties.map(p => `${p.nom}:${p.role}`).join(','), 'Alexandre MARTEL:VENDEUR,Camille FOURNIER:ACQUEREUR');
  assert.equal(parties[1].telephones.length, 2);
  assert.equal(app.bienExportAuthentic(ex).type, 'maison');
  // Pièces présentes : celles reçues dans Authentic (état civil, SAFER), jamais l'urbanisme.
  const presentes = app.piecesExportAuthentic(ex, app.checklistPieces('maison'));
  assert.equal(presentes.map(p => p.label).join(' | '), 'Acte de naissance de M. MARTEL Alexandre | Réponse SAFER');
  assert.ok(presentes.every(p => p.nouvelle));
});

test('piecesAuthenticAAppliquer : une fois par pièce, jamais déjà reçue ni retirée, jamais en participation', () => {
  const d = { id: 'v', nom: 'MARTEL / FOURNIER', typeVente: 'maison', pieces: {}, historique: [] };
  const pieces = app.piecesAuthenticAAppliquer(d, gestion);
  const cles = pieces.map(p => p.cle);
  assert.ok(cles.includes('perso-safer') && !cles.includes('certificatUrbanisme'), cles.join(','));
  const naissance = pieces.find(p => /naissance/i.test(p.label)).cle;
  // Déjà reprise une fois (puis décochée par l'étude) : plus reprise.
  assert.ok(!app.piecesAuthenticAAppliquer(Object.assign({}, d, { piecesAuthentic: [naissance] }), gestion).some(p => p.cle === naissance));
  // Retirée de la liste : rien.
  assert.ok(!app.piecesAuthenticAAppliquer(Object.assign({}, d, { piecesRetirees: [naissance] }), gestion).some(p => p.cle === naissance));
  assert.equal(app.piecesAuthenticAAppliquer(Object.assign({}, d, { roleNotaire: 'participant' }), gestion).length, 0);
});

// ---- Deuxième passe (étude, 02/10) : SAFER suivie, RHF, état de l'acte, prix, collaborateur,
// notaire, situation matrimoniale ----
const gestionAttente = {
  titre: 'Authentic',
  champs: [
    { groupe: '', libelle: '12 - Vente MARTEL/FOURNIER Importer', valeur: '' },
    { groupe: 'Acte', libelle: 'État de l’acte', valeur: 'En cours de rédaction' }
  ],
  tableaux: [
    { titre: '', entete: [], lignes: [['Notification SAFER', '', '10/09/2026', '15/09/2026', 'Prise en compte']] },
    { titre: '', entete: [], lignes: [['Réquisition hors formalité', '', '01/09/2026', '', 'Envoyée']] },
    { titre: '', entete: [], lignes: [['Livret de famille', '', '02/09/2026', '', 'Reçu'], ['Acte de décès de M. MARTEL Henri', '', '02/09/2026', '', 'Reçu']] }
  ],
  texte: '12 - Vente MARTEL/FOURNIER'
};
const finances = {
  titre: 'Authentic',
  champs: [
    { groupe: '', libelle: '12 - Vente MARTEL/FOURNIER', valeur: '' },
    { groupe: 'Informations financières', libelle: 'Capital', valeur: '245 000,00 €' }
  ],
  tableaux: [{ titre: 'Parties prenantes', entete: ['Rôle', 'Nom'], lignes: [['Notaire', 'Maître Sophie GOSSART'], ['Collaborateur', 'Julie VASSELIN']] }],
  texte: '12 - Vente MARTEL/FOURNIER'
};
const clientMarie = {
  titre: 'Authentic',
  champs: [
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:civilite:selectOneRadio', valeur: 'Monsieur' },
    { groupe: '', libelle: 'Nom de famille*', valeur: 'Martel' },
    { groupe: '', libelle: 'Prénom*', valeur: 'Alexandre' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:naissanceDate:naissanceDate', valeur: '02/03/1970' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneePrincipaleW1:Telephone:inputTelephone', valeur: '06 98 76 54 32' },
    { groupe: '', libelle: 'Email', valeur: 'alex.martel@exemple.fr' },
    { groupe: '', libelle: ID + 'tabView:situationFamiliale:somContratTypeId:selectonemenu_input', valeur: 'Sans contrat' },
    { groupe: '', libelle: ID + 'tabView:situationFamiliale:somContratRegimeId:selectonemenu_input', valeur: 'Communauté réduite aux acquêts' }
  ],
  tableaux: [{ titre: '', entete: ['Situation', 'Date', 'Conjoint'], lignes: [['Marié(e)', '12/06/2010', 'DUVAL Nadia']] }],
  texte: ''
};

test('suiviSaferAuthentic et suiviRhfAuthentic : notifiée, prise en compte, réponse ; RHF envoyée, retour', () => {
  // Ligne SAFER (étude, 02/10) : date de création, date d'ENVOI (départ du délai), puis l'état sans date.
  const sa = app.suiviSaferAuthentic(app.lignesDocumentsAuthentic(gestionAttente));
  assert.equal([sa.creeeLe, sa.envoyeeLe, sa.priseEnCompte, sa.priseEnCompteLe, sa.decision].join('|'), '2026-09-10|2026-09-15|oui||');
  assert.equal(app.echeanceSaferTacite(sa), '2026-11-15');
  const np = app.suiviSaferAuthentic(app.lignesDocumentsAuthentic(gestion));
  // Étude 14/10 : une ligne de décision à deux dates = envoi puis réponse (« envoyé le 10/08, non-préemption reçue le 13/10 »).
  assert.equal([np.decision, np.envoyeeLe, np.decisionLe].join('|'), 'non_preemption|2026-09-10|2026-09-25');
  // Ligne de réponse à une seule date : c'est la date de la décision.
  assert.equal(app.suiviSaferAuthentic([{ titre: 'Réponse SAFER non préemption', dates: ['2026-09-25'], etat: 'Reçu', texte: 'Réponse SAFER non préemption · 25/09/2026 · Reçu' }]).decisionLe, '2026-09-25');
  // Relevé d'avant cette règle (sans envoyeeLe) : sa « prise en compte » était l'envoi.
  assert.equal(app.echeanceSaferTacite({ notifieeLe: '2026-09-10', priseEnCompteLe: '2026-09-15' }), '2026-11-15');
  const rhf = app.suiviRhfAuthentic(app.lignesDocumentsAuthentic(gestionAttente));
  assert.equal([rhf.envoyeeLe, rhf.retourLe].join('|'), '2026-09-01|');
  const retour = app.suiviRhfAuthentic([{ titre: 'Réquisition hors formalité', dates: ['2026-09-01', '2026-09-12'], etat: 'Reçue', texte: 'Réquisition hors formalité · 01/09/2026 · 12/09/2026 · Reçue' }]);
  assert.equal(retour.retourLe, '2026-09-12');
  assert.equal(app.suiviRhfAuthentic(app.lignesDocumentsAuthentic(gestion)), null);
});

test('etatActeAuthentic, prixAuthentic, collaborateurAuthentic', () => {
  assert.equal(app.etatActeAuthentic(gestionAttente).etat, 'redaction');
  assert.equal(app.etatActeAuthentic({ champs: [{ groupe: 'Acte', libelle: 'État', valeur: 'Signé le 30/09/2026' }] }).date, '2026-09-30');
  // Étude, 03/10 : un mot avant « signé » ne vaut pas acte signé.
  assert.equal(app.etatActeAuthentic({ champs: [{ groupe: 'Acte', libelle: 'État', valeur: 'Acte signé le 30/09/2026' }] }), null);
  assert.equal(app.etatActeAuthentic({ champs: [{ groupe: 'Acte', libelle: 'État', valeur: 'Pas encore rédigé' }] }).etat, 'a_rediger');
  assert.equal(app.etatActeAuthentic(gestion), null);
  assert.equal(app.prixAuthentic(finances), 245000);
  assert.equal(app.collaborateurAuthentic(finances), 'Julie VASSELIN');
  // Hors « Parties prenantes », un nom de collaborateur ne compte pas.
  assert.equal(app.collaborateurAuthentic({ champs: [{ groupe: 'Notes', libelle: 'Note', valeur: 'appeler Julie VASSELIN' }] }), '');
});

test('livret de famille et acte de décès : seulement pour une succession', () => {
  const lignes = app.lignesDocumentsAuthentic(gestionAttente);
  const vente = app.piecesRecuesAuthentic(lignes, app.checklistPieces('maison'), 'vente').map(p => p.label);
  assert.ok(!vente.some(l => /livret|d[ée]c[èe]s/i.test(l)), vente.join(','));
  const succ = app.piecesRecuesAuthentic(lignes, app.checklistPieces('maison'), 'succession').map(p => p.label);
  assert.ok(succ.some(l => /livret/i.test(l)) && succ.some(l => /décès/i.test(l)), succ.join(','));
});

test('situationMatrimonialeAuthentic et alertes : vendeur marié dont le conjoint n’est pas partie', () => {
  const sm = app.situationMatrimonialeAuthentic(clientMarie);
  assert.equal([sm.situation, sm.date, sm.conjoint, sm.regime].join('|'), 'Marié(e)|2010-06-12|DUVAL Nadia|Communauté réduite aux acquêts');
  assert.match(app.libelleSituationMatrimoniale(sm), /^Marié\(e\) le .*2010 — Communauté réduite aux acquêts — conjoint : DUVAL Nadia$/);
  const alertes = app.alertesConjointAuthentic([{ nom: 'Alexandre MARTEL', role: 'VENDEUR', situationMatrimoniale: sm }]);
  assert.equal(alertes.length, 1);
  assert.match(alertes[0].texte, /résidence de la famille/);
  // Conjoint partie à la vente : rien.
  assert.equal(app.alertesConjointAuthentic([{ nom: 'Alexandre MARTEL', role: 'VENDEUR', situationMatrimoniale: sm }, { nom: 'Nadia DUVAL', role: 'VENDEUR' }]).length, 0);
  // Célibataire, ou acquéreur : rien.
  assert.equal(app.alertesConjointAuthentic([{ nom: 'X', role: 'VENDEUR', situationMatrimoniale: { situation: 'Célibataire' } }, { nom: 'Y', role: 'ACQUEREUR', situationMatrimoniale: sm }]).length, 0);
});

test('appliquerReleveSurDossier : SAFER notifiée sans réponse → « Réponse SAFER » manquante, une fois ; infos gardées', () => {
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', typeVente: 'maison', pieces: {}, historique: [] };
  const r = app.appliquerReleveSurDossier(d, gestionAttente, '2026-10-02T10:00:00.000Z');
  assert.ok(r.modifie);
  assert.equal(d.pieces['perso-safer'], 'manquante');
  assert.ok(d.piecesPersonnalisees.some(p => p.cle === 'perso-safer' && p.label === 'Réponse SAFER'));
  assert.equal(d.authentic.safer.envoyeeLe, '2026-09-15');
  assert.equal(d.authentic.acte.etat, 'redaction');
  assert.equal(d.authentic.rhf.envoyeeLe, '2026-09-01');
  assert.equal(app.suiviSaferPiece(d), 'envoyée le 15 septembre 2026, prise en compte, sans réponse : non-préemption le 15 novembre 2026 (2 mois)');
  const n = d.historique.length;
  // Même page relue : rien de nouveau.
  app.appliquerReleveSurDossier(d, gestionAttente, '2026-10-02T10:05:00.000Z');
  assert.equal(d.historique.length, n);
  assert.equal(d.piecesPersonnalisees.filter(p => p.cle === 'perso-safer').length, 1);
  // Réponse arrivée : la pièce est cochée reçue « dans Authentic ».
  const r2 = app.appliquerReleveSurDossier(d, gestion, '2026-10-03T10:00:00.000Z');
  assert.ok(r2.pieces.some(p => p.cle === 'perso-safer'));
  assert.equal(d.pieces['perso-safer'], 'recue');
  assert.equal(d.authentic.safer.decision, 'non_preemption');
  // Participation : jamais de pièce ajoutée.
  const p = { id: 'b', nom: 'MARTEL / FOURNIER', typeVente: 'maison', roleNotaire: 'participant', pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(p, gestionAttente);
  assert.ok(!(p.piecesPersonnalisees || []).length);
});

test('appliquerReleveSurDossier : prix (Capital) ; collaborateur gardé ; le notaire n’est plus repris (étude 07/10)', () => {
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', typeVente: 'maison', responsable: 'Bastien ANGLUMENT', pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(d, finances);
  assert.equal(d.prixVente, 245000);
  assert.equal(d.authentic.collaborateur, 'Julie VASSELIN');
  const lignes = app.lignesAuthenticDossier(d).map(l => l.libelle + ' = ' + l.valeur).join('\n');
  assert.match(lignes, /Collaborateur = Julie VASSELIN — fiche : Bastien ANGLUMENT/);
  assert.doesNotMatch(lignes, /Notaire/);
  assert.strictEqual(d.authentic.notaire, undefined);
  const e = { id: 'b', nom: 'MARTEL / FOURNIER', typeVente: 'maison', prixVente: 250000, pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(e, finances);
  // Authentic fait foi (étude 06/10) : le prix de la fiche (250 000) est remplacé par le Capital d'Authentic, l'ancien dit dans l'historique.
  assert.equal(e.prixVente, 245000);
  assert.match(e.historique.map(h => h.texte).join('\n'), /Prix de vente repris d’Authentic \(Capital\) : 245\.000,00.€ \(avant : 250\.000,00.€\)/);
  const nbHistPrix = e.historique.length;
  app.appliquerReleveSurDossier(e, finances);
  assert.equal(e.historique.length, nbHistPrix, 'relu : rien à redire');
});

test('appliquerReleveSurDossier : fiche client → téléphone, email, situation matrimoniale de la bonne partie', () => {
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', typeVente: 'maison', telephoneAcquereur: '0612345678', pieces: {}, historique: [] };
  // FOURNIER = acquéreur d'après le nom du dossier ; Authentic d'abord (étude 06/10 au soir) : ses numéros remplacent ceux de la fiche.
  app.appliquerReleveSurDossier(d, client);
  assert.equal(d.telephoneAcquereur, '06 12 34 56 78 / 02 54 00 00 01');
  assert.equal(d.emailAcquereur, 'camille.fournier@exemple.fr');
  app.appliquerReleveSurDossier(d, clientMarie);
  assert.equal(d.telephoneVendeur, '06 98 76 54 32');
  assert.equal(d.emailVendeur, 'alex.martel@exemple.fr');
  assert.equal(d.authentic.personnes.find(p => p.role === 'VENDEUR').situationMatrimoniale.conjoint, 'DUVAL Nadia');
  assert.equal(app.alertesConjointDossier(d).length, 1);
  // Une personne dont le côté n'est pas reconnu n'est jamais reprise d'office : elle attend « à
  // rattacher » (vendeur, acquéreur ou écartée d'un clic).
  const autre = { id: 'c', nom: 'LEROY / DURAND', pieces: {}, historique: [] };
  assert.equal(app.appliquerReleveSurDossier(autre, client).modifie, true);
  assert.ok(!autre.emailAcquereur && !autre.emailVendeur && !autre.telephoneAcquereur);
  assert.equal(autre.authentic.clientsAPlacer.map(c => c.nom).join(','), 'Camille FOURNIER');
  assert.equal(app.authenticPersistable(autre.authentic).clientsAPlacer[0].emails.join(','), 'camille.fournier@exemple.fr');
  autre.authentic.clientsEcartes = ['Camille FOURNIER'];
  delete autre.authentic.clientsAPlacer;
  assert.equal(app.appliquerReleveSurDossier(autre, client).modifie, false);
});

test('fiche client : épouse sous son propre nom rattachée par les comparants du sous-dossier ; emails groupés « ; »', () => {
  // « VTE MARCHAIS / LEBON » : M MARCHAIS et Mme BERTIN, mariés, vendent — les comparants du sous-dossier le disent (étude 09/10).
  const comparants = [{ nom: 'MARCHAIS Paul', role: 'VENDEUR' }, { nom: 'BERTIN Odile', role: 'VENDEUR' }, { nom: 'LEBON Marc', role: 'ACQUEREUR' }];
  const d = { id: 'm', nom: 'MARCHAIS / LEBON', typeVente: 'maison', pieces: {}, historique: [], authentic: { comparants } };
  const epouse = {
    titre: 'Authentic',
    champs: [
      { groupe: '', libelle: 'Nom de famille*', valeur: 'Bertin' },
      { groupe: '', libelle: 'Prénom*', valeur: 'Odile' },
      { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:naissanceDate:naissanceDate', valeur: '08/09/1968' },
      { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneePrincipaleW1:Telephone:inputTelephone', valeur: '06 11 22 33 44' },
      { groupe: '', libelle: 'Email', valeur: 'odile.bertin@exemple.fr;famille.marchais@exemple.fr' }
    ],
    tableaux: [{ titre: '', entete: ['Situation', 'Date', 'Conjoint'], lignes: [['Marié(e)', '20/05/1995', 'MARCHAIS Paul']] }],
    texte: ''
  };
  assert.equal(app.clientDepuisFicheAuthentic(epouse).emails.join(','), 'odile.bertin@exemple.fr,famille.marchais@exemple.fr');
  app.appliquerReleveSurDossier(d, epouse);
  assert.equal(d.telephoneVendeur, '06 11 22 33 44');
  assert.equal(d.emailVendeur, 'odile.bertin@exemple.fr; famille.marchais@exemple.fr');
  assert.ok(!d.authentic.clientsAPlacer);
  // Le mari ensuite : son adresse s'ajoute, l'adresse commune n'est pas répétée.
  const mari = { titre: 'Authentic', champs: [
    { groupe: '', libelle: 'Nom de famille*', valeur: 'Marchais' },
    { groupe: '', libelle: 'Prénom*', valeur: 'Paul' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:naissanceDate:naissanceDate', valeur: '03/04/1965' },
    { groupe: '', libelle: 'Email', valeur: 'paul.marchais@exemple.fr ; famille.marchais@exemple.fr' }
  ], tableaux: [], texte: '' };
  app.appliquerReleveSurDossier(d, mari);
  assert.equal(d.emailVendeur, 'odile.bertin@exemple.fr; famille.marchais@exemple.fr; paul.marchais@exemple.fr');
  // Conjoint qui n'est pas comparant (la vendeuse est seule propriétaire), ou comparants pas encore relevés : rien n'est ajouté.
  const seule = { id: 's', nom: 'MARCHAIS / LEBON', typeVente: 'maison', pieces: {}, historique: [], parties: [{ nom: 'Paul MARCHAIS', role: 'VENDEUR' }],
    authentic: { comparants: [{ nom: 'MARCHAIS Paul', role: 'VENDEUR' }, { nom: 'LEBON Marc', role: 'ACQUEREUR' }] } };
  app.appliquerReleveSurDossier(seule, epouse);
  assert.equal(seule.parties.map(p => p.nom).join(','), 'Paul MARCHAIS');
  assert.ok(!seule.telephoneVendeur);
  const sansComparants = { id: 't', nom: 'MARCHAIS / LEBON', typeVente: 'maison', pieces: {}, historique: [], parties: [{ nom: 'Paul MARCHAIS', role: 'VENDEUR' }] };
  app.appliquerReleveSurDossier(sansComparants, epouse);
  assert.equal(sansComparants.parties.length, 1);
  // Un conjoint présent des deux côtés, ou absent du dossier : rien n'est deviné.
  const ailleurs = { id: 'n', nom: 'DURAND / MOREAU', pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(ailleurs, epouse);
  assert.ok(!ailleurs.emailVendeur && !ailleurs.emailAcquereur);
});

test('emailsDepuisTexte et destinatairesEmail : envoi groupé', () => {
  assert.equal(app.emailsDepuisTexte('a@x.fr;b@y.fr').join('|'), 'a@x.fr|b@y.fr');
  assert.equal(app.emailsDepuisTexte(' a@x.fr ; A@X.fr , <c@z.fr> pas-un-email ').join('|'), 'a@x.fr|c@z.fr');
  assert.equal(app.emailsDepuisTexte('').length, 0);
  assert.equal(app.destinatairesEmail('a@x.fr; b@y.fr').join(', '), 'a@x.fr, b@y.fr');
});

test('création depuis les pages : infos agrégées, prix repris, SAFER attendue ; persistance', () => {
  const releves = [
    { recueLe: '2026-10-02T09:00:00Z', capture: gestionAttente },
    { recueLe: '2026-10-02T09:01:00Z', capture: finances }
  ];
  const g = app.dossiersDepuisRelevesAuthentic(releves)[0];
  const infos = g.export.infosAuthentic;
  assert.equal(infos.prix, 245000);
  assert.equal(infos.collaborateur, 'Julie VASSELIN');
  assert.equal(infos.safer.envoyeeLe, '2026-09-15');
  const dossier = { pieces: {}, piecesPersonnalisees: [] };
  app.infosAuthenticACreation(dossier, infos);
  assert.equal(dossier.pieces['perso-safer'], 'manquante');
  const persiste = app.authenticPersistable(Object.assign({}, dossier.authentic, { inconnu: 'x' }));
  assert.equal(persiste.prix, 245000);
  assert.equal(persiste.inconnu, undefined);
  assert.equal(persiste.saferPieceAjoutee, true);
});

// Rubriques affichées en texte seul (étude, 02/10 : « Informations financières » et « Parties
// prenantes », sous les vendeurs et acquéreurs, absentes de la copie de structure).
const texteDossier = `12 - Vente MARTEL/FOURNIER
Comparants (3)
M. MARTEL Alexandre et Mme MARTEL Nadia
Vendeur
Mme FOURNIER Camille
Acquéreur
Informations financières
Capital
245 000,00 €
Parties prenantes
Notaire
Maître Sophie GOSSART
Collaborateur
Julie VASSELIN
Immeubles (1)
Martel
Julie
Tél. 06 12 34 56 78 camille@exemple.fr
Réquisition hors formalité envoyée le 01/09/2026 Retour le 14/09/2026`;

test('texte seul : prix (Capital) et collaborateur des parties prenantes', () => {
  const cap = { champs: [], tableaux: [], texte: texteDossier };
  assert.equal(app.prixAuthentic(cap), 245000);
  assert.equal(app.prixAuthentic({ texte: 'Capital : 312 500,00 €' }), 312500);
  assert.equal(app.collaborateurAuthentic(cap), 'Julie VASSELIN');
  // Un collaborateur nommé hors de la rubrique ne compte pas.
  assert.equal(app.collaborateurAuthentic({ texte: 'Notes\nappeler Julie VASSELIN' }), '');
});

test('structure copiée : texte visible réduit à son vocabulaire, aucun nom ne sort', () => {
  const lignes = app.texteVocabulaireAuthentic(texteDossier);
  const tout = lignes.join('\n');
  assert.ok(lignes.includes('Informations financières') && lignes.includes('Parties prenantes') && lignes.includes('Collaborateur'), tout);
  assert.ok(lignes.includes('[montant]'), tout);
  assert.match(tout, /Réquisition hors formalité envoyée le \[date\] Retour le \[date\]/);
  for (const nom of ['MARTEL', 'Martel', 'FOURNIER', 'Camille', 'Alexandre', 'Nadia', 'Sophie', 'GOSSART', 'Julie', 'VASSELIN', 'camille', '06 12']) {
    assert.ok(!tout.includes(nom), nom + ' est sorti :\n' + tout);
  }
  assert.ok(!app.structureCaptureAuthentic({ titre: 'Authentic', champs: [], tableaux: [], texte: texteDossier }).match(/MARTEL|Julie|GOSSART/));
});

test('« Retour le … » : prise en compte de la SAFER, retour de la RHF', () => {
  const rhf = app.suiviRhfAuthentic([{ titre: 'Réquisition hors formalité', dates: ['2026-09-01'], etat: 'Retour le 14/09/2026', texte: 'Réquisition hors formalité · 01/09/2026 · Retour le 14/09/2026' }]);
  assert.equal(rhf.retourLe, '2026-09-14');
  const sa = app.suiviSaferAuthentic([{ titre: 'Notification SAFER', dates: ['2026-09-10'], etat: 'Retour le 15/09/2026', texte: 'Notification SAFER · 10/09/2026 · Retour le 15/09/2026' }]);
  assert.equal(sa.priseEnCompteLe, '2026-09-15');
});

test('« signé le … » sur la page du dossier : acte signé ; jamais pour l’avant-contrat ou une procuration', () => {
  assert.equal(JSON.stringify(app.etatActeAuthentic({ texte: '12 - Vente MARTEL/FOURNIER\nSigné le 30/09/2026' })), '{"etat":"signe","libelle":"Acte signé","date":"2026-09-30"}');
  assert.equal(app.etatActeAuthentic({ tableaux: [{ entete: [], lignes: [['Acte de vente', '', '30/09/2026', '', 'Signé électroniquement le 30/09/2026']] }] }).date, '2026-09-30');
  assert.equal(app.etatActeAuthentic({ texte: 'Compromis signé le 12/06/2026\nProcuration signée le 20/09/2026' }), null);
  assert.equal(app.etatActeAuthentic({ texte: 'Compromis signé le 12/06/2026\nActe en cours de rédaction' }).etat, 'redaction');
  // Étude, 03/10 : « la forme exacte est "Signé le 03/10/2026" ; "Mail version signée le 28/07/2026" : pas bon ».
  assert.equal(app.etatActeAuthentic({ tableaux: [{ entete: [], lignes: [['Mail version signée le 28/07/2026', '', '28/07/2026', '', 'Envoyé']] }] }), null);
  assert.equal(app.etatActeAuthentic({ texte: 'Mail version signée le 28/07/2026' }), null);
  assert.equal(app.etatActeAuthentic({ tableaux: [{ entete: [], lignes: [['Acte de vente', '', '03/10/2026', '', 'Signé le 03/10/2026']] }] }).date, '2026-10-03');
  assert.equal(app.etatActeAuthentic({ tableaux: [{ entete: [], lignes: [['Acte de vente', '', '03/10/2026', '', 'Projet signé le 03/10/2026']] }] }), null);
  // Passage de « en cours de rédaction » à « signé » : noté dans l'historique.
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', typeVente: 'maison', pieces: {}, historique: [], authentic: { acte: { etat: 'redaction', libelle: 'En cours de rédaction' } } };
  app.appliquerReleveSurDossier(d, { champs: [], tableaux: [], texte: '12 - Vente MARTEL/FOURNIER\nSigné le 30/09/2026' });
  assert.equal(d.authentic.acte.etat, 'signe');
  assert.ok(d.historique.some(h => h.texte === 'Acte dans Authentic : Acte signé le 30 septembre 2026'), d.historique.map(h => h.texte).join('\n'));
  // « Marque-le comme fait » : signature et étapes d'avant faites, plus rien au planning.
  assert.equal(d.echeancesValidees.rendezVousSignature, true);
  assert.equal(d.echeancesValidees.appelFonds, true);
  assert.ok(d.historique.some(h => /^Signature de l’acte marquée réalisée \(acte signé dans Authentic le 30 septembre 2026\)$/.test(h.texte)));
  const avecDates = { id: 'b', nom: 'MARTEL / FOURNIER', typeVente: 'maison', pieces: {}, historique: [], pret: '2026-09-01', acte: '2026-10-15', rendezVousSignature: '2026-09-30', offrePretStatut: 'recue' };
  assert.ok(app.echeancesPlanning(avecDates).length > 0);
  app.appliquerReleveSurDossier(avecDates, { champs: [], tableaux: [], texte: 'Signé le 30/09/2026' });
  assert.equal(app.echeancesPlanning(avecDates).length, 0);
  // Relu : rien de plus.
  const n = avecDates.historique.length;
  app.appliquerReleveSurDossier(avecDates, { champs: [], tableaux: [], texte: 'Signé le 30/09/2026' });
  assert.equal(avecDates.historique.length, n);
});

test('« Consorts » devant le vendeur ou l’acquéreur : même dossier, avec ou sans majuscule ni s', () => {
  const dossiers = [{ id: 'a', nom: 'MARTEL / FOURNIER' }, { id: 'b', nom: 'Consorts LEROY / DURAND' }];
  assert.equal(app.dossierPourIntituleAuthentic('Vente Consorts MARTEL/FOURNIER', dossiers).id, 'a');
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL / consort FOURNIER', dossiers).id, 'a');
  assert.equal(app.dossierPourIntituleAuthentic('Vente CONSORTS MARTEL/CONSORTS FOURNIER', dossiers).id, 'a');
  assert.equal(app.dossierPourIntituleAuthentic('Vente LEROY/DURAND', dossiers).id, 'b');
  // Le mot seul ne suffit pas : les noms doivent rester les mêmes.
  assert.equal(app.dossierPourIntituleAuthentic('Vente Consorts MARTIN/FOURNIER', dossiers), null);
  // Intitulé lu sur la page et rôles des fiches client.
  assert.equal(app.intituleDossierAuthentic({ champs: [], texte: '12 - Vente Consorts MARTEL/FOURNIER\nComparants' }), 'Vente Consorts MARTEL / FOURNIER');
  assert.equal(app.roleClientAuthenticDansDossier({ nom: 'Consorts MARTEL / FOURNIER' }, { nom: 'MARTEL', prenom: 'Alexandre' }), 'VENDEUR');
});

test('état civil : « APR » (demande papier) jamais coché, « ECV » (état civil virtuel) reçu', () => {
  const r = app.piecesRecuesAuthentic([
    { titre: 'APR Acte de naissance de M. MARTEL Alexandre', date: '2026-09-02', etat: '', texte: 'APR Acte de naissance de M. MARTEL Alexandre · 02/09/2026' },
    { titre: 'APR - Acte de mariage', date: '2026-09-02', etat: 'Reçu', texte: 'APR - Acte de mariage · 02/09/2026 · Reçu' },
    { titre: 'ECV Acte de naissance de Mme FOURNIER Camille', date: '2026-09-04', etat: 'Reçu', texte: 'ECV Acte de naissance de Mme FOURNIER Camille · 04/09/2026 · Reçu' }
  ], []);
  assert.equal(r.map(x => x.label).join(' | '), 'Acte de naissance de Mme FOURNIER Camille');
  // « Après » ou un mot qui commence par « apr » n'est pas « APR ».
  assert.equal(app.ligneAuthenticRecue({ titre: 'Après-vente : acte de naissance', etat: '' }), true);
});

test('rapprochement par score : noms des parties + adresse du bien (deux ventes en même temps)', () => {
  const vignes = { id: 'v', nom: 'MARTEL / FOURNIER', adresseBien: 'VINEUIL (41350), 3 chemin des Vignes' };
  const lilas = { id: 'l', nom: 'MARTEL / FOURNIER', adresseBien: 'BLOIS (41000), 8 rue des Lilas' };
  // Mêmes noms, deux dossiers en cours : sans adresse, rien n'est choisi ; l'adresse de la page tranche.
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/FOURNIER', [vignes, lilas]), null);
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/FOURNIER', [vignes, lilas], '41000 BLOIS 8 rue des Lilas').id, 'l');
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/FOURNIER', [vignes, lilas], '41350 VINEUIL Chemin des Vignes').id, 'v');
  // Un seul dossier, mais la page montre un autre bien (autre code postal) : pas ce dossier-là.
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/FOURNIER', [vignes], '37000 TOURS 12 rue Nationale'), null);
  // Un seul dossier, adresse absente de la page : les deux noms suffisent.
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/FOURNIER', [vignes], '').id, 'v');
  // Un nom proche (« FOURNIER-DUPONT ») et la voie : retenu ; le nom proche seul : non.
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/FOURNIER-DUPONT', [vignes], '41350 VINEUIL 3 chemin des Vignes').id, 'v');
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/FOURNIER-DUPONT', [vignes]), null);
  // L'adresse seule ne suffit jamais.
  assert.equal(app.dossierPourIntituleAuthentic('Vente LEROY/DURAND', [vignes], '41350 VINEUIL 3 chemin des Vignes'), null);
  // Le score s'explique.
  const s = app.scoreDossierAuthentic('Vente MARTEL/FOURNIER', '41000 BLOIS 8 rue des Lilas', lilas);
  assert.match(s.details.join(', '), /vendeur identique \(\+3\), acquéreur identique \(\+3\), code postal \(\+1\), adresse \(blois lilas\) \(\+4\), numéro \(\+1\)/);
  // Adresse lue sur la page de gestion, rubrique « Immeubles (n) ».
  assert.equal(app.adresseBienPageAuthentic({ champs: [], texte: '12 - Vente MARTEL/FOURNIER\nComparants (3)\nM. MARTEL\nImmeubles (1)\n41000 BLOIS\n8 rue des Lilas\nDocuments' }), '41000 BLOIS 8 rue des Lilas');
});


test('SAFER : 2 mois de base, réponse rapide / très rapide cochées sur la fiche, puis non-préemption tacite une fois', () => {
  assert.equal(app.echeanceSaferTacite({ notifieeLe: '2026-09-10', priseEnCompteLe: '2026-09-15' }), '2026-11-15');
  assert.equal(app.echeanceSaferTacite({ notifieeLe: '2026-09-10', delaiManuel: 'rapide' }), '2026-10-10');
  assert.equal(app.echeanceSaferTacite({ notifieeLe: '2026-09-10', priseEnCompteLe: '2026-09-12', delaiManuel: 'tres_rapide' }), '2026-09-20');
  // L'intitulé d'Authentic ne choisit jamais le délai : 2 mois tant que rien n'est coché.
  const lignes = [{ titre: 'Notification SAFER réponse très rapide', dates: ['2026-09-10'], etat: 'Pris en compte', texte: 'Notification SAFER réponse très rapide · 10/09/2026 · Pris en compte' }];
  const sa = app.suiviSaferAuthentic(lignes);
  assert.equal(sa.priseEnCompte, 'oui');
  assert.equal(app.echeanceSaferTacite(sa), '2026-11-10');
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', typeVente: 'maison', pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(d, { champs: [{ libelle: '12 - Vente MARTEL/FOURNIER', valeur: '' }], tableaux: [{ entete: [], lignes: [['Notification SAFER réponse très rapide', '', '10/09/2026', '', 'Pris en compte']] }], texte: '' }, '2026-09-15T09:00:00Z');
  assert.equal(d.pieces['perso-safer'], 'manquante');
  assert.equal(app.appliquerSaferTacite(d, '2026-09-21'), false);
  // « Très rapide » coché : 10/09 + 8 jours = 18/09, déjà écoulé le 21 → non-préemption, pièce cochée.
  assert.equal(app.changerDelaiSaferDossier(d, 'tres_rapide', '2026-09-21', '2026-09-21T08:00:00Z'), true);
  assert.equal(d.pieces['perso-safer'], 'recue');
  assert.equal(d.authentic.safer.decision, 'non_preemption');
  assert.match(app.suiviSaferPiece(d), /non-préemption \(délai écoulé\) le 18 septembre 2026/);
  assert.match(d.historique[d.historique.length - 1].texte, /délai écoulé le 18 septembre 2026 sans réponse \(8 jours, réponse très rapide\) — non-préemption/);
  assert.equal(app.appliquerSaferTacite(d, '2026-09-30'), false);
  // Case décochée : retour à 2 mois, le délai court encore → non-préemption retirée, pièce rendue manquante.
  assert.equal(app.changerDelaiSaferDossier(d, 'normal', '2026-09-21', '2026-09-21T08:05:00Z'), true);
  assert.equal(d.authentic.safer.decision, '');
  assert.equal(d.pieces['perso-safer'], 'manquante');
  assert.equal(app.echeanceSaferDossier(d), '2026-11-10');
  assert.equal(app.saferLevee(d), false);
  assert.ok(app.renderDelaiSafer(d).includes('safer-rapide-a'));
});

test('SAFER en attente : date butoir du planning, pas de « Fixer le rendez-vous », créneaux après le délai', () => {
  const base = { id: 'b', nom: 'DUPONT / MARTIN', typeVente: 'maison', sansPret: true, acte: '2026-12-20', pieces: { renonciationPreemption: 'recue' },
    piecesPersonnalisees: [{ cle: 'perso-safer', label: 'Réponse SAFER' }], authentic: { safer: { notifieeLe: '2026-09-01', priseEnCompteLe: '2026-09-05' } } };
  base.pieces['perso-safer'] = 'manquante';
  const types = app.echeancesPlanning(base).map(e => `${e.type}:${e.iso}`).join(',');
  assert.equal(types, 'safer:2026-11-05');
  // Comme la renonciation de la mairie : levée → « Fixer le rendez-vous » revient.
  const levee = Object.assign({}, base, { authentic: { safer: Object.assign({}, base.authentic.safer, { decision: 'non_preemption' }) } });
  assert.equal(app.echeancesPlanning(levee).map(e => e.type).join(','), 'fixerRdv');
  // Sans date connue : attente sans date, ancrée sur la date butoir par le filet de sécurité.
  const sansDate = Object.assign({}, base, { authentic: { safer: { priseEnCompte: 'oui' } } });
  assert.equal(app.echeancesPlanning(sansDate).map(e => `${e.type}:${e.iso}`).join(','), 'safer:2026-12-20');
  // Probabilité : rendez-vous avant la fin du délai → gros retrait.
  const p = app.probabiliteTenueSignature(Object.assign({}, base, { rendezVousSignature: '2026-11-03' }), '2026-10-01', []);
  assert.ok(p.facteurs.some(f => /Délai SAFER jusqu’au 5 novembre 2026, après le rendez-vous/.test(f.libelle) && f.retrait === 40));
  // Semaine probable et créneaux proposés : au plus tôt le lendemain du délai.
  const s = app.semaineProbableSignature(base, '2026-10-01', []);
  assert.equal(s.date, '2026-11-06');
  assert.match(s.raison, /délai SAFER/);
  const c = app.creneauxProposesSignature(base, [], [], '2026-10-01', 1);
  assert.ok(c[0].date >= '2026-11-06', c[0].date);
  // Participation : la SAFER ne retient rien.
  assert.equal(app.saferLevee(Object.assign({}, base, { roleNotaire: 'participant' })), true);
  // Tableau de bord : « Réponse SAFER attendue » à la place de « Fixer le rendez-vous ».
  const av = app.actionsDuJour([Object.assign({}, base, { responsable: 'Bastien ANGLUMENT' })], '2026-10-01').aVenir.map(x => `${x.titre} — ${x.detail}`).join(' | ');
  assert.match(av, /Réponse SAFER attendue — Achat comptant · délai SAFER jusqu’au/);
  assert.doesNotMatch(av, /Fixer le rendez-vous/);
});

test('état civil Comedec : en attente / négatif non cochés avec leur état, positif coché', () => {
  const page = (etat) => ({ champs: [{ libelle: '12 - Vente MARTEL/FOURNIER', valeur: '' }], tableaux: [{ entete: [], lignes: [['ECV Acte de naissance de M. MARTEL Alexandre', '', '03/09/2026', '', etat]] }], texte: '' });
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', typeVente: 'maison', pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(d, page('Pris en compte'), '2026-09-04T09:00:00Z');
  const cle = d.piecesPersonnalisees[0].cle;
  assert.equal(d.pieces[cle], 'manquante');
  assert.equal(app.etatAuthenticPiece(d, { cle, label: 'x' }).texte, 'Comedec : pris en compte, en attente');
  app.appliquerReleveSurDossier(d, page('Négatif'), '2026-09-06T09:00:00Z');
  assert.equal(d.pieces[cle], 'manquante');
  assert.equal(app.etatAuthenticPiece(d, { cle, label: 'x' }).classe, 'dl-urgent');
  assert.ok(d.historique.some(h => /Comedec négatif/.test(h.texte)));
  app.appliquerReleveSurDossier(d, page('Positif'), '2026-09-09T09:00:00Z');
  assert.equal(d.pieces[cle], 'recue');
  assert.equal(app.etatAuthenticPiece(d, { cle, label: 'x' }).texte, 'Comedec : positif');
  // Positif et coché : relu, rien ne change.
  const n = d.historique.length;
  app.appliquerReleveSurDossier(d, page('Positif'), '2026-09-10T09:00:00Z');
  assert.equal(d.historique.length, n);
});

test('demandes d’alignement, de numérotage et DIA : jamais cochées, « Demande envoyée le … » sous la pièce', () => {
  const lignes = [
    { titre: 'Demande de certificat d’alignement', date: '2026-09-01', etat: 'Envoyé', texte: '' },
    { titre: 'Courrier certificat de numérotage', date: '2026-09-02', etat: '', texte: '' },
    { titre: 'Déclaration d’intention d’aliéner', date: '2026-09-03', etat: 'En attente', texte: '' }
  ];
  const dm = app.demandesUrbanismeAuthentic(lignes);
  assert.equal(Object.keys(dm).sort().join(','), 'certificatAlignement,certificatNumerotage,renonciationPreemption');
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', typeVente: 'maison', pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(d, { champs: [{ libelle: '12 - Vente MARTEL/FOURNIER', valeur: '' }], tableaux: [{ entete: [], lignes: lignes.map(l => [l.titre, '', l.date.split('-').reverse().join('/'), '', l.etat]) }], texte: '' }, '2026-09-05T09:00:00Z');
  assert.ok(!d.pieces.certificatAlignement);
  assert.equal(app.etatAuthenticPiece(d, { cle: 'certificatAlignement', label: 'Certificat d’alignement' }).texte, 'Demande envoyée le 1 septembre 2026');
  assert.equal(app.etatAuthenticPiece(d, { cle: 'renonciationPreemption', label: 'x' }).texte, 'DIA envoyée le 3 septembre 2026');
  // Reçue ensuite (NAS) : la mention s'efface.
  d.pieces.certificatAlignement = 'recue';
  assert.equal(app.etatAuthenticPiece(d, { cle: 'certificatAlignement', label: 'x' }), null);
});

test('coordonneesPartiesDossier : email et téléphone par partie ; « par son notaire » si un confrère la représente', () => {
  const c = app.coordonneesPartiesDossier({ emailVendeur: 'v@ex.fr', telephoneVendeur: '0601020304', emailAcquereur: '', telephoneAcquereur: '' });
  assert.equal(c.map(x => `${x.libelle}:${x.email}:${x.tel}:${x.parNotaire}`).join('|'), 'Vendeur:v@ex.fr:0601020304:false|Acquéreur:::false');
});

test('champsCoordonneesPartie : pas de champ téléphone pour une partie représentée par un autre office (sauf numéro déjà saisi)', () => {
  const d = { id: 'dt', notaireAcquereur: 'Maître Paul MARTIN (BLOIS)', notaireVendeur: 'Maître Sophie GOSSART (BLOIS)', emailVendeur: '', telephoneVendeur: '', emailAcquereur: '', telephoneAcquereur: '' };
  const html = (dossier) => app.coordonneesPartiesDossier(dossier).map(c => app.champsCoordonneesPartie(dossier, c, 'x')).join('|');
  const [vendeur, acquereur] = html(d).split('|');
  assert.match(vendeur, /coord-tel/, 'vendeur pour lequel l\'étude instrumente : champ téléphone');
  assert.doesNotMatch(acquereur, /coord-tel/, 'acquéreur représenté par son notaire : pas de téléphone');
  assert.match(acquereur, /Par son notaire/);
  assert.match(html(Object.assign({}, d, { telephoneAcquereur: '0601020304' })).split('|')[1], /0601020304/, 'un numéro déjà saisi reste visible');
});

test('succession depuis Authentic : intitulé reconnu, parties sans qualité devinée, biens, rien d’une vente', () => {
  const gestionSucc = {
    titre: 'Authentic',
    champs: [{ groupe: '', libelle: '15 - Succession DUPONT Jean Importer avec 2e SENSComparants (2)', valeur: '' }],
    tableaux: [{ titre: '', entete: [], lignes: [['ECV Acte de décès de M. DUPONT Jean', '', '03/09/2026', '', 'Positif']] }],
    texte: '15 - Succession DUPONT Jean\nComparants'
  };
  const heritier = JSON.parse(JSON.stringify(client));
  heritier.champs.find(c => c.libelle === 'Nom de famille*').valeur = 'Dupont';
  heritier.champs.find(c => c.libelle === 'Prénom*').valeur = 'Marie';
  assert.equal(app.intituleDossierAuthentic(gestionSucc), 'Succession DUPONT Jean');
  assert.equal(app.typePageAuthentic(gestionSucc), 'gestion');
  const g = app.dossiersDepuisRelevesAuthentic([
    { recueLe: '2026-10-02T09:00:00Z', capture: gestionSucc },
    { recueLe: '2026-10-02T09:01:00Z', capture: heritier },
    { recueLe: '2026-10-02T09:02:00Z', capture: bien }
  ])[0].export;
  assert.equal(app.typeAffaireAuthentic(g), 'succession');
  const parties = app.partiesSuccessionDepuisAuthentic(g);
  assert.equal(parties.map(p => `${p.nom}:${p.role}`).join('|'), 'Marie DUPONT:PARTIE');
  assert.equal(parties[0].telephones[0], '06 12 34 56 78');
  const biens = app.biensDepuisAuthentic(g);
  assert.equal(biens.length, 1);
  assert.match(biens[0].adresse, /VINEUIL \(41350\), 3 chemin des Vignes/);
  const e = app.completerExtractionDepuisAuthentic(app.construireExtractionRegex('', '', [], ''), g);
  assert.equal(e.champs.nom.valeur, 'DUPONT Jean');
  // Le dossier de succession : son propre déroulé (étude 15/10) et ses pièces, rien des emails d'une vente.
  const d = { id: 's', nom: 'DUPONT Jean', typeAffaire: 'succession', sansPret: true, parties, biens, pieces: {}, piecesPersonnalisees: [{ cle: 'perso-deces', label: 'Acte de décès de M. DUPONT Jean' }] };
  assert.equal(app.echeancesPlanning(d).length, 0);
  assert.equal(app.echeancesPlanning(Object.assign({}, d, { rendezVousSignature: '2026-11-05' })).map(x => x.type).join(','), 'notoriete');
  assert.equal(app.checklistPieces('maison', d).map(p => p.cle).join(','), 'acteDeces,livretFamille,actesNaissance,acteMariage,fcddv,titrePropriete,ehf,estimationImmobilier,estimationVehicules,carteGrise,perso-deces');
  assert.equal(app.echangesSelonStade(d, '2026-10-02').utiles.length + app.echangesSelonStade(d, '2026-10-02').autres.length, 0);
  assert.equal(app.dossiersAPlacer([d]).length, 0);
  assert.equal(app.libelleDossierAffiche(d), 'SUCC - DUPONT Jean');
  // Rapprochement : même nom de succession = le dossier ; une vente du même nom, jamais.
  assert.equal(app.dossierPourIntituleAuthentic('Succession DUPONT Jean', [d, { id: 'v', nom: 'DUPONT Jean / MARTIN' }], '').id, 's');
});

test('adressesEmailValides et participantsParAdresse : envoi groupé accepté, un votant par adresse', () => {
  assert.equal(app.adressesEmailValides('a@x.fr;b@y.fr'), true);
  assert.equal(app.adressesEmailValides('a@x.fr; pas-une-adresse'), false);
  assert.equal(app.adressesEmailValides(''), false);
  const l = app.participantsParAdresse([{ role: 'vendeur', nom: 'M. et Mme MARCHAIS', email: 'a@x.fr; b@y.fr' }, { role: 'acquereur', nom: 'LEBON', email: 'c@z.fr' }]);
  assert.equal(l.map(p => p.role + ':' + p.email).join(','), 'vendeur:a@x.fr,vendeur:b@y.fr,acquereur:c@z.fr');
});

test('personnes déjà connues : un ancien acquéreur qui revend, proposé puis repris ; homonyme partiel et écarté', () => {
  const sm = { situation: 'Marié(e)', date: '2015-06-20', conjoint: 'ROUSSEL Claire', contrat: '', regime: '', dateMariage: '' };
  const ancien = { id: 'old', nom: 'GARNIER / VASSEUR', acte: '2021-04-12', archive: true,
    parties: [{ nom: 'Monsieur Paul GARNIER', role: 'VENDEUR' }, { nom: 'Monsieur Hugo VASSEUR', role: 'ACQUEREUR' }],
    telephoneAcquereur: '06 44 55 66 77', emailAcquereur: 'hugo.vasseur@exemple.fr',
    authentic: { personnes: [{ nom: 'Hugo VASSEUR', role: 'ACQUEREUR', situationMatrimoniale: sm }] }, historique: [] };
  const nouveau = { id: 'new', nom: 'VASSEUR / MERCIER', parties: [{ nom: 'VASSEUR Hugo', role: 'VENDEUR' }, { nom: 'Madame Léa MERCIER', role: 'ACQUEREUR' }],
    emailVendeur: '', telephoneVendeur: '', pieces: {}, historique: [] };
  const homonyme = { id: 'h', nom: 'VASSEUR / X', parties: [{ nom: 'Madame Inès VASSEUR', role: 'VENDEUR' }], emailVendeur: 'ines@exemple.fr', historique: [] };
  const liste = app.personnesConnuesPourDossier(nouveau, [ancien, nouveau, homonyme]);
  assert.equal(liste.length, 1);
  assert.equal([liste[0].personne, liste[0].role, liste[0].ancienDossier, liste[0].ancienRole].join('|'), 'VASSEUR Hugo|VENDEUR|old|ACQUEREUR');
  // Rien n'est écrit tant que l'étude n'a pas cliqué « Reprendre ».
  assert.equal(nouveau.emailVendeur, '');
  const notes = [];
  app.appliquerPersonneConnue(nouveau, liste[0], t => notes.push(t));
  assert.equal(nouveau.telephoneVendeur, '06 44 55 66 77');
  assert.equal(nouveau.emailVendeur, 'hugo.vasseur@exemple.fr');
  assert.equal(nouveau.authentic.personnes[0].situationMatrimoniale.conjoint, 'ROUSSEL Claire');
  assert.match(notes[0], /Fiche de VASSEUR Hugo reprise/);
  // Plus rien à apporter : la proposition disparaît.
  assert.equal(app.personnesConnuesPourDossier(nouveau, [ancien, nouveau]).length, 0);
  // Écartée : plus jamais reproposée.
  const autre = { id: 'n2', nom: 'VASSEUR / B', parties: [{ nom: 'Hugo VASSEUR', role: 'VENDEUR' }], historique: [] };
  const c = app.personnesConnuesPourDossier(autre, [ancien, autre])[0];
  autre.personnesConnuesEcartees = [c.cle];
  assert.equal(app.personnesConnuesPourDossier(autre, [ancien, autre]).length, 0);
  // Un seul mot en commun ne suffit jamais.
  assert.equal(app.memePersonneParNom('Monsieur VASSEUR', 'Hugo VASSEUR'), false);
  assert.equal(app.memePersonneParNom('Monsieur Hugo Jean VASSEUR', 'VASSEUR Hugo'), true);
});

test('fiche client d\'un vendeur déjà client : la vente en cours, pas son ancien achat cité en premier', () => {
  const ancien = { id: 'a', nom: 'GARNIER / MARTEL', archive: true, parties: [{ nom: 'Alexandre MARTEL', role: 'ACQUEREUR' }], historique: [] };
  const vente = { id: 'v', nom: 'MARTEL / FOURNIER', parties: [{ nom: 'Monsieur Alexandre MARTEL', role: 'VENDEUR' }], historique: [] };
  const autre = { id: 'x', nom: 'LEROY / DURAND', historique: [] };
  const fiche = Object.assign({}, clientMarie, { texte: 'Dossiers\n8 - Vente GARNIER/MARTEL\n12 - Vente MARTEL/FOURNIER' });
  const liste = [ancien, vente, autre];
  // Sans dossier en consultation : le seul dossier cité en cours où il est partie.
  assert.equal(app.dossierPourFicheClientAuthentic(fiche, liste, null).id, 'v');
  // Même en consultant l'ancien dossier, la vente en cours où il est partie l'emporte.
  assert.equal(app.dossierPourFicheClientAuthentic(fiche, liste, ancien).id, 'v');
  // En consultation mais non cité : la vente citée en cours.
  assert.equal(app.dossierPourFicheClientAuthentic(fiche, liste, autre).id, 'v');
  // Rien de cité, rien en consultation : le seul dossier en cours où la personne est partie.
  assert.equal(app.dossierPourFicheClientAuthentic(clientMarie, liste, null).id, 'v');
  // Deux ventes en cours où il est partie : rien n'est deviné.
  const vente2 = { id: 'w', nom: 'MARTEL / BRUN', parties: [{ nom: 'Alexandre MARTEL', role: 'VENDEUR' }], historique: [] };
  assert.equal(app.dossierPourFicheClientAuthentic(clientMarie, liste.concat(vente2), null), null);
  // La vente cité étant signée, l'autre en cours est retenue parmi les cités.
  const signee = Object.assign({}, vente, { id: 's', archive: false, authentic: { acte: { etat: 'signe', date: '2026-09-01' } } });
  const fiche2 = Object.assign({}, clientMarie, { texte: '12 - Vente MARTEL/FOURNIER\n14 - Vente MARTEL/BRUN' });
  assert.equal(app.dossierPourFicheClientAuthentic(fiche2, [signee, vente2], null).id, 'w');
});

test('statistiques : départ à la signature de l\'avant-contrat, à défaut à l\'ouverture ; date lue dans Authentic', () => {
  const h = (iso) => [{ date: iso + 'T09:00:00', texte: 'Dossier créé' }];
  const a = { id: 'a', dateAvantContrat: '2026-06-01', historique: h('2026-07-01'), rendezVousSignature: '2026-09-01' };
  const b = { id: 'b', historique: h('2026-08-01'), rendezVousSignature: '2026-09-01' };
  const s = app.statistiquesDelaisDossiers([a, b], '2026-10-02');
  // a : 92 jours depuis l'avant-contrat (et non 62 depuis l'ouverture) ; b : 31 jours depuis l'ouverture.
  assert.equal(s.signature.n, 2);
  assert.equal(s.signature.max, 92);
  assert.equal(s.signature.min, 31);
  assert.equal(s.signature.parAvantContrat, 1);
  // Compté au mois de l'avant-contrat ; « — » avant le premier dossier ouvert dans CLAIRE.
  const c = app.comparaisonDossiersOuverts([a, b], '2026-08-15');
  assert.equal(c.mois.n, 1);          // b, ouvert en août
  assert.equal(c.precedent.n, 0);     // juillet : a compte en juin, pas en juillet
  assert.equal(c.precedent.disponible, true);
  const juin = app.comparaisonDossiersOuverts([a, b], '2026-06-20');
  assert.equal(juin.mois.disponible, false);   // avant le premier dossier ouvert (juillet)
  // Page du dossier dans Authentic.
  const lignes = [
    { titre: 'Projet de compromis', etat: 'Envoyé', dates: ['2026-05-20'], texte: 'Projet de compromis · 20/05/2026 · Envoyé' },
    { titre: 'Compromis de vente', etat: 'Signé', dates: ['2026-06-01'], texte: 'Compromis de vente · 01/06/2026 · Signé' }
  ];
  assert.equal(app.dateAvantContratAuthentic(lignes), '2026-06-01');
  assert.equal(app.dateAvantContratAuthentic([{ titre: 'Promesse de vente', etat: '', dates: ['2026-03-02', '2026-03-10'], texte: 'Promesse de vente signée le 10/03/2026' }]), '2026-03-10');
  assert.equal(app.dateAvantContratAuthentic([{ titre: 'Acte de vente', etat: 'Signé', dates: ['2026-09-01'], texte: 'Acte de vente · Signé' }]), '');
});

test('notaire en second : l\'état de rédaction de l\'acte n\'est ni affiché ni noté ; « signé » reste', () => {
  const d = { id: 'p', nom: 'MARTEL / FOURNIER', roleNotaire: 'participant', pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(d, gestionAttente);
  assert.equal(d.authentic.acte.etat, 'redaction');
  assert.ok(!d.historique.some(h => /Acte dans Authentic/.test(h.texte)));
  assert.ok(!app.lignesAuthenticDossier(d).some(l => l.libelle === 'Acte de vente'));
  d.authentic.acte = { etat: 'signe', libelle: 'Acte signé', date: '2026-09-30' };
  assert.ok(app.lignesAuthenticDossier(d).some(l => l.libelle === 'Acte de vente'));
  const i = Object.assign({}, d, { roleNotaire: 'instrumentaire', authentic: { acte: { etat: 'redaction', libelle: 'En cours de rédaction', date: '' } } });
  assert.ok(app.lignesAuthenticDossier(i).some(l => l.libelle === 'Acte de vente'));
});

test('fiche client d\'un inconnu ouverte après un dossier : jamais rangée « à rattacher » sans que sa fiche le cite', () => {
  const vente = { id: 'v', nom: 'PETIT / BOSQUET', parties: [{ nom: 'Sylvain PETIT', role: 'VENDEUR' }, { nom: 'Samuel BOSQUET', role: 'ACQUEREUR' }], historique: [] };
  // clientMarie = Alexandre MARTEL, partie de rien.
  assert.equal(app.dossierPourFicheClientAuthentic(clientMarie, [vente], vente), null);
  const autreDossier = Object.assign({}, clientMarie, { texte: '30 - Vente MARTEL/NOEL' });
  assert.equal(app.dossierPourFicheClientAuthentic(autreDossier, [vente], vente), null);
  // Sa fiche cite le dossier consulté : proposé « à rattacher ».
  const citeVente = Object.assign({}, clientMarie, { texte: '12 - Vente PETIT/BOSQUET' });
  assert.equal(app.dossierPourFicheClientAuthentic(citeVente, [vente], vente).id, 'v');
  // Partie du dossier consulté (fiche sans intitulé) : ce dossier.
  const petit = Object.assign({}, clientMarie, { champs: clientMarie.champs.map(c => /Nom de famille/.test(c.libelle) ? Object.assign({}, c, { valeur: 'Petit' }) : /Prénom/.test(c.libelle) ? Object.assign({}, c, { valeur: 'Sylvain' }) : c), tableaux: [] });
  assert.equal(app.dossierPourFicheClientAuthentic(petit, [vente], vente).id, 'v');
});

test('navigation dans Authentic : l\'intitulé seul désigne le dossier consulté, ou aucun', () => {
  const vente = { id: 'v', nom: 'PETIT / BOSQUET', parties: [{ nom: 'Sylvain PETIT', role: 'VENDEUR' }, { nom: 'Samuel BOSQUET', role: 'ACQUEREUR' }], historique: [] };
  assert.equal(app.dossierPourNavigationAuthentic('12 - Vente PETIT/BOSQUET', [vente]).id, 'v');
  assert.equal(app.dossierPourNavigationAuthentic('15 - Donation SIMOND', [vente]), null);
  assert.equal(app.dossierPourNavigationAuthentic('', [vente]), null);
});

test('référence du dossier (« A 2026 00247 ») : le vrai numéro, retenu sans être affiché ; le rang « 1 - » n’identifie rien', () => {
  // Étude, 03/10 : la page « 1 - Vente MERCIER / FRANCOIS » était allée au dossier DORLÉAC, retenu sous « 1 ».
  const page = { champs: [{ groupe: '', libelle: '1 - Vente MOREAU-GILLET/WALDEN', valeur: '' }], tableaux: [], texte: 'A 2026 00247 VTE MOREAU-GILLET / WALDEN\n1 - Vente MOREAU-GILLET/WALDEN Importer\nComparants' };
  assert.equal(app.referenceDossierAuthentic(page), 'A 2026 00247');
  assert.equal(app.intituleDossierAuthentic(page), 'Vente MOREAU-GILLET / WALDEN', 'jamais affichée devant « VTE »');
  assert.equal(app.referenceDossierAuthentic(gestion), '', 'le rang « 12 - » seul n’est pas une référence');
  assert.equal(typeof app.numeroDossierAuthentic, 'undefined');
  const dorleac = { id: 'x', nom: 'DORLEAC / PETIT', historique: [], numeroAuthentic: '1' };
  const a = { id: 'a', nom: 'MOREAU-GILLET / WALDEN', historique: [] };
  assert.equal(app.dossierPourIntituleAuthentic(app.intituleDossierAuthentic(page), [dorleac], '', 'A 2026 00247'), null);
  assert.equal(app.dossierPourIntituleAuthentic(app.intituleDossierAuthentic(page), [dorleac, a], '', 'A 2026 00247').id, 'a');
  // Retenue à la première reconnaissance ; jamais un rang ; jamais deux fois ; jamais une référence déjà prise.
  assert.equal(app.retenirReferenceAuthentic(a, '1', [a]), false);
  assert.equal(app.retenirReferenceAuthentic(a, 'A 2026 00247', [a]), true);
  assert.equal(a.referenceAuthentic, 'A 2026 00247');
  assert.match(a.historique[0].texte, /Dossier Authentic A 2026 00247 rattaché/);
  assert.equal(app.retenirReferenceAuthentic(a, 'A 2026 00300', [a]), false);
  const b = { id: 'b', nom: 'X / Y', historique: [] };
  assert.equal(app.retenirReferenceAuthentic(b, 'A 2026 00247', [a, b]), false);
  // La référence l'emporte même si l'intitulé a changé ; un homonyme rattaché à une autre référence est écarté.
  const homonyme = { id: 'h', nom: 'MOREAU-GILLET / WALDEN', historique: [], referenceAuthentic: 'A 2025 00112' };
  assert.equal(app.dossierPourIntituleAuthentic('Projet acte BLOIS', [a, homonyme], '', 'A 2026 00247').id, 'a');
  const c = { id: 'c', nom: 'MOREAU-GILLET / WALDEN', historique: [] };
  assert.equal(app.dossierPourIntituleAuthentic('Vente MOREAU-GILLET / WALDEN', [c, homonyme], '', 'A 2026 00999').id, 'c');
  assert.match(app.raisonDossierAuthenticIntrouvable('Vente MOREAU-GILLET / WALDEN', [homonyme], '', 'A 2026 00999'), /rattaché à un autre dossier d'Authentic/);
  assert.equal(app.commentDossierRetrouveAuthentic('Projet', '', a, 'A 2026 00247'), 'retrouvé par sa référence Authentic');
  // Onglet actif portant la référence : retirée de l'intitulé, gardée comme référence.
  const onglet = { onglets: [{ titre: 'A 2026 00300 VTE C / D', actif: false }, { titre: 'A 2026 00247 VTE MOREAU-GILLET / WALDEN', actif: true }], champs: [], tableaux: [], texte: 'A 2026 00300 VTE C / D\nA 2026 00247 VTE MOREAU-GILLET / WALDEN' };
  assert.equal(app.intituleDossierAuthentic(onglet), 'Vente MOREAU-GILLET / WALDEN');
  assert.equal(app.referenceDossierAuthentic(onglet), 'A 2026 00247');
  // Deux références sur la page (liste de dossiers) : aucune. Ni date ni montant pris pour une référence.
  assert.equal(app.referenceDossierAuthentic({ champs: [], tableaux: [], texte: 'A 2026 00247 VTE A / B\nA 2026 00300 VTE C / D' }), '');
  assert.equal(app.referencesDansTexteAuthentic('Le 12/03/2026 · 2026 00247 · A 2026 1234,50 €').join(','), '');
  // Navigation : par la référence (extension 0.3.9), sinon les noms ; jamais par le rang.
  assert.equal(app.dossierPourNavigationAuthentic('A 2026 00247 1 - Avenant WALDEN', [a, homonyme]).id, 'a');
  assert.equal(app.dossierPourNavigationAuthentic('A 2026 00999 1 - Donation WALDEN', [a, homonyme]), null);
  assert.equal(app.dossierPourNavigationAuthentic('1 - Vente MOREAU-GILLET/WALDEN', [dorleac, c]).id, 'c');
  assert.equal(app.dossierPourNavigationAuthentic('1 - Donation SIMOND', [Object.assign({}, c, { numeroAuthentic: '1' })]), null);
  // Création depuis les pages : la référence suit le dossier relevé.
  const g = app.dossiersDepuisRelevesAuthentic([{ recueLe: '2026-10-02T10:00:00Z', capture: Object.assign({}, gestion, { texte: 'A 2026 00451 VTE MARTEL / FOURNIER\n' + (gestion.texte || '') }) }])[0];
  assert.equal(g.reference, 'A 2026 00451');
  assert.equal(g.export.reference, 'A 2026 00451');
  assert.ok(!/A 2026/.test(g.intitule));
});

test('rangé à la main (« Choisir ») : l’intitulé et la référence vont ensuite à ce dossier, ils quittent l’ancien', () => {
  const ancien = { id: 'b', nom: 'DURAND / ROUX', historique: [] };
  const choisi = { id: 'a', nom: 'MARTEL / FOURNIER', historique: [] };
  assert.equal(app.dossierPourIntituleAuthentic('Projet acte BLOIS', [ancien, choisi]), null);
  assert.equal(app.rattacherIntituleAuthentic(ancien, 'Projet acte BLOIS', [ancien, choisi]).length, 0);
  const quittes = app.rattacherIntituleAuthentic(choisi, 'Projet acte BLOIS', [ancien, choisi]);
  assert.equal(quittes.length, 1);
  assert.equal(ancien.intitulesAuthentic.length, 0);
  assert.equal(app.dossierPourIntituleAuthentic('Projet acte Blois', [ancien, choisi]).id, 'a');
  assert.match(choisi.historique[0].texte, /« Projet acte BLOIS » rangé ici à la main/);
  assert.match(ancien.historique[1].texte, /rangé dans VTE - MARTEL \/ FOURNIER à la main/);
  assert.equal(app.commentDossierRetrouveAuthentic('Projet acte BLOIS', '', choisi), 'rangé ici à la main une première fois');
  assert.equal(app.rattacherIntituleAuthentic(choisi, '', [choisi]).length, 0);
  // Avec la référence de la page : elle quitte le dossier qui la portait.
  ancien.referenceAuthentic = 'A 2026 00012';
  const q2 = app.rattacherIntituleAuthentic(choisi, 'Vente DURAND / ROUX', [ancien, choisi], 'A 2026 00012');
  assert.equal(q2.length, 1);
  assert.equal(ancien.referenceAuthentic, undefined);
  assert.equal(choisi.referenceAuthentic, 'A 2026 00012');
  assert.equal(app.rattacherIntituleAuthentic(choisi, '', [choisi], '12').length, 0, 'un rang n’est jamais rattaché');
});

test('numéro Authentic gardé avant le 03/10 : oublié au démarrage', () => {
  const d = { id: 'x', nom: 'DORLEAC / PETIT', numeroAuthentic: '1', historique: [] };
  assert.equal(app.retirerNumeroAuthentic(d), true);
  assert.equal(d.numeroAuthentic, undefined);
  assert.match(d.historique[0].texte, /« 1 » oublié/);
  assert.equal(app.retirerNumeroAuthentic({ id: 'z' }), false);
});

test('oublierDonneesAuthentic : la page d’un autre dossier appliquée par erreur est retirée de la fiche', () => {
  const d = {
    id: 'x', nom: 'DORLEAC / PETIT', referenceAuthentic: 'A 2026 00247', prixVente: 195000, dateAvantContrat: '2026-06-01',
    pieces: { titrePropriete: 'recue', 'authentic-ecv-1': 'recue', 'perso-safer': 'manquante', dpe: 'recue' },
    piecesPersonnalisees: [{ cle: 'authentic-ecv-1', label: 'Acte de naissance de Jean MERCIER' }, { cle: 'perso-safer', label: 'Réponse SAFER' }, { cle: 'perso-x', label: 'Plan' }],
    piecesAuthentic: ['titrePropriete', 'authentic-ecv-1'], piecesValideesManuellement: ['titrePropriete', 'authentic-ecv-1', 'dpe'],
    piecesTrouveesLe: { titrePropriete: '2026-09-29T12:00:00', dpe: '2026-09-01T12:00:00' },
    authentic: { rhf: { envoyeeLe: '2026-07-23', retourLe: '2026-09-29' }, prix: 195000, saferPieceAjoutee: true, personnes: [{ nom: 'Marie DORLEAC', role: 'VENDEUR' }], releveLe: '2026-10-03T08:00:00Z' },
    historique: [{ date: '2026-10-03T08:00:00Z', texte: 'Prix de vente repris d’Authentic (Capital) : 195.000,00 €' }]
  };
  const retire = app.oublierDonneesAuthentic(d, '2026-10-03T09:00:00.000Z');
  assert.ok(retire.length >= 4, retire.join(' | '));
  assert.equal(d.referenceAuthentic, undefined);
  assert.equal(d.prixVente, null);
  assert.equal(d.dateAvantContrat, '2026-06-01', 'une date qui ne vient pas d’Authentic reste');
  assert.equal(d.pieces.titrePropriete, 'manquante');
  assert.equal(d.pieces.dpe, 'recue');
  assert.equal(d.pieces['authentic-ecv-1'], undefined);
  assert.equal(d.piecesPersonnalisees.map(p => p.cle).join(), 'perso-x');
  assert.equal(d.piecesValideesManuellement.join(), 'dpe');
  assert.equal(Object.keys(d.piecesTrouveesLe).join(), 'dpe');
  assert.equal(d.piecesAuthentic, undefined);
  assert.equal(JSON.stringify(d.authentic), JSON.stringify({ personnes: [{ nom: 'Marie DORLEAC', role: 'VENDEUR' }] }), 'les fiches client restent');
  assert.match(d.historique[d.historique.length - 1].texte, /^Données d’Authentic oubliées/);
  assert.equal(app.oublierDonneesAuthentic({ id: 'vide', historique: [] }).length, 0);
});

test('vendeur déjà client (ancien dossier archivé cité sur sa fiche) et épouse sous son nom : tout va à la vente en cours', () => {
  const ID2 = 'j_idt9:';
  const fiche = (nom, prenom, email, conjoint, texte) => ({ titre: 'Authentic', champs: [
    { groupe: '', libelle: ID2 + 'tabView:ficheClientPhysiqueIdentite:civilite:selectOneRadio', valeur: 'Monsieur' },
    { groupe: '', libelle: 'Nom de famille*', valeur: nom }, { groupe: '', libelle: 'Prénom*', valeur: prenom },
    { groupe: '', libelle: ID2 + 'tabView:ficheClientPhysiqueIdentite:naissanceDate:naissanceDate', valeur: '01/01/1960' },
    { groupe: '', libelle: ID2 + 'tabView:x:coordonneePrincipaleW1:Telephone:inputTelephone', valeur: '06 55 44 33 22' },
    { groupe: '', libelle: 'Email', valeur: email }
  ], tableaux: conjoint ? [{ titre: '', entete: ['Situation', 'Date', 'Conjoint'], lignes: [['Marié(e)', '12/05/1990', conjoint]] }] : [], texte: texte || '' });
  // Dans CLAIRE : seul le mari est nommé vendeur ; son ancien achat est archivé.
  const ancien = { id: 'old', nom: 'ROUX / CHARVET', archive: true, acte: '2015-03-01', parties: [{ nom: 'Monsieur Gérard CHARVET', role: 'ACQUEREUR' }], historique: [] };
  const vente = { id: 'v', nom: 'CHARVET / LENOIR', parties: [{ nom: 'Monsieur Gérard CHARVET', role: 'VENDEUR' }, { nom: 'Madame Inès LENOIR', role: 'ACQUEREUR' }], pieces: {}, historique: [],
    authentic: { comparants: [{ nom: 'CHARVET Gérard', role: 'VENDEUR' }, { nom: 'BRUNEAU Lucie', role: 'VENDEUR' }, { nom: 'LENOIR Inès', role: 'ACQUEREUR' }] } };
  const liste = [ancien, vente];
  // Sa fiche cite l'ancien dossier seulement (la vente n'y est pas encore listée).
  const mari = fiche('Charvet', 'Gérard', 'gerard.charvet@exemple.fr', 'BRUNEAU Lucie', '1203 - Vente ROUX/CHARVET');
  const femme = fiche('Bruneau', 'Lucie', 'lucie.bruneau@exemple.fr', 'CHARVET Gérard', '1203 - Vente ROUX/CHARVET');
  for (const courant of [vente, null]) {
    assert.equal(app.dossierPourFicheClientAuthentic(mari, liste, courant).id, 'v');
    assert.equal(app.dossierPourFicheClientAuthentic(femme, liste, courant).id, 'v');
  }
  app.appliquerReleveSurDossier(vente, mari);
  app.appliquerReleveSurDossier(vente, femme);
  assert.equal(vente.emailVendeur, 'gerard.charvet@exemple.fr; lucie.bruneau@exemple.fr');
  assert.equal(vente.telephoneVendeur, '06 55 44 33 22');
  // Raison dite quand rien n'est rangé.
  assert.match(app.raisonFicheClientSansDossier(fiche('Inconnu', 'Paul', 'p@x.fr'), liste), /aucun dossier en cours/);
  assert.match(app.raisonFicheClientSansChangement(mari), /déjà sur la fiche/);
});

test('date de l\'avant-contrat relue automatiquement sur le NAS : retirée, sauf saisie ou reprise depuis', () => {
  const lue = (date, fr) => ({ id: 'x', dateAvantContrat: date, historique: [{ date: '2026-10-02T13:59:00Z', texte: `Date de signature de l’avant-contrat lue dans document signé.pdf : ${fr}` }] });
  const a = lue('2025-09-10', '10 septembre 2025');
  assert.equal(app.retirerDateAvantContratLueNas(a), true);
  assert.equal(a.dateAvantContrat, null);
  assert.match(a.historique[1].texte, /retirée/);
  // Saisie à la main après la lecture : gardée.
  const b = lue('2026-03-02', '2 mars 2026');
  b.historique.push({ date: '2026-10-02T14:10:00Z', texte: 'Date de signature de l’avant-contrat : 2 mars 2026' });
  assert.equal(app.retirerDateAvantContratLueNas(b), false);
  assert.equal(b.dateAvantContrat, '2026-03-02');
  // Date validée à la création (aucune lecture NAS) : jamais touchée.
  const c = { id: 'c', dateAvantContrat: '2026-05-12', historique: [{ date: '2026-05-20T09:00:00Z', texte: 'Dossier créé' }] };
  assert.equal(app.retirerDateAvantContratLueNas(c), false);
  // Date changée depuis (autre que celle lue) : gardée.
  const e = lue('2026-04-01', '10 septembre 2025');
  assert.equal(app.retirerDateAvantContratLueNas(e), false);
});

test('ligne Authentic « création · envoi · état » : RHF et demandes datées de l’envoi (étude, 02/10)', () => {
  assert.equal(app.dateEnvoiLigneAuthentic({ dates: ['2026-09-01', '2026-09-04'] }), '2026-09-04');
  assert.equal(app.dateEnvoiLigneAuthentic({ date: '2026-09-01' }), '2026-09-01');
  assert.equal(app.dateEnvoiLigneAuthentic({}), '');
  const rhf = app.suiviRhfAuthentic([{ titre: 'Réquisition hors formalité', dates: ['2026-09-01', '2026-09-04'], etat: 'Pris en compte', texte: 'Réquisition hors formalité · 01/09/2026 · 04/09/2026 · Pris en compte' }]);
  assert.equal([rhf.envoyeeLe, rhf.retourLe].join('|'), '2026-09-04|');
  const rhf3 = app.suiviRhfAuthentic([{ titre: 'Réquisition hors formalité', dates: ['2026-09-01', '2026-09-04', '2026-09-20'], etat: '', texte: 'Réquisition hors formalité · 01/09/2026 · 04/09/2026 · 20/09/2026' }]);
  assert.equal([rhf3.envoyeeLe, rhf3.retourLe].join('|'), '2026-09-04|2026-09-20');
  const dm = app.demandesUrbanismeAuthentic([{ titre: 'Demande de certificat d’alignement', date: '2026-09-01', dates: ['2026-09-01', '2026-09-03'], etat: 'Envoyé', texte: '' }]);
  assert.equal(dm.certificatAlignement.date, '2026-09-03');
});

test('dossierDejaPresentPourCreation : même référence Authentic ou même nom, en cours seulement — jamais par le rang « 1 » (étude, 03/10)', () => {
  const liste = [
    { id: 'a', nom: 'MARTEL / FOURNIER', referenceAuthentic: 'A 2026 00247' },
    { id: 'b', nom: 'Léger / Roux', archive: true },
    { id: 'c', nom: 'BRUN', deleted: true },
    { id: 'd', nom: 'DORLEAC / PETIT', numeroAuthentic: '1' }
  ];
  assert.equal(app.dossierDejaPresentPourCreation('Autre nom', 'A 2026 00247', liste).id, 'a');
  assert.equal(app.dossierDejaPresentPourCreation('martel / fournier', '', liste).id, 'a');
  // « Créer un second dossier ? VTE - DORLÉAC existe déjà » pour MERCIER : plus jamais.
  assert.equal(app.dossierDejaPresentPourCreation('MERCIER / FRANCOIS', '1', liste), null);
  assert.equal(app.dossierDejaPresentPourCreation('LEGER / ROUX', '', liste), null);
  assert.equal(app.dossierDejaPresentPourCreation('BRUN', '', liste), null);
  assert.equal(app.dossierDejaPresentPourCreation('NOUVEAU', 'A 2026 00999', liste), null);
});

test('raisonDossierAuthenticIntrouvable : le motif dit à l’étude, jamais un silence', () => {
  const dossiers = [
    { id: 'a', nom: 'MARTEL / FOURNIER', parties: [] },
    { id: 'b', nom: 'DURAND / ROUX', numeroAuthentic: '77', parties: [] },
    { id: 'c', nom: 'LEROY / PETIT', parties: [] },
    { id: 'd', nom: 'LEROY / PETIT', parties: [] }
  ];
  assert.equal(app.raisonDossierAuthenticIntrouvable('', dossiers, ''), 'intitulé du dossier non lu sur la page');
  assert.equal(app.raisonDossierAuthenticIntrouvable('Vente BERNARD/THOMAS', dossiers, ''), 'aucun dossier de CLAIRE ne porte ces noms');
  // Un seul côté reconnu : sous le seuil, avec le détail des points.
  assert.match(app.raisonDossierAuthenticIntrouvable('Vente MARTEL/THOMAS', dossiers, ''), /le plus proche, VTE - MARTEL \/ FOURNIER, n'a que 3 points sur 6 \(vendeur identique \(\+3\)\)/);
  // Un numéro gardé ne compte plus : le dossier aux mêmes noms est retrouvé.
  assert.equal(app.dossierPourIntituleAuthentic('Vente DURAND/ROUX', dossiers, '').id, 'b');
  // Deux dossiers identiques : jamais deviné entre eux.
  assert.match(app.raisonDossierAuthenticIntrouvable('Vente LEROY/PETIT', dossiers, ''), /^deux dossiers aussi proches/);
});

test('candidatsDossierAuthentic : dossiers en cours, les plus ressemblants d’abord', () => {
  const dossiers = [
    { id: 'z', nom: 'AUBERT / BLANC', parties: [] },
    { id: 'a', nom: 'MARTEL / FOURNIER', parties: [] },
    { id: 'x', nom: 'MARTEL / FOURNIER', archive: true, parties: [] },
    { id: 'y', nom: 'COLIN / DUPUIS', deleted: true, parties: [] }
  ];
  assert.equal(app.candidatsDossierAuthentic('Vente MARTEL/THOMAS', '', dossiers).map(x => x.d.id).join(','), 'a,z');
});

test('ligneJournalAuthentic : page, postes, état et choix à la main', () => {
  const dossiers = [{ id: 'a', nom: 'MARTEL / FOURNIER' }];
  const l = app.ligneJournalAuthentic({ id: 'r1', recueLe: '2026-10-02T10:05:00.000Z', nature: 'dossier', intitule: '12 - Vente MARTEL/FOURNIER Importer avec 2e SENS', origine: '10.0.0.2', posteOrigine: 'Julie VASSELIN', prisPar: 'Jérémy SAUJOT', etat: 'sans-dossier', texte: 'aucun dossier de CLAIRE ne porte ces noms', enMemoire: true }, dossiers);
  assert.equal(l.page, 'Dossier « 12 - Vente MARTEL/FOURNIER »');
  assert.equal(l.qui, 'de Julie · lue par Jérémy');
  assert.equal(l.etat.texte, 'Aucun dossier');
  assert.equal(l.choisir, true);
  const ok = app.ligneJournalAuthentic({ id: 'r2', nature: 'client', origine: 'local', etat: 'applique', dossierId: 'a', texte: 'téléphone repris', prisPar: '', revu: true }, dossiers);
  assert.equal(ok.qui, 'de poste serveur · lue par une fenêtre · revue');
  assert.equal(ok.detail, 'VTE - MARTEL / FOURNIER : téléphone repris');
  assert.equal(ok.choisir, false);
  assert.equal(ok.dossierId, 'a');
  assert.equal(app.ligneJournalAuthentic({ etat: 'expire', nature: 'dossier', enMemoire: true }, []).etat.texte, 'Perdue : aucune fenêtre CLAIRE ouverte');
});

test('plusieurs dossiers ouverts : l’onglet actif désigne la page, jamais un onglet inactif', () => {
  const page = {
    onglets: [{ titre: '1200 - Vente MARTEL/DUPONT', actif: false }, { titre: '1836 - Vente MARTEL/FOURNIER', actif: true }],
    champs: [], tableaux: [],
    texte: '1200 - Vente MARTEL/DUPONT\n1836 - Vente MARTEL/FOURNIER\nAccueil'
  };
  assert.equal(app.intituleDossierAuthentic(page), 'Vente MARTEL / FOURNIER');
  // Sans onglet repéré : l'en-tête de la page du dossier (suivi de « Comparants ») l'emporte sur les titres.
  const sansOnglets = { champs: [], tableaux: [], texte: '1200 - Vente MARTEL/DUPONT\n1836 - Vente MARTEL/FOURNIER\nComparants (3)' };
  assert.equal(app.intituleDossierAuthentic(sansOnglets), 'Vente MARTEL / FOURNIER');
  // Liste de résultats de recherche : plusieurs dossiers cités, aucun en-tête → aucun dossier.
  assert.equal(app.intituleDossierAuthentic({ champs: [], tableaux: [], texte: '1200 - Vente MARTEL/DUPONT\n1836 - Vente MARTEL/FOURNIER' }), '');
  // Fiche client : les intitulés des onglets inactifs ne sont pas « cités » par la fiche.
  assert.equal(app.intitulesNumerotesAuthentic(page).map(x => x.intitule).join(','), 'Vente MARTEL / FOURNIER');
});

test('intitulé de toute formulation : les noms', () => {
  const promesse = { champs: [{ groupe: '', libelle: '1836 - Promesse de vente MARTEL/FOURNIER Importer avec 2e SENS', valeur: '' }], tableaux: [], texte: '' };
  assert.equal(app.intituleDossierAuthentic(promesse), 'Vente MARTEL / FOURNIER');
  const libre = { champs: [], tableaux: [], texte: '1836 - MARTEL Maison Blois FOURNIER\nComparants (2)' };
  const intitule = app.intituleDossierAuthentic(libre);
  assert.equal(intitule, 'MARTEL Maison Blois FOURNIER');
  const dossiers = [{ id: 'a', nom: 'MARTEL / FOURNIER', parties: [] }, { id: 'b', nom: 'COLIN / DUPUIS', parties: [] }];
  assert.equal(app.scoreDossierAuthentic(intitule, '', dossiers[0]).score, 6);
  assert.equal(app.dossierPourIntituleAuthentic(intitule, dossiers, '').id, 'a');
  // Un numéro gardé ne retrouve plus rien seul.
  assert.equal(app.dossierPourIntituleAuthentic('Projet acte BLOIS', [{ id: 'c', nom: 'X / Y', numeroAuthentic: '1836' }], ''), null);
  // Une donation du même client ne suffit pas.
  assert.equal(app.dossierPourIntituleAuthentic('Donation MARTEL', dossiers, ''), null);
});

test('ancien dossier des mêmes clients : jamais appliqué ni proposé', () => {
  const ancien = {
    champs: [{ groupe: '', libelle: '1200 - Vente MARTEL/FOURNIER Importer', valeur: '' }],
    tableaux: [{ titre: '', entete: [], lignes: [['Acte de vente', '', '12/03/2019', '', 'Signé le 12/03/2019']] }],
    texte: ''
  };
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', dateAvantContrat: '2026-07-01', parties: [] };
  assert.equal(app.ancienDossierAuthentic(ancien, d), true);
  assert.equal(app.ancienDossierAuthentic(ancien, Object.assign({}, d, { dateAvantContrat: '2018-01-01' })), false);
  assert.equal(app.proposerChoixDossierAuthentic(ancien, 'Vente MARTEL / DUPONT', [d]), false);
  const enCours = { champs: [{ groupe: '', libelle: '1836 - Vente MARTEL/DUPONT Importer', valeur: '' }], tableaux: [], texte: '' };
  assert.equal(app.proposerChoixDossierAuthentic(enCours, 'Vente MARTEL / DUPONT', [d]), true);
});

test('dossier identifié par « VTE VENDEURS / ACQUÉREURS » sans numéro ; un champ « N° de dossier » ne compte pas', () => {
  const onglet = {
    onglets: [{ titre: 'VTE COLIN / DUPUIS', actif: false }, { titre: 'VTE MARTEL / FOURNIER', actif: true }],
    champs: [{ groupe: 'Données du dossier', libelle: 'N° de dossier', valeur: '1836' }], tableaux: [], texte: 'VTE COLIN / DUPUIS\nVTE MARTEL / FOURNIER'
  };
  assert.equal(app.intituleDossierAuthentic(onglet), 'Vente MARTEL / FOURNIER');
  // En-tête de la page sans numéro.
  const enTete = { champs: [], tableaux: [], texte: 'Accueil\nVTE MARTEL/FOURNIER\nComparants (2)' };
  assert.equal(app.intituleDossierAuthentic(enTete), 'Vente MARTEL / FOURNIER');
  const dossiers = [{ id: 'a', nom: 'MARTEL / FOURNIER', parties: [] }, { id: 'b', nom: 'COLIN / DUPUIS', parties: [] }];
  assert.equal(app.dossierPourIntituleAuthentic(app.intituleDossierAuthentic(enTete), dossiers, '').id, 'a');
  // Fiche client ouverte dans l'onglet du dossier : l'onglet actif désigne le dossier en consultation.
  assert.equal(app.dossierOngletActifAuthentic({ onglets: [{ titre: 'VTE MARTEL / FOURNIER', actif: true }] }, dossiers).id, 'a');
  assert.equal(app.dossierOngletActifAuthentic({ onglets: [{ titre: 'Agenda', actif: true }] }, dossiers), null);
});

test('commentDossierRetrouveAuthentic : noms vérifiés par l’adresse — dit au journal', () => {
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', parties: [], bien: { adresse: { numero: '12', nomVoie: 'des Lilas', typeVoie: 'rue', codePostal: '41000', commune: 'BLOIS' } } };
  const t = app.commentDossierRetrouveAuthentic('Vente MARTEL / FOURNIER', '12 rue des Lilas 41000 BLOIS', d);
  assert.match(t, /^retrouvé par les noms \(vendeur identique, acquéreur identique\), adresse : code postal, adresse \(.+\), numéro — \d+ points$/);
  assert.match(app.commentDossierRetrouveAuthentic('Vente MARTEL / FOURNIER', '', d), /adresse non affichée sur la page — 6 points$/);
  // Mêmes noms, autre bien (autre code postal) : la vérification de l'adresse écarte le dossier.
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL / FOURNIER', [d], '5 route de Tours 37000 TOURS'), null);
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL / FOURNIER', [d], '12 rue des Lilas 41000 BLOIS').id, 'a');
});

test('fusion de listes d’emails et de téléphones ; à la création Authentic passe en premier et remplace le compromis (étude 06/10 au soir)', () => {
  assert.equal(app.fusionnerEmailsTexte('jean@exemple.fr', ['Jean@Exemple.fr', 'marie@exemple.fr']), 'jean@exemple.fr; marie@exemple.fr');
  assert.equal(app.fusionnerEmailsTexte('', ['a@x.fr;b@y.fr']), 'a@x.fr; b@y.fr');
  assert.equal(app.fusionnerTelephonesTexte('06 12 34 56 78', ['+33 6 12 34 56 78', '02 54 00 00 00']), '06 12 34 56 78 / 02 54 00 00 00');
  // Création : le compromis donnait un email, Authentic en donne deux autres (un par acquéreur) : Authentic d'abord, il remplace.
  const extraction = { champs: { emailAcquereur: { valeur: 'compromis@exemple.fr' } } };
  app.completerExtractionDepuisAuthentic(extraction, {
    intitule: 'VTE MARTEL / FOURNIER', immeubles: [], documents: [], parties: [],
    personnes: [
      { id: 'p1', nom: 'MARTEL', prenom: 'Alexandre', emails: [], telephones: [] },
      { id: 'p2', nom: 'FOURNIER', prenom: 'Camille', emails: ['camille@exemple.fr'], telephones: [] },
      { id: 'p3', nom: 'FOURNIER', prenom: 'Paul', emails: ['paul@exemple.fr'], telephones: ['06 11 22 33 44'] }
    ]
  });
  assert.equal(extraction.champs.emailAcquereur.valeur, 'camille@exemple.fr; paul@exemple.fr');
  assert.equal(extraction.champs.telephoneAcquereur.valeur, '06 11 22 33 44');
});

test('en-tête du sous-dossier sans nom (« 2 - Vente d’immeuble ») : le nom vient du bandeau « A 2026 00230 VTE X / Y » (étude, 03/10)', () => {
  const page = { champs: [], tableaux: [], texte: 'Accueil\nA 2026 00230 VTE LEGRAND / ROUX\n2 - Vente d\'immeuble Importer avec 6e SENS\nComparants (2)\n1 - Promesse VTE LEGRAND / ROUX\n2 - Vente d\'immeuble' };
  assert.equal(app.intituleDossierAuthentic(page), 'Vente LEGRAND / ROUX');
  const dossiers = [{ id: 'c', nom: 'CHAMBON / LEBLANC', numeroAuthentic: '2', parties: [] }, { id: 'l', nom: 'LEGRAND / ROUX', parties: [] }];
  assert.equal(app.dossierPourIntituleAuthentic(app.intituleDossierAuthentic(page), dossiers, '', app.referenceDossierAuthentic(page)).id, 'l');
});

test('texteRattachementAuthentic : le « i » de la fiche dit à quel dossier d’Authentic elle est rattachée (étude, 03/10)', () => {
  assert.equal(app.texteRattachementAuthentic({ referenceAuthentic: 'A 2026 00230', intituleAuthentic: 'Vente LEGRAND / ROUX' }), 'Rattaché au dossier Authentic A 2026 00230 — VTE LEGRAND / ROUX');
  assert.equal(app.texteRattachementAuthentic({ referenceAuthentic: 'A 2026 00230' }), 'Rattaché au dossier Authentic A 2026 00230');
  assert.equal(app.texteRattachementAuthentic({ numeroAuthentic: '2' }), '');
  const d = { id: 'a', nom: 'LEGRAND / ROUX', historique: [] };
  app.rattacherIntituleAuthentic(d, 'Vente LEGRAND / ROUX', [d], 'A 2026 00230');
  assert.equal(d.intituleAuthentic, 'Vente LEGRAND / ROUX');
});

test('sous-dossier ouvert : seul celui de la vente compte (étude, 03/10 — promesse et avenant ignorés)', () => {
  const page = (entete) => ({ texte: `A 2026 00017 VTE MARTEL / FOURNIER\n${entete} Importer avec 6e SENS\nComparants (2)\n1 - Promesse VTE MARTEL/FOURNIER\n2 - VTE MARTEL / FOURNIER\n3 - Avenant à promesse de vente` });
  assert.equal(app.sousDossierAuthentic(page('2 - VTE MARTEL / FOURNIER')), 'vente');
  assert.equal(app.sousDossierAuthentic(page('1 - Promesse VTE MARTEL/FOURNIER')), 'promesse');
  assert.equal(app.sousDossierAuthentic(page('3 - Avenant à promesse de vente')), 'avenant');
  assert.equal(app.sousDossierAuthentic(page("2 - Vente d'immeuble")), 'vente');
  assert.equal(app.sousDossierAuthentic(page('4 - Succession MARTEL')), 'succession');
  assert.equal(app.sousDossierAuthentic({ texte: 'Fiche client\nNom MARTEL' }), '');
});

test('page de vente sans dossier dans CLAIRE : création proposée, sauf acte signé ou sous-dossier promesse (étude, 03/10) ; succession aussi (16/10)', () => {
  const vente = { texte: 'A 2026 00017 VTE MARTEL / FOURNIER\n2 - VTE MARTEL / FOURNIER Importer avec 6e SENS\nComparants (2)' };
  assert.equal(app.proposerCreationDossierAuthentic(vente, 'VTE MARTEL / FOURNIER'), true);
  assert.equal(app.proposerCreationDossierAuthentic(gestion, '12 - Vente MARTEL/FOURNIER'), true, 'sans en-tête de sous-dossier : vente');
  assert.equal(app.proposerCreationDossierAuthentic(vente, 'Succession MARTEL'), true, 'succession aussi (étude 16/10)');
  assert.equal(app.proposerCreationDossierAuthentic(vente, ''), false);
  const promesse = { texte: 'A 2026 00017 VTE MARTEL / FOURNIER\n1 - Promesse VTE MARTEL/FOURNIER Importer avec 6e SENS\nComparants (2)' };
  assert.equal(app.proposerCreationDossierAuthentic(promesse, 'VTE MARTEL / FOURNIER'), false, 'sous-dossier promesse');
  const signe = { texte: vente.texte, champs: [{ groupe: 'Acte', libelle: 'État', valeur: 'Signé le 30/09/2026' }] };
  assert.equal(app.proposerCreationDossierAuthentic(signe, 'VTE MARTEL / FOURNIER'), false, 'acte signé : ancien dossier');
});

test('dossiersDepuisRelevesAuthentic : « à créer » sur une page de vente ou de succession en cours, pas sur un acte signé', () => {
  const g1 = app.dossiersDepuisRelevesAuthentic([{ recueLe: '2026-10-03T09:00:00Z', capture: gestion }])[0];
  assert.equal(g1.aCreer, true);
  const signe = Object.assign({}, gestion, { champs: gestion.champs.concat([{ groupe: 'Acte', libelle: 'État', valeur: 'Signé le 30/09/2026' }]) });
  assert.equal(app.dossiersDepuisRelevesAuthentic([{ recueLe: '2026-10-03T09:00:00Z', capture: signe }])[0].aCreer, false);
  const succ = { champs: [{ groupe: '', libelle: '4 - Succession MARTEL Importer avec 2e SENSComparants (1) personM. MARTEL Alexandre', valeur: '' }], tableaux: [], texte: '4 - Succession MARTEL\nComparants' };
  const gs = app.dossiersDepuisRelevesAuthentic([{ recueLe: '2026-10-03T09:00:00Z', capture: succ }])[0];
  assert.equal(gs.aCreer, true, 'succession à créer, comme une vente (étude 16/10)');
  assert.equal(app.typeAffaireAuthentic(gs.export), 'succession');
});

// Parcelles d'Authentic sur la fiche (étude 06/10 : « mets en place le 1 2 3 »).
test('fiche bien lue après la création : parcelles manquantes ajoutées, jamais à la place de celles déjà là', () => {
  const d = { id: 'v', nom: 'MARTEL / FOURNIER', adresseBien: 'VINEUIL (41350), 3 chemin des Vignes', historique: [],
    bien: { cadastre: { section: 'AB', numero: '123', parcelles: [{ section: 'AB', numero: '123' }] } } };
  const r = app.appliquerReleveSurDossier(d, bien, '2026-10-06T10:00:00Z');
  assert.ok(r.modifie);
  assert.equal(d.bien.cadastre.parcelles.map(p => p.section + p.numero).join(','), 'AB123,AB124');
  assert.match(d.historique.map(h => h.texte).join('\n'), /Parcelle relevée dans Authentic ajoutée : AB 124/);
  // Le type de bien de la fiche bien fait le type de vente (étude 06/10), dit dans l'historique.
  assert.equal(d.typeVente, 'maison');
  assert.match(d.historique.map(h => h.texte).join('\n'), /Type de vente : maison \(fiche bien Authentic ; avant : non renseigné\)/);
  // Relue : rien de neuf.
  assert.ok(!app.appliquerReleveSurDossier(d, bien, '2026-10-06T10:05:00Z').modifie);
  // Dossier sans cadastre : toutes les parcelles.
  const vide = { id: 'w', nom: 'X', adresseBien: '', historique: [] };
  app.appliquerReleveSurDossier(vide, bien);
  assert.equal(vide.bien.cadastre.parcelles.length, 2);
});

test('fiche bien d’une autre commune ou d’une autre adresse : rien n’est ajouté, le motif est dit', () => {
  const autreCp = { id: 'a', nom: 'X', adresseBien: 'BLOIS (41000), 3 chemin des Vignes', historique: [] };
  const r1 = app.appliquerReleveSurDossier(autreCp, bien);
  assert.ok(!r1.modifie);
  assert.match(r1.raison, /autre commune/);
  const autreRue = { id: 'b', nom: 'X', adresseBien: 'VINEUIL (41350), 12 rue des Écoles', historique: [] };
  const r2 = app.appliquerReleveSurDossier(autreRue, bien);
  assert.ok(!r2.modifie);
  assert.match(r2.raison, /autre adresse/);
});

test('création depuis Authentic : parcelles gardées sans adresse, et celles de tous les biens', () => {
  const ex = { immeubles: [
    { id: 'i1', adresse: null, parcelles: [{ section: 'AB', numero: '123' }] },
    { id: 'i2', adresse: null, parcelles: [{ section: 'ZC', numero: '7' }, { section: 'AB', numero: '123' }] }
  ], biens: ['i1', 'i2'], personnes: [], parties: [] };
  const extraction = app.completerExtractionDepuisAuthentic({ champs: {} }, ex);
  assert.equal(extraction.bien.cadastre.parcelles.map(p => p.section + p.numero).join(','), 'AB123,ZC7');
  assert.equal(extraction.bien.cadastre.section, 'AB');
});

// ---- Copropriété (structure reçue de l'étude le 06/10 : onglet « Informations du bien » avec « Parcelle Assise volumétrique »,
// onglet « Lots » avec le tableau des lots et le détail du lot ouvert ; noms et chiffres inventés) ----
const IDC = 'ui-ficho-tabs:mainTabPanel:tabForm99:tabContent:ficheImmeubleTabView:';
const coproInfos = {
  titre: 'Authentic',
  champs: [
    { groupe: 'Informations du bien', libelle: IDC + 'infosComponent:ficheImmeubleIdentite:typeWithDialog:selectOneMenu_input', valeur: 'Appartement' },
    { groupe: 'Informations du bien', libelle: 'N° de voie', valeur: '9' },
    { groupe: 'Informations du bien', libelle: 'Type de voie', valeur: 'rue' },
    { groupe: 'Informations du bien', libelle: 'Nom de la voie', valeur: 'des Tilleuls' },
    { groupe: 'Informations du bien', libelle: 'CP - Ville*', valeur: '41000 BLOIS' }
  ],
  tableaux: [{ titre: 'Parcelle Assise volumétrique', entete: ['Commune', 'Préfixe', 'Section', 'Numéro', 'Adresse ou lieu-dit', 'Nature', 'Zone urbanisme', 'SPF', 'surface', ''],
    lignes: [['BLOIS', '', 'DK', '412', '9 rue des Tilleuls', '', '', 'BLOIS 1', '1250', '']] }],
  texte: ''
};
const coproLots = {
  titre: 'Authentic',
  champs: [
    { groupe: '', libelle: 'Rechercher', valeur: '' },
    { groupe: '', libelle: IDC + 'lotsComponent:listeLotComponent:coproLotDatatable:selectAllCheckbox_input', valeur: 'non' },
    { groupe: '', libelle: 'Total Tantièmes immeuble', valeur: '10 000' },
    { groupe: '', libelle: IDC + 'lotsComponent:lotDetailsComponent:detailsTabView:infoGeneralComponent:type:selectonemenu_input', valeur: 'Appartement' },
    { groupe: '', libelle: 'Désignation', valeur: 'Appartement deux pièces' },
    { groupe: '', libelle: 'N° de lot', valeur: '12' },
    { groupe: '', libelle: 'Tantièmes lot', valeur: '125' },
    { groupe: '', libelle: 'Etage', valeur: '3' },
    { groupe: '', libelle: 'Surface m²', valeur: '48,20' },
    { groupe: '', libelle: 'Surface carrez', valeur: '46,80' }
  ],
  tableaux: [{ titre: 'Liste des lots', entete: ['', 'N°Filter by N°', 'Ancien N°Filter by Ancien N°', 'TypeFilter by Type', 'BâtimentFilter by Bâtiment', 'EtageFilter by Etage', 'EntréeFilter by Entrée', 'Tantièmes lot', '', ''],
    lignes: [['', 'Total Tantièmes immeuble', '10 000', ''], ['non', '12', '', 'Appartement', '', '3', '', '125', '', 'Enregistrer et quitter'], ['non', '34', '', 'Cave', 'A', '-1', '', '8', '', '']] }],
  texte: ''
};

test('copropriété : fiche bien avec assise volumétrique, page des lots (tableau + détail du lot ouvert), type copropriété', () => {
  const infos = app.bienDepuisFicheAuthentic(coproInfos);
  assert.equal(infos.type, 'copropriete');
  assert.equal(infos.adresse.texte, '9 rue des Tilleuls 41000 BLOIS');
  assert.equal(infos.parcelles.map(p => p.section + p.numero).join(','), 'DK412');
  assert.equal(infos.lots.length, 0);
  const lots = app.bienDepuisFicheAuthentic(coproLots);
  assert.equal(lots.type, 'copropriete');
  assert.equal(lots.adresse, null);
  assert.equal(lots.tantiemesTotal, 10000);
  assert.equal(lots.lots.map(l => `${l.numero}:${l.type}:${l.etage}:${l.tantiemes}`).join(' | '), '12:Appartement:3:125 | 34:Cave:-1:8');
  const lot12 = lots.lots[0];
  assert.equal(lot12.designation, 'Appartement deux pièces');
  assert.equal(lot12.surface, 48.2);
  assert.equal(lot12.surfaceCarrez, 46.8);
  assert.equal(lot12.batiment, null);
  assert.equal(lots.lots[1].batiment, 'A');
});

test('copropriété : les deux pages d’un même dossier font UN bien (lots fusionnés), repris à la création', () => {
  const releves = [
    { recueLe: '2026-10-06T09:00:00Z', capture: gestion },
    { recueLe: '2026-10-06T09:01:00Z', capture: coproInfos },
    { recueLe: '2026-10-06T09:02:00Z', capture: coproLots }
  ];
  const ex = app.dossiersDepuisRelevesAuthentic(releves)[0].export;
  assert.equal(ex.immeubles.length, 1);
  assert.equal(ex.immeubles[0].adresse.texte, '9 rue des Tilleuls 41000 BLOIS');
  assert.equal(ex.immeubles[0].lots.length, 2);
  assert.equal(ex.immeubles[0].tantiemesTotal, 10000);
  const l = app.lotsExportAuthentic(ex);
  assert.equal(l.lots.map(x => x.numero).join(','), '12,34');
  assert.equal(l.tantiemesTotal, 10000);
  const extraction = app.completerExtractionDepuisAuthentic({ champs: {} }, ex);
  assert.equal(extraction.champs.typeVente.valeur, 'copropriete');
  assert.equal(extraction.bien.lots.length, 2);
  assert.equal(extraction.bien.cadastre.parcelles[0].section, 'DK');
  // Ce que la fiche garde de l'extraction : les lots passent la normalisation et l'instantané.
  const norm = app.normaliserExtractionImportee({ bien: extraction.bien });
  assert.equal(norm.bien.lots.length, 2);
  assert.equal(norm.bien.tantiemesTotal, 10000);
  const inst = app.instantaneExtraction({ bien: extraction.bien, champs: {}, notaires: {} });
  assert.equal(inst.bien.lots.length, 2);
});

test('copropriété : page des lots appliquée sur un dossier existant — lots ajoutés, type passé en copropriété, jamais retirés', () => {
  const d = { id: 'c', nom: 'MARTEL / FOURNIER', typeVente: 'maison', bien: { cadastre: { section: 'DK', numero: '412', parcelles: [{ section: 'DK', numero: '412' }] } }, pieces: {}, historique: [] };
  const r = app.appliquerReleveSurDossier(d, coproLots, '2026-10-06T10:00:00Z');
  assert.equal(r.modifie, true);
  assert.equal(d.typeVente, 'copropriete');
  assert.equal(d.bien.lots.map(l => l.numero).join(','), '12,34');
  assert.equal(d.bien.tantiemesTotal, 10000);
  assert.ok(d.historique.some(h => /Lots de copropriété relevés dans Authentic : n° 12 \(Appartement\), n° 34 \(Cave\)/.test(h.texte)));
  assert.ok(d.historique.some(h => /Type de vente passé en copropriété/.test(h.texte)));
  // Relue : rien de neuf.
  const r2 = app.appliquerReleveSurDossier(d, coproLots, '2026-10-06T10:05:00Z');
  assert.equal(r2.modifie, false);
  // Libellé sur la fiche.
  assert.equal(app.libelleLotCopropriete(d.bien.lots[0], d.bien.tantiemesTotal), 'Lot n° 12 — Appartement, 3e étage, 46,8 m² Carrez, 125/10 000 tantièmes');
  assert.equal(app.libelleLotCopropriete({ numero: '7' }, null), 'Lot n° 7');
});

test('« Importer avec 6e SENS » (bouton d’Authentic collé à l’intitulé) n’entre jamais dans un nom de dossier (étude 06/10)', () => {
  assert.equal(app.intituleVenteNormalise('Vente MARTEL/FOURNIER Importer avec 6e SENS'), 'Vente MARTEL / FOURNIER');
  assert.equal(app.intituleVenteNormalise('VTE MARTEL / FOURNIER Importer avec 2e SENSComparants (3)'), 'Vente MARTEL / FOURNIER');
  assert.equal(app.intituleVenteNormalise('Succession DUPONT Jean Importer avec 2e SENS'), 'Succession DUPONT Jean');
  assert.equal(app.intituleVenteNormalise('Vente MARTEL/FOURNIER Importer'), 'Vente MARTEL / FOURNIER');
  assert.equal(app.intituleVenteNormalise('Vente IMPORTERAND / ROUX'), 'Vente IMPORTERAND / ROUX', 'un nom qui commence par Importer reste');
  // Onglet actif dont le titre porte le bouton : l'intitulé retenu est propre.
  const capture = { onglets: [{ titre: '12 - Vente MARTEL/FOURNIER Importer avec 6e SENS', actif: true }], champs: [], tableaux: [], texte: '' };
  assert.equal(app.intituleNumeroteAuthentic(capture).intitule, 'Vente MARTEL / FOURNIER');
  // Dossier créé avant la correction : nom nettoyé une fois, historique posé, intitulés retenus aussi.
  const d = { id: 'x', nom: 'MARTEL / FOURNIER Importer avec 6e SENS', intitulesAuthentic: ['vente martel / fournier importer avec 6e sens'], historique: [] };
  assert.equal(app.retirerImporterAuthentic(d), true);
  assert.equal(d.nom, 'MARTEL / FOURNIER');
  assert.equal(d.intitulesAuthentic[0], 'vente martel / fournier');
  assert.match(d.historique[0].texte, /Nom du dossier nettoyé/);
  assert.equal(app.retirerImporterAuthentic(d), false, 'rien à refaire');
  assert.equal(app.retirerImporterAuthentic({ nom: 'MARTEL / FOURNIER' }), false);
});

test('complementDossierDepuisAuthentic (06/10) : personnes, emails, téléphones, bien, prix, référence — Authentic fait foi pour adresse et prix', () => {
  const donnees = { intitule: 'Vente MARTEL / FOURNIER', reference: 'A 2026 00247', origine: 'pages',
    personnes: [
      { id: 'p1', nom: 'MARTEL', prenom: 'Alexandre', civilite: 'M', emails: ['martel@exemple.fr'], telephones: ['06 00 00 00 01'] },
      { id: 'p2', nom: 'FOURNIER', prenom: 'Camille', civilite: 'Mme', emails: ['fournier@exemple.fr'], telephones: [] }
    ],
    immeubles: [{ id: 'b1', adresse: { texte: '12 rue des Lices 41000 BLOIS', codePostal: '41000', commune: 'BLOIS', nomVoie: 'des Lices', numero: '12' }, type: 'maison', parcelles: [{ section: 'AB', numero: '12' }], lots: [] }],
    biens: ['b1'], parties: [], documents: [], infosAuthentic: { prix: 245000 } };
  // Fiche vide d'un côté (placeholder « Prénom NOM »), acquéreur déjà saisi : seul le vendeur est ajouté.
  const d = { id: 'c1', nom: 'MARTEL / FOURNIER', parties: [{ role: 'VENDEUR', nom: '', prenom: '' }, { role: 'ACQUEREUR', nom: 'FOURNIER', prenom: 'Camille' }], emailAcquereur: 'autre@exemple.fr', adresseBien: '', prixVente: null, historique: [] };
  const textes = app.complementDossierDepuisAuthentic(d, donnees, [d]);
  assert.equal(d.parties.filter(p => p.role === 'VENDEUR').length, 1);
  assert.equal(d.parties.find(p => p.role === 'VENDEUR').nom, 'Alexandre MARTEL');
  assert.equal(d.parties.filter(p => p.role === 'ACQUEREUR').length, 1, 'acquéreur déjà présent : pas de doublon');
  assert.equal(d.emailVendeur, 'martel@exemple.fr');
  assert.equal(d.emailAcquereur, 'fournier@exemple.fr', 'Authentic d’abord : son email remplace celui de la fiche');
  assert.equal(d.telephoneVendeur, '06 00 00 00 01');
  assert.equal(d.adresseBien, app.normaliserAdresse('12 rue des Lices 41000 BLOIS'));
  assert.equal(d.typeVente, 'maison');
  assert.equal(d.bien.cadastre.parcelles.length, 1);
  assert.equal(d.prixVente, 245000);
  assert.equal(d.referenceAuthentic, 'A 2026 00247');
  assert.match(textes.join(' | '), /1 vendeur \(Alexandre MARTEL\)/);
  assert.match(textes.join(' | '), /email du vendeur/);
  // Une seconde fois : rien à faire.
  assert.equal(app.complementDossierDepuisAuthentic(d, donnees, [d]).length, 0);
  // Authentic fait foi (étude 06/10) : adresse, prix et type de bien (fiche bien) différents → remplacés, l'ancienne valeur
  // dite dans l'historique.
  const plein = { id: 'c2', nom: 'MARTEL / FOURNIER', parties: [{ role: 'VENDEUR', nom: 'MARTEL' }, { role: 'ACQUEREUR', nom: 'FOURNIER' }], adresseBien: 'TOURS (37000), 1 rue Nationale', prixVente: 100, typeVente: 'copropriete', historique: [] };
  const remplaces = app.complementDossierDepuisAuthentic(plein, donnees, [plein]).join(' | ');
  assert.equal(plein.adresseBien, app.normaliserAdresse('12 rue des Lices 41000 BLOIS'));
  assert.match(remplaces, /adresse du bien \(avant : TOURS \(37000\), 1 rue Nationale\)/);
  assert.equal(plein.prixVente, 245000);
  assert.match(remplaces, /prix \(avant : 100,00.€\)/);
  assert.equal(plein.typeVente, 'maison');
  assert.match(remplaces, /type de vente \(avant : copropriété\)/);
  assert.equal(app.complementDossierDepuisAuthentic(plein, donnees, [plein]).length, 0, 'relu : stable, pas de réécriture');
  // Jamais pour une succession ni quand Authentic ne dit pas le type.
  assert.equal(app.appliquerTypeBienAuthentic({ typeAffaire: 'succession', typeVente: '' }, 'maison'), '');
  assert.equal(app.appliquerTypeBienAuthentic({ typeVente: 'copropriete' }, null), '');
  assert.equal(app.appliquerTypeBienAuthentic({ typeVente: 'maison' }, 'maison'), '');
});

test('indexGroupeAuthenticPourDossier : par la référence, sinon par les noms de l’intitulé', () => {
  const groupes = [{ intitule: 'Vente DURAND / PETIT', reference: 'A 2026 00001' }, { intitule: 'Vente MARTEL / FOURNIER', reference: 'A 2026 00247' }];
  assert.equal(app.indexGroupeAuthenticPourDossier({ nom: 'X / Y', referenceAuthentic: 'A 2026 00247' }, groupes), 1);
  assert.equal(app.indexGroupeAuthenticPourDossier({ nom: 'DURAND / PETIT' }, groupes), 0);
  assert.equal(app.indexGroupeAuthenticPourDossier({ nom: 'Époux MARTEL / FOURNIER Camille' }, groupes), 1);
  assert.equal(app.indexGroupeAuthenticPourDossier({ nom: 'ROUX / BLANC' }, groupes), -1);
  assert.equal(app.indexGroupeAuthenticPourDossier({ nom: '' }, groupes), -1);
});

test('coordonnées de la fiche : ni email ni téléphone du vendeur quand son notaire l’accompagne (étude 06/10)', () => {
  const seul = app.coordonneesPartiesDossier({ emailVendeur: 'v@exemple.fr', telephoneVendeur: '06', emailAcquereur: 'a@exemple.fr' });
  assert.equal(seul.map(c => c.partie).join(','), 'vendeur,acquereur');
  const represente = app.coordonneesPartiesDossier({ notaireVendeur: 'Maître Paul DUPUIS (Tours)', emailVendeur: 'v@exemple.fr', telephoneVendeur: '06', emailAcquereur: 'a@exemple.fr' });
  assert.equal(represente.map(c => c.partie).join(','), 'acquereur');
  assert.equal(app.coordonneesPartiesDossier({ notaireVendeur: 'Maître Sophie GOSSART (BLOIS)', emailVendeur: 'v@exemple.fr' }).length, 2, 'notre office : vendeur affiché');
});

// Étude 06/10 : « on prend toujours de base les données d'Authentic, avant et après la création d'un dossier ; un numéro
// ajouté à la fiche Authentic, l'état civil, le nom, le prénom… se retrouvent sur la fiche. »
test('fiche client (06/10) : identité de la partie alignée sur Authentic — prénom, civilité, date de naissance ; conjoint ajouté', () => {
  const d = { id: 'i1', nom: 'MARTEL / FOURNIER', typeVente: 'maison', parties: [{ role: 'VENDEUR', nom: 'MARTEL' }, { role: 'ACQUEREUR', nom: 'FOURNIER' }], pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(d, client);
  const acq = d.parties.find(p => p.role === 'ACQUEREUR');
  assert.equal(acq.nom, 'Camille FOURNIER', 'prénom repris dans le nom');
  assert.equal(acq.civilite, 'Mme');
  assert.equal(acq.dateNaissance, '1985-02-14');
  assert.equal(d.parties.length, 2, 'pas de doublon');
  assert.match(d.historique.map(h => h.texte).join('\n'), /Acquéreur : FOURNIER → Camille FOURNIER \(fiche Authentic\)/);
  const nb = d.historique.length;
  app.appliquerReleveSurDossier(d, client);
  assert.equal(d.historique.length, nb, 'relue : rien à redire');
  assert.equal(acq.nom, 'Camille FOURNIER');
  // Une partie saisie « Camille FOURNIER » avec sa civilité ne bouge pas ; une civilité différente suit Authentic.
  const e = { id: 'i2', nom: 'MARTEL / FOURNIER', parties: [{ role: 'ACQUEREUR', nom: 'Camille FOURNIER', civilite: 'M' }], pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(e, client);
  assert.equal(e.parties[0].civilite, 'Mme');
  assert.equal(e.parties.length, 1);
  // Fiche sans aucune partie : la personne entre sur la fiche du côté que dit le nom du dossier.
  const f = { id: 'i3', nom: 'MARTEL / FOURNIER', pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(f, client);
  assert.equal(f.parties.map(p => p.role + ':' + p.nom).join(','), 'ACQUEREUR:Camille FOURNIER');
  // Deux homonymes sans prénom du même côté : jamais deviné.
  const g = { id: 'i4', nom: 'MARTEL / FOURNIER', parties: [{ role: 'ACQUEREUR', nom: 'FOURNIER' }, { role: 'ACQUEREUR', nom: 'FOURNIER' }], pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(g, client);
  assert.equal(g.parties.filter(p => p.nom === 'FOURNIER').length, 2);
});

test('page de gestion (06/10) : la fiche se complète seule depuis Authentic — personnes, bien, référence ; rien n’est remplacé', () => {
  const page = Object.assign({}, gestion, { texte: 'A 2026 00451 VTE MARTEL / FOURNIER\n' + (gestion.texte || '') });
  const d = { id: 'g1', nom: 'MARTEL / FOURNIER', typeVente: 'maison', parties: [{ role: 'VENDEUR', nom: '', prenom: '' }], pieces: {}, historique: [] };
  const r = app.appliquerReleveSurDossier(d, page, '2026-10-06T10:00:00Z', [d]);
  assert.equal(r.modifie, true);
  // Une page de gestion seule ne porte pas les personnes (elles viennent des fiches client relevées, reprises par
  // completerDossierDepuisRelevesRecents sur tout le groupe) : ici la référence est retenue, la ligne vide reste.
  assert.equal(d.referenceAuthentic, 'A 2026 00451');
  assert.match(d.historique.map(h => h.texte).join('\n'), /Complété depuis Authentic : référence Authentic/);
  const nbHist = d.historique.length;
  app.appliquerReleveSurDossier(d, page, '2026-10-06T11:00:00Z', [d]);
  assert.ok(!d.historique.slice(nbHist).some(h => /Complété depuis Authentic/.test(h.texte)), 'relue : rien à compléter');
  // Le groupe des relevés (gestion + fiche client) apporte les personnes : même reprise, par la référence d'abord.
  const groupes = app.dossiersDepuisRelevesAuthentic([{ recueLe: '2026-10-06T10:00:00Z', capture: page }, { recueLe: '2026-10-06T10:01:00Z', capture: client }, { recueLe: '2026-10-06T10:02:00Z', capture: clientMarie }]);
  const g = app.groupeAuthenticPourComplementAuto(d, groupes, [d]);
  assert.ok(g && g.reference === 'A 2026 00451', 'groupe retrouvé par la référence');
  const textes = app.complementDossierDepuisAuthentic(d, g.export, [d]);
  assert.ok(d.parties.some(p => p.role === 'VENDEUR' && /MARTEL/.test(p.nom)), 'vendeur repris : ' + JSON.stringify(d.parties));
  assert.ok(d.parties.some(p => p.role === 'ACQUEREUR' && /FOURNIER/.test(p.nom)), 'acquéreur repris');
  assert.ok(!d.parties.some(p => !String(p.nom || '').trim()), 'la ligne vide a cédé la place');
  assert.match(textes.join(', '), /vendeur/);
  assert.equal(app.complementDossierDepuisAuthentic(d, g.export, [d]).length, 0, 'relu : rien');
  // Fiche rattachée à une AUTRE référence : jamais complétée depuis ce dossier d'Authentic, même aux mêmes noms.
  assert.equal(app.groupeAuthenticPourComplementAuto({ id: 'x', nom: 'MARTEL / FOURNIER', referenceAuthentic: 'A 2025 00001' }, groupes, []), null);
  // Sans référence : par les noms, sauf si la référence trouvée est déjà celle d'une autre fiche.
  assert.ok(app.groupeAuthenticPourComplementAuto({ id: 'y', nom: 'MARTEL / FOURNIER' }, groupes, []));
  assert.equal(app.groupeAuthenticPourComplementAuto({ id: 'y', nom: 'MARTEL / FOURNIER' }, groupes, [{ id: 'z', referenceAuthentic: 'A 2026 00451' }]), null);
  // Fiche déjà remplie : la main de l'étude gagne.
  const e = { id: 'g2', nom: 'MARTEL / FOURNIER', typeVente: 'copropriete', adresseBien: 'TOURS (37000), 1 rue Nationale', prixVente: 100, parties: [{ role: 'VENDEUR', nom: 'Alexandre MARTEL' }, { role: 'ACQUEREUR', nom: 'Camille FOURNIER' }], pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(e, page, '2026-10-06T10:00:00Z', [e]);
  assert.equal(e.adresseBien, 'TOURS (37000), 1 rue Nationale');
  assert.equal(e.prixVente, 100);
  assert.equal(e.typeVente, 'copropriete');
});


test('tableau « Rédaction » d’Authentic (étude 07/10) : « Non rédigé » → à rédiger, « En cours » → rédaction commencée, signé avant tout', () => {
  const page = (etat, extra) => ({ titre: 'Authentic', champs: [], texte: '2 - VTE MARTEL / FOURNIER',
    tableaux: [{ titre: 'Rédaction', entete: [], lignes: [['Vente MARTEL / FOURNIER', '', etat]].concat(extra || []) }] });
  assert.strictEqual(app.etatActeAuthentic(page('Non rédigé')).etat, 'a_rediger');
  assert.strictEqual(app.etatActeAuthentic(page('En cours')).etat, 'redaction');
  // Une procuration en cours ne dit rien de l'acte de vente.
  assert.strictEqual(app.etatActeAuthentic(page('Non rédigé', [['Procuration pour vendre', '', 'En cours']])).etat, 'a_rediger');
  // « En cours » hors du tableau Rédaction (une réquisition…) : rien.
  const ailleurs = { titre: 'Authentic', champs: [], texte: '', tableaux: [{ titre: 'Réquisitions', entete: [], lignes: [['Réquisition', '01/09/2026', 'En cours']] }] };
  assert.strictEqual(app.etatActeAuthentic(ailleurs), null);
  // Signé le … reste prioritaire.
  const signe = page('Signé le 29/09/2026');
  signe.tableaux[0].lignes[0] = ['Vente MARTEL / FOURNIER', '29/09/2026', 'Signé le 29/09/2026'];
  assert.strictEqual(app.etatActeAuthentic(signe).etat, 'signe');
});

test('rédaction (étude 07/10) : « En cours » dans Authentic coche l’étape (tâche faite par CLAIRE), « Non rédigé » ne coche rien', () => {
  const page = (etat) => ({ titre: 'Authentic', champs: [{ groupe: '', libelle: '12 - Vente MARTEL/FOURNIER Importer', valeur: '' }],
    texte: '12 - Vente MARTEL/FOURNIER', tableaux: [{ titre: 'Rédaction', entete: [], lignes: [['Vente MARTEL / FOURNIER', '', etat]] }] });
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', typeVente: 'maison', pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(d, page('Non rédigé'), '2026-10-07T09:00:00.000Z');
  assert.equal(d.authentic.acte.etat, 'a_rediger');
  assert.equal(app.echeanceValidee(d, 'redaction'), false);
  assert.ok(!(d.echeancesValidees || {}).redaction);
  app.appliquerReleveSurDossier(d, page('En cours'), '2026-10-07T10:00:00.000Z');
  assert.equal(d.echeancesValidees.redaction, true);
  assert.equal(app.echeanceValidee(d, 'redaction'), true);
  assert.ok(d.historique.some(h => h.texte === 'Rédaction de l’acte marquée réalisée (en cours dans Authentic)' && !h.auteur));
  // Décochée à la main : retenue malgré « En cours » ; Authentic revenu à « Non rédigé » : décochée.
  d.echeancesValidees.redaction = false;
  assert.equal(app.echeanceValidee(d, 'redaction'), false);
  app.appliquerReleveSurDossier(d, page('Non rédigé'), '2026-10-07T11:00:00.000Z');
  assert.equal(d.echeancesValidees.redaction, undefined);
  assert.equal(app.echeanceValidee(d, 'redaction'), false);
  // En participation : jamais coché par Authentic.
  const p = { id: 'b', nom: 'MARTEL / FOURNIER', typeVente: 'maison', roleNotaire: 'participant', pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(p, page('En cours'), '2026-10-07T10:00:00.000Z');
  assert.ok(!(p.echeancesValidees || {}).redaction);
});

test('comparants du sous-dossier : lus sur la page, une personne reprise d’une fiche client et absente des comparants est retirée', () => {
  // Étude 09/10 : vendeuse seule propriétaire à qui son mari avait été ajouté, acquéreuse seule à qui son partenaire pacsé l'avait été.
  const page = { champs: [], tableaux: [], texte: '3 - VTE LEBRUN / MARCHAND\nComparants (2)\nMme LEBRUN Agathe\nVendeur\nMme MARCHAND Sylvie\nAcquéreur\nInformations financières\nCapital\n180 000,00 €\nImmeubles (1)' };
  assert.equal(app.comparantsAuthentic(page).map(c => c.nom + '=' + c.role).join(' ; '), 'LEBRUN Agathe=VENDEUR ; MARCHAND Sylvie=ACQUEREUR');
  assert.equal(app.comparantsAuthentic({ texte: 'Comparants (3)\nM. MARTEL Alexandre et Mme MARTEL Nadia\nVendeur\nMme FOURNIER Camille\nAcquéreur\nImmeubles' }).map(c => c.nom).join(','), 'MARTEL Alexandre,MARTEL Nadia,FOURNIER Camille');
  const d = { id: 'd1', nom: 'LEBRUN / MARCHAND', parties: [
    { nom: 'Agathe LEBRUN', role: 'VENDEUR' }, { nom: 'Karim OUALI', role: 'VENDEUR', origine: 'authentic' },
    { nom: 'MARCHAND', role: 'ACQUEREUR' }, { nom: 'Paul VIDAL', role: 'ACQUEREUR', origine: 'authentic' }],
    situationVendeur: 'marie', situationAcquereur: 'pacse', historique: [], pieces: {},
    authentic: { valeurs: { situationVendeur: 'marie', situationAcquereur: 'pacse' }, personnes: [{ nom: 'Karim OUALI', role: 'VENDEUR' }] } };
  app.appliquerReleveSurDossier(d, page);
  assert.equal(d.parties.map(p => p.nom).join(' | '), 'Agathe LEBRUN | MARCHAND');
  assert.equal(d.situationVendeur, undefined);
  assert.equal(d.situationAcquereur, undefined);
  assert.equal(d.authentic.personnes.length, 0);
  assert.equal(app.authenticPersistable(d.authentic).comparants.length, 2);
  // Une page coupée (un seul côté lu) ne retire personne.
  const e = { parties: [{ nom: 'Karim OUALI', role: 'VENDEUR', origine: 'authentic' }], authentic: { comparants: [{ nom: 'LEBRUN Agathe', role: 'VENDEUR' }] } };
  assert.equal(app.retirerPartiesHorsComparants(e, () => {}), false);
});

test('comparantsAuthentic : un couple « M. X et Mme Y » vend à deux, l’acquéreur seul reste seul (qualité en fin de ligne ou « et » coupé)', () => {
  const app = chargerApplication();
  const attendu = 'CHAHUNEAU Alain:VENDEUR,BARBIER Catherine:VENDEUR,LEBERT Elodie:ACQUEREUR';
  const lire = (texte) => app.comparantsAuthentic({ texte }).map(c => `${c.nom}:${c.role}`).join(',');
  assert.equal(lire('Comparants\nM. CHAHUNEAU Alain et Mme BARBIER Catherine\nVendeur\nMme LEBERT Elodie\nAcquéreur\nImmeubles'), attendu);
  assert.equal(lire('Comparants\nM. CHAHUNEAU Alain et Mme BARBIER Catherine Vendeur\nMme LEBERT Elodie Acquéreur\nImmeubles'), attendu);
  assert.equal(lire('Comparants\nM. CHAHUNEAU Alain\net Mme BARBIER Catherine\nVendeur\nMme LEBERT Elodie\nAcquéreur\nImmeubles'), attendu);
});

test('comparantsAuthentic : « épouse de / époux de / veuve de / divorcé de » — la personne est seule, son conjoint cité n’est comparant que s’il est listé à part', () => {
  const lire = (texte) => app.comparantsAuthentic({ texte }).map(c => `${c.nom}:${c.role}`).join(',');
  assert.equal(lire('Comparants\nMme LEBERT Elodie épouse de M. DUPONT Paul\nAcquéreur\nM. MARTIN Luc veuf de Mme MARTIN Anne\nVendeur\nImmeubles'), 'LEBERT Elodie:ACQUEREUR,MARTIN Luc:VENDEUR');
  assert.equal(lire('Comparants\nMme LEBRUN Agathe divorcée de M. LEBRUN Jean\nVendeur\nMme MARCHAND Sylvie veuve de M. MARCHAND Henri\nAcquéreur\nImmeubles'), 'LEBRUN Agathe:VENDEUR,MARCHAND Sylvie:ACQUEREUR');
  // le conjoint listé lui-même en dessous est comparant
  assert.equal(lire('Comparants\nMme LEBERT Elodie épouse de M. DUPONT Paul\nAcquéreur\nM. DUPONT Paul\nAcquéreur\nImmeubles'), 'LEBERT Elodie:ACQUEREUR,DUPONT Paul:ACQUEREUR');
});

test('comparantsAuthentic : une personne notée « Autre intervenant » n’est ni vendeur ni acquéreur et ne fausse pas la qualité suivante', () => {
  const lire = (texte) => app.comparantsAuthentic({ texte }).map(c => `${c.nom}:${c.role}`).join(',');
  assert.equal(lire('Comparants\nM. LEBRUN Jean\nAutre intervenant\nMme MARCHAND Sylvie\nAcquéreur\nM. MARTEL Luc\nVendeur\nImmeubles'), 'MARCHAND Sylvie:ACQUEREUR,MARTEL Luc:VENDEUR');
  assert.equal(lire('Comparants\nM. LEBRUN Jean Autre intervenant\nMme MARCHAND Sylvie Acquéreur\nImmeubles'), 'MARCHAND Sylvie:ACQUEREUR');
});

test('SAFER : l’analyse dit « non » (zone U…) → ni délai SAFER ni attente, même si Authentic a une notification', () => {
  const d = { id: 'u', nom: 'DUPONT / MARTIN', typeVente: 'maison', authentic: { safer: { envoyeeLe: '2026-08-03', priseEnCompteLe: '2026-08-03' } } };
  assert.equal(app.saferLevee(d), false);
  assert.equal(app.echeanceSaferDossier(d), '2026-10-03');
  d.preemption = { droits: [{ cle: 'safer', titre: 'SAFER', statut: 'non', motif: 'zone U' }] };
  assert.equal(app.saferNonApplicable(d), true);
  assert.equal(app.saferLevee(d), true);
  assert.equal(app.echeanceSaferDossier(d), '');
  d.preemption.droits[0].statut = 'oui';
  assert.equal(app.saferLevee(d), false);
});

test('Authentic : une pièce « Prêt pour envoi » ou « Envoyé » n’est jamais reçue (étude 14/10)', () => {
  ['Prêt pour envoi', 'Envoyé', 'Envoi en cours', 'Prêt pour l’envoi'].forEach(etat => {
    assert.equal(app.ligneAuthenticRecue({ titre: 'Acte de naissance', etat }), false, etat);
    assert.equal(app.etatEtatCivilAuthentic({ titre: 'ECV - Acte de naissance', etat, texte: '' }), 'attente', etat);
  });
  assert.equal(app.ligneAuthenticRecue({ titre: 'Acte de naissance', etat: 'Reçu' }), true);
  assert.equal(app.etatEtatCivilAuthentic({ titre: 'ECV - Acte de naissance', etat: 'Positif', texte: '' }), 'positif');
});

test('Authentic : DIA auprès de la SAFER, envoyée le 10/08 et non-préemption reçue le 13/10 (étude 14/10)', () => {
  const titre = 'Formulaire A - DIA auprès de la safer Centre';
  const ligne = { titre, date: '2026-08-10', dates: ['2026-08-10', '2026-10-13'], etat: 'Non préemption SAFER', texte: titre + ' · 10/08/2026 · 13/10/2026 · Non préemption SAFER' };
  const s = app.suiviSaferAuthentic([ligne]);
  assert.equal(s.envoyeeLe, '2026-08-10');
  assert.equal(s.creeeLe, '');
  assert.equal(s.decision, 'non_preemption');
  assert.equal(s.decisionLe, '2026-10-13');
  // Pièce « Réponse SAFER » reçue, jamais une demande de renonciation de la mairie.
  assert.equal(app.piecesRecuesAuthentic([ligne], [], 'vente').map(p => p.label).join(), 'Réponse SAFER');
  assert.equal(Object.keys(app.demandesUrbanismeAuthentic([ligne])).length, 0);
  // Une ligne « pris en compte » à deux dates garde création puis envoi (étude 02/10).
  const pec = app.suiviSaferAuthentic([{ titre, dates: ['2026-08-01', '2026-08-10'], etat: 'Pris en compte', texte: titre + ' Pris en compte' }]);
  assert.equal(pec.envoyeeLe, '2026-08-10');
  assert.equal(pec.creeeLe, '2026-08-01');
});

test('fiche client ouverte avec le volet du conjoint : la personne de la fiche lue seule, le conjoint lu à part (structure du 16/10)', () => {
  const id = (s) => 'ui-ficho-tabs:mainTabPanel:tabForm9:tabContent:' + s;
  const capture = {
    champs: [
      { libelle: 'Rechercher', valeur: '' },
      { libelle: id('conjointComponent:ficheClientPhysiqueIdentite:etude_input'), valeur: 'oui' },
      { libelle: id('conjointComponent:ficheClientPhysiqueIdentite:civilite:selectOneRadio'), valeur: 'Madame' },
      { libelle: 'Nom de famille*', valeur: 'MARTEL' }, { libelle: 'Prénom*', valeur: 'Léa' },
      { libelle: id('conjointComponent:ficheClientPhysiqueIdentite:naissanceDate:naissanceDate'), valeur: '02/03/1980' },
      { libelle: 'CP, Ville (naissance)', valeur: '41000 BLOIS' }, { libelle: 'Profession', valeur: 'Infirmière' },
      { libelle: id('conjointComponent:contact:Telephone:inputTelephone'), valeur: '06 11 22 33 44' }, { libelle: 'Email', valeur: 'lea.martel@exemple.fr' },
      { libelle: id('tabView:ficheClientPhysiqueIdentite:etude_input'), valeur: 'oui' },
      { libelle: id('tabView:ficheClientPhysiqueIdentite:civilite:selectOneRadio'), valeur: 'Monsieur' },
      { libelle: 'Nom de famille*', valeur: 'MARTEL' }, { libelle: 'Prénom*', valeur: 'Paul' },
      { libelle: id('tabView:ficheClientPhysiqueIdentite:naissanceDate:naissanceDate'), valeur: '05/06/1978' },
      { libelle: 'CP, Ville (naissance)', valeur: '37000 TOURS' }, { libelle: 'Profession', valeur: 'Artisan' },
      { libelle: id('tabView:ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneePrincipaleW99:Telephone:inputTelephone'), valeur: '06 55 66 77 88' },
      { libelle: 'Email', valeur: 'paul.martel@exemple.fr' },
      { libelle: 'Date de mariage', valeur: '12/06/2010' },
      { libelle: id('tabView:ficheClientDetailRelation:somContratRegimeId:selectonemenu_input'), valeur: 'Communauté réduite aux acquêts' }
    ],
    tableaux: [{ titre: 'Historique des relations', entete: ['Situation', 'Date', 'Conjoint', ''], lignes: [['Marié(e)', '12/06/2010', 'Mme Léa MARTEL', '']] }],
    texte: ''
  };
  assert.equal(app.typePageAuthentic(capture), 'client');
  const p = app.clientDepuisFicheAuthentic(capture);
  assert.equal(`${p.prenom} ${p.nom} ${p.dateNaissance} ${p.profession}`, 'Paul MARTEL 1978-06-05 Artisan');
  assert.equal(p.emails.join(','), 'paul.martel@exemple.fr', 'pas l’email du conjoint');
  assert.equal(p.telephones.join(','), '06 55 66 77 88');
  const partage = app.partagerFicheConjointAuthentic(capture);
  assert.equal(app.typePageAuthentic(partage.conjoint), 'client');
  const c = app.clientDepuisFicheAuthentic(partage.conjoint);
  assert.equal(`${c.civilite} ${c.prenom} ${c.nom} ${c.dateNaissance} ${c.lieuNaissance} ${c.profession}`, 'Madame Léa MARTEL 1980-03-02 41000 BLOIS Infirmière');
  assert.equal(c.emails.join(','), 'lea.martel@exemple.fr');
  assert.equal(c.situationMatrimoniale.conjoint, 'Paul MARTEL');
  assert.equal(c.situationMatrimoniale.regime, 'Communauté réduite aux acquêts');
  // Les deux personnes entrent dans « Nouveau dossier › Depuis Authentic ».
  const g = app.dossiersDepuisRelevesAuthentic([{ recueLe: '2026-10-16T09:00:00Z', capture: Object.assign({ texte: '12 - VTE MARTEL / ROY\nComparants' }, { tableaux: [{ entete: ['Intitulé', 'Date', 'État'], lignes: [['Titre', '01/01/2026', 'Reçu']] }] }) },
    { recueLe: '2026-10-16T09:01:00Z', capture }]);
  const noms = g.flatMap(x => x.export.personnes.map(q => q.prenom)).sort().join(',');
  assert.ok(/Léa/.test(noms) && /Paul/.test(noms), noms);
  // Sans volet du conjoint : rien ne change.
  assert.equal(app.partagerFicheConjointAuthentic({ champs: capture.champs.slice(10) }), null);
});

test('volet du conjoint : l’état civil de l’autre vendeur est complété sur la fiche (étude 16/10)', () => {
  const id = (s) => 'ui-ficho-tabs:mainTabPanel:tabForm9:tabContent:' + s;
  const conjoint = { volet: 'conjoint', tableaux: [], texte: '', champs: [
    { libelle: id('conjointComponent:ficheClientPhysiqueIdentite:civilite:selectOneRadio'), valeur: 'Madame' },
    { libelle: 'Nom de famille*', valeur: 'MARTEL' }, { libelle: 'Prénom*', valeur: 'Léa' },
    { libelle: id('conjointComponent:ficheClientPhysiqueIdentite:naissanceDate:naissanceDate'), valeur: '02/03/1980' },
    { libelle: 'Email', valeur: 'lea.martel@exemple.fr' }] };
  const d = { id: 'v7', nom: 'MARTEL / ROY', parties: [{ role: 'VENDEUR', nom: 'Paul MARTEL' }, { role: 'VENDEUR', nom: 'Léa MARTEL' }, { role: 'ACQUEREUR', nom: 'ROY' }], pieces: {}, historique: [] };
  const r = app.appliquerReleveSurDossier(d, conjoint, '2026-10-16T09:00:00Z', [d]);
  assert.equal(r.modifie, true);
  const lea = d.parties.find(p => /Léa/.test(p.nom));
  assert.equal(lea.dateNaissance, '1980-03-02');
  assert.equal(lea.civilite, 'Mme');
});
