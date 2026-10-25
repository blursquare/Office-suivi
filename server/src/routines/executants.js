// @ts-check
'use strict';
// Les routines de CLAIRE qui se font PAR LE CODE (étude 25/10 : « il me faut toutes les phases pour demain » ; cadrage
// docs/spec-routines-claire.md, §5) : chaque routine lit les dossiers et rend les PROPOSITIONS à déposer — jamais un envoi, jamais une
// écriture dans un dossier. Fonctions pures : le planificateur les appelle, dépose ce qu'elles rendent (deposerProposition, dédoublonné
// par l'empreinte) et le journal dit ce qui a été fait. « Autoriser » exécute ensuite le geste habituel de CLAIRE sur le poste
// (client/112-routines.js) : la fenêtre d'email, l'outil prérempli, la tâche, le sondage de dates.
//
// Les règles métier viennent du code commun (commun/planning.js, succession.js, pieces.js) : aucune n'est réécrite ici.

const P = require('../../../commun/planning');
const S = require('../../../commun/succession');
const { estSuccession, libelleDossierAffiche } = require('../../../commun/dossier');
const { piecesRecuesEtManquantes } = require('../piecesChecklist');

// Constitution d'une vente : seulement les dossiers créés à compter du 24/10/2026 (étude 24/10 : « aucun rattrapage »).
const DATE_DEBUT_CONSTITUTION = '2026-10-24';
const JOURS_VEILLE_SIGNATURE = 2;
const JOURS_AUTORISATIONS_NOTORIETE = 2;
const JOURS_RELANCE_OFFRE = 15;
const JOURS_ENTRE_RELANCES_OFFRE = 10;
const JOURS_PIECES_AVANT_RDV = 21;

/** @param {string} a AAAA-MM-JJ @param {string} b AAAA-MM-JJ @returns {number} b − a en jours */
function joursEntre(a, b) {
  const ta = Date.parse(String(a).slice(0, 10) + 'T12:00:00Z');
  const tb = Date.parse(String(b).slice(0, 10) + 'T12:00:00Z');
  return Number.isFinite(ta) && Number.isFinite(tb) ? Math.round((tb - ta) / 86400000) : NaN;
}

/** La semaine ISO d'un jour (« 2026-W44 »). @param {string} iso */
function semaineIso(iso) {
  const t = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  const jour = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - jour + 3);
  const premier = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const n = 1 + Math.round(((t.getTime() - premier.getTime()) / 86400000 - 3 + ((premier.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(n).padStart(2, '0')}`;
}

/** « 2026-10-28 » → « 28/10/2026 ». @param {string} iso */
function dateFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

const estIso = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v || ''));
const notreOffice = (nom) => /gossart/i.test(String(nom || ''));

/** Un autre office représente l'acquéreur (participation, en concours) ? @param {any} d */
function confrereAcquereur(d) {
  return !!(d && d.notaireAcquereur && !notreOffice(d.notaireAcquereur));
}
/** Un autre office représente le vendeur ? @param {any} d */
function confrereVendeur(d) {
  return !!(d && d.notaireVendeur && !notreOffice(d.notaireVendeur));
}

/** L'acte est-il signé (Authentic, ou signature cochée) ? Une succession : tous ses actes. @param {any} d */
function acteSigne(d) {
  if (!d) return false;
  if (estSuccession(d)) { try { return !!S.actesSignesSuccession(d).complet; } catch (e) { return false; } }
  if (d.authentic && d.authentic.acte && d.authentic.acte.etat === 'signe') return true;
  return !!(d.echeancesValidees && d.echeancesValidees.rendezVousSignature && d.rendezVousSignature);
}

/** Date de création du dossier (entrée « Dossier créé » de l'historique), AAAA-MM-JJ, sinon ''. @param {any} d */
function dateCreationDossier(d) {
  const h = (Array.isArray(d && d.historique) ? d.historique : []).find((x) => x && x.texte === 'Dossier créé' && x.date);
  const t = h ? Date.parse(h.date) : NaN;
  // Jour de Paris (un dossier créé à 0 h 30 le 24/10 est du 24/10, pas du 23/10 en UTC).
  return Number.isFinite(t) ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(t)) : '';
}

/** Le dossier peut-il recevoir une proposition ? Ni archivé, ni signé, avec un responsable. @param {any} d */
function dossierOuvert(d) {
  return !!(d && d.id && !d.archive && d.responsable && !acteSigne(d));
}

/**
 * La base commune d'une proposition : routine, responsable, dossier, niveau d'autonomie du geste (dit au poste : niveau 2 = CLAIRE envoie
 * après « Autoriser »).
 * @param {string} routine @param {any} d @param {{ niveau?: (routine: string, geste: string) => number }} ctx @param {string} geste
 */
function base(routine, d, ctx, geste) {
  const niveau = ctx && ctx.niveau ? ctx.niveau(routine, geste) : 1;
  return { routine, responsable: d.responsable, dossierId: d.id, geste, niveau };
}

/** L'identifiant d'une proposition, tiré de son empreinte (60 caractères au plus). @param {string} empreinte */
function idDepuisEmpreinte(empreinte) {
  const crypto = require('node:crypto');
  return 'rt-' + crypto.createHash('sha1').update(empreinte).digest('hex').slice(0, 24);
}

/** @param {any} b @param {any} reste */
function proposition(b, reste) {
  const p = Object.assign({}, b, reste);
  p.id = idDepuisEmpreinte(p.empreinte);
  p.details = Object.assign({}, p.details || {}, { niveau: b.niveau, geste: b.geste });
  delete p.niveau; delete p.geste;
  return p;
}

// ---- R1 — Revue du matin ----

/**
 * Ce qui bloque chaque dossier, chaque jour ouvré : la relance de l'offre de prêt (le modèle de l'étude, mot pour mot, construit par le
 * poste), les échéances dépassées, les pièces qui manquent à trois semaines de la signature.
 * @param {any[]} dossiers @param {string} aujourdhui @param {any} [ctx]
 */
function revueDuMatin(dossiers, aujourdhui, ctx) {
  const sortie = [];
  for (const d of dossiers || []) {
    if (!dossierOuvert(d) || estSuccession(d)) continue;
    const libelle = libelleDossierAffiche(d);
    // Offre de prêt attendue, à moins de 15 jours de sa date (ou dépassée), pas relancée depuis 10 jours.
    if (!d.sansPret && estIso(d.pret) && !P.echeanceValidee(d, 'pret')) {
      const restants = joursEntre(aujourdhui, d.pret);
      const derniere = estIso(d.derniereRelanceAuto) ? String(d.derniereRelanceAuto).slice(0, 10) : '';
      if (restants <= JOURS_RELANCE_OFFRE && (!derniere || joursEntre(derniere, aujourdhui) >= JOURS_ENTRE_RELANCES_OFFRE)) {
        sortie.push(proposition(base('revue-matin', d, ctx, 'relance'), {
          // La semaine dans l'empreinte : une relance acceptée mais annulée dans la fenêtre d'email revient la semaine suivante.
          type: 'email', action: 'email', empreinte: `revue:pret:${d.id}:${derniere || 'jamais'}:${semaineIso(aujourdhui)}`,
          titre: `Relancer l’offre de prêt — ${libelle}`,
          resume: restants < 0 ? `La date d’obtention du prêt est dépassée depuis ${-restants} jour${-restants > 1 ? 's' : ''} et l’offre n’est pas reçue.` : `L’offre de prêt est attendue le ${dateFr(d.pret)} (dans ${restants} jour${restants > 1 ? 's' : ''}).`,
          details: { modele: 'pret' }
        }));
      }
    }
    // Échéances dépassées (vente préalable, prêt, date butoir sans rendez-vous, échéances ajoutées), une proposition par échéance.
    for (const e of P.echeancesPlanning(d)) {
      if (!e || !estIso(e.iso) || !['ventebien', 'pret', 'autre', 'safer', 'dia', 'fixerRdv'].includes(e.type)) continue;
      const retard = joursEntre(e.iso, aujourdhui);
      if (!(retard >= 1)) continue;
      if (e.type === 'pret') continue; // la relance de l'offre (ci-dessus) le dit déjà
      sortie.push(proposition(base('revue-matin', d, ctx, 'tache'), {
        type: 'tache', action: 'tache', empreinte: `revue:depasse:${d.id}:${e.type}:${e.index == null ? '' : e.index}:${String(e.iso).slice(0, 10)}`,
        titre: e.type === 'fixerRdv' ? `Date butoir dépassée sans rendez-vous — ${libelle}` : `${e.label} dépassée — ${libelle}`,
        resume: `Échéance du ${dateFr(e.iso)} dépassée depuis ${retard} jour${retard > 1 ? 's' : ''} : à faire le point.`,
        details: { libelle: `Faire le point : ${e.label} (échéance du ${dateFr(e.iso)})` }
      }));
    }
    // Rendez-vous de signature dans les trois semaines, pièces encore manquantes.
    if (estIso(d.rendezVousSignature)) {
      const avant = joursEntre(aujourdhui, d.rendezVousSignature);
      const { manquantes } = piecesRecuesEtManquantes(d);
      if (avant >= 0 && avant <= JOURS_PIECES_AVANT_RDV && manquantes.length) {
        sortie.push(proposition(base('revue-matin', d, ctx, 'tache'), {
          type: 'tache', action: 'tache', empreinte: `revue:pieces:${d.id}:${String(d.rendezVousSignature).slice(0, 10)}`,
          titre: `${manquantes.length} pièce${manquantes.length > 1 ? 's' : ''} manquante${manquantes.length > 1 ? 's' : ''} avant la signature — ${libelle}`,
          resume: `Signature le ${dateFr(d.rendezVousSignature)} : ${manquantes.slice(0, 4).join(', ')}${manquantes.length > 4 ? '…' : ''}.`,
          details: { libelle: `Réclamer les pièces manquantes avant la signature du ${dateFr(d.rendezVousSignature)}` }
        }));
      }
    }
  }
  return sortie;
}

// ---- R4 — Veille de signature ----

/** 48 h avant le rendez-vous de signature d'une vente : la fiche de signature, à préparer et contrôler. @param {any[]} dossiers @param {string} aujourdhui @param {any} [ctx] */
function veilleSignature(dossiers, aujourdhui, ctx) {
  const sortie = [];
  for (const d of dossiers || []) {
    if (!dossierOuvert(d) || estSuccession(d) || !estIso(d.rendezVousSignature)) continue;
    const avant = joursEntre(aujourdhui, d.rendezVousSignature);
    if (!(avant >= 0 && avant <= JOURS_VEILLE_SIGNATURE)) continue;
    const quand = avant === 0 ? 'aujourd’hui' : avant === 1 ? 'demain' : `le ${dateFr(d.rendezVousSignature)}`;
    sortie.push(proposition(base('veille-signature', d, ctx, 'fiche'), {
      type: 'document', action: 'outil', empreinte: `veille:${d.id}:${String(d.rendezVousSignature).slice(0, 10)}`,
      titre: `Fiche de signature — ${libelleDossierAffiche(d)}`,
      resume: `Signature ${quand}${d.rendezVousSignatureHeure ? ' à ' + String(d.rendezVousSignatureHeure).replace(':', ' h ') : ''} : la fiche de signature est prête à contrôler et à imprimer.`,
      details: { outil: 'fiche-signature' }
    }));
  }
  return sortie;
}

// ---- R2 — Constitution de dossier ----

/**
 * À la création : une vente où l'étude est notaire du vendeur au sens large (nous représentons le vendeur OU nous recevons l'acte),
 * créée à compter du 24/10/2026 ; une succession, juste après sa création. Une seule fois par dossier (empreinte).
 * @param {any[]} dossiers @param {string} aujourdhui @param {any} [ctx]
 */
function constitutionDossier(dossiers, aujourdhui, ctx) {
  const sortie = [];
  for (const d of dossiers || []) {
    if (!dossierOuvert(d)) continue;
    const cree = dateCreationDossier(d);
    if (!cree || cree < DATE_DEBUT_CONSTITUTION || joursEntre(cree, aujourdhui) > 30) continue;
    const succession = estSuccession(d);
    if (!succession && confrereVendeur(d) && d.roleNotaire === 'participant') continue;
    sortie.push(proposition(base('constitution', d, ctx, 'courriers'), {
      type: 'document', action: 'outil', empreinte: `constitution:${d.id}`,
      titre: `Constitution du dossier — ${libelleDossierAffiche(d)}`,
      resume: succession ? 'Les courriers d’interrogation de la succession sont prêts à relire, puis à envoyer ou à enregistrer dans « Constitution ».'
        : 'Les courriers de la constitution (mairie, urbanisme, assainissement) et le plan cadastral sont prêts à relire.',
      details: { outil: 'constitution' }
    }));
  }
  return sortie;
}

// ---- R3 — Appel de fonds ----

/**
 * Le jour de l'échéance de l'appel de fonds (10 jours avant le rendez-vous), quand NOUS représentons l'acquéreur : le courrier et le
 * décompte préremplis (pièces du NAS ou décompte du confrère), l'email en brouillon.
 * @param {any[]} dossiers @param {string} aujourdhui @param {any} [ctx]
 */
function appelDeFonds(dossiers, aujourdhui, ctx) {
  const sortie = [];
  for (const d of dossiers || []) {
    if (!dossierOuvert(d) || estSuccession(d) || confrereAcquereur(d) || !estIso(d.rendezVousSignature)) continue;
    if (P.echeanceValidee(d, 'appelFonds')) continue;
    const echeance = P.echeanceAppelFonds(d);
    if (!estIso(echeance) || aujourdhui < String(echeance).slice(0, 10) || aujourdhui > String(d.rendezVousSignature).slice(0, 10)) continue;
    sortie.push(proposition(base('appel-fonds', d, ctx, 'courrier'), {
      type: 'document', action: 'outil', empreinte: `appel-fonds:${d.id}:${String(d.rendezVousSignature).slice(0, 10)}`,
      titre: `Appel de fonds à envoyer — ${libelleDossierAffiche(d)}`,
      resume: `Signature le ${dateFr(d.rendezVousSignature)} : le courrier et le décompte sont préremplis d’après le dossier et les pièces du NAS ; ce qui manque est dit dans l’outil.`,
      details: { outil: 'appel-fonds' }
    }));
  }
  return sortie;
}

// ---- R5 — Autorisations de fonds avant une notoriété ----

/** 48 h avant le rendez-vous d'un acte de notoriété : les autorisations de déblocage ou de transfert, d'après les fiches d'Authentic. @param {any[]} dossiers @param {string} aujourdhui @param {any} [ctx] */
function autorisationsNotoriete(dossiers, aujourdhui, ctx) {
  const sortie = [];
  for (const d of dossiers || []) {
    if (!d || !d.id || d.archive || !d.responsable || !estSuccession(d)) continue;
    let rdvs = [];
    try { rdvs = S.rendezVousSuccession(d); } catch (e) { rdvs = []; }
    for (const r of rdvs) {
      if (!r || r.etape !== 'notoriete' || r.annule || !estIso(r.date)) continue;
      const avant = joursEntre(aujourdhui, r.date);
      if (!(avant >= 0 && avant <= JOURS_AUTORISATIONS_NOTORIETE)) continue;
      sortie.push(proposition(base('autorisations-notoriete', d, ctx, 'pdf'), {
        type: 'document', action: 'outil', empreinte: `autorisations:${d.id}:${r.date}`,
        titre: `Autorisations de fonds — ${libelleDossierAffiche(d)}`,
        resume: `Notoriété le ${dateFr(r.date)} : les autorisations de déblocage ou de transfert des comptes sont prêtes à relire.`,
        details: { outil: 'autorisations' }
      }));
    }
  }
  return sortie;
}

// ---- R7 — Proposition de dates ----

/**
 * Un dossier de vente complet (pièces reçues, prêt et vente préalable levés, préemption et SAFER purgées) sans rendez-vous et sans sondage
 * ouvert : proposer des dates aux clients (et au confrère) — le sondage de CLAIRE, ses créneaux et ses règles (jamais à 9 h, ni entre 12 h
 * et 14 h, ni après 18 h). Pas en participation : c'est le confrère qui reçoit l'acte qui fixe la date.
 * @param {any[]} dossiers @param {string} aujourdhui @param {any} [ctx] `ctx.sondagesOuverts` : identifiants des dossiers qui ont un sondage ouvert
 */
function propositionDates(dossiers, aujourdhui, ctx) {
  const ouverts = (ctx && ctx.sondagesOuverts) || new Set();
  const sortie = [];
  for (const d of dossiers || []) {
    if (!dossierOuvert(d) || estSuccession(d) || d.rendezVousSignature || d.roleNotaire === 'participant' || ouverts.has(d.id)) continue;
    if (!P.pretLeve(d) || !P.preemptionLevee(d) || !P.saferLevee(d) || (estIso(d.ventebien) && !P.echeanceValidee(d, 'ventebien'))) continue;
    if (piecesRecuesEtManquantes(d).manquantes.length) continue;
    sortie.push(proposition(base('proposition-dates', d, ctx, 'email'), {
      type: 'dates', action: 'dates', empreinte: `dates:${d.id}`,
      titre: `Proposer des dates de signature — ${libelleDossierAffiche(d)}`,
      resume: 'Le dossier est complet et sans rendez-vous : CLAIRE a préparé des créneaux dans les règles de l’étude, à envoyer aux clients.',
      details: {}
    }));
  }
  return sortie;
}

module.exports = {
  DATE_DEBUT_CONSTITUTION, JOURS_VEILLE_SIGNATURE, joursEntre, semaineIso, dateFr, confrereAcquereur, confrereVendeur, acteSigne, dateCreationDossier,
  dossierOuvert, idDepuisEmpreinte, revueDuMatin, veilleSignature, constitutionDossier, appelDeFonds, autorisationsNotoriete, propositionDates
};
