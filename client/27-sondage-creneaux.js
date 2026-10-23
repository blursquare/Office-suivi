  // ==== SONDAGE DE CRÉNEAUX (« comme un Doodle », étude 30/09) ====
  // Plusieurs créneaux proposés aux parties, qui votent par email : chaque bouton de l'email est un
  // lien `mailto:` vers la boîte du compte Exchange, l'objet porte le jeton « [CLAIRE-CODE-n] » que
  // le serveur relit (objets seulement, voir server/src/sondagesCreneaux.js). Rien n'est hébergé.
  // Les clients reçoivent un seul email (vendeur et acquéreur en destinataires) ; un confrère reçoit
  // le sien, avec la formule d'usage. Textes : premiers jets de CLAIRE, à remplacer par ceux de l'étude.
  var sondagesCreneaux = [];
  var sondageModale = null;
  var MAX_CRENEAUX_SONDAGE = 5;
  var LIBELLES_ROLE_SONDAGE = {
    vendeur: 'Vendeur', acquereur: 'Acquéreur', 'confrere-vendeur': 'Notaire du vendeur',
    'confrere-acquereur': 'Notaire de l’acquéreur', autre: 'Autre'
  };

  // Pur : « VTE - NOM ? — option CLAIRE, créneau 2/4 » → { titre: 'VTE - NOM', rang: '2/4' }.
  function libelleOptionSondage(sujet) {
    const t = String(sujet || '');
    const m = /^(.*?)\s*\?\s*[—-]\s*option CLAIRE,?\s*créneau\s*(\d+\/\d+)/i.exec(t);
    return m ? { titre: m[1].trim(), rang: m[2] } : { titre: t, rang: '' };
  }

  // Adresse de la page de réponse (Réglages › connexion Exchange) ; '' : un bouton par créneau.
  function pageSondageReglee() {
    const r = typeof exchangeReglages !== 'undefined' && exchangeReglages ? exchangeReglages : {};
    return /^https:\/\//i.test(r.pageSondage || '') ? r.pageSondage : '';
  }
  // Relais Google des réponses (Réglages) ; '' : la réponse passe par la messagerie du client.
  function relaisSondageRegle() {
    const r = typeof exchangeReglages !== 'undefined' && exchangeReglages ? exchangeReglages : {};
    return /^https:\/\/script\.google\.com\//.test(r.relaisSondage || '') ? r.relaisSondage : '';
  }

  // Sondage sans dossier (étude, 01/10 : « plusieurs propositions de rendez-vous sans être lié à un
  // dossier ») : le titre du rendez-vous tient lieu de dossier. Purs et testables.
  function libelleSondage(s, d) {
    return d ? libelleDossierAffiche(d) : ((s && s.titre) || 'Rendez-vous');
  }
  var MOTS_SAUTES_TITRE_SONDAGE = new Set(['RENDEZ', 'VOUS', 'RDV', 'AVEC', 'POUR', 'CHEZ', 'SUR', 'UNE', 'UN']);
  // « Réunion avec l’agence DUPONT » → « REU./AGE. » : comme le dossier, jamais le titre en clair sur
  // la page de réponse ni dans l'objet des réponses.
  function abregeTitreSondage(titre) {
    const mots = String(titre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/[^A-Z]+/)
      .filter(m => m.length >= 3 && !MOTS_SAUTES_ABREGE.has(m) && !MOTS_SAUTES_TITRE_SONDAGE.has(m)).slice(0, 2);
    return mots.length ? mots.map(m => m.slice(0, 3) + '.').join('/') : 'RDV';
  }
  function abregeSondage(s, d) {
    return d ? abregeDossierSondage(d) : abregeTitreSondage(s && s.titre);
  }
  // Ce que l'email propose de fixer : la signature d'un dossier, ou le rendez-vous nommé.
  function objetsEmailSondage(d, titre) {
    if (d) return { client: 'rendez-vous de signature de l’acte de vente', confrere: `rendez-vous de signature de la vente ${libelleDossierAffiche(d)}` };
    const t = `rendez-vous « ${String(titre || '').trim() || 'proposé'} »`;
    return { client: t, confrere: t };
  }
  // Le nom affiché d'un destinataire : « Vendeur · NOM », ou le nom saisi pour un sondage sans dossier.
  function libelleParticipantSondage(p, avecNom) {
    if (!p) return '';
    if (p.role === 'autre') return p.nom || p.email || 'Destinataire';
    return (LIBELLES_ROLE_SONDAGE[p.role] || '') + (avecNom && p.nom ? ' · ' + p.nom : '');
  }

  function sondageOuvertDossier(id) {
    return sondagesCreneaux.find(s => s.dossierId === id && s.statut === 'ouvert') || null;
  }

  // Signature prévue d'un dossier sans rendez-vous placé (étude 07/10, repère de l'échéance « Rédaction de l'acte », appelée par
  // repereSignatureRedaction de commun/planning.js) : la première date encore proposée au client par un sondage ouvert, sinon
  // la date au plus tôt (semaineProbableSignature : rendez-vous « ? » de l'agenda compris). null si le rendez-vous est placé.
  function signaturePrevueDossier(d, aujourdhuiIso) {
    if (!d || d.rendezVousSignature) return null;
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const s = d.id != null ? sondageOuvertDossier(d.id) : null;
    const proposees = (s && Array.isArray(s.creneaux) ? s.creneaux : [])
      .map(c => String((c && c.date) || '')).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= auj).sort();
    if (proposees.length) return { date: proposees[0], source: 'propositions' };
    const p = semaineProbableSignature(d, auj, absencesOffice, agendaEvenements);
    return p && p.date ? { date: p.date, source: p.aConfirmer ? 'a-confirmer' : 'probable' } : null;
  }

  // Pur : les destinataires du sondage d'après le dossier. Une partie représentée par un confrère
  // est remplacée par ce confrère (jamais l'adresse personnelle du client d'un autre office).
  function participantsSondage(d, carnet) {
    const noms = (role) => (Array.isArray(d.parties) ? d.parties : []).filter(p => p && p.role === role && p.nom).map(p => p.nom).join(' & ');
    const liste = [];
    if (confrereRepresenteVendeur(d)) {
      const t = trouverOfficeConfrere(d.notaireVendeur, carnet || []);
      liste.push({ role: 'confrere-vendeur', nom: d.notaireVendeur, email: d.emailConfrereVendeur || (t && t.office && t.office.email) || '', confrere: true });
    } else {
      liste.push({ role: 'vendeur', nom: noms('VENDEUR'), email: d.emailVendeur || '', confrere: false });
    }
    if (notaireParticipantRepresenteAcquereur(d)) {
      const t = trouverOfficeConfrere(d.notaireAcquereur, carnet || []);
      liste.push({ role: 'confrere-acquereur', nom: d.notaireAcquereur, email: d.emailNotaireParticipant || (t && t.office && t.office.email) || '', confrere: true });
    } else {
      liste.push({ role: 'acquereur', nom: noms('ACQUEREUR'), email: d.emailAcquereur || '', confrere: false });
    }
    // Un même office pour les deux parties : une seule ligne.
    return liste.filter((p, i) => !p.email || liste.findIndex(q => q.email && q.email.toLowerCase() === p.email.toLowerCase()) === i);
  }

  // « mardi 20 octobre à 10 h 00 »
  function libelleCreneauSondage(c) {
    return `${new Date(c.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${String(c.heure).replace(':', ' h ')}`;
  }

  // Objet de la réponse : le jeton d'abord (le serveur ne lit que lui), puis un texte lisible.
  // `abrege` : le dossier en abrégé (« VTE - MOR./FAU. »), pour reconnaître le dossier d'un coup
  // d'œil dans la boîte de l'étude sans écrire le nom des clients.
  function sujetReponseSondage(code, c, abrege) {
    const dossier = abrege ? `${abrege} — ` : '';
    return c ? `[CLAIRE-${code}-${c.n}] ${dossier}Créneau ${c.n} : ${libelleCreneauSondage(c)}` : `[CLAIRE-${code}-0] ${dossier}Aucun créneau ne convient`;
  }

  // Pur : le dossier en abrégé (étude, 01/10 : « juste deux trois lettres du nom de famille ») —
  // « MOREAU / FAURE » → « VTE - MOR./FAU. ». Civilités, formes de société et particules sautées.
  var MOTS_SAUTES_ABREGE = new Set(['M', 'MR', 'MME', 'MLLE', 'MONSIEUR', 'MADAME', 'EPOUX', 'EPOUSE', 'VEUVE', 'NEE', 'CONSORTS', 'SCI', 'SARL', 'SAS', 'SASU', 'EURL', 'SOCIETE', 'STE', 'DE', 'DU', 'DES', 'LE', 'LA', 'LES', 'ET', 'D', 'L']);
  function abregeDossierSondage(d) {
    const nom = String((d && d.nom) || '').replace(RE_NOM_DEJA_PREFIXE, '').trim();
    const parties = nom.split('/').map(partie => {
      const mots = partie.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/[^A-Z]+/).filter(Boolean);
      const mot = mots.find(m => m.length >= 2 && !MOTS_SAUTES_ABREGE.has(m)) || mots[0] || '';
      return mot.length > 3 ? mot.slice(0, 3) + '.' : mot;
    }).filter(Boolean);
    return `${prefixeTypeAffaire(d)} - ${parties.join('/') || '?'}`;
  }

  var OFFICE_PAGE_SONDAGE = 'Office notarial de la Salamandre';

  // Pur : le lien vers la page de réponse (page-sondage/index.html, publiée sur GitHub Pages). Tout
  // ce qu'elle affiche est après le « # », que le navigateur n'envoie jamais au serveur.
  // `participant` : son code personnel (q) et son rôle (w) ; `relais` : le relais Google (r).
  function lienPageSondage(page, s, abrege, participant, relais) {
    const p = participant || {};
    const champs = [
      ['v', '1'], ['c', s.code], ['a', s.adresseReponse], ['d', abrege || ''], ['l', s.expireLe || ''],
      // t=r : un rendez-vous (sondage sans dossier, qui porte un titre), pas une signature.
      ...(!s.dossierId && s.titre ? [['t', 'r']] : []),
      ...(p.cle ? [['q', p.cle]] : []), ...(p.role ? [['w', (LIBELLES_ROLE_SONDAGE[p.role] || '').toLowerCase()]] : []),
      ...(relais ? [['r', relais]] : []),
      ['m', String((s.creneaux[0] && s.creneaux[0].dureeMinutes) || DUREE_CRENEAU_SIGNATURE)], ['o', OFFICE_PAGE_SONDAGE],
      ['s', s.creneaux.map(c => c.date.replace(/-/g, '') + c.heure.replace(':', '')).join(',')]
    ];
    return String(page).replace(/#.*$/, '') + '#' + champs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  }

  function lienReponseSondage(adresse, sujet, corps) {
    return `mailto:${adresse}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps || 'Réponse enregistrée par l’office : il suffit d’envoyer cet email, sans modifier son objet.')}`;
  }

  // Pur : la réponse « en une seule fois » (étude, 01/10) — une case [ ] par créneau, à cocher d'un X.
  // Le serveur lit le texte de ces seules réponses pour y trouver les lignes cochées.
  function corpsReponseListeSondage(s) {
    return ['Mettez un X entre les crochets de chaque créneau qui vous convient, puis envoyez cet email sans en modifier l’objet.', '']
      .concat(s.creneaux.map(c => `[ ] ${c.n} - ${libelleCreneauSondage(c).replace(/^./, x => x.toUpperCase())}`))
      .join('\n');
  }

  // Pur : les boutons de l'email. Avec une page de réponse réglée (`options.page`) : un seul bouton
  // vers elle. Sinon : un par créneau, « en une seule fois », puis « aucun ».
  function boutonsSondage(s, options) {
    const o = options || {};
    if (o.page) {
      // Un lien par destinataire (code personnel) : « Réponse de … » quand l'email en vise plusieurs.
      const qui = (o.participants && o.participants.length) ? o.participants : [null];
      return qui.map(p => ({
        libelle: qui.length > 1 ? `Réponse de ${(p && p.nom) || (p && p.role !== 'autre' && LIBELLES_ROLE_SONDAGE[p.role]) || (p && p.email) || 'destinataire'}` : 'Choisir mes disponibilités',
        href: lienPageSondage(o.page, s, o.abrege, p, o.relais)
      }));
    }
    const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    const boutons = s.creneaux.map(c => ({ libelle: majuscule(libelleCreneauSondage(c)), href: lienReponseSondage(s.adresseReponse, sujetReponseSondage(s.code, c, o.abrege)) }));
    if (s.creneaux.length > 1) {
      boutons.push({ libelle: 'Répondre en une seule fois', secondaire: true,
        href: lienReponseSondage(s.adresseReponse, `[CLAIRE-${s.code}-L] ${o.abrege ? o.abrege + ' — ' : ''}Mes disponibilités`, corpsReponseListeSondage(s)) });
    }
    return boutons.concat([{ libelle: 'Aucun créneau ne convient', href: lienReponseSondage(s.adresseReponse, sujetReponseSondage(s.code, null, o.abrege)), secondaire: true }]);
  }

  // Pur : le texte de l'email ({{BOUTONS}} = emplacement des boutons). `relance` : second envoi.
  // `avecPage` : un seul bouton vers la page de réponse, où cocher les créneaux.
  function corpsEmailSondage(d, s, confrere, relance, avecPage, plusieurs) {
    const limite = s.expireLe ? new Date(s.expireLe + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    const o = objetsEmailSondage(d, s.titre);
    const liste = s.creneaux.map(c => '– ' + libelleCreneauSondage(c).replace(/^./, x => x.toUpperCase())).join('\n');
    if (avecPage && confrere) {
      return [
        relance ? `Je me permets de revenir vers vous au sujet du ${o.confrere}, pour lequel je vous ai proposé les créneaux suivants :`
          : `Afin de fixer le ${o.confrere}, je vous propose les créneaux suivants :`,
        liste,
        `Pourriez-vous m’indiquer ${d ? 'ceux qui conviennent à votre client et à vous-même' : 'ceux qui vous conviennent'} ? Le bouton ci-dessous permet de répondre pour chaque créneau.`,
        '{{BOUTONS}}',
        limite ? `Je vous remercie de votre réponse avant le ${limite}.` : ''
      ].filter(Boolean).join('\n\n');
    }
    if (avecPage) {
      return [
        'Bonjour,',
        relance ? `Nous revenons vers vous pour fixer le ${o.client} : nous n’avons pas encore reçu vos disponibilités parmi les créneaux suivants :`
          : `Afin de fixer le ${o.client}, nous vous proposons les créneaux suivants :`,
        liste,
        plusieurs ? 'Chacun de vous clique sur le bouton à son nom, indique pour chaque créneau s’il lui convient, puis clique sur « Envoyer ma réponse ».'
          : 'Cliquez sur « Choisir mes disponibilités », indiquez pour chaque créneau s’il vous convient, puis cliquez sur « Envoyer ma réponse ».',
        '{{BOUTONS}}',
        `Merci de nous répondre${limite ? ` avant le ${limite}` : ''}. Le rendez-vous vous sera confirmé dès que toutes les parties auront répondu.`
      ].join('\n\n');
    }
    if (confrere) {
      return [
        relance ? `Je me permets de revenir vers vous au sujet du ${o.confrere}, pour lequel je vous ai proposé les créneaux ci-dessous.`
          : `Afin de fixer le ${o.confrere}, je vous propose les créneaux ci-dessous.`,
        `Pourriez-vous m’indiquer ${d ? 'ceux qui conviennent à votre client et à vous-même' : 'ceux qui vous conviennent'} ? Un clic sur un créneau prépare la réponse : il suffit de l’envoyer sans en modifier l’objet (un email par créneau qui convient). « Répondre en une seule fois » prépare un seul email, où cocher d’un X les créneaux retenus.`,
        '{{BOUTONS}}',
        limite ? `Je vous remercie de votre réponse avant le ${limite}.` : ''
      ].filter(Boolean).join('\n\n');
    }
    return [
      'Bonjour,',
      relance ? `Nous revenons vers vous pour fixer le ${o.client} : nous n’avons pas encore reçu votre choix parmi les créneaux ci-dessous.`
        : `Afin de fixer le ${o.client}, nous vous proposons les créneaux ci-dessous.`,
      'Cliquez sur chaque créneau qui vous convient : un email de réponse s’ouvre, il suffit de l’envoyer sans en modifier l’objet (un email par créneau). Pour répondre en un seul email, cliquez sur « Répondre en une seule fois » et cochez d’un X les créneaux qui vous conviennent. Si aucun ne vous convient, cliquez sur « Aucun créneau ne convient ».',
      '{{BOUTONS}}',
      `Merci de nous répondre${limite ? ` avant le ${limite}` : ''}. Le rendez-vous vous sera confirmé dès que toutes les parties auront répondu.`
    ].join('\n\n');
  }

  // Pur : les emails à préparer — les clients ensemble, chaque confrère à part. `filtre` : seulement
  // ces adresses (relance de ceux qui n'ont pas répondu).
  function groupesEmailSondage(participants, filtre) {
    const retenus = participants.filter(p => p.email && (!filtre || filtre.indexOf(p.email) !== -1));
    const clients = retenus.filter(p => !p.confrere);
    return (clients.length ? [{ confrere: false, participants: clients }] : [])
      .concat(retenus.filter(p => p.confrere).map(p => ({ confrere: true, participants: [p] })));
  }

  // Pur : participants qui n'ont pas encore répondu.
  function sansReponseSondage(s) {
    return s.participants.filter(p => !(s.reponses || []).some(r => r.email === p.email));
  }

  async function chargerSondages() {
    try {
      const r = await fetchAvecAuth('/api/sondages');
      const corps = await r.json();
      if (!corps || !corps.ok) return;
      const avant = JSON.stringify(sondagesCreneaux);
      const anciens = sondagesCreneaux;
      sondagesCreneaux = corps.sondages || [];
      majBadgeAgendaDates();
      if (avant === JSON.stringify(sondagesCreneaux)) return;
      // Une nouvelle réponse : notification discrète.
      if (anciens.length) {
        for (const s of sondagesCreneaux) {
          const a = anciens.find(x => x.id === s.id);
          if (a && (s.reponses || []).length > (a.reponses || []).length) {
            const d = dossiers.find(x => x.id === s.dossierId);
            afficherToast(`Nouvelle réponse au sondage de créneaux — ${d ? libelleDossierAffiche(d) : s.titre || libelleDossierParNom(s.dossierNom, s.dossierId)}.`, 'OK', null);
          }
        }
      }
      renderDrawer();
      if (ongletActuel === 'agenda') renderPageAgenda();
      renderSuiviDatesProposees();
    } catch (e) { /* serveur injoignable : on garde la dernière liste */ }
  }

  // ---- Fenêtre « Proposer des créneaux » ----
  async function ouvrirSondageCreneaux(id, creneauxImposes, enTete) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    if (sondageOuvertDossier(id)) { afficherToast('Un sondage est déjà en cours pour ce dossier.', 'OK', null); return; }
    const auj = isoAujourdhuiLocal();
    // Les rendez-vous des deux prochains mois (l'agenda affiché n'en couvre qu'une semaine).
    let evenements = agendaEvenements;
    try {
      const r = await fetchAvecAuth(`/api/agenda/evenements?debut=${auj}&fin=${addDays(auj, 90)}`);
      const corps = await r.json();
      if (corps && Array.isArray(corps.evenements)) evenements = corps.evenements;
    } catch (e) { /* l'agenda déjà chargé suffira */ }
    const proposes = creneauxSondageAvecTete(enTete,
      creneauxImposes && creneauxImposes.length ? creneauxImposes : creneauxProposesSignature(d, evenements, absencesOffice, auj, 4),
      MAX_CRENEAUX_SONDAGE);
    sondageModale = {
      dossierId: id,
      creneaux: proposes.map((c, i) => ({ date: c.date, heure: c.heure, exceptionnel: c.exceptionnel || '', apresButoir: !!c.apresButoir, coche: i < 3 })),
      participants: participantsSondage(d, typeof carnetConfreres !== 'undefined' ? carnetConfreres : []).map(p => Object.assign({}, p, { coche: true })),
      options: true
    };
    renderModaleSondage();
  }

  // Sondage sans dossier, depuis l'agenda : titre, durée et destinataires libres (étude, 01/10).
  function ouvrirSondageSansDossier(titre, enTete) {
    if (!exchangeAgendaPret()) { afficherToast('Connexion à l’agenda Outlook à activer dans les Réglages.', 'OK', null); return; }
    const tete = creneauxSondageAvecTete(enTete, [], MAX_CRENEAUX_SONDAGE);
    sondageModale = {
      dossierId: '', titre: String(titre || '').replace(/[?]/g, ' ').trim(), duree: 60,
      creneaux: tete.map(c => ({ date: c.date, heure: c.heure, exceptionnel: c.exceptionnel || '', apresButoir: false, coche: true })),
      participants: [{ role: 'autre', nom: '', email: '', confrere: false, coche: true }],
      options: true
    };
    renderModaleSondage();
    setTimeout(() => { const c = document.getElementById(sondageModale && sondageModale.titre ? 'sondage-ajout-date' : 'sondage-titre'); if (c) c.focus(); }, 0);
  }

  function ajouterDestinataireSondage() {
    if (!sondageModale || sondageModale.participants.length >= 6) return;
    sondageModale.participants.push({ role: 'autre', nom: '', email: '', confrere: false, coche: true });
    renderModaleSondage();
    const champ = document.getElementById(`sondage-nom-${sondageModale.participants.length - 1}`);
    if (champ) champ.focus();
  }

  function retirerDestinataireSondage(i) {
    if (!sondageModale || sondageModale.participants.length <= 1) return;
    sondageModale.participants.splice(i, 1);
    renderModaleSondage();
  }

  function fermerModaleSondage() {
    sondageModale = null;
    renderModaleSondage();
  }

  function renderModaleSondage() {
    const overlay = document.getElementById('sondage-overlay');
    if (!overlay) return;
    if (!sondageModale) { overlay.style.display = 'none'; return; }
    const d = sondageModale.dossierId ? dossiers.find(x => x.id === sondageModale.dossierId) : null;
    if (sondageModale.dossierId && !d) { overlay.style.display = 'none'; return; }
    const m = sondageModale;
    const nbCoches = m.creneaux.filter(c => c.coche).length;
    // Le focus et le curseur d'un champ libre survivent au rendu (ajout d'un créneau, d'un destinataire).
    const actif = document.activeElement && document.activeElement.id && document.getElementById('sondage-modale-contenu').contains(document.activeElement)
      ? { id: document.activeElement.id, debut: document.activeElement.selectionStart, fin: document.activeElement.selectionEnd } : null;
    const destinatairesLibres = `<ul class="sondage-participants sondage-libres">${m.participants.map((p, i) => `<li>
            <input type="text" class="sondage-email" id="sondage-nom-${i}" value="${escapeAttr(p.nom)}" maxlength="120" placeholder="Nom" oninput="sondageModale.participants[${i}].nom = this.value" aria-label="Nom du destinataire ${i + 1}">
            <input type="email" class="sondage-email" id="sondage-email-${i}" value="${escapeAttr(p.email)}" placeholder="Adresse email" oninput="sondageModale.participants[${i}].email = this.value.trim()" aria-label="Email du destinataire ${i + 1}">
            <label class="sondage-case sondage-confrere" title="Un confrère reçoit son propre email, avec la formule d’usage"><input type="checkbox" ${p.confrere ? 'checked' : ''} onchange="sondageModale.participants[${i}].confrere = this.checked"> Confrère</label>
            ${m.participants.length > 1 ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="retirerDestinataireSondage(${i})" aria-label="Retirer ce destinataire" title="Retirer">${icone('x')}</wa-button>` : '<span></span>'}
          </li>`).join('')}</ul>
          ${m.participants.length < 6 ? '<wa-button appearance="outlined" type="button" class="bouton-ajout" onclick="ajouterDestinataireSondage()"><span slot="start" class="bouton-ajout-plus" aria-hidden="true">+</span>Ajouter un destinataire</wa-button>' : ''}`;
    document.getElementById('sondage-modale-contenu').innerHTML = `<header class="ag-modale-tete">
        <div><h2 class="ag-modale-titre" id="sondage-modale-titre">${d ? 'Proposer des créneaux' : 'Proposer des dates'}</h2>
        <div class="ag-modale-quand">${d ? escapeHtml(libelleDossierAffiche(d)) : 'Sans dossier'} ${infoBulle('Les destinataires reçoivent un email avec un bouton par créneau : chacun clique sur ceux qui lui conviennent, et l’email de réponse arrive dans la boîte de l’office, où CLAIRE lit les réponses. Vous placez ensuite le rendez-vous d’un clic.')}</div></div>
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn ag-modale-x" onclick="fermerModaleSondage()" aria-label="Fermer">${icone('x')}</wa-button>
      </header>
      <form class="ag-modale-corps ag-form" onsubmit="event.preventDefault(); lancerSondageCreneaux();">
        ${d ? '' : `<div class="ag-champs-ligne sondage-titre-ligne">
          <label class="ag-champ">Titre du rendez-vous <input type="text" id="sondage-titre" required maxlength="120" value="${escapeAttr(m.titre)}" placeholder="Ex. : Rendez-vous client, réunion…" oninput="sondageModale.titre = this.value"></label>
          <label class="ag-champ">Durée
            <select id="sondage-duree" onchange="sondageModale.duree = parseInt(this.value, 10) || 60">
              ${[30, 60, 90, 120, 180].map(v => `<option value="${v}"${m.duree === v ? ' selected' : ''}>${v < 60 ? v + ' min' : Math.floor(v / 60) + ' h' + (v % 60 ? ' 30' : '')}</option>`).join('')}
            </select></label>
        </div>`}
        <div class="sondage-bloc">
          <div class="sondage-bloc-titre">Créneaux <span class="hint">${nbCoches}/${MAX_CRENEAUX_SONDAGE}</span></div>
          ${m.creneaux.length ? `<ul class="sondage-creneaux">${m.creneaux.map((c, i) => `<li><label class="sondage-case">
            <input type="checkbox" id="sondage-creneau-${i}" ${c.coche ? 'checked' : ''} ${!c.coche && nbCoches >= MAX_CRENEAUX_SONDAGE ? 'disabled' : ''} onchange="cocherCreneauSondage(${i}, this.checked)">
            <span>${escapeHtml(libelleCreneauSondage(c).replace(/^./, x => x.toUpperCase()))}</span>
            ${c.exceptionnel ? `<span class="sondage-note">${icone('alert-triangle')} ${escapeHtml(c.exceptionnel)}</span>` : ''}
            ${c.apresButoir ? '<span class="sondage-note">après la date butoir</span>' : ''}
          </label></li>`).join('')}</ul>` : (d ? '<p class="jour-vide">Aucun créneau libre trouvé : ajoutez-en un.</p>' : '<p class="jour-vide">Ajoutez les dates à proposer.</p>')}
          <div class="ag-champs-ligne sondage-ajout">
            <label class="ag-champ">Date <input type="date" id="sondage-ajout-date" min="${escapeAttr(isoAujourdhuiLocal())}"></label>
            <label class="ag-champ">Heure <input type="time" id="sondage-ajout-heure" step="1800" value="10:00"></label>
            <wa-button appearance="outlined" type="button" class="bouton-ajout" onclick="ajouterCreneauSondage()" ${m.creneaux.length >= 8 ? 'disabled' : ''}><span slot="start" class="bouton-ajout-plus" aria-hidden="true">+</span>Ajouter un créneau</wa-button>
          </div>
        </div>
        <div class="sondage-bloc">
          <div class="sondage-bloc-titre">Destinataires</div>
          ${d ? '' : destinatairesLibres}
          ${!d ? '' : `<ul class="sondage-participants">${m.participants.map((p, i) => `<li>
            <label class="sondage-case"><input type="checkbox" ${p.coche ? 'checked' : ''} onchange="sondageModale.participants[${i}].coche = this.checked">
              <span><b>${escapeHtml(LIBELLES_ROLE_SONDAGE[p.role] || '')}</b>${p.nom ? ' · ' + escapeHtml(p.nom) : ''}</span></label>
            <input type="email" class="sondage-email" id="sondage-email-${i}" value="${escapeAttr(p.email)}" placeholder="Adresse email" oninput="sondageModale.participants[${i}].email = this.value.trim()" aria-label="Email — ${escapeAttr(LIBELLES_ROLE_SONDAGE[p.role] || '')}">
          </li>`).join('')}</ul>`}
        </div>
        <label class="ag-champ ag-case-signature"><input type="checkbox" id="sondage-options" ${m.options ? 'checked' : ''} ${exchangeAgendaPret() ? '' : 'disabled'} onchange="sondageModale.options = this.checked">
          Bloquer ces créneaux en option dans l’agenda ${infoBulle('Rendez-vous provisoires « VTE - … ? » dans l’agenda partagé, retirés d’eux-mêmes au placement du rendez-vous ou à l’annulation du sondage ; gardés tant que rien n’est décidé.')}</label>
        <footer class="ag-modale-pied ag-modale-pied-form">
          <span class="jour-espace"></span>
          <wa-button appearance="outlined" class="secondary" onclick="fermerModaleSondage()">Annuler</wa-button>
          <wa-button variant="brand" type="submit" class="primary" id="sondage-ok">${icone('mail')} Préparer les emails</wa-button>
        </footer>
      </form>`;
    overlay.style.display = 'flex';
    if (actif) {
      const champ = document.getElementById(actif.id);
      if (champ) { champ.focus({ preventScroll: true }); try { if (actif.debut != null) champ.setSelectionRange(actif.debut, actif.fin); } catch (e) { /* champ sans curseur */ } }
    }
  }

  function cocherCreneauSondage(i, coche) {
    if (!sondageModale || !sondageModale.creneaux[i]) return;
    sondageModale.creneaux[i].coche = coche;
    renderModaleSondage();
  }

  function ajouterCreneauSondage() {
    if (!sondageModale) return;
    const date = (document.getElementById('sondage-ajout-date') || {}).value || '';
    const heure = (document.getElementById('sondage-ajout-heure') || {}).value || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure)) { afficherToast('Choisissez une date et une heure.', 'OK', null); return; }
    if (sondageModale.creneaux.some(c => c.date === date && c.heure === heure)) return;
    const coches = sondageModale.creneaux.filter(c => c.coche).length;
    const motif = motifCreneauExceptionnel(heure, sondageModale.dossierId ? DUREE_CRENEAU_SIGNATURE : (sondageModale.duree || 60), 0);
    sondageModale.creneaux.push({ date, heure, exceptionnel: motif || '', apresButoir: false, coche: coches < MAX_CRENEAUX_SONDAGE });
    sondageModale.creneaux.sort((a, b) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure));
    renderModaleSondage();
  }

  async function lancerSondageCreneaux() {
    const m = sondageModale;
    if (!m) return;
    const d = m.dossierId ? dossiers.find(x => x.id === m.dossierId) : null;
    if (m.dossierId && !d) return;
    const titre = d ? '' : String(m.titre || '').replace(/[?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!d && !titre) { afficherToast('Donnez un titre au rendez-vous.', 'OK', null); return; }
    const creneaux = m.creneaux.filter(c => c.coche);
    // Sans dossier : chaque ligne qui porte une adresse est un destinataire.
    const participants = d ? m.participants.filter(p => p.coche) : m.participants.filter(p => (p.email || '').trim()).map(p => Object.assign({}, p, { nom: String(p.nom || '').trim() }));
    if (!creneaux.length) { afficherToast('Cochez au moins un créneau.', 'OK', null); return; }
    if (!participants.length) { afficherToast('Cochez au moins un destinataire.', 'OK', null); return; }
    const sansAdresse = participants.find(p => !adressesEmailValides(p.email));
    if (sansAdresse) { afficherToast(`Adresse email manquante ou invalide : ${libelleParticipantSondage(sansAdresse)}.`, 'OK', null); return; }
    // Une adresse saisie ici pour le vendeur ou l'acquéreur est gardée sur la fiche.
    let modifie = false;
    for (const p of (d ? participants : [])) {
      if (p.role === 'vendeur' && p.email !== (d.emailVendeur || '')) { d.emailVendeur = p.email; ajouterHistorique(d, `Email du vendeur : ${p.email}`); modifie = true; }
      if (p.role === 'acquereur' && p.email !== (d.emailAcquereur || '')) { d.emailAcquereur = p.email; ajouterHistorique(d, `Email de l’acquéreur : ${p.email}`); modifie = true; }
    }
    const bouton = document.getElementById('sondage-ok');
    if (bouton) bouton.disabled = true;
    try {
      const r = await fetchAvecAuth('/api/sondages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dossierId: d ? d.id : '', dossierNom: d ? d.nom : '', titre, libelle: d ? libelleDossierAffiche(d) : titre, creePar: utilisateurPoste || '',
          typeRdv: d ? (typeRendezVous(d, categoriesRdvReglees()) || 'office') : '',
          poserOptions: !!m.options && exchangeAgendaPret(),
          creneaux: creneaux.map(c => ({ date: c.date, heure: c.heure, dureeMinutes: d ? DUREE_CRENEAU_SIGNATURE : (m.duree || 60) })),
          // Envoi groupé (« a@x.fr; b@y.fr ») : chaque adresse vote pour elle-même (un code chacune).
          participants: participantsParAdresse(participants).map(p => ({ role: p.role, nom: p.nom, email: p.email, confrere: p.confrere }))
        })
      });
      const corps = await r.json();
      if (!corps.ok) { if (bouton) bouton.disabled = false; afficherToast(corps.message || 'Le sondage n’a pas pu être créé.', 'OK', null); return; }
      const s = corps.sondage;
      sondagesCreneaux = sondagesCreneaux.filter(x => x.id !== s.id).concat([s]);
      if (d) {
        ajouterHistorique(d, `Sondage de créneaux envoyé (${s.creneaux.map(c => formatDateFr(c.date) + ' ' + c.heure).join(', ')})${s.creneaux.some(c => c.option) ? ', créneaux en option dans l’agenda' : ''}.`);
        modifie = true;
      }
      sondageModale = null;
      renderModaleSondage();
      const envoi = await preparerEmailsSondage(d, s, null, false);
      if (corps.avertissement) afficherToast(corps.avertissement, 'OK', null);
      else if (envoi) annoncerEmailPret(envoi, true, s.creneaux.some(c => c.option) ? 'Créneaux mis en option dans l’agenda.' : '');
      if (ongletActuel === 'agenda') { renderPageAgenda(); chargerAgendaSemaine(); }
    } catch (e) {
      if (bouton) bouton.disabled = false;
      afficherToast('Serveur injoignable — sondage non créé.', 'OK', null);
    } finally {
      if (modifie && d) { sauvegarder(d); render(); }
    }
  }

  // Options seules (étude 07/10, « Demander à CLAIRE : placer plusieurs options de rendez-vous ») : les créneaux posés en option
  // dans l'agenda de l'office, sans destinataire ni email — un sondage `optionsSeules` (même suivi : « Placer » retire les autres,
  // gardées tant que rien n'est décidé — étude 07/10, plus de retrait après 5 jours ouvrés). Appelé après la confirmation.
  async function poserOptionsRendezVous(d, creneaux) {
    try {
      const r = await fetchAvecAuth('/api/sondages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dossierId: d.id, dossierNom: d.nom, titre: '', libelle: libelleDossierAffiche(d), creePar: utilisateurPoste || '',
          typeRdv: typeRendezVous(d, categoriesRdvReglees()) || 'office', optionsSeules: true, poserOptions: true,
          creneaux: creneaux.map(c => ({ date: c.date, heure: c.heure, dureeMinutes: DUREE_CRENEAU_SIGNATURE })), participants: []
        })
      });
      const corps = await r.json();
      if (!corps.ok) {
        noterVerificationPoste('options-rendez-vous', { ok: false, message: 'options refusées par Exchange' });
        afficherToast(corps.message || 'Les options n’ont pas pu être posées.', 'OK', null);
        return false;
      }
      const s = corps.sondage;
      sondagesCreneaux = sondagesCreneaux.filter(x => x.id !== s.id).concat([s]);
      const poses = s.creneaux.filter(c => c.option);
      ajouterHistorique(d, `Options posées dans l’agenda de l’office, sans email : ${poses.map(c => formatDateFr(c.date) + ' ' + c.heure).join(', ')}.`);
      sauvegarder(d);
      noterVerificationPoste('options-rendez-vous', { detail: `${poses.length} option(s) posée(s)` });
      afficherToast(corps.avertissement || `${poses.length > 1 ? `${poses.length} options posées` : 'Option posée'} pour ${libelleDossierAffiche(d)}.`,
        'Voir dans l’agenda', () => voirDateProposeeDansAgenda(poses[0].date));
      if (ongletActuel === 'agenda') { renderPageAgenda(); chargerAgendaSemaine(); }
      render();
      return true;
    } catch (e) {
      afficherToast('Serveur injoignable — options non posées.', 'OK', null);
      return false;
    }
  }

  // Pure : un participant par adresse (« a@x.fr; b@y.fr » → deux votants de même rôle et même nom).
  function participantsParAdresse(participants) {
    return (participants || []).reduce((l, p) => {
      const adresses = destinatairesEmail(p.email);
      return l.concat(adresses.length > 1 ? adresses.map(email => Object.assign({}, p, { email })) : [p]);
    }, []);
  }

  // Un email par groupe (clients ensemble, chaque confrère à part). Rend le dernier résultat.
  async function preparerEmailsSondage(d, s, filtre, relance) {
    let dernier = null;
    for (const g of groupesEmailSondage(s.participants, filtre)) {
      dernier = await livrerEmailDossier({ dossierId: d ? d.id : '',
        destinataire: g.participants.map(p => p.email).join(', '),
        sujet: `${relance ? 'Relance — ' : ''}${d ? 'Rendez-vous de signature' : 'Rendez-vous'} : vos disponibilités — ${libelleSondage(s, d)}`,
        corps: emailDepuisModele('sondage', d, null, contexteSondage(d, s, g.confrere, relance, !!pageSondageReglee(), g.participants.length > 1)).corps,
        confrere: g.confrere,
        boutons: boutonsSondage(s, { page: pageSondageReglee(), abrege: abregeSondage(s, d), relais: relaisSondageRegle(), participants: g.participants }),
        responsableSignature: d ? d.responsable : ''
      });
      if (!dernier.ok) { if (!dernier.annule) afficherToast(dernier.message || 'L’email n’a pas pu être préparé.', 'OK', null); return null; }
    }
    return dernier;
  }

  async function actionSondage(id, action, corpsRequete) {
    try {
      const r = await fetchAvecAuth(`/api/sondages/${encodeURIComponent(id)}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpsRequete || {})
      });
      const corps = await r.json();
      if (corps.sondage) sondagesCreneaux = sondagesCreneaux.filter(x => x.id !== id).concat([corps.sondage]);
      renderSuiviDatesProposees();
      return corps;
    } catch (e) {
      return { ok: false, message: 'Serveur injoignable.' };
    }
  }

  async function relireSondage(id) {
    const r = await actionSondage(id, 'relire');
    afficherToast(r.ok ? (r.lus ? `Boîte relue : ${r.lus} réponse${r.lus > 1 ? 's' : ''} au total.` : 'Boîte relue : aucune réponse pour l’instant.') : (r.message || 'La boîte n’a pas pu être relue.'), 'OK', null);
    renderDrawer();
    if (ongletActuel === 'agenda') renderPageAgenda();
  }

  function relancerSondage(id) {
    const s = sondagesCreneaux.find(x => x.id === id);
    const d = s && s.dossierId ? dossiers.find(x => x.id === s.dossierId) : null;
    if (!s || (s.dossierId && !d)) return;
    const cibles = sansReponseSondage(s).map(p => p.email);
    if (!cibles.length) { afficherToast('Tout le monde a répondu.', 'OK', null); return; }
    preparerEmailsSondage(d, s, cibles, true).then(async (r) => {
      if (!r) return;
      await actionSondage(id, 'relance');
      if (d) { ajouterHistorique(d, 'Sondage de créneaux : relance de ceux qui n’ont pas répondu.'); sauvegarder(d); }
      annoncerEmailPret(r, true, '');
      renderDrawer();
      if (ongletActuel === 'agenda') renderPageAgenda();
    });
  }

  function annulerSondage(id) {
    const s = sondagesCreneaux.find(x => x.id === id);
    const d = s && dossiers.find(x => x.id === s.dossierId);
    if (!s) return;
    const options = s.creneaux.some(c => c.option);
    const question = s.optionsSeules
      ? `Retirer de l’agenda les options${d ? ' de ' + libelleDossierAffiche(d) : ''} ?`
      : `Annuler le sondage de créneaux${d ? ' de ' + libelleDossierAffiche(d) : s.titre ? ' « ' + s.titre + ' »' : ''} ?${options ? ' Les options posées dans l’agenda seront retirées.' : ''} Les réponses qui arriveraient ensuite ne seront plus lues.`;
    demanderConfirmation(question, async () => {
      const r = await actionSondage(id, 'annuler');
      if (!r.ok) { afficherToast(r.message || 'Annulation impossible.', 'OK', null); return; }
      if (d) { ajouterHistorique(d, s.optionsSeules ? 'Options retirées de l’agenda.' : 'Sondage de créneaux annulé.'); sauvegarder(d); }
      afficherToast(r.message || 'Sondage annulé.', 'OK', null);
      render();
      if (ongletActuel === 'agenda') chargerAgendaSemaine();
    }, { bouton: s.optionsSeules ? 'Retirer les options' : 'Annuler le sondage' });
  }

  // Place le rendez-vous de signature au créneau choisi, puis clôt le sondage (options retirées).
  function placerCreneauSondage(id, n) {
    const s = sondagesCreneaux.find(x => x.id === id);
    const d = s && s.dossierId ? dossiers.find(x => x.id === s.dossierId) : null;
    const c = s && s.creneaux.find(x => x.n === n);
    if (!s || !c || (s.dossierId && !d)) return;
    const synthese = (s.synthese || []).find(x => x.n === n);
    const possibles = synthese ? synthese.accepte + (synthese.siBesoin || 0) : 0;
    const reserve = !s.optionsSeules && synthese && !synthese.tous ? ` Seuls ${possibles} destinataire${possibles > 1 ? 's' : ''} sur ${synthese.total} l’ont accepté.` : '';
    demanderConfirmation(`${d ? `Placer la signature de ${libelleDossierAffiche(d)}` : `Placer « ${s.titre} »`} le ${libelleCreneauSondage(c)} ?${reserve} Les autres options ${s.optionsSeules ? '' : 'du sondage '}seront retirées de l’agenda.`, async () => {
      const ok = d
        ? await posterEvenementAgenda({ sujet: libelleDossierAffiche(d), date: c.date, heure: c.heure, dureeMinutes: c.dureeMinutes || DUREE_CRENEAU_SIGNATURE, lieu: lieuRdvAgenda(d), typeRdv: typeRendezVous(d, categoriesRdvReglees()) || 'office', dossier: d, signature: true })
        : await posterEvenementAgenda({ sujet: s.titre || 'Rendez-vous', date: c.date, heure: c.heure, dureeMinutes: c.dureeMinutes || 60, lieu: '', typeRdv: TYPES_RDV[s.typeRdv] ? s.typeRdv : '', dossier: null, signature: false });
      if (!ok) return;
      const r = await actionSondage(id, 'placer', { n });
      if (d) { ajouterHistorique(d, s.optionsSeules ? `Option ${n} retenue, les autres retirées de l’agenda.` : `Sondage de créneaux clos : créneau ${n} retenu.`); sauvegarder(d); }
      if (r.message) afficherToast(r.message, 'OK', null);
      render();
      if (ongletActuel === 'agenda') chargerAgendaSemaine();
    }, { bouton: 'Placer', ton: 'valider' });
  }

  // Tableau des réponses : une ligne par créneau, une colonne par destinataire.
  function renderTableSondage(s, compact) {
    const cellule = (p, c) => {
      const r = (s.reponses || []).find(x => x.email === p.email);
      if (!r) return `<td class="sondage-attente" title="Pas encore de réponse">–</td>`;
      if (r.choix.indexOf(c.n) !== -1) return `<td class="sondage-oui" title="Convient">${icone('check')}</td>`;
      if ((r.siBesoin || []).indexOf(c.n) !== -1) return `<td class="sondage-si" title="Si nécessaire">(${icone('check')})</td>`;
      return `<td class="sondage-non" title="${r.aucun ? 'Aucun créneau ne convient' : 'Ne convient pas'}">${icone('x')}</td>`;
    };
    const ouvert = s.statut === 'ouvert';
    return `<div class="sondage-table-cadre"><table class="sondage-table">
        <thead><tr><th scope="col">Créneau</th>${s.participants.map(p => `<th scope="col" title="${escapeAttr(p.email)}">${p.role === 'autre' ? escapeHtml(libelleParticipantSondage(p)) : `${escapeHtml(LIBELLES_ROLE_SONDAGE[p.role] || '')}${!compact && p.nom ? `<span>${escapeHtml(p.nom)}</span>` : ''}`}</th>`).join('')}${ouvert ? '<th></th>' : ''}</tr></thead>
        <tbody>${s.creneaux.map(c => {
          const sy = (s.synthese || []).find(x => x.n === c.n);
          return `<tr class="${sy && sy.tous ? 'sondage-tous' : ''}${s.choisi === c.n ? ' sondage-choisi' : ''}">
            <th scope="row">${escapeHtml(new Date(c.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''))} ${escapeHtml(c.heure.replace(':', ' h '))}${c.option ? ` <span class="sondage-option" title="En option dans l’agenda">option</span>` : ''}</th>
            ${s.participants.map(p => cellule(p, c)).join('')}
            ${ouvert ? `<td><wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="placerCreneauSondage('${escapeOnclickArg(s.id)}', ${c.n})" ${exchangeAgendaPret() ? '' : 'disabled title="Connexion à l’agenda Outlook à activer dans les Réglages"'}>Placer</wa-button></td>` : ''}
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  }

  // Dans la fiche (onglet Échanges) : le sondage en cours, sinon la ligne pour en lancer un.
  function renderSondageDossier(d) {
    const s = sondageOuvertDossier(d.id);
    if (s && s.optionsSeules) {
      return `<div class="sondage-panneau">
          <div class="sondage-tete">
            <span class="section-eyebrow">Options dans l’agenda</span>
            <span class="hint">Sans email · gardées jusqu’au placement</span>
          </div>
          ${renderTableSondage(s, false)}
          <div class="sondage-actions">
            <button type="button" class="lien-bouton" onclick="annulerSondage('${escapeOnclickArg(s.id)}')">${icone('x')} Retirer les options</button>
          </div>
        </div>`;
    }
    if (s) {
      const repondu = s.participants.length - sansReponseSondage(s).length;
      const tous = (s.synthese || []).filter(x => x.tous);
      const autres = (s.reponses || []).filter(r => !s.participants.some(p => p.email === r.email));
      return `<div class="sondage-panneau">
          <div class="sondage-tete">
            <span class="section-eyebrow">Sondage de créneaux</span>
            <span class="hint">${repondu}/${s.participants.length} réponse${s.participants.length > 1 ? 's' : ''}</span>
          </div>
          ${tous.length ? `<p class="sondage-accord">${icone('check')} ${tous.length > 1 ? 'Créneaux possibles' : 'Créneau possible'} pour tous : ${tous.map(x => escapeHtml(libelleCreneauSondage(x)) + (x.tousOui ? '' : ' (si nécessaire pour certains)')).join(' · ')}</p>` : ''}
          ${renderTableSondage(s, false)}
          ${autres.length ? `<p class="hint">Réponse d’une autre adresse : ${autres.map(r => `${escapeHtml(r.nom || r.email)} (${r.aucun ? 'aucun créneau' : r.choix.map(n => 'n° ' + n).join(', ')})`).join(' · ')}</p>` : ''}
          <div class="sondage-actions">
            <button type="button" class="lien-bouton" onclick="relancerSondage('${escapeOnclickArg(s.id)}')" ${sansReponseSondage(s).length ? '' : 'disabled'}>${icone('mail')} Relancer</button>
            <button type="button" class="lien-bouton" onclick="relireSondage('${escapeOnclickArg(s.id)}')">${icone('rotate-ccw')} Relire les réponses</button>
            <button type="button" class="lien-bouton" onclick="annulerSondage('${escapeOnclickArg(s.id)}')">${icone('x')} Annuler le sondage</button>
          </div>
        </div>`;
    }
    if (d.archive || d.rendezVousSignature) return '';
    return `<ul class="ja-liste">${renderLigneAction({
      categorie: 'acte', titre: 'Proposer des créneaux de signature',
      sous: 'Les parties choisissent par email, comme un sondage',
      bouton: { libelle: 'Proposer', icone: icone('calendar'), onclick: `ouvrirSondageCreneaux('${escapeOnclickArg(d.id)}')`, titre: 'Choisir les créneaux et préparer les emails' }
    })}</ul>`;
  }

  // Dans le détail d'une option de l'agenda : les réponses pour ce créneau, et « Placer ».
  function renderOptionSondageAgenda(e) {
    const s = sondagesCreneaux.find(x => x.creneaux.some(c => c.option && c.option.itemId === e.itemId));
    if (!s) return '<p class="jour-vide">Option d’un sondage de créneaux déjà clos : elle sera retirée au prochain passage.</p>';
    const c = s.creneaux.find(x => x.option && x.option.itemId === e.itemId);
    const sy = (s.synthese || []).find(x => x.n === c.n);
    if (s.optionsSeules) {
      return `<div class="sondage-panneau sondage-panneau-agenda">
          <div class="sondage-tete"><span class="section-eyebrow">Option ${c.n}/${s.creneaux.length}</span>
            <span class="hint">Sans email · gardée jusqu’au placement</span></div>
          <wa-button variant="brand" class="primary ag-ouvrir-fiche" onclick="placerCreneauSondage('${escapeOnclickArg(s.id)}', ${c.n})" ${exchangeAgendaPret() ? '' : 'disabled'}>${icone('calendar')} Placer ce créneau</wa-button>
        </div>`;
    }
    return `<div class="sondage-panneau sondage-panneau-agenda">
        <div class="sondage-tete"><span class="section-eyebrow">Sondage — créneau ${c.n}/${s.creneaux.length}</span>
          <span class="hint">${sy ? `${sy.accepte}/${sy.total} l’acceptent${sy.siBesoin ? ` · ${sy.siBesoin} si nécessaire` : ''}` : ''}</span></div>
        <ul class="sondage-reponses">${s.participants.map(p => {
          const r = (s.reponses || []).find(x => x.email === p.email);
          const etat = !r ? 'attente' : r.choix.indexOf(c.n) !== -1 ? 'oui' : (r.siBesoin || []).indexOf(c.n) !== -1 ? 'si' : 'non';
          return `<li class="sondage-${etat}">${icone(etat === 'oui' || etat === 'si' ? 'check' : etat === 'non' ? 'x' : 'clock')}<span>${escapeHtml(libelleParticipantSondage(p, true))}${etat === 'si' ? ' <em>(si nécessaire)</em>' : ''}</span></li>`;
        }).join('')}</ul>
        <wa-button variant="brand" class="primary ag-ouvrir-fiche" onclick="placerCreneauSondage('${escapeOnclickArg(s.id)}', ${c.n})" ${exchangeAgendaPret() ? '' : 'disabled'}>${icone('calendar')} Placer ce créneau</wa-button>
      </div>`;
  }

  // ---- Suppression (toujours confirmée) ----
  function supprimerEvenementAgenda(cle) {
    const e = agendaEvenements.find(x => cleEvenementAgenda(x) === cle);
    if (!e || !e.itemId) return;
    const quand = e.heure ? `du ${dateAvecJourFr(e.date)} à ${e.heure.replace(':', ' h ')}` : `du ${dateAvecJourFr(e.date)}`;
    const d = dossierDeEvenement(e);
    const note = d && e.signature ? ' La date reste sur la fiche du dossier.' : '';
    demanderConfirmation(`Supprimer le rendez-vous « ${e.sujet || 'sans titre'} » ${quand} de l’agenda de l’office ? Il ira dans les éléments supprimés d’Outlook.${note}`, async () => {
      const r = await retirerEvenementAgenda(e);
      afficherToast(r.message, 'OK', null);
    });
  }

  // Retire le rendez-vous de l'agenda de l'office (MoveToDeletedItems, un seul essai) et met la fiche à jour. Sans confirmation : celle de
  // l'écran (supprimerEvenementAgenda) ou l'autorisation de « Demander à CLAIRE » vient avant. → { ok, message }.
  async function retirerEvenementAgenda(e) {
    const quand = e.heure ? `du ${dateAvecJourFr(e.date)} à ${e.heure.replace(':', ' h ')}` : `du ${dateAvecJourFr(e.date)}`;
    const d = dossierDeEvenement(e);
    try {
      const reponse = await fetchAvecAuth('/api/exchange/evenement/supprimer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: e.itemId, changeKey: e.changeKey || '' })
      });
      const corps = await reponse.json();
      if (!corps.ok) return { ok: false, message: corps.message || 'La suppression a échoué.' };
      agendaEvenements = agendaEvenements.filter(x => x.itemId !== e.itemId);
      if (d) {
        if (estSuccession(d)) majRendezVousSuccessionAgenda(d, e.itemId, null);
        if (d.rdvAgendaItem && d.rdvAgendaItem.itemId === e.itemId) { d.rdvAgendaItem = null; d.rdvAgendaCreeLe = null; }
        ajouterHistorique(d, `Rendez-vous « ${e.sujet} » ${quand} supprimé de l’agenda de l’office depuis CLAIRE.`);
        sauvegarder(d);
      }
      agendaModale = null;
      agendaSelection = null;
      renderPageAgenda();
      return { ok: true, message: corps.message || 'Rendez-vous supprimé.' };
    } catch (err) {
      return { ok: false, message: 'Serveur injoignable — rendez-vous non supprimé.' };
    }
  }

  function renderModaleAgenda() {
    const overlay = document.getElementById('agenda-overlay');
    if (!overlay) return;
    const types = { creation: [renderCreationAgenda, '#agenda-creation-titre'], modification: [renderModificationAgenda, '#agenda-modif-titre'], envoiVisio: [renderEnvoiVisio, '#agenda-visio-envoi'] };
    const type = agendaModale && types[agendaModale.type];
    if (!type || ongletActuel !== 'agenda') { overlay.style.display = 'none'; return; }
    const contenu = document.getElementById('agenda-modale-contenu');
    if (!contenu.querySelector(type[1])) contenu.innerHTML = type[0](agendaModale);
    if (!contenu.innerHTML) { agendaModale = null; overlay.style.display = 'none'; return; }
    overlay.style.display = 'flex';
  }

  // Un bloc de l'écran rendu à part : son erreur est notée (une fois par bloc et par minute) sans arrêter les autres.
  const erreursBlocsRendus = {};
  // Une ligne du Suivi dont le rendu échoue (donnée inattendue) laisse une ligne minimale cliquable, pas une liste vide.
  function ligneSuiviSure(d, rendre) {
    try { return rendre(d); } catch (e) {
      rendreBloc('ligne-' + (d && d.id), () => { throw e; });
      return `<tr class="dossier-row" onclick="ouvrirDossierDepuisDashboard('${escapeOnclickArg(d && d.id)}')"><td></td><td>${escapeHtml(libelleDossierAffiche(d))}</td><td colspan="3">Affichage incomplet — ouvrir la fiche</td></tr>`;
    }
  }
  function rendreBloc(nom, fn) {
    try { fn(); } catch (e) {
      const maintenant = Date.now();
      if (!erreursBlocsRendus[nom] || maintenant - erreursBlocsRendus[nom] > 60000) {
        erreursBlocsRendus[nom] = maintenant;
        console.error(`Rendu du bloc « ${nom} » impossible`, e);
        try { noterJournalTechnique({ categorie: 'erreur-poste', message: `Rendu du bloc ${nom} : ${(e && e.message) || e}`, source: 'rendu' }); } catch (_) { /* journal facultatif */ }
      }
    }
  }

  function render() {
    const list = document.getElementById('dossier-list');
    const count = document.getElementById('dossier-count');
    const voirArchives = document.getElementById('voir-archives').checked;
    const tri = document.getElementById('tri-dossiers').value;
    const recherche = normaliserPourRecherche(document.getElementById('recherche-dossiers').value.trim());
    const filtreResponsable = document.getElementById('filtre-responsable').value;
    const filtreOffre = document.getElementById('filtre-offre').value;
    const filtreType = document.getElementById('filtre-type').value;
    const filtreRole = document.getElementById('filtre-role').value;
    const champAffaire = document.getElementById('filtre-affaire');
    const filtreAffaire = champAffaire ? champAffaire.value : '';

    const dossiersActifs = dossiers.filter(d => !d.archive);
    // Le tableau de bord ne montre que les dossiers du collaborateur du poste (sauf vue globale,
    // par défaut pour l'administrateur) — voir « Collaborateur du poste ». Le Suivi, lui, garde
    // tout le portefeuille : il a son propre filtre Responsable.
    const globalDash = vueGlobaleDashboard();
    const perimetreTous = dossiersDuPerimetre(dossiers, utilisateurPoste, globalDash);
    const perimetreActifs = perimetreTous.filter(d => !d.archive);
    // Chaque bloc est rendu à part (audit 04/10) : une donnée inattendue dans UN widget ne doit plus empêcher le
    // reste de l'écran (liste, fiche ouverte, agenda) de s'afficher — l'erreur part au journal technique.
    rendreBloc('avancement', () => renderAvancementDossiers(perimetreActifs));
    rendreBloc('kpis', () => renderKpisDashboard(perimetreActifs, perimetreTous));
    rendreBloc('statistiques', () => renderStatistiquesDashboard(perimetreTous));
    rendreBloc('nouveautes', () => renderWidgetNouveautes());
    rendreBloc('assistant', () => renderWidgetAssistant(perimetreActifs));
    rendreBloc('accueil', () => renderAccueilDashboard(perimetreActifs, calculerStatsPortefeuille(perimetreActifs)));
    rendreBloc('rendez-vous', () => renderRendezVousDashboard(perimetreActifs));
    rendreBloc('alertes', () => renderAlertesDashboard(perimetreActifs));
    rendreBloc('pieces-recues', () => renderPiecesRecuesDashboard(perimetreActifs));
    rendreBloc('widgets', () => { initialiserGlisserWidgets(); renderWidgetsDashboard(); });
    rendreBloc('recherche', () => renderRechercheDashboard(dossiersActifs));
    rendreBloc('badge-notifications', () => majBadgeNotificationsSidebar());
    // Avant les retours anticipés sur liste vide ci-dessous : le tiroir doit se rafraîchir (ou se
    // refermer, si son dossier vient d'être supprimé) dans tous les cas, pas seulement quand la
    // liste a des lignes à afficher.
    rendreBloc('fiche', () => renderDrawer());
    if (ongletActuel === 'agenda') rendreBloc('agenda', () => renderPageAgenda());

    const dossiersVisibles = voirArchives ? dossiers : dossiersActifs;

    if (dossiers.length === 0 || dossiersVisibles.length === 0) { renderEtatsSuivi([]); const z = document.getElementById('suivi-stats'); if (z) z.innerHTML = ''; }
    if (dossiers.length === 0) {
      count.textContent = '';
      list.innerHTML = '<div class="empty-state">Aucun dossier suivi pour le moment. Ajoutez votre premier dossier ci-dessus.</div>';
      return;
    }
    if (dossiersVisibles.length === 0) {
      count.textContent = '';
      list.innerHTML = '<div class="empty-state">Aucun dossier actif — tous vos dossiers sont archivés. Allumez « Archivés » dans « Plus de filtres » pour les revoir.</div>';
      return;
    }

    const passeFiltresSuivi = d => {
      // Le nom du dossier seulement : le collaborateur se choisit dans « Responsable » (doublon retiré, 30/09).
      if (recherche && !normaliserPourRecherche(libelleDossierAffiche(d)).includes(recherche)) return false;
      if (filtreResponsable && d.responsable !== filtreResponsable) return false;
      if (filtreOffre) {
        if (d.sansPret) return false;
        if ((d.offrePretStatut || 'inconnu') !== filtreOffre) return false;
      }
      if (filtreType) {
        let prochaine = null;
        try { prochaine = prochaineEcheanceDetail(d); } catch (e) { prochaine = null; }
        if (!prochaine || prochaine.type !== filtreType) return false;
      }
      if (filtreRole && (d.roleNotaire || 'instrumentaire') !== filtreRole) return false;
      if (filtreAffaire && (estSuccession(d) ? 'succession' : 'vente') !== filtreAffaire) return false;
      return true;
    };
    const avantEtat = dossiersVisibles.filter(passeFiltresSuivi);
    // Statuts (pastilles) et statistiques : mêmes filtres que la liste (sauf statut et semaine).
    rendreBloc('suivi-etats', () => renderEtatsSuivi(syntheseEtatsSuivi(avantEtat.filter(d => !d.archive))));
    const syntheseMois = syntheseMoisSuivi(avantEtat);
    rendreBloc('suivi-colonne', () => renderColonneSuivi(syntheseMois, avantEtat.filter(d => !d.archive)));
    const dossiersAffiches = dossiersFiltreMoisSuivi(filtreEtatSuivi ? avantEtat.filter(d => etatDossier(d).cle === filtreEtatSuivi) : avantEtat, filtreMoisSuivi, syntheseMois);

    count.textContent = dossiersAffiches.length ? `${dossiersAffiches.length} dossier${dossiersAffiches.length > 1 ? 's' : ''}` : '';

    if (dossiersAffiches.length === 0) {
      list.innerHTML = '<div class="empty-state">Aucun dossier ne correspond à cette recherche ou ces filtres.</div>';
      return;
    }

    // Une clé de tri qui lève une erreur (donnée abîmée) met le dossier en fin de liste au lieu de vider toute la liste (audit 12/10).
    const sur = (f, d, defaut) => { try { return f(d); } catch (e) { return defaut; } };
    const echeanceTri = (d) => sur(calculerProchaineEcheance, d, 999999);
    const tries = dossiersAffiches.slice().sort((a, b) => {
      if (tri === 'nom') return String(a.nom || '').localeCompare(String(b.nom || ''), 'fr');
      if (tri === 'responsable') return (a.responsable || '').localeCompare(b.responsable || '', 'fr');
      if (tri === 'priorite') return sur(calculerPriorite, b, 0) - sur(calculerPriorite, a, 0);
      // Par gravité du statut (ce qui bloque d'abord, ce qui est terminé en dernier), puis par
      // échéance à l'intérieur d'un même statut — sans quoi l'ordre serait arbitraire entre deux
      // dossiers également bloqués.
      if (tri === 'statut') {
        const rang = (d) => ORDRE_ETAT_DOSSIER.indexOf(sur(x => etatDossier(x).cle, d, 'archive'));
        const ecart = rang(a) - rang(b);
        if (ecart !== 0) return ecart;
        return echeanceTri(a) - echeanceTri(b);
      }
      return echeanceTri(a) - echeanceTri(b);
    });

    // Vue "Cartes" retirée sur demande de l'étude (préférence pour la vue tableau, plus dense sur
    // un portefeuille d'une soixantaine de dossiers) : le tableau est désormais la seule vue de la
    // LISTE. La vue "Semaines" ajoutée ensuite n'est pas une troisième liste mais un regroupement
    // des mêmes dossiers par échéance — mêmes filtres, même recherche, même tiroir au clic.
    // Les dossiers qui ont du nouveau d'abord, dans les deux vues ; le reste suit, sans doublon.
    const { aVoir, reste } = partagerAVoirSuivi(tries);
    const blocAVoir = renderAVoirSuivi(aVoir);
    // Vue « Tâches » (étude 22/10) : les mêmes dossiers filtrés, leurs tâches du jour en colonnes par thème (client/104).
    if (vueSuivi === 'taches') { list.innerHTML = renderVueTachesSuivi(tries.filter(d => !d.archive)); return; }
    if (vueSuivi === 'semaines') {
      // Les archivés (case « Archivés » cochée) ont leur propre section en bas : jamais dans une semaine.
      const enCours = reste.filter(d => !d.archive);
      const archives = renderArchivesSemaines(reste, !enCours.length && !aVoir.length);
      const semaines = enCours.length || (!aVoir.length && !archives) ? renderVueSemaines(enCours) : '';
      list.innerHTML = blocAVoir + semaines + archives;
      return;
    }

    const flechesTri = { nom: '', responsable: '', statut: '', echeance: '' };
    flechesTri[tri] = ' <span class="tri-actif">▾</span>';
    // Mêmes colonnes, dans le même ordre et aux mêmes largeurs que la vue Échéances (étude, 01/10 :
    // « Date, Dossier, Échéance, Collab, Statut — la même pour Échéances et Tableau ») ; ici triables.
    list.innerHTML = `
      <div class="table-scroll">
        <table class="dossiers-table echeances-table">
          ${COLGROUP_SUIVI}
          <thead><tr>
            <th class="th-triable" onclick="definirTri('echeance')">Date${flechesTri.echeance}</th>
            <th class="th-triable" onclick="definirTri('nom')">Dossier${flechesTri.nom}</th>
            <th>Échéance</th>
            <th class="th-triable" onclick="definirTri('responsable')" title="Responsable">Resp.${flechesTri.responsable}</th>
            <th class="th-triable" onclick="definirTri('statut')">Statut${flechesTri.statut}</th>
          </tr></thead>
          <tbody>${reste.map(d => ligneSuiviSure(d, renderLigneTableau)).join('')}</tbody>
        </table>
      </div>`;
    if (blocAVoir) list.innerHTML = blocAVoir + (reste.length ? list.innerHTML : '');
  }

  // Change le tri depuis un clic sur un en-tête de colonne : répercuté sur le menu "Trier par"
  // (source unique de vérité, pas de deuxième variable d'état à garder synchronisée).
  function definirTri(critere) {
    document.getElementById('tri-dossiers').value = critere;
    render();
  }

  // Mode d'affichage de la liste du Suivi : le tableau habituel, ou le même contenu regroupé par
  // semaine d'échéance (voir renderVueSemaines). En mémoire seulement, comme le reste de l'état
  // d'affichage de cet onglet (recherche, filtres) : c'est une façon de regarder la liste à un
  // instant donné, pas une préférence à conserver d'une session à l'autre.
  // Vue par défaut : « Échéances » (le regroupement par semaine), et non le tableau plat —
  // demandé par l'étude : ce qu'on ouvre le matin, c'est la charge de travail de la semaine.
  let vueSuivi = 'semaines';

  // Identifiant du dossier affiché dans le tiroir latéral, ou null si aucun. Un seul à la fois :
  // le tiroir est une fenêtre sur LE dossier consulté, pas une liste d'éléments dépliés (c'est
  // justement ce qui remplace l'ancien Set de lignes dépliées, dont chaque ouverture décalait
  // toute la suite du tableau). Conservé en mémoire pour que render() — déclenché par la moindre
  // action de la fiche : renommer, corriger une date, revérifier l'offre... — puisse reconstruire
  // le contenu du tiroir sans le refermer sous les doigts de l'utilisateur.
  let dossierOuvert = null;
  // Formulaire d'ajout d'une échéance personnalisée (voir renderAjoutEcheance) : un seul dossier
  // est ouvert à la fois dans le tiroir, un simple booléen suffit donc — remis à false à chaque
  // ouverture/fermeture pour ne pas laisser le formulaire ouvert sur le dossier suivant consulté.
  let ajoutEcheanceOuvert = false;

  // Indicateur "dossier mis à jour" sur une ligne du Suivi (tableau ou vue Échéances) : un
  // .dot-label ordinaire, pas un composant à part — demandé par l'étude ("identifier le dossier
  // mis à jour"). Vide tant que rien de nouveau n'est à voir. Rouge (dl-urgent) depuis que l'étude
  // a demandé "la couleur des notifications en rouge" : c'est un signal à remarquer, distinct du
  // vert dl-success qui dit partout ailleurs "reçu/acquis" — les deux se retrouvaient côte à côte
  // sur la même pièce, ce qui noyait justement le signal "nouveau".
  function tagNotificationsDossier(d) {
    const n = (d.piecesNotifications || []).length;
    const pieces = n ? `<span class="dot-label dl-urgent notif-nouveau-tag" title="${n} document${n > 1 ? 's' : ''} nouvellement trouvé${n > 1 ? 's' : ''} — ouvrez la fiche pour les voir"><span class="dot"></span>${n} nouvelle${n > 1 ? 's' : ''} pièce${n > 1 ? 's' : ''}</span>` : '';
    // Tous les fonds reçus, confirmation au client pas encore envoyée (étude 12/10 : « mettre une pastille de notification quand
    // tous les fonds sont reçus ») — jusqu'à la confirmation, comme le compteur de « Suivi des dossiers ».
    const fonds = fondsCompletsAConfirmer(d) ? '<span class="dot-label dl-urgent notif-nouveau-tag notif-fonds-recus" title="Tous les fonds sont reçus — ouvrez la fiche (onglet Fonds) pour confirmer la réception au client"><span class="dot"></span>Fonds reçus</span>' : '';
    return pieces + fonds + tagMajAuthentic(d);
  }

  // Pastille « Mise à jour » (étude 06/10 au soir : « une pastille de notification quand un dossier demande une mise à jour ») :
  // Authentic a changé une donnée déjà reprise, la fiche attend la décision (client/52). Même rouge que « nouvelle pièce ».
  function tagMajAuthentic(d) {
    const majs = majsEnAttenteAuthentic(d);
    if (!majs.length || d.archive) return '';
    const detail = majs.map(m => m.libelle).join(', ');
    return `<span class="dot-label dl-urgent notif-nouveau-tag notif-maj-authentic" title="Authentic a changé : ${escapeAttr(detail)} — ouvrez la fiche pour mettre à jour ou ignorer"><span class="dot"></span>Mise à jour</span>`;
  }

  // ---- Suivi « intelligent » (étude, 30/09 : « les dossiers avec une notification remontent en haut
  // de liste ») : ce qui fait remonter un dossier dans « À voir en premier », avec la raison écrite.
  // Pure. Un dossier en sort de lui-même : ouvrir sa fiche vide ses notifications, confirmer la
  // réception des fonds lève le second signal.
  function signauxDossierSuivi(d) {
    if (!d || d.archive) return [];
    const out = [];
    const notifs = d.piecesNotifications || [];
    if (notifs.includes(CLE_NOTIF_OFFRE_PRET)) out.push({ cle: 'offre', rang: 0, texte: 'Offre de prêt reçue' });
    const pieces = notifs.filter(c => c !== CLE_NOTIF_OFFRE_PRET);
    if (pieces.length) {
      const liste = checklistPieces(d.typeVente, d);
      const noms = pieces.map(c => { const p = liste.find(x => x.cle === c); return p ? p.label : libellePieceParCle(c); });
      out.push({ cle: 'pieces', rang: 0, texte: pieces.length === 1 ? `Nouvelle pièce : ${noms[0]}` : `${pieces.length} nouvelles pièces : ${noms.join(', ')}` });
    }
    if (fondsCompletsAConfirmer(d)) {
      out.push({ cle: 'fonds', rang: 1, texte: 'Tous les fonds reçus — confirmation à envoyer' });
    }
    // Authentic a changé une donnée déjà reprise (étude 06/10 au soir) : la mise à jour attend une décision sur la fiche.
    const majs = majsEnAttenteAuthentic(d);
    if (majs.length) out.push({ cle: 'authentic', rang: 1, texte: majs.length === 1 ? `Authentic a changé : ${majs[0].libelle}` : `Authentic a changé : ${majs.length} données` });
    return out;
  }

  // Pure : les dossiers de la liste qui ont un signal, du plus pressant au moins pressant (rang du
  // signal, puis échéance la plus proche), et le reste, dans l'ordre reçu.
  function partagerAVoirSuivi(liste) {
    const aVoir = [], reste = [];
    (liste || []).forEach(d => { const s = signauxDossierSuivi(d); if (s.length) aVoir.push({ d, s }); else reste.push(d); });
    aVoir.sort((a, b) => (Math.min(...a.s.map(x => x.rang)) - Math.min(...b.s.map(x => x.rang))) || (calculerProchaineEcheance(a.d) - calculerProchaineEcheance(b.d)));
    return { aVoir, reste };
  }

  function renderAVoirSuivi(aVoir) {
    if (!aVoir.length) return '';
    const lignes = aVoir.map(({ d, s }) => `
      <tr class="ligne-resume${dossierOuvert === d.id ? ' ligne-active' : ''}" onclick="ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')">
        ${celluleDateProchaineEcheance(d)}
        <td><div class="dossier-nom-tableau">${escapeHtml(libelleDossierAffiche(d))}</div>
          <div class="a-voir-signaux">${s.map(x => `<span class="dot-label ${x.cle === 'fonds' ? 'dl-success' : 'dl-urgent notif-nouveau-tag'}"><span class="dot"></span>${escapeHtml(x.texte)}</span>`).join('')}</div></td>
        ${celluleTypeProchaineEcheance(d)}
        <td class="dossier-responsable-tableau">${pastilleCollaborateur(d.responsable)}</td>
        <td>${renderBadgeStatut(d)}</td>
      </tr>`).join('');
    return `
      <section class="semaine-groupe a-voir">
        <div class="semaine-entete">
          <span class="section-eyebrow">Nouveau ${infoBulle('Dossiers avec du nouveau : offre de prêt ou pièce trouvée depuis la dernière ouverture de la fiche, fonds tous reçus sans confirmation au client, ou donnée qu’Authentic a changée (mise à jour à décider sur la fiche). Ils reprennent leur place dès que la fiche est ouverte (ou la réception confirmée).')}</span>
          <span class="semaine-compteur">${aVoir.length} dossier${aVoir.length > 1 ? 's' : ''}</span>
        </div>
        <div class="table-scroll">
          <table class="dossiers-table echeances-table a-voir-table">
            ${COLGROUP_SUIVI}
            ${ENTETE_SUIVI}
            <tbody>${lignes}</tbody>
          </table>
        </div>
      </section>`;
  }

  // Colonnes des tableaux du Suivi (étude, 01/10 : « Date, Dossier, Échéance, Collab, Statut — la
  // même pour Échéances et Tableau ») : un seul jeu de largeurs et de titres pour la vue Tableau, la
  // section « Nouveau », les semaines et les archivés, pour que les colonnes s'alignent partout.
  var COLGROUP_SUIVI = '<colgroup><col class="col-echeance-date"><col><col class="col-echeance-type"><col class="col-echeance-resp"><col class="col-echeance-statut"></colgroup>';
  var ENTETE_SUIVI = '<thead><tr><th>Date</th><th>Dossier</th><th>Échéance</th><th title="Responsable">Resp.</th><th>Statut</th></tr></thead>';

  // Date et libellé de la prochaine échéance en attente (prochaineEcheanceDetail), en deux cellules,
  // comme une ligne de la vue Échéances : la date en rouge à 3 jours ou moins (et une fois passée).
  // Pure : la date affichée est celle de la signature (étape « Signature de l'acte », ou date du
  // rendez-vous placé) d'un dossier « Complet » ou « Prêt » → en vert (étude, 02/10).
  function dateSignatureEnVert(d, echeance) {
    if (!d || !echeance || !echeance.iso) return false;
    const estSignature = echeance.type === 'rendezVousSignature' || (!!d.rendezVousSignature && echeance.iso === d.rendezVousSignature);
    if (!estSignature) return false;
    const cle = etatDossier(d).cle;
    return cle === 'complet' || cle === 'pret';
  }

  // Classe de la date d'une échéance dans le Suivi : vert (signature d'un dossier complet ou prêt),
  // sinon rouge à 3 jours ou moins, sinon discrète.
  function classeDateEcheanceSuivi(d, echeance, jours) {
    if (dateSignatureEnVert(d, echeance)) return 'signature-ok';
    return jours <= 3 ? 'urgent' : 'calme';
  }

  // Pure : l'acte est-il signé ? — signé dans Authentic (« signé le … »), ou signature marquée faite
  // sur un rendez-vous daté. { iso } (date de signature, '' si inconnue) ou null.
  function signatureFaiteSuivi(d) {
    if (!d) return null;
    // Une succession n'est signée que quand TOUS ses actes le sont (étude 23/10 : notoriété signée, déclaration à venir = pas terminée).
    if (estSuccession(d)) {
      const s = actesSignesSuccession(d);
      return s.complet ? { iso: s.iso, actes: s.libelle } : null;
    }
    const a = d.authentic && d.authentic.acte;
    if (a && a.etat === 'signe') return { iso: a.date || d.rendezVousSignature || '' };
    if (d.echeancesValidees && d.echeancesValidees.rendezVousSignature && d.rendezVousSignature) return { iso: d.rendezVousSignature };
    return null;
  }
  // Pure : la date de signature à retenir pour tout ce qui vient APRÈS la signature (stade de la fiche, questionnaire, archivage,
  // un mot un an après) — signé dans Authentic ou signature cochée (signatureFaiteSuivi, date d'Authentic d'abord), sinon le
  // rendez-vous de signature passé. '' si l'acte n'est pas (encore) signé. Avant le 07/10, chaque écran avait sa règle : un acte
  // signé dans Authentic sans rendez-vous noté sur la fiche était « Signé » dans le Suivi mais jamais pour le questionnaire.
  function dateSignatureDossier(d, aujourdhuiIso) {
    if (!d) return '';
    const s = signatureFaiteSuivi(d);
    if (s && s.iso) return s.iso;
    if (s) return d.rendezVousSignature || '';
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    return d.rendezVousSignature && d.rendezVousSignature < auj ? d.rendezVousSignature : '';
  }

  // Pure : « Signé le 30 septembre 2026 » (étude, 02/10 : à la place de la date dans le Suivi).
  function texteSigneSuivi(signe) {
    return signe && signe.iso ? `Signé le ${formatDateFr(signe.iso)}` : 'Signé';
  }

  function celluleDateProchaineEcheance(d) {
    const signe = signatureFaiteSuivi(d);
    if (signe) return `<td><span class="echeance-jours signature-ok">${escapeHtml(texteSigneSuivi(signe))}</span></td>`;
    const p = prochaineEcheanceDetail(d);
    if (!p) return '<td><span class="echeance-jours calme">—</span></td>';
    return `<td><span class="echeance-jours ${classeDateEcheanceSuivi(d, p, p.jours)}" title="${escapeAttr(p.jours < 0 ? 'Dépassée' : p.jours === 0 ? "Aujourd'hui" : 'J-' + p.jours)}">${formatDateFr(p.iso)}</span></td>`;
  }
  function celluleTypeProchaineEcheance(d) {
    const signe = signatureFaiteSuivi(d);
    if (signe) return `<td><span class="dot-label dl-success"><span class="dot"></span>${escapeHtml(signe.actes ? `${signe.actes} signé${/\+/.test(signe.actes) ? 's' : ''}` : 'Acte signé')}</span></td>`;
    const p = prochaineEcheanceDetail(d);
    if (!p) return '<td><span class="echeance-jours calme">—</span></td>';
    return `<td><span class="dot-label dl-${p.type}"><span class="dot"></span>${escapeHtml(p.label)}</span></td>`;
  }

  function renderLigneTableau(d) {
    return `
      <tr class="ligne-resume${d.archive ? ' est-archive' : ''}${dossierOuvert === d.id ? ' ligne-active' : ''}" onclick="ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')">
        ${celluleDateProchaineEcheance(d)}
        <td><div class="dossier-nom-tableau">${escapeHtml(libelleDossierAffiche(d))}${tagNotificationsDossier(d)}</div></td>
        ${celluleTypeProchaineEcheance(d)}
        <td class="dossier-responsable-tableau">${pastilleCollaborateur(d.responsable)}</td>
        <td>${renderBadgeStatut(d)}</td>
      </tr>
    `;
  }

  // Dossiers archivés dans la vue « Échéances » (étude, 30/09 : « permettre de les voir dans la
  // partie échéances pour s'y référer si besoin — aujourd'hui on est obligé de passer par la vue
  // tableau ») : un archivé n'a plus d'échéance en attente, il n'entrait donc dans aucune semaine.
  // Il vient dans une section « Archivés » en bas, quand la case « Archivés » est cochée, repéré par
  // sa date de signature (sinon celle de l'archivage). Pures et testables.
  function dateArchivageDossier(d) {
    let iso = '';
    for (const h of (d && d.historique) || []) {
      if (!h || !h.date || !/^Dossier archivé/.test(h.texte || '')) continue;
      const jour = isoLocalDepuisDate(h.date);
      if (jour && jour > iso) iso = jour;
    }
    return iso;
  }
  function repereArchiveSuivi(d) {
    const signe = signatureFaiteSuivi(d);
    if (signe) return { iso: signe.iso, type: 'rendezVousSignature', label: 'Signé', signe };
    if (d.rendezVousSignature) return { iso: d.rendezVousSignature, type: 'rendezVousSignature', label: 'Signé' };
    const iso = dateArchivageDossier(d);
    return { iso, type: 'archive', label: 'Archivé' };
  }
  // Les plus récents d'abord ; un archivé sans aucune date reste listé, en dernier.
  function archivesPourEcheances(liste) {
    return (liste || []).filter(d => d && d.archive)
      .map(d => ({ dossier: d, repere: repereArchiveSuivi(d) }))
      .sort((a, b) => (b.repere.iso || '').localeCompare(a.repere.iso || '') || String(a.dossier.nom || '').localeCompare(String(b.dossier.nom || ''), 'fr'));
  }

  function renderArchivesSemaines(liste, avecEntete) {
    const items = archivesPourEcheances(liste);
    if (!items.length) return '';
    const lignes = items.map(({ dossier: d, repere: r }) => `
          <tr class="ligne-resume est-archive${dossierOuvert === d.id ? ' ligne-active' : ''}" onclick="ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')">
            <td>${r.signe ? `<span class="echeance-jours signature-ok">${escapeHtml(texteSigneSuivi(r.signe))}</span>` : `<span class="echeance-jours calme">${r.iso ? formatDateFr(r.iso) : '—'}</span>`}</td>
            <td><div class="dossier-nom-tableau">${escapeHtml(libelleDossierAffiche(d))}</div></td>
            <td>${r.type === 'archive' ? `<span class="dot-label dl-neutre">${icone('lock')}${escapeHtml(r.label)}</span>` : `<span class="dot-label dl-${r.type}"><span class="dot"></span>${escapeHtml(r.label)}</span>`}</td>
            <td class="dossier-responsable-tableau">${pastilleCollaborateur(d.responsable)}</td>
            <td>${renderBadgeStatut(d)}</td>
          </tr>`).join('');
    const n = items.length;
    return `
        <section class="semaine-groupe semaine-archives">
          <div class="semaine-entete">
            <span class="section-eyebrow">Archivés</span>
            <span class="semaine-compteur">${n} dossier${n > 1 ? 's' : ''}</span>
          </div>
          <div class="table-scroll">
            <table class="dossiers-table echeances-table">
              ${COLGROUP_SUIVI}
              ${avecEntete ? ENTETE_SUIVI : ''}
              <tbody>${lignes}</tbody>
            </table>
          </div>
        </section>`;
  }

  // Vue "Échéances" du Suivi : les mêmes dossiers (mêmes filtres, même recherche, même tiroir au
  // clic), regroupés par semaine. UNE ligne par dossier — sa prochaine échéance en attente, pas
  // toutes ses dates — voir grouperEcheancesParSemaine().
  // Le statut (état général du dossier, etatDossier) a sa colonne : il ne répète pas l'échéance.
  function renderVueSemaines(liste) {
    const aujourdHui = isoAujourdHui();
    const groupes = grouperEcheancesParSemaine(liste, aujourdHui);
    if (groupes.length === 0) {
      return '<div class="empty-state">Aucune échéance en attente sur les dossiers affichés.</div>';
    }
    return groupes.map((g, indexGroupe) => {
      const lignes = g.items.map(({ dossier: d, echeance: e }) => {
        if (!e) return renderLigneTableau(d);
        const jours = joursRestants(e.iso);
        return `
          <tr class="ligne-resume${d.archive ? ' est-archive' : ''}${dossierOuvert === d.id ? ' ligne-active' : ''}" onclick="ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')">
            <td><span class="echeance-jours ${classeDateEcheanceSuivi(d, e, jours)}">${formatDateFr(e.iso)}</span></td>
            <td><div class="dossier-nom-tableau">${escapeHtml(libelleDossierAffiche(d))}${tagNotificationsDossier(d)}</div></td>
            <td><span class="dot-label dl-${e.type}"><span class="dot"></span>${escapeHtml(e.label)}</span></td>
            <td class="dossier-responsable-tableau">${pastilleCollaborateur(d.responsable)}</td>
            <td>${renderBadgeStatut(d)}</td>
          </tr>`;
      }).join('');
      const n = g.items.length;
      return `
        <section class="semaine-groupe${g.cle === 'retard' ? ' semaine-retard' : ''}">
          <div class="semaine-entete">
            <span class="section-eyebrow">${escapeHtml(libelleSemaine(g, aujourdHui))}</span>
            <span class="semaine-compteur">${n} ${g.cle === 'sans-date' || g.cle === 'signes' ? 'dossier' : 'échéance'}${n > 1 ? 's' : ''}</span>
          </div>
          <div class="table-scroll">
            <!-- Largeurs de colonnes FIXES et identiques d'un groupe à l'autre : chaque semaine est
                 un <table> distinct, et en largeur automatique chacun se calait sur son propre
                 contenu — une date ou un libellé plus long dans une semaine décalait toute la
                 colonne par rapport aux semaines voisines (signalé par l'étude). -->
            <table class="dossiers-table echeances-table">
              ${COLGROUP_SUIVI}
              ${indexGroupe === 0 ? ENTETE_SUIVI : ''}
              <tbody>${lignes}</tbody>
            </table>
          </div>
        </section>`;
    }).join('');
  }

  // Date du jour au format ISO. Isolée ici pour que les fonctions de regroupement, elles, restent
  // pures (la date leur est passée en paramètre) et donc testables à date fixe.
  function isoAujourdHui() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function definirVueSuivi(vue) {
    vueSuivi = vue === 'semaines' || vue === 'taches' ? vue : 'tableau';
    document.getElementById('vue-btn-tableau').classList.toggle('actif', vueSuivi === 'tableau');
    document.getElementById('vue-btn-semaines').classList.toggle('actif', vueSuivi === 'semaines');
    const boutonTaches = document.getElementById('vue-btn-taches');
    if (boutonTaches) boutonTaches.classList.toggle('actif', vueSuivi === 'taches');
    const tri = document.getElementById('tri-dossiers-bloc');
    if (tri) tri.style.display = vueSuivi === 'tableau' ? '' : 'none';
    render();
  }

  // Les deux passent par render() plutôt que par renderDrawer() seul : la liste doit se redessiner
  // pour poser (ou retirer) le liseré .ligne-active sur la ligne concernée, et render() rafraîchit
  // le tiroir au passage.
  function ouvrirDossierDrawer(id) {
    // Passer d'une fiche à une autre (onglets) vaut fermeture pour la première : ses notifications sont vues.
    if (dossierOuvert && dossierOuvert !== id) marquerNotificationsVuesDossier(dossierOuvert);
    dossierOuvert = id;
    noterOngletDossier(id);   // un onglet par fiche ouverte (client/60-onglets-travail.js)
    noterDossierConsulte(id);
    // Dossiers d'Authentic relevés récemment, pour « Tout reprendre d'Authentic » du panneau de la fiche (étude 06/10, 19/10).
    chargerGroupesAuthenticFiche();
    // La fiche s'ouvre sur ses échéances, sauf s'il y a du nouveau : on arrive alors directement
    // sur les pièces trouvées depuis le dernier passage.
    const d = dossiers.find(x => x.id === id);
    const notifs = (d && d.piecesNotifications) || [];
    ongletFiche = notifs.some(c => c !== CLE_NOTIF_OFFRE_PRET) && d.roleNotaire !== 'participant' ? 'pieces' : 'tableau';
    ajoutEcheanceOuvert = false;
    ajoutPieceOuvert = false;
    ajoutEngagementOuvert = false;
    piecesToutesVisibles = false;
    engagementEnEdition = null;
    diagnosticParcoursOuvert = false;
    authenticDossierOuvert = false;
    rdvAgendaOuvert = false;
    render();
    if (d && !d.archive && !d.prixMobilier && !d.mobilierLuLe && d.dossierLie && d.nasDossier) lireMobilierDepuisAvantContrat(id, false);
    // Avant-contrat du dossier relié : retrouvé seul, son nom s'affiche sans clic sur « Ouvrir ».
    if (d) retrouverCompromisSilencieux(id);
    // Droits de préemption : lus à l'ajout, relus si la commune, les parcelles ou la nature du bien ont changé depuis.
    if (preemptionAutoAFaire(d)) analyserPreemptionDossier(id);
    // Succession : la réponse du FCDDV trouvée sur le NAS est lue seule (client/74).
    lireFcddvSiNouveau(d);
    releverFacturesNasSuccession(d); // factures déposées à la main dans « Factures à régler » (étude 20/10)
  }

  // Un clic sur le fond grisé d'une fenêtre la ferme — seulement si l'appui A COMMENCÉ sur ce fond.
  // Sélectionner un email ou un téléphone dans la fiche en glissant la souris jusqu'au fond donne au
  // navigateur un « clic » sur le fond (ancêtre commun de l'appui et du relâcher) : la fiche se
  // fermait (étude, 02/10).
  let cibleAppuiFond = null;
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('pointerdown', (e) => { cibleAppuiFond = e.target; }, true);
  }
  function clicSurFond(e) {
    return !!e && e.target === e.currentTarget && cibleAppuiFond === e.currentTarget;
  }

  function marquerNotificationsVuesDossier(id) {
    const d = dossiers.find(x => x.id === id);
    if (d && (d.piecesNotifications || []).length) {
      d.piecesNotifications = [];
      sauvegarder(d);
    }
  }

  function fermerDossierDrawer() {
    if (!dossierOuvert) return;
    // "Une fois vu, désactiver la notification" (demandé par l'étude) : on la retire à la
    // FERMETURE, pas à l'ouverture — sinon le tag "Nouveau"/le tiroir n'auraient jamais eu
    // l'occasion de s'afficher, la pièce venant d'être marquée vue avant même le premier rendu.
    marquerNotificationsVuesDossier(dossierOuvert);
    dossierOuvert = null;
    finFicheACote();
    ajoutEcheanceOuvert = false;
    ajoutPieceOuvert = false;
    ajoutEngagementOuvert = false;
    piecesToutesVisibles = false;
    engagementEnEdition = null;
    diagnosticParcoursOuvert = false;
    authenticDossierOuvert = false;
    rdvAgendaOuvert = false;
    render();
  }

  // Reconstruit le contenu du tiroir depuis l'état courant. Appelée par render() (pour que toute
  // action menée DANS la fiche — renommer, corriger une date, revérifier — se répercute sans
  // refermer le tiroir) autant que par l'ouverture/fermeture elles-mêmes. Un dossier supprimé ou
  // devenu invisible pendant qu'il était ouvert referme le tiroir plutôt que d'afficher un vide.
  let dossierRenduDansTiroir = null;
  let defilementAvantFiche = 0;
  function renderDrawer() {
    const overlay = document.getElementById('dossier-drawer-overlay');
    const contenu = document.getElementById('dossier-drawer-contenu');
    if (!overlay || !contenu) return;
    // Une carte du tableau est en train d'être glissée : redessiner la fiche l'annulerait. On le fait dès le dépôt (voir dragend).
    if (typeof carteGlisseeFiche !== 'undefined' && carteGlisseeFiche) { redessinerApresGlisserFiche = true; return; }

    const d = dossierOuvert ? dossiers.find(x => x.id === dossierOuvert) : null;
    const etaitEnPage = document.body.classList.contains('fiche-en-page');
    // Fiche « à côté » (étude 11/10, client/60-onglets-travail.js) : ancrée à droite de l'écran courant, qui reste visible.
    const aCote = ficheACoteActive();
    if (!d) {
      dossierOuvert = null;
      dossierRenduDansTiroir = null;
      overlay.style.display = 'none';
      document.body.classList.remove('fiche-en-page', 'fiche-a-cote');
      finFicheACote();
      contenu.innerHTML = '';
      majClassesImpressionEcran();
      renderOngletsTravail();
      // Retour à l'écran d'avant, à la place où on l'avait laissé (la ligne du Suivi qu'on venait d'ouvrir).
      if (etaitEnPage) { const y = defilementAvantFiche; requestAnimationFrame(() => window.scrollTo(0, y)); }
      return;
    }
    // La fiche s'affiche en page à la place de l'écran courant (étude 11/10, onglets) : plus de tiroir sur fond grisé.
    // Le défilement de la page est gardé quand render() reconstruit la même fiche ; une autre fiche s'ouvre en haut.
    if (!etaitEnPage && !aCote) defilementAvantFiche = window.scrollY || 0;
    const autreFiche = dossierRenduDansTiroir !== d.id;
    // Saisie en cours dans la fiche : elle n'est pas reconstruite sous les doigts (audit 12/10 : frappe perdue, « + Personne »
    // perdu, écriture sur la mauvaise personne) — redessinée un peu après la sortie du champ, le temps qu'un clic aboutisse.
    const actif = document.activeElement;
    // Entrée ou Échap vient de valider ou d'annuler le champ : la fiche se redessine tout de suite (relecture 12/10 : l'éditeur
    // restait ouvert sur l'ancienne valeur).
    if (!autreFiche && actif && (Date.now() - toucheValidationFicheLe > 400 || actif.tagName === 'TEXTAREA' || actif.isContentEditable) && contenu.contains(actif) && actif.matches && actif.matches('textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])')) {
      if (!renduFicheDiffere) {
        renduFicheDiffere = true;
        actif.addEventListener('blur', () => setTimeout(() => { renduFicheDiffere = false; render(); }, 250), { once: true });
      }
      return;
    }
    dossierRenduDansTiroir = d.id;
    const panneau = document.getElementById('dossier-drawer');
    // À côté, la fiche défile dans son volet : on garde sa position quand render() la reconstruit.
    const defilementVolet = panneau && aCote && !autreFiche ? (etaitEnPage ? window.scrollY : panneau.scrollTop) : 0;
    if (panneau) panneau.classList.add('large');
    contenu.innerHTML = renderCarteDossier(d);
    if (panneau) panneau.scrollTop = defilementVolet;
    overlay.style.display = 'flex';
    document.body.classList.toggle('fiche-en-page', !aCote);
    document.body.classList.toggle('fiche-a-cote', aCote);
    majClassesImpressionEcran();
    if (aCote) {
      // On vient de la pleine page : l'écran d'en dessous revient à sa place.
      if (etaitEnPage) { const y = defilementAvantFiche; requestAnimationFrame(() => window.scrollTo(0, y)); }
    } else if (!etaitEnPage || autreFiche) window.scrollTo(0, 0);
    renderOngletsTravail();
  }

  var renduFicheDiffere = false;
  var toucheValidationFicheLe = 0;
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') toucheValidationFicheLe = Date.now(); }, true);
  }

  function libellePiece(statut) {
    if (statut === 'recue') return { texte: '✓', cls: 'recue', titre: 'Pièce reçue' };
    if (statut === 'manquante') return { texte: '✕', cls: 'manquante', titre: 'Pièce manquante' };
    return { texte: '?', cls: 'inconnu', titre: "Pas encore vérifié — reliez un dossier local et cliquez sur \"Revérifier les pièces\"" };
  }

  // Formulaire d'ajout d'une pièce personnalisée à la checklist (voir renderAjoutPiece) : même
  // principe qu'ajoutEcheanceOuvert pour les échéances — un seul dossier ouvert à la fois dans le
  // tiroir, un simple booléen suffit, remis à false à chaque ouverture/fermeture.
  let ajoutPieceOuvert = false;
  // Liste de pièces repliée au-delà de MAX_PIECES_VISIBLES lignes (« Voir les N autres ») ; remise
  // à false à chaque ouverture/fermeture du tiroir, comme ajoutPieceOuvert.
  let piecesToutesVisibles = false;
  var MAX_PIECES_VISIBLES = 8;

  // Formulaire d'ajout d'une obligation du vendeur sur une fiche déjà enregistrée (voir
  // renderAjoutEngagement) : même principe que ajoutEcheanceOuvert/ajoutPieceOuvert.
  let ajoutEngagementOuvert = false;
  let diagnosticParcoursOuvert = false;
  // Formulaire de création du rendez-vous de signature dans l'agenda Outlook (voir
  // renderLigneCreerRdvAgenda) : même principe qu'ajoutEcheanceOuvert.
  let rdvAgendaOuvert = false;

  // Édition d'un engagement du vendeur déjà présent (import OU fiche enregistrée) : un seul
  // engagement en édition à la fois (dossierId null = pendant l'import, sur
  // analyseJuridiqueActuelle ; dossierId fourni = fiche enregistrée, sur d.analyseJuridique) —
  // demandé par l'étude pour corriger une clause ajoutée via l'option de surlignage sans devoir la
  // supprimer puis la ressaisir entièrement.
  let engagementEnEdition = null;

  // Détail du dernier parcours du dossier local par dossier (voir verifierDossierLocal), pour un
  // panneau de diagnostic repliable sur la fiche (renderDiagnosticParcours) — demandé après une
  // série de bugs invisibles à l'œil (accents en Unicode NFD, ordre de parcours en profondeur...)
  // qui ont chacun nécessité une relecture complète du code pour être compris : un même panneau,
  // visible directement dans l'outil, permettrait à l'étude de voir elle-même QUELS fichiers ont
  // été lus et POURQUOI une pièce reste "manquante" (jamais rencontrée vs. rencontrée mais aucun
  // nom ne correspond), avant de solliciter un nouveau diagnostic. Volontairement **en mémoire
  // seulement** (pas dans localStorage) : c'est une aide ponctuelle sur le tout dernier parcours,
  // pas une donnée du dossier à conserver d'une session à l'autre — perdu au rechargement de la
  // page, comme `pdfActuel` pendant un import. Clé = id du dossier, valeur = objet diagnostic
  // construit par verifierDossierLocal().
  let dernierDiagnosticParcours = {};

  // Checklist de constitution du dossier (voir CLAUDE.md) : contrairement à l'analyse juridique
  // (déduite des clauses du compromis), c'est une liste fixe déterminée par le type de vente, pas
  // une extraction — un dossier peut très bien n'avoir aucune pièce reconnue sans que ce soit une
  // anomalie tant qu'il n'a pas été relié à un dossier local (statut "inconnu", pas "manquante").
  // Personnalisable pour CE dossier (voir checklistPieces) : une pièce standard non pertinente peut
  // être retirée, une pièce propre au dossier peut être ajoutée — demandé par l'étude plutôt que de
  // subir la liste standard telle quelle dans les cas particuliers.
  // Présentation en liste à cocher (demandée par l'étude à partir d'une maquette « sous-tâches ») :
  // un en-tête avec le compteur et une barre de progression, une ligne par pièce avec sa case,
  // « Voir les N autres », et l'ajout d'une pièce en pied de carte.
  // La CASE est le geste principal, et elle suit le même sens partout : cocher = « reçue ».
  //   - pièce standard en attente → cocher la marque reçue à la main (validerPieceManuellement) ;
  //   - pièce standard validée à la main → décocher retire cette validation ;
  //   - pièce standard trouvée sur le NAS → décocher la réinitialise (reinitialiserStatutPieceStandard,
  //     comme « Réinitialiser » au survol : mauvaise correspondance, fichier renommé) ;
  //   - pièce personnalisée → la case fait défiler son statut (à vérifier → manquante → reçue).
  // Le NOM d'une pièce reçue avec un fichier ouvre ce fichier.
  function renderPiecesDossier(d) {
    const checklist = checklistPieces(d.typeVente, d);
    const pieces = d.pieces || {};
    const nbRecues = checklist.filter(p => pieces[p.cle] === 'recue').length;
    const total = checklist.length;
    const complet = total > 0 && nbRecues === total;
    const pct = total ? Math.round(nbRecues / total * 100) : 0;
    const libelleType = estSuccession(d) ? 'succession' : d.typeVente === 'copropriete' ? 'copropriété' : d.typeVente === 'terrain' ? 'terrain à bâtir' : d.typeVente === 'terre' ? 'terre agricole / terrain non bâti' : 'maison';
    const notifs = d.piecesNotifications || [];
    // Ordre de la checklist conservé : une pièce ne change jamais de place quand on la coche.
    // Repliée, la liste ne cache que des pièces DÉJÀ REÇUES (et pas nouvelles) au-delà des
    // MAX_PIECES_VISIBLES premières lignes : une pièce à réclamer reste toujours visible.
    const ordonnees = checklist;
    const visibles = piecesToutesVisibles ? ordonnees
      : ordonnees.filter((p, i) => i < MAX_PIECES_VISIBLES || pieces[p.cle] !== 'recue' || notifs.includes(p.cle));
    const cachees = ordonnees.length - visibles.length;

    const ligne = (p) => {
      const statut = pieces[p.cle] || 'inconnu';
      const s = libellePiece(statut);
      const recue = statut === 'recue';
      const valideeMain = !p.personnalisee && (d.piecesValideesManuellement || []).includes(p.cle);
      const label = escapeAttr(p.label);
      const arg = escapeOnclickArg(p.label);
      let caseAction;
      let caseTitre = s.titre;
      if (p.personnalisee) {
        caseAction = `basculerStatutPiecePersonnalisee('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.cle)}')`;
        caseTitre = `${s.titre} — cliquer pour changer le statut`;
      } else if (valideeMain) {
        caseAction = `retirerValidationManuellePiece('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.cle)}', '${arg}')`;
        caseTitre = 'Reçue (validée à la main) — cliquer pour retirer la validation';
      } else if (!recue) {
        caseAction = `validerPieceManuellement('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.cle)}', '${arg}')`;
        caseTitre = `${statut === 'manquante' ? 'Introuvable dans le dossier du NAS' : s.titre} — cliquer pour la marquer reçue (document détenu hors du NAS)`;
      } else {
        // Trouvée sur le NAS : décocher = réinitialiser (bonne pièce mal reconnue, fichier renommé) ;
        // elle repart « manquante » et se recoche alors à la main si besoin (étude 05/10 : « cochables et décochables »).
        caseAction = `reinitialiserStatutPieceStandard('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.cle)}', '${arg}')`;
        caseTitre = 'Reçue — trouvée dans le dossier du NAS — cliquer pour la décocher (réinitialiser)';
      }
      const coche = recue ? icone('check') : (statut === 'manquante' && p.personnalisee ? icone('x') : '');
      const caseHtml = `<button type="button" class="piece-case" role="checkbox" aria-checked="${recue}" aria-label="${label}" title="${escapeAttr(caseTitre)}" onclick="piecesToutesVisibles = true; ${caseAction}">${coche}</button>`;
      const ouvrable = recue && !valideeMain;
      const titreNom = p.autoEngagement && !recue ? ' title="Relevée dans les engagements du vendeur de l’avant-contrat."' : '';
      const nom = ouvrable
        ? `<button type="button" class="piece-nom piece-nom-lien" title="Ouvrir le fichier trouvé" onclick="ouvrirPieceTrouvee('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.cle)}')">${escapeHtml(p.label)}</button>`
        : `<span class="piece-nom"${titreNom}>${escapeHtml(p.label)}</span>`;
      const tags = (notifs.includes(p.cle) ? '<span class="dot-label dl-urgent notif-nouveau-tag">Nouveau</span>' : '')
        + (valideeMain ? `<span class="piece-tag">${(d.piecesAuthentic || []).includes(p.cle) ? 'dans Authentic' : 'à la main'}</span>` : '')
        + (() => { const e = etatAuthenticPiece(d, p); return e && e.texte ? `<span class="piece-tag piece-tag-long${e.classe ? ' ' + e.classe : ''}">${escapeHtml(e.texte)}</span>` : ''; })()
        + (/safer/i.test(p.label) ? renderDelaiSafer(d) : '');
      const reinit = (!p.personnalisee && !valideeMain && recue)
        ? `<button type="button" class="piece-action" onclick="reinitialiserStatutPieceStandard('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.cle)}', '${arg}')" title="Réinitialiser (mauvaise correspondance ou fichier renommé)" aria-label="Réinitialiser le statut de cette pièce">${icone('rotate-ccw')}</button>`
        : '';
      const suppr = `<button type="button" class="piece-action piece-action-suppr" onclick="${p.personnalisee ? `supprimerPiecePersonnalisee('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.cle)}')` : `retirerPieceStandard('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.cle)}', '${arg}')`}" title="Retirer cette pièce de la checklist de ce dossier" aria-label="Retirer cette pièce">${icone('x')}</button>`;
      return `<li class="piece-ligne ${s.cls}${valideeMain ? ' validee-main' : ''}">${caseHtml}<span class="piece-libelle">${nom}${tags}</span><span class="piece-actions">${reinit}${suppr}</span></li>`;
    };

    return `
      <div class="pieces-dossier">
        <div class="pieces-entete">
          <div class="pieces-entete-ligne">
            <span class="pieces-titre">${icone('list-check')}<span class="pieces-titre-texte">Pièces du dossier</span><span class="pieces-type">· ${libelleType}</span></span>
            ${d.dossierLie && !d.archive ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="verifierDossierLocalDepuisBouton('${escapeOnclickArg(d.id)}', this)" title="Relire le dossier du NAS">${icone('rotate-ccw')} Revérifier</wa-button>` : ''}
            <span class="pieces-compteur${complet ? ' complet' : ''}">${nbRecues}/${total}</span>
          </div>
          <div class="pieces-barre${complet ? ' complet' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${nbRecues}" aria-label="Pièces reçues"><span style="width:${pct}%"></span></div>
        </div>
        ${total ? `<ul class="pieces-liste${estSuccession(d) ? '' : ' pieces-3col'}">${visibles.map(ligne).join('')}</ul>` : '<p class="fiche-vide pieces-vide">Aucune pièce attendue pour ce dossier.</p>'}
        ${cachees > 0 ? `<button type="button" class="pieces-voir-plus" onclick="piecesToutesVisibles = true; render();">Voir les ${cachees} autre${cachees > 1 ? 's' : ''} (reçue${cachees > 1 ? 's' : ''})</button>`
          : (piecesToutesVisibles && ordonnees.some((p, i) => i >= MAX_PIECES_VISIBLES && pieces[p.cle] === 'recue' && !notifs.includes(p.cle)) ? `<button type="button" class="pieces-voir-plus" onclick="piecesToutesVisibles = false; render();">Voir moins</button>` : '')}
        ${renderAjoutPiece(d)}
      </div>
    `;
  }

  // Pure : « notifiée le 12/09/2026, prise en compte le 15/09/2026 » (Réponse SAFER, onglet Pièces).
  function suiviSaferPiece(d) {
    const sa = d && d.authentic && d.authentic.safer;
    if (!sa) return '';
    const echeance = echeanceSaferTacite(sa);
    const envoi = sa.envoyeeLe || sa.priseEnCompteLe || sa.notifieeLe;
    const pec = sa.envoyeeLe && sa.priseEnCompteLe && sa.priseEnCompteLe !== sa.envoyeeLe ? sa.priseEnCompteLe : '';
    return [envoi ? `envoyée le ${formatDateFr(envoi)}` : 'envoyée',
      pec ? `prise en compte le ${formatDateFr(pec)}` : (sa.priseEnCompte ? 'prise en compte' : ''),
      sa.decision === 'non_preemption' ? `non-préemption${sa.tacite ? ' (délai écoulé)' : ''}${sa.decisionLe ? ` le ${formatDateFr(sa.decisionLe)}` : ''}`
        : sa.decision === 'preemption' ? 'préemption exercée'
          : (echeance ? `sans réponse : non-préemption le ${formatDateFr(echeance)} (${DELAIS_SAFER[delaiSafer(sa)].libelle})` : '')]
      .filter(Boolean).join(', ');
  }

  // Pure : ce qu'Authentic dit d'une pièce de l'onglet Pièces (sous son nom) — état Comedec d'un
  // acte d'état civil, demande envoyée d'une pièce d'urbanisme, suivi SAFER. { texte, classe } ou null.
  function etatAuthenticPiece(d, p) {
    const a = (d && d.authentic) || {};
    if (/safer/i.test(p.label) && a.safer) return { texte: suiviSaferPiece(d), classe: '' };
    // Succession : actes de naissance et EHF suivis dans Authentic (étude 15/10) — ce qui est revenu, ce qui est attendu.
    if (estSuccession(d) && (p.cle === 'actesNaissance' || p.cle === 'ehf') && !(d.pieces && d.pieces[p.cle] === 'recue')) {
      const ps = piecesSuccessionAuthentic(a);
      if (p.cle === 'actesNaissance' && ps.actesNaissance.total) return { texte: `Authentic : ${ps.actesNaissance.recus}/${ps.actesNaissance.total} revenu${ps.actesNaissance.recus > 1 ? 's' : ''}`, classe: 'dl-pret' };
      if (p.cle === 'ehf' && ps.ehf.envoyeeLe) return { texte: `Réquisition envoyée le ${formatDateFr(ps.ehf.envoyeeLe)}, pas encore revenue`, classe: 'dl-pret' };
    }
    const ec = (a.etatsCivils || {})[p.cle];
    if (ec && (ec.casier || RE_CASIER_AUTHENTIC.test(ec.label || ''))) {
      // Casier judiciaire : le statut d'Authentic (« Absence de condamnation »), jamais « Comedec » ; une condamnation signalée en rouge.
      const st = String(ec.statut || '').trim();
      const n = normaliserPourRecherche(st);
      if (ec.etat === 'attente') return { texte: `Casier judiciaire : ${st || 'demande en cours'}`, classe: 'dl-pret' };
      return { texte: `Casier judiciaire : ${st || (ec.etat === 'negatif' ? 'non délivré' : 'reçu')}`, classe: ec.etat === 'negatif' || (/condamnation/.test(n) && !/absence|neant|aucune|pas de|sans|nul|vierge|negati/.test(n)) ? 'dl-urgent' : '' };
    }
    if (ec) {
      if (ec.etat === 'negatif') return { texte: 'Comedec : négatif — erreur, document non délivré', classe: 'dl-urgent' };
      if (ec.etat === 'attente') return { texte: 'Comedec : pris en compte, en attente', classe: 'dl-pret' };
      return { texte: 'Comedec : positif', classe: '' };
    }
    const dm = (a.demandes || {})[p.cle];
    if (dm && !(d.pieces && d.pieces[p.cle] === 'recue')) {
      return { texte: `${p.cle === 'renonciationPreemption' ? 'DIA envoyée' : 'Demande envoyée'}${dm.date ? ` le ${formatDateFr(dm.date)}` : ''}`, classe: '' };
    }
    return null;
  }

  // Pure : les lignes « Dans Authentic » de l'onglet Pièces — [{ libelle, valeur, classe }].
  function lignesAuthenticDossier(d) {
    const a = (d && d.authentic) || {};
    const lignes = [];
    // Notaire en second (participation) : l'avancement de la rédaction est l'affaire du confrère
    // (étude, 02/10) — seul « Acte signé » est montré.
    if (a.acte && !(d.roleNotaire === 'participant' && a.acte.etat !== 'signe')) lignes.push({ libelle: 'Acte de vente', valeur: a.acte.libelle + (a.acte.date ? ` le ${formatDateFr(a.acte.date)}` : ''), classe: a.acte.etat === 'signe' ? 'dl-success' : a.acte.etat === 'redaction' ? 'dl-pret' : 'dl-neutre' });
    if (a.rhf) lignes.push({ libelle: 'Réquisition hors formalité', valeur: [a.rhf.envoyeeLe ? `envoyée le ${formatDateFr(a.rhf.envoyeeLe)}` : 'envoyée', a.rhf.retourLe ? `retour le ${formatDateFr(a.rhf.retourLe)}` : 'retour attendu'].join(' · '), classe: a.rhf.retourLe ? 'dl-success' : 'dl-pret' });
    if (a.safer) {
      const sa = a.safer;
      lignes.push({ libelle: 'SAFER', valeur: suiviSaferPiece(d), classe: sa.decision === 'non_preemption' ? 'dl-success' : sa.decision === 'preemption' ? 'dl-urgent' : 'dl-pret' });
    }
    if (a.prix) {
      const ecart = Number(d.prixVente) > 0 && Math.abs(Number(d.prixVente) - a.prix) >= 1;
      lignes.push({ libelle: 'Prix (Capital)', valeur: formaterPrix(a.prix) + (ecart ? ` — fiche : ${formaterPrix(d.prixVente)}, à vérifier` : ''), classe: ecart ? 'dl-pret' : '' });
    }
    if (a.collaborateur) {
      const autre = d.responsable && d.responsable !== a.collaborateur;
      lignes.push({ libelle: 'Collaborateur', valeur: a.collaborateur + (autre ? ` — fiche : ${d.responsable}` : ''), classe: autre ? 'dl-pret' : '' });
    }
    (a.personnes || []).filter(p => p.situationMatrimoniale).forEach(p => {
      lignes.push({ libelle: `${p.role === 'VENDEUR' ? 'Vendeur' : 'Acquéreur'} · ${p.nom}`, valeur: libelleSituationMatrimoniale(p.situationMatrimoniale), classe: '' });
    });
    return lignes;
  }

  // Pure : alertes « conjoint » du dossier — parties de l'avant-contrat et personnes vues dans Authentic.
  function alertesConjointDossier(d) {
    const parties = (Array.isArray(d && d.parties) ? d.parties : []).concat((d && d.authentic && d.authentic.personnes) || []);
    const vues = new Set();
    return alertesConjointAuthentic(parties).filter(al => {
      const cle = normaliserPourRecherche(al.partie || '').replace(/[^a-z0-9]+/g, ' ').trim();
      if (vues.has(cle)) return false;
      vues.add(cle);
      return true;
    });
  }

  // En fin d'onglet « Pièces et analyse », replié (étude 07/10 : « à mettre en fin de fiche avec plier déplier ») ; une alerte
  // (conjoint absent) reste dite dans la ligne repliée.
  let authenticDossierOuvert = false;
  function basculerAuthenticDossier(ouvert) { authenticDossierOuvert = !!ouvert; }

  function renderAuthenticDossier(d) {
    const lignes = lignesAuthenticDossier(d);
    const alertes = alertesConjointDossier(d);
    if (!lignes.length && !alertes.length && !(d.piecesAuthentic || []).length && !d.referenceAuthentic) return '';
    const releve = d.authentic && d.authentic.releveLe;
    return `
      <details class="authentic-dossier"${authenticDossierOuvert ? ' open' : ''} ontoggle="basculerAuthenticDossier(this.open)">
        <summary><span class="section-eyebrow">Dans Authentic</span>${releve ? `<span class="hint"> · relevé le ${escapeHtml(formatDateFr(releve.slice(0, 10)))}</span>` : ''}${alertes.length ? ` <span class="dot-label dl-pret"><span class="dot"></span>${alertes.length > 1 ? `${alertes.length} alertes` : '1 alerte'}</span>` : ''}</summary>
        <div class="authentic-dossier-corps">
          <dl class="authentic-infos">${lignes.map(l => `<div class="authentic-info"><dt>${escapeHtml(l.libelle)}</dt><dd>${l.classe
            ? `<span class="dot-label ${l.classe}"><span class="dot"></span>${escapeHtml(l.valeur)}</span>` : escapeHtml(l.valeur)}</dd></div>`).join('')}</dl>
          ${alertes.map(al => `<p class="authentic-alerte"><span class="dot-label dl-pret">${icone('alert-triangle')}${escapeHtml(al.texte)}</span></p>`).join('')}
          <wa-button appearance="plain" size="s" type="button" class="bouton-discret authentic-oublier" onclick="confirmerOublierDonneesAuthentic('${escapeOnclickArg(d.id)}')" title="Oublier ce qui vient d’Authentic (page d’un autre dossier)">${icone('x')} Oublier ce qui vient d’Authentic</wa-button>
        </div>
      </details>`;
  }

  function afficherFormAjoutPiece() {
    ajoutPieceOuvert = true;
    render();
  }

  function masquerFormAjoutPiece() {
    ajoutPieceOuvert = false;
    render();
  }

  function renderAjoutPiece(d) {
    if (!ajoutPieceOuvert) {
      return `<wa-button appearance="outlined" type="button" class="bouton-ajout ajout-piece-btn" onclick="afficherFormAjoutPiece()"><span slot="start" class="bouton-ajout-plus" aria-hidden="true">+</span>Ajouter une pièce</wa-button>`;
    }
    return `
      <div class="ajout-piece-form">
        <input type="text" id="nouvelle-piece-label" placeholder="Nom de la pièce (ex. Attestation de surface loi Carrez)">
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-valider" onclick="ajouterPiecePersonnalisee('${escapeOnclickArg(d.id)}')" title="Ajouter" aria-label="Ajouter la pièce">✓</wa-button>
        <button type="button" class="icon-btn" onclick="masquerFormAjoutPiece()">Annuler</button>
      </div>
    `;
  }

  // Panneau de diagnostic du DERNIER parcours du dossier local (voir dernierDiagnosticParcours,
  // construit par verifierDossierLocal) — répond directement à une série de bugs invisibles à l'œil
  // (accents en Unicode NFD, ordre de parcours en profondeur, pièce personnalisée jamais
  // rerecherchée...) qui ont chacun nécessité une relecture complète du code pour être compris :
  // l'étude peut désormais voir elle-même quels fichiers ont été lus et pourquoi une pièce reste
  // "manquante" (jamais rencontrée vs. rencontrée mais aucun nom ne correspond), avant de solliciter
  // un nouveau diagnostic. Repliable et FERMÉ par défaut (voir .diagnostic-parcours dans style.css) :
  // c'est un outil de dépannage ponctuel, pas un suivi actif comme les pièces/l'analyse juridique.
  // N'affiche rien tant qu'aucun parcours n'a eu lieu depuis l'ouverture de la page (état en
  // mémoire uniquement, jamais persisté — voir dernierDiagnosticParcours).
  // Trace, en lecture seule, de ce que l'extraction avait compris de l'acte au moment de l'import
  // (voir instantaneExtraction). Volontairement REPLIÉ par défaut, contrairement à l'analyse
  // juridique ou aux pièces : ce n'est pas un suivi actif mais une explication à consulter quand
  // une donnée du dossier surprend — « d'où sort cette date ? est-ce que l'outil en était sûr ? ».
  // Rien n'y est modifiable : les corrections se font dans les champs de la fiche, comme avant.
  var LIBELLES_TYPE_ACTE = {
    COMPROMIS_DE_VENTE: 'Compromis de vente',
    PROMESSE_DE_VENTE: 'Promesse de vente',
    PROMESSE_D_ACHAT: 'Promesse d’achat',
    AUTRE: 'Autre acte',
    INCONNU: 'Type non déterminé'
  };

  function renderExtractionDossier(d) {
    const extraction = d.extraction;
    const typeActe = d.typeActe;
    const parties = Array.isArray(d.parties) ? d.parties : [];
    const notaires = d.notaires;
    if (!extraction && !typeActe && parties.length === 0 && !notaires) return '';

    // Même vocabulaire que le panneau d'import (voir origineRevision) : l'outil dit d'où vient la
    // donnée, il ne prétend pas la confirmer. `renseigne` remplace la valeur, qui n'est pas
    // recopiée dans l'instantané — sans lui, tout serait affiché « Non trouvée ».
    const badgeOrigine = (etat) => {
      const o = origineRevision(etat ? Object.assign({}, etat, { valeur: etat.renseigne === false ? null : (etat.valeur || 'x') }) : null);
      return `<span class="dot-label ${o.dl}">${o.icone ? icone(o.icone) : '<span class="dot"></span>'}${escapeHtml(o.texte)}</span>`;
    };
    const blocs = [];

    if (typeActe) {
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Type d’acte</span>
        <span>${escapeHtml(LIBELLES_TYPE_ACTE[typeActe.valeur] || typeActe.valeur)}</span>${badgeOrigine(typeActe)}</div>`);
    }
    if (parties.length > 0) {
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Parties</span>
        <span>${parties.map(p => `${escapeHtml(p.nom)} <em>(${p.role === 'VENDEUR' ? 'vendeur' : 'acquéreur'}${p.qualiteActe ? ', désigné « ' + escapeHtml(p.qualiteActe) + ' »' : ''})</em>${p.societe ? ` <span class="hint">${escapeHtml(libelleIdentiteSociete(p.societe))}</span>` : ''}`).join(' · ')}</span></div>`);
    }
    if (notaires && (notaires.instrumentaire || notaires.participant)) {
      const nom = (n) => n ? `${escapeHtml(n.nom)}${n.office ? ' (' + escapeHtml(n.office) + ')' : ''}` : '—';
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Notaires</span>
        <span>Reçoit l’acte : ${nom(notaires.instrumentaire)}${notaires.participant ? ` · Participant : ${nom(notaires.participant)}` : ''}</span>${badgeOrigine({ statut: notaires.statut, origine: notaires.origine, verifie: notaires.verifie, renseigne: true })}</div>`);
    }
    const cadastre = d.bien && d.bien.cadastre;
    if (cadastre && cadastre.section) {
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Cadastre</span>
        <span>${escapeHtml(libelleCadastre(cadastre))}</span></div>`);
    }
    // Lots de copropriété relevés dans Authentic (06/10) : numéro, type, étage, surface Carrez, tantièmes.
    const lots = d.bien && Array.isArray(d.bien.lots) ? d.bien.lots : [];
    if (lots.length) {
      blocs.push(`<div class="extraction-ligne"><span class="extraction-libelle">Lot${lots.length > 1 ? 's' : ''}</span>
        <span>${lots.map(l => escapeHtml(libelleLotCopropriete(l, d.bien.tantiemesTotal))).join(' · ')}</span></div>`);
    }

    const LIBELLES_CHAMP_EXTRACTION = {
      nom: 'Nom du dossier', prixVente: 'Prix de vente', prixMobilier: 'Mobilier compris dans le prix', emailAcquereur: 'Email de l’acquéreur',
      emailVendeur: 'Email du vendeur', adresseBien: 'Adresse du bien', pret: 'Obtention du prêt', acte: 'Signature de l’acte',
      ventebien: 'Vente préalable', typeVente: 'Type de vente'
    };
    const champs = (extraction && extraction.champs) || {};
    const lignesChamps = Object.keys(champs)
      .filter(cle => LIBELLES_CHAMP_EXTRACTION[cle])
      .map(cle => `<div class="extraction-ligne"><span class="extraction-libelle">${LIBELLES_CHAMP_EXTRACTION[cle]}</span>
        <span>${champs[cle].page ? `p.${champs[cle].page}` : '—'}</span>${badgeOrigine(champs[cle])}</div>`)
      .join('');

    const alertes = ((extraction && extraction.alertes) || []).map(a =>
      `<div class="revision-alerte ${a.gravite === 'critique' ? 'critique' : ''}">${icone('alert-triangle')}<span>${escapeHtml(a.message)}</span></div>`
    ).join('');

    return `
      <details class="extraction-dossier">
        <summary><span class="section-eyebrow">Ce que l’outil avait compris de l’acte</span></summary>
        <div class="extraction-corps">
          ${alertes}
          ${blocs.join('')}
          ${lignesChamps}
          <p class="hint">Relevé à l’import, pour information.</p>
        </div>
      </details>
    `;
  }

  // Bug corrigé : ce panneau se refermait tout seul. `render()` reconstruit le tiroir à chaque
  // action (revérifier une pièce, corriger une date…) et le `<details>` repartait donc fermé, en
  // plein milieu de la lecture du journal. Son état est désormais mémorisé, comme celui du tiroir
  // lui-même (`dossierOuvert`) — un seul dossier étant ouvert à la fois, un booléen suffit.
  // Remis à `false` à l'ouverture/fermeture du tiroir : le diagnostic d'un dossier ne présume pas
  // de l'intérêt qu'on porte à celui du suivant.
  function basculerDiagnosticParcours(ouvert) {
    diagnosticParcoursOuvert = !!ouvert;
  }

  // Fichiers qui correspondaient à une pièce mais ont été écartés par une correction précédente :
  // montrés en tête du diagnostic avec de quoi défaire l'exclusion, parce que c'est EXACTEMENT le
  // cas où une pièce présente sur le NAS reste « manquante » sans raison visible.
  function renderExclusionsDiagnostic(d, diag) {
    const liste = (diag && diag.exclusions) || [];
    if (!liste.length) return '';
    return `<div class="diagnostic-exclusions">
      <p><strong>${liste.length === 1 ? 'Un fichier a été écarté' : `${liste.length} fichiers ont été écartés`} par une correction précédente :</strong></p>
      <ul>${liste.map(e => `<li><span>${escapeHtml(e.fichier)} → « ${escapeHtml(e.label)} »</span>
        <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="retirerExclusionPiece('${escapeOnclickArg(e.cle)}', '${escapeOnclickArg(e.nom)}', '${escapeOnclickArg(d.id)}')">Ne plus écarter</wa-button></li>`).join('')}</ul>
    </div>`;
  }

  function renderDiagnosticParcours(d) {
    const diag = dernierDiagnosticParcours[d.id];
    if (!diag) return '';
    const ouvert = diagnosticParcoursOuvert ? ' open' : '';
    const heure = new Date(diag.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diag.resume.erreur) {
      return `
        <details class="diagnostic-parcours"${ouvert} ontoggle="basculerDiagnosticParcours(this.open)">
          <summary><span class="section-eyebrow">Diagnostic du dernier parcours (${heure})</span></summary>
          <div class="diagnostic-corps"><p class="diagnostic-erreur">${escapeHtml(diag.resume.erreur)}</p></div>
        </details>
      `;
    }
    const r = diag.resume;
    const lignesResume = [];
    lignesResume.push(`${r.nbFichiersRencontres} fichier${r.nbFichiersRencontres > 1 ? 's' : ''} PDF rencontré${r.nbFichiersRencontres > 1 ? 's' : ''} (sous-dossiers compris), ${r.nbAnalyses} ouvert${r.nbAnalyses > 1 ? 's' : ''} pour lire son contenu.`);
    if (r.offre) {
      lignesResume.push(`Offre de prêt : ${!r.offre.trouvee
        ? `aucun PDF d'au moins ${MIN_PAGES_OFFRE_PRET} pages dont le NOM ou le titre de la page de garde évoque une offre de prêt (ou une variante : offre de crédit, contrat de prêt…) — le détail fichier par fichier est ci-dessous.`
        : r.offre.aConfirmer
          ? `page de garde reconnue (${escapeHtml(r.offre.fichier)}), <strong>à confirmer</strong> : le modèle local n'a pas pu la vérifier.`
          : `reconnue et confirmée (${escapeHtml(r.offre.fichier)})`}`);
    }
    if (r.pieces) {
      lignesResume.push(`${r.pieces.trouvees}/${r.pieces.total} pièce(s) reconnue(s)${r.pieces.manquantes.length ? ' — manquante(s) : ' + r.pieces.manquantes.map(escapeHtml).join(', ') + '.' : '.'}`);
    }
    return `
      <details class="diagnostic-parcours"${ouvert} ontoggle="basculerDiagnosticParcours(this.open)">
        <summary><span class="section-eyebrow">Diagnostic du dernier parcours (${heure})</span></summary>
        <div class="diagnostic-corps">
          <ul class="diagnostic-resume">${lignesResume.map(l => `<li>${l}</li>`).join('')}</ul>
          ${renderExclusionsDiagnostic(d, diag)}
          ${diag.journal.length
            ? `<ul class="diagnostic-journal">${diag.journal.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
            : '<p class="diagnostic-vide">Aucune correspondance par nom, ni lecture de contenu, lors de ce parcours.</p>'}
        </div>
      </details>
    `;
  }

  // Ajoutée avec une clé unique générée ici (pas un index de tableau, contrairement à d.autres) :
  // une pièce personnalisée peut être retirée sans décaler le statut des autres, qui restent
  // repérées par leur propre clé stable plutôt que par leur position dans la liste.
  // Cherche, parmi les PDF du dossier NAS relié, le premier dont le nom contient le texte donné
  // (sous-chaîne, insensible à la casse, sur le nom normalisé — voir normaliserNomPourMotif) :
  // utilisée au moment d'ajouter une pièce personnalisée (voir ajouterPiecePersonnalisee), pour ne
  // pas obliger l'étude à écrire un motifNom qu'elle n'a de toute façon pas les moyens d'écrire —
  // le nom qu'elle tape pour la pièce sert directement de motif de recherche. Le texte cherché est
  // normalisé comme les noms auxquels il est comparé : sans ça, un nom de fichier exact contenant
  // des underscores ne matcherait jamais.
  async function chercherFichierParNom(d, texteRecherche) {
    const cible = normaliserNomPourMotif(texteRecherche).toLowerCase();
    const fichiers = await listerFichiersNas(d);
    const exact = fichiers.find(f => normaliserNomPourMotif(f.nom).toLowerCase().includes(cible));
    if (exact) return exact;
    // À défaut, le libellé comme forme tolérante (faute de frappe, mots en plus) — voir
    // correspondFormeNom. Toujours après la correspondance exacte : un nom exact l'emporte.
    return fichiers.find(f => correspondFormeNom(texteRecherche, tokensNomFichier(normaliserNomPourMotif(f.nom)))) || null;
  }

  async function ajouterPiecePersonnalisee(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const input = document.getElementById('nouvelle-piece-label');
    const label = input ? input.value.trim() : '';
    if (!label) { if (input) input.focus(); return; }
    d.piecesPersonnalisees = d.piecesPersonnalisees || [];
    const cle = 'perso-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    d.piecesPersonnalisees.push({ cle, label });
    ajouterHistorique(d, `Pièce ajoutée à la checklist : « ${label} »`);
    ajoutPieceOuvert = false;
    sauvegarder(d);
    render();

    // Recherche automatique dans le dossier NAS déjà relié, s'il y en a un. Plus aucune permission
    // à vérifier depuis que le serveur lit le NAS : si le dossier est relié, il est lisible.
    // Silencieuse en cas d'échec — la pièce reste simplement « à vérifier », cas normal quand on
    // tape un nom avant même d'avoir le document.
    if (d.dossierLie && d.nasDossier) {
      try {
        const trouve = await chercherFichierParNom(d, label);
        if (trouve) {
          d.pieces = d.pieces || {};
          d.pieces[cle] = 'recue';
          memoriserFichierTrouve(d, NAS_CLE_PIECE(cle), cheminNasComplet(d, trouve.chemin));
          sauvegarder(d);
          render();
          afficherToast(`Pi\u00e8ce \u00ab\u00a0${label}\u00a0\u00bb trouv\u00e9e : ${trouve.nom}`, 'OK', null);
        }
      } catch (e) {
        console.error('Recherche automatique de la pièce personnalisée impossible', e);
      }
    }
  }

  function supprimerPiecePersonnalisee(dossierId, cle) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.piecesPersonnalisees) return;
    const item = d.piecesPersonnalisees.find(p => p.cle === cle);
    if (!item) return;
    demanderConfirmation(`Retirer la pièce « ${item.label} » de la checklist de ce dossier ?`, () => {
      d.piecesPersonnalisees = d.piecesPersonnalisees.filter(p => p.cle !== cle);
      if (d.pieces) delete d.pieces[cle];
      d.piecesValideesManuellement = (d.piecesValideesManuellement || []).filter(c => c !== cle);
      ajouterHistorique(d, `Pièce retirée de la checklist : « ${item.label} »`);
      sauvegarder(d);
      render();
    });
  }

  // Signalé par l'étude : une pièce standard reconnue automatiquement (motifNom) par erreur, ou
  // dont le fichier a ensuite été renommé (le vrai document ne correspond alors plus au nom
  // mémorisé), restait bloquée "reçue" indéfiniment — verifierDossierLocal() ne recherche que les
  // pièces PAS déjà "recue" (voir `aChercher`), donc "Revérifier" n'y touchait plus jamais. Remet
  // la pièce à "manquante" (repasse dans `aChercher` au prochain parcours) et efface le handle
  // mémorisé du fichier trouvé à tort (même mécanisme que lierDossierLocal() qui l'efface déjà à
  // chaque nouvelle liaison de dossier) — sans quoi le bouton "ouvrir le fichier trouvé"
  // continuerait de rouvrir l'ancien fichier le temps qu'une nouvelle correspondance soit trouvée.
  // Uniquement pour une pièce à motifNom (reconnue automatiquement) : une pièce personnalisée a
  // déjà son propre cycle de statut au clic (basculerStatutPiecePersonnalisee), pas besoin de ce
  // bouton pour elle.
  function reinitialiserStatutPieceStandard(dossierId, cle, label) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    demanderConfirmation(`Réinitialiser le statut de « ${label} » ? Elle repassera à "manquante" et sera recherchée à nouveau au prochain "Revérifier". Ce nom de fichier ne sera plus jamais proposé pour cette pièce, sur aucun dossier.`, async () => {
      d.pieces = d.pieces || {};
      d.pieces[cle] = 'manquante';
      // Apprentissage de l'erreur (voir exclureNomPourPiece ci-dessus) : avant d'effacer le chemin
      // mémorisé, on retrouve le nom du fichier mal reconnu pour ne plus jamais le reproposer pour
      // CETTE pièce, sur AUCUN dossier — portée choisie explicitement par l'étude, plus large
      // qu'une simple exclusion propre à ce seul dossier.
      const ancienChemin = fichierTrouve(d, NAS_CLE_PIECE(cle));
      if (ancienChemin) {
        exclureNomPourPiece(cle, normaliserNomPourMotif(ancienChemin.split('/').pop()));
      }
      memoriserFichierTrouve(d, NAS_CLE_PIECE(cle), null);
      ajouterHistorique(d, `Pièce réinitialisée (correspondance retirée) : « ${label} »`);
      signalerSiDossierDevenuComplet(d);
      sauvegarder(d);
      render();
    });
  }

  // Validation À LA MAIN d'une pièce standard : l'étude détient le document, mais pas dans le
  // dossier du NAS — il vit dans Authentic (Fichorga), le logiciel métier de l'étude. Cas donné
  // en exemple : une réponse SAFER. Sans ce mécanisme, la pièce restait "manquante" pour toujours,
  // et surtout le contrôle automatique la repassait à "manquante" à chaque tour même après une
  // correction manuelle (voir la désynchronisation dans verifierDossierLocal) — une décision
  // humaine défaite par un scan toutes les cinq minutes.
  // Le drapeau vit dans une LISTE À PART (d.piecesValideesManuellement) plutôt que dans une
  // quatrième valeur de d.pieces : tout ce qui compte les pièces reçues (compteur de la fiche,
  // statutDossier, dossierEntierementComplet, les stats du portefeuille, la checklist du rappel
  // par email côté serveur) teste `=== 'recue'`, et une nouvelle valeur aurait obligé à retoucher
  // chacun de ces endroits — avec la certitude d'en oublier un.
  function validerPieceManuellement(dossierId, cle, label) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    demanderConfirmation(`Marquer « ${label} » comme reçue, en dehors du dossier NAS (Authentic, courrier papier…) ? Le contrôle automatique ne la cherchera plus et ne la repassera jamais en manquante.`, () => {
      d.piecesValideesManuellement = d.piecesValideesManuellement || [];
      if (!d.piecesValideesManuellement.includes(cle)) d.piecesValideesManuellement.push(cle);
      d.pieces = d.pieces || {};
      d.pieces[cle] = 'recue';
      ajouterHistorique(d, `Pièce validée à la main (hors dossier NAS) : « ${label} »`);
      signalerSiDossierDevenuComplet(d);
      sauvegarder(d);
      render();
    });
  }

  // Annule la validation ci-dessus : la pièce redevient une pièce ordinaire, donc cherchée à
  // nouveau sur le NAS au prochain parcours. Elle repart de "manquante" plutôt que de "reçue" —
  // c'est bien le scan, et non cette validation, qui décidera désormais de son sort.
  function retirerValidationManuellePiece(dossierId, cle, label) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    demanderConfirmation(`Retirer la validation manuelle de « ${label} » ? Elle sera de nouveau recherchée dans le dossier NAS au prochain contrôle.`, () => {
      d.piecesValideesManuellement = (d.piecesValideesManuellement || []).filter(c => c !== cle);
      d.pieces = d.pieces || {};
      d.pieces[cle] = 'manquante';
      ajouterHistorique(d, `Validation manuelle retirée : « ${label} »`);
      signalerSiDossierDevenuComplet(d);
      sauvegarder(d);
      render();
    });
  }

  // Une pièce STANDARD ne peut pas être supprimée des listes PIECES_* (partagées par tous les
  // dossiers du même type de vente) : la "retirer" pour ce dossier précis l'ajoute simplement à
  // d.piecesRetirees, qui la masque de checklistPieces() pour ce seul dossier — voir son
  // historique dans CLAUDE.md.
  function retirerPieceStandard(dossierId, cle, label) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    demanderConfirmation(`Retirer la pièce « ${label} » de la checklist de ce dossier ?`, () => {
      d.piecesRetirees = d.piecesRetirees || [];
      if (!d.piecesRetirees.includes(cle)) d.piecesRetirees.push(cle);
      ajouterHistorique(d, `Pièce retirée de la checklist : « ${label} »`);
      signalerSiDossierDevenuComplet(d);
      sauvegarder(d);
      render();
    });
  }

  // Retire un engagement du vendeur de l'analyse juridique d'un dossier DÉJÀ ENREGISTRÉ (voir
  // renderEngagement/renderCarteDossier) — demandé par l'étude : jusqu'ici seuls les engagements
  // ajoutés à la main pendant l'import étaient retirables (supprimerEngagementManuel), et
  // seulement pendant l'import. Confirmation + entrée d'historique, comme retirerPieceStandard()
  // ci-dessus : contrairement à un retrait pendant l'import (réversible en réimportant le PDF),
  // c'est ici une modification d'un dossier déjà sauvegardé.
  function supprimerEngagementDossier(dossierId, index) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.analyseJuridique || !d.analyseJuridique.engagements[index]) return;
    const e = d.analyseJuridique.engagements[index];
    const phrase = typeof e === 'string' ? e : e.phrase;
    demanderConfirmation('Retirer cet engagement du vendeur de l’analyse juridique ?', () => {
      d.analyseJuridique.engagements.splice(index, 1);
      ajouterHistorique(d, `Engagement du vendeur retiré de l'analyse : « ${phrase.slice(0, 80)} »`);
      sauvegarder(d);
      render();
    });
  }

  // Pendant du précédent pour un document identifié (voir renderDocBadge) — nouvelle capacité,
  // rien n'était retirable de cette liste jusqu'ici, ni à l'import ni sur une fiche enregistrée.
  // Volontairement découplé de la checklist de pièces du dossier (d.piecesEngagementsDetectees) :
  // ce n'est qu'une liste d'affichage de l'analyse, pas la checklist elle-même, qui a déjà son
  // propre mécanisme de retrait (retirerPieceStandard()/croix sur .piece-item).
  function supprimerDocumentDossier(dossierId, index) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.analyseJuridique || !d.analyseJuridique.documents[index]) return;
    const doc = d.analyseJuridique.documents[index];
    const label = typeof doc === 'string' ? doc : doc.label;
    demanderConfirmation(`Retirer « ${label} » de la liste des documents identifiés ?`, () => {
      d.analyseJuridique.documents.splice(index, 1);
      ajouterHistorique(d, `Document retiré de l'analyse juridique : « ${label} »`);
      sauvegarder(d);
      render();
    });
  }

  // Cycle inconnu → manquante → reçue → inconnu, sans entrée d'historique (une simple case à
  // cocher répétée n'a pas besoin d'être journalisée, contrairement à un changement structurel du
  // dossier) — seul mécanisme de mise à jour possible pour une pièce personnalisée, qui n'a pas de
  // motifNom permettant une détection automatique dans le dossier local.
  function basculerStatutPiecePersonnalisee(dossierId, cle) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    d.pieces = d.pieces || {};
    const actuel = d.pieces[cle] || 'inconnu';
    d.pieces[cle] = actuel === 'inconnu' ? 'manquante' : actuel === 'manquante' ? 'recue' : 'inconnu';
    // Cochée à la main = décision de l'étude, comme validerPieceManuellement pour une pièce
    // standard : le parcours du NAS ne doit plus la repasser à « manquante » faute d'y trouver un
    // fichier à son nom. Sans ce drapeau, une pièce ajoutée à la main pour un document que le NAS
    // n'a pas (« DECOMPTE de remboursement ECO PRET », signalé par l'étude) se décochait à chaque
    // revérification.
    const validees = (d.piecesValideesManuellement || []).filter(c => c !== cle);
    if (d.pieces[cle] === 'recue') validees.push(cle);
    d.piecesValideesManuellement = validees;
    signalerSiDossierDevenuComplet(d);
    sauvegarder(d);
    render();
  }

  function renderCarteDossier(d) {
      const confiance = d.confiance || {};
      const historique = d.historique || [];
      const analyse = d.analyseJuridique || { documents: [], engagements: [] };
      // "Ouvrir le compromis" et "Changer de dossier"/"Lier un dossier local" reprennent tous les
      // deux le design de "+ Ajouter une pièce" (.action-rapide) — demandé par l'étude, cohérent
      // avec les autres actions rapides de la fiche (Revérifier...) plutôt que l'ancien style de
      // lien souligné (.lien-dossier-local, retiré). Voir ouvrirCompromisTrouve() : contrairement
      // à l'offre/aux pièces, ce document n'est cherché qu'à la demande, pas par
      // verifierDossierLocal() (le compromis n'est pas une pièce de la checklist).
      // L'infobulle nomme le fichier réellement importé à la création : c'est lui qui sera rouvert,
      // et le voir sans cliquer permet de repérer tout de suite un avant-contrat mal rattaché.
      const titreOuvrirCompromis = d.compromisNomFichier
        ? `Ouvrir « ${d.compromisNomFichier} », le fichier importé à la création du dossier`
        : "Rechercher et ouvrir l'avant-contrat dans le dossier NAS relié (aucun nom de fichier mémorisé pour ce dossier)";
      const boutonOuvrirCompromis = `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="ouvrirCompromisTrouve('${escapeOnclickArg(d.id)}', this)" title="${escapeAttr(titreOuvrirCompromis)}">${icone('file-text')} Ouvrir</wa-button>`;
      const boutonDossierNas = d.dossierLie && d.nasDossier
        ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="ouvrirDossierNas('${escapeOnclickArg(d.id)}')" title="Copier l’emplacement du dossier du NAS pour l’ouvrir dans l’Explorateur">${icone('folder')} Dossier NAS</wa-button>` : '';
      // Le nom du dossier NAS relié est affiché dans l'infobulle : le vérifier ne doit pas demander
      // d'ouvrir la fenêtre de choix.
      const boutonsDossierLocal = boutonDossierNas + (d.dossierLie
          ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="changerDossierLocal('${escapeOnclickArg(d.id)}')" title="${escapeAttr('Dossier NAS relié : ' + (d.nasDossier || '—') + ' — cliquez pour en choisir un autre')}">Changer</wa-button>`
          // Même sans prêt (achat comptant), le dossier NAS reste nécessaire pour suivre
          // la checklist de pièces (urbanisme...) — voir renderPiecesDossier ci-dessous.
          : `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="lierDossierLocal('${escapeOnclickArg(d.id)}')" title="Relier ce dossier à son dossier du NAS">${icone('link')} Relier</wa-button>`);
      // Statut de l'offre sous la date de la carte "Obtention du prêt" (voir renderLigneEcheance, paramètre
      // offreBloc). Une puce de couleur plutôt qu'une phrase : le décompte juste au-dessus dit déjà
      // "✓ Offre reçue" en toutes lettres, la puce ne fait que confirmer d'un coup d'œil sans
      // répéter — c'est ce doublon de phrases qui avait été signalé. Même texte/couleur que le
      // badge équivalent de la ligne de tableau (voir statutOffreAffichage) : les deux affichent le
      // même fait, ils le disent maintenant de la même façon.
      // Affiché même quand aucun dossier local n'est relié : c'est justement là qu'il faut proposer
      // de le relier, sans quoi la carte ne dit rien de l'offre et n'offre aucun moyen d'agir.
      const offreStatut = statutOffreAffichage(d);
      // Un fichier a été retenu (et son chemin mémorisé) aussi bien pour "reçue" que pour
      // "à confirmer" : dans les deux cas il y a quelque chose à ouvrir — c'est justement en
      // l'ouvrant que l'étude tranche le second cas.
      const offreOuvrable = d.dossierLie && (d.offrePretStatut === 'recue' || d.offrePretStatut === 'aconfirmer');
      // Garanties du prêt lues dans l'offre (caution, hypothèque légale de prêteur de deniers,
      // hypothèque conventionnelle — plusieurs possibles) : affichées ici, dans la carte
      // "Obtention du prêt", emplacement choisi par l'étude.
      const garanties = garantiesPretAffichees(d);
      const garantiesBloc = garanties
        ? `<span class="tab-garanties" title="${garanties.identifiee ? 'Garantie(s) relevée(s) dans l’offre de prêt' : 'Aucune garantie lue dans l’offre de prêt : à vérifier dans l’offre'}">${pastillesGarantiesPret(garanties)}</span>`
        : '';
      // Voir d.piecesNotifications/fermerDossierDrawer : l'offre de prêt partage le même
      // mécanisme "Nouveau" que les pièces de la checklist (pseudo-cle CLE_NOTIF_OFFRE_PRET).
      const offreEstNouvelle = (d.piecesNotifications || []).includes(CLE_NOTIF_OFFRE_PRET);
      const offreBloc = !d.sansPret ? `
        <span class="tab-offre-pret">
          ${offreOuvrable
              ? `<button type="button" class="dot-label ${offreStatut.dl}" title="${d.offrePretStatut === 'recue' ? 'Offre de prêt reçue — cliquer pour ouvrir le fichier trouvé' : 'Document trouvé mais non confirmé — cliquer pour l’ouvrir et vérifier'}" onclick="ouvrirOffreTrouvee('${escapeOnclickArg(d.id)}')"><span class="dot"></span>${d.offrePretStatut === 'recue' ? 'Ouvrir le fichier' : 'À confirmer — ouvrir'}</button>`
              : `<span class="dot-label ${offreStatut.dl}" title="${d.dossierLie ? escapeAttr(offreStatut.texte) : 'Aucun dossier du NAS relié : l’offre n’a pas encore pu être cherchée'}"><span class="dot"></span>${offreStatut.texte}</span>`}
          ${offreEstNouvelle ? '<span class="dot-label dl-urgent notif-nouveau-tag">Nouveau</span>' : ''}
          ${d.dossierLie
              ? `<button type="button" class="lien-action" onclick="verifierDossierLocalDepuisBouton('${escapeOnclickArg(d.id)}', this)">Revérifier</button>`
              : `<button type="button" class="lien-action" onclick="lierDossierLocal('${escapeOnclickArg(d.id)}')">${icone('link')} Relier un dossier du NAS</button>`}
        </span>${garantiesBloc}` : '';
      const aujourdhui = isoAujourdHui();
      const avancement = avancementDossier(d, aujourdhui);
      const etapes = etapesAvancement(d, aujourdhui);
      const prochaineEtape = etapes.find(e => !e.fait) || null;
      const avecPieces = d.roleNotaire !== 'participant';
      const checklist = avecPieces ? checklistPieces(d.typeVente, d) : [];
      const nbPiecesRecues = checklist.filter(p => (d.pieces || {})[p.cle] === 'recue').length;
      const notifications = d.piecesNotifications || [];
      const notifPieces = notifications.some(c => c !== CLE_NOTIF_OFFRE_PRET);
      const nbEcheancesAVenir = echeancesPlanning(d).length;
      const onglet = (ongletFiche === 'analyse') ? 'pieces' : (ongletFiche === 'echeances' ? 'tableau' : (ongletFiche === 'fonds' && estSuccession(d) ? 'tableau' : (ongletFiche === 'factures' && !estSuccession(d) ? 'tableau' : ongletFiche)));
      const cache = nom => onglet === nom ? '' : ' hidden';

      // Un onglet par geste, dans l'ordre où on les accomplit sur un dossier : ce qui arrive
      // (échéances), ce qu'on attend (pièces), ce que dit l'acte, ce qu'on écrit, ce qui s'est
      // passé. Le compteur dit ce qu'il y a dedans sans l'ouvrir ; la pastille rouge, qu'il y a du
      // nouveau (même signal « Nouveau » que partout ailleurs, voir d.piecesNotifications).
      const avAnalyse = avancementAnalyse(d);
      // Tableau (le dossier en quatre colonnes, la préemption — DPU et SAFER — à droite, étude 13/10) · Pièces et analyse · Dossier · Fonds · Échanges · Historique.
      const actionsDuDossier = actionsFicheDossier(d);
      const ongletsFiche = [
        { cle: 'tableau', libelle: 'Tableau', compteur: nbEcheancesAVenir ? String(nbEcheancesAVenir) : '', titre: `Le dossier en colonnes — ${nbEcheancesAVenir} échéance(s) à venir`, nouveau: notifications.includes(CLE_NOTIF_OFFRE_PRET) },
        // Pièces et analyse de l'avant-contrat dans le même onglet (étude 05/10) ; sans checklist (participation), l'analyse seule.
        { cle: 'pieces', libelle: estSuccession(d) ? 'Pièces' : (avecPieces ? 'Pièces et analyse' : 'Analyse'),
          compteur: avecPieces ? `${nbPiecesRecues}/${checklist.length}` : (avAnalyse.total ? `${avAnalyse.faits}/${avAnalyse.total}` : ''),
          titre: (avecPieces ? `${nbPiecesRecues} pièce(s) reçue(s) sur ${checklist.length}` : '') + (avAnalyse.total ? `${avecPieces ? ' · ' : ''}${avAnalyse.faits} engagement(s) ou document(s) de l’avant-contrat sur ${avAnalyse.total}` : ''),
          complet: avecPieces ? checklist.length > 0 && nbPiecesRecues === checklist.length : avAnalyse.total > 0 && avAnalyse.faits === avAnalyse.total, nouveau: avecPieces && notifPieces },
        { cle: 'dossier', libelle: 'Dossier', compteur: '', titre: 'Parties, bien, financement, notaires, dossier du NAS' },
        // Fonds (étude 05/10) : provision, appel de fonds, fonds reçus et confirmation, relance, RIB — sortis d'Échanges.
        estSuccession(d) ? null : { cle: 'fonds', libelle: 'Fonds', compteur: '', titre: fondsCompletsAConfirmer(d) ? 'Tous les fonds sont reçus : confirmation au client à envoyer' : 'Provision, appel de fonds, fonds reçus, relance, RIB', nouveau: fondsCompletsAConfirmer(d) },
        // Factures d'une succession (étude 15/10 : « un onglet dédié aux factures »), rangées par Claire Scan ou ajoutées à la main.
        estSuccession(d) ? { cle: 'factures', libelle: 'Factures', compteur: facturesARegler(d).length ? String(facturesARegler(d).length) : '', titre: `${facturesARegler(d).length} facture(s) à régler sur ${facturesSuccession(d).length}`, nouveau: facturesARegler(d).length > 0 } : null,
        { cle: 'echanges', libelle: 'Échanges', compteur: '', titre: 'Emails, appels, sondages de dates, questionnaire' },
        { cle: 'historique', libelle: 'Historique', compteur: historique.length ? String(historique.length) : '', titre: `${historique.length} entrée(s)` }
      ].filter(Boolean);

      // La prochaine échéance n'est plus une puce de l'en-tête : l'onglet Échéances s'ouvre sur
      // l'encadré « Prochaine étape » (voir renderProchaineEtapeFiche), la dire deux fois chargeait la fiche.

      const analyseVide = analyse.documents.length === 0 && analyse.engagements.length === 0;
      return `
      <div class="dossier fiche${d.archive ? ' est-archive' : ''}">
        <!-- Barre d'outils collante : fermer et agrandir à gauche (le geste le plus fréquent en
             premier), les actions sur le dossier entier à droite, en icônes seules avec leur
             intitulé en infobulle. Archiver/Supprimer ne se mêlent plus au titre. -->
        <div class="fiche-barre">
          <div class="fiche-barre-groupe">
            <wa-button appearance="plain" type="button" class="bouton-icone fiche-btn" onclick="fermerFicheEtOnglet()" aria-label="Fermer la fiche" title="Fermer la fiche et son onglet (Échap)">${icone('x')}</wa-button>
            ${boutonsModeFiche()}
          </div>
          <div class="fiche-barre-groupe">
            <wa-button appearance="plain" type="button" class="bouton-icone fiche-btn" onclick="telechargerICS('${escapeOnclickArg(d.id)}')" aria-label="Télécharger les rappels (.ics)" title="Télécharger les rappels (.ics)">${icone('calendar')}</wa-button>
            <wa-button appearance="plain" type="button" class="bouton-icone fiche-btn" onclick="imprimerFiche('${escapeOnclickArg(d.id)}')" aria-label="Imprimer la fiche" title="Imprimer la fiche">${icone('printer')}</wa-button>
            <wa-button appearance="plain" type="button" class="bouton-icone fiche-btn" onclick="archiverDossier('${escapeOnclickArg(d.id)}', ${!d.archive})" aria-label="${d.archive ? 'Désarchiver' : 'Archiver'}" title="${d.archive ? 'Désarchiver le dossier' : 'Archiver le dossier'}">${icone('archive')}</wa-button>
            <wa-button appearance="plain" type="button" class="bouton-icone fiche-btn fiche-btn-danger" onclick="supprimerDossier('${escapeOnclickArg(d.id)}')" aria-label="Supprimer le dossier" title="Supprimer le dossier">${icone('trash')}</wa-button>
          </div>
        </div>

        <div class="fiche-colonnes">
          <div class="fiche-principale">
            <header class="fiche-entete">
              <div class="fiche-meta">${renderBadgeStatut(d)}</div>
              <div class="fiche-titre-ligne">
              <div class="nom-dossier">
                <span class="nom-affichage" id="nom-affichage-${d.id}">
                  <span class="nom-texte">${escapeHtml(libelleDossierAffiche(d))}</span>
                  <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-crayon" onclick="activerEditionNom('${escapeOnclickArg(d.id)}')" title="Modifier le nom" aria-label="Modifier le nom">${icone('pencil')}</wa-button>
                  ${texteRattachementAuthentic(d) ? infoBulle(texteRattachementAuthentic(d)) : ''}
                </span>
                <span class="nom-edition" id="nom-edition-${d.id}" hidden>
                  <input type="text" class="dossier-nom-input" id="nom-input-${d.id}" value="${escapeAttr(d.nom)}" aria-label="Nom du dossier" onkeydown="if(event.key==='Enter'){event.preventDefault();validerEditionNom('${escapeOnclickArg(d.id)}');}else if(event.key==='Escape'){annulerEditionNom('${escapeOnclickArg(d.id)}');}">
                  <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-valider" onclick="validerEditionNom('${escapeOnclickArg(d.id)}')" title="Valider" aria-label="Valider le nom">✓</wa-button>
                </span>
              </div>
              <div class="fiche-entete-infos">
                ${d.responsable ? `<span class="fiche-resp" title="Responsable : ${escapeAttr(d.responsable)}">${pastilleCollaborateur(d.responsable)}</span>` : ''}
                ${d.adresseBien ? `<span class="fiche-entete-texte">${escapeHtml(normaliserAdresse(d.adresseBien))}</span>` : ''}
                ${d.prixVente ? `<strong class="fiche-entete-prix">${escapeHtml(formaterPrix(d.prixVente))}</strong>` : ''}
                ${pastillesHypothequeEntete(d)}
                ${pastilleFcddvEntete(d)}
                ${estSuccession(d) ? '' : boutonOuvrirCompromis}
                ${boutonDossierNas}
              </div>
              </div>
            </header>

            ${renderBandeauFiche(d, actionsDuDossier)}
            ${renderSuiviEtapesFiche(etapes, prochaineEtape, avancement)}

            <div class="fiche-onglets" role="tablist" aria-label="Sections de la fiche">
              ${ongletsFiche.map(o => `<button type="button" role="tab" class="fiche-onglet${o.cle === onglet ? ' actif' : ''}" data-onglet="${o.cle}" aria-selected="${o.cle === onglet}" title="${escapeAttr(o.titre)}" onclick="definirOngletFiche('${o.cle}')">${o.libelle}${o.compteur ? `<span class="fiche-compteur${o.complet ? ' complet' : ''}">${o.compteur}</span>` : ''}${o.nouveau ? '<span class="fiche-onglet-nouveau" aria-label="Nouveau"></span>' : ''}</button>`).join('')}
            </div>

            <section class="fiche-panneau" data-onglet="tableau" role="tabpanel"${cache('tableau')}>
              ${renderMajAuthenticTableauFiche(d)}
              <!-- À droite du tableau : les seules dates du droit de préemption urbain et de la SAFER (étude 13/10). -->
              <div class="tf-disposition${d.roleNotaire === 'participant' || estSuccession(d) ? ' sans-cote' : ''}">
                <div class="tf-principal">
                  ${renderTableauFiche(d, actionsDuDossier)}
                  <details class="tf-repliable"${echeancesDetailOuvert ? ' open' : ''} ontoggle="echeancesDetailOuvert = this.open">
                    <summary>Toutes les échéances, dates et rappels</summary>
                    ${renderProchaineEtapeFiche(d)}
                    ${echeancesOrdonneesFiche(d, confiance, offreBloc)}
                    ${renderAjoutEcheance(d)}
                  </details>
                </div>
                ${renderPreemptionTableauFiche(d)}
              </div>
            </section>

            <section class="fiche-panneau" data-onglet="pieces" role="tabpanel"${cache('pieces')}>
              ${avecPieces ? `${renderPiecesDossier(d)}
              ${renderPreemptionFiche(d)}` : ''}
              <div class="fiche-sous-partie"${estSuccession(d) ? ' hidden' : ''}>
              ${avecPieces ? `<div class="section-eyebrow fiche-sous-titre">Analyse de l'avant-contrat</div>` : ''}
              ${analyseVide ? `<p class="fiche-vide">Aucune obligation du vendeur ni aucun document relevé dans l'avant-contrat.</p>` : `
              <div class="analyse-juridique">
                ${analyse.engagements.length > 0 ? `
                  <div class="analyse-section">
                    <div class="analyse-sous-titre">Engagements du vendeur <span class="analyse-compteur">${analyse.engagements.filter(e => etatEngagementAnalyse(d, e).fait).length}/${analyse.engagements.length}</span>${infoBulle('Cochez un engagement une fois réalisé (justificatif reçu, travaux faits). Un engagement non coché garde le dossier « Attente de pièces » et baisse la probabilité de tenue du rendez-vous. Un engagement dont la pièce est reçue se coche seul.')}</div>
                    ${analyse.engagements.map((e, i) => renderEngagement(e, i, d.id)).join('')}
                  </div>
                ` : ''}
                <div class="analyse-section">
                  <div class="analyse-sous-titre">Documents et pièces identifiés <span class="analyse-compteur">${analyse.documents.filter(doc => documentAnalyseRecu(d, doc)).length}/${analyse.documents.length}</span>${infoBulle('Cochez un document une fois reçu. S’il figure aussi dans la checklist (« checklist »), c’est la même case que dans la liste des pièces ci-dessus.')}</div>
                  <div class="analyse-documents-cases">
                    ${analyse.documents.length > 0
                      ? analyse.documents.map((doc, i) => renderDocumentAnalyse(d, doc, i)).join('')
                      : '<span class="analyse-vide">Aucun document type reconnu automatiquement.</span>'}
                  </div>
                </div>
              </div>`}
              ${renderAjoutEngagement(d)}
              </div>
              <div class="fiche-fin-repliables">
                ${avecPieces ? `${renderAuthenticDossier(d)}${renderDiagnosticParcours(d)}` : ''}
                ${estSuccession(d) ? '' : renderExtractionDossier(d)}
              </div>
            </section>

            <section class="fiche-panneau" data-onglet="dossier" role="tabpanel"${cache('dossier')}>
              ${renderProprietesDossier(d, '', boutonsDossierLocal)}
            </section>

            ${estSuccession(d) ? '' : `<section class="fiche-panneau" data-onglet="fonds" role="tabpanel"${cache('fonds')}>
              ${renderFondsDossier(d)}
            </section>`}

            ${estSuccession(d) ? `<section class="fiche-panneau" data-onglet="factures" role="tabpanel"${cache('factures')}>
              ${renderFacturesSuccessionFiche(d)}
            </section>` : ''}

            <section class="fiche-panneau" data-onglet="echanges" role="tabpanel"${cache('echanges')}>
              ${renderEchangesDossier(d)}
            </section>

            <section class="fiche-panneau" data-onglet="historique" role="tabpanel"${cache('historique')}>
              ${renderActiviteFiche(historique)}
            </section>
          </div>

        </div>
      </div>
    `;
  }

  // Onglet actif de la fiche et mode agrandi. L'onglet repart sur « Échéances » à chaque ouverture
  // (ou « Pièces » s'il y a du nouveau, voir ouvrirDossierDrawer) mais survit aux render() qui
  // reconstruisent le tiroir à chaque action. Le mode agrandi, lui, est une préférence du poste.
  let ongletFiche = 'tableau';
  // « Toutes les échéances » (repliées sous le tableau) : l'état survit aux render() qui reconstruisent le tiroir.
  var echeancesDetailOuvert = false;

  // Bascule sans reconstruire le tiroir : les champs en cours de saisie et le défilement restent
  // en place.
  // Pure : « Lot n° 12 — Appartement, 3e étage, 85 m² Carrez, 125/10 000 tantièmes ».
  function libelleLotCopropriete(l, total) {
    const parts = [];
    if (l.type || l.designation) parts.push(l.type || l.designation);
    if (l.etage) parts.push(/^\d+$/.test(String(l.etage)) ? `${l.etage}${l.etage === '1' ? 'er' : 'e'} étage` : `étage ${l.etage}`);
    if (l.surfaceCarrez != null) parts.push(`${String(l.surfaceCarrez).replace('.', ',')} m² Carrez`);
    else if (l.surface != null) parts.push(`${String(l.surface).replace('.', ',')} m²`);
    if (l.tantiemes != null) parts.push(`${l.tantiemes}${total ? '/' + String(Math.round(Number(total))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''} tantièmes`);
    return `Lot n° ${l.numero}${parts.length ? ' — ' + parts.join(', ') : ''}`;
  }

  function definirOngletFiche(nom) {
    // « analyse » : ancien onglet, fondu dans « Pièces et analyse » (étude 05/10).
    if (nom === 'analyse') nom = 'pieces';
    ongletFiche = nom;
    const tiroir = document.getElementById('dossier-drawer');
    if (!tiroir) return;
    tiroir.querySelectorAll('.fiche-onglet').forEach(b => {
      const actif = b.getAttribute('data-onglet') === nom;
      b.classList.toggle('actif', actif);
      b.setAttribute('aria-selected', actif ? 'true' : 'false');
    });
    tiroir.querySelectorAll('.fiche-panneau').forEach(p => { p.hidden = p.getAttribute('data-onglet') !== nom; });
  }

  // Historique en fil d'activité, le plus récent en haut : le texte d'abord, la date et l'auteur
  // dessous, en plus petit. Utilisé par l'onglet « Historique ».
  function renderActiviteFiche(historique) {
    if (!historique.length) return '<p class="fiche-vide">Aucune activité enregistrée.</p>';
    return `<ol class="fiche-activite">${historique.slice().reverse().map(h => `
      <li class="fiche-activite-ligne">
        <span class="fiche-activite-texte">${escapeHtml(h.texte)}</span>
        <span class="fiche-activite-meta">${new Date(h.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${h.auteur ? ` · ${escapeHtml(prenomCollaborateur(h.auteur))}` : ''}</span>
      </li>`).join('')}</ol>`;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // Échappement dédié aux attributs HTML (échappe aussi les guillemets, contrairement à
  // escapeHtml) : pour un attribut HTML ORDINAIRE (title="...", value="...", aria-label="...") —
  // pas pour un argument JS à l'intérieur d'un gestionnaire onclick="...", voir escapeOnclickArg()
  // juste en dessous et l'historique du bug qui explique pourquoi les deux ne sont PAS
  // interchangeables malgré des symptômes très proches.
  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;');
  }

  // Échappement dédié à un argument JS interpolé DANS un attribut onclick="..." délimité par des
  // apostrophes (ex. onclick="fonction('id', 'cle', '${escapeOnclickArg(p.label)}')").
  // Bug corrigé, en deux temps : un premier correctif (voir l'historique git) avait fait
  // remplacer l'apostrophe par l'entité HTML &#39; dans escapeAttr() — apparemment correct à
  // toutes les vérifications faites à l'époque (relecture du code, rendu en bac à sable, deux
  // binaires .exe publiés inspectés, et même la réponse réseau de script.js relue dans le
  // navigateur) et pourtant TOUJOURS sans effet en conditions réelles sur "Certificat
  // d'urbanisme"/"Certificat d'alignement" (aucune popup de confirmation au clic sur la croix).
  // Cause réelle, jamais identifiée par ces vérifications parce qu'aucune d'elles ne rejouait le
  // parsing du navigateur : un attribut onclick="..." est décodé EN DEUX TEMPS — d'abord comme du
  // HTML (les entités comme &#39; sont résolues en leur caractère, ici ' à nouveau), PUIS le texte
  // ainsi décodé est exécuté comme du JS. &#39; redevient donc une apostrophe BRUTE avant même que
  // le moteur JS ne voie l'attribut — elle referme le même argument JS qu'avant ce premier
  // correctif, exactement le même bug, juste masqué à la lecture du code source (qui ne montre
  // que le texte AVANT ce second décodage HTML implicite). La seule échappement qui survit aux
  // DEUX passes est l'échappement JS lui-même (\' — un antislash n'a aucun sens spécial en HTML,
  // il traverse le premier décodage intact, et forme ensuite une séquence d'échappement JS valide
  // pour le second). `escapeAttr()` reste correcte telle quelle pour un attribut HTML ORDINAIRE
  // (title, value...) qui n'est jamais réinterprété comme du JS — seul ce cas précis (un argument
  // JS DANS un gestionnaire onclick) a besoin de cette échappement différente.
  function escapeOnclickArg(s) {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renommerDossier(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nom = valeur.trim();
    // Toujours réafficher (via render()) même si le nom est vide ou inchangé, pour refermer
    // l'édition dans tous les cas — pas seulement quand une modification a réellement eu lieu.
    if (nom && nom !== d.nom) {
      ajouterHistorique(d, `Nom modifié : « ${d.nom} » → « ${nom} »`);
      d.nom = nom;
      sauvegarder(d);
    }
    render();
  }

  // Bascule le nom d'un dossier enregistré entre affichage simple (+ crayon) et édition
  // (champ texte + validation explicite), plutôt qu'un champ toujours modifiable au clic — évite
  // de déclencher une modification par erreur en cliquant simplement sur le nom.
  function activerEditionNom(id) {
    const aff = document.getElementById('nom-affichage-' + id);
    const edit = document.getElementById('nom-edition-' + id);
    if (!aff || !edit) return;
    aff.hidden = true;
    edit.hidden = false;
    const input = document.getElementById('nom-input-' + id);
    if (input) { input.focus(); input.select(); }
  }

  function annulerEditionNom(id) {
    const d = dossiers.find(x => x.id === id);
    const input = document.getElementById('nom-input-' + id);
    if (input && d) input.value = d.nom; // remet la valeur d'origine sans repasser par render()
    const aff = document.getElementById('nom-affichage-' + id);
    const edit = document.getElementById('nom-edition-' + id);
    if (aff) aff.hidden = false;
    if (edit) edit.hidden = true;
  }

  function validerEditionNom(id) {
    const input = document.getElementById('nom-input-' + id);
    renommerDossier(id, input ? input.value : '');
  }

  // Même principe pour corriger une date après coup (erreur repérée une fois le dossier
  // enregistré) : crayon → champ date natif → valider. cleEdition vaut le type (pret/acte/
  // ventebien) ou "autre-<index>" pour une échéance personnalisée — voir renderLigneEcheance().
  function activerEditionDate(dossierId, cle) {
    const idBase = `tabdate-${dossierId}-${cle}`;
    const aff = document.getElementById(idBase + '-aff');
    const edit = document.getElementById(idBase + '-edit');
    if (!aff || !edit) return;
    aff.hidden = true;
    edit.hidden = false;
    const input = document.getElementById(idBase + '-input');
    if (input) input.focus();
  }

  // Écrit une date d'échéance sur la fiche (prêt, vente préalable, butoir, appel de fonds, projet, rendez-vous) avec tout ce
  // qui la suit : historique, notification, agenda de l'office. Voie unique de la fiche (validerEditionDate) et de l'assistant
  // (étude 06/10). Rend 'rendu' quand elle a déjà rafraîchi l'écran et ouvert le formulaire d'horaire.
  function appliquerDateEcheance(d, cle, nouvelleDate) {
    const ancienneRdv = cle === 'rendezVousSignature' ? (d[cle] || '') : '';
    // L'heure et le lieu lus dans l'agenda se rapportaient à l'ancienne date du rendez-vous.
    if (cle === 'rendezVousSignature') effacerHoraireRendezVous(d);
    ajouterHistorique(d, `« ${LIBELLES_CATEGORIE[cle]} » modifiée : ${d[cle] ? formatDateFr(d[cle]) : 'non renseignée'} → ${nouvelleDate ? formatDateFr(nouvelleDate) : 'non renseignée'}`);
    notifierDateAjoutee(d, LIBELLES_CATEGORIE[cle] || cle, nouvelleDate, d[cle] || '');
    d[cle] = nouvelleDate || '';
    d.confiance = d.confiance || {};
    d.confiance[cle] = 'manuel'; // corrigée à la main : à revérifier comme toute saisie manuelle
    // Symétrique de supprimerDateEcheance (qui passe sansPret à true en vidant cette date) : si
    // une date de prêt est saisie sur un dossier jusque-là "sans prêt", le suivi de l'offre doit
    // reprendre — sans ce basculement, d.sansPret restait bloqué à true indéfiniment, malgré une
    // vraie date désormais renseignée (verifierDossierLocal()/la checklist continuaient d'ignorer
    // le prêt).
    if (cle === 'pret') d.sansPret = !nouvelleDate;
    // Saisir la date de l'appel de fonds, c'est constater qu'il est parti : demandé par l'étude,
    // l'échéance passe aussitôt en « réalisée » (la carte le dit, le planning passe au
    // rendez-vous de signature, et la section « Appel de fonds » du bas de fiche disparaît).
    // Vider la date annule la validation — sinon un appel de fonds sans date resterait « fait ».
    if (cle === 'appelFonds') marquerAppelFondsSelonDate(d, nouvelleDate);
    if (cle === 'projetEnvoye') marquerProjetEnvoyeSelonDate(d, nouvelleDate);
    sauvegarder(d);
    // Batch D : noter automatiquement l'envoi dans l'agenda de l'office dès qu'une date d'envoi
    // (appel de fonds / projet) est validée, sans clic sur « Noter dans l'agenda ». Best-effort et
    // silencieux si Exchange n'est pas prêt ou en cas d'échec (voir noterEnvoiDansAgenda(auto)) ;
    // le bouton reste disponible pour réessayer. Fire-and-forget : re-render à la résolution.
    if ((cle === 'appelFonds' || cle === 'projetEnvoye') && nouvelleDate) {
      noterEnvoiDansAgenda(d.id, true);
    }
    // Date butoir du prêt ou de la vente préalable : posée, déplacée ou retirée dans le
    // calendrier partagé (voir synchroniserEcheanceAgenda). Seul geste qui en CRÉE une.
    if (cle === 'pret' || cle === 'ventebien') synchroniserEcheanceAgenda(d, cle, true);
    // Rendez-vous de signature saisi à la main : proposer tout de suite l'horaire pour le créer
    // dans l'agenda Outlook (demandé par l'étude). Pas quand la date vient de l'agenda lui-même :
    // le rendez-vous y est déjà. Le formulaire reste une confirmation, rien n'est écrit sans clic.
    // Rendez-vous déplacé : l'événement déjà dans l'agenda suit (même heure, même couleur) ; il
    // n'est proposé d'en créer un que s'il n'y en avait aucun à l'ancienne date.
    if (cle === 'rendezVousSignature' && ancienneRdv && exchangeAgendaPret()) {
      render();
      deplacerRdvDansAgenda(d, ancienneRdv, nouvelleDate).then((r) => {
        if (r === 'introuvable' && proposerHoraireRdv(d)) ouvrirFormRdvAgenda(d);
      });
      return 'rendu';
    }
    if (cle === 'rendezVousSignature' && proposerHoraireRdv(d)) {
      ouvrirFormRdvAgenda(d);
      return 'rendu';
    }
    return '';
  }

  function validerEditionDate(dossierId, cle) {
    const idBase = `tabdate-${dossierId}-${cle}`;
    const input = document.getElementById(idBase + '-input');
    if (!input) return;
    enregistrerDateEcheanceSaisie(dossierId, cle, input.value || '');
  }

  // Enregistre une date saisie à la main (crayon de la liste des échéances, crayon d'une carte du Tableau) : `cle` = type ou
  // « autre-<index> ». Vider la date du rendez-vous le supprime (même confirmation que la croix).
  function enregistrerDateEcheanceSaisie(dossierId, cle, nouvelleDate) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;

    if (cle.indexOf('autre-') === 0) {
      const index = parseInt(cle.slice(6), 10);
      const item = (d.autres || [])[index];
      if (!item) return;
      if (nouvelleDate !== (item.date || '')) {
        ajouterHistorique(d, `Date « ${item.label} » modifiée : ${item.date ? formatDateFr(item.date) : 'non renseignée'} → ${nouvelleDate ? formatDateFr(nouvelleDate) : 'non renseignée'}`);
        const ancienne = item.date || '';
        item.date = nouvelleDate || null;
        sauvegarder(d);
        notifierDateAjoutee(d, item.label || 'Échéance', nouvelleDate, ancienne);
      }
    } else if (cle === 'rendezVousSignature' && !nouvelleDate && d[cle]) {
      // Vider la date du rendez-vous, c'est le supprimer : même chemin (et même confirmation) que la
      // croix, qui le retire aussi de l'agenda de l'office.
      render();
      supprimerDateEcheance(dossierId, cle);
      return;
    } else if (nouvelleDate !== (d[cle] || '')) {
      if (appliquerDateEcheance(d, cle, nouvelleDate) === 'rendu') return;
    }
    render();
  }

  // Faut-il proposer l'horaire (et la création dans l'agenda) juste après la saisie de la date du
  // rendez-vous ? Pure, testable.
  function proposerHoraireRdv(d) {
    if (!d || !d.rendezVousSignature || !exchangeAgendaPret()) return false;
    const releve = d.detectionsAgenda && d.detectionsAgenda.rendezVousSignature;
    return releve !== d.rendezVousSignature;
  }

  // Ajouter une échéance personnalisée APRÈS l'enregistrement du dossier (pas seulement à la
  // création, via autresEnCours/renderAutres) : demandé par l'étude, un délai/une obligation
  // repérée après coup (ex. à la lecture d'un avenant) doit pouvoir être ajoutée sans repasser par
  // le wizard. Un simple bouton "+ Ajouter une échéance" bascule vers un mini-formulaire inline
  // (même structure .date-block.autre/.autre-row que le formulaire de création, réutilisée telle
  // quelle plutôt que dupliquée) — voir renderAjoutEcheance(), appelé juste sous .tabs.
  function afficherFormAjoutEcheance() {
    ajoutEcheanceOuvert = true;
    render();
  }

  function masquerFormAjoutEcheance() {
    ajoutEcheanceOuvert = false;
    render();
  }

  function ajouterEcheanceApresCoup(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const labelInput = document.getElementById('nouvelle-echeance-label');
    const dateInput = document.getElementById('nouvelle-echeance-date');
    const label = (labelInput && labelInput.value.trim()) || 'Autre échéance';
    const iso = dateInput ? dateInput.value : '';
    if (!iso) { if (dateInput) dateInput.focus(); return; } // une échéance sans date n'a pas de sens ici
    d.autres = d.autres || [];
    d.autres.push({ label, date: iso, page: null });
    ajouterHistorique(d, `Échéance « ${label} » ajoutée (${formatDateFr(iso)})`);
    ajoutEcheanceOuvert = false;
    sauvegarder(d);
    notifierDateAjoutee(d, label, iso, '');
    render();
  }

  // Pendant du bouton "+ Ajouter une échéance" ci-dessus : ne concerne que les échéances
  // personnalisées (croix visible uniquement sur les tabs "autre", voir renderLigneEcheance) — une entrée de
  // d.autres est réellement retirée du tableau. Obtention du prêt/Signature de l'acte/Vente
  // préalable ne sont jamais retirées du modèle (voir supprimerDateEcheance juste en dessous, qui
  // vide seulement leur date).
  function supprimerEcheanceAutre(dossierId, index) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.autres || !d.autres[index]) return;
    const item = d.autres[index];
    demanderConfirmation(`Supprimer l'échéance « ${item.label || 'Autre échéance'} » ?`, () => {
      d.autres.splice(index, 1);
      ajouterHistorique(d, `Échéance « ${item.label || 'Autre échéance'} » supprimée`);
      sauvegarder(d);
      render();
    });
  }

  // Bouton de suppression dédié pour une date butoir fixe (pret/acte/ventebien), demandé par
  // l'étude en plus de la correction déjà possible via le crayon (qui permet aussi de vider le
  // champ date natif puis valider — mais rien n'indiquait que c'était possible, ni ne le
  // confirmait). Contrairement à supprimerEcheanceAutre, la tab elle-même n'est pas retirée du
  // modèle : seule sa date repart à vide (déjà le cas d'affichage pour "Non renseigné" sur un
  // dossier créé sans cette échéance active — voir renderLigneEcheance).
  function supprimerDateEcheance(dossierId, type) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d[type]) return;
    const retraitAgenda = type === 'rendezVousSignature' && exchangeAgendaPret();
    demanderConfirmation(`Supprimer la date « ${LIBELLES_CATEGORIE[type]} » ?${retraitAgenda ? " Le rendez-vous sera aussi retiré de l'agenda Outlook de l'office (il reste récupérable dans ses éléments supprimés)." : ''}`, () => {
      const ancienne = d[type];
      d[type] = '';
      d.confiance = d.confiance || {};
      d.confiance[type] = null;
      // Supprimer la date de prêt équivaut à "sans prêt" (voir d.sansPret, déjà la seule source de
      // vérité utilisée partout ailleurs — checklist de pièces, badges, verifierDossierLocal...) :
      // sans ce basculement, une recherche locale de l'offre aurait continué pour une condition
      // qui n'est plus suivie sur ce dossier (verifierDossierLocal() teste déjà `!d.sansPret`).
      if (type === 'pret') d.sansPret = true;
      if (type === 'appelFonds') marquerAppelFondsSelonDate(d, '');
      if (type === 'projetEnvoye') marquerProjetEnvoyeSelonDate(d, '');
      if (type === 'rendezVousSignature') {
        effacerHoraireRendezVous(d);
        d.rendezVousType = '';
        // Le flux publié de l'agenda peut porter ce rendez-vous encore quelques heures : il ne doit
        // pas revenir tout seul sur la fiche (voir appliquerRendezVousAgenda côté serveur).
        d.detectionsAgenda = d.detectionsAgenda || {};
        d.detectionsAgenda.rendezVousRetire = ancienne;
      }
      ajouterHistorique(d, `« ${LIBELLES_CATEGORIE[type]} » supprimée`);
      sauvegarder(d);
      render();
      if (type === 'pret' || type === 'ventebien') synchroniserEcheanceAgenda(d, type, false);
      // Envoi supprimé : la mention « envoyé » du lieu du rendez-vous s'efface (ou se réduit à l'autre envoi).
      if (type === 'appelFonds' || type === 'projetEnvoye') majMentionAgendaEnvoi(d.id, true);
      if (retraitAgenda) retirerRdvDeAgenda(d, ancienne);
    });
  }

  // Le dossier n'a pas de prêt (étude 12/10 : erreur à la création) : condition retirée, date effacée, plus d'offre attendue ni
  // de relance, date butoir retirée de l'agenda — comme supprimer la date du prêt, mais aussi quand aucune date n'était saisie.
  // Saisir plus tard une date d'obtention la rétablit (validerEditionDate).
  function marquerSansPret(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || d.sansPret) return;
    demanderConfirmation('Retirer la condition d’obtention du prêt ? L’offre de prêt ne sera plus attendue ni relancée.', () => {
      const avaitDate = !!d.pret;
      d.pret = '';
      d.sansPret = true;
      d.confiance = d.confiance || {};
      d.confiance.pret = null;
      ajouterHistorique(d, 'Condition d’obtention du prêt retirée (pas de prêt)');
      sauvegarder(d);
      render();
      if (avaitDate) synchroniserEcheanceAgenda(d, 'pret', false);
    });
  }

  function renderAjoutEcheance(d) {
    if (!ajoutEcheanceOuvert) {
      return `<wa-button appearance="outlined" type="button" class="bouton-ajout ajout-echeance-btn" onclick="afficherFormAjoutEcheance()"><span slot="start" class="bouton-ajout-plus" aria-hidden="true">+</span>Ajouter une échéance</wa-button>`;
    }
    return `
      <div class="date-block autre ajout-echeance-form">
        <div class="autre-row">
          <input type="text" id="nouvelle-echeance-label" placeholder="Nom de l'échéance (ex. Levée de la condition suspensive travaux)">
          <input type="date" id="nouvelle-echeance-date">
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-valider" onclick="ajouterEcheanceApresCoup('${escapeOnclickArg(d.id)}')" title="Ajouter" aria-label="Ajouter l'échéance">✓</wa-button>
          <button type="button" class="icon-btn" onclick="masquerFormAjoutEcheance()">Annuler</button>
        </div>
      </div>
    `;
  }

  // Ajouter une obligation du vendeur sur une fiche DÉJÀ ENREGISTRÉE, demandé par l'étude — jusqu'ici
  // seule la sélection de texte dans le PDF (pendant l'import) ou le bouton "+ Ajouter un engagement
  // du vendeur" du wizard permettaient d'en consigner une, jamais sur un dossier rouvert plus tard
  // (un accord oral rapporté après coup, ou une clause repérée en relisant l'acte a posteriori).
  // Même principe que renderAjoutEcheance/renderAjoutPiece : un bouton toujours visible qui bascule
  // vers un mini-formulaire inline, piloté par ajoutEngagementOuvert (un seul dossier ouvert à la
  // fois dans le tiroir, un simple booléen suffit).
  function afficherFormAjoutEngagementDossier() {
    ajoutEngagementOuvert = true;
    render();
  }

  function masquerFormAjoutEngagementDossier() {
    ajoutEngagementOuvert = false;
    render();
  }

  // Alimente aussi l'apprentissage (memoriserCorrection, catégorie 'engagement') : une obligation
  // ajoutée à la main sur une fiche déjà enregistrée est, comme une clause ajoutée pendant l'import,
  // un signal utile pour reconnaître une formulation proche au prochain compromis — même principe
  // déjà appliqué à ajouterEngagementManuel()/ajouterEngagementDepuisFormulaire() et à
  // validerEditionEngagement().
  function ajouterEngagementDossierApresCoup(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    // Ids distincts du formulaire équivalent du wizard (#nouvel-engagement-type/-texte, voir
    // index.html) : ce dernier reste en permanence dans le DOM (masqué par style.display, jamais
    // retiré) — deux éléments partageant le même id auraient fait retomber getElementById() sur le
    // MAUVAIS formulaire (celui du wizard, apparaissant en premier dans le document), pas sur celui
    // réellement affiché dans le tiroir.
    const typeEl = document.getElementById('nouvelle-obligation-dossier-type');
    const texteEl = document.getElementById('nouvelle-obligation-dossier-texte');
    const type = typeEl ? typeEl.value : 'document';
    const phrase = texteEl ? texteEl.value.trim() : '';
    if (!phrase) { if (texteEl) texteEl.focus(); return; }
    d.analyseJuridique = d.analyseJuridique || { documents: [], engagements: [] };
    d.analyseJuridique.engagements = d.analyseJuridique.engagements || [];
    d.analyseJuridique.engagements.push({ phrase, type, page: null, manuel: true });
    d.analyseJuridique.documents = completerDocumentsIdentifies(d.analyseJuridique.documents, [{ phrase, type }]);
    ajouterHistorique(d, `Obligation du vendeur ajoutée : « ${phrase.slice(0, 80)}${phrase.length > 80 ? '…' : ''} »`);
    memoriserCorrection(phrase, type, null, 'engagement');
    ajoutEngagementOuvert = false;
    sauvegarder(d);
    render();
  }

  function renderAjoutEngagement(d) {
    if (!ajoutEngagementOuvert) {
      return `<wa-button appearance="outlined" type="button" class="bouton-ajout ajout-engagement-btn" onclick="afficherFormAjoutEngagementDossier()"><span slot="start" class="bouton-ajout-plus" aria-hidden="true">+</span>Ajouter une obligation du vendeur</wa-button>`;
    }
    return `
      <div class="date-block autre ajout-engagement-form">
        <div class="autre-row">
          <select id="nouvelle-obligation-dossier-type">
            <option value="entretien">Entretien</option>
            <option value="travaux">Travaux</option>
            <option value="document" selected>Document</option>
            <option value="autre">Autres</option>
          </select>
          <textarea id="nouvelle-obligation-dossier-texte" rows="2" placeholder="Clause exacte, ou description de l'obligation"></textarea>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-valider" onclick="ajouterEngagementDossierApresCoup('${escapeOnclickArg(d.id)}')" title="Ajouter" aria-label="Ajouter l'obligation">✓</wa-button>
          <button type="button" class="icon-btn" onclick="masquerFormAjoutEngagementDossier()">Annuler</button>
        </div>
      </div>
    `;
  }

  // ---- ICS export ----

  function icsDate(iso) {
    return iso.replace(/-/g, '');
  }

  function buildEvent(uidBase, summary, iso, reminderDays) {
    if (!iso) return '';
    const dtstart = icsDate(iso);
    const dtend = icsDate(addDays(iso, 1));
    const now = new Date();
    const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    // Un dossier sans `reminderDays` (ancien, importé) exportait par un plantage muet : sans rappel plutôt que rien.
    const alarms = (Array.isArray(reminderDays) ? reminderDays : []).map(n => {
      const trigger = n === 0 ? 'PT0S' : `-P${n}D`;
      return `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Rappel — ${summary}\r\nTRIGGER:${trigger}\r\nEND:VALARM\r\n`;
    }).join('');
    return `BEGIN:VEVENT\r\nUID:${uidBase}@registre-echeances\r\nDTSTAMP:${dtstamp}\r\nDTSTART;VALUE=DATE:${dtstart}\r\nDTEND;VALUE=DATE:${dtend}\r\nSUMMARY:${summary}\r\n${alarms}END:VEVENT\r\n`;
  }

  // Le nom du dossier est au format "VENDEUR(S) / ACQUEREUR(S)" : on isole la partie acquéreur
  // pour la mettre en avant dans le titre du rendez-vous (repli sur le nom complet si le format
  // "VENDEUR / ACQUEREUR" n'a pas pu être établi, par ex. un seul nom détecté).
  function extraireNomAcquereur(nomDossier) {
    const parties = String(nomDossier || '').split(' / ');
    return parties.length > 1 ? parties[1].trim() : nomDossier;
  }

  // Limité à la seule date d'obtention du prêt (demandé explicitement par l'étude) : les autres
  // échéances (acte, vente préalable, personnalisées) n'y figurent plus, contrairement à la
  // première version de cet export qui générait un événement par échéance active du dossier.
  function telechargerICS(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    // Plus rien à exporter pour ce dossier (sans prêt, ou date de prêt supprimée/jamais
    // renseignée) : un .ics vide (juste l'en-tête VCALENDAR, sans VEVENT) serait un échec
    // silencieux — voir la contrainte n°5 de CLAUDE.md sur les messages invisibles.
    if (!d.pret) {
      afficherToast("Aucune date d'obtention du prêt renseignée pour ce dossier : rien à exporter.", 'OK', null);
      return;
    }
    const nomAcquereur = extraireNomAcquereur(d.nom);
    const suffixeTitre = ` — ${nomAcquereur} - Dossier ${d.nom}`;
    let body = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Registre des echeances//FR\r\nCALSCALE:GREGORIAN\r\n';
    body += buildEvent(d.id + '-pret', `Obtention du prêt${suffixeTitre}`, d.pret, d.reminderDays);
    body += 'END:VCALENDAR\r\n';

    const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = libelleDossierAffiche(d).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    a.href = url;
    // Format demandé par l'étude : rappel_echeance_<nom du dossier>.ics.
    a.download = `rappel_echeance_${safeName || 'dossier'}.ics`;
    document.body.appendChild(a);
    a.click();
    ouvrirApresTelechargement(a.download);
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    afficherInfoAction(
      'Fichier .ics téléchargé',
      "Ouvrez-le dans Outlook : il ajoute l'échéance du prêt et ses rappels."
    );
  }

  // ==== Relances ciblées, différenciées par motif ====
  //
  // Le rappel générique "toutes les échéances" adressé à l'ÉTUDE elle-même (ouvrirEmailRappel(),
  // un pense-bête interne par mailto) a été retiré définitivement : les rappels automatiques
  // envoyés par le serveur (voir jobs/rappels.js), avec copie systématique à l'étude (voir
  // copieEmail dans l'écran Réglages), couvrent désormais ce besoin sans geste manuel. Ces
  // modèles-ci restent en revanche adressés au CLIENT (d.emailAcquereur, comme
  // relancerSiOffreManquante() déjà en place) : chacun cible un motif de relance précis, pour ne
  // plus avoir à réécrire le même email à la main selon ce qui manque réellement au dossier — un
  // usage distinct, non couvert par les rappels automatiques.
