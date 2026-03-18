/* ════════════════════════════════════════════════════════════════
   ryaview.ai — TENDER COMPLIANCE + AUTO-BOQ MODULE

   FLOW:
   1. User uploads tender PDF
   2. AI extracts approved brands, specs, quantities, site conditions
   3. User picks which approved brand to BOQ for
   4. System matches best models from DB → auto-generates BOQ
   5. Exports: BOQ PDF + Compliance DOCX (with embedded logo)

   INJECTION POINTS:
   - Nav: <button onclick="sw('tender',this)">Tender</button>
   - Page: <div id="page-tender" class="page"></div>
   - Call initTenderPage() when tab activated
   ════════════════════════════════════════════════════════════════ */

/* ── STATE ── */
let tenderParsed   = null;
let tenderBoqBrand = '';
let tenderBoqRows  = [];
let tenderFileName = '';

/* ══════════════════════════════════════════════════════════════
   PAGE HTML
══════════════════════════════════════════════════════════════ */
const TENDER_PAGE_HTML = `
<div class="tender-steps" id="tender-steps">
  <div class="tstep on" id="tstep-1"><div class="tstep-num">1</div><div class="tstep-lbl">Upload Tender</div></div>
  <div class="tstep-line"></div>
  <div class="tstep" id="tstep-2"><div class="tstep-num">2</div><div class="tstep-lbl">AI Analysis</div></div>
  <div class="tstep-line"></div>
  <div class="tstep" id="tstep-3"><div class="tstep-num">3</div><div class="tstep-lbl">Select Brand</div></div>
  <div class="tstep-line"></div>
  <div class="tstep" id="tstep-4"><div class="tstep-num">4</div><div class="tstep-lbl">Review BOQ</div></div>
</div>

<div id="tender-loading" style="display:none;text-align:center;padding:60px 20px">
  <svg style="animation:spin 1s linear infinite;width:24px;height:24px;color:var(--blue2);margin-bottom:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
  <div style="font-size:14px;font-weight:500;color:var(--head)" id="tender-loading-msg">Analysing tender...</div>
  <div style="font-size:11px;color:var(--mid);margin-top:4px" id="tender-loading-sub">AI is reading your document</div>
</div>

<!-- STEP 1: UPLOAD -->
<div id="tender-panel-upload">
  <div class="notice" style="margin:0 0 16px">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    Upload the tender PDF. AI will extract approved brands, specifications, quantities and site conditions automatically.
  </div>
  <div class="tender-dropzone" id="tender-dropzone"
    ondragover="event.preventDefault();this.classList.add('drag-over')"
    ondragleave="this.classList.remove('drag-over')"
    ondrop="handleTenderDrop(event)">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--mid);margin-bottom:10px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/></svg>
    <div style="font-size:14px;font-weight:500;color:var(--head);margin-bottom:4px">Drop tender PDF here</div>
    <div style="font-size:12px;color:var(--mid);margin-bottom:14px">or click to browse</div>
    <button class="btn btn-og btn-sm" onclick="document.getElementById('tender-file-input').click()">Browse PDF</button>
    <input type="file" id="tender-file-input" accept=".pdf" style="display:none" onchange="handleTenderFileSelect(event)">
  </div>
  <div id="tender-file-info" style="display:none;margin-top:12px">
    <div style="display:flex;align-items:center;gap:10px;background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:12px 16px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--money)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span id="tender-file-name" style="font-size:12px;color:var(--head);flex:1"></span>
      <span id="tender-file-size" style="font-size:11px;color:var(--mid)"></span>
      <button class="xb" onclick="clearTenderFile()">x</button>
    </div>
    <button class="btn btn-og" style="margin-top:12px;width:100%" onclick="runTenderAnalysis()">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      Analyse Tender with AI
    </button>
  </div>
</div>

<!-- STEP 2: ANALYSIS RESULTS -->
<div id="tender-panel-analysis" style="display:none">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:16px;font-weight:600;color:var(--head)">Tender Analysis</div>
      <div style="font-size:11px;color:var(--mid)" id="tender-filename-label"></div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="resetTender()">Upload different tender</button>
  </div>
  <div style="margin-bottom:16px">
    <div style="font-size:10px;font-weight:600;color:var(--mid);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Approved Brands in Tender</div>
    <div id="tender-approved-brands" style="display:flex;flex-wrap:wrap;gap:6px"></div>
  </div>
  <div style="margin-bottom:16px">
    <div style="font-size:10px;font-weight:600;color:var(--mid);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Extracted Requirements</div>
    <div id="tender-requirements" style="background:var(--s1);border:1px solid var(--line);border-radius:8px;overflow:hidden"></div>
  </div>
  <div style="margin-bottom:16px">
    <div style="font-size:10px;font-weight:600;color:var(--mid);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Quantities from Tender</div>
    <div id="tender-quantities" style="background:var(--s1);border:1px solid var(--line);border-radius:8px;overflow:hidden"></div>
  </div>
  <div id="tender-warnings" style="display:none;margin-bottom:16px"></div>
  <div style="background:rgba(79,142,247,0.05);border:1px solid rgba(79,142,247,0.15);border-radius:8px;padding:14px 16px;margin-bottom:16px">
    <div style="font-size:12px;font-weight:500;color:var(--blue2);margin-bottom:4px">Ready to generate BOQ</div>
    <div style="font-size:11px;color:var(--mid)">Select the approved brand you want to propose. ryaview will auto-generate a complete BOQ matched to tender specs.</div>
  </div>
  <button class="btn btn-og" onclick="goToTenderBrandSelect()">Select Brand and Generate BOQ</button>
</div>

<!-- STEP 3: BRAND SELECTION -->
<div id="tender-panel-brand" style="display:none">
  <div style="margin-bottom:16px">
    <div style="font-size:16px;font-weight:600;color:var(--head);margin-bottom:4px">Select Brand for BOQ</div>
    <div style="font-size:11px;color:var(--mid)">Only brands approved in the tender are shown. ryaview will match specs to available models.</div>
  </div>
  <div id="tender-brand-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:20px"></div>
  <button class="btn btn-ghost btn-sm" onclick="showTenderPanel('analysis')">Back to analysis</button>
</div>

<!-- STEP 4: BOQ + COMPLIANCE -->
<div id="tender-panel-boq" style="display:none">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:16px;font-weight:600;color:var(--head)">Generated BOQ - <span id="tender-boq-brand-label" style="color:var(--blue2)"></span></div>
      <div style="font-size:11px;color:var(--mid)">Matched to tender specifications - verify quantities before submission</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-og btn-sm" onclick="exportTenderBOQPDF()">Export BOQ PDF</button>
      <button class="btn btn-og btn-sm" onclick="exportTenderCompliance()">Export Compliance DOCX</button>
    </div>
  </div>
  <div style="display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:16px">
    <button class="adm-tab on" id="tboq-tab-boq" onclick="switchTenderBoqTab('boq')">Generated BOQ</button>
    <button class="adm-tab" id="tboq-tab-compliance" onclick="switchTenderBoqTab('compliance')">Compliance Matrix</button>
  </div>
  <div id="tboq-panel-boq">
    <div style="overflow-x:auto;border:1px solid var(--line);border-radius:8px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="width:34px;padding:10px 14px;text-align:left;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">#</th>
          <th style="min-width:200px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Model</th>
          <th style="min-width:100px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Type</th>
          <th style="min-width:70px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Spec</th>
          <th style="min-width:120px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Tender Requirement</th>
          <th style="min-width:80px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Match</th>
          <th style="min-width:110px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Unit Price</th>
          <th style="min-width:50px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Qty</th>
          <th style="min-width:110px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Total</th>
        </tr></thead>
        <tbody id="tender-boq-tbody"></tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:flex-end;padding:14px 0 0">
      <div style="text-align:right">
        <div class="gt-label">Tender BOQ Grand Total</div>
        <div class="gt-val" id="tender-boq-grand-total">Rs. 0</div>
      </div>
    </div>
  </div>
  <div id="tboq-panel-compliance" style="display:none">
    <div id="tender-compliance-matrix"></div>
  </div>
  <div style="margin-top:16px">
    <button class="btn btn-ghost btn-sm" onclick="showTenderPanel('brand')">Change brand</button>
  </div>
</div>`;

/* ══════════════════════════════════════════════════════════════
   CSS
══════════════════════════════════════════════════════════════ */
const TENDER_CSS = `
.tender-steps{display:flex;align-items:center;margin-bottom:28px;flex-wrap:wrap;gap:0}
.tstep{display:flex;align-items:center;gap:8px;flex-shrink:0}
.tstep-num{width:24px;height:24px;border-radius:50%;background:var(--s2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:10px;font-family:var(--fm);color:var(--dim);font-weight:600}
.tstep-lbl{font-size:11px;color:var(--dim)}
.tstep.on .tstep-num{background:var(--blue);border-color:var(--blue);color:#fff}
.tstep.on .tstep-lbl{color:var(--blue2);font-weight:500}
.tstep.done .tstep-num{background:var(--money);border-color:var(--money);color:#0b0e14}
.tstep.done .tstep-lbl{color:var(--money)}
.tstep-line{flex:1;height:1px;background:var(--line);min-width:20px;margin:0 8px}
.tender-dropzone{border:1.5px dashed var(--line);border-radius:12px;padding:32px 20px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s}
.tender-dropzone:hover,.tender-dropzone.drag-over{border-color:var(--blue);background:rgba(79,142,247,0.04)}
.tender-brand-card{background:var(--s1);border:1px solid var(--line);border-radius:10px;padding:16px;cursor:pointer;transition:all .15s;text-align:center}
.tender-brand-card:hover{border-color:rgba(79,142,247,0.3);background:rgba(79,142,247,0.04)}
.tender-brand-card.selected{border-color:var(--blue);background:rgba(79,142,247,0.08)}
.req-row{display:grid;grid-template-columns:160px 1fr;border-bottom:1px solid var(--line)}
.req-row:last-child{border-bottom:none}
.req-label{padding:10px 14px;font-size:11px;color:var(--mid);background:rgba(255,255,255,0.02);border-right:1px solid var(--line)}
.req-value{padding:10px 14px;font-size:11px;color:var(--head)}
.cmrow{display:grid;grid-template-columns:200px 1fr 80px 160px;border-bottom:1px solid rgba(255,255,255,0.04)}
.cmrow:last-child{border-bottom:none}
.cmc{padding:9px 12px;font-size:11px;color:var(--body)}
.cmc.feat{color:var(--mid);font-size:10px;background:rgba(255,255,255,0.02)}
.cmc.pass{color:var(--money);font-weight:500}
.cmc.fail{color:#f87171;font-weight:500}
.cmc.hdr{font-size:10px;font-weight:600;color:var(--mid);text-transform:uppercase;letter-spacing:.07em;background:var(--s1);border-bottom:1px solid var(--line)}
.match-exact{color:var(--money);font-size:10px}
.match-close{color:#fbbf24;font-size:10px}
.match-best{color:var(--mid);font-size:10px}
`;

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
function initTenderPage() {
  const el = document.getElementById('page-tender');
  if (!el) return;
  el.innerHTML = TENDER_PAGE_HTML;
  if (!document.getElementById('tender-css')) {
    const s = document.createElement('style');
    s.id = 'tender-css';
    s.textContent = TENDER_CSS;
    document.head.appendChild(s);
  }
  tenderParsed = null; tenderBoqBrand = ''; tenderBoqRows = []; tenderFileName = '';
  window._tenderFile = null;
}

/* ══════════════════════════════════════════════════════════════
   FILE HANDLING
══════════════════════════════════════════════════════════════ */
function handleTenderDrop(e) {
  e.preventDefault();
  document.getElementById('tender-dropzone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') loadTenderFile(file);
  else showToast('Please upload a PDF file.');
}
function handleTenderFileSelect(e) { if (e.target.files[0]) loadTenderFile(e.target.files[0]); }
function loadTenderFile(file) {
  tenderFileName = file.name;
  window._tenderFile = file;
  document.getElementById('tender-file-name').textContent = file.name;
  document.getElementById('tender-file-size').textContent = (file.size/1024).toFixed(0)+' KB';
  document.getElementById('tender-file-info').style.display = '';
}
function clearTenderFile() {
  window._tenderFile = null; tenderFileName = '';
  document.getElementById('tender-file-info').style.display = 'none';
  document.getElementById('tender-file-input').value = '';
}

/* ══════════════════════════════════════════════════════════════
   NAVIGATION HELPERS
══════════════════════════════════════════════════════════════ */
function setTenderStep(step) {
  [1,2,3,4].forEach(i => {
    const el = document.getElementById('tstep-'+i);
    if (!el) return;
    el.classList.remove('on','done');
    if (i < step) el.classList.add('done');
    if (i === step) el.classList.add('on');
  });
}
function showTenderPanel(name) {
  ['upload','analysis','brand','boq'].forEach(n => {
    const el = document.getElementById('tender-panel-'+n);
    if (el) el.style.display = n===name?'':'none';
  });
  document.getElementById('tender-loading').style.display = 'none';
}
function showTenderLoading(msg, sub) {
  ['upload','analysis','brand','boq'].forEach(n => {
    const el = document.getElementById('tender-panel-'+n);
    if (el) el.style.display = 'none';
  });
  document.getElementById('tender-loading').style.display = '';
  document.getElementById('tender-loading-msg').textContent = msg||'Processing...';
  document.getElementById('tender-loading-sub').textContent = sub||'';
}

/* ══════════════════════════════════════════════════════════════
   MAIN AI ANALYSIS
══════════════════════════════════════════════════════════════ */
async function runTenderAnalysis() {
  if (!window._tenderFile) { showToast('Upload a tender PDF first.'); return; }
  showTenderLoading('Reading tender PDF...','Extracting text from your document');
  setTenderStep(2);
  try {
    const base64 = await fileToBase64(window._tenderFile);
    showTenderLoading('AI is analysing the tender...','Extracting approved brands, specifications and quantities');

    const prompt = `You are a surveillance systems expert analysing an Indian government or corporate tender for CCTV/IP camera/audio PA systems.

Extract and return ONLY valid JSON — no markdown, no explanation:
{
  "project_name": "project name",
  "client_name": "issuing organisation",
  "tender_number": "reference number or null",
  "submission_date": "deadline or null",
  "approved_brands": ["Brand1","Brand2"],
  "camera_requirements": [{"type":"Fixed Dome|Bullet|PTZ|Box|Fisheye","location":"Indoor|Outdoor|Both","min_resolution_mp":2,"min_ir_range_m":30,"min_ip_rating":"IP66","requires_ai_analytics":true,"quantity":10,"zone":"area name","notes":"specific requirements"}],
  "audio_requirements": [{"type":"Horn Speaker|Ceiling Speaker|Amplifier","location":"Indoor|Outdoor","min_spl_db":110,"quantity":5,"zone":"area name","notes":"requirements"}],
  "certifications_required":["BIS","IS 13252"],
  "cybersecurity_requirements":"description or null",
  "warranty_years_minimum":3,
  "supply_chain_restrictions":"NDAA|MeitY|None|Not specified",
  "total_cameras":50,
  "total_audio":10,
  "warnings":["important flags"]
}
RULES: approved_brands are ONLY brands explicitly named. Camera types must map to: Fixed Dome, Bullet, PTZ, Box, Fisheye. Return ONLY the JSON.`;

    const res = await fetch('https://ssytbjfhjuhgnvgdvgkh.supabase.co/functions/v1/ai-proxy', {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':'sb_publishable_xne4CDAl1nml80T7AVZGxA_Z8rwpSwZ','Authorization':'Bearer sb_publishable_xne4CDAl1nml80T7AVZGxA_Z8rwpSwZ'},
      body: JSON.stringify({
        model:'claude-sonnet-4-20250514', max_tokens:2000,
        messages:[{role:'user',content:[
          {type:'document',source:{type:'base64',media_type:'application/pdf',data:base64.split(',')[1]}},
          {type:'text',text:prompt}
        ]}]
      })
    });
    const data = await res.json();
    const text = (data.content||[]).map(c=>c.text||'').join('').trim();
    tenderParsed = JSON.parse(text.replace(/```json|```/g,'').trim());
    renderTenderAnalysis(tenderParsed);
    showTenderPanel('analysis');
    setTenderStep(2);
    logUsage('tender_analysis', tenderFileName);
  } catch(e) {
    showTenderLoading('Analysis failed', e.message);
    setTimeout(()=>showTenderPanel('upload'),3000);
  }
}

/* ══════════════════════════════════════════════════════════════
   RENDER ANALYSIS
══════════════════════════════════════════════════════════════ */
function renderTenderAnalysis(p) {
  const fl = document.getElementById('tender-filename-label');
  if (fl) fl.textContent = tenderFileName+(p.tender_number?' - Ref: '+p.tender_number:'');

  const brandEl = document.getElementById('tender-approved-brands');
  if (brandEl) {
    brandEl.innerHTML = (p.approved_brands||[]).length
      ? (p.approved_brands||[]).map(b=>`<div style="padding:5px 12px;background:rgba(79,142,247,0.08);border:1px solid rgba(79,142,247,0.2);border-radius:100px;font-size:11px;font-weight:500;color:var(--blue2)">${b}</div>`).join('')
      : '<div style="font-size:11px;color:var(--mid);font-style:italic">No specific brands listed - all brands may be acceptable</div>';
  }

  const reqEl = document.getElementById('tender-requirements');
  if (reqEl) reqEl.innerHTML = [
    ['Project Name', p.project_name||'-'],
    ['Client / Issuer', p.client_name||'-'],
    ['Tender Reference', p.tender_number||'-'],
    ['Submission Date', p.submission_date||'-'],
    ['Min Warranty', p.warranty_years_minimum?p.warranty_years_minimum+' years':'-'],
    ['Certifications', (p.certifications_required||[]).join(', ')||'-'],
    ['Cybersecurity', p.cybersecurity_requirements||'-'],
    ['Supply Chain', p.supply_chain_restrictions||'-'],
  ].map(([l,v])=>`<div class="req-row"><div class="req-label">${l}</div><div class="req-value">${v}</div></div>`).join('');

  const qEl = document.getElementById('tender-quantities');
  const allReqs = [
    ...(p.camera_requirements||[]).map(r=>({desc:`${r.type||'Camera'} - ${r.zone||r.location||'General'}`,spec:`${r.min_resolution_mp||'?'}MP, ${r.location||'?'}, ${r.min_ip_rating||'IP?'}`,qty:r.quantity||'?',notes:r.notes||'-'})),
    ...(p.audio_requirements||[]).map(r=>({desc:`${r.type||'Speaker'} - ${r.zone||r.location||'General'}`,spec:`${r.location||'?'}${r.min_spl_db?', Min '+r.min_spl_db+'dB':''}`,qty:r.quantity||'?',notes:r.notes||'-'}))
  ];
  if (qEl) qEl.innerHTML = allReqs.length
    ? `<div class="cmrow"><div class="cmc hdr">Item</div><div class="cmc hdr">Specification</div><div class="cmc hdr" style="text-align:center">Qty</div><div class="cmc hdr">Notes</div></div>`+
      allReqs.map((r,i)=>`<div class="cmrow" style="background:${i%2===0?'transparent':'rgba(255,255,255,0.01)'}"><div class="cmc">${r.desc}</div><div class="cmc" style="font-size:10px;color:var(--mid)">${r.spec}</div><div class="cmc" style="text-align:center;font-family:var(--fm);font-weight:600;color:var(--head)">${r.qty}</div><div class="cmc" style="font-size:10px;color:var(--dim)">${r.notes}</div></div>`).join('')
    : '<div style="padding:14px;font-size:11px;color:var(--mid);font-style:italic">No specific quantities found</div>';

  const wEl = document.getElementById('tender-warnings');
  if (wEl && (p.warnings||[]).length) {
    wEl.style.display='';
    wEl.innerHTML=`<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.2);border-radius:8px;padding:12px 16px"><div style="font-size:11px;font-weight:600;color:#fbbf24;margin-bottom:6px">Flags from tender</div>${(p.warnings||[]).map(w=>`<div style="font-size:11px;color:var(--body);margin-bottom:3px">- ${w}</div>`).join('')}</div>`;
  }
}

/* ══════════════════════════════════════════════════════════════
   BRAND SELECTION
══════════════════════════════════════════════════════════════ */
function goToTenderBrandSelect() {
  if (!tenderParsed) return;
  showTenderPanel('brand');
  setTenderStep(3);
  const approved = (tenderParsed.approved_brands||[]).map(b=>b.toLowerCase());
  const camBrands = Object.keys(BOQ_DB||{});
  const audBrands = Object.keys(AUDIO_DB||{});
  const all = [...new Set([...camBrands,...audBrands])];
  const toShow = approved.length ? all.filter(b=>approved.includes(b.toLowerCase())) : all.slice(0,8);
  const show = toShow.length ? toShow : all.slice(0,8);
  document.getElementById('tender-brand-cards').innerHTML = show.map(b=>`
    <div class="tender-brand-card" onclick="selectTenderBrand(this,'${b}')">
      <div style="font-size:14px;font-weight:600;color:var(--head);margin-bottom:4px">${b}</div>
      <div style="font-size:10px;color:var(--mid)">${(BOQ_DB[b]||[]).length||''} ${(BOQ_DB[b]||[]).length?'cameras':''} ${(AUDIO_DB[b]||[]).length?'- '+(AUDIO_DB[b]||[]).length+' audio':''}</div>
      ${approved.includes(b.toLowerCase())
        ? '<div style="margin-top:6px;font-size:9px;padding:2px 8px;background:rgba(0,200,83,0.08);color:var(--money);border-radius:100px;display:inline-block;border:1px solid rgba(0,200,83,0.2)">Approved in tender</div>'
        : '<div style="margin-top:6px;font-size:9px;padding:2px 8px;background:rgba(107,133,168,0.08);color:var(--mid);border-radius:100px;display:inline-block;border:1px solid var(--line)">Not specified</div>'}
    </div>`).join('');
}

function selectTenderBrand(el, brand) {
  document.querySelectorAll('.tender-brand-card').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  tenderBoqBrand = brand;
  setTimeout(()=>generateTenderBOQ(brand),300);
}

/* ══════════════════════════════════════════════════════════════
   BOQ GENERATION
══════════════════════════════════════════════════════════════ */
async function generateTenderBOQ(brand) {
  if (!tenderParsed) return;
  showTenderLoading('Generating BOQ...','Matching tender specs to '+brand+' catalogue');
  setTenderStep(4);
  try {
    const camModels = BOQ_DB[brand]||[];
    const audModels = (AUDIO_DB||{})[brand]||[];
    tenderBoqRows = [];

    (tenderParsed.camera_requirements||[]).forEach((req,i)=>{
      const minMP = req.min_resolution_mp||2;
      const type  = (req.type||'Fixed Dome').toLowerCase();
      let cands = camModels.filter(m=>{
        const tm = (m.t||'').toLowerCase();
        return (tm.includes(type.split(' ')[0])||type.includes(tm.split(' ')[0])) && (m.r||0)>=minMP;
      });
      if (!cands.length) cands = camModels.filter(m=>{const tm=(m.t||'').toLowerCase();return tm.includes(type.split(' ')[0])||type.includes(tm.split(' ')[0]);});
      if (!cands.length&&camModels.length) cands=camModels;
      if (!cands.length) return;
      cands.sort((a,b)=>((b.r>=minMP?100:0)-Math.abs(b.r-minMP))-((a.r>=minMP?100:0)-Math.abs(a.r-minMP)));
      const m=cands[0];
      const mq=m.r>=minMP&&((m.t||'').toLowerCase().includes(type.split(' ')[0])||type.includes((m.t||'').toLowerCase().split(' ')[0]))?'Exact':m.r>=minMP?'Close':'Best Available';
      tenderBoqRows.push({id:'tr'+i,category:'camera',model:m.m,type:m.t,res:m.r,price:m.p||0,qty:req.quantity||1,matchQuality:mq,requirement:`${req.type||'Camera'}, ${minMP}MP, ${req.zone||req.location||'General'}`,tenderReq:req});
    });

    (tenderParsed.audio_requirements||[]).forEach((req,i)=>{
      const type=(req.type||'Horn Speaker').toLowerCase();
      const minSPL=req.min_spl_db||90;
      let cands=audModels.filter(m=>(m.cat||'').toLowerCase().includes(type.split(' ')[0])&&(m.spl||0)>=minSPL);
      if (!cands.length) cands=audModels.filter(m=>(m.cat||'').toLowerCase().includes(type.split(' ')[0]));
      if (!cands.length&&audModels.length) cands=audModels;
      if (!cands.length) return;
      cands.sort((a,b)=>(b.spl||0)-(a.spl||0));
      const m=cands[0];
      tenderBoqRows.push({id:'ta'+i,category:'audio',model:m.m,type:m.cat,res:m.spl?m.spl+'dB':'-',price:m.p||0,qty:req.quantity||1,matchQuality:(m.spl||0)>=minSPL?'Exact':'Best Available',requirement:`${req.type||'Speaker'}, ${minSPL}dB, ${req.zone||req.location||'General'}`,tenderReq:req});
    });

    if (!tenderBoqRows.length&&camModels.length) {
      const dm=camModels.find(m=>(m.r||0)>=2)||camModels[0];
      tenderBoqRows.push({id:'tr0',category:'camera',model:dm.m,type:dm.t,res:dm.r,price:dm.p||0,qty:tenderParsed.total_cameras||10,matchQuality:'Best Available',requirement:'General surveillance',tenderReq:{}});
    }

    renderTenderBOQ();
    renderTenderComplianceMatrix();
    showTenderPanel('boq');
    document.getElementById('tender-boq-brand-label').textContent=brand;
  } catch(e) {
    showTenderLoading('Failed: '+e.message,'');
    setTimeout(()=>showTenderPanel('brand'),3000);
  }
}

/* ══════════════════════════════════════════════════════════════
   RENDER BOQ + MATRIX
══════════════════════════════════════════════════════════════ */
function renderTenderBOQ() {
  const tbody=document.getElementById('tender-boq-tbody');
  if (!tbody) return;
  tbody.innerHTML=tenderBoqRows.map((r,i)=>{
    const tot=r.price*r.qty;
    const mqc=r.matchQuality==='Exact'?'match-exact':r.matchQuality==='Close'?'match-close':'match-best';
    return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);background:${i%2===0?'transparent':'rgba(255,255,255,0.01)'}">
      <td style="padding:10px 14px;font-size:10px;font-family:var(--fm);color:var(--dim)">${String(i+1).padStart(2,'0')}</td>
      <td style="padding:10px 14px"><div style="font-size:12px;font-weight:500;color:var(--head)">${r.model}</div><div style="font-size:10px;color:var(--mid)">${r.category}</div></td>
      <td style="padding:10px 14px;font-size:11px;color:var(--body)">${r.type}</td>
      <td style="padding:10px 14px;font-size:11px;font-family:var(--fm);color:var(--head)">${r.res}</td>
      <td style="padding:10px 14px;font-size:10px;color:var(--dim);line-height:1.4">${r.requirement}</td>
      <td style="padding:10px 14px"><span class="${mqc}">- ${r.matchQuality}</span></td>
      <td style="padding:10px 14px;font-size:12px;font-family:var(--fm);color:var(--head);text-align:right">${r.price?inrFull(r.price):'-'}</td>
      <td style="padding:10px 14px;font-size:12px;text-align:center;color:var(--head)">${r.qty}</td>
      <td style="padding:10px 14px;font-size:12px;font-family:var(--fm);font-weight:500;color:var(--money);text-align:right">${tot?inrFull(tot):'-'}</td>
    </tr>`;
  }).join('');
  const gt=document.getElementById('tender-boq-grand-total');
  if (gt) gt.textContent=inrFull(tenderBoqRows.reduce((s,r)=>s+(r.price*r.qty),0));
}

function renderTenderComplianceMatrix() {
  const el=document.getElementById('tender-compliance-matrix');
  if (!el||!tenderParsed) return;
  const minW=tenderParsed.warranty_years_minimum||0;
  const bW=tenderBoqBrand==='Axis'?5:tenderBoqBrand==='Bosch'?3:tenderBoqBrand==='Hanwha'?3:2;
  const isCN=['Hikvision','CP Plus','DSPPA','Tonmind','Dahua'].includes(tenderBoqBrand);
  const scFail=isCN&&(tenderParsed.supply_chain_restrictions||'')!=='None'&&(tenderParsed.supply_chain_restrictions||'')!=='';
  const approved=(tenderParsed.approved_brands||[]).map(b=>b.toLowerCase());

  const rows=[
    {req:'Brand approved in tender',spec:(tenderParsed.approved_brands||[]).join(', ')||'All brands',pass:approved.length===0||approved.includes(tenderBoqBrand.toLowerCase()),detail:tenderBoqBrand+(approved.length===0||approved.includes(tenderBoqBrand.toLowerCase())?' - listed as approved brand':' - NOT in approved list')},
    {req:'Minimum warranty',spec:minW?minW+' years':'Not specified',pass:!minW||bW>=minW,detail:tenderBoqBrand+' offers '+bW+'-year warranty'},
    {req:'Supply chain compliance',spec:tenderParsed.supply_chain_restrictions||'Not specified',pass:!scFail,detail:isCN&&scFail?tenderBoqBrand+' - Chinese origin - MeitY/NDAA risk':tenderBoqBrand+' - compliant origin'},
    ...tenderBoqRows.map(r=>({req:(r.category==='audio'?'Audio: ':'Camera: ')+r.requirement,spec:r.requirement,pass:r.matchQuality!=='Best Available',detail:r.model+' - '+r.matchQuality+' match'}))
  ];

  el.innerHTML=`<div style="border:1px solid var(--line);border-radius:8px;overflow:hidden">
    <div class="cmrow" style="grid-template-columns:180px 1fr 80px 180px"><div class="cmc hdr" style="border-right:1px solid var(--line)">Requirement</div><div class="cmc hdr" style="border-right:1px solid var(--line)">Tender Spec</div><div class="cmc hdr" style="text-align:center;border-right:1px solid var(--line)">Status</div><div class="cmc hdr">Detail</div></div>
    ${rows.map((r,i)=>`<div class="cmrow" style="grid-template-columns:180px 1fr 80px 180px;background:${i%2===0?'transparent':'rgba(255,255,255,0.01)'}">
      <div class="cmc feat" style="border-right:1px solid rgba(255,255,255,0.04)">${r.req}</div>
      <div class="cmc" style="font-size:11px;color:var(--mid);border-right:1px solid rgba(255,255,255,0.04)">${r.spec}</div>
      <div class="cmc ${r.pass?'pass':'fail'}" style="text-align:center;border-right:1px solid rgba(255,255,255,0.04)">${r.pass?'Pass':'Fail'}</div>
      <div class="cmc" style="font-size:10px;color:var(--dim);line-height:1.5">${r.detail}</div>
    </div>`).join('')}
  </div>
  <div style="margin-top:10px;padding:10px 14px;background:var(--s1);border-radius:8px;border:1px solid var(--line);font-size:11px;color:var(--dim);line-height:1.6">
    Compliance status is based on database information. Verify against official manufacturer datasheets before submission.
  </div>`;
}

function switchTenderBoqTab(tab) {
  ['boq','compliance'].forEach(t=>{
    document.getElementById('tboq-panel-'+t).style.display=t===tab?'':'none';
    document.getElementById('tboq-tab-'+t).classList.toggle('on',t===tab);
  });
}

function resetTender() {
  tenderParsed=null;tenderBoqBrand='';tenderBoqRows=[];tenderFileName='';
  window._tenderFile=null;
  showTenderPanel('upload');setTenderStep(1);
  document.getElementById('tender-file-info').style.display='none';
  document.getElementById('tender-file-input').value='';
}

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */
function fileToBase64(file) {
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=rej;
    r.readAsDataURL(file);
  });
}

/* ══════════════════════════════════════════════════════════════
   PDF EXPORT - reuses boqPDFDoc with logo embedded via drawPDFHeader
══════════════════════════════════════════════════════════════ */
function exportTenderBOQPDF() {
  if (!tenderBoqRows.length) { showToast('Generate a BOQ first.'); return; }
  const meta=getProjMeta();
  meta.client=tenderParsed?.client_name||meta.client;
  meta.site=tenderParsed?.project_name||meta.site;
  const pdfRows=tenderBoqRows.map(r=>({model:r.model,type:r.type,res:typeof r.res==='number'?r.res:0,price:r.price,qty:r.qty,customPrice:null}));
  const {doc,dateStr}=boqPDFDoc(tenderBoqBrand,pdfRows,meta,false);
  doc.save('ryaview_TenderBOQ_'+tenderBoqBrand+'_'+dateStr.replace(/ /g,'_')+'.pdf');
  logUsage('tender_boq_pdf',tenderBoqBrand);
}

/* ══════════════════════════════════════════════════════════════
   DOCX EXPORT - compliance document with embedded logo
══════════════════════════════════════════════════════════════ */
async function exportTenderCompliance() {
  if (!tenderParsed||!tenderBoqRows.length) { showToast('Generate a BOQ first.'); return; }
  showToast('Generating compliance document...');
  try {
    const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,
           HeadingLevel,AlignmentType,BorderStyle,WidthType,ShadingType,
           LevelFormat,PageBreak,PageNumberElement,Footer,Header,ImageRun} = docx;

    const NAVY='1F4E79',BLUE='2E75B6',GREEN='1D6A34',GREEN_L='EAF3DE',
          WHITE='FFFFFF',GRAY_L='F4F4F4',RED='A32D2D',RED_L='FDECEA';
    const bd={style:BorderStyle.SINGLE,size:1,color:'CCCCCC'};
    const borders={top:bd,bottom:bd,left:bd,right:bd};
    const nb={style:BorderStyle.NONE,size:0,color:'FFFFFF'};
    const noBorders={top:nb,bottom:nb,left:nb,right:nb};
    const txt=(t,o={})=>new TextRun({text:t,font:'Arial',size:22,...o});
    const par=(r,o={})=>new Paragraph({spacing:{before:60,after:80},children:Array.isArray(r)?r:[r],...o});
    const hdiv=()=>new Paragraph({spacing:{before:160,after:160},border:{bottom:{style:BorderStyle.SINGLE,size:6,color:BLUE,space:1}},children:[]});

    // Logo image
    let headerChildren=[txt('ryaview.ai',{bold:true,size:20,color:BLUE}),txt('  |  Tender Compliance Document',{size:18,color:'888888'}),txt('  |  Confidential',{size:18,color:'888888'})];
    if (window.RYAVIEW_LOGO_B64) {
      try {
        const ld=window.RYAVIEW_LOGO_B64.split(',')[1];
        const lb=Uint8Array.from(atob(ld),c=>c.charCodeAt(0));
        const logoRun=new ImageRun({data:lb.buffer,transformation:{width:1800000,height:460000},type:'png'});
        headerChildren=[logoRun,txt('  |  Tender Compliance Document',{size:18,color:'888888'}),txt('  |  Confidential',{size:18,color:'888888'})];
      } catch(e){console.warn('Logo embed:',e);}
    }

    const clientName=tenderParsed.client_name||getProjMeta().client||'-';
    const projectName=tenderParsed.project_name||getProjMeta().site||'-';
    const dateStr=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});
    const minW=tenderParsed.warranty_years_minimum||0;
    const bW=tenderBoqBrand==='Axis'?5:tenderBoqBrand==='Bosch'?3:2;
    const isCN=['Hikvision','CP Plus','DSPPA','Tonmind','Dahua'].includes(tenderBoqBrand);
    const scFail=isCN&&(tenderParsed.supply_chain_restrictions||'')!=='None';
    const approved=(tenderParsed.approved_brands||[]).map(b=>b.toLowerCase());

    const compRows=[
      [(tenderParsed.approved_brands||[]).join(', ')||'All brands',approved.length===0||approved.includes(tenderBoqBrand.toLowerCase()),tenderBoqBrand+(approved.length===0||approved.includes(tenderBoqBrand.toLowerCase())?' - approved brand':' - NOT in approved list'),'Brand approved in tender'],
      [minW?minW+' years':'Not specified',!minW||bW>=minW,tenderBoqBrand+' offers '+bW+'-year warranty','Minimum warranty'],
      [tenderParsed.supply_chain_restrictions||'Not specified',!scFail,isCN&&scFail?tenderBoqBrand+' - Chinese origin risk':tenderBoqBrand+' - compliant origin','Supply chain compliance'],
      ...tenderBoqRows.map(r=>[r.requirement,r.matchQuality!=='Best Available',r.model+' - '+r.matchQuality+' match',(r.category==='audio'?'Audio: ':'Camera: ')+r.type])
    ];

    const compTable=new Table({
      width:{size:9026,type:WidthType.DXA},columnWidths:[2600,1800,900,3726],
      rows:[
        new TableRow({tableHeader:true,children:['Requirement','Tender Spec','Status','Detail'].map((h,i)=>new TableCell({borders,width:{size:[2600,1800,900,3726][i],type:WidthType.DXA},shading:{fill:NAVY,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:120,right:120},children:[par(txt(h,{bold:true,size:19,color:WHITE}))]}))}),
        ...compRows.map((r,ri)=>new TableRow({children:[
          new TableCell({borders,width:{size:2600,type:WidthType.DXA},shading:{fill:ri%2===0?WHITE:GRAY_L,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:120,right:120},children:[par(txt(r[3]||r[0],{size:20}))]}),
          new TableCell({borders,width:{size:1800,type:WidthType.DXA},shading:{fill:ri%2===0?WHITE:GRAY_L,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:120,right:120},children:[par(txt(r[0],{size:19,color:'666666'}))]}),
          new TableCell({borders,width:{size:900,type:WidthType.DXA},shading:{fill:r[1]?GREEN_L:RED_L,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:120,right:120},children:[par(txt(r[1]?'Pass':'Fail',{bold:true,size:19,color:r[1]?GREEN:RED}),{alignment:AlignmentType.CENTER})]}),
          new TableCell({borders,width:{size:3726,type:WidthType.DXA},shading:{fill:ri%2===0?WHITE:GRAY_L,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:120,right:120},children:[par(txt(r[2],{size:18,color:'666666',italics:true}))]})
        ]}))
      ]
    });

    const boqTable=new Table({
      width:{size:9026,type:WidthType.DXA},columnWidths:[400,2800,1400,1000,1226,400,1000,800],
      rows:[
        new TableRow({tableHeader:true,children:['#','Model','Type','Spec','Tender Req','Match','Qty','Total'].map((h,i)=>new TableCell({borders,width:{size:[400,2800,1400,1000,1226,400,1000,800][i],type:WidthType.DXA},shading:{fill:NAVY,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:80,right:80},children:[par(txt(h,{bold:true,size:18,color:WHITE}))]}))}),
        ...tenderBoqRows.map((r,ri)=>new TableRow({children:[
          new TableCell({borders,width:{size:400,type:WidthType.DXA},shading:{fill:ri%2===0?WHITE:GRAY_L,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:80,right:80},children:[par(txt(String(ri+1).padStart(2,'0'),{size:18,color:'888888'}),{alignment:AlignmentType.CENTER})]}),
          new TableCell({borders,width:{size:2800,type:WidthType.DXA},shading:{fill:ri%2===0?WHITE:GRAY_L,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:80,right:80},children:[par(txt(r.model,{bold:true,size:20}))]}),
          new TableCell({borders,width:{size:1400,type:WidthType.DXA},shading:{fill:ri%2===0?WHITE:GRAY_L,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:80,right:80},children:[par(txt(r.type,{size:19}))]}),
          new TableCell({borders,width:{size:1000,type:WidthType.DXA},shading:{fill:ri%2===0?WHITE:GRAY_L,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:80,right:80},children:[par(txt(String(r.res),{size:19,color:'444444'}))]}),
          new TableCell({borders,width:{size:1226,type:WidthType.DXA},shading:{fill:ri%2===0?WHITE:GRAY_L,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:80,right:80},children:[par(txt(r.requirement.split(',')[0],{size:17,color:'888888',italics:true}))]}),
          new TableCell({borders,width:{size:400,type:WidthType.DXA},shading:{fill:ri%2===0?WHITE:GRAY_L,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:80,right:80},children:[par(txt(r.matchQuality,{size:17,color:r.matchQuality==='Exact'?GREEN:r.matchQuality==='Close'?'B8860B':'888888',italics:true}))]}),
          new TableCell({borders,width:{size:400,type:WidthType.DXA},shading:{fill:ri%2===0?WHITE:GRAY_L,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:80,right:80},children:[par(txt(String(r.qty),{bold:true,size:20}),{alignment:AlignmentType.CENTER})]}),
          new TableCell({borders,width:{size:800,type:WidthType.DXA},shading:{fill:ri%2===0?WHITE:GRAY_L,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:80,right:80},children:[par(txt(r.price?(r.price*r.qty/100000).toFixed(1)+'L':'-',{size:19,bold:true,color:GREEN}),{alignment:AlignmentType.RIGHT})]})
        ]}))
      ]
    });

    const grandTotal=tenderBoqRows.reduce((s,r)=>s+(r.price*r.qty),0);

    const doc2=new Document({
      styles:{default:{document:{run:{font:'Arial',size:22}}}},
      sections:[{
        properties:{page:{size:{width:11906,height:16838},margin:{top:1080,right:1080,bottom:1080,left:1080}}},
        headers:{default:new Header({children:[new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,size:6,color:BLUE}},spacing:{after:120},children:headerChildren})]})},
        footers:{default:new Footer({children:[new Paragraph({border:{top:{style:BorderStyle.SINGLE,size:6,color:BLUE}},spacing:{before:120},alignment:AlignmentType.CENTER,children:[txt('ryaview.ai  |  Aarya Surveillance Systems  |  '+dateStr+'  |  Page ',{size:17,color:'888888'}),new PageNumberElement()]})]})},
        children:[
          new Paragraph({spacing:{before:200,after:0},children:[txt('TENDER COMPLIANCE DOCUMENT',{bold:true,size:38,color:NAVY})]}),
          new Paragraph({spacing:{before:40,after:0},children:[txt('Auto-generated - For internal review before submission',{size:22,color:BLUE,italics:true})]}),
          hdiv(),
          new Table({width:{size:9026,type:WidthType.DXA},columnWidths:[2256,2257,2256,2257],rows:
            [[['Client',clientName],['Project',projectName]],[['Brand Proposed',tenderBoqBrand],['Date',dateStr]]].map(row=>new TableRow({children:row.map(([l,v])=>new TableCell({borders:noBorders,width:{size:2256,type:WidthType.DXA},shading:{fill:GRAY_L,type:ShadingType.CLEAR},margins:{top:100,bottom:100,left:140,right:140},children:[par(txt(l,{size:17,color:'888888'})),par(txt(v,{bold:true,size:22,color:NAVY}))]}))}))}),
          new Paragraph({spacing:{before:200}}),
          new Paragraph({spacing:{before:120,after:80},children:[txt('1. Compliance Matrix',{bold:true,size:28,color:NAVY})]}),
          par(txt('Requirements extracted from the uploaded tender. Verified against the '+tenderBoqBrand+' catalogue.',{size:21,color:'444444'})),
          new Paragraph({spacing:{before:80,after:0}}),
          compTable,
          new Paragraph({children:[new PageBreak()]}),
          new Paragraph({spacing:{before:120,after:80},children:[txt('2. Bill of Quantities - '+tenderBoqBrand,{bold:true,size:28,color:NAVY})]}),
          par(txt('Models matched to tender specifications. Exact = meets all specs. Close = meets key specs. Best Available = closest option.',{size:21,color:'444444'})),
          new Paragraph({spacing:{before:80,after:0}}),
          boqTable,
          new Paragraph({spacing:{before:120},alignment:AlignmentType.RIGHT,children:[txt('Grand Total (indicative): ',{size:22,color:'444444'}),txt('Rs. '+(grandTotal/100000).toFixed(2)+' Lakh',{bold:true,size:24,color:GREEN})]}),
          new Paragraph({spacing:{before:200}}),
          hdiv(),
          par(txt('DISCLAIMER: Auto-generated by ryaview.ai. All specifications must be independently verified by a qualified systems integrator against the full tender document before submission. Prices are indicative only.',{size:19,italics:true,color:'888888'})),
        ]
      }]
    });

    const buf=await Packer.toBuffer(doc2);
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='ryaview_TenderCompliance_'+tenderBoqBrand+'_'+new Date().toISOString().slice(0,10)+'.docx';
    a.click();URL.revokeObjectURL(url);
    showToast('Compliance document downloaded');
  } catch(e){showToast('Export failed: '+e.message);console.error(e);}
}
