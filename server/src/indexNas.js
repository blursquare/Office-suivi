// @ts-check
'use strict';
// Index du NAS des dossiers EN COURS (vrai agent, étape 2, 0.402.0 ; étude 29/10 : « dossiers en cours, texte du PDF d'abord », « IA pour
// chaque document »). Réutilise la mémoire de CLAIRE (memoire.js) : chaque dossier en cours est une rubrique « d:<id> » (jamais mêlée aux
// quatre rubriques de la mémoire), le serveur parcourt le dossier client, lit les Word et textes, les PDF sont lus par le POSTE (pdf.js, OCR
// des scans) comme pour la mémoire ; puis un résumé par document (type, émetteur, date, une phrase) est écrit par Claude, texte MASQUÉ par le
// serveur avant l'envoi, dépense comptée dans le plafond mensuel de l'IA des routines. Lecture seule : rien n'est jamais écrit sur le NAS.

const fsp = require('node:fs/promises');
const { listerFichiersMemoire, cheminDocumentMemoire, texteFichierMemoire } = require('./memoire');

// Formats de l'index des dossiers (résumé d'une phrase par Anthropic) : ceux d'avant le 31/10.
const FORMATS_INDEX_NAS = ['pdf', 'docx', 'txt', 'md'];
const { dossierClientAbsolu } = require('./explorateurNas');
const { masquer, retablirTexte } = require('./assistantMistral');
const { sensiblesDesDossiers } = require('./routines/ia');

const MAX_DOSSIERS_PAR_PARCOURS = 400;
const MAX_CARACTERES_RESUME = 5000;
// Une pièce d'identité, un RIB, un livret de famille ou une carte vitale n'est JAMAIS résumé par l'IA en ligne (texte gardé sur le serveur du bureau seulement).
// Mots cherchés entre séparateurs de nom de fichier (« RIB_Dupont.pdf », « CNI-Martin ») — `\b` ne coupe pas sur « _ » (audit 0.402.0, M2).
const RE_NOM_SENSIBLE = /(identit|passeport|carte[ _-]?(nationale|vitale|d.?identit)|titre[ _-]?de[ _-]?s[ée]jour|livret[ _-]?de[ _-]?famille|permis[ _-]?de[ _-]?conduire|bulletin|salaire|avis[ _-]?d.?imp[oô]sition|(?:^|[^a-z0-9])(cni|rib|iban|ci|cv|nir)(?=$|[^a-z0-9]))/i;
// Dans le texte : bande MRZ d'une pièce d'identité, ou un IBAN — le document n'est pas résumé en ligne non plus.
const RE_TEXTE_SENSIBLE = /(IDFRA|P<FRA|[A-Z0-9<]{30,})|\bFR\d{2}(?:\s?[0-9A-Z]{4}){5}/;

const SCHEMA_RESUME = {
  type: 'object', additionalProperties: false, required: ['type', 'emetteur', 'date', 'resume'],
  properties: { type: { type: 'string' }, emetteur: { type: 'string' }, date: { type: 'string' }, resume: { type: 'string' } }
};

/** Pure : l'identifiant de rubrique d'un dossier. @param {string} id */
const rubriqueDossier = (id) => 'd:' + String(id);
/** Pure : l'identifiant de dossier d'une rubrique « d:… », '' sinon. @param {string} rubrique */
const dossierDeRubrique = (rubrique) => (/^d:/.test(String(rubrique)) ? String(rubrique).slice(2) : '');

/** Pure : le nom d'un fichier interdit de résumé en ligne. @param {string} chemin */
function cheminSensible(chemin) { return RE_NOM_SENSIBLE.test(String(chemin || '')); }

/** Pure : la consigne de résumé (texte déjà masqué). @param {string} texteMasque */
function promptResume(texteMasque) {
  return [
    'Tu résumes un document d’un dossier de notaire français (texte pseudonymisé : [NOM1], [REF2]… sont des codes à recopier tels quels, jamais à deviner).',
    'Réponds par un objet JSON : "type" (nature du document en 2 à 5 mots : offre de prêt, avis de taxe foncière, permis de construire, déclaration préalable, facture, attestation d’assurance, état daté, courrier de la banque…), "emetteur" (qui l’a établi, ou ""), "date" (AAAA-MM-JJ si une date du document est lisible, sinon ""), "resume" (UNE phrase de 25 mots au plus : ce que dit le document d’utile pour le dossier).',
    'N’invente rien : si le texte ne permet pas de savoir, laisse "" ou écris « illisible ».',
    '', 'Texte du document :', texteMasque
  ].join('\n');
}

/** Pure : un résumé reçu de l'IA, assaini ; null s'il est inutilisable. @param {any} o */
function resumeAssaini(o) {
  if (!o || typeof o !== 'object' || typeof o.resume !== 'string') return null;
  const t = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const date = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date.trim()) ? o.date.trim() : '';
  const resume = t(o.resume, 400);
  return resume ? { type: t(o.type, 80), emetteur: t(o.emetteur, 120), date, resume } : null;
}

/**
 * Un parcours : les dossiers en cours reliés au NAS, leurs fichiers inscrits, les absents retirés, les Word et textes lus.
 * @param {{ config: any, memoire: any, depot: any, fsImpl?: any, etat: any }} o
 */
async function parcourirDossiersEnCours(o) {
  const fsImpl = o.fsImpl || fsp;
  const etat = o.etat;
  Object.assign(etat, { enCours: true, debut: Date.now(), fin: 0, dossiers: 0, vus: 0, nouveaux: 0, changes: 0, retires: 0, luServeur: 0, erreurs: 0, erreur: '' });
  try {
    if (!o.config.nasRacine) { etat.erreur = 'Aucun dossier NAS configuré.'; return etat; }
    const actifs = o.depot.tousActifs().filter((/** @type {any} */ d) => d && d.id && d.nasDossier && !d.archive).slice(0, MAX_DOSSIERS_PAR_PARCOURS);
    /** @type {Record<string, string>} */
    const racines = {};
    for (const d of actifs) {
      const abs = await dossierClientAbsolu(o.config.nasRacine, d.nasDossier);
      if (!abs) continue;
      const rubrique = rubriqueDossier(d.id);
      racines[rubrique] = abs;
      etat.dossiers++;
      const listage = await listerFichiersMemoire(abs, fsImpl);
      const complet = listage.complet;
      // Les formats que la mémoire lit depuis le 31/10 (.doc, .xlsx, .rtf, .odt…) ne partent PAS au résumé chez Anthropic : l'étude a demandé
      // la mémoire (« MODELES - OUTILS »), pas d'élargir ce flux automatique (relecture 0.410.0) — à décider par elle.
      const fichiers = listage.fichiers.filter((f) => FORMATS_INDEX_NAS.includes(f.ext));
      for (const f of fichiers) {
        const r = o.memoire.voirFichier(rubrique, f.chemin, f.nom, f.ext, f.taille, f.modifieMs);
        etat.vus++;
        if (r === 'nouveau') etat.nouveaux++; else if (r === 'change') etat.changes++;
      }
      if (complet && fichiers.length) etat.retires += o.memoire.retirerAbsents(rubrique, fichiers.map((f) => f.chemin));
    }
    // Dossier archivé, supprimé ou délié du NAS : son index disparaît (seulement si la liste des dossiers est celle du moment).
    for (const rub of o.memoire.rubriquesDossiers()) {
      const id = dossierDeRubrique(rub);
      const d = o.depot.trouverParId ? o.depot.trouverParId(id) : null;
      if (!d || d.archive || !d.nasDossier) etat.retires += o.memoire.retirerRubrique(rub);
    }
    o.memoire.retenterErreursServeur();
    o.memoire.retenterDossiers(24 * 3600 * 1000);
    const tentes = new Set();
    const suivant = () => o.memoire.aLire('serveur', 500, { dossiers: true }).find((/** @type {any} */ x) => !tentes.has(x.id));
    for (let doc = suivant(); doc; doc = suivant()) {
      tentes.add(doc.id);
      const racine = racines[doc.rubrique];
      const cible = racine ? await cheminDocumentMemoire(racine, doc.chemin, fsImpl) : null;
      if (!cible) { o.memoire.marquerErreur(doc.id, 'fichier introuvable'); continue; }
      try {
        const buf = await fsImpl.readFile(cible);
        const texte = await texteFichierMemoire(doc.ext, buf);
        o.memoire.enregistrerTexte(doc.id, [{ n: 0, texte }]);
        etat.luServeur++;
      } catch (e) {
        o.memoire.marquerErreur(doc.id, e && e.message ? e.message : 'illisible');
        etat.erreurs++;
      }
    }
  } catch (e) {
    etat.erreur = e && e.message ? String(e.message).slice(0, 160) : 'erreur';
    console.error('[index-nas]', etat.erreur);
  } finally { etat.enCours = false; etat.fin = Date.now(); }
  return etat;
}

/**
 * Écrit le résumé de quelques documents lus. Une pièce d'identité, un RIB… n'est jamais envoyée : type déduit du nom, sans IA.
 * @param {{ memoire: any, depot: any, ia: any, limite?: number }} o
 * @returns {Promise<{ resumes: number, echecs: number, ignores: number, raison?: string }>}
 */
async function resumerDocuments(o) {
  const sortie = { resumes: 0, echecs: 0, ignores: 0 };
  const dispo = o.ia.disponible();
  const docs = o.memoire.aResumer(o.limite || 5);
  if (!docs.length) return sortie;
  const tousDossiers = o.depot.tousActifs();
  const sensibles = sensiblesDesDossiers(tousDossiers);
  for (const doc of docs) {
    if (cheminSensible(doc.chemin)) {
      o.memoire.enregistrerResume(doc.id, { type: 'pièce personnelle (identité, RIB…)', resume: 'Pièce personnelle : non résumée (jamais envoyée à l’IA en ligne).' });
      sortie.ignores++;
      continue;
    }
    if (!dispo.ok) return { ...sortie, raison: dispo.raison };
    const texte = o.memoire.texteDocument(doc.id, MAX_CARACTERES_RESUME);
    if (RE_TEXTE_SENSIBLE.test(texte)) {
      o.memoire.enregistrerResume(doc.id, { type: 'pièce personnelle (identité, RIB…)', resume: 'Pièce personnelle : non résumée (jamais envoyée à l’IA en ligne).' });
      sortie.ignores++;
      continue;
    }
    if (texte.replace(/\s+/g, '').length < 40) { o.memoire.enregistrerResume(doc.id, { resume: 'Document sans texte lisible.' }); sortie.ignores++; continue; }
    const table = new Map();
    try {
      const r = resumeAssaini(await o.ia.json(promptResume(masquer(texte, sensibles, table)), SCHEMA_RESUME, null, 500));
      if (!r) throw new Error('résumé inutilisable');
      const sansInventes = (/** @type {string} */ t) => retablirTexte(t, table).replace(/\[(?:NOM|EMAIL|TEL|REF|NUM|MONTANT)\d+\]/g, '[?]');
      o.memoire.enregistrerResume(doc.id, { type: sansInventes(r.type), emetteur: sansInventes(r.emetteur), date: r.date, resume: sansInventes(r.resume) }, false, doc.lu_le);
      sortie.resumes++;
    } catch (e) {
      const message = String(e && e.message || '');
      // Plafond atteint ou API injoignable : ce n'est pas la faute du document, aucun essai n'est compté (audit 0.402.0, B1).
      if (/plafond/.test(message)) return { ...sortie, raison: 'plafond mensuel atteint' };
      if (/injoignable|surcharg|overloaded|timeout|délai|ECONN|5\d\d/i.test(message)) return { ...sortie, raison: 'IA injoignable' };
      o.memoire.enregistrerResume(doc.id, {}, true);
      sortie.echecs++;
    }
  }
  return sortie;
}

module.exports = { RE_TEXTE_SENSIBLE, rubriqueDossier, dossierDeRubrique, cheminSensible, promptResume, resumeAssaini, parcourirDossiersEnCours, resumerDocuments, SCHEMA_RESUME };
