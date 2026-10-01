'use strict';
// Page Agenda (étude, 30/09) : grille de la semaine, calendrier du mois, et l'agenda « intelligent »
// — probabilité de tenue d'une signature, créneaux proposés, gestes de relation client. Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const TOUS_RECUS = { diagnosticsTechniques: 'recue', erp: 'recue', titrePropriete: 'recue', certificatUrbanisme: 'recue', renonciationPreemption: 'recue', avisTaxeFonciere: 'recue', certificatAlignement: 'recue', certificatNumerotage: 'recue', reponseAssainissement: 'recue' };

test('joursSemaineAgenda : lundi → samedi', () => {
  assert.equal(app.joursSemaineAgenda('2026-09-28').join(','), '2026-09-28,2026-09-29,2026-09-30,2026-10-01,2026-10-02,2026-10-03');
});

test('disposerEvenementsJour : position dans la grille 8 h – 19 h et colonnes des chevauchements', () => {
  const places = app.disposerEvenementsJour([
    { sujet: 'A', date: '2026-10-01', heure: '08:00', heureFin: '08:30' },
    { sujet: 'B', date: '2026-10-01', heure: '08:15', heureFin: '09:15' },
    { sujet: 'C', date: '2026-10-01', heure: '13:30', heureFin: '14:00' },
    { sujet: 'Tôt', date: '2026-10-01', heure: '06:00', heureFin: '07:30' },
    { sujet: 'Journée', date: '2026-10-01', journeeEntiere: true },
    { sujet: 'Autre jour', date: '2026-10-02', heure: '09:00' }
  ], '2026-10-01');
  const par = (s) => places.find(p => p.e.sujet === s);
  assert.equal(places.length, 4);
  assert.equal(par('A').haut, 0, '8 h = haut de la grille');
  assert.equal(Math.round(par('C').haut * 660 / 100), 330, '13 h 30 = 330 min après 8 h');
  assert.equal(`${par('A').colonne}/${par('A').colonnes}`, '0/2');
  assert.equal(`${par('B').colonne}/${par('B').colonnes}`, '1/2');
  assert.equal(`${par('C').colonne}/${par('C').colonnes}`, '0/1');
  assert.equal(par('Tôt').horsPlage, true);
  assert.equal(par('Tôt').haut, 0);
});

test('grilleMoisAgenda : semaines complètes du lundi au dimanche', () => {
  const g = app.grilleMoisAgenda('2026-10');
  assert.equal(g[0][0], '2026-09-28');
  assert.equal(g[g.length - 1][6], '2026-11-01');
  assert.equal(g.length, 5);
});

test('joursFeriesFrance : fixes et mobiles (Pâques 2026 = 5 avril)', () => {
  const f = app.joursFeriesFrance(2026).join(',');
  assert.ok(f.includes('2026-04-06'), 'lundi de Pâques');
  assert.ok(f.includes('2026-05-14'), 'Ascension');
  assert.ok(f.includes('2026-05-25'), 'lundi de Pentecôte');
  assert.ok(f.includes('2026-11-11'));
  assert.equal(app.estJourFerie('2026-12-25'), true);
  assert.equal(app.estJourFerie('2026-12-24'), false);
});

test('probabiliteTenueSignature : dossier prêt → haute, facteurs expliqués', () => {
  const d = { rendezVousSignature: '2026-10-20', offrePretStatut: 'recue', pieces: TOUS_RECUS, typeVente: 'maison',
    appelFonds: '2026-10-01', echeancesValidees: { appelFonds: true, projetEnvoye: true }, projetEnvoye: '2026-10-05' };
  const p = app.probabiliteTenueSignature(d, '2026-10-12', []);
  assert.equal(p.pourcent, 97);
  assert.equal(p.niveau, 'haute');
  assert.ok(p.facteurs.every(f => f.ok));
});

test('probabiliteTenueSignature : offre non reçue, pièces et envois manquants, collaborateur absent → basse', () => {
  const d = { rendezVousSignature: '2026-10-08', pret: '2026-10-01', pieces: { erp: 'recue' }, typeVente: 'maison', responsable: 'Julie VASSELIN' };
  const absences = [{ collaborateur: 'Julie VASSELIN', debut: '2026-10-08', fin: '2026-10-08' }];
  const p = app.probabiliteTenueSignature(d, '2026-10-01', absences);
  assert.equal(p.niveau, 'basse');
  assert.equal(p.pourcent, 5);
  const libelles = p.facteurs.filter(f => !f.ok).map(f => f.libelle).join(' | ');
  assert.match(libelles, /Offre de prêt non reçue/);
  assert.match(libelles, /Renonciation au droit de préemption/);
  assert.match(libelles, /pièces manquantes/);
  assert.match(libelles, /Appel de fonds à envoyer/);
  assert.match(libelles, /Julie absent/);
});

test('probabiliteTenueSignature : rien pour une signature passée ou absente', () => {
  assert.equal(app.probabiliteTenueSignature({ rendezVousSignature: '2026-09-01' }, '2026-10-01', []), null);
  assert.equal(app.probabiliteTenueSignature({}, '2026-10-01', []), null);
});

test('dossiersAPlacer : financement, vente préalable et préemption levés, sans rendez-vous', () => {
  const liste = [
    { id: 'a', offrePretStatut: 'recue', pieces: TOUS_RECUS, typeVente: 'maison' },
    { id: 'b', offrePretStatut: 'recue', pieces: TOUS_RECUS, typeVente: 'maison', rendezVousSignature: '2026-10-10' },
    { id: 'c', pret: '2026-11-01', pieces: TOUS_RECUS, typeVente: 'maison' },
    { id: 'd', sansPret: true, pieces: {}, typeVente: 'maison' },
    { id: 'e', sansPret: true, pieces: TOUS_RECUS, typeVente: 'maison', archive: true }
  ];
  assert.equal(app.dossiersAPlacer(liste).map(d => d.id).join(','), 'a');
});

test('motifCreneauExceptionnel : 9 h, 12 h – 14 h, après 18 h, 6 rendez-vous', () => {
  assert.equal(app.motifCreneauExceptionnel('09:30', 60, 2), '');
  assert.equal(app.motifCreneauExceptionnel('11:00', 60, 0), '', '11 h – 12 h ne touche pas la pause');
  assert.equal(app.motifCreneauExceptionnel('17:00', 60, 0), '', 'fin à 18 h pile');
  assert.equal(app.motifCreneauExceptionnel('09:00', 60, 0), 'à 9 h');
  assert.equal(app.motifCreneauExceptionnel('11:30', 60, 0), 'entre 12 h et 14 h');
  assert.equal(app.motifCreneauExceptionnel('13:30', 30, 0), 'entre 12 h et 14 h');
  assert.equal(app.motifCreneauExceptionnel('17:30', 60, 0), 'après 18 h');
  assert.equal(app.motifCreneauExceptionnel('10:00', 60, 6), 'déjà 6 rendez-vous ce jour-là');
});

test('creneauxProposesSignature : règles de l’étude, jours ouvrés, pas de férié, un créneau par jour', () => {
  const d = { id: 'a', responsable: 'Julie VASSELIN', acte: '2026-12-31' };
  const six = ['09:30', '10:30', '11:30', '14:30', '15:30', '16:30'].map(h => ({ date: '2026-11-10', heure: h, heureFin: h.slice(0, 3) + '59' }));
  const evenements = [
    { date: '2026-11-09', heure: '09:30', heureFin: '12:00' }, // lundi matin pris → 14 h, jamais 12 h
    ...six // mardi : 6 rendez-vous, complet
  ];
  const absences = [{ collaborateur: 'Julie VASSELIN', debut: '2026-11-12', fin: '2026-11-12' }];
  // Aujourd'hui 26/10 → au plus tôt le 09/11 (lundi) ; 10/11 six rendez-vous ; 11/11 férié ; 12/11 Julie absente.
  const c = app.creneauxProposesSignature(d, evenements, absences, '2026-10-26', 3);
  assert.equal(c.map(x => `${x.date} ${x.heure}`).join(' | '), '2026-11-09 14:00 | 2026-11-13 09:30 | 2026-11-16 09:30');
  assert.ok(c.every(x => !x.apresButoir && !x.exceptionnel), 'jamais 9 h, jamais exceptionnel quand un créneau normal existe');
});

test('creneauxProposesSignature : exceptionnel seulement à défaut de créneau normal, et marqué', () => {
  // Butoir proche (lundi 26/10 + 3 → jeudi 29/10), journée pleine (6 rendez-vous).
  const plein = ['09:30', '10:30', '14:00', '15:00', '16:00', '17:00'].map(h => ({ date: '2026-10-29', heure: h, heureFin: String(Number(h.slice(0, 2)) + 1).padStart(2, '0') + h.slice(2) }));
  // Le collaborateur est absent tous les autres jours : le 29/10 est le seul jour possible.
  const d = { acte: '2026-10-29', responsable: 'Julie VASSELIN' };
  const absences = [{ collaborateur: 'Julie VASSELIN', debut: '2026-10-30', fin: '2027-01-31' }];
  const c = app.creneauxProposesSignature(d, plein, absences, '2026-10-26', 1);
  assert.equal(c.length, 1);
  assert.equal(c[0].date, '2026-10-29');
  assert.ok(c[0].exceptionnel, 'le seul créneau restant est hors règles');
  assert.match(c[0].exceptionnel, /6 rendez-vous|9 h|12 h|18 h/);
});

test('creneauxProposesSignature : date butoir proche → au plus tôt dans 3 jours, signalé après butoir', () => {
  const c = app.creneauxProposesSignature({ acte: '2026-10-29' }, [], [], '2026-10-26', 3);
  assert.equal(c[0].date, '2026-10-29');
  assert.equal(c[0].heure, '09:30');
  assert.equal(c[1].apresButoir, true);
});

test('gestesRelationClient : rappel, confirmation, questionnaire, un an après — jamais au client d’un confrère', () => {
  const liste = [
    { id: 'rappel', rendezVousSignature: '2026-10-03' },
    { id: 'confirme', rendezVousSignature: '2026-10-20' },
    { id: 'dejaConfirme', rendezVousSignature: '2026-10-21', confirmationRdvPour: '2026-10-21' },
    { id: 'deplace', rendezVousSignature: '2026-10-22', confirmationRdvPour: '2026-10-15' },
    { id: 'signe', rendezVousSignature: '2026-09-25' },
    { id: 'signeConfrere', rendezVousSignature: '2026-09-25', notaireAcquereur: 'Maître DUPUIS' },
    { id: 'rdvConfrere', rendezVousSignature: '2026-10-03', notaireAcquereur: 'Maître DUPUIS' },
    { id: 'confirmeConfrere', rendezVousSignature: '2026-10-20', notaireAcquereur: 'Maître DUPUIS' },
    { id: 'questionnaireFait', rendezVousSignature: '2026-09-25', questionnaireEnvoyeLe: '2026-09-26' },
    { id: 'unAn', rendezVousSignature: '2025-10-01', archive: true },
    { id: 'loin', rendezVousSignature: '2026-12-31' }
  ];
  const g = app.gestesRelationClient(liste, '2026-10-01');
  assert.equal(g.map(x => `${x.type}:${x.d.id}`).join(' | '),
    'rappelRdv:rappel | confirmationRdv:confirme | confirmationRdv:deplace | questionnaire:signe | anniversaire:unAn');
});

test('emails de relation client : date et heure en gras, lieu selon le type, formule du confrère', () => {
  const d = { nom: 'DURAND / MARTIN', rendezVousSignature: '2026-10-15', rendezVousSignatureHeure: '10:00', rendezVousType: 'visio' };
  const c = app.construireEmailConfirmationRdv(d);
  assert.match(c.sujet, /Confirmation du rendez-vous de signature — VTE - DURAND \/ MARTIN/);
  assert.match(app.texteSansMarques(c.corps), /le jeudi 15 octobre 2026 à 10h, en visioconférence/);
  assert.match(app.construireEmailRappelRdv(d).corps, /Nous vous rappelons/);
  const auConfrere = app.construireEmailConfirmationRdv(Object.assign({}, d, { notaireAcquereur: 'Maître DUPUIS', rendezVousType: 'confrere' }));
  assert.match(auConfrere.corps, /Je vous confirme .* en votre office/);
});

test('dureeRendezVous : minutes, heures, heures et minutes ; rien sans fin', () => {
  assert.equal(app.dureeRendezVous('09:00', '09:30'), '30 min');
  assert.equal(app.dureeRendezVous('10:00', '11:00'), '1 h');
  assert.equal(app.dureeRendezVous('14:00', '15:30'), '1 h 30');
  assert.equal(app.dureeRendezVous('08:00', '10:05'), '2 h 05');
  assert.equal(app.dureeRendezVous('10:00', null), '');
  assert.equal(app.dureeRendezVous('10:00', '09:00'), '');
});

test('jourSuivantAgenda : le dimanche est sauté dans les deux sens', () => {
  assert.equal(app.jourSuivantAgenda('2026-10-03', 1), '2026-10-05', 'samedi → lundi');
  assert.equal(app.jourSuivantAgenda('2026-10-05', -1), '2026-10-03', 'lundi → samedi');
  assert.equal(app.jourSuivantAgenda('2026-10-01', 1), '2026-10-02');
});

test('infosRendezVousDossier : responsable, confrère, appel de fonds et décompte acquéreur (comme dans Outlook)', () => {
  const base = { id: 'x', nom: 'DURAND / MARTIN', responsable: 'Bastien ANGLUMENT', notaireVendeur: 'Maître Sophie GOSSART', notaireAcquereur: 'Maître Paul LEBRUN' };
  const rien = app.infosRendezVousDossier(base);
  assert.equal(rien.responsable, 'Bastien');
  assert.match(rien.confrere, /LEBRUN/);
  assert.equal(rien.etats.map(x => `${x.cle}:${x.fait}`).join(','), 'appelFonds:false,decompte:false,projet:false');

  const faits = app.infosRendezVousDossier({ ...base, echeancesValidees: { appelFonds: true }, detectionsNas: { appelFondsFichier: 'Comptabilité/Appel de fonds DURAND.pdf' } });
  assert.equal(faits.etats.map(x => `${x.cle}:${x.fait}`).join(','), 'appelFonds:true,decompte:true,projet:false');

  // Le décompte vaut aussi fait quand le montant attendu a été lu dans un courrier pour les fonds reçus.
  assert.equal(app.decompteAcquereurFait({ fondsRecus: { attenduChemin: 'Comptabilité/Décompte.pdf' } }), true);
  assert.equal(app.decompteAcquereurFait(null), false);

  // Pas de confrère quand l'étude est seule au dossier.
  assert.equal(app.infosRendezVousDossier({ responsable: 'Julie VASSELIN', notaireVendeur: 'Maître Sophie GOSSART', notaireAcquereur: 'Maître Sophie GOSSART' }).confrere, '');
  assert.equal(app.infosRendezVousDossier(null), null);
});

test('semaineProbableSignature : au plus tôt, offre de prêt + 11 jours, vente préalable, jour ouvré', () => {
  const auj = '2026-09-30'; // mercredi
  // Offre attendue au plus tard le 20/10 → 31/10 (samedi) → lundi 02/11 (le 01/11 est férié et dimanche).
  const pret = app.semaineProbableSignature({ id: 'a', nom: 'A', pret: '2026-10-20', pieces: TOUS_RECUS }, auj, []);
  assert.equal(pret.date, '2026-11-02');
  assert.equal(pret.lundi, '2026-11-02');
  assert.match(pret.raison, /offre de prêt attendue au plus tard le 20 octobre 2026, puis 11 jours de réflexion/);
  assert.ok(pret.facteurs.some(f => f.libelle === 'Rendez-vous pas encore fixé'));

  // Comptant, rien à attendre : le délai d'envoi (14 jours) seul → mercredi 14/10.
  const comptant = app.semaineProbableSignature({ id: 'b', nom: 'B', sansPret: true, pieces: TOUS_RECUS }, auj, []);
  assert.equal(comptant.date, '2026-10-14');
  assert.equal(comptant.lundi, '2026-10-12');
  assert.match(comptant.raison, /appel de fonds et le projet/);

  // Vente préalable plus tardive que tout le reste.
  const vente = app.semaineProbableSignature({ id: 'c', nom: 'C', sansPret: true, ventebien: '2026-11-18', pieces: TOUS_RECUS }, auj, []);
  assert.equal(vente.date, '2026-11-18');
  assert.match(vente.raison, /vente préalable/);

  // Au-delà de la date butoir : signalé et pénalisé.
  const butoir = app.semaineProbableSignature({ id: 'd', nom: 'D', pret: '2026-10-20', acte: '2026-10-25', pieces: TOUS_RECUS }, auj, []);
  assert.equal(butoir.depasseButoir, true);
  assert.ok(butoir.pourcent < pret.pourcent);

  // Un dossier placé ou archivé n'a pas de semaine probable.
  assert.equal(app.semaineProbableSignature({ id: 'e', rendezVousSignature: '2026-10-15' }, auj, []), null);
  assert.equal(app.semaineProbableSignature({ id: 'f', archive: true }, auj, []), null);
});

test('fantomesSemaineAgenda : carte fantôme sur le premier créneau libre de la semaine probable', () => {
  const auj = '2026-09-30';
  const d = { id: 'b', nom: 'BLANC / NOIR', sansPret: true, pieces: TOUS_RECUS, responsable: 'Julie VASSELIN' };
  const jours = app.joursSemaineAgenda('2026-10-12');
  // Le 14/10, 09:30 et 10:00 sont pris : le fantôme prend 10:30 (jamais 9 h).
  const evenements = [
    { sujet: 'X', date: '2026-10-14', heure: '09:30', heureFin: '10:30' }
  ];
  const f = app.fantomesSemaineAgenda([d], evenements, [], jours, auj);
  assert.equal(f.length, 1);
  assert.equal(`${f[0].date} ${f[0].heure}-${f[0].heureFin}`, '2026-10-14 10:30-11:30');
  assert.equal(f[0].fantome, true);
  assert.equal(app.cleEvenementAgenda(f[0]), 'probable:b');
  // Une autre semaine n'a pas de fantôme pour ce dossier.
  assert.equal(app.fantomesSemaineAgenda([d], evenements, [], app.joursSemaineAgenda('2026-10-19'), auj).length, 0);
  // Deux dossiers la même semaine : pas sur le même créneau.
  const deux = app.fantomesSemaineAgenda([d, { ...d, id: 'c', nom: 'ROUGE / VERT' }], evenements, [], jours, auj);
  assert.notEqual(`${deux[0].date}${deux[0].heure}`, `${deux[1].date}${deux[1].heure}`);
});

test('traitHeureAgenda : trait de l\'heure seulement aujourd\'hui et entre 8 h et 19 h', () => {
  const jours = app.joursSemaineAgenda('2026-09-28');
  const t = app.traitHeureAgenda(new Date(2026, 8, 30, 14, 0), jours, '2026-09-30');
  assert.equal(`${t.colonne} ${Math.round(t.haut * 660 / 100)} ${t.libelle}`, '2 360 14:00', '14 h = 360 min après 8 h');
  assert.equal(app.traitHeureAgenda(new Date(2026, 8, 30, 7, 59), jours, '2026-09-30'), null);
  assert.equal(app.traitHeureAgenda(new Date(2026, 8, 30, 19, 1), jours, '2026-09-30'), null);
  assert.equal(app.traitHeureAgenda(new Date(2026, 9, 7, 14, 0), jours, '2026-10-07'), null, 'autre semaine');
});

test('heureCaseAgenda : clic dans la première ou la seconde moitié de la case', () => {
  assert.equal(app.heureCaseAgenda(14, 10, 80), '14:00');
  assert.equal(app.heureCaseAgenda(14, 40, 80), '14:30');
  assert.equal(app.heureCaseAgenda(9, 79, 80), '09:30');
  assert.equal(app.heureCaseAgenda(10, 0, 0), '10:00', 'au clavier : heure pleine');
});

test('texteComparaisonAgenda : hausse, baisse, égalité, an dernier vide, compte manquant', () => {
  const c = (actuel, anPasse, ecart, pourcent) => ({ lundiAnPasse: '2025-10-06', actuel: { rendezVous: actuel, signatures: 0 }, anPasse: { rendezVous: anPasse, signatures: 0 }, ecart, pourcent });
  assert.equal(app.texteComparaisonAgenda(c(12, 9, 3, 33)).texte, '+3 rendez-vous vs 2025 (hausse de 33 %)');
  assert.equal(app.texteComparaisonAgenda(c(8, 10, -2, -20)).texte, '−2 rendez-vous vs 2025 (baisse de 20 %)');
  assert.equal(app.texteComparaisonAgenda(c(8, 10, -2, -20)).sens, 'baisse');
  assert.equal(app.texteComparaisonAgenda(c(5, 5, 0, 0)).texte, 'Autant de rendez-vous qu’en 2025');
  assert.equal(app.texteComparaisonAgenda(c(4, 0, 4, null)).texte, '+4 rendez-vous vs 2025 (aucun l’an dernier)');
  assert.equal(app.texteComparaisonAgenda({ actuel: { rendezVous: 3 }, anPasse: null, ecart: null }), null);
});

test('widget Agenda : jours, rendez-vous du jour triés comme Outlook, prochains sans absences ni dates butoir', () => {
  assert.equal(app.joursDepuis('2026-09-28', 3).join(','), '2026-09-28,2026-09-29,2026-09-30');
  const evts = [
    { sujet: 'VTE - B', date: '2026-10-01', heure: '14:30' },
    { sujet: 'Congés Julie', date: '2026-09-30', dateFin: '2026-10-02', journeeEntiere: true, absence: true },
    { sujet: 'VTE - A', date: '2026-10-01', heure: '10:00' },
    { sujet: 'Obtention du prêt — VTE - C', date: '2026-10-05', journeeEntiere: true },
    { sujet: 'Réunion', date: '2026-10-03', heure: '09:30' },
    { sujet: 'VTE - D', date: '2026-10-02', heure: '11:00' }
  ];
  assert.equal(app.evenementsTriesJour(evts, '2026-10-01').map(e => e.sujet).join(' | '), 'Congés Julie | VTE - A | VTE - B');
  assert.equal(app.prochainsEvenementsAgenda(evts, '2026-10-01', 5).map(e => e.sujet).join(' | '), 'VTE - D | Réunion');
});

test('resultatsRechercheAgenda : dossiers en cours d’abord, rendez-vous fixé ou semaine probable, sans accents ni casse', () => {
  const liste = [
    { id: 'a', nom: 'LÉGER / PETIT', rendezVousSignature: '2026-10-20', rendezVousSignatureHeure: '10:00', sansPret: true },
    { id: 'b', nom: 'LEGRAND / ROUX', sansPret: true },
    { id: 'c', nom: 'LEGOFF / MARIN', archive: true, rendezVousSignature: '2026-03-02' },
    { id: 'd', nom: 'DUPONT / MARTIN', sansPret: true }
  ];
  const r = app.resultatsRechercheAgenda('leg', liste, '2026-10-01', []);
  assert.equal(r.map(x => `${x.id}:${x.type}`).join(','), 'a:rdv,b:probable,c:rdv');
  assert.equal(r[0].heure, '10:00');
  assert.equal(r[1].lundi, '2026-10-12');
  assert.equal(r[2].archive, true);
  assert.equal(app.resultatsRechercheAgenda('  ', liste, '2026-10-01', []).length, 0);
  assert.equal(app.resultatsRechercheAgenda('martin', liste, '2026-10-01', [])[0].id, 'd');
});

test('evenementsFiltresRecherche : filtre l’agenda comme la recherche du Suivi (titre, lieu, dossier ; sans accents)', () => {
  const ev = [
    { sujet: 'VTE - DUPONT / MARTIN', lieu: 'BA', dossierNom: 'DUPONT / MARTIN' },
    { sujet: 'Rendez-vous banque', lieu: 'Crédit Exemple' },
    { sujet: 'Congés Jérémy' }
  ];
  assert.equal(app.evenementsFiltresRecherche(ev, '').length, 3);
  assert.equal(app.evenementsFiltresRecherche(ev, 'martin').map(e => e.sujet).join('|'), 'VTE - DUPONT / MARTIN');
  assert.equal(app.evenementsFiltresRecherche(ev, 'credit').length, 1);
  assert.equal(app.evenementsFiltresRecherche(ev, 'JEREMY').length, 1);
  assert.equal(app.evenementsFiltresRecherche(ev, 'inconnu').length, 0);
});

test('classerSuiviDatesProposees : en attente, validées (à venir d’abord), sans suite', () => {
  const sondages = [
    { id: 'a', statut: 'ouvert', creeLe: '2026-09-28T08:00:00Z', creneaux: [] },
    { id: 'b', statut: 'ouvert', creeLe: '2026-09-30T08:00:00Z', creneaux: [] },
    { id: 'c', statut: 'place', choisi: 2, creneaux: [{ n: 1, date: '2026-10-08' }, { n: 2, date: '2026-10-20', heure: '10:00' }] },
    { id: 'd', statut: 'place', choisi: 1, creneaux: [{ n: 1, date: '2026-10-05', heure: '14:00' }] },
    { id: 'e', statut: 'place', choisi: 1, creneaux: [{ n: 1, date: '2026-09-15', heure: '14:00' }] },
    { id: 'f', statut: 'annule', closLe: '2026-09-20T08:00:00Z', creneaux: [] },
    { id: 'g', statut: 'expire', closLe: '2026-09-25T08:00:00Z', creneaux: [] }
  ];
  const r = app.classerSuiviDatesProposees(sondages, '2026-10-01');
  assert.equal(r.attente.map(x => x.id).join(','), 'b,a');
  assert.equal(r.valides.map(x => x.s.id).join(','), 'd,c,e');
  assert.equal(r.valides[1].creneau.date, '2026-10-20');
  assert.equal(r.sansSuite.map(x => x.id).join(','), 'g,f');
});

test('reponsesNonVuesSondages : réponses arrivées après le dernier passage, sondages ouverts seulement', () => {
  const sondages = [
    { id: 'a', statut: 'ouvert', reponses: [{ email: 'x@e.test', recuLe: '2026-10-01T09:00:00Z' }, { email: 'y@e.test', recuLe: '2026-10-01T07:00:00Z' }] },
    { id: 'b', statut: 'place', reponses: [{ email: 'z@e.test', recuLe: '2026-10-01T10:00:00Z' }] },
    { id: 'c', statut: 'ouvert', reponses: [{ email: 'w@e.test', recuLe: '' }] }
  ];
  assert.equal(app.reponsesNonVuesSondages(sondages, '2026-10-01T08:00:00Z').map(r => r.id + ':' + r.email).join(','), 'a:x@e.test');
  assert.equal(app.reponsesNonVuesSondages(sondages, '').length, 2);
  assert.equal(app.reponsesNonVuesSondages(sondages, '2026-10-02T00:00:00Z').length, 0);
});

test('motPastilleAgenda : jour abrégé (« Jeu »), mois abrégé en vue Mois (« Oct »)', () => {
  const jeudi = new Date('2026-10-01T00:00:00');
  assert.equal(app.motPastilleAgenda(jeudi, 'semaine'), 'Jeu');
  assert.equal(app.motPastilleAgenda(jeudi, 'mois'), 'Oct');
  assert.equal(app.motPastilleAgenda(new Date('2026-10-05T00:00:00'), 'jour'), 'Lun');
});
