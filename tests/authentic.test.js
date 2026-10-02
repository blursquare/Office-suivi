const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

// Données d'un dossier Authentic au format commun (pages relevées par l'extension, ou ancien export
// ZIP retiré le 02/10) : parties, bien, notaires, pièces. Structure reprise d'un export réel
// (30/09/2026), noms, adresses et documents inventés.

const app = chargerApplication();

const DONNEES = {
  "intitule": "VTE DURAND / MARTIN",
  "type": "Autre",
  "dateCreation": "2026-06-16",
  "personnes": [
    {
      "id": "",
      "index": 0,
      "civilite": "Monsieur",
      "nom": "DURAND",
      "prenom": "Paul",
      "nomUsage": "",
      "autresPrenoms": "",
      "dateNaissance": "1980-03-02",
      "lieuNaissance": "BLOIS",
      "adresse": {
        "numero": "12",
        "typeVoie": "rue",
        "nomVoie": "des Lilas",
        "lieuDit": null,
        "codePostal": "41000",
        "commune": "BLOIS",
        "departement": "41",
        "texte": "12 rue des Lilas 41000 BLOIS"
      },
      "emails": [],
      "telephones": [],
      "profession": "boulanger",
      "documents": [
        {
          "intitule": "COMEDEC_NAISSANCE_DURAND_PAUL",
          "nomFichier": "COMEDEC_NAISSANCE_DURAND_PAUL.pdf",
          "chemin": "client1/COMEDEC_NAISSANCE_DURAND_PAUL.pdf",
          "date": "2026-07-21",
          "personne": "Paul DURAND"
        }
      ]
    },
    {
      "id": "",
      "index": 1,
      "civilite": "Madame",
      "nom": "MARTIN",
      "prenom": "Claire",
      "nomUsage": "LEROY",
      "autresPrenoms": "Anne",
      "dateNaissance": "",
      "lieuNaissance": "",
      "adresse": null,
      "emails": [
        "claire.martin@exemple.fr",
        "autre@exemple.fr"
      ],
      "telephones": [],
      "profession": "",
      "documents": []
    },
    {
      "id": "",
      "index": 2,
      "civilite": "Monsieur",
      "nom": "BERNARD",
      "prenom": "Luc",
      "nomUsage": "",
      "autresPrenoms": "",
      "dateNaissance": "",
      "lieuNaissance": "",
      "adresse": null,
      "emails": [],
      "telephones": [],
      "profession": "",
      "documents": []
    }
  ],
  "immeubles": [
    {
      "id": "AUTH-IMM-1",
      "adresse": {
        "numero": "5",
        "typeVoie": "impasse",
        "nomVoie": "des Roses",
        "lieuDit": null,
        "codePostal": "41350",
        "commune": "VINEUIL",
        "departement": "41",
        "texte": "5 impasse des Roses 41350 VINEUIL"
      },
      "type": "maison",
      "parcelles": [],
      "surface": 92,
      "description": "comprenant : un séjour & une cuisine"
    }
  ],
  "parties": [
    {
      "type": "Disposant",
      "personneRef": "",
      "notaire": {
        "prenom": "Jeanne",
        "nom": "LEFEBVRE",
        "ville": "ORLEANS",
        "crpcen": "045001"
      },
      "roleNotaire": "Participation"
    },
    {
      "type": "Beneficiaire",
      "personneRef": "",
      "notaire": null,
      "roleNotaire": ""
    }
  ],
  "intervenants": [
    {
      "intitule": "M. DURAND Paul",
      "prenom": "Paul",
      "nom": "DURAND"
    }
  ],
  "biens": [
    "AUTH-IMM-1"
  ],
  "documents": [
    {
      "intitule": "Renonciation au DPU",
      "nomFichier": "Renonciation au DPU.pdf",
      "chemin": "sous2/Renonciation au DPU.pdf",
      "date": "2026-08-12",
      "personne": null
    },
    {
      "intitule": "Cu a)",
      "nomFichier": "Cu a).pdf",
      "chemin": "sous2/Cu a).pdf",
      "date": "",
      "personne": null
    },
    {
      "intitule": "facture fenêtre",
      "nomFichier": "facture fenêtre.pdf",
      "chemin": "sous2/facture fenêtre.pdf",
      "date": "",
      "personne": null
    }
  ],
  "documentsPersonnes": [
    {
      "intitule": "COMEDEC_NAISSANCE_DURAND_PAUL",
      "nomFichier": "COMEDEC_NAISSANCE_DURAND_PAUL.pdf",
      "chemin": "client1/COMEDEC_NAISSANCE_DURAND_PAUL.pdf",
      "date": "2026-07-21",
      "personne": "Paul DURAND"
    }
  ],
  "acte": {
    "intitule": "Vente DURAND / MARTIN",
    "date": "2026-06-16",
    "chemin": "Sous2/AC_1.doc",
    "nomFichier": "AC_1.doc"
  },
  "notaireRedacteur": null
};
const donnees = (modif) => Object.assign(JSON.parse(JSON.stringify(DONNEES)), modif || {});

test('dossier Authentic : bien, parties par l’intitulé « VTE VENDEUR / ACQUÉREUR », notaires', () => {
  const d = donnees();
  assert.strictEqual(app.typeAffaireAuthentic(d), 'vente');

  const bien = app.bienExportAuthentic(d);
  assert.strictEqual(bien.type, 'maison');
  assert.strictEqual(bien.surface, 92);
  assert.strictEqual(bien.description, 'comprenant : un séjour & une cuisine');
  assert.strictEqual(app.normaliserAdresse(bien.adresse.texte), 'VINEUIL (41350), 5 impasse des Roses');

  // Références de parties vides (cas réel) : l'intitulé départage ; BERNARD n'est pas partie.
  const parties = app.partiesExportAuthentic(d);
  assert.strictEqual(parties.map(p => `${p.nom}:${p.role}`).join('|'), 'Paul DURAND:VENDEUR|Claire MARTIN:ACQUEREUR');
  assert.strictEqual(parties[1].nomUsage, 'LEROY');

  // Confrère en participation pour le vendeur : l'étude reçoit l'acte, côté acquéreur.
  const n = app.notairesExportAuthentic(d);
  assert.strictEqual(n.statut, 'CONFIRMED');
  assert.strictEqual(n.roleEtude, 'instrumentaire');
  assert.strictEqual(n.vendeur.nom, 'Jeanne LEFEBVRE');
  assert.strictEqual(n.acquereur.nom, 'Sophie GOSSART');
  assert.strictEqual(n.instrumentaire.nom, 'Sophie GOSSART');
});

test('dossier Authentic : parties par référence quand Authentic la remplit', () => {
  const d = donnees({ intitule: 'Dossier sans intitulé normalisé' });
  d.personnes[0].id = 'P1';
  d.parties[0].personneRef = 'P1';
  const parties = app.partiesExportAuthentic(d);
  assert.strictEqual(parties.map(p => `${p.nom}:${p.role}`).join('|'), 'Paul DURAND:VENDEUR');
});

test('dossier Authentic : une succession est reconnue', () => {
  const d = donnees({ intitule: 'SUCC DURAND' });
  d.parties[0].type = 'Defunt'; d.parties[1].type = 'Heritier';
  assert.strictEqual(app.typeAffaireAuthentic(d), 'succession');
});

test('extraction complétée : parties, adresse, type, email, nom du dossier et notaires repris d’Authentic', () => {
  const d = donnees();
  const e = app.completerExtractionDepuisAuthentic(app.construireExtractionRegex('', '', [], ''), d);
  assert.strictEqual(e.champs.nom.valeur, 'DURAND / MARTIN');
  assert.strictEqual(e.champs.nom.origine, 'authentic');
  assert.strictEqual(e.champs.emailAcquereur.valeur, 'claire.martin@exemple.fr');
  assert.strictEqual(e.champs.typeVente.valeur, 'maison');
  assert.strictEqual(e.bien.adresse.commune, 'VINEUIL');
  assert.strictEqual(e.parties.length, 2);
  assert.strictEqual(e.notaires.roleEtude, 'instrumentaire');
  assert.strictEqual(app.origineRevision(e.champs.nom).texte, 'Reprise d’Authentic');
  // Ce qui est enregistré sur le dossier garde le format habituel.
  const inst = app.instantaneExtraction(e);
  assert.strictEqual(inst.parties.map(p => `${p.nom}/${p.role}/${p.nomUsage || ''}`).join('|'), 'Paul DURAND/VENDEUR/|Claire MARTIN/ACQUEREUR/LEROY');
});

test('pièces de la checklist reconnues par le nom des documents de l’export', () => {
  const d = donnees();
  const pieces = app.piecesExportAuthentic(d, app.checklistPieces('maison'));
  const cles = pieces.map(p => p.cle).join(',');
  // Vente : les pièces d'urbanisme ne sont jamais reprises d'Authentic (étude, 02/10).
  assert.ok(!cles.includes('renonciationPreemption') && !cles.includes('certificatUrbanisme'), cles);
  // Succession : reprises.
  const succ = app.piecesExportAuthentic(Object.assign({}, d, { intitule: 'SUCC DURAND' }), app.checklistPieces('maison')).map(p => p.cle).join(',');
  assert.ok(succ.includes('renonciationPreemption') && succ.includes('certificatUrbanisme'), succ);
  assert.strictEqual(app.piecesExportAuthentic(Object.assign({}, d, { intitule: 'SUCC DURAND' }), app.checklistPieces('maison')).find(p => p.cle === 'renonciationPreemption').fichier, 'Renonciation au DPU.pdf');
});

test('partiesExportAuthentic : l\'épouse absente de l\'intitulé prend le côté de son conjoint', () => {
  const p = (nom, prenom, conjoint) => ({ id: '', nom, prenom, nomUsage: '', emails: [], telephones: [], documents: [],
    situationMatrimoniale: conjoint ? { situation: 'Marié(e)', date: '', conjoint, contrat: '', regime: '', dateMariage: '' } : null });
  const d = { intitule: 'VTE MARCHAIS / LEBON', personnes: [p('MARCHAIS', 'Paul', 'BERTIN Odile'), p('BERTIN', 'Odile', 'MARCHAIS Paul'), p('LEBON', 'Lucie'), p('INCONNU', 'Tom', 'NUL Personne')], parties: [] };
  const parties = app.partiesExportAuthentic(d);
  assert.equal(parties.map(x => x.nom + ':' + x.role).join(','), 'Paul MARCHAIS:VENDEUR,Odile BERTIN:VENDEUR,Lucie LEBON:ACQUEREUR');
});
