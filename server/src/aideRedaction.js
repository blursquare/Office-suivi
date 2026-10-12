// @ts-check
'use strict';
// Aide à la rédaction de l'acte (étude 12/10 : « parfois la trame change un peu, mets un agent IA pour suivre cela »).
// Le poste reconnaît la clause par le catalogue de commun/redaction.js ; pour un blanc « --- » qu'il ne sait pas désigner, l'IA
// choisit le CHAMP de chaque blanc dans la liste fermée CHAMPS_ACTE. Ne partent que le passage (noms masqués par le serveur,
// comme pour « Demander à CLAIRE ») et la liste des champs ; jamais une valeur du dossier, que le poste calcule seul.

const R = require('../../commun/redaction');

const MAX_PASSAGE = 4000;
const MAX_BLANCS = 20;

/** Le passage où chaque blanc devient « [BLANC n] ». Pure. @param {string} passage */
function passageNumerote(passage) {
  const t = String(passage || '').slice(0, MAX_PASSAGE);
  const trous = R.trousDuPassage(t).slice(0, MAX_BLANCS);
  let sortie = '';
  let curseur = 0;
  trous.forEach((tr, i) => {
    const fin = tr.index + (/^-+/.exec(t.slice(tr.index)) || [''])[0].length;
    sortie += t.slice(curseur, tr.index) + `[blanc ${i + 1}]`;
    curseur = fin;
  });
  return { texte: sortie + t.slice(curseur), nombre: trous.length };
}

/** Le prompt (passage déjà masqué). Pure. @param {string} passageMasque @param {number} nombre */
function promptCorrespondanceActe(passageMasque, nombre) {
  const champs = R.CHAMPS_ACTE.map((c) => `- ${c.cle} : ${c.libelle}`).join('\n');
  return `Tu aides un collaborateur d'une étude notariale à remplir la trame d'un acte de vente. Le passage ci-dessous contient ${nombre} blanc(s) notés [blanc 1], [blanc 2]… Pour chacun, choisis dans la liste le champ qui doit y être écrit, d'après les mots autour. Si aucun champ de la liste ne convient, mets "". N'invente jamais de valeur : seulement des clés de la liste. Les codes [NOM1]… remplacent des noms : ignore-les.
Champs possibles :
${champs}
Passage :
« ${passageMasque} »
Réponds en JSON seul : {"blancs": ["<clé ou vide>", …]} avec exactement ${nombre} élément(s), dans l'ordre des blancs.`;
}

/** Schéma de sortie (Claude). Pure. @param {number} nombre */
function schemaCorrespondanceActe(nombre) {
  return { type: 'object', additionalProperties: false, required: ['blancs'],
    // Sans minItems/maxItems : les sorties structurées n'acceptent pas toute borne ; la longueur est contrôlée par le validateur.
    properties: { blancs: { type: 'array', items: { type: 'string', enum: ['', ...R.CHAMPS_ACTE.map((c) => c.cle)] } } } };
}

/** Contrôle de la réponse : des clés de la liste, autant que de blancs. Pure. @param {number} nombre */
function validateurCorrespondanceActe(nombre) {
  const cles = new Set(['', ...R.CHAMPS_ACTE.map((c) => c.cle)]);
  return (/** @type {any} */ o) => {
    if (!o || !Array.isArray(o.blancs)) return '"blancs" doit être une liste';
    if (o.blancs.length !== nombre) return `${nombre} blanc(s) attendus`;
    if (o.blancs.some((/** @type {any} */ b) => typeof b !== 'string' || !cles.has(b))) return 'clé hors de la liste';
    return null;
  };
}

module.exports = { passageNumerote, promptCorrespondanceActe, schemaCorrespondanceActe, validateurCorrespondanceActe, MAX_PASSAGE };
