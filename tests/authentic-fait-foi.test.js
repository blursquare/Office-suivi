'use strict';
// « Authentic passe en premier partout et remplace les champs si déjà rempli. Si déjà rempli par Authentic et qu'une donnée change
// — un e-mail erroné modifié dans Authentic — une notification demande la mise à jour. Sinon la fiche ne bouge plus. »
// (étude 06/10 au soir, client/52-authentic-fait-foi.js) — noms, adresses et montants inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const ID = 'ui-ficho-tabs:mainTabPanel:tabForm2:tabContent:';
function ficheClient(o) {
  return {
    titre: 'Authentic',
    champs: [
      { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:civilite:selectOneRadio', valeur: o.civilite || 'Monsieur' },
      { groupe: '', libelle: 'Nom de famille*', valeur: o.nom || 'Martel' },
      { groupe: '', libelle: 'Prénom*', valeur: o.prenom || 'Alexandre' },
      { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:naissanceDate:naissanceDate', valeur: o.naissance || '02/03/1970' },
      { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneePrincipaleW1:Telephone:inputTelephone', valeur: o.tel || '06 98 76 54 32' },
      { groupe: '', libelle: 'Email', valeur: o.email || 'alex.martel@exemple.fr' }
    ],
    tableaux: [], texte: ''
  };
}
function capital(montant) {
  return { titre: 'Authentic', champs: [{ groupe: '', libelle: '12 - Vente MARTEL/FOURNIER', valeur: '' }, { groupe: 'Informations financières', libelle: 'Capital', valeur: montant }], tableaux: [], texte: '12 - Vente MARTEL/FOURNIER' };
}
function dossier(extra) {
  return Object.assign({ id: 'a', nom: 'MARTEL / FOURNIER', typeVente: 'maison', pieces: {}, historique: [] }, extra || {});
}

test('premier relevé : Authentic remplace l’email et le téléphone de la fiche, puis la fiche ne bouge plus', () => {
  const d = dossier({ emailVendeur: 'saisi@exemple.fr', telephoneVendeur: '06 11 11 11 11' });
  const r = app.appliquerReleveSurDossier(d, ficheClient({ email: 'erreur@exemple.fr' }));
  assert.equal(d.emailVendeur, 'erreur@exemple.fr', 'Authentic d’abord : il remplace');
  assert.equal(d.telephoneVendeur, '06 98 76 54 32');
  assert.equal(r.majEnAttente.length, 0);
  assert.ok(d.historique.some(h => /Email du vendeur repris d’Authentic : erreur@exemple\.fr \(avant : saisi@exemple\.fr\)/.test(h.texte)));
  // Même page revue : rien ne bouge, rien n'est proposé.
  const r2 = app.appliquerReleveSurDossier(d, ficheClient({ email: 'erreur@exemple.fr' }));
  assert.equal(r2.majEnAttente.length, 0);
  assert.equal(app.majsEnAttenteAuthentic(d).length, 0);
  // Correction à la main sur la fiche : Authentic n'ayant pas changé, elle reste.
  d.emailVendeur = 'corrige@exemple.fr';
  app.appliquerReleveSurDossier(d, ficheClient({ email: 'erreur@exemple.fr' }));
  assert.equal(d.emailVendeur, 'corrige@exemple.fr');
  assert.equal(app.majsEnAttenteAuthentic(d).length, 0);
});

test('Authentic corrige un email déjà repris : proposé, jamais écrit ; « Mettre à jour » l’écrit', () => {
  const d = dossier();
  app.appliquerReleveSurDossier(d, ficheClient({ email: 'erreur@exemple.fr' }));
  const r = app.appliquerReleveSurDossier(d, ficheClient({ email: 'bon@exemple.fr' }));
  assert.equal(d.emailVendeur, 'erreur@exemple.fr', 'la fiche ne bouge pas');
  assert.equal(r.majEnAttente.length, 1);
  assert.equal(r.modifie, true, 'la proposition est à enregistrer');
  const m = app.majsEnAttenteAuthentic(d)[0];
  assert.equal(m.libelle, 'Email du vendeur');
  assert.equal(m.avant, 'erreur@exemple.fr');
  assert.equal(m.apres, 'bon@exemple.fr');
  assert.ok(d.historique.some(h => /Authentic a changé — Email du vendeur : erreur@exemple\.fr → bon@exemple\.fr \(mise à jour proposée\)/.test(h.texte)));
  // Page relue : la même proposition n'est pas refaite ni renotifiée.
  const r2 = app.appliquerReleveSurDossier(d, ficheClient({ email: 'bon@exemple.fr' }));
  assert.equal(r2.majEnAttente.length, 0);
  assert.equal(app.majsEnAttenteAuthentic(d).length, 1);
  // Signal dans « Nouveau » du Suivi.
  assert.match(app.signauxDossierSuivi(d).map(s => s.texte).join(' | '), /Authentic a changé : Email du vendeur/);
  // « Mettre à jour ».
  assert.match(app.appliquerMajAuthentic(d, m.cle), /Email du vendeur mis à jour d’après Authentic : bon@exemple\.fr \(avant : erreur@exemple\.fr\)/);
  assert.equal(d.emailVendeur, 'bon@exemple.fr');
  assert.equal(app.majsEnAttenteAuthentic(d).length, 0);
  assert.equal(app.appliquerMajAuthentic(d, m.cle), '', 'déjà décidée');
  // La page relue ne propose plus rien.
  assert.equal(app.appliquerReleveSurDossier(d, ficheClient({ email: 'bon@exemple.fr' })).majEnAttente.length, 0);
});

test('« Ignorer » : la fiche reste, et Authentic ne reproposera rien tant qu’il ne change pas encore', () => {
  const d = dossier();
  app.appliquerReleveSurDossier(d, ficheClient({ email: 'erreur@exemple.fr' }));
  app.appliquerReleveSurDossier(d, ficheClient({ email: 'bon@exemple.fr' }));
  const m = app.majsEnAttenteAuthentic(d)[0];
  assert.equal(app.ignorerMajAuthentic(d, m.cle), true);
  assert.equal(d.emailVendeur, 'erreur@exemple.fr');
  assert.equal(app.majsEnAttenteAuthentic(d).length, 0);
  assert.equal(app.appliquerReleveSurDossier(d, ficheClient({ email: 'bon@exemple.fr' })).majEnAttente.length, 0);
  // Un nouveau changement d'Authentic est de nouveau proposé.
  assert.equal(app.appliquerReleveSurDossier(d, ficheClient({ email: 'encore@exemple.fr' })).majEnAttente.length, 1);
});

test('deux personnes d’un même côté : la seconde s’ajoute ; un changement ne touche que l’email de sa personne', () => {
  const d = dossier();
  app.appliquerReleveSurDossier(d, ficheClient({ prenom: 'Alexandre', email: 'alex@exemple.fr', tel: '06 98 76 54 32' }));
  app.appliquerReleveSurDossier(d, ficheClient({ prenom: 'Nadia', civilite: 'Madame', email: 'nadia@exemple.fr', tel: '06 11 22 33 44' }));
  assert.equal(d.emailVendeur, 'alex@exemple.fr; nadia@exemple.fr', 'Nadia entre sans rien changer chez Alexandre');
  assert.equal(app.majsEnAttenteAuthentic(d).length, 0);
  const r = app.appliquerReleveSurDossier(d, ficheClient({ prenom: 'Nadia', civilite: 'Madame', email: 'nadia.martel@exemple.fr', tel: '06 11 22 33 44' }));
  assert.equal(r.majEnAttente.length, 1);
  app.appliquerMajAuthentic(d, app.majsEnAttenteAuthentic(d)[0].cle);
  assert.equal(d.emailVendeur, 'alex@exemple.fr; nadia.martel@exemple.fr');
});

test('prix : Authentic remplace la première fois, puis la fiche ne bouge plus ; un nouveau prix est proposé', () => {
  const d = dossier({ prixVente: 200000 });
  app.appliquerReleveSurDossier(d, capital('245 000,00 €'));
  assert.equal(d.prixVente, 245000);
  assert.ok(d.historique.some(h => /Prix de vente repris d’Authentic \(Capital\) : 245.000,00.€ \(avant : 200.000,00.€\)/.test(h.texte)));
  // Correction à la main : elle reste tant qu'Authentic ne change pas.
  d.prixVente = 246000;
  app.appliquerReleveSurDossier(d, capital('245 000,00 €'));
  assert.equal(d.prixVente, 246000);
  // Authentic change le prix : proposé.
  const r = app.appliquerReleveSurDossier(d, capital('250 000,00 €'));
  assert.equal(d.prixVente, 246000);
  assert.equal(r.majEnAttente.length, 1);
  assert.equal(app.majsEnAttenteAuthentic(d)[0].libelle, 'Prix de vente');
  app.appliquerMajAuthentic(d, 'prixVente');
  assert.equal(d.prixVente, 250000);
  assert.equal(app.valeursAuthenticDossier(d).prixVente, 250000);
});

test('identité d’une partie : Authentic remplace la première fois ; une civilité changée ensuite est proposée', () => {
  const d = dossier({ parties: [{ role: 'VENDEUR', nom: 'MARTEL', civilite: 'Mme' }] });
  app.appliquerReleveSurDossier(d, ficheClient({ civilite: 'Monsieur' }));
  const p = d.parties.find(x => x.role === 'VENDEUR');
  assert.equal(p.civilite, 'M', 'Authentic d’abord');
  assert.equal(p.nom, 'Alexandre MARTEL');
  // Authentic corrige la civilité : proposée.
  const r = app.appliquerReleveSurDossier(d, ficheClient({ civilite: 'Madame' }));
  assert.equal(p.civilite, 'M', 'la fiche ne bouge pas');
  assert.equal(r.majEnAttente.length, 1);
  const m = app.majsEnAttenteAuthentic(d)[0];
  assert.equal(m.libelle, 'Identité de Alexandre MARTEL');
  assert.match(m.apres, /civilité Madame/);
  app.appliquerMajAuthentic(d, m.cle);
  assert.equal(p.civilite, 'Mme');
  assert.equal(d.parties.filter(x => x.role === 'VENDEUR').length, 1, 'aucun doublon');
});

test('« Compléter » (geste explicite) reprend tout d’Authentic, même ce qu’il a changé depuis', () => {
  const donnees = { intitule: 'Vente MARTEL / FOURNIER', reference: 'A 2026 00247', origine: 'pages',
    personnes: [{ id: 'p1', nom: 'MARTEL', prenom: 'Alexandre', civilite: 'M', emails: ['bon@exemple.fr'], telephones: [] }],
    immeubles: [], biens: [], parties: [], documents: [], infosAuthentic: { prix: 250000 } };
  const d = dossier({ prixVente: 200000 });
  app.appliquerReleveSurDossier(d, ficheClient({ email: 'erreur@exemple.fr' }));
  app.appliquerReleveSurDossier(d, capital('245 000,00 €'));
  // Sans « forcer » : proposé.
  app.complementDossierDepuisAuthentic(d, donnees, [d]);
  assert.equal(d.prixVente, 245000);
  assert.equal(d.emailVendeur, 'erreur@exemple.fr');
  assert.equal(app.majsEnAttenteAuthentic(d).length, 2);
  // Avec : écrit, et plus rien n'attend.
  const textes = app.complementDossierDepuisAuthentic(d, donnees, [d], { forcer: true }).join(' | ');
  assert.equal(d.prixVente, 250000);
  assert.equal(d.emailVendeur, 'bon@exemple.fr');
  assert.equal(app.majsEnAttenteAuthentic(d).length, 0);
  assert.match(textes, /prix \(avant : 245.000,00.€\)/);
});

test('type de vente et adresse : même règle', () => {
  const donnees = (type, adresse) => ({ intitule: 'Vente MARTEL / FOURNIER', origine: 'pages', personnes: [], parties: [], documents: [], biens: ['b1'],
    immeubles: [{ id: 'b1', adresse: { texte: adresse, codePostal: '41000', commune: 'BLOIS', nomVoie: 'des Lices', numero: '12' }, type, parcelles: [], lots: [] }], infosAuthentic: {} });
  const d = dossier({ typeVente: 'copropriete', adresseBien: 'TOURS (37000), 1 rue Nationale' });
  app.complementDossierDepuisAuthentic(d, donnees('maison', '12 rue des Lices 41000 BLOIS'), [d]);
  assert.equal(d.typeVente, 'maison');
  assert.equal(d.adresseBien, app.normaliserAdresse('12 rue des Lices 41000 BLOIS'));
  d.adresseBien = 'BLOIS (41000), 12 rue des Lices — corrigée à la main';
  app.complementDossierDepuisAuthentic(d, donnees('maison', '12 rue des Lices 41000 BLOIS'), [d]);
  assert.equal(d.adresseBien, 'BLOIS (41000), 12 rue des Lices — corrigée à la main', 'Authentic inchangé : la fiche ne bouge plus');
  app.complementDossierDepuisAuthentic(d, donnees('terrain', '14 rue des Lices 41000 BLOIS'), [d]);
  assert.equal(d.typeVente, 'maison');
  assert.equal(d.adresseBien, 'BLOIS (41000), 12 rue des Lices — corrigée à la main');
  assert.equal(app.majsEnAttenteAuthentic(d).map(m => m.libelle).sort().join(' | '), 'Adresse du bien | Type de vente');
});

test('la fiche montre « À mettre à jour » avec Mettre à jour / Ignorer ; oublier les données d’Authentic retire le registre', () => {
  const d = dossier();
  app.appliquerReleveSurDossier(d, ficheClient({ email: 'erreur@exemple.fr' }));
  app.appliquerReleveSurDossier(d, ficheClient({ email: 'bon@exemple.fr' }));
  const ligne = (icone, libelle, html) => `<div data-libelle="${libelle}">${html}</div>`;
  const html = app.renderMajAuthentic(d, ligne);
  assert.match(html, /À mettre à jour/);
  assert.match(html, /changé dans Authentic/);
  assert.match(html, /Email du vendeur<\/b> : erreur@exemple\.fr → bon@exemple\.fr/);
  assert.match(html, /accepterMajAuthentic\('a', 'email[^']*'\)/);
  assert.match(html, /Ignorer/);
  assert.equal(app.renderMajAuthentic(dossier(), ligne), '');
  app.oublierDonneesAuthentic(d);
  assert.equal(app.majsEnAttenteAuthentic(d).length, 0);
  assert.equal(Object.keys(app.valeursAuthenticDossier(d)).length, 0);
});

test('enregistrement : ce qu’Authentic a retenu rend la page « à enregistrer », et survit à l’import d’un dossier', () => {
  const d = dossier({ prixVente: 245000 });
  const r = app.appliquerReleveSurDossier(d, capital('245 000,00 €'));
  assert.equal(r.modifie, true, 'la valeur retenue est à enregistrer, même sans champ visible modifié');
  const conserve = app.authenticPersistable(d.authentic);
  assert.equal(conserve.valeurs.prixVente, 245000);
  d.authentic.majEnAttente = { prixVente: { type: 'champ', champ: 'prixVente', valeur: 250000, libelle: 'Prix de vente', avant: '245.000,00 €', apres: '250.000,00 €', le: '2026-10-06T10:00:00Z' } };
  assert.equal(app.authenticPersistable(d.authentic).majEnAttente.prixVente.valeur, 250000);
});

test('pastille « Mise à jour » (étude 06/10 au soir) : sur la ligne du dossier tant qu’une mise à jour attend, plus après la décision', () => {
  const d = dossier();
  app.appliquerReleveSurDossier(d, ficheClient({ email: 'erreur@exemple.fr' }));
  assert.equal(app.tagMajAuthentic(d), '', 'rien à décider : pas de pastille');
  assert.equal(app.tagNotificationsDossier(d), '');
  app.appliquerReleveSurDossier(d, ficheClient({ email: 'bon@exemple.fr' }));
  assert.match(app.tagMajAuthentic(d), /notif-maj-authentic[^>]*title="Authentic a changé : Email du vendeur[^"]*"[^>]*>.*Mise à jour/);
  assert.match(app.tagNotificationsDossier(d), /Mise à jour/);
  // Avec une pièce nouvelle, les deux pastilles se suivent.
  d.piecesNotifications = ['erp'];
  assert.match(app.tagNotificationsDossier(d), /nouvelle pièce.*Mise à jour/);
  assert.equal(app.tagMajAuthentic(Object.assign({}, d, { archive: true })), '', 'jamais sur un dossier archivé');
  app.ignorerMajAuthentic(d, app.majsEnAttenteAuthentic(d)[0].cle);
  assert.equal(app.tagMajAuthentic(d), '');
});

// Étude 07/10 : « Fiche client : choisir la civilité à partir des données d'Authentic et remplir automatiquement, idem pour la
// situation matrimoniale. »
function ficheMariee(o) {
  const f = ficheClient(o);
  f.tableaux = [{ titre: '', entete: ['Situation', 'Date', 'Conjoint'], lignes: [[o.situation || 'Marié(e)', '12/06/2010', o.conjoint || '']] }];
  return f;
}

test('fiche client : civilité choisie et situation du couple remplie d’après Authentic', () => {
  const d = dossier({ parties: [{ role: 'VENDEUR', nom: 'MARTEL' }, { role: 'VENDEUR', nom: 'Nadia DUVAL' }] });
  app.appliquerReleveSurDossier(d, ficheMariee({ civilite: 'Monsieur', conjoint: 'DUVAL Nadia' }));
  assert.equal(d.parties[0].civilite, 'M');
  assert.equal(d.situationVendeur, 'marie', 'couple marié rempli seul');
  assert.ok(d.historique.some(h => /Situation des vendeurs : Couple marié \(fiche Authentic\)/.test(h.texte)));
  app.appliquerReleveSurDossier(d, ficheMariee({ civilite: 'Madame', nom: 'Duval', prenom: 'Nadia', email: 'nadia@exemple.fr', conjoint: 'MARTEL Alexandre' }));
  assert.equal(d.parties.find(p => /DUVAL/.test(p.nom)).civilite, 'Mme');
  assert.equal(d.situationVendeur, 'marie');
});

test('situation du couple : jamais quand le conjoint nommé n’est pas l’autre personne ; pacs et concubinage lus', () => {
  const d = dossier({ parties: [{ role: 'VENDEUR', nom: 'MARTEL' }, { role: 'VENDEUR', nom: 'Paul MARTEL' }] });
  app.appliquerReleveSurDossier(d, ficheMariee({ conjoint: 'LEROY Sophie' }));
  assert.equal(d.situationVendeur, undefined, 'marié à une autre personne : les deux vendeurs ne sont pas un couple marié');
  const p = dossier({ parties: [{ role: 'VENDEUR', nom: 'MARTEL' }, { role: 'VENDEUR', nom: 'Nadia DUVAL' }] });
  app.appliquerReleveSurDossier(p, ficheMariee({ situation: 'Pacte civil de solidarité', conjoint: 'Nadia DUVAL' }));
  assert.equal(p.situationVendeur, 'pacse');
  const c = dossier({ parties: [{ role: 'VENDEUR', nom: 'MARTEL' }, { role: 'VENDEUR', nom: 'Nadia DUVAL' }] });
  app.appliquerReleveSurDossier(c, ficheMariee({ situation: 'Union libre' }));
  assert.equal(c.situationVendeur, 'concubin');
});

test('situation du couple : Authentic d’abord, puis la fiche ne bouge plus, un changement est proposé', () => {
  const d = dossier({ situationVendeur: 'concubin', parties: [{ role: 'VENDEUR', nom: 'MARTEL' }, { role: 'VENDEUR', nom: 'Nadia DUVAL' }] });
  app.appliquerReleveSurDossier(d, ficheMariee({ conjoint: 'DUVAL Nadia' }));
  assert.equal(d.situationVendeur, 'marie', 'la première fois, Authentic remplace');
  assert.ok(d.historique.some(h => /avant : Concubins/.test(h.texte)));
  d.situationVendeur = 'concubin';  // correction à la main
  app.appliquerReleveSurDossier(d, ficheMariee({ conjoint: 'DUVAL Nadia' }));
  assert.equal(d.situationVendeur, 'concubin', 'Authentic n’a pas changé : la correction reste');
  app.appliquerReleveSurDossier(d, ficheMariee({ situation: 'Pacte civil de solidarité', conjoint: 'DUVAL Nadia' }));
  assert.equal(d.situationVendeur, 'concubin', 'changement d’Authentic : proposé, pas écrit');
  assert.ok(app.majsEnAttenteAuthentic(d).some(m => m.libelle === 'Situation des vendeurs' && m.apres === 'Couple pacsé'));
});

test('compléter depuis Authentic : civilité et situation des parties déjà sur la fiche', () => {
  const d = dossier({ parties: [{ role: 'ACQUEREUR', nom: 'FOURNIER' }, { role: 'ACQUEREUR', nom: 'Léo BRUNET' }] });
  const sm = (conjoint) => ({ situation: 'Marié(e)', date: '', conjoint, contrat: '', regime: '', dateMariage: '' });
  const donnees = {
    intitule: 'VTE MARTEL / FOURNIER BRUNET',
    personnes: [
      { id: 'p1', nom: 'FOURNIER', prenom: 'Camille', civilite: 'Madame', emails: [], telephones: [], situationMatrimoniale: sm('BRUNET Léo') },
      { id: 'p2', nom: 'BRUNET', prenom: 'Léo', civilite: 'Monsieur', emails: [], telephones: [], situationMatrimoniale: sm('FOURNIER Camille') }
    ],
    parties: [], documents: [], immeubles: []
  };
  const textes = app.complementDossierDepuisAuthentic(d, donnees, [d]);
  const civ = d.parties.map(p => p.nom + ':' + p.civilite).join(',');
  assert.equal(civ, 'Camille FOURNIER:Mme,Léo BRUNET:M');
  assert.equal(d.situationAcquereur, 'marie');
  assert.ok(textes.some(t => /Situation des acquéreurs : Couple marié/.test(t)));
});
