'use strict';
// Fenêtre d'email de CLAIRE (étude, 03/10 : répondre depuis CLAIRE, rappels envoyés sans téléchargement).
// Fonctions pures seulement ; noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('initiales, objet de réponse, formule d’usage', () => {
  assert.equal(app.initialesPersonne('Camille FOURNIER'), 'CF');
  assert.equal(app.initialesPersonne('Maître Paul DUPUIS'), 'MD');
  assert.equal(app.initialesPersonne('alex.martel@exemple.fr'), 'AF');
  assert.equal(app.initialesPersonne(''), '?');
  assert.equal(app.sujetReponse('Mon RIB'), 'RE: Mon RIB');
  assert.equal(app.sujetReponse('RE: Mon RIB'), 'RE: Mon RIB');
  assert.match(app.formuleReponseVide(true), /^Mon Cher Maître,[\s\S]*Votre bien dévoué\.$/);
  assert.match(app.formuleReponseVide(false), /^Madame, Monsieur,[\s\S]*Bien cordialement,$/);
});

test('texte modifiable : marques retirées, boutons nommés puis remis à l’envoi', () => {
  const corps = 'Bonjour,\n\nLe rendez-vous du lundi 5 octobre.\n\n{{BOUTONS}}\n\nBien cordialement,';
  const t = app.texteEditableEmail(corps);
  assert.match(t, /du lundi 5 octobre\./);
  assert.match(t, /\[Boutons de réponse\]/);
  assert.match(app.corpsDepuisTexteEditable(t, [{ libelle: 'Oui', href: 'mailto:x@y.fr' }]), /\{\{BOUTONS\}\}/);
  assert.doesNotMatch(app.corpsDepuisTexteEditable(t, null), /\{\{BOUTONS\}\}/);
});

test('poids des pièces jointes (base64 → octets) et libellé de l’historique', () => {
  assert.equal(app.poidsPiecesEmail([{ contenuBase64: 'QUJD' }, { contenuBase64: 'QUJDRA==' }]), 3 + 6);
  assert.equal(app.libelleEmailFait({ mode: 'envoye' }), 'Email envoyé');
  assert.equal(app.libelleEmailFait({ mode: 'eml' }), 'Email préparé');
});

test('« À répondre » : dernier email reçu de l’expéditeur, sans réponse depuis, 14 jours', () => {
  const n = '2026-10-03T12:00:00Z';
  const recu = { id: 'e1', sens: 'recu', date: '2026-10-02T09:00:00Z', de: { adresse: 'camille@exemple.fr' }, a: [] };
  assert.equal(app.emailARepondre(recu, [recu], [], n), true);
  const envoye = { id: 'e2', sens: 'envoye', date: '2026-10-02T10:00:00Z', de: { adresse: 'office@x.fr' }, a: ['camille@exemple.fr'] };
  assert.equal(app.emailARepondre(recu, [recu, envoye], [], n), false);
  const suivant = { id: 'e3', sens: 'recu', date: '2026-10-02T11:00:00Z', de: { adresse: 'CAMILLE@exemple.fr' }, a: [] };
  assert.equal(app.emailARepondre(recu, [recu, suivant], [], n), false);
  assert.equal(app.emailARepondre(recu, [recu], [{ geste: 'reponse:e1', prepareLe: '2026-10-02T09:30:00Z', destinataires: [] }], n), false);
  assert.equal(app.emailARepondre(recu, [recu], [{ geste: 'relance', envoyeLe: '2026-10-02T09:30:00Z', destinataires: ['camille@exemple.fr'] }], n), false);
  assert.equal(app.emailARepondre({ ...recu, date: '2026-09-10T09:00:00Z' }, [], [], n), false);
  assert.equal(app.emailARepondre(envoye, [envoye], [], n), false);
});

test('carte « Email envoyé » (05/10) : destinataire, objet, boîte, dossier, pièces, et l’envoi de repli dit en clair', () => {
  const d = { id: 'n1', nom: 'MOREAU / LAMBERT', parties: [], pieces: {} };
  const { lignes, notes } = app.lignesNotifEmailEnvoye({ a: 'a@exemple.fr, b@exemple.fr', sujet: 'RIB', de: 'julie@exemple.fr', dossierId: 'n1', pieces: 2 }, d);
  assert.strictEqual(lignes.map(l => l.join(' : ')).join(' | '),
    'À : a@exemple.fr, b@exemple.fr | Objet : RIB | De : julie@exemple.fr | Dossier : VTE - MOREAU / LAMBERT | Pièces : 2 pièces jointes');
  assert.strictEqual(notes.length, 0);
  const repli = app.lignesNotifEmailEnvoye({ a: 'a@exemple.fr', sujet: '', repli: true, sansFil: true });
  assert.strictEqual(repli.lignes.map(l => l[1]).join(' | '), 'a@exemple.fr | (sans objet)');
  assert.match(repli.notes.join(' '), /compte relié.*Envoyer en tant que.*nouvel email/);
});

// Mise en forme dans la fenêtre d'email (étude 06/10 : gras, souligné… ; pièces jointes collées ou glissées).
test('zone éditable : le corps en texte devient une ligne par bloc, marques en gras souligné, boutons nommés', () => {
  const html = app.htmlRedactionDepuisTexte('Madame,\n\nRendez-vous le lundi <ici>.\n{{BOUTONS}}');
  assert.strictEqual(html, '<div>Madame,</div><div><br></div><div>Rendez-vous le <b><u>lundi</u></b> &lt;ici&gt;.</div><div>[Boutons de réponse]</div>');
});

test('zone éditable → corps de l’email : paragraphes, gras, italique, souligné, listes, liens', () => {
  const html = '<div>Madame,</div><div><br></div><div>Merci de <b>signer</b> et <i>dater</i>,</div><div><u>avant lundi</u>.</div>'
    + '<div><br></div><ul><li>RIB</li><li>pièce d’identité</li></ul><ol><li>un</li></ol><div>Voir https://exemple.fr/a?b=1&amp;c=2 ici</div>';
  const corps = app.htmlCorpsDepuisEditeur(html, null);
  assert.strictEqual(corps, '<p style="margin:0 0 11pt;">Madame,</p>'
    + '<p style="margin:0 0 11pt;">Merci de <b>signer</b> et <i>dater</i>,<br><u>avant lundi</u>.</p>'
    + '<ul style="margin:0 0 11pt;padding-left:24pt;"><li style="margin:0 0 4pt;">RIB</li><li style="margin:0 0 4pt;">pièce d’identité</li></ul>'
    + '<ol style="margin:0 0 11pt;padding-left:24pt;"><li style="margin:0 0 4pt;">un</li></ol>'
    + '<p style="margin:0 0 11pt;">Voir <a href="https://exemple.fr/a?b=1&amp;c=2" style="color:#6D2332;">https://exemple.fr/a?b=1&amp;c=2</a> ici</p>');
});

test('zone éditable → corps : rien d’autre que la mise en forme permise (images, styles, scripts, liens javascript)', () => {
  const corps = app.htmlCorpsDepuisEditeur('<div><span style="color:red">Rouge</span><img src="x" onerror="alert(1)"><script>alert(2)</script>'
    + '<a href="javascript:alert(3)">lien</a> <a href="mailto:a@b.fr" onclick="x()">écrire</a></div>', null);
  assert.strictEqual(corps, '<p style="margin:0 0 11pt;">Rougelien <a href="mailto:a@b.fr" style="color:#6D2332;">écrire</a></p>');
  assert.strictEqual(app.htmlEditeurSur('<div onclick="x()"><b class="k">a</b><img src=x onerror=y><script>z()</script><a href="javascript:q">l</a></div>'),
    '<div><b>a</b><a>l</a></div>');
});

test('zone éditable → corps : gras sur deux lignes refermé et rouvert, boutons du sondage à leur place', () => {
  const corps = app.htmlCorpsDepuisEditeur('<div><b>un<br>deux</b></div><div><br></div><div><b>trois</b></div><div><br></div><div>[Boutons de réponse]</div>',
    [{ libelle: 'Oui', href: 'mailto:x@y.fr' }]);
  assert.match(corps, /^<p style="margin:0 0 11pt;"><b>un<\/b><br><b>deux<\/b><\/p><p style="margin:0 0 11pt;"><b>trois<\/b><\/p><table /);
  assert.match(corps, />Oui<\/a>/);
});

test('zone éditable intacte : la ligne « cliquez ici : lien » garde son lien sur les mots', () => {
  const corps = app.htmlCorpsDepuisEditeur(app.htmlRedactionDepuisTexte('Pour répondre, cliquez ici : https://exemple.fr/q'), null);
  assert.match(corps, /Pour répondre, <a href="https:\/\/exemple.fr\/q" [^>]*>cliquez ici<\/a>/);
});

test('htmlEmail : un corps déjà en HTML est posé tel quel avant la signature', () => {
  const html = app.htmlEmail('ignoré', {}, null, null, '<p style="margin:0 0 11pt;"><b>Bonjour</b></p>');
  assert.ok(html.includes('<b>Bonjour</b>'));
  assert.ok(!html.includes('ignoré'));
});

test('capture collée : nommée par la date et l’heure, un vrai nom de fichier gardé', () => {
  const d = new Date(2026, 9, 6, 14, 5, 9);
  assert.strictEqual(app.nomPieceCollee('image.png', 'image/png', d), 'Capture 06-10 14h0509.png');
  assert.strictEqual(app.nomPieceCollee('', 'image/jpeg', d), 'Capture 06-10 14h0509.jpg');
  assert.strictEqual(app.nomPieceCollee('Compromis.pdf', 'application/pdf', d), 'Compromis.pdf');
});

// Liens dans la fenêtre d'email (étude 06/10 : « détecter les liens hypertexte dans les emails rédigés et les copier-coller »).
test('liens : adresse web, www., email écrits dans le texte → liens à l’envoi ; ponctuation de fin exclue ; lien existant intact', () => {
  const corps = app.htmlCorpsDepuisEditeur('<div>Voir https://exemple.fr/a?b=1&amp;c=2, puis www.notaires.fr. Écrire à julie@exemple.fr !</div><div><a href="https://x.fr">déjà un lien https://y.fr</a></div>', null);
  assert.match(corps, /<a href="https:\/\/exemple\.fr\/a\?b=1&amp;c=2" style="color:#6D2332;">https:\/\/exemple\.fr\/a\?b=1&amp;c=2<\/a>, puis /);
  assert.match(corps, /<a href="https:\/\/www\.notaires\.fr" style="color:#6D2332;">www\.notaires\.fr<\/a>\. Écrire à <a href="mailto:julie@exemple\.fr" style="color:#6D2332;">julie@exemple\.fr<\/a> !/);
  assert.match(corps, /<a href="https:\/\/x\.fr" style="color:#6D2332;">déjà un lien https:\/\/y\.fr<\/a>/, 'pas de lien dans un lien');
  assert.strictEqual(app.hrefDepuisLienTexte('www.x.fr/page'), 'https://www.x.fr/page');
  assert.strictEqual(app.hrefDepuisLienTexte('a@b.fr'), 'mailto:a@b.fr');
  assert.strictEqual(app.hrefDepuisLienTexte('bonjour'), '');
});

test('liens : HTML collé — seuls le texte, les retours à la ligne et les liens http/mailto sont gardés', () => {
  const colle = '<html><body><style>p{color:red}</style><p>Bonjour,</p><p>Le dossier est <b>ici</b> : <a href="https://drive.exemple.fr/d/1" style="color:blue" onclick="x()">Dossier partagé</a><img src="x.png"></p>'
    + '<p>Lien douteux : <a href="javascript:alert(1)">clic</a> et une adresse en clair https://www.service-public.fr/x</p><script>alert(1)</script></body></html>';
  assert.strictEqual(app.htmlColleRedaction(colle),
    'Bonjour,<br>Le dossier est ici : <a href="https://drive.exemple.fr/d/1">Dossier partagé</a><br>Lien douteux : clic et une adresse en clair <a href="https://www.service-public.fr/x">https://www.service-public.fr/x</a>');
  // Texte brut collé : adresses détectées, retours à la ligne gardés.
  assert.strictEqual(app.htmlTexteColleRedaction('Voir www.x.fr\nou a@b.fr.'), 'Voir <a href="https://www.x.fr">www.x.fr</a><br>ou <a href="mailto:a@b.fr">a@b.fr</a>.');
  assert.strictEqual(app.htmlTexteColleRedaction(' https://x.fr '), '&nbsp;<a href="https://x.fr">https://x.fr</a>&nbsp;');
  // Ce que la zone garde entre deux rendus : le lien et son adresse.
  assert.strictEqual(app.htmlEditeurSur('<div>Voir <a href="https://x.fr">x</a></div>'), '<div>Voir <a href="https://x.fr">x</a></div>');
});

test('fenêtre d’email : une croix en haut à droite ferme la fenêtre (étude 06/10)', () => {
  const app = chargerApplication();
  const vm = require('node:vm');
  vm.runInContext("dossiers.push({ id: 'x1', nom: 'MARTEL / FOURNIER', parties: [], historique: [] })", app);
  // Le faux DOM rend un élément neuf à chaque getElementById : on garde la zone de la fenêtre pour lire ce qui y est écrit.
  const zone = app.document.createElement('div');
  const getElementById = app.document.getElementById;
  app.document.getElementById = (id) => (id === 'email-redaction-contenu' ? zone : getElementById(id));
  app.ouvrirRedactionEmail({ destinataire: 'a@exemple.fr', sujet: 'Objet', corps: 'Bonjour,', dossierId: 'x1' });
  const html = zone.innerHTML;
  assert.match(html, /<div class="redaction-tete">\s*<div class="redaction-titre"/);
  assert.match(html, /class="bouton-icone icon-btn redaction-fermer" onclick="abandonnerRedaction\(\)" title="Fermer"/);
  assert.doesNotMatch(html, /chevron-left/);
  app.abandonnerRedaction();
});

// Étude 07/10 : « bien faire attention aux liens hypertexte s'ils sont sur des mots » — la fenêtre d'email montrait l'adresse
// (« Cliquez ici … : https://… ») alors que l'email envoyé montrait les mots soulignés.
test('liens sur des mots : la fenêtre d’email montre les mots, comme l’email envoyé', () => {
  const avis = 'https://www.google.com/maps/place/Office/@47.6,1.3,15z/data=!4m7';
  const ligne = `Laisser un avis. Cliquez ici pour laisser votre avis : ${avis}`;
  const html = app.htmlRedactionDepuisTexte(ligne);
  assert.match(html, /Laisser un avis\. <a href="https:\/\/www\.google\.com\/maps\/place\/Office\/@47\.6,1\.3,15z\/data=!4m7" [^>]*>Cliquez ici pour laisser votre avis<\/a>/);
  assert.equal(app.texteDeHtmlRedaction(html).indexOf('https://'), -1, 'l’adresse ne s’affiche pas dans la fenêtre');
  // Syntaxe des modèles : [mots](adresse).
  const mots = app.ligneHtmlEmail('Merci de [remplir le questionnaire](https://exemple.fr/q?a=1&b=2) avant lundi, voir https://exemple.fr/x');
  assert.equal(mots, 'Merci de <a href="https://exemple.fr/q?a=1&amp;b=2" style="color:#6D2332;">remplir le questionnaire</a> avant lundi, voir <a href="https://exemple.fr/x" style="color:#6D2332;">https://exemple.fr/x</a>');
  // La fenêtre, puis l’envoi après une modification, gardent le lien sur les mots.
  const corps = app.htmlCorpsDepuisEditeur(app.htmlRedactionDepuisTexte('Merci de [remplir le questionnaire](https://exemple.fr/q).'), null);
  assert.match(corps, /Merci de <a href="https:\/\/exemple\.fr\/q"[^>]*>remplir le questionnaire<\/a>\./);
  // Texte brut (mailto, partie texte) : « mots : adresse ».
  assert.equal(app.texteSansMarques('Merci de [remplir le questionnaire](https://exemple.fr/q).'), 'Merci de remplir le questionnaire : https://exemple.fr/q.');
});

test('modèle d’email : un texte collé avec des liens sur des mots les garde en [mots](adresse)', () => {
  const html = '<p>Bonjour,</p><p>Merci de <a href="https://exemple.fr/q">remplir ce questionnaire</a> et de voir <a href="https://exemple.fr/site">https://exemple.fr/site</a>.</p>';
  assert.equal(app.texteModeleDepuisHtmlColle(html), 'Bonjour,\nMerci de [remplir ce questionnaire](https://exemple.fr/q) et de voir https://exemple.fr/site.');
  assert.equal(app.texteModeleDepuisHtmlColle('<p>Sans lien</p>'), '', 'sans lien : collage ordinaire');
});
