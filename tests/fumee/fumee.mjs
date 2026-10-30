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
const ONGLETS = ['suivi', 'assistant', 'agenda', 'scans', 'nouveau', 'confreres', 'clients-biens', 'calculateur', 'appel-fonds', 'constitution', 'autorisations', 'decompte-vendeur', 'quotites', 'redaction', 'preemption', 'prorata', 'inventaire', 'reglages', 'dashboard'];
const ONGLETS_FICHE = ['tableau', 'pieces', 'dossier', 'fonds', 'factures', 'echanges', 'historique'];

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
    await ctx.addInitScript(() => { try { localStorage.setItem('claire-utilisateur-poste', 'Julie VASSELIN'); } catch (e) { /* cadre isolé (bac à sable du calcul) : sans stockage */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(`[${ecran.nom}] erreur de page : ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/Failed to load resource|net::ERR_|ERR_FAILED/.test(t)) return; // CDN coupés : attendu
      erreurs.push(`[${ecran.nom}] console : ${t.slice(0, 200)}`);
    });
    // Rapport du 12/10 : un fichier du poste lent à arriver (serveur qui redémarre) ne doit pas laisser le démarrage appeler ses
    // fonctions avant lui (« renderWidgetAssistant / ficheACoteActive is not defined »).
    await page.route(/client\/60-/, async (r) => { await new Promise(t => setTimeout(t, 800)); await r.continue(); });
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
    // Accès rapide aux discussions dans la barre latérale (étude 26/10) : CLAIRE (sa conversation), Général + un message privé par collègue (Julie : Bastien, Jérémy, Sophie).
    await page.waitForFunction(() => document.querySelectorAll('#sidebar-acces-canaux .sb-canal').length === 5, null, { timeout: 10000 }).catch(() => {});
    const acces = await page.evaluate(() => ({ noms: [...document.querySelectorAll('#sidebar-acces-canaux .sb-canal-nom')].map(e => e.textContent).join(','), visible: getComputedStyle(document.getElementById('sidebar-acces-canaux')).display !== 'none' }));
    verifier(acces.noms === 'Général,Bastien,Jérémy,Sophie,Claire' && (acces.visible || ecran.nom !== 'bureau'), `[${ecran.nom}] barre latérale : accès rapide (${acces.noms})`);
    if (ecran.nom === 'bureau') {
      await page.click('#sidebar-acces-canaux .sb-canal:nth-child(2)');
      await page.waitForFunction(() => canaux.actif === 'general' || /^p:/.test(canaux.actif), null, { timeout: 5000 }).catch(() => {});
      const ouvert = await page.evaluate(() => ({ canal: canaux.actif, ecran: ongletActuel }));
      verifier(ouvert.ecran === 'assistant' && /^p:bastien-julie$/.test(ouvert.canal), `barre latérale : un clic sur Bastien ouvre sa conversation privée (${JSON.stringify(ouvert)})`);
      await page.evaluate(() => definirOnglet('dashboard'));
    }

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
      // Constitution de dossier (15/10) : une vente et une succession rattachées, l'écran se dessine avec ses courriers.
      for (const [id, attendu] of [['f1', 'Courriers'], ['f3', 'défunt']]) {
        await geste(page, `constitution ${id}`, (x) => { definirOnglet('constitution'); choisirDossierConstitution(x); }, id);
        await pause(500);
        const cst = await page.evaluate(() => (document.getElementById('cst-corps') || {}).textContent || '');
        verifier(cst.includes(attendu), `constitution ${id} : écran rendu (${attendu})`);
      }
      // Tâches à venir (13/10) : visibles par le lien de la carte « Aujourd'hui », listées dans la grande fenêtre de toutes les tâches.
      const avenir = await geste(page, 'tâches à venir', () => {
        definirOnglet('dashboard');
        const plusTard = new Date(); plusTard.setDate(plusTard.getDate() + 6);
        rappelsPerso = [{ id: 'r-avenir', auteur: utilisateurPoste, texte: 'Relancer le syndic', echeance: plusTard.toISOString().slice(0, 10), fait: false, creeLe: new Date().toISOString() }];
        renderAlertesDashboard(dossiersPerimetreDashboard());
        const lien = document.querySelector('.jour-lien-avenir');
        if (!lien) return 'pas de lien';
        lien.click();
        const f = document.getElementById('aujourdhui-fenetre-contenu');
        const r = { croix: !!f.querySelector('[onclick^="supprimerRappelPerso"]'), liste: /Relancer le syndic/.test(f.textContent), haut: Math.round(f.getBoundingClientRect().height), large: Math.round(f.getBoundingClientRect().width) };
        fermerFenetreAujourdhui();
        rappelsPerso = [];
        renderAlertesDashboard(dossiersPerimetreDashboard());
        return r;
      });
      verifier(avenir && avenir.liste && avenir.haut >= 640 && avenir.large >= 1000 && avenir.croix, `tâches à venir : lien, liste et grande fenêtre (${JSON.stringify(avenir)})`);
      // Canaux de CLAIRE (24/10) : la page « Demander à CLAIRE » liste les canaux, un canal s'ouvre (en-tête, fil, interrupteur « CLAIRE répond »),
      // la vue « À traiter » s'ouvre, on repart sur les conversations ; Réglages › Routines dessine l'état, les trois niveaux et les routines.
      const routines = await geste(page, 'routines de CLAIRE', async () => {
        definirOnglet('assistant');
        await new Promise((r) => setTimeout(r, 500));
        const liste = document.querySelectorAll('#assistant-canaux .cx-c').length;
        await ouvrirCanal('general');
        await new Promise((r) => setTimeout(r, 400));
        const canal = document.getElementById('canal-entete').style.display !== 'none'
          && !!document.querySelector('#assistant-messages .asst-accueil, #assistant-messages .cx-m');
        await ouvrirCanal('@traiter');
        await new Promise((r) => setTimeout(r, 300));
        const traiter = !canaux.actif && !!document.querySelector('#assistant-messages .asst-accueil, #assistant-messages .asst-message');
        quitterCanal(); renderAssistant();
        definirOnglet('reglages'); definirSousOngletReglages('routines');
        await new Promise((r) => setTimeout(r, 900));
        const z = document.getElementById('routines-contenu');
        return { liste, canal, traiter, routines: z.querySelectorAll('.rt-routine').length, niveaux: z.querySelectorAll('.rt-niveau').length, interrupteur: !!z.querySelector('#rt-actif') };
      });
      verifier(routines && routines.liste >= 2 && routines.canal && routines.traiter && routines.routines >= 9 && routines.niveaux === 3 && routines.interrupteur, `canaux et routines de CLAIRE : ${routines && routines.liste} canaux listés, canal et « À traiter » ouverts, ${routines && routines.routines} routines, ${routines && routines.niveaux} niveaux`);
      // Brouillon d'email ouvert depuis les Discussions (27/10) : à droite, dans le panneau, pas en fenêtre ; refermé, la boîte retourne à sa fenêtre.
      const emailCote = await geste(page, 'brouillon d’email à droite', async () => {
        definirOnglet('assistant');
        await new Promise((r) => setTimeout(r, 300));
        const fin = livrerEmailDossier({ destinataire: 'a@exemple.fr', sujet: 'Essai', corps: 'Madame, Monsieur,\n\nBonjour.', geste: 'assistant' });
        await new Promise((r) => setTimeout(r, 300));
        const panneau = !!document.querySelector('#assistant-artefact .email-redaction-box') && document.getElementById('email-redaction-overlay').style.display === 'none';
        const id = (await artefactAgent({ mode: 'lister' })).elements.find((x) => x.type === 'email').artefact_id;
        const corrige = (await artefactAgent({ mode: 'modifier', artefact_id: id, texte: 'Madame, Monsieur,\n\nMerci.' })).fait === true;
        fermerArtefactAssistant();
        const r = await fin;
        return { panneau, corrige, annule: !!(r && r.annule), rendue: document.querySelector('.email-redaction-box').parentNode.id === 'email-redaction-overlay' };
      });
      verifier(emailCote && emailCote.panneau && emailCote.corrige && emailCote.annule && emailCote.rendue, `brouillon d’email ouvert à droite, corrigé par CLAIRE, refermé sans envoi (${JSON.stringify(emailCote)})`);
      // Recherche de la barre latérale (20/10) : un dossier et un outil se trouvent, Entrée ouvre la fiche.
      const rech = await page.evaluate(async () => {
        const champ = document.getElementById('sidebar-recherche-saisie');
        if (!champ) return { champ: false };
        champ.value = 'moreau'; majRechercheSidebar();
        const dossiersTrouves = document.querySelectorAll('#sidebar-recherche-liste .sidebar-recherche-ligne').length;
        champ.value = 'quotit'; majRechercheSidebar();
        const outilsTrouves = document.querySelectorAll('#sidebar-recherche-liste .sidebar-recherche-ligne').length;
        champ.value = 'moreau'; majRechercheSidebar(); ouvrirRechercheSidebar();
        await new Promise(r => setTimeout(r, 300));
        return { champ: true, dossiersTrouves, outilsTrouves, fiche: !!document.querySelector('body.fiche-en-page'), vide: champ.value === '' };
      });
      verifier(rech.champ && rech.dossiersTrouves >= 1 && rech.outilsTrouves >= 1 && rech.fiche && rech.vide, `[${ecran.nom}] recherche de la barre : dossier, outil, Entrée ouvre la fiche (${JSON.stringify(rech)})`);
      await geste(page, 'recherche : retour', () => { definirOnglet('dashboard'); });
      // Dates sur les cartes du Tableau (13/10) : crayon → champ date → ✓ écrit la date sur la fiche, par le vrai clic.
      await geste(page, 'carte : ouvrir la fiche', () => { ouvrirDossierDepuisDashboard('f1'); definirOngletFiche('tableau'); });
      await pause(300);
      await page.click('.tf-carte[data-cle="echeance:pret"] .tf-ico:not(.tf-ico-suppr)').catch((e) => erreurs.push('carte : crayon introuvable — ' + e.message.split('\n')[0]));
      await pause(200);
      const dateCarte = await geste(page, 'carte : saisir la date', () => {
        const champ = document.getElementById('tf-date-saisie');
        if (!champ) return 'pas de champ';
        champ.value = '2027-01-15';
        champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return dossiers.find(x => x.id === 'f1').pret;
      });
      verifier(dateCarte === '2027-01-15', `carte du Tableau : date du prêt modifiée (${dateCarte})`);
      await page.evaluate(() => { try { fermerDossierDrawer(); } catch (e) { /* déjà fermée */ } });
      // Onglets de travail (11/10) : outil et fiches en onglets, la fiche en page masque l'écran, fermer rend l'écran d'avant,
      // les raccourcis de l'agenda ne jouent pas derrière une fiche, passer d'une fiche à l'autre vide les notifications.
      await page.evaluate(() => { try { localStorage.removeItem('claire-onglets-travail'); } catch (e) { /* sans stockage */ } ongletsTravail = []; });
      await geste(page, 'onglets : outil', () => definirOnglet('quotites'));
      await geste(page, 'onglets : fiches', () => { definirOnglet('agenda'); ouvrirDossierDrawer('f1'); ouvrirDossierDrawer('f2'); });
      await pause(300);
      const ot1 = await page.evaluate(() => ({ n: document.querySelectorAll('#onglets-travail .ot-onglet').length, actif: (document.querySelector('#onglets-travail .ot-onglet.actif .ot-libelle') || {}).textContent, agendaCache: getComputedStyle(document.getElementById('onglet-agenda')).display === 'none', raccourci: ecranAffiche('agenda') }));
      verifier(ot1.n === 4 && /ABIME/.test(ot1.actif || '') && ot1.agendaCache && !ot1.raccourci, `onglets : 4 onglets (outil, Agenda, deux fiches), fiche ABIME active en page, agenda caché et sans raccourci (${JSON.stringify(ot1)})`);
      await geste(page, 'onglets : notifications vues en changeant de fiche', () => { const d = dossiers.find(x => x.id === 'f1'); d.piecesNotifications = ['dpe']; ouvrirDossierDrawer('f1'); ouvrirDossierDrawer('f2'); });
      verifier(await page.evaluate(() => !(dossiers.find(x => x.id === 'f1').piecesNotifications || []).length), 'onglets : notifications de la fiche quittée vidées');
      await geste(page, 'onglets : fermer la fiche active', () => fermerOngletTravail(3));
      await pause(200);
      const ot2 = await page.evaluate(() => ({ ouvert: dossierOuvert, n: ongletsTravail.length }));
      verifier(ot2.ouvert === 'f1' && ot2.n === 3, `onglets : la fiche voisine prend la place (${JSON.stringify(ot2)})`);
      await geste(page, 'onglets : fermer l’outil puis la fiche', () => { fermerOngletTravail(0); fermerDossierDrawer(); });
      await pause(200);
      const ot3 = await page.evaluate(() => ({ ecran: ongletActuel, fiche: document.body.classList.contains('fiche-en-page'), n: ongletsTravail.length }));
      verifier(ot3.ecran !== 'quotites' && !ot3.fiche && ot3.n === 2, `onglets : l’outil fermé ne revient pas sous la fiche (${JSON.stringify(ot3)})`);
      // Fiche à côté (11/10, étape 3) : ancrée à droite, elle reste quand on change d'outil ; « Plein écran » la rend à la page.
      await geste(page, 'fiche à côté', () => { definirOnglet('suivi'); ouvrirDossierDrawer('f1'); ouvrirFicheACote(); definirOnglet('appel-fonds'); });
      await pause(300);
      const cote = await page.evaluate(() => ({ cls: document.body.className, ouvert: dossierOuvert, outilVisible: getComputedStyle(document.getElementById('onglet-appel-fonds')).display !== 'none', actif: cleOngletTravailActif() }));
      verifier(/fiche-a-cote/.test(cote.cls) && cote.ouvert === 'f1' && cote.outilVisible && cote.actif === 'o:appel-fonds', `fiche à côté de l’outil (${JSON.stringify(cote)})`);
      await geste(page, 'fiche à côté › fermer l’outil affiché', () => { ongletsTravail = [{ type: 'outil', nom: 'appel-fonds' }, { type: 'dossier', id: 'f2' }, { type: 'dossier', id: 'f1' }]; fermerOngletTravail(0); });
      await pause(200);
      verifier(await page.evaluate(() => dossierOuvert === 'f1' && document.body.classList.contains('fiche-a-cote') && ongletActuel === 'dashboard'), 'fiche à côté › fermer l’outil laisse la fiche dans son volet');
      await page.evaluate(() => { const c = document.querySelector('#onglet-dashboard input, #onglet-dashboard button'); if (c) c.focus(); appuiDansFicheCote = false; });
      await page.keyboard.press('Escape');
      verifier(await page.evaluate(() => dossierOuvert === 'f1'), 'fiche à côté › Échap dans l’écran de gauche ne la ferme pas');
      await geste(page, 'fiche à côté › plein écran', () => pleinEcranFiche());
      await pause(200);
      verifier(await page.evaluate(() => document.body.classList.contains('fiche-en-page') && !document.body.classList.contains('fiche-a-cote')), 'fiche à côté › plein écran');
      await geste(page, 'fiche à côté › fermer', () => { ouvrirFicheACote(); fermerDossierDrawer(); });
      verifier(await page.evaluate(() => !ficheACote && !document.body.classList.contains('fiche-a-cote')), 'fiche à côté › fermée, mode arrêté');
      await page.evaluate(() => { ongletsTravail = []; renderOngletsTravail(); definirOnglet('dashboard'); });
      // Agent « Demander à CLAIRE » (11/10) : un faux serveur d'agent fait exécuter au poste chaque outil (fiche, liste, tâches,
      // agenda, depuis hier, un rappel posé) puis rend la réponse ; le poste ne doit lever aucune erreur et tout renvoyer.
      const resultatsAgent = [];
      let tourFaux = 0;
      await page.route('**/api/assistant/agent', async (r) => {
        const corps = JSON.parse(r.request().postData() || '{}');
        if (corps.resultats) resultatsAgent.push(...corps.resultats);
        tourFaux += 1;
        const appels = tourFaux === 1 ? [
          { id: 'o1', nom: 'chercher_dossiers', entree: { texte: 'moreau', inclure_archives: false } },
          { id: 'o2', nom: 'lire_dossier', entree: { dossier_id: 'f1' } },
          { id: 'o3', nom: 'lister_dossiers', entree: { etat: 'tous', responsable: '' } },
          { id: 'o4', nom: 'taches_du_jour', entree: {} },
          { id: 'o5', nom: 'agenda', entree: { debut: '2026-10-01', fin: '2026-10-31' } },
          { id: 'o6', nom: 'depuis_hier', entree: {} },
          { id: 'o7', nom: 'lire_dossier', entree: { dossier_id: 'f3' } },
          { id: 'o9', nom: 'documents_recents', entree: { dossier_id: 'f1' } },
          { id: 'o10', nom: 'documents_recents', entree: { dossier_id: '' } }
        ] : tourFaux === 2 ? [{ id: 'o11', nom: 'ouvrir_documents', entree: { documents: ['doc999'] } }, { id: 'o8', nom: 'faire_geste', entree: { geste: 'rappel_ajouter', dossier_id: 'f1', parametres: { date: '2026-10-20', heure: '', texte: 'Relancer la banque', modele: '', echeance: '', champ: '', partie: '', ecran: '', collaborateur: '', titre: '', montant: null } } }] : null;
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(appels ? { conversation: 'c1', appels } : { conversation: 'c1', reponse: 'Le dossier **MOREAU** attend :\n- l’offre de prêt' }) });
      });
      await page.evaluate(() => { utilisateurPoste = 'Bastien ANGLUMENT'; assistantDisponibilite.agent = true; assistantDisponibilite.quand = Date.now(); definirOnglet('assistant'); });
      const avantAgent = erreurs.length;
      // La question part sans attendre : le rappel demande une autorisation (13/10), cliquée comme le ferait l'utilisateur.
      await geste(page, 'agent : question', () => { window.__questionAgent = envoyerDemandeAssistant('Où en est MOREAU ?'); return true; });
      const carte = page.locator('#assistant-messages wa-button:has-text("Autoriser")').last();
      await carte.waitFor({ timeout: 8000 }).then(() => carte.click()).catch(() => erreurs.push('agent : la carte « Autoriser » n’est pas apparue'));
      await page.waitForFunction(() => !assistantEnCours, null, { timeout: 8000 }).catch(() => {});
      verifier(await page.evaluate(() => /Autorisé/.test(assistantMessages.map(m => m.html).join(''))), 'agent : le rappel n’est posé qu’après « Autoriser »');
      const agentFin = await page.evaluate(() => ({ dernier: (assistantMessages[assistantMessages.length - 1] || {}).html || '', rappel: rappelsPerso.some(x => x.texte === 'Relancer la banque') }));
      const parId = Object.fromEntries(resultatsAgent.map((x) => [x.id, x]));
      verifier(erreurs.length === avantAgent, 'agent : aucun outil ne lève d’erreur dans la page');
      verifier(['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8'].every((id) => parId[id] && !parId[id].erreur), `agent : les 8 outils ont rendu un résultat (${Object.keys(parId).join(',')})`);
      verifier(parId.o2 && /MOREAU/.test(JSON.stringify(parId.o2.contenu)) && Array.isArray(parId.o2.contenu.echeances), 'agent : la fiche lue porte le dossier et ses échéances');
      verifier(parId.o1 && parId.o1.contenu.dossiers.length >= 1, 'agent : la recherche trouve MOREAU');
      verifier(agentFin.rappel && parId.o8 && parId.o8.contenu.statut === 'fait', 'agent : le rappel est posé par le geste habituel');
      verifier(/<b>MOREAU<\/b>/.test(agentFin.dernier) && /<li>/.test(agentFin.dernier), 'agent : la réponse s’affiche mise en forme');
      verifier(parId.o9 && Array.isArray(parId.o9.contenu.pieces_recues) && parId.o9.contenu.fichiers_recents_du_dossier_nas !== undefined
        && parId.o10 && Array.isArray(parId.o10.contenu.scans_a_ranger), 'agent : les derniers documents se lisent (dossier et tous)');
      verifier(parId.o11 && parId.o11.contenu.erreur, 'agent : un document inconnu n’est pas ouvert');
      verifier(parId.o5 && Array.isArray(parId.o5.contenu.rendez_vous) && !/"titre"|"lieu"|"sujet"/.test(JSON.stringify(parId.o5.contenu)), 'agent : l’agenda part sans titre ni lieu');
      await page.unroute('**/api/assistant/agent');
      // Sans IA : « les dernières pièces de MOREAU » (étude 12/10) — la réponse s'affiche avec le bouton de Claire Scan.
      const avantDocs = erreurs.length;
      await geste(page, 'derniers documents sans IA', () => executerDemandeAssistant({ intention: 'derniers_documents', dossier: 'f1', parametres: {}, candidats: [] }));
      await page.waitForFunction(() => /Claire Scan/.test(JSON.stringify((assistantMessages[assistantMessages.length - 1] || {}).boutons || [])), null, { timeout: 5000 }).catch(() => {});
      verifier(erreurs.length === avantDocs && await page.evaluate(() => (assistantMessages[assistantMessages.length - 1].boutons || []).some(b => b.libelle === 'Claire Scan')), 'derniers documents : réponse sans erreur, bouton Claire Scan');
      // Plusieurs conversations (étude 12/10) : la conversation en cours est listée, une nouvelle s'ouvre, on revient à la première.
      const avantFils = erreurs.length;
      await page.waitForFunction(() => !assistantEnCours, null, { timeout: 5000 }).catch(() => {});
      const fils = await page.evaluate(() => {
        const avant = assistantMessages.length;
        const premiere = assistantConversationId;
        nouvelleConversationAssistant();
        poserMessageAssistant('moi', 'Deuxième conversation');
        const deux = assistantConversations.length;
        ouvrirConversationAssistant(premiere);
        ecrireConversationsAssistant();
        const garde = lireConversationsAssistant(localStorage.getItem(cleStockageConversationsAssistant()) || '', Date.now()).length;
        return { avant, deux, revenu: assistantMessages.length === avant, lignes: document.querySelectorAll('#assistant-fils .asst-fil').length, garde };
      });
      verifier(erreurs.length === avantFils && fils.deux >= 2 && fils.revenu && fils.lignes >= 2 && fils.garde >= 2, `conversations : listées, reprises et gardées sur le poste (${JSON.stringify(fils)})`);
      // Une erreur APRÈS un geste : jamais de repli sur la compréhension d'une phrase (le geste serait refait).
      let compris = 0;
      await page.route('**/api/assistant/comprendre', async (r) => { compris += 1; await r.continue(); });
      let tourErr = 0;
      await page.route('**/api/assistant/agent', async (r) => {
        tourErr += 1;
        const corps = tourErr === 1 ? { conversation: 'c2', appels: [{ id: 'g1', nom: 'faire_geste', entree: { geste: 'rappel_ajouter', dossier_id: 'f1', parametres: { date: '', heure: '', texte: 'Rappel unique', modele: '', echeance: '', champ: '', partie: '', ecran: '', collaborateur: '', titre: '', montant: null } } }] }
          : { erreur: 'limite de débit Claude atteinte' };
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
      });
      await geste(page, 'agent : erreur après un geste', () => { window.__questionAgent = envoyerDemandeAssistant('rappelle-moi de faire le rappel unique pour MOREAU'); return true; });
      const carteRappel = page.locator('#assistant-messages wa-button:has-text("Autoriser")').last();
      await carteRappel.waitFor({ timeout: 8000 }).then(() => carteRappel.click()).catch(() => erreurs.push('agent : carte « Autoriser » absente (erreur après un geste)'));
      await page.waitForFunction(() => !assistantEnCours, null, { timeout: 8000 }).catch(() => {});
      const unique = await page.evaluate(() => ({ n: rappelsPerso.filter(x => /rappel unique/i.test(x.texte)).length, lien: (rappelsPerso.find(x => x.texte === 'Rappel unique') || {}).dossierId, dernier: (assistantMessages[assistantMessages.length - 1] || {}).html || '' }));
      verifier(unique.n === 1 && compris === 0 && /pas pu terminer/.test(unique.dernier), `agent : erreur après un geste — un seul rappel, pas de repli (${JSON.stringify({ ...unique, compris })})`);
      verifier(unique.lien === 'f1', 'agent : le rappel garde son dossier');
      await page.unroute('**/api/assistant/agent');
      await page.unroute('**/api/assistant/comprendre');
      await page.evaluate(() => { rappelsPerso = rappelsPerso.filter(x => !/rappel unique/i.test(x.texte)); assistantDisponibilite.agent = false; nouvelleConversationAssistant(); utilisateurPoste = 'Julie VASSELIN'; definirOnglet('dashboard'); });
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
      // Calcul libre de « Demander à CLAIRE » (21/10, palier 3) : bac à sable sans réseau, boucle sans fin arrêtée, page vivante.
      const bac = await page.evaluate(async () => {
        const somme = await executerCalculIsole('return donnees.n.reduce((a, b) => a + b, 0);', { n: [1, 2, 3.5] }, 4000);
        const reseau = await executerCalculIsole('try { await fetch(location.href); return "PASSE"; } catch (e) { return "bloqué"; }', {}, 4000);
        const stockage = await executerCalculIsole('return [typeof localStorage, typeof document, typeof parent];', {}, 4000);
        const t0 = Date.now();
        const boucle = await executerCalculIsole('while (true) {}', {}, 1200);
        return { somme, reseau, stockage, boucle, ms: Date.now() - t0, cadres: document.querySelectorAll('iframe[sandbox]').length };
      });
      verifier(bac.somme.valeur === 6.5 && bac.reseau.valeur === 'bloqué' && /undefined/.test(JSON.stringify(bac.stockage.valeur)) && /trop long/.test(bac.boucle.erreur || '') && bac.ms < 4000 && bac.cadres === 0,
        `[${ecran.nom}] calcul libre : résultat juste, réseau coupé, boucle arrêtée (${bac.ms} ms), aucun cadre laissé`);
      // Artefacts de « Demander à CLAIRE » (21/10) : courrier sur le papier à en-tête, tableau modifiable, carte d'outil — dans le panneau de droite.
      await page.evaluate(() => definirOnglet('assistant'));
      await pause(300);
      const art = await page.evaluate(async () => {
        await ouvrirCourrierArtefactAssistant('Essai', 'Mairie de Blois\n41000 BLOIS\n\nBlois, le 21 octobre 2026\n\nMadame, Monsieur,\n\nBonjour.\n\nMe Sophie GOSSART', dossiers[0]);
        const courrier = { page: !!document.querySelector('#assistant-artefact .cstp-page'), editable: !!document.querySelector('#assistant-artefact [data-ligne][contenteditable]'), ouvert: !!document.querySelector('.asst-page.artefact-ouvert') };
        ouvrirArtefactAssistant({ type: 'tableau', titre: 'Essai', colonnes: ['A', 'B'], lignes: [['x', 1], ['y', 2]] });
        const tableau = { cellules: document.querySelectorAll('#assistant-artefact td[contenteditable]').length, onglets: document.querySelectorAll('#assistant-artefact .asst-art-onglet').length };
        ouvrirOutilArtefactAssistant('Appel de fonds', dossiers[0], () => {});
        const outil = !!document.querySelector('#assistant-artefact .asst-art-outil');
        // Un outil monté dans le panneau : écran déplacé (visible, prérempli), retour à sa place depuis la barre latérale.
        await outilClaireAgent({ outil: 'quotites', mode: 'ouvrir', dossier_id: 'f1', texte: '' });
        await new Promise(r => setTimeout(r, 300));
        const monte = { dansPanneau: !!document.querySelector('#assistant-artefact #onglet-quotites'), visible: document.getElementById('onglet-quotites').offsetParent !== null, ecran: ongletActuel, large: !!document.querySelector('.asst-page.artefact-large') };
        definirOnglet('quotites');
        const rendu = { retour: document.getElementById('onglet-quotites').parentElement.classList.contains('app-main'), visible: document.getElementById('onglet-quotites').offsetParent !== null };
        definirOnglet('assistant');
        while (artefactCourantAssistant()) fermerArtefactAssistant();
        return { courrier, tableau, outil, monte, rendu, ferme: !document.querySelector('.asst-page.artefact-ouvert') && !document.querySelector('#assistant-artefact #onglet-quotites') };
      });
      verifier(art.courrier.page && art.courrier.editable && art.courrier.ouvert && art.tableau.cellules === 4 && art.tableau.onglets === 2 && art.outil && art.monte.dansPanneau && art.monte.large && art.rendu.retour && art.rendu.visible && art.ferme,
        `[${ecran.nom}] artefacts : courrier sur papier à en-tête modifiable, tableau modifiable, carte d'outil, outil monté dans le panneau puis rendu à son onglet, fermeture`);
      // Liste des conversations repliable (21/10) : la colonne disparaît, le choix est gardé, le bouton la rend.
      const repli = await page.evaluate(() => {
        basculerFilsRepliesAssistant();
        const replie = document.querySelector('.asst-page').classList.contains('fils-replies') && getComputedStyle(document.querySelector('.asst-cote')).display === 'none';
        basculerFilsRepliesAssistant();
        return { replie, rouvert: !document.querySelector('.asst-page').classList.contains('fils-replies') };
      });
      verifier(repli.replie && repli.rouvert, `[${ecran.nom}] conversations : la liste se replie et se rouvre`);
      await page.evaluate(() => definirOnglet('dashboard'));
      await pause(300);
    }
    await ctx.close();
  }
  // Petite fenêtre de réponse du relais (repondre.html, étude 26/10) : le fil affiché, la réponse posée DANS LE FIL, au nom du poste.
  {
    const login = await (await fetch(B + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motDePasse: '' }) })).json();
    const entetes = { 'content-type': 'application/json', authorization: 'Bearer ' + login.jeton };
    const depart = await (await fetch(B + '/api/canaux/general/messages', { method: 'POST', headers: entetes, body: JSON.stringify({ auteur: 'Bastien ANGLUMENT', texte: 'Qui <b>relit</b> le projet ?' }) })).json();
    const ctx = await navigateur.newContext({ viewport: { width: 420, height: 560 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('claire-utilisateur-poste', 'Julie VASSELIN'); } catch (e) { /* sans stockage */ } });
    const page = await ctx.newPage();
    const avant = erreurs.length;
    page.on('pageerror', (e) => erreurs.push('[répondre] ' + e.message));
    await page.goto(B + '/repondre.html#canal=general&mid=' + depart.message.id + '&titre=G%C3%A9n%C3%A9ral');
    await page.waitForSelector('.msg .texte');
    const lu = await page.evaluate(() => ({ texte: document.querySelector('.msg .texte').textContent, gras: !!document.querySelector('#fil b'), ou: document.getElementById('ou').textContent }));
    await page.fill('#texte', 'Moi, cet après-midi.');
    await page.press('#texte', 'Enter');
    await page.waitForFunction(() => /Envoyé/.test(document.getElementById('etat').textContent), null, { timeout: 5000 });
    const msgs = (await (await fetch(B + '/api/canaux/general/messages?utilisateur=Julie%20VASSELIN', { headers: entetes })).json()).messages;
    const rep = msgs.find((m) => m.texte === 'Moi, cet après-midi.');
    verifier(erreurs.length === avant && lu.texte === 'Qui <b>relit</b> le projet ?' && !lu.gras && lu.ou === 'Général' && rep && rep.parent === depart.message.id && rep.auteur === 'Julie VASSELIN',
      `fenêtre de réponse du relais : fil en texte, réponse dans le fil au nom du poste (${JSON.stringify({ lu, parent: rep && rep.parent === depart.message.id })})`);
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
