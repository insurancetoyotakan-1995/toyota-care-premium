/* อัปเดตข้อมูลจากไฟล์ PDF: อ่านไฟล์ในเบราว์เซอร์ → แสดงสรุปให้ตรวจ → บันทึกเป็นข้อมูลชุดใหม่
   - เมื่อตั้งค่า Supabase (config.js): บันทึกลงฐานข้อมูล ทุกคนที่เปิดเว็บเห็นชุดใหม่ เฉพาะผู้ดูแลที่เข้าสู่ระบบเท่านั้นที่บันทึกได้
   - ยังไม่ตั้งค่า / เปิดจากไฟล์ในเครื่อง: ใช้ชุดใหม่ได้จนกว่าจะปิดหน้า */
const Updater = (() => {
  const CFG = window.TC_CONFIG || {};
  const SB_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const adm = {open: false, step: 'pick', file: '', parsed: null, sum: null, error: '', done: ''};
  const local = !(CFG.url && CFG.anonKey);
  let sb = null, canWrite = local, liveVersion = null, remoteMeta = null, signedIn = false;

  const fmt = n => (n == null ? '–' : n.toLocaleString('en-US'));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

  const loadSdk = () => window.supabase ? Promise.resolve() : new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = SB_JS; s.onload = ok; s.onerror = () => no(new Error('sdk'));
    document.head.appendChild(s);
  });

  async function checkAdmin() {
    const {data} = await sb.auth.getSession();
    signedIn = !!(data && data.session);
    canWrite = false;
    if (signedIn) {
      const {data: ok} = await sb.rpc('is_admin');
      canWrite = ok === true;
    }
  }

  // อ่านชุดข้อมูลปัจจุบันจากฐานข้อมูล (ถ้าไม่มี = ใช้ชุดที่มากับหน้าเว็บ)
  async function pull(onData) {
    const {data: m} = await sb.from('rate_sets').select('version,as_of,file,cars,rows,created_at').eq('is_current', true).maybeSingle();
    remoteMeta = m || null;
    const ver = m ? m.version : null;
    if (ver === liveVersion) return;
    liveVersion = ver;
    if (!m) { onData(null); return; }
    const {data: r, error} = await sb.from('rate_sets').select('data').eq('version', ver).single();
    if (error || !r) return;
    const d = r.data; d.v = ver;
    onData(d);
  }

  async function start(onData) {
    document.getElementById('updBox').hidden = false;
    if (local) return;
    try {
      await loadSdk();
      sb = window.supabase.createClient(CFG.url, CFG.anonKey);
      await checkAdmin();
      sb.auth.onAuthStateChange(() => { checkAdmin().catch(() => {}); });
      await pull(onData);
    } catch (e) { /* ต่อฐานข้อมูลไม่ได้: ใช้ข้อมูลที่มากับหน้าเว็บต่อ */ }
  }

  // ผู้ดูแลเข้าสู่ระบบด้วยอีเมล + รหัสผ่านของ Supabase Auth
  async function login(email, pw, rerender) {
    adm.error = '';
    try {
      if (!sb) { await loadSdk(); sb = window.supabase.createClient(CFG.url, CFG.anonKey); }
      const {error} = await sb.auth.signInWithPassword({email, password: pw});
      if (error) throw error;
      await checkAdmin();
      if (!canWrite) { await sb.auth.signOut(); signedIn = false; throw new Error('noadmin'); }
      adm.step = 'pick';
    } catch (e) {
      adm.error = e && e.message === 'noadmin' ? 'บัญชีนี้ยังไม่ได้รับสิทธิ์ผู้ดูแล' : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือเชื่อมต่อไม่ได้';
    }
    rerender();
  }
  async function logout(rerender) {
    try { await sb.auth.signOut(); } catch (e) {}
    signedIn = false; canWrite = false; adm.step = 'login'; rerender();
  }
  const needLogin = () => !local && !canWrite;

  async function readFile(file, rerender) {
    Object.assign(adm, {step: 'reading', file: file.name, error: '', parsed: null});
    rerender();
    try {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('ไฟล์นี้ไม่ใช่ PDF กรุณาเลือกไฟล์ตารางเบี้ย TOYOTA CARE ที่เป็น .pdf');
      const buf = await file.arrayBuffer();
      const parsed = await PdfRates.parse(buf, (p, n) => {
        const bar = document.getElementById('admBar'), txt = document.getElementById('admTxt');
        if (bar) bar.style.width = Math.round(p / n * 100) + '%';
        if (txt) txt.textContent = `กำลังอ่านหน้า ${p} จาก ${n}`;
      });
      const sum = PdfRates.summarize(parsed);
      if (sum.rows < 50 || !sum.insurers || !sum.priced) throw new Error('อ่านตารางเบี้ยจากไฟล์นี้ไม่ได้ ไฟล์อาจไม่ใช่ตาราง TOYOTA CARE หรือรูปแบบตารางเปลี่ยนไปจากเดิม');
      Object.assign(adm, {step: 'review', parsed, sum});
    } catch (e) {
      // ข้อความจากตัวอ่าน PDF เป็นภาษาอังกฤษเชิงเทคนิค: แสดงข้อความของเราเองแทน
      const ours = e && /[฀-๿]/.test(e.message || '');
      Object.assign(adm, {step: 'error', error: ours ? e.message : 'เปิดไฟล์ PDF นี้ไม่ได้ ไฟล์อาจเสียหาย มีรหัสผ่าน หรือไม่ใช่ PDF'});
    }
    rerender();
  }

  async function save(onData, rerender) {
    const d = {asOf: adm.parsed.asOf, ins: adm.parsed.ins, sec: adm.parsed.sec};
    adm.step = 'saving'; rerender();
    try {
      if (local) {
        d.v = 'local-' + Date.now().toString(36);
        onData(d);
        adm.done = 'ใช้ข้อมูลชุดใหม่แล้วในหน้านี้ ข้อมูลจะกลับเป็นชุดเดิมเมื่อปิดหรือรีเฟรชหน้า';
      } else {
        const version = Date.now().toString(36);
        const {error} = await sb.rpc('publish_rates', {p_version: version, p_as_of: d.asOf || '', p_file: adm.file, p_cars: adm.sum.cars, p_rows: adm.sum.rows, p_data: d});
        if (error) throw error;
        liveVersion = version;
        remoteMeta = {version, as_of: d.asOf, file: adm.file, cars: adm.sum.cars, rows: adm.sum.rows};
        d.v = version;
        onData(d);
        adm.done = 'บันทึกแล้ว ทุกคนที่เปิดเว็บนี้จะเห็นข้อมูลชุดใหม่';
      }
      adm.step = 'done';
    } catch (e) {
      Object.assign(adm, {step: 'error', error: 'บันทึกไม่สำเร็จ ข้อมูลที่ใช้อยู่ยังเป็นชุดเดิม ลองใหม่อีกครั้ง'});
    }
    rerender();
  }

  async function restore(onData, rerender) {
    adm.step = 'saving'; rerender();
    try {
      const {error} = await sb.rpc('reset_rates');
      if (error) throw error;
      liveVersion = null; remoteMeta = null;
      onData(null);
      Object.assign(adm, {step: 'done', done: 'กลับไปใช้ข้อมูลตั้งต้นที่มากับหน้าเว็บแล้ว'});
    } catch (e) {
      Object.assign(adm, {step: 'error', error: 'เปลี่ยนกลับไม่สำเร็จ ลองใหม่อีกครั้ง'});
    }
    rerender();
  }

  function html(current) {
    const cur = PdfRates.summarize(current);
    const head = `<button type="button" class="back" data-adm="close">${ICON.back}กลับ</button><h2>อัปเดตข้อมูลจากไฟล์ PDF</h2>`;
    if (needLogin() || adm.step === 'login') return head + `<p class="sub">สำหรับผู้ดูแลระบบ · เข้าสู่ระบบเพื่ออัปเดตข้อมูล</p>
      <form id="admLogin" class="adm-card">
        <label class="fld">อีเมล<input name="email" type="email" autocomplete="username" required></label>
        <label class="fld">รหัสผ่าน<input name="pw" type="password" autocomplete="current-password" required></label>
        ${adm.error ? `<p class="hint" role="alert" style="color:var(--warn-fg)"><b>${esc(adm.error)}</b></p>` : ''}
        <div class="actions"><button type="submit" class="btn primary">เข้าสู่ระบบ</button></div>
      </form>`;
    if (adm.step === 'reading') return head + `<p class="sub">${esc(adm.file)}</p>
      <div class="adm-card"><p id="admTxt" role="status" aria-live="polite">กำลังเตรียมตัวอ่าน PDF</p><div class="adm-bar"><i id="admBar"></i></div><p class="hint">ไฟล์ถูกอ่านในเครื่องของคุณ ใช้เวลาประมาณครึ่งนาที อย่าปิดหน้านี้</p></div>`;
    if (adm.step === 'saving') return head + `<div class="adm-card"><p role="status" aria-live="polite">กำลังบันทึก อย่าปิดหน้านี้</p></div>`;
    if (adm.step === 'done') return head + `<div class="adm-card ok"><p><b>${esc(adm.done)}</b></p><p>ข้อมูล ณ ${esc(current.asOf || '–')} · ${fmt(cur.cars)} รุ่นย่อย · ${fmt(cur.rows)} รายการเบี้ย</p></div>
      <div class="actions"><button type="button" class="btn primary" data-adm="close">กลับไปหน้าเช็กเบี้ย</button></div>`;
    if (adm.step === 'error') return head + `<div class="adm-card bad" role="alert"><p><b>${esc(adm.error)}</b></p></div>
      <div class="actions"><button type="button" class="btn primary" data-adm="again">เลือกไฟล์ใหม่</button></div>`;
    if (adm.step === 'review') {
      const s = adm.sum;
      const row = (label, a, b) => `<tr><th scope="row">${label}</th><td>${a}</td><td${String(a) !== String(b) ? ' class="chg"' : ''}>${b}</td></tr>`;
      const cautions = [];
      if (s.cars < cur.cars * 0.7) cautions.push(`จำนวนรุ่นย่อยลดลงมาก (${fmt(cur.cars)} → ${fmt(s.cars)}) ตรวจว่าเป็นไฟล์ฉบับเต็ม`);
      if (s.noCode) cautions.push(`มี ${s.noCode} ตารางที่เอกสารไม่ระบุรหัสการใช้รถ`);
      if (s.oddRatio) cautions.push(`มี ${s.oddRatio} แถวที่เบี้ยรวมไม่เท่ากับเบี้ยสุทธิ × 1.0743 (คงค่าตามเอกสาร)`);
      s.warnings.slice(0, 8).forEach(w => cautions.push(w));
      if (s.warnings.length > 8) cautions.push(`และอีก ${s.warnings.length - 8} รายการ`);
      return head + `<p class="sub">ตรวจสรุปด้านล่างก่อนยืนยัน · ${esc(adm.file)}</p>
        <div class="adm-card"><table class="cmp"><thead><tr><th></th><th scope="col">ที่ใช้อยู่</th><th scope="col">ไฟล์ใหม่</th></tr></thead><tbody>
          ${row('ข้อมูล ณ วันที่', esc(current.asOf || '–'), esc(s.asOf || 'ไม่พบวันที่'))}
          ${row('บริษัทประกัน', cur.insurers, s.insurers)}${row('รุ่นปี', fmt(cur.models), fmt(s.models))}
          ${row('รุ่นย่อย', fmt(cur.cars), fmt(s.cars))}${row('รายการเบี้ย', fmt(cur.rows), fmt(s.rows))}${row('รายการที่มีราคา', fmt(cur.priced), fmt(s.priced))}
        </tbody></table><p class="hint">บริษัทในไฟล์ใหม่: ${adm.parsed.ins.map(esc).join(', ')}</p></div>
        ${cautions.length ? `<div class="adm-card warn"><p><b>ข้อสังเกตจากการอ่านไฟล์</b></p><ul>${cautions.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
        <p class="hint">${local ? 'เปิดจากไฟล์ในเครื่อง: ข้อมูลชุดใหม่จะใช้ได้เฉพาะในหน้านี้จนกว่าจะปิดหรือรีเฟรช' : 'เมื่อยืนยัน ข้อมูลชุดเดิมจะถูกแทนที่สำหรับทุกคนที่เปิดเว็บนี้'}</p>
        <div class="actions"><button type="button" class="btn primary" data-adm="save">ใช้ข้อมูลชุดนี้</button><button type="button" class="btn" data-adm="again">เลือกไฟล์อื่น</button></div>`;
    }
    return head + `<p class="sub">เลือกไฟล์ตารางเบี้ย TOYOTA CARE ฉบับใหม่ ระบบจะอ่านและแสดงสรุปให้ตรวจก่อนใช้งานจริง</p>
      <label class="drop" id="drop" for="pdfFile">${svg('<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>')}<b>แตะเพื่อเลือกไฟล์ PDF</b><span>หรือลากไฟล์มาวางที่นี่</span></label>
      <input class="sr" id="pdfFile" type="file" accept="application/pdf,.pdf">
      <div class="adm-card"><p><b>ข้อมูลที่ใช้อยู่</b></p><p>ข้อมูล ณ ${esc(current.asOf || '–')} · ${cur.insurers} บริษัท · ${fmt(cur.cars)} รุ่นย่อย · ${fmt(cur.rows)} รายการเบี้ย</p>
        ${!local && remoteMeta ? `<p class="hint">อัปเดตล่าสุดจากไฟล์ ${esc(remoteMeta.file || '')}</p><button type="button" class="link" data-adm="restore">กลับไปใช้ข้อมูลตั้งต้นที่มากับหน้าเว็บ</button>` : ''}${!local && signedIn ? `<p><button type="button" class="link" data-adm="logout">ออกจากระบบผู้ดูแล</button></p>` : ''}</div>
      <p class="hint">ไฟล์จะถูกอ่านในเบราว์เซอร์ของคุณ ต้องต่ออินเทอร์เน็ตเพื่อโหลดตัวอ่าน PDF</p>`;
  }

  return {adm, start, readFile, save, restore, login, logout, needLogin, html, get canWrite() { return canWrite; }};
})();
