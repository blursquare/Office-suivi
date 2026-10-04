'use strict';

// Fusion à trois voies d'un dossier (audit du 04/10) : un poste envoie toujours le dossier ENTIER (PUT), construit
// à partir de la version qu'il a vue en dernier (`base`). Si le serveur a changé depuis (autre poste, lecture de
// l'agenda, emails des dossiers, SAFER…), un remplacement aveugle effacerait ces changements. Ici : pour chaque
// champ, ce que le poste n'a pas touché garde la valeur du serveur ; ce que le poste a changé l'emporte ; quand les
// deux ont changé le même champ, une liste est fusionnée (ajouts des deux côtés gardés, retraits respectés), un objet
// est fusionné un niveau plus bas, toute autre valeur revient au poste (il a la main). Pure et testable.

const PROFONDEUR_MAX = 3;

function egal(a, b) {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function estObjetSimple(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Listes : les deux côtés ont modifié. Résultat = la liste du serveur, moins ce que le poste a retiré par rapport à la
// base, plus ce que le poste a ajouté (en fin). Un élément est reconnu à son JSON (les entrées d'historique, pièces
// personnalisées, parties… n'ont pas toujours d'identifiant).
function fusionnerListes(base, serveur, client) {
  const cle = (x) => JSON.stringify(x);
  const dansBase = new Set((base || []).map(cle));
  const dansClient = new Set((client || []).map(cle));
  const dansServeur = new Set((serveur || []).map(cle));
  const retiresParClient = new Set([...dansBase].filter((k) => !dansClient.has(k)));
  const resultat = (serveur || []).filter((x) => !retiresParClient.has(cle(x)));
  const presents = new Set(resultat.map(cle));
  for (const x of client || []) {
    const k = cle(x);
    if (!dansBase.has(k) && !dansServeur.has(k) && !presents.has(k)) { resultat.push(x); presents.add(k); }
  }
  return resultat;
}

function fusionnerObjets(base, serveur, client, profondeur) {
  const b = estObjetSimple(base) ? base : {};
  const s = estObjetSimple(serveur) ? serveur : {};
  const c = estObjetSimple(client) ? client : {};
  const cles = new Set([...Object.keys(b), ...Object.keys(s), ...Object.keys(c)]);
  const resultat = {};
  let fusionne = false;
  for (const k of cles) {
    const vb = b[k], vs = s[k], vc = c[k];
    let v;
    if (egal(vs, vc)) v = vc;
    else if (egal(vc, vb)) { v = vs; fusionne = true; }        // le poste n'a pas touché : le serveur l'emporte
    else if (egal(vs, vb)) v = vc;                              // le serveur n'a pas touché : le poste l'emporte
    else if (Array.isArray(vs) && Array.isArray(vc)) { v = fusionnerListes(Array.isArray(vb) ? vb : [], vs, vc); fusionne = true; }
    else if (estObjetSimple(vs) && estObjetSimple(vc) && profondeur < PROFONDEUR_MAX) {
      const r = fusionnerObjets(vb, vs, vc, profondeur + 1);
      v = r.dossier; fusionne = fusionne || r.fusionne;
    } else v = vc;                                              // même champ changé des deux côtés : le poste a la main
    if (v !== undefined) resultat[k] = v;
  }
  return { dossier: resultat, fusionne };
}

// → { dossier, fusionne } ; `fusionne` = au moins un champ du serveur a été conservé contre la copie du poste.
function fusionnerTroisVoies(base, serveur, client) {
  return fusionnerObjets(base, serveur, client, 0);
}

module.exports = { fusionnerTroisVoies, fusionnerListes };
