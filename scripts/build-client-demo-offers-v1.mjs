#!/usr/bin/env node
// Reproduce the approved offer PDF without network requests or changing its source.
// Requires Python 3 and PyMuPDF. Full Arial fonts are available on macOS by default.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=String.raw`
import fitz, hashlib, json, os, re, shutil
from pathlib import Path

root=Path.cwd()
source=root/'docs/creative/personalized-character-v1/proposal-template/reference/AwardScholar_Proposal_v10.pdf'
output=root/'agent/public/client-demo-reports'
qa=root/'work/client-demo-offer-qa-v1'
regular=Path(os.environ.get('CLIENT_DEMO_ARIAL_REGULAR','/System/Library/Fonts/Supplemental/Arial.ttf'))
bold=Path(os.environ.get('CLIENT_DEMO_ARIAL_BOLD','/System/Library/Fonts/Supplemental/Arial Bold.ttf'))
for file in (source,regular,bold):
    if not file.is_file(): raise RuntimeError(f'Required source/font not found: {file}')
assert hashlib.sha256(source.read_bytes()).hexdigest()=='5240d9b22e34c8ab6361f08739d193bd59c4e8f29abc63629533ea05bf40f167', 'Approved source changed. Review its geometry before updating this script.'
output.mkdir(parents=True,exist_ok=True)
qa.mkdir(parents=True,exist_ok=True)
award=output/'awardscholar-offer-v1.pdf'
waddle=output/'waddle-offer-v1.pdf'
shutil.copyfile(source,award)
doc=fitz.open(source)
assert len(doc)==2, 'The approved source must have exactly two content pages.'
original_links=[[link.get('uri') for link in page.get_links()] for page in doc]
original_texts=[page.get_text(sort=True) for page in doc]
spans=[[span for block in page.get_text('dict')['blocks'] if block['type']==0 for line in block['lines'] for span in line['spans']] for page in doc]
find=lambda page,text: next(span for span in spans[page] if text in span['text'])
regular_font=fitz.Font(fontfile=str(regular))
bold_font=fitz.Font(fontfile=str(bold))

# Reuse the original PDF geometry, untouched proof, all seven links and fixed copy.
# Redactions remove the original recipient text rather than hiding it under a box.
replacements=[
    (0,find(0,'Hey Award Scholar'),'Hey Waddle team, ',False),
    (0,find(0,'I know you run ads'),'I saw your content for Waddle, and ',False),
    (0,find(0,'seen Award Scholar'),'   (I’ve seen Waddle’s content) ',False),
    (0,find(0,'promise I’ll make'),'Here’s the promise I’ll make for Waddle -> ',True),
    (1,find(1,'for Award Scholar.'),'for Waddle.  ',True)
]
for page_no,span,text,is_bold in replacements:
    rect=fitz.Rect(span['bbox'])
    if 'I know you run ads' in span['text']:
        # Redraw the complete same-baseline sentence so its bold continuation follows.
        rect.x1=558
    if page_no==1:
        # Large headline line boxes overlap. Target the glyph body of this line only.
        rect.y0=124
        rect.y1=148
    doc[page_no].add_redact_annot(rect,fill=(1,1,1),cross_out=False)
for page in doc:
    page.apply_redactions(images=0,graphics=0,text=0)
    page.insert_font(fontname='DemoArial',fontfile=str(regular))
    page.insert_font(fontname='DemoArialBold',fontfile=str(bold))
for page_no,span,text,is_bold in replacements:
    draw_text=text.split('->')[0] if '->' in text else text
    doc[page_no].insert_text(span['origin'],draw_text,fontname='DemoArialBold' if is_bold else 'DemoArial',fontsize=span['size'],color=(0,0,0))
    if '->' in text:
        # Arial's duplicate hyphen glyph maps to a soft hyphen in PDF extraction.
        # Helvetica's matching ASCII arrow keeps the exact approved textual marker.
        x,y=span['origin']
        doc[page_no].insert_text((x+bold_font.text_length(draw_text,fontsize=span['size']),y),'-> ',fontname='hebo',fontsize=span['size'],color=(0,0,0))
    if 'I know you run ads' in span['text']:
        x,y=span['origin']
        x+=regular_font.text_length(text,fontsize=11)
        doc[page_no].insert_text((x,y),'I can help create lots of high quality ads for your brand. ',fontname='DemoArialBold',fontsize=11,color=(0,0,0))

page=doc[0]
images=page.get_images()
def image_at(x,y):
    return next(image[0] for image in images if any(abs(rect.x0-x)<1 and abs(rect.y0-y)<1 for rect in page.get_image_rects(image[0])))
page.replace_image(image_at(286.125,55.5),filename=str(root/'research_notes/client-avatar-demo-v1/waddle-public-assets/duck-icon.png'))
page.replace_image(image_at(121.3532,500.4552),filename=str(root/'agent/public/client-demo-assets/waddle-ref-xander-snap-20260816-00s.jpg'))
page.replace_image(image_at(227.1572,500.4552),filename=str(root/'agent/public/client-demo-assets/waddle-ref-xander-snap-20260806-00s.jpg'))
metadata=doc.metadata
metadata.update(title='Waddle AI UGC offer v1',subject='Prepared demo. October 24, 2026 event and deadline copy retained for review.')
doc.set_metadata(metadata)
doc.save(waddle,garbage=4,deflate=True,no_new_id=True)
doc.close()

receipts=[]
for name,pdf in [('awardscholar',award),('waddle',waddle)]:
    final=fitz.open(pdf)
    assert len(final)==2
    texts=[page.get_text(sort=True) for page in final]
    combined=' '.join(texts)
    assert 'October 24, 2026' in combined and '6:30 PM' in combined
    assert '$1,000' in combined and '$500' in combined
    assert '100% Money Back Guarantee' in combined
    assert '\u2014' not in combined and '{{' not in combined
    assert [[link.get('uri') for link in page.get_links()] for page in final]==original_links
    assert 'promise' in texts[0] and 'promise' not in texts[1]
    assert 'We’ll create' in texts[1] and 'High-Converting AI UGC ads' in texts[1]
    if name=='waddle':
        assert 'Award' not in combined and 'Scholar' not in combined
        assert 'I saw your content for Waddle' in combined
        assert 'I know you run ads' not in combined
        assert 'I’ve seen Waddle’s content' in combined
        normalize=lambda text: re.sub(r'\s+',' ',text).strip()
        for page_no,text in enumerate(texts):
            expected=normalize(original_texts[page_no]).replace('Award Scholar','Waddle').replace('I know you run ads for Waddle','I saw your content for Waddle').replace('I’ve seen Waddle’s ads','I’ve seen Waddle’s content')
            assert normalize(text)==expected, f'Unexpected offer copy difference on page {page_no+1}'
    pages=[]
    for index,page in enumerate(final):
        preview=qa/f'{name}-offer-v1-page-{index+1}.png'
        page.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False).save(preview)
        pages.append(str(preview.relative_to(root)))
    receipts.append({'brand':name,'pdf':str(pdf.relative_to(root)),'sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'pages':len(final),'links':sum(len(page.get_links()) for page in final),'previews':pages})
    final.close()
assert hashlib.sha256(award.read_bytes()).digest()==hashlib.sha256(source.read_bytes()).digest()
(qa/'receipt.json').write_text(json.dumps(receipts,indent=2)+'\n')
print(json.dumps(receipts,indent=2))
`;
const result=spawnSync(process.env.PYTHON||'python3',['-c',python],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
