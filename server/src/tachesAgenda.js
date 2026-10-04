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
// que la fenêtre lue n'est jamais retirée faute d'avoir été relue. Tâche cochée : plus touchée. Tâche non cochée
// dont le rendez-vous a disparu de l'agenda (supprimé, plus rouge, initiales retirées) : retirée — sauf si CLAIRE
// l'a déjà retiré de l'agenda (`agendaSupprimeLe`, tâche décochée ensuite : elle reste, comme un rappel ordinaire).
function synchroniserTachesAgenda(rappels, evenements, debut, maintenantIso) {
  const maintenant = maintenantIso || new Date().toISOString();
  const taches = new Map();
  for (const evt of evenements || []) {
    const t = tacheDepuisEvenement(evt);
    if (t) taches.set(t.itemId, t);
  }
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
    const horsFenetre = debut && r.echeance && r.echeance < debut;
    if (r.fait || r.agendaSupprimeLe || horsFenetre) resultat.push(r);
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
