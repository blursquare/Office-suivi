// Gestes de « Demander à CLAIRE » ajoutés le 28/10 (étude : « il faut que l'on puisse demander à Claire si elle peut vérifier s'il y a des
// inscriptions, si la DIA ou le CU ont été demandés et quand, et de terminer une routine. À partir de maintenant toute nouvelle fonction,
// Claire doit pouvoir la réaliser comme moi ou un collaborateur, à notre demande »). Chaque outil appelle la fonction de l'écran ; ce qui
// écrit sur la fiche passe par la carte « Autoriser / Refuser » (client/66). Résultats masqués par le serveur comme tout résultat d'outil.

// Pure : les états hypothécaires parmi les pièces jointes relevées dans Authentic pour ce dossier.
function etatsHypothecairesGedAgent(dossierId) {
  const sd = ((instantanesAuthenticAT[dossierId] || {}).inst || {}).sousDossier;
  return ((sd && sd.pieces) || []).filter(p => nomDitEtatHypothecaire(p.nom));
}

// Pure : la lecture gardée sur la fiche, pour l'agent (ni rédacteur ni complément en entier : nature, créancier, montant, dates, état).
function lectureEtatHypothecairePourAgent(e) {
  if (!e || !Array.isArray(e.inscriptions)) return null;
  // La nature en minuscules : en capitales (« HYPOTHEQUE CONVENTIONNELLE »), le masquage la prendrait pour un nom.
  const ligne = x => ({ nature: String(x.nature || '').toLowerCase(), creancier: x.creancier || '', montant: x.montant || '', depose_le: x.dateDepot || '', reference: x.reference || '',
    date_extreme_effet: x.dateExtremeEffet || '', etat: x.etat === 'en_cours' ? 'en cours' : x.etat === 'perimee' ? 'périmée' : 'radiée', page: x.page });
  return {
    relu_le: e.luLe || '', etat_delivre_le: e.delivreLe || '', lecture_complete: lectureEtatComplete(e),
    inscriptions_en_cours: e.inscriptions.filter(x => x.etat === 'en_cours').map(ligne),
    radiees_ou_perimees: e.inscriptions.filter(x => x.etat !== 'en_cours').map(ligne),
    charges_signalees_dans_un_complement: (e.chargesComplement || []).map(c => ({ nature: String(c.nature || '').toLowerCase(), page: c.page })),
    formalites_en_attente_ou_rejetees: e.enAttente || 0,
    faces_de_fiches_anciennes_a_relire: e.facesStock || 0
  };
}

// Outil `etat_hypothecaire` : la lecture déjà faite, ou une nouvelle relecture (le bouton « Relire l'état ») après « Autoriser » — elle
// ajoute des pièces à la checklist et écrit dans le canal du dossier.
async function etatHypothecaireAgent(e) {
  const d = dossiers.find(x => x.id === (e && e.dossier_id));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  const deja = lectureEtatHypothecairePourAgent(d.etatHypothecaire);
  if (!(e && e.relire) && deja) return Object.assign({ dossier_id: d.id }, deja);
  if (typeof chargerInstantaneAuthenticAT === 'function' && !instantanesAuthenticAT[d.id]) await chargerInstantaneAuthenticAT(d.id);
  const etats = etatsHypothecairesGedAgent(d.id);
  if (!etats.length) {
    return { dossier_id: d.id, note: 'aucun état hypothécaire parmi les pièces jointes relevées dans Authentic pour ce dossier : lis d’abord le dossier dans Authentic (authentic_claire, mode lire), ou l’état n’est pas encore arrivé', derniere_lecture: deja };
  }
  // Le plus récent d'après la liste (le dernier relevé) ; son NOM ne part jamais à l'IA.
  const piece = etats[etats.length - 1];
  if (!(await demanderAutorisationAgent(`Relire l’état hypothécaire de ${libelleDossierAffiche(d)} dans Authentic (une minute environ) : inscriptions relevées sur la fiche, pièces de mainlevée ajoutées à la checklist s’il y a une inscription en cours, message dans le canal du dossier.`))) {
    return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  }
  const r = await relireEtatHypothecaireAT(d.id, piece.pjId);
  if (!r || r.erreur) return { erreur: 'relecture non faite : ' + ((r && r.erreur) || 'erreur') };
  return Object.assign({ dossier_id: d.id, fait: true }, lectureEtatHypothecairePourAgent(d.etatHypothecaire));
}

// Pure : la DIA et les demandes d'urbanisme (CU, alignement, numérotage…) d'un dossier — par le guichet unique (numéro relevé par
// l'extension Chrome) et par Authentic (ligne de la demande), avec leurs dates, et la réponse attendue pour la DIA.
function demandesUrbanismeDossierAgent(d) {
  const g = (d && d.gnau) || {};
  const dem = (d && d.authentic && d.authentic.demandes) || {};
  const libelle = (cle) => {
    try { const p = (checklistPieces(d.typeVente, d) || []).find(x => x.cle === cle); return p ? p.label : cle; } catch (e) { return cle; }
  };
  const dia = typeof diaEnvoyeeDossier === 'function' ? diaEnvoyeeDossier(d) : null;
  const sortie = {
    dia: {
      demandee: !!dia,
      envoyee_le: dia ? dia.date : '',
      par: dia ? (dia.source === 'guichet' ? 'guichet unique (GNAU)' : 'Authentic') : '',
      numero_du_guichet: (g.dia && g.dia.numero) || '',
      reponse_attendue_le: typeof echeanceDiaDossier === 'function' ? echeanceDiaDossier(d) : '',
      renonciation_recue: !!(d.pieces && d.pieces.renonciationPreemption === 'recue')
    },
    cu: g.cua ? { demande: true, depose_le: g.cua.deposeLe || '', numero_du_guichet: g.cua.numero || '', par: 'guichet unique (GNAU)' } : { demande: false },
    autres_demandes_dans_authentic: Object.entries(dem).filter(([cle]) => cle !== 'renonciationPreemption').map(([cle, v]) => ({ piece: libelle(cle), envoyee_le: (v && v.date) || '' }))
  };
  // Un CU demandé dans Authentic (sans guichet) : dit aussi dans « cu ».
  const cuAuthentic = sortie.autres_demandes_dans_authentic.find(x => /urbanisme/i.test(x.piece));
  if (!g.cua && cuAuthentic) sortie.cu = { demande: true, depose_le: cuAuthentic.envoyee_le, par: 'Authentic' };
  return sortie;
}

function urbanismeDemandesAgent(e) {
  const d = dossiers.find(x => x.id === (e && e.dossier_id));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  return Object.assign({ dossier_id: d.id }, demandesUrbanismeDossierAgent(d));
}

// Outil `routines_claire` : lister les propositions de CLAIRE (à décider, à terminer) d'un dossier ou de toutes, et « Terminé » sur une
// proposition autorisée — le bouton de la carte, après « Autoriser ».
async function routinesClaireAgent(e) {
  const toutes = propositionsClaire.liste || [];
  if (!e || e.mode !== 'terminer') {
    const liste = toutes.filter(p => !e || !e.dossier_id || p.dossierId === e.dossier_id).slice(0, 40).map(p => ({
      proposition_id: p.id, titre: p.titre || '', routine: p.routineNom || p.routine || '', dossier_id: p.dossierId || '',
      etat: p.etat === 'acceptee' ? 'autorisée, à terminer' : 'à décider', proposee_le: String(p.creeLe || '').slice(0, 10)
    }));
    return { propositions: liste, note: 'terminer une proposition : mode terminer avec son proposition_id (seulement une proposition autorisée)' };
  }
  const p = toutes.find(x => x.id === e.proposition_id) || (typeof propositionParId === 'function' ? propositionParId(e.proposition_id) : null);
  if (!p) return { erreur: 'proposition introuvable : liste-les d’abord (mode lister)' };
  if (p.termineeLe) return { erreur: 'déjà terminée' };
  if (p.etat !== 'acceptee') return { erreur: 'seule une proposition autorisée se termine ; une proposition à décider s’autorise ou se refuse sur sa carte' };
  const d = p.dossierId ? dossiers.find(x => x.id === p.dossierId) : null;
  if (!(await demanderAutorisationAgent(`Marquer terminée la proposition « ${p.titre || 'de CLAIRE'} »${d ? ' — ' + libelleDossierAffiche(d) : ''} : la carte est fermée, CLAIRE ne la reproposera pas.`))) {
    return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  }
  try {
    await enregistrerDecisionProposition(p.id, 'terminee');
    await apresDecisionProposition();
  } catch (err) { return { erreur: 'non enregistré : ' + String((err && err.message) || err).slice(0, 120) }; }
  return { fait: true, proposition_id: p.id };
}
