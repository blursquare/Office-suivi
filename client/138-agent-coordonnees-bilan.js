// « Demander à CLAIRE » (étude 28/10 : « elle doit savoir donner les coordonnées d'un client pour lui écrire ou l'appeler » ; « un résumé
// des dossiers facile à lire pour le donner à Sophie : ce qui s'est passé, nombre d'emails et d'appels avec le client, les points qui ont
// bloqué, ce qui s'est bien passé »). Deux outils exécutés par le poste :
//  - `coordonnees_client` : la carte des coordonnées (numéros cliquables pour 3CX, emails en lien) s'affiche dans la conversation —
//    rien n'y part vers l'IA — et l'IA reçoit les mêmes données MASQUÉES (noms, emails, téléphones codés, rétablis dans sa réponse) ;
//  - `bilan_dossier` : les faits du dossier (dates clés, délais comparés à la moyenne de l'étude, emails et appels comptés, échéances
//    dépassées, relances, pièces, fonds), que l'IA rédige en résumé lisible. Bouton « Résumé pour Sophie » de la fiche (même chemin).

function coordonneesClientAgent(e) {
  const d = dossiers.find(x => x.id === (e && e.dossier_id));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  const partie = ['vendeur', 'acquereur', 'confrere', 'agence'].includes(e && e.partie) ? e.partie : '';
  // La carte de l'écran (même rendu que la réponse « coordonnées » de CLAIRE) : numéros et emails cliquables, sur le poste seulement.
  try {
    const r = reponseCoordonneesAssistant(d, partie, { sansCotesRepresentes: true });
    assistantMessages.push({ role: 'claire', html: r.html, boutons: r.boutons || [], quand: Date.now() });
    renderAssistant();
  } catch (err) { /* la carte est un plus : l'IA reçoit quand même les coordonnées */ }
  const cote = (role) => (d.parties || []).filter(p => p && p.role === role).map(p => ({
    nom: [p.prenom, p.nom].filter(Boolean).join(' '), telephones: (p.telephones || []).slice(0, 3), emails: (p.emails || []).slice(0, 3) }));
  // Un côté représenté par un confrère (déontologie, comme la fiche — coordonneesPartiesDossier) : ni ses téléphones ni ses emails à
  // l'IA, seulement le confrère à qui écrire (audit 0.386.0).
  const confrereDe = (c) => {
    const nom = c === 'vendeur' ? d.notaireVendeur : d.notaireAcquereur;
    const tel = typeof telephoneConfrereDossier === 'function' ? telephoneConfrereDossier(d, c).effectif : '';
    const email = c === 'vendeur' ? (d.emailConfrereVendeur || (typeof emailOfficeConfrereVendeur === 'function' ? emailOfficeConfrereVendeur(d) : ''))
      : (d.emailNotaireParticipant || (typeof emailOfficeConfrereAcquereur === 'function' ? emailOfficeConfrereAcquereur(d) : ''));
    return { represente_par_un_confrere: true, ecrire_au_confrere: { notaire: nom || '', telephone: tel || '', email: email || '' } };
  };
  const sortie = { dossier_id: d.id, carte_affichee: true, note: 'la carte des coordonnées (numéros cliquables, emails) est déjà affichée à l’utilisateur : ne la recopie pas, propose d’écrire (faire_geste email) ou d’appeler' };
  const vendeurRepresente = typeof confrereRepresenteVendeur === 'function' && !!confrereRepresenteVendeur(d);
  const acquereurRepresente = typeof notaireParticipantRepresenteAcquereur === 'function' && !!notaireParticipantRepresenteAcquereur(d);
  if (!partie || partie === 'vendeur') {
    sortie.vendeur = vendeurRepresente ? confrereDe('vendeur') : { personnes: cote('VENDEUR'), telephone: d.telephoneVendeur || '', email: d.emailVendeur || '', represente_par_un_confrere: false };
  }
  if (!partie || partie === 'acquereur') {
    sortie.acquereur = acquereurRepresente ? confrereDe('acquereur') : { personnes: cote('ACQUEREUR'), telephone: d.telephoneAcquereur || '', email: d.emailAcquereur || '', represente_par_un_confrere: false };
  }
  if (!partie || partie === 'confrere') sortie.confreres = { notaire_vendeur: d.notaireVendeur || '', notaire_acquereur: d.notaireAcquereur || '' };
  return sortie;
}

// Pure : la sorte d'un événement de l'historique, en vocabulaire fermé (ce qui part vers l'IA).
var SORTES_EVENEMENT_BILAN = [
  [/^dossier cree|^cree depuis|^creation/, 'dossier créé'], [/complete (avec|depuis)/, 'fiche complétée (compromis ou Authentic)'],
  [/relance/, 'relance'], [/^piece (recue|ajoutee.*recue)|^document recu|offre de pret (recue|retrouv)|piece.*cochee/, 'pièce reçue'],
  [/offre de pret/, 'offre de prêt'], [/^email (envoye|prepare)|email prepare|prepare(e)? par email|envoye par email/, 'email préparé ou envoyé'],
  [/rendez-vous.*(place|fixe|pose)|signature (placee|fixee)/, 'rendez-vous placé'], [/rendez-vous.*(deplace|annule|a replacer|retire)/, 'rendez-vous déplacé ou annulé'],
  [/appel de fonds/, 'appel de fonds'], [/projet/, 'projet d’acte'], [/fonds/, 'fonds'], [/(echeance|date).*(realisee|cochee|validee)/, 'échéance réalisée'],
  [/preemption|dia\b|safer/, 'préemption (DIA, SAFER)'], [/(^|[^a-z])signe/, 'signature'], [/archiv/, 'archivage'], [/authentic/, 'Authentic']
];
function sorteEvenementBilan(texte) {
  const t = normaliserPourRecherche(String(texte || ''));
  const s = SORTES_EVENEMENT_BILAN.find(([re]) => re.test(t));
  return s ? s[1] : 'autre';
}

// Pure : les faits tirés de l'historique de la fiche — relances, échéances dépassées, pièces reçues, mises à jour, gestes de CLAIRE.
function faitsHistoriqueBilan(historique) {
  const h = Array.isArray(historique) ? historique : [];
  const compte = (re) => h.filter(x => re.test(normaliserPourRecherche(String((x && x.texte) || '')))).length;
  return {
    entrees: h.length,
    relances: compte(/relance/),
    pieces_recues: compte(/^piece (recue|ajoutee.*recue)|^document recu|offre de pret (recue|retrouv)|piece.*(recue|trouvee|cochee)/),
    rendez_vous_deplaces: compte(/rendez-vous.*(deplace|annule|a replacer)|deplace.*rendez-vous/),
    // Un email préparé ou envoyé, jamais la saisie d'un champ « Email du vendeur : … » (audit 0.386.0).
    emails_prepares_ou_envoyes: h.filter(x => { const t = normaliserPourRecherche(String((x && x.texte) || '')); return !/^email d(u|e l)/.test(t) && /^email (envoye|prepare)|email prepare|prepare(e)? par email|envoye par email/.test(t); }).length
  };
}

// Pure : écart en jours entre deux dates AAAA-MM-JJ (null si l'une manque).
function joursEntreBilan(a, b) {
  if (!a || !b) return null;
  const j = Math.round((Date.parse(String(b).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(a).slice(0, 10) + 'T12:00:00Z')) / 86400000);
  // Mêmes garde-fous que la moyenne de l'étude : jamais un écart négatif.
  return Number.isFinite(j) && j >= 0 ? j : null;
}

async function bilanDossierAgent(e) {
  const d = dossiers.find(x => x.id === (e && e.dossier_id));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  const auj = isoAujourdhuiLocal();
  const succ = estSuccession(d);
  // Emails et appels du dossier : relus au serveur (comptes, sens, dates ; jamais le texte d'un email).
  const lire = async (url, f) => { try { const r = await fetchAvecAuth(url); return r.ok ? f(await r.json()) : null; } catch (err) { return null; } };
  const [emails, appels] = await Promise.all([
    lire('/api/emails-dossiers?dossierId=' + encodeURIComponent(d.id), j => j),
    lire('/api/appels?dossierId=' + encodeURIComponent(d.id), j => j.appels || [])
  ]);
  const boiteLue = !!(emails && emails.etat && (emails.etat.actif !== false) && (emails.etat.dernierTour || emails.etat.derniereLecture));
  const listeEmails = (emails && emails.emails) || [];
  const dates = {
    ouverture: (typeof dateOuvertureDossier === 'function' && dateOuvertureDossier(d)) || '',
    avant_contrat: d.dateAvantContrat || '',
    pret_obtenu: (!succ && typeof dateObtentionPret === 'function' && dateObtentionPret(d)) || '',
    renonciation_preemption: (!succ && typeof dateRenonciationPreemption === 'function' && dateRenonciationPreemption(d)) || '',
    rendez_vous_signature: d.rendezVousSignature || '',
    // « Signé » seulement si l'acte l'est (Authentic ou signature cochée), jamais un rendez-vous seulement passé (audit 0.386.0).
    signe_le: ((typeof signatureFaiteSuivi === 'function' && signatureFaiteSuivi(d)) || {}).iso || '',
    rendez_vous_passe_signature_non_confirmee: !!(d.rendezVousSignature && d.rendezVousSignature < auj && !(typeof signatureFaiteSuivi === 'function' && signatureFaiteSuivi(d)))
  };
  // Délais du dossier comparés à la moyenne de l'étude (même calcul que le widget Statistiques).
  let moyennes = null;
  try { if (!succ) moyennes = statistiquesDelaisDossiers(dossiers, auj); } catch (err) { /* facultatif */ }
  const debut = dates.avant_contrat || dates.ouverture;
  const passe = (x) => (x && x <= auj ? x : '');
  const delais = succ ? {} : {
    jusqu_au_pret: { jours: joursEntreBilan(debut, passe(dates.pret_obtenu)), moyenne_etude: moyennes && moyennes.pret.moyenne },
    jusqu_a_la_renonciation: { jours: joursEntreBilan(debut, passe(dates.renonciation_preemption)), moyenne_etude: moyennes && moyennes.preemption.moyenne },
    jusqu_a_la_signature: { jours: joursEntreBilan(debut, dates.signe_le), moyenne_etude: moyennes && moyennes.signature.moyenne }
  };
  const echeances = succ ? [] : (echeancesPlanning(d) || []);
  const depassees = echeances.filter(it => it.iso && it.iso < auj && !echeanceValidee(d, it.type)).map(it => ({ echeance: it.label, date: it.iso }));
  const tenues = echeances.filter(it => it.iso && echeanceValidee(d, it.type)).map(it => it.label);
  const attendues = succ ? [] : (piecesAttenduesDossier(d) || []).map(p => (typeof p === 'string' ? p : p.label || p.cle || '')).filter(Boolean);
  let fonds = null;
  try { const b = succ ? null : bilanFondsDossier(d); if (b && !(b.etat === 'aucun' && !b.attendu)) fonds = { etat: b.etat, recu: b.total || 0, attendu: b.attendu || null, reste: b.reste == null ? null : b.reste, valides_a_la_main: !!b.manuel }; } catch (err) { /* sans fonds */ }
  const etat = etatDossier(d, auj);
  return {
    dossier_id: d.id, type: succ ? 'succession' : 'vente', responsable: d.responsable || '', statut: etat ? etat.texte : '',
    dates_cles: dates, delais_en_jours: delais,
    echanges: {
      emails_envoyes: listeEmails.filter(x => x.sens !== 'recu').length,
      emails_recus: listeEmails.filter(x => x.sens === 'recu').length,
      emails_prepares_non_envoyes: ((emails && emails.prepares) || []).filter(p => !p.envoyeLe).length,
      appels_recus: appels ? appels.length : null,
      appels_limite: appels && appels.length >= 50 ? 'au moins 50 (liste limitée)' : '',
      appels_par_partie: appels ? appels.reduce((t, a) => { const x = (a.dossiers || []).find(y => y.id === d.id); const k = (x && x.partie) || 'autre'; t[k] = (t[k] || 0) + 1; return t; }, {}) : null,
      note: [!emails ? 'emails non comptés (serveur injoignable)' : !boiteLue ? 'boîte Exchange pas encore lue ou lecture coupée : les nombres d’emails peuvent être à zéro à tort' : '',
        'appels REÇUS seulement (3CX ne note pas les appels passés) ; les appels d’un confrère sont comptés à part (partie « confrere »)'].filter(Boolean).join(' ; ')
    },
    echeances_tenues: tenues, echeances_depassees_non_levees: depassees,
    pieces_encore_attendues: attendues.slice(0, 15),
    fonds,
    historique: faitsHistoriqueBilan(d.historique),
    // Les événements récents en vocabulaire fermé (date + sorte), jamais le texte libre de l'historique (audit 0.386.0 : un nom absent
    // des fiches, en tête d'un texte court, passait le masquage).
    evenements_recents: (d.historique || []).slice(-20).map(h => ({ date: typeof isoLocalDepuisDate === 'function' ? isoLocalDepuisDate(h.date) : String(h.date || '').slice(0, 10), sorte: sorteEvenementBilan(h && h.texte) })).filter(x => x.sorte !== 'autre').slice(-15),
    consigne: 'Rédige un résumé court et facile à lire pour la notaire : 1) où en est le dossier, 2) ce qui s’est passé (dates clés, délais comparés à la moyenne de l’étude), 3) échanges avec le client (emails, appels), 4) ce qui a bloqué, 5) ce qui s’est bien passé. Chiffres exacts, rien d’inventé ; une donnée absente se dit absente.'
  };
}

// Le bouton « Résumé pour Sophie » de la fiche : la même demande à CLAIRE, dans sa conversation.
// Une conversation personnelle neuve (jamais un canal partagé : la phrase y serait publiée aux collègues — audit 0.386.0), dossier imposé.
function demanderResumeDossier(id) {
  const d = dossiers.find(x => x.id === id);
  if (!d) return;
  if (assistantTraitementEnCours || assistantEnCours) { afficherToast('CLAIRE termine une autre demande : réessayez dans un instant.', 'OK', null); return; }
  if (typeof definirOnglet === 'function') definirOnglet('assistant');
  if (typeof quitterCanal === 'function') quitterCanal();
  if (typeof nouvelleConversationAssistant === 'function') nouvelleConversationAssistant();
  assistantContexte.dossierId = id;
  setTimeout(() => envoyerDemandeAssistant(`Fais le résumé du dossier ${libelleDossierAffiche(d)} pour Sophie : ce qui s’est passé, les échanges avec le client, ce qui a bloqué et ce qui s’est bien passé.`), 50);
}
