// @ts-check
'use strict';
// Assemble la base « où déposer la DIA » (server/src/data/depot-dia.json) à partir de :
// - scripts/depot-dia/communes-epci.json : communes et intercommunalités des départements couverts (découpage administratif) ;
// - scripts/depot-dia/<département>.recherche.json : ce que les recherches ont lu sur les pages officielles (un objet par EPCI,
//   plus les communes qui dérogent) — chaque entrée garde la page lue (`source`) et sa date.
// Une entrée sans page source n'est retenue que « à vérifier » : rien n'est jamais déduit. À relancer après une nouvelle recherche :
//   node scripts/assembler-depot-dia.js
const fs = require('node:fs');
const path = require('node:path');
const { assainirDepot } = require('../src/depotDia');

const DOSSIER = path.join(__dirname, 'depot-dia');
const SORTIE = path.join(__dirname, '..', 'src', 'data', 'depot-dia.json');

/** Pure : l'entrée assainie, ramenée à « inconnu » si elle affirme un mode sans page lue. @param {any} brut */
function entreeRetenue(brut) {
  const e = assainirDepot(brut);
  if (e.mode !== 'inconnu' && !e.source) return Object.assign(e, { mode: 'inconnu', note: `Mode annoncé sans page source : à vérifier. ${e.note}`.trim().slice(0, 240) });
  if (e.mode === 'guichet' && !e.url) return Object.assign(e, { mode: 'inconnu', note: `Guichet annoncé sans adresse valide : à vérifier. ${e.note}`.trim().slice(0, 240) });
  return e;
}

/** @param {any} communesEpci @param {any[]} recherches @param {any} [ajustements] { partiel: { codeEpci: note }, horsGuichet: { insee: note } } */
function assembler(communesEpci, recherches, ajustements = {}) {
  /** @type {any} */
  const base = { miseAJour: new Date().toISOString().slice(0, 10), source: communesEpci.source, epci: {}, communes: {} };
  for (const [code, e] of Object.entries(communesEpci.epci)) base.epci[code] = Object.assign({ nom: /** @type {any} */ (e).nom, type: /** @type {any} */ (e).type }, entreeRetenue({}));
  for (const [code, c] of Object.entries(communesEpci.communes)) base.communes[code] = { nom: /** @type {any} */ (c).nom, epci: /** @type {any} */ (c).epci };
  for (const r of recherches) {
    if (!r || typeof r !== 'object') continue;
    const code = String(r.code || '');
    if (r.portee === 'epci' && base.epci[code]) {
      const nouvelle = entreeRetenue(r);
      // Une intercommunalité citée dans deux départements : jamais une réponse « à vérifier » par-dessus un guichet lu.
      if (base.epci[code].mode !== 'inconnu' && nouvelle.mode === 'inconnu') continue;
      base.epci[code] = Object.assign({ nom: base.epci[code].nom, type: base.epci[code].type }, nouvelle);
    }
  }
  // Guichet lu pour une partie seulement des communes : les autres ne l'héritent pas comme une certitude.
  for (const [code, note] of Object.entries(ajustements.partiel || {})) if (base.epci[code]) Object.assign(base.epci[code], { partiel: true, notePartiel: String(note).slice(0, 240) });
  // Les communes qui dérogent à leur intercommunalité (ou qui n'ont pas la même procédure).
  for (const r of recherches) {
    if (!r || typeof r !== 'object' || r.portee !== 'commune') continue;
    const code = String(r.code || '').toUpperCase();
    const c = base.communes[code];
    if (!c) continue;
    const e = entreeRetenue(r);
    const epci = c.epci && base.epci[c.epci];
    const pareil = epci && !epci.partiel && ['mode', 'url', 'courriel', 'plateforme'].every((k) => e[k] === epci[k]);
    if (!pareil && (e.mode !== 'inconnu' || e.note)) c.depot = e;
  }
  // Communes dites hors du guichet de leur intercommunalité par la page lue.
  for (const [code, note] of Object.entries(ajustements.horsGuichet || {})) {
    const c = base.communes[code];
    if (!c || c.depot) continue;
    const epci = base.epci[c.epci] || {};
    c.depot = assainirDepot({ mode: 'inconnu', note, source: epci.source, verifieLe: epci.verifieLe });
  }
  return base;
}

if (require.main === module) {
  const communesEpci = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'communes-epci.json'), 'utf8'));
  const recherches = fs.readdirSync(DOSSIER).filter((n) => /\.recherche\.json$/.test(n)).flatMap((n) => {
    try { const a = JSON.parse(fs.readFileSync(path.join(DOSSIER, n), 'utf8')); return Array.isArray(a) ? a : []; } catch (e) { console.error(`${n} illisible : ${e.message}`); return []; }
  });
  const ajustements = fs.existsSync(path.join(DOSSIER, 'ajustements.json')) ? JSON.parse(fs.readFileSync(path.join(DOSSIER, 'ajustements.json'), 'utf8')) : {};
  const base = assembler(communesEpci, recherches, ajustements);
  fs.writeFileSync(SORTIE, JSON.stringify(base));
  const n = (m) => Object.values(base.epci).filter((e) => /** @type {any} */ (e).mode === m).length;
  console.log(`${Object.keys(base.communes).length} communes, ${Object.keys(base.epci).length} EPCI : guichet ${n('guichet')}, courriel ${n('courriel')}, courrier ${n('courrier')}, à vérifier ${n('inconnu')} ; ${Object.values(base.communes).filter((c) => /** @type {any} */ (c).depot).length} communes à part.`);
}

module.exports = { assembler, entreeRetenue };
