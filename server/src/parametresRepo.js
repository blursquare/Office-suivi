// Dépôt des réglages et états de la table `parametres` (clé → JSON). Les assainisseurs (une fonction pure par clé)
// vivent dans parametres/assainir.js depuis le 04/10 ; ce fichier ne garde que la lecture/écriture en base.
'use strict';

const A = require('./parametres/assainir');
const { LOTS_REPERTOIRE } = require('./repertoireAjouts');

// Repère des lots du répertoire déjà appliqués (liste de noms de lots).
const CLE_REPERTOIRE_LOTS = 'repertoire-lots';
const {
  assainirCarnet, carnetInitial, avecOfficeEtude, assainirRepertoire, repertoireInitial, CLE_SONDAGES, assainirSondages, assainirJournalAppels, CLE_APPELS, CLE_REGLAGES, CLE_DERNIER_TOUR, CLE_COPIES_GMAIL, CLE_SECRET_LIENS, CLE_EXCLUSIONS_PIECES, CLE_CORRECTIONS_APPRISES, MAX_CORRECTIONS_APPRISES, assainirCorrectionApprise, assainirCorrectionsApprises, CLE_JOURNAL_CORRECTIONS, MAX_JOURNAL_CORRECTIONS, assainirJournalCorrections, CLE_RAPPELS_PERSO, MAX_RAPPELS_PERSO, assainirRappelPerso, assainirRappelsPerso, CLE_PREFERENCES, assainirWidgetsPreference, assainirPreference, assainirPreferences, CLE_REGLAGE_SAUVEGARDE, CLE_ETAT_SAUVEGARDE, assainirEtatSauvegarde, assainirExclusionsPieces, assainirCopiesEnAttente, CLE_RETOURS_AUDIT, MAX_RETOURS_AUDIT, texteBorne, assainirRetourAudit, assainirRetoursAudit, PORT_SMTP_PAR_DEFAUT, REGLAGES_PAR_DEFAUT, assainirReglages, assainirDernierTour, CLE_REGLAGES_CLAUDE, MODELES_CLAUDE, MODELE_CLAUDE_PAR_DEFAUT, assainirReglagesClaude, CLE_MISE_A_JOUR, assainirReglagesMiseAJour, CLE_REGLAGES_EXCHANGE, URL_EWS_DEFAUT, CATEGORIES_RDV_DEFAUT, assainirCategoriesRdv, assainirReglagesExchange, CLE_DERNIER_TOUR_AGENDA, CLE_ABSENCES_AGENDA, CLE_CATEGORIES_AGENDA, assainirCategoriesAgenda, CLE_AGENDA_DU_JOUR, CLE_AGENDA_COMPARAISON, assainirComparaisonAgenda, assainirAgendaDuJour, CLE_AGENDA_OFFICE, assainirEvenementAgenda, assainirAgendaOffice, assainirAbsenceAgenda, assainirAbsencesAgenda, assainirDernierTourAgenda, CLE_RESUME_EMAILS, CLE_SCANS_REGLAGES, CLE_SCANS_JOURNAL, CLE_SCANS_ECARTES, CLE_PIECES_NOTIFIEES, assainirPiecesNotifiees, assainirReglagesScans, assainirJournalScans, assainirScansEcartes, CLE_RAPPORT_TECHNIQUE, assainirRapportTechnique, CLE_CARNET_CONFRERES, CLE_REPERTOIRE, CLE_REPERTOIRE_THEMES, assainirThemesRepertoire, CLE_SCANS_CATEGORIES, assainirCategoriesScans, CLE_SCANS_MEMOIRE, assainirMemoireScans, CLE_NAS_GESTES, assainirJournalGestesNas, assainirResumeEmails
} = A;

function creerRepoParametres(db) {
  const lireStmt = db.prepare('SELECT valeur FROM parametres WHERE cle = ?');
  const ecrireStmt = db.prepare(
    'INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur'
  );

  function lireReglages() {
    const ligne = lireStmt.get(CLE_REGLAGES);
    if (!ligne) return { ...REGLAGES_PAR_DEFAUT, emailsResponsables: {}, fonctionsResponsables: {} };
    try {
      return assainirReglages(JSON.parse(ligne.valeur));
    } catch (e) {
      return { ...REGLAGES_PAR_DEFAUT, emailsResponsables: {}, fonctionsResponsables: {} };
    }
  }

  function ecrireReglages(reglages) {
    const propre = assainirReglages(reglages, lireReglages());
    ecrireStmt.run(CLE_REGLAGES, JSON.stringify(propre));
    return propre;
  }

  // Absent = la tâche n'a encore jamais tourné depuis l'installation (ou l'envoi n'a jamais été
  // configuré : un tour qui sort avant d'avoir rien tenté n'écrit rien, voir executerTacheRappels).
  function lireDernierTour() {
    const ligne = lireStmt.get(CLE_DERNIER_TOUR);
    if (!ligne) return null;
    try {
      return assainirDernierTour(JSON.parse(ligne.valeur));
    } catch (e) {
      return null;
    }
  }

  function ecrireDernierTour(resultat) {
    const propre = assainirDernierTour(resultat);
    ecrireStmt.run(CLE_DERNIER_TOUR, JSON.stringify(propre));
    return propre;
  }

  function lireCopiesEnAttente() {
    const ligne = lireStmt.get(CLE_COPIES_GMAIL);
    if (!ligne) return [];
    try {
      return assainirCopiesEnAttente(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireCopiesEnAttente(liste) {
    const propre = assainirCopiesEnAttente(liste);
    ecrireStmt.run(CLE_COPIES_GMAIL, JSON.stringify(propre));
    return propre;
  }

  function lireRetoursAudit() {
    const ligne = lireStmt.get(CLE_RETOURS_AUDIT);
    if (!ligne) return [];
    try {
      return assainirRetoursAudit(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireRetoursAudit(liste) {
    const propre = assainirRetoursAudit(liste);
    ecrireStmt.run(CLE_RETOURS_AUDIT, JSON.stringify(propre));
    return propre;
  }

  function lireReglagesClaude() {
    const ligne = lireStmt.get(CLE_REGLAGES_CLAUDE);
    if (!ligne) return assainirReglagesClaude({});
    try {
      return assainirReglagesClaude(JSON.parse(ligne.valeur));
    } catch (e) {
      return assainirReglagesClaude({});
    }
  }

  function ecrireReglagesClaude(reglages) {
    const propre = assainirReglagesClaude(reglages, lireReglagesClaude());
    ecrireStmt.run(CLE_REGLAGES_CLAUDE, JSON.stringify(propre));
    return propre;
  }

  // Secret des liens vers les pièces (voir liensPieces.js) : généré une seule fois, au premier
  // besoin, puis conservé en base — le changer rendrait invalides tous les liens déjà envoyés
  // dans Teams. Jamais exposé par une route.
  function lireSecretLiens() {
    const ligne = lireStmt.get(CLE_SECRET_LIENS);
    if (ligne && typeof ligne.valeur === 'string' && ligne.valeur.length >= 32) return ligne.valeur;
    const secret = require('node:crypto').randomBytes(32).toString('hex');
    ecrireStmt.run(CLE_SECRET_LIENS, secret);
    return secret;
  }

  function lireExclusionsPieces() {
    const ligne = lireStmt.get(CLE_EXCLUSIONS_PIECES);
    if (!ligne) return {};
    try {
      return assainirExclusionsPieces(JSON.parse(ligne.valeur));
    } catch (e) {
      return {};
    }
  }

  function ecrireExclusionsPieces(exclusions) {
    const propre = assainirExclusionsPieces(exclusions);
    ecrireStmt.run(CLE_EXCLUSIONS_PIECES, JSON.stringify(propre));
    return propre;
  }

  function lireCorrectionsApprises() {
    const ligne = lireStmt.get(CLE_CORRECTIONS_APPRISES);
    if (!ligne) return [];
    try {
      return assainirCorrectionsApprises(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireCorrectionsApprises(corrections) {
    const propre = assainirCorrectionsApprises(corrections);
    ecrireStmt.run(CLE_CORRECTIONS_APPRISES, JSON.stringify(propre));
    return propre;
  }

  // Stockage brut d'un état produit par un module qui l'assainit lui-même (emailsDossiers.js).
  function lireJsonBrut(cle, defaut) { return lireJson(cle, (v) => v, defaut); }
  function ecrireJsonBrut(cle, valeur) { ecrireStmt.run(cle, JSON.stringify(valeur)); return valeur; }

  function lireJournalCorrections() { return lireJson(CLE_JOURNAL_CORRECTIONS, assainirJournalCorrections, []); }
  function ecrireJournalCorrections(j) { const p = assainirJournalCorrections(j); ecrireStmt.run(CLE_JOURNAL_CORRECTIONS, JSON.stringify(p)); return p; }

  function lireRappelsPerso() {
    const ligne = lireStmt.get(CLE_RAPPELS_PERSO);
    if (!ligne) return [];
    try {
      return assainirRappelsPerso(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireRappelsPerso(rappels) {
    const propre = assainirRappelsPerso(rappels);
    ecrireStmt.run(CLE_RAPPELS_PERSO, JSON.stringify(propre));
    return propre;
  }

  function lirePreferences() {
    const ligne = lireStmt.get(CLE_PREFERENCES);
    if (!ligne) return {};
    try {
      return assainirPreferences(JSON.parse(ligne.valeur));
    } catch (e) {
      return {};
    }
  }

  function ecrirePreferences(preferences) {
    const propre = assainirPreferences(preferences);
    ecrireStmt.run(CLE_PREFERENCES, JSON.stringify(propre));
    return propre;
  }

  function lireReglageSauvegarde() {
    const ligne = lireStmt.get(CLE_REGLAGE_SAUVEGARDE);
    try {
      const v = ligne ? JSON.parse(ligne.valeur) : {};
      return { dossier: texteBorne(v && v.dossier, 500) };
    } catch (e) {
      return { dossier: '' };
    }
  }

  function ecrireReglageSauvegarde(reglage) {
    const propre = { dossier: texteBorne(reglage && reglage.dossier, 500) };
    ecrireStmt.run(CLE_REGLAGE_SAUVEGARDE, JSON.stringify(propre));
    return propre;
  }

  function lireEtatSauvegarde() {
    const ligne = lireStmt.get(CLE_ETAT_SAUVEGARDE);
    try {
      return assainirEtatSauvegarde(ligne ? JSON.parse(ligne.valeur) : {});
    } catch (e) {
      return assainirEtatSauvegarde({});
    }
  }

  function ecrireEtatSauvegarde(etat) {
    const propre = assainirEtatSauvegarde(etat);
    ecrireStmt.run(CLE_ETAT_SAUVEGARDE, JSON.stringify(propre));
    return propre;
  }

  // Absent = jamais tenté depuis l'installation (voir executerEtEnregistrerTourAgenda).
  function lireDernierTourAgenda() {
    const ligne = lireStmt.get(CLE_DERNIER_TOUR_AGENDA);
    if (!ligne) return null;
    try {
      return assainirDernierTourAgenda(JSON.parse(ligne.valeur));
    } catch (e) {
      return null;
    }
  }

  function ecrireDernierTourAgenda(resultat) {
    const propre = assainirDernierTourAgenda(resultat);
    ecrireStmt.run(CLE_DERNIER_TOUR_AGENDA, JSON.stringify(propre));
    return propre;
  }

  function lireAbsencesAgenda() {
    const ligne = lireStmt.get(CLE_ABSENCES_AGENDA);
    if (!ligne) return [];
    try {
      return assainirAbsencesAgenda(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireAbsencesAgenda(absences) {
    const propre = assainirAbsencesAgenda(absences);
    ecrireStmt.run(CLE_ABSENCES_AGENDA, JSON.stringify(propre));
    return propre;
  }

  function lireAgendaDuJour() {
    const ligne = lireStmt.get(CLE_AGENDA_DU_JOUR);
    if (!ligne) return null;
    try {
      return assainirAgendaDuJour(JSON.parse(ligne.valeur));
    } catch (e) {
      return null;
    }
  }

  function ecrireAgendaDuJour(agenda) {
    const propre = assainirAgendaDuJour(agenda);
    ecrireStmt.run(CLE_AGENDA_DU_JOUR, JSON.stringify(propre));
    return propre;
  }

  function lireAgendaOffice() {
    const ligne = lireStmt.get(CLE_AGENDA_OFFICE);
    if (!ligne) return null;
    try {
      return assainirAgendaOffice(JSON.parse(ligne.valeur));
    } catch (e) {
      return null;
    }
  }

  function ecrireAgendaOffice(agenda) {
    const propre = assainirAgendaOffice(agenda);
    ecrireStmt.run(CLE_AGENDA_OFFICE, JSON.stringify(propre));
    return propre;
  }

  // Entre deux tours de lecture : un rendez-vous créé depuis CLAIRE est ajouté, un rendez-vous
  // supprimé est retiré, pour que tous les postes le voient sans attendre le tour suivant.
  function ajouterEvenementAgendaOffice(evenement) {
    const agenda = lireAgendaOffice() || { debut: '', lu: '', evenements: [] };
    const propre = assainirEvenementAgenda(evenement);
    if (!propre) return agenda;
    const evenements = agenda.evenements.filter((e) => !propre.itemId || e.itemId !== propre.itemId).concat([propre])
      .sort((a, c) => a.date.localeCompare(c.date) || String(a.heure || '').localeCompare(String(c.heure || '')));
    return ecrireAgendaOffice({ ...agenda, evenements });
  }

  function retirerEvenementAgendaOffice(itemId) {
    const agenda = lireAgendaOffice();
    if (!agenda || !itemId) return agenda;
    return ecrireAgendaOffice({ ...agenda, evenements: agenda.evenements.filter((e) => e.itemId !== itemId) });
  }

  function lireCategoriesAgenda() {
    const ligne = lireStmt.get(CLE_CATEGORIES_AGENDA);
    if (!ligne) return [];
    try {
      return assainirCategoriesAgenda(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireCategoriesAgenda(categories) {
    const propre = assainirCategoriesAgenda(categories);
    ecrireStmt.run(CLE_CATEGORIES_AGENDA, JSON.stringify(propre));
    return propre;
  }

  function lireReglagesExchange() {
    const ligne = lireStmt.get(CLE_REGLAGES_EXCHANGE);
    if (!ligne) return assainirReglagesExchange({});
    try {
      return assainirReglagesExchange(JSON.parse(ligne.valeur));
    } catch (e) {
      return assainirReglagesExchange({});
    }
  }

  function ecrireReglagesExchange(reglages) {
    const propre = assainirReglagesExchange(reglages, lireReglagesExchange());
    ecrireStmt.run(CLE_REGLAGES_EXCHANGE, JSON.stringify(propre));
    return propre;
  }

  function lireReglagesMiseAJour() {
    const ligne = lireStmt.get(CLE_MISE_A_JOUR);
    if (!ligne) return assainirReglagesMiseAJour({});
    try {
      return assainirReglagesMiseAJour(JSON.parse(ligne.valeur));
    } catch (e) {
      return assainirReglagesMiseAJour({});
    }
  }

  function ecrireReglagesMiseAJour(reglages) {
    const propre = assainirReglagesMiseAJour(reglages, lireReglagesMiseAJour());
    ecrireStmt.run(CLE_MISE_A_JOUR, JSON.stringify(propre));
    return propre;
  }

  // Téléphonie 3CX coupée collaborateur par collaborateur (étude, 02/10) : la liste des postes coupés
  // (clé de poste, voir clePoste) ; active pour tous par défaut.
  // postesRelais : postes où le relais « claire-appel: » est installé (appels 3CX dans la fenêtre CLAIRE, étude 07/10).
  function assainirReglagesTelephonie(r) {
    const liste = (v) => [...new Set((Array.isArray(v) ? v : []).map(x => String(x || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)).filter(Boolean))].slice(0, 30);
    return { postesCoupes: liste(r && r.postesCoupes), postesRelais: liste(r && r.postesRelais) };
  }
  function lireReglagesTelephonie() { return lireJson('telephonie-3cx', assainirReglagesTelephonie, { postesCoupes: [], postesRelais: [] }); }
  function ecrireReglagesTelephonie(r) { const p = assainirReglagesTelephonie(r); ecrireStmt.run('telephonie-3cx', JSON.stringify(p)); return p; }
  function lireJournalAppels() { return lireJson(CLE_APPELS, assainirJournalAppels, []); }
  function ecrireJournalAppels(l) { const p = assainirJournalAppels(l); ecrireStmt.run(CLE_APPELS, JSON.stringify(p)); return p; }
  function lireSondagesCreneaux() { return lireJson(CLE_SONDAGES, assainirSondages, []); }
  function ecrireSondagesCreneaux(l) { const p = assainirSondages(l); ecrireStmt.run(CLE_SONDAGES, JSON.stringify(p)); return p; }

  // Historique de l'agenda (étude, 01/10 : « remonter jusqu'au 1er janvier, si possible toutes les
  // années ») : un mois passé lu une fois dans Exchange, gardé sous sa propre clé
  // « agenda-archive:AAAA-MM » ({ lu, evenements }, 600 rendez-vous au plus) — jamais un seul gros bloc.
  function lireArchiveAgenda(mois) {
    if (!/^\d{4}-\d{2}$/.test(String(mois || ''))) return null;
    return lireJson('agenda-archive:' + mois, (b) => (b && typeof b === 'object' ? {
      lu: texteBorne(b.lu, 40),
      evenements: Array.isArray(b.evenements) ? b.evenements.map(assainirEvenementAgenda).filter(Boolean).slice(0, 600) : []
    } : null), null);
  }
  function ecrireArchiveAgenda(mois, archive) {
    if (!/^\d{4}-\d{2}$/.test(String(mois || ''))) return null;
    const propre = { lu: texteBorne(archive && archive.lu, 40), evenements: ((archive && archive.evenements) || []).map(assainirEvenementAgenda).filter(Boolean).slice(0, 600) };
    ecrireStmt.run('agenda-archive:' + mois, JSON.stringify(propre));
    return propre;
  }

  function lireComparaisonAgenda() { return lireJson(CLE_AGENDA_COMPARAISON, assainirComparaisonAgenda, {}); }
  function ecrireComparaisonAgenda(m) { const p = assainirComparaisonAgenda(m); ecrireStmt.run(CLE_AGENDA_COMPARAISON, JSON.stringify(p)); return p; }

  function lireJson(cle, assainir, defaut) {
    const ligne = lireStmt.get(cle);
    if (!ligne) return defaut;
    try { return assainir(JSON.parse(ligne.valeur)); } catch (e) { return defaut; }
  }
  function lireReglagesScans() { return lireJson(CLE_SCANS_REGLAGES, assainirReglagesScans, assainirReglagesScans({})); }
  function lireThemesRepertoire() { return lireJson(CLE_REPERTOIRE_THEMES, assainirThemesRepertoire, []); }
  function ecrireThemesRepertoire(t) { const p = assainirThemesRepertoire(t); ecrireStmt.run(CLE_REPERTOIRE_THEMES, JSON.stringify(p)); return p; }
  function lireJournalGestesNas() { return lireJson(CLE_NAS_GESTES, assainirJournalGestesNas, []); }
  function ecrireJournalGestesNas(j) { const p = assainirJournalGestesNas(j); ecrireStmt.run(CLE_NAS_GESTES, JSON.stringify(p)); return p; }
  function lireMemoireScans() { return lireJson(CLE_SCANS_MEMOIRE, assainirMemoireScans, assainirMemoireScans({})); }
  function ecrireMemoireScans(m) { const p = assainirMemoireScans(m); ecrireStmt.run(CLE_SCANS_MEMOIRE, JSON.stringify(p)); return p; }
  function lireCategoriesScans() { return lireJson(CLE_SCANS_CATEGORIES, assainirCategoriesScans, []); }
  function ecrireCategoriesScans(c) { const p = assainirCategoriesScans(c); ecrireStmt.run(CLE_SCANS_CATEGORIES, JSON.stringify(p)); return p; }
  function lireRapportTechnique() { return lireJson(CLE_RAPPORT_TECHNIQUE, assainirRapportTechnique, assainirRapportTechnique({})); }
  function ecrireRapportTechnique(r) { const p = assainirRapportTechnique(r); ecrireStmt.run(CLE_RAPPORT_TECHNIQUE, JSON.stringify(p)); return p; }
  function ecrireReglagesScans(r) { const p = assainirReglagesScans(r); ecrireStmt.run(CLE_SCANS_REGLAGES, JSON.stringify(p)); return p; }
  function lireJournalScans() { return lireJson(CLE_SCANS_JOURNAL, assainirJournalScans, []); }
  function ecrireJournalScans(j) { const p = assainirJournalScans(j); ecrireStmt.run(CLE_SCANS_JOURNAL, JSON.stringify(p)); return p; }
  function lireScansEcartes() { return lireJson(CLE_SCANS_ECARTES, assainirScansEcartes, []); }
  function lirePiecesNotifiees() { return lireJson(CLE_PIECES_NOTIFIEES, assainirPiecesNotifiees, {}); }
  function ecrirePiecesNotifiees(m) { const p = assainirPiecesNotifiees(m); ecrireStmt.run(CLE_PIECES_NOTIFIEES, JSON.stringify(p)); return p; }
  function ecrireScansEcartes(l) { const p = assainirScansEcartes(l); ecrireStmt.run(CLE_SCANS_ECARTES, JSON.stringify(p)); return p; }

  function lireResumeEmails() {
    const ligne = lireStmt.get(CLE_RESUME_EMAILS);
    if (!ligne) return null;
    try { return assainirResumeEmails(JSON.parse(ligne.valeur)); } catch (e) { return null; }
  }

  function ecrireResumeEmails(resume) {
    const propre = assainirResumeEmails(resume);
    ecrireStmt.run(CLE_RESUME_EMAILS, JSON.stringify(propre));
    return propre;
  }

  function lireCarnetConfreres() {
    const ligne = lireStmt.get(CLE_CARNET_CONFRERES);
    if (!ligne) return ecrireCarnetConfreres(carnetInitial());
    let carnet;
    try { carnet = assainirCarnet(JSON.parse(ligne.valeur)); } catch (e) { carnet = []; }
    const r = avecOfficeEtude(carnet);
    return r.ajoute ? ecrireCarnetConfreres(r.carnet) : carnet;
  }

  function ecrireCarnetConfreres(carnet) {
    const propre = assainirCarnet(carnet);
    ecrireStmt.run(CLE_CARNET_CONFRERES, JSON.stringify(propre));
    return propre;
  }

  // Lots de contacts ajoutés après coup (repertoireAjouts.js) : chaque lot est appliqué UNE fois (repère `repertoire-lots`),
  // sans toucher à un contact de même id déjà présent — un contact que l'étude retire ensuite ne revient pas.
  function avecLotsRepertoire(contacts, tous = false) {
    const brut = tous ? [] : lireJsonBrut(CLE_REPERTOIRE_LOTS, []);
    const appliques = new Set(Array.isArray(brut) ? brut : []);
    const nouveaux = LOTS_REPERTOIRE.filter((l) => !appliques.has(l.lot));
    if (!nouveaux.length) return { contacts, change: false };
    const ids = new Set(contacts.map((c) => c.id));
    const ajoutes = [];
    let corriges = 0;
    // Corrections d'un lot : appliquées seulement si le contact porte encore la valeur d'origine (`si`).
    const corrigesListe = contacts.map((c) => {
      let r = c;
      for (const lot of nouveaux) for (const k of lot.corrections || []) {
        if (k.id !== r.id || !Object.entries(k.si || {}).every(([ch, v]) => r[ch] === v)) continue;
        r = { ...r, ...k.champs };
        corriges++;
      }
      return r;
    });
    for (const lot of nouveaux) for (const c of lot.contacts) if (!ids.has(c.id)) { ids.add(c.id); ajoutes.push({ source: lot.source, ...c }); }
    ecrireJsonBrut(CLE_REPERTOIRE_LOTS, [...appliques, ...nouveaux.map((l) => l.lot)]);
    return { contacts: corrigesListe.concat(ajoutes), change: ajoutes.length > 0 || corriges > 0 };
  }

  function lireRepertoire() {
    const ligne = lireStmt.get(CLE_REPERTOIRE);
    if (!ligne) return ecrireRepertoire(avecLotsRepertoire(repertoireInitial(), true).contacts);
    let contacts;
    try { contacts = assainirRepertoire(JSON.parse(ligne.valeur)); } catch (e) { return []; }
    const r = avecLotsRepertoire(contacts);
    return r.change ? ecrireRepertoire(r.contacts) : contacts;
  }

  function ecrireRepertoire(contacts) {
    const propre = assainirRepertoire(contacts);
    ecrireStmt.run(CLE_REPERTOIRE, JSON.stringify(propre));
    return propre;
  }

  return {
    lireRapportTechnique, ecrireRapportTechnique,
    lireReglagesScans, ecrireReglagesScans, lireJournalScans, ecrireJournalScans, lireScansEcartes, ecrireScansEcartes,
    lirePiecesNotifiees, ecrirePiecesNotifiees,
    lireSondagesCreneaux, ecrireSondagesCreneaux,
    lireJournalAppels, ecrireJournalAppels, lireReglagesTelephonie, ecrireReglagesTelephonie,
    lireCarnetConfreres, ecrireCarnetConfreres,
    lireRepertoire, ecrireRepertoire, lireThemesRepertoire, ecrireThemesRepertoire, lireCategoriesScans, ecrireCategoriesScans, lireMemoireScans, ecrireMemoireScans, lireJournalGestesNas, ecrireJournalGestesNas,
    lireResumeEmails, ecrireResumeEmails,
    lireReglagesMiseAJour, ecrireReglagesMiseAJour,
    lireReglagesExchange, ecrireReglagesExchange,
    lireDernierTourAgenda, ecrireDernierTourAgenda,
    lireAbsencesAgenda, ecrireAbsencesAgenda, lireCategoriesAgenda, ecrireCategoriesAgenda,
    lireAgendaDuJour, ecrireAgendaDuJour, lireAgendaOffice, ecrireAgendaOffice, lireComparaisonAgenda, ecrireComparaisonAgenda, lireArchiveAgenda, ecrireArchiveAgenda,
    ajouterEvenementAgendaOffice, retirerEvenementAgendaOffice,
    lireReglageSauvegarde, ecrireReglageSauvegarde, lireEtatSauvegarde, ecrireEtatSauvegarde,
    lireReglages, ecrireReglages, lireDernierTour, ecrireDernierTour,
    lireCopiesEnAttente, ecrireCopiesEnAttente, lireRetoursAudit, ecrireRetoursAudit,
    lireReglagesClaude, ecrireReglagesClaude, lireSecretLiens,
    lireExclusionsPieces, ecrireExclusionsPieces, lireCorrectionsApprises, ecrireCorrectionsApprises,
    lireJournalCorrections, ecrireJournalCorrections, lireJsonBrut, ecrireJsonBrut,
    lireRappelsPerso, ecrireRappelsPerso, lirePreferences, ecrirePreferences
  };
}

module.exports = {
  assainirWidgetsPreference,
  creerRepoParametres, assainirReglages, assainirEtatSauvegarde, assainirExclusionsPieces, assainirCorrectionApprise, assainirCorrectionsApprises, MAX_CORRECTIONS_APPRISES, assainirJournalCorrections, MAX_JOURNAL_CORRECTIONS, assainirDernierTour, assainirCopiesEnAttente,
  assainirRetourAudit, assainirRetoursAudit, MAX_RETOURS_AUDIT,
  assainirRappelPerso, assainirRappelsPerso, MAX_RAPPELS_PERSO, assainirPreference, assainirPreferences,
  assainirReglagesClaude, assainirReglagesMiseAJour, MODELES_CLAUDE, MODELE_CLAUDE_PAR_DEFAUT,
  assainirReglagesExchange, assainirCategoriesRdv, CATEGORIES_RDV_DEFAUT, URL_EWS_DEFAUT, assainirCategoriesAgenda,
  assainirDernierTourAgenda, assainirAbsenceAgenda, assainirAbsencesAgenda, assainirAgendaDuJour, assainirAgendaOffice,
  REGLAGES_PAR_DEFAUT, PORT_SMTP_PAR_DEFAUT, assainirResumeEmails,
  assainirReglagesScans, assainirJournalScans, assainirScansEcartes, assainirPiecesNotifiees, assainirRapportTechnique
};
