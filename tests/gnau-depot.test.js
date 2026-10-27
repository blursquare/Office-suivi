// DIA / CU déposés sur le guichet unique (étude 27/10 : « l'add-on, quand la DIA est validée, récupère le numéro sur la page d'accueil de la
// DIA ou du CU ») : numéro lu sur la page par l'extension Chrome, DIA comptée envoyée dans le planning. Numéros inventés.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../commun/planning');

const src = fs.readFileSync(path.join(__dirname, '..', 'extension-chrome', 'content', 'content.js'), 'utf8');
const numeroDepotDansTexte = new Function(src.slice(src.indexOf('const RE_PAGE_DEPOT'), src.indexOf('async function surveillerNumeroDepot')) + '; return numeroDepotDansTexte;')();

test('extension : le numéro national du dépôt lu sur la page, selon la procédure', () => {
  assert.equal(numeroDepotDansTexte('Votre déclaration n° DIA 041 018 26 00012 a bien été enregistrée', 'dia'), 'DIA 041 018 26 00012');
  assert.equal(numeroDepotDansTexte('Mes dossiers : DIA 041 018 25 00099 Déposé · DIA 041 018 26 00012 a bien été enregistrée', 'dia'), '', 'plusieurs numéros : rien');
  assert.equal(numeroDepotDansTexte('Brouillon DIA 041 018 26 00012', 'dia'), '', 'page qui ne dit pas le dépôt : rien');
  assert.equal(numeroDepotDansTexte('Dossier IA04101826A0012 — dépôt effectué', 'dia'), 'IA 041 018 26 A0012');
  assert.equal(numeroDepotDansTexte('Votre demande CUa 041 032 26 00007 a été transmise', 'cua'), 'CUA 041 032 26 00007');
  assert.equal(numeroDepotDansTexte('Votre demande CU 041 032 26 00007 a été transmise', 'dia'), '', 'un CU n’est pas une DIA');
  assert.equal(numeroDepotDansTexte('Parcelle AB 0123, téléphone 02 54 00 00 00', 'dia'), '');
});

test('planning : DIA déposée sur le guichet = envoyée (réponse à 2 mois), le premier envoi compte', () => {
  const d = { gnau: { dia: { numero: 'DIA 041 018 26 00012', deposeLe: '2026-10-27' } }, pieces: {} };
  assert.deepEqual(P.diaEnvoyeeDossier(d), { date: '2026-10-27', numero: 'DIA 041 018 26 00012', source: 'guichet' });
  assert.equal(P.echeanceDiaDossier(d), '2026-12-27');
  const deux = Object.assign({}, d, { authentic: { demandes: { renonciationPreemption: { date: '2026-10-20' } } } });
  assert.equal(P.diaEnvoyeeDossier(deux).source, 'authentic');
  assert.equal(P.diaEnvoyeeDossier({}), null);
});
