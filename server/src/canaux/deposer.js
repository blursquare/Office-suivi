// @ts-check
'use strict';
// Le chemin unique par lequel une routine de CLAIRE dépose une proposition : refusée d'avance si le dossier est silencé (« Jamais pour ce
// dossier »), sinon ajoutée à la liste des propositions (jamais refaite : empreinte) ET annoncée par un message de CLAIRE dans le canal du
// dossier (ou « général » sans dossier), avec la carte « Autoriser / Refuser ». Aucun email ne part ici.

const { lirePropositions, ecrirePropositions, ajouterProposition } = require('../routines/propositions');
const { ajouterMessage, canalDuDossier, estSilence } = require('./canaux');

/**
 * @param {any} repo @param {any} proposition @param {Date} [maintenant]
 * @returns {{ ok: boolean, silence?: boolean, reattribuee?: boolean, proposition?: any }}
 */
function deposerProposition(repo, proposition, maintenant) {
  const date = maintenant || new Date();
  if (proposition && proposition.dossierId && estSilence(repo, String(proposition.dossierId), String(proposition.routine || ''))) return { ok: false, silence: true };
  const r = ajouterProposition(lirePropositions(repo), proposition, date);
  if (r.reattribuee) {
    // Le dossier a changé de responsable : la proposition en attente le suit (26/10), annoncée au nouveau dans le canal, sans doublon.
    ecrirePropositions(repo, r.liste);
    const q = r.reattribuee;
    const prenom = (n) => String(n || '').split(/\s+/)[0];
    ajouterMessage(repo, q.dossierId ? canalDuDossier(q.dossierId) : 'general', {
      auteur: 'CLAIRE', claire: true, pour: q.responsable, carte: q.id,
      texte: `${q.titre} — passée${q.avant ? ' de ' + prenom(q.avant) : ''} à ${prenom(q.responsable) || 'l’étude'}, nouveau responsable du dossier.`
    }, date.getTime());
    return { ok: false, reattribuee: true, proposition: q };
  }
  if (!r.ajoutee) return { ok: false };
  ecrirePropositions(repo, r.liste);
  const p = r.ajoutee;
  ajouterMessage(repo, p.dossierId ? canalDuDossier(p.dossierId) : 'general', {
    auteur: 'CLAIRE', claire: true, pour: p.responsable, carte: p.id,
    texte: p.resume ? `${p.titre} — ${p.resume}` : p.titre
  }, date.getTime());
  return { ok: true, proposition: p };
}

module.exports = { deposerProposition };
