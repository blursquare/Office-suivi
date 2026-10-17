// Extension Chrome sur une copie du guichet d'Agglopolys (17/10, d'après la vidéo de l'étude) : accueil dessiné après « Traitements en cours »,
// bandeau « FORMULER » avec boutons ronds, commune de dépôt, assistant d'adresse et assistant des références cadastrales. Vérifie que CLAIRE
// clique la démarche de « Formuler » (jamais une carte de « Suivre »), remplit les deux assistants, n'ajoute aucune parcelle deux fois, laisse
// une adresse qui ne correspond pas à l'étude, et ne clique jamais « Transmettre ma demande ». Données inventées.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const ext = path.resolve(ici, '..', '..', 'extension-chrome');
const scenario = JSON.parse(fs.readFileSync(path.join(ext, 'scenarios', 'cua-gnau-agglopolys.json'), 'utf8'));
const erreurs = [];

async function jouer(fiche, avant) {
  const run = { id: 'r1', scenario, fiche, speed: 'fast', status: 'running', fields: {} };
  const browser = await chromium.launch(); // comme fumee.mjs : le Chromium de Playwright (conteneur : PLAYWRIGHT_BROWSERS_PATH ; GitHub : téléchargé par la construction)
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const journal = [];
    await page.exposeFunction('__envoi', (m) => { journal.push(m); return null; });
    await page.addInitScript((r) => {
      window.chrome = { runtime: { id: "essai", sendMessage: async (m) => { await window.__envoi(m); if (m.type === 'content.hello') return r; if (m.type === 'content.plan') return { nom: 'Plan cadastral.pdf', b64: btoa('%PDF-1.4 essai') }; return {}; }, onMessage: { addListener() {} } } };
      window.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('[ng-click]'); if (t && /transmettre/i.test(t.getAttribute('ng-click'))) window.__transmis = true; }, true);
    }, run);
    page.on('pageerror', (e) => erreurs.push('erreur de page : ' + e.message));
    await page.goto('file://' + path.join(ici, 'gnau-agglopolys.html'));
    if (avant) await page.evaluate(avant);
    for (const f of ['lib/fiche.js', 'content/content.js']) await page.addScriptTag({ path: path.join(ext, f) });
    for (let i = 0; i < 400 && !journal.some((m) => m.type === 'content.finish'); i++) await new Promise((r) => setTimeout(r, 250));
    const valeurs = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('input[id]')].map((i) => [i.id, i.value])));
    const etat = await page.evaluate(() => ({ commune: window.__commune || '', piece: window.__piece || '', hash: location.hash, transmis: !!window.__transmis, verifie: !!window.__verifie, ouvertures: window.__ouvertures || 0, demandes: window.__demandes || 0, valPage: !!window.__valPage, annPage: !!window.__annPage, filtre: window.__filtre || '', carteSuivi: !!window.__carteSuivi, lignes: (window.__parcelles || []).length, modales: document.querySelectorAll('.modal').length }));
    return { journal, valeurs, etat, assistants: Object.fromEntries(journal.filter((m) => m.type === 'content.assistant').map((m) => [m.assistant, m])) };
  } finally { await browser.close(); }
}
const verifier = (ok, texte) => { if (!ok) erreurs.push(texte); };
const base = { terrain: { numero: '51', voie: 'Rue Racine', commune: 'BLOIS', codePostal: '41000' }, superficie: '2989',
  parcelles: [{ section: 'BA', numero: '21', surface: '234' }, { section: 'BA', numero: '22', surface: '333' }, { section: 'BA', numero: '23', surface: '2311' }, { section: 'RE', numero: '432', surface: '111' }],
  signature: { lieu: 'BLOIS', date: '2026-10-17', signataire: 'P/O Bastien ANGLUMENT' }, notaire: {}, dossier: { id: 'x' } };

const a = await jouer(base);
verifier(a.etat.hash === '#/saisie/19333', 'la démarche de « Formuler » est ouverte après le chargement');
verifier(a.etat.commune === 'Blois', 'commune de dépôt = celle du dossier (Blois) : ' + a.etat.commune);
verifier(a.valeurs.T2V_voie === 'RUE RACINE' && a.valeurs.T2Q_numero === '51' && a.valeurs.T2C_code === '41000', 'adresse posée par l’assistant');
verifier(a.valeurs.T2S_section === 'BA' && a.valeurs.T2NP3_numero === '23' && a.valeurs.D5T_total === '2989', 'parcelles posées par l’assistant (4, la dernière en annexe)');
verifier(a.etat.lignes === 4, 'quatre parcelles, aucune deux fois');
verifier(!a.etat.transmis, '« Transmettre ma demande » jamais cliqué');
verifier(a.etat.piece === 'Plan cadastral.pdf', 'plan joint à « CU1. Un plan de situation » (champ nommé « Ajouter ») : ' + a.etat.piece);
verifier(a.valeurs.E1S_signataire === 'P/O Bastien ANGLUMENT', 'signature « P/O » du collaborateur : ' + a.valeurs.E1S_signataire);
verifier(a.etat.verifie, '« Vérifier ma saisie » cliqué à la fin');
verifier(!a.valeurs.D1N_nom && !a.valeurs.D1P_prenom, 'demandeur « personne physique » jamais rempli (l’office est pré-rempli en personne morale)');
verifier((a.assistants.parcelles || {}).etat === 'done' && (a.assistants.adresse || {}).etat === 'done', 'assistants faits');

const b = await jouer(Object.assign({}, base, { terrain: { numero: '9', voie: 'Chemin Inconnu', commune: 'BLOIS', codePostal: '41000' } }));
verifier((b.assistants.adresse || {}).etat === 'manuel', 'adresse sans proposition conforme : laissée à l’étude');
verifier(!b.valeurs.T2V_voie, 'aucune adresse proposée par erreur');
verifier(b.valeurs.T2S_section === 'BA', 'les parcelles restent saisies');

// Relecture du 17/10 : voie proche, autre numéro, autre commune ; parcelle déjà au tableau (zéros en tête) ; boutons « Formuler » dessinés après
// le reste avec un bloc « Mes dossiers » ; chargement de 25 s.
const c = await jouer(base, () => { window.__cfg = { adresses: ['51 Rue Jean Racine 41000 Blois', '151 Rue Racine 41000 Blois'] }; });
verifier((c.assistants.adresse || {}).etat === 'manuel' && !c.valeurs.T2V_voie, '« Rue Jean Racine » et « 151 » refusés pour « 51 Rue Racine »');
const d = await jouer(Object.assign({}, base, { terrain: { numero: '51', voie: 'Rue Racine', commune: 'VINEUIL', codePostal: '41350' } }),
  () => { window.__cfg = { adresses: ['51 Rue Racine 41350 Saint-Claude-de-Diray'] }; });
verifier((d.assistants.adresse || {}).etat === 'manuel' && !d.valeurs.T2V_voie, 'même voie dans une autre commune refusée');
verifier(d.etat.commune === 'Vineuil', 'commune de dépôt = celle du dossier (Vineuil) : ' + d.etat.commune);
const e = await jouer(base, () => { window.__cfg = { parcellesInit: [{ pre: '', s: 'BA', n: '0021', u: '234' }] }; });
verifier(e.etat.lignes === 4, 'parcelle déjà au tableau (« BA 0021 ») jamais rajoutée : ' + e.etat.lignes);
const f = await jouer(base, () => { window.__cfg = { boutonsTard: true, titreSuivi: 'MES DOSSIERS' }; });
verifier(f.etat.hash === '#/saisie/19333' && !f.etat.carteSuivi, 'boutons de « Formuler » attendus, jamais une carte du suivi');
const h = await jouer(base, () => { window.__cfg = { boutonsTard: true, suiviSection: true }; });
verifier(!h.etat.carteSuivi, '« Suivre » d’une autre forme que « Formuler » et boutons en retard : jamais une carte du suivi');
const i = await jouer(Object.assign({}, base, { terrain: { numero: '51', voie: 'Av. Racine', commune: 'BLOIS', codePostal: '41000' } }),
  () => { window.__cfg = { adresses: ['51 Avenue Racine 41000 Blois'] }; });
verifier(i.valeurs.T2V_voie === 'AVENUE RACINE', 'abréviation de la fiche (« Av. ») reconnue : ' + i.valeurs.T2V_voie);
const g = await jouer(base, () => { window.__cfg = { chargement: 25000 }; });
verifier(g.etat.hash !== '#/saisie/19333' || !g.etat.carteSuivi, 'chargement long : jamais une carte du suivi');

// Étude 17/10 : adresse et parcelles TOUJOURS par l'assistant — ouvert à l'appui de la souris, ou jamais ouvert (rien n'est tapé dans les cases).
const m = await jouer(base, () => { window.__cfg = { ouvertureMousedown: true }; });
verifier(m.valeurs.T2V_voie === 'RUE RACINE' && m.valeurs.T2S_section === 'BA', 'assistants ouverts à l’appui de la souris');
const n = await jouer(base, () => { window.__cfg = { assistantMort: true }; });
verifier(!n.valeurs.T2V_voie && !n.valeurs.T2Q_numero && !n.valeurs.T2S_section && !n.valeurs.T2N_numero && !n.valeurs.D5T_total, 'assistant fermé : adresse et parcelles jamais tapées directement');
verifier((n.assistants.adresse || {}).etat === 'absent' && n.etat.verifie, 'assistant fermé : laissé à l’étude, « Vérifier ma saisie » quand même');

// Relecture du 17/10 : une aide de la page cite le titre des assistants, un « Valider » / « Annuler » dans la page ; un filtre par commune à l'accueil.
const o = await jouer(base, () => { window.__cfg = { aideTitre: true }; });
verifier(!o.etat.valPage && !o.etat.annPage, '« Valider » / « Annuler » de la page jamais cliqués à la place de ceux de l’assistant');
verifier(o.valeurs.T2S_section === 'BA' && o.valeurs.T2V_voie === 'RUE RACINE', 'assistants retrouvés malgré l’aide qui cite leur titre');
const q = await jouer(base, () => { window.__cfg = { filtreCommune: true }; });
verifier(!q.etat.filtre && q.etat.commune === 'Blois', 'filtre « par commune de dépôt » de l’accueil jamais pris pour la commune de dépôt : ' + q.etat.filtre);

// Essai de l'étude, 17/10 : la fenêtre de la commune met du temps à s'ouvrir — jamais un second clic sur la démarche.
const r2 = await jouer(base, () => { window.__cfg = { communeLente: 4000 }; });
verifier(r2.etat.ouvertures === 1 && r2.etat.commune === 'Blois', 'fenêtre de commune lente : un seul clic sur la démarche, Blois choisie : ' + r2.etat.ouvertures + ' / ' + r2.etat.commune);

// Étude 17/10 : liste des communes remplie après coup ; propositions d'adresse dessinées en lignes hors de l'assistant.
const r3 = await jouer(base, () => { window.__cfg = { optionsLentes: true }; });
verifier(r3.etat.commune === 'Blois', 'liste des communes remplie après coup : Blois choisie : ' + r3.etat.commune);
const r4 = await jouer(base, () => { window.__cfg = { propositionsDiv: true }; });
verifier(r4.valeurs.T2V_voie === 'RUE RACINE', 'proposition d’adresse en ligne hors de l’assistant choisie : ' + r4.valeurs.T2V_voie);

// Essai de l'étude, 17/10 : le guichet ouvre parfois deux fenêtres de commune — une seule demande, Blois.
const r5 = await jouer(base, () => { window.__cfg = { doubleCommune: true }; });
verifier(r5.etat.demandes === 1 && r5.etat.commune === 'Blois' && r5.valeurs.T2V_voie === 'RUE RACINE', 'deux fenêtres de commune : une seule demande, Blois, puis l’adresse : ' + r5.etat.demandes + ' / ' + r5.etat.commune);

// Essai de l'étude, 17/10 : brouillon d'abord affiché brut (« {{TITLE}} ») — CLAIRE attend qu'il soit dessiné.
const r6 = await jouer(base, () => { window.__cfg = { brut: true }; });
verifier(r6.valeurs.T2V_voie === 'RUE RACINE' && r6.valeurs.T2S_section === 'BA', 'brouillon d’abord brut : CLAIRE attend puis remplit : ' + r6.valeurs.T2V_voie);

// Essai de l'étude, 17/10 : le CERFA met du temps à se charger après la commune — CLAIRE attend, puis fait les étapes dans l'ordre.
const r7 = await jouer(base, () => { window.__cfg = { cerfaLent: true }; });
verifier(r7.valeurs.T2V_voie === 'RUE RACINE' && r7.valeurs.T2S_section === 'BA' && r7.etat.piece === 'Plan cadastral.pdf' && r7.etat.verifie, 'CERFA lent : adresse, parcelles, plan puis Vérifier, dans l’ordre : ' + r7.valeurs.T2V_voie + ' / ' + r7.etat.piece);

// Essai de l'étude, 17/10 : une seule adresse proposée (code INSEE entre parenthèses après la commune), jamais choisie.
const r8 = await jouer(base, () => { window.__cfg = { adresses: ['51 Rue Racine 41000 Blois (41018)'] }; });
verifier(r8.valeurs.T2V_voie === 'RUE RACINE', 'une seule adresse proposée, suivie du code INSEE : choisie : ' + r8.valeurs.T2V_voie);

console.log(erreurs.length ? 'Extension GNAU : ' + erreurs.length + ' échec(s)\n' + erreurs.join('\n') : 'Extension GNAU : parcours d’Agglopolys joué sans erreur.');
process.exit(erreurs.length ? 1 : 0);
