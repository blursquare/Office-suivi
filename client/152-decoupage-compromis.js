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
// Page de garde d'une annexe (étude 31/10 : « s'il y a une page de garde devant l'annexe, ne pas la prendre en compte ») : une page
// courte qui ne fait qu'annoncer l'annexe — « Annexe 3 », « ANNEXE N°3 : Titre de propriété », « Pièce annexée » — placée en tête de
// l'annexe, après la séparation du logiciel de l'agence. Jamais une page vide (un scan n'a pas de texte). Pure.
var RE_PAGE_DE_GARDE_ANNEXE = /^(annexe|annexes|piece annexee|pieces annexees|document annexe|documents annexes)(\s*(n\s*[°o]?\s*)?\d{0,3}\b.*)?$/;
function pageDeGardeAnnexe(texte) {
  const l = lignesPageDecoupage(texte);
  if (!l.length || l.length > LIGNES_MAX_SEPARATEUR) return false;
  return RE_PAGE_DE_GARDE_ANNEXE.test(normaliserDecoupage(l[0]));
}

function decouperPagesCompromis(pages) {
  const liste = Array.isArray(pages) ? pages : [];
  const seps = [];
  liste.forEach((t, i) => { const s = separateurAnnexeCompromis(t); if (s) seps.push(Object.assign({ index: i }, s)); });
  const tout = liste.map((_, i) => i + 1);
  if (!seps.length) return { separateurs: 0, gardes: [], segments: [{ sorte: 'compromis', numero: 0, libelle: '', fichier: '', pages: tout }] };
  // Fin du document : dernier certificat de signature électronique APRÈS la dernière séparation (il vaut pour tout le document).
  let fin = liste.length;
  for (let i = liste.length - 1; i > seps[seps.length - 1].index; i--) {
    const l = lignesPageDecoupage(liste[i]);
    if (l.length && RE_CERTIFICAT_SIGNATURE.test(normaliserDecoupage(l[0]))) { fin = i; break; }
  }
  const compromis = tout.slice(0, seps[0].index).concat(tout.slice(fin));
  const segments = [{ sorte: 'compromis', numero: 0, libelle: '', fichier: '', pages: compromis }];
  // Pages jamais reprises dans une pièce : les séparations du logiciel de l'agence et les pages de garde en tête d'annexe.
  const gardes = seps.map(s => s.index + 1);
  seps.forEach((s, k) => {
    const jusqua = k + 1 < seps.length ? seps[k + 1].index : fin;
    let debut = s.index + 1;
    while (debut < jusqua - 1 && pageDeGardeAnnexe(liste[debut])) { gardes.push(debut + 1); debut++; }
    const p = tout.slice(debut, jusqua);
    if (p.length) segments.push({ sorte: 'annexe', numero: s.numero, libelle: s.libelle, fichier: s.fichier, pages: p });
  });
  return { separateurs: seps.length, gardes: gardes.sort((a, b) => a - b), segments };
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

// Nom du fichier d'une pièce : « … - annexe du compromis » quand elle vient d'un compromis, le libellé seul pour un document déposé
// à part (DDT, annexes sans compromis). Jamais le nom du fichier déposé dans le logiciel de l'agence (il porte souvent un nom de
// client). Pure.
function nomPieceDecoupage(label, sorte, sansCompromis) {
  if (sorte === 'compromis') return 'Compromis signé (sans les annexes)';
  if (sorte === 'diagnostics') return 'Diagnostics techniques - tous les diagnostics';
  const base = String(label || 'Annexe').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return sansCompromis ? base : `${base} - annexe du compromis`;
}

// Le document lu commence-t-il par un avant-contrat (compromis, promesse) ? Lu sur la première page qui a du texte. Pure.
function documentEstAvantContrat(pages) {
  const premiere = (pages || []).find(t => lignesPageDecoupage(t).length >= 1) || '';
  if (/^(compromis|promesse)/.test(normaliserDecoupage(lignesPageDecoupage(premiere).slice(0, 3).join(' ')))) return true;
  if (typeof typePieceScan === 'function' && typeof enTeteScan === 'function') {
    const ty = typePieceScan(enTeteScan(premiere));
    return !!ty && (ty.cle === 'avantContrat' || ty.cle === 'promesse');
  }
  return false;
}

// Pièces proposées pour un document (étude 31/10 : aussi « diagnostics, annexes sans compromis… ») :
// - pages « Annexe n° » du logiciel de l'agence : découpé à ces pages (le compromis seul, s'il y en a un, puis une pièce par annexe) ;
// - sinon un avant-contrat : proposé entier, rien n'est deviné ;
// - sinon un dossier de diagnostics (au moins deux diagnostics en tête de page) : un PDF par diagnostic et un PDF de tous ;
// - sinon une seule pièce, du type lu sur sa première page (ou sur le nom du fichier). Pure.
// mode : 'compromis' (avec annexes), 'annexes' (annexes sans compromis), 'entier' (avant-contrat sans séparation),
// 'diagnostics', 'document'.
function piecesDecoupageCompromis(pages, options) {
  const nomFichier = String((options && options.nomFichier) || '').replace(/\.pdf$/i, '');
  const dec = decouperPagesCompromis(pages);
  const pieces = [];
  const pagesDiag = [];
  const pagesDiagnostiqueur = [];
  let n = 0;
  const ajouter = (p) => { pieces.push(Object.assign({ id: 'p' + (++n), inclure: true }, p)); };
  let mode = 'compromis';
  let segments = dec.segments;
  if (!dec.separateurs) {
    const seg = { sorte: 'annexe', numero: 0, libelle: '', fichier: nomFichier, pages: dec.segments[0].pages };
    if (documentEstAvantContrat(pages)) mode = 'entier';
    else { segments = [seg]; mode = repartirDiagnosticsAnnexe(seg, pages, '').length > 1 ? 'diagnostics' : 'document'; }
  } else if (!dec.segments[0].pages.length) mode = 'annexes';
  const sansCompromis = mode !== 'compromis' && mode !== 'entier';
  segments.forEach(seg => {
    if (seg.sorte === 'compromis') {
      if (seg.pages.length) ajouter({ sorte: 'compromis', label: 'Compromis signé', nom: nomPieceDecoupage('', 'compromis'), pages: seg.pages, rubriques: ['sru'], diagnostic: '', numero: 0, libelleLu: '' });
      return;
    }
    const premiere = seg.pages.map(p => pages[p - 1]).find(t => lignesPageDecoupage(t).length >= 3) || '';
    const ty = typeAnnexeCompromis(seg.libelle, seg.fichier, premiere);
    // Un bloc qui annonce plusieurs diagnostics en tête de pages est un DDT, quel que soit son libellé (« Attestation de mesurage »
    // de l'agence portait tout le dossier) : redécoupé.
    // Une pièce reconnue autrement (règlement, carnet d'entretien…) n'est jamais redécoupée : ses pages peuvent citer un diagnostic.
    const parties = ty.label && !ty.diagnostic && mode !== 'diagnostics' ? [{ diagnostic: '', pages: seg.pages }] : repartirDiagnosticsAnnexe(seg, pages, ty.diagnostic);
    const estDiag = !!ty.diagnostic || parties.length > 1;
    if (estDiag) {
      parties.forEach(p => {
        pagesDiag.push(...p.pages);
        if (p.diagnostic === 'diagnostiqueur') { pagesDiagnostiqueur.push(...p.pages); return; } // seulement dans le PDF unique
        const d = diagnosticParCle(p.diagnostic) || diagnosticParCle('synthese');
        ajouter({ sorte: 'diagnostic', label: d.label, nom: nomPieceDecoupage(d.label, 'diagnostic', sansCompromis), pages: p.pages, rubriques: d.cle === 'erp' ? ['environnement', 'diagnostics', 'aae'] : ['diagnostics'], diagnostic: d.cle, numero: seg.numero, libelleLu: seg.libelle });
      });
      return;
    }
    let rubriques = ty.rubriques || [];
    if (ty.parPartie) { const c = coteLibelleAnnexe(seg.libelle); rubriques = c ? [c] : []; }
    const label = ty.label || (seg.libelle ? seg.libelle.charAt(0).toUpperCase() + seg.libelle.slice(1) : seg.numero ? `Annexe n°${seg.numero}` : 'Document');
    ajouter({ sorte: 'annexe', label, nom: nomPieceDecoupage(label, 'annexe', sansCompromis), pages: seg.pages, rubriques, diagnostic: '', numero: seg.numero, libelleLu: seg.libelle, reconnu: !!ty.label });
  });
  // Le PDF de tous les diagnostics : seulement s'il y en a plus d'un (un diagnostic seul est déjà son PDF).
  if (pagesDiag.length && pieces.filter(p => p.sorte === 'diagnostic').length + (pagesDiagnostiqueur.length ? 1 : 0) > 1) {
    ajouter({ sorte: 'diagnostics', label: 'Diagnostics techniques', nom: nomPieceDecoupage('', 'diagnostics'), pages: pagesDiag, rubriques: ['diagnostics'], diagnostic: '', numero: 0, libelleLu: '', pagesDiagnostiqueur });
  }
  return { separateurs: dec.separateurs, gardes: dec.gardes, mode, pieces };
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

// Ajoute ou retire une page d'une pièce (correction d'un clic sur l'aperçu) ; jamais une pièce vide. Pure.
function basculerPageDecoupage(pages, n) {
  const l = (pages || []).slice();
  if (!Number.isInteger(n) || n < 1) return l;
  const i = l.indexOf(n);
  if (i >= 0) { if (l.length === 1) return l; l.splice(i, 1); } else l.push(n);
  return l.sort((a, b) => a - b);
}

// Coupe une pièce à la page n (deux annexes réunies par erreur) : [pages avant n, pages à partir de n] ; null si n est sa première
// page ou n'en fait pas partie. Pure.
function scinderPagesDecoupage(pages, n) {
  if (!Number.isInteger(n)) return null;
  const l = (pages || []).slice().sort((a, b) => a - b);
  if (!l.includes(n) || l[0] === n) return null;
  return [l.filter(p => p < n), l.filter(p => p >= n)];
}

// Pages montrées en vignettes pour une pièce : les siennes, et la page juste avant et juste après (grisées) pour vérifier la coupe
// d'un coup d'œil. Pure.
function vignettesPieceDecoupage(pages, total) {
  const l = (pages || []).slice().sort((a, b) => a - b);
  if (!l.length) return [];
  const sortie = [];
  const avant = l[0] - 1; const apres = l[l.length - 1] + 1;
  if (avant >= 1) sortie.push({ page: avant, dedans: false });
  l.forEach(p => sortie.push({ page: p, dedans: true }));
  if (apres <= total) sortie.push({ page: apres, dedans: false });
  return sortie;
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

// choisie = pièce montrée dans l'aperçu, pageVue = page affichée en grand, rotations = { page: quart de tour en degrés }.
var dcEtat = { dossierId: '', source: null, pages: [], pieces: [], separateurs: 0, lecture: '', message: '', range: false, jeton: 0, choisie: '', pageVue: 0, gardes: [], rotations: {}, loupe: false };
var dcNumeroPieceAjoutee = 0;

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
  dcFermerApercu(dcEtat.source);
  dcEtat = { dossierId: '', source: null, pages: [], pieces: [], separateurs: 0, lecture: '', message: '', range: false, jeton: dcEtat.jeton + 1, choisie: '', pageVue: 0, gardes: [], rotations: {}, loupe: false };
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
async function dcLire(fichier, nom, jeton, depose) {
  if (typeof pdfjsLib === 'undefined') throw new Error('lecteur PDF indisponible');
  const octets = new Uint8Array(await fichier.arrayBuffer());
  dcEtat.lecture = 'lecture';
  dcEtat.message = 'Lecture du document…';
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
  const r = piecesDecoupageCompromis(pages, { nomFichier: nom || fichier.name || '' });
  dcFermerApercu(dcEtat.source);
  dcEtat.source = { nom: nom || fichier.name || 'compromis.pdf', octets, images: new Map(), faites: new Map(), depose: !!depose };
  dcEtat.pages = pages;
  dcEtat.pieces = r.pieces.map(p => Object.assign({ saisie: saisieDepuisPagesDecoupage(p.pages), rubrique: (p.rubriques || [])[0] || '', rangee: '' }, p));
  dcEtat.separateurs = r.separateurs;
  dcEtat.gardes = r.gardes || [];
  dcEtat.rotations = {};
  dcEtat.mode = r.mode;
  dcEtat.choisie = dcEtat.pieces[0] ? dcEtat.pieces[0].id : '';
  dcEtat.pageVue = dcEtat.pieces[0] ? dcEtat.pieces[0].pages[0] : 0;
  dcEtat.lecture = 'lu';
  dcEtat.message = messageLectureDecoupage(r, pages.length);
  renderDecoupage();
}

// Ce que CLAIRE a compris du document, en une phrase. Pure.
function messageLectureDecoupage(r, total) {
  const n = r.pieces.length;
  if (r.mode === 'compromis') return `${total} pages · ${r.separateurs} annexe(s) repérée(s) par leurs pages de séparation.`;
  if (r.mode === 'annexes') return `${total} pages · annexes sans compromis : ${r.separateurs} annexe(s) repérée(s) par leurs pages de séparation.`;
  if (r.mode === 'diagnostics') return `${total} pages · dossier de diagnostics : ${n} pièce(s), un PDF par diagnostic et un PDF de tous.`;
  if (r.mode === 'document') return `${total} pages · une seule pièce reconnue : coupez-la ou ajoutez des pièces si le document en réunit plusieurs.`;
  return `${total} pages · aucune page « Annexe n° » : CLAIRE ne devine rien, le document entier est proposé. Coupez-le ou ajoutez des pièces à la main.`;
}

async function dcDeposerFichier(input) {
  const f = input && input.files && input.files[0];
  if (input) input.value = '';
  dcLireDepose(f);
}

// Un PDF glissé sur la zone de dépôt de l'accueil.
function dcDeposerGlisse(ev, zone) {
  ev.preventDefault();
  if (zone) zone.classList.remove('survol');
  const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
  dcLireDepose(f);
}

// Un PDF déposé à la main (accueil ou « Autre PDF ») : sans vente choisie, les pièces se téléchargent ; la vente se choisit pour ranger.
function dcLireDepose(f) {
  if (!f) return;
  if (dcEtat.range) { afficherToast('Rangement en cours : attendez qu’il soit fini.', 'OK', null); return; }
  if (dcCorrectionsNonRangees()) { demanderConfirmation('Ouvrir ce document ? Les corrections faites à la main sur le découpage ouvert, pas encore rangées, seront perdues.', () => dcLireDeposeConfirme(f)); return; }
  dcLireDeposeConfirme(f);
}

async function dcLireDeposeConfirme(f) {
  if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { afficherToast('Choisissez un PDF.', 'OK', null); return; }
  const jeton = ++dcEtat.jeton;
  try { await dcLire(f, f.name, jeton, true); } catch (e) {
    if (jeton !== dcEtat.jeton) return;
    dcEtat.lecture = 'erreur';
    dcEtat.message = 'PDF illisible : ' + (e && e.message ? e.message : 'erreur');
    renderDecoupage();
  }
}

function dcCorrectionsNonRangees() { return dcEtat.pieces.some(p => p.modifiee && !p.rangee && p.inclure); }

// Retour à l'accueil de l'outil (dépôt d'un PDF, ventes proposées).
function dcAccueil() {
  if (dcEtat.range) { afficherToast('Rangement en cours : attendez qu’il soit fini.', 'OK', null); return; }
  if (dcCorrectionsNonRangees()) demanderConfirmation('Revenir à l’accueil ? Les corrections faites à la main, pas encore rangées, seront perdues.', () => dcChoisirDossier(''));
  else dcChoisirDossier('');
}

// Vente où ranger un PDF déposé à la main : le découpage est gardé, les pièces redeviennent « à ranger » dans cette vente.
function dcRattacher(id) {
  if (dcEtat.range) { afficherToast('Rangement en cours : attendez qu’il soit fini.', 'OK', null); renderDecoupage(); return; }
  const d = dossiers.find(x => x && x.id === id);
  dcEtat.dossierId = decoupagePossible(d) ? d.id : '';
  dcEtat.pieces.forEach(p => { p.rangee = ''; });
  dcEtat.jeton++;
  renderDecoupage();
}

function dcOuvrir(id) {
  if (dcEtat.range) { afficherToast('Rangement en cours : attendez qu’il soit fini.', 'OK', null); return; }
  if (dcEtat.dossierId !== id && dcCorrectionsNonRangees()) {
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

// Pendant un rangement, rien ne se corrige : la pièce en cours d'envoi serait marquée rangée avec ses anciennes pages.
function dcRangementEnCours() {
  if (!dcEtat.range) return false;
  afficherToast('Rangement en cours : corrigez une fois qu’il est fini.', 'OK', null);
  return true;
}

function dcChanger(id, champ, valeur) {
  const p = dcPiece(id);
  if (!p) return;
  if (dcRangementEnCours()) { renderDecoupage(); return; }
  if (champ === 'pages') {
    const lu = dcSansPagesDeGarde(pagesDepuisSaisieDecoupage(valeur, dcEtat.pages.length));
    if (!lu) { afficherToast(`Pages illisibles : écrivez par exemple « 3-7, 9 » (1 à ${dcEtat.pages.length}).`, 'OK', null); renderDecoupage(); return; }
    dcPoserPages(p, lu);
    renderDecoupage();
    return;
  }
  p.modifiee = true;
  if (champ === 'inclure') p.inclure = !!valeur;
  else if (champ === 'nom') p.nom = String(valeur || '').slice(0, 120);
  else if (champ === 'rubrique') { p.rubrique = String(valeur || ''); p.rubriques = p.rubrique ? [p.rubrique] : []; }
  // Une pièce déjà rangée ne redevient « à ranger » que si ce qu'elle contient ou son nom change (relecture 0.411.0 : copie « (2) »).
  if (champ !== 'inclure') p.rangee = '';
  if (p.sorte === 'diagnostic' && champ === 'inclure') dcRecalculerTousDiagnostics();
  if (champ !== 'nom') renderDecoupage();
}

// Une page de garde n'entre jamais dans une pièce, même saisie à la main ; null s'il ne reste rien.
function dcSansPagesDeGarde(pages) {
  if (!pages) return null;
  const l = pages.filter(n => !dcEtat.gardes.includes(n));
  if (l.length < pages.length) afficherToast('Les pages de garde des annexes ne sont jamais reprises : retirées de la pièce.', 'OK', null);
  return l.length ? l : null;
}

// Pages d'une pièce changées (saisie, vignette, coupe) : elle redevient « à ranger », le PDF de tous les diagnostics suit.
function dcPoserPages(p, pages) {
  p.modifiee = true;
  p.pages = pages;
  p.saisie = saisieDepuisPagesDecoupage(pages);
  p.rangee = '';
  if (p.sorte === 'diagnostic') dcRecalculerTousDiagnostics();
}

function dcRecalculerTousDiagnostics() {
  const unique = dcEtat.pieces.find(x => x.sorte === 'diagnostics');
  if (unique && !unique.modifiee) { unique.pages = pagesTousDiagnostics(dcEtat.pieces); unique.saisie = saisieDepuisPagesDecoupage(unique.pages); unique.rangee = ''; }
}

// Aperçu : choisir la pièce montrée à droite, la page affichée en grand.
function dcChoisirPiece(id) {
  const p = dcPiece(id);
  if (!p) return;
  dcEtat.choisie = p.id;
  dcEtat.pageVue = p.pages[0] || 0;
  renderDecoupage();
  dcMontrerPageVue();
}

// La page sélectionnée est montrée (étude 31/10 : « et voir la page sélectionnée ») : en grand, entière à l'écran, sa vignette
// marquée ; un clic sur la page en grand l'ouvre en plein écran (loupe).
function dcVoirPage(n) {
  if (!(n >= 1 && n <= dcEtat.pages.length)) return;
  dcEtat.pageVue = n;
  renderDecoupage();
  dcMontrerPageVue();
}

// Fait défiler la fenêtre juste ce qu'il faut pour voir la page en grand entière (rien si elle l'est déjà, ni en plein écran).
function dcMontrerPageVue() {
  if (dcEtat.loupe) return;
  const el = document.querySelector('#dc-carte .dc-grande-page');
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// Pages que ‹ › parcourent : celles des vignettes (la pièce, encadrée de la page d'avant et de celle d'après).
function dcPagesParcourues() {
  const p = dcPiece(dcEtat.choisie);
  return p && p.pages.length ? vignettesPieceDecoupage(p.pages, dcEtat.pages.length).map(v => v.page) : [];
}

// Page suivante ou précédente (‹ ›, flèches du clavier).
function dcPageVoisine(sens) {
  const l = dcPagesParcourues();
  if (!l.length) return;
  const i = l.indexOf(dcEtat.pageVue);
  const j = i < 0 ? 0 : Math.min(l.length - 1, Math.max(0, i + sens));
  if (l[j] !== dcEtat.pageVue) dcVoirPage(l[j]);
}

function dcOuvrirLoupe() { if (dcEtat.pageVue) { dcEtat.loupe = true; renderDecoupage(); } }
function dcFermerLoupe() { if (dcEtat.loupe) { dcEtat.loupe = false; renderDecoupage(); } }

// Clavier sur l'écran de l'outil, hors d'un champ : ← → changent de page, Échap ferme le plein écran.
document.addEventListener('keydown', ev => {
  if (typeof ecranAffiche !== 'function' || !ecranAffiche('decoupage') || !dcEtat.source) return;
  const cible = ev.target;
  if (cible && (/^(input|select|textarea)$/i.test(cible.tagName || '') || cible.isContentEditable)) return;
  if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
  if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { ev.preventDefault(); dcPageVoisine(-1); }
  else if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') { ev.preventDefault(); dcPageVoisine(1); }
  else if (ev.key === 'Escape' && dcEtat.loupe) { ev.preventDefault(); dcFermerLoupe(); }
});

// Correction d'un clic : une page de la pièce retirée, ou la page voisine (grisée) ajoutée.
function dcBasculerPage(id, n) {
  const p = dcPiece(id);
  if (!p || !(Number.isInteger(n) && n >= 1 && n <= dcEtat.pages.length) || dcRangementEnCours()) return;
  if (dcEtat.gardes.includes(n)) { afficherToast('C’est une page de garde : elle n’est jamais reprise dans une pièce.', 'OK', null); return; }
  if (p.pages.length === 1 && p.pages[0] === n) { afficherToast('Une pièce garde au moins une page : décochez-la plutôt pour ne pas la ranger.', 'OK', null); return; }
  dcPoserPages(p, basculerPageDecoupage(p.pages, n));
  renderDecoupage();
}

// Deux annexes réunies par erreur : la pièce choisie est coupée à la page affichée, la suite devient une nouvelle pièce à nommer.
function dcScinder(id, n) {
  const p = dcPiece(id);
  const coupe = p && scinderPagesDecoupage(p.pages, n);
  if (!coupe || dcRangementEnCours()) return;
  dcPoserPages(p, coupe[0]);
  const nouvelle = dcNouvellePiece(coupe[1], p);
  dcEtat.pieces.splice(dcEtat.pieces.indexOf(p) + 1, 0, nouvelle);
  if (nouvelle.sorte === 'diagnostic') dcRecalculerTousDiagnostics();
  dcEtat.choisie = nouvelle.id;
  dcEtat.pageVue = coupe[1][0];
  renderDecoupage();
  const champ = document.getElementById('dc-detail-nom');
  if (champ) { champ.focus(); champ.select(); }
}

// Une annexe que CLAIRE n'a pas repérée (pas de page « Annexe n° ») : nouvelle pièce sur la page affichée, pages à corriger ensuite.
function dcAjouterPiece() {
  if (!dcEtat.pages.length || dcRangementEnCours()) return;
  let depart = dcEtat.pageVue || 1;
  while (dcEtat.gardes.includes(depart) && depart < dcEtat.pages.length) depart++;
  const nouvelle = dcNouvellePiece([depart], null);
  dcEtat.pieces.push(nouvelle);
  dcEtat.choisie = nouvelle.id;
  renderDecoupage();
  const champ = document.getElementById('dc-detail-nom');
  if (champ) { champ.focus(); champ.select(); }
}

// Coupée d'un diagnostic, la suite reste un diagnostic (elle reste dans le PDF de tous les diagnostics) et garde sa rubrique.
function dcNouvellePiece(pages, parent) {
  dcNumeroPieceAjoutee++;
  const rubrique = parent ? parent.rubrique : '';
  return { id: 'ajoutee-' + dcNumeroPieceAjoutee, sorte: parent && parent.sorte === 'diagnostic' ? 'diagnostic' : 'annexe', ajoutee: true, label: 'Pièce ajoutée', nom: 'Annexe du compromis', libelleLu: '', numero: null,
    reconnu: true, inclure: true, modifiee: true, rangee: '', pages, saisie: saisieDepuisPagesDecoupage(pages), rubrique: rubrique || '', rubriques: rubrique ? [rubrique] : [] };
}

// Seule une pièce ajoutée à la main se retire (les autres se décochent).
function dcRetirerPiece(id) {
  const i = dcEtat.pieces.findIndex(x => x.id === id && x.ajoutee);
  if (i < 0 || dcRangementEnCours()) return;
  const etaitDiagnostic = dcEtat.pieces[i].sorte === 'diagnostic';
  dcEtat.pieces.splice(i, 1);
  if (etaitDiagnostic) dcRecalculerTousDiagnostics();
  const suivante = dcEtat.pieces[Math.min(i, dcEtat.pieces.length - 1)];
  dcEtat.choisie = suivante ? suivante.id : '';
  dcEtat.pageVue = suivante ? suivante.pages[0] : 0;
  renderDecoupage();
}

// Tourner une ou plusieurs pages d'un quart de tour (étude 31/10 : « retourner une page ou une annexe découpée »). La rotation suit
// la page dans toutes les pièces qui la contiennent (le PDF de tous les diagnostics compris) ; elles redeviennent « à ranger ».
function dcTourner(numeros, quart) {
  if (dcRangementEnCours()) return;
  const l = (numeros || []).filter(n => Number.isInteger(n) && n >= 1 && n <= dcEtat.pages.length && !dcEtat.gardes.includes(n));
  if (!l.length) return;
  l.forEach(n => { dcEtat.rotations[n] = (((dcEtat.rotations[n] || 0) + (quart || 90)) % 360 + 360) % 360; if (!dcEtat.rotations[n]) delete dcEtat.rotations[n]; });
  dcEtat.pieces.forEach(p => { if (p.pages.some(n => l.includes(n))) { p.rangee = ''; p.modifiee = true; } });
  renderDecoupage();
}

function dcTournerPiece(id) {
  const p = dcPiece(id);
  if (p) dcTourner(p.pages.slice());
}

// Images des pages pour l'aperçu : le compromis ouvert une fois par pdf.js (fermé au changement de dossier), chaque page dessinée
// à la demande puis gardée. Rendu en « print » : en « display », pdf.js attend l'image suivante de l'écran, arrêtée fenêtre cachée.
var DC_LARGEUR_VIGNETTE = 160;
var DC_LARGEUR_GRANDE = 900;
var DC_LARGEUR_LOUPE = 1600;

function dcFermerApercu(source) {
  if (!source) return;
  if (source.pdfjs) { const doc = source.pdfjs; source.pdfjs = null; doc.then(pdf => { try { pdf.destroy(); } catch (_) { /* déjà fermé */ } }).catch(() => { /* rien */ }); }
  if (source.images) source.images.clear();
  if (source.faites) source.faites.clear();
}

function dcImagePage(source, n, largeur, rot) {
  const cle = `${largeur}:${n}:${rot || 0}`;
  if (source.images.has(cle)) return source.images.get(cle);
  if (!source.pdfjs) source.pdfjs = pdfjsLib.getDocument({ isEvalSupported: false, data: source.octets.slice() }).promise;
  const promesse = source.pdfjs.then(async pdf => {
    const page = await pdf.getPage(n);
    const rotation = ((page.rotate || 0) + (rot || 0)) % 360;
    const base = page.getViewport({ scale: 1, rotation });
    const vue = page.getViewport({ scale: largeur / base.width, rotation });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vue.width); canvas.height = Math.round(vue.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vue, intent: 'print' }).promise;
    page.cleanup();
    const url = canvas.toDataURL('image/jpeg', 0.82);
    source.faites.set(cle, url);
    return url;
  });
  promesse.catch(() => source.images.delete(cle));
  source.images.set(cle, promesse);
  return promesse;
}

function dcPrioriteImage(img) { return img.classList.contains('dc-image-loupe') ? 2 : img.classList.contains('dc-image-grande') ? 1 : 0; }

// Remplit les images encore vides de l'écran, une à la fois (la grande d'abord), tant que l'écran n'a pas changé de document.
async function dcRemplirImages() {
  const source = dcEtat.source;
  if (!source || typeof pdfjsLib === 'undefined') return;
  const carte = document.getElementById('dc-carte');
  if (!carte) return;
  const vides = Array.from(carte.querySelectorAll('img[data-dc-page]:not([src])')).sort((a, b) => dcPrioriteImage(b) - dcPrioriteImage(a));
  for (const img of vides) {
    if (!img.isConnected) continue;
    const n = Number(img.dataset.dcPage); const largeur = Number(img.dataset.dcLargeur); const rot = Number(img.dataset.dcRot) || 0;
    try {
      const url = await dcImagePage(source, n, largeur, rot);
      if (source !== dcEtat.source) return;
      // L'écran a pu être redessiné pendant le dessin : l'image est cherchée à nouveau.
      carte.querySelectorAll(`img[data-dc-page="${n}"][data-dc-largeur="${largeur}"][data-dc-rot="${rot}"]:not([src])`).forEach(x => { x.src = url; });
    } catch (_) {
      if (source !== dcEtat.source) return;
      img.alt = `Page ${n} illisible`; img.classList.add('dc-image-erreur'); img.removeAttribute('data-dc-page');
    }
  }
}

function dcBaliseImage(n, largeur, classe) {
  const source = dcEtat.source;
  const rot = dcEtat.rotations[n] || 0;
  const cle = `${largeur}:${n}:${rot}`;
  // Une image déjà dessinée revient tout de suite (la promesse résolue garde son URL dans `fait`).
  const fait = source && source.faites && source.faites.get(cle);
  return `<img class="${classe}" alt="Page ${n}" data-dc-page="${n}" data-dc-largeur="${largeur}" data-dc-rot="${rot}"${fait ? ` src="${escapeAttr(fait)}"` : ''}>`;
}

// Date du dernier découpage rangé pour un dossier (historique « Compromis découpé… » / « Document découpé… »), '' sinon. Pure.
function dateDecoupageDossier(d) {
  const l = ((d && d.historique) || []).filter(h => h && /^(Compromis|Document) découpé/.test(String(h.texte || '')));
  return l.length ? String(l[l.length - 1].date || '') : '';
}

// Accueil (étude 31/10 : « une page d'accueil pour uploader le PDF à découper ou proposer des dossiers ») : ventes dont le compromis
// signé est retrouvé sur le NAS et pas encore découpé, puis celles déjà découpées ; une recherche montre toutes les ventes.
function dcCartesAccueil(q) {
  const actifs = dcDossiersVente();
  const carte = (x, sous, icon) => `<button type="button" class="cst-accueil-carte" onclick="dcOuvrir('${escapeOnclickArg(x.id)}')">
      <span class="cst-accueil-carte-icone" aria-hidden="true">${icone(icon)}</span>
      <span class="cst-accueil-carte-texte"><span class="cst-accueil-carte-titre">${escapeHtml(libelleDossierAffiche(x))}</span>
      <span class="cst-accueil-carte-sous">${escapeHtml(sous)}</span></span></button>`;
  const groupe = (titre, icon, cartes) => cartes ? `<div class="cst-accueil-liste-titre"><span class="pieces-titre">${icone(icon)}<span class="pieces-titre-texte">${titre}</span></span></div><div class="cst-accueil-grille">${cartes}</div>` : '';
  if (q) {
    const l = actifs.filter(x => normaliserPourRecherche(libelleDossierAffiche(x)).includes(q) || normaliserPourRecherche(x.responsable || '').includes(q)).slice(0, 12);
    return groupe('Résultats', 'search', l.map(x => carte(x, ['Vente', x.nasDossier ? 'relié au NAS' : 'non relié au NAS', x.responsable].filter(Boolean).join(' · '), 'home')).join(''))
      || '<div class="dash-recherche-vide">Aucune vente ne correspond.</div>';
  }
  const avecCompromis = actifs.filter(x => x.nasDossier && typeof fichierTrouve === 'function' && fichierTrouve(x, NAS_CLE_COMPROMIS));
  const aDecouper = avecCompromis.filter(x => !dateDecoupageDossier(x)).slice(0, 12);
  const decoupes = actifs.filter(x => dateDecoupageDossier(x)).sort((a, b) => dateDecoupageDossier(b).localeCompare(dateDecoupageDossier(a))).slice(0, 6);
  const html = groupe('Compromis à découper', 'ciseaux', aDecouper.map(x => carte(x, ['Compromis signé trouvé sur le NAS', x.responsable].filter(Boolean).join(' · '), 'file-text')).join(''))
    + groupe('Déjà découpés', 'check', decoupes.map(x => carte(x, `Découpé le ${formatDateFr(dateDecoupageDossier(x).slice(0, 10))}`, 'folder')).join(''));
  return html || '<div class="dash-recherche-vide">Aucun compromis signé à découper sur le NAS : déposez un PDF ou cherchez une vente.</div>';
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

var TYPES_DOCUMENTS_DECOUPAGE = 'compromis signé avec ses annexes, dossier de diagnostics, annexes seules, tout PDF à mettre en pièces';

function dcRendreCorps() {
  const carte = document.getElementById('dc-carte');
  if (!carte) return;
  const d = dcDossier();
  const entete = `<div class="dash-header"><div><div class="dash-eyebrow">Vente</div><div class="dash-titre-ligne"><h1 class="dash-titre">Découper le compromis</h1>${infoBulle('Le compromis signé de l’agence arrive avec ses annexes à la suite : CLAIRE le découpe aux pages « Annexe n° » du logiciel de l’agence, nomme chaque pièce et la range dans la rubrique de sa thématique. Diagnostics : un PDF par diagnostic et un PDF de tous les diagnostics. Un dossier de diagnostics ou des annexes seules se découpent de la même façon. Chaque pièce est une copie, l’original reste tel quel.')}</div></div></div>`;
  const fichier = (id) => `<input type="file" id="${id}" accept="application/pdf,.pdf" class="dc-fichier" onchange="dcDeposerFichier(this)">`;
  if (!d && !dcEtat.source && dcEtat.lecture !== 'lecture') {
    carte.innerHTML = `${entete}<div class="dc-accueil">
      <label class="dc-depot" ondragover="event.preventDefault(); this.classList.add('survol')" ondragleave="this.classList.remove('survol')" ondrop="dcDeposerGlisse(event, this)">
        ${fichier('dc-fichier-accueil')}
        <span class="dc-depot-icone" aria-hidden="true">${icone('upload')}</span>
        <span class="dc-depot-titre">Déposez un PDF à découper</span>
        <span class="dc-depot-sous">${escapeHtml(TYPES_DOCUMENTS_DECOUPAGE[0].toUpperCase() + TYPES_DOCUMENTS_DECOUPAGE.slice(1))}</span>
        <wa-button appearance="outlined" size="s" type="button" onclick="event.preventDefault(); document.getElementById('dc-fichier-accueil').click()">${icone('upload')}Choisir un PDF</wa-button>
      </label>
      ${dcEtat.message ? `<p class="hint">${escapeHtml(dcEtat.message)}</p>` : ''}
      <div class="dc-accueil-dossiers">
        <div class="cst-accueil-recherche dc-accueil-recherche"><input type="search" id="dc-recherche" class="nas-choix-recherche" autocomplete="off" placeholder="Ou cherchez une vente : son compromis est lu sur le NAS" aria-label="Rechercher une vente" oninput="dcRechercher(this.value)"></div>
        <div id="dc-cartes">${dcCartesAccueil('')}</div>
      </div>
    </div>`;
    return;
  }
  const aRanger = dcEtat.pieces.filter(p => p.inclure && !p.rangee && p.pages.length).length;
  const aVerifier = dcEtat.pieces.filter(p => p.reconnu === false).length;
  const rangees = dcEtat.pieces.filter(p => p.rangee).length;
  // Un PDF déposé se range dans la vente choisie ici ; un compromis lu sur le NAS reste à son dossier.
  const choixDossier = dcEtat.source && dcEtat.source.depose
    ? `<select id="dc-dossier" class="dc-dossier-choix" aria-label="Vente où ranger les pièces" onchange="dcRattacher(this.value)"><option value="">Vente où ranger…</option>${dcDossiersVente().map(x => `<option value="${escapeAttr(x.id)}"${d && x.id === d.id ? ' selected' : ''}>${escapeHtml(libelleDossierAffiche(x))}</option>`).join('')}</select>`
    : `<span class="cst-dossier-titre">${escapeHtml(d ? libelleDossierAffiche(d) : '')}</span>`;
  const titreRanger = !d ? 'Choisissez la vente où ranger les pièces' : !d.nasDossier ? 'Dossier non relié au NAS' : '';
  const barre = `<div class="cst-barre">
        <wa-button appearance="outlined" size="s" type="button" onclick="dcAccueil()" title="Revenir à l’accueil de l’outil">${icone('chevron-left')}Accueil</wa-button>
        ${choixDossier}
        <label class="dc-choisir">${fichier('dc-fichier-barre')}<wa-button appearance="outlined" size="s" type="button" onclick="document.getElementById('dc-fichier-barre').click()">${icone('upload')}Autre PDF</wa-button></label>
        <span class="aut-barre-actions">
          <wa-button variant="brand" size="s" type="button"${d && d.nasDossier && aRanger ? '' : ' disabled'}${dcEtat.range ? ' loading' : ''} title="${titreRanger}" onclick="rangerDecoupage()">${icone('folder')}Ranger dans le dossier${aRanger ? ` (${aRanger})` : ''}</wa-button>
        </span>
      </div>`;
  const message = dcEtat.message ? `<p class="hint">${dcEtat.lecture === 'lecture' ? icone('spinner', null, true) + ' ' : ''}${escapeHtml(dcEtat.message)}${dcEtat.source ? ` — « ${escapeHtml(dcEtat.source.nom)} »` : ''}</p>` : '';
  if (!dcEtat.pieces.length) { carte.innerHTML = `${entete}<div class="cst-corps">${barre}${message}</div>`; return; }
  const resume = [`${dcEtat.pieces.length} pièce(s)`, aVerifier ? `<span class="dc-a-verifier">${aVerifier} à vérifier</span>` : '', rangees ? `${rangees} rangée(s)` : ''].filter(Boolean).join(' · ');
  const liste = dcEtat.pieces.map(p => {
    const ida = escapeAttr(p.id); const ido = escapeOnclickArg(p.id);
    const sous = [libelleSortePieceDecoupage(p), `p. ${p.saisie}`, libelleRubriqueDecoupage(p.rubrique)].join(' · ');
    return `<div class="dc-piece${p.id === dcEtat.choisie ? ' actif' : ''}${p.inclure ? '' : ' dc-exclue'}">
        <input type="checkbox" id="dc-i-${ida}"${p.inclure ? ' checked' : ''} aria-label="Ranger cette pièce" onchange="dcChanger('${ido}', 'inclure', this.checked)">
        <button type="button" class="dc-piece-corps" onclick="dcChoisirPiece('${ido}')">
          <span class="dc-piece-icone dc-sorte-${escapeAttr(p.sorte)}" aria-hidden="true">${icone(ICONES_SORTES_DECOUPAGE[p.sorte] || 'file-text')}</span>
          <span class="dc-piece-texte"><span class="dc-piece-nom">${escapeHtml(p.nom)}</span><span class="dc-piece-sous">${escapeHtml(sous)}</span></span>
          ${p.rangee ? `<span class="dc-piece-etat dc-rangee" title="${escapeAttr('Rangée : ' + p.rangee)}">${icone('check')}</span>` : p.reconnu === false ? '<span class="dc-piece-etat dc-verifier">À vérifier</span>' : ''}
        </button>
      </div>`;
  }).join('');
  carte.innerHTML = `${entete}
    <div class="cst-corps">
      ${barre}
      ${message}
      <div class="dc-mise-en-page">
        <div class="dc-gauche">
          <div class="cst-bloc-titre">Pièces <span class="dc-resume">${resume}</span></div>
          <div class="dc-liste">${liste}</div>
          <wa-button appearance="outlined" class="bouton-ajout" type="button" onclick="dcAjouterPiece()" title="Une annexe que CLAIRE n’a pas repérée : elle part de la page affichée"><span slot="start" class="bouton-ajout-plus">+</span>Ajouter une pièce</wa-button>
        </div>
        ${dcDetailPiece()}
      </div>
    </div>${dcLoupe()}`;
  // La colonne des vignettes défile seule jusqu'à la page affichée (jamais la page entière).
  const active = carte.querySelector('.dc-vignette.actif');
  if (active) {
    const bande = active.parentElement;
    bande.scrollTop = Math.max(0, active.offsetTop - bande.offsetTop - (bande.clientHeight - active.clientHeight) / 2);
    bande.scrollLeft = Math.max(0, active.offsetLeft - bande.offsetLeft - (bande.clientWidth - active.clientWidth) / 2);
  }
  dcRemplirImages();
}

// Plein écran de la page sélectionnée : ‹ › (et les flèches) parcourent la pièce, ↻ la tourne, Échap ou × ferme.
function dcLoupe() {
  const p = dcPiece(dcEtat.choisie);
  const n = dcEtat.pageVue;
  if (!dcEtat.loupe || !p || !n) return '';
  const l = dcPagesParcourues();
  const i = l.indexOf(n);
  const garde = dcEtat.gardes.includes(n);
  return `<div class="dc-loupe" role="dialog" aria-label="Page ${n} en plein écran" onclick="if (event.target === this) dcFermerLoupe()">
      <div class="dc-loupe-barre">
        <span class="dc-loupe-titre">${escapeHtml(p.nom)} · page ${n} / ${dcEtat.pages.length}${p.pages.includes(n) ? '' : garde ? ' · page de garde, jamais reprise' : ' · hors de cette pièce'}</span>
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" aria-label="Page précédente"${i > 0 ? '' : ' disabled'} onclick="dcPageVoisine(-1)">${icone('chevron-left')}</wa-button>
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" aria-label="Page suivante"${i >= 0 && i < l.length - 1 ? '' : ' disabled'} onclick="dcPageVoisine(1)">${icone('chevron-right')}</wa-button>
        ${garde ? '' : `<wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Tourner cette page" aria-label="Tourner cette page" onclick="dcTourner([${n}])">${icone('rotate-cw')}</wa-button>`}
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Fermer (Échap)" aria-label="Fermer le plein écran" onclick="dcFermerLoupe()">${icone('x')}</wa-button>
      </div>
      <div class="dc-loupe-page">${dcBaliseImage(n, DC_LARGEUR_LOUPE, 'dc-image-loupe')}</div>
    </div>`;
}

var ICONES_SORTES_DECOUPAGE = { compromis: 'file-text', annexe: 'paperclip', diagnostic: 'shield', diagnostics: 'list-check' };

function libelleSortePieceDecoupage(p) {
  if (p.ajoutee) return 'Ajoutée à la main';
  if (p.sorte === 'compromis') return 'Compromis';
  if (p.sorte === 'diagnostics') return 'Tous les diagnostics';
  if (p.sorte === 'diagnostic') return p.numero ? `Diagnostic · annexe n°${p.numero}` : 'Diagnostic';
  return p.numero ? `Annexe n°${p.numero}` : 'Document';
}

// Au centre, la pièce choisie (nom, pages, rubrique) et la page affichée en grand ; à droite, la colonne des vignettes de ses pages
// les unes sous les autres (étude 31/10), encadrées de la page d'avant et de celle d'après pour voir si la coupe est juste.
function dcDetailPiece() {
  const p = dcPiece(dcEtat.choisie);
  if (!p) return '<div class="dc-centre"><p class="hint">Choisissez une pièce à gauche pour voir ses pages.</p></div>';
  if (!p.pages.length) return `<div class="dc-centre"><p class="hint">« ${escapeHtml(p.nom)} » n’a plus aucune page (tous les diagnostics sont décochés) : elle ne sera pas rangée.</p></div>`;
  const ido = escapeOnclickArg(p.id);
  const total = dcEtat.pages.length;
  const options = RUBRIQUES_DECOUPAGE.map(([cle, lib]) => `<option value="${escapeAttr(cle)}"${cle === p.rubrique ? ' selected' : ''}>${escapeHtml(lib)}</option>`).join('');
  const n = p.pages.includes(dcEtat.pageVue) || vignettesPieceDecoupage(p.pages, total).some(v => v.page === dcEtat.pageVue) ? dcEtat.pageVue : p.pages[0];
  const dedans = p.pages.includes(n);
  const rang = p.pages.indexOf(n);
  const parcourues = vignettesPieceDecoupage(p.pages, total).map(v => v.page);
  const iVue = parcourues.indexOf(n);
  const peutCouper = !!scinderPagesDecoupage(p.pages, n);
  const garde = (x) => dcEtat.gardes.includes(x);
  const vignettes = vignettesPieceDecoupage(p.pages, total).map(v => `<div class="dc-vignette${v.dedans ? '' : ' dc-hors'}${v.page === n ? ' actif' : ''}">
      <button type="button" class="dc-vignette-image" onclick="dcVoirPage(${v.page})" title="Voir la page ${v.page} en grand">${dcBaliseImage(v.page, DC_LARGEUR_VIGNETTE, 'dc-image')}</button>
      <span class="dc-vignette-pied"><span>${garde(v.page) ? 'garde' : `p. ${v.page}`}${v.page === n ? ' · affichée' : ''}</span>
        ${garde(v.page) ? '' : `<button type="button" class="dc-vignette-geste" onclick="dcTourner([${v.page}])" title="Tourner cette page d’un quart de tour" aria-label="Tourner la page ${v.page}">${icone('rotate-cw')}</button><button type="button" class="dc-vignette-geste" onclick="dcBasculerPage('${ido}', ${v.page})" title="${v.dedans ? 'Retirer cette page de la pièce' : 'Ajouter cette page à la pièce'}" aria-label="${v.dedans ? 'Retirer' : 'Ajouter'} la page ${v.page}">${icone(v.dedans ? 'x' : 'plus')}</button>`}</span>
    </div>`).join('');
  return `<div class="dc-centre">
      <div class="dc-detail-tete">
        <span class="dc-piece-icone dc-sorte-${escapeAttr(p.sorte)}" aria-hidden="true">${icone(ICONES_SORTES_DECOUPAGE[p.sorte] || 'file-text')}</span>
        <div class="dc-detail-titre">
          <input type="text" id="dc-detail-nom" class="dc-detail-nom" value="${escapeAttr(p.nom)}" aria-label="Nom du fichier" onchange="dcChanger('${ido}', 'nom', this.value)">
          <span class="dc-piece-sous">${escapeHtml(libelleSortePieceDecoupage(p))}${p.reconnu === false ? ' · non reconnue : nommez-la et choisissez sa rubrique' : ''}${p.rangee ? ` · rangée dans ${escapeHtml(p.rangee)}` : ''}</span>
        </div>
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Tourner toute la pièce d’un quart de tour" aria-label="Tourner toute la pièce" onclick="dcTournerPiece('${ido}')">${icone('rotate-cw')}</wa-button>
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Télécharger cette pièce" aria-label="Télécharger cette pièce" onclick="telechargerPieceDecoupage('${ido}')">${icone('download')}</wa-button>
        ${p.ajoutee ? `<wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Retirer cette pièce ajoutée" aria-label="Retirer cette pièce" onclick="dcRetirerPiece('${ido}')">${icone('trash')}</wa-button>` : ''}
      </div>
      <div class="dc-detail-champs">
        <label class="dc-champ"><span>Pages</span><input type="text" id="dc-detail-pages" class="dc-pages" value="${escapeAttr(p.saisie)}" title="Pages du document (ex. 3-7, 9)" onchange="dcChanger('${ido}', 'pages', this.value)"></label>
        <label class="dc-champ"><span>Rubrique</span><select id="dc-detail-rubrique" onchange="dcChanger('${ido}', 'rubrique', this.value)">${options}</select></label>
      </div>
      <div class="dc-grande">
        <div class="dc-grande-barre">
          <wa-button appearance="plain" size="s" class="bouton-icone" type="button" aria-label="Page précédente"${iVue > 0 ? '' : ' disabled'} onclick="dcPageVoisine(-1)">${icone('chevron-left')}</wa-button>
          <span class="dc-grande-numero">Page ${n} / ${total}${dedans ? ` · ${rang + 1}ᵉ sur ${p.pages.length}` : garde(n) ? ' · page de garde, jamais reprise' : ' · hors de cette pièce'}</span>
          <wa-button appearance="plain" size="s" class="bouton-icone" type="button" aria-label="Page suivante"${iVue >= 0 && iVue < parcourues.length - 1 ? '' : ' disabled'} onclick="dcPageVoisine(1)">${icone('chevron-right')}</wa-button>
          <span class="dc-grande-gestes">
            ${garde(n) ? '' : `<wa-button appearance="outlined" size="s" type="button" onclick="dcTourner([${n}])" title="Tourner cette page d’un quart de tour (sens des aiguilles d’une montre)">${icone('rotate-cw')}Tourner</wa-button>`}
            ${peutCouper ? `<wa-button appearance="outlined" size="s" type="button" onclick="dcScinder('${ido}', ${n})" title="Deux annexes réunies : la suite, à partir de cette page, devient une nouvelle pièce">${icone('ciseaux')}Couper ici</wa-button>` : ''}
            ${garde(n) ? '' : `<wa-button appearance="outlined" size="s" type="button" onclick="dcBasculerPage('${ido}', ${n})">${icone(dedans ? 'x' : 'plus')}${dedans ? 'Retirer' : 'Ajouter'}</wa-button>`}
          </span>
        </div>
        <button type="button" class="dc-grande-page${dedans ? '' : ' dc-hors'}" onclick="dcOuvrirLoupe()" title="Voir la page ${n} en plein écran">${dcBaliseImage(n, DC_LARGEUR_GRANDE, 'dc-image-grande')}<span class="dc-grande-loupe" aria-hidden="true">${icone('maximize')}</span></button>
      </div>
    </div>
    <div class="dc-cote">
      <div class="cst-bloc-titre">Pages ${infoBulle('La page d’avant et celle d’après sont grisées (« garde » : page de garde d’une annexe, jamais reprise) : si la coupe est fausse, ajoutez-les (+) ou retirez une page (×). Une page à l’envers ou couchée se tourne (↻). « Couper ici » sépare deux annexes réunies. Rien n’est rangé avant « Ranger dans le dossier ».')}</div>
      <div class="dc-vignettes">${vignettes}</div>
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
  const rotations = (s === dcEtat.source ? dcEtat.rotations : s.rotations) || {};
  (await doc.copyPages(src, piece.pages.map(n => n - 1))).forEach((pg, i) => {
    const rot = rotations[piece.pages[i]] || 0;
    if (rot) pg.setRotation(window.PDFLib.degrees(((pg.getRotation().angle || 0) + rot) % 360));
    doc.addPage(pg);
  });
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
  etat.source.rotations = Object.assign({}, etat.rotations);
  const jeton = etat.jeton;
  const aFaire = etat.pieces.filter(p => p.inclure && !p.rangee && p.pages.length && (!ids || ids.includes(p.id)));
  etat.range = true;
  renderDecoupage();
  let rangees = 0; const echecs = [];
  for (const p of aFaire) {
    if (jeton !== dcEtat.jeton) break;
    try {
      const avant = p.saisie + '|' + p.nom;
      const blob = await pdfPieceDecoupage(p, etat.source);
      const r = await fetchAvecAuth('/api/nas/deposer-annexe', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossierId: d.id, nom: p.nom, contenu: await base64DepuisBlob(blob), rubriques: p.rubriques || [] }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erreur || `le serveur a répondu ${r.status}`);
      // Corrigée entre-temps (ne devrait plus arriver) : elle reste « à ranger ».
      if (avant !== p.saisie + '|' + p.nom) throw new Error('corrigée pendant le rangement, à ranger de nouveau');
      p.rangee = String(j.chemin || '').split(/[\\/]/).slice(-2).join(' › ') || 'rangée';
      rangees++;
    } catch (e) { echecs.push(`${p.nom} : ${e && e.message ? e.message : 'erreur'}`); }
    if (jeton === dcEtat.jeton) renderDecoupage();
  }
  etat.range = false;
  if (rangees) {
    ajouterHistorique(d, `${etat.mode === 'compromis' || etat.mode === 'entier' ? 'Compromis' : 'Document'} découpé : ${rangees} pièce(s) rangée(s) dans le dossier du NAS`);
    sauvegarder(d);
    if (typeof verifierDossierLocal === 'function') verifierDossierLocal(d.id, false);
  }
  noterVerificationPoste('decoupage-compromis', { ok: !echecs.length && rangees > 0, detail: `${rangees} pièce(s) rangée(s), ${echecs.length} échec(s), ${etat.separateurs} séparation(s)` });
  afficherToast(echecs.length ? `${rangees} pièce(s) rangée(s), ${echecs.length} non rangée(s) : ${echecs[0]}` : `${rangees} pièce(s) rangée(s) dans le dossier de la vente.`, 'OK', null);
  if (jeton === dcEtat.jeton) renderDecoupage();
  return { ok: !echecs.length, rangees, echecs: echecs.length };
}

// Corrections demandées à l'agent (pages, rubrique, à ranger, coupure) : mêmes gestes que l'écran, rien n'est écrit sur le NAS.
function appliquerCorrectionsDecoupageAgent(liste) {
  if (dcEtat.range) return [{ erreur: 'rangement en cours dans l’outil : aucune correction faite, redemande dans un instant' }];
  const compte = [];
  for (const c of liste.slice(0, 40)) {
    const p = dcPiece(String((c && c.piece_id) || ''));
    if (!p) { compte.push({ piece_id: c && c.piece_id, erreur: 'pièce inconnue' }); continue; }
    const fait = [];
    if (c.pages != null && c.pages !== '') {
      const lu = dcSansPagesDeGarde(pagesDepuisSaisieDecoupage(c.pages, dcEtat.pages.length));
      if (lu) { dcPoserPages(p, lu); fait.push('pages ' + p.saisie); } else fait.push('pages illisibles : non changées');
    }
    if (typeof c.rubrique === 'string' && RUBRIQUES_DECOUPAGE.some(r => r[0] === c.rubrique)) { p.rubrique = c.rubrique; p.rubriques = c.rubrique ? [c.rubrique] : []; p.modifiee = true; p.rangee = ''; fait.push('rubrique ' + libelleRubriqueDecoupage(c.rubrique)); }
    if (typeof c.ranger === 'boolean') { p.inclure = c.ranger; p.modifiee = true; if (p.sorte === 'diagnostic') dcRecalculerTousDiagnostics(); fait.push(c.ranger ? 'à ranger' : 'pas rangée'); }
    if ([90, 180, 270].includes(c.tourner)) { dcTourner(p.pages.slice(), c.tourner); fait.push(`tournée de ${c.tourner}°`); }
    if (Number.isInteger(c.couper_a)) {
      const coupe = scinderPagesDecoupage(p.pages, c.couper_a);
      if (coupe) {
        dcPoserPages(p, coupe[0]);
        const nouvelle = dcNouvellePiece(coupe[1], p);
        dcEtat.pieces.splice(dcEtat.pieces.indexOf(p) + 1, 0, nouvelle);
        if (nouvelle.sorte === 'diagnostic') dcRecalculerTousDiagnostics();
        fait.push(`coupée page ${c.couper_a} : nouvelle pièce ${nouvelle.id} (à nommer par l’utilisateur dans l’outil)`);
      } else fait.push('coupure impossible à cette page');
    }
    compte.push({ piece_id: p.id, fait });
  }
  renderDecoupage();
  return compte;
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
  const corrections = Array.isArray(e.corrections) ? appliquerCorrectionsDecoupageAgent(e.corrections) : null;
  const sortie = {
    dossier_id: d.id, pages_total: dcEtat.pages.length, separations_trouvees: dcEtat.separateurs,
    pieces: dcEtat.pieces.map(p => ({ id: p.id, sorte: p.sorte, titre_piece: titrePieceAgentDecoupage(p), pages: p.saisie, nb_pages: p.pages.length, rubrique: libelleRubriqueDecoupage(p.rubrique), ranger: !!p.inclure, rangee: !!p.rangee, reconnue: p.reconnu !== false })),
    dossier_nas_relie: !!d.nasDossier,
    consigne: 'Outil « Découper le compromis » ouvert sur le poste : l’utilisateur y voit chaque pièce en aperçu, y corrige noms, pages et rubriques, puis « Ranger dans le dossier ».'
  };
  if (corrections) sortie.corrections = corrections;
  if (e.ranger) {
    const ids = dcEtat.pieces.filter(p => p.inclure && !p.rangee && p.pages.length).map(p => p.id);
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
