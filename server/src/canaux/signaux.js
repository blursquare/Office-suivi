// @ts-check
'use strict';
// Les signaux de CLAIRE dans les canaux (étude 25/10, scénarios « ok vas-y ») : de l'affichage et des messages internes, rien ne part hors de l'étude.
//   ⚠️ échéance dépassée sur le dernier message du canal d'un dossier (retiré quand elle est levée) ;
//   ✅ sur le message d'origine d'une tâche prise par ✋ quand elle est cochée ;
//   résumé du matin des réponses de Claire qui ont reçu ❓ ou 👎 ; 🎂 aux anniversaires de l'étude.

const { echeancesPlanning } = require('../../../commun/planning');
const { lireMessages, reagirMessage, ajouterMessage, canalDuDossier } = require('./canaux');
const { lireReactions } = require('../reactionsAgent');

const CLE_RETARDS = 'canaux-alertes-retard';
const CLE_TACHES_FAITES = 'canaux-taches-faites';
const CLE_FETES = 'canaux-fetes';
const CLE_RESUME_INTERROGATIONS = 'canaux-resume-interrogations';
const TYPES_RETARD = ['ventebien', 'pret', 'safer', 'dia'];

/** Les dates de l'étude (fournies par l'étude le 25/10) : MM-JJ → texte. Le premier est l'ouverture de l'office, avec son année. */
const FETES = [
  { jour: '05-11', annee: 2020, texte: (n) => `🎂 L’office fête ses ${n} an${n > 1 ? 's' : ''} aujourd’hui (ouvert le 11 mai 2020) !` },
  { jour: '09-12', prenom: 'Sophie' },
  { jour: '12-26', prenom: 'Bastien' },
  { jour: '12-19', prenom: 'Jérémy' },
  { jour: '08-22', prenom: 'Julie' }
];

/** Pur : l'échéance en retard la plus ancienne d'un dossier de vente en cours (« Obtention du prêt »…), ou null. @param {any} d @param {string} aujourdhui */
function echeanceEnRetard(d, aujourdhui) {
  if (!d || d.archive || d.typeAffaire === 'succession') return null;
  let pire = null;
  try {
    for (const e of echeancesPlanning(d)) {
      if (TYPES_RETARD.includes(e.type) && e.iso && e.iso < aujourdhui && (!pire || e.iso < pire.iso)) pire = e;
    }
  } catch (_) { return null; }
  return pire;
}

/** Pose ou retire ⚠️ (par CLAIRE) sur le dernier message du canal de chaque dossier. @param {any} repo @param {any[]} dossiers @param {string} aujourdhui */
function signalerRetards(repo, dossiers, aujourdhui) {
  const brut = repo.lireJsonBrut(CLE_RETARDS, null);
  /** @type {Record<string, string>} */
  const marques = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  let change = false;
  let touches = 0;
  for (const d of dossiers || []) {
    if (!d || !d.id) continue;
    const canal = canalDuDossier(d.id);
    const retard = echeanceEnRetard(d, aujourdhui);
    const ancien = marques[d.id] || '';
    if (retard && !ancien) {
      const messages = lireMessages(repo, canal).filter((m) => !m.parent);
      const dernier = messages[messages.length - 1];
      if (dernier && reagirMessage(repo, canal, dernier.id, 'CLAIRE', '⚠️', true)) { marques[d.id] = dernier.id; change = true; touches += 1; }
    } else if (!retard && ancien) {
      reagirMessage(repo, canal, ancien, 'CLAIRE', '⚠️', false);
      delete marques[d.id];
      change = true;
      touches += 1;
    }
  }
  if (change) repo.ecrireJsonBrut(CLE_RETARDS, marques);
  return touches;
}

/** ✅ de CLAIRE sur le message d'origine d'une tâche prise par ✋ et cochée depuis. @param {any} repo @param {any[]} rappels */
function confirmerTachesFaites(repo, rappels) {
  const brut = repo.lireJsonBrut(CLE_TACHES_FAITES, null);
  /** @type {Record<string, number>} */
  const faits = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  let n = 0;
  for (const r of rappels || []) {
    if (!r || !r.fait || !r.source || !r.source.canal || !r.source.messageId || faits[r.id]) continue;
    faits[r.id] = Date.now();
    if (reagirMessage(repo, r.source.canal, r.source.messageId, 'CLAIRE', '✅', true)) n += 1;
  }
  if (Object.keys(faits).length) {
    const ids = Object.keys(faits);
    if (ids.length > 500) ids.sort((a, b) => faits[a] - faits[b]).slice(0, ids.length - 500).forEach((i) => { delete faits[i]; });
    repo.ecrireJsonBrut(CLE_TACHES_FAITES, faits);
  }
  return n;
}

/** Pur : le texte du résumé des réponses de Claire reprises par ❓ ou 👎 depuis `depuis`, ou ''. @param {any[]} reactions @param {number} depuis */
function texteResumeInterrogations(reactions, depuis) {
  const liste = (reactions || []).filter((r) => r.le > depuis && (r.sens === 'pas-clair' || r.sens === 'refus')).slice(0, 8);
  if (!liste.length) return '';
  const lignes = liste.map((r) => `• ${r.emoji} ${String(r.par).split(' ')[0]} sur « ${String(r.extrait || '').slice(0, 90)}${String(r.extrait || '').length > 90 ? '…' : ''} »`);
  return `Bonjour ! Depuis hier, ${liste.length} de mes réponses ${liste.length > 1 ? 'ont' : 'a'} reçu un ❓ ou un 👎 — à reprendre ensemble :\n${lignes.join('\n')}`;
}

/** Une fois par jour ouvré : le résumé dans « général ». @param {any} repo @param {string} aujourdhui AAAA-MM-JJ @param {number} maintenant */
function resumerInterrogations(repo, aujourdhui, maintenant) {
  const etat = repo.lireJsonBrut(CLE_RESUME_INTERROGATIONS, null) || {};
  if (etat.jour === aujourdhui) return false;
  const texte = texteResumeInterrogations(lireReactions(repo, maintenant), Number(etat.depuis) || maintenant - 24 * 3600 * 1000);
  repo.ecrireJsonBrut(CLE_RESUME_INTERROGATIONS, { jour: aujourdhui, depuis: maintenant });
  if (!texte) return false;
  return !!ajouterMessage(repo, 'general', { auteur: 'CLAIRE', claire: true, texte, html: `<p>${texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').split('\n').join('<br>')}</p>` }, maintenant);
}

/** 🎂 dans « général » le jour d'une date de l'étude, une fois par an. @param {any} repo @param {string} aujourdhui AAAA-MM-JJ @param {number} maintenant */
function feterAnniversaires(repo, aujourdhui, maintenant) {
  const annee = Number(aujourdhui.slice(0, 4));
  const jour = aujourdhui.slice(5);
  const faites = repo.lireJsonBrut(CLE_FETES, null) || {};
  let n = 0;
  for (const f of FETES) {
    const cle = `${f.jour}:${annee}`;
    if (f.jour !== jour || faites[cle]) continue;
    const texte = f.annee ? f.texte(annee - f.annee) : `🎂 Joyeux anniversaire ${f.prenom} !`;
    const m = ajouterMessage(repo, 'general', { auteur: 'CLAIRE', claire: true, texte, html: `<p>${texte}</p>` }, maintenant);
    if (m) { reagirMessage(repo, 'general', m.id, 'CLAIRE', '🎂', true); faites[cle] = true; n += 1; }
  }
  if (n) repo.ecrireJsonBrut(CLE_FETES, faites);
  return n;
}

module.exports = { FETES, echeanceEnRetard, signalerRetards, confirmerTachesFaites, texteResumeInterrogations, resumerInterrogations, feterAnniversaires };
