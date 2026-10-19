  // ==== Emails des dossiers (étude, 02/10 : « tu peux lire le contenu », « lire les emails envoyés pour
  // confirmer ») ====
  // Le serveur relit la boîte de réception du compte relié et les « Éléments envoyés » de chaque
  // collaborateur (server/src/emailsDossiers.js) : emails rattachés au dossier, résumé de l'IA locale,
  // pièces jointes, emails préparés par CLAIRE retrouvés dans les envois. Le texte d'un email n'est
  // jamais gardé. Les pièces jointes reconnues par leur NOM sont rangées dans le dossier client du NAS.
  var emailsParDossier = {};        // id → { emails, prepares, etat } (null pendant le chargement)

  // Pure : la pièce de la checklist qu'un nom de pièce jointe désigne (même règle que le parcours du
  // NAS : le nom seul, motif exact puis forme approchante, exclusions de l'étude respectées), l'offre de
  // prêt à part ; ou null.
  function pieceDePieceJointe(nom, checklist, estExclu) {
    const nn = normaliserNomPourMotif(String(nom || ''));
    if (nomDitOffrePret(nn)) return { cle: 'offrePret', label: 'Offre de prêt', offre: true };
    // Nom exact d'abord, puis forme approchante (même règle que le parcours du NAS).
    for (const niveau of ['exact', 'approche']) {
      for (const p of checklist || []) {
        if (correspondancePieceNom(p, nn) !== niveau) continue;
        if (estExclu && estExclu(p.cle, nn)) continue;
        return { cle: p.cle, label: p.label, offre: false };
      }
    }
    return null;
  }

  // Pure : rubriques du NAS où ranger une pièce (celles de Claire Scan pour la même pièce, sinon celles
  // des pièces de la checklist que Claire Scan ne reconnaît pas).
  function rubriquesPourPiece(cle) {
    const t = TYPES_SCAN.find(x => x.piece === cle || x.cle === cle);
    if (t && t.rubriques) return t.rubriques.slice();
    return (RUBRIQUES_PIECES_HORS_SCAN[cle] || []).slice();
  }

  // Rubriques des pièces de la checklist absentes de TYPES_SCAN (rangées comme leurs voisines : entretien
  // et justificatifs en « AAE », travaux en « TRAVAUX », diagnostics en « DIAGNOSTICS »). Clés de
  // RUBRIQUES_SCANS (server/src/scans.js), essayées dans l'ordre ; aucune trouvée = racine du dossier.
  var RUBRIQUES_PIECES_HORS_SCAN = {
    entretienClim: ['aae'], entretienAdoucisseur: ['aae'], debroussaillage: ['aae'], travauxRemiseEtat: ['travaux', 'aae'],
    miseEnConformite: ['travaux', 'aae'], miseEnConformiteElectricite: ['travaux', 'aae'], miseEnConformiteAssainissement: ['travaux', 'aae'],
    miseEnConformiteGaz: ['travaux', 'aae'], regularisationUrbanisme: ['travaux', 'aae'], consuel: ['travaux', 'aae'], cuveCiterne: ['aae'], debarras: ['aae'], resiliationContrat: ['aae'],
    securitePiscine: ['aae'], attestationConformite: ['travaux', 'aae'], facturesTravaux: ['travaux', 'aae'],
    etatParasitaire: ['diagnostics', 'aae'], auditEnergetique: ['diagnostics', 'aae']
  };

  // Étude 02/10 : « classe les documents dans les bons sous-dossiers, sinon à la racine du dossier ».
  // Une pièce jointe qui n'est pas une pièce de la checklist est rangée d'après son NOM (premier motif
  // trouvé) ; `partie` = pièce d'une personne (identité, état civil, RIB…), rangée chez le vendeur ou
  // l'acquéreur selon l'expéditeur. Rien de reconnu : racine du dossier client.
  var RUBRIQUES_NOM_PIECE_JOINTE = [
    { motif: /\b(offres? (de )?(pret|credit)|contrat de (pret|credit)|accord de pret)\b/, rubriques: ['pret', 'comptabilite'] },
    { motif: /\bpre ?etat date\b/, rubriques: ['preEtatDate', 'copro'] },
    { motif: /\b(etat date|article 20)\b/, rubriques: ['etatDate', 'copro'] },
    { motif: /\b(syndic|copro\w*|assemblee generale|proces verbal|pv (d )?ag|carnet d ?entretien|fiche synthetique|edd|appel de (fonds|charges|provisions?))\b/, rubriques: ['copro'] },
    { motif: /\b(erp|etat des risques|georisques)\b/, rubriques: ['environnement', 'diagnostics', 'aae'] },
    { motif: /\b(dpe|ddt|diag\w*|amiante|plomb|crep|termites?|merule|parasitaire|carrez|boutin|mesurage|superficie|electricite|audit energetique)\b/, rubriques: ['diagnostics', 'aae'] },
    { motif: /\b(titre de propriete|attestation (de propriete|immobiliere)|acte d ?(achat|acquisition)|donation|partage)\b/, rubriques: ['titre'] },
    { motif: /\b(etat hypothecaire|hors formalites?|sur formalites?|publicite fonciere)\b/, rubriques: ['hypotheque'] },
    { motif: /\b(permis de construire|declaration prealable|daact|achevement des travaux|etude (de sol|geotechnique))\b/, rubriques: ['construction', 'travaux', 'aae'] },
    { motif: /\b(factures?|devis|decennale|dommages? ouvrage|travaux|consuel|conformite)\b/, rubriques: ['travaux', 'aae'] },
    { motif: /\b(cni|carte (nationale )?d ?identite|identite|passeport|titre de sejour|permis de conduire|livret de famille|acte de (naissance|mariage|deces)|pacs|contrat de mariage|divorce|rib|iban|releve d ?identite bancaire|justificatif de domicile)\b/, partie: true },
    { motif: /\b(urbanisme|cu|certificat d ?urbanisme|alignement|numerotage|preemption|dia|dpu|assainissement|spanc|safer|servitudes?)\b/, rubriques: ['aae'] },
    { motif: /\b(entretien|ramonage|chaudiere|pompe a chaleur|pac|vidange|fosse|piscine|cuve|citerne|climatisation|adoucisseur|debroussaillage|elagage)\b/, rubriques: ['aae'] },
    { motif: /\b(taxe fonciere|avis tf|decompte|releve de compte|virement|avis d ?operation|appel de fonds)\b/, rubriques: ['comptabilite'] }
  ];

  // Pure : nom de pièce jointe ramené à des mots sans accent ni séparateur (« DPE_Maison-2024.pdf » →
  // « dpe maison 2024 »).
  function motsNomPieceJointe(nom) {
    return String(nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\.[a-z0-9]{2,5}$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Pure : le côté (« vendeur » / « acquereur ») dont l'adresse email a envoyé la pièce, sinon ''.
  function cotePieceJointeExpediteur(d, adresse) {
    const a = String(adresse || '').trim().toLowerCase();
    if (!d || !a) return '';
    const dans = (champ) => destinatairesEmail(champ || '').some(x => x.toLowerCase() === a);
    if (dans(d.emailVendeur)) return 'vendeur';
    if (dans(d.emailAcquereur)) return 'acquereur';
    return '';
  }

  // Pure : rubriques où ranger une pièce jointe — celles de la pièce de la checklist qu'elle désigne,
  // sinon d'après son nom (et l'expéditeur pour une pièce d'une personne) ; [] = racine du dossier.
  function rubriquesPieceJointe(d, nom, piece, expediteur) {
    if (piece) {
      const r = rubriquesPourPiece(piece.cle);
      if (r.length) return r;
    }
    const mots = motsNomPieceJointe([piece && piece.label, nom].filter(Boolean).join(' '));
    const regle = RUBRIQUES_NOM_PIECE_JOINTE.find(x => x.motif.test(mots));
    if (!regle) return [];
    if (regle.partie) {
      const cote = cotePieceJointeExpediteur(d, expediteur);
      return cote ? [cote] : [];
    }
    return regle.rubriques.slice();
  }

  // Pure : où la pièce a été copiée, dit depuis le dossier client (« 9 - AAE », « racine du dossier »).
  function emplacementPieceRangee(d, chemin) {
    const net = (x) => String(x || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const c = net(chemin), base = net(d && d.nasDossier);
    const relatif = base && c.toLowerCase().startsWith(base.toLowerCase() + '/') ? c.slice(base.length + 1) : c;
    const dossier = relatif.split('/').slice(0, -1).join(' › ');
    return dossier || 'racine du dossier';
  }

  // Pure : une pièce jointe non reconnue est-elle rangée seule ? Documents (PDF, Word, Excel) oui ;
  // photos de 30 Ko au moins (une photo de pièce, pas un logo de signature) ; jamais « image001.png ».
  function pieceJointeRangeeSeule(nom, taille) {
    const n = String(nom || '').toLowerCase();
    const ext = (/\.([a-z0-9]+)$/.exec(n) || [])[1] || '';
    if (/^(image\d*|logo|signature|outlook)[\s._-]/.test(n)) return false;
    if (['pdf', 'doc', 'docx', 'odt', 'xls', 'xlsx'].includes(ext)) return true;
    if (['jpg', 'jpeg', 'png', 'tif', 'tiff'].includes(ext)) return Number(taille) >= 30 * 1024;
    return false;
  }

  // Pure : l'état d'un email préparé — envoyé (quand, par qui), en attente dans une boîte lue, ou boîte
  // non lue (accès non donné).
  function etatEmailPrepare(p, boitesEtat) {
    if (p.envoyeLe) return { classe: 'dl-success', texte: `Envoyé le ${dateHeureAppel(Date.parse(p.envoyeLe))}` };
    const boite = Object.entries(boitesEtat || {}).find(([, b]) => b.collaborateur === p.collaborateur);
    if (boite && boite[1].statut === 'refuse') return { classe: 'dl-neutre', texte: `Envois de ${p.collaborateur.split(' ')[0]} non lus` };
    return { classe: 'dl-pret', texte: 'Pas encore retrouvé dans les envois' };
  }

  // Pure : l'expéditeur est-il un confrère (adresse @notaires.fr, notaire participant du dossier, office du
  // carnet) ? Formule « Mon Cher Maître » dans la réponse.
  function expediteurConfrere(d, adresse, carnet) {
    const a = String(adresse || '').trim().toLowerCase();
    if (!a) return false;
    if (/@notaires\.fr$/.test(a)) return true;
    if (d && destinatairesEmail(`${d.emailNotaireParticipant || ''};${d.emailConfrereVendeur || ''}`).some(x => x.toLowerCase() === a)) return true;
    return (carnet || []).some(o => destinatairesEmail(o.email || '').some(x => x.toLowerCase() === a));
  }

  // Pure : documents d'un email reçu, nommés pour la réponse (libellé de la pièce reconnue, sinon nom du
  // fichier sans extension), sans les pièces écartées ni les doublons.
  function documentsEmailRecu(email) {
    const noms = (email && email.pj || []).filter(p => !p.ignoree)
      .map(p => (p.rangee && p.rangee.pieceLabel) || String(p.nom || '').replace(/\.[a-z0-9]{2,5}$/i, '').trim())
      .filter(Boolean);
    return Array.from(new Set(noms));
  }

  // Pure : réponse « accusé de réception » à un email du client (ou d'un confrère) qui nous transmet des
  // documents (étude 02/10). Même objet précédé de « RE: » (retrouvé ainsi dans les « Éléments envoyés »).
  // Texte : premier jet de CLAIRE, à remplacer mot pour mot par celui de l'étude dès qu'elle le donne.
  function construireEmailAccuseReception(d, email, confrere) {
    return emailDepuisModele('accuseReception', d, null, contexteAccuseReception(d, email, confrere));
  }


  // Prépare l'accusé de réception (.eml avec la signature de l'office, ou brouillon selon le poste).
  async function confirmerReceptionEmail(dossierId, emailId) {
    const d = dossiers.find(x => x.id === dossierId);
    const email = d && ((emailsParDossier[dossierId] || {}).emails || []).find(e => e.id === emailId);
    if (!email || !email.de || !email.de.adresse) { afficherToast('Adresse de l’expéditeur inconnue.', 'OK', null); return; }
    const confrere = expediteurConfrere(d, email.de.adresse, carnetConfreres);
    const { sujet, corps } = construireEmailAccuseReception(d, email, confrere);
    const r = await livrerEmailDossier({ destinataire: email.de.adresse, sujet, corps, confrere, responsableSignature: d.responsable, dossierId: d.id, geste: 'accuseReception:' + email.id, reponseA: email.id });
    if (!r.ok) { if (!r.annule) afficherToast(r.message || "L'email n'a pas pu être préparé.", 'OK', null); return; }
    ajouterHistorique(d, `${libelleEmailFait(r)} — accusé de réception des documents de ${email.de.nom || email.de.adresse}`);
    await sauvegarder(d);
    annoncerEmailPret(r, true);
    setTimeout(() => chargerEmailsDossier(dossierId), 800);
  }

  // Pure : date d'un email dans la liste — l'heure s'il est du jour, sinon « 2 oct. », et l'année si ce
  // n'est pas celle en cours.
  function dateCourteEmail(iso, maintenant) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    const dt = new Date(t), n = maintenant ? new Date(maintenant) : new Date();
    const jour = (x) => x.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
    if (jour(dt) === jour(n)) return heureAppel(t);
    const opts = { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' };
    if (dt.toLocaleDateString('fr-FR', { year: 'numeric', timeZone: 'Europe/Paris' }) !== n.toLocaleDateString('fr-FR', { year: 'numeric', timeZone: 'Europe/Paris' })) opts.year = 'numeric';
    return dt.toLocaleDateString('fr-FR', opts);
  }

  // Pure : emails reçus avec des documents dont la réception n'a pas encore été confirmée (30 derniers
  // jours, le plus récent d'abord).
  function emailsAConfirmer(emails, prepares, maintenant) {
    const limite = (maintenant ? Date.parse(maintenant) : Date.now()) - 30 * 86400000;
    const faits = new Set((prepares || []).map(p => String(p.geste || '')).filter(g => g.startsWith('accuseReception:')).map(g => g.slice('accuseReception:'.length)));
    return (emails || []).filter(e => e.sens === 'recu' && e.de && e.de.adresse && documentsEmailRecu(e).length
      && !faits.has(e.id) && Date.parse(e.date) >= limite);
  }

  // Une pièce jointe dans la fenêtre de lecture : l'ouvrir, où elle a été rangée, ou « Ranger… ».
  function htmlPieceJointeEmail(d, e, pj, checklist) {
    const ouvrir = `<button type="button" class="lien-action email-pj-nom" onclick="ouvrirPieceJointeEmail('${escapeOnclickArg(e.id)}', '${escapeOnclickArg(pj.id)}')" title="Ouvrir la pièce jointe">${icone('file-text')}${escapeHtml(pj.nom)}</button>`;
    if (pj.rangee) return `<span class="email-pj">${ouvrir}<span class="dot-label dl-success" title="${escapeAttr(pj.rangee.chemin || '')}"><span class="dot"></span>${escapeHtml(pj.rangee.pieceLabel ? pj.rangee.pieceLabel + ' — ' : 'Rangée — ')}${escapeHtml(emplacementPieceRangee(d, pj.rangee.chemin))}</span></span>`;
    if (pj.ignoree || e.sens !== 'recu') return `<span class="email-pj${pj.ignoree ? ' email-pj-ecartee' : ''}">${ouvrir}</span>`;
    const piece = pieceDePieceJointe(pj.nom, checklist, (cle, nn) => estNomExcluPourPiece(cle, nn));
    const geste = !d.nasDossier
      ? (piece && !piece.offre ? `<button type="button" class="lien-action" onclick="cocherPieceDepuisEmail('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(piece.cle)}', '${escapeOnclickArg(pj.nom)}')">Cocher « ${escapeHtml(piece.label)} » reçue</button>` : '')
      : `<select class="email-pj-ranger" aria-label="Ranger la pièce jointe dans le dossier" onchange="rangerPieceJointeEmail('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(e.id)}', '${escapeOnclickArg(pj.id)}', this.value, false)">
          <option value="">${pj.echec ? 'Échec — ranger…' : 'Ranger…'}</option>
          ${piece ? `<option value="${escapeAttr(piece.cle)}">Comme « ${escapeHtml(piece.label)} »</option>` : ''}
          ${checklist.filter(p => !piece || p.cle !== piece.cle).map(p => `<option value="${escapeAttr(p.cle)}">${escapeHtml(p.label)}</option>`).join('')}
          <option value="__nom">Sous son nom</option>
          <option value="__ecarter">Pas une pièce du dossier</option>
        </select>`;
    return `<span class="email-pj">${ouvrir}${geste}</span>`;
  }

  // Filtre de la liste par dossier : sens (tous, reçus, envoyés) et nombre de lignes montrées.
  const filtresEmailsDossier = {};
  var EMAILS_PAR_PAGE = 8;
  function voirPlusEmails(dossierId) {
    const f = filtresEmailsDossier[dossierId] || { sens: 'tous', n: EMAILS_PAR_PAGE };
    filtresEmailsDossier[dossierId] = { ...f, n: f.n + 20 };
    render();
  }
  // Recherche dans la liste sans re-rendu (le champ garde le focus) : tout ce qui correspond est montré.
  function rechercherEmailsDossier(champ) {
    const bloc = champ.closest('.emails-dossier');
    if (!bloc) return;
    const q = normaliserPourRecherche(champ.value || '').trim();
    let vus = 0;
    bloc.querySelectorAll('.email-rang').forEach((li) => {
      const ok = q ? li.dataset.texte.includes(q) : li.dataset.page === '1';
      li.hidden = !ok;
      if (ok) vus++;
    });
    const plus = bloc.querySelector('.emails-plus');
    if (plus) plus.hidden = !!q;
    const vide = bloc.querySelector('.emails-aucun');
    if (vide) vide.hidden = vus > 0;
  }

  // Onglet Échanges, bloc « Emails » (étude 02/10 : « pour un dossier on peut recevoir une multitude
  // d'emails ; allège ») : une ligne par email (destinataire, objet, pièces jointes, date), recherche, 8 lignes puis « Voir plus » ;
  // le texte entier dans la fenêtre de lecture.
  // Emails REÇUS plus montrés (étude 07/10 : « retire les emails reçus de CLAIRE ; garde juste la lecture des emails pour
  // déclencher des choses mais ne les affiche plus dans Échanges ; laisse l'envoi d'email depuis CLAIRE dans une fenêtre ») : le
  // serveur les lit toujours (rattachement, adresses des confrères, réponses aux sondages, envoi retrouvé), le bloc ne liste plus que
  // les emails envoyés et ceux préparés pas encore retrouvés — ni « Confirmer la réception », ni « À répondre », ni filtres.
  function renderEmailsDossier(d) {
    if (!(d.id in emailsParDossier)) { chargerEmailsDossier(d.id); return ''; }
    const donnees = emailsParDossier[d.id];
    if (!donnees) return '';
    const { prepares, etat } = donnees;
    const emails = (donnees.emails || []).filter(e => e && e.sens !== 'recu');
    const enAttente = prepares.filter(p => !p.envoyeLe && !String(p.geste || '').startsWith('accuseReception:'));
    if (!emails.length && !enAttente.length) return '';
    const f = filtresEmailsDossier[d.id] || { sens: 'tous', n: EMAILS_PAR_PAGE };
    const liste = emails;
    const ligne = (e, i) => {
      const qui = `À ${e.a[0] || '—'}${e.a.length > 1 ? ` +${e.a.length - 1}` : ''}`;
      const pjs = e.pj.filter(p => !p.ignoree).length;
      const texte = normaliserPourRecherche([qui, e.objet, e.resume, e.de.adresse, ...e.pj.map(p => p.nom)].filter(Boolean).join(' '));
      return `<li class="email-rang" data-texte="${escapeAttr(texte)}" data-page="${i < f.n ? '1' : '0'}"${i < f.n ? '' : ' hidden'}>
          <button type="button" class="email-rang-btn email-${e.sens}" onclick="ouvrirEmailComplet('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(e.id)}')" title="Lire l’email en entier">
            <span class="email-rang-sens" aria-label="Envoyé">${icone('upload')}</span>
            <span class="email-rang-qui">${escapeHtml(qui)}</span>
            <span class="email-rang-corps"><span class="email-rang-objet">${escapeHtml(e.objet || '(sans objet)')}</span>${e.resume ? `<span class="email-rang-resume">${escapeHtml(e.resume)}</span>` : ''}</span>
            <span class="email-rang-meta">${pjs ? `<span class="email-rang-pj" title="${pjs} pièce${pjs > 1 ? 's' : ''} jointe${pjs > 1 ? 's' : ''}">${icone('file-text')}${pjs}</span>` : ''}<span class="email-rang-date">${escapeHtml(dateCourteEmail(e.date))}</span></span>
          </button>
        </li>`;
    };
    const attente = enAttente.length ? `<details class="appels-plus emails-attente"><summary>${enAttente.length} email${enAttente.length > 1 ? 's' : ''} préparé${enAttente.length > 1 ? 's' : ''}, pas encore retrouvé${enAttente.length > 1 ? 's' : ''} dans les envois</summary><ul class="appels-liste">${enAttente.map(p => {
      const st = etatEmailPrepare(p, etat && etat.envoyes);
      const retirer = p.envoyeLe ? '' : `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" onclick="retirerEmailPrepare('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.id)}')" title="Retirer : cet email n’a pas été envoyé (brouillon Outlook fermé sans enregistrer)" aria-label="Retirer cet email préparé">${icone('x')}</wa-button>`;
      return `<li><span class="appels-quand">${escapeHtml(dateCourteEmail(p.prepareLe))}</span><span>${escapeHtml(p.objet)}</span><span class="dot-label ${st.classe}"><span class="dot"></span>${escapeHtml(st.texte)}</span>${retirer}</li>`;
    }).join('')}</ul></details>` : '';
    const reste = liste.length - Math.min(f.n, liste.length);
    return `<div class="emails-dossier">
        <div class="emails-tete">
          <span class="section-eyebrow">Emails envoyés <span class="jour-onglet-nb">${emails.length}</span> ${infoBulle('Emails envoyés par l’office et les collaborateurs à une adresse de ce dossier, relevés chaque minute. Les emails reçus ne sont plus affichés : CLAIRE les lit seulement pour reconnaître les réponses et les envois.')}</span>
          ${emails.length > EMAILS_PAR_PAGE ? `<input type="search" class="emails-recherche" placeholder="Rechercher un email" aria-label="Rechercher dans les emails du dossier" oninput="rechercherEmailsDossier(this)">` : ''}
        </div>
        <ul class="emails-liste">${liste.map(ligne).join('')}</ul>
        <p class="hint emails-aucun" hidden>Aucun email ne correspond.</p>
        ${reste > 0 ? `<button type="button" class="lien-discret emails-plus" onclick="voirPlusEmails('${escapeOnclickArg(d.id)}')">Voir ${Math.min(reste, 20)} de plus${reste > 20 ? ` (${reste} en tout)` : ''}</button>` : ''}
        ${attente}
      </div>`;
  }

  async function chargerEmailsDossier(id) {
    emailsParDossier[id] = null;
    try {
      const r = await fetchAvecAuth('/api/emails-dossiers?dossierId=' + encodeURIComponent(id));
      if (!r.ok) return;
      emailsParDossier[id] = await r.json();
      if (emailsParDossier[id].emails.length || emailsParDossier[id].prepares.length) render();
    } catch (e) { /* réessayé à la prochaine ouverture */ }
  }

  // Fiche ouverte : ses emails relus sans vider le bloc (pas de clignotement), rendu seulement s'ils ont changé.
  async function rafraichirEmailsFicheOuverte() {
    const id = dossierOuvert;
    if (!id || !(id in emailsParDossier) || !emailsParDossier[id]) return;
    try {
      const r = await fetchAvecAuth('/api/emails-dossiers?dossierId=' + encodeURIComponent(id));
      if (!r.ok) return;
      const neuf = await r.json();
      const avant = JSON.stringify(emailsParDossier[id]);
      emailsParDossier[id] = neuf;
      if (JSON.stringify(neuf) !== avant && dossierOuvert === id) render();
    } catch (e) { /* tour suivant */ }
  }

  // Lecture d'un email en entier (étude 02/10 : « lisibles en entier dans CLAIRE ») : relu dans Exchange à
  // chaque ouverture, jamais gardé ; affiché en texte (jamais le HTML de l'expéditeur dans la page).
  async function ouvrirEmailComplet(dossierId, emailId) {
    const d = dossiers.find(x => x.id === dossierId);
    const donnees = emailsParDossier[dossierId] || {};
    const email = (donnees.emails || []).find(e => e.id === emailId);
    const overlay = document.getElementById('email-lecture-overlay');
    const zone = document.getElementById('email-lecture-contenu');
    if (!overlay || !zone || !email) return;
    if (redaction && redaction.mode === 'reponse') fermerRedaction({ ok: false, annule: true });
    const recu = email.sens === 'recu';
    const nom = recu ? (email.de.nom || email.de.adresse) : (email.collaborateur || email.de.nom || email.de.adresse || 'Office');
    const checklist = d ? checklistPieces(d.typeVente, d) : [];
    const pjs = email.pj.length ? `<div class="email-pjs email-lecture-pjs">${email.pj.map(pj => d ? htmlPieceJointeEmail(d, email, pj, checklist) : '').join('')}</div>` : '';
    const prep = (donnees.prepares || []).find(p => p.geste === 'accuseReception:' + email.id);
    const aRepondre = d && emailARepondre(email, donnees.emails, donnees.prepares);
    const pastille = prep ? `<span class="email-etat email-etat-fait">Réception confirmée</span>`
      : aRepondre ? `<span class="email-etat">À répondre</span>` : '';
    const accuse = d && recu && documentsEmailRecu(email).length
      ? `<wa-button appearance="plain" size="s" type="button" class="bouton-discret icon-btn email-barre-action" onclick="fermerEmailComplet(); confirmerReceptionEmail('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(email.id)}')" title="${prep ? 'Renvoyer la confirmation de réception' : 'Confirmer la réception des documents'}">${icone('check')}<span>${prep ? 'Reconfirmer' : 'Confirmer la réception'}</span></wa-button>` : '';
    const message = (texte, a) => `
      <div class="email-message">
        <span class="email-avatar${recu ? '' : ' email-avatar-office'}" aria-hidden="true">${escapeHtml(initialesPersonne(nom))}</span>
        <div class="email-message-corps">
          <div class="email-message-tete"><span class="email-message-nom">${escapeHtml(nom)}</span><span class="email-message-date">${escapeHtml(dateHeureAppel(Date.parse(email.date)))}</span></div>
          <div class="email-lecture-meta">${recu ? escapeHtml(email.de.adresse) : ''}${(a || email.a || []).length ? `${recu ? ' · ' : ''}À ${escapeHtml((a || email.a).join(', '))}` : ''}</div>
          ${texte}
          ${pjs}
        </div>
      </div>`;
    zone.innerHTML = `
      <div class="email-lecture-barre">
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="fermerEmailComplet()" aria-label="Fermer">${icone('chevron-left')}</wa-button>
        ${accuse}
        <span class="email-lecture-barre-espace"></span>
        ${d ? `<span class="redaction-dossier">${escapeHtml(libelleDossierAffiche(d))}</span>` : ''}
      </div>
      <div class="email-lecture-titre-ligne"><div class="poste-titre" id="email-lecture-titre">${escapeHtml(email.objet || '(sans objet)')}</div>${pastille}</div>
      <div class="email-lecture-fil">${message('<p class="hint">Lecture de l’email dans la messagerie…</p>', null)}</div>
      <div id="email-reponse-zone"></div>`;
    overlay.style.display = 'flex';
    const zoneReponse = document.getElementById('email-reponse-zone');
    if (d && recu && email.de && email.de.adresse && zoneReponse) {
      zoneReponse.dataset.dossier = d.id; zoneReponse.dataset.email = email.id; zoneReponse.dataset.nom = email.de.nom || email.de.adresse;
      renderInviteReponse();
    }
    const fil = zone.querySelector('.email-lecture-fil');
    try {
      const r = await fetchAvecAuth('/api/emails-dossiers/contenu?emailId=' + encodeURIComponent(emailId));
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corps.erreur || 'statut ' + r.status);
      if (fil) fil.innerHTML = message(`<div class="email-lecture-texte">${escapeHtml(String(corps.texte || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || '(email sans texte)')}</div>`, corps.a);
    } catch (e) {
      if (fil) fil.innerHTML = message(`<p class="hint">Email illisible : ${escapeHtml(e.message)}</p>`, null);
    }
  }
  // La fenêtre de lecture ouverte sur cet email : ses pièces jointes redessinées (après un rangement).
  function rafraichirPiecesJointesLecture(dossierId, emailId) {
    const overlay = document.getElementById('email-lecture-overlay');
    const zone = document.querySelector('#email-lecture-contenu .email-lecture-pjs');
    const d = dossiers.find(x => x.id === dossierId);
    const email = ((emailsParDossier[dossierId] || {}).emails || []).find(e => e.id === emailId);
    if (!overlay || overlay.style.display === 'none' || !zone || !d || !email) return;
    const checklist = checklistPieces(d.typeVente, d);
    zone.innerHTML = email.pj.map(pj => htmlPieceJointeEmail(d, email, pj, checklist)).join('');
  }

  function fermerEmailComplet() {
    if (redaction && redaction.mode === 'reponse') fermerRedaction({ ok: false, annule: true });
    const overlay = document.getElementById('email-lecture-overlay');
    if (overlay) overlay.style.display = 'none';
    const zone = document.getElementById('email-lecture-contenu');
    if (zone) zone.innerHTML = ''; // le texte ne reste pas dans la page
  }
  // Échap ferme la seule fenêtre de lecture, pas la fiche ouverte derrière (écouteur en capture).
  window.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('email-lecture-overlay');
    if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') { e.stopPropagation(); fermerEmailComplet(); }
  }, true);

  async function ouvrirPieceJointeEmail(emailId, pjId) {
    const fenetre = window.open('', '_blank');
    try {
      const r = await fetchAvecAuth(`/api/emails-dossiers/pj?emailId=${encodeURIComponent(emailId)}&pjId=${encodeURIComponent(pjId)}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || 'statut ' + r.status);
      // Audit 13/10 (Haut) : seuls PDF, images et texte brut s'ouvrent dans un onglet (type décidé par le serveur) ; le reste — une
      // page HTML, un SVG — se télécharge, jamais interprété avec l'origine de CLAIRE.
      const type = String(r.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      const ouvrable = type === 'application/pdf' || /^image\/(png|jpeg|gif|webp|bmp|tiff)$/.test(type) || type === 'text/plain';
      const blob = new Blob([await r.blob()], { type: ouvrable ? type : 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      if (!ouvrable) {
        if (fenetre) fenetre.close();
        const nom = decodeURIComponent((/filename\*=UTF-8''([^;]+)/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'piece-jointe');
        const lien = document.createElement('a');
        lien.href = url; lien.download = nom; document.body.appendChild(lien); lien.click(); lien.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }
      if (fenetre) fenetre.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (fenetre) fenetre.close();
      afficherToast('Pièce jointe impossible à ouvrir : ' + e.message, 'OK', null);
    }
  }

  // Pièce jointe → pièce cochée reçue sur la fiche (rangée sur le NAS, ou simple coche sans NAS).
  async function enregistrerPieceDepuisEmail(d, piece, chemin, auto) {
    if (!d || !piece || piece.offre) return;
    d.pieces = d.pieces || {};
    d.pieces[piece.cle] = 'recue';
    if (chemin) memoriserFichierTrouve(d, NAS_CLE_PIECE(piece.cle), String(chemin).replace(/\\/g, '/'));
    else d.piecesValideesManuellement = Array.from(new Set([...(d.piecesValideesManuellement || []), piece.cle]));
    d.piecesTrouveesLe = Object.assign({}, d.piecesTrouveesLe, { [piece.cle]: new Date().toISOString() });
    d.piecesNotifications = Array.from(new Set([...(d.piecesNotifications || []), piece.cle]));
    ajouterHistorique(d, `Pièce reçue par email : « ${piece.label} »${chemin ? (auto ? ', rangée automatiquement sur le NAS' : ', rangée sur le NAS') : ''}`, { auto });
    await sauvegarder(d);
    render();
    notifierNouvellesPiecesTrouvees(d, [piece.cle]);
    notifierNavigateurPieces(d, [piece.cle]);
    signalerSiDossierDevenuComplet(d);
  }

  async function cocherPieceDepuisEmail(dossierId, cle, nomPj) {
    const d = dossiers.find(x => x.id === dossierId);
    const p = d && checklistPieces(d.typeVente, d).find(x => x.cle === cle);
    if (!p) return;
    await enregistrerPieceDepuisEmail(d, { cle: p.cle, label: p.label }, null, false);
    afficherToast(`« ${p.label} » cochée reçue (${nomPj}).`, 'OK', null);
  }

  // Range une pièce jointe dans le dossier du NAS : comme une pièce de la checklist (nommée de son
  // libellé, pour que le parcours du NAS la retrouve), sous son nom, ou l'écarte.
  async function rangerPieceJointeEmail(dossierId, emailId, pjId, choix, auto) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !choix) return false;
    const email = ((emailsParDossier[dossierId] || {}).emails || []).find(e => e.id === emailId);
    const pj = email && email.pj.find(p => p.id === pjId);
    const expediteur = email && email.sens === 'recu' && email.de ? email.de.adresse : '';
    if (choix === '__ecarter') {
      await fetchAvecAuth('/api/emails-dossiers/pj/marquer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailId, pjId, ignoree: true }) }).catch(() => null);
      await chargerEmailsDossier(dossierId);
      render();
      rafraichirPiecesJointesLecture(dossierId, emailId);
      return false;
    }
    const checklist = checklistPieces(d.typeVente, d);
    const p = choix === '__nom' ? null : (choix === 'offrePret' ? { cle: 'offrePret', label: 'Offre de prêt', offre: true } : checklist.find(x => x.cle === choix));
    const piece = p ? { cle: p.cle, label: p.label, offre: !!p.offre } : null;
    try {
      if (pj && pj.echec && !auto) await fetchAvecAuth('/api/emails-dossiers/pj/marquer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailId, pjId, retenter: true }) });
      const r = await fetchAvecAuth('/api/emails-dossiers/pj/ranger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        emailId, pjId, dossierNas: d.nasDossier, rubriques: rubriquesPieceJointe(d, pj ? pj.nom : '', piece, expediteur),
        nomCible: piece ? piece.label : (pj ? pj.nom.replace(/\.[a-z0-9]{2,5}$/i, '') : ''), pieceCle: piece ? piece.cle : '', pieceLabel: piece ? piece.label : '', auto: !!auto
      }) });
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corps.erreur || 'statut ' + r.status);
      if (!corps.deja && piece) await enregistrerPieceDepuisEmail(d, piece, corps.chemin, auto);
      else if (!corps.deja) {
        ajouterHistorique(d, `Pièce jointe « ${pj ? pj.nom : ''} » rangée sur le NAS (${emplacementPieceRangee(d, corps.chemin)})${auto ? ', automatiquement' : ''}`, { auto });
        await sauvegarder(d);
      }
      if (!auto) afficherToast(`Pièce jointe rangée : ${emplacementPieceRangee(d, corps.chemin)}`, 'OK', null);
      await chargerEmailsDossier(dossierId);
      render();
      if (!auto) rafraichirPiecesJointesLecture(dossierId, emailId);
      return true;
    } catch (e) {
      if (!auto) afficherToast('Rangement impossible : ' + e.message, 'OK', null);
      await chargerEmailsDossier(dossierId);
      render();
      return false;
    }
  }

  // Rangement automatique : toutes les pièces jointes reçues (reconnues ou non, voir pieceJointeRangeeSeule),
  // dans les dossiers en cours reliés au NAS — seulement si le réglage « Ranger seul les pièces jointes » est
  // allumé (éteint par défaut, étude 03/10 : « pas encore au point » ; le serveur rend alors une liste vide). Une à la fois ; le serveur garantit qu'une pièce jointe n'est rangée qu'une fois (même avec
  // plusieurs fenêtres ouvertes) et marque un échec, jamais retenté seul.
  let rangementEmailsEnCours = false;
  async function rangerPiecesJointesReconnues() {
    if (rangementEmailsEnCours || !utilisateurPoste) return;
    rangementEmailsEnCours = true;
    try {
      const r = await fetchAvecAuth('/api/emails-dossiers/pieces-jointes');
      if (!r.ok) return;
      const { piecesJointes } = await r.json();
      for (const x of piecesJointes || []) {
        const d = dossiers.find(y => y.id === x.dossierId);
        if (!d || d.archive || !d.nasDossier || d.roleNotaire === 'participant') continue;
        const piece = pieceDePieceJointe(x.nom, checklistPieces(d.typeVente, d), (cle, nn) => estNomExcluPourPiece(cle, nn));
        // Non reconnue : rangée quand même (étude 02/10), sous son nom, dans le sous-dossier que son nom
        // désigne, sinon à la racine du dossier client.
        if (!piece && !pieceJointeRangeeSeule(x.nom, x.taille)) continue;
        if (!(d.id in emailsParDossier) || !emailsParDossier[d.id]) await chargerEmailsDossier(d.id);
        await rangerPieceJointeEmail(d.id, x.emailId, x.pjId, piece ? piece.cle : '__nom', true);
      }
    } catch (e) { /* tour suivant */ } finally { rangementEmailsEnCours = false; }
  }

  // Un email préparé par CLAIRE est noté sur le serveur : retrouvé dans les « Éléments envoyés », il
  // passe « envoyé le … ».
  function noterEmailPrepare({ dossierId, sujet, destinataire, geste }) {
    if (!sujet) return;
    fetchAvecAuth('/api/emails-prepares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      dossierId: dossierId || '', objet: sujet, destinataires: destinatairesEmail(destinataire || ''), collaborateur: utilisateurPoste || '', geste: geste || ''
    }) }).then(() => { if (dossierId) delete emailsParDossier[dossierId]; }).catch(() => {});
  }

  // L'email préparé n'a jamais été envoyé (le brouillon d'Outlook se ferme sans rien garder) : on le retire de la liste.
  async function retirerEmailPrepare(dossierId, id) {
    try {
      const r = await fetchAvecAuth('/api/emails-prepares/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error();
    } catch (e) { afficherToast('Impossible de retirer cet email pour le moment.'); return; }
    delete emailsParDossier[dossierId];
    render();
  }

  // Réglages › Agenda et Outlook › Emails des dossiers : boîtes lues et leur état.
  async function renderReglagesEmailsDossiers() {
    const zone = document.getElementById('reglages-emails-dossiers');
    if (!zone) return;
    let e;
    try {
      const r = await fetchAvecAuth('/api/emails-dossiers/etat');
      if (!r.ok) throw new Error();
      e = await r.json();
    } catch (_) { zone.innerHTML = '<p class="hint">État indisponible.</p>'; return; }
    const ligneBoite = (titre, b) => {
      const st = b.statut === 'ok' ? ['dl-success', `Lue ${b.luLe ? ilYaActivite(b.luLe, Date.now()) : ''}`]
        : b.statut === 'refuse' ? ['dl-pret', 'Accès non donné au compte relié']
        : b.statut === 'erreur' ? ['dl-urgent', b.message || 'Erreur de lecture'] : ['dl-neutre', 'Pas encore lue'];
      return `<li class="emails-boite"><span>${escapeHtml(titre)}</span><span class="dot-label ${st[0]}"><span class="dot"></span>${escapeHtml(st[1])}</span></li>`;
    };
    zone.innerHTML = `
      <label class="reglages-option" for="emails-dossiers-actif">
        <span class="reglages-option-texte"><span class="reglages-option-titre">Lire les emails des dossiers</span></span>
        <wa-switch class="switch reglages-switch" id="emails-dossiers-actif" ${e.reglages.actif ? 'checked' : ''} onchange="basculerEmailsDossiers({ actif: this.checked })"></wa-switch>
      </label>
      <ul class="emails-boites">
        ${ligneBoite('Boîte de réception du compte relié', e.recus || {})}
        ${(e.envoyes || []).map(b => ligneBoite(`Éléments envoyés — ${b.collaborateur}`, b)).join('')}
      </ul>
      <p class="hint">${e.nombre.recus} reçu(s) et ${e.nombre.envoyes} envoyé(s) rattachés aux dossiers${e.dernierTour ? ` · dernier tour ${escapeHtml(ilYaActivite(e.dernierTour, Date.now()))}` : ''}${e.erreur ? ` · ${escapeHtml(e.erreur)}` : ''}</p>
      <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="lireEmailsDossiersMaintenant(this)">Lire maintenant</wa-button>`;
    // Retirés le 13/10 (tri des réglages, étude) : « Ranger seul les pièces jointes sur le NAS » (coupé depuis le 03/10, emails reçus plus
    // affichés depuis le 07/10) et « Écartés du résumé du matin » (résumé retiré le 07/10). Le code serveur reste, pour les rétablir.
  }

  async function basculerEmailsDossiers(reglage) {
    await fetchAvecAuth('/api/emails-dossiers/reglages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reglage || {}) }).catch(() => null);
    renderReglagesEmailsDossiers();
  }

  async function lireEmailsDossiersMaintenant(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Lecture…'; }
    try {
      const r = await fetchAvecAuth('/api/emails-dossiers/lire', { method: 'POST' });
      const x = await r.json().catch(() => ({}));
      afficherToast(x.erreur ? 'Lecture des emails : ' + x.erreur : `Emails lus : ${x.recus || 0} reçu(s), ${x.envoyes || 0} envoyé(s), ${x.confirmes || 0} envoi(s) confirmé(s).`, 'OK', null);
      Object.keys(emailsParDossier).forEach(k => delete emailsParDossier[k]);
      rangerPiecesJointesReconnues();
    } catch (e) { afficherToast('Serveur injoignable.', 'OK', null); }
    renderReglagesEmailsDossiers();
  }

  // Réglages › Agenda et Outlook › Rangement dans Outlook (étude 19/10) : règles, état du dernier tour, emails déplacés.
  async function renderReglagesRangementOutlook() {
    const zone = document.getElementById('reglages-rangement-outlook');
    if (!zone) return;
    let e;
    try {
      const r = await fetchAvecAuth('/api/rangement-outlook');
      if (!r.ok) throw new Error();
      e = await r.json();
    } catch (_) { zone.innerHTML = '<p class="hint">État indisponible.</p>'; return; }
    adressesRangementOutlook = Array.isArray(e.expediteurs) ? e.expediteurs.slice() : [];
    const st = e.statut === 'ok' ? ['dl-success', `Dernier tour ${e.dernierTour ? ilYaActivite(e.dernierTour, Date.now()) : ''}`]
      : e.statut === 'introuvable' || e.statut === 'erreur' ? ['dl-urgent', e.message || 'Erreur'] : ['dl-neutre', 'Pas encore lancé'];
    zone.innerHTML = `
      <label class="reglages-option" for="rangement-outlook-actif">
        <span class="reglages-option-texte"><span class="reglages-option-titre">Déplacer dans « ${escapeHtml(e.dossier)} »</span></span>
        <wa-switch class="switch reglages-switch" id="rangement-outlook-actif" ${e.actif ? 'checked' : ''} onchange="basculerRangementOutlook(this.checked)"></wa-switch>
      </label>
      <ul class="emails-boites">
        ${(e.regles || []).map(x => `<li class="emails-boite"><span>${escapeHtml(x.libelle)}</span><span class="hint" style="margin:0;">${(e.ranges && e.ranges[x.id]) || 0} déplacé(s)</span></li>`).join('')}
      </ul>
      <div class="reglages-champ">
        <div class="reglages-champ-libelle"><label for="rangement-outlook-adresse">Autres expéditeurs à ranger</label>${infoBulle('Les emails reçus de ces adresses vont aussi dans « Traité à distance ».')}</div>
        <div class="rangement-adresses">
          ${(e.expediteurs || []).map(a => `<span class="rangement-adresse">${escapeHtml(a)}<wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Retirer cette adresse" aria-label="Retirer ${escapeAttr(a)}" onclick="retirerAdresseRangementOutlook('${escapeOnclickArg(a)}')">${icone('x')}</wa-button></span>`).join('')}
          <input type="email" id="rangement-outlook-adresse" placeholder="facturation@exemple.fr" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();ajouterAdresseRangementOutlook();}">
          <wa-button appearance="outlined" size="s" type="button" onclick="ajouterAdresseRangementOutlook()">Ajouter</wa-button>
        </div>
      </div>
      <p class="hint"><span class="dot-label ${st[0]}"><span class="dot"></span>${escapeHtml(st[1])}</span>${e.depuis ? ` · emails reçus depuis le ${escapeHtml(formatDateHeureCourte(e.depuis))}` : ''}${e.echecs ? ` · ${e.echecs} refusé(s), réessai dans 6 h` : ''}</p>
      <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="rangerOutlookMaintenant(this)">Ranger maintenant</wa-button>`;
  }

  let adressesRangementOutlook = [];
  async function enregistrerAdressesRangementOutlook(liste) {
    try {
      const r = await fetchAvecAuth('/api/rangement-outlook/reglages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expediteurs: liste }) });
      if (!r.ok) throw new Error();
    } catch (_) { afficherToast('Adresse non enregistrée : serveur injoignable.', 'OK', null); }
    renderReglagesRangementOutlook();
  }
  function ajouterAdresseRangementOutlook() {
    const champ = document.getElementById('rangement-outlook-adresse');
    const a = String((champ && champ.value) || '').trim().toLowerCase();
    if (!/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(a)) { afficherToast('Adresse email invalide.', 'OK', null); return; }
    enregistrerAdressesRangementOutlook(adressesRangementOutlook.filter(x => x !== a).concat(a));
  }
  function retirerAdresseRangementOutlook(adresse) {
    enregistrerAdressesRangementOutlook(adressesRangementOutlook.filter(x => x !== adresse));
  }

  async function basculerRangementOutlook(actif) {
    await fetchAvecAuth('/api/rangement-outlook/reglages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actif: !!actif }) }).catch(() => null);
    renderReglagesRangementOutlook();
  }

  async function rangerOutlookMaintenant(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Rangement…'; }
    try {
      const r = await fetchAvecAuth('/api/rangement-outlook/ranger', { method: 'POST' });
      const x = await r.json().catch(() => ({}));
      afficherToast(x.erreur ? 'Rangement dans Outlook : ' + x.erreur : `${x.ranges || 0} email(s) déplacé(s) dans Outlook.`, 'OK', null);
    } catch (_) { afficherToast('Serveur injoignable.', 'OK', null); }
    renderReglagesRangementOutlook();
  }

  // Pure : l'adresse du serveur à donner à 3CX. Ouverte sur localhost (fenêtre du poste serveur),
  // l'adresse de la page ne mène au serveur que depuis ce poste : on prend son adresse sur le réseau
  // du bureau (192.168.… d'abord), même port.
  function origineServeurPour3cx(loc, adresses) {
    const hote = String(loc && loc.hostname || '');
    if (!/^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i.test(hote)) return loc.origin;
    const liste = (adresses || []).filter(Boolean);
    const ip = liste.find(a => /^192\.168\./.test(a)) || liste.find(a => /^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(a)) || liste[0];
    return ip ? `${loc.protocol}//${ip}${loc.port ? ':' + loc.port : ''}` : loc.origin;
  }

  let origine3cx = '';

  // Pure : l'état d'un poste pour 3CX (Réglages) — sa fenêtre CLAIRE relève-t-elle ses appels, et quand
  // 3CX a-t-il ouvert son adresse pour la dernière fois. Sépare une panne de 3CX d'une panne de CLAIRE.
  function etatPoste3cx(info, maintenantMs) {
    const i = info || {};
    const fenetre = i.fenetre
      ? { classe: 'dl-success', texte: 'Fenêtre CLAIRE ouverte' + (i.visible ? '' : ' (en arrière-plan)') }
      : { classe: 'dl-neutre', texte: 'Fenêtre CLAIRE fermée sur ce poste' };
    const sonnerie = i.derniereSonnerie
      ? { classe: 'dl-success', texte: `Dernière sonnerie reçue de 3CX : ${ilYaActivite(i.derniereSonnerie, maintenantMs)}` }
      : { classe: 'dl-pret', texte: 'Aucune sonnerie reçue de 3CX' };
    return [fenetre, sonnerie];
  }

  // Réglages › Téléphonie 3CX : l'adresse de chaque collaborateur pour 3CX, et les derniers appels notés.
  // Pure : la page est-elle affichée dans la fenêtre « application » (raccourci CLAIRE, --app) plutôt que dans un onglet ?
  function fenetreApplicationClaire(standalone, toolbarVisible) {
    return !!standalone || toolbarVisible === false;
  }

  // Appels 3CX : fenêtre CLAIRE au premier plan (étude 12/10 : « trouve un autre moyen pour ce relais » — Panda bloque le .vbs
  // du 07/10 et CLAIRE-relais.exe ; choix : un fichier .reg). Le fichier déclare le lien « claire-devant: », ouvert par
  // PowerShell de Windows, sans programme ni script sur le disque (server/src/relaisAppelReg.js).
  async function telechargerRelaisAppel3cx() {
    if (!utilisateurPoste) { afficherToast('Choisissez d’abord le collaborateur de ce poste.', 'OK', null); return; }
    try {
      const r = await fetchAvecAuth('/api/appels/relais/installateur?poste=' + encodeURIComponent(clePosteAppels(utilisateurPoste)));
      if (!r.ok) throw new Error('statut ' + r.status);
      const blob = await r.blob();
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = 'CLAIRE-appels-3CX.reg';
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
      afficherInfoAction('Fichier téléchargé', 'Ouvrez CLAIRE-appels-3CX.reg (double-clic), puis « Oui » à l’Éditeur du Registre : aucun programme n’est installé. Fermez ensuite Chrome et Edge entièrement, puis rouvrez-les : le fichier autorise aussi le navigateur à ouvrir le lien « claire-devant » depuis CLAIRE sans le demander à chaque appel (visible dans chrome://policy). Si la question revient malgré tout, le fichier « autorisation » (administrateur, Fichorga) la supprime pour tout le poste. Ensuite, à chaque sonnerie, l’onglet de 3CX se ferme et la fenêtre CLAIRE passe au premier plan sur l’appel (elle s’ouvre si elle était fermée). Si Windows ou l’antivirus bloque le lien, la fiche s’ouvre dans l’onglet de 3CX, comme avant.');
    } catch (e) {
      afficherToast('Téléchargement impossible : ' + e.message, 'OK', null);
    }
    renderReglages3cx();
  }

  // Fichier .reg pour l'administrateur (Fichorga) : le navigateur n'a plus à confirmer le lien à chaque appel (étude 14/10).
  async function telechargerAutorisationLien3cx() {
    try {
      const r = await fetchAvecAuth('/api/appels/relais/autorisation');
      if (!r.ok) throw new Error('statut ' + r.status);
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(await r.blob());
      lien.download = 'CLAIRE-autoriser-lien-3CX.reg';
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
      afficherInfoAction('Fichier téléchargé', 'À faire importer par Fichorga (compte administrateur, Chrome et Edge fermés puis rouverts) : le navigateur ouvre alors le lien de CLAIRE sans demander confirmation à chaque appel.');
    } catch (e) {
      afficherToast('Téléchargement impossible : ' + e.message, 'OK', null);
    }
  }

  // Relais retiré pour ce collaborateur : l'onglet de 3CX affiche de nouveau CLAIRE quand la fenêtre est cachée.
  async function retirerRelaisAppel3cx(i) {
    const nom = RESPONSABLES[i];
    if (!nom) return;
    try {
      const r = await fetchAvecAuth('/api/appels/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poste: clePosteAppels(nom), relais: false }) });
      if (r.ok) postes3cxRelais = (await r.json()).postesRelais || [];
    } catch (e) { /* état affiché relu ci-dessous */ }
    renderReglages3cx();
  }

  async function renderReglages3cx() {
    const fenetre = document.getElementById('reglages-3cx-fenetre');
    if (fenetre) {
      const app = fenetreApplicationClaire(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches, window.toolbar && window.toolbar.visible);
      fenetre.textContent = app
        ? 'Vous êtes dans la fenêtre CLAIRE : le bouton ci-dessous ajoute l’extension à son profil.'
        : 'Vous êtes dans un onglet du navigateur : pour la fenêtre CLAIRE, cliquer ce bouton depuis la fenêtre CLAIRE elle-même.';
    }
    const liste = document.getElementById('reglages-3cx-liste');
    if (!liste) return;
    try {
      const r = await fetchAvecAuth('/api/appels/reglages');
      if (r.ok) { const j = await r.json(); postes3cxCoupes = j.postesCoupes || []; postes3cxRelais = j.postesRelais || []; }
    } catch (e) { /* dernier état connu */ }
    const relaisPoste = document.getElementById('reglages-3cx-relais');
    if (relaisPoste) {
      let etatRelais = null;
      if (utilisateurPoste) {
        try {
          const r = await fetchAvecAuth('/api/relais-word/etat?poste=' + encodeURIComponent(clePosteAppels(utilisateurPoste)));
          if (r.ok) etatRelais = await r.json();
        } catch (e) { /* état inconnu */ }
      }
      const nom = utilisateurPoste ? prenomCollaborateur(utilisateurPoste) : '';
      relaisPoste.textContent = !utilisateurPoste ? 'Choisissez d’abord le collaborateur de ce poste.'
        : etatRelais && etatRelais.actif ? `Relais CLAIRE en marche pour ${nom} : à chaque appel, CLAIRE au premier plan si l’appelant a un dossier, sinon la fenêtre d’avant.`
          : postes3cxRelais.includes(clePosteAppels(utilisateurPoste)) ? `Fichier téléchargé pour ${nom} : une fois ouvert sur ce poste, chaque appel fait passer CLAIRE au premier plan (sinon la fiche s’ouvre dans l’onglet de 3CX).`
            : `Pas encore installé pour ${nom} : à chaque appel, l’onglet de 3CX passe au premier plan.`;
    }
    if (!origine3cx) {
      let adresses = [];
      try {
        const r = await fetchAvecAuth('/api/appels/adresses-serveur');
        if (r.ok) adresses = (await r.json()).adresses || [];
      } catch (e) { /* adresse de la page à défaut */ }
      origine3cx = origineServeurPour3cx(location, adresses);
    }
    let postes = {};
    try {
      const r = await fetchAvecAuth('/api/appels/postes');
      if (r.ok) postes = (await r.json()).postes || {};
    } catch (e) { /* état inconnu : rien d'affiché */ }
    const maintenant = Date.now();
    liste.innerHTML = RESPONSABLES.map((nom, i) => {
      const actif = !postes3cxCoupes.includes(clePosteAppels(nom));
      return `
      <div class="reglages-champ${actif ? '' : ' reglages-3cx-coupe'}">
        <div class="reglages-champ-libelle"><span class="reglages-3cx-tete"><label for="reglages-3cx-${i}">${escapeHtml(nom)}</label>
          <wa-switch class="switch reglages-switch reglages-3cx-switch" title="${actif ? 'Couper 3CX pour ce collaborateur' : 'Activer 3CX pour ce collaborateur'}" id="reglages-3cx-actif-${i}" ${actif ? 'checked' : ''} onchange="basculerTelephonie3cx(${i}, this.checked)" aria-label="Intégration 3CX de ${escapeAttr(nom)}"></wa-switch></span>
          <span class="reglages-3cx-etat">${actif ? etatPoste3cx(postes[clePosteAppels(nom)], maintenant).map(e => `<span class="dot-label ${e.classe}">${escapeHtml(e.texte)}</span>`).join('')
            + (postes3cxRelais.includes(clePosteAppels(nom)) ? `<span class="dot-label dl-success">Appels dans la fenêtre CLAIRE</span><button type="button" class="lien-discret" onclick="retirerRelaisAppel3cx(${i})" title="L’onglet de 3CX affichera de nouveau CLAIRE quand la fenêtre est cachée">Retirer</button>` : '') : '<span class="dot-label dl-neutre"><span class="dot"></span>3CX coupé : appels non notés</span>'}</span></div>
        <div class="reglages-champ-ligne">
          <input type="text" id="reglages-3cx-${i}" readonly spellcheck="false" value="${escapeAttr(adresseIntegration3cx(origine3cx, nom))}" onfocus="this.select()">
          <wa-button appearance="outlined" class="secondary" onclick="copierAdresse3cx(${i})">Copier</wa-button>
          <wa-button appearance="outlined" class="secondary" onclick="essayerSonnerie3cx(${i})" title="Simule un appel sur ce poste, comme 3CX à la sonnerie"${actif ? '' : ' disabled'}>Essayer</wa-button>
        </div>
      </div>`;
    }).join('');
    const journal = document.getElementById('reglages-3cx-journal');
    if (!journal) return;
    try {
      const r = await fetchAvecAuth('/api/appels');
      const { appels } = r.ok ? await r.json() : { appels: [] };
      journal.innerHTML = appels && appels.length
        ? `<ul class="appels-liste appels-journal">${appels.slice(0, 20).map(a => {
            const ds = dossiersDeLAppel(a, dossiers);
            const qui = ds.length ? ds.map(y => libelleDossierAffiche(y.d)).join(', ') : (a.contact && a.contact.libelle) || 'Inconnu';
            return `<li><span class="appels-quand">${escapeHtml(dateHeureAppel(a.t))}</span><span>${escapeHtml(qui)}${a.nom ? ` · ${escapeHtml(a.nom)}` : ''}</span><span class="appels-numero">${escapeHtml(a.numero || '')}${a.poste ? ' → ' + escapeHtml(a.poste) : ''}</span></li>`;
          }).join('')}</ul>`
        : '<p class="hint">Aucun appel noté pour l’instant.</p>';
    } catch (e) { journal.innerHTML = ''; }
  }

  // ---- Réglages › Authentic : journal des pages lues (étude, 02/10 : « pourquoi parfois les données ne
  // remontent pas ? ») — chaque page reçue de l'extension, le poste qui l'a prise et ce qu'il en a fait. ----
  var ETATS_JOURNAL_AUTHENTIC = {
    'en-file': { classe: 'dl-pret', texte: 'En attente d’une fenêtre CLAIRE' },
    pris: { classe: 'dl-neutre', texte: 'Prise, sans réponse de la fenêtre' },
    applique: { classe: 'dl-success', texte: 'Reprise' },
    rattache: { classe: 'dl-success', texte: 'Rangée à la main' },
    'sans-changement': { classe: 'dl-neutre', texte: 'Rien de neuf' },
    'sans-dossier': { classe: 'dl-urgent', texte: 'Aucun dossier' },
    'a-choisir': { classe: 'dl-pret', texte: 'Dossier à choisir' },
    'a-creer': { classe: 'dl-pret', texte: 'Dossier à créer' },
    erreur: { classe: 'dl-urgent', texte: 'Erreur' },
    expire: { classe: 'dl-urgent', texte: 'Perdue : aucune fenêtre CLAIRE ouverte' },
    remplace: { classe: '', texte: 'Remplacée par une version plus récente de la même page' },
  };

  // Pure : le nom d'un poste du journal — prénom du collaborateur de sa fenêtre, sinon le poste serveur
  // ou son adresse réseau.
  function libellePosteAuthentic(poste, origine) {
    if (poste) return prenomCollaborateur(poste);
    return origine === 'local' ? 'poste serveur' : (origine || 'poste inconnu');
  }

  // Pure : une ligne du journal → { quand, page, etat, detail, choisir, dossierId }.
  function ligneJournalAuthentic(e, liste) {
    const page = e.nature === 'client' ? 'Fiche client' : e.nature === 'bien' ? 'Fiche bien'
      : `Dossier ${e.intitule ? '« ' + e.intitule.replace(/\s+(?:Importer|Comparants|Immeubles)\b.*$/i, '') + ' »' : ''}`.trim();
    const d = e.dossierId ? (liste || []).find(x => x && x.id === e.dossierId && !x.deleted) : null;
    const etat = ETATS_JOURNAL_AUTHENTIC[e.etat] || { classe: 'dl-neutre', texte: e.etat || '' };
    const qui = [`de ${libellePosteAuthentic(e.posteOrigine, e.origine)}`];
    if (e.prisPar !== undefined && e.etat !== 'en-file') qui.push(`lue par ${e.prisPar ? prenomCollaborateur(e.prisPar) : 'une fenêtre'}`);
    if (e.revu) qui.push('revue');
    return {
      quand: e.recueLe ? heureAppel(Date.parse(e.recueLe)) : '',
      page,
      etat,
      detail: [d ? libelleDossierAffiche(d) : '', e.texte || ''].filter(Boolean).join(' : '),
      qui: qui.join(' · '),
      choisir: !!e.enMemoire && ['sans-dossier', 'a-choisir', 'a-creer', 'expire', 'pris', 'en-file'].includes(e.etat) && e.nature !== 'bien',
      creer: !!e.enMemoire && e.etat === 'a-creer',
      dossierId: d ? d.id : ''
    };
  }

  async function renderReglagesAuthentic() {
    const bloc = document.getElementById('reglages-authentic-journal');
    const fen = document.getElementById('reglages-authentic-fenetres');
    if (!bloc || !authToken) return;
    let donnees = null;
    try {
      const r = await fetchAvecAuth('/api/authentic/journal');
      if (r.ok) donnees = await r.json();
    } catch (e) { /* serveur injoignable */ }
    if (!donnees) { bloc.innerHTML = '<p class="hint">Journal indisponible (serveur injoignable).</p>'; return; }
    if (fen) {
      const fenetres = (donnees.fenetres || []).filter(f => f.vuIlYa < 10 * 60 * 1000);
      fen.innerHTML = fenetres.length
        ? fenetres.map(f => `<span class="dot-label ${f.enAttente || f.vuIlYa < 90000 ? 'dl-success' : 'dl-neutre'}"><span class="dot"></span>${escapeHtml(libellePosteAuthentic(f.poste, f.origine))}${f.enAttente || f.vuIlYa < 90000 ? '' : ' (vue il y a ' + Math.round(f.vuIlYa / 60000) + ' min)'}</span>`).join('')
        : '<span class="dot-label dl-urgent"><span class="dot"></span>Aucune fenêtre CLAIRE à l’écoute : les pages d’Authentic attendent</span>';
      fen.innerHTML = `<span class="authentic-fenetres-titre">Fenêtres à l’écoute</span>${fen.innerHTML}<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="renderReglagesAuthentic()" title="Actualiser le journal" aria-label="Actualiser le journal">${icone('rotate-ccw')}</wa-button>`;
    }
    const entrees = donnees.entrees || [];
    bloc.innerHTML = entrees.length
      ? `<ul class="appels-liste authentic-journal">${entrees.slice(0, 60).map(e => {
          const l = ligneJournalAuthentic(e, dossiers);
          return `<li><span class="appels-quand">${escapeHtml(l.quand)}</span>`
            + `<span class="authentic-journal-page"><span>${escapeHtml(l.page)}</span><span class="authentic-journal-qui">${escapeHtml(l.qui)}</span>${l.detail ? `<span class="authentic-journal-detail">${escapeHtml(l.detail)}</span>` : ''}</span>`
            + `<span class="authentic-journal-etat"><span class="dot-label ${l.etat.classe}"><span class="dot"></span>${escapeHtml(l.etat.texte)}</span>`
            + (l.creer ? `<wa-button appearance="outlined" class="secondary" onclick="choisirDossierPourReleveAuthentic('${escapeOnclickArg(e.id)}', true)">Créer le dossier</wa-button>` : '')
            + (l.choisir ? `<wa-button appearance="outlined" class="secondary" onclick="choisirDossierPourReleveAuthentic('${escapeOnclickArg(e.id)}')">Choisir le dossier</wa-button>` : '')
            + (l.dossierId ? `<button type="button" class="lien-discret" onclick="ouvrirDossierDrawer('${escapeOnclickArg(l.dossierId)}')">Voir</button>` : '')
            + `</span></li>`;
        }).join('')}</ul>`
      : '<p class="hint">Aucune page reçue d’Authentic depuis le démarrage du serveur.</p>';
  }

  // Pure : l'adresse d'un essai — celle que 3CX ouvrirait, avec un numéro et un nom d'essai.
  function adresseEssai3cx(origine, collaborateur) {
    return adresseIntegration3cx(origine, collaborateur).replace('%CallerNumber%', '0600000000').replace('%CallerDisplayName%', encodeURIComponent('Essai CLAIRE'));
  }

  // Simule la sonnerie (même adresse que 3CX, ouverte d'un clic donc jamais bloquée) : si le bandeau
  // « Appel entrant » apparaît dans la fenêtre CLAIRE du collaborateur, CLAIRE est prêt ; s'il apparaît
  // ici mais jamais à un vrai appel, c'est 3CX ou le navigateur qui n'ouvre pas l'adresse (fenêtres
  // pop-up bloquées pour le client web 3CX).
  function essayerSonnerie3cx(i) {
    const nom = RESPONSABLES[i];
    if (!nom) return;
    // L'adresse réseau, comme 3CX : l'essai vérifie aussi que le serveur y répond.
    const fenetre = window.open(adresseEssai3cx(origine3cx || location.origin, nom), '_blank');
    if (!fenetre) { afficherToast('Le navigateur a bloqué la fenêtre d’essai : autorisez les fenêtres pop-up.', 'OK', null); return; }
    afficherToast(clePosteAppels(nom) === clePosteAppels(utilisateurPoste)
      ? 'Appel d’essai envoyé : le bandeau « Appel entrant » doit apparaître dans quelques secondes.'
      : `Appel d’essai envoyé au poste de ${prenomCollaborateur(nom)} : le bandeau apparaît dans sa fenêtre CLAIRE.`, 'OK', null);
    setTimeout(renderReglages3cx, 2500);
  }

  function copierAdresse3cx(i) {
    const champ = document.getElementById('reglages-3cx-' + i);
    if (!champ) return;
    champ.select();
    afficherToast(copierTexteSilencieux(champ.value) ? 'Adresse copiée : à coller dans 3CX.' : 'Sélectionnez l’adresse puis Ctrl+C.', 'OK', null);
  }

  // ---- persistence (serveur intranet) ----
  //
  // Remplace l'ancien mécanisme localStorage + registre partagé JSON (voir l'historique dans
  // CLAUDE.md) : le serveur (server/, branche claude/serveur-intranet) est désormais la SEULE
  // source de vérité, avec une authentification par mot de passe partagé unique. Plus de repli
  // local : sans serveur joignable, l'outil ne peut pas fonctionner (décision explicite, voir le
  // plan de ce chantier).

  const CLE_AUTH_TOKEN = 'claire-token';
  let authToken = null;
  // Curseur de synchro (epoch ms renvoyé par le serveur) : le polling ne redemande que ce qui a
  // changé depuis cette valeur, jamais une horloge cliente (voir GET /api/dossiers?since=).
  let curseurSynchro = 0;

  function chargerJetonStocke() {
    try { return localStorage.getItem(CLE_AUTH_TOKEN) || null; } catch (e) { return null; }
  }

  function stockerJeton(jeton) {
    authToken = jeton;
    try {
      if (jeton) ecrireLocal(CLE_AUTH_TOKEN, jeton);
      else localStorage.removeItem(CLE_AUTH_TOKEN);
    } catch (e) { /* jeton reperdu au rechargement si le stockage échoue — sans autre conséquence */ }
  }

  // Point de passage unique pour tout appel à l'API du serveur : ajoute le jeton de session, et
  // réaffiche l'écran de connexion dès qu'une réponse 401 signale une session expirée/invalide
  // (mot de passe changé, jeton périmé après 12h — voir server/src/auth.js).
  async function fetchAvecAuth(url, options = {}) {
    const reponse = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), authorization: `Bearer ${authToken}` }
    });
    if (reponse.status === 401) {
      stockerJeton(null);
      arreterPolling();
      // Sans mot de passe côté serveur, un 401 ne peut venir que d'un jeton d'avant le
      // changement : on en redemande un tout seul, l'écran ne s'affiche que si c'est refusé.
      connexionAutomatique();
      throw new Error('Session expirée — reconnexion nécessaire.');
    }
    return reponse;
  }

  async function connexionAutomatique() {
    try {
      const reponse = await fetch('/api/login', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motDePasse: '' })
      });
      if (reponse.ok) {
        const { jeton } = await reponse.json();
        stockerJeton(jeton);
        fermerEcranConnexion();
        await demarrerApplication();
        return true;
      }
      afficherEcranConnexion();
    } catch (e) {
      console.error('Connexion au serveur impossible', e);
      afficherEcranConnexion("Serveur injoignable — vérifiez la connexion au réseau de l'étude.");
    }
    return false;
  }

  function afficherEcranConnexion(messageErreur) {
    const overlay = document.getElementById('connexion-overlay');
    const erreurEl = document.getElementById('connexion-erreur');
    if (erreurEl) {
      erreurEl.textContent = messageErreur || '';
      erreurEl.style.display = messageErreur ? 'block' : 'none';
    }
    if (overlay) overlay.style.display = 'flex';
    const input = document.getElementById('connexion-mot-de-passe');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 0); }
  }

  function fermerEcranConnexion() {
    const overlay = document.getElementById('connexion-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async function tenterConnexion() {
    const input = document.getElementById('connexion-mot-de-passe');
    const motDePasse = input ? input.value : '';
    if (!motDePasse) return;
    const btn = document.getElementById('connexion-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Connexion…'; }
    try {
      const reponse = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ motDePasse })
      });
      if (!reponse.ok) {
        afficherEcranConnexion('Mot de passe incorrect.');
        return;
      }
      const { jeton } = await reponse.json();
      stockerJeton(jeton);
      fermerEcranConnexion();
      await demarrerApplication();
    } catch (e) {
      console.error('Connexion au serveur impossible', e);
      afficherEcranConnexion("Serveur injoignable — vérifiez la connexion au réseau de l'étude.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Se connecter'; }
    }
  }

  // Premier chargement : `since=0` renvoie tous les dossiers actifs (voir server/src/routes/
  // dossiers.js) — jamais de tombstone à ce stade puisqu'on part d'un registre vide côté client.
  async function charger() {
    const reponse = await fetchAvecAuth('/api/dossiers?since=0');
    const { dossiers: recus, serverTime } = await reponse.json();
    dossiers = recus
      .filter(d => d && typeof d === 'object' && d.id && !d.deleted)
      .map(({ updatedAt, ...d }) => marquerVersionDossier(d, updatedAt)); // updatedAt est une métadonnée serveur, pas un champ du modèle
    curseurSynchro = serverTime;
    render();
  }

  // Version du dossier telle que reçue du serveur (updatedAt), portée par l'OBJET et non par l'id (audit 04/10) : une
  // copie dépassée encore tenue par une fiche ouverte garde SA version, et le serveur sait alors fusionner son PUT avec
  // ce qui a changé depuis (voir server/src/fusionDossiers.js). Propriété non énumérable : jamais sérialisée.
  // Structure attendue d'un dossier reçu du serveur (audit 04/10) : un champ conteneur d'un type inattendu (une
  // ancienne version, une réparation à la main dans la base) ne doit pas faire planter un rendu — il est ramené à un
  // conteneur vide. Les valeurs correctes passent telles quelles ; rien d'autre n'est touché.
  var CHAMPS_LISTE_DOSSIER = ['historique', 'parties', 'biens', 'autres', 'piecesNotifications', 'garantiesPret', 'notairesDetectes',
    'piecesEngagementsDetectees', 'personnesConnuesEcartees', 'piecesValideesManuellement', 'piecesPersonnalisees', 'piecesRetirees'];
  // Listes d'objets : un élément null ou d'un autre type est retiré (audit 12/10 : `autres: [null]` vidait toute la liste du Suivi).
  var LISTES_OBJETS_DOSSIER = ['parties', 'biens', 'autres', 'piecesPersonnalisees', 'historique'];
  var CHAMPS_OBJET_DOSSIER = ['pieces', 'fichiersTrouves', 'echeancesValidees'];
  // Dates du planning : une chaîne AAAA-MM-JJ ou vide, jamais un nombre ou un objet (tris et comparaisons de texte).
  var CHAMPS_DATE_DOSSIER = ['pret', 'acte', 'ventebien', 'appelFonds', 'projetEnvoye', 'rendezVousSignature', 'dateAvantContrat'];
  function assainirStructureDossier(d) {
    if (!d || typeof d !== 'object') return d;
    for (const k of CHAMPS_DATE_DOSSIER) if (k in d && d[k] != null && typeof d[k] !== 'string') d[k] = '';
    for (const k of CHAMPS_LISTE_DOSSIER) if (k in d && d[k] != null && !Array.isArray(d[k])) d[k] = [];
    for (const k of CHAMPS_OBJET_DOSSIER) if (k in d && d[k] != null && (typeof d[k] !== 'object' || Array.isArray(d[k]))) d[k] = {};
    for (const k of LISTES_OBJETS_DOSSIER) if (Array.isArray(d[k]) && d[k].some(x => !x || typeof x !== 'object')) d[k] = d[k].filter(x => x && typeof x === 'object');
    if (typeof d.nom !== 'string') d.nom = d.nom == null ? '' : String(d.nom);
    return d;
  }

  function marquerVersionDossier(d, updatedAt) {
    assainirStructureDossier(d);
    if (d && typeof d === 'object' && Number.isFinite(updatedAt)) {
      Object.defineProperty(d, '_version', { value: updatedAt, enumerable: false, writable: true, configurable: true });
    }
    return d;
  }
  function versionDossier(d) {
    return d && Number.isFinite(d._version) ? d._version : 0;
  }
  // Le dossier tel que le serveur l'a enregistré (fusionné ou non) remplace la copie du poste SUR PLACE : les
  // références tenues par l'écran restent valables, et l'objet redevient celui de la liste.
  function appliquerDossierServeur(d, sauvegarde) {
    const { updatedAt, fusionne, ...contenu } = sauvegarde || {};
    if (!contenu || contenu.id !== d.id) return false;
    for (const k of Object.keys(d)) if (!(k in contenu)) delete d[k];
    Object.assign(d, contenu);
    marquerVersionDossier(d, updatedAt);
    const index = dossiers.findIndex(x => x.id === d.id);
    if (index !== -1 && dossiers[index] !== d) dossiers[index] = d;
    return !!fusionne;
  }

  // Remplacement complet d'UN dossier déjà enregistré (PUT) — chaque site d'appel a déjà `d` en
  // portée juste après l'avoir modifié, voir les ~25 call sites qui suivent dans ce fichier.
  // N'échoue jamais bruyamment côté appelant (pas de throw) : ceux-ci font juste `sauvegarder(d);
  // render();` sans awaiter ni intercepter d'erreur, comme au temps du localStorage — une panne
  // réseau se retrouvera simplement rattrapée par le prochain PUT réussi (le brouillon en mémoire
  // reste correct, seule la synchro serveur retarde).
  async function sauvegarder(d) {
    if (!d || !d.id) return;
    dedoublonnerPartiesDossier(d);
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers/${encodeURIComponent(d.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-claire-base': String(versionDossier(d)) },
        body: JSON.stringify(d)
      });
      if (reponse.ok) {
        const sauvegarde = await reponse.json();
        curseurSynchro = Math.max(curseurSynchro, sauvegarde.updatedAt || 0);
        const fusionne = appliquerDossierServeur(d, sauvegarde);
        if (sauvegardesEnAttente.delete(d.id) && sauvegardesEnAttente.size === 0) afficherToast('Modifications enregistrées.', 'OK', null);
        if (fusionne) {
          // Le serveur a gardé des changements faits ailleurs (autre poste, agenda, emails) : l'écran les montre.
          afficherToast(`Dossier « ${libelleDossierAffiche(d)} » : des changements d’un autre poste ont été conservés.`, 'OK', null);
          try { render(); } catch (e) { /* le prochain rendu les montrera */ }
        }
      } else if (reponse.status === 404) {
        sauvegardesEnAttente.delete(d.id);
        afficherToast(`Dossier « ${libelleDossierAffiche(d)} » : supprimé depuis un autre poste, modification non enregistrée.`, 'OK', null);
      } else {
        console.error('Sauvegarde refusée par le serveur', reponse.status);
        sauvegardesEnAttente.delete(d.id);
        afficherToast(`Modification non enregistrée (serveur : ${reponse.status}).`, 'OK', null);
      }
    } catch (e) {
      // Serveur injoignable : rien n'est perdu en mémoire, le PUT est rejoué à chaque sondage dès son retour.
      if (!sauvegardesEnAttente.size) afficherToast('Serveur injoignable : la modification sera enregistrée dès son retour.', 'OK', null);
      sauvegardesEnAttente.add(d.id);
    }
  }

  // Dossiers dont le dernier PUT a échoué faute de serveur (audit 04/10) : rejoués au sondage suivant qui réussit.
  const sauvegardesEnAttente = new Set();
  function relancerSauvegardesEnAttente() {
    if (!sauvegardesEnAttente.size) return;
    for (const id of [...sauvegardesEnAttente]) {
      const d = dossiers.find(x => x.id === id);
      if (d) sauvegarder(d); else sauvegardesEnAttente.delete(id);
    }
  }

  // Création (POST) — seule différence avec sauvegarder() : le serveur doit savoir qu'il s'agit
  // d'un nouveau dossier, pas d'un remplacement. Renvoie true/false pour que l'appelant (
  // ajouterDossier(), importerDonnees()) sache s'il doit vraiment ajouter le dossier à `dossiers`
  // ou prévenir l'utilisateur d'un échec (id en double, serveur injoignable...).
  async function sauvegarderNouveauDossier(d) {
    try {
      const reponse = await fetchAvecAuth('/api/dossiers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(d)
      });
      if (reponse.ok) {
        const sauvegarde = await reponse.json();
        curseurSynchro = Math.max(curseurSynchro, sauvegarde.updatedAt || 0);
        marquerVersionDossier(d, sauvegarde.updatedAt);
        return true;
      }
      console.error('Création refusée par le serveur', reponse.status);
      return false;
    } catch (e) {
      console.error('Création impossible (serveur injoignable ?)', e);
      return false;
    }
  }

  async function supprimerDossierServeur(id) {
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return reponse.ok;
    } catch (e) {
      console.error('Suppression impossible (serveur injoignable ?)', e);
      return false;
    }
  }

  async function restaurerDossierServeur(id) {
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers/${encodeURIComponent(id)}/undelete`, { method: 'POST' });
      return reponse.ok;
    } catch (e) {
      console.error('Restauration impossible (serveur injoignable ?)', e);
      return false;
    }
  }

  // ---- synchro par polling (voir le plan : WebSocket écarté, 3 utilisateurs sur un LAN ne
  // justifient pas la complexité d'une connexion persistante) ----

  const INTERVALLE_POLLING_MS = 7000;
  let intervallePolling = null;

  function demarrerPolling() {
    arreterPolling();
    intervallePolling = setInterval(sondagePeriodique, INTERVALLE_POLLING_MS);
  }

  function arreterPolling() {
    if (intervallePolling) { clearInterval(intervallePolling); intervallePolling = null; }
  }

  // Pas la peine de solliciter le serveur pendant qu'un onglet est masqué/minimisé — reprend
  // aussitôt (avec un sondage immédiat, pas d'attente du prochain tick) dès qu'il redevient visible.
  function gererVisibilitePolling() {
    if (document.hidden) {
      arreterPolling();
    } else if (authToken) {
      sondagePeriodique();
      demarrerPolling();
    }
  }
  document.addEventListener('visibilitychange', gererVisibilitePolling);

  function appliquerChangementsDistants(changements) {
    for (const item of changements) {
      const index = dossiers.findIndex(x => x.id === item.id);
      if (item.deleted) {
        if (index !== -1) dossiers.splice(index, 1);
        continue;
      }
      const { updatedAt, ...d } = item;
      marquerVersionDossier(d, updatedAt);
      // Une copie locale pas encore enregistrée (serveur injoignable) n'est pas remplacée : son PUT, rejoué avec sa
      // version de base, sera fusionné par le serveur avec ce changement-ci.
      if (index !== -1 && sauvegardesEnAttente.has(d.id)) continue;
      // Notification proactive : un nouveau PDF vient d'être détecté par la surveillance périodique
      // du NAS (voir server/src/nasWatch.js). Le fichier était déjà repris silencieusement dans la
      // checklist au prochain "Revérifier" automatique (toutes les 5 minutes pour un dossier non
      // complet) — le vrai manque, c'est qu'on ne pouvait pas s'en rendre compte sans le remarquer
      // soi-même. Comparaison sur l'horodatage : seul un `nasNouveaute` VRAIMENT NOUVEAU (absent
      // avant, ou différent de celui déjà connu) déclenche un toast — jamais au chargement initial
      // (charger() ne passe pas par cette fonction), qui resignalerait tous les anciens en rafale.
      if (index !== -1 && d.nasNouveaute && (!dossiers[index].nasNouveaute || dossiers[index].nasNouveaute.at !== d.nasNouveaute.at)) {
        const nb = (d.nasNouveaute.fichiers || []).length;
        afficherToast(
          `${nb > 1 ? nb + ' nouveaux documents détectés' : 'Nouveau document détecté'} dans le dossier « ${libelleDossierAffiche(d)} » — CLAIRE le vérifie.`,
          'OK', null
        );
        // Vérifié tout de suite (offre de prêt, pièces), sans attendre le tour des 5 minutes — le
        // dossier est d'abord mis à jour ci-dessous, d'où le report. Sur le poste de son
        // responsable (ou, dossier sans responsable, sur chaque poste) : pas de lecture en double.
        if (!d.archive && d.dossierLie && (!d.responsable || d.responsable === utilisateurPoste)) {
          setTimeout(() => { verifierDossierLocal(d.id, false).catch(e => console.error('Vérification du nouveau document', e)); }, 0);
        }
      }
      if (index !== -1) dossiers[index] = d; else dossiers.push(d);
    }
  }

  // Reflète dans la sidebar si le dernier sondage a bien atteint le serveur — sans ça, un serveur
  // arrêté/injoignable (câble débranché, poste hébergeur éteint...) ne se voyait qu'indirectement,
  // en constatant qu'un dossier créé par un collègue n'apparaissait jamais. `statutServeurConnecte`
  // évite d'écrire dans le DOM à chaque sondage (toutes les 7s) quand rien n'a changé.
  let statutServeurConnecte = true;
  function majStatutServeur(connecte) {
    if (connecte === statutServeurConnecte) return;
    statutServeurConnecte = connecte;
    const badge = document.getElementById('statut-serveur-badge');
    if (!badge) return;
    badge.className = 'dot-label ' + (connecte ? 'dl-success' : 'dl-urgent');
    badge.innerHTML = '<span class="dot"></span>' + (connecte ? 'Connecté' : 'Hors ligne');
    badge.title = connecte
      ? ''
      : 'Le serveur ne répond plus — vérifiez qu\'il tourne toujours sur le poste hébergeur. Les modifications faites ici seront synchronisées dès que la connexion revient.';
  }

  // Mise à jour automatique (étude, 03/10) : le serveur redémarre sur la nouvelle version, mais une fenêtre
  // déjà ouverte gardait l'ancien script.js tant qu'on ne la rechargeait pas — un correctif installé
  // n'agissait pas (page d'Authentic encore rangée par le « numéro » une heure après son retrait). Le
  // sondage rend l'heure de démarrage du serveur ; quand elle change, la version de /script.js est relue
  // et la fenêtre se recharge si elle diffère, dès qu'aucune saisie n'est en cours.
  var demarrageServeurConnu = null;
  var rechargementVersionPrevu = false;
  function versionDansScript(texte) {
    const m = String(texte || '').match(/const VERSION_APP = '([^']+)'/);
    return m ? m[1] : '';
  }
  function saisieEnCoursPoste() {
    const el = document.activeElement;
    if (el && (el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit)$/i.test(el.type || '')) || el.tagName === 'SELECT')) return true;
    // Les outils (nouveau dossier, relecture, appel de fonds, calculs…) gardent un travail non enregistré.
    return !['dashboard', 'suivi', 'agenda', 'scans', 'confreres', 'reglages', 'assistant'].includes(ongletActuel);
  }
  function rechargerQuandPossible(version) {
    if (saisieEnCoursPoste()) { setTimeout(() => rechargerQuandPossible(version), 30000); return; }
    noterVerificationPoste('fenetres-rechargees', { detail: `page rechargée en version ${version}` });
    setTimeout(() => location.reload(), 1500);
  }
  async function surveillerVersionServeur(demarrage) {
    if (!demarrage || rechargementVersionPrevu) return;
    if (demarrageServeurConnu === null) { demarrageServeurConnu = demarrage; return; }
    if (demarrage === demarrageServeurConnu) return;
    const precedent = demarrageServeurConnu;
    demarrageServeurConnu = demarrage;
    try {
      const r = await fetch('/client/00-version.js', { cache: 'no-store' });
      if (!r.ok) return;
      const version = versionDansScript(await r.text());
      if (!version || version === VERSION_APP) return;
      rechargementVersionPrevu = true;
      afficherToast(`CLAIRE a été mise à jour (version ${version}) : la fenêtre se recharge.`, 'OK', null);
      rechargerQuandPossible(version);
    } catch (e) { demarrageServeurConnu = precedent; /* serveur en cours de redémarrage : le sondage suivant réessaiera */ }
  }

  async function sondagePeriodique() {
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers?since=${curseurSynchro}`);
      if (!reponse.ok) { majStatutServeur(false); return; }
      const corps = await reponse.json();
      const { dossiers: changements, serverTime } = corps;
      if (changements.length > 0) {
        appliquerChangementsDistants(changements);
        render();
      }
      curseurSynchro = serverTime;
      majStatutServeur(true);
      relancerSauvegardesEnAttente();
      surveillerVersionServeur(corps.demarrage);
    } catch (e) {
      // Une session expirée (401) est déjà gérée par fetchAvecAuth (jeton effacé, écran de
      // connexion réaffiché, polling arrêté) — pas la peine d'afficher "Hors ligne" par-dessus,
      // ce n'est pas un problème de connexion réseau. authToken redevient null dans ce cas
      // précis : ne signaler l'indisponibilité que si ce n'est PAS la cause de cet échec.
      if (authToken) majStatutServeur(false);
    }
  }

  // Séquence complète une fois authentifié : dossiers, état du NAS (pour savoir si la
  // fonctionnalité est utilisable du tout), vérification des dossiers reliés, puis polling.
  // La popup « accès à reconfirmer » qui vivait ici a disparu avec le mécanisme de permissions du
  // navigateur : le serveur lit le NAS, il n'y a plus rien à reconfirmer.
  async function demarrerApplication() {
    try { renderChoixImport(); } catch (e) { /* page sans « Nouveau dossier » */ }
    initUtilisateurPoste();
    await charger();
    verifierSaferTacites().catch(() => {});
    retirerDatesAvantContratLuesNas().then(() => render()).catch(() => {});
    setInterval(() => { verifierSaferTacites().catch(() => {}); }, 60 * 60 * 1000);
    // Dossiers signés depuis plus de 30 jours sans questionnaire envoyé : archivés (étude 07/10).
    archiverSansQuestionnaire().catch(() => {});
    setInterval(() => { archiverSansQuestionnaire().catch(() => {}); }, 60 * 60 * 1000);
    // Envois validés sans date saisie ici (décompte retrouvé sur le NAS, case cochée ailleurs) : notés dans le lieu du rendez-vous.
    setTimeout(() => { rattraperNotesAgenda().catch(() => {}); }, 30 * 1000);
    setInterval(() => { rattraperNotesAgenda().catch(() => {}); }, 5 * 60 * 1000);
    demanderUtilisateurPosteSiInconnu();
    chargerRappelsPerso();
    chargerPreferencesCollaborateur();
    // Connexion à l'agenda Outlook : chargée au démarrage pour que la fiche dossier sache si le
    // bouton « Créer dans l'agenda » doit apparaître, sans attendre l'ouverture des Réglages.
    // Une fois connue, retente les retraits/déplacements de dates butoir restés en attente.
    chargerReglagesExchange().then(reconcilierEcheancesAgenda);
    // Relue toutes les 5 minutes : une connexion réglée ou réactivée depuis un autre poste arrive ici sans F5.
    setInterval(() => { chargerReglagesExchange().catch(() => {}); }, 5 * 60 * 1000);
    chargerModelesEmails();
    // Scans du copieur (voir chargerScans) : dès que les dossiers sont chargés, en tâche de fond —
    // sans attendre l'état du NAS ni les autres lectures du démarrage.
    demarrerSurveillanceScans();
    // Absences des collaborateurs lues dans l'agenda (voir chargerAbsencesOffice) : chargées au
    // démarrage pour que l'agenda du tableau de bord les affiche d'emblée, puis rafraîchies au même
    // rythme que le tour serveur (2 min) et à chaque ouverture du tableau de bord.
    chargerAbsencesOffice();
    setInterval(chargerAbsencesOffice, 2 * 60 * 1000);
    // Page Agenda ouverte : relue au même rythme que le tour de lecture du serveur (2 min).
    setInterval(() => { if (ongletActuel === 'agenda' && !agendaModale) chargerAgendaSemaine(); }, 2 * 60 * 1000);
    setInterval(() => { if (ongletActuel === 'dashboard') chargerAgendaWidget(true); }, 2 * 60 * 1000);
    // Tâches relevées dans l'agenda (rendez-vous rouges « JV - … ») : arrivent dans « Mes rappels » sans recharger.
    // Relus toutes les 30 s sur n'importe quel écran : une tâche demandée par un collègue arrive en « Aujourd'hui » sans attendre (étude 15/10).
    setInterval(() => { if (!ajoutRappelOuvert && !rappelEnEdition) chargerRappelsPerso(); }, 30 * 1000);
    setInterval(majTraitHeureAgenda, 30 * 1000);
    await chargerEtatNas();
    // Avant toute relecture du NAS : un parcours lancé sans elles reconnaîtrait des fichiers que
    // l'étude a écartés.
    await chargerExclusionsMotifNom();
    await chargerFormesNoms();
    // Avant le premier import : un dossier créé juste après la connexion doit profiter des
    // corrections faites par les collègues (voir chargerApprentissageServeur).
    await chargerApprentissageServeur();
    // Carnet des confrères : la fiche rapproche chaque notaire de son office dès le premier rendu.
    chargerCarnetConfreres().then(() => render());
    // Répertoire (agences, organismes) : « Nouveau dossier » y retrouve l'agence lue dans le compromis (étude 05/10).
    chargerRepertoire();
    // Le polling démarre AVANT la relecture du NAS, et celle-ci n'est plus attendue : sur un
    // portefeuille d'une soixantaine de dossiers, ce parcours peut prendre plusieurs minutes
    // (il ouvre des PDF, voir verifierDossierLocal) — tant qu'il n'avait pas fini, aucune synchro
    // n'avait encore commencé et l'indicateur de connexion restait muet, ce qui donnait
    // exactement le symptôme signalé par l'étude : « la page se bloque puis il indique ne plus
    // avoir accès au serveur ». C'est une tâche de fond, pas une étape de démarrage.
    demarrerPolling();
    // État des sauvegardes : lu au démarrage puis toutes les heures, pour que le bandeau du Tableau
    // de bord apparaisse sans qu'on ait à ouvrir les Réglages.
    chargerEtatSauvegarde();
    setInterval(chargerEtatSauvegarde, 60 * 60 * 1000);
    // Compteur des signalements à trier sur « Réglages » : relu au démarrage puis toutes les
    // 5 minutes — un signalement fait sur un autre poste doit finir par apparaître ici aussi.
    majBadgeSignalements();
    setInterval(majBadgeSignalements, 5 * 60 * 1000);
    revérifierDossiersLiesAuDemarrage().catch(e => console.error('Relecture des dossiers NAS', e));
    // Résumé des emails du matin : lu au démarrage, puis toutes les 5 minutes (il arrive à 8 h 50).
    chargerResumeEmails();
    setInterval(chargerResumeEmails, 5 * 60 * 1000);
    // Sondages de créneaux : les réponses relues par le serveur toutes les 5 minutes.
    chargerSondages();
    setInterval(chargerSondages, 2 * 60 * 1000);
    // Emails des dossiers (relevés chaque minute par le serveur, étude 02/10) : pièces jointes rangées sur
    // le NAS et emails de la fiche ouverte relus chaque minute ; les autres fiches relisent à l'ouverture.
    setTimeout(rangerPiecesJointesReconnues, 30 * 1000);
    setInterval(() => {
      Object.keys(emailsParDossier).forEach(k => { if (k !== dossierOuvert) delete emailsParDossier[k]; });
      rafraichirEmailsFicheOuverte();
      rangerPiecesJointesReconnues();
    }, 60 * 1000);
    // Appels 3CX : relevés toutes les 3 s, même fenêtre cachée (c'est là qu'ils comptent).
    releverAppels();
    setInterval(releverAppels, INTERVALLE_APPELS_MS);
    // Une fenêtre cachée longtemps est ralentie par le navigateur (une relève par minute) : relever
    // dès qu'elle revient au premier plan.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') releverAppels(); });
    ouvrirAppelDepuisAdresse();
    // Pages d'Authentic relevées automatiquement par l'extension : pièces reçues reportées sur la fiche,
    // même fenêtre cachée (boucle d'attente) ; relève de secours et au retour au premier plan.
    boucleRelevesAuthentic();
    setInterval(releverPagesAuthentic, INTERVALLE_RELEVES_AUTHENTIC_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') releverPagesAuthentic(); });
    // Page d'Authentic envoyée par l'extension Firefox (#authentic=…), au chargement ou dans un onglet déjà ouvert.
    ouvrirCaptureAuthenticDepuisAdresse();
    window.addEventListener('hashchange', ouvrirCaptureAuthenticDepuisAdresse);
    // Reçus comptables des dossiers du poste : au démarrage, puis toutes les heures.
    setTimeout(() => verifierFondsRecusAuto().catch(e => console.error('Vérification des fonds', e)), 60 * 1000);
    setInterval(() => verifierFondsRecusAuto().catch(e => console.error('Vérification des fonds', e)), 60 * 60 * 1000);
  }

  // ---- apprentissage des corrections (dates) ----
  //
  // Quand un(e) collaborateur(rice) attribue à une date détectée une catégorie différente de
  // celle suggérée (ou classe une date que l'outil n'avait pas su classer du tout), on retient
  // la clause correspondante. Au prochain compromis, si une clause très proche (mêmes mots,
  // dates/montants neutralisés) réapparaît, la correction déjà faite est réappliquée
  // automatiquement à la suggestion — qui reste malgré tout à vérifier, comme toute suggestion
  // automatique (voir le pied de page) : ce n'est pas parce qu'une clause ressemble à une clause
  // déjà vue qu'elle joue exactement le même rôle dans ce compromis-ci.
  //
  // Comparaison approximative (pas d'égalité stricte) : deux occurrences de la même clause-type
  // diffèrent presque toujours par la date, le montant ou les noms qu'elles contiennent — d'où la
  // neutralisation de ces éléments avant de comparer, puis un recouvrement de mots (indice de
  // Jaccard) plutôt qu'une comparaison caractère à caractère.
  //
  // Stocké sur le serveur de l'étude, partagé entre les postes (voir sauvegarderApprentissage) :
  // rien ne sort du bureau, et rien de plus que des fragments de clauses déjà affichés à l'écran
  // n'est conservé.
  const CLE_APPRENTISSAGE = 'corrections-echeances';
  const SEUIL_SIMILARITE_APPRENTISSAGE = 0.6; // au-delà, on considère qu'il s'agit de la même clause-type
  const MAX_CORRECTIONS_MEMORISEES = 500; // filet de sécurité : évite une croissance illimitée du stockage local
  let correctionsApprises = [];

  function normaliserTexteApprentissage(texte) {
    const moisNoms = Object.keys(MOIS).join('|');
    return String(texte)
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(new RegExp(`\\b\\d{1,2}(?:er)?\\s+(?:${moisNoms})\\s+\\d{4}\\b`, 'g'), ' §date§ ')
      .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}\b/g, ' §date§ ')
      .replace(/\d+/g, '§num§')
      .replace(/[^a-z§\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokeniserApprentissage(texteNormalise) {
    // Mots de 3 lettres ou plus seulement : les mots très courts (de, le, un…) sont trop communs
    // pour discriminer une clause-type d'une autre et gonfleraient artificiellement le score.
    return new Set(texteNormalise.split(' ').filter(t => t.length > 2));
  }

  function similariteJaccard(setA, setB) {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const t of setA) { if (setB.has(t)) intersection++; }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  // Les corrections vivent SUR LE SERVEUR (voir server/src/routes/correctionsApprises.js) :
  // gardées dans le navigateur de chaque poste, une correction faite par un collaborateur n'était
  // jamais « apprise » pour un dossier créé depuis un autre poste — c'est ce que l'étude constatait
  // (« vérifier que c'est bien appris pour les prochains dossiers »). Chaque correction est envoyée
  // seule, fusionnée par identifiant côté serveur. Le stockage local ne sert plus que de REPLI : une
  // correction qui n'a pas pu partir (serveur injoignable) y attend, et elle est reprise sur le
  // serveur au démarrage suivant — comme les exclusions de pièces.
  async function sauvegarderApprentissage(entree) {
    let envoyee = false;
    if (entree && authToken) {
      try {
        const reponse = await fetchAvecAuth('/api/corrections-apprises', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ correction: entree })
        });
        if (reponse.ok) {
          const data = await reponse.json();
          if (data && Array.isArray(data.corrections)) correctionsApprises = data.corrections;
          envoyee = true;
        }
      } catch (e) { console.warn('Correction non enregistrée sur le serveur, gardée sur ce poste :', e.message); }
    }
    if (envoyee) return;
    try { localStorage.setItem(CLE_APPRENTISSAGE, JSON.stringify(correctionsApprises)); } catch (e) { console.warn('Sauvegarde de l’apprentissage impossible.', e); }
  }

  function correctionsValides(brut) {
    return Array.isArray(brut)
      ? brut.filter(c => c && typeof c === 'object' && Array.isArray(c.tokens) && typeof c.classification === 'string')
      : [];
  }

  // Au chargement de la page, AVANT la connexion : ce que ce poste avait gardé en local (anciennes
  // corrections, ou corrections qui n'ont pas pu partir). Remplacé par la liste du serveur dès que
  // la session est ouverte (chargerApprentissageServeur).
  async function chargerApprentissage() {
    let brut = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_APPRENTISSAGE, false);
        if (res && res.value) brut = JSON.parse(res.value);
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (brut === null) {
      try {
        const local = localStorage.getItem(CLE_APPRENTISSAGE);
        if (local) brut = JSON.parse(local);
      } catch (e) { /* rien d'exploitable non plus ici */ }
    }
    correctionsApprises = correctionsValides(brut);
  }

  // Liste partagée du bureau, puis reprise UNE fois de ce que ce poste gardait en local et que le
  // serveur n'a pas encore : une correction faite avant ce passage en base n'est pas perdue.
  async function chargerApprentissageServeur() {
    const locales = correctionsValides(correctionsApprises);
    let serveur = null;
    try {
      const reponse = await fetchAvecAuth('/api/corrections-apprises');
      if (reponse.ok) serveur = correctionsValides((await reponse.json()).corrections);
    } catch (e) { console.warn('Corrections apprises indisponibles sur le serveur :', e.message); }
    if (!serveur) return; // serveur injoignable : on garde la liste locale
    correctionsApprises = serveur;
    const connues = new Set(serveur.map(c => c.id));
    for (const c of locales) {
      if (c.id && !connues.has(c.id)) await sauvegarderApprentissage(c);
    }
    try { localStorage.removeItem(CLE_APPRENTISSAGE); } catch (e) { /* sans importance */ }
  }

  // Retrouve, parmi les corrections déjà apprises, la plus proche du contexte donné — ou null si
  // aucune ne dépasse le seuil de similarité. `categorie` distingue les DEUX espaces de
  // classification qui partagent ce même mécanisme (voir memoriserCorrection ci-dessous) : 'date'
  // (type d'échéance pret/acte/ventebien/autre — usage d'origine) et 'engagement' (type
  // d'obligation du vendeur entretien/travaux/document/autre — généralisation demandée par
  // l'étude, voir CLAUDE.md "Apprentissage sur les clauses ajoutées manuellement"). Sans ce filtre,
  // une clause de délai de prêt et une clause d'engagement d'entretien pourraient se confondre par
  // pur hasard de vocabulaire commun et se substituer l'une à l'autre — deux espaces disjoints,
  // jamais comparés entre eux. Une entrée mémorisée AVANT cette distinction (pas de champ
  // `categorie`) est traitée comme 'date', son seul usage jusque-là.
  function trouverCorrectionApprise(contexte, categorie) {
    categorie = categorie || 'date';
    if (correctionsApprises.length === 0) return null;
    const tokens = tokeniserApprentissage(normaliserTexteApprentissage(contexte));
    let meilleure = null;
    let meilleurScore = SEUIL_SIMILARITE_APPRENTISSAGE;
    for (const c of correctionsApprises) {
      if ((c.categorie || 'date') !== categorie) continue;
      const score = similariteJaccard(tokens, new Set(c.tokens));
      if (score >= meilleurScore) { meilleure = c; meilleurScore = score; }
    }
    return meilleure;
  }

  // Enregistre (ou renforce) la correction pour que la même clause-type soit reconnue à l'avenir.
  // classification : selon `categorie` — 'pret'|'acte'|'ventebien'|'autre' pour 'date',
  // 'entretien'|'travaux'|'document'|'autre' pour 'engagement'. libelle : uniquement pour une date
  // classée 'autre' (le nom donné à l'échéance personnalisée).
  function memoriserCorrection(contexte, classification, libelle, categorie) {
    categorie = categorie || 'date';
    if (!contexte || contexte.length < 15) return; // trop court pour donner une empreinte fiable
    const tokens = [...tokeniserApprentissage(normaliserTexteApprentissage(contexte))];
    if (tokens.length < 3) return; // pas assez de matière pour comparer de façon fiable

    const existante = trouverCorrectionApprise(contexte, categorie);
    let entree;
    if (existante && existante.classification === classification) {
      existante.nbConfirmations = (existante.nbConfirmations || 1) + 1;
      existante.dateMaj = new Date().toISOString();
      entree = existante;
    } else {
      entree = {
        id: (crypto.randomUUID ? crypto.randomUUID() : 'c-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
        tokens,
        contexteExemple: contexte.slice(0, 200),
        categorie,
        classification,
        libelle: libelle || null,
        nbConfirmations: 1,
        dateMaj: new Date().toISOString()
      };
      correctionsApprises.push(entree);
      // Filet de sécurité : on garde les corrections les plus confirmées/récentes plutôt que de
      // laisser le stockage croître sans fin au fil des années (même plafond côté serveur).
      if (correctionsApprises.length > MAX_CORRECTIONS_MEMORISEES) {
        correctionsApprises.sort((a, b) => (b.nbConfirmations - a.nbConfirmations) || b.dateMaj.localeCompare(a.dateMaj));
        correctionsApprises.length = MAX_CORRECTIONS_MEMORISEES;
      }
    }
    sauvegarderApprentissage(entree);
  }

  // Apprentissage d'un document mal rattaché à une pièce de la checklist (voir
  // reinitialiserStatutPieceStandard() ci-dessous) : un fichier reconnu à tort par son NOM
  // (`motifNom`) pour une pièce donnée ne doit plus jamais matcher CETTE pièce, sur AUCUN dossier
  // — demandé explicitement par l'étude ("permettre au système d'apprendre de son erreur"), qui a
  // choisi la portée la plus large (une règle apprise globale) plutôt qu'une simple exclusion
  // locale à ce seul dossier. Stocké séparément de `correctionsApprises` (mécanisme par similarité
  // de texte, pas adapté ici : un nom de fichier n'est pas une clause à comparer par Jaccard, c'est
  // une correspondance exacte qu'il faut simplement empêcher de se reproduire) — un objet
  // `{ [cle]: [nomNormalisé, ...] }`, même stockage `window.storage`/`localStorage` que le reste de
  // l'apprentissage.
  const CLE_EXCLUSIONS_MOTIF_NOM = 'exclusions-motif-nom';
  let exclusionsMotifNom = {};

  // Journal des corrections apportées à la main sur ce que l'extraction avait proposé (voir
  // diffCorrectionsExtraction). Sert UNIQUEMENT à mesurer, plus tard, où l'extraction se trompe le
  // plus souvent — il n'alimente aucun réentraînement automatique du modèle local, décision
  // explicite de la spec : une regex se corrige à la main après analyse, jamais par apprentissage
  // silencieux sur des dizaines de dossiers.
  const CLE_CORRECTIONS_EXTRACTION = 'corrections-extraction';
  const MAX_CORRECTIONS_EXTRACTION = 500;
  let journalCorrectionsExtraction = [];

  // Journal commun à tous les postes, sur le serveur (étude, 02/10 : « où est ce journal ? » — il était gardé
  // dans le navigateur de chaque poste, chacun ne voyait que ses propres corrections). Les entrées encore
  // gardées sur ce poste sont reprises une fois sur le serveur, puis effacées du navigateur.
  async function chargerJournalCorrections() {
    try {
      const local = JSON.parse(localStorage.getItem(CLE_CORRECTIONS_EXTRACTION) || 'null');
      if (Array.isArray(local) && local.length) {
        const r = await fetchAvecAuth('/api/corrections-extraction', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entrees: local.slice(-100) })
        });
        if (r.ok) localStorage.removeItem(CLE_CORRECTIONS_EXTRACTION);
      }
    } catch (e) { /* reprise retentée au prochain démarrage */ }
    try {
      const r = await fetchAvecAuth('/api/corrections-extraction');
      if (r.ok) {
        const data = await r.json();
        journalCorrectionsExtraction = Array.isArray(data.journal) ? data.journal : [];
      }
    } catch (e) { console.warn('Journal des corrections indisponible :', e.message); }
    return journalCorrectionsExtraction;
  }

  function journaliserCorrectionsExtraction(entrees) {
    if (!Array.isArray(entrees) || entrees.length === 0) return;
    journalCorrectionsExtraction.push(...entrees);
    // Rapport technique : le nom du champ et qui l'avait proposé, jamais les valeurs.
    entrees.forEach(e => noterJournalTechnique({ categorie: 'correction-extraction', champ: e.champ, origine: e.origine }));
    if (journalCorrectionsExtraction.length > MAX_CORRECTIONS_EXTRACTION) {
      journalCorrectionsExtraction = journalCorrectionsExtraction.slice(-MAX_CORRECTIONS_EXTRACTION);
    }
    fetchAvecAuth('/api/corrections-extraction', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entrees })
    }).catch(e => console.warn('Correction non journalisée sur le serveur :', e.message));
  }

  function viderJournalCorrections() {
    const nb = journalCorrectionsExtraction.length;
    if (nb === 0) return;
    demanderConfirmation(
      `Vider le journal des corrections (${nb} entrée${nb > 1 ? 's' : ''}) ? La mesure repart de zéro, sur tous les postes ; les dossiers et ce que CLAIRE a appris ne changent pas.`,
      async () => {
        try {
          const r = await fetchAvecAuth('/api/corrections-extraction', { method: 'DELETE' });
          if (!r.ok) throw new Error('statut ' + r.status);
          journalCorrectionsExtraction = [];
          renderPageApprentissage();
          afficherToast('Journal des corrections vidé.', 'OK', null);
        } catch (e) { afficherToast('Le journal n’a pas pu être vidé : ' + e.message, 'OK', null); }
      }
    );
  }
