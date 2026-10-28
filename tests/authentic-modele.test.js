// Modèle d'Authen.TIC (commun/authentic-modele.js, plan du 27/10, étape 2) : l'instantané d'un dossier lu dans une page relevée.
// Page inventée, structure de la cartographie de l'étude (aucune donnée réelle).
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../commun/authentic-modele');

const PAGE = {
  texte: ['A 2026 00500 VTE MARTIN / DURAND', '2 - VTE MARTIN / DURAND', 'Préparation définitive', '14/10/2026', 'Importer avec 6e SENS',
    'Comparants (2)', 'person', 'M. MARTIN Paul', 'Vendeur', 'person', 'Mme DURAND Claire', 'Acquéreur',
    'Immeubles (1)', '41000 BLOIS, 2 rue des Lices', 'Immeuble vendu', 'Tiers (0)', '1 - Promesse VTE MARTIN / DURAND'].join('\n'),
  tableaux: [
    { titre: 'Etat civil', entete: [], lignes: [['ECV État-Civil - Acte de Naissance - MARTIN Paul', '', '01/10/2026', '', 'Réponse positive'], ['ECV État-Civil - Acte de Naissance - DURAND Claire', '', '02/10/2026', '', 'Envoyé']] },
    { titre: 'Télé@ctes - ANF', entete: [], lignes: [['Réquisition Hors Formalité - BLOIS 1', '', '22/09/2026', '25/09/2026', 'Retour le 25/09/2026']] },
    { titre: 'Rédaction', entete: [], lignes: [['ACT Vente MARTIN / DURAND', '', '20/11/2026', '', 'Non rédigé']] },
    { titre: 'Micen', entete: [], lignes: [['MIC Copie Simple', '', '03/10/2026', '', 'Prêt']] },
    { titre: '', entete: ['Section', 'Numéro', 'Contenance'], lignes: [['AT', '433', '05a 20ca']] }
  ]
};

test('en-tête, sous-dossier et statut du badge', () => {
  assert.deepEqual(M.enTeteDossierAT(PAGE.texte), { reference: 'A 2026 00500', libelle: 'VTE MARTIN / DURAND' });
  assert.equal(M.intituleSousDossierAT(PAGE.texte), '2 - VTE MARTIN / DURAND', 'jamais la promesse listée plus bas');
  assert.deepEqual(M.statutSousDossierAT(PAGE.texte), { statut: 'Préparation définitive', le: '2026-10-14' });
  assert.equal(M.natureDossierAT('2 - VTE MARTIN / DURAND'), 'VTE');
  assert.equal(M.natureDossierAT('1 - Succession DUPONT'), 'SUCC');
  assert.equal(M.natureDossierAT('1 - Donation HULLIN'), 'DONATION');
});

test('comparants avec leur qualité, immeubles avec leur étiquette', () => {
  const g = M.panneauGaucheAT(PAGE.texte);
  assert.equal(g.comparants.map((c) => `${c.nom}=${c.role}`).join('|'), 'M. MARTIN Paul=Vendeur|Mme DURAND Claire=Acquéreur');
  assert.equal(g.immeubles.map((i) => `${i.adresse}=${i.etiquette}`).join('|'), '41000 BLOIS, 2 rue des Lices=Immeuble vendu');
});

test('formalités : badge, section, statut et dates ; jamais le cadastre', () => {
  const inst = M.instantaneDepuisPagesAT([{ nature: 'dossier', capture: PAGE, recueLe: '2026-10-27T10:00:00Z' }]);
  const sd = inst.sousDossier;
  assert.equal(sd.formalitesPrealables.map((f) => `${f.badge}:${f.statut}`).join('|'), 'ECV:Réponse positive|ECV:Envoyé|T@:Retour le 25/09/2026');
  assert.equal(sd.formalitesPrealables[0].libelle, 'État-Civil - Acte de Naissance - MARTIN Paul', 'le badge est retiré du libellé');
  assert.equal(sd.actes.map((f) => `${f.badge}:${f.statut}`).join('|'), 'ACT:Non rédigé');
  assert.equal(sd.formalitesPosterieures.map((f) => `${f.badge}:${f.statut}`).join('|'), 'MIC:Prêt');
  assert.equal(sd.formalitesPrealables[2].dates.join(), '2026-09-22,2026-09-25');
  assert.equal(inst.luLe, '2026-10-27T10:00:00Z');
});

test('adaptateur vers la fiche : état de l’acte, statut du sous-dossier, formalités en attente', () => {
  const f = M.versFicheAT(M.instantaneDepuisPagesAT([{ nature: 'client', capture: { texte: 'x' } }, { nature: 'dossier', capture: PAGE }]));
  assert.equal(f.reference, 'A 2026 00500');
  assert.deepEqual(f.statutSousDossier, { statut: 'Préparation définitive', le: '2026-10-14' });
  assert.equal(f.acte.etat, 'Non rédigé');
  assert.equal(f.enAttente, 1, 'seule la demande d’état civil « Envoyé » attend');
  assert.equal(M.instantaneDepuisPagesAT([{ nature: 'client', capture: { texte: 'x' } }]), null, 'sans page du dossier : rien');
  assert.equal(M.versFicheAT(null), null);
});

test('relecture 0.376.1 : statut près de l’en-tête, onglets inactifs, classement, acte principal, comparants collés', () => {
  assert.deepEqual(M.statutSousDossierAT('Nouveau\nA 2026 00500\n2 - VTE X / Y\nSigné\n29/09/2026'), { statut: 'Signé', le: '2026-09-29' }, 'un « Nouveau » de menu avant l’en-tête');
  assert.deepEqual(M.statutSousDossierAT('2 - VTE X / Y\nComparants (1)\nM. X Paul\nRédaction\nACT Vente\nEn cours'), { statut: '', le: '' }, '« En cours » n’est pas un statut');
  assert.equal(M.intituleSousDossierAT('A 2026 1\n1 - Promesse VTE X / Y\n2 - VTE X / Y Importer avec 6e SENS\nComparants (1)'), '2 - VTE X / Y');
  assert.equal(M.intituleSousDossierAT('3 - VTE AUTRE / DOSSIER\n2 - VTE X / Y\nComparants (1)', [{ titre: '3 - VTE AUTRE / DOSSIER', actif: false }]), '2 - VTE X / Y');
  assert.equal(M.badgeLigneAT('Déclaration préalable de travaux', 'Urbanisme'), 'APR');
  assert.equal(M.sectionLigneAT(M.badgeLigneAT('Attestation de signature', 'Formalités postérieures'), 'Formalités postérieures'), 'posterieures');
  const l = M.lignesFormalitesAT({ tableaux: [{ titre: 'Rédaction', entete: [], lignes: [['ACT Vente X', '', 'Signé le 29/09/2026'], ['ACT Procuration vente', '', '', 'Non rédigé']] }] });
  assert.equal(l.length, 2, 'les lignes de la Rédaction sans cellule de date');
  assert.equal(l[0].signeLe, '2026-09-29');
  const f = M.versFicheAT({ reference: 'A', libelle: '', luLe: '', pages: 1, sousDossier: { intitule: '', nature: 'VTE', statut: '', statutLe: '', comparants: [], immeubles: [], formalitesPrealables: [{ badge: 'APR', libelle: 'SAFER', groupe: '', statut: 'Non préemption SAFER', dates: [] }], actes: [{ badge: 'ACT', libelle: 'Procuration vente', groupe: '', statut: 'Non rédigé', dates: [] }, { badge: 'ACT', libelle: 'Vente X', groupe: '', statut: 'Signé le 29/09/2026', dates: ['2026-09-29'], signeLe: '2026-09-29' }], formalitesPosterieures: [], pieces: [], mails: [] } });
  assert.equal(f.acte.libelle, 'Vente X', 'jamais une procuration');
  assert.equal(f.enAttente, 0, 'une non-préemption est une décision rendue');
  const g = M.panneauGaucheAT('X Comparants (2)\npersonM. MARTIN Paul\nVendeur\nMme DURAND Claire Acquéreur\nQUALITÉ');
  assert.equal(g.comparants.map((c) => `${c.nom}=${c.role}`).join('|'), 'M. MARTIN Paul=Vendeur|Mme DURAND Claire=Acquéreur');
  assert.equal(M.isoDepuisFrAT('31/13/2026'), '');
  assert.equal(M.isoDepuisFrAT('03/10/20261'), '');
});

test('étape 4 : l’aperçu d’une formalité (tiroir) rangé sous sa ligne — dates, signature, répertoire, chrono, réponse', () => {
  const ap = M.apercuFormaliteAT('État-Civil - Acte de Naissance - MARTIN Paul\nCréée le\n01/10/2026\nEnvoyée le : 02/10/2026\nReçue le\n05/10/2026\nRéponse positive', '');
  assert.equal(ap.creeLe, '2026-10-01');
  assert.equal(ap.envoyeLe, '2026-10-02');
  assert.equal(ap.recuLe, '2026-10-05');
  assert.equal(ap.reponse, 'Réponse positive');
  const acte = M.apercuFormaliteAT('Situation\nActe signé\nDate de signature\n29/09/2026\nN° de répertoire\n1234\nRéférence\nSG/BA', 'ACT Vente MARTIN / DURAND');
  assert.equal(acte.situation, 'Acte signé');
  assert.equal(acte.signeLe, '2026-09-29');
  assert.equal(acte.numeroRepertoire, '1234');
  const inst = M.instantaneDepuisPagesAT([
    { nature: 'dossier', capture: PAGE },
    { nature: 'apercu', capture: { apercu: { titre: 'ECV État-Civil - Acte de Naissance - MARTIN Paul', texte: 'Créée le 01/10/2026\nReçue le 05/10/2026' } } },
    { nature: 'apercu', capture: { apercu: { titre: 'Une formalité inconnue', texte: 'Créée le 01/10/2026' } } }
  ]);
  const ecv = inst.sousDossier.formalitesPrealables[0];
  assert.equal(ecv.recuLe, '2026-10-05', 'l’aperçu est rangé sous sa ligne');
  assert.equal(inst.sousDossier.formalitesPrealables[1].recuLe, undefined, 'jamais sous une autre');
});

test('étape 5 : la liste des pièces jointes (GED) — la dernière vue, identifiant, nom, dossier de l’arbre', () => {
  const inst = M.instantaneDepuisPagesAT([
    { nature: 'dossier', capture: PAGE },
    { nature: 'ged', capture: { pieces: [{ pjId: 'pj1', nom: 'Ancien.pdf', dossier: 'Non classé' }] } },
    { nature: 'ged', capture: { pieces: [{ pjId: 'pj11', nom: 'Titre de propriété ESSAI.pdf', dossier: 'Non classé' }, { pjId: 'pj12', nom: 'Diagnostics.pdf', dossier: 'Annexes MICEN' }] } }
  ]);
  assert.equal(inst.sousDossier.pieces.map((p) => `${p.pjId}:${p.dossierGed}`).join('|'), 'pj11:Non classé|pj12:Annexes MICEN');
});

test('suivis (étape 7) : colonnes par leur en-tête, référence lue, une décision sort de l’attente ; compteurs et lignes d’un dossier', () => {
  const capture = { tableaux: [
    { titre: 'petit', entete: ['x'], lignes: [['A 2026 00999']] },
    { titre: '', entete: ['N° dossier', 'Libellé', 'Date', 'Situation'], lignes: [
      ['A 2026 00500', 'Formulaire A - DIA auprès de la safer', '01/10/2026', 'Pris en compte'],
      ['A2026 00777', 'DIA mairie ESSAI', '02/09/2026', 'Non préemption SAFER'],
      ['', '', '', ''],
      ['Aucun enregistrement trouvé']] }] };
  const s = M.suiviDepuisCaptureAT('safer', capture, '2026-10-27T10:00:00Z');
  assert.equal(s.lignes.length, 2);
  assert.equal(s.lignes[0].reference, 'A 2026 00500');
  assert.equal(s.lignes[0].libelle, 'Formulaire A - DIA auprès de la safer');
  assert.equal(s.lignes[0].situation, 'Pris en compte');
  assert.equal(s.lignes[0].enAttente, true);
  assert.equal(s.lignes[1].reference, 'A 2026 00777');
  assert.equal(s.lignes[1].enAttente, false);
  assert.equal(M.ligneSuiviEnAttenteAT('etatCivil', 'Réponse positive'), false);
  assert.equal(M.ligneSuiviEnAttenteAT('etatCivil', 'Envoyé'), true);
  assert.equal(M.ligneSuiviEnAttenteAT('etatCivil', 'Réponse négative'), true, 'rien délivré : à reprendre');
  const ec = M.suiviDepuisCaptureAT('etatCivil', { texte: 'Résultats (1 of 3)', tableaux: [{ entete: ['Type d’état civil', 'Dossier', 'Date', 'Etat'], lignes: [['Naissance', 'A 2026 00500 VTE ESSAI / TEST', '01/10/2026', 'Réponse positive']] }] }, 'x');
  assert.equal(ec.lignes[0].situation, 'Réponse positive', 'l’en-tête « Etat » et non « Type d’état civil »');
  assert.equal(ec.lignes[0].reference, 'A 2026 00500');
  assert.equal(ec.lignes[0].enAttente, false);
  assert.equal(ec.tronque, true, 'tableau paginé : dit');
  assert.equal(M.ligneSuiviEnAttenteAT('micen', 'Prêt'), false);
  // Captures du wiki (28/10) : lignes rangées en GROUPES par statut, sans colonne d'état ; « Dépôt OK », « Clôturé » sont finis ;
  // pagination « Demandes 1 à 15 sur 59 ».
  const cjn = M.suiviDepuisCaptureAT('cjn', { texte: 'Demandes 1 à 15 sur 59', tableaux: [
    { titre: 'Prêt pour envoi (1)', entete: ['N° dossier', 'Dossier / Acte', 'Demande', 'Client', 'Date'], lignes: [['A 2026 00500', 'VTE ESSAI / TEST', 'Casier', 'TEST Jean', '01/10/2026']] },
    { titre: 'Absence de condamnation (1)', entete: ['N° dossier', 'Dossier / Acte', 'Demande', 'Client', 'Date'], lignes: [['A 2026 00501', 'VTE AUTRE / ESSAI', 'Casier', 'ESSAI Marc', '02/10/2026']] }] }, 'x');
  assert.equal(cjn.lignes.map((l) => `${l.situation}:${l.enAttente}`).join('|'), 'Prêt pour envoi:true|Absence de condamnation:false');
  assert.equal(cjn.tronque, true, '« 1 à 15 sur 59 » : paginé');
  assert.equal(M.ligneSuiviEnAttenteAT('micen', 'Dépôt OK'), false);
  // Sans groupes « Statut (N) » : le plus grand tableau seul, et la situation = la dernière cellule (jamais un titre ordinaire « Suivi MICEN »,
  // ni un panneau de filtres en tableau compté en lignes).
  const mic = M.suiviDepuisCaptureAT('micen', { tableaux: [
    { titre: 'Critères', entete: [], lignes: [['Date début', '01/10/2026', 'Date fin', '31/10/2026']] },
    { titre: 'Suivi MICEN', entete: ['N° dossier', 'Libellé', 'Date', 'Dépôt'], lignes: [['A 2026 00500', 'Vente ESSAI', '01/10/2026', 'Dépôt OK'], ['A 2026 00501', 'Vente AUTRE', '02/10/2026', 'En cours']] }] }, 'x');
  assert.equal(mic.lignes.map((l) => `${l.situation}:${l.enAttente}`).join('|'), 'Dépôt OK:false|En cours:true');
  assert.equal(M.ligneSuiviEnAttenteAT('safer', 'Clôturé'), false);
  assert.equal(M.ligneSuiviEnAttenteAT('cjn', 'Bloqué'), true);
  assert.equal(M.ECRANS_SUIVIS_AT.find((e) => e.cle === 'safer').entrees[0], 'Suivi SAFER / DIA-DPU');
  assert.equal(M.ligneSuiviEnAttenteAT('actesASigner', ''), true);
  const c = M.compteursSuivisAT({ safer: s }, ['A 2026 00500']);
  assert.equal(c.safer.total, 2);
  assert.equal(c.safer.enAttente, 1);
  assert.equal(c.safer.dansClaire, 1);
  assert.equal(c.micen, null, 'écran jamais lu : rien, pas zéro');
  assert.equal(M.suivisDuDossierAT({ safer: s }, 'A 2026 00500').length, 1);
  assert.equal(M.suivisDuDossierAT({ safer: s }, '').length, 0);
});
