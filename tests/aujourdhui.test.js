const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

// « Aujourd'hui » : sélection des actions du jour, de ce qui a changé depuis la dernière visite,
// du journal de la journée et de la préparation des signatures. Dossiers inventés.

const app = chargerApplication();
const AUJ = '2026-09-28';

function dossier(extra) {
  return Object.assign({ id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', emailAcquereur: 'client@exemple.fr', historique: [] }, extra);
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
  assert.strictEqual(types(app.actionsDuJour([dossier(base)], AUJ)), 'appelFonds,rib');
  const apresAppel = dossier(Object.assign({}, base, { appelFonds: '2026-09-21', echeancesValidees: { appelFonds: true } }));
  assert.strictEqual(types(app.actionsDuJour([apresAppel], AUJ)), 'projetEnvoye,fonds,rib');
  const tout = dossier(Object.assign({}, base, {
    appelFonds: '2026-09-21', projetEnvoye: '2026-09-24', receptionFondsConfirmeeLe: '2026-09-25', ribDemandeLe: '2026-09-26',
    echeancesValidees: { appelFonds: true, projetEnvoye: true }
  }));
  assert.strictEqual(types(app.actionsDuJour([tout], AUJ)), '');
  // Le RIB déjà demandé par l'ancienne relance (historique seul) compte aussi.
  const ancien = dossier(Object.assign({}, base, { historique: [{ date: '2026-09-20T09:00:00Z', texte: 'Relance manuelle envoyée — RIB' }] }));
  assert.ok(!types(app.actionsDuJour([ancien], AUJ)).includes('rib'));
});

test('signature lointaine : rien à faire, elle part dans « À venir »', () => {
  const r = app.actionsDuJour([dossier({ rendezVousSignature: '2026-10-20', sansPret: true })], AUJ);
  assert.strictEqual(types(r), '');
  const datees = r.aVenir.filter(v => v.iso);
  assert.strictEqual(datees.length, 1);
  assert.strictEqual(datees[0].iso, '2026-10-20');
  // Le dossier pas encore relié au NAS y figure aussi, sans date.
  assert.ok(r.aVenir.some(v => v.titre === 'Relier le dossier du NAS'));
});

test('après la signature : questionnaire, jamais au confrère', () => {
  const r = app.actionsDuJour([dossier({ rendezVousSignature: '2026-09-24', sansPret: true, echeancesValidees: { appelFonds: true, projetEnvoye: true } })], AUJ);
  assert.strictEqual(types(r), 'questionnaire');
  const confrere = app.actionsDuJour([dossier({ rendezVousSignature: '2026-09-24', sansPret: true, notaireAcquereur: 'Maître Paul LAMBERT', echeancesValidees: { appelFonds: true, projetEnvoye: true } })], AUJ);
  assert.strictEqual(types(confrere), '');
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

test('préparation des signatures : ce qui est prêt et ce qui manque', () => {
  const d = dossier({ rendezVousSignature: '2026-09-30', sansPret: true, roleNotaire: 'participant', echeancesValidees: { appelFonds: true } });
  const s = app.preparationSignatures([d], AUJ);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].points.map(p => p.libelle + ':' + p.ok).join(','), 'Appel de fonds:true,Fonds confirmés:false,Projet envoyé:false,RIB demandé:false');
  assert.strictEqual(s[0].pret, false);
});

test('texte de la liste du jour', () => {
  const r = app.actionsDuJour([dossier({ pret: '2026-10-02' })], AUJ);
  const t = app.texteListeDuJour(r.actions, AUJ, 'Julie VASSELIN');
  assert.match(t, /^Aujourd'hui — /);
  assert.match(t, /- Relancer l’offre de prêt — VENTE DUPONT \/ MARTIN \(J-4\)/);
  assert.match(app.texteListeDuJour([], AUJ, ''), /Rien à faire/);
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
