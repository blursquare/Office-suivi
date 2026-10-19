// @ts-check
'use strict';
// Import du fichier clients et du fichier immeubles d'Authentic (étude 19/10 : « fais l'import dans les réglages ; il faudra compléter les
// fiches avec les données qui n'y sont pas, grâce aux données d'Authentic »). Le POSTE lit l'export (.xls) et envoie des lignes déjà
// rangées par colonne ; le serveur ne garde que ces champs, bornés, dans la base du bureau (clé `clients-biens-import`). Jamais dans le
// dépôt, jamais envoyé à une IA, jamais journalisé (noms des clients). Les fiches importées sont la base de « Clients et biens » ; ce que
// les dossiers et Authentic en disent passe devant (server/src/clientsBiens.js).

const CLE_IMPORT = 'clients-biens-import';
const MAX_PERSONNES = 20000;
const MAX_BIENS = 10000;

/** @param {any} v @param {number} [n] */
const texte = (v, n = 200) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

/** Pure : une date « JJ/MM/AAAA » ou ISO → « AAAA-MM-JJ », '' sinon. @param {any} v */
function dateIso(v) {
  const t = texte(v, 20);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return '';
  const j = Number(m[1]); const mo = Number(m[2]);
  if (j < 1 || j > 31 || mo < 1 || mo > 12) return '';
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

/** Pure : une personne importée, assainie ; null sans nom. @param {any} p */
function personneImport(p) {
  if (!p || typeof p !== 'object') return null;
  const nom = texte(p.nom, 120);
  if (!nom) return null;
  const liste = (/** @type {any} */ v, /** @type {RegExp} */ re) => (Array.isArray(v) ? v : [v]).map((x) => texte(x, 120)).filter((x) => re.test(x)).slice(0, 4);
  const civ = texte(p.civilite, 10);
  return {
    nom, prenom: texte(p.prenom, 80), civilite: civ === 'M' || civ === 'Mme' ? civ : '',
    dateNaissance: dateIso(p.dateNaissance), lieuNaissance: texte(p.lieuNaissance, 80),
    telephones: liste(p.telephones, /\d{2}.*\d{2}/), emails: liste(p.emails, /^[^@\s]+@[^@\s]+\.[^@\s]+$/),
    domicile: texte(p.domicile, 200), profession: texte(p.profession, 80),
    // Décès (date, ou « date inconnue »), situation matrimoniale et conjoint du fichier clients (étude 19/10).
    deces: p.deces && typeof p.deces === 'object' && (dateIso(p.deces.date) || /inconnu/i.test(texte(p.deces.lieu)))
      ? { date: dateIso(p.deces.date), lieu: dateIso(p.deces.date) ? '' : 'date inconnue' } : null,
    situation: texte(p.situation, 40), conjoint: texte(p.conjoint, 120)
  };
}

/** Pure : un bien importé, assaini ; null sans adresse ni parcelle. @param {any} b */
function bienImport(b) {
  if (!b || typeof b !== 'object') return null;
  const parcelles = (Array.isArray(b.parcelles) ? b.parcelles : []).slice(0, 40).map((/** @type {any} */ p) => ({
    prefixe: texte(p && p.prefixe, 3), section: texte(p && p.section, 2).toUpperCase(), numero: texte(p && p.numero, 5).replace(/^0+(?=\d)/, '')
  })).filter((/** @type {any} */ p) => /^[0-9A-Z]{1,2}$/.test(p.section) && /^\d{1,4}[A-Z]?$/.test(p.numero));
  const adresse = texte(b.adresse, 200);
  if (!adresse && !parcelles.length) return null;
  return { adresse, commune: texte(b.commune, 80), codePostal: /^\d{5}$/.test(texte(b.codePostal)) ? texte(b.codePostal) : '', type: texte(b.type, 80), parcelles };
}

/** Pure : l'import gardé, assaini. @param {any} brut */
function assainirImport(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const personnes = (Array.isArray(b.personnes) ? b.personnes : []).slice(0, MAX_PERSONNES).map(personneImport).filter(Boolean);
  const biens = (Array.isArray(b.biens) ? b.biens : []).slice(0, MAX_BIENS).map(bienImport).filter(Boolean);
  const etat = (/** @type {any} */ e) => (e && typeof e === 'object' ? { le: texte(e.le, 30), par: texte(e.par, 80), fichier: texte(e.fichier, 120), lignes: Number(e.lignes) || 0 } : null);
  return { personnes, biens, personnesImport: etat(b.personnesImport), biensImport: etat(b.biensImport) };
}

/** Pure : le résumé montré dans les Réglages (jamais un nom). @param {any} imp */
function resumeImport(imp) {
  const i = assainirImport(imp);
  return { personnes: i.personnes.length, biens: i.biens.length, personnesImport: i.personnesImport, biensImport: i.biensImport };
}

module.exports = { CLE_IMPORT, MAX_PERSONNES, MAX_BIENS, assainirImport, resumeImport, personneImport, bienImport, dateIso };
