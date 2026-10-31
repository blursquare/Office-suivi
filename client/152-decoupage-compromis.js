// Découper le compromis (étude 31/10) : un compromis d'agence signé arrive avec toutes ses annexes à la suite dans un seul PDF.
// CLAIRE le découpe — le compromis seul, puis une pièce par annexe —, nomme chaque pièce, la range dans la rubrique de sa
// thématique du dossier client du NAS et, pour les diagnostics, fait un PDF par diagnostic ET un PDF unique de tous les
// diagnostics (choix de l'étude).
//
// Repère : le logiciel de l'agence (Modelo, de Septeo — vu sur deux compromis réels le 31/10) place devant chaque annexe une page
// de séparation à texte « Annexe n°N » / libellé / nom du fichier déposé. C'est cette page qui découpe, jamais le texte du
// compromis (il cite toutes les pièces) ; elle n'est recopiée dans aucune pièce. Les annexes scannées n'ont pas besoin d'OCR :
// leur type se lit sur la page de séparation. Un dossier de diagnostics techniques en un seul bloc (DDT) est redécoupé par le
// titre en tête de ses pages (« Constat de risque d'exposition au plomb », « Diagnostic de performance énergétique »…).
// Sans page de séparation, rien n'est deviné : l'outil le dit et propose le document entier.
//
// Rien n'est écrit sans un clic (« Ranger dans le dossier ») ; chaque pièce est une COPIE dans le dossier client du NAS
// (`POST /api/nas/deposer-annexe`, jamais d'écrasement : « Nom (2).pdf »), l'original reste tel quel.
// « Demander à CLAIRE » : outil `decouper_compromis` (proposer sans carte, ranger après la carte « Autoriser »).

// Une page de séparation : première ligne « Annexe n°N » (« n° », « N° », « no »), page courte (libellé et nom du fichier).
// « ANNEXE 1 : A L'ADRESSE SAISIE… » d'un état des risques n'est pas une séparation (pas de « n° », phrase longue).
var RE_SEPARATEUR_ANNEXE = /^annexe\s*n\s*[°o]\s*(\d{1,3})\s*$/;
var LIGNES_MAX_SEPARATEUR = 6;
// Le certificat qui clôt TOUT le document dit « … du document » ; celui d'une annexe signée à part ne termine rien (relecture 0.411.0).
var RE_CERTIFICAT_SIGNATURE = /^certificat de signature electronique du document/;

// Diagnostics : titre en tête de page (début de la première ou de la deuxième ligne) → diagnostic. `annexe` = même motif lu
// dans le libellé ou le nom de fichier d'une page de séparation (« dpe (23) », « electricite (20) », « Attestation de mesurage »).
// L'ordre compte : « fiche récapitulative amiante des parties communes » (DTA) n'est pas le repérage amiante du lot.
var DIAGNOSTICS_COMPROMIS = [
  { cle: 'synthese', label: 'Dossier de diagnostics techniques (synthèse)', titre: /^(dossier de diagnostics? techniques?|resume du dossier de diagnostics?|note de synthese|rapport officiel de diagnostics?)/, annexe: /synthese|\bddt\b|dossier de diagnostic/ },
  { cle: 'mesurage', label: 'Mesurage (loi Carrez - Boutin)', titre: /^(certificat de (superficie|surface)|attestation de (surfaces?|superficie|mesurage)|mesurage)/, annexe: /mesurage|carrez|boutin|superficie|surfaces? privative/ },
  { cle: 'dpe', label: 'Diagnostic de performance énergétique (DPE)', titre: /^(diagnostic de performance (energetique )?(n\b|n°|\(|logement)|dpe )/, annexe: /\bdpe\b|performance energetique/ },
  { cle: 'amiante', label: 'Repérage amiante', titre: /^(constat de reperage amiante|rapport (de la )?mission de reperage|etat mentionnant la presence ou l'absence de materiaux .{0,40}amiante|rapport de reperage .{0,40}amiante)/, annexe: /amiante/ },
  { cle: 'plomb', label: 'Constat de risque d’exposition au plomb (CREP)', titre: /^(constat de risque d'exposition au plomb)/, annexe: /plomb|\bcrep\b/ },
  { cle: 'gaz', label: 'État de l’installation intérieure de gaz', titre: /^(etat de l'installation interieure de gaz|rapport de l'etat de l'installation interieure de gaz)/, annexe: /\bgaz\b/ },
  { cle: 'electricite', label: 'État de l’installation intérieure d’électricité', titre: /^((rapport de l')?etat de l'installation interieure d'electricite)/, annexe: /electric/ },
  { cle: 'termites', label: 'État relatif aux termites', titre: /^(etat (relatif a la presence )?(de |des )?termites|etat parasitaire)/, annexe: /termite|parasitaire/ },
  { cle: 'assainissement', label: 'Assainissement non collectif', titre: /^(rapport de (visite|controle) .{0,40}assainissement|controle (de l'|des installations d')assainissement)/, annexe: /assainissement|spanc/ },
  { cle: 'erp', label: 'État des risques et pollutions (ERP)', titre: /^(etat des risques|information acquereur.{0,3}locataire)/, annexe: /\berp\b|errial|ernmt|etat des risques|georisques/ },
  // Pièces du diagnostiqueur (attestation sur l'honneur, assurance, certificats) : seulement dans le PDF unique.
  { cle: 'diagnostiqueur', label: 'Pièces du diagnostiqueur', titre: /^(attestation sur l'honneur|attestation d'assurance|attestation\s*$|certificat de competences?)/, annexe: null }
];

// Autres annexes d'un compromis d'agence (libellé ou nom de fichier de la page de séparation) → type de pièce. `type` = clé de
// TYPES_SCAN quand la pièce y existe (libellé et rubrique de Claire Scan, pour que le parcours du NAS la coche) ; sinon libellé
// et rubrique propres. Lus AVANT les diagnostics : « fiche récapitulative amiante parties communes » est une pièce de copropriété.
var ANNEXES_COMPROMIS = [
  { motif: /amiante.{0,30}parties communes|fiche recapitulative amiante|\bdta\b/, label: 'Fiche récapitulative amiante (parties communes)', rubriques: ['copro'] },
  { motif: /pre[- ]?etat date/, type: 'preEtatDate' },
  { motif: /etat date/, type: 'etatDate' },
  { motif: /reglement de copropriete|\brcp\b|etat descriptif de division/, type: 'reglementCopro' },
  { motif: /carnet (d'?)?entretien/, label: 'Carnet d’entretien de l’immeuble', rubriques: ['copro'] },
  { motif: /fiche synthetique/, label: 'Fiche synthétique de la copropriété', rubriques: ['copro'] },
  { motif: /cahier des charges/, label: 'Cahier des charges', rubriques: [] },
  { motif: /\bkbis\b|extrait k\b/, label: 'Extrait Kbis', rubriques: [] },
  { motif: /immatriculation|\bimmat\b/, label: 'Attestation d’immatriculation de la copropriété', rubriques: ['copro'] },
  { motif: /\bpv\b|proces[- ]verbal|assemblee generale|\bag[eo]\b/, type: 'pvAssemblee' },
  { motif: /informations? financi|appel de (fonds|charges|provisions?)|provisions|charges|decompte de charges/, label: 'Informations financières de la copropriété', rubriques: ['copro'] },
  { motif: /titre (de )?propriete|attestation (immobiliere|de propriete)/, type: 'titrePropriete' },
  { motif: /plan cadastral|extrait cadastral|plan de situation/, type: 'planCadastral' },
  { motif: /piece d'?identite|\bcni\b|carte (nationale )?d'?identite|passe?port|titre de sejour/, type: 'identite' },
  { motif: /justificatif (de )?domicile|justificatif(?! ((d'?)?apport|(de )?(revenus|financement|ressources|fonds)))/, label: 'Justificatif de domicile', parPartie: true },
  { motif: /\brib\b|releve d'?identite bancaire/, type: 'rib' },
  { motif: /certificat d'?urbanisme|note de renseignements d'?urbanisme/, type: 'certificatUrbanisme' },
  { motif: /taxe fonciere/, type: 'avisTaxeFonciere' },
  { motif: /mandat/, label: 'Mandat', rubriques: [] },
  { motif: /offre de pret|offre de credit/, type: 'offrePret' }
];

function normaliserDecoupage(texte) {
  return String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();
}

// Lignes d'une page (texte des lignes reconstruites, une par ligne), sans les lignes vides. Pure.
function lignesPageDecoupage(texte) {
  return String(texte || '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Page de séparation de Modelo, ou null : { numero, libelle, fichier }. Pure.
function separateurAnnexeCompromis(texte) {
  const l = lignesPageDecoupage(texte);
  if (!l.length || l.length > LIGNES_MAX_SEPARATEUR) return null;
  const m = RE_SEPARATEUR_ANNEXE.exec(normaliserDecoupage(l[0]));
  if (!m) return null;
  return { numero: Number(m[1]), libelle: l[1] || '', fichier: l[2] || '' };
}

// Diagnostic annoncé par le titre en tête d'une page (début de la ligne 1, ou de la ligne 2 quand la ligne 1 est un en-tête
// court), ou ''. Pure.
function diagnosticTitrePage(texte) {
  const l = lignesPageDecoupage(texte).slice(0, 2).map(normaliserDecoupage);
  for (const ligne of l) {
    const d = DIAGNOSTICS_COMPROMIS.find(x => x.titre.test(ligne));
    if (d) return d.cle;
  }
  return '';
}

// Diagnostic désigné par le libellé et le nom de fichier d'une page de séparation, ou ''. Pure.
function diagnosticDeLibelle(libelle) {
  const t = normaliserDecoupage(libelle);
  if (ANNEXES_COMPROMIS.slice(0, 1).some(a => a.motif.test(t))) return '';
  const d = DIAGNOSTICS_COMPROMIS.find(x => x.annexe && x.annexe.test(t));
  return d ? d.cle : '';
}

function diagnosticParCle(cle) { return DIAGNOSTICS_COMPROMIS.find(x => x.cle === cle) || null; }

// Découpage du document d'après ses pages (`pages` = textes, index 0 = page 1). Rend :
//   { separateurs: n, segments: [{ sorte: 'compromis'|'annexe', numero, libelle, fichier, pages: [numéros de page] }] }
// Le compromis = pages avant la première séparation, plus le certificat de signature électronique qui clôt le document (et ce qui
// le suit). Une annexe = pages entre sa séparation et la suivante, séparation exclue. Sans séparation : un seul segment
// « compromis » de toutes les pages. Pure.
function decouperPagesCompromis(pages) {
  const liste = Array.isArray(pages) ? pages : [];
  const seps = [];
  liste.forEach((t, i) => { const s = separateurAnnexeCompromis(t); if (s) seps.push(Object.assign({ index: i }, s)); });
  const tout = liste.map((_, i) => i + 1);
  if (!seps.length) return { separateurs: 0, segments: [{ sorte: 'compromis', numero: 0, libelle: '', fichier: '', pages: tout }] };
  // Fin du document : dernier certificat de signature électronique APRÈS la dernière séparation (il vaut pour tout le document).
  let fin = liste.length;
  for (let i = liste.length - 1; i > seps[seps.length - 1].index; i--) {
    const l = lignesPageDecoupage(liste[i]);
    if (l.length && RE_CERTIFICAT_SIGNATURE.test(normaliserDecoupage(l[0]))) { fin = i; break; }
  }
  const compromis = tout.slice(0, seps[0].index).concat(tout.slice(fin));
  const segments = [{ sorte: 'compromis', numero: 0, libelle: '', fichier: '', pages: compromis }];
  seps.forEach((s, k) => {
    const jusqua = k + 1 < seps.length ? seps[k + 1].index : fin;
    const p = tout.slice(s.index + 1, jusqua);
    if (p.length) segments.push({ sorte: 'annexe', numero: s.numero, libelle: s.libelle, fichier: s.fichier, pages: p });
  });
  return { separateurs: seps.length, segments };
}

// Type d'une annexe d'après son libellé, son nom de fichier et le texte de sa première page lisible :
//   { cle, label, rubriques, diagnostic, parPartie }. `diagnostic` = clé de DIAGNOSTICS_COMPROMIS. Pure (TYPES_SCAN de Claire Scan).
function typeAnnexeCompromis(libelle, fichier, textePremierePage) {
  const lu = normaliserDecoupage(`${libelle || ''} ${fichier || ''}`);
  const avecType = (cle) => {
    const ty = typeof TYPES_SCAN !== 'undefined' ? TYPES_SCAN.find(x => x.cle === cle) : null;
    return ty ? { cle: ty.cle, label: ty.label, rubriques: ty.rubriques || [], diagnostic: '', parPartie: !!ty.parPartie } : null;
  };
  const annexe = ANNEXES_COMPROMIS.find(a => a.motif.test(lu));
  if (annexe && annexe === ANNEXES_COMPROMIS[0]) return { cle: 'dta', label: annexe.label, rubriques: annexe.rubriques, diagnostic: '', parPartie: false };
  // Une annexe reconnue par son libellé (« Fiche synthétique de copropriété ») n'est jamais un diagnostic, même si un mot y ressemble.
  const diag = annexe ? '' : (diagnosticDeLibelle(lu) || diagnosticTitrePage(textePremierePage));
  if (diag) { const d = diagnosticParCle(diag); return { cle: 'diag:' + diag, label: d.label, rubriques: diag === 'erp' ? ['environnement', 'diagnostics', 'aae'] : ['diagnostics'], diagnostic: diag, parPartie: false }; }
  if (annexe) {
    const t = annexe.type ? avecType(annexe.type) : null;
    if (t) return t;
    return { cle: 'annexe:' + normaliserDecoupage(annexe.label).replace(/[^a-z]+/g, '-'), label: annexe.label, rubriques: annexe.rubriques || [], diagnostic: '', parPartie: !!annexe.parPartie };
  }
  // Rien dans le libellé : la première page lisible, comme Claire Scan.
  if (typeof typePieceScan === 'function' && typeof enTeteScan === 'function') {
    const ty = typePieceScan(enTeteScan(textePremierePage || ''));
    // Une page de garde de DDT reconnue par Claire Scan est un bloc de diagnostics : redécoupé comme tel (relecture 0.411.0).
    if (ty && (ty.cle === 'diagnosticsTechniques' || ty.cle === 'erp')) {
      const diag = ty.cle === 'erp' ? 'erp' : 'synthese'; const d = diagnosticParCle(diag);
      return { cle: 'diag:' + diag, label: d.label, rubriques: diag === 'erp' ? ['environnement', 'diagnostics', 'aae'] : ['diagnostics'], diagnostic: diag, parPartie: false };
    }
    if (ty) return { cle: ty.cle, label: ty.label, rubriques: ty.rubriques || [], diagnostic: '', parPartie: !!ty.parPartie };
  }
  return { cle: '', label: '', rubriques: [], diagnostic: '', parPartie: false };
}

// Pages d'une annexe de diagnostics réparties par diagnostic, d'après le titre en tête de chaque page : une page sans titre
// (suite, page scannée, croquis) suit la précédente ; les premières pages avant tout titre vont à la synthèse. Une annexe qui
// n'annonce qu'UN diagnostic (ou aucun titre reconnu) n'est pas redécoupée : `[{ diagnostic, pages }]` dans l'ordre. Pure.
function repartirDiagnosticsAnnexe(segment, pages, diagnosticAnnexe) {
  const nums = (segment && segment.pages) || [];
  const titres = nums.map(n => diagnosticTitrePage(pages[n - 1]));
  const distincts = new Set(titres.filter(t => t && t !== 'diagnostiqueur'));
  if (distincts.size < 2) return [{ diagnostic: diagnosticAnnexe || [...distincts][0] || 'synthese', pages: nums.slice() }];
  const parties = [];
  let courant = 'synthese';
  nums.forEach((n, i) => {
    if (titres[i]) courant = titres[i];
    const dernier = parties[parties.length - 1];
    if (dernier && dernier.diagnostic === courant) dernier.pages.push(n);
    else parties.push({ diagnostic: courant, pages: [n] });
  });
  return parties;
}

// Côté d'une pièce par partie (identité, justificatif, RIB) d'après son libellé : 'vendeur', 'acquereur' ou ''. Pure.
function coteLibelleAnnexe(libelle) {
  const t = normaliserDecoupage(libelle);
  if (/vendeur|cedant|promettant/.test(t)) return 'vendeur';
  if (/acquereur|cessionnaire|beneficiaire/.test(t)) return 'acquereur';
  return '';
}

// Nom d'une pièce rangée : « Libellé - annexe du compromis » ; le compromis lui-même « Compromis signé (sans les annexes) ».
// Jamais le nom du fichier déposé dans le logiciel de l'agence (il porte souvent un nom de client). Pure.
function nomPieceDecoupage(label, sorte) {
  if (sorte === 'compromis') return 'Compromis signé (sans les annexes)';
  if (sorte === 'diagnostics') return 'Diagnostics techniques - tous les diagnostics';
  return `${String(label || 'Annexe').replace(/[\\/:*?"<>|]+/g, '-').trim()} - annexe du compromis`;
}

// Pièces à produire d'après le découpage : le compromis, une pièce par annexe (une par diagnostic pour un DDT en bloc), puis le
// PDF unique de tous les diagnostics (pages de diagnostics dans l'ordre du document, pièces du diagnostiqueur comprises) dès
// qu'il y a au moins un diagnostic. `pages` = textes des pages. Chaque pièce : { id, sorte, label, nom, pages, rubriques,
// diagnostic, numero, inclure }. Pure.
function piecesDecoupageCompromis(pages) {
  const dec = decouperPagesCompromis(pages);
  const pieces = [];
  const pagesDiag = [];
  const pagesDiagnostiqueur = [];
  let n = 0;
  const ajouter = (p) => { pieces.push(Object.assign({ id: 'p' + (++n), inclure: true }, p)); };
  dec.segments.forEach(seg => {
    if (seg.sorte === 'compromis') {
      ajouter({ sorte: 'compromis', label: 'Compromis signé', nom: nomPieceDecoupage('', 'compromis'), pages: seg.pages, rubriques: ['sru'], diagnostic: '', numero: 0, libelleLu: '' });
      return;
    }
    const premiere = seg.pages.map(p => pages[p - 1]).find(t => lignesPageDecoupage(t).length >= 3) || '';
    const ty = typeAnnexeCompromis(seg.libelle, seg.fichier, premiere);
    // Un bloc qui annonce plusieurs diagnostics en tête de pages est un DDT, quel que soit son libellé (« Attestation de mesurage »
    // de l'agence portait tout le dossier) : redécoupé.
    // Une pièce reconnue autrement (règlement, carnet d'entretien…) n'est jamais redécoupée : ses pages peuvent citer un diagnostic.
    const parties = ty.label && !ty.diagnostic ? [{ diagnostic: '', pages: seg.pages }] : repartirDiagnosticsAnnexe(seg, pages, ty.diagnostic);
    const estDiag = !!ty.diagnostic || parties.length > 1;
    if (estDiag) {
      parties.forEach(p => {
        pagesDiag.push(...p.pages);
        if (p.diagnostic === 'diagnostiqueur') { pagesDiagnostiqueur.push(...p.pages); return; } // seulement dans le PDF unique
        const d = diagnosticParCle(p.diagnostic) || diagnosticParCle('synthese');
        ajouter({ sorte: 'diagnostic', label: d.label, nom: nomPieceDecoupage(d.label), pages: p.pages, rubriques: d.cle === 'erp' ? ['environnement', 'diagnostics', 'aae'] : ['diagnostics'], diagnostic: d.cle, numero: seg.numero, libelleLu: seg.libelle });
      });
      return;
    }
    let rubriques = ty.rubriques || [];
    if (ty.parPartie) { const c = coteLibelleAnnexe(seg.libelle); rubriques = c ? [c] : []; }
    const label = ty.label || (seg.libelle ? seg.libelle.charAt(0).toUpperCase() + seg.libelle.slice(1) : `Annexe n°${seg.numero}`);
    ajouter({ sorte: 'annexe', label, nom: nomPieceDecoupage(label), pages: seg.pages, rubriques, diagnostic: '', numero: seg.numero, libelleLu: seg.libelle, reconnu: !!ty.label });
  });
  if (pagesDiag.length) {
    ajouter({ sorte: 'diagnostics', label: 'Diagnostics techniques', nom: nomPieceDecoupage('', 'diagnostics'), pages: pagesDiag, rubriques: ['diagnostics'], diagnostic: '', numero: 0, libelleLu: '', pagesDiagnostiqueur });
  }
  return { separateurs: dec.separateurs, pieces };
}

// Ce que l'agent reçoit pour nommer une pièce (audit 0.411.0, H1) : le libellé de CLAIRE d'une pièce reconnue, sinon « Annexe n°N
// (non reconnue) » — jamais le nom modifiable ni le libellé de la page de séparation de l'agence, qui portent souvent un nom de client.
// Pure.
function titrePieceAgentDecoupage(p) {
  if (!p) return '';
  if (p.sorte === 'compromis') return 'Compromis signé (sans les annexes)';
  if (p.sorte === 'diagnostics') return 'Diagnostics techniques (tous les diagnostics)';
  if (p.sorte === 'diagnostic' || p.reconnu) return String(p.label || '');
  return `Annexe n°${Number(p.numero) || 0} (non reconnue)`;
}

// Pages du PDF unique de tous les diagnostics d'après les pièces de diagnostic cochées (pages corrigées comprises) et les pièces du
// diagnostiqueur, dans l'ordre du document, sans doublon (relecture 0.411.0 : il gardait les pages d'origine). Pure.
function pagesTousDiagnostics(pieces) {
  const unique = (pieces || []).find(p => p && p.sorte === 'diagnostics');
  const pages = new Set(unique && Array.isArray(unique.pagesDiagnostiqueur) ? unique.pagesDiagnostiqueur : []);
  (pieces || []).filter(p => p && p.sorte === 'diagnostic' && p.inclure !== false).forEach(p => p.pages.forEach(n => pages.add(n)));
  return [...pages].sort((a, b) => a - b);
}

// Pages saisies à la main (« 3-7, 9 ») → numéros de page valides, dans l'ordre, sans doublon ; null si illisible. Pure.
function pagesDepuisSaisieDecoupage(texte, total) {
  const s = String(texte || '').replace(/\s+/g, '');
  if (!s) return null;
  const sortie = [];
  for (const morceau of s.split(/[,;]/)) {
    if (!morceau) continue;
    const m = /^(\d+)(?:[-–](\d+))?$/.exec(morceau);
    if (!m) return null;
    const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < a || b > total) return null;
    for (let p = a; p <= b; p++) if (!sortie.includes(p)) sortie.push(p);
  }
  return sortie.length ? sortie : null;
}

// Numéros de page → « 3-7, 9 ». Pure.
function saisieDepuisPagesDecoupage(pages) {
  const l = (pages || []).slice();
  const morceaux = [];
  for (let i = 0; i < l.length; i++) {
    let j = i;
    while (j + 1 < l.length && l[j + 1] === l[j] + 1) j++;
    morceaux.push(j > i ? `${l[i]}-${l[j]}` : String(l[i]));
    i = j;
  }
  return morceaux.join(', ');
}

// ---------------------------------------------------------------------------------------------------------------------------
// Écran « Découper le compromis » (onglet `decoupage`, tiroir Outils › Vente, ligne « Outils » de la fiche d'une vente).

var PAGES_MAX_DECOUPAGE = 600;
// Rubriques proposées (clés de RUBRIQUES_SCANS du serveur) : le sous-dossier est retrouvé par son nom au rangement, racine à défaut.
var RUBRIQUES_DECOUPAGE = [
  ['', 'Racine du dossier'], ['sru', 'SRU'], ['diagnostics', 'Diagnostics'], ['environnement', 'Environnement'], ['copro', 'Copropriété'],
  ['etatDate', 'Copropriété › État daté'], ['preEtatDate', 'Copropriété › Pré-état daté'], ['titre', 'Titre'], ['aae', 'AAE'],
  ['vendeur', 'Vendeur'], ['acquereur', 'Acquéreur'], ['hypotheque', 'Hypothécaire / formalités'], ['travaux', 'Travaux'],
  ['construction', 'Construction'], ['comptabilite', 'Comptabilité'], ['pret', 'Comptabilité › Prêt']
];

var dcEtat = { dossierId: '', source: null, pages: [], pieces: [], separateurs: 0, lecture: '', message: '', range: false, jeton: 0 };

function dcDossier() { return dossiers.find(x => x && x.id === dcEtat.dossierId) || null; }

// Une vente en cours (jamais une succession ni un dossier archivé).
function decoupagePossible(d) { return !!d && !estSuccession(d) && !d.archive; }

function dcDossiersVente() {
  return dossiers.filter(decoupagePossible).sort((a, b) => libelleDossierAffiche(a).localeCompare(libelleDossierAffiche(b), 'fr'));
}

// Le compromis complet du dossier sur le NAS : celui que CLAIRE retient d'habitude, jamais une pièce qu'elle a elle-même découpée.
function compromisCompletNas(d, fichiers) {
  const liste = (fichiers || []).filter(f => !/sans les annexes|annexe du compromis|tous les diagnostics/i.test(String(f.nom || '')));
  return choisirAvantContratNas(liste, nomCompromisAttendu(d), contexteNomsAvantContrat(d, dossiers)).fichier;
}

async function dcChoisirDossier(id) {
  const d = dossiers.find(x => x && x.id === id);
  dcEtat = { dossierId: '', source: null, pages: [], pieces: [], separateurs: 0, lecture: '', message: '', range: false, jeton: dcEtat.jeton + 1 };
  if (!decoupagePossible(d)) { renderDecoupage(); return; }
  dcEtat.dossierId = d.id;
  if (!d.nasDossier) { dcEtat.message = 'Dossier non relié au NAS : choisissez le PDF du compromis signé.'; renderDecoupage(); return; }
  dcEtat.lecture = 'lecture';
  dcEtat.message = 'Recherche du compromis sur le NAS…';
  renderDecoupage();
  const jeton = dcEtat.jeton;
  try {
    const f = compromisCompletNas(d, await listerFichiersNas(d));
    if (jeton !== dcEtat.jeton) return;
    if (!f) { dcEtat.lecture = ''; dcEtat.message = 'Aucun compromis trouvé sur le NAS : choisissez le PDF du compromis signé.'; renderDecoupage(); return; }
    const fichier = await fichierNasPourLecture(cheminNasComplet(d, f.chemin), f.nom);
    if (jeton !== dcEtat.jeton) return;
    await dcLire(fichier, f.nom, jeton);
  } catch (e) {
    if (jeton !== dcEtat.jeton) return;
    dcEtat.lecture = 'erreur';
    dcEtat.message = `Compromis non lu (${e && e.message ? e.message : 'NAS injoignable'}) : choisissez le PDF à la main.`;
    renderDecoupage();
  }
}

// Lit le PDF page par page (texte seulement : les pages de séparation ont du texte, pas d'OCR) puis propose les pièces.
async function dcLire(fichier, nom, jeton) {
  if (typeof pdfjsLib === 'undefined') throw new Error('lecteur PDF indisponible');
  const octets = new Uint8Array(await fichier.arrayBuffer());
  dcEtat.lecture = 'lecture';
  dcEtat.message = 'Lecture du compromis…';
  renderDecoupage();
  // pdf.js détache le tampon qu'on lui donne : une copie, l'original sert à pdf-lib.
  const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: octets.slice() }).promise;
  if (pdf.numPages > PAGES_MAX_DECOUPAGE) { const n = pdf.numPages; try { pdf.destroy(); } catch (_) { /* rien */ } throw new Error(`document de ${n} pages, ${PAGES_MAX_DECOUPAGE} au plus`); }
  const pages = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      if (jeton !== dcEtat.jeton) return;
      const c = await (await pdf.getPage(p)).getTextContent();
      pages.push(lignesDepuisItemsPdf(c.items).join('\n'));
    }
  } finally { try { pdf.destroy(); } catch (_) { /* déjà fermé */ } }
  if (jeton !== dcEtat.jeton) return;
  const r = piecesDecoupageCompromis(pages);
  dcEtat.source = { nom: nom || fichier.name || 'compromis.pdf', octets };
  dcEtat.pages = pages;
  dcEtat.pieces = r.pieces.map(p => Object.assign({ saisie: saisieDepuisPagesDecoupage(p.pages), rubrique: (p.rubriques || [])[0] || '', rangee: '' }, p));
  dcEtat.separateurs = r.separateurs;
  dcEtat.lecture = 'lu';
  dcEtat.message = r.separateurs
    ? `${pages.length} pages · ${r.separateurs} annexe(s) repérée(s) par leurs pages de séparation.`
    : `${pages.length} pages · aucune page « Annexe n° » : CLAIRE ne devine rien, le document entier est proposé. Corrigez les pages à la main.`;
  renderDecoupage();
}

async function dcDeposerFichier(input) {
  const f = input && input.files && input.files[0];
  if (input) input.value = '';
  if (!f || !dcEtat.dossierId) return;
  if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { afficherToast('Choisissez un PDF.', 'OK', null); return; }
  const jeton = ++dcEtat.jeton;
  try { await dcLire(f, f.name, jeton); } catch (e) {
    if (jeton !== dcEtat.jeton) return;
    dcEtat.lecture = 'erreur';
    dcEtat.message = 'PDF illisible : ' + (e && e.message ? e.message : 'erreur');
    renderDecoupage();
  }
}

function dcOuvrir(id) {
  if (dcEtat.dossierId && dcEtat.dossierId !== id && dcEtat.pieces.some(p => p.modifiee) && !dcEtat.pieces.every(p => p.rangee || !p.inclure)) {
    demanderConfirmation('Quitter ce découpage ? Les corrections faites à la main seront perdues.', () => dcChoisirDossier(id));
  } else dcChoisirDossier(id);
}

function initDecoupage() {
  if (dcEtat.dossierId && !decoupagePossible(dcDossier())) dcEtat.dossierId = '';
  renderDecoupage();
}

function ouvrirDecoupageDepuisFiche(id) {
  fermerDossierDrawer();
  definirOnglet('decoupage');
  if (dcEtat.dossierId !== id) dcOuvrir(id);
}

function dcPiece(id) { return dcEtat.pieces.find(p => p.id === id); }

function dcChanger(id, champ, valeur) {
  const p = dcPiece(id);
  if (!p) return;
  p.modifiee = true;
  if (champ === 'inclure') p.inclure = !!valeur;
  else if (champ === 'nom') p.nom = String(valeur || '').slice(0, 120);
  else if (champ === 'rubrique') { p.rubrique = String(valeur || ''); p.rubriques = p.rubrique ? [p.rubrique] : []; }
  else if (champ === 'pages') {
    const lu = pagesDepuisSaisieDecoupage(valeur, dcEtat.pages.length);
    if (!lu) { afficherToast(`Pages illisibles : écrivez par exemple « 3-7, 9 » (1 à ${dcEtat.pages.length}).`, 'OK', null); renderDecoupage(); return; }
    p.pages = lu; p.saisie = saisieDepuisPagesDecoupage(lu);
  }
  // Une pièce déjà rangée ne redevient « à ranger » que si ce qu'elle contient ou son nom change (relecture 0.411.0 : copie « (2) »).
  if (champ !== 'inclure') p.rangee = '';
  if (p.sorte === 'diagnostic' && (champ === 'pages' || champ === 'inclure')) {
    const unique = dcEtat.pieces.find(x => x.sorte === 'diagnostics');
    if (unique && !unique.modifiee) { unique.pages = pagesTousDiagnostics(dcEtat.pieces); unique.saisie = saisieDepuisPagesDecoupage(unique.pages); unique.rangee = ''; }
  }
  if (champ !== 'nom') renderDecoupage();
}

function dcCartesAccueil(q) {
  const actifs = dcDossiersVente();
  const liste = q ? actifs.filter(x => normaliserPourRecherche(libelleDossierAffiche(x)).includes(q) || normaliserPourRecherche(x.responsable || '').includes(q)).slice(0, 12)
    : (() => { const recents = dossiersConsultesRecents(lireDossiersConsultes(), actifs).map(x => x.dossier); return recents.concat(actifs.filter(x => !recents.includes(x))).slice(0, 6); })();
  const cartes = liste.map(x => `<button type="button" class="cst-accueil-carte" onclick="dcOuvrir('${escapeOnclickArg(x.id)}')">
      <span class="cst-accueil-carte-icone" aria-hidden="true">${icone('home')}</span>
      <span class="cst-accueil-carte-texte"><span class="cst-accueil-carte-titre">${escapeHtml(libelleDossierAffiche(x))}</span>
      <span class="cst-accueil-carte-sous">${escapeHtml(['Vente', x.nasDossier ? 'relié au NAS' : 'non relié au NAS', x.responsable].filter(Boolean).join(' · '))}</span></span></button>`).join('');
  return cartes ? `<div class="cst-accueil-liste-titre"><span class="pieces-titre">${icone(q ? 'search' : 'clock')}<span class="pieces-titre-texte">${q ? 'Résultats' : 'Derniers dossiers'}</span></span></div><div class="cst-accueil-grille">${cartes}</div>` : '<div class="dash-recherche-vide">Aucune vente ne correspond.</div>';
}

function dcRechercher(valeur) {
  const zone = document.getElementById('dc-cartes');
  if (zone) zone.innerHTML = dcCartesAccueil(normaliserPourRecherche(String(valeur || '').trim()));
}

function libelleRubriqueDecoupage(cle) { const r = RUBRIQUES_DECOUPAGE.find(x => x[0] === cle); return r ? r[1] : 'Racine du dossier'; }

function renderDecoupage() {
  const actif = document.activeElement && document.activeElement.id;
  dcRendreCorps();
  if (actif) { const e = document.getElementById(actif); if (e && e.focus && e !== document.activeElement) e.focus(); }
}

function dcRendreCorps() {
  const carte = document.getElementById('dc-carte');
  if (!carte) return;
  const d = dcDossier();
  const entete = `<div class="dash-header"><div><div class="dash-eyebrow">Vente</div><div class="dash-titre-ligne"><h1 class="dash-titre">Découper le compromis</h1>${infoBulle('Le compromis signé de l’agence arrive avec ses annexes à la suite : CLAIRE le découpe aux pages « Annexe n° » du logiciel de l’agence, nomme chaque pièce et la range dans la rubrique de sa thématique. Diagnostics : un PDF par diagnostic et un PDF de tous les diagnostics. Chaque pièce est une copie, l’original reste tel quel.')}</div></div></div>`;
  if (!d) {
    carte.innerHTML = `${entete}<div class="cst-accueil">
      <span class="cst-accueil-icone" aria-hidden="true">${icone('ciseaux')}</span>
      <h2 class="cst-accueil-titre">Pour quelle vente ?</h2>
      <p class="cst-accueil-sous">Le compromis signé est retrouvé sur le NAS, ou choisi à la main.</p>
      <div class="pr-dossier-recherche-bloc cst-recherche cst-accueil-recherche"><input type="search" id="dc-recherche" class="nas-choix-recherche" autocomplete="off" placeholder="Rechercher une vente…" aria-label="Rechercher une vente" oninput="dcRechercher(this.value)"></div>
      <div id="dc-cartes" class="aut-cartes">${dcCartesAccueil('')}</div>
    </div>`;
    return;
  }
  const choisir = `<label class="dc-choisir"><input type="file" accept="application/pdf,.pdf" class="dc-fichier" onchange="dcDeposerFichier(this)"><wa-button appearance="outlined" size="s" type="button" onclick="this.previousElementSibling.click()">${icone('upload')}Choisir un PDF</wa-button></label>`;
  const aRanger = dcEtat.pieces.filter(p => p.inclure && !p.rangee).length;
  const lignes = dcEtat.pieces.map(p => {
    const ida = escapeAttr(p.id); const ido = escapeOnclickArg(p.id);
    const options = RUBRIQUES_DECOUPAGE.map(([cle, lib]) => `<option value="${escapeAttr(cle)}"${cle === p.rubrique ? ' selected' : ''}>${escapeHtml(lib)}</option>`).join('');
    const sorte = p.sorte === 'compromis' ? 'Compromis' : p.sorte === 'diagnostics' ? 'Tous les diagnostics' : p.sorte === 'diagnostic' ? `Diagnostic · annexe n°${p.numero}` : `Annexe n°${p.numero}${p.reconnu === false ? ' · non reconnue' : ''}`;
    return `<div class="dc-ligne${p.inclure ? '' : ' dc-exclue'}">
      <input type="checkbox" id="dc-i-${ida}"${p.inclure ? ' checked' : ''} aria-label="Ranger cette pièce" onchange="dcChanger('${ido}', 'inclure', this.checked)">
      <div class="dc-ligne-texte">
        <span class="dc-sorte">${escapeHtml(sorte)} · ${p.pages.length} page(s)</span>
        <input type="text" id="dc-n-${ida}" class="dc-nom" value="${escapeAttr(p.nom)}" aria-label="Nom du fichier" onchange="dcChanger('${ido}', 'nom', this.value)">
      </div>
      <input type="text" id="dc-p-${ida}" class="dc-pages" value="${escapeAttr(p.saisie)}" aria-label="Pages" title="Pages du document (ex. 3-7, 9)" onchange="dcChanger('${ido}', 'pages', this.value)">
      <select id="dc-r-${ida}" class="dc-rubrique" aria-label="Rubrique du dossier" onchange="dcChanger('${ido}', 'rubrique', this.value)">${options}</select>
      <wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Télécharger cette pièce" aria-label="Télécharger cette pièce" onclick="telechargerPieceDecoupage('${ido}')">${icone('download')}</wa-button>
      <span class="dc-etat">${p.rangee ? `${icone('check')} ${escapeHtml(p.rangee)}` : ''}</span>
    </div>`;
  }).join('');
  carte.innerHTML = `${entete}
    <div class="cst-corps">
      <div class="cst-barre">
        <span class="cst-dossier-titre">${escapeHtml(libelleDossierAffiche(d))}</span>
        <wa-button appearance="outlined" size="s" type="button" onclick="dcOuvrir('')" title="Revenir au choix du dossier">${icone('rotate-ccw')} Changer de dossier</wa-button>
        ${choisir}
        <span class="aut-barre-actions">
          <wa-button variant="brand" size="s" type="button"${d.nasDossier && aRanger ? '' : ' disabled'}${dcEtat.range ? ' loading' : ''} title="${d.nasDossier ? '' : 'Dossier non relié au NAS'}" onclick="rangerDecoupage()">${icone('folder')}Ranger dans le dossier${aRanger ? ` (${aRanger})` : ''}</wa-button>
        </span>
      </div>
      ${dcEtat.message ? `<p class="hint">${dcEtat.lecture === 'lecture' ? icone('spinner', null, true) + ' ' : ''}${escapeHtml(dcEtat.message)}${dcEtat.source ? ` — « ${escapeHtml(dcEtat.source.nom)} »` : ''}</p>` : ''}
      ${lignes ? `<div class="dc-liste">${lignes}</div>` : ''}
    </div>`;
}

// PDF d'une pièce : ses pages copiées du compromis d'origine (pdf-lib, chargé à la demande).
// Le compromis d'origine est analysé une fois par pdf-lib et gardé avec la source (audit 0.411.0, B5) ; un PDF chiffré est refusé :
// ses pages recopiées seraient illisibles (M3).
async function pdfPieceDecoupage(piece, source) {
  const s = source || dcEtat.source;
  if (!s) throw new Error('aucun document lu');
  if (!window.PDFLib) await afChargerScript(URL_PDF_LIB_PDFA, SRI_PDF_LIB_PDFA);
  const { PDFDocument } = window.PDFLib;
  if (!s.pdfLib) {
    const src = await PDFDocument.load(s.octets, { ignoreEncryption: true });
    if (src.isEncrypted) throw new Error('PDF protégé par un mot de passe : impossible d’en recopier les pages');
    s.pdfLib = src;
  }
  const src = s.pdfLib;
  const doc = await PDFDocument.create();
  (await doc.copyPages(src, piece.pages.map(n => n - 1))).forEach(pg => doc.addPage(pg));
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

async function telechargerPieceDecoupage(id) {
  const p = dcPiece(id);
  if (!p) return;
  try {
    const blob = await pdfPieceDecoupage(p);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (p.nom || 'Annexe du compromis') + '.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { afficherToast('Pièce impossible à produire : ' + (e && e.message ? e.message : 'erreur'), 'OK', null); }
}

// Range les pièces cochées et pas encore rangées dans le dossier client du NAS, une par une (copie, jamais d'écrasement).
async function rangerDecoupage(ids) {
  const d = dcDossier();
  if (!d || !d.nasDossier || dcEtat.range || !dcEtat.source) return { ok: false, rangees: 0 };
  // État figé (audit 0.411.0, B2/B3) : un changement de dossier pendant le rangement ne touche ni le nouvel état ni les pièces rangées ;
  // `ids` = les pièces annoncées sur la carte « Autoriser ».
  const etat = dcEtat;
  const jeton = etat.jeton;
  const aFaire = etat.pieces.filter(p => p.inclure && !p.rangee && (!ids || ids.includes(p.id)));
  etat.range = true;
  renderDecoupage();
  let rangees = 0; const echecs = [];
  for (const p of aFaire) {
    if (jeton !== dcEtat.jeton) break;
    try {
      const blob = await pdfPieceDecoupage(p, etat.source);
      const r = await fetchAvecAuth('/api/nas/deposer-annexe', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossierId: d.id, nom: p.nom, contenu: await base64DepuisBlob(blob), rubriques: p.rubriques || [] }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erreur || `le serveur a répondu ${r.status}`);
      p.rangee = String(j.chemin || '').split(/[\\/]/).slice(-2).join(' › ') || 'rangée';
      rangees++;
    } catch (e) { echecs.push(`${p.nom} : ${e && e.message ? e.message : 'erreur'}`); }
    if (jeton === dcEtat.jeton) renderDecoupage();
  }
  etat.range = false;
  if (rangees) {
    ajouterHistorique(d, `Compromis découpé : ${rangees} pièce(s) rangée(s) dans le dossier du NAS`);
    sauvegarder(d);
    if (typeof verifierDossierLocal === 'function') verifierDossierLocal(d.id, false);
  }
  noterVerificationPoste('decoupage-compromis', { ok: !echecs.length && rangees > 0, detail: `${rangees} pièce(s) rangée(s), ${echecs.length} échec(s), ${etat.separateurs} séparation(s)` });
  afficherToast(echecs.length ? `${rangees} pièce(s) rangée(s), ${echecs.length} non rangée(s) : ${echecs[0]}` : `${rangees} pièce(s) rangée(s) dans le dossier de la vente.`, 'OK', null);
  if (jeton === dcEtat.jeton) renderDecoupage();
  return { ok: !echecs.length, rangees, echecs: echecs.length };
}

// « Demander à CLAIRE » (outil `decouper_compromis`) : ouvre l'outil sur la vente, lit le compromis du NAS et rend les pièces
// proposées (nom donné par CLAIRE, sorte, pages, rubrique — jamais le libellé ni le nom de fichier de l'agence, qui portent des
// noms de clients). ranger = true : après la carte « Autoriser », les pièces cochées sont rangées dans le dossier du NAS.
async function decouperCompromisAgent(e) {
  const d = dossiers.find(x => x && x.id === String((e && e.dossier_id) || ''));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  if (!decoupagePossible(d)) return { erreur: estSuccession(d) ? 'une succession n’a pas de compromis' : 'dossier archivé' };
  const remplacer = dcEtat.dossierId !== d.id || !dcEtat.source || e.relire;
  if (remplacer && dcEtat.range) return { erreur: 'un rangement est en cours dans l’outil : redemande dans un instant' };
  if (remplacer && dcEtat.pieces.some(p => p.modifiee && !p.rangee)) {
    const ok = await demanderAutorisationAgent('Remplacer le découpage ouvert (des pièces y ont été corrigées à la main et pas encore rangées) par celui de ce dossier ?');
    if (!ok) return { erreur: 'refusé par l’utilisateur : le découpage ouvert est gardé' };
  }
  definirOnglet('decoupage');
  if (remplacer) await dcChoisirDossier(d.id);
  if (dcEtat.dossierId !== d.id) return { erreur: 'un autre dossier a été ouvert dans l’outil pendant la lecture : redemande' };
  if (!dcEtat.source) return { erreur: dcEtat.message || 'compromis non lu', dossier_nas_relie: !!d.nasDossier, consigne: 'Outil ouvert : l’utilisateur peut y choisir le PDF du compromis à la main.' };
  const sortie = {
    dossier_id: d.id, pages_total: dcEtat.pages.length, separations_trouvees: dcEtat.separateurs,
    pieces: dcEtat.pieces.map(p => ({ id: p.id, sorte: p.sorte, titre_piece: titrePieceAgentDecoupage(p), pages: p.saisie, nb_pages: p.pages.length, rubrique: libelleRubriqueDecoupage(p.rubrique), ranger: !!p.inclure, rangee: !!p.rangee, reconnue: p.reconnu !== false })),
    dossier_nas_relie: !!d.nasDossier,
    consigne: 'Outil « Découper le compromis » ouvert sur le poste : l’utilisateur y corrige noms, pages et rubriques, puis « Ranger dans le dossier ».'
  };
  if (e.ranger) {
    const ids = dcEtat.pieces.filter(p => p.inclure && !p.rangee).map(p => p.id);
    const n = ids.length;
    if (!d.nasDossier) return Object.assign(sortie, { rangement: 'dossier non relié au NAS : rien rangé' });
    if (!n) return Object.assign(sortie, { rangement: 'rien à ranger' });
    if (dcEtat.range) return Object.assign(sortie, { rangement: 'un rangement est déjà en cours' });
    const ok = await demanderAutorisationAgent(`Ranger ${n} pièce(s) tirée(s) du compromis (${libelleDossierAffiche(d)}) dans le dossier du NAS ? Ce sont des copies, l’original reste tel quel.`);
    if (!ok) return Object.assign(sortie, { rangement: 'refusé par l’utilisateur' });
    if (dcEtat.dossierId !== d.id) return Object.assign(sortie, { rangement: 'un autre dossier a été ouvert entre-temps : rien rangé' });
    const r = await rangerDecoupage(ids);
    sortie.rangement = `${r.rangees} rangée(s)${r.echecs ? `, ${r.echecs} échec(s)` : ''}`;
  }
  return sortie;
}
