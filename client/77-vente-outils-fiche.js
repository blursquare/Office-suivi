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
    return { prix: Math.max(0, montantSaisiFr(v('calc-price')) || 0), mobilier: Math.max(0, montantSaisiFr(v('calc-mobilier')) || 0), dept: v('calc-dept'), type: v('calc-type'),
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
    return `<div class="echanges-groupe"><div class="echanges-tete"><span class="pieces-titre">${icone('scale')}<span class="pieces-titre-texte">Provision</span></span></div>
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
      if (champ('prorata-date')) { champ('prorata-date').value = dateActe; prorataDateAuto = ''; }
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
    if (d.rendezVousSignature && !d.archive) outils.push({ cle: 'veille-signature', libelle: 'Fiche de signature', icone: 'printer', onclick: `ouvrirVeilleSignature('${id}')`, titre: 'Aperçu de la fiche à imprimer pour le dossier : échéances, pièces, procédure des fonds cochée avec ses dates ; les champs vides se remplissent avant le PDF' });
    if (!d.archive) outils.push({ cle: 'appel-fonds', libelle: 'Appel de fonds', icone: 'mail', onclick: `preparerAppelFondsDepuisDossier('${id}')`, titre: 'Convocation et décompte des sommes à virer, préremplis' });
    outils.push({ cle: 'calculateur', libelle: 'Provision', icone: 'banknote', onclick: `ouvrirProvisionDepuisFiche('${id}')`, titre: 'Simulateur de provision : prix, mobilier, nature du bien et département repris de la fiche' });
    outils.push({ cle: 'prorata', libelle: 'Prorata', icone: 'part-disque', onclick: `ouvrirProrataDepuisFiche('${id}')`, titre: 'Prorata de taxe foncière : date de l’acte reprise de la fiche, avis de taxe foncière lu sur le NAS' });
    const acquereurs = (Array.isArray(d.parties) ? d.parties : []).filter(p => p && p.role === 'ACQUEREUR').length;
    if (acquereurs >= 2) outils.push({ cle: 'quotites', libelle: 'Quotités', icone: 'users', onclick: `ouvrirQuotitesDepuisFiche('${id}')`, titre: 'Quotités d’acquisition des acquéreurs' });
    outils.push({ cle: 'preemption', libelle: 'Contrôle de l’urbanisme', icone: 'shield', onclick: `ouvrirPreemptionDepuisFiche('${id}')`, titre: 'Droits de préemption, zonage, travaux' });
    return outils;
  }

  // Colonne des outils à DROITE des deux colonnes de l'onglet Dossier (étude 24/10 : « remettre l'accès aux outils aussi à droite des colonnes,
  // dans les ventes et les successions ») : un bouton par ligne, les mêmes gestes que le bloc du dessous (vente) ou ceux d'une succession (le forfait mobilier a déjà sa ligne « Simuler l'arbitrage » dans le contrôle à 2 mois).
  function renderColonneOutilsFiche(d) {
    if (!d || d.archive && estSuccession(d)) return '';
    const id = escapeOnclickArg(d.id);
    const bouton = (ic, libelle, onclick, titre) => `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="${onclick}" title="${escapeAttr(titre)}">${icone(ic)}${escapeHtml(libelle)}</wa-button>`;
    const outils = [];
    if (estSuccession(d)) {
      outils.push(bouton('courriers', 'Constitution de dossier', `ouvrirConstitutionDepuisFiche('${id}')`, 'Courriers d’interrogation : banques, assurances, caisses, impôts…'));
      // Notoriété seule : aucune autorisation de fonds (étude 26/10).
      if (autorisationsFondsSuccession(d)) outils.push(bouton('file-text', 'Autorisations de fonds', `ouvrirAutorisationsDepuisFiche('${id}')`, 'Déblocage ou transfert de fonds : une autorisation par héritier'));
    } else {
      if (!d.archive && d.roleNotaire !== 'participant') outils.push(bouton('courriers', 'Constitution de dossier', `ouvrirConstitutionDepuisFiche('${id}')`, 'Courriers à la mairie : numérotage, alignement, péril, assainissement'));
      outilsVenteFiche(d).forEach(o => outils.push(bouton(o.icone, o.libelle, o.onclick, o.titre)));
    }
    return `<aside class="fiche-outils-droite" aria-label="Outils du dossier"><span class="section-eyebrow">Outils</span>${outils.join('')}</aside>`;
  }

  // Pure : la contenance du cadastre (IGN) de chaque parcelle lue par le Contrôle de l'urbanisme, par clé de parcelle.
  function contenancesIgnDossier(d) {
    return new Map(((d && d.preemption && d.preemption.parcelles) || []).filter(x => x && x.parcelle && Number(x.contenance) > 0)
      .map(x => { const m = /^\s*([0-9A-Z]{1,2})\s*0*(\d+)\s*$/i.exec(String(x.parcelle)); return [m ? cleParcelle(m[1], m[2]) : '', Number(x.contenance)]; }));
  }

  // Pure : la référence et la surface d'une parcelle (surface lue, sinon celle de l'IGN), { ref, m2, surface }.
  function surfaceParcelleFiche(p, igne) {
    const lu = !detailParcelleVide('surface', p.surface) ? centiaresDepuisContenance(String(p.surface)) : null;
    const m2 = lu || (igne && igne.get(cleParcelle(p.section, p.numero))) || null;
    const ref = [p.prefixe && !/^0*$/.test(String(p.prefixe)) ? p.prefixe : '', String(p.section).toUpperCase(), String(p.numero).replace(/^0+(?=\d)/, '')].filter(Boolean).join(' ');
    return { ref, m2, surface: m2 != null ? formaterContenance(m2) : '' };
  }

  // Pure : les parcelles d'un bien sur sa carte de l'onglet Dossier (26/10 : « Claire a perdu toutes les surfaces de parcelles » — la carte ne
  // montrait que « AB 12, AB 13 », la ligne avec les surfaces étant repliée sous « Modifier ») : « AB 12 (6 a 6 ca), AB 13 » puis le total
  // quand toutes ont leur surface ; 6 parcelles au plus, puis « +N ».
  function texteParcellesCarteBien(d, b) {
    // Contenance de l'IGN (sans commune) seulement quand tous les biens sont dans la même commune : jamais l'« AB 12 » d'une autre.
    const biens = biensDossier(d);
    const igne = biens.some((x, i) => biens.some((y, j) => j > i && memeCommune(x, y) === false)) ? null : contenancesIgnDossier(d);
    const lignes = ((b && b.parcelles) || []).filter(p => p && p.section && p.numero).map(p => surfaceParcelleFiche(p, igne));
    if (!lignes.length) return '';
    const textes = lignes.slice(0, 6).map(l => (l.surface ? `${l.ref} (${l.surface})` : l.ref));
    if (lignes.length > 6) textes.push(`+${lignes.length - 6}`);
    const total = lignes.length > 1 && lignes.every(l => l.m2 != null) ? ` · total ${formaterContenance(lignes.reduce((s, l) => s + l.m2, 0))}` : '';
    return textes.join(', ') + total;
  }

  // Pure : les parcelles d'une vente telles que la fiche les montre (étude 16/10 : « les surfaces des parcelles ne remontent pas dans la
  // fiche dossier ») — une par parcelle, « AB 12 · 6 a 06 ca », suivie de sa nature et de son lieu-dit, puis le total quand toutes ont leur
  // surface. Surface de la fiche bien d'Authentic (« 606 », « 1 206 », « 00ha 06a 06ca »…), sinon rien (jamais devinée).
  function parcellesAfficheesFiche(d) {
    // Toutes les parcelles du dossier (fiche ET immeubles d'Authentic, commun/donnees-dossier.js) ; la commune n'est dite que si elles ne
    // sont pas toutes dans la même.
    const liste = parcellesDossier(d);
    const biens = biensDossier(d);
    const plusieursCommunes = biens.some((x, i) => biens.some((y, j) => j > i && memeCommune(x, y) === false));
    // Sans surface lue (ni fiche ni Authentic), la contenance du cadastre (IGN) lue par le Contrôle de l'urbanisme (étude 19/10 : « il n'y a
    // pas les contenances, alors il faut les mettre »).
    const igne = contenancesIgnDossier(d);
    const lignes = liste.filter(p => p && p.section && p.numero).map(p => Object.assign(surfaceParcelleFiche(p, igne),
      { detail: [p.nature, p.lieuDit, plusieursCommunes ? p.commune : ''].filter(Boolean).join(' · '), section: p.section, numero: p.numero, commune: p.commune || '' }));
    const total = lignes.length > 1 && lignes.every(l => l.m2 != null) ? lignes.reduce((s, l) => s + l.m2, 0) : null;
    return { lignes, total: total != null ? formaterContenance(total) : '', manquantes: lignes.filter(l => l.m2 == null).length };
  }

  function renderParcellesFiche(d) {
    const p = parcellesAfficheesFiche(d);
    if (!p.lignes.length) return '';
    const lignes = p.lignes.map(l => `<span class="parcelle-fiche"><b>${escapeHtml(l.ref)}</b>${l.surface ? ` · ${escapeHtml(l.surface)}` : ' · <span class="hint">surface inconnue</span>'}${l.detail ? ` <span class="hint">${escapeHtml(l.detail)}</span>` : ''}<wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Retirer cette parcelle de la fiche" aria-label="Retirer la parcelle ${escapeAttr(l.ref)}" onclick="demanderRetirerParcelle('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(l.section)}', '${escapeOnclickArg(l.numero)}', '${escapeOnclickArg(l.commune)}')">${icone('x')}</wa-button></span>`).join('');
    const total = p.total ? `<span class="parcelle-fiche parcelle-total">Total · ${escapeHtml(p.total)}</span>` : '';
    const aide = p.manquantes ? infoBulle('Surface lue dans la fiche du bien d’Authentic : ouvrez-la dans Authentic pour compléter les parcelles sans surface.') : '';
    const vider = `<button type="button" class="lien-action bien-vider" onclick="demanderViderBien('${escapeOnclickArg(d.id)}')" title="Efface adresse, parcelles et lots, et ce qu’Authentic en avait repris : le bien se remet depuis Authentic">Vider le bien</button>`;
    return `<span class="parcelles-fiche">${lignes}${total}</span>${aide}${vider}`;
  }

  // Pure : la surface d'une ligne du tableau du cadastre d'une fiche bien d'Authentic (étude 19/10 : « il ne prend pas la surface », ZN 4 à
  // « 0 ca ») — colonnes « ha | a | ca », ou une colonne « Surface » qui couvre trois cellules (hectare, are, centiare : seule la première,
  // les hectares, était lue). '' sans surface.
  function surfaceLigneCadastreAuthentic(entete, ligne, iSurface) {
    const c = (i) => (i >= 0 && ligne && ligne[i] != null ? String(ligne[i]).replace(/\s+/g, ' ').trim() : '');
    const iHa = entete.indexOf('ha'), iA = entete.indexOf('a'), iCa = entete.indexOf('ca');
    if (iHa >= 0 && iA >= 0 && iCa >= 0 && [c(iHa), c(iA), c(iCa)].every(x => /^\d{0,4}$/.test(x)) && (c(iHa) || c(iA) || c(iCa)))
      return `${Number(c(iHa) || 0)} ha ${c(iA) || '0'} a ${c(iCa) || '0'} ca`;
    const v = c(iSurface);
    if (/^\d+$/.test(v) && ligne && ligne.length > entete.length && /^\d{1,2}$/.test(c(iSurface + 1)) && /^\d{1,2}$/.test(c(iSurface + 2)))
      return `${Number(v)} ha ${c(iSurface + 1)} a ${c(iSurface + 2)} ca`;
    return v;
  }

  // Pure : les parcelles des champs « dataTableCadastre:N:… » de la fiche du bien d'Authentic — numéro (`…Numero`), section (`…Section`, sinon
  // une ou deux capitales seules dans la ligne avant le numéro), préfixe (`…Prefixe`), adresse cadastrale, puis la surface : les trois champs
  // chiffrés qui suivent le numéro dans la même ligne (hectare, are, centiare — sans identifiant de ligne, ils portent le nom du SPF).
  function parcellesChampsCadastreAuthentic(champs) {
    const lignes = [];
    let courant = null;
    for (const c of champs || []) {
      const lib = String((c && c.libelle) || '');
      const v = String((c && c.valeur) == null ? '' : c.valeur).replace(/\s+/g, ' ').trim();
      const m = /dataTableCadastre:(\d+):([A-Za-z0-9_]+)/.exec(lib);
      if (m) {
        if (!courant || courant.rang !== m[1]) { courant = { rang: m[1], chiffres: [], avant: [] }; lignes.push(courant); }
        const nom = m[2];
        if (/Numero$/i.test(nom)) courant.numero = v.replace(/^0+(?=\d)/, '');
        else if (/Section$/i.test(nom)) courant.section = v.toUpperCase();
        else if (/Prefixe$/i.test(nom)) courant.prefixe = v;
        else if (!courant.numero && /^[A-Z]{1,2}$/.test(v)) courant.avant.push(v);
        else if (/[A-Za-z]/.test(v) && v !== '—' && !/_focus$|_input$/i.test(nom) && !courant.adresseCadastre) courant.adresseCadastre = v;
        continue;
      }
      if (courant && courant.numero && courant.chiffres.length < 3 && /^\d{1,4}$/.test(v)) courant.chiffres.push(v);
    }
    return lignes.map(l => {
      const section = l.section || (l.avant.length === 1 ? l.avant[0] : '');
      if (!section || !l.numero || !/^\d+[A-Za-z]?$/.test(l.numero)) return null;
      const p = { section, numero: l.numero };
      if (l.prefixe && !/^0*$/.test(l.prefixe)) p.prefixe = l.prefixe;
      const [x, y, z] = l.chiffres;
      if (l.chiffres.length === 3) p.surface = `${Number(x)} ha ${y} a ${z} ca`;
      else if (l.chiffres.length === 2) p.surface = `${x} a ${y} ca`;
      if (l.adresseCadastre) p.adresseCadastre = l.adresseCadastre.slice(0, 80);
      return p;
    }).filter(Boolean);
  }

  // Pure : l'aperçu de l'immeuble sur la page du sous-dossier d'Authentic, avant d'ouvrir la fiche du bien (structure reçue le 16/10) —
  // tableau « Lots de l'immeuble » (Numéro | Type | Ordre d'apparition dans la rédaction) et tableau « Références cadastrales » (Commune |
  // Volume(s) | Préfixe | Section | Numéro | Adresse | Nature | ha | a | ca). → bien au format de la fiche bien (sans adresse : la colonne
  // « Adresse » est celle du cadastre), ou null. Des lots = une copropriété (étude 16/10 : « en copropriété les numéros de lot et le type de
  // bien ») ; sans lots, le type reste celui de la fiche du bien (jamais deviné des natures ici, pour ne pas contredire la fiche bien).
  function apercuImmeubleAuthentic(capture) {
    const tableaux = (capture && Array.isArray(capture.tableaux)) ? capture.tableaux : [];
    const cellule = (l, i) => (i >= 0 ? String((l || [])[i] == null ? '' : l[i]).replace(/\s+/g, ' ').trim() : '');
    const parcelles = [];
    const lots = [];
    tableaux.forEach(t => {
      const entete = (t.entete || []).map(e => libelleNetAuthentic(e));
      const iNum = entete.findIndex(e => /^num/.test(e));
      const iSection = entete.indexOf('section');
      if (iSection >= 0 && iNum >= 0) {
        const iHa = entete.indexOf('ha'), iA = entete.indexOf('a'), iCa = entete.indexOf('ca');
        const iCommune = entete.indexOf('commune'), iPrefixe = entete.findIndex(e => /^prefixe/.test(e));
        const iAdresse = entete.indexOf('adresse'), iNature = entete.indexOf('nature'), iVolume = entete.findIndex(e => /^volume/.test(e));
        (t.lignes || []).forEach(l => {
          const section = cellule(l, iSection).toUpperCase();
          const numero = cellule(l, iNum).replace(/^0+(?=\d)/, '');
          if (!/^[A-Z0-9]{1,3}$/.test(section) || !/^\d+[A-Za-z]?$/.test(numero) || parcelles.some(p => p.section === section && p.numero === numero)) return;
          const p = { section, numero };
          const [ha, a, ca] = [iHa, iA, iCa].map(i => cellule(l, i));
          if ([ha, a, ca].every(x => /^\d{0,4}$/.test(x)) && Number(ha || 0) + Number(a || 0) + Number(ca || 0) > 0) p.surface = Number(ha || 0) ? `${Number(ha)} ha ${a || '0'} a ${ca || '0'} ca` : `${a || '0'} a ${ca || '0'} ca`;
          if (cellule(l, iCommune)) p.commune = cellule(l, iCommune);
          if (cellule(l, iPrefixe) && !/^0*$/.test(cellule(l, iPrefixe))) p.prefixe = cellule(l, iPrefixe);
          if (cellule(l, iNature)) p.nature = cellule(l, iNature);
          if (cellule(l, iAdresse)) p.adresseCadastre = cellule(l, iAdresse).slice(0, 80);
          if (cellule(l, iVolume)) p.volume = cellule(l, iVolume).slice(0, 40);
          parcelles.push(p);
        });
        return;
      }
      const iType = entete.findIndex(e => /^type/.test(e));
      if (iNum >= 0 && iType >= 0 && entete.some(e => /ordre d.apparition/.test(e))) {
        (t.lignes || []).forEach(l => {
          const numero = cellule(l, iNum);
          if (!/^\d+$/.test(numero) || lots.some(x => x.numero === numero)) return;
          lots.push({ numero, type: cellule(l, iType) || null, batiment: null, etage: null, entree: null, tantiemes: null, designation: null, surface: null, surfaceCarrez: null });
        });
      }
    });
    if (!parcelles.length && !lots.length) return null;
    return { id: 'authentic-apercu', adresse: null, type: lots.length ? 'copropriete' : null, parcelles: parcelles.slice(0, MAX_PARCELLES_BIEN), lots: lots.slice(0, 40), tantiemesTotal: null, surface: null, description: '', bois: null, apercu: true };
  }

  // Pure : à la création depuis Authentic, l'aperçu de l'immeuble complète le seul bien relevé (lots, parcelles et leurs surfaces
  // manquantes) ; sans fiche bien relevée, il devient le bien ; avec plusieurs biens, il ne complète que les parcelles qu'ils portent.
  function avecApercuImmeubleAuthentic(immeubles, apercu) {
    const liste = (immeubles || []).slice();
    if (!apercu) return liste;
    if (!liste.length) return [apercu];
    const completer = (im) => Object.assign({}, im, { parcelles: (im.parcelles || []).map(p => {
      const q = apercu.parcelles.find(x => memeParcelle(x, p));
      return q ? Object.assign({}, q, Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && v !== ''))) : p;
    }) });
    if (liste.length === 1) return [completer(fusionnerBienAuthentic(liste[0], apercu))];
    return liste.map(completer);
  }

  // Modifie d : l'aperçu de l'immeuble d'une page de sous-dossier appliqué comme une fiche bien (relecture 16/10) —
  // jamais pour une succession (plusieurs biens dans un seul tableau : ils seraient réunis) ; rien si aucune parcelle n'est dans la commune
  // du dossier (page rattachée au mauvais dossier) ; un type de vente déjà repris d'Authentic n'est pas remis en cause par les lots (la fiche
  // du bien dit le type ; sans elle, des lots font une copropriété).
  function appliquerApercuImmeubleAuthentic(d, capture, noter, resultat) {
    if (!d || estSuccession(d)) return resultat;
    const apercu = apercuImmeubleAuthentic(capture);
    if (!apercu) return resultat;
    const net = t => normaliserPourRecherche(String(t || '')).replace(/[^a-z0-9]+/g, ' ').trim();
    const a = (d.bien && d.bien.adresse) || {};
    const communeDossier = net(a.commune || (/^([^(,]+)\s*\(\d{5}\)/.exec(String(d.adresseBien || '')) || [])[1] || '');
    const communes = apercu.parcelles.map(p => net(p.commune)).filter(Boolean);
    if (communeDossier && communes.length && !communes.some(c => c === communeDossier || c.includes(communeDossier) || communeDossier.includes(c))) {
      resultat.raison = 'aperçu de l’immeuble d’une autre commune que le dossier';
      return resultat;
    }
    const retenu = !!(d.authentic && d.authentic.valeurs && d.authentic.valeurs.typeVente);
    return appliquerBienAuthentic(d, apercu, noter, resultat, { garderType: retenu });
  }

  // Les biens d'Authentic d'une vente autres que le bien principal, chacun avec sa croix (étude 19/10 : « je ne peux même pas retirer le
  // bien » — un bien d'un autre dossier était entré). Index = rang dans immeublesSansParcellesEgarees, comme pour une succession.
  // Pure : la signature d'un bien d'Authentic (adresse et parcelles) — désigne le bien cliqué même si la liste a bougé entre-temps.
  function signatureBienVente(im) {
    return [normaliserPourRecherche(normaliserAdresse((im && im.adresse) || '')).replace(/[^a-z0-9]+/g, ' ').trim(),
      ((im && im.parcelles) || []).map(p => cleParcelle(p.section, p.numero)).sort().join(',')].join('|');
  }
  function autresBiensVente(d) {
    if (!d || estSuccession(d)) return [];
    const liste = immeublesSansParcellesEgarees((d.authentic && d.authentic.immeubles) || []);
    const cle = (a) => normaliserPourRecherche(normaliserAdresse(a || '')).replace(/[^a-z0-9]+/g, ' ').trim();
    const principal = cle(d.adresseBien);
    // Le bien principal : celui de l'adresse de la fiche. Introuvable : aucune croix (jamais le bien principal proposé au retrait).
    const iPrincipal = liste.findIndex(im => im && principal && cle(im.adresse) === principal);
    if (iPrincipal < 0) return [];
    const duPrincipal = liste[iPrincipal];
    const parcellesPrincipal = new Set((duPrincipal.parcelles || []).map(p => cleParcelle(p.section, p.numero)));
    // Un lot ou une dépendance du même immeuble (même adresse ou parcelle d'assise du bien principal) n'est pas un « autre bien » à retirer.
    return liste.map((im, index) => ({ im, index, signature: signatureBienVente(im) })).filter(({ im, index }) => im && index !== iPrincipal
      && cle(im.adresse) !== principal && !(im.parcelles || []).some(p => parcellesPrincipal.has(cleParcelle(p.section, p.numero))));
  }
  // Retire un bien d'une vente : de ses immeubles d'Authentic (gardé parmi les biens retirés, jamais remis) et ses parcelles de la fiche,
  // sauf celles du bien principal et des biens gardés.
  function retirerBienVente(id, signature) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const choix = autresBiensVente(d).find(x => x.signature === signature);
    if (!choix) { afficherToast('Ce bien n’est plus dans la liste : la fiche a changé, rouvrez-la.', 'OK', null); return; }
    const im = choix.im;
    demanderConfirmation(`Retirer ce bien du dossier : ${im.adresse ? normaliserAdresse(im.adresse) : 'adresse non relevée'} ?`, async () => {
      const brut = ((d.authentic && d.authentic.immeubles) || []).filter(x => x && typeof x === 'object');
      const affiches = immeublesSansParcellesEgarees(brut);
      const i = affiches.findIndex(x => signatureBienVente(x) === signature);
      if (i < 0) return;
      const gardes = affiches.filter((x, j) => j !== i);
      const clesGardees = new Set(gardes.flatMap(x => (x.parcelles || []).map(cleParcelleLieu)));
      const aRetirer = new Set((im.parcelles || []).map(cleParcelleLieu).filter(k => !clesGardees.has(k)));
      // Parmi les biens retirés : seulement ce qui n'appartient à aucun bien gardé (jamais l'adresse ni une parcelle du bien principal).
      const adresseGardee = gardes.some(x => normaliserAdresse(x.adresse || '') === normaliserAdresse(im.adresse || ''));
      const k = clesBienSuccession({ adresse: adresseGardee ? '' : im.adresse, parcelles: (im.parcelles || []).filter(p => aRetirer.has(cleParcelleLieu(p))) });
      d.authentic = Object.assign({}, d.authentic || {}, {
        immeubles: brut.filter((x, j) => j !== i),
        biensRetires: ((d.authentic && d.authentic.biensRetires) || []).concat(k.adresse || k.parcelles.length ? [k] : []).slice(-20)
      });
      const cad = d.bien && d.bien.cadastre;
      if (cad && Array.isArray(cad.parcelles) && aRetirer.size) {
        const restantes = cad.parcelles.filter(p => !parcelleDuBienRetire(p, aRetirer, clesGardees));
        if (restantes.length) d.bien = Object.assign({}, d.bien, { cadastre: Object.assign({}, cad, { parcelles: restantes, section: restantes[0].section, numero: restantes[0].numero }) });
      }
      ajouterHistorique(d, `Bien retiré du dossier : ${im.adresse ? normaliserAdresse(im.adresse) : [...aRetirer].join(', ')}`);
      await sauvegarder(d);
      render();
    }, { bouton: 'Retirer pour toujours', ton: 'danger', autre: { libelle: 'Retirer, Authentic pourra le remettre', action: () => retirerBienPourReprise(id, signature) } });
  }
  function renderAutresBiensVente(d) {
    const autres = autresBiensVente(d);
    if (!autres.length) return '';
    return `<span class="parcelles-fiche">${autres.map(({ im, signature }) => `<span class="parcelle-fiche">${escapeHtml(im.adresse ? normaliserAdresse(im.adresse) : (im.parcelles || []).map(p => `${p.section} ${p.numero}`).join(', '))}
      <wa-button appearance="plain" size="s" class="bouton-icone" title="Retirer ce bien du dossier" onclick="retirerBienVente('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(signature)}')">${icone('x')}</wa-button></span>`).join('')}</span>`;
  }
