const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { chargerApplication } = require('./helpers/load-app');

// Import d'un export Authentic (« Nouveau dossier ») : lecture du ZIP, du DATA.xml (format
// d'interopérabilité notaires.fr) et du Word de l'acte. Structure reprise d'un export réel
// (30/09/2026), noms, adresses et documents inventés.

const app = chargerApplication();

const DATA_XML = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<flux xmlns="http://notaires.fr/interoperabilite/1.0" xmlns:ns2="http://notaires.fr/interoperabilite-core">
    <personnePhysique id="">
        <intitule>Monsieur DURAND Paul</intitule>
        <etatCivil>
            <civilite>Monsieur</civilite>
            <nom>DURAND</nom>
            <nomUsage>DURAND</nomUsage>
            <dateNaissance precision="Jour">1980-03-02+01:00</dateNaissance>
            <libelleCommuneNaissance>BLOIS</libelleCommuneNaissance>
        </etatCivil>
        <contact>
            <civilite>Monsieur</civilite>
            <prenom>Paul</prenom>
            <nom>DURAND</nom>
            <adresse type="PRINCIPALE">
                <voie><numero>12</numero><typeVoie>rue</typeVoie><voie>des Lilas</voie></voie>
                <lieu-dit></lieu-dit>
                <codeCommunePostal>41000</codeCommunePostal>
                <localite>BLOIS</localite>
            </adresse>
            <telephone type="PRINCIPALE"></telephone>
        </contact>
        <situation><profession>boulanger</profession></situation>
        <document id="AUTH-1">
            <dateCreation>2026-07-21T00:00:00.000+02:00</dateCreation>
            <intitule>COMEDEC_NAISSANCE_DURAND_PAUL</intitule>
            <fichier><uri>client1\\COMEDEC_NAISSANCE_DURAND_PAUL.pdf</uri><nomFichier>COMEDEC_NAISSANCE_DURAND_PAUL.pdf</nomFichier></fichier>
        </document>
    </personnePhysique>
    <personnePhysique>
        <intitule>Madame MARTIN Claire</intitule>
        <etatCivil>
            <civilite>Madame</civilite>
            <nom>MARTIN</nom>
            <nomUsage>LEROY</nomUsage>
        </etatCivil>
        <contact>
            <prenom>Claire</prenom>
            <nom>MARTIN</nom>
            <email type="PRINCIPALE">claire.martin@exemple.fr;autre@exemple.fr</email>
        </contact>
        <donneeComplementaire nom="authentic_persphysique_autreprenoms" type="String">Anne</donneeComplementaire>
    </personnePhysique>
    <personnePhysique>
        <intitule>Monsieur BERNARD Luc</intitule>
        <etatCivil><civilite>Monsieur</civilite><nom>BERNARD</nom></etatCivil>
        <contact><prenom>Luc</prenom><nom>BERNARD</nom></contact>
    </personnePhysique>
    <immeuble id="AUTH-IMM-1">
        <localisation>
            <adresse type="route">
                <voie><numero>5</numero><typeVoie>impasse</typeVoie><voie>des Roses</voie></voie>
                <codeCommunePostal>41350</codeCommunePostal>
                <localite>VINEUIL</localite>
            </adresse>
        </localisation>
        <lot>
            <description>comprenant : un séjour &amp; une cuisine</description>
            <maison><usage>HA</usage><surfaceHabitable>92</surfaceHabitable></maison>
        </lot>
    </immeuble>
    <dossier id="AUTH-DOS-1">
        <dateCreation>2026-06-16T00:00:00.000+02:00</dateCreation>
        <intitule>VTE DURAND / MARTIN</intitule>
        <type>Autre</type>
        <parties>
            <partie>
                <type>Disposant</type>
                <personne ref=""/>
                <notaire><prenom>Jeanne</prenom><nom>LEFEBVRE</nom><ville>ORLEANS</ville><codeCRPCEN>045001</codeCRPCEN></notaire>
                <roleNotaire>Participation</roleNotaire>
            </partie>
            <partie><type>Beneficiaire</type><personne/></partie>
        </parties>
        <intervenants>
            <intervenant id=""><intitule>M. DURAND Paul</intitule><contact><civilite>Monsieur</civilite><String>Paul</String><String>DURAND</String></contact></intervenant>
        </intervenants>
        <biens><bien><immeubleLot ref="AUTH-IMM-1"/></bien></biens>
        <document id="AUTH-2">
            <dateCreation>2026-08-12T00:00:00.000+02:00</dateCreation>
            <intitule>Renonciation au DPU</intitule>
            <fichier><uri>sous2\\Renonciation au DPU.pdf</uri><nomFichier>Renonciation au DPU.pdf</nomFichier></fichier>
        </document>
        <document id="AUTH-3">
            <intitule>Cu a)</intitule>
            <fichier><uri>sous2\\Cu a).pdf</uri><nomFichier>Cu a).pdf</nomFichier></fichier>
        </document>
        <document id="AUTH-4">
            <intitule>facture fenêtre</intitule>
            <fichier><uri>sous2\\facture fenêtre.pdf</uri><nomFichier>facture fenêtre.pdf</nomFichier></fichier>
        </document>
        <documentActe id="AUTH-DOS-1">
            <intitule>Vente DURAND / MARTIN</intitule>
            <version>
                <dateActe precision="Jour">2026-06-16+02:00</dateActe>
                <fichier><uri>Sous2\\AC_1.doc</uri><nomFichier>AC_1.doc</nomFichier></fichier>
            </version>
        </documentActe>
    </dossier>
</flux>`;

// ZIP minimal (entrées stockées ou deflate), noms à la Windows comme Authentic.
function construireZip(fichiers) {
  const locaux = [];
  const centraux = [];
  let position = 0;
  for (const { nom, contenu, deflate } of fichiers) {
    const nomOctets = Buffer.from(nom, 'utf8');
    const donnees = Buffer.from(contenu);
    const compresse = deflate ? zlib.deflateRawSync(donnees) : donnees;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(compresse.length, 18); local.writeUInt32LE(donnees.length, 22); local.writeUInt16LE(nomOctets.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(compresse.length, 20); central.writeUInt32LE(donnees.length, 24); central.writeUInt16LE(nomOctets.length, 28);
    central.writeUInt32LE(position, 42);
    locaux.push(local, nomOctets, compresse);
    centraux.push(central, nomOctets);
    position += 30 + nomOctets.length + compresse.length;
  }
  const repertoire = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(fichiers.length, 8); fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(repertoire.length, 12); fin.writeUInt32LE(position, 16);
  return new Uint8Array(Buffer.concat([...locaux, repertoire, fin]));
}

test('ZIP : répertoire lu, séparateurs « \\ » d’Authentic ramenés à « / », noms accentués', () => {
  const zip = construireZip([
    { nom: 'DATA.xml', contenu: DATA_XML, deflate: true },
    { nom: 'sous2\\Arrêté alignement.pdf', contenu: '%PDF-1.4' }
  ]);
  const entrees = app.entreesZip(zip);
  assert.strictEqual(entrees.map(e => e.nom).join('|'), 'DATA.xml|sous2/Arrêté alignement.pdf');
  assert.strictEqual(entrees[0].methode, 8);
  const stocke = entrees[1];
  assert.strictEqual(Buffer.from(zip.subarray(stocke.debut, stocke.debut + stocke.taille)).toString(), '%PDF-1.4');
  // Chemin du XML (« Sous2\… ») retrouvé malgré la casse.
  assert.strictEqual(app.entreeZipParChemin(entrees, 'SOUS2\\Arrêté alignement.pdf').nom, 'sous2/Arrêté alignement.pdf');
  assert.throws(() => app.entreesZip(new Uint8Array([1, 2, 3])), /ZIP/);
});

test('XML : arbre minimal, entités décodées, préfixes d’espace de noms retirés', () => {
  const a = app.arbreXml('<?xml version="1.0"?><ns:a x="1 &amp; 2"><b>l&apos;été</b><c/><![CDATA[<brut>]]></ns:a>');
  const racine = a.enfants[0];
  assert.strictEqual(racine.nom, 'a');
  assert.strictEqual(racine.attrs.x, '1 & 2');
  assert.strictEqual(app.texteXml(racine, 'b'), "l'été");
  assert.strictEqual(racine.enfants.map(e => e.nom).join(','), 'b,c');
  assert.strictEqual(racine.texte, '<brut>');
});

test('export : personnes, bien, parties par l’intitulé « VTE VENDEUR / ACQUÉREUR », notaires', () => {
  const d = app.lireExportAuthentic(DATA_XML);
  assert.strictEqual(d.intitule, 'VTE DURAND / MARTIN');
  assert.strictEqual(d.personnes.length, 3);
  assert.strictEqual(d.personnes[1].nomUsage, 'LEROY');
  assert.strictEqual(d.personnes[1].emails.join(','), 'claire.martin@exemple.fr,autre@exemple.fr');
  assert.strictEqual(d.personnes[0].dateNaissance, '1980-03-02');
  assert.strictEqual(d.acte.chemin, 'Sous2/AC_1.doc');
  assert.strictEqual(d.documents.length, 3);
  assert.strictEqual(d.documentsPersonnes[0].personne, 'Paul DURAND');
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

test('export : parties par référence quand Authentic la remplit', () => {
  const xml = DATA_XML.replace('<personnePhysique id="">', '<personnePhysique id="P1">')
    .replace('<type>Disposant</type>\n                <personne ref=""/>', '<type>Disposant</type>\n                <personne ref="P1"/>')
    .replace('VTE DURAND / MARTIN</intitule>\n        <type>', 'Dossier sans intitulé normalisé</intitule>\n        <type>');
  const parties = app.partiesExportAuthentic(app.lireExportAuthentic(xml));
  assert.strictEqual(parties.map(p => `${p.nom}:${p.role}`).join('|'), 'Paul DURAND:VENDEUR');
});

test('export : un dossier de succession est reconnu (pas encore suivi par CLAIRE)', () => {
  const xml = DATA_XML.replace('VTE DURAND / MARTIN', 'SUCC DURAND').replace('<type>Disposant</type>', '<type>Defunt</type>').replace('<type>Beneficiaire</type>', '<type>Heritier</type>');
  assert.strictEqual(app.typeAffaireAuthentic(app.lireExportAuthentic(xml)), 'succession');
});

test('extraction complétée : parties, adresse, type, email, nom du dossier et notaires repris d’Authentic', () => {
  const d = app.lireExportAuthentic(DATA_XML);
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
  const d = app.lireExportAuthentic(DATA_XML);
  const pieces = app.piecesExportAuthentic(d, app.checklistPieces('maison'));
  const cles = pieces.map(p => p.cle).join(',');
  assert.ok(cles.includes('renonciationPreemption'), cles);
  assert.ok(cles.includes('certificatUrbanisme'), cles);
  assert.strictEqual(pieces.find(p => p.cle === 'renonciationPreemption').fichier, 'Renonciation au DPU.pdf');
});

test('Word de l’acte : texte par paragraphe, codes de fusion d’Authentic retirés', () => {
  const doc = '<w:document><w:body>'
    + '<w:p><w:r><w:t>{VIDA:AJ1P}</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t xml:space="preserve">L\'AN [:V_41.1]DEUX MILLE VINGT-SIX[:V_41.1]</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>BLOC | DEBUT 1_PERS | BLOC</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>[:1H_102.1]Monsieur Paul DURAND[:1H_102.1], </w:t></w:r><w:r><w:t>boulanger &amp; pâtissier</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>TELEACTES | COMPARUTION DES PARTIES | TELEACTES</w:t></w:r></w:p>'
    + '</w:body></w:document>';
  assert.strictEqual(app.texteDepuisDocumentWord(doc), "L'AN DEUX MILLE VINGT-SIX\nMonsieur Paul DURAND, boulanger & pâtissier");
});

test('avant-contrat signé en PDF repéré parmi les documents, jamais un projet', () => {
  const avec = { documents: [{ nomFichier: 'Projet de compromis.pdf', intitule: '' }, { nomFichier: 'Compromis signé.pdf', intitule: 'Compromis signé' }] };
  assert.strictEqual(app.avantContratExportAuthentic(avec).nomFichier, 'Compromis signé.pdf');
  assert.strictEqual(app.avantContratExportAuthentic({ documents: [{ nomFichier: 'Projet de compromis.pdf', intitule: '' }] }), null);
});

test('Word de l’acte : l’avant-contrat se reconnaît, l’acte de vente non (ses dates ne sont pas reprises)', () => {
  assert.strictEqual(app.acteAuthenticEstAvantContrat({ acte: { intitule: 'Compromis DURAND / MARTIN' } }, ''), true);
  assert.strictEqual(app.acteAuthenticEstAvantContrat({ acte: { intitule: 'Vente DURAND / MARTIN' } }, "L'AN DEUX MILLE VINGT-SIX A reçu le présent acte authentique VENTE D'IMMEUBLE"), false);
});
