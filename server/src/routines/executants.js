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
const JOURS_REFLEXION_PRET = 11;
const JOURS_DOSSIER_BLOQUE = 21;
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
    // Jamais en participation : l'acte est reçu par le confrère (étude 28/10).
    if (!dossierOuvert(d) || estSuccession(d) || d.roleNotaire === 'participant' || !estIso(d.rendezVousSignature)) continue;
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
    // Constitution déjà faite (enregistrée ou imprimée depuis l'outil, étude 27/10) : rien à proposer.
    if (!dossierOuvert(d) || d.constitutionFaiteLe) continue;
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
    // Notoriété seule : aucune autorisation de déblocage ni de transfert (étude 26/10).
    if (!S.autorisationsFondsSuccession(d)) continue;
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

// ---- Demandes Comedec et CJN dans Authentic (étude 27/10) ----

/** Jours avant la signature où la demande de casier est proposée. */
const JOURS_CJN_AVANT_SIGNATURE = 30;
/** L'état civil n'est proposé que pour les dossiers créés depuis la mise en service (pas une vague de cartes sur les dossiers en cours). */
const DATE_DEBUT_COMEDEC_AUTHENTIC = '2026-10-27';

/**
 * Pour un dossier de vente relié à Authentic (référence retenue), la connexion de CLAIRE allumée ET « Préparer des demandes » allumé
 * (`ctx.authenticActif`, plan du 27/10 : lecture seule par défaut) : la demande
 * d'état civil (Comedec) une fois par dossier, tant que l'acte n'est pas signé et qu'aucun état civil n'est relevé dans Authentic ; la
 * demande de casier (CJN) quand l'étude reçoit l'acte, qu'un acquéreur est une personne physique et que la signature est dans 30 jours.
 * Le poste fait la demande après « Autoriser » (client/131), Création rapide, sans envoi.
 * @param {any[]} dossiers @param {string} aujourdhui @param {any} [ctx]
 */
function formalitesAuthentic(dossiers, aujourdhui, ctx) {
  const sortie = [];
  if (!ctx || !ctx.authenticActif) return sortie;
  for (const d of dossiers || []) {
    if (!dossierOuvert(d) || estSuccession(d) || !String(d.referenceAuthentic || '').trim()) continue;
    const parties = Array.isArray(d.parties) ? d.parties : [];
    const representees = parties.filter((p) => p && ((p.role === 'VENDEUR' && !confrereVendeur(d)) || (p.role === 'ACQUEREUR' && !confrereAcquereur(d))) && p.qualitePersonne !== 'morale');
    const etatsCivils = d.authentic && Array.isArray(d.authentic.etatsCivils) ? d.authentic.etatsCivils : [];
    const cree = dateCreationDossier(d);
    // Jamais en participation (étude 30/10 : « ne pas demander pour les actes où nous sommes en participation ») : le confrère qui reçoit l'acte
    // fait les demandes d'état civil.
    if (d.roleNotaire !== 'participant' && representees.length && !etatsCivils.length && cree && cree >= DATE_DEBUT_COMEDEC_AUTHENTIC) {
      sortie.push(proposition(base('formalites-authentic', d, ctx, 'comedec'), {
        type: 'tache', action: 'authentic', empreinte: `authentic-comedec:${d.id}`,
        titre: `Demande d’état civil (Comedec) à préparer — ${libelleDossierAffiche(d)}`,
        resume: `Naissance de ${representees.length} partie${representees.length > 1 ? 's' : ''}, mariage des mariés. « Autoriser » : CLAIRE la crée dans Authentic sans l’envoyer.`,
        details: { formalite: 'comedec' }
      }));
    }
    const rdv = estIso(d.rendezVousSignature) ? String(d.rendezVousSignature).slice(0, 10) : '';
    const acquereurs = parties.filter((p) => p && p.role === 'ACQUEREUR' && p.qualitePersonne !== 'morale');
    if (rdv && d.roleNotaire !== 'participant' && acquereurs.length && rdv >= aujourdhui && joursEntre(aujourdhui, rdv) <= JOURS_CJN_AVANT_SIGNATURE) {
      sortie.push(proposition(base('formalites-authentic', d, ctx, 'cjn'), {
        type: 'tache', action: 'authentic', empreinte: `authentic-cjn:${d.id}`,
        titre: `Demande de casier judiciaire (CJN) à préparer — ${libelleDossierAffiche(d)}`,
        resume: `Signature le ${dateFr(rdv)} : casier des acquéreurs. « Autoriser » : CLAIRE la crée dans Authentic sans l’envoyer (la base des références immobilières doit être alimentée).`,
        details: { formalite: 'cjn' }
      }));
    }
  }
  return sortie;
}

/**
 * Pure : les propositions Comedec encore à décider d'un dossier passé en participation, mises « expirées » (jamais refaites). Rend la liste
 * d'origine si rien ne change. @param {any[]} liste @param {any[]} dossiers
 */
function expirerComedecParticipation(liste, dossiers) {
  const participants = new Set((dossiers || []).filter((d) => d && d.roleNotaire === 'participant').map((d) => d.id));
  if (!participants.size) return liste;
  let change = false;
  const nouvelle = (liste || []).map((p) => {
    if (p && (p.etat === 'proposee' || p.etat === 'vue') && /^authentic-comedec:/.test(String(p.empreinte || '')) && participants.has(p.dossierId)) { change = true; return Object.assign({}, p, { etat: 'expiree', motifExpiration: 'participation' }); }
    return p;
  });
  return change ? nouvelle : liste;
}

// ---- Étape 4 du vrai agent (étude 29/10 : « c'est comme quand Julie ou Jérémy voient quelque chose dans leur dossier que je ne vois pas ») ----

// Validité des diagnostics pour une vente (durées légales courantes, à vérifier par le collaborateur) : le type est lu dans le résumé du
// document de l'index du NAS (indexNas.js), la date dans ce même résumé. Jamais deviné : un diagnostic sans date lue n'est pas jugé.
const VALIDITE_DIAGNOSTICS = [
  { re: /(etat des risques|\berp\b|errial|esris)/, mois: 6, nom: 'État des risques (ERP)' },
  { re: /termite/, mois: 6, nom: 'Diagnostic termites' },
  { re: /electric/, mois: 36, nom: 'Diagnostic électricité' },
  { re: /\bgaz\b/, mois: 36, nom: 'Diagnostic gaz' },
  { re: /(non collectif|spanc)/, mois: 36, nom: 'Contrôle de l’assainissement non collectif' },
  { re: /(\bdpe\b|performance energetique)/, mois: 120, nom: 'DPE' }
];
const sansAccents = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Pure : la date ISO `iso` + `mois` mois. @param {string} iso @param {number} mois */
function plusMois(iso, mois) {
  const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
  const dernierJour = new Date(Date.UTC(a, m - 1 + mois + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(a, m - 1 + mois, Math.min(j, dernierJour)));
  return d.toISOString().slice(0, 10);
}

/** Pure : fin de validité d'un DPE (décret 2020-1610 : établi de 2013 à 2017 → 31/12/2022, du 01/01/2018 au 30/06/2021 → 31/12/2024, sinon 10 ans). @param {string} date */
function finValiditeDpe(date) {
  if (date < '2018-01-01') return '2022-12-31';
  if (date < '2021-07-01') return '2024-12-31';
  return plusMois(date, 120);
}

// Seul le TYPE du document dit un diagnostic (jamais le résumé, qui cite souvent les annexes d'un compromis), et jamais un compromis, une
// facture, un acte ou un courrier.
const RE_TYPE_DIAGNOSTIC = /(diagnostic|constat|etat|dpe|erp|rapport|controle|spanc)/;
const RE_TYPE_PAS_DIAGNOSTIC = /(compromis|promesse|facture|acte|courrier|avant-contrat)/;

/**
 * Pure : les diagnostics qui ne seront plus valables le jour de la signature, d'après les documents lus du dossier
 * ({ type, date, resume } de l'index du NAS). Le plus récent de chaque sorte compte. @param {any[]} documents @param {string} signature
 */
function diagnosticsPerimes(documents, signature) {
  const sortie = [];
  for (const v of VALIDITE_DIAGNOSTICS) {
    const dates = (documents || []).filter((x) => {
      if (!x || !estIso(x.date)) return false;
      const t = sansAccents(x.type);
      return RE_TYPE_DIAGNOSTIC.test(t) && !RE_TYPE_PAS_DIAGNOSTIC.test(t) && v.re.test(t);
    }).map((x) => String(x.date).slice(0, 10)).sort();
    if (!dates.length) continue;
    const derniere = dates[dates.length - 1];
    const fin = v.nom === 'DPE' ? finValiditeDpe(derniere) : plusMois(derniere, v.mois);
    if (fin < String(signature).slice(0, 10)) sortie.push({ nom: v.nom, date: dates[dates.length - 1], fin });
  }
  return sortie;
}

/**
 * Pure : ce qui ne tient pas avec la date de signature d'une vente — offre de prêt attendue trop tard (11 jours de réflexion), vente préalable,
 * réponse à la DIA ou délai SAFER après la signature, pièces manquantes, diagnostics périmés le jour J. @param {any} d @param {any[]} [documents] @param {string} [aujourdhui]
 */
function incoherencesSignature(d, documents, aujourdhui) {
  const rdv = String(d.rendezVousSignature || '').slice(0, 10);
  const pb = [];
  if (!estIso(rdv)) return pb;
  if (!d.sansPret && estIso(d.pret) && !P.echeanceValidee(d, 'pret') && joursEntre(String(d.pret).slice(0, 10), rdv) < JOURS_REFLEXION_PRET) {
    pb.push({ cle: 'pret', texte: `l’offre de prêt est attendue jusqu’au ${dateFr(d.pret)} : le délai de réflexion de 10 jours (acceptation au 11e) pourrait ne pas être écoulé à la signature, à vérifier` });
  }
  for (const e of P.echeancesPlanning(d)) {
    if (!e || !estIso(e.iso) || !['ventebien', 'dia', 'safer'].includes(e.type) || P.echeanceValidee(d, e.type)) continue;
    if (String(e.iso).slice(0, 10) > rdv) pb.push({ cle: e.type, texte: `${e.label} au ${dateFr(e.iso)}, après la signature` });
  }
  const { manquantes } = piecesRecuesEtManquantes(d);
  if (manquantes.length && (!aujourdhui || joursEntre(aujourdhui, rdv) <= JOURS_PIECES_AVANT_RDV)) pb.push({ cle: 'pieces', texte: `${manquantes.length} pièce${manquantes.length > 1 ? 's' : ''} encore manquante${manquantes.length > 1 ? 's' : ''} (${manquantes.slice(0, 3).join(', ')}${manquantes.length > 3 ? '…' : ''})` });
  for (const x of diagnosticsPerimes(documents, rdv)) pb.push({ cle: 'diag:' + x.nom, texte: `${x.nom} du ${dateFr(x.date)} : sans doute plus valable après le ${dateFr(x.fin)}, à vérifier` });
  return pb;
}

/**
 * Contrôle du rendez-vous : dès qu'une signature est placée ou déplacée (date de la fiche), ce qui ne tient pas avec cette date — une alerte
 * dans le canal du dossier, une seule par date et par liste de problèmes. @param {any[]} dossiers @param {string} aujourdhui @param {any} [ctx]
 */
function controleRendezVous(dossiers, aujourdhui, ctx) {
  const sortie = [];
  for (const d of dossiers || []) {
    if (!dossierOuvert(d) || estSuccession(d) || d.roleNotaire === 'participant' || !estIso(d.rendezVousSignature)) continue;
    const rdv = String(d.rendezVousSignature).slice(0, 10);
    if (joursEntre(aujourdhui, rdv) < 0) continue;
    const docs = ctx && typeof ctx.documentsDossier === 'function' ? ctx.documentsDossier(d.id) : [];
    const pb = incoherencesSignature(d, docs, aujourdhui);
    if (!pb.length) continue;
    sortie.push(proposition(base('controle-rendez-vous', d, ctx, 'alerte'), {
      type: 'alerte', action: 'vu', empreinte: `rdvctl:${d.id}:${rdv}:${pb.map((x) => x.cle).sort().join(',')}`,
      titre: `Signature du ${dateFr(rdv)} : ${pb.length} point${pb.length > 1 ? 's' : ''} à vérifier — ${libelleDossierAffiche(d)}`,
      resume: pb.map((x) => x.texte).join(' ; ') + '.'
    }));
  }
  return sortie;
}

/** Pure : la date (AAAA-MM-JJ) de la dernière activité d'un dossier (historique, pièces trouvées), '' sinon. @param {any} d */
function derniereActiviteDossier(d) {
  const dates = (Array.isArray(d.historique) ? d.historique : []).map((h) => String(h && h.date || '').slice(0, 10)).filter(estIso);
  if (d.piecesTrouveesLe && typeof d.piecesTrouveesLe === 'object') for (const v of Object.values(d.piecesTrouveesLe)) if (estIso(v)) dates.push(String(v).slice(0, 10));
  return dates.sort().pop() || '';
}

/**
 * Dossier qui n'avance plus : rien de neuf depuis trois semaines (historique, pièces), ni signé ni archivé — une alerte au responsable dans
 * le canal du dossier, avec ce qui le retient ; une seule par période d'immobilité. @param {any[]} dossiers @param {string} aujourdhui @param {any} [ctx]
 */
const ATTENTES_EXTERIEURES = ['pret', 'ventebien', 'dia', 'safer'];

function dossiersBloques(dossiers, aujourdhui, ctx) {
  const sortie = [];
  for (const d of dossiers || []) {
    if (!dossierOuvert(d) || estSuccession(d) || estIso(d.rendezVousSignature)) continue;
    // Une réponse EXTÉRIEURE attendue à une date à venir (offre de prêt, vente préalable, DIA, SAFER) : l'attente est normale. Jamais les
    // étapes de l'étude (fixer le rendez-vous, rédaction…), datées presque toujours dans le futur (relecture 0.403.1).
    if (P.echeancesPlanning(d).some((e) => e && ATTENTES_EXTERIEURES.includes(e.type) && !P.echeanceValidee(d, e.type) && estIso(e.iso) && joursEntre(aujourdhui, e.iso) >= 0)) continue;
    const derniere = derniereActiviteDossier(d);
    if (!derniere || joursEntre(derniere, aujourdhui) < JOURS_DOSSIER_BLOQUE) continue;
    const attente = P.echeancesPlanning(d).filter((e) => e && !P.echeanceValidee(d, e.type)).slice(0, 2).map((e) => `${e.label}${estIso(e.iso) ? ' (' + dateFr(e.iso) + ')' : ''}`);
    const { manquantes } = estSuccession(d) ? { manquantes: [] } : piecesRecuesEtManquantes(d);
    const jours = joursEntre(derniere, aujourdhui);
    sortie.push(proposition(base('dossiers-bloques', d, ctx, 'alerte'), {
      type: 'alerte', action: 'vu', empreinte: `bloque:${d.id}:${derniere}`,
      titre: `Rien de neuf depuis ${jours} jours — ${libelleDossierAffiche(d)}`,
      resume: `Dernière activité le ${dateFr(derniere)}.${attente.length ? ' En attente : ' + attente.join(', ') + '.' : ''}${manquantes.length ? ` ${manquantes.length} pièce${manquantes.length > 1 ? 's' : ''} manquante${manquantes.length > 1 ? 's' : ''}.` : ''} Une relance ?`
    }));
  }
  return sortie;
}

// ---- Étape 5 du vrai agent : le travail du formaliste (étude 29/10 : « récupérer les pièces automatiquement, relancer les organismes qui
// n'ont pas répondu ») — une demande envoyée par Authentic (urbanisme, non-péril, DIA) dont la pièce n'est pas revenue après son délai :
// une tâche de relance au responsable (jamais d'envoi), une par demande et par quinzaine.
const DELAIS_RELANCE_FORMALITES = { renonciationPreemption: 45, defaut: 15 };

/** @param {any[]} dossiers @param {string} aujourdhui @param {any} [ctx] */
function relancesFormalites(dossiers, aujourdhui, ctx) {
  const sortie = [];
  for (const d of dossiers || []) {
    if (!dossierOuvert(d) || estSuccession(d) || d.roleNotaire === 'participant') continue;
    const demandes = d.authentic && d.authentic.demandes && typeof d.authentic.demandes === 'object' ? d.authentic.demandes : {};
    for (const [cle, dem] of Object.entries(demandes)) {
      if (!dem || !estIso(dem.date)) continue;
      if ((d.pieces || {})[cle] === 'recue' || (Array.isArray(d.piecesRetirees) && d.piecesRetirees.includes(cle))) continue;
      if (cle === 'renonciationPreemption' && P.preemptionLevee(d)) continue;
      const ecoule = joursEntre(String(dem.date).slice(0, 10), aujourdhui);
      const delai = DELAIS_RELANCE_FORMALITES[cle] || DELAIS_RELANCE_FORMALITES.defaut;
      if (ecoule < delai) continue;
      const quinzaine = Math.floor((ecoule - delai) / 15);
      const quoi = String(dem.titre || (cle === 'renonciationPreemption' ? 'DIA' : cle)).slice(0, 80);
      sortie.push(proposition(base('relances-formalites', d, ctx, 'tache'), {
        type: 'tache', action: 'tache', empreinte: `formalite:${d.id}:${cle}:${String(dem.date).slice(0, 10)}:${quinzaine}`,
        titre: `Relancer : ${quoi} — ${libelleDossierAffiche(d)}`,
        resume: `Demande envoyée le ${dateFr(dem.date)} (il y a ${ecoule} jours), réponse pas encore reçue.`,
        details: { libelle: `Relancer pour « ${quoi} » (demandé le ${dateFr(dem.date)})` }
      }));
    }
  }
  return sortie;
}

// ---- Étape 4 : un email reçu dans un dossier donne une proposition dans le canal du dossier (étude 29/10 : « l'agence a envoyé l'offre de
// prêt, voulez-vous que je l'enregistre sur le NAS et que je prépare un mail au confrère ou au client ? » — « moi je n'ai peut-être pas pensé à
// ce qu'il faut faire, mais lui est proactif et me propose »). Sans IA : ce que l'email porte (sujet reconnu dans l'objet et le début du texte,
// pièces jointes) décide des suites proposées ; l'agent fait le reste quand on lui répond. Seulement les emails d'une adresse de fiche,
// reçus depuis 48 h, sans réponse de l'étude à cet expéditeur depuis.
const SUITES_SUJETS_EMAIL = {
  offre: 'enregistrer l’offre sur le NAS, la marquer reçue, calculer les quotités et préparer l’appel de fonds',
  fonds: 'vérifier l’arrivée des fonds (comptabilité d’Authentic) et confirmer la réception au client',
  rib: 'ranger le RIB dans le dossier et le cocher',
  rdv: 'regarder l’agenda et proposer ou confirmer la date',
  projet: 'relire le projet et répondre au confrère',
  pieces: 'ranger les pièces jointes et cocher celles de la checklist',
  urgent: 'répondre en priorité'
};

/** @param {any[]} dossiers @param {string} aujourdhui @param {any} [ctx] */
function emailsRecusDossiers(dossiers, aujourdhui, ctx) {
  const sortie = [];
  const emails = ctx && typeof ctx.emailsDossiers === 'function' ? ctx.emailsDossiers() : [];
  if (!emails.length) return sortie;
  const parId = new Map((dossiers || []).map((d) => [d.id, d]));
  for (const e of emails) {
    if (!e || e.sens !== 'recu' || !e.dossierId || !estIso(e.date)) continue;
    if (joursEntre(String(e.date).slice(0, 10), aujourdhui) > 2) continue;
    const d = parId.get(e.dossierId);
    if (!d || !dossierOuvert(d)) continue;
    const adr = String(e.de && e.de.adresse || '').toLowerCase();
    const repondu = emails.some((x) => x && x.sens === 'envoye' && x.date > e.date && (x.a || []).includes(adr));
    if (repondu) continue;
    // Les sujets sont gardés par leur libellé (emailsDossiers.js, SUJETS_EMAIL) : « Offre de prêt », « Fonds », « RIB », « Rendez-vous »…
    const sujets = (Array.isArray(e.sujets) ? e.sujets : []).map((x) => sansAccents(x));
    const cles = Object.keys(SUITES_SUJETS_EMAIL).filter((k) => sujets.some((x) => x === k || x.startsWith(/** @type {any} */ ({ offre: 'offre', fonds: 'fonds', rib: 'rib', rdv: 'rendez', projet: 'projet', pieces: 'piece', urgent: 'urgent' })[k])));
    const pj = Array.isArray(e.pj) ? e.pj.length : 0;
    if (!cles.length && !pj) continue;
    const suites = cles.map((k) => /** @type {any} */ (SUITES_SUJETS_EMAIL)[k]);
    if (!cles.length && pj) suites.push(SUITES_SUJETS_EMAIL.pieces);
    sortie.push(proposition(base('emails-recus', d, ctx, 'alerte'), {
      type: 'alerte', action: 'vu', empreinte: `emailrecu:${e.id}`,
      titre: `Email de ${String(e.de && (e.de.nom || e.de.adresse) || 'un correspondant').slice(0, 60)}${pj ? ` (${pj} pièce${pj > 1 ? 's' : ''} jointe${pj > 1 ? 's' : ''})` : ''} — ${libelleDossierAffiche(d)}`,
      resume: `« ${String(e.objet || '(sans objet)').slice(0, 120)} ». Je peux ${suites.join(' ; ')} — dites-le-moi ici (@CLAIRE).`
    }));
  }
  return sortie;
}

module.exports = {
  emailsRecusDossiers,
  relancesFormalites,
  diagnosticsPerimes, finValiditeDpe, incoherencesSignature, controleRendezVous, derniereActiviteDossier, dossiersBloques, plusMois,
  DATE_DEBUT_CONSTITUTION, JOURS_VEILLE_SIGNATURE, joursEntre, semaineIso, dateFr, confrereAcquereur, confrereVendeur, acteSigne, dateCreationDossier,
  dossierOuvert, idDepuisEmpreinte, revueDuMatin, veilleSignature, constitutionDossier, appelDeFonds, autorisationsNotoriete, propositionDates, formalitesAuthentic, expirerComedecParticipation, JOURS_CJN_AVANT_SIGNATURE, DATE_DEBUT_COMEDEC_AUTHENTIC
};
