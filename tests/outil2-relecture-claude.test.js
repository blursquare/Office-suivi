'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

// Relecture par l'API Claude (Outil 2 v3) : grille, pseudonymisation locale, nature des pièces,
// tableau de bord. Textes inventés, reprenant la structure d'actes réels.

const app = chargerApplication();

function page(texte) {
  // Frontières de page à partir de repères « §§ » (un par page), retirés du texte.
  const morceaux = texte.split('§§');
  const pages = [];
  let t = '';
  morceaux.forEach((m, i) => { pages.push({ numero: i + 1, debut: t.length, fin: t.length + m.length }); t += m; });
  return { texte: t, pages };
}

test('grille : un point par mode, identifiants uniques, sections nommées', () => {
  const ids = app.GRILLE_RELECTURE_OUTIL2.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  const compromis = app.grillePourModeOutil2('compromis');
  const acte = app.grillePourModeOutil2('acte');
  const idsC = compromis.map(p => p.id).join(',');
  const idsA = acte.map(p => p.id).join(',');
  // Les points du prototype sont là, dans les deux modes quand ils ont un sens aux deux stades.
  for (const id of ['dpe', 'amiante', 'erp', 'alur_pv_ag', 'servitudes', 'prix_modalites']) {
    assert.ok(idsC.includes(id) && idsA.includes(id), id);
  }
  // Propres à l'avant-contrat ou au projet de vente.
  assert.ok(idsC.includes('retractation') && !idsA.includes('retractation'));
  assert.ok(idsA.includes('engagements_vendeur') && !idsC.includes('engagements_vendeur'));
  assert.ok(idsA.includes('situation_hypothecaire') && idsA.includes('plus_value'));
  // Deux copropriétés dans un même acte : point explicite.
  assert.ok(idsC.includes('copro_multiples'));
  // Le serveur reçoit le titre de section, pas la clé.
  assert.equal(compromis.find(p => p.id === 'dpe').section, 'Diagnostics techniques (DDT)');
});

test('pseudonymisation : noms connus sans civilité, même jeton partout, pages conservées', () => {
  const a = page("Monsieur Jean DUPONT, né le 12 mars 1970 à BLOIS, demeurant 5 rue des Lilas 41000 BLOIS.§§Les époux DUPONT vendent pour DEUX CENT MILLE EUROS (200 000 €) soit 20000 EUROS d'acompte.");
  const b = page("Promesse. DUPONT s'oblige. Section AB numéro 45.");
  const termes = app.termesConnusAnonymisation([{ nom: 'DUPONT' }, { nom: 'VENDEUR' }, { nom: 'LE' }], [{ nom: 'Maître GOSSART' }]);
  assert.equal(termes.map(t => t.terme).join(','), 'DUPONT,GOSSART');
  const r = app.anonymiserDocumentsOutil2([a, b], { termes });
  const [d1, d2] = r.documents;
  assert.doesNotMatch(d1.texte + d2.texte, /DUPONT|BLOIS|Lilas|AB numéro/);
  const jeton = r.table.find(e => e.valeur === 'DUPONT').jeton;
  assert.match(d2.texte, new RegExp(jeton.replace(/[⟦⟧]/g, '.')));
  // Un montant n'est jamais pris pour « code postal + commune ».
  assert.match(d1.texte, /20000 EUROS/);
  assert.match(d1.texte, /200 000 €/);
  // Deux pages restent deux pages, et chacune couvre bien son texte pseudonymisé.
  assert.equal(d1.pages.length, 2);
  assert.match(d1.texte.slice(d1.pages[1].debut, d1.pages[1].fin), /^Les époux ⟦PERSONNE_1⟧ vendent/);
  assert.equal(d1.pages[1].fin, d1.texte.length);
});

test('pseudonymisation : valeur laissée en clair, terme ajouté à la main, ré-identification', () => {
  const a = page("Le bien sis 3 avenue Foch, commune de 45000 ORLEANS, appartient à la SCI LES TILLEULS. Lieu-dit La Gâtine. Monsieur Paul RENARD, demeurant 12, rue Victor Hugo 41000 Blois.");
  const r = app.anonymiserDocumentsOutil2([a], { termes: [{ terme: 'La Gâtine', categorie: 'PERSONNE' }], exclus: ['45000 ORLEANS'] });
  const t = r.documents[0].texte;
  assert.match(t, /45000 ORLEANS/);
  assert.doesNotMatch(t, /Gâtine|TILLEULS|Foch|Hugo|Blois|RENARD/);
  // Une société s'arrête à la fin de sa phrase, une commune écrite en minuscules est couverte.
  assert.equal(r.table.find(e => e.categorie === 'PERSONNE_MORALE').valeur, 'SCI LES TILLEULS');
  assert.ok(r.table.some(e => e.valeur === '12, rue Victor Hugo 41000 Blois'));
  const brut = { points: [{ commentaire: `Bien vendu par ${r.table.find(e => e.categorie === 'PERSONNE_MORALE').jeton}.` }] };
  const clair = app.desanonymiserOutil2(brut, r.table);
  assert.equal(clair.points[0].commentaire, 'Bien vendu par SCI LES TILLEULS.');
  // Une espace doublée par l'extraction du PDF ne crée pas un second jeton pour la même personne.
  const e = app.anonymiserDocumentsOutil2([page("Madame Anne  ROUX signe. Madame Anne ROUX paie.")], {});
  assert.equal(e.table.length, 1);
  assert.equal(e.table[0].occurrences, 2);
  // Un jeton inconnu reste tel quel plutôt que de disparaître.
  assert.equal(app.desanonymiserOutil2('⟦PERSONNE_99⟧', r.table), '⟦PERSONNE_99⟧');
});

test('consigne de l’étude : un nom déjà masqué reprend son jeton, le reste repéré est masqué', () => {
  const r = app.anonymiserDocumentsOutil2([page("Monsieur Paul RENARD vend.")], {});
  const jeton = r.table[0].jeton;
  const c = app.pseudonymiserTexteLibreOutil2('Ne pas signaler la clause de monsieur paul renard, ni Madame Lucie BLANC.', r.table);
  assert.ok(c.includes(jeton));
  assert.doesNotMatch(c, /RENARD|renard|BLANC/);
  assert.match(c, /\[donnée masquée\]/);
});

test('nature des pièces : nom du fichier d’abord, puis le haut de la première page', () => {
  assert.equal(app.classerNaturePieceOutil2('DPE_2024.pdf', ''), 'diagnostics');
  assert.equal(app.classerNaturePieceOutil2('Copie AAE PROMESSE DE VENTE.pdf', ''), 'avant_contrat');
  assert.equal(app.classerNaturePieceOutil2('PV AG 2025.pdf', ''), 'copropriete');
  assert.equal(app.classerNaturePieceOutil2('scan0001.pdf', 'ÉTAT DATÉ\nLot 12'), 'copropriete');
  assert.equal(app.classerNaturePieceOutil2('scan0002.pdf', 'Bonjour'), 'autre');
  assert.equal(app.libelleNaturePieceOutil2('urbanisme'), 'Urbanisme');
});

test('annexes jointes au PDF principal : première page qui en ouvre une, jamais la page 1', () => {
  const doc = page("ANNEXES§§Le VENDEUR déclare aux présentes…§§ANNEXES§§Diagnostic");
  assert.equal(app.debutAnnexesDocumentOutil2(doc.texte, doc.pages), 3);
  const sans = page("Le VENDEUR vend.§§Le prix est payé aux présentes.");
  assert.equal(app.debutAnnexesDocumentOutil2(sans.texte, sans.pages), null);
});

test('plusieurs copropriétés : deux syndicats distincts, un syndicat cité deux fois', () => {
  const deux = "Lot 3 : syndicat des copropriétaires de l'immeuble Les Tilleuls, … Lot 51 : syndicat des copropriétaires de la résidence Le Parc, …";
  assert.equal(app.detecterCoproprietesMultiplesOutil2(deux).multiples, true);
  const un = "syndicat des copropriétaires de l'immeuble Les Tilleuls, … le syndicat des copropriétaires de l'immeuble Les Tilleuls, représenté";
  assert.equal(app.detecterCoproprietesMultiplesOutil2(un).multiples, false);
});

test('tableau de bord : niveaux, pire niveau de section, point omis = à surveiller', () => {
  const analyse = { points: [
    { id: 'dpe', statut: 'present', commentaire: 'DPE annexé', citations: [] },
    { id: 'amiante', statut: 'absent', commentaire: 'Construction de 1960, pas de repérage', citations: [] },
    { id: 'plomb', statut: 'non_applicable', commentaire: '', citations: [] }
  ] };
  const sections = app.sectionsTableauDeBordOutil2(analyse, 'compromis');
  const diag = sections.find(s => s.cle === 'diagnostics');
  assert.equal(diag.niveau, 'critique');
  const niveau = id => diag.lignes.find(l => l.id === id).niveau;
  assert.equal(niveau('dpe'), 'valide');
  assert.equal(niveau('amiante'), 'critique');
  assert.equal(niveau('plomb'), 'na');
  assert.equal(niveau('erp'), 'surveiller'); // non traité par l'analyse : jamais « validé » par défaut
  // Le projet de vente a sa section « concordance », pas l'avant-contrat.
  assert.ok(!sections.some(s => s.cle === 'avant_contrat'));
  assert.ok(app.sectionsTableauDeBordOutil2(analyse, 'acte').some(s => s.cle === 'avant_contrat'));
});

test('santé : critique dès un point critique, contrôles CLAIRE comptés, format du coût', () => {
  const s = app.santeRelectureOutil2([{ lignes: [{ niveau: 'valide' }, { niveau: 'na' }] }], []);
  assert.equal(s.niveau, 'valide');
  assert.equal(app.santeRelectureOutil2([{ lignes: [{ niveau: 'valide' }] }], ['surveiller']).niveau, 'surveiller');
  const c = app.santeRelectureOutil2([{ lignes: [{ niveau: 'surveiller' }] }], ['critique']);
  assert.equal(c.niveau, 'critique');
  assert.equal(c.compte.critique, 1);
  assert.equal(app.niveauAnomalieOutil2('elevee'), 'critique');
  assert.equal(app.niveauAnomalieOutil2('faible'), 'surveiller');
  assert.equal(app.formaterCoutUsd(0.09).replace(/\s/g, ' '), '0,090 $');
  assert.equal(app.formaterCoutUsd(1.5).replace(/\s/g, ' '), '1,50 $');
  assert.equal(app.formaterDureeMs(72000), '1 min 12 s');
});
