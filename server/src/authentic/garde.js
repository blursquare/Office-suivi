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
const RE_INTERDIT = /(g[ée]n[ée]rer en pdf|ajouter un compte|d[ée]tacher de l.acte|envo[iy]|prêt pour envoi|pret pour envoi|exp[ée]di|signer|signature|parapheur|paraphe|\blre\b|lettre recommand|supprim|corbeille|virement|euros?\b|intégrer|integrer|nouveau dossier|export|réinitialiser|reinitialiser|mode expert|données littérales|donnees litterales|débloquer|debloquer|déblocage|deblocage|archiver|archive\b|clôturer|cloturer|dupliquer|payer|paiement|\bsend\b|\bdelete\b|delete_\w*|trash|poubelle|transmettre|télétransmettre|teletransmettre|déposer|deposer|ajouter au micen|retirer du micen|renommer|enregistrer|déplacer|deplacer|partager|transf[ée]rer|imprimer|détacher|detacher|annuler|constitu|r[ée]sumer|t[ée]l[ée]charger|ouvrir dans word|\bmodifier\b)/i;

/** Pure : un libellé que CLAIRE ne clique jamais. @param {string} libelle */
function libelleInterdit(libelle) {
  return RE_INTERDIT.test(String(libelle || ''));
}

// Les gestes permis. `libelles` : les seuls textes que ce geste peut viser (comparés sans casse ni espaces en trop) ; absent = un texte venu
// de la fiche (nom du dossier, d'une personne, d'un bien, d'une pièce) — alors seul le bouton sous le pointeur est contrôlé.
// `ecriture` : le geste crée quelque chose dans Authentic — permis seulement si l'étude l'a allumé.
const GESTES_PERMIS = {
  connexion: { libelles: ['Se connecter'] },
  navigation: { libelles: ['Retour', 'Fermer', 'Rechercher', 'Formalités préalables', 'Formalités postérieures', 'Actes', 'Pièces jointes', 'Mails', 'Accueil', 'Suivis', 'Infos comptables', 'Comptabilité'] },
  donnee: {},
  // Les écrans de suivi (étape 7) : le menu puis son entrée, libellés de la cartographie seulement. « Actes à signer » porte « signer » :
  // comme pour une donnée, seul ce que le bouton sous le pointeur porte EN PLUS de ce libellé est contrôlé (un « Exporter » à côté reste refusé).
  suivi: { libelles: ['Suivis', 'Office manager', 'Actes à signer', 'Suivi SAFER / DIA-DPU', 'Suivi SAFER/DIA-DPU', 'Suivi SAFER', 'Suivi État-Civil',
    'Suivi COMEDEC', 'Suivi CJN', 'Suivi MICEN'], relatif: true },
  // Déplier un bloc ou un groupe replié (« Formalités préalables (3) », « Envoyé (12) ») : seulement son chevron, dont le libellé (classe,
  // mot d'icône, titre) doit DIRE le dépliage — jamais l'en-tête lui-même, qui porte corbeille, avion d'envoi ou « + » (captures du wiki, 28/10).
  deplier: { positif: /chevron|arrow|toggler|caret|expand|triangle|navigate_next/i },
  // L'icône « image » qui ouvre l'aperçu d'une formalité au survol de sa ligne (étape 4) : son libellé (titre, aria-label, classe de
  // l'icône et de son bouton) doit DIRE l'aperçu, et rien d'interdit (audit 0.378.0 : une corbeille « Supprimer l'aperçu »).
  apercu: { positif: /aper[çc]u|preview|visibility|(?<![a-z])voir(?![a-z])|image|photo|collections|perm_media/i },
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
  if (g.positif && !g.positif.test(String(c.bouton || ''))) return 'libellé qui ne dit pas ce geste';
  // Un texte de la fiche (geste `donnee`) est souvent le lien lui-même : seul ce que le bouton porte EN PLUS de ce texte compte (audit 0.376.0 :
  // « rue de l'Imprimerie », « SCI EXPORTEC » cassaient la lecture) — une corbeille ou « Supprimer » à côté du nom reste refusé.
  const relatif = c.geste === 'donnee' || !!g.relatif;
  // Une entrée de menu : le bouton sous le pointeur doit PORTER le libellé visé (audit 0.382.0 : « Actes signés », « Statistique » juste à
  // côté passaient la seule liste noire).
  if (g.relatif && !plat(c.bouton).includes(plat(c.vise))) return 'bouton sous le pointeur différent du libellé visé';
  const bouton = relatif ? plat(c.bouton).replace(plat(c.vise), ' ') : String(c.bouton || '');
  if (libelleInterdit(bouton)) return 'bouton interdit';
  // Un libellé du parcours (navigation, écriture) est contrôlé lui-même ; un texte de la fiche peut contenir un mot de la liste (« EXPORTEC »),
  // une entrée de suivi aussi (« Actes à signer ») : sa liste fermée de libellés la tient.
  if (!relatif && libelleInterdit(c.texte || c.vise)) return 'libellé interdit';
  return '';
}

/** Contrôle un clic ; un refus est gardé et lève une erreur (jamais le texte de la page). @param {Parameters<typeof motifRefus>[0]} c */
function controlerClic(c) {
  const motif = motifRefus(c);
  if (!motif) return;
  // Jamais un texte de la fiche (nom, adresse) : pour un geste `donnee`, seulement le mot interdit trouvé (audit 0.376.0).
  const libelle = c && (c.geste === 'donnee' || c.geste === 'suivi')
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
