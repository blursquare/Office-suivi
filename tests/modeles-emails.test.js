'use strict';
// Modèles d'emails (étude, 03/10) : chaque modèle d'origine « à variables » redonne, rempli, le texte des fonctions
// construireEmail… (mot pour mot) ; un modèle modifié par l'étude passe avant ; variables, conditions. Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const dans = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const BASE = { id: 'm1', nom: 'MARTEL / FOURNIER', roleNotaire: 'instrumentaire', parties: [], historique: [] };
const CONFRERE = { notaireVendeur: 'Maître Sophie GOSSART (Blois)', notaireAcquereur: 'Maître Paul DUPUIS (Tours)', roleNotaire: 'instrumentaire' };
const CAS = [
  { ...BASE },
  { ...BASE, nomAgence: 'ORPI Blois', pret: dans(20), ventebien: dans(10), rendezVousSignature: dans(30), rendezVousSignatureHeure: '10:30' },
  { ...BASE, pret: dans(-5), ventebien: dans(-3), rendezVousSignature: dans(5), sansPret: false, offrePretStatut: 'recue' },
  { ...BASE, ...CONFRERE, rendezVousSignature: dans(12), rendezVousSignatureHeure: '14:00', ventebien: dans(8) },
  { ...BASE, sansPret: true, rendezVousSignature: dans(3), rendezVousSignatureHeure: '09:00' }
];
const sansMarques = (t) => app.texteSansMarques(t);

test('chaque modèle d’origine, rempli, redonne le texte actuel (objet et corps)', () => {
  for (const m of app.modelesEmailIntegres()) {
    for (const d of CAS) {
      const confrere = app.notaireParticipantRepresenteAcquereur(d);
      if (/Confrere$/.test(m.cle) !== confrere && ['ventePrealable', 'ventePrealableConfrere', 'confirmationRdv', 'confirmationRdvConfrere'].includes(m.cle)) continue;
      // Sans rendez-vous, ces emails ne sont jamais proposés (le texte d'origine y laissait « le , »).
      if (!d.rendezVousSignature && ['confirmationRdv', 'confirmationRdvConfrere', 'relanceFonds'].includes(m.cle)) continue;
      const attendu = m.construire(d);
      const obtenu = app.remplirModeleEmail(m, d);
      assert.equal(obtenu.sujet, attendu.sujet, `${m.cle} (objet)`);
      assert.equal(sansMarques(obtenu.corps), sansMarques(attendu.corps), `${m.cle} (corps) — ${JSON.stringify(d)}`);
    }
  }
});

test('un modèle modifié par l’étude passe avant le texte d’origine ; variante du confrère choisie seule', () => {
  const d = { ...BASE, rendezVousSignature: '2026-11-02', rendezVousSignatureHeure: '11:00' };
  const etat = { modifies: { rib: { sujet: 'Votre RIB — {dossier}', corps: 'Bonjour,\n\nMerci d’apporter votre RIB le {date et heure du rendez-vous}.\n\nCordialement,' } }, perso: [] };
  const r = app.emailDepuisModele('rib', d, etat);
  assert.equal(r.sujet, 'Votre RIB — VTE - MARTEL / FOURNIER');
  assert.match(sansMarques(r.corps), /le lundi 2 novembre 2026 à 11h\./);
  assert.equal(app.emailDepuisModele('provision', d, etat).sujet, app.construireEmailRelanceProvision(d).sujet);
  const etatConf = { modifies: { confirmationRdvConfrere: { sujet: 'Conf — {dossier}', corps: 'Mon Cher Maître,\n\nTexte confrère.' } }, perso: [] };
  assert.equal(app.emailDepuisModele('confirmationRdv', { ...d, ...CONFRERE }, etatConf).sujet, 'Conf — VTE - MARTEL / FOURNIER');
  assert.notEqual(app.emailDepuisModele('confirmationRdv', d, etatConf).sujet, 'Conf — VTE - MARTEL / FOURNIER');
});

test('variables et conditions : paragraphe retiré si vide ou condition fausse, inconnue laissée, apostrophe indifférente', () => {
  const d = { ...BASE, nomAgence: 'Century 21' };
  const r = app.remplirModeleEmail({ sujet: 'Objet {dossier}', corps: 'A {l\'agence}.\n\nB {date et heure du rendez-vous}.\n\n{si rendez-vous}C.\n\n{si client}D.\n\n{si confrère}E.\n\nF {inconnue}.' }, d);
  assert.equal(r.corps, 'A l\'agence Century 21.\n\nD.\n\nF {inconnue}.');
  assert.equal(app.remplirModeleEmail({ sujet: 's', corps: 'x {dossier}' }, null).corps, 'x {dossier}');
});
