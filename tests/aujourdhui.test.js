const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

// « Aujourd'hui » : sélection des actions du jour, de ce qui a changé depuis la dernière visite,
// du journal de la journée et de la préparation des signatures. Dossiers inventés.

const app = chargerApplication();
const AUJ = '2026-09-28';

function dossier(extra) {
  return Object.assign({ id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', emailAcquereur: 'client@exemple.fr', historique: [], parties: [{ nom: 'Léa MARTIN', role: 'ACQUEREUR' }] }, extra);
}
const types = (r) => r.actions.map(a => a.type).join(',');

test('offre de prêt : relance proposée à J-15 puis attendue 10 jours après la dernière', () => {
  const d = dossier({ pret: '2026-10-02' });
  const r1 = app.actionsDuJour([d], AUJ);
  assert.strictEqual(types(r1), 'pret');
  assert.strictEqual(r1.actions[0].gravite, 'critique');
  assert.strictEqual(r1.actions[0].geste.motif, 'pret');
  const relance = app.actionsDuJour([dossier({ pret: '2026-10-02', derniereRelanceAuto: '2026-09-25' })], AUJ);
  assert.strictEqual(types(relance), '');
  assert.match(relance.aVenir.map(v => v.titre).join('|'), /Offre de prêt relancée/);
  // Offre reçue : plus de relance, l'étape suivante est de fixer le rendez-vous de signature.
  const recue = app.actionsDuJour([dossier({ pret: '2026-10-02', offrePretStatut: 'recue', pieces: { renonciationPreemption: 'recue' } })], AUJ);
  assert.ok(!types(recue).includes('pret'));
  assert.strictEqual(recue.actions[0].titre, 'Fixer le rendez-vous');
  // Au-delà de 15 jours : rien aujourd'hui.
  assert.strictEqual(types(app.actionsDuJour([dossier({ pret: '2026-11-30' })], AUJ)), '');
});

test('sans email, la relance de l’offre ouvre la fiche au lieu d’un brouillon', () => {
  const r = app.actionsDuJour([dossier({ pret: '2026-10-02', emailAcquereur: '' })], AUJ);
  assert.strictEqual(r.actions[0].geste.type, 'fiche');
  assert.match(r.actions[0].contexte, /non renseigné/);
});

test('avant la signature : appel de fonds, puis projet, confirmation des fonds et RIB', () => {
  const base = { rendezVousSignature: '2026-09-30', sansPret: true };
  // À 2 jours du rendez-vous : la fiche de signature est aussi à imprimer (étude 24/10).
  assert.strictEqual(types(app.actionsDuJour([dossier(base)], AUJ)), 'appelFonds,rib,ficheSignature');
  const apresAppel = dossier(Object.assign({}, base, { appelFonds: '2026-09-21', echeancesValidees: { appelFonds: true } }));
  // À 3 jours du rendez-vous sans fonds relevés : la relance des fonds remplace « Confirmer la réception » (étude, 03/10).
  assert.strictEqual(types(app.actionsDuJour([apresAppel], AUJ)), 'projetEnvoye,relanceFonds,rib,ficheSignature');
  const tout = dossier(Object.assign({}, base, {
    appelFonds: '2026-09-21', projetEnvoye: '2026-09-24', receptionFondsConfirmeeLe: '2026-09-25', ribDemandeLe: '2026-09-26',
    echeancesValidees: { appelFonds: true, projetEnvoye: true }
  }));
  assert.strictEqual(types(app.actionsDuJour([tout], AUJ)), 'ficheSignature');
  // Fiche de signature téléchargée pour CE rendez-vous : plus rien à faire ; un rendez-vous déplacé la redemande.
  const imprimee = Object.assign({}, tout, { ficheSignatureImprimeePour: app.cleVeilleSignature(tout) });
  assert.strictEqual(types(app.actionsDuJour([imprimee], AUJ)), '');
  assert.strictEqual(types(app.actionsDuJour([Object.assign({}, imprimee, { rendezVousSignature: '2026-09-29' })], AUJ)), 'ficheSignature');
  // Le RIB déjà demandé par l'ancienne relance (historique seul) compte aussi.
  const ancien = dossier(Object.assign({}, base, { historique: [{ date: '2026-09-20T09:00:00Z', texte: 'Relance manuelle envoyée — RIB' }] }));
  assert.ok(!types(app.actionsDuJour([ancien], AUJ)).includes('rib'));
});

test('signature lointaine : rien à faire, elle part dans « À venir »', () => {
  const r = app.actionsDuJour([dossier({ rendezVousSignature: '2026-10-20', sansPret: true })], AUJ);
  assert.strictEqual(types(r), '');
  const datees = r.aVenir.filter(v => v.iso);
  assert.strictEqual(datees.length, 1);
  assert.strictEqual(datees[0].iso, '2026-10-10', 'appel de fonds : 10 jours avant le rendez-vous (05/10)');
  // Le dossier pas encore relié au NAS y figure aussi, sans date.
  assert.ok(r.aVenir.some(v => v.titre === 'Relier le dossier du NAS'));
});

test('après la signature : questionnaire, jamais au confrère', () => {
  const r = app.actionsDuJour([dossier({ rendezVousSignature: '2026-09-24', sansPret: true, echeancesValidees: { appelFonds: true, projetEnvoye: true } })], AUJ);
  // Le vendeur sans email : la tâche demande de le renseigner (étude 07/10).
  assert.strictEqual(types(r), 'questionnaire,questionnaireVendeur');
  const confrere = app.actionsDuJour([dossier({ rendezVousSignature: '2026-09-24', sansPret: true, notaireAcquereur: 'Maître Paul LAMBERT', echeancesValidees: { appelFonds: true, projetEnvoye: true } })], AUJ);
  assert.strictEqual(types(confrere), 'questionnaireVendeur');
});

test('les autres points ouvrent la fiche ; un dossier archivé ne produit rien', () => {
  // Vente préalable qui approche : un brouillon de relance en un clic (client ou confrère)…
  const r = app.actionsDuJour([dossier({ sansPret: true, ventebien: '2026-09-30' })], AUJ);
  assert.strictEqual(r.actions.length, 1);
  assert.strictEqual(r.actions[0].geste.type, 'email');
  assert.strictEqual(r.actions[0].geste.motif, 'ventePrealable');
  assert.strictEqual(r.actions[0].titre, 'Relancer la vente préalable');
  // … sans email connu, la fiche s'ouvre ; relancée il y a moins de 5 jours, elle attend.
  const sansEmail = app.actionsDuJour([dossier({ sansPret: true, ventebien: '2026-09-30', emailAcquereur: '' })], AUJ);
  assert.strictEqual(sansEmail.actions[0].geste.type, 'fiche');
  assert.strictEqual(sansEmail.actions[0].titre, 'Confirmer la vente préalable');
  const relancee = app.actionsDuJour([dossier({ sansPret: true, ventebien: '2026-09-30', relanceVentePrealableLe: '2026-09-25' })], AUJ);
  assert.strictEqual(relancee.actions.length, 0);
  assert.ok(relancee.aVenir.some(v => v.titre === 'Vente préalable relancée'));
  assert.strictEqual(app.actionsDuJour([dossier({ pret: '2026-10-02', archive: true })], AUJ).actions.length, 0);
});

test('tri : le plus grave puis le plus proche ; clés stables', () => {
  const a = dossier({ id: 'a', nom: 'A / A', sansPret: true, rendezVousSignature: '2026-10-03' });
  const b = dossier({ id: 'b', nom: 'B / B', pret: '2026-10-01' });
  const r = app.actionsDuJour([a, b], AUJ);
  assert.strictEqual(r.actions[0].cle, 'b:pret');
  assert.ok(r.actions.every(x => x.cle === `${x.dossier.id}:${x.type}`));
});

test('brouillonAction reprend les modèles de l’étude', () => {
  const r = app.actionsDuJour([dossier({ pret: '2026-10-02' })], AUJ);
  const b = app.brouillonAction(r.actions[0]);
  assert.strictEqual(b.a, 'client@exemple.fr');
  assert.match(b.corps, /Nous n'avons pas encore reçu votre offre de prêt/);
});

test('depuis la dernière visite : pièces et changements des autres, pas les siens', () => {
  const d = dossier({
    piecesTrouveesLe: { titrePropriete: '2026-09-27T10:00:00Z' },
    historique: [
      { date: '2026-09-26T08:00:00Z', texte: 'Ancien', auteur: 'Bastien ANGLUMENT' },
      { date: '2026-09-27T09:00:00Z', texte: 'Rendez-vous déplacé', auteur: 'Bastien ANGLUMENT' },
      { date: '2026-09-27T11:00:00Z', texte: 'Moi', auteur: 'Julie VASSELIN' },
      { date: '2026-09-27T12:00:00Z', texte: 'Envoi relevé dans l’agenda' }
    ]
  });
  const g = app.evenementsDepuisVisite([d], '2026-09-26T18:00:00Z', 'Julie VASSELIN');
  assert.strictEqual(g.length, 1);
  const textes = g[0].lignes.map(l => l.texte).join('|');
  assert.match(textes, /1 pièce trouvée sur le NAS/);
  assert.match(textes, /Rendez-vous déplacé/);
  assert.match(textes, /agenda/);
  assert.doesNotMatch(textes, /Moi|Ancien/);
  assert.strictEqual(app.evenementsDepuisVisite([d], null, 'Julie VASSELIN').length, 0);
});

test('message de progression : court, jamais culpabilisant', () => {
  assert.strictEqual(app.messageProgressionJour(0, 0), 'Rien au programme aujourd’hui.');
  assert.strictEqual(app.messageProgressionJour(0, 3), 'Journée bouclée.');
  assert.strictEqual(app.messageProgressionJour(1, 0), 'Une seule chose aujourd’hui.');
  assert.strictEqual(app.messageProgressionJour(5, 0), 'C’est parti : 5 choses aujourd’hui.');
  assert.strictEqual(app.messageProgressionJour(1, 4), 'Plus qu’une !');
  assert.strictEqual(app.messageProgressionJour(3, 2), 'Bien lancé — encore 3.');
});

test('une ligne d’action : un seul bouton de geste, « plus tard » à côté, verbe court', () => {
  const r = app.actionsDuJour([dossier({ pret: '2026-10-02' })], AUJ);
  const html = app.renderLigneActionJour(r.actions[0], false);
  assert.strictEqual((html.match(/ja-go/g) || []).length, 1);
  assert.match(html, /ja-plus-tard/);
  assert.match(html, /<span>Relancer<\/span>/);
  assert.match(html, /DUPONT \/ MARTIN/);
});

test('Tâches non faites la veille : repérées le lendemain', () => {
  const j1 = app.majVeilleJour(null, '2026-09-28', ['a', 'b']);
  assert.equal(j1.hier.size, 0);
  const j1bis = app.majVeilleJour(j1.stock, '2026-09-28', ['c']);
  assert.equal(j1bis.stock.cles.join(','), 'a,b,c');
  const j2 = app.majVeilleJour(j1bis.stock, '2026-09-29', ['a']);
  assert.equal(j2.hier.has('b') && j2.hier.has('c') && j2.hier.has('a'), true);
  assert.equal(j2.hierDate, '2026-09-28');
  assert.equal(app.libelleNonFaite('2026-09-28', '2026-09-29'), 'Non faite hier');
  assert.match(app.libelleNonFaite('2026-09-25', '2026-09-29'), /^Non faite depuis le 25 sept/);
  // Le même jour, le repère d'hier ne bouge pas.
  const j2bis = app.majVeilleJour(j2.stock, '2026-09-29', ['d']);
  assert.equal(j2bis.hierDate, '2026-09-28');
});

test('Rappel qui parle d’écrire : email proposé', () => {
  assert.equal(app.rappelParleEmail('Envoyer un mail au syndic'), true);
  assert.equal(app.rappelParleEmail('Écrire à Me Denis'), true);
  assert.equal(app.rappelParleEmail('Répondre au courriel de la banque'), true);
  assert.equal(app.rappelParleEmail('Contacter jean@exemple.fr'), true);
  assert.equal(app.rappelParleEmail('Appeler la mairie'), false);
  assert.equal(app.rappelParleEmail('Vérifier le mailing'), false);
});

test('Activité de l’étude : gestes des collaborateurs et agenda, du plus récent au plus ancien', () => {
  const dossiers = [
    { id: 'd1', nom: 'A / B', historique: [
      { date: '2026-09-28T08:00:00Z', texte: 'Dossier créé', auteur: 'Julie VASSELIN' },
      { date: '2026-09-28T09:00:00Z', texte: 'Pièce trouvée sur le NAS' },
      { date: '2026-09-28T10:00:00Z', texte: 'Rendez-vous de signature du 03/10/2026 relevé dans l’agenda de l’office (« VTE - A »)' }
    ] },
    { id: 'd2', nom: 'C / D', archive: true, historique: [{ date: '2026-09-28T09:30:00Z', texte: 'Dossier archivé', auteur: 'Bastien ANGLUMENT' }] }
  ];
  const l = app.activiteEtude(dossiers);
  assert.equal(l.map(e => e.dossierId + ':' + e.source).join(','), 'd1:agenda,d2:dossier,d1:dossier');
  const maintenant = Date.parse('2026-09-28T10:05:00Z');
  assert.equal(app.ilYaActivite('2026-09-28T10:04:40Z', maintenant), 'à l’instant');
  assert.equal(app.ilYaActivite('2026-09-28T09:50:00Z', maintenant), 'il y a 15 min');
});

test('Tâches faites ailleurs : cochées avec qui les a faites (CLAIRE, un collègue, un autre poste)', () => {
  const auj = '2026-10-05';
  const a = (h) => new Date(2026, 9, 5, h, 10).toISOString();
  const d1 = { id: 'd1', nom: 'DUPONT / MARTIN', historique: [
    { date: a(3), texte: 'Envoi de l’appel de fonds noté automatiquement : « Décompte acquéreur.pdf » trouvé dans le dossier du NAS' },
    { date: a(9), auteur: 'Jérémy SAUJOT', texte: 'Relance manuelle envoyée — RIB' },
    { date: a(10), auteur: 'Julie VASSELIN', texte: 'Projet d’acte envoyé marqué réalisé (date saisie)' },
    { date: new Date(2026, 9, 4, 11).toISOString(), auteur: 'Jérémy SAUJOT', texte: 'Email envoyé — confirmation de réception des fonds en comptabilité' }
  ] };
  const d2 = { id: 'd2', nom: 'LEROY / BERNARD', historique: [
    { date: a(11), auteur: 'Jérémy SAUJOT', texte: 'Relancer l’offre de prêt : noté fait à la main' },
    { date: a(12), auteur: 'Jérémy SAUJOT', texte: 'Relance manuelle envoyée — vente préalable' }
  ] };
  const liste = app.tachesFaitesAilleurs([d1, d2], 'Julie VASSELIN', auj, new Set(['d2:ventePrealable']), new Set(['d1:projetEnvoye']));
  const lignes = liste.map(t => `${t.cle}|${t.etat}`).join(' ; ');
  assert.match(lignes, /d1:appelFonds\|Faite par CLAIRE \(courrier sur le NAS\)/);
  assert.match(lignes, /d1:rib\|Faite par Jérémy/);
  assert.match(lignes, /d2:pret\|Faite par Jérémy/);
  assert.doesNotMatch(lignes, /d1:projetEnvoye/, 'déjà cochée sur ce poste');
  assert.doesNotMatch(lignes, /d2:ventePrealable/, 'toujours due');
  assert.doesNotMatch(lignes, /d1:fonds/, 'hier');
  assert.equal(liste.find(t => t.cle === 'd1:appelFonds').courrier, true);
  assert.equal(liste[0].cle, 'd2:pret', 'la plus récente d’abord');
  // Faite par soi-même sur un autre poste.
  const autrePoste = app.tachesFaitesAilleurs([d1], 'Jérémy SAUJOT', auj, new Set(), new Set());
  assert.match(autrePoste.map(t => t.etat).join(' ; '), /Faite depuis un autre poste/);
});

test('Tâche faite sur le dossier d’un collègue : il est prévenu, jamais pour son propre geste', () => {
  const d = { id: 'd1', responsable: 'Julie VASSELIN' };
  assert.equal(app.doitNotifierTacheFaite(d, 'Jérémy SAUJOT'), true);
  assert.equal(app.doitNotifierTacheFaite(d, 'Julie VASSELIN'), false);
  assert.equal(app.doitNotifierTacheFaite(d, ''), false);
  assert.equal(app.doitNotifierTacheFaite({ id: 'd2' }, 'Jérémy SAUJOT'), false);
});

test('Emails du matin : chacun voit ses dossiers, l’administrateur aussi les emails hors dossiers', () => {
  const resume = { date: '2026-10-06', dossiers: [
    { dossierId: 'd1', emails: [{ sujet: 'a' }, { sujet: 'b' }] },
    { dossierId: 'd2', emails: [{ sujet: 'c' }] }
  ], autres: [{ sujet: 'perso' }] };
  const julie = app.emailsMatinPourPoste(resume, ['d1'], false);
  assert.equal(julie.nb, 2);
  assert.equal(julie.autres.length, 0);
  const bastien = app.emailsMatinPourPoste(resume, ['d1', 'd2'], true);
  assert.equal(bastien.nb, 4);
  assert.equal(app.emailsMatinPourPoste(null, ['d1'], true).nb, 0);
});

test('Emails du matin : plus affichés à personne (étude 07/10 : « retire les emails reçus de CLAIRE »)', () => {
  assert.equal(app.recoitEmailsMatin('Bastien ANGLUMENT'), false);
  assert.equal(app.recoitEmailsMatin('Julie VASSELIN'), false);
  assert.equal(app.recoitEmailsMatin('Jérémy SAUJOT'), false);
});

test('acquéreur accompagné par un confrère : pas de RIB, provision et pièce d’identité demandées au confrère', () => {
  const confrere = { notaireVendeur: 'Maître Sophie GOSSART (Blois)', notaireAcquereur: 'Maître Jules VERNAY (Cellettes)',
    emailNotaireParticipant: 'office.vernay@notaires.fr', rendezVousSignature: '2026-09-30', sansPret: true };
  assert.strictEqual(types(app.actionsDuJour([dossier(confrere)], AUJ)), 'appelFonds,ficheSignature');
  // Onglet Échanges : pas de RIB ; la provision et la pièce d'identité restent demandées au confrère.
  const e = app.echangesSelonStade(dossier(confrere), AUJ);
  const tout = e.utiles.concat(e.autres).join(',');
  assert.ok(!/rib/.test(tout), tout);
  assert.ok(/provision/.test(tout), tout);
  // Email de réception des fonds au confrère : sans la phrase RIB / pièces d'identité.
  const fonds = app.construireEmailReceptionFonds(dossier(confrere));
  assert.doesNotMatch(fonds.corps, /RIB|pièces d’identité/);
  assert.match(app.construireEmailReceptionFonds(dossier({ rendezVousSignature: '2026-09-30' })).corps, /pièces d’identité et de votre RIB/);
});

test('projet d’acte (30/09) : email avec rappel du rendez-vous, proposé une fois le rendez-vous fixé, et « À faire » l’ouvre', () => {
  const avecRdv = dossier({ rendezVousSignature: '2026-10-05', rendezVousSignatureHeure: '14:30', emailAcquereur: 'client@exemple.fr' });
  const email = app.construireEmailProjetActe(avecRdv);
  assert.match(email.sujet, /^Projet d'acte de vente — VTE - /);
  assert.match(app.texteSansMarques(email.corps), /ci-joint le projet de l'acte de vente/);
  assert.match(app.texteSansMarques(email.corps), /fixé au lundi 5 octobre 2026 à 14h30, en notre office\./);
  assert.doesNotMatch(app.construireEmailProjetActe(dossier({})).corps, /rendez-vous/);
  // Onglet Échanges : utile au stade « rendez-vous fixé », replié avant, absent une fois signé.
  assert.ok(app.echangesSelonStade(avecRdv, AUJ).utiles.includes('projet'));
  assert.ok(app.echangesSelonStade(dossier({ sansPret: true }), AUJ).autres.includes('projet'));
  assert.ok(!app.echangesSelonStade(dossier({ rendezVousSignature: '2026-09-01' }), AUJ).utiles.concat(app.echangesSelonStade(dossier({ rendezVousSignature: '2026-09-01' }), AUJ).autres).includes('projet'));
  // « À faire » : appel de fonds envoyé, projet pas encore → le geste est l'email (un destinataire existe).
  const d = dossier({ rendezVousSignature: '2026-10-02', appelFonds: '2026-09-25', echeancesValidees: { appelFonds: true }, emailAcquereur: 'client@exemple.fr', sansPret: true });
  const a = app.actionsDuJour([d], AUJ).actions.find(x => x.type === 'projetEnvoye');
  assert.ok(a, 'action attendue');
  assert.equal(a.geste.type + ':' + a.geste.motif, 'email:projet');
  assert.equal(app.libelleCourtGeste(a), 'Envoyer');
  assert.equal(a.second.type + ':' + a.second.champ, 'marquer:projetEnvoye');
  // Sans destinataire : on note seulement.
  const sans = app.actionsDuJour([Object.assign({}, d, { emailAcquereur: '' })], AUJ).actions.find(x => x.type === 'projetEnvoye');
  assert.equal(sans.geste.type, 'marquer');
  assert.equal(app.libelleCourtGeste(sans), 'Marquer envoyé');
});

test('fiche › Prochaine étape : la préemption n’est pas rangée sous l’obtention du prêt', () => {
  // Prêt dépassé, butoir dépassé sans rendez-vous et sans renonciation : deux actions, deux étapes.
  const d = dossier({ pret: '2026-08-14', acte: '2026-09-15', typeVente: 'maison' });
  const r = app.actionsDuJour([d], '2026-09-30');
  const pret = r.actions.find(a => a.type === 'pret');
  const preemption = r.actions.find(a => /préemption/.test(a.titre));
  assert.ok(pret && preemption, types(r));
  assert.strictEqual(preemption.categorieLabel, 'Droit de préemption');
  assert.strictEqual(app.actionLieeEtape(pret, 'pret'), true);
  assert.strictEqual(app.actionLieeEtape(preemption, 'pret'), false);
  // Elle relève de l'étape « Fixer le rendez-vous » (pas de rendez-vous sans elle).
  assert.strictEqual(app.actionLieeEtape(preemption, 'fixerRdv'), true);
  assert.strictEqual(app.actionLieeEtape(preemption, 'preemption'), true);
  assert.strictEqual(app.actionLieeEtape(pret, 'fixerRdv'), false);
  assert.strictEqual(app.actionLieeEtape({ categorie: 'appelFonds', titre: 'Envoyer l’appel de fonds' }, 'appelFonds'), true);
  assert.strictEqual(app.actionLieeEtape({ categorie: 'appelFonds', titre: 'Envoyer l’appel de fonds' }, 'pret'), false);
});

test('rappelsDuJour : les rappels à venir (échéance datée après aujourd\'hui) rejoignent la liste, triés par date', () => {
  const app = chargerApplication();
  const r = app.rappelsDuJour([
    { id: 'a', texte: 'A', echeance: '2026-10-12', creeLe: '2026-10-01T08:00:00', fait: false },
    { id: 'b', texte: 'B', echeance: '2026-10-06', creeLe: '2026-10-02T08:00:00', fait: false },
    { id: 'c', texte: 'C', echeance: '2026-10-05', creeLe: '2026-10-02T08:00:00', fait: false },
    { id: 'd', texte: 'D', echeance: '', creeLe: '2026-10-02T08:00:00', fait: false },
    { id: 'e', texte: 'E', echeance: '2026-10-09', creeLe: '2026-10-02T08:00:00', fait: true, faitLe: '2026-10-04T10:00:00' }
  ], '2026-10-05');
  assert.equal(r.aVenir.map(x => x.id).join(','), 'b,a', 'à venir : non faits, datés après aujourd\'hui, du plus proche au plus lointain');
  assert.equal(r.aFaire.map(x => x.id).sort().join(','), 'c,d', 'du jour et sans date : inchangé');
  assert.equal(r.faits.length, 0);
});

test('tâches imbriquées : deux tâches d’un même dossier forment un groupe, au rang de la plus pressante', () => {
  const a = (id, cle, titre) => ({ cle, titre, type: 'x', categorie: 'appelFonds', gravite: 'normal', dossier: { id, nom: 'NOM ' + id } });
  const actions = [a('d1', 'k1', 'Envoyer l’appel de fonds'), a('d2', 'k2', 'Relancer'), a('d1', 'k3', 'Envoyer le projet')];
  const elements = app.grouperActionsParDossier(actions).elements;
  assert.strictEqual(elements.length, 2);
  assert.strictEqual(elements[0].groupe.dossier.id, 'd1');
  assert.strictEqual(elements[0].groupe.actions.map(x => x.cle).join(','), 'k1,k3');
  assert.strictEqual(elements[1].action.cle, 'k2');
  // Une seule tâche par dossier : rien n'est regroupé.
  assert.strictEqual(app.grouperActionsParDossier([actions[0], actions[1]]).elements.filter(e => e.groupe).length, 0);
  assert.strictEqual(app.grouperActionsParDossier(undefined).elements.length, 0);
  // Une tâche faite aujourd'hui compte : le groupe reste après la première coche, la tâche faite y est rangée (plus en bas).
  const faite = { cle: 'k0', titre: 'Envoyer le projet', dossierId: 'd2', dossier: 'VTE - NOM d2', etat: 'Déjà fait', heure: '10 h 00' };
  const ailleurs = { cle: 'k9', titre: 'Autre', dossierId: 'd9', dossier: 'VTE - NOM d9', etat: 'Déjà fait', heure: '9 h 00' };
  const r = app.grouperActionsParDossier([actions[1]], [faite, ailleurs]);
  assert.strictEqual(r.elements[0].groupe.faites[0].cle, 'k0');
  assert.strictEqual(r.traites.map(t => t.cle).join(','), 'k9');
});

test('tâches imbriquées : la ligne du groupe porte la case commune et le tiroir des tâches une par une', () => {
  const d = dossier({ rendezVousSignature: '2026-09-30', sansPret: true });
  const r = app.actionsDuJour([d], AUJ);
  assert.ok(r.actions.length >= 2, types(r));
  const html = app.renderActionsJour(r.actions, false);
  assert.strictEqual((html.match(/class="ja ja-avec-case ja-groupe/g) || []).length, 1);
  assert.match(html, /marquerFaitGroupeJour\('d1'\)/);
  assert.match(html, new RegExp(`${r.actions.length} tâches`));
  assert.match(html, /ja-groupe-tiroir/);
  assert.match(html, /ja-sous-liste/);
  // Dans le tiroir, chaque tâche garde sa case, sans répéter le nom du dossier.
  const tiroir = html.slice(html.indexOf('ja-sous-liste'));
  assert.strictEqual((tiroir.match(/ja-case-ronde/g) || []).length, r.actions.length);
  assert.doesNotMatch(tiroir, /VTE - DUPONT/);
  assert.doesNotMatch(tiroir, /class="ja-sous"/, 'pas de sous-titre dans le tiroir (étude 05/10)');
});

test('appel de fonds : la tâche apparaît 10 jours avant le rendez-vous, le jour de son échéance (05/10)', () => {
  // AUJ = 28/09 : rendez-vous le 08/10 (J-10) → à faire ; le 09/10 (J-11) → pas encore.
  assert.ok(types(app.actionsDuJour([dossier({ rendezVousSignature: '2026-10-08', sansPret: true })], AUJ)).includes('appelFonds'));
  assert.ok(!types(app.actionsDuJour([dossier({ rendezVousSignature: '2026-10-09', sansPret: true })], AUJ)).includes('appelFonds'));
});

test('nom du dossier dans une tâche : un lien vers la fiche (05/10), sur la ligne seule comme sur le groupe', () => {
  const r = app.actionsDuJour([dossier({ pret: '2026-10-02' })], AUJ);
  const seule = app.renderLigneActionJour(r.actions[0], false);
  assert.match(seule, /class="ja-dossier-lien" data-ouvrir-dossier="d1"[^>]*>VTE - DUPONT \/ MARTIN</);
  const groupe = app.renderActionsJour(app.actionsDuJour([dossier({ rendezVousSignature: '2026-09-30', sansPret: true })], AUJ).actions, false);
  const tete = groupe.slice(0, groupe.indexOf('ja-groupe-tiroir'));
  // Depuis le 06/10 le nom du dossier est en surtitre, au-dessus des tâches du groupe.
  assert.match(tete, /<span class="ja-surtitre"><span class="ja-dossier-lien" data-ouvrir-dossier="d1"[^>]*>VTE - DUPONT \/ MARTIN<\/span><\/span>\s*<span class="ja-titre">/);
  // Dans la fiche du dossier, pas de lien vers elle-même.
  assert.doesNotMatch(app.renderLigneActionJour(r.actions[0], false, true), /data-ouvrir-dossier/);
});

test('tâches (étude 06/10) : nom du dossier en surtitre au-dessus de la tâche, icône fiche, plus de sous-titre ; groupe pareil', () => {
  const app = chargerApplication();
  const d = { id: 'u1', nom: 'MARTEL / FOURNIER', responsable: 'Julie VASSELIN', sansPret: true, rendezVousSignature: AUJ, emailAcquereur: 'a@exemple.fr', pieces: {}, historique: [] };
  const a = app.actionsDuJour([d], AUJ).actions[0];
  const html = app.renderLigneActionJour(a, false, false, false);
  assert.match(html, /<span class="ja-surtitre"><span class="ja-dossier-lien" data-ouvrir-dossier="u1"[^>]*>VTE - MARTEL \/ FOURNIER<\/span><\/span><span class="ja-titre">[^<]+<\/span>/);
  assert.doesNotMatch(html, /class="ja-sous"/, 'plus de sous-titre');
  assert.match(html, /class="bouton-icone icon-btn ja-ouvrir-fiche" data-ouvrir-dossier="u1"/, 'icône fiche');
  // Dans la fiche : ni nom du dossier ni icône.
  const fiche = app.renderLigneActionJour(a, false, true, false);
  assert.doesNotMatch(fiche, /ja-surtitre|ja-ouvrir-fiche/);
  // Tiroir d'un groupe : pas de surtitre (le dossier est sur la ligne du groupe).
  assert.doesNotMatch(app.renderLigneActionJour(a, false, false, true), /ja-surtitre/);
  // Groupe : dossier en surtitre, « tâche · tâche » et compte en badge, icône fiche à côté du chevron.
  const d2 = Object.assign({}, d, { id: 'u2', appelFonds: AUJ, echeancesValidees: { appelFonds: true }, rendezVousSignature: app.addDays(AUJ, 2) });
  const actions = app.actionsDuJour([d2], AUJ).actions;
  assert.ok(actions.length >= 2, actions.map(x => x.type).join(','));
  const groupe = app.renderActionsJour(actions, false, []);
  assert.match(groupe, /<span class="ja-surtitre"><span class="ja-dossier-lien" data-ouvrir-dossier="u2"[^>]*>VTE - MARTEL \/ FOURNIER<\/span><\/span>\s*<span class="ja-titre">[^<]+ · [^<]+ <span class="ja-groupe-compte/);
  assert.doesNotMatch(groupe.split('ja-groupe-tiroir')[0], /class="ja-sous"/);
  assert.match(groupe, /ja-ouvrir-fiche" data-ouvrir-dossier="u2"/);
});

test('questionnaire au vendeur aussi (étude 07/10), jamais au client d’un confrère ; archivé quand les deux sont envoyés', () => {
  const base = { rendezVousSignature: '2026-09-24', sansPret: true, echeancesValidees: { appelFonds: true, projetEnvoye: true }, emailVendeur: 'vendeur@exemple.fr' };
  const r = app.actionsDuJour([dossier(base)], AUJ);
  assert.strictEqual(types(r), 'questionnaire,questionnaireVendeur');
  const v = r.actions.find(a => a.type === 'questionnaireVendeur');
  assert.strictEqual(v.titre, 'Envoyer le questionnaire de satisfaction au vendeur');
  assert.strictEqual(v.geste.partie, 'vendeur');
  assert.match(v.contexte, /archivé une fois l’acquéreur servi aussi/);
  // Acquéreur déjà servi : la tâche du vendeur archivera le dossier.
  const apres = app.actionsDuJour([dossier(Object.assign({}, base, { questionnaireEnvoyeLe: '2026-09-25' }))], AUJ);
  assert.strictEqual(types(apres), 'questionnaireVendeur');
  assert.match(apres.actions[0].contexte, /archivé à l’envoi/);
  // Vendeur représenté par un confrère : rien pour lui, et l'acquéreur seul suffit à archiver.
  const confrere = dossier(Object.assign({}, base, { notaireVendeur: 'Maître Paul LAMBERT' }));
  assert.strictEqual(types(app.actionsDuJour([confrere], AUJ)), 'questionnaire');
  assert.strictEqual(app.questionnairesRestants(confrere).join(','), 'acquereur');
  assert.strictEqual(app.questionnairesRestants(Object.assign({}, confrere, { questionnaireEnvoyeLe: '2026-09-25' })).length, 0);
  assert.strictEqual(app.questionnairesRestants(dossier(base)).join(','), 'acquereur,vendeur');
});

test('questionnaire sans email du côté : la tâche demande de renseigner l’email (étude 07/10), le côté reste attendu', () => {
  const base = { rendezVousSignature: '2026-09-24', sansPret: true, echeancesValidees: { appelFonds: true, projetEnvoye: true }, emailAcquereur: '', emailVendeur: '' };
  const r = app.actionsDuJour([dossier(base)], AUJ);
  assert.strictEqual(types(r), 'questionnaire,questionnaireVendeur');
  const a = r.actions.find(x => x.type === 'questionnaire');
  const v = r.actions.find(x => x.type === 'questionnaireVendeur');
  assert.strictEqual(a.titre, 'Renseigner l’email de l’acquéreur pour le questionnaire de satisfaction');
  assert.strictEqual(v.titre, 'Renseigner l’email du vendeur pour le questionnaire de satisfaction');
  assert.strictEqual(v.geste.type, 'fiche');
  assert.match(v.contexte, /Sans email, le questionnaire ne peut pas partir ; le dossier sera archivé une fois l’acquéreur servi aussi/);
  assert.strictEqual(app.questionnairesRestants(dossier(base)).join(','), 'acquereur,vendeur');
  // L'email saisi : la tâche redevient « Envoyer ».
  const ok = app.actionsDuJour([dossier(Object.assign({}, base, { emailVendeur: 'v@exemple.fr' }))], AUJ).actions.find(x => x.type === 'questionnaireVendeur');
  assert.strictEqual(ok.titre, 'Envoyer le questionnaire de satisfaction au vendeur');
  assert.strictEqual(ok.geste.type, 'questionnaire');
});

test('rédaction de l’acte (étude 07/10) : proposée quand Authentic dit « Non rédigé » et que prêt, préemption, SAFER, vente préalable sont levés', () => {
  const pret = { offrePretStatut: 'recue', pieces: { renonciationPreemption: 'recue' }, typeVente: 'maison' };
  const aRediger = { authentic: { acte: { etat: 'a_rediger', libelle: 'Pas encore rédigé' } } };
  const base = Object.assign({ pret: '2026-09-20', rendezVousSignature: '2026-10-30' }, pret, aRediger);
  const r = app.actionsDuJour([dossier(base)], AUJ);
  const red = r.actions.find(a => a.type === 'redaction');
  assert.ok(red, 'tâche « Rédiger l’acte »');
  assert.strictEqual(red.titre, 'Rédiger l’acte');
  assert.strictEqual(app.redactionAProposer(dossier(base)), true);
  // Échéance : 15 jours avant le rendez-vous ; dans le planning, à côté de l'étape en cours.
  assert.strictEqual(app.echeanceRedaction(dossier(base)), '2026-10-15');
  assert.ok(app.echeancesPlanning(dossier(base)).some(e => e.type === 'redaction' && e.iso === '2026-10-15'));
  // Sans état lu dans Authentic : rien (choix de l'étude).
  assert.strictEqual(app.redactionAProposer(dossier(Object.assign({}, base, { authentic: {} }))), false);
  // Ce qui la retient : offre de prêt, préemption, SAFER, vente préalable — jamais l'urbanisme.
  const sansOffre = dossier(Object.assign({}, base, { offrePretStatut: 'manquante' }));
  assert.strictEqual(app.redactionAProposer(sansOffre), false);
  assert.strictEqual(app.attentesRedaction(sansOffre).join(','), 'offre de prêt');
  const sansDia = dossier(Object.assign({}, base, { pieces: {} }));
  assert.strictEqual(app.attentesRedaction(sansDia).join(','), 'renonciation au droit de préemption');
  const venteAFaire = dossier(Object.assign({}, base, { ventebien: '2026-10-05' }));
  assert.strictEqual(app.attentesRedaction(venteAFaire).join(','), 'vente préalable');
  const safer = dossier(Object.assign({}, base, { authentic: { acte: aRediger.authentic.acte, safer: { envoyeeLe: '2026-09-20' } } }));
  assert.strictEqual(app.attentesRedaction(safer).join(','), 'réponse de la SAFER');
  // « En cours » dans Authentic (ou cochée à la main) : faite, plus de tâche ; jamais en participation.
  const enCours = dossier(Object.assign({}, base, { authentic: { acte: { etat: 'redaction' } } }));
  assert.strictEqual(app.echeanceValidee(enCours, 'redaction'), true);
  assert.ok(!app.actionsDuJour([enCours], AUJ).actions.some(a => a.type === 'redaction'));
  const cochee = dossier(Object.assign({}, base, { echeancesValidees: { redaction: true } }));
  assert.strictEqual(app.redactionAProposer(cochee), false);
  assert.strictEqual(app.redactionAProposer(dossier(Object.assign({}, base, { roleNotaire: 'participant' }))), false);
  // Rendez-vous pas encore fixé (étude 07/10 : « mettez bien l'échéance quand même ») : proposée, et toujours datée.
  const sansRdv = dossier(Object.assign({}, base, { rendezVousSignature: '', acte: '2026-11-30' }));
  assert.strictEqual(app.redactionAProposer(sansRdv), true);
  // Ni sondage ni agenda : 15 jours avant la signature au plus tôt (aujourd'hui + 14), jamais avant aujourd'hui.
  assert.strictEqual(app.echeanceRedaction(sansRdv, AUJ), AUJ);
  assert.strictEqual(app.repereSignatureRedaction(sansRdv, AUJ).source, 'probable');
  // Dates proposées au client (sondage ouvert) : 15 jours avant la première encore à venir.
  require('node:vm').runInContext(`sondagesCreneaux = [{ id: 's1', dossierId: ${JSON.stringify(sansRdv.id)}, statut: 'ouvert', creneaux: [{ date: '2099-11-20', heure: '10:00' }, { date: '2099-11-12', heure: '14:00' }, { date: '2026-09-01', heure: '10:00' }] }]`, app);
  assert.strictEqual(app.echeanceRedaction(sansRdv, AUJ), '2099-10-28');
  assert.strictEqual(app.repereSignatureRedaction(sansRdv, AUJ).source, 'propositions');
  const t = app.actionsDuJour([sansRdv], AUJ).actions.find(a => a.type === 'redaction');
  assert.ok(t && /avant le/.test(t.delaiTexte) && /Première date proposée/.test(t.contexte), t && t.contexte);
  assert.ok(app.echeancesPlanning(sansRdv).some(e => e.type === 'redaction' && e.iso === '2099-10-28'));
  require('node:vm').runInContext('sondagesCreneaux = []', app);
  // Côté serveur (sans sondage ni agenda) : la date butoir, 15 jours avant.
  const commun = require('../commun/planning.js');
  assert.strictEqual(commun.echeanceRedaction(Object.assign({}, sansRdv), '2026-10-01'), '2026-11-15');
});

// Étude 13/10 : des tâches datées plus tard, non cochées, n'apparaissaient nulle part (la carte ne montre plus l'à venir).
test('tâches à venir : comptées pour le lien de la carte', () => {
  const app2 = require('./helpers/load-app.js').chargerApplication();
  const r = app2.rappelsDuJour([
    { id: 'a', texte: 'Relancer', echeance: '2026-10-20', fait: false, creeLe: '2026-10-06T09:00:00' },
    { id: 'b', texte: 'Échue', echeance: '2026-10-08', fait: false, creeLe: '2026-10-06T09:00:00' }
  ], '2026-10-13');
  assert.equal(r.aVenir.length, 1);
  assert.equal(r.aFaire.length, 1);
  assert.equal(app2.libelleLienTachesAVenir(1), '1 tâche à venir — voir toutes les tâches');
  assert.equal(app2.libelleLienTachesAVenir(3), '3 tâches à venir — voir toutes les tâches');
  assert.equal(app2.libelleLienTachesAVenir(0), '');
});

test('tâche cochée dans « Aujourd’hui » puis décochée dans la fiche : elle redevient à faire (15/10)', () => {
  const coche = Date.now() - 60000;
  const traites = [
    { cle: 'd1:appelFonds', dossierId: 'd1', le: coche },
    { cle: 'd1:projetEnvoye', dossierId: 'd1', le: coche },
    { cle: 'd2:appelFonds', dossierId: 'd2' },                       // sans horodatage : jamais défaite
    { cle: 'd1:rib', dossierId: 'd1', le: coche }                    // pas une échéance de la fiche
  ];
  const d1 = { id: 'd1', historique: [
    { date: new Date(coche - 5000).toISOString(), texte: 'Envoi projet : validation annulée' },   // avant la coche : ne compte pas
    { date: new Date(coche + 20000).toISOString(), texte: 'Envoi appel de fonds : validation annulée' }
  ] };
  const d2 = { id: 'd2', historique: [{ date: new Date().toISOString(), texte: 'Envoi appel de fonds : validation annulée' }] };
  assert.equal(app.traitesDecochesDansFiche(traites, [d1, d2]).join(','), 'd1:appelFonds');
  assert.equal(app.traitesDecochesDansFiche(traites, []).length, 0);
});

test('tâche demandée par un collègue : dans « Aujourd’hui » dès son arrivée, même pour une date à venir, en tête (15/10)', () => {
  const r = app.rappelsDuJour([
    { id: 'a', texte: 'Mon rappel', echeance: '2026-09-28', fait: false, creeLe: '2026-09-20T08:00:00Z' },
    { id: 'b', texte: 'Appeler la mairie (demandé par Bastien)', echeance: '2026-10-02', fait: false, creeLe: '2026-09-28T09:00:00Z', demandePar: 'Bastien ANGLUMENT' },
    { id: 'c', texte: 'Plus tard', echeance: '2026-10-05', fait: false, creeLe: '2026-09-21T08:00:00Z' }
  ], AUJ);
  assert.equal(r.aFaire.map(x => x.id).join(','), 'b,a', 'la demande passe en tête, la date à venir ne la cache pas');
  assert.equal(r.aVenir.map(x => x.id).join(','), 'c', 'elle n’est pas aussi dans « À venir »');
});

test('« Imprimer la fiche dossier » : tâche 48 h avant le rendez-vous, avec son geste, jamais pour une succession ni plus tôt', () => {
  const d = dossier({ rendezVousSignature: '2026-09-30', rendezVousSignatureHeure: '10:00', sansPret: true });
  const r = app.actionsDuJour([d], AUJ);
  const t = r.actions.find(a => a.type === 'ficheSignature');
  assert.ok(t);
  assert.strictEqual(t.titre, 'Imprimer la fiche dossier');
  assert.strictEqual(t.geste.type, 'ficheSignature');
  assert.strictEqual(app.themeTache(t), 'avant');
  // Rendez-vous plus lointain : pas encore.
  assert.ok(!types(app.actionsDuJour([Object.assign({}, d, { rendezVousSignature: '2026-10-02' })], AUJ)).includes('ficheSignature'));
  // Succession : jamais.
  assert.ok(!types(app.actionsDuJour([Object.assign({}, d, { typeAffaire: 'succession' })], AUJ)).includes('ficheSignature'));
});
