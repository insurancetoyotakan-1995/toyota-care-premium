"""Apply share-safe tweaks to template.html, rebuild, and write share.html (page body only, for publishing)."""
import pathlib, re, subprocess, sys
here = pathlib.Path(__file__).parent
p = here / 'template.html'
t = p.read_text(encoding='utf-8')
if 'data-theme' not in t:
    m = re.search(r'@media \(prefers-color-scheme: dark\)\{\n  :root\{\n(.*?)\n  \}\n\}', t, re.S)
    dark = m.group(1)
    t = t.replace(m.group(0),
        '@media (prefers-color-scheme: dark){\n  :root:not([data-theme="light"]){\n' + dark + '\n    color-scheme:dark;\n  }\n}\n'
        ':root[data-theme="dark"]{\n' + dark + '\n    color-scheme:dark;\n}')
    a = "  history[push ? 'pushState' : 'replaceState'](null, '', hashOf());"
    assert a in t
    t = t.replace(a, "  try { history[push ? 'pushState' : 'replaceState'](null, '', hashOf()); } catch (e) {}")
    a = '  <p>ที่มา: เอกสาร'
    assert a in t
    t = t.replace(a, '  <p>เครื่องมือช่วยค้นหาสำหรับใช้ภายในทีม ไม่ใช่เว็บไซต์ทางการของโตโยต้าหรือบริษัทประกัน</p>\n' + a)
    p.write_text(t, encoding='utf-8')
subprocess.run([sys.executable, str(here / 'build.py')], check=True)
h = (here / 'index.html').read_text(encoding='utf-8')
for tag in ('<!doctype html>\n', '<html lang="th">\n', '<head>\n', '<meta charset="utf-8">\n',
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n', '<meta name="theme-color" content="#880E4F">\n', '</head>\n', '<body>\n', '</body>\n', '</html>\n'):
    assert tag in h, tag
    h = h.replace(tag, '', 1)
(here / 'share.html').write_text(h, encoding='utf-8')
print('share.html', len(h))
