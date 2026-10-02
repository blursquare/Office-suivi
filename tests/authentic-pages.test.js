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
  const sa = app.suiviSaferAuthentic(app.lignesDocumentsAuthentic(gestionAttente));
  assert.equal([sa.notifieeLe, sa.priseEnCompteLe, sa.decision].join('|'), '2026-09-10|2026-09-15|');
  assert.equal(app.suiviSaferAuthentic(app.lignesDocumentsAuthentic(gestion)).decision, 'non_preemption');
  const rhf = app.suiviRhfAuthentic(app.lignesDocumentsAuthentic(gestionAttente));
  assert.equal([rhf.envoyeeLe, rhf.retourLe].join('|'), '2026-09-01|');
  const retour = app.suiviRhfAuthentic([{ titre: 'Réquisition hors formalité', dates: ['2026-09-01', '2026-09-12'], etat: 'Reçue', texte: 'Réquisition hors formalité · 01/09/2026 · 12/09/2026 · Reçue' }]);
  assert.equal(retour.retourLe, '2026-09-12');
  assert.equal(app.suiviRhfAuthentic(app.lignesDocumentsAuthentic(gestion)), null);
});

test('etatActeAuthentic, prixAuthentic, collaborateurAuthentic, notaireAuthentic', () => {
  assert.equal(app.etatActeAuthentic(gestionAttente).etat, 'redaction');
  assert.equal(app.etatActeAuthentic({ champs: [{ groupe: 'Acte', libelle: 'État', valeur: 'Acte signé le 30/09/2026' }] }).date, '2026-09-30');
  assert.equal(app.etatActeAuthentic({ champs: [{ groupe: 'Acte', libelle: 'État', valeur: 'Pas encore rédigé' }] }).etat, 'a_rediger');
  assert.equal(app.etatActeAuthentic(gestion), null);
  assert.equal(app.prixAuthentic(finances), 245000);
  assert.equal(app.collaborateurAuthentic(finances), 'Julie VASSELIN');
  assert.equal(app.notaireAuthentic(finances), 'Sophie GOSSART');
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
  assert.equal(d.authentic.safer.priseEnCompteLe, '2026-09-15');
  assert.equal(d.authentic.acte.etat, 'redaction');
  assert.equal(d.authentic.rhf.envoyeeLe, '2026-09-01');
  assert.equal(app.suiviSaferPiece(d), 'envoyée le 10 septembre 2026, prise en compte le 15 septembre 2026, sans réponse : non-préemption le 15 novembre 2026 (2 mois)');
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

test('appliquerReleveSurDossier : prix (Capital) seulement s’il manque ; collaborateur et notaire gardés', () => {
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', typeVente: 'maison', responsable: 'Bastien ANGLUMENT', pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(d, finances);
  assert.equal(d.prixVente, 245000);
  assert.equal(d.authentic.collaborateur, 'Julie VASSELIN');
  const lignes = app.lignesAuthenticDossier(d).map(l => l.libelle + ' = ' + l.valeur).join('\n');
  assert.match(lignes, /Collaborateur = Julie VASSELIN — fiche : Bastien ANGLUMENT/);
  assert.match(lignes, /Notaire = Sophie GOSSART/);
  const e = { id: 'b', nom: 'MARTEL / FOURNIER', typeVente: 'maison', prixVente: 250000, pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(e, finances);
  assert.equal(e.prixVente, 250000);
  assert.match(app.lignesAuthenticDossier(e).map(l => l.valeur).join('\n'), /fiche : 250\.000,00.€, à vérifier/);
});

test('appliquerReleveSurDossier : fiche client → téléphone, email, situation matrimoniale de la bonne partie', () => {
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', typeVente: 'maison', telephoneAcquereur: '0612345678', pieces: {}, historique: [] };
  // FOURNIER = acquéreur d'après le nom du dossier ; son numéro est déjà connu, l'autre est ajouté.
  app.appliquerReleveSurDossier(d, client);
  assert.equal(d.telephoneAcquereur, '0612345678 / 02 54 00 00 01');
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

test('fiche client : épouse sous son propre nom rattachée par son conjoint ; emails groupés « ; »', () => {
  // « VTE MARCHAIS / LEBON » : M MARCHAIS et Mme BERTIN, mariés, vendent.
  const d = { id: 'm', nom: 'MARCHAIS / LEBON', typeVente: 'maison', pieces: {}, historique: [] };
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
  assert.equal(infos.safer.priseEnCompteLe, '2026-09-15');
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

test('texte seul : prix (Capital), collaborateur et notaire des parties prenantes', () => {
  const cap = { champs: [], tableaux: [], texte: texteDossier };
  assert.equal(app.prixAuthentic(cap), 245000);
  assert.equal(app.prixAuthentic({ texte: 'Capital : 312 500,00 €' }), 312500);
  assert.equal(app.collaborateurAuthentic(cap), 'Julie VASSELIN');
  assert.equal(app.notaireAuthentic(cap), 'Sophie GOSSART');
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
  // Le dossier de succession : rien du planning, de la checklist ni des emails d'une vente.
  const d = { id: 's', nom: 'DUPONT Jean', typeAffaire: 'succession', sansPret: true, parties, biens, pieces: {}, piecesPersonnalisees: [{ cle: 'perso-deces', label: 'Acte de décès de M. DUPONT Jean' }] };
  assert.equal(app.echeancesPlanning(d).length, 0);
  assert.equal(app.echeancesPlanning(Object.assign({}, d, { rendezVousSignature: '2026-11-05' })).map(x => x.type).join(','), 'rendezVousSignature');
  assert.equal(app.checklistPieces('maison', d).map(p => p.cle).join(','), 'perso-deces');
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
  assert.equal(app.intitulesDossierAuthentic(fiche).join('|'), 'Vente GARNIER / MARTEL|Vente MARTEL / FOURNIER');
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

test('numéro du dossier Authentic (« 1836 - Vente … ») : retenu, puis prioritaire sur les noms', () => {
  const page = { champs: [{ groupe: '', libelle: '1836 - Vente MOREAU-GILLET/WALDEN', valeur: '' }], tableaux: [], texte: '1836 - Vente MOREAU-GILLET/WALDEN Importer\nComparants' };
  assert.equal(app.numeroDossierAuthentic(page), '1836');
  assert.equal(app.numeroDossierAuthentic(gestion), '12');
  const a = { id: 'a', nom: 'MOREAU-GILLET / WALDEN', historique: [] };
  const homonyme = { id: 'h', nom: 'MOREAU-GILLET / WALDEN', historique: [], numeroAuthentic: '1700' };
  // Le dossier rattaché à un autre numéro est écarté : seul « a » reste.
  assert.equal(app.dossierPourIntituleAuthentic('Vente MOREAU-GILLET / WALDEN', [a, homonyme], '', '1836').id, 'a');
  assert.equal(app.retenirNumeroAuthentic(a, '1836', [a, homonyme]), true);
  assert.equal(a.numeroAuthentic, '1836');
  assert.match(a.historique[0].texte, /n° 1836/);
  // Jamais deux fois, jamais un numéro déjà pris.
  assert.equal(app.retenirNumeroAuthentic(a, '1900', [a]), false);
  const b = { id: 'b', nom: 'X / Y', historique: [] };
  assert.equal(app.retenirNumeroAuthentic(b, '1836', [a, b]), false);
  // Le numéro l'emporte même si l'intitulé a changé dans Authentic.
  assert.equal(app.dossierPourIntituleAuthentic('Vente MOREAU / WALDEN-PETIT', [a, homonyme], '', '1836').id, 'a');
  // Navigation : par le numéro, quel que soit le type de dossier.
  assert.equal(app.dossierPourNavigationAuthentic('1836 - Avenant WALDEN', [a, homonyme]).id, 'a');
  assert.equal(app.dossierPourNavigationAuthentic('1999 - Donation WALDEN', [a, homonyme]), null);
  // Création depuis les pages : le numéro suit le dossier relevé.
  const g = app.dossiersDepuisRelevesAuthentic([{ recueLe: '2026-10-02T10:00:00Z', capture: Object.assign({}, gestion) }])[0];
  assert.equal(g.numero, '12');
  assert.equal(g.export.numero, '12');
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
  const vente = { id: 'v', nom: 'CHARVET / LENOIR', parties: [{ nom: 'Monsieur Gérard CHARVET', role: 'VENDEUR' }, { nom: 'Madame Inès LENOIR', role: 'ACQUEREUR' }], pieces: {}, historique: [] };
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
