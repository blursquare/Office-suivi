'use strict';

// Lecture des réponses EWS par fast-xml-parser (exchange/xml.js, 04/10) : mêmes résultats que l'ancien décodage
// à la main (entités, « &#xD; » d'Exchange, &amp; décodé une seule fois), réponses illisibles sans plantage.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lireXml, tous, texteDe, analyseEws, identifiantElement, aCodeReponse, succesSansErreur } = require('../src/exchange/xml');

const valeur = (v) => texteDe(lireXml(`<a><b>${v}</b></a>`), 'b');

test('entités : décodées une seule fois, références numériques, hors Unicode laissé tel quel', () => {
  assert.equal(valeur('A &amp;lt; B'), 'A &lt; B');
  assert.equal(valeur('a &lt;b&gt; &quot;c&quot; d&#39;e'), 'a <b> "c" d\'e');
  assert.equal(valeur('ligne 1&#xD;\nligne 2'), 'ligne 1\r\nligne 2');
  assert.equal(valeur('a&#13;b &#233;t&#xE9;'), 'a\rb été');
  assert.equal(valeur('&amp;#xD;'), '&#xD;');
  assert.equal(valeur('&#x110000;'), '&#x110000;');
  assert.equal(valeur('  0012  '), '  0012  ', 'jamais converti en nombre, espaces gardés');
});

test('analyseEws : succès, code d’erreur, erreur SOAP, page HTML, corps vide', () => {
  const ok = analyseEws('<s:Envelope><s:Body><m:CreateItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode>'
    + '<m:Items><t:Message><t:ItemId Id="AA+/=" ChangeKey="CK"/></t:Message></m:Items></m:CreateItemResponseMessage></s:Body></s:Envelope>');
  assert.equal(ok.ok, true);
  assert.equal(JSON.stringify(identifiantElement(ok.doc)), '{"itemId":"AA+/=","changeKey":"CK"}');
  const ko = analyseEws('<m:GetItemResponseMessage ResponseClass="Error"><m:MessageText>x</m:MessageText><m:ResponseCode>ErrorItemNotFound</m:ResponseCode></m:GetItemResponseMessage>');
  assert.equal(`${ko.ok}/${ko.code}/${ko.codee}`, 'false/ErrorItemNotFound/true');
  assert.equal(aCodeReponse('<m:R><m:ResponseCode>NoError</m:ResponseCode></m:R><m:R><m:ResponseCode>ErrorItemNotFound</m:ResponseCode></m:R>', 'ErrorItemNotFound'), true);
  const fault = analyseEws('<s:Envelope><s:Body><s:Fault><faultcode>a:ErrorSchemaValidation</faultcode><faultstring xml:lang="en-US">The request failed schema validation</faultstring></s:Fault></s:Body></s:Envelope>');
  assert.equal(`${fault.ok}/${fault.code}`, 'false/The request failed schema validation');
  assert.equal(JSON.stringify(analyseEws('<html><body>500</body></html>')), JSON.stringify({ doc: { html: { body: '500' } }, ok: false, code: '', codee: false }));
  assert.equal(analyseEws('').doc, null);
  assert.equal(analyseEws(undefined).ok, false);
});

test('succesSansErreur : un lot avec une réponse en erreur n’est pas un succès', () => {
  assert.equal(succesSansErreur('<m:A ResponseClass="Success"/><m:B ResponseClass="Success"/>'), true);
  assert.equal(succesSansErreur('<m:A ResponseClass="Success"/><m:B ResponseClass="Error"/>'), false);
});

test('tous : éléments répétés ou seuls, dans l’ordre du document', () => {
  const doc = lireXml('<r><t:Items><t:Message><t:Subject>1</t:Subject></t:Message><t:Message><t:Subject>2</t:Subject></t:Message></t:Items><x><t:Message><t:Subject>3</t:Subject></t:Message></x></r>');
  assert.equal(tous(doc, 'Message').map((m) => texteDe(m, 'Subject')).join(','), '1,2,3');
});
