// Test de fumée (04/10) : la page chargée dans un vrai Chromium, servie par le vrai serveur (base en mémoire, dossiers
// inventés), chaque écran ouvert, une fiche de chaque sorte — et AUCUNE erreur d'exécution. C'est le filet que le lint et les
// tests unitaires n'offrent pas : un ordre de chargement faux, un `undefined.x` au rendu, un sélecteur disparu.
// Lancé par `npm run fumee` (racine) et par la construction du .exe. Les CDN sont coupés (réseau interdit) : les erreurs de
// chargement de ressources externes sont attendues et ignorées, tout le reste compte.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { creerApp } = require(path.join(racine, 'server', 'src', 'app.js'));
const { ouvrirDb } = require(path.join(racine, 'server', 'src', 'db.js'));

const dans = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const hist = (texte) => [{ date: dans(-12) + 'T09:00:00', texte }];
// Noms, adresses et montants inventés (contrainte n° 7 de CLAUDE.md).
const DOSSIERS = [
  { id: 'f1', nom: 'MOREAU / LAMBERT', responsable: 'Julie VASSELIN', typeVente: 'maison', emailAcquereur: 'acquereur@exemple.fr',
    roleNotaire: 'instrumentaire', rendezVousSignature: dans(9), rendezVousSignatureHeure: '10:30', pret: dans(5), prixVente: 245000,
    bien: { adresse: 'BLOIS (41000), 12 rue des Lices' }, parties: [{ role: 'VENDEUR', nom: 'MOREAU', prenom: 'Paul' }, { role: 'ACQUEREUR', nom: 'LAMBERT', prenom: 'Claire' }],
    pieces: {}, historique: hist('Dossier créé'), dossierLie: true },
  { id: 'f2', nom: 'ABIME', responsable: 'Julie VASSELIN', pieces: 'texte', parties: 'x', historique: { a: 1 }, rendezVousSignature: 12345, echeancesValidees: 'oui' },
  { id: 'f3', nom: 'DURAND', responsable: 'Julie VASSELIN', typeAffaire: 'succession', sansPret: true, parties: [{ role: 'PARTIE', nom: 'DURAND', prenom: 'Marie' }], biens: [], pieces: {}, historique: hist('Dossier créé') },
  { id: 'f4', nom: 'PETIT / ROUX', responsable: 'Jérémy SAUJOT', archive: true, archiveLe: dans(-20), rendezVousSignature: dans(-30), echeancesValidees: { acte: true, rendezVousSignature: true }, pieces: {}, parties: [], historique: hist('Dossier créé') }
];
const ONGLETS = ['suivi', 'assistant', 'agenda', 'scans', 'nouveau', 'confreres', 'calculateur', 'appel-fonds', 'quotites', 'preemption', 'prorata', 'inventaire', 'analyse-ia', 'reglages', 'dashboard'];
const ONGLETS_FICHE = ['tableau', 'pieces', 'dossier', 'fonds', 'echanges', 'historique'];

const db = ouvrirDb(':memory:');
const { app, depot } = creerApp({ db, config: { racineRepo: racine, authActive: false, estSea: () => false } });
for (const d of DOSSIERS) depot.creer(d);
const serveur = app.listen(0);
await new Promise((r) => serveur.once('listening', r));
const B = 'http://127.0.0.1:' + serveur.address().port;

const erreurs = [];
const constats = [];
const verifier = (ok, texte) => { if (!ok) erreurs.push('constat : ' + texte); else constats.push(texte); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// Un geste qui lève dans la page est noté puis la suite continue : on veut la liste complète, pas la première casse.
const geste = async (page, nom, fn, arg) => { try { return await page.evaluate(fn, arg); } catch (e) { erreurs.push(`${nom} : ${String(e.message || e).split('\n')[0]}`); return null; } };

// Un <wa-button> mal fermé (« </button> » au lieu de « </wa-button> ») avale tout ce qui le suit : il ne doit contenir que
// son libellé (texte, icône, petite mise en forme), jamais un bloc de l'écran.
const boutonsIntacts = async (page, ou) => {
  const fautifs = await page.evaluate(() => [...document.querySelectorAll('wa-button')]
    .filter((b) => b.querySelector('div, p, section, table, ul, li, form, input, select, textarea, button, wa-button, h1, h2, h3'))
    .map((b) => (b.id || b.className || 'wa-button') + ' : ' + (b.textContent || '').trim().slice(0, 40)));
  if (fautifs.length) erreurs.push(`${ou} : bouton qui contient un bloc (balise mal fermée ?) — ${fautifs.slice(0, 3).join(' | ')}`);
};
const navigateur = await chromium.launch();
try {
  for (const ecran of [{ nom: 'bureau', viewport: { width: 1400, height: 900 } }, { nom: 'téléphone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
    const ctx = await navigateur.newContext({ viewport: ecran.viewport, isMobile: !!ecran.isMobile, hasTouch: !!ecran.hasTouch });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await ctx.addInitScript(() => { localStorage.setItem('claire-utilisateur-poste', 'Julie VASSELIN'); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(`[${ecran.nom}] erreur de page : ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/Failed to load resource|net::ERR_|ERR_FAILED/.test(t)) return; // CDN coupés : attendu
      erreurs.push(`[${ecran.nom}] console : ${t.slice(0, 200)}`);
    });
    await page.goto(B + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((n) => typeof dossiers !== 'undefined' && dossiers.length >= n, DOSSIERS.length, { timeout: 20000 });
    await page.evaluate(() => { try { fermerFenetreAujourdhui(); } catch (e) { /* fenêtre absente */ } });
    await pause(500);

    // Composants Web Awesome (04/10) : le paquet local est chargé, et le bouton est défini.
    await page.waitForFunction(() => !!customElements.get('wa-button'), null, { timeout: 10000 }).catch(() => {});
    verifier(await page.evaluate(() => !!customElements.get('wa-button')), `[${ecran.nom}] Web Awesome chargé (wa-button défini)`);
    const tdb = await page.evaluate(() => ({ widgets: document.querySelectorAll('#widgets-dashboard .w-carte').length, dossiers: dossiers.length }));
    verifier(tdb.dossiers === DOSSIERS.length, `[${ecran.nom}] ${tdb.dossiers} dossiers chargés`);
    verifier(tdb.widgets >= 3, `[${ecran.nom}] tableau de bord : ${tdb.widgets} widgets`);

    for (const onglet of ONGLETS) {
      const avant = erreurs.length;
      await geste(page, `[${ecran.nom}] écran ${onglet}`, (o) => definirOnglet(o), onglet);
      await pause(ecran.nom === 'bureau' ? 350 : 200);
      if (erreurs.length === avant) constats.push(`[${ecran.nom}] écran ${onglet}`);
      await boutonsIntacts(page, `[${ecran.nom}] écran ${onglet}`);
      if (onglet === 'suivi') {
        const suivi = await page.evaluate(() => { const l = document.getElementById('dossier-list'); return { lignes: l ? l.querySelectorAll('tr, li, .ligne-suivi').length : 0, texte: l ? l.textContent : '' }; });
        verifier(suivi.lignes >= 2 && /MOREAU/.test(suivi.texte), `[${ecran.nom}] Suivi : ${suivi.lignes} lignes, MOREAU présent`);
      }
      if (onglet === 'agenda') {
        const ag = await page.evaluate(() => document.querySelectorAll('[class^="ag-"], [class*=" ag-"]').length);
        verifier(ag > 0, `[${ecran.nom}] agenda rendu (${ag} éléments)`);
      }
    }

    if (ecran.nom === 'bureau') {
      for (const [id, attendu] of [['f1', 'MOREAU'], ['f3', 'SUCC'], ['f2', 'ABIME'], ['f4', 'PETIT']]) {
        await geste(page, `fiche ${id}`, (x) => ouvrirDossierDepuisDashboard(x), id);
        await pause(400);
        const fiche = await page.evaluate(() => { const o = document.getElementById('dossier-drawer-overlay'); return { ouverte: !!o && o.style.display !== 'none', texte: (document.getElementById('dossier-drawer') || {}).textContent || '' }; });
        verifier(fiche.ouverte && fiche.texte.includes(attendu), `fiche ${id} ouverte (${attendu})`);
        for (const o of ONGLETS_FICHE) { await geste(page, `fiche ${id} › ${o}`, (x) => definirOngletFiche(x), o); await pause(150); await boutonsIntacts(page, `fiche ${id} › ${o}`); }
        await page.evaluate(() => { try { fermerDossierDrawer(); } catch (e) { /* déjà fermée */ } });
      }
      // Onglets de travail (11/10) : outil et fiches en onglets, la fiche en page masque l'écran, fermer rend l'écran d'avant,
      // les raccourcis de l'agenda ne jouent pas derrière une fiche, passer d'une fiche à l'autre vide les notifications.
      await page.evaluate(() => { try { localStorage.removeItem('claire-onglets-travail'); } catch (e) { /* sans stockage */ } ongletsTravail = []; });
      await geste(page, 'onglets : outil', () => definirOnglet('quotites'));
      await geste(page, 'onglets : fiches', () => { definirOnglet('agenda'); ouvrirDossierDrawer('f1'); ouvrirDossierDrawer('f2'); });
      await pause(300);
      const ot1 = await page.evaluate(() => ({ n: document.querySelectorAll('#onglets-travail .ot-onglet').length, actif: (document.querySelector('#onglets-travail .ot-onglet.actif .ot-libelle') || {}).textContent, agendaCache: getComputedStyle(document.getElementById('onglet-agenda')).display === 'none', raccourci: ecranAffiche('agenda') }));
      verifier(ot1.n === 3 && /ABIME/.test(ot1.actif || '') && ot1.agendaCache && !ot1.raccourci, `onglets : 3 onglets, fiche ABIME active en page, agenda caché et sans raccourci (${JSON.stringify(ot1)})`);
      await geste(page, 'onglets : notifications vues en changeant de fiche', () => { const d = dossiers.find(x => x.id === 'f1'); d.piecesNotifications = ['dpe']; ouvrirDossierDrawer('f1'); ouvrirDossierDrawer('f2'); });
      verifier(await page.evaluate(() => !(dossiers.find(x => x.id === 'f1').piecesNotifications || []).length), 'onglets : notifications de la fiche quittée vidées');
      await geste(page, 'onglets : fermer la fiche active', () => fermerOngletTravail(2));
      await pause(200);
      const ot2 = await page.evaluate(() => ({ ouvert: dossierOuvert, n: ongletsTravail.length }));
      verifier(ot2.ouvert === 'f1' && ot2.n === 2, `onglets : la fiche voisine prend la place (${JSON.stringify(ot2)})`);
      await geste(page, 'onglets : fermer l’outil puis la fiche', () => { fermerOngletTravail(0); fermerDossierDrawer(); });
      await pause(200);
      const ot3 = await page.evaluate(() => ({ ecran: ongletActuel, fiche: document.body.classList.contains('fiche-en-page'), n: ongletsTravail.length }));
      verifier(ot3.ecran !== 'quotites' && !ot3.fiche && ot3.n === 1, `onglets : l’outil fermé ne revient pas sous la fiche (${JSON.stringify(ot3)})`);
      // Fiche à côté (11/10, étape 3) : ancrée à droite, elle reste quand on change d'outil ; « Plein écran » la rend à la page.
      await geste(page, 'fiche à côté', () => { definirOnglet('suivi'); ouvrirDossierDrawer('f1'); ouvrirFicheACote(); definirOnglet('appel-fonds'); });
      await pause(300);
      const cote = await page.evaluate(() => ({ cls: document.body.className, ouvert: dossierOuvert, outilVisible: getComputedStyle(document.getElementById('onglet-appel-fonds')).display !== 'none', actif: cleOngletTravailActif() }));
      verifier(/fiche-a-cote/.test(cote.cls) && cote.ouvert === 'f1' && cote.outilVisible && cote.actif === 'o:appel-fonds', `fiche à côté de l’outil (${JSON.stringify(cote)})`);
      await geste(page, 'fiche à côté › plein écran', () => pleinEcranFiche());
      await pause(200);
      verifier(await page.evaluate(() => document.body.classList.contains('fiche-en-page') && !document.body.classList.contains('fiche-a-cote')), 'fiche à côté › plein écran');
      await geste(page, 'fiche à côté › fermer', () => { ouvrirFicheACote(); fermerDossierDrawer(); });
      verifier(await page.evaluate(() => !ficheACote && !document.body.classList.contains('fiche-a-cote')), 'fiche à côté › fermée, mode arrêté');
      await page.evaluate(() => { ongletsTravail = []; renderOngletsTravail(); definirOnglet('dashboard'); });
      // « À propos » : le numéro de version et chaque entrée de l'historique (numéro + jour) s'affichent.
      await geste(page, 'À propos', () => ouvrirAPropos());
      const propos = await page.evaluate(() => ({ numero: (document.getElementById('apropos-version-valeur') || {}).textContent, attendu: VERSION_APP, lignes: document.querySelectorAll('#apropos-historique-liste li').length, entrees: HISTORIQUE_VERSIONS.length, jour: (document.getElementById('apropos-version-date') || {}).textContent }));
      verifier(/^\d+\.\d+\.\d+$/.test(propos.numero || '') && propos.numero === propos.attendu, `À propos : version ${propos.numero}`);
      verifier(propos.lignes === propos.entrees && /\d{2}\/\d{2} \d{2}:\d{2}/.test(propos.jour || ''), `À propos : ${propos.lignes} versions listées, date ${propos.jour}`);
      await geste(page, 'fermer À propos', () => fermerAPropos());
      // Fenêtre d'email : redessinée alors que « Envoyer » (un <wa-button> recréé) a le focus — c'est ce qui empêchait l'envoi
      // (rapport du 05/10, « Cannot read properties of null (reading 'focus') »).
      await geste(page, 'fenêtre d’email', () => {
        envoiDirectPossible = () => true;
        ouvrirRedactionEmail({ mode: 'nouveau', destinataire: 'client@exemple.fr', sujet: 'Essai', corps: 'Bonjour', dossierId: 'f1', responsableSignature: 'Julie VASSELIN' });
      });
      await pause(500);
      const avantEmail = erreurs.length;
      await geste(page, 'fenêtre d’email › redessin avec le focus sur Envoyer', () => { const b = document.getElementById('redaction-envoyer'); if (b) b.focus(); renderRedaction(); });
      await pause(300);
      verifier(erreurs.length === avantEmail, 'fenêtre d’email : redessin avec le focus sur « Envoyer » sans erreur');
      await geste(page, 'abandonner l’email', () => abandonnerRedaction());
      // Envoi réel au clic de la souris (étude 05/10 : « rien n'est parti », ni message ni brouillon) : la requête doit
      // atteindre le serveur — réponse simulée ici, Exchange étant injoignable — et la fenêtre se fermer.
      let envoiRecu = null;
      await page.route('**/api/emails/envoyer', async (r) => {
        envoiRecu = JSON.parse(r.request().postData() || '{}');
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, envoyeLe: new Date().toISOString(), de: 'essai@exemple.fr' }) });
      });
      await geste(page, 'fenêtre d’email › ouvrir pour envoyer', () => {
        envoiDirectPossible = () => true;
        window.__envoiFumee = null;
        ouvrirRedactionEmail({ mode: 'nouveau', destinataire: 'client@exemple.fr', sujet: 'Essai', corps: 'Bonjour', dossierId: 'f1', responsableSignature: 'Julie VASSELIN' })
          .then((r) => { window.__envoiFumee = r; });
      });
      await pause(400);
      try { await page.click('#redaction-envoyer', { timeout: 3000 }); } catch (e) { erreurs.push(`[${ecran.nom}] fenêtre d’email : clic sur « Envoyer » impossible`); }
      await page.waitForFunction(() => !!window.__envoiFumee, null, { timeout: 5000 }).catch(() => {});
      const envoi = await page.evaluate(() => window.__envoiFumee);
      verifier(!!envoiRecu && envoiRecu.a === 'client@exemple.fr' && envoi && envoi.ok && envoi.mode === 'envoye', `[${ecran.nom}] fenêtre d’email : un clic sur « Envoyer » atteint le serveur`);
      await page.unroute('**/api/emails/envoyer');
      await page.evaluate(() => definirOnglet('dashboard'));
      await pause(300);
    }
    await ctx.close();
  }
} catch (e) {
  erreurs.push('exception : ' + (e && e.stack || e));
} finally {
  await navigateur.close();
  serveur.close();
  db.close();
}

console.log(`${constats.length} points vérifiés`);
if (erreurs.length) {
  console.error(`\n${erreurs.length} erreur(s) :`);
  for (const e of erreurs) console.error(' - ' + e);
  process.exit(1);
}
console.log('Test de fumée : aucune erreur.');
