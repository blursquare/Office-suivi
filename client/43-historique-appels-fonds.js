  // ==== HISTORIQUE DES APPELS DE FONDS ====
  //
  // Étude 06/10 : « faire un historique des appels de fonds créés pour les retrouver ». Chaque courrier téléchargé ou
  // envoyé par email depuis l'outil Appel de fonds est gardé sur le serveur (clé `appels-fonds`, server/src/appelsFonds.js) :
  // le courrier TEL QU'IL EST SORTI (`donnees`, les champs du modèle Word — de quoi refaire le même .docx, corrections faites
  // dans l'aperçu comprises) et l'état de l'outil (`etat`, pour le reprendre et le remodifier). Retrouvé par la fenêtre
  // « Courriers créés » de l'outil et dans l'onglet Fonds de la fiche du dossier. Un même courrier retéléchargé après une
  // retouche met à jour sa ligne (`afHistoriqueId`) ; choisir un autre dossier ou « Effacer » en commence une nouvelle.

  var afHistoriqueId = null;          // ligne de l'historique du courrier en cours, null = pas encore sorti
  var afHistoriqueDossier = null;     // dossier de cette ligne : un autre dossier relié en commence une nouvelle
  var appelsFondsHistorique = null;   // résumés relus du serveur, null = pas encore lus
  var appelsFondsHistoriqueEnCours = null;
  var CHAMPS_ETAT_APPEL_FONDS = ['af-ref', 'af-date-lettre', 'af-date-rdv', 'af-heure-rdv', 'af-lieu', 'af-lieu-autre', 'af-designation',
    'af-adresse-bien', 'af-adresse-clients', 'af-frais-departement', 'af-frais-type', 'af-prix-mobilier'];
  var CASES_ETAT_APPEL_FONDS = ['af-sans-pret', 'af-pret-hypothecaire'];
  var LIBELLES_GESTES_APPEL_FONDS = { telecharge: 'Téléchargé', prepare: 'Email préparé', envoye: 'Email envoyé', modifie: 'Modifié' };
  // Textes du courrier que l'on peut retoucher dans l'aperçu (la lettre est modifiable) et que le .docx reprend : remis tels
  // qu'ils sont sortis quand on reprend un courrier, pour le remodifier là où on l'avait laissé.
  var CHAMPS_APERCU_APPEL_FONDS = {
    ville: 'af-p-ville', dateLettre: 'af-p-datelettre', salut1: 'af-p-salut1', designation: 'af-p-designation',
    adresseBien: 'af-p-adressebien', rdvPhrase: 'af-p-rdv', salut2: 'af-p-salut2', phraseDeblocage: 'af-p-deblocage', notaire: 'af-p-notaire'
  };
  var afHistoriqueNom = '';           // nom du .docx du courrier repris, gardé à l'enregistrement des modifications

  function nouvelIdAppelFonds() {
    return 'af-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // Ligne de l'historique d'un courrier qui vient de sortir. Pure : le poste fournit tout (testable).
  function entreeHistoriqueAppelFonds(o) {
    const etat = o.etat || {};
    const le = o.maintenant || new Date().toISOString();
    const d = o.dossier || null;
    const destinataires = lignesDestinatairesAppelFonds(etat.clients || [], etat.situation || '').join(' et ');
    return {
      id: o.id,
      creeLe: le,
      modifieLe: le,
      par: o.par || '',
      dossierId: d ? d.id : '',
      dossier: d ? libelleDossierAffiche(d) : '',
      destinataires,
      dateRdv: (etat.champs && etat.champs['af-date-rdv']) || '',
      nomFichier: o.nomFichier || '',
      mode: etat.mode === 'confrere' ? 'confrere' : 'office',
      gestes: [{ type: o.geste, le, par: o.par || '' }],
      donnees: o.donnees,
      etat
    };
  }

  // Recherche dans l'historique : dossier, destinataires, référence du courrier, auteur.
  function filtrerAppelsFonds(liste, recherche) {
    const q = normaliserPourRecherche(String(recherche || '').trim());
    if (!q) return liste.slice();
    return liste.filter(a => normaliserPourRecherche([a.dossier, a.destinataires, a.ref, a.par].join(' ')).includes(q));
  }

  // « Email envoyé le 6 oct. par Julie » : le dernier geste dit où en est le courrier.
  function texteDernierGesteAppelFonds(a, maintenant) {
    const gestes = Array.isArray(a && a.gestes) ? a.gestes : [];
    const dernier = gestes[gestes.length - 1];
    if (!dernier) return '';
    const quand = quandConsulte(dernier.le, maintenant);
    const prefixe = /^\d/.test(quand) && quand.includes(':') ? 'à ' : (quand === 'hier' ? '' : 'le ');
    return `${LIBELLES_GESTES_APPEL_FONDS[dernier.type] || 'Créé'} ${prefixe}${quand}${dernier.par ? ` par ${dernier.par}` : ''}`;
  }

  // L'outil tel qu'il est : de quoi le reprendre plus tard.
  function etatOutilAppelFonds() {
    const champs = {};
    CHAMPS_ETAT_APPEL_FONDS.forEach(id => { const e = afEl(id); if (e) champs[id] = String(e.value || ''); });
    const cases = {};
    CASES_ETAT_APPEL_FONDS.forEach(id => { const e = afEl(id); if (e) cases[id] = !!e.checked; });
    const mention = afEl('af-p-mention');
    return {
      dossierLie: afDossierLie || '',
      clients: afClients.map(c => ({ civilite: c.civilite, prenom: c.prenom || '', nom: c.nom || '' })),
      situation: afSituation || '',
      mode: afModeDecompte,
      lignes: JSON.parse(JSON.stringify(afLignes)),
      champs,
      cases,
      mention: mention ? mention.textContent : ''
    };
  }

  // Après un téléchargement ou un email réussi. Un échec ici ne gâche pas le geste : il est dit, le courrier est parti.
  async function enregistrerAppelFondsHistorique(geste, nomFichier, donnees) {
    if (!afHistoriqueId || afHistoriqueDossier !== (afDossierLie || '')) afHistoriqueId = nouvelIdAppelFonds();
    afHistoriqueDossier = afDossierLie || '';
    const d = afDossierLie ? dossiers.find(x => x.id === afDossierLie) : null;
    const entree = entreeHistoriqueAppelFonds({
      id: afHistoriqueId, par: utilisateurPoste, dossier: d, nomFichier, geste,
      donnees: donnees || donneesCourrierAppelFonds(), etat: etatOutilAppelFonds()
    });
    try {
      const r = await fetchAvecAuth('/api/appels-fonds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appel: entree })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const { appel } = await r.json();
      if (Array.isArray(appelsFondsHistorique)) appelsFondsHistorique = [appel, ...appelsFondsHistorique.filter(a => a.id !== appel.id)];
      renderHistoriqueAppelsFonds();
      majCompteurHistoriqueAppelsFonds();
      return true;
    } catch (e) {
      console.warn('Historique des appels de fonds :', e);
      afficherToast(geste === 'modifie' ? "Les modifications n'ont pas pu être enregistrées : serveur injoignable."
        : "Le courrier est sorti, mais n'a pas pu être ajouté à l'historique.", 'OK', null);
      return false;
    }
  }

  async function chargerAppelsFondsHistorique(force) {
    if (appelsFondsHistorique && !force) return appelsFondsHistorique;
    if (appelsFondsHistoriqueEnCours) return appelsFondsHistoriqueEnCours;
    appelsFondsHistoriqueEnCours = (async () => {
      try {
        const r = await fetchAvecAuth('/api/appels-fonds');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        appelsFondsHistorique = (await r.json()).appels || [];
      } catch (e) {
        console.warn('Historique des appels de fonds :', e);
        if (!appelsFondsHistorique) appelsFondsHistorique = null;
      } finally {
        appelsFondsHistoriqueEnCours = null;
      }
      majCompteurHistoriqueAppelsFonds();
      return appelsFondsHistorique;
    })();
    return appelsFondsHistoriqueEnCours;
  }

  async function lireAppelFondsComplet(id) {
    const r = await fetchAvecAuth('/api/appels-fonds/' + encodeURIComponent(id));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.json()).appel;
  }

  function majCompteurHistoriqueAppelsFonds() {
    const bouton = afEl('af-historique-btn');
    if (!bouton) return;
    const n = Array.isArray(appelsFondsHistorique) ? appelsFondsHistorique.length : 0;
    bouton.textContent = n ? `Courriers créés (${n})` : 'Courriers créés';
  }

  // --- fenêtre « Courriers créés » de l'outil -----------------------------------------------------------------------------
  function ouvrirHistoriqueAppelsFonds() {
    const overlay = afEl('af-historique-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    const champ = afEl('af-historique-recherche');
    if (champ) champ.value = '';
    renderHistoriqueAppelsFonds();
    chargerAppelsFondsHistorique(true).then(renderHistoriqueAppelsFonds);
  }

  function fermerHistoriqueAppelsFonds() {
    const overlay = afEl('af-historique-overlay');
    if (overlay) overlay.style.display = 'none';
  }
  document.addEventListener('keydown', (e) => {
    const overlay = afEl('af-historique-overlay');
    if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') fermerHistoriqueAppelsFonds();
  });

  function ligneHistoriqueAppelFonds(a, avecDossier) {
    const titre = avecDossier ? (a.dossier || a.destinataires || 'Sans dossier') : (a.destinataires || a.ref || 'Courrier');
    const details = [
      avecDossier && a.dossier && a.destinataires ? a.destinataires : '',
      a.mode === 'confrere' ? 'Décompte du confrère' : '',
      a.dateRdv ? 'RDV ' + formatDateFr(a.dateRdv) : '',
      texteDernierGesteAppelFonds(a)
    ].filter(Boolean).join(' · ');
    const id = escapeOnclickArg(a.id);
    return `<li class="af-histo-ligne">
      <div class="af-histo-texte">
        <span class="af-histo-titre">${escapeHtml(titre)}</span>
        <span class="af-histo-detail">${escapeHtml(details)}</span>
      </div>
      ${a.solde ? `<span class="af-histo-solde">${escapeHtml(a.solde)}</span>` : ''}
      <div class="af-histo-actions">
        <wa-button appearance="outlined" size="s" pill class="action-rapide" onclick="telechargerAppelFondsHistorique('${id}', this)">Télécharger</wa-button>
        ${a.rouvrable ? `<wa-button appearance="outlined" size="s" pill class="action-rapide" onclick="modifierAppelFondsHistorique('${id}')">Modifier</wa-button>` : ''}
        <wa-button appearance="plain" size="s" class="bouton-icone" title="Retirer de l'historique" onclick="supprimerAppelFondsHistorique('${id}')">${icone('x')}</wa-button>
      </div>
    </li>`;
  }

  function renderHistoriqueAppelsFonds() {
    const cible = afEl('af-historique-liste');
    const overlay = afEl('af-historique-overlay');
    if (cible && overlay && overlay.style.display !== 'none') {
      if (!Array.isArray(appelsFondsHistorique)) {
        cible.innerHTML = `<p class="fiche-vide">${appelsFondsHistoriqueEnCours ? 'Lecture…' : 'Historique illisible : serveur injoignable.'}</p>`;
      } else {
        const champ = afEl('af-historique-recherche');
        const liste = filtrerAppelsFonds(appelsFondsHistorique, champ ? champ.value : '');
        cible.innerHTML = liste.length
          ? `<ul class="af-histo-liste">${liste.slice(0, 200).map(a => ligneHistoriqueAppelFonds(a, true)).join('')}</ul>`
          : `<p class="fiche-vide">${appelsFondsHistorique.length ? 'Aucun courrier ne correspond.' : 'Aucun courrier d’appel de fonds créé pour l’instant.'}</p>`;
      }
    }
    // La fiche ouverte montre aussi ceux de son dossier.
    document.querySelectorAll('[data-appels-fonds-dossier]').forEach(bloc => {
      bloc.innerHTML = contenuAppelsFondsDossier(bloc.getAttribute('data-appels-fonds-dossier'));
    });
  }

  // --- onglet Fonds de la fiche -----------------------------------------------------------------------------------------
  function contenuAppelsFondsDossier(dossierId) {
    if (!Array.isArray(appelsFondsHistorique)) return '';
    const liste = appelsFondsHistorique.filter(a => a.dossierId === dossierId);
    if (!liste.length) return '';
    return `<div class="echanges-groupe">
      <div class="echanges-tete"><span class="section-eyebrow">Courriers d'appel de fonds</span></div>
      <ul class="af-histo-liste">${liste.map(a => ligneHistoriqueAppelFonds(a, false)).join('')}</ul>
    </div>`;
  }

  function renderAppelsFondsDossier(d) {
    if (!d) return '';
    if (!Array.isArray(appelsFondsHistorique)) chargerAppelsFondsHistorique().then(renderHistoriqueAppelsFonds);
    return `<div data-appels-fonds-dossier="${escapeAttr(d.id)}">${contenuAppelsFondsDossier(d.id)}</div>`;
  }

  // --- gestes -----------------------------------------------------------------------------------------------------------
  async function telechargerAppelFondsHistorique(id, btn) {
    const libelleInitial = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Génération…'; }
    try {
      const a = await lireAppelFondsComplet(id);
      const { blob, nom } = await genererBlobAppelFonds(a.donnees, a.nomFichier);
      telechargerFichier(blob, nom);
    } catch (e) {
      console.error(e);
      afficherToast("Ce courrier n'a pas pu être refait (serveur injoignable, ou bibliothèques non chargées).", 'OK', null);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = libelleInitial; }
    }
  }

  // Reprend le courrier dans l'outil, tel qu'il est sorti (retouches de l'aperçu comprises), pour le remodifier : « Enregistrer
  // les modifications », un nouveau téléchargement ou un email mettent ensuite à jour la même ligne de l'historique.
  async function modifierAppelFondsHistorique(id) {
    let a;
    try { a = await lireAppelFondsComplet(id); } catch (e) {
      console.error(e);
      afficherToast("Ce courrier n'a pas pu être relu : serveur injoignable.", 'OK', null);
      return;
    }
    const etat = a && a.etat;
    if (!etat) { afficherToast('Ce courrier ne peut que se retélécharger.', 'OK', null); return; }
    fermerHistoriqueAppelsFonds();
    if (typeof fermerDossierDrawer === 'function') fermerDossierDrawer();
    definirOnglet('appel-fonds');
    reinitialiserAppelFonds();
    afDossierLie = etat.dossierLie && dossiers.some(x => x.id === etat.dossierLie) ? etat.dossierLie : null;
    afClients = Array.isArray(etat.clients) && etat.clients.length
      ? etat.clients.map(c => ({ civilite: AF_CIVILITES.includes(c.civilite) ? c.civilite : 'M', prenom: String(c.prenom || ''), nom: String(c.nom || '') }))
      : [{ civilite: 'M', prenom: '', nom: '' }];
    afSituation = SITUATIONS_CLIENT.some(x => x.cle === etat.situation) ? etat.situation : '';
    const champSituation = afEl('af-situation');
    if (champSituation) champSituation.value = afSituation;
    const champs = etat.champs || {};
    CHAMPS_ETAT_APPEL_FONDS.forEach(cle => { const e = afEl(cle); if (e && typeof champs[cle] === 'string') e.value = champs[cle]; });
    const cases = etat.cases || {};
    CASES_ETAT_APPEL_FONDS.forEach(cle => { const e = afEl(cle); if (e) e.checked = !!cases[cle]; });
    afFraisChoisiALaMain = { departement: !!champs['af-frais-departement'], type: !!champs['af-frais-type'] };
    definirModeDecompteAppelFonds(etat.mode);
    const lignes = etat.lignes || {};
    afLignes = { debit: Array.isArray(lignes.debit) ? lignes.debit : [], credit: Array.isArray(lignes.credit) ? lignes.credit : [] };
    renderPillDossierAppelFonds();
    renderClientsAppelFonds();
    renderTableAppelFonds();
    majLieuAppelFonds();
    const mention = afEl('af-p-mention');
    if (mention && etat.mention) mention.textContent = etat.mention;
    majApercuAppelFonds();
    const donnees = a.donnees || {};
    Object.keys(CHAMPS_APERCU_APPEL_FONDS).forEach(cle => {
      const e = afEl(CHAMPS_APERCU_APPEL_FONDS[cle]);
      if (e && typeof donnees[cle] === 'string' && donnees[cle].trim()) e.textContent = donnees[cle];
    });
    afHistoriqueId = a.id;
    afHistoriqueDossier = afDossierLie || '';
    afHistoriqueNom = a.nomFichier || '';
    const recap = afEl('af-recap-prefill');
    if (recap) {
      recap.innerHTML = `<div class="af-recap-bloc"><div class="af-recap-titre">Courrier repris pour modification ${infoBulle("Modifiez le formulaire ou directement l'aperçu. « Enregistrer les modifications », un nouveau téléchargement ou l'email mettent à jour ce courrier dans l'historique, sans en créer un autre.")}</div><ul><li>${escapeHtml(texteDernierGesteAppelFonds(a))}</li></ul></div>
        <wa-button appearance="outlined" size="s" class="af-histo-enregistrer" onclick="enregistrerModificationsAppelFonds(this)">Enregistrer les modifications</wa-button>`;
      recap.className = 'af-recap af-recap-visible';
    }
  }

  // Le courrier repris et retouché, gardé sans le retélécharger.
  async function enregistrerModificationsAppelFonds(btn) {
    if (!afHistoriqueId) return;
    if (btn) btn.disabled = true;
    try {
      const ok = await enregistrerAppelFondsHistorique('modifie', afHistoriqueNom || afNomFichierDocx(afClients.filter(c => String(c.nom || '').trim())));
      if (ok) {
        const ligne = document.querySelector('#af-recap-prefill li');
        const a = Array.isArray(appelsFondsHistorique) ? appelsFondsHistorique.find(x => x.id === afHistoriqueId) : null;
        if (ligne && a) ligne.textContent = texteDernierGesteAppelFonds(a);
        afficherToast('Modifications enregistrées dans l’historique.', 'OK', null);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function supprimerAppelFondsHistorique(id) {
    demanderConfirmation("Retirer ce courrier de l'historique ? Le fichier déjà envoyé ou enregistré n'est pas touché.", async () => {
      try {
        const r = await fetchAvecAuth('/api/appels-fonds/' + encodeURIComponent(id), { method: 'DELETE' });
        if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
        if (Array.isArray(appelsFondsHistorique)) appelsFondsHistorique = appelsFondsHistorique.filter(a => a.id !== id);
        if (afHistoriqueId === id) afHistoriqueId = null;
        renderHistoriqueAppelsFonds();
        majCompteurHistoriqueAppelsFonds();
      } catch (e) {
        console.error(e);
        afficherToast("Ce courrier n'a pas pu être retiré : serveur injoignable.", 'OK', null);
      }
    }, { bouton: 'Retirer', ton: 'danger' });
  }
