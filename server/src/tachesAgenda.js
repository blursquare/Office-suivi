// @ts-check
'use strict';

// Tâches posées dans l'agenda de l'office (étude, 04/10 : « les rendez-vous en rouge avec des initiales de
// collaborateurs sont des tâches à faire ; à ajouter aux tâches du collaborateur et à supprimer de l'agenda une
// fois cochées »). Choix de l'étude : catégorie rouge ET initiales en tête du titre (« JV - Relancer le syndic »).
// Chaque tour de lecture de l'agenda les recopie dans « Mes rappels » du collaborateur (clé rappels-perso) ;
// cocher la tâche dans CLAIRE retire le rendez-vous de l'agenda (côté poste, MoveToDeletedItems).

const crypto = require('crypto');
const { COLLABORATEURS_ABSENCE } = require('./agendaOffice');

function sansAccents(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function estCategorieRouge(nom) {
  return /(^|[^a-z])(rouge|red)([^a-z]|$)/.test(sansAccents(nom));
}

// Initiales en capitales, en tête du titre, suivies d'un séparateur ou d'une espace : « JV - … », « JV: … »,
// « JV … ». « JVA… » ou « jv … » ne comptent pas.
function tacheDepuisEvenement(evt) {
  if (!evt || !evt.itemId || !evt.date) return null;
  if (!(evt.categories || []).some(estCategorieRouge)) return null;
  const titre = String(evt.sujet || '').trim();
  const m = titre.match(/^([A-Z]{2})(?![A-Za-z0-9À-ÿ])\s*[-–—:./]?\s*(.*)$/);
  if (!m) return null;
  const collab = COLLABORATEURS_ABSENCE.find((c) => c.initiales === m[1]);
  if (!collab) return null;
  return {
    itemId: String(evt.itemId),
    changeKey: String(evt.changeKey || ''),
    collaborateur: collab.nom,
    texte: (m[2].trim() || titre).slice(0, 200),
    date: evt.date
  };
}

function idTacheAgenda(itemId) {
  return 'ag-' + crypto.createHash('sha1').update(String(itemId)).digest('hex').slice(0, 24);
}

// Pure : les rappels après un tour de lecture. `debut` = premier jour lu (AAAA-MM-JJ) : une tâche plus ancienne
// que la fenêtre lue n'est jamais touchée faute d'avoir été relue. Tâche cochée : plus touchée. Tâche non cochée :
// - rendez-vous SUPPRIMÉ de l'agenda (absent de la lecture) → cochée, faite à l'heure du tour (étude, 04/10 : « si une
//   tâche est supprimée de l'agenda, cocher la tâche dans CLAIRE ») ; `agendaSupprimeLe` posé pour que le poste ne
//   tente pas de retirer un rendez-vous qui n'existe plus ;
// - rendez-vous encore là mais qui n'est plus une tâche (plus rouge, initiales retirées) → retirée ;
// - déjà retirée de l'agenda par CLAIRE puis décochée (`agendaSupprimeLe`) → reste, comme un rappel ordinaire.
// La lecture n'arrive ici que complète (une tranche en échec = tour sans effet, lireCalendrierExchange).
function synchroniserTachesAgenda(rappels, evenements, debut, maintenantIso, options) {
  const maintenant = maintenantIso || new Date().toISOString();
  const taches = new Map();
  const presents = new Set();
  for (const evt of evenements || []) {
    if (evt && evt.itemId) presents.add(String(evt.itemId));
    const t = tacheDepuisEvenement(evt);
    if (t) taches.set(t.itemId, t);
  }
  // Garde-fous (audit 12/10) : une tâche après le dernier jour lu n'est pas jugée ; une lecture tronquée (3 000 rendez-vous)
  // ou vide, ou d'un AUTRE calendrier que le tour précédent (Réglages changés), ne coche rien. Des tâches toutes supprimées
  // d'un coup dans Outlook sont bien cochées (règle de l'étude du 04/10).
  const liste = evenements || [];
  const dates = liste.map((e) => e && String(e.date || '')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const finLue = dates.length ? dates[dates.length - 1] : '';
  const tronquee = liste.length >= 3000;
  const aucuneRetrouvee = !!(options && options.calendrierChange);
  const resultat = [];
  const vus = new Set();
  for (const r of rappels || []) {
    if (!r || !r.agendaItemId) { resultat.push(r); continue; }
    const t = taches.get(r.agendaItemId);
    vus.add(r.agendaItemId);
    if (t) {
      resultat.push(r.fait ? r : { ...r, auteur: t.collaborateur, texte: t.texte, echeance: t.date, agendaChangeKey: t.changeKey });
      continue;
    }
    const horsFenetre = (debut && r.echeance && r.echeance < debut) || (finLue && r.echeance && r.echeance > finLue) || !finLue || tronquee || aucuneRetrouvee;
    if (r.fait || r.agendaSupprimeLe) resultat.push(r);
    else if (presents.has(r.agendaItemId)) continue; // relue, mais plus une tâche : retirée
    else if (horsFenetre) resultat.push(r);
    else resultat.push({ ...r, fait: true, faitLe: maintenant, agendaSupprimeLe: maintenant });
  }
  for (const t of taches.values()) {
    if (vus.has(t.itemId)) continue;
    resultat.push({
      id: idTacheAgenda(t.itemId), auteur: t.collaborateur, texte: t.texte, echeance: t.date, dossierId: '',
      fait: false, faitLe: '', creeLe: maintenant, agendaItemId: t.itemId, agendaChangeKey: t.changeKey
    });
  }
  return resultat;
}

module.exports = { estCategorieRouge, tacheDepuisEvenement, idTacheAgenda, synchroniserTachesAgenda };
