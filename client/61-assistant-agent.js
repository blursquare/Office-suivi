  // ---- « Demander à CLAIRE » en agent (étude 11/10 : « il faut que Demander à CLAIRE soit aussi intelligent que toi ») ----
  // Claude raisonne côté serveur (server/src/assistantAgent.js) et appelle des OUTILS que ce fichier exécute avec les fonctions
  // habituelles du poste : chercher et lire des dossiers (état, pièces, échéances, fonds…), « À faire », l'agenda, et faire un
  // geste par l'exécutant de « Demander à CLAIRE » (rappel, coche, email dans sa fenêtre, rendez-vous confirmé…). Les résultats
  // partent EN CLAIR au serveur de l'étude, qui les MASQUE avant Claude (noms, adresses, emails, téléphones → codes) et rétablit
  // les codes au retour. Sans agent (pas de clé Claude, agent coupé, erreur) : la compréhension d'une phrase d'avant répond.

  let assistantAgentConversation = '';
  var assistantEtapeAgent = '';              // « Je lis la fiche… » sous l'indicateur d'écriture
  var MAX_DOSSIERS_LISTE_AGENT = 400;

  var LIBELLES_OUTILS_AGENT = {
    chercher_dossiers: 'Je cherche le dossier…', lister_dossiers: 'Je parcours les dossiers…', lire_dossier: 'Je lis la fiche…',
    taches_du_jour: 'Je regarde « À faire »…', agenda: 'Je consulte l’agenda…', depuis_hier: 'Je regarde ce qui est arrivé…',
    documents_recents: 'Je regarde les derniers documents…', ouvrir_documents: 'Je prépare les documents…',
    documents_du_dossier: 'Je parcours le dossier du NAS…', lire_document: 'Je lis le document…', chercher_dans_la_memoire: 'Je cherche dans la mémoire de l’étude…', rediger_document: 'Je rédige le document…',
    outil_claire: 'J’utilise l’outil…', outil_champs: 'Je remplis l’outil…', artefact: 'Je reprends ce qui est ouvert à droite…', modele_email: 'Je prépare le modèle d’email…', nouveau_dossier_vente: 'Je prépare le nouveau dossier…', yousign_rib: 'Je consulte Yousign…', yousign_agent: 'Je demande à l’agent Yousign…', action_dossier: 'Je prépare l’action…', demander_collaborateur: 'Je prépare la demande…', repertoire_ajouter: 'Je prépare le contact…', authentic_claire: 'Je travaille dans Authentic…', authentic_lire: 'Je regarde ce qu’Authentic montre…', etat_hypothecaire: 'Je regarde l’état hypothécaire…', urbanisme_demandes: 'Je regarde la DIA et le CU…', routines_claire: 'Je regarde les routines…', coordonnees_client: 'Je cherche les coordonnées…', courrier_fonds_banque: 'Je prépare le courrier à la banque…', authentic_comptabilite: 'Je regarde la comptabilité…', lectures_documents: 'Je regarde les documents lus…', bilan_dossier: 'Je reprends l’histoire du dossier…',
    actions_en_lot: 'Je prépare le lot d’actions…', scans_claire: 'Je regarde Claire Scan…', nas_dossier: 'Je regarde le dossier du NAS…', nas_libre: 'Je cherche dans le NAS…', calcul: 'Je calcule…', agenda_evenement: 'Je prépare la modification de l’agenda…',
    faire_geste: 'Je m’en occupe…', consulter_site: 'Je vais sur le site…', controles_relecture: 'Je relis l’acte avec les contrôles de CLAIRE…', chercher_conversations: 'Je cherche dans nos conversations passées…'
  };

  // Pure : la réponse de l'agent en HTML échappé — comme une réponse de Claude : titres (# à ####), listes à puces et numérotées,
  // tableaux (| a | b | avec leur ligne |---|---|), citations (>), filet (---), **gras**, *italique*, `code`.
  function htmlReponseAgentAssistant(texte) {
    const lignes = String(texte || '').replace(/\r/g, '').split('\n');
    const blocs = [];
    let liste = null;      // { ordonnee, debut, items: [{ texte, sous: [] }] }
    let para = [];
    let citation = [];
    const enLigne = (t) => citationsCliquablesAssistant(escapeHtml(t)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<i>$2</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>'));
    const finPara = () => { if (para.length) { blocs.push(`<p>${para.map(enLigne).join('<br>')}</p>`); para = []; } };
    const htmlItem = (it) => `<li>${it.texte.split('\n').map(enLigne).join('<br>')}${it.sous.length ? `<ul class="asst-liste asst-sous-liste">${it.sous.map(x => `<li>${enLigne(x)}</li>`).join('')}</ul>` : ''}</li>`;
    const finListe = () => { if (liste) { const b = liste.ordonnee ? 'ol' : 'ul'; blocs.push(`<${b} class="asst-liste"${liste.ordonnee && liste.debut > 1 ? ` start="${liste.debut}"` : ''}>${liste.items.map(htmlItem).join('')}</${b}>`); liste = null; } };
    const finCitation = () => { if (citation.length) { blocs.push(`<blockquote class="asst-citation">${citation.map(enLigne).join('<br>')}</blockquote>`); citation = []; } };
    const fin = () => { finPara(); finListe(); finCitation(); };
    const cellules = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    const estLigneTableau = (l) => /^\s*\|.*\|\s*$/.test(l);
    const estSeparateur = (l) => estLigneTableau(l) && cellules(l).every(c => /^:?-+:?$/.test(c));
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      if (estLigneTableau(l) && i + 1 < lignes.length && estSeparateur(lignes[i + 1])) {
        fin();
        const entete = cellules(l);
        const aligne = cellules(lignes[i + 1]).map(c => /^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : '');
        const corps = [];
        i += 2;
        while (i < lignes.length && estLigneTableau(lignes[i]) && !estSeparateur(lignes[i])) { corps.push(cellules(lignes[i])); i++; }
        i--;
        const style = (k) => aligne[k] ? ` style="text-align:${aligne[k]}"` : '';
        blocs.push(`<div class="asst-table-defile"><table class="asst-table"><thead><tr>${entete.map((c, k) => `<th${style(k)}>${enLigne(c)}</th>`).join('')}</tr></thead><tbody>${corps.map(r => `<tr>${entete.map((_, k) => `<td${style(k)}>${enLigne(r[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      const titre = l.match(/^\s{0,3}(#{1,4})\s+(.*?)\s*#*\s*$/);
      if (titre) { fin(); const n = Math.min(4, titre[1].length); blocs.push(`<h${n + 2} class="asst-titre asst-titre-${n}">${enLigne(titre[2])}</h${n + 2}>`); continue; }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) { fin(); blocs.push('<hr class="asst-filet">'); continue; }
      const quote = l.match(/^\s*>\s?(.*)$/);
      if (quote) { finPara(); finListe(); citation.push(quote[1]); continue; }
      const puce = l.match(/^(\s*)(?:([-•*])|(\d+)[.)])\s+(.*)$/);
      // Sous-puce d'un élément de liste (au moins deux espaces d'indentation) : rangée sous l'élément précédent.
      if (puce && liste && puce[1].length >= 2 && liste.items.length) { liste.items[liste.items.length - 1].sous.push(puce[4]); continue; }
      if (puce) {
        finPara(); finCitation();
        const ordonnee = !!puce[3];
        if (liste && liste.ordonnee !== ordonnee) finListe();
        (liste = liste || { ordonnee, debut: ordonnee ? parseInt(puce[3], 10) || 1 : 1, items: [] }).items.push({ texte: puce[4], sous: [] });
        continue;
      }
      // Ligne de suite d'un élément (indentée, sans puce) : elle reste dans l'élément — « 1. Condition » / texte / « 2. Vente ».
      if (liste && liste.items.length && /^\s{2,}\S/.test(l)) { const it = liste.items[liste.items.length - 1]; if (it.sous.length) it.sous[it.sous.length - 1] += ' ' + l.trim(); else it.texte += '\n' + l.trim(); continue; }
      if (!l.trim()) { fin(); continue; }
      finListe(); finCitation();
      para.push(l.trim());
    }
    fin();
    return blocs.join('') || '<p></p>';
  }

  // ---- Les outils, exécutés ici ----

  function etatTexteAgent(d) {
    try { const e = etatDossier(d, isoAujourdhuiLocal()); return { statut: e.texte, statut_detail: e.detail || '' }; } catch (e) { return { statut: '', statut_detail: '' }; }
  }

  function resumeDossierAgent(d) {
    const sur = (fn, defaut) => { try { return fn(); } catch (e) { return defaut; } };
    const prochaine = estSuccession(d) ? null : sur(() => prochaineEcheanceDetail(d), null);
    return {
      id: d.id,
      libelle: libelleDossierAffiche(d),
      type: estSuccession(d) ? 'succession' : (d.typeVente || 'vente'),
      archive: !!d.archive,
      ...etatTexteAgent(d),
      responsable: d.responsable || '',
      role_etude: d.roleNotaire || '',
      avant_contrat_signe_le: d.dateAvantContrat || '',
      date_butoir: d.acte || '',
      signature: d.rendezVousSignature ? { date: d.rendezVousSignature, heure: d.rendezVousSignatureHeure || '', faite: sur(() => echeanceValidee(d, 'rendezVousSignature'), false) } : null,
      prochaine_echeance: prochaine ? { libelle: prochaine.label, date: prochaine.iso || '', jours: prochaine.jours } : null,
      offre_de_pret: estSuccession(d) ? '' : d.sansPret ? 'sans prêt' : sur(() => echeanceValidee(d, 'pret'), false) ? 'reçue' : 'attendue',
      // Pour « quelle offre de prêt avec inscription hypothécaire avons-nous reçue en octobre ? » (étude 21/10) : la date où CLAIRE a
      // retrouvé ou noté l'offre, le montant, les garanties lues dans l'offre et, à part, les hypothèques.
      offre_de_pret_recue_le: estSuccession(d) || d.sansPret ? '' : sur(() => dateObtentionPret(d) || '', ''),
      montant_du_pret: estSuccession(d) || d.sansPret ? null : (Number(d.montantPret) > 0 ? Number(d.montantPret) : null),
      garanties_du_pret: estSuccession(d) || d.sansPret ? [] : sur(() => (garantiesPretAffichees(d) || {}).liste || [], []),
      inscription_hypothecaire: estSuccession(d) || d.sansPret ? [] : sur(() => hypothequesPret(d).map(h => h.label), []),
      pieces_manquantes: estSuccession(d) ? 0 : sur(() => piecesAttenduesDossier(d).length, 0),
      fonds: estSuccession(d) ? '' : sur(() => bilanFondsAssistant(d), '')
    };
  }

  // Qui reçoit l'acte et quels confrères écrire, d'après la fiche (côté qui reçoit l'acte, sinon le rôle de l'étude et son côté).
  function notairesActeAgent(d) {
    if (estSuccession(d)) return {};
    const notre = coteEtudeDossier(d);
    const recoit = d.coteInstrumentaire === 'vendeur' || d.coteInstrumentaire === 'acquereur' ? d.coteInstrumentaire
      : notre && d.roleNotaire === 'participant' ? (notre === 'vendeur' ? 'acquereur' : 'vendeur') : notre && d.roleNotaire === 'instrumentaire' ? notre : '';
    const notaire = c => (c === 'vendeur' ? d.notaireVendeur : d.notaireAcquereur) || '';
    const confreres = [];
    if (confrereRepresenteVendeur(d)) confreres.push({ cote: 'vendeur', notaire: notaire('vendeur'), recoit_l_acte: recoit === 'vendeur', email_connu: !!emailConfrereVendeurDossier(d) });
    if (notaireParticipantRepresenteAcquereur(d)) confreres.push({ cote: 'acquereur', notaire: notaire('acquereur'), recoit_l_acte: recoit === 'acquereur', email_connu: !!(d.emailNotaireParticipant || emailOfficeConfrereAcquereur(d)) });
    return {
      notaire_qui_recoit_l_acte: recoit ? { cote: recoit, notaire: notaire(recoit), notre_office: recoit === notre } : null,
      confreres,
      email_au_confrere: confreres.length ? 'faire_geste email avec partie « confrere » (le confrère qui reçoit l’acte d’abord)' : ''
    };
  }

  function lireDossierAgent(d) {
    const sur = (fn, defaut) => { try { return fn(); } catch (e) { return defaut; } };
    const auj = isoAujourdhuiLocal();
    const pieces = d.pieces || {};
    const checklist = estSuccession(d) ? [] : sur(() => checklistPieces(d.typeVente, d), []);
    return {
      ...resumeDossierAgent(d),
      nom_du_dossier: d.nom || '',
      parties: (d.parties || []).filter(Boolean).map(p => ({ role: p.role || '', civilite: p.civilite || '', prenom: p.prenom || '', nom: p.nom || '', nom_usage: p.nomUsage || '', societe: p.qualitePersonne === 'morale' })),
      situation_vendeurs: d.situationVendeur || '', situation_acquereurs: d.situationAcquereur || '',
      // Un côté accompagné par un confrère : jamais ses coordonnées (déontologie, relecture 0.386.1) — on écrit au confrère.
      coordonnees: (() => {
        const v = sur(() => confrereRepresenteVendeur(d), false), a = sur(() => notaireParticipantRepresenteAcquereur(d), false);
        return { email_vendeur: v ? '' : d.emailVendeur || '', telephone_vendeur: v ? '' : d.telephoneVendeur || '', vendeur_represente_par_un_confrere: !!v,
          email_acquereur: a ? '' : d.emailAcquereur || '', telephone_acquereur: a ? '' : d.telephoneAcquereur || '', acquereur_represente_par_un_confrere: !!a };
      })(),
      bien: { adresse: d.adresseBien || '', prix: d.prixVente || null, prix_mobilier: d.prixMobilier || null, cadastre: sur(() => parcellesDossier(d).map(p => ({ prefixe: p.prefixe || '', section: p.section, numero: p.numero, surface: p.surface || '', nature: p.nature || '' })), []), lots: sur(() => (d.bien && d.bien.lots) || [], []) },
      notaire_vendeur: d.notaireVendeur || '', notaire_acquereur: d.notaireAcquereur || '', agence: d.nomAgence || '',
      // Étude 26/10 : l'agent demandait « lequel est le confrère qui rédige l'acte ? » alors que la fiche le dit.
      ...sur(() => notairesActeAgent(d), {}),
      honoraires_agence_ttc: sur(() => (d.honoraires && (d.honoraires.montantTTC || d.honoraires.montant)) || null, null),
      dates: { obtention_pret: d.pret || '', vente_prealable: d.ventebien || '', appel_de_fonds_envoye: d.appelFonds || '', projet_envoye: d.projetEnvoye || '', date_butoir: d.acte || '' },
      echeances: estSuccession(d) ? [] : sur(() => echeancesPlanning(d).map(it => ({ libelle: it.label, date: it.iso || '', jours: it.iso ? joursEntre(auj, it.iso) - 1 : null })), []),
      pieces_recues: checklist.filter(p => pieces[p.cle] === 'recue').map(p => p.label),
      pieces_attendues: estSuccession(d) ? [] : sur(() => piecesAttenduesDossier(d), []),
      engagements_du_vendeur: sur(() => ((d.analyseJuridique && d.analyseJuridique.engagements) || []).map(e => ({ texte: String(e.texte || e.libelle || '').slice(0, 300), fait: !!e.fait })), []),
      fonds_confirmes_au_client_le: d.receptionFondsConfirmeeLe || '',
      urbanisme: sur(() => droitsPreemptionFiche(d.preemption).map(x => ({ droit: x.titre || x.cle, statut: x.statut, motif: x.motif || '' })), []),
      authentic: sur(() => d.authentic ? { reference: d.referenceAuthentic || '', acte: d.authentic.acte || null } : null, null),
      // Vision globale (étude 26/10 : « une vision globale d'un dossier, force de proposition ») : ce qui compte en un coup d'œil, calculé comme les écrans.
      vue_d_ensemble: sur(() => vueDEnsembleDossierAgent(d), null),
      // Vocabulaire fermé (date + sorte), jamais le texte libre de l'historique : un nom absent des fiches en tête d'un texte court passait (relecture 0.386.1).
      historique_recent: (d.historique || []).slice(-20).map(h => ({ date: String(h.date || '').slice(0, 10), sorte: sorteEvenementBilan(h && h.texte) })).filter(x => x.sorte !== 'autre').slice(-12)
    };
  }

  // La vue d'ensemble d'un dossier : état, probabilité de tenue de la signature, ce qui bloque, les gestes dus, ce que CLAIRE a déjà préparé.
  function vueDEnsembleDossierAgent(d) {
    const auj = isoAujourdhuiLocal();
    const etat = etatDossier(d, auj);
    const echeances = estSuccession(d) ? [] : echeancesPlanning(d);
    const enRetard = echeances.filter(it => it.iso && it.iso < auj && !echeanceValidee(d, it.type)).map(it => it.label);
    const attendues = estSuccession(d) ? [] : piecesAttenduesDossier(d);
    const taches = actionsDuJour([d], auj).actions.filter(a => a.dossier && a.dossier.id === d.id).map(a => a.titre).slice(0, 8);
    const propositions = (propositionsClaire.liste || []).filter(p => p.dossierId === d.id).map(p => p.titre).slice(0, 6);
    let probabilite = null;
    try { if (!estSuccession(d)) probabilite = probabiliteTenueSignature(d, auj, []); } catch (e) { /* facultatif */ }
    return {
      etat: etat ? `${etat.texte}${etat.detail ? ' — ' + etat.detail : ''}` : '',
      probabilite_de_signer_a_la_date_prevue: probabilite ? probabilite.pourcent : null,
      ce_qui_baisse_la_probabilite: probabilite && Array.isArray(probabilite.facteurs) ? probabilite.facteurs.slice(0, 6).map(f => (f && (f.texte || f.libelle)) || String(f)) : [],
      echeances_depassees: enRetard,
      pieces_qui_bloquent: attendues.slice(0, 12),
      gestes_dus_maintenant: taches,
      deja_prepare_par_claire_en_attente_de_decision: propositions,
      rendez_vous_de_signature: d.rendezVousSignature ? `${d.rendezVousSignature}${d.rendezVousSignatureHeure ? ' ' + d.rendezVousSignatureHeure : ''}` : ''
    };
  }

  function chercherDossiersAgent(texte, archives) {
    const mots = normaliserPourRecherche(String(texte || '')).split(/[^a-z0-9]+/).filter(m => m.length >= 2);
    if (!mots.length) return { dossiers: [] };
    const trouves = dossiers.filter(d => d && (archives || !d.archive)).map(d => {
      const champs = normaliserPourRecherche([d.nom, d.adresseBien, d.nomAgence, d.notaireVendeur, d.notaireAcquereur, d.referenceAuthentic,
        ...(d.parties || []).map(p => p && [p.prenom, p.nom, p.nomUsage].join(' '))].join(' '));
      const score = mots.filter(m => champs.includes(m)).length;
      return { d, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || (a.d.archive ? 1 : 0) - (b.d.archive ? 1 : 0)).slice(0, 15);
    return { dossiers: trouves.map(x => resumeDossierAgent(x.d)) };
  }

  function listerDossiersAgent(etat, responsable) {
    const nom = COLLABORATEURS_AGENT[responsable] || '';
    const liste = dossiers.filter(d => d && (etat === 'tous' || (etat === 'archives' ? d.archive : !d.archive)) && (!nom || d.responsable === nom));
    // « coupe » AVANT la liste : si le texte est raccourci par le serveur, Claude le sait quand même.
    return { nombre: liste.length, ...(liste.length > MAX_DOSSIERS_LISTE_AGENT ? { coupe: `seuls les ${MAX_DOSSIERS_LISTE_AGENT} premiers sont listés : filtre par responsable ou cherche par nom` } : {}),
      dossiers: liste.slice(0, MAX_DOSSIERS_LISTE_AGENT).map(resumeDossierAgent) };
  }

  function tachesDuJourAgent() {
    const auj = isoAujourdhuiLocal();
    const { actions } = actionsDuJour(dossiersPerimetreJour(), auj);
    const { aFaire, aVenir } = rappelsDuJour(rappelsPerso, auj);
    const rappel = r => ({ texte: r.texte, date: r.echeance || '', dossier_id: r.dossierId || '' });
    return {
      collaborateur: utilisateurPoste || '',
      taches: actions.slice(0, 60).map(a => ({ tache_id: a.cle, tache: a.titre, dossier_id: a.dossier ? a.dossier.id : '', dossier: a.dossier ? libelleDossierAffiche(a.dossier) : '', precision: a.contexte || '' })),
      rappels_a_faire: aFaire.map(rappel), rappels_a_venir: aVenir.slice(0, 20).map(rappel)
    };
  }

  async function agendaAgent(debut, fin) {
    const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    if (!ok(debut) || !ok(fin) || fin < debut) return { erreur: 'dates attendues au format AAAA-MM-JJ, fin après début' };
    if (joursEntre(debut, fin) > 32) return { erreur: '31 jours au plus' };
    const evenements = await evenementsAgendaAssistant(debut, fin);
    if (evenements === null) return { erreur: 'agenda de l’office illisible pour le moment' };
    // Titre et lieu envoyés depuis 0.362.0 (étude 26/10 : « elle peut lire l'agenda, j'autorise ») — le serveur les masque comme tout résultat
    // d'outil (noms des fiches, emails, téléphones : codés ; avec l'anonymisation coupée, rien n'est masqué). Un rendez-vous hors CLAIRE
    // (donation, client inconnu des fiches) dont le nom n'est pas dans les fiches peut donc passer en clair — risque accepté par l'étude.
    return { rendez_vous: evenements.filter(e => e && e.date >= debut && e.date <= fin)
      .sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')))
      .slice(0, 200).map(e => {
        const d = dossierDeRendezVousAgent(e);
        return { evenement_id: idEvenementAgent(e), date: e.date, heure: e.journeeEntiere ? '' : (e.heure || ''), fin: e.heureFin || '', journee_entiere: !!e.journeeEntiere,
          titre: String((e && e.sujet) || '').slice(0, 160), lieu: String((e && e.lieu) || '').slice(0, 160),
          nature: natureRendezVousAgent(e), categories: (e.categories || []).filter(c => /^[A-Za-zÀ-ÿ /-]{1,30}$/.test(String(c))),
          dossier_id: d ? d.id : '', dossier: d ? libelleDossierAffiche(d) : '' };
      }) };
  }

  // Pure : la nature d'un rendez-vous d'après le début de son titre, sans rien garder du titre.
  function natureRendezVousAgent(e) {
    const t = String((e && e.sujet) || '').trim();
    if (/^(VTE|VENTE)\b/i.test(t)) return /\?/.test(t) ? 'signature de vente (option, à confirmer)' : 'signature de vente';
    if (/^SUCC/i.test(t)) return 'succession';
    if (/^DONATION/i.test(t)) return 'donation';
    if (/^(BA|JV|JS)\b/.test(t)) return 'tâche d’un collaborateur';
    if (typeof estDateButoirAgenda === 'function' && estDateButoirAgenda(e)) return 'date butoir';
    if (/absen|cong|vacances|maladie/i.test(t)) return 'absence';
    return 'autre rendez-vous';
  }

  // Le dossier de CLAIRE d'un rendez-vous : celui que le serveur a reconnu (dossierPourReferenceAgenda, règles des homonymes), sinon
  // celui qui a mémorisé cet élément d'Outlook. Jamais deviné par la date (relecture : une donation rattachée au dossier du jour).
  function dossierDeRendezVousAgent(e) {
    if (!e) return null;
    return (e.dossierId && dossiers.find(d => d && d.id === e.dossierId))
      || dossiers.find(d => d && d.rdvAgendaItem && e.itemId && d.rdvAgendaItem.itemId === e.itemId) || null;
  }

  function depuisHierAgent() {
    const docs = documentsDepuis(dossiersPerimetreDashboard(), debutDepuisHier18h());
    return { documents: docs.slice(0, 40).map(x => ({ document: x.libelle, dossier_id: x.dossier ? x.dossier.id : '', dossier: x.dossier ? libelleDossierAffiche(x.dossier) : '' })) };
  }

  // Pure : une date ISO qui existe au calendrier.
  function dateIsoAgentValide(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
    const x = new Date(iso + 'T12:00:00Z');
    return !Number.isNaN(x.getTime()) && x.toISOString().slice(0, 10) === iso;
  }

  // Le geste demande-t-il la carte d'autorisation ? Ceux de la liste ; la signature placée SANS agenda relié (elle s'écrit alors
  // sur la fiche sans autre confirmation) ; les Quotités et l'Appel de fonds quand l'outil porte un travail sur un autre dossier
  // (audit 13/10 : il était effacé sans un mot).
  function gesteAgentDemandeAutorisation(entree, d) {
    const g = entree && entree.geste;
    if (GESTES_AVEC_AUTORISATION_AGENT.includes(g)) return true;
    if (g === 'rendez_vous_placer') return !!(entree.parametres && entree.parametres.date) && !exchangeAgendaPret();
    if (g === 'quotites' || g === 'appel_fonds') {
      return travailEnCoursOutilAgent(g, d, { quotites: qtDossierLie || '', appelFonds: afDossierLie || '' });
    }
    return false;
  }

  // Le geste par l'exécutant habituel de « Demander à CLAIRE » ; son message (et ses boutons) s'affiche dans la conversation.
  async function faireGesteAgent(entree) {
    const geste = intentionAssistant(entree && entree.geste);
    if (!geste) return { erreur: 'geste inconnu' };
    const d = entree.dossier_id ? dossiers.find(x => x.id === entree.dossier_id) : null;
    // Email libre sans dossier (15/10 : « un mail à telle adresse, objet…, texte… ») : la fenêtre d'envoi s'ouvre telle que demandée.
    const pe = (entree.parametres || {});
    // Un brouillon d'email à la fois (relecture 0.374.0) : un second chasserait le premier, retouches comprises, sans un mot.
    if (geste.cle === 'email' && typeof redaction !== 'undefined' && redaction) {
      return { statut: 'en_attente_utilisateur', erreur: 'un brouillon d’email est déjà ouvert à droite : il doit être envoyé ou fermé par l’utilisateur avant le suivant (dis-le-lui ; pour le corriger, outil artefact)' };
    }
    if (geste.cle === 'email' && !d && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(pe.destinataire || '').trim())) {
      livrerEmailDossier({ destinataire: String(pe.destinataire).trim(), sujet: String(pe.objet || ''), corps: String(pe.corps || ''), geste: 'assistant' }).catch(() => {});
      return { statut: 'en_attente_utilisateur', note: 'rien n’est encore envoyé : la fenêtre d’email est ouverte, l’utilisateur doit cliquer sur « Envoyer »' };
    }
    if (geste.dossier && !d) return { erreur: 'dossier introuvable : cherche-le d’abord (chercher_dossiers) et passe son id' };
    // Une date de l'agent est contrôlée AVANT tout (audit 13/10 : « 2026-99-99 » était enregistrée).
    const dateDemandee = entree.parametres && entree.parametres.date;
    if (dateDemandee && !dateIsoAgentValide(dateDemandee)) return { erreur: 'date invalide : écris-la AAAA-MM-JJ (une vraie date du calendrier)' };
    // Autorisation avant exécution (étude 13/10) pour tout geste qui modifie tout de suite (client/67).
    if (gesteAgentDemandeAutorisation(entree, d) && !(await demanderAutorisationAgent(descriptionGesteAgent(entree, d)))) {
      return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
    }
    const dernier = assistantMessages[assistantMessages.length - 1];
    await executerDemandeAssistant({ intention: geste.cle, parametres: entree.parametres || {}, dossier: d ? d.id : '', candidats: [], texte: (entree.parametres && entree.parametres.texte) || '', source: 'agent' });
    const ajout = assistantMessages.slice(assistantMessages.indexOf(dernier) + 1).filter(m => m.role === 'claire').map(m => {
      const tmp = document.createElement('div'); tmp.innerHTML = m.html; return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
    }).join(' ');
    // Le jour de la date du geste, pour que l'agent voie un « vendredi 5 novembre » qui est un jeudi (12/10).
    const date = entree.parametres && /^\d{4}-\d{2}-\d{2}$/.test(entree.parametres.date || '') ? entree.parametres.date : '';
    // Ce qui s'est vraiment passé (audit 15/10 : « les créneaux ont été ajoutés » alors qu'un formulaire attendait) : les gestes qui ouvrent
    // une fenêtre, un formulaire ou une confirmation ne sont pas faits tant que l'utilisateur n'a pas validé.
    const emailFini = entree.geste === 'email' && /Email envoyé|Email annulé|fermée sans envoi/i.test(ajout);
    const attente = !emailFini && (GESTES_EN_ATTENTE_AGENT.includes(entree.geste) || /confirmez|valid(ez|er)|formulaire|choisissez/i.test(ajout));
    const echec = (/impossible|n’a pas pu|introuvable|pas relié|aucun email|déjà|Email annulé|fermée sans envoi/i.test(ajout)) && !(attente && !/impossible|pas relié|aucun email|déjà/i.test(ajout));
    return { statut: echec ? 'echec' : attente ? 'en_attente_utilisateur' : 'fait', ...(attente ? { note: 'rien n’est encore fait : l’utilisateur doit valider la fenêtre ou la confirmation' } : {}), affiche_a_l_utilisateur: ajout.slice(0, 1500), ...(date ? { date_du_geste: new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) } : {}) };
  }

  async function executerOutilAgent(nom, entree) {
    const e = entree || {};
    if (nom === 'chercher_dossiers') return chercherDossiersAgent(e.texte, e.inclure_archives === true);
    if (nom === 'lister_dossiers') return listerDossiersAgent(e.etat || 'en_cours', e.responsable || '');
    if (nom === 'lire_dossier') {
      const d = dossiers.find(x => x.id === e.dossier_id);
      return d ? lireDossierAgent(d) : { erreur: 'aucun dossier avec cet id' };
    }
    if (nom === 'taches_du_jour') return tachesDuJourAgent();
    if (nom === 'agenda') return agendaAgent(e.debut, e.fin);
    if (nom === 'depuis_hier') return depuisHierAgent();
    if (nom === 'documents_recents') return documentsRecentsAgent(typeof e.dossier_id === 'string' ? e.dossier_id : '');
    if (nom === 'ouvrir_documents') return ouvrirDocumentsAgent(e.documents);
    if (nom === 'documents_du_dossier') return documentsDuDossierAgent(typeof e.dossier_id === 'string' ? e.dossier_id : '');
    if (nom === 'lire_document') return lireDocumentAgent(e.document_id, e.page_debut, e.page_fin);
    if (nom === 'chercher_dans_la_memoire') return chercherDansLaMemoireAgent(e);
    if (nom === 'rediger_document') return redigerDocumentAgent(e);
    if (nom === 'outil_claire') return outilClaireAgent(e);
    if (nom === 'outil_champs') return champsOutilAgent(e);
    if (nom === 'artefact') return artefactAgent(e);
    if (nom === 'modele_email') return modeleEmailAgent(e);
    if (nom === 'yousign_rib') return yousignRibAgent(e);
    if (nom === 'yousign_agent') return yousignAgentDiscussions(e);
    if (nom === 'nouveau_dossier_vente') return nouveauDossierDepuisCompromisAgent(e);
    if (nom === 'action_dossier') return actionDossierAgent(e);
    if (nom === 'actions_en_lot') return actionsEnLotAgent(e);
    if (nom === 'scans_claire') return scansAgent(e);
    if (nom === 'nas_dossier') return nasDossierAgent(e);
    if (nom === 'nas_libre') return nasLibreAgent(e);
    if (nom === 'calcul') return calculAgent(e);
    if (nom === 'agenda_evenement') return evenementAgendaAgent(e);
    if (nom === 'demander_collaborateur') return demanderCollaborateurAgent(e);
    if (nom === 'repertoire_ajouter') return ajouterContactRepertoireAgent(e);
    if (nom === 'authentic_claire') return demandeAuthenticAgent(e);
    if (nom === 'authentic_lire') return authenticLireAgent(e);
    if (nom === 'etat_hypothecaire') return etatHypothecaireAgent(e);
    if (nom === 'urbanisme_demandes') return urbanismeDemandesAgent(e);
    if (nom === 'routines_claire') return routinesClaireAgent(e);
    if (nom === 'coordonnees_client') return coordonneesClientAgent(e);
    if (nom === 'courrier_fonds_banque') return courrierFondsBanqueAgent(e);
    if (nom === 'authentic_comptabilite') return comptabiliteAgent(e);
    if (nom === 'authentic_apercu') return apercuAuthenticAgent();
    if (nom === 'lectures_documents') return lecturesDocumentsAgent(e);
    if (nom === 'bilan_dossier') return bilanDossierAgent(e);
    if (nom === 'faire_geste') return faireGesteAgent(e);
    if (nom === 'consulter_site') return consulterSiteAgent(e);
    if (nom === 'plan_de_travail') return planTravailAgent(e);
    if (nom === 'controles_relecture') return controlesRelectureAgent(e);
    if (nom === 'chercher_conversations') return chercherConversationsAgent(e);
    if (nom === 'canaux_claire') return canauxClaireAgent(e);
    if (/^(legifrance|bofip|rne)__[a-z0-9_]+$/i.test(nom)) return appelOpenlegiAgent(nom, e);
    if (/^yousign__[a-zA-Z0-9_-]+$/.test(nom)) return appelYousignAgent(nom, e);
    return { erreur: 'outil inconnu' };
  }

  // ---- La boucle : question → outils → … → réponse ----

  async function appelAgentAssistant(corps) {
    const r = await fetchAvecAuth('/api/assistant/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps.texte ? { ...reglagesColonneAgent(), ...corps } : corps) });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.erreur || `le serveur a répondu ${r.status}`);
    return json;
  }

  // Rend vrai quand l'agent a répondu (ou dit pourquoi il n'a pas pu), faux pour revenir à la compréhension d'une phrase.
  async function envoyerAgentAssistant(texte, dossierImpose, documents) {
    const contexte = () => {
      // Le dossier rattaché dans la colonne de droite passe avant la fiche ouverte à côté.
      const id = dossierImpose || assistantContexte.dossierId || dossierOuvert || '';
      return { aujourdhui: isoAujourdhuiLocal(), maintenant: new Date().toISOString(), prenom: prenomPosteAssistant(), dossierId: id, dossierLibelle: libelleDossierAssistant(id), authentic: typeof contexteAuthentic === 'function' ? contexteAuthentic() : null, posteClaire: POSTE_CLAIRE, vueClaire: !POSTE_CLAIRE && !(typeof canaux === 'object' && canaux.actif) };
    };
    assistantEnCours = true;
    assistantEtapeAgent = '';
    renderAssistant();
    // Dès que l'agent a commencé (un outil a tourné, un geste a pu être fait), on ne revient JAMAIS à la compréhension d'une phrase :
    // elle referait le geste (relecture 0.213.0 : un rappel posé deux fois). L'erreur est dite à la place.
    let outilLance = false;
    const echec = (raison) => {
      assistantEnCours = false; assistantEtapeAgent = ''; assistantAgentConversation = '';
      const lisible = /^(aucun outil attendu|ni question ni résultats)/.test(String(raison || '')) ? 'réponse incomplète de l’agent' : raison;
      poserMessageAssistant('claire', `<p>Je n’ai pas pu terminer : ${escapeHtml(lisible || 'réponse impossible')}. ${outilLance ? 'Ce qui est déjà fait reste affiché au-dessus ; vous' : 'Rien n’a été modifié ; vous'} pouvez reposer la question.</p>`);
      return true;
    };
    try {
      const joints = Array.isArray(documents) && documents.length ? { documents } : {};
      const reactions = prefixeReactionsAgent();
      const texteAgent = reactions.texte + texte;
      let rep = await appelAgentAssistant({ conversation: assistantAgentConversation, texte: texteAgent, contexte: contexte(), dossiers: dossiersPourAssistant(dossiers), ...joints });
      if (rep.expiree) { assistantAgentConversation = ''; rep = await appelAgentAssistant({ texte: texteAgent, contexte: contexte(), dossiers: dossiersPourAssistant(dossiers), ...joints }); }
      if (!rep.repli && !rep.erreur) marquerReactionsLuesAgent(reactions.lues);
      if (rep.repli) { assistantEnCours = false; assistantEtapeAgent = ''; return false; }
      if (rep.repris) poserMessageAssistant('claire', '<p class="asst-note">Je reprends le fil de notre échange.</p>');
      if (rep.joints && rep.joints.coupe) poserMessageAssistant('claire', `<p class="asst-note">Seules les ${rep.joints.pages} premières pages sur ${rep.joints.demandees} ont pu être jointes : le modèle choisi lit moins de texte qu’Opus 5.5. Choisissez Opus 5.5 sous la saisie pour un acte plus long.</p>`);
      while (rep && Array.isArray(rep.appels) && rep.appels.length) {
        outilLance = true;
        assistantAgentConversation = rep.conversation || assistantAgentConversation;
        const resultats = [];
        for (const appel of rep.appels) {
          assistantEtapeAgent = LIBELLES_OUTILS_AGENT[appel.nom] || libelleOutilOpenlegi(appel.nom) || libelleOutilYousign(appel.nom) || 'Je réfléchis…';
          renderAssistant();
          if (appel.nom !== 'plan_de_travail') noterOutilColonneAssistant(appel.id, assistantEtapeAgent, false);
          try { resultats.push({ id: appel.id, contenu: await executerOutilAgent(appel.nom, appel.entree) }); }
          catch (e) { resultats.push({ id: appel.id, contenu: { erreur: String(e && e.message || e).slice(0, 200) }, erreur: true }); }
          if (appel.nom !== 'plan_de_travail') noterOutilColonneAssistant(appel.id, '', true);
        }
        assistantEtapeAgent = 'Je réfléchis…';
        renderAssistant();
        rep = await appelAgentAssistant({ conversation: assistantAgentConversation, resultats });
      }
      if (rep && rep.erreur) {
        // L'agent est annoncé disponible : on dit sa vraie erreur (étude 21/10, « Claude ne fonctionne pas comme il faut ») au lieu de
        // laisser la compréhension d'une phrase répondre « Je n'ai pas bien saisi » à une demande qu'elle ne sait pas lire.
        return echec(rep.expiree ? 'notre échange a expiré pendant que la fenêtre était ouverte' : String(rep.erreur).slice(0, 300));
      }
      assistantEnCours = false;
      assistantEtapeAgent = '';
      assistantAgentConversation = rep.conversation || '';
      const htmlReponse = htmlReponseAgentAssistant(rep.reponse || '');
      poserMessageAssistant('claire', htmlReponse, boutonsReponseAgentAssistant(htmlReponse, rep.reponse || ''));
      noterEchangeAssistant('claire', rep.reponse || '');
      return true;
    } catch (e) {
      console.warn('Demander à CLAIRE : agent en échec', e && e.message);
      return echec(String((e && e.message) || 'serveur injoignable').slice(0, 300));
    }
  }

  function oublierConversationAgent() { assistantAgentConversation = ''; oublierDocumentsAgent(); reinitialiserPouvoirsAgent(); refuserAutorisationEnAttente(); }
