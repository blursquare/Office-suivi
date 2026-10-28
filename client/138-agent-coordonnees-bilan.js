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
    const r = reponseCoordonneesAssistant(d, partie);
    assistantMessages.push({ role: 'claire', html: r.html, boutons: r.boutons || [], quand: Date.now() });
    renderAssistant();
  } catch (err) { /* la carte est un plus : l'IA reçoit quand même les coordonnées */ }
  const cote = (role) => (d.parties || []).filter(p => p && p.role === role).map(p => ({
    nom: [p.prenom, p.nom].filter(Boolean).join(' '), telephones: (p.telephones || []).slice(0, 3), emails: (p.emails || []).slice(0, 3) }));
  const sortie = { dossier_id: d.id, carte_affichee: true, note: 'la carte des coordonnées (numéros cliquables, emails) est déjà affichée à l’utilisateur : ne la recopie pas, propose d’écrire (faire_geste email) ou d’appeler' };
  if (!partie || partie === 'vendeur') {
    sortie.vendeur = { personnes: cote('VENDEUR'), telephone: d.telephoneVendeur || '', email: d.emailVendeur || '',
      represente_par_un_confrere: typeof confrereRepresenteVendeur === 'function' ? !!confrereRepresenteVendeur(d) : false };
  }
  if (!partie || partie === 'acquereur') {
    sortie.acquereur = { personnes: cote('ACQUEREUR'), telephone: d.telephoneAcquereur || '', email: d.emailAcquereur || '',
      represente_par_un_confrere: typeof notaireParticipantRepresenteAcquereur === 'function' ? !!notaireParticipantRepresenteAcquereur(d) : false };
  }
  if (!partie || partie === 'confrere') sortie.confreres = { notaire_vendeur: d.notaireVendeur || '', notaire_acquereur: d.notaireAcquereur || '' };
  return sortie;
}

// Pure : les faits tirés de l'historique de la fiche — relances, échéances dépassées, pièces reçues, mises à jour, gestes de CLAIRE.
function faitsHistoriqueBilan(historique) {
  const h = Array.isArray(historique) ? historique : [];
  const compte = (re) => h.filter(x => re.test(normaliserPourRecherche(String((x && x.texte) || '')))).length;
  return {
    entrees: h.length,
    relances: compte(/relance/),
    pieces_recues: compte(/piece.*(recue|trouvee|cochee)|recue.*piece|reçue/),
    echeances_depassees_notees: compte(/depass|en retard|urgent/),
    rendez_vous_deplaces: compte(/rendez-vous.*(deplace|annule|a replacer)|deplace.*rendez-vous/),
    emails_prepares_ou_envoyes: compte(/email|courriel/)
  };
}

// Pure : écart en jours entre deux dates AAAA-MM-JJ (null si l'une manque).
function joursEntreBilan(a, b) {
  if (!a || !b) return null;
  const j = Math.round((Date.parse(String(b).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(a).slice(0, 10) + 'T12:00:00Z')) / 86400000);
  return Number.isFinite(j) ? j : null;
}

async function bilanDossierAgent(e) {
  const d = dossiers.find(x => x.id === (e && e.dossier_id));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  const auj = isoAujourdhuiLocal();
  const succ = estSuccession(d);
  // Emails et appels du dossier : relus au serveur (comptes, sens, dates ; jamais le texte d'un email).
  let emails = null;
  let appels = null;
  try { const r = await fetchAvecAuth('/api/emails-dossiers?dossierId=' + encodeURIComponent(d.id)); if (r.ok) emails = await r.json(); } catch (err) { /* compté absent */ }
  try { const r = await fetchAvecAuth('/api/appels?dossierId=' + encodeURIComponent(d.id)); if (r.ok) appels = (await r.json()).appels || []; } catch (err) { /* compté absent */ }
  const listeEmails = (emails && emails.emails) || [];
  const dates = {
    ouverture: (typeof dateOuvertureDossier === 'function' && dateOuvertureDossier(d)) || '',
    avant_contrat: d.dateAvantContrat || '',
    pret_obtenu: (!succ && typeof dateObtentionPret === 'function' && dateObtentionPret(d)) || '',
    renonciation_preemption: (!succ && typeof dateRenonciationPreemption === 'function' && dateRenonciationPreemption(d)) || '',
    rendez_vous_signature: d.rendezVousSignature || '',
    signe_le: (typeof dateSignatureDossier === 'function' && dateSignatureDossier(d, auj)) || ''
  };
  // Délais du dossier comparés à la moyenne de l'étude (même calcul que le widget Statistiques).
  let moyennes = null;
  try { if (!succ) moyennes = statistiquesDelaisDossiers(dossiers, auj); } catch (err) { /* facultatif */ }
  const debut = dates.avant_contrat || dates.ouverture;
  const delais = succ ? {} : {
    jusqu_au_pret: { jours: joursEntreBilan(debut, dates.pret_obtenu), moyenne_etude: moyennes && moyennes.pret.moyenne },
    jusqu_a_la_renonciation: { jours: joursEntreBilan(debut, dates.renonciation_preemption), moyenne_etude: moyennes && moyennes.preemption.moyenne },
    jusqu_a_la_signature: { jours: joursEntreBilan(debut, dates.signe_le), moyenne_etude: moyennes && moyennes.signature.moyenne }
  };
  const echeances = succ ? [] : (echeancesPlanning(d) || []);
  const depassees = echeances.filter(it => it.iso && it.iso < auj && !echeanceValidee(d, it.type)).map(it => ({ echeance: it.label, date: it.iso }));
  const tenues = echeances.filter(it => it.iso && echeanceValidee(d, it.type)).map(it => it.label);
  const attendues = succ ? [] : (piecesAttenduesDossier(d) || []).map(p => (typeof p === 'string' ? p : p.label || p.cle || '')).filter(Boolean);
  let fonds = null;
  try { const b = bilanFondsDossier(d); if (b && b.etat !== 'aucun') fonds = { etat: b.etat, recu: b.total || 0, attendu: b.attendu || null, valides_a_la_main: !!b.manuel }; } catch (err) { /* sans fonds */ }
  const etat = etatDossier(d, auj);
  return {
    dossier_id: d.id, type: succ ? 'succession' : 'vente', responsable: d.responsable || '', statut: etat ? etat.texte : '',
    dates_cles: dates, delais_en_jours: delais,
    echanges: {
      emails_envoyes: listeEmails.filter(x => x.sens !== 'recu').length,
      emails_recus: listeEmails.filter(x => x.sens === 'recu').length,
      emails_prepares_non_envoyes: ((emails && emails.prepares) || []).filter(p => !p.envoyeLe).length,
      appels_recus: appels ? appels.length : null,
      appels_par_partie: appels ? appels.reduce((t, a) => { const x = (a.dossiers || []).find(y => y.id === d.id); const k = (x && x.partie) || 'autre'; t[k] = (t[k] || 0) + 1; return t; }, {}) : null,
      note: emails ? '' : 'emails non comptés (boîte Exchange non lue ou serveur injoignable)'
    },
    echeances_tenues: tenues, echeances_depassees_non_levees: depassees,
    pieces_encore_attendues: attendues.slice(0, 15),
    fonds,
    historique: faitsHistoriqueBilan(d.historique),
    evenements_recents: (d.historique || []).slice(-15).map(h => ({ date: String(h.date || '').slice(0, 10), texte: String(h.texte || '').slice(0, 160) })),
    consigne: 'Rédige un résumé court et facile à lire pour la notaire : 1) où en est le dossier, 2) ce qui s’est passé (dates clés, délais comparés à la moyenne de l’étude), 3) échanges avec le client (emails, appels), 4) ce qui a bloqué, 5) ce qui s’est bien passé. Chiffres exacts, rien d’inventé ; une donnée absente se dit absente.'
  };
}

// Le bouton « Résumé pour Sophie » de la fiche : la même demande à CLAIRE, dans sa conversation.
function demanderResumeDossier(id) {
  const d = dossiers.find(x => x.id === id);
  if (!d) return;
  if (typeof definirOnglet === 'function') definirOnglet('assistant');
  setTimeout(() => envoyerDemandeAssistant(`Fais le résumé du dossier ${libelleDossierAffiche(d)} pour Sophie : ce qui s’est passé, les échanges avec le client, ce qui a bloqué et ce qui s’est bien passé.`), 50);
}
