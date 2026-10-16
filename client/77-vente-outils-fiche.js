  // ==== VENTES : AGENDA ET OUTILS RELIÉS À LA FICHE (étude 15/10 : « tu peux aussi pour les ventes si tu as des idées ») ====
  // Même principe que pour une succession (client/76) :
  //  - Agenda : la carte « Fixer le rendez-vous » du Tableau a « Placer dans l'agenda » (Nouveau rendez-vous prérempli — dossier,
  //    titre, date au plus tôt, case « Rendez-vous de signature » cochée) ; la ligne « Outils » de l'onglet Dossier propose aussi
  //    « Voir dans l'agenda » une fois le rendez-vous placé.
  //  - Outils : ligne « Outils » de l'onglet Dossier — appel de fonds, simulateur de provision (prix, mobilier, nature du bien,
  //    département), prorata (date de l'acte), quotités (dès deux acquéreurs), contrôle de l'urbanisme — chacun ouvert sur ce dossier.
  //  - Prorata (0.252.0) : l'avis de taxe foncière du dossier du NAS (celui que la checklist a retrouvé, sinon le plus récent dont le
  //    nom dit la pièce — même règle que l'appel de fonds) est lu seul ; le montant et l'année civile se posent sans saisie.
  //  - Provision (0.252.0) : « Enregistrer sur la fiche » garde le résultat du simulateur (`d.provision`), montré dans l'onglet
  //    Dossier et l'onglet Fonds, comme l'arbitrage d'une succession.

  // Pure : le rendez-vous de signature proposé pour une vente → { titre, date } ou null (déjà placé, signé, archivé, participation).
  function rdvAgendaVente(d, aujIso) {
    if (!d || estSuccession(d) || d.archive || d.rendezVousSignature || d.roleNotaire === 'participant' || signatureFaiteSuivi(d)) return null;
    const auj = String(aujIso || '').slice(0, 10);
    const p = signaturePrevueDossier(d, auj);
    let date = p && p.date ? p.date : (auj ? addDays(auj, 14) : auj);
    if (date < auj) date = auj;
    return { titre: libelleDossierAffiche(d), date };
  }

  function placerRdvVenteAgenda(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    const r = rdvAgendaVente(d, isoAujourdhuiLocal());
    if (!r) return;
    definirOnglet('agenda');
    ouvrirCreationAgenda(r.date, '10:00');
    if (!agendaModale) return; // Exchange pas réglé : ouvrirCreationAgenda l'a dit
    const choix = document.getElementById('agenda-creation-dossier');
    if (choix) { choix.value = d.id; choisirDossierCreationAgenda(d.id); }
    const titre = document.getElementById('agenda-creation-titre');
    if (titre) titre.value = r.titre;
    majCaseSignatureCreationAgenda();
    const sig = document.getElementById('agenda-creation-signature');
    if (sig) sig.checked = true;
  }

  // Le rendez-vous de la fiche dans l'agenda (jour et détail ouverts), depuis la fiche.
  function voirDossierDansAgenda(dossierId) {
    definirOnglet('agenda');
    allerAuDossierAgenda(dossierId);
  }

  // Pure : nature du bien et département pour le simulateur de provision.
  var TYPE_BAREME_PAR_TYPE_VENTE = { maison: 'house', copropriete: 'condo', terrain: 'land', terre: 'land' };
  function saisieProvisionDossier(d) {
    const cp = (String((d && d.adresseBien) || '').match(/\b(\d{5})\b/) || [])[1] || '';
    const dept = cp ? (cp.startsWith('97') ? cp.slice(0, 3) : cp.slice(0, 2)) : '';
    return { prix: Number(d && d.prixVente) > 0 ? Number(d.prixVente) : null, mobilier: Number(d && d.prixMobilier) > 0 ? Number(d.prixMobilier) : null,
      type: TYPE_BAREME_PAR_TYPE_VENTE[d && d.typeVente] || 'house', dept };
  }

  var provisionDossierId = '';

  function ouvrirProvisionDepuisFiche(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const s = saisieProvisionDossier(d);
    const g = d.provision && d.provision.saisie; // la dernière simulation gardée sur la fiche reprend primo-accédant et destination
    definirOnglet('calculateur');
    provisionDossierId = d.id;
    const champ = id => document.getElementById(id);
    if (champ('calc-price')) champ('calc-price').value = s.prix ? String(s.prix) : '';
    if (champ('calc-mobilier')) champ('calc-mobilier').value = s.mobilier ? String(s.mobilier) : '';
    if (champ('calc-type')) champ('calc-type').value = s.type;
    if (champ('calc-dept') && s.dept && [...champ('calc-dept').options].some(o => o.value === s.dept)) champ('calc-dept').value = s.dept;
    if (g) {
      const cocher = (nom, v) => { const r = document.querySelector(`input[name="${nom}"][value="${v}"]`); if (r) r.checked = true; };
      cocher('calc-first', g.primo ? 'yes' : 'no');
      cocher('calc-rp', g.residencePrincipale === false ? 'no' : 'yes');
    }
    calculerFraisActe();
    majBoutonProvisionFiche();
  }

  // Depuis la barre latérale : une simulation libre, rattachée à aucun dossier.
  function ouvrirProvisionSansDossier() {
    provisionDossierId = '';
    definirOnglet('calculateur');
    majBoutonProvisionFiche();
  }

  // Le bouton « Enregistrer sur la fiche » du simulateur : visible quand l'outil a été ouvert depuis une fiche.
  function majBoutonProvisionFiche() {
    const b = document.getElementById('calc-enregistrer-fiche');
    const d = provisionDossierId ? dossiers.find(x => x.id === provisionDossierId) : null;
    if (b) { b.style.display = d ? '' : 'none'; if (d) b.textContent = `Enregistrer sur la fiche ${libelleDossierAffiche(d)}`; }
  }

  // Pure : la provision gardée sur la fiche → { le, par, total, emoluments, tresor, prix, mobilier, assiette, dept, type, primo,
  // residencePrincipale, saisie } ou null (prix manquant, département inconnu).
  function provisionAEnregistrer(saisie, maintenantIso, auteur) {
    const prix = Number(saisie && saisie.prix);
    if (!Number.isFinite(prix) || prix <= 0 || !saisie.dept) return null;
    const mobilier = Number(saisie.mobilier) > 0 ? Number(saisie.mobilier) : 0;
    const assiette = assietteImmobiliere(Math.max(1, prix), mobilier);
    const primo = !!(saisie.primo && saisie.residencePrincipale !== false);
    const e = estimerFraisActe(assiette, saisie.dept, saisie.type, primo);
    if (!e) return null;
    return { le: String(maintenantIso || '').slice(0, 10), par: auteur || '', total: e.total, emoluments: e.emoluments, tresor: e.tresor,
      prix, mobilier, assiette, dept: saisie.dept, type: saisie.type,
      saisie: { primo: !!saisie.primo, residencePrincipale: saisie.residencePrincipale !== false } };
  }

  function lireSaisieProvision() {
    const v = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const radio = nom => { const r = document.querySelector(`input[name="${nom}"]:checked`); return r ? r.value : ''; };
    return { prix: Number(v('calc-price')), mobilier: Number(v('calc-mobilier')), dept: v('calc-dept'), type: v('calc-type'),
      primo: radio('calc-first') === 'yes', residencePrincipale: radio('calc-rp') !== 'no' };
  }

  function enregistrerProvisionSurFiche() {
    const d = provisionDossierId ? dossiers.find(x => x.id === provisionDossierId) : null;
    if (!d) return;
    const p = provisionAEnregistrer(lireSaisieProvision(), new Date().toISOString(), utilisateurPoste || '');
    if (!p) { afficherToast('Saisissez le prix et le département avant d’enregistrer.', 'OK', null); return; }
    d.provision = p;
    ajouterHistorique(d, `Provision estimée par le simulateur : ${formaterPrix(p.total)}`);
    sauvegarder(d);
    afficherToast(`Provision enregistrée sur ${libelleDossierAffiche(d)}.`, 'Ouvrir la fiche', () => ouvrirDossierDrawer(d.id));
  }

  // Pure : la provision gardée, en une ligne (fiche, onglets Dossier et Fonds) ; le prix d'alors dit s'il a changé depuis.
  function ligneProvisionFiche(d) {
    const p = d && d.provision;
    if (!p || !(p.total > 0)) return '';
    const prixChange = Number(d.prixVente) > 0 && Number(d.prixVente) !== Number(p.prix);
    return `<span class="succ-identite"><strong>${escapeHtml(formaterPrix(p.total))}</strong> <span class="hint">provision estimée le ${escapeHtml(formatDateFr(p.le))}${p.par ? ` par ${escapeHtml(p.par)}` : ''} · prix ${escapeHtml(formaterPrix(p.prix))}</span>${prixChange ? ' <span class="dot-label dl-urgent"><span class="dot"></span>Prix changé depuis</span>' : ''}</span>`;
  }

  function renderProvisionFondsFiche(d) {
    const ligne = ligneProvisionFiche(d);
    if (!ligne) return '';
    return `<div class="echanges-groupe"><div class="echanges-tete"><span class="section-eyebrow">Provision</span></div>
      <p class="fonds-provision">${ligne} <wa-button appearance="plain" size="s" class="bouton-discret" type="button" onclick="ouvrirProvisionDepuisFiche('${escapeOnclickArg(d.id)}')">Refaire</wa-button></p></div>`;
  }

  // Prorata : la date de l'acte (rendez-vous placé, sinon date au plus tôt), l'année civile, puis l'avis de taxe foncière du NAS.
  var prorataDossierTf = '';
  var prorataRechercheNas = 0;
  function ouvrirProrataDepuisFiche(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const auj = isoAujourdhuiLocal();
    const p = d.rendezVousSignature ? null : signaturePrevueDossier(d, auj);
    const dateActe = String(d.rendezVousSignature || (p && p.date) || '').slice(0, 10);
    definirOnglet('prorata');
    // L'avis lu pour un autre dossier ne vaut rien ici.
    if (prorataDossierTf !== d.id && tfAvis.prorata) effacerTaxeFonciere('prorata');
    prorataDossierTf = d.id;
    const champ = id => document.getElementById(id);
    if (dateActe) {
      if (champ('prorata-date')) champ('prorata-date').value = dateActe;
      if (champ('prorata-debut')) champ('prorata-debut').value = `${dateActe.slice(0, 4)}-01-01`;
      if (champ('prorata-fin')) champ('prorata-fin').value = `${dateActe.slice(0, 4)}-12-31`;
      if (champ('prorata-periode')) champ('prorata-periode').value = 'annee';
      bornesProrataManuelles = false;
      if (typeof calculerProrataAffichage === 'function') calculerProrataAffichage();
    }
    reprendreAvisNasProrata(d);
  }

  // L'avis de taxe foncière du dossier du NAS, lu comme un avis déposé à la main (même lecteur, même bloc) ; jamais par-dessus un
  // avis déjà déposé, jamais si un autre dossier a été ouvert entre-temps.
  async function reprendreAvisNasProrata(d) {
    if (!d || !d.dossierLie || !d.nasDossier || !nasDisponible() || typeof pdfjsLib === 'undefined' || tfAvis.prorata) return;
    const jeton = ++prorataRechercheNas;
    const toujoursLa = () => jeton === prorataRechercheNas && prorataDossierTf === d.id && !tfAvis.prorata;
    try {
      const tf = fichierPieceNasAppelFonds(d, await listerFichiersNas(d), 'avisTaxeFonciere', motifPieceChecklist(d, 'avisTaxeFonciere'));
      if (!tf || !toujoursLa()) return;
      const fichier = await fichierNasPourLecture(tf.chemin, tf.nom);
      if (!toujoursLa()) return;
      await importerAvisTaxeFonciere('prorata', fichier);
      const t = tfAvis.prorata;
      noterVerificationPoste('prorata-avis-nas', t && t.retenu ? { detail: 'avis lu' } : { ok: false, detail: 'montant non lu' });
      afficherToast(t && t.retenu ? `Avis de taxe foncière lu sur le NAS : « ${tf.nom} ».` : `Avis de taxe foncière trouvé sur le NAS (« ${tf.nom} ») mais son montant n’a pas pu être lu.`, 'OK', null);
    } catch (e) { /* NAS injoignable : le montant reste à saisir */ }
  }

  function ouvrirQuotitesDepuisFiche(dossierId) {
    definirOnglet('quotites');
    choisirDossierQuotites(dossierId);
  }

  // Pure : les outils proposés sur la fiche d'une vente → [{ cle, libelle, icone, onclick, titre }].
  function outilsVenteFiche(d) {
    if (!d || estSuccession(d)) return [];
    const id = escapeOnclickArg(d.id);
    const outils = [];
    if (d.rendezVousSignature) outils.push({ cle: 'agenda', libelle: 'Voir dans l’agenda', icone: 'calendar', onclick: `voirDossierDansAgenda('${id}')`, titre: 'Le rendez-vous de signature dans l’agenda de l’office' });
    else if (rdvAgendaVente(d, isoAujourdhuiLocal())) outils.push({ cle: 'agenda', libelle: 'Placer dans l’agenda', icone: 'calendar', onclick: `placerRdvVenteAgenda('${id}')`, titre: 'Nouveau rendez-vous de signature, prérempli' });
    if (!d.archive) outils.push({ cle: 'appel-fonds', libelle: 'Appel de fonds', icone: 'mail', onclick: `preparerAppelFondsDepuisDossier('${id}')`, titre: 'Convocation et décompte des sommes à virer, préremplis' });
    outils.push({ cle: 'calculateur', libelle: 'Provision', icone: 'banknote', onclick: `ouvrirProvisionDepuisFiche('${id}')`, titre: 'Simulateur de provision : prix, mobilier, nature du bien et département repris de la fiche' });
    outils.push({ cle: 'prorata', libelle: 'Prorata', icone: 'part-disque', onclick: `ouvrirProrataDepuisFiche('${id}')`, titre: 'Prorata de taxe foncière : date de l’acte reprise de la fiche, avis de taxe foncière lu sur le NAS' });
    const acquereurs = (Array.isArray(d.parties) ? d.parties : []).filter(p => p && p.role === 'ACQUEREUR').length;
    if (acquereurs >= 2) outils.push({ cle: 'quotites', libelle: 'Quotités', icone: 'users', onclick: `ouvrirQuotitesDepuisFiche('${id}')`, titre: 'Quotités d’acquisition des acquéreurs' });
    outils.push({ cle: 'preemption', libelle: 'Contrôle de l’urbanisme', icone: 'shield', onclick: `ouvrirPreemptionDepuisFiche('${id}')`, titre: 'Droits de préemption, zonage, travaux' });
    return outils;
  }

  function renderOutilsVenteFiche(d) {
    return `<span class="succ-actes">${outilsVenteFiche(d).map(o => `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="${o.onclick}" title="${escapeAttr(o.titre)}">${icone(o.icone)}${escapeHtml(o.libelle)}</wa-button>`).join('')}</span>`;
  }

  // Pure : les parcelles d'une vente telles que la fiche les montre (étude 16/10 : « les surfaces des parcelles ne remontent pas dans la
  // fiche dossier ») — une par parcelle, « AB 12 · 6 a 06 ca », suivie de sa nature et de son lieu-dit, puis le total quand toutes ont leur
  // surface. Surface de la fiche bien d'Authentic (« 606 », « 1 206 », « 00ha 06a 06ca »…), sinon rien (jamais devinée).
  function parcellesAfficheesFiche(d) {
    const cad = d && d.bien && d.bien.cadastre;
    const liste = cad ? (Array.isArray(cad.parcelles) && cad.parcelles.length ? cad.parcelles : (cad.section ? [cad] : [])) : [];
    const lignes = liste.filter(p => p && p.section && p.numero).map(p => {
      const m2 = p.surface != null && p.surface !== '' ? centiaresDepuisContenance(String(p.surface)) : null;
      const ref = [p.prefixe && !/^0*$/.test(String(p.prefixe)) ? p.prefixe : '', String(p.section).toUpperCase(), String(p.numero).replace(/^0+(?=\d)/, '')].filter(Boolean).join(' ');
      return { ref, m2, surface: m2 != null ? formaterContenance(m2) : '', detail: [p.nature, p.lieuDit, p.commune].filter(Boolean).join(' · ') };
    });
    const total = lignes.length > 1 && lignes.every(l => l.m2 != null) ? lignes.reduce((s, l) => s + l.m2, 0) : null;
    return { lignes, total: total != null ? formaterContenance(total) : '', manquantes: lignes.filter(l => l.m2 == null).length };
  }

  function renderParcellesFiche(d) {
    const p = parcellesAfficheesFiche(d);
    if (!p.lignes.length) return '';
    const lignes = p.lignes.map(l => `<span class="parcelle-fiche"><b>${escapeHtml(l.ref)}</b>${l.surface ? ` · ${escapeHtml(l.surface)}` : ' · <span class="hint">surface inconnue</span>'}${l.detail ? ` <span class="hint">${escapeHtml(l.detail)}</span>` : ''}</span>`).join('');
    const total = p.total ? `<span class="parcelle-fiche parcelle-total">Total · ${escapeHtml(p.total)}</span>` : '';
    const aide = p.manquantes ? infoBulle('Surface lue dans la fiche du bien d’Authentic : ouvrez-la dans Authentic pour compléter les parcelles sans surface.') : '';
    return `<span class="parcelles-fiche">${lignes}${total}</span>${aide}`;
  }
