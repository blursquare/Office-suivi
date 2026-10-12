  // ===== Droits de préemption : les règles (étude 06/10 : « créer un outil droit de préemption en fonction du bien vendu »,
  // « à identifier en fonction du zonage et du type de bien ») =====
  // Pur et testable (tests/preemption.test.js). Sources fournies par l'étude, reprises telles quelles, sans rien deviner :
  //  - DPU / DPUR : fiche Cheuvreux « Tableau du champ d'application DPU-DPUR » (mutations, puis biens) ;
  //  - Agglopolys : DPU simple institué sur toutes les zones U et AU du PLUi-HD et le PSMV (délibération A_D2022_219 du
  //    29/11/2022), exercice délégué aux communes sauf zones d'activités économiques ; DPU renforcé (A_D2025_200 du 07/10/2025,
  //    courrier à la chambre du 05/11/2025) sur une partie du centre-ville de Blois (Action Cœur de Ville / ORT) et la parcelle
  //    AL 839 (immeuble Marignan, 13 place René Coty), délégué à la Ville de Blois ;
  //  - SAFER : Cahier du CRIDON Lyon n° 87 (nov. 2020) p. 63 (terrain) et p. 64 (bâtiment) ;
  //  - bois et forêts : « La minute visuelle » Letulle Notaires (C. for. L.331-19 à L.331-24).
  // Chaque réponse inconnue laisse le droit « à vérifier » : jamais un « non » par défaut.

  // Les questions, avec leurs choix — l'écran de l'outil les pose dans cet ordre, seulement quand elles servent.
  var MUTATIONS_PREEMPTION = [
    { cle: 'vente', libelle: 'Vente de gré à gré' },
    { cle: 'viager', libelle: 'Vente en viager' },
    { cle: 'echange', libelle: 'Échange (avec ou sans soulte)' },
    { cle: 'apport', libelle: 'Apport en nature à une société' },
    { cle: 'adjudication', libelle: 'Adjudication' },
    { cle: 'donation', libelle: 'Donation' },
    { cle: 'nue-propriete', libelle: 'Cession de la nue-propriété' },
    { cle: 'usufruit', libelle: 'Cession de l’usufruit' },
    { cle: 'parts-sci', libelle: 'Cession de parts de SCI / SCCV' },
    { cle: 'location-accession', libelle: 'Contrat de location-accession' },
    { cle: 'bail', libelle: 'Bail à construction ou emphytéotique' },
    { cle: 'dup', libelle: 'Cession au bénéficiaire d’une DUP' },
    { cle: 'mise-en-demeure', libelle: 'Immeuble objet d’une mise en demeure d’acquérir' }
  ];
  var BIENS_PREEMPTION = [
    { cle: 'terrain', libelle: 'Terrain nu (lot de lotissement ou de ZAC compris)' },
    { cle: 'bati', libelle: 'Immeuble bâti (hors copropriété)' },
    { cle: 'lot-copro', libelle: 'Lot(s) de copropriété' },
    { cle: 'lot-volume', libelle: 'Lot de volume' },
    { cle: 'parts-attribution', libelle: 'Parts de société d’attribution ou coopérative de construction' }
  ];
  var CAS_BATI_PREEMPTION = [
    { cle: 'standard', libelle: 'Aucun cas particulier' },
    { cle: 'vefa-neuf', libelle: 'Vendu en VEFA ou à terme — immeuble neuf' },
    { cle: 'vefa-existant', libelle: 'Vendu en VEFA ou à terme — immeuble existant' },
    { cle: 'credit-bail', libelle: 'Cédé au crédit-preneur (promesse d’un crédit-bail immobilier)' },
    { cle: 'coop-hlm', libelle: 'Construit par une coopérative HLM de location-attribution' },
    { cle: 'hlm', libelle: 'Construit ou acquis par un organisme HLM' },
    { cle: 'hlm-locataire', libelle: 'Organisme HLM, vendu à son locataire' }
  ];

  // Pure : la zone du document d'urbanisme réduite à sa famille (« Ui2 » de type U → U ; « AUc » → AU ; « Nh » → N).
  function familleZonePreemption(typezone) {
    const z = String(typezone || '').trim().toUpperCase();
    if (/^AU/.test(z)) return 'AU';
    if (/^U/.test(z)) return 'U';
    if (/^A/.test(z)) return 'A';
    if (/^N/.test(z)) return 'N';
    return '';
  }

  // Pure : EPCI d'Agglopolys (SIREN du PLUi-HD lu sur le Géoportail : partition « DU_200030385 »).
  var SIREN_AGGLOPOLYS = '200030385';

  // Pure : le DPU simple est-il institué là ? 'oui' / 'non' / 'inconnu'.
  // Agglopolys : toutes les zones U et AU (délibération du 29/11/2022) — une zone A ou N n'y est pas soumise (sauf PSMV,
  // couvert en U). Ailleurs : le DPU n'existe que si la commune (ou l'EPCI) l'a institué — jamais présumé.
  function perimetreDpu(r) {
    const zone = r.zone || '';
    if (r.dpuInstitue === 'oui' || r.dpuInstitue === 'non') return r.dpuInstitue;
    if (r.agglopolys && zone) return zone === 'U' || zone === 'AU' ? 'oui' : 'non';
    return 'inconnu';
  }

  // Pure : la mutation entre-t-elle dans le champ du DPU (tableau Cheuvreux, partie « mutations ») ? true / false / null.
  function mutationSoumiseDpu(r) {
    switch (r.mutation) {
      case 'vente': case 'viager': case 'echange': case 'apport': case 'location-accession': case 'nue-propriete':
        return { soumis: true };
      case 'adjudication':
        if (r.adjudicationFinIndivision == null) return { soumis: null, manque: 'adjudicationFinIndivision' };
        return r.adjudicationFinIndivision
          ? { soumis: false, motif: 'adjudication mettant fin à une indivision créée volontairement' }
          : { soumis: true };
      case 'donation':
        if (r.donationEntreParents == null) return { soumis: null, manque: 'donationEntreParents' };
        return r.donationEntreParents ? { soumis: false, motif: 'donation entre parents jusqu’au 6e degré' } : { soumis: true };
      case 'parts-sci':
        if (r.partsMajoritaires == null) return { soumis: null, manque: 'partsMajoritaires' };
        if (!r.partsMajoritaires) return { soumis: false, motif: 'cession minoritaire de parts' };
        if (r.sciFamiliale == null) return { soumis: null, manque: 'sciFamiliale' };
        return r.sciFamiliale ? { soumis: false, motif: 'SCI familiale (parents et alliés jusqu’au 4e degré)' } : { soumis: true };
      case 'bail':
        if (r.bailTransfertPropriete == null) return { soumis: null, manque: 'bailTransfertPropriete' };
        return r.bailTransfertPropriete ? { soumis: true } : { soumis: false, motif: 'le bien revient au bailleur en fin de bail' };
      case 'usufruit': return { soumis: false, motif: 'cession de l’usufruit' };
      case 'dup': return { soumis: false, motif: 'cession au bénéficiaire d’une déclaration d’utilité publique' };
      case 'mise-en-demeure': return { soumis: false, motif: 'immeuble faisant l’objet d’une mise en demeure d’acquérir' };
      default: return { soumis: null, manque: 'mutation' };
    }
  }

  // Pure : le bien entre-t-il dans le champ (tableau Cheuvreux, partie « biens ») ? `renforce` : DPU renforcé.
  // → { soumis: true|false|null, motif, manque, renforceSeul } (`renforceSeul` : soumis au DPUR, pas au DPU simple).
  function bienSoumisDpu(r, renforce) {
    const seulRenforce = (motif) => renforce ? { soumis: true, renforceSeul: true, motif } : { soumis: false, motif, renforceSeul: true };
    switch (r.bien) {
      case 'terrain': case 'lot-volume': return { soumis: true };
      case 'parts-attribution': return seulRenforce('parts de société d’attribution : DPU renforcé seulement');
      case 'bati': {
        const cas = r.casBati || 'standard';
        if (cas === 'credit-bail') return { soumis: false, motif: 'cédé au crédit-preneur' };
        if (cas === 'coop-hlm') return { soumis: false, motif: 'coopérative HLM de location-attribution' };
        if (cas === 'hlm-locataire') return { soumis: false, motif: 'organisme HLM vendant à son locataire' };
        if (cas === 'hlm' || cas === 'vefa-existant') return { soumis: true };
        if (cas === 'vefa-neuf') return { soumis: false, motif: 'immeuble neuf vendu en VEFA ou à terme' };
        if (r.achevementMoins4ans == null) return { soumis: null, manque: 'achevementMoins4ans' };
        return r.achevementMoins4ans ? seulRenforce('immeuble achevé depuis moins de 4 ans : DPU renforcé seulement') : { soumis: true };
      }
      case 'lot-copro': {
        const cas = r.casBati || 'standard';
        if (cas === 'vefa-neuf') return { soumis: false, motif: 'lot d’un immeuble neuf vendu en VEFA ou à terme' };
        if (cas === 'vefa-existant') return { soumis: true };
        if (r.achevementMoins4ans == null) return { soumis: null, manque: 'achevementMoins4ans' };
        if (r.achevementMoins4ans) return seulRenforce('immeuble achevé depuis moins de 4 ans : DPU renforcé seulement');
        if (r.maisonCoproHorizontale) return { soumis: true };
        if (r.locauxAutreHabitation) return { soumis: true };
        if (r.plusieursUnites) return { soumis: true };
        if (r.issuePartageAttribution) return seulRenforce('copropriété issue du partage d’une société d’attribution : DPU renforcé seulement');
        if (r.reglementPlusDe10ans == null) return { soumis: null, manque: 'reglementPlusDe10ans' };
        return r.reglementPlusDe10ans
          ? seulRenforce('lot d’habitation, copropriété de plus de 10 ans : DPU renforcé seulement')
          : { soumis: true, motif: 'copropriété de moins de 10 ans' };
      }
      default: return { soumis: null, manque: 'bien' };
    }
  }

  var LIBELLES_MANQUES_PREEMPTION = {
    mutation: 'la nature de la mutation', bien: 'la nature du bien', zone: 'la zone du document d’urbanisme',
    dpuInstitue: 'si la commune a institué le DPU', dpur: 'si le bien est dans un périmètre de DPU renforcé',
    adjudicationFinIndivision: 'si l’adjudication met fin à une indivision volontaire', donationEntreParents: 'le lien de parenté du donataire',
    partsMajoritaires: 'si la cession porte sur la majorité des parts', sciFamiliale: 'si la SCI est familiale',
    bailTransfertPropriete: 'le sort du bien en fin de bail', achevementMoins4ans: 'la date d’achèvement de l’immeuble',
    reglementPlusDe10ans: 'la date de publication du règlement de copropriété', bois: 'si les parcelles sont classées en bois au cadastre',
    zoneAgricole: 'si le terrain est en zone à vocation agricole', massif4ha: 'si les parcelles sont dans un massif forestier ≥ 4 ha',
    installations: 'si des installations compromettent définitivement la vocation agricole', usageAgricole: 'l’usage agricole au moment de la vente',
    seuilSafer: 'la superficie au regard du seuil de préemption de la SAFER', utilise5ans: 'l’usage agricole du bâtiment sur les 5 dernières années',
    superficieMoins4ha: 'la superficie de la propriété boisée', foretDomaniale: 'si une forêt domaniale jouxte la parcelle',
    communeBoiseeContigue: 'si la commune possède une parcelle boisée contiguë soumise à un document de gestion',
    acquereurPrivilegie: 'la qualité de l’acquéreur (voisin, parent…)', partieBoiseeMoinsMoitie: 'la part réellement boisée de la propriété'
  };

  // Pure : DPU et DPU renforcé. → droit { cle, titre, statut ('oui'|'non'|'verifier'), motif, formalite, manque[] }.
  function droitDpu(r) {
    const droit = { cle: 'dpu', titre: 'Droit de préemption urbain', statut: 'verifier', motif: '', formalite: '', manque: [] };
    const perim = perimetreDpu(r);
    const dpur = r.dpur === 'oui' ? 'oui' : r.dpur === 'non' ? 'non' : 'inconnu';
    if (perim === 'non' && dpur !== 'oui') return Object.assign(droit, { statut: 'non', motif: r.zone ? `zone ${r.zone} : hors du périmètre du DPU` : 'hors du périmètre du DPU' });
    const mut = mutationSoumiseDpu(r);
    if (mut.soumis === false) return Object.assign(droit, { statut: 'non', motif: mut.motif });
    const bien = bienSoumisDpu(r, dpur === 'oui');
    if (bien.soumis === false && !(bien.renforceSeul && dpur === 'inconnu')) return Object.assign(droit, { statut: 'non', motif: bien.motif });
    if (mut.manque) droit.manque.push(mut.manque);
    if (bien.manque) droit.manque.push(bien.manque);
    if (perim === 'inconnu' && dpur !== 'oui') droit.manque.push(r.zone ? 'dpuInstitue' : 'zone');
    if (bien.renforceSeul && dpur === 'inconnu') droit.manque.push('dpur');
    if (bien.renforceSeul) droit.titre = 'Droit de préemption urbain renforcé';
    const destinataire = dpur === 'oui' && r.dpurDelegataire ? r.dpurDelegataire
      : r.agglopolys ? 'la mairie (Agglopolys en zone d’activités)'
        : 'la mairie';
    droit.formalite = `DIA à ${destinataire} — réponse sous 2 mois, renonciation indispensable pour signer.`;
    if (droit.manque.length) {
      droit.statut = 'verifier';
      droit.motif = 'à préciser : ' + droit.manque.map(m => LIBELLES_MANQUES_PREEMPTION[m] || m).join(', ');
      return droit;
    }
    droit.statut = 'oui';
    droit.motif = [bien.renforceSeul ? bien.motif : '', dpur === 'oui' ? 'périmètre du DPU renforcé' : r.zone ? `zone ${r.zone}` : '', bien.motif && !bien.renforceSeul ? bien.motif : '']
      .filter(Boolean).join(' · ');
    return droit;
  }

  // Pure : SAFER (CRIDON Lyon n° 87, p. 63 terrain et p. 64 bâtiment). Formalité : notification (droit de préemption) ou
  // information obligatoire — l'étude (06/10) : la SAFER est informée de la vente même quand le bien n'est pas préemptable,
  // mais seulement en zone A ou N (étude 07/10 : « pas de notification si hors zone A ou N ») ; zone non lue → « à vérifier ».
  var FORMALITE_INFORMATION_SAFER = 'Information obligatoire de la SAFER (notification Vigifoncier) — pas de droit de préemption.';
  var FORMALITE_INFORMATION_SAFER_A_VERIFIER = 'Information de la SAFER à vérifier : obligatoire si le bien est en zone A ou N (zone non lue).';
  // Zone A ou N : la SAFER est notifiée dans tous les cas, même sans droit de préemption (étude 09/10 : « il faut mettre oui quand on
  // est en zone N et A, de toute façon on notifie toujours même s'ils n'ont pas le droit de préempter ») — le droit est « À purger »,
  // sans question restante. Hors zone A ou N, le droit lu par l'arbre (CRIDON) reste (« Non applicable » pour un bâtiment sans usage
  // agricole). Un lot de copropriété n'est pas concerné.
  function droitSafer(r) {
    const d = droitSaferArbre(r);
    const enZoneAN = r.zone === 'A' || r.zone === 'N' || (r.zone == null && r.zoneAgricole === true);
    if (!enZoneAN || r.bien === 'lot-copro' || d.statut === 'oui') return d;
    return Object.assign(d, { statut: 'oui', manque: [], formalite: FORMALITE_NOTIFICATION_SAFER_ZONE_AN,
      motif: d.statut === 'non' ? `zone ${r.zone || 'A ou N'} : notification dans tous les cas (${d.motif} — pas de droit de préemption)` : `zone ${r.zone || 'A ou N'} : notification dans tous les cas` });
  }
  var FORMALITE_NOTIFICATION_SAFER_ZONE_AN = 'Notification à la SAFER (Vigifoncier) avant la vente — toujours en zone A ou N, même sans droit de préemption.';

  function droitSaferArbre(r) {
    const droit = { cle: 'safer', titre: 'SAFER', statut: 'verifier', motif: '', formalite: '', manque: [] };
    const notification = 'Notification à la SAFER (Vigifoncier) avant la vente — 2 mois pour préempter.';
    const enZoneAN = r.zone === 'A' || r.zone === 'N' ? true : r.zone === 'U' || r.zone === 'AU' ? false
      : r.zoneAgricole != null ? !!r.zoneAgricole : null;
    const information = enZoneAN === true ? FORMALITE_INFORMATION_SAFER : enZoneAN === false ? '' : FORMALITE_INFORMATION_SAFER_A_VERIFIER;
    const reponse = (statut, motif) => Object.assign(droit, { statut, motif, formalite: statut === 'oui' ? notification : information },
      statut !== 'oui' && enZoneAN == null ? { manque: ['zone'] } : {});
    const manque = (...cles) => Object.assign(droit, { statut: 'verifier', manque: cles, motif: 'à préciser : ' + cles.map(m => LIBELLES_MANQUES_PREEMPTION[m] || m).join(', ') });
    if (r.bien === 'lot-copro') return reponse('non', 'lot de copropriété : pas de préemption de la SAFER');
    if (r.bien === 'bati') {
      // Bâtiment (p. 64) — Loir-et-Cher : aucune commune de montagne ni littorale.
      if (r.usageAgricole == null) return manque('usageAgricole');
      if (r.usageAgricole) return reponse('oui', 'bâtiment à usage agricole au moment de la vente');
      const zoneAN = r.zone === 'A' || r.zone === 'N' ? true : r.zone === 'U' || r.zone === 'AU' ? false : null;
      if (zoneAN == null) return manque('zone');
      if (!zoneAN) return reponse('non', 'bâtiment sans usage agricole, hors zone A ou N');
      if (r.utilise5ans == null) return manque('utilise5ans');
      return r.utilise5ans
        ? reponse('oui', 'zone A ou N, activité agricole dans les 5 dernières années')
        : reponse('non', 'zone A ou N, sans activité agricole dans les 5 dernières années');
    }
    // Terrain (p. 63).
    const zoneAgricole = r.zoneAgricole != null ? r.zoneAgricole
      : r.zone === 'A' || r.zone === 'N' ? true : r.zone === 'U' || r.zone === 'AU' ? false : null;
    if (zoneAgricole == null) return manque('zoneAgricole');
    if (zoneAgricole) {
      if (r.bois == null) return manque('bois');
      if (r.bois) {
        if (r.massif4ha == null) return manque('massif4ha');
        return r.massif4ha
          ? reponse('non', 'bois dans un massif forestier d’au moins 4 ha')
          : reponse('oui', 'parcelles en bois hors massif forestier de 4 ha (sauf exemption : parent jusqu’au 4e degré, preneur en place…)');
      }
      if (r.installations == null) return manque('installations');
      return r.installations
        ? reponse('non', 'installations compromettant définitivement la vocation agricole')
        : reponse('oui', 'zone à vocation agricole (sauf exemption : parent jusqu’au 4e degré, preneur en place…)');
    }
    if (r.usageAgricole == null) return manque('usageAgricole');
    if (!r.usageAgricole) return reponse('non', 'hors zone agricole et sans usage agricole');
    if (r.seuilSafer == null) return manque('seuilSafer');
    return r.seuilSafer
      ? reponse('oui', 'usage agricole, superficie au-dessus du seuil de la SAFER')
      : reponse('non', 'usage agricole sous le seuil de la SAFER');
  }

  // Pure : bois et forêts (C. for. L.331-19 à L.331-24, arbre Letulle). → plusieurs droits (État, commune, préférence).
  function droitsForet(r) {
    const titre = 'Bois et forêts (C. for. L.331-19 à 24)';
    const manque = (...cles) => [{ cle: 'foret', titre, statut: 'verifier', formalite: '', manque: cles,
      motif: 'à préciser : ' + cles.map(m => LIBELLES_MANQUES_PREEMPTION[m] || m).join(', ') }];
    const non = (motif) => [{ cle: 'foret', titre, statut: 'non', motif, formalite: '', manque: [] }];
    if (r.bois == null) return manque('bois');
    if (!r.bois) return non('parcelles non classées en nature de bois et forêt au cadastre');
    if (r.superficieMoins4ha == null) return manque('superficieMoins4ha');
    if (!r.superficieMoins4ha) return non('propriété boisée de 4 ha ou plus');
    if (r.foretDomaniale == null) return manque('foretDomaniale');
    if (r.foretDomaniale) {
      return [{ cle: 'foret-etat', titre: 'Préemption de l’État (L.331-23)', statut: 'oui', motif: 'une forêt domaniale jouxte la parcelle',
        formalite: 'Notification au représentant de l’État (préfet) par LRAR — 2 mois pour exercer son droit.', manque: [] }];
    }
    if (r.communeBoiseeContigue == null) return manque('communeBoiseeContigue');
    if (r.communeBoiseeContigue) {
      return [{ cle: 'foret-commune', titre: 'Préemption de la commune (L.331-22)', statut: 'oui',
        motif: 'la commune possède une parcelle boisée contiguë soumise à un document de gestion',
        formalite: 'Notification au maire par LRAR — 2 mois pour exercer son droit.', manque: [] }];
    }
    if (r.acquereurPrivilegie == null) return manque('acquereurPrivilegie');
    if (r.acquereurPrivilegie) return non('acquéreur voisin titulaire du droit, conjoint, partenaire, parent ou allié jusqu’au 4e degré, coïndivisaire, nu-propriétaire ou usufruitier');
    if (r.partieBoiseeMoinsMoitie == null) return manque('partieBoiseeMoinsMoitie');
    if (r.partieBoiseeMoinsMoitie) return non('la partie réellement boisée représente moins de la moitié de la surface');
    return [{ cle: 'foret-preference', titre: 'Droit de préférence des voisins et de la commune (L.331-19 et L.331-24)', statut: 'oui',
      motif: 'propriété boisée de moins de 4 ha',
      formalite: 'Notification du prix et des conditions aux propriétaires voisins (LRAR ou remise contre récépissé ; affichage en mairie et publication au-delà de 10 voisins) et au maire — 2 mois pour exercer leur droit.', manque: [] }];
  }

  // Pure : tous les droits pour un jeu de réponses. Les droits forestiers ne sont posés que pour un terrain.
  function analyserPreemption(r) {
    const rep = r || {};
    const droits = [droitDpu(rep), droitSafer(rep)];
    if (rep.bien === 'terrain' || rep.bois) droits.push(...droitsForet(rep));
    const aFaire = droits.filter(dr => dr.statut === 'oui' && dr.formalite).map(dr => dr.formalite);
    const manques = [...new Set(droits.flatMap(dr => dr.manque || []))];
    return { droits, aFaire, manques };
  }

  // ---- Périmètres de DPU renforcé de Blois (Agglopolys, A_D2025_200 du 07/10/2025, délégué à la Ville de Blois) ----
  var DPUR_BLOIS = {
    insee: '41018',
    delegataire: 'la Ville de Blois (DPU renforcé délégué par Agglopolys, délibération A_D2025_200 du 07/10/2025)',
    parcelles: ['AL0839'],
    // Rues lues sur le plan du centre-ville (périmètre Action Cœur de Ville / ORT) : une rue peut n'être couverte qu'en partie.
    rues: ['PORTE COTE', 'COMMERCE', 'SAINT MARTIN', 'ORFEVRES', 'DENIS PAPIN', 'EMILE LAURENS', 'HENRI DRUSSY', 'HAUTE', 'JUIFS', 'SAINT HONORE']
  };

  // Pure : « AL 839 » / « al839 » → « AL0839 ».
  function cleParcelle(section, numero) {
    const s = String(section || '').trim().toUpperCase().replace(/\s+/g, '');
    const n = String(numero || '').replace(/\D/g, '');
    if (!s || !n) return '';
    return (s.length === 1 ? '0' + s : s) + n.padStart(4, '0');
  }

  // Pure : le bien est-il dans un périmètre de DPU renforcé de Blois ? → { statut: 'oui'|'probable'|'non'|'', motif }.
  // La parcelle AL 839 l'est ; une adresse sur une rue du plan du centre-ville l'est probablement (à vérifier sur le plan).
  function dpurBlois(insee, parcelles, adresse) {
    if (String(insee || '') !== DPUR_BLOIS.insee) return { statut: '', motif: '' };
    const cles = (parcelles || []).map(p => cleParcelle(p.section, p.numero)).filter(Boolean);
    if (cles.some(c => DPUR_BLOIS.parcelles.includes(c))) return { statut: 'oui', motif: 'parcelle AL 839 (immeuble Marignan, quartier Coty)' };
    const a = String(adresse || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[-']/g, ' ').replace(/\s+/g, ' ');
    const rue = DPUR_BLOIS.rues.find(nom => new RegExp(`(^|[^A-Z])(RUE|PLACE|QUAI)( (DE LA|DE L|DES|DU|DE))? ${nom}([^A-Z]|$)`).test(a));
    if (rue) return { statut: 'probable', motif: `adresse sur une rue du périmètre du centre-ville (${rue.toLowerCase()}) — à vérifier sur le plan` };
    return { statut: 'non', motif: 'hors des périmètres de DPU renforcé de Blois (centre-ville, AL 839) — à vérifier sur le plan si le bien est au centre' };
  }

  // ---- Plusieurs parcelles (étude 06/10 : « le zonage doit être détecté par parcelle, il peut y en avoir plusieurs ») ----
  // Pure : une ligne par parcelle lue — zone du Géoportail, famille retenue (celle choisie à la main pour cette parcelle, sinon
  // celle de la zone lue), contenance. `zonages` : [{ section, numero, statut: 'lecture'|'ok'|'erreur', resultat, erreur }].
  function lignesZonageParcelles(zonages, surcharges) {
    const choix = surcharges || {};
    return (zonages || []).map(z => {
      const r = z.resultat || null;
      const zone = r && r.zones && r.zones[0] ? r.zones[0] : null;
      const cle = cleParcelle(z.section, z.numero);
      const lue = zone ? familleZonePreemption(zone.typezone) : '';
      // Parcelle à cheval sur plusieurs zones (ou touchant la voisine) : les autres familles comptent aussi (audit 12/10 :
      // seule la première zone rendue était lue).
      const autresFamilles = [...new Set(((r && r.zones) || []).slice(1).map(x => familleZonePreemption(x && x.typezone)).filter(f => f && f !== lue))];
      return {
        autresFamilles,
        cle, libelle: `${z.section} ${Number(z.numero) || z.numero}`, statut: z.statut, erreur: z.erreur || '',
        zone: zone ? zone.libelle : '', typezone: zone ? zone.typezone : '', libelong: zone ? zone.libelong || '' : '',
        lue, famille: choix[cle] || lue, choisie: !!choix[cle],
        contenance: r && r.parcelle && r.parcelle.contenance ? r.parcelle.contenance : null
      };
    });
  }

  var PRIORITE_STATUT_PREEMPTION = { oui: 3, verifier: 2, non: 1 };
  var LIBELLES_FAMILLE_ZONE = { U: 'zone U', AU: 'zone AU', A: 'zone A', N: 'zone N', '': 'zone inconnue' };

  // Pure : l'analyse quand les parcelles ne sont pas toutes dans la même zone — chaque zone est analysée à part, puis chaque
  // droit garde le statut le plus exigeant (à purger > à vérifier > non applicable) : un droit qui touche une seule des
  // parcelles vendues reste à purger. Le motif dit quelle zone (et quelles parcelles) le déclenche.
  function analyserPreemptionParcelles(rep, lignes) {
    const lues = (lignes || []).filter(l => l.statut !== 'lecture');
    if (!lues.length) return analyserPreemption(rep);
    const groupes = new Map();
    // Zone voisine que la parcelle touche aussi (`autresFamilles`, hors zone choisie à la main) : le Géoportail rend toutes les
    // zones qui intersectent la parcelle, même d'un filet dû au décalage cadastre/PLU. Elle ne rend jamais un droit « à purger »
    // d'office : « à vérifier », l'étude tranche en choisissant la zone de la parcelle (relecture 12/10).
    const voisines = new Map();
    lues.forEach(l => {
      const f = l.famille || '';
      if (!groupes.has(f)) groupes.set(f, []);
      groupes.get(f).push(l.libelle);
      (l.choisie || !Array.isArray(l.autresFamilles) ? [] : l.autresFamilles).forEach(v => {
        if (!v || v === f) return;
        if (!voisines.has(v)) voisines.set(v, []);
        voisines.get(v).push(l.libelle);
      });
    });
    [...voisines.keys()].forEach(v => { if (groupes.has(v)) voisines.delete(v); });
    if (groupes.size === 1 && !voisines.size) {
      const f = [...groupes.keys()][0];
      return analyserPreemption(Object.assign({}, rep, { zone: f || rep.zone || undefined }));
    }
    const analyses = [...groupes.entries()].map(([f, parcelles]) => ({ f, parcelles, a: analyserPreemption(Object.assign({}, rep, { zone: f || undefined })) }))
      .concat([...voisines.entries()].map(([f, parcelles]) => {
        const a = analyserPreemption(Object.assign({}, rep, { zone: f }));
        const zone = LIBELLES_FAMILLE_ZONE[f] || 'zone ' + f;
        a.droits = a.droits.map(dr => dr.statut === 'oui'
          ? Object.assign({}, dr, { statut: 'verifier', formalite: '', motif: `la parcelle touche aussi une ${zone} — choisir la zone retenue dans le contrôle de l’urbanisme (${dr.motif || ''})` })
          : dr);
        return { f, parcelles, a };
      }));
    const ordre = [];
    const parCle = new Map();
    analyses.forEach(({ f, parcelles, a }) => a.droits.forEach(dr => {
      if (!parCle.has(dr.cle)) { parCle.set(dr.cle, []); ordre.push(dr.cle); }
      parCle.get(dr.cle).push({ f, parcelles, dr });
    }));
    const droits = ordre.map(cle => {
      const vus = parCle.get(cle);
      // À statut égal, la formalité la plus sûre l'emporte (information de la SAFER due pour une parcelle en zone A ou N, puis
      // « à vérifier », puis rien).
      const rangFormalite = (dr) => !dr.formalite ? 0 : dr.formalite === FORMALITE_INFORMATION_SAFER_A_VERIFIER ? 1 : 2;
      const pire = vus.reduce((m, v) => {
        const pv = PRIORITE_STATUT_PREEMPTION[v.dr.statut] || 0, pm = PRIORITE_STATUT_PREEMPTION[m.dr.statut] || 0;
        return pv > pm || (pv === pm && rangFormalite(v.dr) > rangFormalite(m.dr)) ? v : m;
      }, vus[0]);
      const memeMotif = vus.every(v => v.dr.motif === vus[0].dr.motif && v.dr.statut === vus[0].dr.statut);
      const motif = memeMotif ? vus[0].dr.motif
        : vus.map(v => {
          const zone = LIBELLES_FAMILLE_ZONE[v.f] || 'zone ' + v.f;
          const dit = new RegExp('(^|[^A-Za-z])zones? (?:' + (v.f || 'inconnue') + ')(?![A-Za-z])', 'i').test(v.dr.motif || '');
          return `${v.parcelles.join(', ')}${dit ? '' : ` (${zone})`} : ${v.dr.motif}`;
        }).join(' ; ');
      return Object.assign({}, pire.dr, { motif, manque: [...new Set(vus.flatMap(v => v.dr.manque || []))] });
    });
    const aFaire = droits.filter(dr => dr.statut === 'oui' && dr.formalite).map(dr => dr.formalite);
    const manques = [...new Set(droits.flatMap(dr => dr.manque || []))];
    return { droits, aFaire, manques };
  }
