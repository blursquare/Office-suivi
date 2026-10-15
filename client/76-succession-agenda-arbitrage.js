  // ==== SUCCESSIONS : AGENDA ET ARBITRAGE DU FORFAIT MOBILIER RELIÉS À LA FICHE (étude 15/10) ====
  // « Connecter les outils agenda et arbitrage à la fiche dossier » :
  //  - Agenda : chaque rendez-vous du déroulé (ouverture avec Sophie, notoriété, déclaration de succession) se place depuis sa carte
  //    du Tableau — l'écran Agenda s'ouvre sur « Nouveau rendez-vous », dossier, titre et date proposés ; une fois créé, la date est
  //    notée sur la fiche (ouverture : `d.succession.ouvertureLe` ; acte : rendez-vous de signature, comme pour une vente).
  //  - Arbitrage du forfait mobilier : ouvert depuis le « Contrôle à 2 mois », intitulé au nom du dossier, la dernière simulation
  //    reprise ; « Enregistrer sur la fiche » garde le résultat (`d.succession.arbitrage`), montré sous « Inventaire ».

  var ETAPES_AGENDA_SUCCESSION = {
    ouvertureSuccession: { suffixe: 'Ouverture avec Sophie', signature: false },
    notoriete: { suffixe: 'Acte de notoriété', signature: true },
    declarationSuccession: { suffixe: 'Déclaration de succession', signature: true }
  };

  // Pure : le rendez-vous proposé pour une étape d'une succession → { titre, date, signature } ou null (étape sans rendez-vous).
  // Date proposée : début de la fenêtre (notoriété + DS), sinon la date butoir, jamais avant aujourd'hui ; ouverture = dans 7 jours.
  function rdvAgendaSuccession(d, etape, aujIso) {
    const def = ETAPES_AGENDA_SUCCESSION[etape];
    if (!d || !def) return null;
    const auj = String(aujIso || '').slice(0, 10);
    const e = etapesSuccession(d, auj).find(x => x.type === etape);
    if (!e || e.fait || e.rdvPlace || (etape === 'ouvertureSuccession' && e.iso)) return null;
    let date = etape === 'ouvertureSuccession' ? (auj ? addDays(auj, 7) : auj) : (e.fenetreDebut || e.iso || auj);
    if (date < auj) date = auj;
    const suffixe = etape === 'notoriete' && /declaration/i.test(normaliserPourRecherche(e.label)) ? 'Notoriété et déclaration de succession' : def.suffixe;
    const noto = etapesSuccession(d, auj).find(x => x.type === 'notoriete');
    return { titre: `${libelleDossierAffiche(d)} - ${suffixe}`, date, signature: def.signature, apresNotoriete: etape === 'declarationSuccession' && !!(noto && noto.fait) };
  }

  // Ouvre l'Agenda sur « Nouveau rendez-vous » prérempli pour cette étape (dossier, titre, date, case « signature »).
  function placerRdvSuccessionAgenda(dossierId, etape) {
    const d = dossiers.find(x => x.id === dossierId);
    const r = rdvAgendaSuccession(d, etape, isoAujourdhuiLocal());
    if (!r) return;
    definirOnglet('agenda');
    ouvrirCreationAgenda(r.date, '10:00');
    if (!agendaModale) return; // Exchange pas réglé : ouvrirCreationAgenda l'a dit
    agendaModale.lien = { dossierId, etape };
    const choix = document.getElementById('agenda-creation-dossier');
    if (choix) { choix.value = d.id; choisirDossierCreationAgenda(d.id); }
    const titre = document.getElementById('agenda-creation-titre');
    if (titre) titre.value = r.titre;
    majCaseSignatureCreationAgenda();
    const sig = document.getElementById('agenda-creation-signature');
    // La notoriété signée, la date de signature de la fiche est la sienne : le rendez-vous de la déclaration la remplace.
    if (sig) sig.checked = r.signature && (!d.rendezVousSignature || r.apresNotoriete);
  }

  // Après la création d'un rendez-vous ouvert depuis la fiche : la date de l'ouverture notée sur la succession (l'acte, lui, passe
  // par la case « signature »).
  function noterRdvAgendaSuccession(lien, date) {
    if (!lien || lien.etape !== 'ouvertureSuccession') return;
    const d = dossiers.find(x => x.id === lien.dossierId);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
    d.succession = Object.assign({}, d.succession, { ouvertureLe: date });
    ajouterHistorique(d, `Rendez-vous d’ouverture avec Sophie fixé depuis l’agenda : ${formatDateFr(date)}`);
    sauvegarder(d);
  }

  // ---- Arbitrage du forfait mobilier ----
  var arbitrageDossierId = '';

  // Depuis la barre latérale : une simulation libre, rattachée à aucune succession.
  function ouvrirArbitrageSansDossier() {
    arbitrageDossierId = '';
    definirOnglet('inventaire');
    majBoutonArbitrageFiche();
  }

  function ouvrirArbitrageDepuisFiche(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    definirOnglet('inventaire');
    arbitrageDossierId = d.id;
    const a = d.succession && d.succession.arbitrage;
    const poser = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== '') el.value = String(v); };
    const champDossier = document.getElementById('inv-dossier');
    if (champDossier) champDossier.value = libelleDossierAffiche(d);
    // La dernière simulation de ce dossier reprise ; sinon les deux simulations de droits vides (les coûts habituels restent).
    if (a && a.saisie) {
      Object.entries(CHAMPS_SAISIE_ARBITRAGE).forEach(([cle, id]) => poser(id, a.saisie[cle]));
      const trajet = document.getElementById('inv-trajet-actif');
      if (trajet) { trajet.checked = !!a.saisie.trajetActif; basculerTrajetsInventaire(); }
    }
    else ['inv-droits-sans', 'inv-droits-avec'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    calculerInventaireAffichage();
    majBoutonArbitrageFiche();
  }

  var CHAMPS_SAISIE_ARBITRAGE = { droitsSans: 'inv-droits-sans', droitsAvec: 'inv-droits-avec', fraisOuverture: 'inv-frais-ouverture', prisee: 'inv-prisee',
    fraisCloture: 'inv-frais-cloture', sermentNb: 'inv-serment-nb', sermentUnit: 'inv-serment-unit', trajetNb: 'inv-trajet-nb', trajetUnit: 'inv-trajet-unit' };

  // Le bouton « Enregistrer sur la fiche » de l'outil : visible quand l'outil a été ouvert depuis une succession.
  function majBoutonArbitrageFiche() {
    const b = document.getElementById('inv-enregistrer-fiche');
    const d = arbitrageDossierId ? dossiers.find(x => x.id === arbitrageDossierId) : null;
    if (b) { b.style.display = d ? '' : 'none'; if (d) b.textContent = `Enregistrer sur la fiche ${libelleDossierAffiche(d)}`; }
  }

  // Pure : le résultat gardé sur la fiche à partir d'une saisie de l'outil, ou null si la simulation est incomplète.
  function arbitrageAEnregistrer(saisie, maintenantIso, auteur) {
    const r = calculerArbitrageInventaire(saisie);
    if (!r.complet) return null;
    const v = verdictArbitrageInventaire(r);
    const garde = {};
    Object.keys(CHAMPS_SAISIE_ARBITRAGE).forEach(k => { garde[k] = String(saisie[k] == null ? '' : saisie[k]); });
    garde.trajetActif = !!saisie.trajetActif;
    return { le: String(maintenantIso || '').slice(0, 10), par: auteur || '', droitsSans: r.droitsSans, droitsAvec: r.droitsAvec, cout: r.cout, net: r.net,
      verdict: v.cle, libelle: v.libelle, saisie: garde };
  }

  function enregistrerArbitrageSurFiche() {
    const d = arbitrageDossierId ? dossiers.find(x => x.id === arbitrageDossierId) : null;
    if (!d) return;
    const a = arbitrageAEnregistrer(lireSaisieInventaire(), new Date().toISOString(), utilisateurPoste || '');
    if (!a) { afficherToast('Saisissez les droits de succession dans les deux hypothèses avant d’enregistrer.', 'OK', null); return; }
    d.succession = Object.assign({}, d.succession, { arbitrage: a });
    ajouterHistorique(d, `Arbitrage du forfait mobilier : ${a.libelle} (économie nette ${formaterPrix(a.net)})`);
    sauvegarder(d);
    afficherToast(`Arbitrage enregistré sur ${libelleDossierAffiche(d)}.`, 'Ouvrir la fiche', () => ouvrirDossierDrawer(d.id));
  }

  // Ligne de la fiche (Contrôle à 2 mois) : le dernier arbitrage et le bouton vers l'outil.
  function ligneArbitrageFiche(d) {
    const a = d.succession && d.succession.arbitrage;
    const dl = a ? (a.verdict === 'favorable' ? 'dl-success' : 'dl-urgent') : '';
    const resultat = a ? `<span class="dot-label ${dl}"><span class="dot"></span>${escapeHtml(a.libelle)}</span> <span class="hint">économie nette ${escapeHtml(formaterPrix(a.net))} · le ${escapeHtml(formatDateFr(a.le))}</span>` : '<span class="hint">Pas encore simulé</span>';
    return `<span class="succ-identite">${resultat} <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="ouvrirArbitrageDepuisFiche('${escapeOnclickArg(d.id)}')">${a ? 'Revoir l’arbitrage' : 'Simuler l’arbitrage'}</wa-button></span>`;
  }
