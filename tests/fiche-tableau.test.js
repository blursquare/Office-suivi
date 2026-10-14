'use strict';

// Fiche dossier : le tableau « À obtenir · À faire · En attente · Fait » et le bandeau du haut sont CALCULÉS (client/57).
// On les rejoue sur tous les types de dossier, avec des dossiers inventés : aucune erreur, aucune carte en double,
// chaque carte cochable appelle le geste d'avant, un dossier archivé n'offre plus aucun geste.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const AUJ = '2026-10-10';

function dossier(extra) {
  return Object.assign({
    id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', typeVente: 'maison', roleNotaire: 'instrumentaire',
    pret: '2026-11-20', ventebien: '', acte: '2026-12-15', rendezVousSignature: '2026-12-10',
    pieces: {}, echeancesValidees: {}, historique: [], dossierLie: true, nasDossier: 'X/DUPONT', offrePretStatut: 'manquante',
    autres: [], analyseJuridique: { engagements: [], documents: [] }
  }, extra || {});
}

const VARIANTES = {
  maison: dossier(),
  copropriete: dossier({ typeVente: 'copropriete' }),
  terrain: dossier({ typeVente: 'terrain' }),
  terre: dossier({ typeVente: 'terre' }),
  sansPret: dossier({ sansPret: true, pret: '' }),
  ventePrealable: dossier({ ventebien: '2026-11-01' }),
  sansDate: dossier({ pret: '', acte: '', rendezVousSignature: '' }),
  signature: dossier({ rendezVousSignature: '2026-09-20', echeancesValidees: { rendezVousSignature: true } }),
  passee: dossier({ rendezVousSignature: '2026-10-01' }),
  participation: dossier({ roleNotaire: 'participant' }),
  succession: dossier({ typeAffaire: 'succession', sansPret: true, pret: '', parties: [{ nom: 'Jean DURAND' }] }),
  archive: dossier({ archive: true }),
  engagements: dossier({ analyseJuridique: { engagements: [{ texte: 'Fournir le diagnostic électrique', fait: false }], documents: [{ label: 'Diagnostic amiante' }] } }),
  autres: dossier({ autres: [{ label: 'Diagnostic amiante', date: '2026-10-12' }, { label: 'Tâche faite', date: '2026-10-01' }], echeancesValidees: { 'autre-1': true } }),
  pretFait: dossier({ echeancesValidees: { pret: true }, offrePretStatut: 'recue' })
};

test('tableau : tous les types de dossier sont calculés sans erreur, quatre colonnes, cartes sans doublon', () => {
  Object.entries(VARIANTES).forEach(([nom, d]) => {
    const cartes = app.cartesTableauFiche(d, AUJ, []);
    assert.deepEqual(Object.keys(cartes), ['obtenir', 'faire', 'attente', 'fait'], nom);
    const cles = Object.values(cartes).flat().map(c => c.cle);
    assert.equal(new Set(cles).size, cles.length, `${nom} : carte en double (${cles.join(', ')})`);
    Object.values(cartes).flat().forEach(c => {
      assert.ok(c.titre, `${nom} : carte sans titre (${c.cle})`);
      if (c.coche) assert.match(c.coche.onclick, /^(validerPieceManuellement|basculerEngagementFait|basculerDocumentAnalyseRecu|basculerEcheance|basculerConfirmationFondsFiche|marquerFaitJour)\(/, `${nom} : geste inattendu`);
    });
    const b = app.bandeauFiche(d, AUJ, [], null);
    assert.ok(b.pieces && b.signature && b.maintenant, nom);
  });
});

test('tableau : pièces manquantes à obtenir, reçues groupées dans Fait, total conservé', () => {
  const d = dossier();
  const liste = app.checklistPieces(d.typeVente, d);
  d.pieces[liste[0].cle] = 'recue';
  d.pieces[liste[1].cle] = 'recue';
  const c = app.cartesTableauFiche(d, AUJ, []);
  assert.equal(c.obtenir.concat(c.attente).filter(x => x.cle.startsWith('piece:')).length, liste.length - 2);
  const groupe = c.fait.find(x => x.cle === 'pieces-recues');
  assert.ok(groupe && /2 pièces reçues/.test(groupe.titre) && groupe.sous === `sur ${liste.length}`);
  assert.equal(app.bandeauFiche(d, AUJ, [], null).pieces.recues, 2);
});

test('tableau : participation sans checklist, succession réduite à la signature', () => {
  const p = app.cartesTableauFiche(VARIANTES.participation, AUJ, []);
  assert.equal(p.obtenir.filter(x => x.cle.startsWith('piece:')).length, 0);
  const s = app.cartesTableauFiche(VARIANTES.succession, AUJ, []);
  assert.equal(s.fait.filter(x => x.cle === 'etape:redaction').length, 0);
  assert.equal(s.attente.filter(x => x.cle === 'echeance:pret').length, 0);
});

test('tableau : engagement et document de l’avant-contrat à obtenir, geste d’avant à la case', () => {
  const c = app.cartesTableauFiche(VARIANTES.engagements, AUJ, []);
  const e = c.obtenir.find(x => x.cle === 'engagement:0');
  assert.ok(e && e.coche.onclick === "basculerEngagementFait('d1', 0)");
  assert.ok(c.obtenir.some(x => x.cle === 'document:0' && /basculerDocumentAnalyseRecu\('d1', 0\)/.test(x.coche.onclick)));
});

test('tableau : échéances ouvertes en attente ou à faire, cochées dans Fait, dates passées en retard', () => {
  const c = app.cartesTableauFiche(VARIANTES.maison, AUJ, []);
  const pret = c.attente.find(x => x.cle === 'echeance:pret');
  assert.ok(pret && pret.coche && pret.jours === 41);
  const a = app.cartesTableauFiche(VARIANTES.autres, AUJ, []);
  assert.ok(a.faire.some(x => x.cle === 'echeance:autre-0'));
  const faite = a.fait.find(x => x.cle === 'echeance:autre-1');
  assert.ok(faite && /Rouvrir/.test(faite.coche.libelle));
  const retard = app.cartesTableauFiche(dossier({ pret: '2026-10-01' }), AUJ, []).attente.find(x => x.cle === 'echeance:pret');
  assert.equal(retard.gravite, 'critique');
});

test('tableau : gestes du jour en tête de « À faire », sans doublon avec l’échéance qu’ils couvrent', () => {
  const actions = [{ cle: 'appelFonds:d1', titre: 'Envoyer l’appel de fonds', contexte: 'DUPONT', categorie: 'appelFonds', gravite: 'vigilance', geste: { type: 'email' }, bouton: 'Préparer' }];
  const c = app.cartesTableauFiche(VARIANTES.maison, AUJ, actions);
  assert.equal(c.faire[0].cle, 'action:appelFonds:d1');
  assert.ok(c.faire[0].bouton && /^executerActionJour\(/.test(c.faire[0].bouton.onclick));
  assert.equal(app.bandeauFiche(VARIANTES.maison, AUJ, actions, null).maintenant.type, 'action');
});

test('tableau : dossier archivé = aucun geste ni case', () => {
  const actions = [{ cle: 'x:d1', titre: 'Un geste', contexte: '', geste: { type: 'email' } }];
  const c = app.cartesTableauFiche(VARIANTES.archive, AUJ, actions);
  Object.values(c).flat().forEach(x => { assert.equal(x.coche, null); assert.equal(x.bouton, null); });
  assert.equal(app.bandeauFiche(VARIANTES.archive, AUJ, actions, null).maintenant.type, 'archive');
});

test('bandeau : signature placée, passée, à placer, signée', () => {
  assert.equal(app.bandeauFiche(VARIANTES.maison, AUJ, [], null).signature.etat, 'placee');
  assert.equal(app.bandeauFiche(VARIANTES.maison, AUJ, [], null).signature.jours, 61);
  assert.equal(app.bandeauFiche(VARIANTES.passee, AUJ, [], null).signature.etat, 'passee');
  assert.equal(app.bandeauFiche(VARIANTES.sansDate, AUJ, [], null).signature.etat, 'aplacer');
  assert.equal(app.bandeauFiche(VARIANTES.signature, AUJ, [], null).signature.etat, 'signe');
  assert.equal(app.bandeauFiche(VARIANTES.participation, AUJ, [], null).pieces.libelle, 'Avancement');
});

test('rendu : bandeau, étapes et tableau se dessinent pour chaque type, rien de non échappé', () => {
  Object.entries(VARIANTES).forEach(([nom, d]) => {
    const dangereux = Object.assign({}, d, { nom: '<img src=x onerror=alert(1)>' });
    const html = app.renderTableauFiche(dangereux, []) + app.renderSuiviEtapesFiche(app.etapesAvancement(dangereux, AUJ), null, app.avancementDossier(dangereux, AUJ));
    assert.ok(html.includes('tf-tableau'), nom);
    assert.ok(!/<img src=x/.test(html), nom);
  });
});

test('glisser-déposer : « Fait » valide, la sortie de « Fait » rouvre, le reste ne fait rien', () => {
  assert.equal(app.actionDepotCarteFiche(false, 'fait'), 'valider');
  assert.equal(app.actionDepotCarteFiche(true, 'obtenir'), 'rouvrir');
  assert.equal(app.actionDepotCarteFiche(true, 'attente'), 'rouvrir');
  assert.equal(app.actionDepotCarteFiche(true, 'fait'), '');
  assert.equal(app.actionDepotCarteFiche(false, 'faire'), '');
  const c = app.cartesTableauFiche(VARIANTES.maison, AUJ, []);
  const html = app.renderCarteTableauFiche(c.attente.find(x => x.cle === 'echeance:pret'));
  assert.match(html, /draggable="true"/);
  assert.doesNotMatch(app.renderCarteTableauFiche(c.fait.find(x => x.cle === 'pieces-recues') || { titre: 'x', cle: 'k', auto: true, fait: true }), /draggable/);
});

test('mise à jour d’Authentic en attente : proposée dès l’onglet Tableau, rien sans mise à jour', () => {
  assert.equal(app.renderMajAuthenticTableauFiche(dossier()), '');
  const d = dossier({ authentic: { majEnAttente: { 'emails:ACQUEREUR': { type: 'champ', cle: 'emails:ACQUEREUR', libelle: 'Email acquéreur', avant: 'a@x.fr', apres: 'b@x.fr' } } } });
  const html = app.renderMajAuthenticTableauFiche(d);
  assert.match(html, /accepterMajAuthentic/); assert.match(html, /Mettre à jour/);
});

test('cartes changées : première ouverture sans rien, puis seulement ce qui arrive ou change de colonne', () => {
  const d = dossier();
  const avant = app.cartesTableauFiche(d, AUJ, []);
  const parCle = {};
  ['obtenir', 'faire', 'attente', 'fait'].forEach(col => avant[col].forEach(c => { parCle[c.cle] = col; }));
  assert.equal(app.cartesChangeesFiche(null, avant).size, 0);
  assert.equal(app.cartesChangeesFiche(parCle, avant).size, 0);
  const liste = app.checklistPieces(d.typeVente, d);
  d.pieces[liste[0].cle] = 'recue';
  const apres = app.cartesTableauFiche(d, AUJ, []);
  const changees = app.cartesChangeesFiche(parCle, apres);
  assert.ok(changees.has('pieces-recues'));
});

test('animations : une valeur inchangée ne s’anime pas, une première apparition part de 0', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(app.etapeProgression(undefined, 40))), { de: 0, a: 40, anime: true });
  assert.deepEqual(JSON.parse(JSON.stringify(app.etapeProgression(40, 40))), { de: 40, a: 40, anime: false });
  assert.deepEqual(JSON.parse(JSON.stringify(app.etapeProgression(40, 75))), { de: 40, a: 75, anime: true });
  assert.deepEqual(JSON.parse(JSON.stringify(app.etapeProgression(undefined, 0))), { de: 0, a: 0, anime: false });
});

// Étude 13/10 : « permettre de modifier les dates d'échéances dans les cartes ou de les supprimer ».
test('tableau : les cartes d’échéance portent la date à corriger, jamais un délai calculé ni un dossier archivé', () => {
  const d = dossier({ ventebien: '2026-11-01', autres: [{ label: 'Diagnostic amiante', date: '2026-10-12' }, { label: 'Tâche faite', date: '2026-10-01' }], echeancesValidees: { 'autre-1': true } });
  const cartes = Object.values(app.cartesTableauFiche(d, AUJ, [])).flat();
  const par = (cle) => cartes.find(c => c.cle === cle);
  assert.equal(par('echeance:pret').date.cle, 'pret');
  assert.equal(par('echeance:pret').date.iso, '2026-11-20');
  assert.equal(par('echeance:pret').date.supprimable, true);
  assert.equal(par('echeance:ventebien').date.cle, 'ventebien');
  assert.equal(par('echeance:autre-0').date.cle, 'autre-0');
  assert.equal(par('echeance:autre-1').date.cle, 'autre-1', 'échéance ajoutée déjà faite : encore modifiable');
  cartes.filter(c => c.cle.startsWith('piece:')).forEach(c => assert.equal(c.date, null));
  const archive = Object.values(app.cartesTableauFiche(Object.assign({}, d, { archive: true }), AUJ, [])).flat();
  archive.forEach(c => assert.equal(c.date, null, c.cle));
});

test('tableau : quelle date une carte modifie (pure)', () => {
  const d = dossier({ appelFonds: '', autres: [{ label: 'X', date: '' }] });
  assert.equal(app.dateModifiableCarteFiche(d, 'fixerRdv', null, false).cle, 'acte');
  assert.equal(app.dateModifiableCarteFiche(d, 'fixerRdv', null, true).cle, 'rendezVousSignature');
  const af = app.dateModifiableCarteFiche(d, 'appelFonds', null, false);
  assert.equal(af.envoi, true);
  assert.equal(af.supprimable, false, 'rien à effacer sans date d’envoi');
  assert.equal(app.dateModifiableCarteFiche(d, 'safer', null, false), null);
  assert.equal(app.dateModifiableCarteFiche(d, 'dia', null, false), null);
  assert.equal(app.dateModifiableCarteFiche(d, 'redaction', null, false), null);
  assert.equal(app.dateModifiableCarteFiche(d, 'signature', null, true), null);
  assert.equal(app.dateModifiableCarteFiche(d, 'autre', 0, false).supprimable, true, 'une échéance ajoutée se retire même sans date');
  assert.equal(app.dateModifiableCarteFiche(d, 'autre', 5, false), null);
});

test('tableau : la carte montre le crayon et la croix, puis le champ date en saisie', () => {
  const c = { cle: 'echeance:pret', titre: 'Obtention du prêt', iso: '2026-11-20', jours: 41, sous: '', categorie: 'pret', fait: false, coche: null, bouton: null, onglet: '', date: { cle: 'pret', iso: '2026-11-20', supprimable: true, envoi: false } };
  const html = app.renderCarteTableauFiche(c, false, 'd1');
  assert.match(html, /modifierDateCarteFiche\('d1', 'echeance:pret'\)/);
  assert.match(html, /supprimerDateCarteFiche\('d1', 'pret'\)/);
  app.dateCarteEnEditionFiche = 'd1|echeance:pret';
  const edition = app.renderCarteTableauFiche(c, false, 'd1');
  app.dateCarteEnEditionFiche = '';
  assert.match(edition, /type="date" id="tf-date-saisie" data-carte="echeance:pret" value="2026-11-20"/);
  assert.match(edition, /validerDateCarteFiche\('d1', 'pret'\)/);
  assert.doesNotMatch(edition, /draggable/);
});

test('tableau : pas de croix sur le prêt dont l’offre est reçue, Échap n’atteint pas la fiche', () => {
  assert.equal(app.dateModifiableCarteFiche(dossier({ offrePretStatut: 'recue' }), 'pret', null, true).supprimable, false);
  const c = { cle: 'echeance:pret', titre: 'Prêt', iso: '2026-11-20', jours: 1, date: { cle: 'pret', iso: '2026-11-20', supprimable: true, envoi: false } };
  app.dateCarteEnEditionFiche = 'd1|echeance:pret';
  const html = app.renderCarteTableauFiche(c, false, 'd1');
  app.dateCarteEnEditionFiche = '';
  assert.match(html, /stopPropagation\(\); annulerDateCarteFiche/);
});

test('tableau : confirmation des fonds cochable à la main, en participation aussi, jamais en succession', () => {
  const cle = (c) => Object.values(c).flat().map(x => x.cle);
  const part = app.cartesTableauFiche(dossier({ roleNotaire: 'participant' }), AUJ, []);
  assert.ok(cle(part).includes('fonds-confirmer'));
  const faite = app.cartesTableauFiche(dossier({ roleNotaire: 'participant', receptionFondsConfirmeeLe: '2026-10-14' }), AUJ, []);
  assert.ok(faite.fait.some(x => x.cle === 'fonds-confirmes'));
  const succ = app.cartesTableauFiche(dossier({ typeAffaire: 'succession' }), AUJ, []);
  assert.ok(!cle(succ).some(k => k.startsWith('fonds-conf')));
});
