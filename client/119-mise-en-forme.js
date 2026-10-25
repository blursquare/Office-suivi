// Mise en forme des messages comme dans Slack (étude 25/10) : *gras*, _italique_, ~barré~, `code`, ```bloc de code```, > citation, - liste,
// 1. liste numérotée, [mots](adresse) et adresses web. Le texte reste du TEXTE sur le serveur (les marques s'y lisent telles quelles) ;
// c'est l'affichage qui les met en forme, après avoir échappé tout le HTML : rien d'autre qu'une balise de cette liste ne peut sortir.
// Une adresse n'est un lien que si elle commence par https://, http:// ou mailto:.

// Pure : le texte d'un message, en HTML sûr. `apresInline(html)` (facultatif) transforme le HTML déjà échappé AVANT la remise en place des blocs
// de code et des liens (les @mentions ne se colorent pas dans un bloc de code).
function htmlMiseEnFormeCanal(texte, apresInline) {
  const gardes = [];
  const garder = (html) => { gardes.push(html); return `\u0001${gardes.length - 1}\u0002`; };
  const lien = (url, mots) => garder(`<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(mots)}</a>`);
  let t = String(texte == null ? '' : texte).replace(/\r/g, '').replace(/[\u0001\u0002]/g, '');
  t = t.replace(/```([\s\S]*?)```/g, (m, c) => garder(`<pre class="cx-code-bloc"><code>${escapeHtml(c.replace(/^\n/, '').replace(/\n$/, ''))}</code></pre>`));
  t = t.replace(/`([^`\n]+)`/g, (m, c) => garder(`<code>${escapeHtml(c)}</code>`));
  t = t.replace(/\[([^\]\n]{1,200})\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (m, mots, url) => lien(url, mots));
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g, (m, avant, url) => avant + lien(url, url));
  t = escapeHtml(t);
  const bord = '(^|[\\s(>])';
  const fin = '(?=$|[\\s.,;:!?)<])';
  t = t.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(new RegExp(bord + '\\*([^\\s*](?:[^*\\n]*[^\\s*])?)\\*' + fin, 'g'), '$1<strong>$2</strong>');
  t = t.replace(new RegExp(bord + '_([^\\s_](?:[^_\\n]*[^\\s_])?)_' + fin, 'g'), '$1<em>$2</em>');
  t = t.replace(new RegExp(bord + '~([^\\s~](?:[^~\\n]*[^\\s~])?)~' + fin, 'g'), '$1<del>$2</del>');
  // Les lignes : citations, listes, texte.
  const sortie = [];
  let bloc = null;   // { sorte: 'quote' | 'ul' | 'ol', lignes: [] }
  const fermer = () => {
    if (!bloc) return;
    if (bloc.sorte === 'quote') sortie.push(`<blockquote class="cx-citation">${bloc.lignes.join('<br>')}</blockquote>`);
    else sortie.push(`<${bloc.sorte}>${bloc.lignes.map(l => `<li>${l}</li>`).join('')}</${bloc.sorte}>`);
    bloc = null;
  };
  let texteSeul = [];
  const viderTexte = () => { if (texteSeul.length) { sortie.push(texteSeul.join('<br>')); texteSeul = []; } };
  for (const ligne of t.split('\n')) {
    const sorte = /^&gt; ?/.test(ligne) ? 'quote' : /^(?:[-•]|\*) +/.test(ligne) ? 'ul' : /^\d{1,3}[.)] +/.test(ligne) ? 'ol' : '';
    if (!sorte) { fermer(); texteSeul.push(ligne); continue; }
    viderTexte();
    if (!bloc || bloc.sorte !== sorte) { fermer(); bloc = { sorte, lignes: [] }; }
    bloc.lignes.push(sorte === 'quote' ? ligne.replace(/^&gt; ?/, '') : sorte === 'ul' ? ligne.replace(/^(?:[-•]|\*) +/, '') : ligne.replace(/^\d{1,3}[.)] +/, ''));
  }
  fermer(); viderTexte();
  let html = sortie.join('');
  if (typeof apresInline === 'function') html = apresInline(html);
  return html.replace(/\u0001(\d+)\u0002/g, (m, i) => gardes[Number(i)] || '');
}

// ---- La saisie : barre de mise en forme, Ctrl+B / Ctrl+I, emoji ----

// Entoure la sélection de la saisie d'une marque (ou la retire si elle y est déjà).
function formaterSaisieAssistant(marque) {
  const champ = document.getElementById('assistant-saisie');
  if (!champ) return;
  champ.focus();
  const a = champ.selectionStart;
  const b = champ.selectionEnd;
  const v = champ.value;
  const choisi = v.slice(a, b);
  const m = marque === 'lien' ? '' : marque;
  if (marque === 'lien') {
    const mots = choisi || 'texte du lien';
    champ.value = `${v.slice(0, a)}[${mots}](https://)${v.slice(b)}`;
    const debutUrl = a + mots.length + 4;
    champ.setSelectionRange(debutUrl, debutUrl + 8);
  } else if (m && choisi.startsWith(m) && choisi.endsWith(m) && choisi.length >= 2 * m.length) {
    champ.value = v.slice(0, a) + choisi.slice(m.length, choisi.length - m.length) + v.slice(b);
    champ.setSelectionRange(a, b - 2 * m.length);
  } else if (marque === 'liste') {
    const lignes = (choisi || '').split('\n');
    const texte = lignes.map(l => (/^- /.test(l) ? l.slice(2) : '- ' + l)).join('\n');
    champ.value = v.slice(0, a) + texte + v.slice(b);
    champ.setSelectionRange(a, a + texte.length);
  } else {
    champ.value = `${v.slice(0, a)}${m}${choisi}${m}${v.slice(b)}`;
    champ.setSelectionRange(a + m.length, b + m.length);
  }
  champ.dispatchEvent(new Event('input', { bubbles: true }));
}

function insererEmojiSaisie(emoji) {
  const champ = document.getElementById('assistant-saisie');
  if (!champ) return;
  champ.focus();
  const a = champ.selectionStart;
  champ.value = champ.value.slice(0, a) + emoji + champ.value.slice(champ.selectionEnd);
  champ.setSelectionRange(a + emoji.length, a + emoji.length);
  champ.dispatchEvent(new Event('input', { bubbles: true }));
}

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !e.target || (e.target.id !== 'assistant-saisie' && e.target.id !== 'fil-saisie')) return;
    const k = String(e.key).toLowerCase();
    const marque = k === 'b' ? '*' : k === 'i' ? '_' : (k === 'k' && e.shiftKey) ? '`' : '';
    if (!marque || e.target.id !== 'assistant-saisie') return;
    e.preventDefault();
    formaterSaisieAssistant(marque);
  });
}
