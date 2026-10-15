  // ==== VENTES : AGENDA ET OUTILS RELIÉS À LA FICHE (étude 15/10 : « tu peux aussi pour les ventes si tu as des idées ») ====
  // Même principe que pour une succession (client/76) :
  //  - Agenda : la carte « Fixer le rendez-vous » du Tableau a « Placer dans l'agenda » (Nouveau rendez-vous prérempli — dossier,
  //    titre, date au plus tôt, case « Rendez-vous de signature » cochée) ; la ligne « Outils » de l'onglet Dossier propose aussi
  //    « Voir dans l'agenda » une fois le rendez-vous placé.
  //  - Outils : ligne « Outils » de l'onglet Dossier — appel de fonds, simulateur de provision (prix, mobilier, nature du bien,
  //    département), prorata (date de l'acte), quotités (dès deux acquéreurs), contrôle de l'urbanisme — chacun ouvert sur ce dossier.

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

  function ouvrirProvisionDepuisFiche(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const s = saisieProvisionDossier(d);
    definirOnglet('calculateur');
    const champ = id => document.getElementById(id);
    if (champ('calc-price')) champ('calc-price').value = s.prix ? String(s.prix) : '';
    if (champ('calc-mobilier')) champ('calc-mobilier').value = s.mobilier ? String(s.mobilier) : '';
    if (champ('calc-type')) champ('calc-type').value = s.type;
    if (champ('calc-dept') && s.dept && [...champ('calc-dept').options].some(o => o.value === s.dept)) champ('calc-dept').value = s.dept;
    calculerFraisActe();
  }

  // Prorata : la date de l'acte (rendez-vous placé, sinon date au plus tôt) et l'année civile ; le montant reste à saisir.
  function ouvrirProrataDepuisFiche(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const auj = isoAujourdhuiLocal();
    const p = d.rendezVousSignature ? null : signaturePrevueDossier(d, auj);
    const dateActe = String(d.rendezVousSignature || (p && p.date) || '').slice(0, 10);
    definirOnglet('prorata');
    if (!dateActe) return;
    const champ = id => document.getElementById(id);
    if (champ('prorata-date')) champ('prorata-date').value = dateActe;
    if (champ('prorata-debut')) champ('prorata-debut').value = `${dateActe.slice(0, 4)}-01-01`;
    if (champ('prorata-fin')) champ('prorata-fin').value = `${dateActe.slice(0, 4)}-12-31`;
    if (champ('prorata-periode')) champ('prorata-periode').value = 'annee';
    bornesProrataManuelles = false;
    if (typeof calculerProrataAffichage === 'function') calculerProrataAffichage();
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
    outils.push({ cle: 'prorata', libelle: 'Prorata', icone: 'part-disque', onclick: `ouvrirProrataDepuisFiche('${id}')`, titre: 'Prorata de taxe foncière : date de l’acte reprise de la fiche' });
    const acquereurs = (Array.isArray(d.parties) ? d.parties : []).filter(p => p && p.role === 'ACQUEREUR').length;
    if (acquereurs >= 2) outils.push({ cle: 'quotites', libelle: 'Quotités', icone: 'users', onclick: `ouvrirQuotitesDepuisFiche('${id}')`, titre: 'Quotités d’acquisition des acquéreurs' });
    outils.push({ cle: 'preemption', libelle: 'Contrôle de l’urbanisme', icone: 'shield', onclick: `ouvrirPreemptionDepuisFiche('${id}')`, titre: 'Droits de préemption, zonage, travaux' });
    return outils;
  }

  function renderOutilsVenteFiche(d) {
    return `<span class="succ-actes">${outilsVenteFiche(d).map(o => `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="${o.onclick}" title="${escapeAttr(o.titre)}">${icone(o.icone)}${escapeHtml(o.libelle)}</wa-button>`).join('')}</span>`;
  }
