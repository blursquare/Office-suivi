'use strict';

// Carnet des confrères (demandé par l'étude le 29/09/2026) : les offices notariaux avec qui l'étude
// traite, avec leurs notaires, adresse, téléphone et email — rempli une fois, partagé entre les
// postes (table `parametres`, clé `carnet-confreres`), proposé ensuite dans chaque dossier.
//
// Premier remplissage : notre office (OFFICE_ETUDE ci-dessous) et les 35 autres offices du
// Loir-et-Cher, relevés le 29/09/2026 sur l'annuaire public immonot (fiches « office notarial »,
// données structurées de chaque page ; notaires.fr refuse la lecture automatique). Ce sont des coordonnées professionnelles
// publiques, pas des données clients. Un relevé daté, pas une source tenue à jour : l'étude
// corrige ou complète sur place (Outils › Carnet des confrères), et une fiche modifiée garde
// sa propre valeur. Pour recharger ce relevé, effacer la clé : le carnet repart de cette liste.
//
// `email` est l'adresse générale de l'office publiée par l'annuaire ; celle du clerc qui suit un
// dossier se saisit sur le dossier lui-même (emailNotaireParticipant).

const SOURCE_ANNUAIRE_41 = 'Annuaire immonot, relevé du 29/09/2026';

const CARNET_INITIAL_41 = [
  {"id": "annuaire-12068", "office": "Me Jean-François de GEBERT", "notaires": ["Jean-François de GEBERT"], "email": "etude.degebert@notaires.fr", "telephone": "02 54 78 05 52", "adresse": "15 avenue Gambetta", "codePostal": "41000", "ville": "Blois", "bureaux": []},
  {"id": "annuaire-12069", "office": "SCP Bertrand MICHEL et Eve CHAMPION", "notaires": ["Eve CHAMPION", "Bertrand MICHEL", "Karine ROTIEL"], "email": "scp.michel.champion@notaires.fr", "telephone": "02 54 56 27 27", "adresse": "12 place Jean Jaurès", "codePostal": "41000", "ville": "Blois", "bureaux": []},
  {"id": "annuaire-12070", "office": "SELARL Julien COPPIN & Christophe DELAUNAY", "notaires": ["Julien COPPIN", "Christophe DELAUNAY"], "email": "coppin.meunier@notaires.fr", "telephone": "02 54 78 03 56", "adresse": "28 avenue Maunoury", "codePostal": "41000", "ville": "Blois", "bureaux": []},
  {"id": "annuaire-12071", "office": "SELARL Nadège BÉZANNIER-BOUQUET et Vincent EMONET", "notaires": ["Nadège BEZANNIER-BOUQUET", "Vincent EMONET", "Alexandra LEFRANC-BERTHON"], "email": "etude.bbe@notaires.fr", "telephone": "02 54 74 00 31", "adresse": "23 rue de la Vallée Maillard", "codePostal": "41000", "ville": "Blois", "bureaux": []},
  {"id": "annuaire-12072", "office": "SELARL Stéphanie VIOLET-MARECHAL et David RAVIN", "notaires": ["David RAVIN", "Stéphanie VIOLET-MARECHAL"], "email": "violet-marechal.ravin.vendome@notaires.fr", "telephone": "02 54 77 17 52", "adresse": "20 avenue de Verdun", "codePostal": "41100", "ville": "Vendôme", "bureaux": ["41100 Selommes 7 rue de la Vallée"]},
  {"id": "annuaire-12073", "office": "SELARL Carole ROBERT", "notaires": ["Carole ROBERT", "Charles AURIAU", "Amandine JAILLOT-COISSIN"], "email": "etude.fortin-robert-vendome@notaires.fr", "telephone": "02 54 77 19 53", "adresse": "2 Mail Leclerc", "codePostal": "41100", "ville": "Vendôme", "bureaux": ["41100 Villiers-sur-Loir Le bourg", "41160 Morée 20 rue de Prés"]},
  {"id": "annuaire-12074", "office": "SELARL TAYLOR, Notaires associés", "notaires": ["Séverine FÈVE-TAPHINAUD", "Thibaut ROBERT", "Sylvie LEDRU"], "email": "office.taphinaud@notaires.fr", "telephone": "02 54 71 16 16", "adresse": "57 rue Constant Ragot", "codePostal": "41110", "ville": "Saint-Aignan", "bureaux": ["41130 Meusnes Le bourg"]},
  {"id": "annuaire-12077", "office": "SCP Florence LESCURE-MOSSERON et Aurélien LACOUR", "notaires": ["Aurélien LACOUR", "Florence LESCURE-MOSSERON"], "email": "florence.lescure.mosseron@notaires.fr", "telephone": "02 54 44 01 77", "adresse": "20 bis route de Blois", "codePostal": "41120", "ville": "Les Montils", "bureaux": ["41120 Cellettes 6 bis rue de la Foret"]},
  {"id": "annuaire-12080", "office": "Me Philippe GOSSE", "notaires": ["Philippe GOSSE"], "email": "immobilier.41018@notaires.fr", "telephone": "02 54 20 70 31", "adresse": "40 Grande rue - Onzain", "codePostal": "41150", "ville": "Veuzain-sur-Loire", "bureaux": []},
  {"id": "annuaire-12082", "office": "Me Antoine RICHARDIN", "notaires": ["Antoine RICHARDIN", "Isabelle LENOIR"], "email": "richardin@notaires.fr", "telephone": "02 54 80 94 77", "adresse": "5 carrefour de l'Ormeau", "codePostal": "41170", "ville": "Mondoubleau", "bureaux": []},
  {"id": "annuaire-12085", "office": "SELARL FROGE-MOULIN NOTAIRES ASSOCIES", "notaires": ["Alicia MOULIN", "Ophélie TURBIL-FROGÉ"], "email": "etude.41016@notaires.fr", "telephone": "02 54 46 13 03", "adresse": "3 rue Charles Dodun", "codePostal": "41190", "ville": "Herbault", "bureaux": []},
  {"id": "annuaire-12086", "office": "SARL S. BOISSAY, A. COUROUBLE, L. BOUTON et A-C. LE DANTEC-DIVARD", "notaires": ["Sébastien BOISSAY", "Arnaud COUROUBLE", "Lise DEVALERIOLA", "Alexis GIAU"], "email": "boissay.courouble.bouton@notaires.fr", "telephone": "02 54 95 33 00", "adresse": "10 rue Notre Dame", "codePostal": "41200", "ville": "Romorantin-Lanthenay", "bureaux": ["41320 Mennetou-sur-Cher 8 rue des Ponts BP 5"]},
  {"id": "annuaire-12087", "office": "SARL Magali MONCHAUSSE", "notaires": ["Magali MONCHAUSSE"], "email": "office.monchausse@notaires.fr", "telephone": "02 54 95 71 75", "adresse": "5 rue du Four à Chaux", "codePostal": "41200", "ville": "Romorantin-Lanthenay", "bureaux": []},
  {"id": "annuaire-12090", "office": "Me Marie-Pascale SIMON-GUISET", "notaires": ["Marie-Pascale SIMON-GUISET", "Marthe MOUZAY"], "email": "sophie.giraudeau@41029.notaires.fr", "telephone": "02 54 82 46 35", "adresse": "3A allée de la plaine", "codePostal": "41160", "ville": "Beauce la Romaine", "bureaux": ["41290 Oucques La Nouvelle 28 Grande Rue"]},
  {"id": "annuaire-12091", "office": "Me M-Pierre JAMBON CARPENTIER", "notaires": ["M-Pierre JAMBON CARPENTIER"], "email": "immobilier@41008.notaires.fr", "telephone": "02 54 46 41 15", "adresse": "9 rue Roger Brun", "codePostal": "41250", "ville": "Bracieux", "bureaux": []},
  {"id": "annuaire-12095", "office": "SARL S. BOISSAY, A. COUROUBLE, L. BOUTON et A-C. LE DANTEC-DIVARD", "notaires": ["Anne-Charlotte LE DANTEC-DIVARD", "Claude HARTAR", "Anaïs KERESPARS"], "email": "office.salbris.41044@notaires.fr", "telephone": "02 54 97 00 28", "adresse": "6 boulevard de la République", "codePostal": "41300", "ville": "Salbris", "bureaux": []},
  {"id": "annuaire-12101", "office": "SELARL TIERCELIN - BRUNET - DUVIVIER", "notaires": ["Philippe BRUNET", "Nicolas TIERCELIN", "Sarah LOUBOFF", "Antoine PIMBERT"], "email": "tiercelin.brunet@notaires.fr", "telephone": "02 54 75 75 00", "adresse": "9 rue du Pont", "codePostal": "41400", "ville": "Montrichard Val de Cher", "bureaux": []},
  {"id": "annuaire-12104", "office": "Office Notarial AS MER", "notaires": ["Audrey-Anne BRETON NOUEL", "Sabrina SAIDANI MIRGHANI"], "email": "immobilier.41022@asmer.notaires.fr", "telephone": "02 54 81 00 34", "adresse": "10 Avenue du Maréchal Maunoury", "codePostal": "41500", "ville": "Mer", "bureaux": []},
  {"id": "annuaire-12105", "office": "SELAS ANTOINE GHESTEM NOTAIRE - ACTES EN SOLOGNE", "notaires": ["Antoine GHESTEM", "Julien FROISSANT"], "email": "accueil.41046@notaires.fr", "telephone": "02 54 97 42 27", "adresse": "6 place Charles de Gaulle", "codePostal": "41130", "ville": "Selles-sur-Cher", "bureaux": ["41700 Chémery 75 rue Nationale"]},
  {"id": "annuaire-12106", "office": "SELARL 1416 NOTAIRES", "notaires": ["Alexis NORGUET", "Blandine LASSERON"], "email": "alexis.norguet@notaires.fr", "telephone": "02 54 79 53 08", "adresse": "50 E rue de Cheverny", "codePostal": "41120", "ville": "Le Controis-en-Sologne", "bureaux": []},
  {"id": "annuaire-12108", "office": "SELARL Antony BERTHELOT et Thomas LEMOINE - Notaires", "notaires": ["Antony BERTHELOT", "Thomas LEMOINE", "Mikaëlle SAVATIER"], "email": "reception@nvl.notaires.fr", "telephone": "02 54 85 08 44", "adresse": "1 place du Maréchal Foch", "codePostal": "41800", "ville": "Montoire-sur-le-Loir", "bureaux": ["41800 Vallée-de-Ronsard 3 rue Marie Dubois BP 18"]},
  {"id": "annuaire-12110", "office": "SELARL E. BRUNEL, D. HALLIER et C. ASSELIN", "notaires": ["Cédric ASSELIN", "Emmanuelle BRUNEL", "David HALLIER", "Olivier GIRAUD", "Géraldine MONTÉ"], "email": "bha@bha.notaires.fr", "telephone": "02 54 55 37 70", "adresse": "1 rue de la Creusille", "codePostal": "41000", "ville": "Blois", "bureaux": ["41700 Cour-Cheverny 86 rue Nationale", "41350 Huisseau-sur-Cosson 8 rue du Pont"]},
  {"id": "annuaire-12111", "office": "SELARL DE LISLE PRINCE", "notaires": ["Marie COQUELIN DE LISLE", "Cédric PRINCE"], "email": "delisle.prince.41007@notaires.fr", "telephone": "02 54 90 29 29", "adresse": "2 rue Denis Papin", "codePostal": "41000", "ville": "Blois", "bureaux": []},
  {"id": "annuaire-12112", "office": "SAS David LECOMPTE et Cédric ROCHEREAU", "notaires": ["David LECOMPTE", "Cédric ROCHEREAU", "Carène JOURY"], "email": "negociation.41050@notaires.fr", "telephone": "02 54 77 44 23", "adresse": "15 rue Geoffroy Martel", "codePostal": "41100", "ville": "Vendôme", "bureaux": ["41160 La Ville-aux-Clercs 3 rue du Vieux Moulin", "41270 Droué 2 rue Bourgeoise", "41100 Pezou 6 rue de Vendôme"]},
  {"id": "annuaire-12113", "office": "Me Valérie GAREYTE", "notaires": ["Valérie GAREYTE"], "email": "office.gareyte@notaires.fr", "telephone": "02 54 77 12 05", "adresse": "9 faubourg Chartrain", "codePostal": "41100", "ville": "Vendôme", "bureaux": []},
  {"id": "annuaire-12115", "office": "BDL Notaires", "notaires": ["Samuel CHAUVEAU", "Sandra THEVENIN-OLIVEIRA", "Lucile BLANCHETIÈRE"], "email": "etude@bdl.notaires.fr", "telephone": "02 54 81 44 44", "adresse": "8 bis avenue Maunoury", "codePostal": "41500", "ville": "Mer", "bureaux": ["41500 Saint-Dyé-sur-Loire 115 rue Nationale"]},
  {"id": "annuaire-12116", "office": "SARL Matthieu GUYOT et Florence MARINGUE", "notaires": ["Matthieu GUYOT", "Carole PRIMAUX"], "email": "guyot.bancaud@notaires.fr", "telephone": "02 54 88 02 21", "adresse": "6 rue du Marché", "codePostal": "41600", "ville": "Lamotte-Beuvron", "bureaux": ["41210 Neung-sur-Beuvron 24 rue Henri de Geoffre"]},
  {"id": "annuaire-16824", "office": "Me Jimmy FONTAINE", "notaires": ["Jimmy FONTAINE"], "email": "jimmy.fontaine@notaires.fr", "telephone": "02 42 03 00 88", "adresse": "34 rue des Limousins", "codePostal": "41200", "ville": "Romorantin-Lanthenay", "bureaux": []},
  {"id": "annuaire-16886", "office": "SELARL LD NOTAIRES ET CONSEILS", "notaires": ["Laura DENIS"], "email": "laura.denis@notaires.fr", "telephone": "02 54 74 08 56", "adresse": "9 rue du Père Brottier", "codePostal": "41000", "ville": "Blois", "bureaux": []},
  {"id": "annuaire-17165", "office": "SELURL NOTAIRES TOURAINE VALLEE DU LOIR", "notaires": ["Prisca BRUEL"], "email": "prisca.bruel@notaires.fr", "telephone": "02 47 43 85 05", "adresse": "2 Place Fortier", "codePostal": "41100", "ville": "Villiers-sur-Loir", "bureaux": []},
  {"id": "annuaire-17252", "office": "SCP Julien SOUNALET et Stéphanie DESPRES", "notaires": ["Stéphanie DESPRES"], "email": "stephanie.despres@notaires.fr", "telephone": "02 54 83 17 44", "adresse": "114 Rue Georges Clémenceau", "codePostal": "41200", "ville": "Romorantin-Lanthenay", "bureaux": []},
  {"id": "annuaire-17765", "office": "Me Cécile SERRE", "notaires": ["Cécile SERRE"], "email": "cecile.serre@notaires.fr", "telephone": "02 46 92 97 42", "adresse": "Place du Soleil d'Or", "codePostal": "41220", "ville": "Saint-Laurent-Nouan", "bureaux": []},
  {"id": "annuaire-18153", "office": "Me Bertrand DELMOTTE", "notaires": ["Bertrand DELMOTTE"], "email": "bertrand.delmotte@notaires.fr", "telephone": "02 59 16 09 41", "adresse": "27 avenue de Vendôme", "codePostal": "41000", "ville": "Blois", "bureaux": []},
  {"id": "annuaire-18397", "office": "Me Camille GATARD", "notaires": ["Camille GATARD"], "email": "camille.gatard@notaires.fr", "telephone": "02 19 00 55 90", "adresse": "2 avenue Gambetta", "codePostal": "41000", "ville": "Blois", "bureaux": []},
  {"id": "annuaire-18410", "office": "Actanov - Office Notarial - Maître Sarah Guechi", "notaires": ["Sarah GUECHI"], "email": "office@actanov.notaires.fr", "telephone": "02 54 97 10 11", "adresse": "7 rue du 8 mai", "codePostal": "41200", "ville": "Romorantin-Lanthenay", "bureaux": []}
];

// Notre office, proposé de base dans le carnet (demandé par l'étude le 29/09) : en tête de liste,
// proposé dans les champs notaire des fiches, jamais retiré (la route refuse de le supprimer et
// la lecture le remet s'il manque). Coordonnées = celles de la signature des emails (script.js,
// COORDONNEES_EMAIL_OFFICE).
const ID_OFFICE_ETUDE = 'etude-gossart';
const OFFICE_ETUDE = {
  id: ID_OFFICE_ETUDE,
  office: 'Office Notarial de la Salamandre — Me Sophie GOSSART',
  notaires: ['Sophie GOSSART'],
  email: 'office.gossart@notaires.fr',
  telephone: '02 54 78 61 70',
  adresse: '3 rue Bout des Haies',
  codePostal: '41000',
  ville: 'Blois',
  bureaux: [],
  etude: true,
  source: 'Notre office'
};

const MAX_OFFICES = 500;
const MAX_NOTAIRES = 12;
const MAX_BUREAUX = 8;

function texte(v, max) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

// Liste blanche stricte, comme les autres blobs de `parametres`. Un office sans nom ni notaire
// n'a rien à faire dans le carnet.
function assainirOffice(brut) {
  const b = brut && typeof brut === 'object' ? brut : null;
  if (!b || typeof b.id !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(b.id)) return null;
  const notaires = Array.isArray(b.notaires)
    ? Array.from(new Set(b.notaires.map((n) => texte(n, 80)).filter(Boolean))).slice(0, MAX_NOTAIRES)
    : [];
  const office = texte(b.office, 120);
  if (!office && !notaires.length) return null;
  const email = texte(b.email, 120);
  return {
    id: b.id,
    office,
    notaires,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    telephone: texte(b.telephone, 40),
    adresse: texte(b.adresse, 160),
    codePostal: /^\d{5}$/.test(texte(b.codePostal, 5)) ? texte(b.codePostal, 5) : '',
    ville: texte(b.ville, 80),
    bureaux: Array.isArray(b.bureaux) ? b.bureaux.map((x) => texte(x, 160)).filter(Boolean).slice(0, MAX_BUREAUX) : [],
    notes: texte(b.notes, 300),
    etude: b.id === ID_OFFICE_ETUDE,
    source: texte(b.source, 80),
    modifieLe: typeof b.modifieLe === 'string' ? b.modifieLe.slice(0, 40) : ''
  };
}

function assainirCarnet(brut) {
  if (!Array.isArray(brut)) return [];
  const parId = new Map();
  for (const o of brut) {
    const propre = assainirOffice(o);
    if (propre) parId.set(propre.id, propre);
  }
  return Array.from(parId.values()).slice(0, MAX_OFFICES);
}

function carnetInitial() {
  return assainirCarnet([OFFICE_ETUDE].concat(CARNET_INITIAL_41.map((o) => Object.assign({}, o, { source: SOURCE_ANNUAIRE_41 }))));
}

// Remet notre office en tête s'il manque (carnet créé avant qu'il n'y figure). Pure.
function avecOfficeEtude(carnet) {
  const liste = Array.isArray(carnet) ? carnet : [];
  if (liste.some((o) => o && o.id === ID_OFFICE_ETUDE)) return { carnet: liste, ajoute: false };
  return { carnet: [assainirOffice(OFFICE_ETUDE)].concat(liste), ajoute: true };
}

// Annuaire des notaires unique (étude, 03/10 : « fusionner le carnet des confrères avec tous les notaires
// de France ; que la fiche dossier cherche dans l'annuaire ; le carnet n'a plus lieu d'être ») : la liste
// renvoyée aux postes = tous les offices de France, chacun remplacé par sa fiche corrigée par l'étude
// quand elle existe (même identifiant, ou même email / même téléphone pour un office saisi à la main),
// plus notre office et les offices saisis absents de l'annuaire. Le stockage `carnet-confreres` ne garde
// plus que ces corrections et ajouts. Pure.
function departementDepuisCodePostal(cp) {
  const c = String(cp || '');
  if (!/^\d{5}$/.test(c)) return '';
  if (c.startsWith('20')) return Number(c) < 20200 ? '2A' : '2B';
  if (/^9[78]/.test(c)) return c.slice(0, 3);
  return c.slice(0, 2);
}

function fusionnerCarnetEtAnnuaire(carnet, annuaire) {
  const chiffres = (t) => String(t || '').replace(/\D/g, '').slice(-9);
  const corrections = (carnet || []).filter(Boolean);
  const idsAnnuaire = new Set((annuaire || []).map((o) => o && o.id));
  const parId = new Map(corrections.map((o) => [o.id, o]));
  const parEmail = new Map();
  const parTel = new Map();
  // Rapprochement par email ou téléphone : seulement pour un office SAISI (pas un office de l'annuaire corrigé, qui a son id),
  // et seulement quand un seul office de l'annuaire porte cet email ou ce téléphone (audit 12/10 : corriger un office faisait
  // disparaître un autre office au même standard ou à la même adresse générique).
  const compte = (cle) => { const m = new Map(); for (const a of annuaire || []) { const k = a && cle(a); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
  const emailsAnnuaire = compte((a) => String(a.email || '').trim().toLowerCase());
  const telsAnnuaire = compte((a) => (chiffres(a.telephone).length === 9 ? chiffres(a.telephone) : ''));
  for (const o of corrections) {
    if (idsAnnuaire.has(o.id)) continue;
    const e = String(o.email || '').trim().toLowerCase();
    if (e && !parEmail.has(e)) parEmail.set(e, o);
    const t = chiffres(o.telephone);
    if (t.length === 9 && !parTel.has(t)) parTel.set(t, o);
  }
  const places = new Set();
  const res = [];
  const marquer = (o, base) => Object.assign({}, o, {
    departement: o.departement || (base && base.departement) || departementDepuisCodePostal(o.codePostal),
    modifie: !!o.modifieLe && !o.etude,
    annuaire: idsAnnuaire.has(o.id) || !!base
  });
  const etude = corrections.find((o) => o.etude);
  if (etude) { res.push(marquer(etude, null)); places.add(etude.id); }
  for (const a of annuaire || []) {
    if (!a) continue;
    const email = String(a.email || '').trim().toLowerCase();
    const tel = chiffres(a.telephone).length === 9 ? chiffres(a.telephone) : '';
    const c = parId.get(a.id) || (email && emailsAnnuaire.get(email) === 1 ? parEmail.get(email) : null)
      || (tel && telsAnnuaire.get(tel) === 1 ? parTel.get(tel) : null);
    if (c && places.has(c.id)) {
      // Déjà placée ailleurs (rapprochée par email ou téléphone) : cet office de l'annuaire reste tel que relevé ; le même
      // office (même id, notre office placé en tête) n'est pas doublé.
      if (c.id !== a.id) res.push(Object.assign({}, a, { modifie: false, annuaire: true }));
      continue;
    }
    if (c) {
      places.add(c.id);
      res.push(marquer(c, a));
    } else {
      res.push(Object.assign({}, a, { modifie: false, annuaire: true }));
    }
  }
  for (const c of corrections) {
    if (places.has(c.id)) continue;
    places.add(c.id);
    res.push(marquer(c, null));
  }
  return res;
}

module.exports = { fusionnerCarnetEtAnnuaire, departementDepuisCodePostal, CARNET_INITIAL_41, OFFICE_ETUDE, ID_OFFICE_ETUDE, avecOfficeEtude, SOURCE_ANNUAIRE_41, assainirOffice, assainirCarnet, carnetInitial, MAX_OFFICES };
