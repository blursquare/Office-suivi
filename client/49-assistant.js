  // ---- « Demander à CLAIRE » (étude 06/10) : une page de conversation, façon Claude, où l'on dit en une phrase ce qu'on
  // veut — l'état d'un dossier, une tâche, un email, un rendez-vous, un calcul — et CLAIRE répond ou fait le geste avec ses
  // fonctions habituelles. Choix de l'étude (06/10) : IA locale seule (Ollama, serveur) ; tout se fait sans carte de
  // confirmation SAUF les emails (la fenêtre d'email reste, rien ne part sans « Envoyer ») et l'agenda (confirmation
  // de la fiche, formulaire « Nouveau rendez-vous ») ; tous les gestes dès la première version, outils de calcul compris.
  // La compréhension est faite par le serveur (commun/assistant.js + Ollama, POST /api/assistant/comprendre) ; ici, le
  // dossier désigné est connu, et chaque intention appelle la fonction qui existe déjà — rien n'est refait ni inventé. ----

  let assistantMessages = [];           // [{ role: 'moi' | 'claire', html, boutons: [{ libelle, action, principal }], quand }]
  let assistantContexte = { dossierId: '', attente: null, historique: [] };
  let assistantEnCours = false;
  let assistantDisponibilite = { ia: null, raison: '', modele: '', quand: 0 };
  var assistantActions = {};            // clé du bouton → fonction (jamais de code dans l'attribut onclick)

  function initAssistant() {
    if (dossierOuvert) assistantContexte.dossierId = dossierOuvert;
    renderAssistant();
    chargerDisponibiliteAssistant();
    const champ = document.getElementById('assistant-saisie');
    if (champ) setTimeout(() => champ.focus({ preventScroll: true }), 0);
  }

  async function chargerDisponibiliteAssistant() {
    if (!authToken || Date.now() - assistantDisponibilite.quand < 60000) return;
    try {
      const r = await fetchAvecAuth('/api/assistant/disponibilite');
      const corps = await r.json();
      assistantDisponibilite = { ia: !!corps.ia, moteur: corps.moteur || 'locale', raison: corps.raison || '', modele: corps.modele || '', quand: Date.now() };
    } catch (e) {
      assistantDisponibilite = { ia: false, raison: 'Serveur injoignable.', modele: '', quand: Date.now() };
    }
    renderEtatAssistant();
  }

  function renderEtatAssistant() {
    const el = document.getElementById('assistant-etat');
    if (!el) return;
    const d = assistantDisponibilite;
    if (d.ia === null) { el.innerHTML = ''; return; }
    const nom = d.moteur === 'mistral' ? 'IA Mistral' : 'IA locale';
    el.innerHTML = d.ia
      ? `<span class="dot-label dl-success"${d.raison ? ` title="${escapeAttr(d.raison)}"` : ''}><span class="dot"></span>${nom} prête${d.moteur === 'mistral' ? ' — noms masqués' : ''}</span>`
      : `<span class="dot-label dl-neutre" title="${escapeAttr(d.raison)}"><span class="dot"></span>Sans ${nom} : mots-clés seulement</span>`;
  }

  // Pure : les exemples de la page d'accueil, avec les noms des dossiers du collaborateur à la place des noms d'exemple.
  function suggestionsAssistant(liste) {
    const noms = (liste || []).filter(d => d && !d.archive && d.nom).map(d => String(d.nom).split('/')[0].trim()).filter(Boolean);
    const exemples = ['Où en est le dossier MARTIN ?', 'Qu’est-ce que j’ai à faire aujourd’hui ?', 'Relance MARTIN pour son offre de prêt',
      'Rappelle-moi vendredi d’appeler le syndic pour DUPONT', 'Trouve une date de signature pour MARTIN', 'Fais l’appel de fonds de LEROY',
      'Provision pour une maison à 250 000 € dans le 41', 'Quelles pièces manquent pour DUPONT ?', 'Qu’est-ce qu’il y a à l’agenda demain ?'];
    return exemples.map(e => e.replace(/MARTIN|DUPONT|LEROY/g, (m) => noms[['MARTIN', 'DUPONT', 'LEROY'].indexOf(m) % Math.max(1, noms.length)] || m));
  }

  function renderAssistant() {
    const zone = document.getElementById('assistant-messages');
    if (!zone) return;
    assistantActions = {};
    if (!assistantMessages.length) {
      zone.innerHTML = `<div class="asst-accueil">
          <div class="asst-accueil-logo" aria-hidden="true">${icone('sparkle')}</div>
          <h2 class="asst-accueil-titre">Que puis-je faire pour vous ?</h2>
          <p class="asst-accueil-texte">Un dossier, une tâche, un email, un rendez-vous, un calcul : dites-le en une phrase.</p>
          <div class="asst-suggestions">${suggestionsAssistant(dossiersPerimetreDashboard()).map(s =>
            `<button type="button" class="asst-suggestion" onclick="envoyerDemandeAssistant(this.textContent)">${escapeHtml(s)}</button>`).join('')}</div>
        </div>`;
      return;
    }
    zone.innerHTML = assistantMessages.map((m, i) => {
      const boutons = (m.boutons || []).map((b, k) => {
        const cle = `${i}-${k}`;
        assistantActions[cle] = b.action;
        return `<wa-button ${b.principal ? 'variant="brand"' : 'appearance="outlined"'} size="s" type="button" onclick="actionAssistant('${cle}')">${escapeHtml(b.libelle)}</wa-button>`;
      }).join('');
      return `<div class="asst-message asst-${m.role}">
          ${m.role === 'claire' ? `<span class="asst-avatar" aria-hidden="true">${icone('sparkle')}</span>` : ''}
          <div class="asst-bulle">${m.html}${boutons ? `<div class="asst-boutons">${boutons}</div>` : ''}</div>
        </div>`;
    }).join('') + (assistantEnCours ? `<div class="asst-message asst-claire"><span class="asst-avatar" aria-hidden="true">${icone('sparkle')}</span><div class="asst-bulle asst-attente"><span></span><span></span><span></span></div></div>` : '');
    zone.scrollTop = zone.scrollHeight;
  }

  function actionAssistant(cle) {
    const fn = assistantActions[cle];
    if (typeof fn === 'function') fn();
  }

  function poserMessageAssistant(role, html, boutons) {
    assistantMessages.push({ role, html, boutons: boutons || [], quand: Date.now() });
    if (assistantMessages.length > 60) assistantMessages = assistantMessages.slice(-60);
    renderAssistant();
  }

  function nouvelleConversationAssistant() {
    assistantMessages = [];
    assistantContexte = { dossierId: dossierOuvert || '', attente: null, historique: [] };
    renderAssistant();
    const champ = document.getElementById('assistant-saisie');
    if (champ) { champ.value = ''; champ.focus(); }
  }

  function toucheSaisieAssistant(event) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); envoyerDemandeAssistant(); }
  }

  // Pure : la liste envoyée au serveur pour reconnaître le dossier cité — id, nom, noms des parties, rien d'autre.
  // Ce que le serveur reçoit pour reconnaître le dossier d'une phrase (étude 07/10 : « toutes les données des fiches ») : noms, prénoms,
  // noms d'usage et civilités des parties, adresse(s) du bien, agence, notaires, référence Authentic, emails et téléphones. Rien de
  // cela ne part vers l'IA : seul le code du serveur s'en sert (`reconnaitreDossier`).
  function dossiersPourAssistant(liste) {
    const texte = (v) => (typeof v === 'string' ? v : '');
    return (liste || []).filter(d => d && d.id).map(d => {
      const parties = Array.isArray(d.parties) ? d.parties : [];
      return {
        id: d.id, nom: String(d.nom || ''), archive: !!d.archive,
        parties: parties.map(p => ({ nom: String((p && p.nom) || ''), prenom: texte(p && p.prenom), nomUsage: texte(p && p.nomUsage),
          civilite: String((p && p.civilite) || '') })).filter(p => p.nom),
        autres: [d.bien && d.bien.adresse, ...(Array.isArray(d.biens) ? d.biens.map(b => b && b.adresse) : []), d.nomAgence,
          d.notaireVendeur, d.notaireAcquereur].map(texte).filter(Boolean),
        reference: texte(d.referenceAuthentic),
        contacts: [d.emailVendeur, d.emailAcquereur, d.telephoneVendeur, d.telephoneAcquereur,
          ...parties.flatMap(p => [p && p.email, ...((p && p.emails) || []), ...((p && p.telephones) || [])])].map(texte).filter(Boolean)
      };
    });
  }

  async function envoyerDemandeAssistant(texteForce) {
    const champ = document.getElementById('assistant-saisie');
    const texte = String(texteForce || (champ ? champ.value : '') || '').trim();
    if (!texte || assistantEnCours) return;
    if (champ && !texteForce) champ.value = '';
    if (champ) champ.style.height = '';
    poserMessageAssistant('moi', escapeHtml(texte));
    // On attendait le nom d'un dossier : la phrase est ce nom, on reprend la demande précédente.
    if (assistantContexte.attente && assistantContexte.attente.type === 'dossier') {
      const r = reconnaitreDossier(texte, dossiersPourAssistant(dossiers));
      const attente = assistantContexte.attente;
      if (r.dossier) { assistantContexte.attente = null; await executerDemandeAssistant({ ...attente.resultat, dossier: r.dossier, candidats: [] }); return; }
      if (r.candidats.length) { proposerCandidatsAssistant(r.candidats, attente.resultat); return; }
      assistantContexte.attente = null;
      // Sinon, c'est une nouvelle demande : on continue normalement.
    }
    assistantEnCours = true;
    renderAssistant();
    try {
      const r = await fetchAvecAuth('/api/assistant/comprendre', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texte,
          contexte: { aujourdhui: isoAujourdhuiLocal(), dossierId: assistantContexte.dossierId || '', dossierLibelle: libelleDossierAssistant(assistantContexte.dossierId), historique: assistantContexte.historique.slice(-3) },
          dossiers: dossiersPourAssistant(dossiers)
        })
      });
      const corps = await r.json();
      if (!r.ok) throw new Error(corps.erreur || `Le serveur a répondu ${r.status}.`);
      assistantContexte.historique.push({ texte, intention: corps.intention });
      assistantEnCours = false;
      await executerDemandeAssistant(corps);
    } catch (e) {
      assistantEnCours = false;
      poserMessageAssistant('claire', `<p>Je n’ai pas pu traiter la demande : ${escapeHtml(e.message || e)}</p>`);
    }
  }

  function libelleDossierAssistant(id) {
    const d = id ? dossiers.find(x => x.id === id) : null;
    return d ? libelleDossierAffiche(d) : '';
  }

  function proposerCandidatsAssistant(candidats, resultat) {
    assistantContexte.attente = { type: 'dossier', resultat };
    poserMessageAssistant('claire', '<p>Plusieurs dossiers correspondent. Lequel ?</p>', candidats.map(c => ({
      libelle: libelleDossierParNom(c.nom, c.id),
      action: () => { assistantContexte.attente = null; executerDemandeAssistant({ ...resultat, dossier: c.id, candidats: [] }); }
    })));
  }

  // Le geste, intention par intention. `r` = réponse du serveur { intention, parametres, dossier, candidats, source }.
  async function executerDemandeAssistant(r) {
    const intention = intentionAssistant(r.intention) || intentionAssistant('inconnu');
    const p = r.parametres || {};
    let d = null;
    if (intention.dossier) {
      if (!r.dossier && r.candidats && r.candidats.length) { proposerCandidatsAssistant(r.candidats, r); return; }
      d = r.dossier ? dossiers.find(x => x.id === r.dossier) : null;
      if (!d) {
        assistantContexte.attente = { type: 'dossier', resultat: r };
        poserMessageAssistant('claire', '<p>De quel dossier parlez-vous ? Donnez-moi le nom du dossier ou d’une partie.</p>');
        return;
      }
      assistantContexte.dossierId = d.id;
    }
    const executants = {
      etat_dossier: () => reponseEtatDossierAssistant(d),
      pieces_manquantes: () => reponsePiecesAssistant(d),
      echeances_dossier: () => reponseEcheancesAssistant(d),
      coordonnees: () => reponseCoordonneesAssistant(d, p.partie),
      fonds_dossier: () => reponseFondsAssistant(d),
      taches_jour: () => reponseTachesAssistant(),
      depuis_hier: () => reponseDepuisHierAssistant(),
      rappel_ajouter: () => gesteRappelAssistant(p, r.dossier ? d : null, r.texte),
      rappel_lister: () => reponseRappelsAssistant(),
      email: () => gesteEmailAssistant(d, p),
      echeance_cocher: () => gesteCocherAssistant(d, p, false),
      echeance_decocher: () => gesteCocherAssistant(d, p, true),
      date_fiche: () => gesteDateFicheAssistant(d, p),
      creneaux_signature: () => reponseCreneauxAssistant(d),
      rendez_vous_placer: () => gestePlacerSignatureAssistant(d, p),
      sondage_dates: () => gesteSondageAssistant(d),
      options_rendez_vous: () => gesteOptionsAssistant(d, p),
      rendez_vous_creer: () => gesteRendezVousAssistant(p, r.texte),
      agenda_jour: () => reponseAgendaJourAssistant(p),
      appel_fonds: () => gesteOutilAssistant(d, 'appel-fonds'),
      quotites: () => gesteQuotitesAssistant(p, r.texte),
      provision: () => reponseProvisionAssistant(p),
      prorata: () => reponseProrataAssistant(p),
      preemption: () => gesteOutilAssistant(d, 'preemption'),
      ouvrir_dossier: () => gesteOuvrirDossierAssistant(d),
      ouvrir_ecran: () => gesteOuvrirEcranAssistant(p),
      rechercher: () => reponseRechercheAssistant(p.texte || r.texte),
      archiver: () => gesteArchiverAssistant(d),
      responsable: () => gesteResponsableAssistant(d, p),
      aide: () => reponseAideAssistant(),
      inconnu: () => reponseInconnuAssistant(r)
    };
    try {
      const reponse = await (executants[intention.cle] || executants.inconnu)();
      if (reponse) poserMessageAssistant('claire', reponse.html + noteMoteurAssistant(r), reponse.boutons);
    } catch (e) {
      console.error('Assistant : geste impossible', e);
      poserMessageAssistant('claire', `<p>Le geste n’a pas abouti : ${escapeHtml(e.message || e)}</p>`);
    }
  }

  // Pure : la mention discrète de ce qui a compris la phrase (étude 07/10, essai de Mistral « pour voir ») — « Compris par
  // Mistral », et ce que les mots-clés auraient compris quand ils disaient autre chose. Rien quand les mots-clés ont suffi.
  function noteMoteurAssistant(r) {
    if (!r || r.source !== 'ia') return '';
    const moteur = r.moteur === 'mistral' ? 'Mistral' : 'l’IA locale';
    const autre = r.motsCles ? intentionAssistant(r.motsCles) : null;
    return `<p class="asst-note asst-moteur">Compris par ${moteur}${autre ? ` — les mots-clés auraient compris « ${escapeHtml(autre.libelle)} »` : ''}.</p>`;
  }

  // ---- Réponses en lecture ----

  function boutonFicheAssistant(d, libelle) {
    return { libelle: libelle || 'Ouvrir la fiche', action: () => ouvrirDossierDepuisDashboard(d.id) };
  }

  function reponseEtatDossierAssistant(d) {
    const auj = isoAujourdhuiLocal();
    const etat = etatDossier(d, auj);
    const prochaine = estSuccession(d) ? null : prochaineEcheanceDetail(d);
    const manque = estSuccession(d) ? [] : piecesAttenduesDossier(d);
    const lignes = [];
    // Le détail de « Attente de pièces » est la liste des pièces : elle a sa propre ligne dessous.
    lignes.push(`<li><b>Statut</b> : ${escapeHtml(etat.texte)}${etat.detail && etat.cle !== 'attente' ? ` — ${escapeHtml(etat.detail)}` : ''}</li>`);
    if (d.responsable) lignes.push(`<li><b>Responsable</b> : ${escapeHtml(d.responsable)}</li>`);
    if (d.rendezVousSignature) lignes.push(`<li><b>Signature</b> : ${escapeHtml(dateAvecJourFr(d.rendezVousSignature))}${d.rendezVousSignatureHeure ? ' à ' + escapeHtml(d.rendezVousSignatureHeure.replace(':', ' h ')) : ''}${echeanceValidee(d, 'rendezVousSignature') ? ' (faite)' : ''}</li>`);
    else if (prochaine) lignes.push(`<li><b>Prochaine étape</b> : ${escapeHtml(prochaine.label)}${prochaine.iso ? ` — ${escapeHtml(formatDateFr(prochaine.iso))} (${prochaine.jours >= 0 ? `dans ${prochaine.jours} j` : `dépassée de ${-prochaine.jours} j`})` : ''}</li>`);
    if (manque.length) lignes.push(`<li><b>Attendu</b> : ${manque.slice(0, 6).map(escapeHtml).join(', ')}${manque.length > 6 ? ` et ${manque.length - 6} de plus` : ''}</li>`);
    const fonds = bilanFondsAssistant(d);
    if (fonds) lignes.push(`<li><b>Fonds</b> : ${fonds}</li>`);
    const email = emailARepondreAssistant(d);
    if (email) lignes.push(`<li><b>Email</b> : ${email}</li>`);
    return { html: `<p><b>${escapeHtml(libelleDossierAffiche(d))}</b></p><ul class="asst-liste">${lignes.join('')}</ul>`, boutons: [boutonFicheAssistant(d)] };
  }

  function emailARepondreAssistant(d) {
    const donnees = typeof emailsParDossier !== 'undefined' ? emailsParDossier[d.id] : null;
    const emails = donnees && Array.isArray(donnees.emails) ? donnees.emails : [];
    const dernier = emails.filter(e => e && e.sens === 'recu').sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    if (!dernier) return '';
    const de = dernier.de ? (dernier.de.nom || dernier.de.adresse || '') : '';
    return `dernier reçu ${escapeHtml(formatDateFr(String(dernier.date || '').slice(0, 10)))}${de ? ` de ${escapeHtml(de)}` : ''} — « ${escapeHtml(dernier.objet || '')} »`;
  }

  function reponsePiecesAssistant(d) {
    if (estSuccession(d)) return { html: '<p>Une succession n’a pas de liste de pièces de vente dans CLAIRE.</p>', boutons: [boutonFicheAssistant(d)] };
    const manque = piecesAttenduesDossier(d);
    if (!manque.length) return { html: `<p>Rien n’est attendu sur ${escapeHtml(libelleDossierAffiche(d))} : toutes les pièces sont reçues.</p>`, boutons: [boutonFicheAssistant(d)] };
    return { html: `<p>${manque.length} élément${manque.length > 1 ? 's' : ''} encore attendu${manque.length > 1 ? 's' : ''} sur ${escapeHtml(libelleDossierAffiche(d))} :</p><ul class="asst-liste">${manque.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`,
      boutons: [{ libelle: 'Voir les pièces', action: () => { ouvrirDossierDepuisDashboard(d.id); definirOngletFiche('pieces'); } }] };
  }

  function reponseEcheancesAssistant(d) {
    const auj = isoAujourdhuiLocal();
    const items = echeancesPlanning(d).slice().sort((a, b) => String(a.iso || '9999').localeCompare(String(b.iso || '9999')));
    const lignes = items.map(it => {
      const j = it.iso ? joursEntre(auj, it.iso) - 1 : null;
      const quand = it.iso ? `${formatDateFr(it.iso)} (${j > 0 ? `dans ${j} j` : j === 0 ? 'aujourd’hui' : `dépassée de ${-j} j`})` : 'sans date';
      return `<li>${escapeHtml(it.label)} — ${escapeHtml(quand)}</li>`;
    });
    const butoir = d.acte && !estSuccession(d) ? `<p class="asst-note">Date butoir de l’avant-contrat : ${escapeHtml(formatDateFr(d.acte))}${d.rendezVousSignature ? ' (informative, le rendez-vous est fixé)' : ''}.</p>` : '';
    return { html: lignes.length ? `<p>Échéances de ${escapeHtml(libelleDossierAffiche(d))} :</p><ul class="asst-liste">${lignes.join('')}</ul>${butoir}` : `<p>Aucune échéance en cours sur ${escapeHtml(libelleDossierAffiche(d))}.</p>${butoir}`,
      boutons: [boutonFicheAssistant(d)] };
  }

  function reponseCoordonneesAssistant(d, partie) {
    const blocs = [];
    const cote = (role, libelle) => {
      const personnes = (d.parties || []).filter(p => p && p.role === role);
      const tels = [...new Set([...(role === 'VENDEUR' ? [d.telephoneVendeur] : [d.telephoneAcquereur]), ...personnes.flatMap(p => p.telephones || [])].filter(Boolean))];
      const emails = [...new Set([...(role === 'VENDEUR' ? [d.emailVendeur] : [d.emailAcquereur]), ...personnes.flatMap(p => p.emails || [])].filter(Boolean))];
      const noms = personnes.map(p => `${p.civilite === 'Mme' ? 'Madame' : p.civilite === 'M' ? 'Monsieur' : ''} ${p.prenom || ''} ${p.nom || ''}`.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const notaire = role === 'VENDEUR' ? d.notaireVendeur : d.notaireAcquereur;
      return `<li><b>${libelle}</b>${noms.length ? ` : ${noms.map(escapeHtml).join(', ')}` : ''}<br>${tels.length ? `Tél. : ${tels.map(t => `${texteAppel3cx(t)} ${liensAppelTelephone(t)}`).join(' · ')}<br>` : 'Aucun téléphone.<br>'}${emails.length ? `Email : ${emails.map(e => `<a href="mailto:${escapeAttr(e)}">${escapeHtml(e)}</a>`).join(', ')}` : 'Aucun email.'}${notaire ? `<br>Notaire : ${escapeHtml(notaire)}` : ''}</li>`;
    };
    if (!partie || partie === 'vendeur') blocs.push(cote('VENDEUR', 'Vendeur'));
    if (!partie || partie === 'acquereur') blocs.push(cote('ACQUEREUR', 'Acquéreur'));
    if (!partie || partie === 'confrere') {
      const lignes = [];
      [['acquereur', d.notaireAcquereur, d.emailNotaireParticipant], ['vendeur', d.notaireVendeur, d.emailConfrereVendeur]].forEach(([c, nom, email]) => {
        if (!nom) return;
        const tel = telephoneConfrereDossier(d, c);
        const mail = email || (c === 'acquereur' ? emailOfficeConfrereAcquereur(d) : emailOfficeConfrereVendeur(d));
        lignes.push(`<li><b>Notaire ${c === 'acquereur' ? 'de l’acquéreur' : 'du vendeur'}</b> : ${escapeHtml(nom)}${tel.effectif ? `<br>Tél. : ${texteAppel3cx(tel.effectif)} ${liensAppelTelephone(tel.effectif)}` : ''}${mail ? `<br>Email : <a href="mailto:${escapeAttr(mail)}">${escapeHtml(mail)}</a>` : ''}</li>`);
      });
      if (partie === 'confrere' && !lignes.length) lignes.push('<li>Aucun notaire renseigné sur ce dossier.</li>');
      blocs.push(...lignes);
    }
    if (partie === 'agence') {
      const agence = String(d.nomAgence || '').trim();
      blocs.push(`<li><b>Agence</b> : ${agence ? escapeHtml(agence) : 'aucune agence notée sur ce dossier'}${agence ? ' — ses coordonnées sont dans le Répertoire' : ''}</li>`);
    }
    return { html: `<p>${escapeHtml(libelleDossierAffiche(d))}</p><ul class="asst-liste">${blocs.join('')}</ul>`, boutons: [boutonFicheAssistant(d)] };
  }

  function bilanFondsAssistant(d) {
    const f = d.fondsRecus;
    if (!d.fondsValidesLe && (!f || typeof f !== 'object')) return '';
    const b = bilanFondsDossier(d);
    if (b.etat === 'aucun' && !b.attendu) return '';
    const total = formaterMontantEuros(b.total);
    if (b.manuel) return `fonds validés à la main le ${formatDateFr(d.fondsValidesLe)} (arrivés sur le compte de l’étude)${d.receptionFondsConfirmeeLe ? ', confirmé au client' : ', pas encore confirmé au client'}.`;
    if (b.etat === 'complet') return `${total} reçus, tout est là${d.receptionFondsConfirmeeLe ? ', confirmé au client' : ', pas encore confirmé au client'}.`;
    if (b.etat === 'excedent') return `${total} reçus pour ${formaterMontantEuros(b.attendu)} attendus : excédent de ${formaterMontantEuros(b.ecart)} à vérifier.`;
    if (b.etat === 'partiel') return `${total} reçus sur ${formaterMontantEuros(b.attendu)} : il manque ${formaterMontantEuros(b.reste)}.`;
    if (b.etat === 'aucun') return `rien reçu sur ${formaterMontantEuros(b.attendu)} attendus.`;
    return `${total} reçus, montant attendu inconnu.`;
  }

  function reponseFondsAssistant(d) {
    if (estSuccession(d)) return { html: '<p>Pas de fonds à suivre sur une succession dans CLAIRE.</p>', boutons: [boutonFicheAssistant(d)] };
    const bilan = bilanFondsAssistant(d);
    const appel = d.appelFonds ? `Appel de fonds envoyé le ${formatDateFr(d.appelFonds)}.` : 'Appel de fonds pas encore envoyé.';
    return { html: `<p><b>${escapeHtml(libelleDossierAffiche(d))}</b> — ${escapeHtml(appel)}</p><p>${bilan ? escapeHtml(bilan.charAt(0).toUpperCase() + bilan.slice(1)) : 'Aucun reçu comptable relevé sur le NAS pour ce dossier.'}</p>`,
      boutons: [{ libelle: 'Voir les fonds', action: () => { ouvrirDossierDepuisDashboard(d.id); definirOngletFiche('fonds'); } }] };
  }

  function reponseTachesAssistant() {
    const auj = isoAujourdhuiLocal();
    const { actions } = actionsDuJour(dossiersPerimetreDashboard(), auj);
    const { aFaire } = rappelsDuJour(rappelsPerso, auj);
    const lignes = actions.slice(0, 12).map(a => `<li>${escapeHtml(a.titre)} — <b>${escapeHtml(libelleDossierAffiche(a.dossier))}</b>${a.contexte ? `<br><span class="asst-note">${escapeHtml(a.contexte)}</span>` : ''}</li>`);
    const rappels = aFaire.slice(0, 8).map(r => `<li>${escapeHtml(r.texte)}${r.dossierId && dossiers.find(x => x.id === r.dossierId) ? ` — <b>${escapeHtml(libelleDossierAssistant(r.dossierId))}</b>` : ''}</li>`);
    if (!lignes.length && !rappels.length) return { html: '<p>Rien à faire aujourd’hui : aucune tâche ni rappel en attente.</p>' };
    return { html: `${lignes.length ? `<p>${actions.length} tâche${actions.length > 1 ? 's' : ''} :</p><ul class="asst-liste">${lignes.join('')}</ul>${actions.length > 12 ? `<p class="asst-note">et ${actions.length - 12} de plus sur le tableau de bord.</p>` : ''}` : ''}${rappels.length ? `<p>Rappels :</p><ul class="asst-liste">${rappels.join('')}</ul>` : ''}`,
      boutons: [{ libelle: 'Tableau de bord', action: () => definirOnglet('dashboard') }] };
  }

  function reponseDepuisHierAssistant() {
    const debut = debutDepuisHier18h();
    const docs = documentsDepuis(dossiersPerimetreDashboard(), debut);
    const lignes = docs.slice(0, 12).map(x => `<li>${escapeHtml(x.libelle)} — <b>${escapeHtml(libelleDossierAffiche(x.dossier))}</b></li>`);
    return { html: lignes.length ? `<p>Depuis hier 18 h, ${docs.length} document${docs.length > 1 ? 's' : ''} reçu${docs.length > 1 ? 's' : ''} :</p><ul class="asst-liste">${lignes.join('')}</ul>` : '<p>Aucun document reçu depuis hier 18 h sur vos dossiers.</p>',
      boutons: [{ libelle: 'Voir « Depuis hier 18 h »', action: () => { definirOnglet('dashboard'); choisirOngletFenetreJour('depuis'); ouvrirFenetreAujourdhui(); } }] };
  }

  function reponseRappelsAssistant() {
    const auj = isoAujourdhuiLocal();
    const { aFaire, aVenir } = rappelsDuJour(rappelsPerso, auj);
    const ligne = r => `<li>${escapeHtml(r.texte)}${r.echeance ? ` — ${escapeHtml(formatDateFr(r.echeance))}` : ''}${r.dossierId && dossiers.find(x => x.id === r.dossierId) ? ` — <b>${escapeHtml(libelleDossierAssistant(r.dossierId))}</b>` : ''}</li>`;
    if (!aFaire.length && !aVenir.length) return { html: '<p>Aucun rappel en cours.</p>' };
    return { html: `${aFaire.length ? `<p>À faire :</p><ul class="asst-liste">${aFaire.map(ligne).join('')}</ul>` : ''}${aVenir.length ? `<p>À venir :</p><ul class="asst-liste">${aVenir.map(ligne).join('')}</ul>` : ''}` };
  }

  // ---- Gestes qui écrivent (sans carte, annulables) ----

  function gesteRappelAssistant(p, d, phrase) {
    if (!utilisateurPoste) return { html: '<p>Choisissez d’abord le collaborateur du poste (en haut de la barre latérale) pour poser un rappel.</p>' };
    const texte = String(p.texte || texteRappelDepuisPhrase(phrase) || '').trim();
    if (!texte) return { html: '<p>Que dois-je vous rappeler ? Dites-le avec le rappel, par exemple « rappelle-moi vendredi d’appeler le syndic ».</p>' };
    const rappel = {
      id: 'rp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      auteur: utilisateurPoste, texte: texte.slice(0, 200), echeance: p.date || '', dossierId: d ? d.id : '',
      fait: false, faitLe: '', creeLe: new Date().toISOString()
    };
    rappelsPerso.push(rappel);
    renderAlertesDashboard(dossiersPerimetreDashboard());
    enregistrerRappelPerso(rappel);
    const annuler = () => { supprimerRappelPerso(rappel.id); poserMessageAssistant('claire', '<p>Rappel retiré.</p>'); };
    return { html: `<p>Rappel posé : « ${escapeHtml(rappel.texte)} »${rappel.echeance ? ` pour le ${escapeHtml(formatDateFr(rappel.echeance))}` : ''}${d ? ` — ${escapeHtml(libelleDossierAffiche(d))}` : ''}.</p>`, boutons: [{ libelle: 'Annuler', action: annuler }] };
  }

  async function gesteEmailAssistant(d, p) {
    if (estSuccession(d)) return { html: '<p>Les emails de vente ne s’appliquent pas à une succession. Ouvrez la fiche pour écrire un email libre.</p>', boutons: [boutonFicheAssistant(d)] };
    const modele = p.modele || '';
    if (modele === 'questionnaire') { envoyerQuestionnaireSatisfaction(d.id, true); return { html: '<p>Fenêtre d’email ouverte avec le questionnaire de satisfaction. Rien ne part sans « Envoyer ».</p>' }; }
    if (modele === 'copieActe') { ouvrirEnvoiCopieActe(d.id); return { html: '<p>Envoi de la copie de l’acte ouvert.</p>' }; }
    if (modele && MODELES_EMAIL_RELANCE[modele]) {
      if (!emailDestinataireRelance(d)) return { html: `<p>Aucun email de destinataire sur ${escapeHtml(libelleDossierAffiche(d))} : renseignez-le sur la fiche, puis redemandez-moi.</p>`, boutons: [boutonFicheAssistant(d)] };
      envoyerRelanceCiblee(d.id, modele, true);
      return { html: `<p>Fenêtre d’email ouverte — modèle « ${escapeHtml(MODELES_EMAIL_RELANCE[modele].libelle)} », ${escapeHtml(libelleDossierAffiche(d))}. Rien ne part sans « Envoyer ».</p>` };
    }
    // Pas de modèle reconnu : email libre au client, texte de la phrase en premier jet si elle en porte un.
    const destinataire = emailDestinataireRelance(d) || d.emailVendeur || '';
    const r = await livrerEmailDossier({ destinataire, sujet: '', corps: '', confrere: notaireParticipantRepresenteAcquereur(d), responsableSignature: d.responsable, dossierId: d.id, geste: 'assistant' });
    if (r && r.ok) { ajouterHistorique(d, 'Email envoyé depuis « Demander à CLAIRE »'); sauvegarder(d); }
    return { html: r && r.ok ? '<p>Email envoyé.</p>' : (r && r.annule ? '<p>Email annulé.</p>' : `<p>${escapeHtml((r && r.message) || 'Fenêtre d’email fermée sans envoi.')}</p>`) };
  }

  // Ce que devient le lieu du rendez-vous de signature dans Outlook après la coche d'un envoi (étude 07/10 : « noter l'envoi dans
  // Outlook, dans le lieu, avec Appel de fonds envoyé ») — l'écriture elle-même est faite par cocherEcheance / devaliderEcheance.
  function noteAgendaEnvoiAssistant(d, type, decocher) {
    if (!TYPES_ENVOI_ECHEANCE.includes(type)) return '';
    if (!d.rendezVousSignature) return decocher ? '' : '<p>Pas encore de rendez-vous de signature : la mention sera notée dans le lieu du rendez-vous Outlook dès qu’il sera placé.</p>';
    if (!exchangeAgendaPret()) return '<p>Agenda Outlook non relié : mention à noter à la main dans le lieu du rendez-vous.</p>';
    const af = echeanceValidee(d, 'appelFonds');
    const pj = echeanceValidee(d, 'projetEnvoye');
    const mention = af && pj ? 'Appel de fonds et projet envoyé' : af ? 'Appel de fonds envoyé' : pj ? 'Projet envoyé' : '';
    const quand = `rendez-vous de signature du ${escapeHtml(formatDateFr(d.rendezVousSignature))}`;
    return mention ? `<p>Outlook : « ${mention} » noté dans le lieu du ${quand}.</p>` : `<p>Outlook : mention d’envoi retirée du lieu du ${quand}.</p>`;
  }

  function gesteCocherAssistant(d, p, decocher) {
    const type = p.echeance || '';
    const def = ECHEANCES_ASSISTANT.find(e => e.cle === type);
    if (!def) return { html: '<p>Quelle étape ? Appel de fonds, projet, offre de prêt, vente préalable ou signature.</p>' };
    if (type === 'ventebien' && !d.ventebien) return { html: '<p>Ce dossier n’a pas de vente préalable.</p>' };
    if (type === 'pret' && d.sansPret) return { html: '<p>Ce dossier est sans prêt.</p>' };
    const deja = echeanceValidee(d, type);
    if (!decocher && deja) return { html: `<p>${escapeHtml(def.libelle.charAt(0).toUpperCase() + def.libelle.slice(1))} : déjà coché sur ${escapeHtml(libelleDossierAffiche(d))}.</p>` };
    if (decocher && !deja) return { html: `<p>${escapeHtml(def.libelle.charAt(0).toUpperCase() + def.libelle.slice(1))} : pas coché sur ${escapeHtml(libelleDossierAffiche(d))}, rien à décocher.</p>` };
    if (decocher) devaliderEcheance(d.id, type); else cocherEcheance(d.id, type);
    return { html: `<p>${decocher ? 'Décoché' : 'Coché'} : ${escapeHtml(def.libelle)} — ${escapeHtml(libelleDossierAffiche(d))}.</p>${noteAgendaEnvoiAssistant(d, type, decocher)}`,
      boutons: [{ libelle: 'Annuler', action: () => { if (decocher) cocherEcheance(d.id, type); else devaliderEcheance(d.id, type); poserMessageAssistant('claire', '<p>Annulé.</p>'); } }, boutonFicheAssistant(d)] };
  }

  function gesteDateFicheAssistant(d, p) {
    const cle = p.champ || '';
    const def = CHAMPS_DATE_ASSISTANT.find(c => c.cle === cle);
    if (!def) return { html: '<p>Quelle date ? Obtention du prêt, vente préalable, date butoir, appel de fonds ou projet envoyé.</p>' };
    if (!p.date) return { html: '<p>À quelle date ? Donnez-la dans la phrase, par exemple « au 15 novembre ».</p>' };
    const avant = d[cle] || '';
    if (avant === p.date) return { html: `<p>La ${escapeHtml(def.libelle)} de ${escapeHtml(libelleDossierAffiche(d))} est déjà au ${escapeHtml(formatDateFr(p.date))}.</p>` };
    if (appliquerDateEcheance(d, cle, p.date) !== 'rendu') render();
    return { html: `<p>${escapeHtml(def.libelle.charAt(0).toUpperCase() + def.libelle.slice(1))} de ${escapeHtml(libelleDossierAffiche(d))} : ${avant ? `${escapeHtml(formatDateFr(avant))} → ` : ''}${escapeHtml(formatDateFr(p.date))}.</p>`,
      boutons: [{ libelle: 'Annuler', action: () => { if (appliquerDateEcheance(d, cle, avant) !== 'rendu') render(); poserMessageAssistant('claire', '<p>Date remise comme avant.</p>'); } }, boutonFicheAssistant(d)] };
  }

  function gesteArchiverAssistant(d) {
    if (d.archive) return { html: `<p>${escapeHtml(libelleDossierAffiche(d))} est déjà archivé.</p>`, boutons: [{ libelle: 'Désarchiver', action: () => { archiverDossier(d.id, false); poserMessageAssistant('claire', '<p>Dossier désarchivé.</p>'); } }] };
    archiverDossier(d.id, true);
    return { html: `<p>${escapeHtml(libelleDossierAffiche(d))} archivé.</p>`, boutons: [{ libelle: 'Annuler', action: () => { archiverDossier(d.id, false); poserMessageAssistant('claire', '<p>Dossier désarchivé.</p>'); } }] };
  }

  function gesteResponsableAssistant(d, p) {
    const nouveau = p.collaborateur || '';
    if (!nouveau || !RESPONSABLES.includes(nouveau)) return { html: `<p>À qui ? ${RESPONSABLES.map(r => escapeHtml(r.split(' ')[0])).join(', ')}.</p>`, boutons: RESPONSABLES.map(r => ({ libelle: r.split(' ')[0], action: () => { changerResponsable(d.id, r); poserMessageAssistant('claire', `<p>${escapeHtml(libelleDossierAffiche(d))} attribué à ${escapeHtml(r)}.</p>`); } })) };
    const avant = d.responsable || '';
    if (avant === nouveau) return { html: `<p>${escapeHtml(libelleDossierAffiche(d))} est déjà suivi par ${escapeHtml(nouveau)}.</p>` };
    changerResponsable(d.id, nouveau);
    return { html: `<p>${escapeHtml(libelleDossierAffiche(d))} attribué à ${escapeHtml(nouveau)}.</p>`, boutons: [{ libelle: 'Annuler', action: () => { changerResponsable(d.id, avant); poserMessageAssistant('claire', '<p>Responsable remis comme avant.</p>'); } }] };
  }

  // ---- Agenda : lecture immédiate, écriture toujours confirmée ----

  async function evenementsAgendaAssistant(debut, fin) {
    try {
      const r = await fetchAvecAuth(`/api/agenda/evenements?debut=${debut}&fin=${fin}`);
      const corps = await r.json();
      return Array.isArray(corps.evenements) ? corps.evenements : [];
    } catch (e) { return null; }
  }

  async function reponseCreneauxAssistant(d) {
    if (estSuccession(d) && !d.rendezVousSignature) return { html: '<p>Pour une succession, choisissez la date directement dans l’agenda.</p>', boutons: [{ libelle: 'Ouvrir l’agenda', action: () => definirOnglet('agenda') }] };
    const auj = isoAujourdhuiLocal();
    const evenements = (await evenementsAgendaAssistant(auj, addDays(auj, 90))) || agendaEvenements;
    const creneaux = creneauxProposesSignature(d, evenements, absencesOffice, auj, 4);
    if (!creneaux.length) return { html: `<p>Aucun créneau proposable pour ${escapeHtml(libelleDossierAffiche(d))} dans les règles de l’office (jours ouvrés, 14 jours au moins, hors 9 h et 12 h–14 h).</p>`, boutons: [{ libelle: 'Ouvrir l’agenda', action: () => definirOnglet('agenda') }] };
    const lignes = creneaux.map(c => `<li>${escapeHtml(dateAvecJourFr(c.date))} à ${escapeHtml(String(c.heure || '').replace(':', ' h '))}${c.exceptionnel ? ` <span class="asst-note">(exceptionnel : ${escapeHtml(c.exceptionnel)})</span>` : ''}</li>`);
    const boutons = creneaux.slice(0, 3).map(c => ({ libelle: `Placer le ${formatDateFr(c.date)} ${String(c.heure || '').replace(':', 'h')}`, action: () => placerCreneauSignature(d.id, c.date, c.heure) }));
    boutons.push({ libelle: 'Proposer ces dates aux clients', action: () => ouvrirSondageCreneaux(d.id, creneaux) });
    return { html: `<p>Créneaux possibles pour ${escapeHtml(libelleDossierAffiche(d))} :</p><ul class="asst-liste">${lignes.join('')}</ul><p class="asst-note">Placer demande une confirmation avant d’écrire dans l’agenda.</p>`, boutons };
  }

  function gestePlacerSignatureAssistant(d, p) {
    if (!p.date) return reponseCreneauxAssistant(d);
    if (!exchangeAgendaPret()) {
      // Sans agenda relié : la date va sur la fiche (même chemin que la saisie à la main).
      if (appliquerDateEcheance(d, 'rendezVousSignature', p.date) !== 'rendu') render();
      return { html: `<p>Signature de ${escapeHtml(libelleDossierAffiche(d))} notée le ${escapeHtml(formatDateFr(p.date))} sur la fiche (agenda Outlook non relié).</p>`, boutons: [boutonFicheAssistant(d)] };
    }
    const heure = p.heure || '10:00';
    placerCreneauSignature(d.id, p.date, heure);
    return { html: `<p>Placer la signature de ${escapeHtml(libelleDossierAffiche(d))} le ${escapeHtml(dateAvecJourFr(p.date))} à ${escapeHtml(heure.replace(':', ' h '))}${p.heure ? '' : ' (heure par défaut)'} : confirmez dans la fenêtre.</p>` };
  }

  function gesteSondageAssistant(d) {
    ouvrirSondageCreneaux(d.id);
    return { html: `<p>Sondage de dates ouvert pour ${escapeHtml(libelleDossierAffiche(d))} : choisissez les créneaux, puis l’email part par « Envoyer ».</p>` };
  }

  // « Pose des options pour MARTIN mardi à 14 h et jeudi à 10 h » (étude 07/10 ; choix : options seules, sans email, confirmées
  // avant). Sans créneau écrit, ceux que CLAIRE propose dans les règles de l'office (« 3 options », 3 par défaut). Les options sont
  // celles du sondage de créneaux, sans destinataire (`poserOptionsRendezVous`) : « Placer » sur l'une en fait la signature et
  // retire les autres.
  async function gesteOptionsAssistant(d, p) {
    if (!exchangeAgendaPret()) return { html: '<p>L’agenda Outlook n’est pas relié (Réglages › Agenda et Outlook) : impossible de poser des options.</p>' };
    const nom = escapeHtml(libelleDossierAffiche(d));
    if (d.rendezVousSignature) {
      return { html: `<p>${nom} a déjà son rendez-vous de signature le ${escapeHtml(formatDateFr(d.rendezVousSignature))} : retirez-le d’abord pour poser des options.</p>`, boutons: [boutonFicheAssistant(d)] };
    }
    const ouvert = sondageOuvertDossier(d.id);
    if (ouvert) {
      return { html: `<p>${nom} a déjà ${ouvert.optionsSeules ? 'des options' : 'un sondage de dates'} en cours : placez-en une ou retirez-les d’abord.</p>`,
        boutons: [{ libelle: 'Voir les dates proposées', action: () => { definirOnglet('agenda'); ouvrirSuiviDatesProposees(); } }] };
    }
    let creneaux = (Array.isArray(p.creneaux) ? p.creneaux : []).filter(c => c && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && /^\d{2}:\d{2}$/.test(c.heure));
    let proposes = false;
    if (!creneaux.length) {
      const auj = isoAujourdhuiLocal();
      const evenements = (await evenementsAgendaAssistant(auj, addDays(auj, 90))) || agendaEvenements;
      creneaux = creneauxProposesSignature(d, evenements, absencesOffice, auj, Math.min(MAX_CRENEAUX_SONDAGE, p.nombre || 3));
      proposes = true;
    }
    creneaux = creneaux.slice(0, MAX_CRENEAUX_SONDAGE).map(c => ({ date: c.date, heure: c.heure, exceptionnel: c.exceptionnel || '' }));
    if (!creneaux.length) {
      return { html: `<p>Aucun créneau proposable pour ${nom} dans les règles de l’office : dites les dates (« mardi à 14 h et jeudi à 10 h »).</p>`, boutons: [{ libelle: 'Ouvrir l’agenda', action: () => definirOnglet('agenda') }] };
    }
    const texte = (c) => `${dateAvecJourFr(c.date)} à ${c.heure.replace(':', ' h ')}`;
    const n = creneaux.length;
    demanderConfirmation(`Poser ${n > 1 ? `${n} options` : 'une option'} pour ${libelleDossierAffiche(d)} dans l’agenda de l’office : ${creneaux.map(texte).join(' ; ')} ? Aucun email n’est envoyé. « Placer » sur l’une en fera la signature et retirera les autres ; sans décision, elles sont retirées après 5 jours ouvrés.`,
      () => poserOptionsRendezVous(d, creneaux), { bouton: n > 1 ? 'Poser les options' : 'Poser l’option', ton: 'valider' });
    const lignes = creneaux.map(c => `<li>${escapeHtml(texte(c))}${c.exceptionnel ? ` <span class="asst-note">(exceptionnel : ${escapeHtml(c.exceptionnel)})</span>` : ''}</li>`);
    return { html: `<p>${proposes ? 'Créneaux proposés par CLAIRE pour' : 'Options pour'} ${nom} :</p><ul class="asst-liste">${lignes.join('')}</ul><p class="asst-note">Confirmez dans la fenêtre avant l’écriture dans l’agenda.</p>` };
  }

  function gesteRendezVousAssistant(p, phrase) {
    if (!exchangeAgendaPret()) return { html: '<p>L’agenda Outlook n’est pas relié (Réglages › Agenda et Outlook) : impossible de créer un rendez-vous.</p>' };
    definirOnglet('agenda');
    ouvrirCreationAgenda(p.date || isoAujourdhuiLocal(), p.heure || '09:00');
    const titre = String(p.titre || '').trim() || titreRendezVousDepuisPhrase(phrase);
    const champ = document.getElementById('agenda-creation-titre');
    if (champ && titre) champ.value = titre;
    return { html: `<p>Formulaire « Nouveau rendez-vous » ouvert${p.date ? ` le ${escapeHtml(formatDateFr(p.date))}` : ''}${p.heure ? ` à ${escapeHtml(p.heure.replace(':', ' h '))}` : ''}${titre ? ` — « ${escapeHtml(titre)} »` : ''} : vérifiez et validez.</p>` };
  }

  // Pure : « Rendez-vous avec le syndic jeudi à 14 h » → « Rendez-vous avec le syndic ».
  function titreRendezVousDepuisPhrase(phrase) {
    let t = String(phrase || '').replace(/^\s*(ajoute[rz]?|crée[rz]?|cree[rz]?|mets?|nouveau|un)\s+(un\s+)?/i, '');
    // Pas de \b devant « à » (lettre accentuée, voir CLAUDE.md) : lookarounds.
    t = texteRappelDepuisPhrase(t).replace(/(?<![A-Za-z0-9_À-ɏ])(à|a) \d{1,2} ?(h|:|heures?)( ?\d{2})?(?![A-Za-z0-9_À-ɏ])/i, '').replace(/(?<![A-Za-z0-9_À-ɏ])(dans|à|a) l.agenda(?![A-Za-z0-9_À-ɏ])/i, '').replace(/\s{2,}/g, ' ').trim();
    return t.replace(/^(rdv)\b/i, 'Rendez-vous');
  }

  async function reponseAgendaJourAssistant(p) {
    const auj = isoAujourdhuiLocal();
    const jour = p.date || auj;
    const evenements = await evenementsAgendaAssistant(jour, jour);
    if (evenements === null) return { html: '<p>L’agenda de l’office n’a pas pu être lu.</p>' };
    const liste = evenements.filter(e => e && e.date === jour).sort((a, b) => String(a.heure || '').localeCompare(String(b.heure || '')));
    if (!liste.length) return { html: `<p>Rien à l’agenda ${jour === auj ? 'aujourd’hui' : 'le ' + escapeHtml(dateAvecJourFr(jour))}.</p>`, boutons: [{ libelle: 'Ouvrir l’agenda', action: () => definirOnglet('agenda') }] };
    const lignes = liste.map(e => `<li><b>${e.journeeEntiere || !e.heure ? 'Journée' : escapeHtml(String(e.heure).replace(':', ' h '))}</b> ${escapeHtml(e.sujet || '')}${e.lieu ? ` <span class="asst-note">— ${escapeHtml(e.lieu)}</span>` : ''}</li>`);
    return { html: `<p>${liste.length} rendez-vous ${jour === auj ? 'aujourd’hui' : 'le ' + escapeHtml(dateAvecJourFr(jour))} :</p><ul class="asst-liste">${lignes.join('')}</ul>`, boutons: [{ libelle: 'Ouvrir l’agenda', action: () => definirOnglet('agenda') }] };
  }

  // ---- Outils de calcul ----

  function gesteOutilAssistant(d, outil) {
    if (outil === 'appel-fonds') {
      if (estSuccession(d)) return { html: '<p>Pas d’appel de fonds pour une succession.</p>' };
      preparerAppelFondsDepuisDossier(d.id);
      return { html: `<p>Outil Appel de fonds ouvert sur ${escapeHtml(libelleDossierAffiche(d))} ; les pièces du NAS sont relues.</p>` };
    }
    ouvrirPreemptionDepuisFiche(d.id);
    return { html: `<p>Droits de préemption ouverts sur ${escapeHtml(libelleDossierAffiche(d))} ; le zonage de chaque parcelle se lit sur le Géoportail.</p>` };
  }

  function gesteQuotitesAssistant(p, phrase) {
    const prix = p.montant || null;
    const parts = Array.isArray(p.parts) && p.parts.length === 2 ? p.parts : partsDepuisTexte(phrase);
    const r = reconnaitreDossier(phrase, dossiersPourAssistant(dossiers));
    const d = r.dossier ? dossiers.find(x => x.id === r.dossier) : null;
    definirOnglet('quotites');
    if (d) choisirDossierQuotites(d.id); else { qtEtat = etatQuotitesVierge(); qtDossierLie = null; renderPillDossierQuotites(); }
    if (prix) qtEtat.lignes[0].montant = prix;
    // Deux parts données pour un seul acquéreur connu : un second à nommer.
    if (parts.length === 2 && qtEtat.acquereurs.length < 2) qtEtat.acquereurs.push({ id: qtId(), civilite: 'Madame', nom: '' });
    if (parts.length === 2 && qtEtat.acquereurs.length >= 2) {
      const base = prix || montantQuotite(qtEtat.lignes[0].montant) || 0;
      const apport = qtEtat.sources.find(s => s.type === 'apport') || qtEtat.sources[0];
      if (apport && base) { apport.montants = {}; apport.montants[qtEtat.acquereurs[0].id] = Math.round(base * parts[0]) / 100; apport.montants[qtEtat.acquereurs[1].id] = Math.round(base * parts[1]) / 100; }
    }
    renderQuotites();
    const calc = calculerQuotites(qtEtat);
    const noms = qtEtat.acquereurs.map((a, i) => `${a.nom || `Acquéreur ${i + 1}`} : ${calc.pourcentages && calc.pourcentages[i] !== undefined ? calc.pourcentages[i] : 0} %`);
    return { html: `<p>Outil Quotités ouvert${d ? ` sur ${escapeHtml(libelleDossierAffiche(d))}` : ''}${prix ? `, prix ${escapeHtml(formaterMontantEuros(prix))}` : ''}.</p>${calc.totalFinancement ? `<ul class="asst-liste">${noms.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : '<p class="asst-note">Complétez les apports et prêts de chaque acquéreur pour obtenir les quotités.</p>'}` };
  }

  function reponseProvisionAssistant(p) {
    const prix = p.montant || null;
    if (!prix) return { html: '<p>Pour quel prix ? Par exemple « provision pour une maison à 250 000 € ».</p>', boutons: [{ libelle: 'Ouvrir le simulateur', action: () => definirOnglet('calculateur') }] };
    const dept = p.departement && DEPARTEMENTS_FRAIS_ACTE[p.departement] ? p.departement : '41';
    const type = p.typeBien || 'house';
    const primo = !!p.primo;
    const e = estimerFraisActe(prix, dept, type, primo);
    if (!e) return { html: '<p>Le barème n’a pas pu être appliqué à ce prix.</p>' };
    const libelleType = type === 'condo' ? 'immeuble en copropriété' : type === 'land' ? 'terrain à bâtir' : 'immeuble hors copropriété';
    const ouvrir = () => {
      definirOnglet('calculateur');
      const champ = id => document.getElementById(id);
      if (champ('calc-price')) champ('calc-price').value = String(prix);
      if (champ('calc-dept')) champ('calc-dept').value = dept;
      if (champ('calc-type')) champ('calc-type').value = type;
      const radio = document.querySelector(`input[name="calc-first"][value="${primo ? 'yes' : 'no'}"]`);
      if (radio) radio.checked = true;
      calculerFraisActe();
    };
    return { html: `<p>Provision sur frais pour ${escapeHtml(formaterMontantEuros(prix))}, ${escapeHtml(libelleType)}, ${escapeHtml(DEPARTEMENTS_FRAIS_ACTE[dept].name)} (${dept})${primo ? ', primo-accédant' : ''} :</p><ul class="asst-liste"><li><b>Total estimé : ${escapeHtml(formaterPrix(e.total))}</b></li><li>Émoluments : ${escapeHtml(formaterPrix(e.emoluments))}</li><li>Trésor (droits) : ${escapeHtml(formaterPrix(e.tresor))}</li></ul><p class="asst-note">Barème validé par l’étude le 02/10/2026 ; débours forfaitaires compris.</p>`,
      boutons: [{ libelle: 'Ouvrir le simulateur', action: ouvrir }] };
  }

  function reponseProrataAssistant(p) {
    const montant = p.montant || null;
    const dateActe = p.date || '';
    if (!montant || !dateActe) return { html: '<p>Il me faut le montant et la date de l’acte, par exemple « prorata de 1 200 € de taxe foncière pour un acte le 15 juin ».</p>', boutons: [{ libelle: 'Ouvrir l’outil Prorata', action: () => definirOnglet('prorata') }] };
    const debut = p.debut || `${dateActe.slice(0, 4)}-01-01`;
    const fin = p.fin || `${dateActe.slice(0, 4)}-12-31`;
    const r = calculerProrata(montant, debut, fin, dateActe);
    if (!r) return { html: '<p>Le calcul n’est pas possible avec ces dates.</p>' };
    const ouvrir = () => {
      definirOnglet('prorata');
      const champ = id => document.getElementById(id);
      if (champ('prorata-montant')) champ('prorata-montant').value = String(montant);
      if (champ('prorata-debut')) champ('prorata-debut').value = debut;
      if (champ('prorata-fin')) champ('prorata-fin').value = fin;
      if (champ('prorata-date')) champ('prorata-date').value = dateActe;
      if (typeof calculerProrataAffichage === 'function') calculerProrataAffichage();
    };
    return { html: `<p>Prorata de ${escapeHtml(formaterMontantEuros(montant))} sur la période du ${escapeHtml(formatDateFr(debut))} au ${escapeHtml(formatDateFr(fin))}, acte le ${escapeHtml(formatDateFr(dateActe))} :</p><ul class="asst-liste"><li>Part du vendeur : <b>${escapeHtml(formaterMontantEuros(r.partVendeur))}</b> (${r.joursVendeur} j)</li><li>Part de l’acquéreur : <b>${escapeHtml(formaterMontantEuros(r.partAcquereur))}</b> (${r.joursAcquereur} j, jour de l’acte compris)</li></ul>`,
      boutons: [{ libelle: 'Ouvrir l’outil Prorata', action: ouvrir }] };
  }

  // ---- Navigation et recherche ----

  function gesteOuvrirDossierAssistant(d) {
    ouvrirDossierDepuisDashboard(d.id);
    return { html: `<p>Fiche ${escapeHtml(libelleDossierAffiche(d))} ouverte.</p>` };
  }

  function gesteOuvrirEcranAssistant(p) {
    const e = ECRANS_ASSISTANT.find(x => x.cle === p.ecran);
    if (!e) return { html: '<p>Quel écran ? Tableau de bord, agenda, suivi, Claire Scan, outils, réglages, nouveau dossier, répertoire.</p>' };
    if (e.cle === 'outils') ouvrirTiroirOutils(); else definirOnglet(e.cle);
    return { html: `<p>${escapeHtml(e.libelle)} ouvert.</p>` };
  }

  function reponseRechercheAssistant(texte) {
    const mots = motsUtilesAssistant(texte);
    if (!mots.length) return { html: '<p>Que cherchez-vous ? Un nom, une adresse, une commune.</p>' };
    const score = d => {
      const champs = [d.nom, d.responsable, d.bien && d.bien.adresse, ...(d.parties || []).map(p => `${p.prenom || ''} ${p.nom || ''}`), ...(d.biens || []).map(b => b.adresse)].filter(Boolean).map(normaliserPourRecherche).join(' ');
      return mots.filter(m => champs.indexOf(m) !== -1).length;
    };
    const trouves = dossiers.map(d => ({ d, s: score(d) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s || (a.d.archive ? 1 : 0) - (b.d.archive ? 1 : 0)).slice(0, 8);
    if (!trouves.length) return { html: `<p>Aucun dossier ne correspond à « ${escapeHtml(texte)} ».</p>` };
    return { html: `<p>${trouves.length} dossier${trouves.length > 1 ? 's' : ''} trouvé${trouves.length > 1 ? 's' : ''} :</p><ul class="asst-liste">${trouves.map(x => `<li><b>${escapeHtml(libelleDossierAffiche(x.d))}</b>${x.d.bien && x.d.bien.adresse ? ` — ${escapeHtml(x.d.bien.adresse)}` : ''}${x.d.archive ? ' (archivé)' : ''}</li>`).join('')}</ul>`,
      boutons: trouves.slice(0, 4).map(x => ({ libelle: libelleDossierAffiche(x.d), action: () => { assistantContexte.dossierId = x.d.id; ouvrirDossierDepuisDashboard(x.d.id); } })) };
  }

  function reponseAideAssistant() {
    const lignes = INTENTIONS_ASSISTANT.filter(i => i.cle !== 'inconnu' && i.cle !== 'aide').map(i => `<li><b>${escapeHtml(i.libelle)}</b>${i.exemples[0] ? ` — <i>${escapeHtml(i.exemples[0])}</i>` : ''}</li>`);
    return { html: `<p>Je comprends une phrase et je fais le geste avec les fonctions de CLAIRE. Les emails s’ouvrent dans la fenêtre d’envoi (rien ne part sans « Envoyer »), l’agenda demande une confirmation, le reste se fait tout de suite et s’annule d’un clic.</p><ul class="asst-liste asst-aide">${lignes.join('')}</ul>` };
  }

  function reponseInconnuAssistant(r) {
    // La raison technique (adresse d'Ollama, message de fetch) reste dans la console ; à l'écran, le fait seul.
    if (r && r.raisonIa) console.warn('Assistant : ' + r.raisonIa);
    const motif = r && r.raisonIa ? ' <span class="asst-note">(sans l’IA, je ne lis que les mots-clés)</span>' : '';
    return { html: `<p>Je n’ai pas compris la demande.${motif} Essayez avec le nom d’un dossier et un verbe : « où en est… », « relance… », « rappelle-moi… », « place la signature… », ou demandez-moi « que sais-tu faire ? ».</p>`,
      boutons: [{ libelle: 'Que sais-tu faire ?', action: () => envoyerDemandeAssistant('Que sais-tu faire ?') }] };
  }

  // Réglages › IA et relecture d'actes › « Demander à CLAIRE » : moteur (Mistral, noms masqués, ou IA locale) et usage du mois.
  // Pure : la ligne d'usage du mois (demandes, coût estimé en euros, erreurs). @param {any} u
  function texteUsageAssistant(u) {
    if (!u || !u.demandes) return 'Aucune demande envoyée à Mistral ce mois-ci.';
    const euros = (u.coutUsd || 0) * 0.92;
    const cout = euros < 0.01 ? 'moins d’un centime' : `≈ ${euros.toFixed(2).replace('.', ',')} €`;
    return `${u.demandes} demande${u.demandes > 1 ? 's' : ''} comprise${u.demandes > 1 ? 's' : ''} par Mistral — ${cout}${u.erreurs ? ` · ${u.erreurs} sans réponse` : ''}.`;
  }

  async function chargerReglagesAssistant() {
    try {
      const r = await fetchAvecAuth('/api/assistant/reglages');
      if (!r.ok) return;
      const data = await r.json();
      const choix = document.getElementById('reglages-assistant-moteur');
      if (choix) choix.value = data.moteur || 'mistral';
      const toutes = document.getElementById('reglages-assistant-toutes');
      if (toutes) toutes.checked = data.toutesDemandes !== false;
      const usage = document.getElementById('reglages-assistant-usage');
      if (usage) usage.textContent = texteUsageAssistant(data.usage) + (data.moteur === 'mistral' && !data.cleMistralEnregistree ? ' Aucune clé Mistral : l’IA locale est utilisée.' : '');
    } catch (e) { /* Réglages sans connexion : rien à afficher */ }
  }

  async function enregistrerReglagesAssistant() {
    const choix = document.getElementById('reglages-assistant-moteur');
    const sortie = document.getElementById('reglages-assistant-resultat');
    try {
      const r = await fetchAvecAuth('/api/assistant/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moteur: choix ? choix.value : 'mistral', toutesDemandes: !!(document.getElementById('reglages-assistant-toutes') || {}).checked }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.erreur || `Le serveur a répondu ${r.status}.`);
      assistantDisponibilite.quand = 0;
      if (sortie) sortie.textContent = data.moteur === 'mistral' && !data.cleMistralEnregistree ? 'Enregistré — saisissez la clé Mistral plus bas.' : 'Enregistré.';
      chargerReglagesAssistant();
    } catch (e) {
      if (sortie) sortie.textContent = `Non enregistré : ${e.message || e}`;
    }
  }

  // ---- Widget « Demander à CLAIRE » du tableau de bord (étude 07/10 : « où l'on peut poser une question et qui renvoie vers
  // la page ») : un champ et quelques exemples ; la question part sur la page de conversation, où la réponse s'affiche.
  // Le champ n'est écrit qu'une fois : le tableau de bord se redessine toutes les quelques secondes, la saisie en cours et le
  // focus restent ; seuls les exemples et l'en-tête suivent la taille de la carte. ----
  function renderWidgetAssistant(perimetre) {
    const bloc = document.getElementById('widget-assistant');
    if (!bloc) return;
    const presentation = presentationWidget('assistant');
    // Une rangée (étude 07/10 : « moins haut, une ligne ») : demi-hauteur de la grille — titre, champ et bouton sur une ligne,
    // exemples sur une seule ligne dessous (ce qui ne tient pas est retiré par ajusterWidgets).
    const w = dispositionWidgetsCourante().find(x => x.id === 'assistant') || {};
    const compact = (w.hauteur || 1) === 1;
    const forme = presentation + (compact ? '-compact' : '');
    const exemples = presentation === 'petit' ? [] : suggestionsAssistant(perimetre);
    const reprendre = assistantMessages.length
      ? `<button type="button" class="lien-discret" onclick="definirOnglet('assistant')">Reprendre la conversation</button>` : '';
    const puces = exemples.map(s => `<button type="button" class="asst-suggestion w-asst-exemple" onclick="envoyerDepuisWidgetAssistant(this.textContent)">${escapeHtml(s)}</button>`).join('');
    const existant = bloc.querySelector('.w-carte.assistant');
    if (existant && existant.dataset.forme === forme && bloc.querySelector('#widget-assistant-saisie')) {
      const d = existant.querySelector('.w-tete-droite-asst');
      if (d && d.innerHTML !== reprendre) d.innerHTML = reprendre;
      const liste = existant.querySelector('.w-asst-exemples');
      if (liste && liste.dataset.cle !== exemples.join('|')) { liste.dataset.cle = exemples.join('|'); liste.innerHTML = puces; planifierAjustementWidgets(); }
      return;
    }
    // Le titre du widget, comme sur les autres cartes (étude 07/10 : « remettre le titre du widget »).
    const titre = 'Demander à CLAIRE';
    const formulaire = `<form class="asst-saisie w-asst-saisie w-fixe" onsubmit="event.preventDefault(); envoyerDepuisWidgetAssistant();">
        <input type="text" id="widget-assistant-saisie" autocomplete="off" placeholder="Posez votre question…" aria-label="Votre question à CLAIRE">
        <wa-button variant="brand" type="submit" size="s" class="asst-envoyer" aria-label="Demander">${icone('send')}</wa-button>
      </form>`;
    const listeExemples = exemples.length ? `<div class="w-asst-exemples" data-ajuster="1" data-cle="${escapeAttr(exemples.join('|'))}">${puces}</div>` : '';
    // Une rangée : le titre en tête comme ailleurs, puis le champ et les exemples sur une seule ligne.
    bloc.innerHTML = compact
      ? carteWidget({ presentation, classe: 'assistant w-asst-compact', attributs: `data-forme="${forme}"`, titre,
        droite: `<span class="w-tete-droite-asst">${reprendre}</span>`, corps: `<div class="w-asst-ligne">${formulaire}${listeExemples}</div>` })
      : carteWidget({ presentation, classe: 'assistant', attributs: `data-forme="${forme}"`, titre,
      droite: `<span class="w-tete-droite-asst">${reprendre}</span>`, corps: formulaire + listeExemples });
  }

  // La question du widget (ou l'exemple cliqué) part sur la page « Demander à CLAIRE ». Champ vide : la page s'ouvre.
  // Une réponse encore en cours sur la page : la question attend dans son champ, rien n'est perdu.
  function envoyerDepuisWidgetAssistant(texteForce) {
    const champ = document.getElementById('widget-assistant-saisie');
    const texte = String(texteForce || (champ ? champ.value : '') || '').trim();
    if (champ) champ.value = '';
    definirOnglet('assistant');
    if (!texte) return;
    if (assistantEnCours) {
      const saisie = document.getElementById('assistant-saisie');
      if (saisie) saisie.value = texte;
      return;
    }
    envoyerDemandeAssistant(texte);
  }
