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
  assert.equal(app.suiviSaferPiece(d), 'notifiée le 10 septembre 2026, prise en compte le 15 septembre 2026');
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
  // Une personne étrangère au dossier n'est jamais reprise.
  const autre = { id: 'c', nom: 'LEROY / DURAND', pieces: {}, historique: [] };
  assert.equal(app.appliquerReleveSurDossier(autre, client).modifie, false);
  assert.ok(!autre.emailAcquereur);
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
