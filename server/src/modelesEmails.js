'use strict';
// Modèles d'emails (étude, 03/10 : « un créateur de modèles d'emails dans les réglages, qu'on retrouve dans
// l'interface email ; que je puisse éditer les modèles, mets déjà ceux existants » ; choix : les boutons de la fiche
// suivent un modèle modifié). Les textes d'origine vivent dans le poste (script.js, MODELES_EMAIL_INTEGRES) ; ici :
//   - `modifies` : la version de l'étude d'un modèle d'origine (clé du modèle → objet + texte) — la retirer rend le
//     texte d'origine ;
//   - `perso` : les modèles créés par l'étude.
// Partagé par tous les postes, une écriture par modèle (deux postes ne s'écrasent pas l'un l'autre).

const crypto = require('node:crypto');

const CLE_MODELES_EMAILS = 'modeles-emails';
const MAX_PERSO = 200;
const RE_CLE_INTEGRE = /^[a-zA-Z]{2,40}$/;

const texte = (v, max) => String(v == null ? '' : v).replace(/\r\n/g, '\n').slice(0, max);
const dateIso = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

function assainirContenu(m) {
  const o = m && typeof m === 'object' ? m : {};
  return { sujet: texte(o.sujet, 300).replace(/\n+/g, ' ').trim(), corps: texte(o.corps, 12000).trim() };
}

function assainirModelesEmails(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const modifies = {};
  for (const [cle, v] of Object.entries(b.modifies && typeof b.modifies === 'object' ? b.modifies : {}).slice(0, 60)) {
    if (!RE_CLE_INTEGRE.test(cle) || !v || typeof v !== 'object') continue;
    const c = assainirContenu(v);
    if (!c.corps) continue;
    modifies[cle] = { ...c, modifieLe: dateIso(v.modifieLe) || new Date().toISOString(), par: texte(v.par, 80) };
  }
  const perso = (Array.isArray(b.perso) ? b.perso : []).map((m) => {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id) return null;
    const c = assainirContenu(m);
    const nom = texte(m.nom, 120).replace(/\n+/g, ' ').trim();
    if (!nom || !c.corps) return null;
    return { id: texte(m.id, 64), nom, ...c, creeLe: dateIso(m.creeLe) || new Date().toISOString(), modifieLe: dateIso(m.modifieLe), par: texte(m.par, 80) };
  }).filter(Boolean).slice(0, MAX_PERSO);
  return { modifies, perso };
}

function lireModelesEmails(parametresRepo) { return assainirModelesEmails(parametresRepo.lireJsonBrut(CLE_MODELES_EMAILS, {})); }
function ecrireModelesEmails(parametresRepo, e) { return parametresRepo.ecrireJsonBrut(CLE_MODELES_EMAILS, assainirModelesEmails(e)); }

function nouvelIdModele() { return crypto.randomUUID(); }

module.exports = { CLE_MODELES_EMAILS, MAX_PERSO, RE_CLE_INTEGRE, assainirModelesEmails, lireModelesEmails, ecrireModelesEmails, nouvelIdModele };
