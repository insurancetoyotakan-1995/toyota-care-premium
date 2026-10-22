"""Build index.html from template.html + data.json (output of parse.py)."""
import pathlib

here = pathlib.Path(__file__).parent
template = (here / 'template.html').read_text(encoding='utf-8')
data = (here / 'data.json').read_text(encoding='utf-8').replace('</', '<\\/')
assert template.count('/*__DATA__*/') == 1
page = template.replace('/*__DATA__*/', data)
for name, mark in (('pdfparse.js', '/*__PDFPARSE__*/'), ('updater.js', '/*__UPDATER__*/')):
    assert page.count(mark) == 1, mark
    page = page.replace(mark, (here / name).read_text(encoding='utf-8').replace('</', '<\\/'))
(here / 'index.html').write_text(page, encoding='utf-8')
print('built index.html')
