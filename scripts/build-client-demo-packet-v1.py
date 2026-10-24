"""Assemble the sourced, local-only client demo. No provider calls or sends."""
from pathlib import Path
import html
import json

ROOT = Path(__file__).resolve().parents[1]
NOTES = ROOT / 'research_notes/client-avatar-demo-v1'
PUB = ROOT / 'agent/public'
REPORTS = ROOT / 'reports/client-avatar-demo-v1'
ASSETS = '/client-demo-assets/'
PREPARED = '2026-10-24'


def source(url, title):
    return {'url': url, 'title': title}


def recorded(id, stage, tool, title, input, output, evidence=(), note=''):
    return dict(id=id, stage=stage, tool=tool, title=title, mode='recorded',
                status='complete', kind=('analysis' if tool=='agent.research_synthesis' else 'tool_summary'), input=input, output=output, evidence=list(evidence),
                note=note or 'Recorded step summary from this research session. Inputs and outputs are normalized summaries, not raw provider transcripts. Replay does not rerun the provider.')


def future(id, tool, title, output, gate=False):
    return dict(id=id, stage=5, tool=tool, title=title, mode='simulated',
                status='pending', requiresApproval=gate, input={'brand': 'selected demo client'},
                output=output, evidence=[], note='Fictional demo event. No external action or real approval is recorded.')


def score(rows):
    names = ['Product and sample fit', 'Original creative potential', 'Decision maker reachability', 'Commercial evidence', 'Usable content reference']
    return {'total': sum(x[0] for x in rows), 'max': 100,
            'confidence': 'Moderate creative fit; commercial metrics unverified',
            'components': [dict(name=n, score=v, max=20, rationale=r) for n, (v, r) in zip(names, rows)]}


award_raw = json.loads((NOTES / 'awardscholar-findings.json').read_text())
waddle_raw = json.loads((NOTES / 'waddle-findings.json').read_text())
waddle_ads = json.loads((NOTES / 'waddle-ads-v1.json').read_text())
exa_history = json.loads((NOTES / 'exa-search-history-v1.json').read_text())['searches']
award_refs = [dict(url=r['url'], title=f"Award Scholar Meta ad {r['id']}",
    status='Ad record + sampled video frames reviewed',
    observation=r['observed'] + ' Downloaded source video samples also show a transition to laptop/dashboard, drafting and submission footage. Historical ad UI is not a current feature audit. No continuous playback or audio QA.',
    imageUrl=ASSETS + f"awardscholar-meta-{r['id']}.png") for r in award_raw['references']]
waddle_refs = []
for date, suffix in [('2026-08-06', '20260806'), ('2026-08-16', '20260816')]:
    post = next(p for p in waddle_ads['creator_posts'] if p['date'] == date)
    waddle_refs.append(dict(url=post['source_url'], title=f'Xander @xander.wan, Snapchat, {date}',
        status='Public organic-format post; paid distribution unknown',
        observation='; '.join(post['visual_review']['observed']) + '. Platform transcript read and selected frames inspected. Not Instagram; no continuous playback or audio QA.',
        imageUrl=ASSETS + f'waddle-ref-xander-snap-{suffix}-00s.jpg'))

award = {
 'id': 'awardscholar', 'name': 'Award Scholar', 'website': 'https://www.awardscholar.com/',
 'founders': [dict(name='Kyle Fung', role='User-supplied founder lead. Candidate Columbia profile and UGC background found through Exa; Award Scholar affiliation remains unverified.', status='Affiliation unverified', url='https://www.linkedin.com/in/kylefung1'),
              dict(name='Orchard St, Inc.', role='Legal entity named in official website footer; not an identified founder.', status='Publisher verified', url='https://www.awardscholar.com/')],
 'product': dict(summary=award_raw['product_summary'], features=['Profile-based scholarship matching', 'Editable AI application drafts', 'User-selected application support on supported forms', 'No scholarship award guarantee']),
 'score': score([(20,'Clear consumer workflow with a concise demonstrable product story.'),(18,'Application overload and discovery support several original hooks.'),(7,'Kyle is a user-supplied lead; brand affiliation and founder mailbox are unverified.'),(11,'Subscription description and two actual Meta records; actual company revenue and budget unknown.'),(16,'Two exact Meta records and inspected video samples; full audio and motion review pending.')]),
 'revenue': dict(status='Actual revenue unknown', summary='No verified subscriber count, numerical checkout price or company revenue. Scholarship awards claimed by the site are not company revenue.',
   scenarios=[dict(label='Illustrative arithmetic only',value='$2,000 gross monthly billings',assumptions='Assume 100 paying accounts at an invented $20/month. Neither input is verified.'),dict(label='Illustrative arithmetic only',value='$10,000 gross monthly billings',assumptions='Assume 500 paying accounts at an invented $20/month. This is not a forecast.')],
   limitations=['Price, plan mix, payers, refunds, taxes and store/payment fees unknown.','Do not use these illustrative numbers in outreach as actual performance.']),
 'icp': dict(summary='Hypothesis: adult college applicants and enrolled students with repetitive scholarship search and writing work. Buyer hypothesis: a founder or growth operator who needs more creative tests.',
   evidence=['Official product supports student profiles, matching and editable drafts.','Two historical ads use application-time or tuition/discovery hooks.'],
   hypotheses=['Test adults aged 18-25 in the US or Canada; age/geography are proposed, not measured analytics.','Test a direct pain point opener followed by genuine product footage.'],painPoints=['Time spent finding eligible opportunities','Repeated application writing','Unclear next step and eligibility rules']),
 'persona': dict(name='Maya Brooks', description='Original fictional adult, age 23, medium-brown skin, short curly dark bob, clear round glasses and silver stud earrings. Practical student-tools presenter, not a customer testimonial.', wardrobe='Forest-green crewneck and beige trousers, no university marks.',imageUrl=ASSETS+'awardscholar-maya-persona-v1.png',
   environment='Modest apartment study corner, oak desk, closed cream notebook, gray laptop and pothos. Lock one room map and soft daylight from camera left.', rationale='Adapts candid close-face framing and discovery-to-product structure. Identity, dialogue, styling and scene are original. Existing creator likenesses and voices are not reused.'),
 'references': award_refs,
 'script': dict(durationSeconds=15,hook='Scholarship search taking over your weekend?',shots=[
   dict(start=0,end=3,camera='Vertical chest-up, same desk and camera axis.',action='Eyebrow lift and direct eye contact; avoid a fabricated personal success story.',line='Scholarship search taking over your weekend?'),
   dict(start=3,end=7,camera='Same scene, medium framing.',action='Small open-hand gesture. Later composite a genuine approved matching-screen capture.',line='Award Scholar matches opportunities to your profile'),
   dict(start=7,end=11,camera='Same camera and wardrobe.',action='Indicate space beside presenter for genuine editable-draft footage; no generated UI.',line='and helps draft applications you can review.'),
   dict(start=11,end=15,camera='Return to chest-up.',action='Small smile and plain CTA; app name and URL composited later.',line="Check your matches, read each provider's rules, and start there.")]),
 'sources': [source(s['url'], s['used_for']) for s in award_raw['sources']] + [source(r['url'],r['title']) for r in award_refs],
 'gaps': ['Kyle Fung affiliation and intended recipient mailbox','Actual pricing, revenue, payers, acquisition cost and retention','Current ad delivery and exact Instagram post verification','Continuous source playback/audio QA','Human approval of persona, frames, product claims and current demo offer deadline'],
 'outreachDraft': dict(status='Local draft, not sent',subject='An original Award Scholar creative concept',body='Hi Award Scholar team, we put together an original avatar concept around scholarship-search overload, with a storyboard and the two-page offer attached for review. Would this be a useful angle for your next creative test?'),
 'storyboardImageUrl': ASSETS+'awardscholar-storyboard-v1.png'
}
waddle = {
 'id':'waddle','name':'Waddle','website':'https://www.waddlecouples.com/',
 'founders':[dict(name='Donald Chu',role='Waddle founder and Columbia computer-science student, confirmed on his own portfolio. Public contact published there; deliverability not tested.',status='Founder verified',url='https://donaldvchu.com/'),dict(name='Xander Wanagel',role='User identifies him as cofounder. @xander.wan Waddle promotion is verified; formal role remains user-supplied. His current portfolio links a separate Dovey app.',status='Creator verified; role unresolved',url='https://www.xanderwanagel.com/')],
 'product':dict(summary='Couples app for daily questions, photos, a shared virtual duck, minigames, quests and streaks.',features=['3,000+ questions, according to the official site','Daily check-ins and question decks','Shared duck, photos and playful activities','Official site self-reports 6,100+ paired couples; not an audited active-user count']),
 'score':score([(20,'Clear consumer product, visible duck mascot and sample-friendly daily ritual.'),(18,'Questions and shared play support original short-form variations.'),(18,'Founder and public personal contact confirmed; mailbox deliverability not tested.'),(12,'Usage claims and paid SKUs visible, but revenue, payers and buying budget unknown.'),(17,'Xander source transcripts and selected video frames now verified; Instagram, Meta delivery and audio QA unresolved.')]),
 'revenue':dict(status='Actual revenue unknown',summary='App Store lists paid products. There is no verified payer count or revenue. Do not transfer revenue from the separate Dovey app.',
   scenarios=[dict(label='Illustrative monthly scenario',value='$999 gross monthly billings',assumptions='100 hypothetical subscribers x listed $9.99 monthly SKU.'),dict(label='Illustrative monthly scenario',value='$4,995 gross monthly billings',assumptions='500 hypothetical subscribers x listed $9.99 monthly SKU.'),dict(label='Illustrative annual scenario',value='$3,332.50 monthly equivalent',assumptions='1,000 hypothetical annual subscribers x listed $39.99/year divided by 12.')],limitations=['Current checkout offer and plan mix unverified.','Payer counts are hypothetical; these are arithmetic examples, not actual-revenue estimates.','Excludes store fees, refunds and taxes.']),
 'icp':dict(summary='Hypothesis: adult dating couples who want a lightweight daily connection ritual, especially geographically separated college or early-career couples. Buyer: founder-led consumer-app team testing creative.',evidence=['Official site supports couples together or at a distance.','Daily questions, photos, streaks and shared duck are real product themes.','Xander posts discuss repetitive remote relationship check-ins.'],hypotheses=['Test adults aged 18-29; no audience analytics validate this range.','Compare repetitive daily-text angle against playful shared-duck angle.'],painPoints=['Repetitive small talk','Feeling distant between visits','Difficulty starting deeper conversations']),
 'persona':dict(name='Jamie',description='Original fictional adult, age 25, olive skin, wavy dark hair, light stubble, round dark glasses and charcoal hoodie. Warm direct-to-camera presenter, with an original voice.',wardrobe='Charcoal hoodie and relaxed charcoal trousers, no logos.',imageUrl=ASSETS+'waddle-jamie-persona-v2.png',environment='Modest neighborhood cafe in daylight. One table, dark ceiling beams, soft window light and neutral phone prop. Fix the background and remove the inconsistent clip-on microphone before production.',rationale='Original character adapted to the observed candid hoodie/cafe format. The earlier evening-sofa concept is retained as v1, but v2 is the selected demo direction. No Xander or Donald likeness, voice or personal testimony.'),
 'references':waddle_refs,
 'script':dict(durationSeconds=15,hook='Still asking, "How was your day?"',shots=[
   dict(start=0,end=3,camera='Vertical close selfie at cafe table.',action='Raised eyebrow, natural candid delivery; no creator identity or voice reuse.',line='Still asking, "How was your day?"'),
   dict(start=3,end=7,camera='Same scene, slightly wider medium.',action='Small open-hand gesture; genuine approved question-card footage goes in edit.',line='Waddle gives you better questions to ask together.'),
   dict(start=7,end=12,camera='Same camera axis and charcoal hoodie.',action='Gesture toward separately composited genuine duck/photo recording. No generated app screen.',line='Share a photo, raise a duck, make time for each other.'),
   dict(start=12,end=15,camera='Return to close selfie.',action='Friendly small smile; simple brand/URL end card added in edit.',line='Try a daily check-in with Waddle.')]),
 'sources':[source(s['url'],s['id'].replace('_',' ')) for s in waddle_raw['sources'] if s['id']!='core_bio']+[source(r['url'],r['title']) for r in waddle_refs],
 'gaps':['Formal Xander cofounder role and exact Instagram handles/posts','No verified Waddle Meta advertiser or ad IDs; this does not prove no ads exist','Actual revenue, active users, payer count and current checkout offer','Continuous source playback/audio QA','Microphone continuity and fixed room/camera map','Human review of persona, frames, permitted production assets and offer copy'],
 'outreachDraft':dict(status='Local draft, not sent',subject='An original Waddle creative concept',body='Hi Donald, we built an original avatar concept for Waddle around turning routine daily check-ins into better conversations and shared duck play. The storyboard, reference notes and two-page demo offer are attached for review. Would this be a useful angle to test?'),
 'storyboardImageUrl':ASSETS+'waddle-storyboard-v1.png'
}

for brand in [award,waddle]:
    ident = brand['id']
    brand['reportUrl'] = f'/client-demo-reports/{ident}-research-v1.html'
    brand['offerPdfUrl'] = f'/client-demo-reports/{ident}-offer-v1.pdf'
    brand['offerPreviewUrls']=[ASSETS+f'{ident}-offer-page-{page}.png' for page in (1,2)]
    refs = [source(r['url'],r['title']) for r in brand['references']]
    exa_files = ['exa-3.json','exa-ads-4.json'] if ident=='awardscholar' else ['exa-1.json','exa-2.json','exa-ads-1.json','exa-ads-2.json','exa-ads-3.json']
    history=[]
    for index, file in enumerate(exa_files):
        result=exa_history[file]
        verified_urls={s['url'].replace('www.', '') for s in brand['sources']}
        accepted=[s for s in result['verifiedSources'] if s['url'].replace('www.', '') in verified_urls]
        history.append(recorded(f'exa-{index}',0,'Exa.web_search_exa','Search public founder and content evidence',{'query':result['query'],'provider':'free keyless Exa MCP','paidFallback':False},{'returnedResults':result['returnedResults'],'verifiedSourceMatches':len(accepted),'otherCandidatesNotEvidence':result['returnedResults']-len(accepted),'qualification':'Candidates require source verification; unrelated Instagram results excluded.'}, [source(s['url'],s['title']) for s in accepted]))
    history += [
      recorded('verify',0,'web.run / public HTTP','Verify founder and product sources',{'urls':[s['url'] for s in brand['sources'][:3]]},{'people':brand['founders'],'product':brand['product']},brand['sources'][:3]),
      recorded('references',4,'ffmpeg + view_image','Inspect real creative references',{'urls':[r['url'] for r in refs]},{'references':brand['references'],'coverage':'Downloaded source media and sampled decoded frames. No continuous playback/audio QA.'},refs),
      recorded('score',1,'agent.research_synthesis','Build commercial scenarios and score',{'rubric':'five explicit categories, 20 points each'},{'score':brand['score'],'revenue':brand['revenue']},brand['sources'][:2], 'Editorial synthesis performed during this session, not an analytics model or measured business outcome.'),
      recorded('icp',2,'agent.research_synthesis','Draft an evidence-backed ICP',{'product':brand['product']['summary']},{'icp':brand['icp']},brand['sources'][:2]),
      recorded('persona',3,'ImageGen.imagegen','Generate an original persona sheet',{'persona':brand['persona']['description'],'environment':brand['persona']['environment']},{'imageUrl':brand['persona']['imageUrl'],'humanApproved':False,'itemizedImageCostUsd':None},[source(brand['persona']['imageUrl'],'Generated original persona')]),
      recorded('persona-qa',3,'view_image + static review','Review identity, anatomy and source-format fit',{'review':'Parent inspection and independent agent static image review'},{'findings':('Consistent original identity; lock room geography and strengthen reaction.' if ident=='awardscholar' else 'V2 improves cafe/hoodie format fit; microphone only visible in first persona panel. Remove it in storyboard.'),'motionReviewed':False,'humanApproved':False},[], 'Static AI review is recorded. A real human has not approved these assets.'),
    ]
    # Add artifact steps only once the actual files exist. Never fabricate completion.
    for event_id, tool, title, asset in [
        ('storyboard','ImageGen.imagegen','Generate the original four-shot storyboard',brand['storyboardImageUrl']),
        ('pdf','local_pdf.build','Assemble the personalized two-page demo offer',brand['offerPdfUrl'])]:
        if (PUB/asset.lstrip('/')).exists():
            history.append(recorded(event_id,4 if event_id=='storyboard' else 5,tool,title,{'brand':brand['name']},{'assetUrl':asset,'humanApproved':False},[source(asset,title)]))
    if (PUB/brand['storyboardImageUrl'].lstrip('/')).exists():
        history.append(recorded('storyboard-qa',4,'view_image + independent static review','Check the four storyboard frames',{'review':'Parent and independent agent static image inspection'},{'result':'Suitable for human static review; identity and wardrobe coherent, no obvious blocking anatomy defects. Jamie microphone removed consistently.','motionAndAudioReviewed':False,'humanApproved':False}))
    history += [
      future('approval','demo.human_approval','Human approves storyboard and brief in the simulation',{'approval':'Simulated only','realApproval':False},True),
      future('render','demo.video_render','Simulate generating the approved sample',{'sample':'Fictional placeholder event; no video asset or paid provider call','providerSubmitted':False}),
      future('quality','demo.ai_and_human_review','Simulate AI and human sample checks',{'checks':['Identity and wardrobe consistency','Product claims and authentic UI','Audio, timing and captions'],'result':'Simulated pass, not actual media QA'}),
      future('outreach','demo.outreach_package','Preview the personalized message and attachments',{'draft':brand['outreachDraft'],'attachments':['Approved sample placeholder',brand['offerPdfUrl']],'recipient':'recipient@example.invalid','sent':False}),
      future('send','demo.outreach_send','Simulate sending the sample and brief',{'mockDelivery':'Sent in simulation','messageId':'demo-message-001','realMessageSent':False}),
      future('reply','demo.reply','Show a fictional interested reply',{'from':'recipient@example.invalid','text':'This looks interesting. Can we talk through the pilot?','receivedFromRealPerson':False}),
      future('crm','demo.crm_and_call','Simulate a CRM update and call handoff',{'crmStatus':'Interested (simulation)','call':'Mock scheduling handoff','crmWritten':False,'calendarEventCreated':False})
    ]
    brand['history']=history

packet={'version':1,'mode':'demo','preparedAt':PREPARED,'historyDisclosure':'Recorded steps summarize completed research and artifact work. Replay uses saved evidence, not live providers. Future approvals, renders, replies and CRM events are simulations.', 'brands':[award,waddle]}
(PUB/'client-demo-data-v1.json').write_text(json.dumps(packet,indent=2,ensure_ascii=False)+'\n')
REPORTS.mkdir(parents=True,exist_ok=True)
(PUB/'client-demo-reports').mkdir(exist_ok=True)
for b in packet['brands']:
    lines=[f"# {b['name']}: research and original avatar demo",'',f'Prepared {PREPARED}. Demo only; no outreach sent.','',
      b['product']['summary'],'','## People and identity','']
    lines += [f"- **{p['name']}**: {p['role']} [{p['status']}]({p['url']})" for p in b['founders']]
    lines += ['',f"## Outreach fit: {b['score']['total']}/100",'','Editorial priority, not a probability, revenue metric or performance guarantee.','']
    lines += [f"- {r['name']}: {r['score']}/{r['max']}. {r['rationale']}" for r in b['score']['components']]
    lines += ['','## Revenue: unknown','',b['revenue']['summary'],'']
    lines += [f"- {s['label']}: {s['value']}. {s['assumptions']}" for s in b['revenue']['scenarios']]
    lines += ['']+b['revenue']['limitations']+['','## ICP hypothesis','',b['icp']['summary'],'']
    lines += [f"- Evidence: {s}" for s in b['icp']['evidence']]+[f"- Hypothesis: {s}" for s in b['icp']['hypotheses']]
    lines += ['','## Original persona and environment','',b['persona']['description'],b['persona']['environment'],b['persona']['rationale'],f"![Original persona]({b['persona']['imageUrl']})",'', '## Actual creative references','']
    for r in b['references']:
        lines += [f"### [{r['title']}]({r['url']})",'',r['status']+'. '+r['observation'],f"![Reference image]({r['imageUrl']})",'']
    lines += ['## Proposed original storyboard','',f"![Four-shot concept]({b['storyboardImageUrl']})",'', '15 seconds is a target. Speech timing and motion have not been verified. Actual product UI must be composited from permitted genuine footage.','']
    for s in b['script']['shots']:
        lines += [f"- **{s['start']}-{s['end']} sec**: {s['line']} Camera: {s['camera']} Action: {s['action']}"]
    lines += ['','## Personalized outreach draft','',b['outreachDraft']['subject'],'',b['outreachDraft']['body'],'',f"[Two-page demo offer]({b['offerPdfUrl']})",'','## Gaps before production','']+[f'- {s}' for s in b['gaps']]
    lines += ['','## Execution provenance','',packet['historyDisclosure'],'']
    lines += [f"- {e['mode']}: {e['tool']}. {e['title']}. {e['note']}" for e in b['history']]
    lines += ['','## Sources','']+[f"- [{s['title']}]({s['url']})" for s in b['sources']]
    md='\n'.join(lines)+'\n'
    (REPORTS/f"{b['id']}-research-v1.md").write_text(md)
    # Plain structured HTML avoids a runtime Markdown dependency.
    esc=html.escape
    parts=[]
    for line in lines:
        if line.startswith('# '): parts.append('<h1>'+esc(line[2:])+'</h1>')
        elif line.startswith('## '): parts.append('<h2>'+esc(line[3:])+'</h2>')
        elif line.startswith('### '): parts.append('<h3>'+esc(line[4:])+'</h3>')
        elif line.startswith('!['):
            path=line.split('](',1)[1][:-1]
            parts.append(f'<img src="{esc(path)}" alt="{esc(line[2:].split("]",1)[0])}">')
        elif line: parts.append('<p>'+esc(line)+'</p>')
    source_links=''.join(f'<p><a href="{esc(s["url"])}">{esc(s["title"])}</a></p>' for s in b['sources'])
    doc='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+esc(b['name'])+' research demo</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:40px auto;padding:0 24px;color:#202124}h1{line-height:1.2}h2{margin-top:40px}img{max-width:100%;max-height:620px;object-fit:contain;border-radius:12px}a{color:#145fc1}p{overflow-wrap:anywhere}</style><main>'+f'<a href="{esc(b["offerPdfUrl"])}">Open two-page offer PDF</a>'+''.join(parts)+'<h2>Clickable source links</h2>'+source_links+'</main></html>'
    (PUB/f"client-demo-reports/{b['id']}-research-v1.html").write_text(doc+'\n')
print('Assembled two sourced client demos and research reports.')
