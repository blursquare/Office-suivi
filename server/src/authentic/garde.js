// @ts-check
'use strict';
// Garde-fous de CLAIRE dans Authentic (étape 1 du plan validé par l'étude le 27/10 : « lecture seule par défaut : ne jamais confirmer une
// suppression (sous-dossier, formalité, copie, mail), un envoi, un paraphe ou une signature » ; « les liens rouges « Supprimer le dossier »
// et les corbeilles des aperçus sont destructeurs et irréversibles »).
// Deux filets tenus par le code, pour CHAQUE clic du navigateur du serveur :
//  1. une LISTE DE GESTES PERMIS : chaque clic dit son geste ; un geste inconnu est refusé, une écriture (préparer une demande CJN /
//     Comedec) n'est permise que si l'étude l'a allumée dans Réglages › Authentic (éteinte par défaut) ;
//  2. une LISTE NOIRE de libellés, en second filet : un bouton qui envoie, signe, supprime, paraphe, expédie, archive… n'est jamais cliqué,
//     même par un geste permis (le libellé lu SOUS LE POINTEUR compte, pas celui que le parcours croit viser).
// Chaque refus est gardé en mémoire (les 50 derniers, sans texte de la page : le geste et le libellé du bouton, coupé) et dit au journal
// technique du serveur.

// Les libellés que CLAIRE ne clique jamais (wiki de Fichorga ; cartographie de l'étude du 27/10 : aperçus des formalités, GED, mails).
const RE_INTERDIT = /(envo[iy]|prêt pour envoi|pret pour envoi|exp[ée]di|signer|signature|parapheur|paraphe|\blre\b|lettre recommand|supprim|corbeille|virement|euros?\b|intégrer|integrer|nouveau dossier|export|réinitialiser|reinitialiser|mode expert|données littérales|donnees litterales|débloquer|debloquer|déblocage|deblocage|archiver|archive\b|clôturer|cloturer|dupliquer|payer|paiement|\bsend\b|\bdelete\b|transmettre|télétransmettre|teletransmettre|déposer|deposer|ajouter au micen|retirer du micen|renommer|enregistrer|déplacer|deplacer|partager|transf[ée]rer|imprimer|détacher|detacher|annuler)/i;

/** Pure : un libellé que CLAIRE ne clique jamais. @param {string} libelle */
function libelleInterdit(libelle) {
  return RE_INTERDIT.test(String(libelle || ''));
}

// Les gestes permis. `libelles` : les seuls textes que ce geste peut viser (comparés sans casse ni espaces en trop) ; absent = un texte venu
// de la fiche (nom du dossier, d'une personne, d'un bien, d'une pièce) — alors seul le bouton sous le pointeur est contrôlé.
// `ecriture` : le geste crée quelque chose dans Authentic — permis seulement si l'étude l'a allumé.
const GESTES_PERMIS = {
  connexion: { libelles: ['Se connecter'] },
  navigation: { libelles: ['Retour', 'Fermer', 'Rechercher', 'Formalités préalables', 'Formalités postérieures', 'Actes', 'Pièces jointes', 'Mails', 'Accueil', 'Suivis'] },
  donnee: {},
  ecriture: { ecriture: true }
};

/** @param {string} t */
const plat = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** @type {Array<{ quand: string, geste: string, libelle: string, motif: string }>} */
const refus = [];

/**
 * Pure : le clic est-il permis ? Rend '' si oui, sinon le motif du refus.
 * @param {{ geste?: string, vise?: string, bouton?: string, texte?: string, ecritureAutorisee?: boolean }} c
 *   vise : le texte que le parcours voulait cliquer ; bouton : le libellé du bouton réellement sous le pointeur ; texte : le texte de l'élément.
 */
function motifRefus(c) {
  const g = c && c.geste ? /** @type {any} */ (GESTES_PERMIS)[c.geste] : null;
  if (!g) return 'geste inconnu';
  if (g.ecriture && !c.ecritureAutorisee) return 'écriture dans Authentic éteinte (Réglages › Authentic)';
  if (g.libelles && !g.libelles.some((/** @type {string} */ l) => plat(l) === plat(c.vise))) return 'libellé hors de la liste de ce geste';
  // Un texte de la fiche (geste `donnee`) est souvent le lien lui-même : seul ce que le bouton porte EN PLUS de ce texte compte (audit 0.376.0 :
  // « rue de l'Imprimerie », « SCI EXPORTEC » cassaient la lecture) — une corbeille ou « Supprimer » à côté du nom reste refusé.
  const bouton = c.geste === 'donnee' ? plat(c.bouton).replace(plat(c.vise), ' ') : String(c.bouton || '');
  if (libelleInterdit(bouton)) return 'bouton interdit';
  // Un libellé du parcours (navigation, écriture) est contrôlé lui-même ; un texte de la fiche peut contenir un mot de la liste (« EXPORTEC »).
  if (c.geste !== 'donnee' && libelleInterdit(c.texte || c.vise)) return 'libellé interdit';
  return '';
}

/** Contrôle un clic ; un refus est gardé et lève une erreur (jamais le texte de la page). @param {Parameters<typeof motifRefus>[0]} c */
function controlerClic(c) {
  const motif = motifRefus(c);
  if (!motif) return;
  // Jamais un texte de la fiche (nom, adresse) : pour un geste `donnee`, seulement le mot interdit trouvé (audit 0.376.0).
  const libelle = c && c.geste === 'donnee'
    ? ((RE_INTERDIT.exec(plat(c.bouton).replace(plat(c.vise), ' ')) || [''])[0])
    : String((c && (c.bouton || c.vise)) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  refus.push({ quand: new Date().toISOString(), geste: String((c && c.geste) || ''), libelle, motif });
  while (refus.length > 50) refus.shift();
  console.warn(`[authentic] clic refusé par CLAIRE (${motif}) : geste ${String((c && c.geste) || '?')}${libelle ? ` « ${libelle} »` : ''}`);
  throw Object.assign(new Error(`clic refusé par CLAIRE (${motif})${libelle ? ` : « ${libelle} »` : ''}`), { refusGarde: true });
}

/** Les refus récents (Réglages › Authentic). */
function refusRecents() { return refus.slice().reverse(); }

module.exports = { RE_INTERDIT, GESTES_PERMIS, libelleInterdit, motifRefus, controlerClic, refusRecents };
