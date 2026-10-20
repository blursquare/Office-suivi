// @ts-check
'use strict';
// Mémoire de Claire Scan (étude 20/10 : « un RAG des fichiers déjà scannés, renommés et rangés ») — SANS IA ni embeddings :
//   • les types de pièce que l'étude a CORRIGÉS ou confirmés à la main : les mots du haut de la première page (sans chiffre, sans les
//     noms du dossier) → le type choisi ; un scan qui y ressemble (mots communs / mots réunis) reçoit ce type ;
//   • les IDENTIFIANTS (numéro de contrat, de prêt, d'avis, IBAN, référence d'Authentic) lus dans un scan rangé → le dossier : un
//     scan qui porte le même identifiant reçoit des points pour ce dossier. Un identifiant vu dans deux dossiers n'attribue plus rien ;
//     les numéros d'entreprise (SIREN/SIRET, « Luhn » valide) — ceux des banques et des agences — ne sont jamais retenus.
// Code COMMUN : le poste s'en sert pour reconnaître, le serveur pour fusionner ce qui est appris (même règle, écrite une fois).

(function () {
  var MAX_MOTS_EMPREINTE = 40;
  var MAX_TYPES_MEMOIRE = 300;
  var MAX_IDENTIFIANTS_MEMOIRE = 3000;
  var SEUIL_SIMILARITE_TYPE = 0.6;
  var SEUIL_SIMILARITE_FUSION = 0.8;
  // Points donnés à un dossier par un identifiant mémorisé (sous le seuil de rangement automatique, 4 : un seul identifiant fait une
  // suggestion, il faut un autre indice pour ranger seul) et par la référence d'Authentic (le vrai numéro du dossier).
  var POINTS_IDENTIFIANT_MEMOIRE = 3;
  var POINTS_REFERENCE_AUTHENTIC = 6;

  /** Pure : un texte sans accent ni majuscule. @param {unknown} t */
  function sansAccents(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  /**
   * Pure : l'empreinte d'une première page — ses premiers mots de quatre lettres ou plus, sans chiffre, sans les mots à exclure (noms,
   * adresse du dossier), sans doublon, 40 au plus.
   * @param {unknown} texte @param {string[]} [exclus]
   */
  function motsEmpreinteScan(texte, exclus) {
    const ecartes = new Set((exclus || []).map(sansAccents));
    const vus = new Set();
    /** @type {string[]} */
    const mots = [];
    for (const m of sansAccents(texte).replace(/\d+/g, ' ').split(/[^a-z]+/)) {
      if (m.length < 4 || ecartes.has(m) || vus.has(m)) continue;
      vus.add(m);
      mots.push(m);
      if (mots.length >= MAX_MOTS_EMPREINTE) break;
    }
    return mots;
  }

  /** Pure : ressemblance de deux listes de mots (mots communs / mots réunis), entre 0 et 1. @param {string[]} a @param {string[]} b */
  function similariteMots(a, b) {
    const A = new Set(a || []);
    const B = new Set(b || []);
    if (!A.size || !B.size) return 0;
    let commun = 0;
    A.forEach((m) => { if (B.has(m)) commun += 1; });
    return commun / (A.size + B.size - commun);
  }

  /**
   * Pure : le type mémorisé qui ressemble le plus à une empreinte (au moins `seuil`), le plus confirmé départageant.
   * @param {string[]} mots @param {Array<{ mots: string[], type: string, n: number }>} entrees @param {number} [seuil]
   * @returns {{ type: string, n: number, similarite: number } | null}
   */
  function typeDepuisMemoireScan(mots, entrees, seuil) {
    const mini = typeof seuil === 'number' ? seuil : SEUIL_SIMILARITE_TYPE;
    /** @type {{ type: string, n: number, similarite: number } | null} */
    let meilleur = null;
    for (const e of Array.isArray(entrees) ? entrees : []) {
      if (!e || !e.type || !Array.isArray(e.mots)) continue;
      const s = similariteMots(mots, e.mots);
      if (s < mini) continue;
      if (!meilleur || s > meilleur.similarite + 0.05 || (Math.abs(s - meilleur.similarite) <= 0.05 && (e.n || 1) > meilleur.n)) meilleur = { type: e.type, n: e.n || 1, similarite: s };
    }
    return meilleur;
  }

  /**
   * Pure : la mémoire des types après un rangement à la main. Une entrée très proche (0,8) du même type est confirmée (+1, mots réunis) ;
   * très proche d'un AUTRE type, elle est remplacée (la dernière correction l'emporte) ; sinon une entrée est ajoutée. 300 au plus,
   * les moins récentes d'abord oubliées.
   * @param {Array<any>} entrees @param {string[]} mots @param {string} type @param {string} maintenantIso
   */
  function fusionnerTypeMemoire(entrees, mots, type, maintenantIso) {
    const liste = (Array.isArray(entrees) ? entrees : []).filter((e) => e && e.type && Array.isArray(e.mots)).map((e) => ({ mots: e.mots.slice(0, MAX_MOTS_EMPREINTE), type: String(e.type), n: Math.max(1, Number(e.n) || 1), maj: String(e.maj || '') }));
    const propres = (mots || []).filter((m) => typeof m === 'string').slice(0, MAX_MOTS_EMPREINTE);
    if (!type || propres.length < 3) return liste.slice(0, MAX_TYPES_MEMOIRE);
    const proche = liste.findIndex((e) => similariteMots(e.mots, propres) >= SEUIL_SIMILARITE_FUSION);
    if (proche >= 0) {
      const e = liste[proche];
      if (e.type === type) liste[proche] = { mots: Array.from(new Set(e.mots.concat(propres))).slice(0, MAX_MOTS_EMPREINTE), type, n: e.n + 1, maj: maintenantIso };
      else liste[proche] = { mots: propres, type, n: 1, maj: maintenantIso };
    } else {
      liste.push({ mots: propres, type, n: 1, maj: maintenantIso });
    }
    return liste.sort((a, b) => String(b.maj).localeCompare(String(a.maj))).slice(0, MAX_TYPES_MEMOIRE);
  }

  /** Pure : un numéro est-il valide à l'algorithme de Luhn (SIREN, SIRET) ? @param {string} chiffres */
  function luhnValide(chiffres) {
    let somme = 0;
    for (let i = 0; i < chiffres.length; i++) {
      let n = Number(chiffres[chiffres.length - 1 - i]);
      if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
      somme += n;
    }
    return somme % 10 === 0;
  }

  /**
   * Pure : les identifiants d'un texte — suites de 8 à 20 chiffres (hors téléphone, SIREN et SIRET), références à lettres et chiffres
   * (« PR-2026-0123 »), IBAN ; en majuscules sans espace ni tiret ; 12 au plus.
   * @param {unknown} texte
   */
  function identifiantsDepuisTexteScan(texte) {
    const t = String(texte || '').replace(/ /g, ' ');
    const trouves = new Set();
    const garder = (/** @type {string} */ brut) => { const id = brut.toUpperCase().replace(/[\s.\-/]+/g, ''); if (id.length >= 8 && id.length <= 34) trouves.add(id); };
    for (const m of t.matchAll(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g)) garder(m[0]);
    for (const m of t.matchAll(/(?<![\dA-Za-z])\d{8,20}(?![\dA-Za-z])/g)) {
      const n = m[0];
      if (/^0[1-9]\d{8}$/.test(n)) continue;
      if ((n.length === 9 || n.length === 14) && luhnValide(n)) continue;
      garder(n);
    }
    for (const m of t.matchAll(/(?<![A-Za-z0-9])[A-Z]{1,4}[ -]?\d{4}[ -]?\d{2,8}(?![A-Za-z0-9])/g)) garder(m[0]);
    return Array.from(trouves).slice(0, 12);
  }

  /** Pure : les références d'Authentic (« A 2026 00247 ») d'un texte, sans espace. @param {unknown} texte */
  function referencesAuthenticDansTexte(texte) {
    const refs = new Set();
    for (const m of String(texte || '').matchAll(/(?<![A-Za-z0-9])A[ ]?(20\d{2})[ ]?(\d{5})(?!\d)/g)) refs.add('A' + m[1] + m[2]);
    return Array.from(refs);
  }

  /** Pure : une référence d'Authentic de fiche, comparable (« A 2026 00247 » → « A202600247 »). @param {unknown} ref */
  function referenceAuthenticComparable(ref) { return String(ref || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  /**
   * Pure : les points que la mémoire et Authentic donnent aux dossiers pour un texte — { dossierId: { points, raisons[] } }.
   * @param {string} texte @param {Array<{ id: string, referenceAuthentic?: string }>} dossiers
   * @param {Array<{ id: string, dossierId: string }>} identifiantsMemoire
   */
  function pointsMemoireParDossier(texte, dossiers, identifiantsMemoire) {
    /** @type {Record<string, { points: number, raisons: string[] }>} */
    const sortie = {};
    const ajouter = (/** @type {string} */ id, /** @type {number} */ points, /** @type {string} */ raison) => {
      const e = sortie[id] || (sortie[id] = { points: 0, raisons: [] });
      e.points += points;
      e.raisons.push(`${raison} +${points}`);
    };
    const refs = new Set(referencesAuthenticDansTexte(texte));
    if (refs.size) for (const d of dossiers || []) if (d && d.referenceAuthentic && refs.has(referenceAuthenticComparable(d.referenceAuthentic))) ajouter(d.id, POINTS_REFERENCE_AUTHENTIC, 'référence d’Authentic');
    const table = new Map((identifiantsMemoire || []).filter((e) => e && e.id && e.dossierId).map((e) => [e.id, e.dossierId]));
    const dejaVus = new Set();
    for (const id of identifiantsDepuisTexteScan(texte)) {
      const dossierId = table.get(id);
      if (!dossierId || dejaVus.has(dossierId)) continue;
      dejaVus.add(dossierId);
      ajouter(dossierId, POINTS_IDENTIFIANT_MEMOIRE, 'identifiant déjà rangé dans ce dossier');
    }
    return sortie;
  }

  /**
   * Pure : la table des identifiants après un rangement — chaque identifiant est lié au dossier ; un identifiant déjà lié à un AUTRE
   * dossier devient ambigu (dossierId '') et n'attribue plus rien. 3 000 au plus, les moins récents d'abord oubliés.
   * @param {Array<any>} table @param {string[]} identifiants @param {string} dossierId @param {string} maintenantIso
   */
  function fusionnerIdentifiantsMemoire(table, identifiants, dossierId, maintenantIso) {
    const liste = (Array.isArray(table) ? table : []).filter((e) => e && typeof e.id === 'string' && e.id).map((e) => ({ id: String(e.id), dossierId: String(e.dossierId || ''), maj: String(e.maj || '') }));
    const index = new Map(liste.map((e, i) => [e.id, i]));
    for (const id of (identifiants || []).filter((x) => typeof x === 'string' && x.length >= 8 && x.length <= 34).slice(0, 12)) {
      const i = index.get(id);
      if (i === undefined) { index.set(id, liste.length); liste.push({ id, dossierId: dossierId || '', maj: maintenantIso }); continue; }
      const e = liste[i];
      if (e.dossierId && e.dossierId !== dossierId) liste[i] = { id, dossierId: '', maj: maintenantIso };
      else if (!e.dossierId && e.maj) liste[i] = { id, dossierId: '', maj: maintenantIso };
      else liste[i] = { id, dossierId: dossierId || '', maj: maintenantIso };
    }
    return liste.sort((a, b) => String(b.maj).localeCompare(String(a.maj))).slice(0, MAX_IDENTIFIANTS_MEMOIRE);
  }

  const exportes = { MAX_MOTS_EMPREINTE, MAX_TYPES_MEMOIRE, MAX_IDENTIFIANTS_MEMOIRE, SEUIL_SIMILARITE_TYPE, POINTS_IDENTIFIANT_MEMOIRE, POINTS_REFERENCE_AUTHENTIC,
    motsEmpreinteScan, similariteMots, typeDepuisMemoireScan, fusionnerTypeMemoire, luhnValide, identifiantsDepuisTexteScan, referencesAuthenticDansTexte,
    referenceAuthenticComparable, pointsMemoireParDossier, fusionnerIdentifiantsMemoire };
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})();
