// Gestes de « Demander à CLAIRE » ajoutés le 28/10 (étude : « il faut que l'on puisse demander à Claire si elle peut vérifier s'il y a des
// inscriptions, si la DIA ou le CU ont été demandés et quand, et de terminer une routine. À partir de maintenant toute nouvelle fonction,
// Claire doit pouvoir la réaliser comme moi ou un collaborateur, à notre demande »). Chaque outil appelle la fonction de l'écran ; ce qui
// écrit sur la fiche passe par la carte « Autoriser / Refuser » (client/66). Résultats masqués par le serveur comme tout résultat d'outil.

// Pure : les états hypothécaires parmi les pièces jointes relevées dans Authentic pour ce dossier.
// Le retour d'une réquisition hors formalité (wiki de Fichorga, 28/10) : trois documents — « Etat réponse », « Annexe usager »,
// « Certificat conservateur » — rangés dans les pièces jointes, souvent sous « Retours SPF Téléactes » ; seul l'état-réponse se lit.
// La demande elle-même (« Réquisition d'état », « HF … ») et les deux autres ne sont jamais prises.
var RE_PIECE_RETOUR_SPF_NON_ETAT = /annexe\s*usager|certificat\s*(du\s*)?conservateur|r[ée]quisition\s*d.[ée]tat|^\s*demande/i;
// Pure : une pièce jointe relevée est-elle un état hypothécaire à lire ?
function pieceEstEtatHypothecaire(p) {
  const nom = String((p && p.nom) || '');
  // La demande et les annexes du retour SPF jamais ; un nom qui dit la RÉPONSE (« Réponse à la réquisition d'état ») reste un état.
  if (!nom || (RE_PIECE_RETOUR_SPF_NON_ETAT.test(nom) && !/r[ée]ponse|anf/i.test(nom))) return false;
  return nomDitEtatHypothecaire(nom) || (/retours?\s*spf|hors\s*formalit|r[ée]quisition/i.test(String((p && (p.dossierGed || p.dossier)) || '')) && /r[ée]ponse|anf/i.test(nom));
}
function etatsHypothecairesGedAgent(dossierId) {
  const sd = ((instantanesAuthenticAT[dossierId] || {}).inst || {}).sousDossier;
  return ((sd && sd.pieces) || []).filter(pieceEstEtatHypothecaire);
}

// Les natures d'inscriptions et de charges connues : seul un libellé reconnu part vers l'IA (audit 0.385.0 : une nature en texte libre,
// mise en minuscules, laissait passer « au profit de m. durand bernard » ; en capitales, le masquage la rendait illisible).
var NATURES_CHARGES_AGENT = [
  [/pr[ée]teur de deniers.*hypoth[èe]que|hypoth[èe]que.*pr[ée]teur de deniers/, 'privilège de prêteur de deniers et hypothèque conventionnelle'],
  [/pr[ée]teur de deniers/, 'privilège de prêteur de deniers'], [/privil[èe]ge (du|de) vendeur/, 'privilège du vendeur'],
  [/privil[èe]ge (du |de )?syndic/, 'privilège du syndicat des copropriétaires'], [/privil[èe]ge du tr[ée]sor/, 'privilège du Trésor'],
  [/hypoth[èe]que l[ée]gale/, 'hypothèque légale'], [/hypoth[èe]que judiciaire/, 'hypothèque judiciaire'],
  [/hypoth[èe]que conventionnelle/, 'hypothèque conventionnelle'], [/hypoth[èe]que/, 'hypothèque'],
  [/commandement|saisie/, 'saisie (commandement valant saisie)'], [/nantissement/, 'nantissement'],
  [/renouvellement/, 'renouvellement d’inscription'], [/servitude/, 'servitude'], [/pacte de pr[ée]f[ée]rence/, 'pacte de préférence'],
  [/insaisissabilit[ée]/, 'déclaration d’insaisissabilité'], [/droit de retour/, 'droit de retour'], [/interdiction d.ali[ée]ner/, 'interdiction d’aliéner'],
  [/r[ée]serve d.usufruit|usufruit/, 'usufruit'], [/bail/, 'bail'], [/privil[èe]ge/, 'privilège']
];
function natureChargePourAgent(nature, page) {
  const n = normaliserPourRecherche(String(nature || ''));
  const t = NATURES_CHARGES_AGENT.find(([re]) => re.test(n));
  return t ? t[1] : `charge (nature à lire sur l’état, p. ${page || '?'})`;
}

// Pure : la lecture gardée sur la fiche, pour l'agent (ni rédacteur ni complément en entier : nature, créancier, montant, dates, état).
function lectureEtatHypothecairePourAgent(e, d) {
  if (!e || !Array.isArray(e.inscriptions)) return null;
  // Avec le dossier : les inscriptions du bien vendu seulement, hors retirées à la main (étude 30/10, client/147) ; les autres biens comptés.
  const r = d && d.etatHypothecaire === e ? inscriptionsDuBien(d) : null;
  const liste = r ? r.liees.concat(r.aVerifier) : e.inscriptions;
  // Le créancier part masqué en entier (clé `creancier` du serveur) et revient en clair dans la réponse.
  const ligne = x => ({ nature: natureChargePourAgent(x.nature, x.page), creancier: x.creancier || '', montant: x.montant || '', depose_le: x.dateDepot || '', reference: x.reference || '',
    date_extreme_effet: x.dateExtremeEffet || '', etat: x.etat === 'en_cours' ? 'en cours' : x.etat === 'perimee' ? 'périmée' : 'radiée', page: x.page });
  return {
    relu_le: e.luLe || '', etat_delivre_le: e.delivreLe || '', lecture_complete: lectureEtatComplete(e),
    inscriptions_en_cours: liste.filter(x => x.etat === 'en_cours').map(ligne),
    radiees_ou_perimees: liste.filter(x => x.etat !== 'en_cours').map(ligne),
    ...(r ? { inscriptions_d_autres_biens_du_vendeur: r.autres.length, retirees_de_la_fiche_par_l_etude: ((e.retirees) || []).length } : {}),
    charges_signalees_dans_un_complement: (e.chargesComplement || []).map(c => ({ nature: natureChargePourAgent(c.nature, c.page), page: c.page })),
    formalites_en_attente_ou_rejetees: e.enAttente || 0,
    faces_de_fiches_anciennes_a_relire: e.facesStock || 0
  };
}

// Outil `etat_hypothecaire` : la lecture déjà faite, ou une nouvelle relecture (le bouton « Relire l'état ») après « Autoriser » — elle
// ajoute des pièces à la checklist et écrit dans le canal du dossier.
async function etatHypothecaireAgent(e) {
  const d = dossiers.find(x => x.id === (e && e.dossier_id));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  const deja = lectureEtatHypothecairePourAgent(d.etatHypothecaire, d);
  // Retirer une inscription erronée de la fiche (le geste de la croix, client/147) : après « Autoriser », rien dans Authentic.
  if (e && e.retirer) {
    const ins = d.etatHypothecaire && (d.etatHypothecaire.inscriptions || []).find(x => x.reference && x.reference === String(e.retirer).trim());
    if (!ins) return { erreur: 'aucune inscription de cette référence d’enliassement sur la fiche (lis d’abord etat_hypothecaire)' };
    if (!(await demanderAutorisationAgent(`Retirer de la fiche de ${libelleDossierAffiche(d)} l’inscription ${ins.reference} (erreur de lecture) et ses pièces de mainlevée pas encore reçues — rien n’est changé dans Authentic.`))) return { refuse: true, message: 'l’utilisateur a refusé' };
    const r = retirerInscriptionDossier(d, cleInscriptionEH(ins));
    if (!r) return { erreur: 'inscription introuvable' };
    sauvegarder(d); render();
    return { fait: true, retiree: ins.reference, pieces_retirees: r.pieces.length };
  }
  if (!(e && e.relire) && deja) return Object.assign({ dossier_id: d.id }, deja);
  // L'instantané d'Authentic, frais (absent, en échec ou de plus d'une minute : relu ; un chargement déjà lancé est attendu).
  if (typeof chargerInstantaneAuthenticAT === 'function') {
    for (let i = 0; i < 40 && instantanesAuthenticAT[d.id] && instantanesAuthenticAT[d.id].enCours; i++) await new Promise(ok => setTimeout(ok, 250));
    const ent = instantanesAuthenticAT[d.id];
    if (!ent || !ent.inst || Date.now() - ent.t > DUREE_INSTANTANE_AT_MS) await chargerInstantaneAuthenticAT(d.id);
  }
  const etats = etatsHypothecairesGedAgent(d.id);
  if (!etats.length) {
    const sd = ((instantanesAuthenticAT[d.id] || {}).inst || {}).sousDossier;
    if (sd && sd.piecesIncompletes) return { dossier_id: d.id, note: 'la liste des pièces jointes relevée dans Authentic est INCOMPLÈTE (répertoires restés repliés) : l’état hypothécaire peut y être — ne dis jamais qu’il n’y en a pas ; propose de relire le dossier dans Authentic', derniere_lecture: deja };
    return { dossier_id: d.id, note: 'aucun état hypothécaire parmi les pièces jointes relevées dans Authentic pour ce dossier : lis d’abord le dossier dans Authentic (authentic_claire, mode lire), ou l’état n’est pas encore arrivé', derniere_lecture: deja };
  }
  if ([...relecturesEtatEnCours].some(v => v.startsWith(d.id + '|'))) return { erreur: 'une relecture de cet état est déjà en cours : attends son résultat' };
  // Les candidats : un nom d'état-réponse (« Etat réponse », « ANF ») d'abord, puis les autres (réquisition hors formalité…), du dernier
  // relevé au premier ; essayés dans l'ordre jusqu'à un état-réponse lu (audit 0.385.0). Aucun NOM de pièce ne part à l'IA.
  const ordre = etats.slice().reverse().sort((a, b) => (/etat\s*r[ée]?\s*ponse|anf/i.test(b.nom) ? 1 : 0) - (/etat\s*r[ée]?\s*ponse|anf/i.test(a.nom) ? 1 : 0)).slice(0, 3);
  if (!(e && e.sansCarte) && !(await demanderAutorisationAgent(`Relire l’état hypothécaire de ${libelleDossierAffiche(d)} dans Authentic (une minute environ) : inscriptions relevées sur la fiche, pièces de mainlevée ajoutées à la checklist s’il y a une inscription en cours, message dans le canal du dossier.`))) {
    return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  }
  let r = null;
  for (const piece of ordre) {
    r = await relireEtatHypothecaireAT(d.id, piece.pjId);
    if (r && r.etat) break;
    if (!(r && /forme d.un état-réponse/.test(String(r.erreur || '')))) break;
  }
  if (!r || !r.etat) return { erreur: 'relecture non faite : ' + ((r && r.erreur) || 'erreur') };
  return Object.assign({ dossier_id: d.id, fait: true }, lectureEtatHypothecairePourAgent(d.etatHypothecaire, d) || {});
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
      renonciation_recue: !!(d.pieces && d.pieces.renonciationPreemption === 'recue'),
      // Rien à attendre : renonciation reçue (même en pièce personnalisée), DPU non applicable d'après l'analyse (étude 09/10).
      preemption_levee: typeof preemptionLevee === 'function' ? !!preemptionLevee(d) : false,
      dpu_non_applicable: typeof droitNonApplicable === 'function' ? !!droitNonApplicable(d, 'dpu') : false
    },
    cu: g.cua ? { demande: true, depose_le: g.cua.deposeLe || '', numero_du_guichet: g.cua.numero || '', par: 'guichet unique (GNAU)' } : { demande: false },
    autres_demandes_dans_authentic: Object.entries(dem).filter(([cle]) => cle !== 'renonciationPreemption').map(([cle, v]) => ({ piece: libelle(cle), envoyee_le: (v && v.date) || '' }))
  };
  // Un CU demandé dans Authentic (sans guichet) : dit aussi dans « cu ».
  const cuAuthentic = sortie.autres_demandes_dans_authentic.find(x => /urbanisme/i.test(x.piece));
  // Comme la DIA : la date la plus ancienne des deux (guichet, Authentic).
  if (cuAuthentic && (!g.cua || (cuAuthentic.envoyee_le && (!g.cua.deposeLe || cuAuthentic.envoyee_le < g.cua.deposeLe)))) {
    sortie.cu = { demande: true, depose_le: cuAuthentic.envoyee_le, par: 'Authentic', numero_du_guichet: (g.cua && g.cua.numero) || '' };
  }
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
  // La liste relue (pas une copie ancienne) ; les propositions reportées (« Plus tard ») n'y sont pas jusqu'à leur date.
  if (typeof chargerPropositionsClaire === 'function') { try { await chargerPropositionsClaire('a-traiter'); } catch (err) { /* liste gardée */ } }
  const toutes = propositionsClaire.liste || [];
  if (!e || e.mode !== 'terminer') {
    const liste = toutes.filter(p => !e || !e.dossier_id || p.dossierId === e.dossier_id).slice(0, 40).map(p => ({
      proposition_id: p.id, titre: p.titre || '', type: p.type || '', routine: p.routineNom || p.routine || '', dossier_id: p.dossierId || '',
      etat: p.etat === 'acceptee' ? 'autorisée, à terminer' : 'à décider', proposee_le: String(p.creeLe || '').slice(0, 10)
    }));
    return { propositions: liste, note: 'terminer une proposition : mode terminer avec son proposition_id (seulement une proposition autorisée, document ou tâche) ; les propositions reportées n’apparaissent qu’à leur date' };
  }
  const p = toutes.find(x => x.id === e.proposition_id) || (typeof propositionParId === 'function' ? propositionParId(e.proposition_id) : null);
  if (!p) return { erreur: 'proposition introuvable : liste-les d’abord (mode lister)' };
  if (p.termineeLe) return { erreur: 'déjà terminée' };
  if (p.etat !== 'acceptee') return { erreur: 'seule une proposition autorisée se termine ; une proposition à décider s’autorise ou se refuse sur sa carte' };
  // Les mêmes conditions que le bouton « Terminé » de la carte (client/112) : document ou tâche, responsable ou administrateur.
  if (p.type !== 'document' && p.type !== 'tache') return { erreur: 'cette proposition n’a rien à terminer (seuls un document ou une tâche se terminent)' };
  if (typeof peutDeciderProposition === 'function' && !peutDeciderProposition(p, utilisateurPoste)) return { erreur: 'seul son responsable ou un administrateur peut la terminer' };
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
