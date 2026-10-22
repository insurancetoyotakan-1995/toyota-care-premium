import pymupdf, re, json, collections, sys
PDF = r'C:\Users\HPAIO\Downloads\16092026_Toyota Care Sale Premium updated Model Toyota.pdf'
d = pymupdf.open(PDF)
NUM = re.compile(r'^\d{1,3}(,\d{3})*(\.\d+)?$')
CODE = re.compile(r'^(?=.*[0-9P])(E?\d{2,3})?\s*\(?\s*(PHYD)?\s*\)?$')
LBL={'ทุนประกัน','(80%)','NET','GROSS','ราคาขาย','รุ่นรถ','เบี','ยประกันภัย','เบียประกันภัย'}
FIX=[('ที นั ง','ที่นั่ง'),('ที ใช้','ที่ใช้'),('เท่านั น','เท่านั้น'),('เท่านัน','เท่านั้น'),('เงื อนไข','เงื่อนไข'),('เพิ ม','เพิ่ม'),('ซื อ','ซื้อ'),('เบี ย','เบี้ย'),('เพื อ','เพื่อ'),('เพือ','เพื่อ'),('ครั ง','ครั้ง'),('สิทธิ ','สิทธิ์ '),('สติ 2 กเกอร์ฟิลม์','สติ๊กเกอร์ฟิล์ม'),('( ','('),(' )',')'),('1+ ','1+')]
def fx(t):
    t=re.sub(r'\s+',' ',t).strip()
    for a,b in FIX: t=t.replace(a,b)
    return t

INS = [('ไอโออิ','Aioi Bangkok','ไอโออิ กรุงเทพ ประกันภัย'),('วิริยะ','Viriyah','วิริยะประกันภัย'),('มิตซุย','Mitsui Sumitomo','มิตซุย ประกันภัย'),
       ('เมืองไทย','Muang Thai','เมืองไทยประกันภัย'),('นวกิจ','Navakij','นวกิจประกันภัย'),('โตเกียว','Tokio Marine','โตเกียวมารีนคุ้มภัย'),('ไทยวิวัฒน์','Thaivivat','ไทยวิวัฒน์ประกันภัย')]
sections = []; warn = []
state = {}
for pi, p in enumerate(d):
    comp = p.get_text().split('\n')[1]
    ins = next(i for i,(k,_,_) in enumerate(INS) if k in comp)
    spans = []
    hy = None
    for b in p.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                t = s['text'].replace('\t','').strip()
                t = re.sub(r'[\x00-\x1f]', '', t)
                if not t: continue
                if t == 'GROSS': hy = s['bbox'][1]
                spans.append((s['bbox'][0], s['bbox'][1], s['bbox'][2], t, s['color']))
    spans = [s for s in spans if s[1] < 800 and not (s[4]==16777215 and s[3] in LBL) and (s[4]==16777215 or s[1] > hy)]
    for half in (0, 1):
        hs = sorted([s for s in spans if (s[0] >= 285) == bool(half)], key=lambda s: (s[1], s[0]))
        rows = []
        for s in hs:
            if rows and s[1] - rows[-1][0] <= 4.5: rows[-1][1].append(s)
            else: rows.append([s[1], [s]])
        key = (ins, half)
        for y, r in rows:
            r.sort(key=lambda s: s[0])
            white = [s for s in r if s[4] == 16777215]
            rest = [s for s in r if s[4] != 16777215]
            if white:
                code = [s for s in white if CODE.match(s[3])]
                name = ' '.join(s[3] for s in white if not CODE.match(s[3]))
                m = CODE.match(code[0][3]) if code else None
                if not name or not m or not m.group(1): warn.append((pi+1, half, 'hdr', [s[3] for s in white]))
                sec = dict(ins=ins, model=fx(name), code=(m.group(1) or '') if m else '', phyd=bool(m and m.group(2)), page=pi+1, rows=[], notes=[])
                prev=state.get(key)
                if not sec['code'] and sec['phyd'] and prev and prev['model']==sec['model']: sec['code']=prev['code']; sec['inh']=1
                sections.append(sec); state[key] = sec
            if not rest: continue
            lim = 150 if not half else 430
            nums = [s for s in rest if NUM.match(s[3]) and s[0] > lim]
            stat = [s for s in rest if s not in nums and s[0] > lim]
            txt = [s for s in rest if s not in nums and s not in stat]
            name = fx(' '.join(s[3] for s in txt))
            st = fx(' '.join(dict.fromkeys(s[3] for s in stat)))
            if st in ('-', '- -'): st = ''
            sec = state.get(key)
            if sec is None:
                warn.append((pi+1, half, 'nosec', name)); continue
            if nums and name:
                v = [float(s[3].replace(',','')) for s in nums]
                if len(v) not in (1,2,4): warn.append((pi+1, half, 'ncols', name, v))
                full = len(v) == 4
                sec['rows'].append(dict(n=name, p=v[0], s=v[1] if len(v)>1 else None, net=v[2] if full else None, g=v[3] if full else None, pg=pi+1, st=st))
            else:
                if nums: warn.append((pi+1, half, 'odd', name, st, [s[3] for s in nums]))
                sec['notes'].append(fx(' '.join(s[3] for s in rest)))
json.dump(dict(ins=INS, sections=sections), open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False)
print('sections', len(sections), 'rows', sum(len(s['rows']) for s in sections))
print('WARN', len(warn))
for w in warn[:60]: print(w)
print(collections.Counter((s['code'], s['phyd']) for s in sections))

bad=0
for s in sections:
    for r in s['rows']:
        if r['net'] and (abs(r['g']/r['net']-1.0743)>0.0006 or r['net']>r['s'] or (r['s'] or 0)>r['p']): bad+=1; print('CHK',s['ins'],s['page'],s['model'],r)
print('bad',bad)

print([ (s['ins'],s['page'],s['model'],s['code'],s['phyd'],len(s['rows'])) for s in sections if not s['code'] or s.get('inh') or not s['rows']])
print(collections.Counter(len(s['rows'])==0 for s in sections), collections.Counter(r['st'] for s in sections for r in s['rows'] if r['net'] is None), collections.Counter(r['st'] for s in sections for r in s['rows'] if r['net']))

for s in sections:
    for r in s['rows']:
        if 0: print('NOPREM',s['ins'],s['page'],s['model'],s['code'],r['n'],r['p'])

out=dict(ins=[x[2] for x in INS], sec=[[s['ins'],s['model'],s['code'],int(s['phyd']),list(dict.fromkeys(s['notes'])),[[r['n'],r['p'],r['s'],r['net'],r['g'],r['pg'],r['st']] for r in s['rows']]] for s in sections])
t=json.dumps(out,ensure_ascii=False,separators=(',',':')).replace('.0,',',').replace('.0]',']')
open('compact.json','w',encoding='utf-8').write(t); print(len(t))
