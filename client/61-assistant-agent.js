  // ---- « Demander à CLAIRE » en agent (étude 11/10 : « il faut que Demander à CLAIRE soit aussi intelligent que toi ») ----
  // Claude raisonne côté serveur (server/src/assistantAgent.js) et appelle des OUTILS que ce fichier exécute avec les fonctions
  // habituelles du poste : chercher et lire des dossiers (état, pièces, échéances, fonds…), « À faire », l'agenda, et faire un
  // geste par l'exécutant de « Demander à CLAIRE » (rappel, coche, email dans sa fenêtre, rendez-vous confirmé…). Les résultats
  // partent EN CLAIR au serveur de l'étude, qui les MASQUE avant Claude (noms, adresses, emails, téléphones → codes) et rétablit
  // les codes au retour. Sans agent (pas de clé Claude, agent coupé, erreur) : la compréhension d'une phrase d'avant répond.

  let assistantAgentConversation = '';
  var assistantEtapeAgent = '';              // « Je lis la fiche… » sous l'indicateur d'écriture
  var MAX_DOSSIERS_LISTE_AGENT = 120;

  var LIBELLES_OUTILS_AGENT = {
    chercher_dossiers: 'Je cherche le dossier…', lister_dossiers: 'Je parcours les dossiers…', lire_dossier: 'Je lis la fiche…',
    taches_du_jour: 'Je regarde « À faire »…', agenda: 'Je consulte l’agenda…', depuis_hier: 'Je regarde ce qui est arrivé…',
    documents_recents: 'Je regarde les derniers documents…', ouvrir_documents: 'Je prépare les documents…',
    faire_geste: 'Je m’en occupe…'
  };

  // Pure : la réponse de l'agent (texte avec « - » en liste et **gras**) en HTML échappé.
  function htmlReponseAgentAssistant(texte) {
    const lignes = String(texte || '').replace(/\r/g, '').split('\n');
    const blocs = [];
    let liste = null;
    let para = [];
    const enLigne = (t) => escapeHtml(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    const finPara = () => { if (para.length) { blocs.push(`<p>${para.map(enLigne).join('<br>')}</p>`); para = []; } };
    const finListe = () => { if (liste) { blocs.push(`<ul class="asst-liste">${liste.map(l => `<li>${enLigne(l)}</li>`).join('')}</ul>`); liste = null; } };
    lignes.forEach(l => {
      const puce = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
      if (puce) { finPara(); (liste = liste || []).push(puce[1]); return; }
      if (!l.trim()) { finPara(); finListe(); return; }
      finListe();
      para.push(l.trim());
    });
    finPara(); finListe();
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
      pieces_manquantes: estSuccession(d) ? 0 : sur(() => piecesAttenduesDossier(d).length, 0),
      fonds: estSuccession(d) ? '' : sur(() => bilanFondsAssistant(d), '')
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
      coordonnees: { email_vendeur: d.emailVendeur || '', telephone_vendeur: d.telephoneVendeur || '', email_acquereur: d.emailAcquereur || '', telephone_acquereur: d.telephoneAcquereur || '' },
      bien: { adresse: d.adresseBien || '', prix: d.prixVente || null, prix_mobilier: d.prixMobilier || null, cadastre: sur(() => (d.bien && d.bien.cadastre) || [], []), lots: sur(() => (d.bien && d.bien.lots) || [], []) },
      notaire_vendeur: d.notaireVendeur || '', notaire_acquereur: d.notaireAcquereur || '', agence: d.nomAgence || '',
      honoraires_agence_ttc: sur(() => (d.honoraires && (d.honoraires.montantTTC || d.honoraires.montant)) || null, null),
      dates: { obtention_pret: d.pret || '', vente_prealable: d.ventebien || '', appel_de_fonds_envoye: d.appelFonds || '', projet_envoye: d.projetEnvoye || '', date_butoir: d.acte || '' },
      echeances: estSuccession(d) ? [] : sur(() => echeancesPlanning(d).map(it => ({ libelle: it.label, date: it.iso || '', jours: it.iso ? joursEntre(auj, it.iso) - 1 : null })), []),
      pieces_recues: checklist.filter(p => pieces[p.cle] === 'recue').map(p => p.label),
      pieces_attendues: estSuccession(d) ? [] : sur(() => piecesAttenduesDossier(d), []),
      engagements_du_vendeur: sur(() => ((d.analyseJuridique && d.analyseJuridique.engagements) || []).map(e => ({ texte: String(e.texte || e.libelle || '').slice(0, 300), fait: !!e.fait })), []),
      fonds_confirmes_au_client_le: d.receptionFondsConfirmeeLe || '',
      urbanisme: sur(() => droitsPreemptionFiche(d.preemption).map(x => ({ droit: x.titre || x.cle, statut: x.statut, motif: x.motif || '' })), []),
      authentic: sur(() => d.authentic ? { reference: d.referenceAuthentic || '', acte: d.authentic.acte || null } : null, null),
      historique_recent: (d.historique || []).slice(-12).map(h => ({ date: String(h.date || '').slice(0, 10), texte: String(h.texte || '').slice(0, 200) }))
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
    const nom = { Bastien: 'Bastien ANGLUMENT', Julie: 'Julie VASSELIN', 'Jérémy': 'Jérémy SAUJOT' }[responsable] || '';
    const liste = dossiers.filter(d => d && (etat === 'tous' || (etat === 'archives' ? d.archive : !d.archive)) && (!nom || d.responsable === nom));
    // « coupe » AVANT la liste : si le texte est raccourci par le serveur, Claude le sait quand même.
    return { nombre: liste.length, ...(liste.length > MAX_DOSSIERS_LISTE_AGENT ? { coupe: `seuls les ${MAX_DOSSIERS_LISTE_AGENT} premiers sont listés : filtre par responsable ou cherche par nom` } : {}),
      dossiers: liste.slice(0, MAX_DOSSIERS_LISTE_AGENT).map(resumeDossierAgent) };
  }

  function tachesDuJourAgent() {
    const auj = isoAujourdhuiLocal();
    const { actions } = actionsDuJour(dossiersPerimetreDashboard(), auj);
    const { aFaire, aVenir } = rappelsDuJour(rappelsPerso, auj);
    const rappel = r => ({ texte: r.texte, date: r.echeance || '', dossier_id: r.dossierId || '' });
    return {
      collaborateur: utilisateurPoste || '',
      taches: actions.slice(0, 60).map(a => ({ tache: a.titre, dossier_id: a.dossier ? a.dossier.id : '', dossier: a.dossier ? libelleDossierAffiche(a.dossier) : '', precision: a.contexte || '' })),
      rappels_a_faire: aFaire.map(rappel), rappels_a_venir: aVenir.slice(0, 20).map(rappel)
    };
  }

  async function agendaAgent(debut, fin) {
    const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    if (!ok(debut) || !ok(fin) || fin < debut) return { erreur: 'dates attendues au format AAAA-MM-JJ, fin après début' };
    if (joursEntre(debut, fin) > 32) return { erreur: '31 jours au plus' };
    const evenements = await evenementsAgendaAssistant(debut, fin);
    if (evenements === null) return { erreur: 'agenda de l’office illisible pour le moment' };
    // Jamais le titre ni le lieu (relecture 0.213.0) : l'agenda porte aussi des rendez-vous hors CLAIRE (donations, clients
    // inconnus des fiches) dont les noms ne seraient pas masqués. Seulement la nature, l'heure, la catégorie et le dossier reconnu.
    return { rendez_vous: evenements.filter(e => e && e.date >= debut && e.date <= fin)
      .sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')))
      .slice(0, 200).map(e => {
        const d = dossierDeRendezVousAgent(e);
        return { date: e.date, heure: e.journeeEntiere ? '' : (e.heure || ''), fin: e.heureFin || '', journee_entiere: !!e.journeeEntiere,
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

  // Le geste par l'exécutant habituel de « Demander à CLAIRE » ; son message (et ses boutons) s'affiche dans la conversation.
  async function faireGesteAgent(entree) {
    const geste = intentionAssistant(entree && entree.geste);
    if (!geste) return { erreur: 'geste inconnu' };
    const d = entree.dossier_id ? dossiers.find(x => x.id === entree.dossier_id) : null;
    if (geste.dossier && !d) return { erreur: 'dossier introuvable : cherche-le d’abord (chercher_dossiers) et passe son id' };
    const dernier = assistantMessages[assistantMessages.length - 1];
    await executerDemandeAssistant({ intention: geste.cle, parametres: entree.parametres || {}, dossier: d ? d.id : '', candidats: [], texte: (entree.parametres && entree.parametres.texte) || '', source: 'agent' });
    const ajout = assistantMessages.slice(assistantMessages.indexOf(dernier) + 1).filter(m => m.role === 'claire').map(m => {
      const tmp = document.createElement('div'); tmp.innerHTML = m.html; return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
    }).join(' ');
    return { fait: true, affiche_a_l_utilisateur: ajout.slice(0, 1500) };
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
    if (nom === 'faire_geste') return faireGesteAgent(e);
    return { erreur: 'outil inconnu' };
  }

  // ---- La boucle : question → outils → … → réponse ----

  async function appelAgentAssistant(corps) {
    const r = await fetchAvecAuth('/api/assistant/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.erreur || `le serveur a répondu ${r.status}`);
    return json;
  }

  // Rend vrai quand l'agent a répondu (ou dit pourquoi il n'a pas pu), faux pour revenir à la compréhension d'une phrase.
  async function envoyerAgentAssistant(texte, dossierImpose) {
    const contexte = () => {
      const id = dossierImpose || dossierOuvert || assistantContexte.dossierId || '';
      return { aujourdhui: isoAujourdhuiLocal(), prenom: prenomPosteAssistant(), dossierId: id, dossierLibelle: libelleDossierAssistant(id) };
    };
    assistantEnCours = true;
    assistantEtapeAgent = '';
    renderAssistant();
    // Dès que l'agent a commencé (un outil a tourné, un geste a pu être fait), on ne revient JAMAIS à la compréhension d'une phrase :
    // elle referait le geste (relecture 0.213.0 : un rappel posé deux fois). L'erreur est dite à la place.
    let engage = false;
    const echec = (raison) => {
      assistantEnCours = false; assistantEtapeAgent = ''; assistantAgentConversation = '';
      poserMessageAssistant('claire', `<p>Je n’ai pas pu terminer : ${escapeHtml(raison || 'réponse impossible')}. Ce qui est déjà fait reste affiché au-dessus ; vous pouvez reposer la question.</p>`);
      return true;
    };
    try {
      let rep = await appelAgentAssistant({ conversation: assistantAgentConversation, texte, contexte: contexte(), dossiers: dossiersPourAssistant(dossiers) });
      if (rep.expiree) { assistantAgentConversation = ''; rep = await appelAgentAssistant({ texte, contexte: contexte(), dossiers: dossiersPourAssistant(dossiers) }); }
      if (rep.repli) { assistantEnCours = false; assistantEtapeAgent = ''; return false; }
      if (rep.repris) poserMessageAssistant('claire', '<p class="asst-note">Notre échange précédent était trop ancien : je repars de zéro.</p>');
      while (rep && Array.isArray(rep.appels) && rep.appels.length) {
        engage = true;
        assistantAgentConversation = rep.conversation || assistantAgentConversation;
        const resultats = [];
        for (const appel of rep.appels) {
          assistantEtapeAgent = LIBELLES_OUTILS_AGENT[appel.nom] || 'Je réfléchis…';
          renderAssistant();
          try { resultats.push({ id: appel.id, contenu: await executerOutilAgent(appel.nom, appel.entree) }); }
          catch (e) { resultats.push({ id: appel.id, contenu: { erreur: String(e && e.message || e).slice(0, 200) }, erreur: true }); }
        }
        assistantEtapeAgent = 'Je réfléchis…';
        renderAssistant();
        rep = await appelAgentAssistant({ conversation: assistantAgentConversation, resultats });
      }
      if (rep && rep.erreur) {
        if (engage) return echec(rep.expiree ? 'notre échange a expiré pendant que la fenêtre était ouverte' : rep.erreur);
        assistantEnCours = false; assistantEtapeAgent = ''; assistantAgentConversation = '';
        // Rien n'a encore été fait : la compréhension d'une phrase prend le relais.
        return false;
      }
      assistantEnCours = false;
      assistantEtapeAgent = '';
      assistantAgentConversation = rep.conversation || '';
      poserMessageAssistant('claire', htmlReponseAgentAssistant(rep.reponse || ''));
      noterEchangeAssistant('claire', rep.reponse || '');
      return true;
    } catch (e) {
      if (engage) return echec(e && e.message);
      assistantEnCours = false;
      assistantEtapeAgent = '';
      assistantAgentConversation = '';
      console.warn('Demander à CLAIRE : agent indisponible, compréhension d’une phrase à la place', e && e.message);
      return false;
    }
  }

  function oublierConversationAgent() { assistantAgentConversation = ''; oublierDocumentsAgent(); }
