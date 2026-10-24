/* Client research and avatar demo. All provider work stays outside this view. */
const stages = ['Founder', 'Research / score', 'ICP', 'Persona / scene', 'References / script', 'Review'];
const stateByHost = new WeakMap();
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const list = value => Array.isArray(value) ? value : [];
const safeUrl = value => {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, 'http://localhost');
    return ['http:', 'https:'].includes(url.protocol) ? value : '';
  } catch { return ''; }
};
const link = (url, label, className = '') => safeUrl(url) ? `<a class="${esc(className)}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';
const chips = values => `<div class="chips">${list(values).map(value => `<span class="chip">${esc(value)}</span>`).join('')}</div>`;
const points = (values, fallback = 'No evidence recorded yet.') => list(values).length ? `<ul class="ap-cd-points">${values.map(value => `<li>${esc(typeof value === 'string' ? value : value.claim ?? value.summary ?? value.title ?? '')}</li>`).join('')}</ul>` : `<p class="hint">${esc(fallback)}</p>`;
const detail = (title, content) => `<details class="cbox ap-cd-detail"><summary>${esc(title)}</summary><div class="ap-cd-detail-body">${content}</div></details>`;
const panel = (title, content, status = '') => `<section class="card"><div class="head"><h2>${esc(title)}</h2>${status ? `<span class="pill s-wait">${esc(status)}</span>` : ''}</div><div class="body">${content}</div></section>`;
const empty = message => `<div class="ap-cd-empty">${esc(message)}</div>`;
const image = (url, alt, className = '') => safeUrl(url) ? `<figure class="ap-cd-image ${esc(className)}"><img src="${esc(safeUrl(url))}" alt="${esc(alt)}"><figcaption class="hint" data-ap-cd-image-error hidden>Image could not be loaded. Review the saved asset before approving.</figcaption></figure>` : empty('ImageGen concept pending. No generated persona is attached yet.');
const eventKey = (event, index) => `${index}:${String(event.id ?? event.tool ?? 'step')}`;
const eventStage = event => Number.isInteger(event.stage) && event.stage >= 0 && event.stage < stages.length ? event.stage : 0;
const isApproval = event => event.mode !== 'recorded' && /approv/i.test(`${event.id || ''} ${event.tool || ''} ${event.title || ''}`);
const jsonText = value => { try { return JSON.stringify(value ?? {}, null, 2); } catch { return 'Details unavailable.'; } };
const streetwear = brand => brand.demoKind === 'streetwear';

function eventTiming(event) {
  const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const start = validTime(event.startedAt) ? event.startedAt : null, end = validTime(event.completedAt) ? event.completedAt : null;
  const duration = Number.isFinite(event.durationMs) && event.durationMs >= 0 ? event.durationMs : start && end && Date.parse(end) >= Date.parse(start) ? Date.parse(end) - Date.parse(start) : null;
  if (!start && !end && duration === null) return '';
  return `<dl class="ap-cd-timing">${start ? `<div><dt>Started</dt><dd><time datetime="${esc(start)}">${esc(start)}</time></dd></div>` : ''}${end ? `<div><dt>Completed</dt><dd><time datetime="${esc(end)}">${esc(end)}</time></dd></div>` : ''}${duration !== null ? `<div><dt>Saved duration</dt><dd>${esc(duration)} ms</dd></div>` : ''}</dl>`;
}

function outboundDemo(brand) {
  const dm = brand.outboundDemo;
  if (!dm || typeof dm !== 'object') return '';
  const providerId = dm.providerId || dm.receipt?.providerId, sentAt = dm.sentAt || dm.receipt?.sentAt;
  const sent = dm.status === 'sent' && typeof providerId === 'string' && providerId.trim() && typeof sentAt === 'string' && Number.isFinite(Date.parse(sentAt));
  return panel(String(dm.channel).toLowerCase() === 'email' ? 'Outbound email' : 'Outbound DM', `<div class="ap-cd-dm"><div class="ap-cd-row"><b>${esc(dm.recipientLabel || 'Recipient not supplied')}</b><span class="hint">${esc(dm.channel || 'Direct message')}</span></div><p class="hint">${esc(dm.recipientStatus || 'Recipient not supplied')}</p><p>${esc(dm.message || 'Outreach message pending.')}</p>${sent ? `<p class="hint">Sent at ${esc(sentAt)}. Provider receipt: ${esc(providerId)}.</p>${link(dm.receiptUrl || dm.receipt?.url, 'Delivery receipt', 'linkbtn')}` : '<p class="hint">Draft, not sent. Delivery requires a verified provider receipt and timestamp.</p>'}</div>`, sent ? 'Sent / receipt recorded' : 'Draft, not sent');
}

function assetGallery(brand) {
  const assets = list(brand.assets).filter(asset => asset && ['product', 'logo'].includes(asset.kind) && safeUrl(asset.imageUrl));
  if (!assets.length) return '';
  return `<div class="ap-cd-space"><h3 class="ap-cd-label">Source brand assets</h3><div class="ap-cd-assets">${assets.map(asset => `<article class="ap-cd-asset">${image(asset.imageUrl, asset.title || `${brand.name} ${asset.kind}`, 'ap-cd-asset-image')}<h3>${esc(asset.title || brand.name)}</h3>${asset.note ? `<p class="hint">${esc(asset.note)}</p>` : ''}${link(asset.sourceUrl, 'Asset source', 'linkbtn')}</article>`).join('')}</div><p class="hint">Original source images. Image backgrounds have not been edited.</p></div>`;
}

function sourceVideo(brand) {
  const video = brand.sourceVideo;
  if (!video || !safeUrl(video.url)) return '';
  const sourceLabel = video.kind === 'prepared-source' ? 'Prepared source video' : 'Historical source video';
  return `<section class="ap-cd-source-video"><div class="ap-cd-row"><h3>${esc(video.title || sourceLabel)}</h3><span class="tag">${sourceLabel}</span></div><p class="hint">Source reference only. This is not a finished brand sample for ${esc(brand.name)}.</p><video controls playsinline preload="none" src="${esc(safeUrl(video.url))}" ${safeUrl(video.posterUrl) ? `poster="${esc(safeUrl(video.posterUrl))}"` : ''} data-ap-cd-source-video aria-label="${esc(video.title || sourceLabel)}"></video><p class="hint" data-ap-cd-video-error hidden>The source video could not be loaded. Open the saved source to review it.</p>${video.note ? `<p class="hint">${esc(video.note)}</p>` : ''}${link(video.url, 'Open source video', 'linkbtn')}</section>`;
}

function preparationPreview(brand) {
  const preparation = brand.genjutsuPreparation;
  if (!preparation || typeof preparation !== 'object') return '';
  const submission=preparation.submission,revision=brand.revisionDraft;
  const submitted=typeof submission?.requestId==='string'&&submission.requestId.trim();
  const previous=`${preparation.model ? `<p class="mono hint">${esc(preparation.model)}</p>` : ''}<pre>${esc(jsonText(preparation.request))}</pre>${points(preparation.limitations, 'Source footage, garment references and production settings require review.')}`;
  return `<section class="ap-cd-preparation">${revision?`<div class="ap-cd-row"><h3>Corrected garment request</h3><span class="tag">Prepared / not submitted</span></div><p>${esc(revision.referenceRule)}</p><p class="hint">${esc(revision.ctaRule)}</p><p class="hint">Estimated video retry: $${esc(Number(revision.estimatedUsd).toFixed(2))}. No retry submitted.</p>${detail('Corrected request',`<pre>${esc(jsonText(revision.request))}</pre>`)}`:''}<div class="ap-cd-row"><h3>Genjutsu Light ${submitted?'render':'request preparation'}</h3><span class="tag">${submitted?esc(submission.status):'Preparation only'}</span></div><p class="hint">${submitted?`Actual provider request ${esc(submission.requestId)}. Final media review and email sending remain pending.`:'No Genjutsu request has been submitted by this demo. No after video has been generated. Review this proposed request before production.'}</p>${submitted && submission.error ? `<p class="hint">${esc(submission.error)}</p>` : ''}${revision?detail('Previous attempt',previous):previous}${link(preparation.sourceUrl, 'Model documentation', 'linkbtn')}</section>`;
}

function samplePreview(brand) {
  const sample=brand.sampleVideo;
  if(!sample?.requestId||!safeUrl(sample.url))return '';
  const needsFix=sample.visualQA?.status==='needs_revision';
  return `<section class="ap-cd-source-video"><div class="ap-cd-row"><h3>${esc(sample.title || 'Generated sample')}</h3><span class="tag">${needsFix?'Revision required':'Final human review pending'}</span></div><video controls playsinline preload="metadata" src="${esc(safeUrl(sample.url))}" aria-label="${esc(brand.name)} generated hoodie sample"></video>${needsFix?`<p class="s-bad">AI review: needs revision.</p>${points(sample.visualQA.findings)}`:''}<p class="hint">${sample.containsCTA===false?'Garment render only. The CTA is a separate still preview and will be appended after the garment is approved.':'Actual generated garment video with restored source audio and website CTA.'} Email remains unsent.</p>${link(sample.url,'Open garment video','linkbtn')}${sample.ctaPreviewUrl?detail('CTA still preview',`${image(sample.ctaPreviewUrl,'Proposed website CTA still')}<p class="hint">Proposed end card. This is not a generated garment scene.</p>${link(sample.cta?.url,'Product CTA destination','linkbtn')}`):link(sample.cta?.url,'Product CTA destination','linkbtn')}</section>`;
}

function replayPanel(brand, state) {
  const history = list(brand.history);
  if (!history.length) return '';
  const revealed = history.slice(0, state.replayIndex);
  const current = revealed.at(-1);
  return panel('Tool call replay', `<p class="hint">Recorded steps show saved evidence and their reported statuses. Inputs and outputs are normalized summaries, not raw tool transcripts. Simulated future steps illustrate the workflow. Replay does not run tools, record real approval, render media, send outreach or change CRM records.</p>
    <div class="ap-cd-replay-controls"><button type="button" class="btn go sm" data-ap-cd-play ${state.waitingApproval ? 'disabled' : ''}>${state.replayRunning ? 'Pause replay' : 'Play replay'}</button><button type="button" class="btn sm" data-ap-cd-replay-next ${state.waitingApproval || state.replayIndex >= history.length ? 'disabled' : ''}>Next step</button><button type="button" class="btn sm" data-ap-cd-reset>Reset</button><span class="hint mono">${esc(state.replayIndex)} / ${esc(history.length)} steps</span></div>
    <p class="ap-cd-replay-status" role="status" aria-live="polite">${state.waitingApproval ? 'Paused for simulated human approval.' : state.replayRunning ? 'Replaying saved history and simulated next steps.' : state.replayIndex === history.length ? 'Replay complete. No future action was executed.' : current ? `Paused after ${esc(current.title || current.tool || 'step')}.` : 'Ready to replay.'}</p>
    ${state.waitingApproval ? `<div class="ap-cd-simulation-gate"><b>Simulated approval only</b><p>This click continues the demonstration in this view. It does not approve production or outreach.</p><button type="button" class="btn sm" data-ap-cd-demo-approve>Approve in demo</button></div>` : ''}
    <div class="ap-cd-history">${revealed.map((event, index) => {
      const recorded = event.mode === 'recorded', key = eventKey(event, index), approved = state.approvedEvents.has(key);
      const status = !recorded && approved ? 'Simulated approval' : event.status || 'pending';
      return `<details class="ap-cd-history-event" data-ap-cd-event="${esc(key)}" ${state.expandedEvents.has(key) || index === revealed.length - 1 ? 'open' : ''}><summary><span class="ap-cd-step mono">${esc(index + 1)}</span><span class="ap-cd-event-title">${esc(event.title || event.tool || 'Workflow step')}<small class="mono">${esc(event.tool || 'Tool unspecified')}</small></span><span class="tag ${recorded ? 'ap-cd-recorded' : 'ap-cd-simulated'}">${recorded ? (event.kind === 'analysis' ? 'Recorded analysis' : 'Recorded step') : 'Simulated future step'}</span><span class="hint">${esc(status)}</span></summary><div class="ap-cd-detail-body">
        ${!recorded ? '<p class="ap-cd-simulation-note">Illustrative output only. This step has not been executed.</p>' : ''}
        ${eventTiming(event)}<div class="ap-cd-call-data"><div><b>Input summary</b><pre>${esc(jsonText(event.input))}</pre></div><div><b>${recorded ? 'Recorded output summary' : 'Simulated output'}</b><pre>${esc(jsonText(event.output))}</pre></div></div>${event.note ? `<p class="hint">${esc(event.note)}</p>` : ''}${link(event.rawRecordUrl, 'Saved tool record', 'linkbtn')}
        ${list(event.evidence).length ? `<div class="ap-cd-sources">${event.evidence.map(source => `<p>${link(source.url, source.title || source.url) || esc(source.title || 'Evidence URL unavailable')}</p>`).join('')}</div>` : ''}</div></details>`;
    }).join('') || empty('No steps revealed yet. Play or advance one step to inspect the saved tool calls.')}</div>`, 'Recorded + simulated');
}

async function request(path, body) {
  const response = await fetch(path, body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  let data;
  try { data = await response.json(); } catch { throw new Error(`Request failed (${response.status}).`); }
  if (!response.ok) throw new Error(data.error?.message ?? data.error ?? data.message ?? `Request failed (${response.status}).`);
  return data;
}

function founderStage(brand) {
  return panel(streetwear(brand) ? 'Brand and people' : 'People behind the app', `<p class="ap-cd-lead">${esc(brand.product?.summary || 'Product research pending.')}</p>${link(brand.website, 'Official website', 'linkbtn')}${assetGallery(brand)}
    <div class="ap-cd-stack">${list(brand.founders).length ? brand.founders.map(person => `<article class="ap-cd-block"><div class="ap-cd-row"><div class="ap-cd-person"><span class="thumb md"><b>${esc(String(person.name || '?').split(/\s+/).slice(0, 2).map(word => word[0]).join(''))}</b>${safeUrl(person.imageUrl) ? `<img data-ap-cd-portrait src="${esc(safeUrl(person.imageUrl))}" alt="${esc(person.name)}">` : ''}</span><b>${esc(person.name)}</b></div><span class="tag">${esc(person.status || 'Identity unverified')}</span></div><p>${esc(person.role || 'Role pending verification')}</p>${link(person.url, 'Identity source', 'linkbtn')}</article>`).join('') : empty('Founder identity has not been verified.')}</div>
    ${detail('Product details', points(brand.product?.features, 'Feature inventory pending.'))}`);
}

function researchStage(brand) {
  const score = brand.score || {}, hasScore = Number.isFinite(score.total) && Number.isFinite(score.max) && score.max > 0 && score.total >= 0 && score.total <= score.max;
  return panel('Research and fit', `<div class="ap-cd-score"><strong class="mono">${hasScore ? esc(score.total) : 'Pending'}${hasScore ? `<small> / ${esc(score.max)}</small>` : ''}</strong><div><b>Outreach fit</b><p class="hint">${esc(score.confidence || 'Confidence not assessed')}. Editorial assessment, not a measured business outcome.</p></div></div>
    ${detail('How the score works', list(score.components).length ? `<div class="ap-cd-stack">${score.components.map(item => `<div class="ap-cd-block"><div class="ap-cd-row"><b>${esc(item.name)}</b><span class="mono">${esc(item.score)} / ${esc(item.max)}</span></div><p>${esc(item.rationale)}</p></div>`).join('')}</div>` : empty('Scoring rubric and evidence are pending.'))}
    <div class="ap-cd-block ap-cd-space"><div class="ap-cd-row"><b>Revenue</b><span class="tag">${esc(brand.revenue?.status || 'Unknown')}</span></div><p>${esc(brand.revenue?.summary || 'No verified revenue data is available.')}</p>
      ${detail('Scenarios and limits', `${list(brand.revenue?.scenarios).map(item => `<p><b>${esc(item.label)}: ${esc(item.value)}</b><br><span class="hint">${esc(Array.isArray(item.assumptions) ? item.assumptions.join(' ') : item.assumptions)}</span></p>`).join('')}${points(brand.revenue?.limitations, 'Revenue estimates require disclosed assumptions and independent validation.')}`)}
    </div>`);
}

function icpStage(brand) {
  return panel('Who this is for', `<p class="ap-cd-lead">${esc(brand.icp?.summary || 'ICP synthesis pending.')}</p><div class="ap-cd-stack"><div class="ap-cd-block"><span class="ap-cd-label">Cited audience evidence</span>${points(brand.icp?.evidence)}</div><div class="ap-cd-block"><span class="ap-cd-label">Hypotheses to validate</span>${points(brand.icp?.hypotheses, 'No audience hypotheses recorded.')}</div></div>${detail('Pain points', points(brand.icp?.painPoints, 'Pain points pending.'))}`);
}

function personaStage(brand) {
  const persona = brand.persona || {};
  const historicalVideo = sourceVideo(brand);
  return panel(historicalVideo ? 'Source character and scene' : 'Original avatar concept', `${historicalVideo}${safeUrl(persona.imageUrl) || !historicalVideo ? image(persona.imageUrl, `${brand.name}: ${persona.name || 'original persona'} concept`) : ''}<div class="ap-cd-space"><div class="ap-cd-row"><h2>${esc(persona.name || (historicalVideo ? 'Source character review' : 'Persona pending'))}</h2><span class="tag">Concept / human review pending</span></div><p>${esc(persona.description || (historicalVideo ? 'Review the existing character and scene before preparing a wardrobe edit.' : 'An original character will be designed after ICP review.'))}</p><div class="ap-cd-block"><span class="ap-cd-label">Environment</span><p>${esc(persona.environment || 'Scene planning pending.')}</p></div>${detail('Creative rationale', `<p>${esc(persona.rationale || 'Persona rationale pending.')}</p><p class="hint">This plan does not establish a founder identity or endorsement.</p>`)}</div>`);
}

function contentStage(brand) {
  const script = brand.script || {};
  return panel('Reference to sample', `${samplePreview(brand)}${preparationPreview(brand)}${brand.genjutsuPreparation ? assetGallery(brand) : ''}<div class="ap-cd-stack">${list(brand.references).length ? brand.references.map(reference => `<article class="ap-cd-block"><div class="ap-cd-row"><b>${esc(reference.title || 'Content reference')}</b><span class="tag">${esc(reference.status || 'Not inspected')}</span></div><p>${esc(reference.observation || 'No direct observation recorded.')}</p>${link(reference.url, 'Open reference', 'linkbtn')}${safeUrl(reference.imageUrl) ? image(reference.imageUrl, reference.title || 'Content reference') : ''}</article>`).join('') : empty('Individual post references are pending. A profile link does not establish a verified content format.')}</div>
    <div class="ap-cd-script"><div class="ap-cd-row"><h2>Proposed script</h2>${script.durationSeconds ? `<span class="chip mono">${esc(script.durationSeconds)} sec</span>` : ''}</div><p class="ap-cd-hook">${esc(script.hook || 'Hook pending content review.')}</p>${safeUrl(brand.storyboardImageUrl) ? `<div class="ap-cd-storyboard"><h3>Storyboard frames</h3>${brand.storyboardCaption ? `<p class="hint">${esc(brand.storyboardCaption)}</p>` : ''}${image(brand.storyboardImageUrl, `${brand.name} proposed storyboard frames`)}</div>` : ''}<div class="ap-cd-stack">${list(script.shots).map((shot, index) => `<article class="ap-cd-block"><div class="ap-cd-row"><b>Shot ${esc(index + 1)}</b><span class="mono hint">${esc(shot.start)} to ${esc(shot.end)} sec</span></div><p class="ap-cd-dialogue">${esc(shot.line || 'No dialogue drafted.')}</p>${detail('Camera and action', `<p>${esc(shot.camera || 'Camera pending.')}</p><p>${esc(shot.action || 'Action pending.')}</p>`)}</article>`).join('') || empty('Shot list pending.')}</div></div>`, brand.sampleVideo?'Generated draft / needs review':'Draft / not generated');
}

function reviewStage(brand) {
  return panel(brand.sampleVideo?'Sample review':'Review before production', `${samplePreview(brand)}<p class="ap-cd-lead">${brand.sampleVideo?'Review the garment continuity before assembling the final outreach clip.':'Check the evidence, persona and script before a sample is generated.'}</p><div class="ap-cd-stack"><div class="ap-cd-block"><span class="ap-cd-label">Open research gaps</span>${points(brand.gaps, 'No gaps listed. This does not establish approval.')}</div><div class="ap-cd-block"><span class="ap-cd-label">Required review</span>${points(['Confirm founder identity and brand context.', 'Validate audience and revenue assumptions.', 'Approve the original persona, wardrobe, environment and script.', 'Review generated media for consistency and brand accuracy.'])}</div></div><p class="hint">Human approval has not been recorded by this demo. Creating a local task does not authorize production, outreach or CRM actions.</p><div class="ap-cd-actions">${link(brand.reportUrl, 'Open research doc', 'btn sm')}${link(brand.offerPdfUrl, streetwear(brand) ? 'Two-page ICP / creative PDF' : 'Two-page offer PDF', 'btn sm')}</div>${list(brand.offerPreviewUrls).length ? detail(streetwear(brand) ? 'Two-page creative brief preview' : 'Two-page offer preview', `<p class="hint">${streetwear(brand) ? 'Research and original creative plan. Human production review remains pending.' : 'Demo offer. Event and deadline copy require review before any real send.'}</p><div class="ap-cd-offer-pages">${brand.offerPreviewUrls.map((url,index)=>image(url, `${brand.name} offer page ${index+1}`)).join('')}</div>`) : ''}`, 'Human review pending');
}

/** Mount a read-only research demo with explicit local task creation. */
export async function mountClientDemo(host, {brandId} = {}) {
  const state = stateByHost.get(host) || {brandId:null, stage:0, busy:false, notice:'', error:''};
  state.dispose?.();
  Object.assign(state, {stage:0, replayIndex:0, replayRunning:false, replayTimer:null, replayToken:Symbol('replay'), waitingApproval:false, resumeAfterApproval:false, approvedEvents:new Set(), expandedEvents:new Set()});
  if (brandId != null) state.brandId = brandId;
  const mountToken = Symbol('client-demo');
  state.mountToken = mountToken;
  stateByHost.set(host, state);
  host.innerHTML = '<div class="card"><div class="body" role="status">Loading saved client demo...</div></div>';
  let ownedNode = host.firstElementChild;
  const ownsHost = () => state.mountToken === mountToken && host.firstElementChild === ownedNode && host.isConnected;
  const clearReplayTimer = () => { if (state.replayTimer != null) clearTimeout(state.replayTimer); state.replayTimer = null; };
  const stopReplay = () => { clearReplayTimer(); state.replayRunning = false; state.resumeAfterApproval = false; state.replayToken = Symbol('replay'); };
  const resetReplay = () => { stopReplay(); state.replayIndex = 0; state.stage = 0; state.waitingApproval = false; state.approvedEvents.clear(); state.expandedEvents.clear(); };
  const view = host.ownerDocument?.defaultView, Observer = view?.MutationObserver;
  const navigation = () => { if (state.mountToken === mountToken) stopReplay(); };
  const observer = Observer ? new Observer(() => { if (!ownsHost()) dispose(); }) : null;
  observer?.observe(host.ownerDocument, {childList:true, subtree:true});
  view?.addEventListener('hashchange', navigation);
  view?.addEventListener('pagehide', navigation);
  const dispose = () => {
    if (state.mountToken === mountToken) stopReplay();
    observer?.disconnect();
    view?.removeEventListener('hashchange', navigation);
    view?.removeEventListener('pagehide', navigation);
  };
  state.dispose = dispose;
  let data;
  try { data = await request('/api/client-demo'); }
  catch (error) {
    if (!ownsHost()) { dispose(); return; }
    host.innerHTML = `<div class="card"><div class="body"><p class="s-bad" role="alert">${esc(error.message)}</p><button class="btn" type="button" data-ap-cd-retry>Retry</button></div></div>`;
    host.querySelector('[data-ap-cd-retry]').onclick = () => mountClientDemo(host, {brandId});
    return;
  }
  const activeIds = new Set(list(data.activeBrandIds));
  const brands = list(data.brands).filter(brand => !activeIds.size || activeIds.has(brand.id) || (brandId != null && brand.id === brandId));
  const currentBrand = () => brands.find(item => item.id === state.brandId) || brands[0];
  const scheduleReplay = () => {
    clearReplayTimer();
    if (!ownsHost() || !state.replayRunning || state.waitingApproval) return;
    const replayToken = state.replayToken;
    state.replayTimer = setTimeout(() => {
      if (state.replayToken !== replayToken || !state.replayRunning) return;
      state.replayTimer = null;
      if (!ownsHost()) { dispose(); return; }
      advanceReplay(true);
    }, 1400);
  };
  const advanceReplay = automatic => {
    clearReplayTimer();
    if (!ownsHost() || state.waitingApproval) return;
    const history = list(currentBrand()?.history), event = history[state.replayIndex];
    if (!event) { stopReplay(); render(); return; }
    const key = eventKey(event, state.replayIndex);
    state.replayIndex += 1;
    state.stage = eventStage(event);
    if (isApproval(event) && !state.approvedEvents.has(key)) {
      state.waitingApproval = true;
      state.resumeAfterApproval = automatic;
      state.replayRunning = false;
    } else if (state.replayIndex === history.length) state.replayRunning = false;
    render();
    if (state.replayRunning) scheduleReplay();
  };
  const render = () => {
    if (!ownsHost()) return;
    const brand = currentBrand();
    if (!brand) { host.innerHTML = '<div class="card"><div class="empty">No client demo research is available yet.</div></div>'; return; }
    state.brandId = brand.id;
    const sections = [founderStage, researchStage, icpStage, personaStage, contentStage, reviewStage];
    const stageLabels = streetwear(brand) ? ['Brand', 'Research / score', 'ICP', 'Source character', 'Wardrobe preparation', 'Review'] : stages;
    host.innerHTML = `<div class="ap-cd-root grid"><div class="ap-cd-header"><div><div class="chips"><span class="chip">Research demo</span><span class="chip">Awaiting approval</span>${activeIds.size && !activeIds.has(brand.id) ? '<span class="chip">Archived demo</span>' : ''}</div><h2>${streetwear(brand) ? 'Research to sample' : 'Research to avatar'}</h2><p class="hint">Explore the client plan, then create a local task for review.</p></div><div class="ap-cd-actions">${brand.taskId ? `<a class="btn go" href="#/tasks/${esc(encodeURIComponent(brand.taskId))}">Open task</a>` : `<button class="btn go" type="button" data-ap-cd-create ${state.busy ? 'disabled title="Local task creation is in progress"' : ''}>${state.busy ? 'Creating task' : 'Create demo task'}</button>`}</div></div>
      <div class="pagebar ap-cd-toolbar"><div class="seg ap-cd-brands" role="group" aria-label="Client">${brands.map(item => `<button type="button" class="${item.id === brand.id ? 'on' : ''}" aria-pressed="${item.id === brand.id ? 'true' : 'false'}" data-ap-cd-brand="${esc(item.id)}" ${state.busy ? 'disabled title="Wait for task creation to finish"' : ''}>${esc(item.name)}${activeIds.size && !activeIds.has(item.id) ? ' (archived)' : ''}</button>`).join('')}</div>${link(brand.reportUrl, 'Research doc', 'btn sm')}</div>
      ${state.error ? `<p class="s-bad" role="alert">${esc(state.error)}</p>` : ''}${state.notice ? `<p class="s-ok" role="status">${esc(state.notice)}</p>` : ''}
      ${outboundDemo(brand)}
      <nav class="ap-cd-stages" aria-label="Demo stages">${stageLabels.map((label, index) => `<button type="button" class="ap-cd-stage ${index === state.stage ? 'ap-cd-selected' : ''}" data-ap-cd-stage="${esc(index)}" ${index === state.stage ? 'aria-current="step"' : ''}><span class="ap-cd-step mono">${esc(index + 1)}</span><span>${esc(label)}</span></button>`).join('')}</nav>
      ${replayPanel(brand, state)}
      ${sections[state.stage](brand)}
      <div class="ap-cd-footer"><button type="button" class="btn sm" data-ap-cd-back ${state.stage === 0 ? 'disabled title="This is the first stage"' : ''}>Previous</button><span class="hint">${esc(state.stage + 1)} of ${esc(stages.length)} / ${brand.sampleVideo?'generated preview':brand.genjutsuPreparation?.submission?'render submitted':'planning only'}</span><button type="button" class="btn sm" data-ap-cd-next ${state.stage === stages.length - 1 ? 'disabled title="This is the final stage"' : ''}>Next</button></div>
      ${detail('Sources and provenance', `${list(brand.sources).length ? `<div class="ap-cd-sources">${brand.sources.map(source => `<p>${link(source.url, source.title || source.url) || esc(source.title || 'Source URL unavailable')}</p>`).join('')}</div>` : empty('No source links recorded.')}<p class="hint">Prepared ${esc(data.preparedAt || 'date unavailable')}. Source facts, estimates and creative hypotheses require separate review. No provider or outreach work runs on page load.</p>`)}</div>`;
    ownedNode = host.firstElementChild;
    host.querySelectorAll('[data-ap-cd-brand]').forEach(button => button.onclick = () => { resetReplay(); state.brandId = button.dataset.apCdBrand; state.notice = ''; state.error = ''; render(); });
    host.querySelectorAll('[data-ap-cd-stage]').forEach(button => button.onclick = () => { stopReplay(); state.stage = Number(button.dataset.apCdStage); render(); });
    host.querySelector('[data-ap-cd-back]').onclick = () => { stopReplay(); state.stage = Math.max(0, state.stage - 1); render(); };
    host.querySelector('[data-ap-cd-next]').onclick = () => { stopReplay(); state.stage = Math.min(stages.length - 1, state.stage + 1); render(); };
    const play = host.querySelector('[data-ap-cd-play]');
    if (play) play.onclick = () => {
      if (state.replayRunning) { stopReplay(); render(); return; }
      if (state.waitingApproval) return;
      if (state.replayIndex >= list(brand.history).length) resetReplay();
      state.replayRunning = true;
      advanceReplay(true);
    };
    const replayNext = host.querySelector('[data-ap-cd-replay-next]');
    if (replayNext) replayNext.onclick = () => { stopReplay(); advanceReplay(false); };
    const reset = host.querySelector('[data-ap-cd-reset]');
    if (reset) reset.onclick = () => { resetReplay(); render(); };
    const approve = host.querySelector('[data-ap-cd-demo-approve]');
    if (approve) approve.onclick = () => {
      if (!state.waitingApproval) return;
      const event = list(brand.history)[state.replayIndex - 1];
      if (!event || !isApproval(event)) return;
      state.approvedEvents.add(eventKey(event, state.replayIndex - 1));
      state.waitingApproval = false;
      state.replayRunning = state.resumeAfterApproval;
      state.resumeAfterApproval = false;
      render();
      if (state.replayRunning) scheduleReplay();
    };
    host.querySelectorAll('[data-ap-cd-event]').forEach(element => element.querySelector('summary').addEventListener('click', () => {
      if (!ownsHost()) return;
      if (!element.open) state.expandedEvents.add(element.dataset.apCdEvent);
      else state.expandedEvents.delete(element.dataset.apCdEvent);
    }));
    host.querySelectorAll('.ap-cd-image img').forEach(element => element.addEventListener('error', () => { element.hidden = true; element.parentElement.querySelector('[data-ap-cd-image-error]').hidden = false; }));
    host.querySelectorAll('[data-ap-cd-portrait]').forEach(element => element.addEventListener('error', () => element.remove()));
    host.querySelectorAll('[data-ap-cd-source-video]').forEach(element => element.addEventListener('error', () => { element.hidden = true; element.parentElement.querySelector('[data-ap-cd-video-error]').hidden = false; }));
    const create = host.querySelector('[data-ap-cd-create]');
    if (create) create.onclick = async () => {
      if (state.busy) return;
      state.busy = true; state.error = ''; state.notice = ''; render();
      try {
        const result = await request('/api/client-demo/tasks', {brandId:brand.id});
        const taskId = result.task?.id ?? result.taskId ?? result.id;
        if (!taskId) throw new Error('The server did not return a task ID. Check the task list before retrying.');
        brand.taskId = taskId;
        state.notice = 'Local demo task ready. Open the task to continue review.';
      } catch (error) { state.error = error.message; }
      finally { state.busy = false; render(); }
    };
  };
  render();
}
