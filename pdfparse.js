/* อ่านตารางเบี้ยจาก PDF "TOYOTA CARE Sale Premium" ในเบราว์เซอร์ (ใช้ pdf.js)
   ผลลัพธ์มีรูปแบบเดียวกับ data.json: {asOf, ins:[ชื่อบริษัท], sec:[[ins, model, code, phyd, notes, rows]]}
   rows = [[ชื่อรุ่นย่อย, ราคาขาย, ทุนประกัน, เบี้ยสุทธิ, เบี้ยรวม, หน้า PDF, สถานะ]] */
const PdfRates = (() => {
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const INSURERS = [['ไอโออิ', 'ไอโออิ กรุงเทพ ประกันภัย'], ['วิริยะ', 'วิริยะประกันภัย'], ['มิตซุย', 'มิตซุย ประกันภัย'], ['เมืองไทย', 'เมืองไทยประกันภัย'],
    ['นวกิจ', 'นวกิจประกันภัย'], ['โตเกียว', 'โตเกียวมารีนคุ้มภัย'], ['ไทยวิวัฒน์', 'ไทยวิวัฒน์ประกันภัย']];
  const NUM = /^\d{1,3}(,\d{3})*(\.\d+)?$/;
  const CODE = /^(?=.*[0-9P])(E?\d{2,3})?\s*\(?\s*(PHYD)?\s*\)?$/;
  // ฟอนต์ในเอกสารถอดวรรณยุกต์บางตัวไม่ได้ ตัวที่หายจะกลายเป็นช่องว่าง ตารางนี้ซ่อมคำที่พบในเอกสาร
  const FIX = [['ที นั ง', 'ที่นั่ง'], ['ที ใช้', 'ที่ใช้'], ['เท่านั น', 'เท่านั้น'], ['เท่านัน', 'เท่านั้น'], ['เงื อนไข', 'เงื่อนไข'], ['เพิ ม', 'เพิ่ม'], ['ซื อ', 'ซื้อ'],
    ['เบี ย', 'เบี้ย'], ['เพื อ', 'เพื่อ'], ['เพือ', 'เพื่อ'], ['ครั ง', 'ครั้ง'], ['สิทธิ ', 'สิทธิ์ '], ['สติ 2 กเกอร์ฟิลม์', 'สติ๊กเกอร์ฟิล์ม'], ['( ', '('], [' )', ')'], ['1+ ', '1+'],
    ['ทีนัง', 'ที่นั่ง'], ['ทีใช้', 'ที่ใช้'], ['เงือนไข', 'เงื่อนไข'], ['เพิม', 'เพิ่ม'], ['ซือ', 'ซื้อ'], ['เบีย', 'เบี้ย'], ['ครัง', 'ครั้ง'], ['สติกเกอร์ฟิลม์', 'สติ๊กเกอร์ฟิล์ม'], ['สงวนสิทธิไม่', 'สงวนสิทธิ์ไม่'], ['สติ2กเกอร์ฟิลม์', 'สติ๊กเกอร์ฟิล์ม']];
  const fx = s => { s = s.replace(/\s+/g, ' ').trim(); FIX.forEach(([a, b]) => { s = s.split(a).join(b); }); return s.replace(/(\d)\s*\+\s*(\d)/g, '$1+$2'); };
  const num = s => +s.replace(/,/g, '');
  // สระบน/ล่างและวรรณยุกต์ไทย (ความกว้าง 0)
  const MARK = /^[ัิ-ฺ็-๎]$/;
  const skel = s => s.replace(/[\s\u0000ัิ-ฺ็-๎]/g, '');
  const isNum = (it, lim) => it.x > lim && NUM.test(it.t.trim()) && it.t.includes(',');

  // pdf.js คืนข้อความไทยบางฟอนต์มาทีละตัวอักษร และใช้ \u0000 แทนวรรณยุกต์ที่ถอดไม่ได้ จึงต้องประกอบเป็นช่อง (cell) เอง
  function cells(items) {
    const r = items.slice().sort((a, b) => (Math.abs(a.x - b.x) < 0.6 ? MARK.test(b.t) - MARK.test(a.t) : a.x - b.x));
    const out = []; let cur = null, end = 0, space = false;
    for (const it of r) {
      if (!it.t.replace(/\u0000/g, '')) { end = Math.max(end, it.x + it.w); continue; }   // ตัวอักษรว่างที่ฟอนต์แทรกมาเอง ไม่ใช่ช่องว่างจริง
      if (!it.t.trim()) { if (it.w > 0.3) space = true; end = Math.max(end, it.x + it.w); continue; }   // ช่องว่างกว้าง 0 ที่ตามหลังสระบน/ล่าง ไม่ใช่การเว้นวรรค
      const text = it.t.replace(/[\u0000-\u001f]/g, '');
      const gap = it.x - end;
      if (!cur || gap > 5) { cur = {x: it.x, t: text.trim()}; out.push(cur); }
      else cur.t += (space || gap > 0.45 || /^\s/.test(text) ? ' ' : '') + text.trim();
      space = /\s$/.test(text); end = Math.max(end, it.x + it.w);
    }
    return out.filter(c => c.t);
  }

  const loadScript = src => new Promise((ok, fail) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('โหลดตัวอ่าน PDF ไม่ได้ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต')); document.head.appendChild(s);
  });
  async function lib() {
    // โหลด worker เป็นสคริปต์ธรรมดาก่อน pdf.js จะใช้มันบนหน้าเดียวกันโดยไม่ต้องสร้าง Web Worker ข้ามโดเมน
    await loadScript(PDFJS + 'pdf.worker.min.js');
    await loadScript(PDFJS + 'pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    return window.pdfjsLib;
  }

  async function parse(buffer, onProgress = () => {}) {
    const pdfjs = await lib();
    const doc = await pdfjs.getDocument({data: buffer, disableFontFace: true, useSystemFonts: false, isEvalSupported: false}).promise;
    const insNames = [], insIndex = new Map(), sections = [], warnings = [], state = new Map();
    let asOf = '';
    for (let pn = 1; pn <= doc.numPages; pn++) {
      onProgress(pn, doc.numPages);
      const page = await doc.getPage(pn);
      const H = page.getViewport({scale: 1}).height;
      const items = (await page.getTextContent()).items.map(it => ({x: it.transform[4], y: H - it.transform[5], w: it.width || 0, t: it.str})).filter(it => it.t);
      page.cleanup();
      if (!items.length) continue;

      // บริษัทประกันของหน้านี้ = บรรทัดที่มีคำว่า "บริษัท" ด้านบนสุด
      const lines = [];
      const grossY = Math.max(0, ...items.filter(it => it.t.trim() === 'GROSS').map(it => it.y)) || 140;
      items.filter(it => it.y < grossY).sort((p, q) => p.y - q.y).forEach(it => { const l = lines[lines.length - 1]; if (l && it.y - l.y <= 3) l.items.push(it); else lines.push({y: it.y, items: [it]}); });
      const compLine = lines.map(l => cells(l.items.filter(it => it.x < 300)).map(c => c.t).join(' ')).find(s => skel(s).includes(skel('บริษัท'))) || '';
      const comp = skel(compLine);
      const known = INSURERS.find(([k]) => comp.includes(skel(k)));
      const name = known ? known[1] : fx(compLine.replace(/บริษัท|จํากัด|จำกัด|\(|มหาชน|\)/g, ' ')) || 'ไม่ทราบบริษัท';
      if (!known) warnings.push(`หน้า ${pn}: ไม่รู้จักชื่อบริษัทประกัน “${name}”`);
      if (!insIndex.has(name)) { insIndex.set(name, insNames.length); insNames.push(name); }
      const ins = insIndex.get(name);
      if (!asOf) { const d = items.map(it => it.t.trim()).join(' ').match(/\b\d{2}\.\d{2}\.\d{4}\b/); if (d) asOf = d[0]; }

      const gross = items.filter(it => it.t.trim() === 'GROSS');
      if (!gross.length) { warnings.push(`หน้า ${pn}: ไม่พบหัวตาราง (NET / GROSS)`); continue; }
      const top = Math.max(...gross.map(g => g.y)) + 4;
      const body = items.filter(it => it.y > top && it.y < H - 42);
      for (const half of [0, 1]) {
        const lim = half ? 430 : 150;
        const all = body.filter(it => (it.x >= 285) === !!half).sort((a, b) => a.y - b.y);
        const rows = [];
        all.forEach(it => { const r = rows[rows.length - 1]; if (r && it.y - r.y <= 4.5) r.items.push(it); else rows.push({y: it.y, items: [it]}); });
        const loose = [];   // รหัสหัวตารางที่วางเหลื่อมบรรทัดจนไปอยู่ในแถวข้อมูล
        rows.forEach(row => {
          const text = cells(row.items);
          row.codes = [];
          if (!text.length) { row.skip = true; return; }
          if (/^(\*|รหัส)/.test(text[0].t)) {
            row.note = true; row.nums = [];
            // รหัส 3 หลักในคอลัมน์เบี้ยท้ายบรรทัดหมายเหตุ ไม่ใช่ข้อความของหมายเหตุ: เป็นรหัสหัวตารางที่วางเหลื่อม หรือรหัสซ้ำที่ซ่อนอยู่
            const last = row.items.slice().sort((p, q) => q.x - p.x).find(it => it.t.trim());
            if (last && last.x > lim && /^(E\d{2}|\d{3})?\s*\(?\s*(PHYD)?\s*\)?$/.test(last.t.trim())) {
              loose.push(last);
              row.cells = cells(row.items.filter(it => it !== last));
            } else row.cells = text;
            return;
          }   // หมายเหตุ: เก็บข้อความทั้งบรรทัดรวมตัวเลข
          row.nums = row.items.filter(it => isNum(it, lim)).sort((p, q) => p.x - q.x);
          const codeIts = row.items.filter(it => it.x > lim && it.t.trim() && CODE.test(it.t.trim()));
          row.cells = cells(row.items.filter(it => !row.nums.includes(it) && !codeIts.includes(it)));
          row.head = !row.nums.length && row.cells.length > 0;
          if (row.head && codeIts.length > 1) {
            // ต้นหน้าอาจมีรหัสของตารางก่อนหน้าซ่อนซ้อนอยู่: เก็บเฉพาะรหัสที่อยู่บรรทัดเดียวกับชื่อรุ่นที่สุด
            const nameY = Math.max(...row.items.filter(it => !codeIts.includes(it) && it.t.trim()).map(it => it.y));
            const near = Math.min(...codeIts.map(c => Math.abs(c.y - nameY)));
            row.codes = codeIts.filter(c => Math.abs(c.y - nameY) - near < 0.5);
          } else if (row.head) row.codes = codeIts; else loose.push(...codeIts);
          if (!row.nums.length && !row.cells.length) row.skip = true;
        });
        const heads = rows.filter(row => row.head);
        loose.forEach(c => {
          const h = heads.filter(x => !x.codes.length).sort((p, q) => Math.abs(p.y - c.y) - Math.abs(q.y - c.y))[0];
          // รหัสที่ไม่มีหัวตารางอยู่ใกล้ ๆ คือรหัสซ้ำของตารางที่ต่อมาจากหน้าก่อน (ถูกซ่อนไว้ในเอกสาร) จึงข้ามได้
          if (h && Math.abs(h.y - c.y) <= 10) h.codes.push(c);
        });
        const key = ins + '|' + half;
        for (const row of rows) {
          if (row.skip) continue;
          const nums = row.nums, r = row.cells;
          if (row.head) {
            // แถวหัวตาราง: ชื่อรุ่นรถ + รหัส (เช่น 110, 110 PHYD)
            const model = fx(r.map(c => c.t).join(' '));
            const m = CODE.exec(row.codes.sort((p, q) => p.x - q.x).map(c => c.t.trim()).join(' '));
            const sec = {ins, model, code: (m && m[1]) || '', phyd: m && m[2] ? 1 : 0, notes: [], rows: [], page: pn};
            const prev = state.get(key);
            if (!sec.code && sec.phyd && prev && prev.model === sec.model) sec.code = prev.code;
            if (!model) { warnings.push(`หน้า ${pn}: หัวตารางไม่มีชื่อรุ่น`); continue; }
            sections.push(sec); state.set(key, sec);
            continue;
          }
          const sec = state.get(key);
          if (!sec) { warnings.push(`หน้า ${pn}: พบแถวข้อมูลก่อนหัวตาราง`); continue; }
          const stat = r.filter(c => c.x > lim);
          const label = fx(r.filter(c => c.x <= lim).map(c => c.t).join(' '));
          let st = fx([...new Set(stat.map(c => c.t))].join(' '));
          if (st === '-' || st === '- -') st = '';
          if (nums.length && label) {
            const v = nums.map(it => num(it.t.trim()));
            if (![1, 2, 4].includes(v.length)) warnings.push(`หน้า ${pn}: “${label}” มีตัวเลข ${v.length} ช่อง`);
            const full = v.length === 4;
            sec.rows.push([label, v[0], v.length > 1 ? v[1] : null, full ? v[2] : null, full ? v[3] : null, pn, st]);
          } else {
            sec.notes.push(fx(r.map(c => c.t).join(' ')));
          }
        }
      }
    }
    const sec = sections.map(s => [s.ins, s.model, s.code, s.phyd, [...new Set(s.notes)], s.rows]);
    return {asOf, ins: insNames, sec, warnings, pages: doc.numPages};
  }

  // สรุปและตรวจความสมเหตุสมผลของข้อมูลที่อ่านได้ ก่อนให้ผู้ใช้กดยืนยัน
  function summarize(d) {
    let rows = 0, priced = 0, oddRatio = 0, noCode = 0;
    const cars = new Set(), models = new Set();
    d.sec.forEach(([ins, model, code, phyd, notes, rs]) => {
      models.add(model); if (!code) noCode++;
      rs.forEach(([n, p, s, net, g]) => { rows++; cars.add(skel(model.toLowerCase()) + '|' + skel(n.toLowerCase()) + '|' + p); if (g != null) { priced++; if (Math.abs(g / net - 1.0743) > 0.0006) oddRatio++; } });
    });
    return {asOf: d.asOf, insurers: d.ins.length, sections: d.sec.length, models: models.size, cars: cars.size, rows, priced, oddRatio, noCode, emptySections: d.sec.filter(s => !s[5].length).length, warnings: d.warnings || []};
  }
  return {parse, summarize, skel};
})();
