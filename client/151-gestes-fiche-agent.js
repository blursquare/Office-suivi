// Gestes de la fiche faits par « Demander à CLAIRE » (étude 31/10 : « ce que je veux c'est que Claude utilise CLAIRE comme moi » ; choix :
// un outil par bouton). Chaque geste de l'outil action_dossier ci-dessous appelle la MÊME fonction que le bouton de la fiche, après la carte
// « Autoriser » (client/66, actionDossierAgent) ; une confirmation de l'écran vaut alors accord (avecConfirmationAccordee).

var TYPES_VENTE_AGENT = { maison: 'maison', copropriete: 'copropriété', terrain: 'terrain à bâtir', terre: 'terre agricole / terrain non bâti' };
var CHAMPS_SUCCESSION_AGENT = ['type', 'conjointSurvivant', 'ouvertureLe', 'testament', 'donationEpoux', 'droitsDus', 'inventaireNecessaire', 'actifSuperieurSeuil'];

// Pure : les parties telles que lire_dossier les numérote (même filtre), avec leur place réelle dans d.parties.
function partiesNumeroteesAgent(d) {
  return (Array.isArray(d && d.parties) ? d.parties : []).map((p, index) => ({ p, index })).filter(x => x.p);
}

// Pure : ce que fera un geste de la fiche — { description, … } ou { erreur }.
function preparerGesteFicheAgent(e, d, dossier) {
  if (!d) return { erreur: 'dossier introuvable' };
  const succ = estSuccession(d);
  switch (e.action) {
    case 'piece_ajouter': {
      const label = String(e.libelle || '').trim();
      if (!label || /\[à compléter\]/.test(label)) return { erreur: 'libelle = le nom de la pièce à ajouter' };
      if ((d.piecesPersonnalisees || []).some(p => normaliserPourRecherche(p.label) === normaliserPourRecherche(label))) return { erreur: 'cette pièce est déjà dans la checklist' };
      return { description: `Ajouter la pièce « ${label.slice(0, 120)} » à la checklist${dossier}.`, label };
    }
    case 'piece_retirer': {
      const cible = normaliserPourRecherche(String(e.piece || ''));
      const p = (d.piecesPersonnalisees || []).find(x => normaliserPourRecherche(x.label) === cible);
      return p ? { description: `Retirer la pièce « ${p.label} » de la checklist${dossier}.`, piece: p }
        : { erreur: 'seule une pièce ajoutée à la main se retire : reprends son libellé exact' };
    }
    case 'piece_non_recue': {
      const p = pieceChecklistParLibelle(d, e.piece);
      if (!p) return { erreur: 'pièce introuvable dans la checklist : reprends son libellé exact (pieces_recues)' };
      if (/^perso-/.test(p.cle)) return { erreur: 'pièce ajoutée à la main : retire-la (piece_retirer) ou laisse-la' };
      if ((d.pieces || {})[p.cle] !== 'recue') return { erreur: 'cette pièce n’est pas notée reçue' };
      return { description: `Remettre « ${p.label} » en manquante (le fichier reconnu à tort ne sera plus proposé pour cette pièce)${dossier}.`, piece: p };
    }
    case 'engagement_defait': {
      const n = parseInt(e.numero, 10);
      const eng = d.analyseJuridique && (d.analyseJuridique.engagements || [])[n - 1];
      if (!eng) return { erreur: 'engagement introuvable : numero = sa position dans engagements_du_vendeur, à partir de 1' };
      if (!eng.fait) return { erreur: 'cet engagement n’est pas coché à la main (réalisé par ses pièces reçues, ou pas réalisé)' };
      return { description: `Décocher l’engagement « ${libelleCourtEngagement(eng)} »${dossier}.`, engagement: eng };
    }
    case 'type_vente': {
      const v = String(e.valeur || '').trim();
      if (succ) return { erreur: 'une succession n’a pas de type de vente' };
      if (!TYPES_VENTE_AGENT[v]) return { erreur: 'valeur = maison, copropriete, terrain ou terre' };
      if (d.typeVente === v) return { erreur: 'c’est déjà le type de vente du dossier' };
      return { description: `Passer le type de vente à « ${TYPES_VENTE_AGENT[v]} » (la checklist des pièces suit)${dossier}.` };
    }
    case 'fonds_annuler_validation':
      if (!d.fondsValidesLe) return { erreur: 'les fonds n’ont pas été validés à la main' };
      if (d.receptionFondsConfirmeeLe) return { erreur: 'la réception est déjà confirmée au client : la validation ne s’annule plus' };
      return { description: `Annuler la validation à la main des fonds reçus${dossier}.` };
    case 'fonds_verifier':
      return { description: `Relire les reçus comptables déposés sur le NAS pour les fonds de ce dossier${dossier}.` };
    case 'authentic_maj': {
      const majs = typeof majsEnAttenteAuthentic === 'function' ? majsEnAttenteAuthentic(d) : [];
      if (!majs.length) return { erreur: 'aucune mise à jour d’Authentic en attente sur ce dossier' };
      if (e.valeur !== 'accepter' && e.valeur !== 'ignorer') return { erreur: 'valeur = accepter ou ignorer' };
      return { description: `${e.valeur === 'accepter' ? 'Écrire sur la fiche' : 'Ignorer'} ${majs.length > 1 ? `les ${majs.length} mises à jour proposées` : 'la mise à jour proposée'} par Authentic${dossier}.`, cles: majs.map(m => m.cle) };
    }
    case 'authentic_completer':
      return { description: `Compléter la fiche avec le dossier relevé dans Authentic (parties, coordonnées, bien, prix, référence)${dossier}.` };
    case 'partie_retirer': {
      const x = partiesNumeroteesAgent(d)[parseInt(e.numero, 10) - 1];
      if (!x) return { erreur: 'partie introuvable : numero = sa position dans parties de lire_dossier, à partir de 1' };
      const nom = [x.p.prenom, x.p.nom].map(v => String(v || '').trim()).filter(Boolean).join(' ') || 'cette personne';
      return { description: `Retirer ${nom} de la fiche (Authentic pourra la remettre)${dossier}.`, index: x.index };
    }
    case 'succession_champ': {
      const champ = String(e.libelle || '').trim();
      if (!succ) return { erreur: 'ce dossier n’est pas une succession' };
      if (!CHAMPS_SUCCESSION_AGENT.includes(champ)) return { erreur: `libelle = ${CHAMPS_SUCCESSION_AGENT.join(', ')}` };
      const v = String(e.valeur == null ? '' : e.valeur).trim();
      if (/\[à compléter\]/.test(v)) return { erreur: 'valeur inconnue : demande-la à l’utilisateur' };
      if (champ === 'type' && v && !TYPES_SUCCESSION.some(t => t.cle === v)) return { erreur: `type = ${TYPES_SUCCESSION.map(t => t.cle).join(', ')}` };
      if (champ === 'ouvertureLe' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { erreur: 'date au format AAAA-MM-JJ' };
      if (['conjointSurvivant', 'testament', 'donationEpoux', 'droitsDus', 'inventaireNecessaire'].includes(champ) && !['', 'oui', 'non'].includes(v)) return { erreur: 'valeur = oui, non ou ""' };
      return { description: `Succession : « ${CHAMPS_SUCCESSION[champ] || champ} » → ${v || 'effacé'}${dossier}.`, champ, valeur: champ === 'actifSuperieurSeuil' ? v === 'oui' : v };
    }
    default: return { erreur: 'action inconnue' };
  }
}

function executerGesteFicheAgent(e, d, prep) {
  switch (e.action) {
    case 'piece_ajouter': ajouterPiecePersonnalisee(d.id, prep.label); return;
    case 'piece_retirer': avecConfirmationAccordee(() => supprimerPiecePersonnalisee(d.id, prep.piece.cle)); return;
    case 'piece_non_recue': avecConfirmationAccordee(() => reinitialiserStatutPieceStandard(d.id, prep.piece.cle, prep.piece.label)); return;
    case 'engagement_defait': {
      const i = (d.analyseJuridique && d.analyseJuridique.engagements || []).indexOf(prep.engagement);
      if (i < 0 || !prep.engagement.fait) throw new Error('l’engagement a changé entre-temps');
      avecConfirmationAccordee(() => basculerEngagementFait(d.id, i));
      return;
    }
    case 'type_vente': changerTypeVente(d.id, String(e.valeur).trim()); return;
    case 'fonds_annuler_validation': annulerValidationFonds(d.id); return;
    case 'fonds_verifier': verifierFondsRecus(d.id, null); return;
    case 'authentic_maj': (e.valeur === 'accepter' ? accepterMajsAuthentic : ignorerMajsAuthentic)(d.id, prep.cles); return;
    case 'authentic_completer': avecConfirmationAccordee(() => completerDossierDepuisAuthentic(d.id)); return;
    case 'partie_retirer': avecConfirmationAccordee(() => demanderRetirerPartie(d.id, prep.index)); return;
    case 'succession_champ': changerSuccession(d.id, prep.champ, prep.valeur); return;
    default: throw new Error('action inconnue');
  }
}
