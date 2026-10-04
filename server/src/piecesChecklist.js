// @ts-check
'use strict';

// La checklist d'un dossier vient du code commun au poste et au serveur (commun/pieces.js, 04/10) : plus de copie à tenir
// alignée. Le serveur ne passe pas les documents de l'analyse (`clesEnPlus`, connus du poste seulement) : un dossier créé
// avant `cleChecklist` peut lui montrer une pièce d'engagement de moins — sans conséquence pour un email de rappel.
const { checklistPiecesBase } = require('../../commun/pieces');
function checklistPieces(typeVente, d) {
  return checklistPiecesBase(typeVente, d);
}

// Pour le message de rappel : les statuts "manquante" et "pas encore vérifié" (absence de clé dans
// d.pieces, voir CLAUDE.md) sont réunis sous "manquantes" — du point de vue du responsable relancé,
// une pièce jamais vérifiée est aussi une pièce à réclamer/confirmer, pas une anomalie distincte.
// Un dossier "participant" (voir renderPiecesDossier côté client) n'affiche pas cette checklist du
// tout : le message ne la mentionne pas non plus pour ce rôle.
function piecesRecuesEtManquantes(d) {
  if (!d || d.roleNotaire === 'participant') return { recues: [], manquantes: [] };
  const liste = checklistPieces(d.typeVente || 'maison', d);
  const statuts = d.pieces || {};
  const recues = [];
  const manquantes = [];
  for (const p of liste) {
    if (statuts[p.cle] === 'recue') recues.push(p.label);
    else manquantes.push(p.label);
  }
  return { recues, manquantes };
}

module.exports = { checklistPieces, piecesRecuesEtManquantes };
