// Une pièce trouvée sur le NAS se décoche d'un clic sur sa case (étude 05/10 : « les pièces trouvées ne sont plus
// cochables et décochables ») : la case est un bouton qui réinitialise la pièce, jamais un span désactivé.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chargerApplication } = require('./helpers/load-app');

test('case d’une pièce trouvée sur le NAS : bouton de réinitialisation', () => {
  const app = chargerApplication();
  vm.runInContext(`dossiers.push({ id: 'd1', nom: 'MOREAU / LAMBERT', typeVente: 'maison', parties: [],
    pieces: { certificatUrbanisme: 'recue', reponseAssainissement: 'manquante' }, piecesValideesManuellement: [] });`, app);
  const html = vm.runInContext(`renderPiecesDossier(dossiers[0])`, app);
  assert.ok(!/aria-disabled/.test(html), 'aucune case désactivée');
  assert.match(html, /reinitialiserStatutPieceStandard\('d1', 'certificatUrbanisme'/);
  assert.match(html, /validerPieceManuellement\('d1', 'reponseAssainissement'/);
});
