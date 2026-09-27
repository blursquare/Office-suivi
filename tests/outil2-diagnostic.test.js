const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

// Journal de diagnostic de la relecture : ce que les contrôles CLAIRE ont examiné, retenu ou
// écarté, et pourquoi. Textes synthétiques reprenant la structure des actes réels du stress test.

const app = chargerApplication();
const AUJOURDHUI = '2026-09-27';

function deuxPages(p1, p2) {
  const texte = p1 + '\n' + p2;
  return { texte, pages: [{ numero: 1, debut: 0, fin: p1.length + 1 }, { numero: 2, debut: p1.length + 1, fin: texte.length }] };
}

test('analyserCompromisOutil2 joint le journal, avec la raison et la page de chaque clause écartée', () => {
  const { texte, pages } = deuxPages(
    'COMPROMIS DE VENTE. Le VENDEUR déclare que la toiture a été refaite en 2021 par l’entreprise TOITS DU CENTRE.',
    'Le VENDEUR déclare qu’aucun travaux n’a été réalisé sur la façade depuis son acquisition.'
  );
  const r = app.analyserCompromisOutil2({ texte, pages, nomTexte: 'projet.pdf', aujourdHui: AUJOURDHUI, documentsDeposes: [] });
  const travaux = r.diagnostic.filter(e => e.theme === 'travaux');
  const retenue = travaux.find(e => e.verdict === 'retenue');
  assert.ok(retenue, 'la toiture refaite est retenue');
  assert.strictEqual(retenue.page, 1);
  assert.strictEqual(retenue.document, 'projet.pdf');
  const ecartee = travaux.find(e => e.verdict === 'ecartee' && /non-travaux/.test(e.raison));
  assert.ok(ecartee, 'la clause de non-travaux est notée comme écartée');
  assert.strictEqual(ecartee.page, 2);
});

test('hors analyse, les détecteurs ne notent rien', () => {
  const t = app.detecterTravauxRealises('La toiture a été refaite en 2021.', null, AUJOURDHUI);
  assert.strictEqual(t.length, 1);
  assert.strictEqual(app.journalDiagnosticOutil2, null);
});

test('le journal est refermé même si l’analyse échoue', () => {
  assert.throws(() => app.avecJournalDiagnosticOutil2(() => { throw new Error('boum'); }, {}));
  assert.strictEqual(app.journalDiagnosticOutil2, null);
});

test('syntheseDiagnosticOutil2 regroupe par thème puis par raison, la raison la plus fréquente en tête', () => {
  const s = app.syntheseDiagnosticOutil2([
    { theme: 'diagnostics', verdict: 'ecartee', raison: 'Ligne du tableau légal', phrase: 'a', precision: 'DPE' },
    { theme: 'travaux', verdict: 'ecartee', raison: 'Simple mention', phrase: 'b' },
    { theme: 'travaux', verdict: 'ecartee', raison: 'Clause de non-travaux', phrase: 'c' },
    { theme: 'travaux', verdict: 'ecartee', raison: 'Simple mention', phrase: 'd' },
    { theme: 'travaux', verdict: 'retenue', raison: 'Retenue', phrase: 'e' },
    { theme: 'inconnu', verdict: 'retenue', raison: 'x', phrase: 'f' }
  ]);
  assert.strictEqual(s.map(t => t.cle).join(','), 'travaux,diagnostics');
  assert.strictEqual(s[0].retenues.length, 1);
  assert.strictEqual(s[0].nbEcartees, 3);
  assert.strictEqual(s[0].ecartees[0].raison, 'Simple mention');
  assert.strictEqual(s[0].ecartees[0].entrees.length, 2);
});

test('une obligation écartée en mode projet de vente est rattachée à l’avant-contrat', () => {
  const r = app.analyserProjetVenteOutil2({
    texteAvantContrat: 'Le VENDEUR s’engage à laisser visiter le bien en cas de demande de visite de l’acquéreur avant la vente.',
    pagesAvantContrat: [], nomAvantContrat: 'compromis-signe.pdf',
    texteProjet: 'ACTE DE VENTE.', pagesProjet: [], nomProjet: 'projet.pdf',
    aujourdHui: AUJOURDHUI, documentsDeposes: []
  });
  const eng = r.diagnostic.filter(e => e.theme === 'engagements');
  assert.ok(eng.length >= 1);
  assert.ok(eng.every(e => e.document === 'compromis-signe.pdf'));
  assert.ok(eng.some(e => e.verdict === 'ecartee' && /Clause de style/.test(e.raison)));
});

test('les assemblées générales d’un PV déposé portent le nom de ce document', () => {
  const r = app.analyserCompromisOutil2({
    texte: 'Le bien dépend d’un immeuble soumis au régime de la copropriété, lot numéro 12.', pages: [],
    nomTexte: 'projet.pdf', aujourdHui: AUJOURDHUI,
    documentsDeposes: [{ nom: 'PV AG 2025.pdf', texte: 'Procès-verbal de l’assemblée générale du 14 mai 2025. Les travaux de ravalement ont été votés.', pages: [] }]
  });
  const ag = r.diagnostic.find(e => e.theme === 'ag' && e.verdict === 'retenue');
  assert.ok(ag);
  assert.strictEqual(ag.document, 'PV AG 2025.pdf');
  assert.match(ag.raison, /travaux votés/);
});
