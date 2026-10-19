// Cent scénarios Authentic → CLAIRE « comme si c'était l'étude » (19/10 : « imagine aussi s'il existe déjà des fiches de tout type dans CLAIRE
// plus ou moins remplies ; en fonction du statut : marié, pacsé, veuf, célibataire… ; si on ajoute un nouveau dossier, pourquoi les données
// — date de décès, commune, héritiers, biens — ne sont pas déjà toutes remplies ; tente une centaine de scénarios »).
//
// Même banc que authentic-scenarios.mjs (vrai serveur en mémoire, vraie fenêtre CLAIRE dans Chromium, pages envoyées par la route de
// l'extension au format de releve.js), mais les cas sont TIRÉS (graine fixe, toujours les mêmes) : ventes et successions, créées depuis
// Authentic ou déjà dans CLAIRE (vides, à moitié remplies, complètes, fausses), situations de chaque personne, un à trois biens, fiches
// ouvertes avant ou après la création. Après chaque cas : la fiche relue EN BASE doit porter tout ce qu'Authentic a montré, sans second
// passage. Noms, adresses et dates inventés. `npm run scenarios-authentic-cent` (≈ 10 min) ; `CAS=12` pour un seul cas.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { creerApp } = require(path.join(racine, 'server', 'src', 'app.js'));
const { ouvrirDb } = require(path.join(racine, 'server', 'src', 'db.js'));

// ---- Tirage reproductible ----
let graine = 20261019;
const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
const un = (liste) => liste[Math.floor(hasard() * liste.length)];
const entre = (a, b) => a + Math.floor(hasard() * (b - a + 1));

const NOMS = ['ARNAUD', 'BAILLY', 'CARON', 'DELMAS', 'EVRARD', 'FAURE', 'GILLET', 'HUET', 'JACOB', 'LACROIX', 'MAILLARD', 'NOEL', 'OLLIVIER', 'PERRIN', 'RENAUD', 'SAUNIER',
  'TESSIER', 'VIDAL', 'BRUNET', 'COLLET', 'DUMAS', 'FLEURY', 'GUERIN', 'HAMON', 'LEBLOND', 'MARCHAL', 'PICARD', 'ROLLAND', 'SIMON', 'TANGUY', 'VASSEUR', 'BARRE', 'CHEVALIER',
  'DESCHAMPS', 'ETIENNE', 'FOUCHER', 'GAUTIER', 'HERVE', 'JOLY', 'LAMBERT', 'MERCIER', 'PARIS', 'REMY', 'SCHMITT', 'TOUSSAINT', 'VALLET', 'BENOIT', 'CLEMENT', 'DUPUIS', 'GARNIER'];
const PRENOMS_H = ['Paul', 'Louis', 'Hugo', 'Jules', 'Marc', 'Yves', 'Denis', 'Henri', 'Gilles', 'Olivier', 'Bruno', 'Thierry'];
const PRENOMS_F = ['Léa', 'Anne', 'Claire', 'Julie', 'Marie', 'Odile', 'Sophie', 'Agnès', 'Hélène', 'Martine', 'Nadia', 'Sylvie'];
const VOIES = [['rue', 'des Lilas'], ['chemin', 'des Vignes'], ['avenue', 'Wilson'], ['rue', 'Haute'], ['impasse', 'du Moulin'], ['route', 'de Blois'], ['place', 'du Marché'], ['allée', 'des Chênes']];
const COMMUNES = ['41000 BLOIS', '41350 VINEUIL', '41290 VIEVY LE RAYE', '41190 SAINT LUBIN EN VERGONNOIS', '41100 VENDOME', '41120 CHAILLES', '41250 BRACIEUX', '41500 MER'];
const SECTIONS = ['AB', 'AL', 'BK', 'CD', 'ZE', 'ZN', 'AH', 'DK'];
const nomsPris = new Set();
const nomLibre = () => { let n; do n = un(NOMS); while (nomsPris.has(n)); nomsPris.add(n); return n; };
const date = (j, m, a) => `${String(j).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
const iso = (fr) => fr.split('/').reverse().join('-');

function personne(nom, sexe) {
  const h = sexe ? sexe === 'H' : hasard() < 0.5;
  const prenom = un(h ? PRENOMS_H : PRENOMS_F);
  const cle = (prenom + '.' + nom).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return { nom, prenom, civ: h ? 'Monsieur' : 'Madame', abr: h ? 'M.' : 'Mme', email: cle + '@exemple.fr', tel: `06 ${entre(10, 99)} ${entre(10, 99)} ${entre(10, 99)} ${entre(10, 99)}`, naissance: date(entre(1, 28), entre(1, 12), entre(1940, 1995)) };
}
function bien(type) {
  const [tv, v] = un(VOIES);
  const cp = un(COMMUNES);
  const n = String(entre(1, 60));
  const parcelles = Array.from({ length: entre(1, 2) }, () => [un(SECTIONS), String(entre(10, 999))]);
  return { type: type || un(['Maison individuelle', 'Maison individuelle', 'Terrain', 'Appartement']), numero: n, typeVoie: tv, voie: v, cpVille: cp, parcelles, adresse: `${n} ${tv} ${v} ${cp}` };
}

// ---- Pages d'Authentic (format de releve.js) ----
const ID = 'ui-ficho-tabs:mainTabPanel:tabForm2:tabContent:';
const onglets = (actif) => (actif ? [{ titre: actif, actif: true }] : []);
function pageDossier({ ref, intitule, sous, comparants, immeubles, documents = [] }) {
  const texte = ['Accueil', `${ref} ${intitule}`, `${sous} Importer avec 6e SENS`, `Comparants (${comparants.length})`, ...comparants.flat(),
    `Immeubles (${immeubles.length})`, ...immeubles.flatMap(b => [b.cpVille, `${b.numero} ${b.typeVoie} ${b.voie}`]), 'Documents'].join('\n');
  return { titre: 'Authentic', onglets: onglets(`${ref} ${intitule}`), champs: [{ groupe: '', libelle: 'Rechercher', valeur: '' }],
    tableaux: [{ titre: '', entete: [], lignes: documents.length ? documents : [[`Ouverture du dossier ${intitule}`, '', '01/09/2026', '', 'Créé']] }], texte };
}
function ficheClient(p, onglet, { situation, deces, nomUsage } = {}) {
  const id = (s) => ID + 'tabView:' + s;
  const champs = [
    { groupe: '', libelle: id('ficheClientPhysiqueIdentite:etude_input'), valeur: 'oui' },
    { groupe: '', libelle: id('ficheClientPhysiqueIdentite:civilite:selectOneRadio'), valeur: p.civ },
    { groupe: '', libelle: 'Nom de famille*', valeur: p.nom.charAt(0) + p.nom.slice(1).toLowerCase() },
    { groupe: '', libelle: 'Prénom*', valeur: p.prenom },
    { groupe: '', libelle: "Dénomination d'usage", valeur: nomUsage || '' },
    { groupe: '', libelle: id('ficheClientPhysiqueIdentite:naissanceDate:naissanceDate'), valeur: p.naissance },
    { groupe: '', libelle: 'CP, Ville (naissance)', valeur: '37000 TOURS' },
    { groupe: '', libelle: 'N° de voie', valeur: '8' }, { groupe: '', libelle: 'Type de voie', valeur: 'rue' },
    { groupe: '', libelle: 'Nom de la voie', valeur: 'des Écoles' }, { groupe: '', libelle: 'CP - Ville', valeur: '41000 BLOIS' },
    { groupe: '', libelle: id('ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneePrincipaleW1:Telephone:inputTelephone'), valeur: deces ? '' : p.tel },
    { groupe: '', libelle: 'Email', valeur: deces ? '' : p.email }
  ];
  if (deces) champs.push({ groupe: '', libelle: id('ficheClientPhysiqueIdentite:dateDeces:dateDeces'), valeur: deces.date }, { groupe: '', libelle: 'CP, Ville (décès)', valeur: deces.lieu });
  const tableaux = [];
  if (situation) {
    tableaux.push({ titre: '', entete: ['Situation', 'Date', 'Conjoint'], lignes: [[situation.libelle, situation.date || '', situation.conjoint ? `${situation.conjoint.nom} ${situation.conjoint.prenom}` : '']] });
    if (situation.regime) champs.push({ groupe: '', libelle: id('situationFamiliale:somContratRegimeId:selectonemenu_input'), valeur: situation.regime });
  }
  return { titre: 'Authentic', onglets: onglets(onglet), champs, tableaux, texte: '' };
}
function ficheBien(b, onglet) {
  const champs = [
    { groupe: 'Informations du bien', libelle: ID + 'ficheImmeubleTabView:infosComponent:ficheImmeubleIdentite:typeWithDialog:selectOneMenu_input', valeur: b.type },
    { groupe: 'Informations du bien', libelle: 'N° de voie', valeur: b.numero }, { groupe: 'Informations du bien', libelle: 'Type de voie', valeur: b.typeVoie },
    { groupe: 'Informations du bien', libelle: 'Nom de la voie', valeur: b.voie }, { groupe: 'Informations du bien', libelle: 'CP - Ville*', valeur: b.cpVille }];
  return { titre: 'Authentic', onglets: onglets(onglet), champs,
    tableaux: [{ titre: b.type === 'Appartement' ? 'Parcelle Assise volumétrique' : 'Cadastre', entete: ['Commune', 'Préfixe', 'Section', 'Numéro', 'Adresse ou lieu-dit', 'Nature', 'Zone urbanisme', 'SPF', 'surface', ''],
      lignes: b.parcelles.map(([s, n]) => [b.cpVille, '', s, n, `${b.numero} ${b.typeVoie} ${b.voie}`, '', '', 'BLOIS 1', String(entre(100, 2000)), '']) }], texte: '' };
}

// ---- Les cas ----
const SITUATIONS = [
  { cle: 'celibataire', libelle: 'Célibataire' }, { cle: 'marie', libelle: 'Marié(e)', regime: 'Communauté réduite aux acquêts' },
  { cle: 'pacse', libelle: 'Pacsé(e)' }, { cle: 'veuf', libelle: 'Veuf(ve)' }, { cle: 'divorce', libelle: 'Divorcé(e)' }];
let refNum = 1000;
function casVente(i) {
  const ref = `A 2026 0${refNum++}`;
  const cote = (role) => {
    const nom = nomLibre();
    const forme = un(['seul', 'seul', 'couple-marie', 'couple-pacse', 'marie-conjoint-absent', 'couple-concubins']);
    const a = personne(nom, 'H');
    if (forme === 'seul') { const s = un(SITUATIONS.filter(x => x.cle !== 'marie' && x.cle !== 'pacse')); return { role, nom, personnes: [a], forme, situations: [s] }; }
    if (forme === 'marie-conjoint-absent') {
      const absent = personne(nom, 'F');
      return { role, nom, personnes: [a], forme, absent, situations: [{ cle: 'marie', libelle: 'Marié(e)', date: date(12, 6, 2010), conjoint: absent, regime: 'Séparation de biens' }] };
    }
    const b = personne(forme === 'couple-concubins' ? nomLibre() : nom, 'F');
    const s = forme === 'couple-marie' ? { cle: 'marie', libelle: 'Marié(e)', date: date(20, 5, 2012), regime: 'Communauté réduite aux acquêts' }
      : forme === 'couple-pacse' ? { cle: 'pacse', libelle: 'Pacsé(e)', date: date(3, 3, 2018) } : { cle: 'celibataire', libelle: 'Célibataire' };
    return { role, nom, personnes: [a, b], forme, situations: [Object.assign({}, s, s.cle !== 'celibataire' ? { conjoint: b } : {}), Object.assign({}, s, s.cle !== 'celibataire' ? { conjoint: a } : {})] };
  };
  const v = cote('VENDEUR'); const a = cote('ACQUEREUR');
  const nomCote = (c) => c.personnes.map(p => p.nom).filter((n, k, l) => l.indexOf(n) === k).join(' ');
  const biens = Array.from({ length: hasard() < 0.25 ? 2 : 1 }, (_, k) => k === 0 ? bien() : bien('Terrain'));
  const existe = un(['non', 'non', 'non', 'noms', 'partiel', 'complet', 'errone']);
  const ordre = existe === 'non' ? un(['avant', 'avant', 'apres', 'melange']) : 'apres';
  return { i, genre: 'vente', ref, intitule: `VTE ${nomCote(v)} / ${nomCote(a)}`, nomDossier: `${nomCote(v)} / ${nomCote(a)}`, cotes: [v, a], biens, existe, ordre };
}
function casSuccession(i) {
  const ref = `A 2026 0${refNum++}`;
  const nom = nomLibre();
  const defunt = personne(nom);
  const statut = un(['marie', 'veuf', 'celibataire', 'divorce', 'marie', 'pacse']);
  const conjoint = (statut === 'marie' || statut === 'pacse') ? personne(nom, defunt.civ === 'Monsieur' ? 'F' : 'H') : null;
  const heritiers = Array.from({ length: entre(1, 3) }, () => personne(hasard() < 0.8 ? nom : nomLibre()));
  // Prénoms distincts dans une même succession (une personne n'est pas son homonyme).
  heritiers.forEach((h, k) => { while ([defunt, conjoint, ...heritiers.slice(0, k)].some(x => x && x.prenom === h.prenom && x.nom === h.nom)) h.prenom = un(h.civ === 'Monsieur' ? PRENOMS_H : PRENOMS_F); });
  const biens = Array.from({ length: entre(0, 3) }, () => bien());
  const deces = { date: date(entre(1, 28), entre(1, 9), 2026), lieu: un(COMMUNES) };
  const existe = un(['non', 'non', 'non', 'partiel']);
  return { i, genre: 'succession', ref, intitule: `SUCC ${nom} ${defunt.prenom}`, nomDossier: `${nom} ${defunt.prenom}`, nom, defunt, statut, conjoint, heritiers, biens, deces, existe,
    conjointOuvert: !!conjoint && hasard() < 0.7, ordre: existe === 'non' ? un(['avant', 'avant', 'apres']) : 'apres' };
}
const CAS = [];
for (let i = 1; i <= 100; i++) CAS.push(i % 3 === 0 ? casSuccession(i) : casVente(i));

// ---- Pages d'un cas, dans l'ordre où l'étude les ouvre ----
function pagesCas(c) {
  const tab = `${c.ref} ${c.intitule}`;
  if (c.genre === 'vente') {
    const comparants = c.cotes.flatMap(co => co.personnes.map(p => [`${p.abr} ${p.nom} ${p.prenom}`, co.role === 'VENDEUR' ? 'Vendeur' : 'Acquéreur']));
    const gestion = pageDossier({ ref: c.ref, intitule: c.intitule, sous: `2 - ${c.intitule}`, comparants, immeubles: c.biens });
    const fiches = c.cotes.flatMap(co => co.personnes.map((p, k) => ficheClient(p, tab, { situation: co.situations[k] })));
    // Le conjoint absent des comparants : sa fiche est ouverte aussi (l'étude clique sur l'époux), jamais reprise.
    c.cotes.filter(co => co.absent).forEach(co => fiches.push(ficheClient(co.absent, tab, { situation: { cle: 'marie', libelle: 'Marié(e)', conjoint: co.personnes[0] } })));
    return { gestion, fiches: fiches.concat(c.biens.map(b => ficheBien(b, tab))) };
  }
  const comparants = [[`${c.defunt.abr} ${c.defunt.nom} ${c.defunt.prenom}`, 'Défunt'], ...c.heritiers.map(h => [`${h.abr} ${h.nom} ${h.prenom}`, 'Héritier'])];
  const gestion = pageDossier({ ref: c.ref, intitule: c.intitule, sous: `1 - Succession ${c.defunt.prenom} ${c.nom}`, comparants, immeubles: c.biens });
  const sitDefunt = c.statut === 'marie' ? { cle: 'marie', libelle: 'Marié(e)', date: date(1, 7, 1975), conjoint: c.conjoint, regime: 'Communauté légale' }
    : c.statut === 'pacse' ? { cle: 'pacse', libelle: 'Pacsé(e)', conjoint: c.conjoint } : { cle: c.statut, libelle: SITUATIONS.find(s => s.cle === c.statut).libelle };
  const fiches = [ficheClient(c.defunt, tab, { situation: sitDefunt, deces: c.deces }), ...c.heritiers.map(h => ficheClient(h, tab, { situation: { cle: 'celibataire', libelle: 'Célibataire' } }))];
  if (c.conjointOuvert) fiches.push(ficheClient(c.conjoint, tab, { situation: c.statut === 'marie' ? { cle: 'marie', libelle: 'Marié(e)', conjoint: c.defunt } : { cle: 'pacse', libelle: 'Pacsé(e)', conjoint: c.defunt } }));
  return { gestion, fiches: fiches.concat(c.biens.map(b => ficheBien(b, tab))) };
}

// ---- Dossier déjà dans CLAIRE, plus ou moins rempli ----
function dossierExistant(c) {
  const base = { id: 'c' + c.i, nom: c.nomDossier, responsable: 'Julie VASSELIN', roleNotaire: 'instrumentaire', pieces: {}, historique: [{ date: '2026-09-01T09:00:00', texte: 'Dossier créé' }], referenceAuthentic: c.ref };
  if (c.genre === 'succession') {
    return Object.assign(base, { typeAffaire: 'succession', sansPret: true, biens: [], parties: c.heritiers.slice(0, 1).map(h => ({ role: 'PARTIE', nom: h.nom, prenom: h.prenom })) });
  }
  const parties = c.cotes.flatMap(co => co.personnes.map(p => {
    if (c.existe === 'noms') return { role: co.role, nom: p.nom };
    if (c.existe === 'errone') return { role: co.role, nom: p.nom, prenom: p.prenom, civilite: p.civ === 'Monsieur' ? 'Mme' : 'M' };
    return { role: co.role, nom: p.nom, prenom: p.prenom, civilite: c.existe === 'complet' ? (p.civ === 'Monsieur' ? 'M' : 'Mme') : '' };
  }));
  const emails = (co) => c.existe === 'complet' ? co.personnes.map(p => p.email).join('; ') : c.existe === 'errone' ? 'ancienne.adresse@exemple.fr' : c.existe === 'partiel' ? co.personnes[0].email : '';
  return Object.assign(base, { typeVente: c.biens[0].type === 'Appartement' ? 'copropriete' : c.biens[0].type === 'Terrain' ? 'terrain' : 'maison', parties,
    emailVendeur: emails(c.cotes[0]), emailAcquereur: emails(c.cotes[1]), adresseBien: c.existe === 'noms' ? '' : c.biens[0].adresse });
}

// ---- Banc ----
const db = ouvrirDb(':memory:');
const { app, depot } = creerApp({ db, config: { racineRepo: racine, authActive: false, estSea: () => false } });
const choisis = process.env.CAS ? CAS.filter(c => String(c.i) === process.env.CAS) : CAS;
for (const c of choisis) if (c.existe !== 'non') depot.creer(dossierExistant(c));
const serveur = app.listen(0);
await new Promise((r) => serveur.once('listening', r));
const B = 'http://127.0.0.1:' + serveur.address().port;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function envoyer(capture) {
  const r = await fetch(B + '/api/authentic/releve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(capture) });
  const j = await r.json();
  if (!j.id) return { etat: j.ignore ? 'ignoree' : j.deja ? 'doublon' : 'refusee' };
  for (let k = 0; k < 80; k++) {
    await pause(120);
    const e = ((await (await fetch(B + '/api/authentic/journal')).json()).entrees || []).find(x => x.id === j.id);
    if (e && e.etat !== 'en-file' && e.etat !== 'pris') { await pause(250); return e; }
  }
  return { etat: 'sans-reponse' };
}
const tous = async () => { const j = await (await fetch(B + '/api/dossiers')).json(); return j.dossiers || j; };

const navigateur = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await navigateur.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
await ctx.addInitScript(() => { localStorage.setItem('claire-utilisateur-poste', 'Julie VASSELIN'); });
const page = await ctx.newPage();
const erreursPage = [];
page.on('pageerror', (e) => erreursPage.push(e.message));
await page.goto(B + '/');
await pause(3000);

async function creerDepuisAuthentic(c) {
  return page.evaluate(async (ref) => {
    definirOnglet('nouveau');
    choisirModeImport('seul');
    let i = -1;
    for (let k = 0; k < 60 && i < 0; k++) { await new Promise(r => setTimeout(r, 150)); i = groupesAuthenticRecents.findIndex(g => g.reference === ref); }
    if (i < 0) return { erreur: 'dossier d’Authentic absent de « Nouveau dossier »' };
    creerDepuisAuthentic(i);
    await new Promise(r => setTimeout(r, 400));
    const resp = document.getElementById('f-responsable');
    if (resp && !resp.value) resp.value = 'Julie VASSELIN';
    const avant = dossiers.length;
    await ajouterDossier(true);
    for (let k = 0; k < 60 && dossiers.length === avant; k++) await new Promise(r => setTimeout(r, 150));
    await new Promise(r => setTimeout(r, 800));
    const d = dossiers.find(x => x.referenceAuthentic === ref);
    return d ? { id: d.id } : { erreur: 'dossier non créé' };
  }, c.ref);
}

// Ce que la fiche montre, lu par les fonctions de CLAIRE dans la fenêtre (ce que l'étude voit).
async function vue(id) {
  return page.evaluate((id) => {
    const d = dossiers.find(x => x.id === id);
    if (!d) return null;
    const succ = estSuccession(d);
    const df = succ ? defuntConstitution(d).champs : null;
    const ps = succ ? personnesSuccession(d) : null;
    return {
      parties: (d.parties || []).map(p => ({ role: p.role, nom: [p.prenom, p.nom].filter(Boolean).join(' '), civilite: p.civilite || '' })),
      emailVendeur: d.emailVendeur || '', emailAcquereur: d.emailAcquereur || '', telephoneVendeur: d.telephoneVendeur || '', telephoneAcquereur: d.telephoneAcquereur || '',
      situationVendeur: d.situationVendeur || '', situationAcquereur: d.situationAcquereur || '',
      parcelles: ((d.bien && d.bien.cadastre && d.bien.cadastre.parcelles) || []).map(p => p.section + p.numero),
      immeubles: ((d.authentic && d.authentic.immeubles) || []).length, biens: (d.biens || []).map(b => b.adresse || ''), reference: d.referenceAuthentic || '',
      fiches: Object.keys((d.authentic && d.authentic.fichesClients) || {}),
      defunt: df ? { nom: df.nom, prenoms: df.prenoms, deces: df.decesDate || '', lieu: df.decesLieu || '' } : null,
      heritiers: ps ? ps.heritiers.map(h => ({ nom: h.nom, qualite: h.qualite || '' })) : null
    };
  }, id);
}

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const resultats = [];
for (const c of choisis) {
  const ecarts = [];
  const note = (ok, texte) => { if (!ok) ecarts.push(texte); };
  try {
    const { gestion, fiches } = pagesCas(c);
    let id = c.existe !== 'non' ? 'c' + c.i : '';
    const coupe = c.ordre === 'melange' ? Math.ceil(fiches.length / 2) : c.ordre === 'avant' ? fiches.length : 0;
    await envoyer(gestion);
    for (const f of fiches.slice(0, id ? fiches.length : coupe)) await envoyer(f);
    if (!id) {
      const r = await creerDepuisAuthentic(c);
      if (r.erreur) { note(false, r.erreur); resultats.push({ c, ecarts }); continue; }
      id = r.id;
      for (const f of fiches.slice(coupe)) await envoyer(f);
    }
    await pause(600);
    const v = await vue(id);
    if (!v) { note(false, 'fiche introuvable'); resultats.push({ c, ecarts }); continue; }
    note(v.reference === c.ref, `référence ${v.reference || 'absente'}`);
    if (c.genre === 'vente') {
      for (const co of c.cotes) {
        for (const p of co.personnes) {
          const trouve = v.parties.filter(x => x.role === co.role && norm(x.nom).includes(norm(p.prenom)) && norm(x.nom).includes(norm(p.nom)));
          note(trouve.length === 1, `${co.role === 'VENDEUR' ? 'vendeur' : 'acquéreur'} ${p.prenom} ${p.nom} : ${trouve.length} fois`);
          if (trouve[0]) note(trouve[0].civilite === (p.civ === 'Monsieur' ? 'M' : 'Mme'), `civilité de ${p.prenom} ${p.nom} : « ${trouve[0].civilite} »`);
          const champ = co.role === 'VENDEUR' ? v.emailVendeur : v.emailAcquereur;
          note(norm(champ).includes(p.email), `email de ${p.prenom} ${p.nom} absent (${champ || 'vide'})`);
        }
        note(v.parties.filter(x => x.role === co.role).length === co.personnes.length, `${co.role} : ${v.parties.filter(x => x.role === co.role).map(x => x.nom).join(', ')} (attendu ${co.personnes.map(p => p.prenom + ' ' + p.nom).join(', ')})`);
        if (co.absent) note(!v.parties.some(x => norm(x.nom).includes(norm(co.absent.prenom)) && norm(x.nom).includes(norm(co.absent.nom))), `conjoint absent des comparants ${co.absent.prenom} ${co.absent.nom} ajouté`);
        const sit = co.role === 'VENDEUR' ? v.situationVendeur : v.situationAcquereur;
        if (co.forme === 'couple-marie') note(sit === 'marie', `situation du couple ${co.role} : « ${sit} » (attendu marié)`);
        if (co.forme === 'couple-pacse') note(sit === 'pacse', `situation du couple ${co.role} : « ${sit} » (attendu pacsé)`);
        if (c.existe === 'errone') note(!/ancienne\.adresse/.test(co.role === 'VENDEUR' ? v.emailVendeur : v.emailAcquereur), `email faux gardé (${co.role})`);
      }
      const attendues = c.biens.flatMap(b => b.parcelles.map(([s, n]) => s + n));
      note(attendues.every(x => v.parcelles.includes(x)), `parcelles ${v.parcelles.join(',') || 'aucune'} (attendu ${attendues.join(',')})`);
      note(v.immeubles === c.biens.length, `${v.immeubles} bien(s) retenu(s) sur ${c.biens.length}`);
      const nbFiches = c.cotes.reduce((n, co) => n + co.personnes.length, 0);
      note(v.fiches.length >= nbFiches, `${v.fiches.length} fiche(s) client gardée(s) sur ${nbFiches}`);
    } else {
      note(!!v.defunt && norm(v.defunt.nom).includes(norm(c.nom)) && norm(v.defunt.prenoms).includes(norm(c.defunt.prenom)), `défunt : ${v.defunt ? v.defunt.prenoms + ' ' + v.defunt.nom : 'aucun'}`);
      note(!!v.defunt && v.defunt.deces === iso(c.deces.date), `date de décès : ${v.defunt && v.defunt.deces || 'vide'} (attendu ${iso(c.deces.date)})`);
      note(!!v.defunt && norm(v.defunt.lieu).includes(norm(c.deces.lieu.slice(6))), `lieu du décès : ${v.defunt && v.defunt.lieu || 'vide'}`);
      for (const h of c.heritiers) note(v.heritiers.some(x => norm(x.nom).includes(norm(h.prenom)) && norm(x.nom).includes(norm(h.nom))), `héritier ${h.prenom} ${h.nom} absent (${v.heritiers.map(x => x.nom).join(', ')})`);
      note(!v.heritiers.some(x => norm(x.nom).includes(norm(c.defunt.prenom)) && norm(x.nom).includes(norm(c.defunt.nom))), 'le défunt figure parmi les héritiers');
      if (c.conjointOuvert) note(v.heritiers.some(x => norm(x.nom).includes(norm(c.conjoint.prenom)) && /conjoint/i.test(x.qualite)), `conjoint survivant ${c.conjoint.prenom} absent ou sans qualité (${v.heritiers.map(x => x.nom + (x.qualite ? ' [' + x.qualite + ']' : '')).join(', ')})`);
      note(v.biens.length === c.biens.length, `${v.biens.length} bien(s) sur ${c.biens.length} (${v.biens.join(' | ')})`);
      for (const b of c.biens) note(v.biens.some(a => norm(a).includes(norm(b.cpVille.slice(6)))), `commune du bien ${b.cpVille} absente`);
    }
  } catch (e) { note(false, 'arrêt : ' + String(e && e.message || e).split('\n')[0]); }
  resultats.push({ c, ecarts });
}
await navigateur.close();
serveur.close();

const desc = (c) => c.genre === 'vente'
  ? `vente ${c.intitule} — ${c.cotes.map(co => co.forme).join(' / ')}, ${c.biens.length} bien(s), fiche ${c.existe === 'non' ? 'créée depuis Authentic, pages ' + c.ordre : 'déjà dans CLAIRE (' + c.existe + ')'}`
  : `succession ${c.intitule} — défunt ${c.statut}, ${c.heritiers.length} héritier(s), ${c.biens.length} bien(s)${c.conjointOuvert ? ', fiche du conjoint ouverte' : ''}, ${c.existe === 'non' ? 'créée depuis Authentic, pages ' + c.ordre : 'déjà dans CLAIRE'}`;
let ko = 0;
for (const r of resultats) {
  if (!r.ecarts.length) { if (process.env.DETAIL) console.log(`ok    ${r.c.i}. ${desc(r.c)}`); continue; }
  ko++;
  console.log(`ÉCHEC ${r.c.i}. ${desc(r.c)}`);
  r.ecarts.forEach(t => console.log('        · ' + t));
}
erreursPage.forEach(m => { ko++; console.log('ÉCHEC fenêtre CLAIRE : ' + m); });
console.log(`\n${resultats.length - ko}/${resultats.length} scénarios sans écart`);
process.exit(ko ? 1 : 0);
