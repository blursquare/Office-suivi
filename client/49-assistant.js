  // ---- « Demander à CLAIRE » (étude 06/10) : une page de conversation, façon Claude, où l'on dit en une phrase ce qu'on
  // veut — l'état d'un dossier, une tâche, un email, un rendez-vous, un calcul — et CLAIRE répond ou fait le geste avec ses
  // fonctions habituelles. Choix de l'étude (06/10) : IA locale seule (Ollama, serveur) ; tout se fait sans carte de
  // confirmation SAUF les emails (la fenêtre d'email reste, rien ne part sans « Envoyer ») et l'agenda (confirmation
  // de la fiche, formulaire « Nouveau rendez-vous ») ; tous les gestes dès la première version, outils de calcul compris.
  // La compréhension est faite par le serveur (commun/assistant.js + Ollama, POST /api/assistant/comprendre) ; ici, le
  // dossier désigné est connu, et chaque intention appelle la fonction qui existe déjà — rien n'est refait ni inventé. ----

  let assistantMessages = [];           // [{ role: 'moi' | 'claire', html, boutons: [{ libelle, action, principal }], quand }]
  let assistantContexte = { dossierId: '', attente: null, historique: [], echanges: [] };
  let assistantEnCours = false;
  let assistantDisponibilite = { ia: null, raison: '', modele: '', quand: 0 };
  var assistantActions = {};            // clé du bouton → fonction (jamais de code dans l'attribut onclick)

  function initAssistant() {
    chargerConversationsAssistant();
    chargerCanaux();
    if (dossierOuvert && !canaux.actif) assistantContexte.dossierId = dossierOuvert;   // un canal de dossier garde SON dossier
    renderAssistant();
    chargerDisponibiliteAssistant();
    const champ = document.getElementById('assistant-saisie');
    if (champ) setTimeout(() => champ.focus({ preventScroll: true }), 0);
    initPiecesJointesAssistant();
  }

  async function chargerDisponibiliteAssistant() {
    if (!authToken || Date.now() - assistantDisponibilite.quand < 60000) return;
    try {
      const r = await fetchAvecAuth('/api/assistant/disponibilite');
      const corps = await r.json();
      assistantDisponibilite = { ia: !!corps.ia, moteur: corps.moteur || 'locale', raison: corps.raison || '', modele: corps.modele || '', agent: !!corps.agent, quand: Date.now() };
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
    const nom = d.moteur === 'claude' ? 'IA Claude' : d.moteur === 'mistral' ? 'IA Mistral' : 'IA locale';
    // Agent (11/10) : Claude lit les dossiers avec ses outils, noms masqués par le serveur.
    if (d.agent) {
      const modele = { 'claude-opus-5-5': 'Claude Opus 5.5', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'claude-haiku-5-5': 'Claude Haiku 5.5',
        'mistral-large-latest': 'Mistral Large', 'mistral-medium-latest': 'Mistral Medium', 'mistral-small-latest': 'Mistral Small' }[d.modele] || (d.moteur === 'mistral' ? 'Mistral' : 'Claude');
      el.innerHTML = `<span class="dot-label dl-success" title="CLAIRE lit les dossiers pour répondre ; noms, emails et téléphones sont remplacés par des codes avant de partir. Une adresse, une référence ou un numéro ne le sont que s’ils sont dans la même phrase ou la même fiche qu’un nom de famille."><span class="dot"></span>${escapeHtml(modele)} — dossiers lus, noms masqués</span>`;
      return;
    }
    el.innerHTML = d.ia
      ? `<span class="dot-label dl-success"${d.raison ? ` title="${escapeAttr(d.raison)}"` : ''}><span class="dot"></span>${nom} prête${d.moteur === 'mistral' || d.moteur === 'claude' ? ' — noms masqués' : ''}</span>`
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

  // Pure (étude 11/10, présentation « à la Slack ») : pour chaque message, s'il ouvre un groupe (avatar, nom et heure) ou s'il
  // suit le précédent du même auteur à moins de 5 minutes, et s'il faut un séparateur de jour devant lui.
  function repereMessagesAssistant(messages) {
    let prec = null;
    return (messages || []).map(m => {
      const jour = new Date(m.quand || 0).toDateString();
      const nouveauJour = !prec || new Date(prec.quand || 0).toDateString() !== jour;
      const debutGroupe = nouveauJour || !prec || prec.role !== m.role || (m.quand || 0) - (prec.quand || 0) > 5 * 60000;
      prec = m;
      return { nouveauJour, debutGroupe };
    });
  }

  function libelleJourAssistant(quand, maintenant) {
    const d = new Date(quand || 0); const auj = new Date(maintenant || Date.now());
    if (d.toDateString() === auj.toDateString()) return 'Aujourd’hui';
    const hier = new Date(auj); hier.setDate(hier.getDate() - 1);
    if (d.toDateString() === hier.toDateString()) return 'Hier';
    const texte = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  }

  function heureAssistant(quand) {
    return new Date(quand || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // Pure : les exemples d'une discussion sur un dossier — le nom court du dossier y figure, pour que la phrase désigne le dossier sans « @ ».
  function exemplesDossierAssistant(d) {
    const nom = String((d && d.nom) || '').split('/')[0].trim() || 'ce dossier';
    return [`Où en est le dossier ${nom} ?`, `Quelles pièces manquent pour ${nom} ?`, `Fais l’appel de fonds de ${nom}`, `Trouve une date de signature pour ${nom}`];
  }

  // « Comme Slackbot » (étude 25/10 : « l'accueil doit ressembler à Slackbot ») : un grand avatar carré arrondi, le nom, puis un
  // paragraphe dont la première phrase est en gras et dont les exemples sont des phrases cliquables entre « » (un `span`, pas un
  // `button` : un bouton ne se coupe pas en fin de ligne). `cliquables` faux (canal : la saisie est celle du canal) = texte seul.
  function htmlExemplesAssistant(exemples, cliquables) {
    return (exemples || []).map(e => cliquables
      ? `<span class="asst-exemple" role="button" tabindex="0" data-q="${escapeAttr(e)}" onclick="envoyerDemandeAssistant(this.dataset.q)" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); envoyerDemandeAssistant(this.dataset.q); }">« ${escapeHtml(e)} »</span>`
      : `« ${escapeHtml(e)} »`).join(', ');
  }

  function htmlPresentationClaire(titre, gras, texte, exemples, cliquables, icone_) {
    return `<div class="asst-accueil asst-slackbot">
        <div class="asst-slackbot-av" aria-hidden="true">${icone(icone_ || 'discussion')}</div>
        <h2 class="asst-accueil-titre">${escapeHtml(titre)}</h2>
        <p class="asst-accueil-texte"><strong>${escapeHtml(gras)}</strong> ${escapeHtml(texte)}${exemples && exemples.length ? ' ' + htmlExemplesAssistant(exemples, cliquables) + ', ou autre chose.' : ''}</p>
      </div>`;
  }

  function renderAssistant() {
    const zone = document.getElementById('assistant-messages');
    if (!zone) return;
    renderFilsAssistant();
    appliquerFilsRepliesAssistant();
    renderColonneAssistant();
    renderArtefactAssistant();
    assistantActions = {};
    renderCanaux();
    // Dans un canal (client/112 et 113), le fil est celui du serveur, présenté façon Slack ; tout le reste de la page est la même.
    if (canaux.actif) { renderCanalAssistant(zone); return; }
    majSaisieCanal();
    renderEnteteCanal();
    if (!assistantMessages.length) {
      arreterRevelationAssistant();
      const rattache = assistantContexte.dossierId ? dossiers.find(x => x.id === assistantContexte.dossierId) : null;
      zone.innerHTML = (rattache
        ? htmlPresentationClaire(libelleDossierAffiche(rattache), 'Ceci est votre discussion sur ce dossier.',
          'Claire en connaît la fiche, les pièces et les échéances : posez-lui vos questions sans citer le dossier. Vous pouvez par exemple demander',
          exemplesDossierAssistant(rattache), true, 'folder')
        : htmlPresentationClaire('CLAIRE', `${accueilAssistant(prenomPosteAssistant(), new Date()).replace(/,? que puis-je faire pour vous \?$/, '')}, ceci est votre espace avec CLAIRE.`,
          'Un dossier, une tâche, un email, un rendez-vous, un calcul : dites-le en une phrase, et tapez @ pour citer un dossier. Vous pouvez par exemple demander',
          suggestionsAssistant(dossiersPerimetreDashboard()).slice(0, 5), true))
        + htmlFilClaire(entreesFilClaire([], messagesClairePourFil(Date.now())), Date.now());
      if (messagesClaireEtat.liste.length) zone.scrollTop = zone.scrollHeight;
      return;
    }
    // Ses messages (rappels, pièces trouvées, comptes rendus…) prennent leur place dans le fil, à leur heure, comme dans une conversation
    // ordinaire (étude 27/10 : « le flux d'échange doit être comme une conversation classique » ; client/129).
    const entrees = entreesFilClaire(assistantMessages, messagesClairePourFil(Date.now()));
    const reperes = repereMessagesAssistant(entrees.map(x => (x.notif ? { role: 'claire', quand: x.notif.quand } : x.m)));
    const maintenant = Date.now();
    zone.innerHTML = entrees.map((x, k) => {
      const r = reperes[k];
      if (x.notif) return htmlNotifClaireFil(x.notif, r, maintenant);
      const m = x.m, i = x.i;
      const boutons = (m.boutons || []).map((b, k) => {
        const cle = `${i}-${k}`;
        assistantActions[cle] = b.action;
        return `<wa-button ${b.principal ? 'variant="brand"' : 'appearance="outlined"'} size="s" type="button" onclick="actionAssistant('${cle}')">${escapeHtml(b.libelle)}</wa-button>`;
      }).join('');
      const jour = r.nouveauJour ? `<div class="asst-jour" role="separator"><span>${escapeHtml(libelleJourAssistant(m.quand, maintenant))}</span></div>` : '';
      // Présentation « comme Slack » (étude 25/10 : « remettre le pseudo de la personne qui parle et l'horaire, comme Slack, pour tout ») :
      // avatar, prénom et heure en tête d'un groupe de messages du même auteur ; dans la suite, l'heure apparaît au survol dans la marge.
      const auteur = { role: m.role, auteur: m.role === 'moi' ? utilisateurPoste : '' };
      const tete = r.debutGroupe ? `<div class="cx-nom">${escapeHtml(nomAuteurCanal(auteur))}<span class="cx-heure">${escapeHtml(heureAssistant(m.quand))}</span></div>` : '';
      return `${jour}<div class="asst-message asst-slack asst-${m.role}${r.debutGroupe ? '' : ' asst-suite'}" data-index="${i}">
          ${r.debutGroupe ? avatarCanal(auteur) : `<span class="cx-heure-marge" aria-hidden="true">${escapeHtml(heureAssistant(m.quand))}</span>`}
          <div class="asst-corps">${tete}<div class="asst-texte">${m.html}</div>${htmlReactionsMessage(m)}${boutons ? `<div class="asst-boutons">${boutons}</div>` : ''}
          <div class="asst-survol">${htmlBoutonsReactionSurvol(m)}<wa-button appearance="plain" size="s" class="bouton-discret" type="button" onclick="copierMessageAssistant(${i})" title="Copier le message">${icone('copier')} Copier</wa-button></div></div>
        </div>`;
    }).join('') + (assistantEnCours ? `<div class="asst-message asst-slack asst-claire asst-ecrit">
          ${avatarClaireHtml()}
          <div class="asst-corps"><div class="asst-attente" aria-label="CLAIRE écrit"><span></span><span></span><span></span>${assistantEtapeAgent ? `<em class="asst-etape">${escapeHtml(assistantEtapeAgent)}</em>` : ''}</div></div></div>` : '');
    restaurerConsignesAssistant(zone);
    zone.scrollTop = zone.scrollHeight;
    reprendreRevelationAssistant(zone);
    remplirVignettesPiecesJointesAssistant();
  }

  function copierMessageAssistant(i) {
    const m = assistantMessages[i];
    if (!m) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = m.html;
    const texte = (tmp.innerText || tmp.textContent || '').trim();
    const fini = () => afficherToast('Message copié.');
    // L'API du presse-papiers n'existe qu'en HTTPS ou sur localhost ; les postes ouvrent CLAIRE par l'adresse IP du serveur.
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(texte).then(fini, () => copierParZoneAssistant(texte, fini)); return; }
    copierParZoneAssistant(texte, fini);
  }

  function copierParZoneAssistant(texte, fini) {
    const zone = document.createElement('textarea');
    zone.value = texte; zone.setAttribute('readonly', ''); zone.style.position = 'fixed'; zone.style.opacity = '0';
    document.body.appendChild(zone); zone.select();
    try { document.execCommand('copy'); fini(); } catch (e) { afficherToast('Copie impossible sur ce poste.'); }
    zone.remove();
  }

  // ---- Mention d'un dossier avec @ (étude 11/10) : « @mor » propose les dossiers dont le nom ou une partie commence par ces
  // lettres ; le choix remplace « @mor » par le nom du dossier, que le serveur reconnaît comme s'il avait été tapé. ----
  let mentionAssistant = { ouverte: false, debut: -1, liste: [], choix: 0 };
  // Dossiers choisis dans la liste depuis le dernier envoi : à l'envoi, celui dont le nom est encore dans la phrase est imposé
  // (deux « ROY », l'un archivé : c'est celui qu'on a choisi, jamais celui que la lecture du nom préférerait).
  let mentionsChoisiesAssistant = [];

  // Pure : l'id du dernier dossier choisi par @ dont le nom figure encore dans la phrase envoyée, sinon ''.
  function dossierMentionneAssistant(texte, mentions) {
    const t = String(texte || '');
    for (let k = (mentions || []).length - 1; k >= 0; k--) {
      const m = mentions[k];
      if (m && m.nom && m.id && t.includes(m.nom)) return m.id;
    }
    return '';
  }

  // Pure : les dossiers proposés pour « @requete » — en cours d'abord, puis archivés ; 6 au plus.
  function dossiersMentionAssistant(liste, requete) {
    const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const q = norm(requete).trim();
    const mots = (d) => norm([d.nom, ...(d.parties || []).map(p => p && p.nom)].join(' ')).split(/[^a-z0-9]+/).filter(Boolean);
    const retenus = (liste || []).filter(d => d && d.nom && (!q || mots(d).some(m => m.startsWith(q)) || norm(d.nom).includes(q)));
    retenus.sort((a, b) => (a.archive ? 1 : 0) - (b.archive ? 1 : 0) || String(a.nom).localeCompare(String(b.nom), 'fr'));
    return retenus.slice(0, 6);
  }

  function majMentionAssistant() {
    if (canaux.actif) { majMentionCanal(); return; }
    const champ = document.getElementById('assistant-saisie');
    const menu = document.getElementById('assistant-mention');
    if (!champ || !menu) return;
    const avant = champ.value.slice(0, champ.selectionStart || 0);
    const m = avant.match(/(^|\s)@([^\s@]{0,30})$/);
    if (!m) { fermerMentionAssistant(); return; }
    const liste = dossiersMentionAssistant(dossiers, m[2]);
    if (!liste.length) { fermerMentionAssistant(); return; }
    mentionAssistant = { ouverte: true, debut: avant.length - m[2].length - 1, liste, choix: Math.min(mentionAssistant.ouverte ? mentionAssistant.choix : 0, liste.length - 1) };
    menu.innerHTML = `<div class="asst-mention-titre">Dossiers</div>` + liste.map((d, k) =>
      `<button type="button" class="asst-mention-ligne${k === mentionAssistant.choix ? ' actif' : ''}" role="option" aria-selected="${k === mentionAssistant.choix}" onmousedown="event.preventDefault(); choisirMentionAssistant(${k})">
        <span class="asst-mention-nom">${escapeHtml(libelleDossierAffiche(d))}</span>${d.archive ? '<span class="asst-mention-note">archivé</span>' : d.responsable ? `<span class="asst-mention-note">${escapeHtml(initialesCollaborateur(d.responsable))}</span>` : ''}
      </button>`).join('');
    menu.style.display = 'block';
  }

  function fermerMentionAssistant() {
    mentionAssistant = { ouverte: false, debut: -1, liste: [], choix: 0 };
    const menu = document.getElementById('assistant-mention');
    if (menu) { menu.style.display = 'none'; menu.innerHTML = ''; }
  }

  function choisirMentionAssistant(k) {
    const champ = document.getElementById('assistant-saisie');
    const d = mentionAssistant.liste[k];
    if (!champ || !d) return;
    const fin = champ.selectionStart || 0;
    const insere = (d.insere !== undefined ? d.insere : d.nom) + ' ';
    champ.value = champ.value.slice(0, mentionAssistant.debut) + insere + champ.value.slice(fin);
    const pos = mentionAssistant.debut + insere.length;
    if (d.id) mentionsChoisiesAssistant.push({ nom: d.nom, id: d.id });
    fermerMentionAssistant();
    champ.focus();
    champ.setSelectionRange(pos, pos);
  }

  function insererArobaseAssistant() {
    const champ = document.getElementById('assistant-saisie');
    if (!champ) return;
    const pos = champ.selectionStart || champ.value.length;
    const avant = champ.value.slice(0, pos);
    const ajout = (avant && !/\s$/.test(avant) ? ' ' : '') + '@';
    champ.value = avant + ajout + champ.value.slice(pos);
    champ.focus();
    champ.setSelectionRange(pos + ajout.length, pos + ajout.length);
    majMentionAssistant();
  }

  function actionAssistant(cle) {
    const fn = assistantActions[cle];
    if (typeof fn === 'function') fn();
  }

  function poserMessageAssistant(role, html, boutons, meta) {
    const message = { role, html, boutons: boutons || [], quand: Date.now() };
    // Dans un fil de discussion (client/120), tout ce qui s'écrit pendant la demande — la question comme les réponses de CLAIRE — y reste.
    if (canaux.actif && canaux.parentCourant) message.parent = canaux.parentCourant;
    assistantMessages.push(message);
    if (role === 'moi' && canaux.actif) canaux.dernierMessageMoi = message;
    if (role === 'claire' && !canaux.actif) lancerRevelationAssistant(message);
    if (assistantMessages.length > (canaux.actif ? 300 : 60)) assistantMessages = assistantMessages.slice(canaux.actif ? -300 : -60);
    memoriserConversationAssistant(true);
    if (canaux.actif) canaux.forcerBas = true;
    renderAssistant();
    // Dans un canal, le message est aussi écrit sur le serveur : tous les collaborateurs le lisent.
    if (canaux.actif) publierMessageCanal(message, meta);
  }

  function nouvelleConversationAssistant() {
    if (!commencerConversationAssistant()) return;
    assistantMessages = [];
    oublierConversationAgent();
    mentionsChoisiesAssistant = [];
    assistantContexte = { dossierId: dossierOuvert || '', attente: null, historique: [], echanges: [] };
    reinitialiserColonneAssistant();
    renderAssistant();
    const champ = document.getElementById('assistant-saisie');
    if (champ) { champ.value = ''; champ.focus(); }
  }

  function toucheSaisieAssistant(event) {
    if (mentionAssistant.ouverte) {
      const n = mentionAssistant.liste.length;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        mentionAssistant.choix = (mentionAssistant.choix + (event.key === 'ArrowDown' ? 1 : n - 1)) % n;
        majMentionAssistant();
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choisirMentionAssistant(mentionAssistant.choix); return; }
      if (event.key === 'Escape') { event.preventDefault(); fermerMentionAssistant(); return; }
    }
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
          civilite: String((p && p.civilite) || ''), societe: !!(p && p.qualitePersonne === 'morale') })).filter(p => p.nom),
        // L'adresse du bien est envoyée à part : le serveur ne la code que dans une phrase ou une fiche qui porte un nom de famille
        // (étude 26/10) ; l'agence, les notaires et le défunt restent codés partout.
        adresses: [d.adresseBien, d.bien && d.bien.adresse, ...(Array.isArray(d.biens) ? d.biens.map(b => b && b.adresse) : [])].map(texte).filter(Boolean),
        autres: [d.nomAgence, d.notaireVendeur, d.notaireAcquereur, d.defunt && d.defunt.prenoms, d.defunt && d.defunt.nom, prenomDefuntDossier(d)].map(texte).filter(Boolean),
        reference: texte(d.referenceAuthentic),
        contacts: [d.emailVendeur, d.emailAcquereur, d.telephoneVendeur, d.telephoneAcquereur,
          ...parties.flatMap(p => [p && p.email, ...((p && p.emails) || []), ...((p && p.telephones) || [])])].map(texte).filter(Boolean)
      };
    });
  }

  // Vrai du clic sur « Envoyer » jusqu'à la toute fin du geste (lectures du NAS, agenda, email…) : on ne change pas de
  // conversation pendant ce temps, la réponse irait dans une autre (relecture 0.217.0).
  var assistantTraitementEnCours = false;
  async function envoyerDemandeAssistant(texteForce) {
    if (assistantTraitementEnCours) return;
    assistantTraitementEnCours = true;
    const suivi = debuterSuiviReactionsClaire();
    try { await envoyerDemandeAssistantSuite(texteForce); } finally { assistantTraitementEnCours = false; suivi.fin(); }
  }

  async function envoyerDemandeAssistantSuite(texteForce) {
    reinitialiserAutorisationDemandeAgent();   // chaque nouvelle demande repart avec ses propres cartes
    const champ = document.getElementById('assistant-saisie');
    const joints = !texteForce && piecesJointesAssistant.length > 0;
    const texte = String(texteForce || (champ ? champ.value : '') || '').trim() || (joints ? 'Que contient la pièce jointe et que faut-il en retenir ?' : '');
    if (!texte || assistantEnCours) return;
    // Pièces jointes (13/10) : lues par l'agent seulement ; sans lui, elles restent dans la saisie et on le dit.
    if (joints && !assistantDisponibilite.agent) {
      afficherToast('Les pièces jointes se lisent avec l’agent (Claude ou Mistral, Réglages › IA et relecture d’actes) : il n’est pas disponible.', 'OK', null);
      return;
    }
    const pieces = joints ? prendrePiecesJointesAssistant() : [];
    if (pieces.length) await televerserPiecesJointesAssistant(pieces);   // gardées sur le serveur 90 jours (étude 25/10)
    if (champ && !texteForce) champ.value = '';
    if (champ) champ.style.height = '';
    fermerMentionAssistant();
    const impose = dossierMentionneAssistant(texte, mentionsChoisiesAssistant);
    mentionsChoisiesAssistant = [];
    if (impose && dossiers.some(x => x.id === impose)) assistantContexte.dossierId = impose;
    // Dans une conversation personnelle la carte est dans le message ; dans un canal, le serveur renvoie les pièces du message (`pj`) et
    // le fil les montre de la même façon (htmlPiecesCanal).
    poserMessageAssistant('moi', htmlTexteCanal(texte, canaux.collaborateurs, utilisateurPoste) + (pieces.length && !canaux.actif ? `<div class="asst-pj-liste">${pieces.map(p => htmlCartePieceJointeAssistant(p)).join('')}</div>` : ''), [], { texte,
      pj: pieces.map(p => ({ nom: p.nom, type: p.sorte, ...(p.nas ? { nas: p.nas } : p.serveurId ? { fichierId: p.serveurId, taille: p.fichier ? p.fichier.size : 0 } : {}) })) });
    // Dans un canal, un message adressé à un collègue (@Julie) ou écrit « à l'équipe » n'appelle pas CLAIRE.
    // Dans un fil, la règle est celle du fil (claireRepondDansFil, client/120).
    if (canaux.actif && !(canaux.parentCourant ? canaux.claireRepondFil : claireDoitRepondreCanal(texte, canaux.actif === 'general' ? canaux.claireRepond : true, canaux.collaborateurs, canaux.actif))) return;
    marquerVuParClaire();
    noterEchangeAssistant('moi', texte);
    // On attendait le nom d'un dossier : la phrase est ce nom, on reprend la demande précédente.
    // Avec des pièces jointes, la phrase va à l'agent qui les lit (relecture 13/10 : elles étaient perdues après « Lequel ? »).
    if (pieces.length) assistantContexte.attente = null;
    if (assistantContexte.attente && assistantContexte.attente.type === 'dossier') {
      const r = impose ? { dossier: impose, candidats: [] } : reconnaitreDossier(texte, dossiersPourAssistant(dossiers));
      const attente = assistantContexte.attente;
      if (r.dossier) {
        assistantContexte.attente = null;
        const debut = Date.now();
        assistantEnCours = true; renderAssistant();
        try { await pauseReflexionAssistant(debut); } finally { assistantEnCours = false; }
        await executerDemandeAssistant({ ...attente.resultat, dossier: r.dossier, candidats: [] });
        return;
      }
      if (r.candidats.length) { proposerCandidatsAssistant(r.candidats, attente.resultat); return; }
      assistantContexte.attente = null;
      // Sinon, c'est une nouvelle demande : on continue normalement.
    }
    // L'agent (11/10) d'abord : Claude lit les dossiers et enchaîne les étapes ; sans lui, la compréhension d'une phrase.
    // Pièces jointes lues EN ENTIER sur ce poste, avant l'envoi : leur texte part avec la question (client/94), comme un document déposé
    // dans une conversation Claude ; celles qui ne se lisent pas restent à lire par l'agent.
    let documentsJoints = [];
    let piecesALire = pieces;
    if (pieces.length && assistantDisponibilite.agent) {
      assistantEnCours = true;
      renderAssistant();
      try {
        const lu = await lireDocumentsJointsAssistant(pieces);
        documentsJoints = lu.documents; piecesALire = lu.restantes;
        if (lu.coupe) poserMessageAssistant('claire', '<p class="asst-note">Le document est plus long que ce que le modèle choisi peut lire : la fin n’est pas jointe. Choisissez Opus 5.5 sous la saisie pour un acte plus long.</p>');
      }
      catch (e) { console.warn('Lecture des pièces jointes :', e && e.message); }
      finally { assistantEnCours = false; assistantEtapeAgent = ''; }
    }
    if (assistantDisponibilite.agent && (pieces.length || !assistantContexte.attente) && await envoyerAgentAssistant(texte + mentionPiecesJointesAgent(piecesALire), impose, documentsJoints)) return;
    if (pieces.length) { poserMessageAssistant('claire', '<p>Je n’ai pas pu lire la pièce jointe : l’agent n’a pas répondu. Réessayez dans un instant.</p>'); return; }
    assistantEnCours = true;
    renderAssistant();
    const debutReflexion = Date.now();
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
      await pauseReflexionAssistant(debutReflexion);   // réponse sans IA : 2 s de « réflexion » au moins
      assistantEnCours = false;
      // Le dossier choisi par @ l'emporte sur la lecture du nom (homonymes, dossier archivé).
      await executerDemandeAssistant(impose && dossiers.some(x => x.id === impose) ? { ...corps, dossier: impose, candidats: [] } : corps);
    } catch (e) {
      assistantEnCours = false;
      poserMessageAssistant('claire', `<p>Je n’y arrive pas pour le moment : ${escapeHtml(e.message || e)}. Vous pouvez réessayer dans un instant.</p>`);
    }
  }

  function libelleDossierAssistant(id) {
    const d = id ? dossiers.find(x => x.id === id) : null;
    return d ? libelleDossierAffiche(d) : '';
  }

  function proposerCandidatsAssistant(candidats, resultat) {
    assistantContexte.attente = { type: 'dossier', resultat };
    poserMessageAssistant('claire', '<p>J’en trouve plusieurs qui correspondent. Lequel voulez-vous ?</p>', candidats.map(c => ({
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
        poserMessageAssistant('claire', '<p>De quel dossier s’agit-il ? Le nom du dossier ou d’une des parties me suffit.</p>');
        return;
      }
      assistantContexte.dossierId = d.id;
    } else if (intention.dossierFacultatif && !r.dossier && r.candidats && r.candidats.length) {
      // Dossier facultatif mais nommé de façon ambiguë (deux dossiers MARTIN) : « Lequel ? », jamais tous en silence.
      proposerCandidatsAssistant(r.candidats, r); return;
    } else if (r.dossier) {
      // Intention sans dossier obligatoire (un rappel) mais dossier donné : on le garde (relecture 0.213.0, rappel posé sans lien).
      d = dossiers.find(x => x.id === r.dossier) || null;
    }
    const executants = {
      etat_dossier: () => reponseEtatDossierAssistant(d),
      pieces_manquantes: () => reponsePiecesAssistant(d),
      echeances_dossier: () => reponseEcheancesAssistant(d),
      coordonnees: () => reponseCoordonneesAssistant(d, p.partie),
      fonds_dossier: () => reponseFondsAssistant(d),
      taches_jour: () => reponseTachesAssistant(),
      depuis_hier: () => reponseDepuisHierAssistant(),
      derniers_documents: () => reponseDerniersDocumentsAssistant(d),
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
      salutation: () => reponseSalutationEcranAssistant(r),
      conversation: () => reponseConversationAssistant(r),
      inconnu: () => reponseInconnuAssistant(r)
    };
    try {
      const reponse = await (executants[intention.cle] || executants.inconnu)();
      // « vendredi 5 novembre » alors que le 5 novembre est un jeudi (12/10) : dit, jamais corrigé seul.
      const vraiJour = reponse && p.date && r.texte ? jourSemaineContredit(r.texte, p.date) : '';
      if (vraiJour) reponse.html = `<p class="asst-note"><b>Attention :</b> le ${escapeHtml(formatDateFr(p.date))} est un ${escapeHtml(vraiJour)}. Vérifiez la date avant d’envoyer.</p>` + reponse.html;
      if (reponse) {
        // Le ton (client/59) : une phrase d'introduction et, quand le dossier le justifie, une suite proposée — les faits restent ceux du code.
        const intro = introLectureAssistant(intention.cle, prenomPosteAssistant(), assistantMessages.length);
        const suite = suiteLectureAssistant(intention.cle, faitsAssistant(intention.cle, d));
        const boutonsSuite = suite ? suite.boutons.map(b => ({ libelle: b.libelle, action: () => envoyerDemandeAssistant(b.phrase) })) : [];
        poserMessageAssistant('claire', (intro ? `<p class="asst-intro">${escapeHtml(intro)}</p>` : '') + reponse.html + (suite && suite.texte ? `<p>${escapeHtml(suite.texte)}</p>` : '') + (intention.cle === 'salutation' || intention.cle === 'conversation' ? '' : noteMoteurAssistant(r)),
          (reponse.boutons || []).concat(boutonsSuite));
      }
    } catch (e) {
      console.error('Assistant : geste impossible', e);
      poserMessageAssistant('claire', `<p>Je n’ai pas pu terminer : ${escapeHtml(e.message || e)}. Rien n’a été modifié sans vous le dire ; vous pouvez réessayer.</p>`);
    }
  }

  // Pure : la mention discrète de ce qui a compris la phrase (étude 07/10, essai de Mistral « pour voir ») — « Compris par
  // Mistral », et ce que les mots-clés auraient compris quand ils disaient autre chose. Rien quand les mots-clés ont suffi.
  function noteMoteurAssistant(r) {
    if (!r || r.source !== 'ia') return '';
    const moteur = r.moteur === 'claude' ? 'Claude' : r.moteur === 'mistral' ? 'Mistral' : 'l’IA locale';
    const autre = r.motsCles ? intentionAssistant(r.motsCles) : null;
    return `<p class="asst-note asst-moteur">Compris par ${moteur}${autre ? ` — les mots-clés auraient compris « ${escapeHtml(autre.libelle)} »` : ''}.</p>`;
  }

  // Mémoire courte de la conversation en texte brut (4 derniers échanges partent à l'IA pour l'échange libre, noms masqués par le serveur).
  function noterEchangeAssistant(role, texte) {
    assistantContexte.echanges = (assistantContexte.echanges || []).concat([{ role, texte: String(texte || '').slice(0, 400) }]).slice(-8);
  }

  // « Bonjour », « merci »… : répondu par le code, tout de suite. À la première salutation, le point de la journée.
  function reponseSalutationEcranAssistant(r) {
    const prenom = prenomPosteAssistant();
    const phrase = reponseSalutationAssistant(r.texte, prenom, new Date(), assistantMessages.length);
    const bonjour = /^(bonjour|bonsoir|salut|hello|coucou)/.test(normaliserDemande(r.texte));
    const point = bonjour && assistantMessages.length <= 2 ? pointJourneeAssistant() : '';
    noterEchangeAssistant('claire', phrase + (point ? ' ' + point : ''));
    return { html: `<p>${escapeHtml(phrase)}</p>${point ? `<p>${escapeHtml(point)}</p>` : ''}`,
      boutons: point ? [{ libelle: 'Voir mes tâches', action: () => envoyerDemandeAssistant('Qu’est-ce que j’ai à faire aujourd’hui ?') }] : [] };
  }

  // Échange libre : l'IA en ligne répond (noms masqués, aucune donnée de dossier). Sans IA en ligne ou en cas d'erreur : le code répond.
  async function reponseConversationAssistant(r) {
    assistantEnCours = true;
    renderAssistant();
    let corps = {};
    try {
      const rep = await fetchAvecAuth('/api/assistant/converser', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texte: r.texte,
          contexte: { aujourdhui: isoAujourdhuiLocal(), prenom: prenomPosteAssistant(), historique: (assistantContexte.echanges || []).slice(-5, -1) },
          dossiers: dossiersPourAssistant(dossiers)
        })
      });
      corps = await rep.json();
    } catch (e) { corps = { reponse: '', raison: 'Serveur injoignable.' }; }
    assistantEnCours = false;
    if (corps && corps.reponse) {
      noterEchangeAssistant('claire', corps.reponse);
      return { html: htmlTexteLibreAssistant(corps.reponse) };
    }
    if (corps && corps.raison) console.warn('Assistant : conversation sans IA — ' + String(corps.raison).slice(0, 160));
    return { html: '<p>Je ne peux pas en discuter librement pour le moment, il me manque la connexion à l’IA. En revanche, je peux chercher dans vos dossiers, préparer un email, retrouver une date ou poser un rappel.</p>',
      boutons: [{ libelle: 'Que sais-tu faire ?', action: () => envoyerDemandeAssistant('Que sais-tu faire ?') }] };
  }

  // ---- Réponses en lecture ----

  function boutonFicheAssistant(d, libelle) {
    return { libelle: libelle || 'Ouvrir la fiche', action: () => ouvrirDossierDepuisDashboard(d.id) };
  }

  // Phrases, pas une carte (étude 21/10 : « comme un vrai Claude »).
  function reponseEtatDossierAssistant(d) {
    const auj = isoAujourdhuiLocal();
    const etat = etatDossier(d, auj);
    const prochaine = estSuccession(d) ? null : prochaineEcheanceDetail(d);
    const manque = estSuccession(d) ? [] : piecesAttenduesDossier(d);
    const phrases = [];
    // Le détail de « Attente de pièces » est la liste des pièces : elle a sa propre phrase dessous.
    phrases.push(`<b>${escapeHtml(libelleDossierAffiche(d))}</b> est au statut « ${escapeHtml(etat.texte)} »${etat.detail && etat.cle !== 'attente' ? ` : ${escapeHtml(etat.detail.charAt(0).toLowerCase() + etat.detail.slice(1))}` : ''}${d.responsable ? `, suivi par ${escapeHtml(d.responsable)}` : ''}.`);
    if (d.rendezVousSignature) phrases.push(`La signature est ${echeanceValidee(d, 'rendezVousSignature') ? 'faite' : 'fixée'} le ${escapeHtml(dateAvecJourFr(d.rendezVousSignature))}${d.rendezVousSignatureHeure ? ' à ' + escapeHtml(d.rendezVousSignatureHeure.replace(':', ' h ')) : ''}.`);
    else if (prochaine) phrases.push(`La prochaine étape est « ${escapeHtml(prochaine.label)} »${prochaine.iso ? `, le ${escapeHtml(formatDateFr(prochaine.iso))} (${prochaine.jours >= 0 ? `dans ${prochaine.jours} j` : `dépassée de ${-prochaine.jours} j`})` : ''}.`);
    if (manque.length) phrases.push(`Il manque encore ${manque.slice(0, 6).map(escapeHtml).join(', ')}${manque.length > 6 ? ` et ${manque.length - 6} autre${manque.length - 6 > 1 ? 's' : ''}` : ''}.`);
    const fonds = bilanFondsAssistant(d);
    if (fonds) phrases.push(`Côté fonds : ${fonds}`);
    return { html: `<p>${phrases.join(' ')}</p>`, boutons: [boutonFicheAssistant(d)] };
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
    const nom = escapeHtml(libelleDossierAffiche(d));
    const dites = items.map(it => {
      const j = it.iso ? joursEntre(auj, it.iso) - 1 : null;
      const quand = it.iso ? `le ${formatDateFr(it.iso)} (${j > 0 ? `dans ${j} j` : j === 0 ? 'aujourd’hui' : `dépassée de ${-j} j`})` : 'sans date';
      return `${escapeHtml(it.label)}, ${escapeHtml(quand)}`;
    });
    const butoir = d.acte && !estSuccession(d) ? ` La date butoir de l’avant-contrat est le ${escapeHtml(formatDateFr(d.acte))}${d.rendezVousSignature ? ' (à titre d’information, le rendez-vous est fixé)' : ''}.` : '';
    const html = !dites.length ? `<p>Aucune échéance en cours sur <b>${nom}</b>.${butoir}</p>`
      : dites.length === 1 ? `<p>Sur <b>${nom}</b>, l’échéance est ${dites[0]}.${butoir}</p>`
      : `<p>Sur <b>${nom}</b>, les échéances sont : ${dites.slice(0, -1).join(' ; ')}, puis ${dites[dites.length - 1]}.${butoir}</p>`;
    return { html, boutons: [boutonFicheAssistant(d)] };
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
      boutons: [{ libelle: 'Voir « Depuis hier 18 h »', action: () => { definirOnglet('dashboard'); choisirOngletFenetreJour('depuis'); ouvrirFenetreAujourdhui(true); } }] };
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

  // Modèles dont le texte cite le rendez-vous de signature.
  var MODELES_RDV_ASSISTANT = ['confirmationRdv', 'projet', 'fonds', 'relanceFonds', 'rib'];

  // Le destinataire d'un email selon la partie demandée : { email, confrere, libelle } ; {} = règle du modèle ; { erreur } si
  // l'email de cette partie manque. Le vendeur accompagné de son notaire : l'email part à ce confrère.
  function destinataireEmailAssistant(d, partie) {
    if (partie === 'vendeur') {
      if (confrereRepresenteVendeur(d)) {
        const e = emailConfrereVendeurDossier(d);
        return e ? { email: e, confrere: true, libelle: 'confrère du vendeur' } : { erreur: 'Le vendeur a son notaire, dont l’email n’est pas connu : renseignez-le sur la fiche.' };
      }
      return d.emailVendeur ? { email: d.emailVendeur, confrere: false, libelle: 'vendeur' } : { erreur: `Aucun email du vendeur sur ${libelleDossierAffiche(d)} : renseignez-le sur la fiche.` };
    }
    if (partie === 'acquereur') return { libelle: notaireParticipantRepresenteAcquereur(d) ? 'confrère de l’acquéreur' : 'acquéreur' };
    if (partie === 'confrere') {
      // Deux confrères : celui qui reçoit l'acte d'abord (étude 26/10).
      const acqConfrere = notaireParticipantRepresenteAcquereur(d);
      if (acqConfrere && !(d.coteInstrumentaire === 'vendeur' && confrereRepresenteVendeur(d))) return { libelle: 'confrère de l’acquéreur' };
      const e = emailConfrereVendeurDossier(d);
      return e ? { email: e, confrere: true, libelle: 'confrère du vendeur' } : { erreur: 'Aucun confrère avec un email connu sur ce dossier.' };
    }
    return {};
  }

  async function gesteEmailAssistant(d, p) {
    if (estSuccession(d)) return { html: '<p>Les emails de vente ne s’appliquent pas à une succession. Ouvrez la fiche pour écrire un email libre.</p>', boutons: [boutonFicheAssistant(d)] };
    const modele = p.modele || '';
    if (modele === 'questionnaire') { envoyerQuestionnaireSatisfaction(d.id, true); return { html: '<p>Fenêtre d’email ouverte avec le questionnaire de satisfaction. Rien ne part sans « Envoyer ».</p>' }; }
    if (modele === 'copieActe') { ouvrirEnvoiCopieActe(d.id); return { html: '<p>Envoi de la copie de l’acte ouvert.</p>' }; }
    if (modele && MODELES_EMAIL_RELANCE[modele]) {
      // La partie demandée (« aux vendeurs », 12/10 : l'email partait à l'acquéreur) ; sinon la règle du modèle.
      const dest = destinataireEmailAssistant(d, p.partie);
      if (dest.erreur) return { html: `<p>${escapeHtml(dest.erreur)}</p>`, boutons: [boutonFicheAssistant(d)] };
      if (!dest.email && !MODELES_EMAIL_RELANCE[modele].destinataire && !emailDestinataireRelance(d)) return { html: `<p>Aucun email de destinataire sur ${escapeHtml(libelleDossierAffiche(d))} : renseignez-le sur la fiche, puis redemandez-moi.</p>`, boutons: [boutonFicheAssistant(d)] };
      // Le rendez-vous dit dans la phrase (12/10 : « le vendredi 5 novembre à 17 h » n'était pas repris) : écrit dans l'email s'il n'est
      // pas celui de la fiche ; la fiche, elle, ne change pas (placer la signature reste un geste confirmé).
      const rdvPhrase = p.date && MODELES_RDV_ASSISTANT.includes(modele) && (p.date !== String(d.rendezVousSignature || '').slice(0, 10) || (p.heure && p.heure !== d.rendezVousSignatureHeure))
        ? { date: p.date, heure: p.heure || '' } : null;
      envoyerRelanceCiblee(d.id, modele, true, { ...(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(p.destinataire || '').trim()) ? { destinataire: String(p.destinataire).trim(), confrere: dest.confrere } : dest.email ? { destinataire: dest.email, confrere: dest.confrere } : {}), ...(rdvPhrase ? { rendezVous: rdvPhrase } : {}) });
      const qui = dest.libelle ? ` à ${escapeHtml(dest.libelle)}` : '';
      const quand = rdvPhrase ? `<p>Rendez-vous écrit dans l’email : <b>${escapeHtml(formatDateFr(rdvPhrase.date))}${rdvPhrase.heure ? ' à ' + escapeHtml(rdvPhrase.heure.replace(':', ' h ')) : ''}</b> — pas encore sur la fiche ni dans l’agenda.</p>` : '';
      return { html: `<p>Fenêtre d’email ouverte${qui} — modèle « ${escapeHtml(MODELES_EMAIL_RELANCE[modele].libelle)} », ${escapeHtml(libelleDossierAffiche(d))}. Rien ne part sans « Envoyer ».</p>${quand}`,
        boutons: rdvPhrase ? [{ libelle: 'Placer la signature à cette date', action: () => executerDemandeAssistant({ intention: 'rendez_vous_placer', parametres: p, dossier: d.id, candidats: [], texte: '' }) }] : [] };
    }
    // Pas de modèle reconnu : email libre au client, texte de la phrase en premier jet si elle en porte un.
    // Destinataire, objet et texte donnés par l'agent (audit 15/10 : l'adresse demandée était remplacée par celle du client, objet et texte vides).
    // Un texte adressé à un notaire (« Mon cher Maître ») va au confrère, jamais à un client de la fiche (étude 26/10 : l'email au confrère,
    // rédigé « Mon cher Maître », était adressé à l'acquéreur).
    const auConfrere = /^\s*(?:mon\s+)?cher\s+ma[iî]tre/i.test(String(p.corps || ''));
    const emailsClients = destinatairesEmail([d.emailVendeur, d.emailAcquereur].filter(Boolean).join(',')).map(x => x.toLowerCase());
    const ditBrut = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(p.destinataire || '').trim()) ? String(p.destinataire).trim() : '';
    // « Mon cher Maître » à un côté qui n'a pas de confrère (notre client) : c'est le confrère de l'autre office qui est visé (relecture 26/10).
    const coteSansConfrere = (p.partie === 'acquereur' && !notaireParticipantRepresenteAcquereur(d)) || (p.partie === 'vendeur' && !confrereRepresenteVendeur(d));
    const partie = auConfrere && (!p.partie || coteSansConfrere) ? 'confrere' : (p.partie || '');
    const destinataireDit = ditBrut && !((partie === 'confrere' || auConfrere) && emailsClients.includes(ditBrut.toLowerCase())) ? ditBrut : '';
    // La partie demandée (étude 26/10 : l'email au confrère partait au client) : vendeur, acquéreur ou confrère de la fiche.
    const dest = !destinataireDit && partie ? destinataireEmailAssistant(d, partie) : {};
    if (dest.erreur) return { html: `<p>${escapeHtml(dest.erreur)}</p>`, boutons: [boutonFicheAssistant(d)] };
    const versConfrere = partie === 'confrere' || auConfrere || !!dest.confrere || (!dest.email && /confr/.test(dest.libelle || '')) || (!destinataireDit && !partie && notaireParticipantRepresenteAcquereur(d));
    const destinataire = destinataireDit || dest.email || (partie === 'acquereur' || /acquéreur/.test(dest.libelle || '') ? emailDestinataireRelance(d) : '') || (!partie ? emailDestinataireRelance(d) || d.emailVendeur : '') || '';
    // Documents du dossier joints (étude 26/10 : « l'offre de prêt est sur le NAS ») : lus ici, jamais par l'IA.
    const jointes = await piecesJointesEmailAgent(Array.isArray(p.documents) ? p.documents : []);
    // Le brouillon s'ouvre à droite de la conversation (étude 27/10) et la conversation continue : on peut demander à CLAIRE de le
    // corriger (outil artefact, client/132) avant de cliquer « Envoyer ». La suite (envoyé, préparé) est notée sur la fiche à la fermeture.
    const manque = jointes.manquants ? `<p>${jointes.manquants} document${jointes.manquants > 1 ? 's' : ''} n’a pas pu être joint : ajoutez-le dans le brouillon.</p>` : '';
    const ouverture = livrerEmailDossier({ destinataire, sujet: String(p.objet || ''), corps: String(p.corps || ''), pieces: jointes.pieces, confrere: versConfrere, responsableSignature: d.responsable, dossierId: d.id, geste: 'assistant' });
    // mode `mailto` (poste sans fenêtre d'email) : la messagerie du poste est déjà ouverte, rien n'attend dans CLAIRE.
    if (modeEmailPoste() === 'mailto') {
      const r = await ouverture;
      if (r && r.ok) { ajouterHistorique(d, 'Email préparé depuis les Discussions'); sauvegarder(d); }
      return { html: '<p>Email préparé : envoyez-le depuis votre messagerie.</p>' + (r && r.piecesNonJointes && jointes.pieces.length ? '<p>Les documents n’ont pas pu être joints par la messagerie du poste : ajoutez-les à la main.</p>' : '') + manque };
    }
    ouverture.then((r) => {
      if (!r || !r.ok) return;
      ajouterHistorique(d, r.mode === 'envoye' ? 'Email envoyé depuis les Discussions' : 'Email préparé depuis les Discussions');
      sauvegarder(d);
    }).catch(() => {});
    return { html: `<p>Brouillon d’email ouvert${ecranAffiche('assistant') ? ' à droite' : ''} : relisez-le, demandez-moi une correction si besoin. Rien ne part sans « Envoyer ».</p>` + manque };
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
    demanderConfirmation(`Poser ${n > 1 ? `${n} options` : 'une option'} pour ${libelleDossierAffiche(d)} dans l’agenda de l’office : ${creneaux.map(texte).join(' ; ')} ? Aucun email n’est envoyé. « Placer » sur l’une en fera la signature et retirera les autres ; elles restent dans l’agenda tant que rien n’est décidé.`,
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
    return { html: `<p>Contrôle de l’urbanisme ouvert sur ${escapeHtml(libelleDossierAffiche(d))} ; le zonage de chaque parcelle se lit sur le Géoportail.</p>` };
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
    const noms = qtEtat.acquereurs.map((a, i) => `${a.nom || `Acquéreur ${i + 1}`} : ${formaterPourcentageQuotite(calc.parAcquereur[i] ? calc.parAcquereur[i].pourcentage : 0)}`);
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
      ouvrirProvisionSansDossier();
      const champ = id => document.getElementById(id);
      if (champ('calc-price')) champ('calc-price').value = String(prix);
      if (champ('calc-dept')) champ('calc-dept').value = dept;
      if (champ('calc-type')) champ('calc-type').value = type;
      const radio = document.querySelector(`input[name="calc-first"][value="${primo ? 'yes' : 'no'}"]`);
      if (radio) radio.checked = true;
      // Le simulateur doit montrer le total annoncé ici (audit 07/10) : aucun mobilier, et le primo-accédant n'est éligible qu'en
      // résidence principale (calculerFraisActe) — une saisie précédente restée dans l'écran changeait le résultat.
      if (champ('calc-mobilier')) champ('calc-mobilier').value = '';
      if (primo) { const rp = document.querySelector('input[name="calc-rp"][value="yes"]'); if (rp) rp.checked = true; }
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
      if (champ('prorata-date')) { champ('prorata-date').value = dateActe; prorataDateAuto = ''; }
      // Période de la liste accordée aux bornes (une période trimestrielle choisie avant restait affichée sur une année).
      const anneeCivile = debut === `${dateActe.slice(0, 4)}-01-01` && fin === `${dateActe.slice(0, 4)}-12-31`;
      if (champ('prorata-periode') && anneeCivile) champ('prorata-periode').value = 'annee';
      // Une période dite dans la phrase est gardée si la date de l'acte change ensuite dans l'outil.
      bornesProrataManuelles = !anneeCivile;
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
    const lignes = INTENTIONS_ASSISTANT.filter(i => i.cle !== 'inconnu' && i.cle !== 'aide' && i.cle !== 'salutation').map(i => `<li><b>${escapeHtml(i.libelle)}</b>${i.exemples[0] ? ` — <i>${escapeHtml(i.exemples[0])}</i>` : ''}</li>`);
    return { html: `<p>Je comprends une phrase et je fais le geste avec les fonctions de CLAIRE. Les emails s’ouvrent dans la fenêtre d’envoi (rien ne part sans « Envoyer »), l’agenda demande une confirmation, le reste se fait tout de suite et s’annule d’un clic.</p><ul class="asst-liste asst-aide">${lignes.join('')}</ul>` };
  }

  function reponseInconnuAssistant(r) {
    // La raison technique (adresse d'Ollama, message de fetch) reste dans la console ; à l'écran, le fait seul.
    if (r && r.raisonIa) console.warn('Assistant : ' + r.raisonIa);
    // La raison dite à l'écran (07/10 : « pourquoi Mistral ne répond pas ») : clé refusée, délai, réponse illisible… — un fait
    // technique, jamais la phrase.
    const motif = r && r.raisonIa ? ` <span class="asst-note">(${escapeHtml(String(r.raisonIa).replace(/https?:\/\/\S+/g, '').slice(0, 160))} — je ne lis que les mots-clés)</span>` : '';
    return { html: `<p>Je n’ai pas bien saisi.${motif} Pouvez-vous me le redire avec le nom d’un dossier et un verbe ? Par exemple « où en est… », « relance… », « rappelle-moi… » ou « place la signature… ».</p>`,
      boutons: [{ libelle: 'Que sais-tu faire ?', action: () => envoyerDemandeAssistant('Que sais-tu faire ?') }] };
  }

  // Réglages › IA et relecture d'actes › « Demander à CLAIRE » : moteur (Mistral, noms masqués, ou IA locale) et usage du mois.
  // Pure : la ligne d'usage du mois (demandes, coût estimé en euros, erreurs). @param {any} u
  function texteUsageAssistant(u, moteur) {
    const nom = moteur === 'claude' ? 'Claude' : 'Mistral';
    if (!u || !u.demandes) return `Aucune demande envoyée à ${nom} ce mois-ci.`;
    const euros = (u.coutUsd || 0) * 0.92;
    const cout = euros < 0.01 ? 'moins d’un centime' : `≈ ${euros.toFixed(2).replace('.', ',')} €`;
    return `${u.demandes} demande${u.demandes > 1 ? 's' : ''} comprise${u.demandes > 1 ? 's' : ''} par ${nom} — ${cout}${u.erreurs ? ` · ${u.erreurs} sans réponse` : ''}.`;
  }

  // Pure : ce que dit la ligne d'usage quand la clé du moteur choisi manque. @param {any} data
  function avertissementCleAssistant(data) {
    if (!data) return '';
    if (data.moteur === 'claude' && !data.cleClaudeEnregistree) return data.cleMistralEnregistree ? ' Aucune clé Claude : Mistral est utilisé.' : ' Aucune clé Claude : l’IA locale est utilisée.';
    if (data.moteur === 'mistral' && !data.cleMistralEnregistree) return ' Aucune clé Mistral : l’IA locale est utilisée.';
    return '';
  }

  // Le choix du modèle Claude ne se montre que si l'assistant utilise Claude (étude 08/10 : Sonnet, Opus ou Haiku).
  function afficherModeleClaudeAssistant() {
    const ligne = document.getElementById('reglages-assistant-modele-ligne');
    const choix = document.getElementById('reglages-assistant-moteur');
    if (ligne) ligne.style.display = !choix || choix.value === 'claude' ? '' : 'none';
    // L'agent marche avec Claude ou Mistral, pas avec l'IA locale.
    const claude = !choix || choix.value === 'claude';
    const mistral = !!choix && choix.value === 'mistral';
    const agent = document.getElementById('reglages-assistant-agent');
    if (agent && agent.closest('label')) agent.closest('label').style.display = claude || mistral ? '' : 'none';
    const modeleAgent = document.getElementById('reglages-assistant-modele-agent-ligne');
    if (modeleAgent) modeleAgent.style.display = claude ? '' : 'none';
    const modeleAgentMistral = document.getElementById('reglages-assistant-modele-agent-mistral-ligne');
    if (modeleAgentMistral) modeleAgentMistral.style.display = mistral ? '' : 'none';
  }

  async function chargerReglagesAssistant() {
    try {
      const r = await fetchAvecAuth('/api/assistant/reglages');
      if (!r.ok) return;
      const data = await r.json();
      const choix = document.getElementById('reglages-assistant-moteur');
      if (choix) choix.value = data.moteur || 'claude';
      const modele = document.getElementById('reglages-assistant-modele-claude');
      if (modele && data.modeleClaude) modele.value = data.modeleClaude;
      afficherModeleClaudeAssistant();
      if (typeof afficherChampsFournisseurIa === 'function') afficherChampsFournisseurIa();
      const toutes = document.getElementById('reglages-assistant-toutes');
      if (toutes) toutes.checked = data.toutesDemandes === true;
      const agent = document.getElementById('reglages-assistant-agent');
      if (agent) agent.checked = data.agent !== false;
      const modeleAgent = document.getElementById('reglages-assistant-modele-agent');
      if (modeleAgent && data.modeleAgent) modeleAgent.value = data.modeleAgent;
      const modeleAgentMistral = document.getElementById('reglages-assistant-modele-agent-mistral');
      if (modeleAgentMistral && data.modeleAgentMistral) modeleAgentMistral.value = data.modeleAgentMistral;
      const usage = document.getElementById('reglages-assistant-usage');
      if (usage) usage.textContent = texteUsageAssistant(data.usage, data.moteur) + avertissementCleAssistant(data);
    } catch (e) { /* Réglages sans connexion : rien à afficher */ }
  }

  async function enregistrerReglagesAssistant() {
    const choix = document.getElementById('reglages-assistant-moteur');
    const sortie = document.getElementById('reglages-assistant-resultat');
    try {
      const r = await fetchAvecAuth('/api/assistant/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moteur: choix ? choix.value : 'claude', modeleClaude: (document.getElementById('reglages-assistant-modele-claude') || {}).value || '', toutesDemandes: !!(document.getElementById('reglages-assistant-toutes') || {}).checked, agent: !!(document.getElementById('reglages-assistant-agent') || {}).checked, modeleAgent: (document.getElementById('reglages-assistant-modele-agent') || {}).value || '', modeleAgentMistral: (document.getElementById('reglages-assistant-modele-agent-mistral') || {}).value || '' }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.erreur || `Le serveur a répondu ${r.status}.`);
      assistantDisponibilite.quand = 0;
      const manque = (data.moteur === 'claude' && !data.cleClaudeEnregistree) ? 'Claude' : (data.moteur === 'mistral' && !data.cleMistralEnregistree) ? 'Mistral' : '';
      if (sortie) sortie.textContent = manque ? `Enregistré — saisissez la clé ${manque} plus bas.` : 'Enregistré.';
      chargerReglagesAssistant();
    } catch (e) {
      if (sortie) sortie.textContent = `Non enregistré : ${e.message || e}`;
    }
  }
