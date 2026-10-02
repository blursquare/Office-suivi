# Relevé de l'annuaire des notaires de France (étude, 02/10/2026) → server/src/data/annuaire-notaires.json
#
# Outil de maintenance, lancé à la main (jamais par le serveur) : python3 releve-annuaire-notaires.py [codes…]
# depuis un dossier de travail, puis la fusion (fusion_annuaire, en bas). Source : annuaire public immonot —
# la page de chaque département (données structurées : office, téléphone, email, adresse), puis la fiche de
# chaque office (notaires, bureaux secondaires). notaires.fr refuse la lecture automatique (403). Poli :
# 4 fiches à la fois, 0,3 s entre deux pages de liste ; reprend là où il s'est arrêté (un fichier par
# département dans ./annuaire/). La page d'accueil de l'annuaire omet 78, 85, 86, 88 et 89 : ajoutés à la main.
# La page d'accueil (annuaire-des-notaires-de-france.html) est à enregistrer d'abord sous ./ann.html.
import re, json, html, sys, time, os, urllib.request, concurrent.futures as cf
BASE='https://www.immonot.com'
OUT='annuaire'
UA={'User-Agent':'Mozilla/5.0'}
def get(url, essais=3):
    for i in range(essais):
        try:
            req=urllib.request.Request(BASE+url if url.startswith('/') else url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r: h=r.read().decode('utf-8','replace')
            m=re.search(r'http-equiv="refresh" content="0; url=([^"]+)"', h)
            if m and len(h) < 2000: return get(m.group(1), essais)
            return h
        except Exception as e:
            time.sleep(2*(i+1)); err=e
    print('ECHEC', url, err, file=sys.stderr); return ''
def departements():
    h=open('ann.html').read()
    liens=set(re.findall(r'href="(/annuaire-notaires/offices-notariaux/D([0-9AB]{2,3})/[^"?]+\.html)"', h))
    # Absents de la page d'accueil de l'annuaire (relevé du 02/10/2026), pages bien présentes.
    for dep, nom in [('78','yvelines'),('85','vendee'),('86','vienne'),('88','vosges'),('89','yonne')]:
        liens.add((f'/annuaire-notaires/offices-notariaux/D{dep}/{nom}.html', dep))
    return sorted(liens, key=lambda x:x[1])
def offices_page(h, dep):
    res=[]
    for bloc in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', h, re.S):
        try: data=json.loads(bloc)
        except Exception: continue
        def parcours(o):
            if isinstance(o, dict):
                if o.get('@type')=='LocalBusiness' and 'detail/OFFI' in (o.get('url') or ''):
                    res.append(o)
                for v in o.values(): parcours(v)
            elif isinstance(o, list):
                for v in o: parcours(v)
        parcours(data)
    out=[]
    for o in res:
        m=re.search(r'detail/OFFI0*(\d+)/', o['url']); a=o.get('address') or {}
        out.append({'id':'annuaire-'+m.group(1),'office':html.unescape(o.get('name','')).strip(),'telephone':(o.get('telephone') or '').replace('.',' ').strip(),
            'email':(o.get('email') or '').strip(),'adresse':html.unescape(a.get('streetAddress','') or '').strip(),'codePostal':(a.get('postalCode') or '').strip(),
            'ville':html.unescape(a.get('addressLocality','') or '').strip(),'departement':dep,'url':o['url'].replace(BASE,'')})
    return out
def releve_departement(lien, dep):
    chemin=f'{OUT}/dep-{dep}.json'
    if os.path.exists(chemin): return json.load(open(chemin))
    vus={}; page=1
    while page < 80:
        h=get(lien + ('' if page==1 else f'?page={page}'))
        nouveaux=[o for o in offices_page(h, dep) if o['id'] not in vus]
        if not nouveaux: break
        for o in nouveaux: vus[o['id']]=o
        page+=1; time.sleep(0.3)
    liste=list(vus.values()); json.dump(liste, open(chemin,'w'), ensure_ascii=False); return liste
def detail(o):
    h=get(o['url'])
    if not h: o['erreur']=True; return o
    o['notaires']=[re.sub(r'^Mes?\.?\s+','',html.unescape(n)).strip() for n in re.findall(r'id="NOT\d+"[^>]*>.*?<p class="font-bold">([^<]+)</p>', h, re.S)]
    bur=[(html.unescape(a).strip(), re.sub(r'\s+',' ',html.unescape(b)).strip()) for a,b in re.findall(r'<div class="justify-between mt-8 mb-4"><div><p class="font-bold">([^<]*)</p><p class="notaire-adress-xs mt-1">([^<]*)</p>', h)]
    vus=[]
    for n in o['notaires']:
        if n and n not in vus: vus.append(n)
    o['notaires']=vus
    if o['office'].endswith('...') and bur and bur[0][0].startswith(o['office'][:-3].strip()):
        o['office']=bur[0][0]
    o['office']=re.sub(r'\s*\.\.\.$','',o['office'])
    rue=re.sub(r'[^a-z0-9]','',o['adresse'].lower())
    def principal(b):
        net=re.sub(r'[^a-z0-9]','',b.lower())
        return o['codePostal'] in b and rue and rue[:15] in net
    o['bureaux']=[]
    for _,b in bur:
        if b and not principal(b) and b not in o['bureaux']: o['bureaux'].append(b)
    o['bureaux']=o['bureaux'][:8]
    return o
if __name__=='__main__':
    seuls=sys.argv[1:]
    deps=[d for d in departements() if not seuls or d[1] in seuls]
    print(len(deps),'départements', file=sys.stderr)
    for lien, dep in deps:
        chemin=f'{OUT}/off-{dep}.json'
        if os.path.exists(chemin): continue
        liste=releve_departement(lien, dep)
        with cf.ThreadPoolExecutor(4) as ex: details=list(ex.map(detail, liste))
        json.dump(details, open(chemin,'w'), ensure_ascii=False)
        print(dep, len(details), 'offices', sum(1 for d in details if d.get('erreur')), 'erreurs', file=sys.stderr, flush=True)

# ---- Fusion ----
# python3 -c 'import runpy; runpy.run_path("fusion_annuaire.py")' — voir ci-dessous.
# import json, glob, re, sys
# offices=[]; vus=set(); erreurs=0
# for f in sorted(glob.glob('annuaire/off-*.json')):
#     for o in json.load(open(f)):
#         if o['id'] in vus: continue
#         vus.add(o['id'])
#         if o.get('erreur'): erreurs+=1
#         email=o.get('email','').strip()
#         if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email): email=''
#         cp=o.get('codePostal','').strip()
#         offices.append({'id':o['id'],'office':o['office'][:120],'notaires':[n[:80] for n in o.get('notaires',[])][:12],'email':email,
#             'telephone':o.get('telephone','')[:40],'adresse':o.get('adresse','')[:160],'codePostal':cp if re.match(r'^\d{5}$',cp) else '',
#             'ville':o.get('ville','')[:80],'departement':o['departement'],'bureaux':o.get('bureaux',[])[:8]})
# data={'source':'Annuaire immonot, relevé du 02/10/2026','releveLe':'2026-10-02','offices':offices}
# out='annuaire-notaires.json'  # à copier dans server/src/data/
# import os; os.makedirs(os.path.dirname(out), exist_ok=True)
# json.dump(data, open(out,'w'), ensure_ascii=False, separators=(',',':'))
# print(len(offices),'offices', erreurs,'fiches en erreur', len(set(o['departement'] for o in offices)),'départements', os.path.getsize(out)//1024,'Ko')
# print('sans notaire', sum(1 for o in offices if not o['notaires']), 'sans email', sum(1 for o in offices if not o['email']), 'sans téléphone', sum(1 for o in offices if not o['telephone']))
