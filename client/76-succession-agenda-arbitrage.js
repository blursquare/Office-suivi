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
    declarationSuccession: { suffixe: 'Déclaration de succession', signature: true },
    // Tout autre rendez-vous du dossier (étude 16/10 : « il peut y avoir plusieurs rendez-vous par dossier ») : héritiers, inventaire…
    autre: { suffixe: 'Rendez-vous', signature: false },
    // L'inventaire est un acte notarié signé chez le client, avec un commissaire de justice (étude 21/10) : rendez-vous « à l'extérieur », en orange.
    controleDroits: { suffixe: 'Inventaire', signature: true, typeRdv: 'confrere' }
  };

  // Pure : le rendez-vous proposé pour une étape d'une succession → { titre, date, signature } ou null (étape sans rendez-vous).
  // Date proposée : début de la fenêtre (notoriété + DS), sinon la date butoir, jamais avant aujourd'hui ; ouverture = dans 7 jours.
  function rdvAgendaSuccession(d, etape, aujIso) {
    const def = ETAPES_AGENDA_SUCCESSION[etape];
    if (!d || !def) return null;
    const auj = String(aujIso || '').slice(0, 10);
    if (etape === 'autre') return { titre: `${libelleDossierAffiche(d)} - ${def.suffixe}`, date: auj ? addDays(auj, 7) : auj, signature: false };
    const e = etapesSuccession(d, auj).find(x => x.type === etape);
    // Le contrôle des droits fait, l'inventaire se place encore (étude 21/10) : seule la présence d'un rendez-vous l'en empêche.
    if (!e || (e.fait && etape !== 'controleDroits') || e.rdvPlace || (etape === 'ouvertureSuccession' && e.iso)) return null;
    if (etape === 'controleDroits') return { titre: `${libelleDossierAffiche(d)} - ${def.suffixe}`, date: auj ? addDays(auj, 14) : auj, signature: def.signature, typeRdv: def.typeRdv };
    let date = etape === 'ouvertureSuccession' ? (auj ? addDays(auj, 7) : auj) : (e.fenetreDebut || e.iso || auj);
    if (date < auj) date = auj;
    const suffixe = etape === 'notoriete' && /declaration/i.test(normaliserPourRecherche(e.label)) ? 'Notoriété et déclaration de succession' : def.suffixe;
    return { titre: `${libelleDossierAffiche(d)} - ${suffixe}`, date, signature: def.signature };
  }

  // Pure : l'adresse de la maison du défunt pour l'itinéraire de l'inventaire — « 2 rue X, 41110 SAINT-AIGNAN » — ou '' (autre rendez-vous,
  // domicile non lu). Seule exception où l'adresse d'un client part vers le service d'itinéraire de l'IGN (demande de l'étude, 21/10).
  function adresseInventaireSuccession(d, etape) {
    if (!d || !estSuccession(d) || etape !== 'controleDroits') return '';
    const dom = String(defuntConstitution(d).champs.domicile || '').trim();
    const m = /^(.+?)\s*\((\d{5})\),\s*(.+)$/.exec(dom);
    const adresse = m ? `${m[3]}, ${m[2]} ${m[1]}` : dom;
    return /\d{5}/.test(adresse) ? adresse : '';
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
    // Chaque rendez-vous d'une succession est gardé à part sur la fiche (`d.succession.rendezVous`) : la case suit l'étape.
    if (sig) sig.checked = !!r.signature;
    // Inventaire : rendez-vous à l'extérieur, catégorie orange.
    const radio = r.typeRdv ? document.querySelector(`input[name="agenda-creation-type"][value="${r.typeRdv}"]`) : null;
    if (radio) radio.checked = true;
  }

  // ---- Les rendez-vous d'une succession (étude 16/10 : « plusieurs rendez-vous par dossier ») ----
  // Chaque rendez-vous créé pour une succession, depuis sa fiche ou l'agenda, s'ajoute à `d.succession.rendezVous` au lieu de remplacer
  // une seule date de signature ; déplacé ou supprimé dans l'agenda de CLAIRE, il suit. La date de signature de la fiche
  // (`rendezVousSignature`, lue par le bandeau, le Suivi, l'agenda) devient le prochain rendez-vous d'acte.

  // Pure : la liste après l'ajout d'un rendez-vous (la date de signature d'avant reprise une fois, comme un « acte »).
  function rendezVousSuccessionAvecAjout(d, r) {
    const liste = rendezVousSuccession(d).map(x => { const c = Object.assign({}, x); delete c.ancien; return c; });
    liste.push({ id: r.id || `rdv-${Date.now().toString(36)}`, etape: ETAPES_RDV_SUCCESSION.includes(r.etape) ? r.etape : 'autre', titre: String(r.titre || '').slice(0, 200),
      date: r.date, heure: r.heure || '', itemId: r.itemId || '', changeKey: r.changeKey || '' });
    return liste.sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
  }

  // La date de signature de la fiche = le prochain rendez-vous d'acte (notoriété, déclaration, acte) ; sinon le dernier ; sinon rien.
  function synchroniserSignatureSuccession(d) {
    const r = signatureSuccessionDepuisRendezVous(rendezVousSuccession(d), isoAujourdhuiLocal());
    d.rendezVousSignature = r ? r.date : null;
    d.rendezVousSignatureHeure = r ? r.heure : '';
    d.rdvAgendaItem = r && r.itemId ? { itemId: r.itemId, changeKey: r.changeKey || '', date: r.date } : null;
    if (r) { d.confiance = d.confiance || {}; d.confiance.rendezVousSignature = 'manuel'; }
  }

  // Pure : l'étape d'un rendez-vous créé pour une succession — celle de la carte de la fiche, sinon « acte » si la case signature est
  // cochée, sinon « autre » ; un titre provisoire (« ? ») n'est jamais un acte.
  function etapeRendezVousSuccessionCree(etapeFiche, signature, provisoire) {
    const etape = etapeFiche || (signature ? 'acte' : 'autre');
    return provisoire && ['notoriete', 'controleDroits', 'declarationSuccession', 'acte'].includes(etape) ? 'autre' : etape;
  }

  function noterRendezVousSuccession(d, r) {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) return;
    d.succession = Object.assign({}, d.succession, { rendezVous: rendezVousSuccessionAvecAjout(d, r) });
    if (r.etape === 'ouvertureSuccession') d.succession.ouvertureLe = r.date;
    synchroniserSignatureSuccession(d);
    const libelle = { ouvertureSuccession: 'd’ouverture avec Sophie', notoriete: 'de l’acte de notoriété', controleDroits: 'de l’inventaire', declarationSuccession: 'de la déclaration de succession', acte: 'de signature' }[r.etape];
    ajouterHistorique(d, `Rendez-vous ${libelle || `« ${r.titre} »`} fixé depuis l’agenda : ${formatDateFr(r.date)}${r.heure ? ' à ' + r.heure : ''} (créé dans l’agenda Outlook).`);
    sauvegarder(d);
  }

  // Le dossier de succession qui porte ce rendez-vous de l'agenda (par son identifiant Outlook), ou null.
  function successionDuRendezVous(itemId) {
    if (!itemId) return null;
    return dossiers.find(d => d && estSuccession(d) && rendezVousSuccession(d).some(r => r.itemId === itemId)) || null;
  }

  // Rendez-vous déplacé (`nouveau` = { date, heure, itemId, changeKey }) ou supprimé (`nouveau` = null) dans l'agenda de CLAIRE.
  function majRendezVousSuccessionAgenda(d, itemId, nouveau) {
    if (!d || !itemId || !estSuccession(d)) return false;
    const liste = rendezVousSuccession(d).map(x => { const c = Object.assign({}, x); delete c.ancien; return c; });
    const r = liste.find(x => x.itemId === itemId);
    if (!r) return false;
    const garde = nouveau ? liste : liste.filter(x => x !== r);
    if (nouveau) Object.assign(r, { date: nouveau.date, heure: nouveau.heure || '', itemId: nouveau.itemId || r.itemId, changeKey: nouveau.changeKey || '', titre: nouveau.titre != null ? String(nouveau.titre).slice(0, 200) : r.titre });
    d.succession = Object.assign({}, d.succession, { rendezVous: garde.sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure)) });
    // Ouverture déplacée : les délais suivent ; supprimée, la date d'ouverture reste (elle porte tous les délais).
    if (r.etape === 'ouvertureSuccession' && nouveau) d.succession.ouvertureLe = nouveau.date;
    synchroniserSignatureSuccession(d);
    return true; // l'appelant (agenda de CLAIRE) note l'historique et enregistre
  }

  // Croix d'un rendez-vous de la ligne « Rendez-vous » : retiré de la fiche seulement (déplacé ou supprimé dans Outlook, créé sans
  // identifiant) — l'agenda de l'office n'est pas touché.
  function retirerRendezVousSuccession(dossierId, rdvId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !estSuccession(d)) return;
    const liste = rendezVousSuccession(d).map(x => { const c = Object.assign({}, x); delete c.ancien; return c; });
    const r = liste.find(x => x.id === rdvId);
    if (!r) return;
    demanderConfirmation(`Retirer de la fiche le rendez-vous du ${dateAvecJourFr(r.date)}${r.heure ? ' à ' + r.heure.replace(':', ' h ') : ''} ? L’agenda de l’office n’est pas modifié, et CLAIRE ne le relèvera plus.`, () => {
      // Retiré par la croix : jamais relevé de nouveau dans l'agenda (relecture 16/10, comme `rendezVousRetire` d'une vente).
      const ecartes = Array.isArray((d.succession || {}).rendezVousEcartes) ? d.succession.rendezVousEcartes : [];
      d.succession = Object.assign({}, d.succession, { rendezVous: liste.filter(x => x !== r), rendezVousEcartes: r.itemId ? ecartes.concat(r.itemId).slice(-100) : ecartes });
      synchroniserSignatureSuccession(d);
      ajouterHistorique(d, `Rendez-vous « ${r.titre || LIBELLES_ETAPE_RDV_SUCCESSION[r.etape] || 'de la succession'} » du ${formatDateFr(r.date)} retiré de la fiche.`);
      sauvegarder(d);
      render();
    }, { bouton: 'Retirer' });
  }

  // Ligne « Rendez-vous » de la fiche d'une succession : tous les rendez-vous, et « Ajouter un rendez-vous ».
  var LIBELLES_ETAPE_RDV_SUCCESSION = { ouvertureSuccession: 'Ouverture', notoriete: 'Notoriété', controleDroits: 'Inventaire', declarationSuccession: 'Déclaration', acte: 'Signature', autre: 'Rendez-vous' };
  // Pure : ce que le titre d'un rendez-vous ajoute à son étape sur la fiche — sans le nom du dossier (« SUCC - MOREAU - … »), et rien quand
  // il redit l'étape (« Acte de notoriété » sous « Notoriété ») : relecture du 17/10, la répétition restait.
  function complementTitreRdvSuccession(d, r) {
    const n = (t) => normaliserPourRecherche(String(t || '')).replace(/[^a-z0-9]+/g, ' ').trim();
    let reste = String((r && r.titre) || '').trim();
    const prefixes = [libelleDossierAffiche(d), d && d.nom ? 'SUCC - ' + d.nom : '', d && d.nom].filter(Boolean);
    for (const p of prefixes) if (n(reste).startsWith(n(p)) && n(p)) { reste = reste.slice(Math.min(reste.length, String(p).length)).replace(/^[\s\-–—:·]+/, ''); break; }
    const etape = n(LIBELLES_ETAPE_RDV_SUCCESSION[r && r.etape] || '');
    if (!n(reste) || (etape && r.etape !== 'autre' && n(reste).includes(etape))) return '';
    return reste;
  }

  function ligneRendezVousSuccessionFiche(d) {
    const auj = isoAujourdhuiLocal();
    const lignes = rendezVousSuccession(d).map(r => `<span class="succ-rdv${r.date < auj ? ' passe' : ''}"><span class="dot-label ${r.annule ? 'dl-urgent' : (r.date < auj ? 'dl-neutre' : 'dl-pret')}"><span class="dot"></span>${r.annule ? 'Annulé / à replacer' : escapeHtml(LIBELLES_ETAPE_RDV_SUCCESSION[r.etape] || 'Rendez-vous')}</span>
      <span class="prop-texte">${escapeHtml(dateAvecJourFr(r.date))}${r.heure ? ' à ' + escapeHtml(r.heure.replace(':', ' h ')) : ''}</span>${complementTitreRdvSuccession(d, r) ? ` <span class="hint">${escapeHtml(complementTitreRdvSuccession(d, r))}</span>` : ''}
      <wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Retirer de la fiche (l’agenda n’est pas modifié)" aria-label="Retirer ce rendez-vous de la fiche" onclick="retirerRendezVousSuccession('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(r.id)}')">${icone('x')}</wa-button></span>`).join('');
    return `<span class="succ-rdvs">${lignes || '<span class="hint">Aucun rendez-vous placé</span>'}
      <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="placerRdvSuccessionAgenda('${escapeOnclickArg(d.id)}', 'autre')">${icone('calendar')}Ajouter un rendez-vous</wa-button></span>`;
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
