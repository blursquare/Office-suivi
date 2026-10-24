// @ts-check
'use strict';
// Planificateur des routines de CLAIRE (phase 0, cadrage : docs/spec-routines-claire.md) : un tour par minute, jours ouvrés seulement.
// Il (1) fait expirer les propositions restées sans réponse 30 jours, (2) lance les routines horaires dues — aucune n'existe encore en phase 0 —
// et (3) envoie à l'heure choisie (9 h 30 par défaut) UN résumé Teams par collaborateur qui a des propositions nouvelles. Une routine qui échoue
// est notée au journal et JAMAIS relancée d'elle-même ; un tour est protégé contre le chevauchement. `envoyer` injectable pour les tests.

const { routineParId } = require('./catalogue');
const { lireReglagesRoutines } = require('./reglages');
const { lirePropositions, ecrirePropositions, ajouterProposition, expirer } = require('./propositions');
const { noterJournalRoutines } = require('./journal');
const { proposerExemples } = require('./essai');
const { libelleDossierAffiche } = require('../../../commun/dossier');
const { envoiConfigure } = require('../envoiEmail');
const { noterVerification } = require('../verificationsTerrain');

const CLE_ETAT_ROUTINES = 'routines-etat';
const INTERVALLE_PLANIFICATEUR_MS = 60 * 1000;
const MAX_TITRES_RESUME = 6;

/** @param {Date} date */
function infosParis(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  const jour = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1;
  return { iso: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, jour, ouvre: jour >= 1 && jour <= 5 };
}

/** « Julie VASSELIN » → « Julie ». @param {string} nom */
function prenomDe(nom) {
  const mots = String(nom || '').trim().split(/\s+/).filter(Boolean);
  const prenom = mots.filter((m) => m !== m.toUpperCase() || !/[A-ZÀ-Ý]/.test(m));
  return (prenom.length ? prenom : mots).join(' ');
}

/**
 * Le texte du résumé Teams d'un collaborateur : un message groupé, jamais une alerte par proposition.
 * @param {string} responsable @param {any[]} propositions ses propositions nouvelles @param {(id: string) => string} libelleDossier
 */
function texteResumeTeams(responsable, propositions, libelleDossier) {
  const n = propositions.length;
  const lignes = propositions.slice(0, MAX_TITRES_RESUME).map((p) => {
    const dossier = p.dossierId ? libelleDossier(p.dossierId) : '';
    return `• ${String(p.titre).replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim()}${dossier ? ` — ${dossier}` : ''}`;
  });
  const reste = n - lignes.length;
  return `📝 CLAIRE — Bonjour ${prenomDe(responsable)}, j’ai préparé ${n} chose${n > 1 ? 's' : ''} pour vous :\n${lignes.join('\n')}${reste > 0 ? `\n… et ${reste} autre${reste > 1 ? 's' : ''}` : ''}\n\nOuvrez CLAIRE (l’icône ✦ en haut de la barre) pour les autoriser ou les refuser. Rien ne part sans votre clic.`;
}

/**
 * @param {{ parametresRepo: any, depot?: any, envoyer?: (reglages: any, adresse: string, texte: string) => Promise<{ ok: boolean, erreur?: string | null }> }} deps
 */
function creerPlanificateur(deps) {
  const { parametresRepo, depot } = deps;
  const envoyer = deps.envoyer || ((r, a, t) => require('../envoiEmail').envoyerEmail(r, a, t));
  let enCours = false;

  const lireEtat = () => {
    const e = parametresRepo.lireJsonBrut(CLE_ETAT_ROUTINES, null);
    return { dernierResume: e && typeof e.dernierResume === 'string' ? e.dernierResume : '', derniersPassages: e && e.derniersPassages && typeof e.derniersPassages === 'object' ? e.derniersPassages : {} };
  };
  const libelleDossier = (id) => {
    try { const d = depot && depot.trouverParId ? depot.trouverParId(id) : null; return d ? libelleDossierAffiche(d) : ''; } catch (e) { return ''; }
  };

  /**
   * Lance une routine à la demande. Phase 0 : seule « essai » existe. Rend { ok, ajoutees, message }.
   * @param {string} routineId @param {{ responsable: string, maintenant?: Date }} options
   */
  function lancer(routineId, options) {
    const routine = routineParId(routineId);
    const maintenant = (options && options.maintenant) || new Date();
    if (!routine) return { ok: false, ajoutees: 0, message: 'Routine inconnue.' };
    if (!routine.disponible) return { ok: false, ajoutees: 0, message: `Cette routine n’est pas encore disponible (phase ${routine.phase}).` };
    const responsable = String((options && options.responsable) || '').trim();
    if (!responsable) return { ok: false, ajoutees: 0, message: 'Collaborateur non indiqué.' };
    if (routineId !== 'essai') return { ok: false, ajoutees: 0, message: 'Routine sans exécutant.' };
    let liste = lirePropositions(parametresRepo);
    let ajoutees = 0;
    for (const p of proposerExemples({ responsable, jour: infosParis(maintenant).iso })) {
      const r = ajouterProposition(liste, p, maintenant);
      liste = r.liste;
      if (r.ajoutee) ajoutees += 1;
    }
    ecrirePropositions(parametresRepo, liste);
    const message = ajoutees ? `${ajoutees} proposition${ajoutees > 1 ? 's' : ''} d’exemple déposée${ajoutees > 1 ? 's' : ''} dans la boîte de ${prenomDe(responsable)}.` : `Les exemples d’aujourd’hui sont déjà dans la boîte de ${prenomDe(responsable)}.`;
    noterJournalRoutines(parametresRepo, { routine: routineId, texte: message, resultat: ajoutees ? 'ok' : 'rien', niveau: 1 }, maintenant);
    return { ok: true, ajoutees, message };
  }

  /** Un tour : expiration, routines horaires dues, résumé Teams. @param {Date} [date] */
  async function tour(date) {
    if (enCours) return { saute: true };
    enCours = true;
    const maintenant = date || new Date();
    const bilan = { expirees: 0, resumes: 0 };
    try {
      const avant = lirePropositions(parametresRepo);
      const apres = expirer(avant, maintenant);
      if (apres !== avant) { bilan.expirees = apres.filter((p, i) => p.etat !== avant[i].etat).length; ecrirePropositions(parametresRepo, apres); }
      const reglages = lireReglagesRoutines(parametresRepo);
      const info = infosParis(maintenant);
      if (!reglages.actif || !info.ouvre) return bilan;
      // Routines horaires : aucune n'est disponible en phase 0 ; elles s'ajouteront ici (phase 1), chacune une fois par jour ouvré, notée
      // au journal et jamais relancée d'elle-même après un échec.
      // Résumé Teams de l'heure choisie : un message par collaborateur, une fois par jour ouvré.
      const etat = lireEtat();
      if (reglages.teams && info.hhmm >= reglages.heure && etat.dernierResume !== info.iso) {
        parametresRepo.ecrireJsonBrut(CLE_ETAT_ROUTINES, Object.assign({}, etat, { dernierResume: info.iso }));
        const reglagesMail = parametresRepo.lireReglages();
        const nouvelles = lirePropositions(parametresRepo).filter((p) => p.etat === 'proposee' && !p.resumeTeamsLe && !p.exemple && p.responsable);
        const parResponsable = new Map();
        for (const p of nouvelles) parResponsable.set(p.responsable, [...(parResponsable.get(p.responsable) || []), p]);
        if (parResponsable.size && !envoiConfigure(reglagesMail)) {
          noterJournalRoutines(parametresRepo, { routine: 'resume', texte: 'Résumé Teams non envoyé : l’envoi des rappels n’est pas configuré (Réglages › Rappels).', resultat: 'erreur' }, maintenant);
        } else {
          const marquees = new Set();
          for (const [responsable, liste] of parResponsable) {
            const adresse = (reglagesMail.emailsResponsables || {})[responsable];
            if (!adresse) {
              noterJournalRoutines(parametresRepo, { routine: 'resume', texte: `Résumé Teams non envoyé à ${prenomDe(responsable)} : aucune adresse dans Réglages › Rappels.`, resultat: 'erreur' }, maintenant);
              continue;
            }
            /** @type {any} */
            let r;
            try { r = await envoyer(reglagesMail, adresse, texteResumeTeams(responsable, liste, libelleDossier)); } catch (e) { r = { ok: false, erreur: e && e.message }; }
            if (r && r.ok && r.messageId) {
              try { require('../nettoyageGmail').mettreCopiesEnAttente(parametresRepo, reglagesMail, [r.messageId]); } catch (_) { /* la copie restera dans les envoyés */ }
            }
            noterVerification(parametresRepo, 'routines-resume-teams', r && r.ok ? { detail: 'résumé Teams envoyé' } : { ok: false, message: 'résumé Teams refusé' });
            if (r && r.ok) { bilan.resumes += 1; liste.forEach((p) => marquees.add(p.id)); } else {
              noterJournalRoutines(parametresRepo, { routine: 'resume', texte: `Résumé Teams non envoyé à ${prenomDe(responsable)} : ${String((r && r.erreur) || 'erreur').slice(0, 120)}`, resultat: 'erreur' }, maintenant);
            }
          }
          if (marquees.size) {
            ecrirePropositions(parametresRepo, lirePropositions(parametresRepo).map((p) => (marquees.has(p.id) ? Object.assign({}, p, { resumeTeamsLe: maintenant.toISOString() }) : p)));
            noterJournalRoutines(parametresRepo, { routine: 'resume', texte: `Résumé Teams envoyé à ${bilan.resumes} collaborateur${bilan.resumes > 1 ? 's' : ''} (${marquees.size} proposition${marquees.size > 1 ? 's' : ''}).`, resultat: 'ok' }, maintenant);
          }
        }
      }
      return bilan;
    } catch (e) {
      noterJournalRoutines(parametresRepo, { routine: 'planificateur', texte: `Tour interrompu : ${String(e && e.message).slice(0, 150)}`, resultat: 'erreur' }, maintenant);
      return bilan;
    } finally {
      enCours = false;
    }
  }

  /** @param {number} [intervalleMs] */
  function demarrer(intervalleMs) {
    const minuteur = setInterval(() => { tour().catch(() => {}); }, intervalleMs || INTERVALLE_PLANIFICATEUR_MS);
    if (minuteur && typeof minuteur.unref === 'function') minuteur.unref();
    return minuteur;
  }

  return { lancer, tour, demarrer, lireEtat };
}

module.exports = { CLE_ETAT_ROUTINES, infosParis, prenomDe, texteResumeTeams, creerPlanificateur };
