/* ════════════════════════════════════════════════════════════════
   ryaview.ai — AUDIO INTELLIGENCE MODULE
   BOQ + Alternative BOQ + Comparison + AI Verdict
   Standalone block — inject into ryaview-final.html when ready

   INJECTION POINTS:
   1. Nav: add <button onclick="sw('audio',this)">Audio</button>
   2. Page: add <div id="page-audio" class="page"></div>
   3. Call loadAudioDB() after loadCamerasDB() in DOMContentLoaded
   ════════════════════════════════════════════════════════════════ */

/* ── AUDIO DB (loaded from Supabase) ── */
let AUDIO_DB    = {};   // { brand: [{ m, cat, spl, freq_low, freq_high, coverage, amp_w, ip, poe_class, poe_w, sip, audio_mgr, temp, cyber, warranty, price }] }
let audioBoqBrand = '';
let audioBoqRows  = [];
let audioAltBrand = '';
let audioAltRows  = [];

/* ── AUDIO BRAND COLORS ── */
const AUDIO_BRAND_COLORS = {
  'Axis':    'var(--blue)',
  'TOA':     '#e8580a',
  'Tonmind': '#dc2626',
  'Algo':    '#7c3aed',
  'DSPPA':   '#b91c1c',
  'Commend': '#0369a1',
  'Ahuja':   '#15803d',
  'Bosch':   '#92400e'
};

/* ── AUDIO CATEGORIES ── */
const AUDIO_CATEGORIES = [
  'Horn Speaker',
  'Ceiling Speaker',
  'Cabinet Speaker',
  'Mini Speaker',
  'Pendant Speaker',
  'Sound Projector',
  'Display Speaker',
  'Strobe Speaker',
  'Column Speaker',
  'Wall Speaker',
  'Network Amplifier',
  'Amplifier',
  'Paging Console',
  'SIP Horn Speaker',
  'SIP Ceiling Speaker',
  'SIP Audio Alerter',
  'IP Intercom Station',
  'Public Address System'
];

/* ── LOAD AUDIO DB FROM SUPABASE ── */
async function loadAudioDB() {
  try {
    const { data, error } = await _sb
      .from('audio_products')
      .select('*')
      .eq('active', true)
      .order('brand')
      .order('category')
      .order('spl_db', { ascending: false });

    if (error) throw error;

    AUDIO_DB = {};
    (data || []).forEach(r => {
      if (!AUDIO_DB[r.brand]) AUDIO_DB[r.brand] = [];
      AUDIO_DB[r.brand].push({
        m:         r.model,
        cat:       r.category,
        spl:       r.spl_db,
        freq_low:  r.freq_low,
        freq_high: r.freq_high,
        coverage:  r.coverage_angle,
        amp_w:     r.amplifier_watts,
        ip:        r.ip_rating,
        poe_class: r.poe_class,
        poe_w:     r.poe_watts,
        sip:       r.sip_support,
        audio_mgr: r.audio_manager,
        temp:      r.operating_temp,
        cyber:     r.cybersecurity,
        warranty:  r.warranty,
        p:         r.price_inr,
        datasheet: r.datasheet_url,
        verified:  r.verified_date
      });
    });

    window._audioRows = data || [];
    console.log(`Audio DB loaded: ${(data||[]).length} products`);
  } catch(e) {
    console.error('Audio DB load error:', e);
  }
}

/* ── AUDIO SCORING ── */
function scoreAudio(product, allProducts, clientMode) {
  const isGovt = clientMode === 'govt';

  // SPL score (0-1) — reference max 125dB
  const spl = product.spl || 90;
  const s_spl = Math.min(spl / 125, 1);

  // Audio quality score (frequency range)
  const freqRange = (product.freq_high || 10000) - (product.freq_low || 500);
  const s_freq = Math.min(freqRange / 20000, 1);

  // IP rating score
  const ipMap = { 'IP67':1.0, 'IP66/IP67':1.0, 'IP66':0.90, 'IP65':0.75,
                  'IP54':0.55, 'IP44':0.40, 'IP32':0.25, 'IP20':0.20, 'IP20 (UL2043 Plenum)':0.30 };
  const s_ip = ipMap[product.ip] || 0.30;

  // SIP support
  const s_sip = product.sip ? 1.0 : 0.0;

  // Audio manager integration
  const mgr = (product.audio_mgr || '').toLowerCase();
  let s_integration = 0.3;
  if (mgr.includes('axis audio manager edge')) s_integration = 1.0;
  else if (mgr.includes('built-in') || mgr.includes('built in')) s_integration = 0.7;
  else if (mgr.includes('separate') && !mgr.includes('none')) s_integration = 0.4;
  else if (mgr.includes('none') || mgr === '') s_integration = 0.2;

  // Cybersecurity score
  const cyber = (product.cyber || '').toLowerCase();
  let s_cyber = 0.3;
  if (cyber.includes('axis os') || cyber.includes('signed firmware')) s_cyber = 1.0;
  else if (cyber.includes('802.1x') && cyber.includes('https')) s_cyber = 0.7;
  else if (cyber.includes('https')) s_cyber = 0.5;
  else if (cyber.includes('chinese') || cyber.includes('no published')) s_cyber = 0.1;

  // Warranty
  const warr = product.warranty || 1;
  const s_warranty = Math.min(warr / 5, 1);

  // Value score (inverse price relative to median)
  const prices = allProducts.map(p => p.p || 0).filter(p => p > 0);
  const medianPrice = prices.sort((a,b)=>a-b)[Math.floor(prices.length/2)] || 1;
  const s_value = product.p > 0
    ? Math.max(0, 1 - (product.p - medianPrice) / (medianPrice * 2))
    : 0.5;

  // Weights
  const w = isGovt ? {
    spl: 15, freq: 10, ip: 20, sip: 15, integration: 10, cyber: 20, warranty: 5, value: 5
  } : {
    spl: 20, freq: 18, ip: 15, sip: 12, integration: 15, cyber: 8, warranty: 7, value: 5
  };

  const raw =
    s_spl         * w.spl +
    s_freq        * w.freq +
    s_ip          * w.ip +
    s_sip         * w.sip +
    s_integration * w.integration +
    s_cyber       * w.cyber +
    s_warranty    * w.warranty +
    s_value       * w.value;

  return {
    total: Math.round(raw),
    breakdown: {
      spl:         Math.round(s_spl * w.spl),
      audioQuality:Math.round(s_freq * w.freq),
      ipRating:    Math.round(s_ip * w.ip),
      sip:         Math.round(s_sip * w.sip),
      integration: Math.round(s_integration * w.integration),
      cyber:       Math.round(s_cyber * w.cyber),
      warranty:    Math.round(s_warranty * w.warranty),
      value:       Math.round(s_value * w.value)
    }
  };
}

/* ════════════ AUDIO BOQ ════════════ */

function renderAudioBrandStrip() {
  const strip = document.getElementById('audio-boq-brands');
  if (!strip) return;
  const brands = Object.keys(AUDIO_DB);
  strip.innerHTML = brands.map(b => `
    <button class="bb" onclick="selectAudioBoqBrand(this,'${b}')"
      style="--bc:${AUDIO_BRAND_COLORS[b]||'var(--blue)'}">
      ${b}
    </button>`).join('');
}

function selectAudioBoqBrand(btn, brand) {
  document.querySelectorAll('#audio-boq-brands .bb').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  audioBoqBrand = brand;
  audioBoqRows  = [];

  document.getElementById('audio-boq-step2').style.display    = '';
  document.getElementById('audio-boq-brand-tag').textContent  = brand;

  // Seed 3 blank rows
  const tbody = document.getElementById('audio-boq-tbody');
  tbody.innerHTML = '';
  for (let i = 1; i <= 3; i++) {
    const rid = 'ab' + Date.now() + i;
    audioBoqRows.push({ id: rid, model:'', cat:'', spl:0, ip:'', price:0, qty:1 });
    tbody.insertAdjacentHTML('beforeend', buildAudioRow(i, brand, rid, false));
  }
  updateAudioBoqTotals();
}

function buildAudioRow(idx, brand, rowId, isAlt) {
  const products = AUDIO_DB[brand] || [];
  const fn    = isAlt ? 'updateAudioAltRow' : 'updateAudioBoqRow';
  const delFn = isAlt ? `deleteAudioAltRow('${rowId}')` : `deleteAudioBoqRow('${rowId}')`;

  // Group options by category — deduplicate by model name
  const grouped = {};
  const seen = new Set();
  products.forEach(p => {
    if (seen.has(p.m)) return;  // skip duplicates
    seen.add(p.m);
    if (!grouped[p.cat]) grouped[p.cat] = [];
    grouped[p.cat].push(p);
  });

  const optsHTML = Object.entries(grouped).map(([cat, prods]) =>
    `<optgroup label="${cat}">` +
    prods.map(p =>
      `<option value="${p.m}|${p.cat}|${p.spl||0}|${p.ip||''}|${p.p||0}">${p.m} — ${p.cat}${p.spl ? ' — '+p.spl+'dB' : ''}</option>`
    ).join('') +
    `</optgroup>`
  ).join('');

  return `<tr id="audio-row-${rowId}">
    <td><span class="rn">${String(idx).padStart(2,'0')}</span></td>
    <td>
      <select class="csel" id="audio-sel-${rowId}" style="width:100%;font-size:11px"
        onchange="${fn}('${rowId}',this)">
        <option value="">\u2014 select model \u2014</option>${optsHTML}
      </select>
      <div id="audio-info-${rowId}" style="font-size:10px;color:var(--blue2);font-family:var(--fm);margin-top:3px"></div>
    </td>
    <td id="audio-cat-${rowId}" style="font-size:11px">\u2014</td>
    <td id="audio-spl-${rowId}" style="font-size:11px;text-align:center">\u2014</td>
    <td id="audio-ip-${rowId}" style="font-size:11px;text-align:center">\u2014</td>
    <td class="pr" id="audio-price-${rowId}">\u2014</td>
    <td><input class="qin" id="audio-qty-${rowId}" value="1" oninput="${fn}('${rowId}',null)"></td>
    <td class="pr" id="audio-total-${rowId}">\u2014</td>
    <td><button class="xb" onclick="${delFn}">\u00d7</button></td>
  </tr>`;
}

function updateAudioBoqRow(rowId, sel) {
  const row = audioBoqRows.find(r => r.id === rowId);
  if (!row) return;
  if (sel && sel.value) {
    const [model, cat, spl, ip, price] = sel.value.split('|');
    row.model = model; row.cat = cat;
    row.spl   = parseInt(spl)   || 0;
    row.ip    = ip;
    row.price = parseInt(price) || 0;
    document.getElementById('audio-cat-'+rowId).textContent   = cat;
    document.getElementById('audio-spl-'+rowId).textContent   = spl ? spl+'dB' : '\u2014';
    document.getElementById('audio-ip-'+rowId).textContent    = ip || '\u2014';
    document.getElementById('audio-price-'+rowId).textContent = row.price ? inrFull(row.price) : '\u2014';
    document.getElementById('audio-info-'+rowId).textContent  = model;
  }
  const qEl = document.getElementById('audio-qty-'+rowId);
  row.qty = parseInt(qEl?.value) || 1;
  const tot = row.price * row.qty;
  document.getElementById('audio-total-'+rowId).textContent = tot > 0 ? inrFull(tot) : '\u2014';
  updateAudioBoqTotals();
}

function addAudioBoqRow() {
  if (!audioBoqBrand) return;
  const rid = 'ab' + Date.now();
  audioBoqRows.push({ id: rid, model:'', cat:'', spl:0, ip:'', price:0, qty:1 });
  const tbody = document.getElementById('audio-boq-tbody');
  tbody.insertAdjacentHTML('beforeend', buildAudioRow(audioBoqRows.length, audioBoqBrand, rid, false));
  renumberRows('audio-boq-tbody');
  updateAudioBoqTotals();
}

function deleteAudioBoqRow(rowId) {
  audioBoqRows = audioBoqRows.filter(r => r.id !== rowId);
  document.getElementById('audio-row-'+rowId)?.remove();
  renumberRows('audio-boq-tbody');
  updateAudioBoqTotals();
}

function updateAudioBoqTotals() {
  const filled = audioBoqRows.filter(r => r.price > 0);
  const total  = filled.reduce((s, r) => s + r.price * r.qty, 0);
  const units  = filled.reduce((s, r) => s + r.qty, 0);
  const gt = document.getElementById('audio-boq-grand-total');
  if (gt) gt.textContent = inrFull(total);
}

/* ════════════ AUDIO ALT BOQ ════════════ */

function openAudioAltModal() {
  if (!audioBoqBrand) { alert('Please select a brand and build your Audio BOQ first.'); return; }
  const strip = document.getElementById('audio-alt-brands');
  strip.innerHTML = '';
  Object.keys(AUDIO_DB).filter(b => b !== audioBoqBrand).forEach(b => {
    strip.insertAdjacentHTML('beforeend',
      `<button class="bb" onclick="selectAudioAltBrand(this,'${b}')"
        style="--bc:${AUDIO_BRAND_COLORS[b]||'var(--blue)'}">${b}</button>`);
  });
  audioAltBrand = ''; audioAltRows = [];
  document.getElementById('audio-alt-step2').style.display  = 'none';
  document.getElementById('audio-alt-tbody').innerHTML      = '';
  document.getElementById('audio-alt-grand-total').textContent = '\u20b9 0';
  document.getElementById('audio-alt-modal').classList.add('on');
}

function closeAudioAltModal() {
  document.getElementById('audio-alt-modal').classList.remove('on');
}

function selectAudioAltBrand(btn, brand) {
  document.querySelectorAll('#audio-alt-brands .bb').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  audioAltBrand = brand;
  document.getElementById('audio-alt-step2').style.display = '';
  document.getElementById('audio-alt-brand-tag').textContent = brand;

  // Auto spec-match from main BOQ
  audioAltRows = [];
  const tbody = document.getElementById('audio-alt-tbody');
  tbody.innerHTML = '';
  const filled = audioBoqRows.filter(r => r.price > 0);
  const toFill = filled.length ? filled : audioBoqRows.slice(0, 3);

  toFill.forEach((src, i) => {
    const rid   = 'aa' + Date.now() + i;
    const match = findBestAudioMatch(brand, src.cat, src.spl);
    const price = match ? match.p : 0;
    audioAltRows.push({ id:rid, model:match?.m||'', cat:match?.cat||'', spl:match?.spl||0, ip:match?.ip||'', price, qty: src.qty||1 });
    tbody.insertAdjacentHTML('beforeend', buildAudioRow(i+1, brand, rid, true));
    if (match) {
      const sel = document.getElementById('audio-sel-'+rid);
      if (sel) {
        const optVal = `${match.m}|${match.cat}|${match.spl||0}|${match.ip||''}|${match.p||0}`;
        const opt = Array.from(sel.options).find(o => o.value === optVal);
        if (opt) sel.value = opt.value;
      }
      document.getElementById('audio-cat-'+rid).textContent   = match.cat;
      document.getElementById('audio-spl-'+rid).textContent   = match.spl ? match.spl+'dB' : '\u2014';
      document.getElementById('audio-ip-'+rid).textContent    = match.ip || '\u2014';
      document.getElementById('audio-price-'+rid).textContent = price ? inrFull(price) : '\u2014';
      document.getElementById('audio-info-'+rid).textContent  = match.m;
      const qEl = document.getElementById('audio-qty-'+rid);
      if (qEl) qEl.value = src.qty||1;
      const tot = price * (src.qty||1);
      document.getElementById('audio-total-'+rid).textContent = tot > 0 ? inrFull(tot) : '\u2014';
    }
  });
  renumberRows('audio-alt-tbody');
  updateAudioAltTotals();
}

function findBestAudioMatch(brand, srcCat, srcSpl) {
  const catalogue = AUDIO_DB[brand] || [];
  // Exact category match first
  const catMatch = catalogue.filter(p => p.cat === srcCat);
  if (catMatch.length) {
    // Closest SPL
    catMatch.sort((a,b) => Math.abs((a.spl||90)-(srcSpl||90)) - Math.abs((b.spl||90)-(srcSpl||90)));
    return catMatch[0];
  }
  // Fallback: any product
  return catalogue[0] || null;
}

function updateAudioAltRow(rowId, sel) {
  const row = audioAltRows.find(r => r.id === rowId);
  if (!row) return;
  if (sel && sel.value) {
    const [model, cat, spl, ip, price] = sel.value.split('|');
    row.model = model; row.cat = cat;
    row.spl   = parseInt(spl)||0;
    row.ip    = ip;
    row.price = parseInt(price)||0;
    document.getElementById('audio-cat-'+rowId).textContent   = cat;
    document.getElementById('audio-spl-'+rowId).textContent   = spl ? spl+'dB' : '\u2014';
    document.getElementById('audio-ip-'+rowId).textContent    = ip || '\u2014';
    document.getElementById('audio-price-'+rowId).textContent = row.price ? inrFull(row.price) : '\u2014';
    document.getElementById('audio-info-'+rowId).textContent  = model;
  }
  const qEl = document.getElementById('audio-qty-'+rowId);
  row.qty = parseInt(qEl?.value)||1;
  const tot = row.price * row.qty;
  document.getElementById('audio-total-'+rowId).textContent = tot>0 ? inrFull(tot) : '\u2014';
  updateAudioAltTotals();
}

function addAudioAltRow() {
  if (!audioAltBrand) return;
  const rid = 'aa' + Date.now();
  audioAltRows.push({ id:rid, model:'', cat:'', spl:0, ip:'', price:0, qty:1 });
  document.getElementById('audio-alt-tbody').insertAdjacentHTML('beforeend',
    buildAudioRow(audioAltRows.length, audioAltBrand, rid, true));
  renumberRows('audio-alt-tbody');
  updateAudioAltTotals();
}

function deleteAudioAltRow(rowId) {
  audioAltRows = audioAltRows.filter(r => r.id !== rowId);
  document.getElementById('audio-row-'+rowId)?.remove();
  renumberRows('audio-alt-tbody');
  updateAudioAltTotals();
}

function updateAudioAltTotals() {
  const total = audioAltRows.filter(r=>r.price>0).reduce((s,r)=>s+r.price*r.qty,0);
  const gt = document.getElementById('audio-alt-grand-total');
  if (gt) gt.textContent = inrFull(total);
}

/* ════════════ AUDIO AI SUGGEST EQUIVALENTS ════════════ */

async function suggestAudioAltEquivalents() {
  if (!audioAltBrand) { showToast('Select an alternative brand first.'); return; }
  const filled = audioBoqRows.filter(r => r.price > 0);
  if (!filled.length) { showToast('Add at least one product to the Audio BOQ first.'); return; }

  const btn = document.getElementById('audio-alt-ai-btn');
  btn.disabled = true;
  btn.innerHTML = '<svg style="animation:spin 1s linear infinite;width:11px;height:11px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Finding…';

  const mainList = filled.map(r =>
    `Model: ${r.model} | Category: ${r.cat} | SPL: ${r.spl||'N/A'}dB | IP: ${r.ip||'N/A'} | Price: Rs.${r.price} | Qty: ${r.qty}`
  ).join('\n');

  const altCatalogue = (AUDIO_DB[audioAltBrand]||[]).map(p =>
    `Model: ${p.m} | Category: ${p.cat} | SPL: ${p.spl||'N/A'}dB | IP: ${p.ip||'N/A'} | Price: Rs.${p.p||0}`
  ).join('\n');

  const prompt = `You are a surveillance audio specialist. Match each product in the MAIN AUDIO BOQ to the best equivalent in the ALTERNATIVE catalogue. Match must be apple-to-apple: same category (Horn Speaker = Horn Speaker, Ceiling Speaker = Ceiling Speaker), closest SPL class.

MAIN BOQ (${audioBoqBrand}):
${mainList}

${audioAltBrand} CATALOGUE:
${altCatalogue}

Return ONLY JSON array — no text:
[{ "original_model": "...", "original_cat": "...", "matched_model": "...", "matched_cat": "...", "qty": 1, "match_quality": "Exact|Close|Best Available", "note": "..." }]
CRITICAL: matched_model MUST exist verbatim in the ${audioAltBrand} catalogue above.`;

  try {
    const res = await fetch('https://ssytbjfhjuhgnvgdvgkh.supabase.co/functions/v1/ai-proxy', {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':'sb_publishable_xne4CDAl1nml80T7AVZGxA_Z8rwpSwZ','Authorization':'Bearer sb_publishable_xne4CDAl1nml80T7AVZGxA_Z8rwpSwZ'},
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000,
        messages:[{role:'user',content:prompt}] })
    });
    const data = await res.json();
    const text = (data.content||[]).map(c=>c.text||'').join('').trim();
    const suggestions = JSON.parse(text.replace(/```json|```/g,'').trim());

    audioAltRows = [];
    document.getElementById('audio-alt-tbody').innerHTML = '';
    let applied = 0;

    for (const s of suggestions) {
      const match = (AUDIO_DB[audioAltBrand]||[]).find(p=>p.m===s.matched_model);
      if (!match) continue;
      const rid = 'aa' + Date.now() + applied;
      const origRow = filled.find(r=>r.model===s.original_model);
      const qty = origRow ? origRow.qty : (s.qty||1);
      audioAltRows.push({ id:rid, model:match.m, cat:match.cat, spl:match.spl||0, ip:match.ip||'', price:match.p||0, qty });
      document.getElementById('audio-alt-tbody').insertAdjacentHTML('beforeend', buildAudioRow(audioAltRows.length, audioAltBrand, rid, true));
      const sel = document.getElementById('audio-sel-'+rid);
      if (sel) {
        const optVal = `${match.m}|${match.cat}|${match.spl||0}|${match.ip||''}|${match.p||0}`;
        const opt = Array.from(sel.options).find(o=>o.value===optVal);
        if (opt) sel.value = opt.value;
      }
      document.getElementById('audio-cat-'+rid).textContent   = match.cat;
      document.getElementById('audio-spl-'+rid).textContent   = match.spl ? match.spl+'dB' : '\u2014';
      document.getElementById('audio-ip-'+rid).textContent    = match.ip || '\u2014';
      document.getElementById('audio-price-'+rid).textContent = match.p ? inrFull(match.p) : '\u2014';
      document.getElementById('audio-info-'+rid).textContent  = match.m;
      const qEl = document.getElementById('audio-qty-'+rid);
      if (qEl) qEl.value = qty;
      const tot = (match.p||0) * qty;
      document.getElementById('audio-total-'+rid).textContent = tot>0 ? inrFull(tot) : '\u2014';
      applied++;
    }
    renumberRows('audio-alt-tbody');
    updateAudioAltTotals();
    showToast(`✓ ${applied} product${applied!==1?'s':''} matched by AI`);
  } catch(e) {
    showToast('AI suggest failed — ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> AI Suggest Equivalents';
  }
}

/* ════════════ AUDIO COMPARISON ════════════ */

async function runAudioCompare() {
  if (!validateProjMeta()) return;
  const slots = [1,2,3,4,5];
  const selected = slots.map(i => {
    const b = document.getElementById('ab'+i)?.value;
    const m = document.getElementById('am'+i)?.value;
    return b && m ? { brand:b, model:m.split('|')[0] } : null;
  }).filter(Boolean);

  if (selected.length < 2) { alert('Select at least 2 audio products to compare.'); return; }

  // Build product objects
  const products = selected.map(s => {
    const prod = (AUDIO_DB[s.brand]||[]).find(p=>p.m===s.model);
    return prod ? { ...prod, brand:s.brand } : null;
  }).filter(Boolean);

  if (products.length < 2) { alert('Could not find selected products in database.'); return; }

  // Mismatch check
  const cats = [...new Set(products.map(p=>p.cat))];
  const mismatchEl = document.getElementById('audio-cmp-mismatch');
  if (mismatchEl) {
    if (cats.length > 1) {
      mismatchEl.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" style="flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> <b>Not apple-to-apple:</b> comparison includes mixed categories (' + [...new Set(products.map(p=>p.cat))].join(', ') + '). For a fair comparison, select products of the same category.';
      mismatchEl.style.display = 'flex';
    } else {
      mismatchEl.style.display = 'none';
    }
  }

  // Score all products
  const clientMode = getClientMode();
  const scored = products.map(p => ({ prod:p, score:scoreAudio(p, products, clientMode) }));
  scored.sort((a,b) => b.score.total - a.score.total);
  const winner = scored[0].prod;
  const winnerScore = scored[0].score;

  // Build comparison matrix
  const gridCols = '160px ' + products.map(()=>'1fr').join(' ');

  function audioRow(label, cells) {
    return `<div class="mrow" style="grid-template-columns:${gridCols}">
      <div class="mc feat">${label}</div>
      ${cells.map(c=>`<div class="mc ${c.best?'win':''}">${c.html}</div>`).join('')}
    </div>`;
  }

  const bestSpl = Math.max(...products.map(p=>p.spl||0));
  const lowestPrice = Math.min(...products.filter(p=>p.p>0).map(p=>p.p));
  const bestWarranty = Math.max(...products.map(p=>p.warranty||0));

  const matrix = document.getElementById('audio-cmp-matrix');
  if (!matrix) return;

  matrix.style.display = '';
  matrix.innerHTML = `
    <div class="mwrap">
      ${audioRow('Brand', products.map(p=>({ best:false, html:`<div class="mc-brand" style="color:${AUDIO_BRAND_COLORS[p.brand]||'var(--blue)'}">${p.brand}</div>` })))}
      ${audioRow('Model', products.map(p=>({ best:false, html:`<div style="font-family:var(--fm);font-size:12px;color:var(--head);font-weight:600">${p.m}</div>` })))}
      ${audioRow('Category', products.map(p=>({ best:false, html:`<span style="font-size:11px">${p.cat||'\u2014'}</span>` })))}
      ${audioRow('Max SPL', products.map(p=>({ best:(p.spl||0)===bestSpl, html:`<span style="font-family:var(--fm);font-size:13px;color:var(--head)">${p.spl?p.spl+' dB':'\u2014'}</span>` })))}
      ${audioRow('Frequency', products.map(p=>({ best:false, html:`<span style="font-size:11px">${p.freq_low&&p.freq_high?p.freq_low+'Hz \u2013 '+p.freq_high+'Hz':'\u2014'}</span>` })))}
      ${audioRow('Coverage', products.map(p=>({ best:false, html:`<span style="font-size:11px">${p.coverage||'\u2014'}</span>` })))}
      ${audioRow('IP Rating', products.map(p=>({ best:false, html:`<span style="font-family:var(--fm);font-size:11px">${p.ip||'\u2014'}</span>` })))}
      ${audioRow('Amplifier', products.map(p=>({ best:false, html:`<span style="font-size:11px">${p.amp_w?p.amp_w+'W Class D':'\u2014'}</span>` })))}
      ${audioRow('PoE', products.map(p=>({ best:false, html:`<span style="font-size:11px">${p.poe_class||'\u2014'}${p.poe_w?' ('+p.poe_w+'W max)':''}</span>` })))}
      ${audioRow('SIP Support', products.map(p=>({ best:p.sip, html:`<span style="color:${p.sip?'var(--money)':'var(--mid)'}">${p.sip?'\u2713 Yes':'\u2715 No'}</span>` })))}
      ${audioRow('Audio Manager', products.map(p=>{ const hasBuiltIn=(p.audio_mgr||'').toLowerCase().includes('built'); return { best:hasBuiltIn, html:`<span style="font-size:10px;line-height:1.4">${(p.audio_mgr||'\u2014').split('\u2014')[0].trim()}</span>` }; }))}
      ${audioRow('Op. Temp', products.map(p=>({ best:false, html:`<span style="font-size:11px">${p.temp||'\u2014'}</span>` })))}
      ${audioRow('Warranty', products.map(p=>({ best:(p.warranty||0)===bestWarranty, html:`<span style="font-family:var(--fm)">${p.warranty?p.warranty+' yr':'\u2014'}</span>` })))}
      ${audioRow('Unit Price', products.map(p=>({ best:p.p===lowestPrice&&p.p>0, html:`<span class="mc-price">${p.p?inrFull(p.p):'\u2014'}</span>` })))}
      ${audioRow('AI Score', scored.map(s=>{ const isWin=s.prod===winner; return { best:isWin, html:`<div style="font-size:18px;font-weight:800;font-family:var(--fm);color:${isWin?'var(--money)':'var(--head)'}">${s.score.total}</div><div style="font-size:9px;color:var(--dim)">/100</div>` }; }))}
      ${audioRow('AI Verdict', products.map(p=>{ const isWin=p===winner; return { best:isWin, html:`<div id="audio-verdict-${p.brand.replace(/\W/g,'-')}-${p.m.replace(/\W/g,'-')}" style="font-size:11px;color:var(--mid);line-height:1.5"><svg style="animation:spin 1s linear infinite;width:12px;height:12px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> AI analysing…</div>` }; }))}
    </div>`;

  // Winner card (immediate)
  const wc = document.getElementById('audio-winner-card');
  if (wc) {
    const isAxis  = winner.brand === 'Axis';
    const accent  = isAxis ? 'var(--blue)' : 'var(--money)';
    const bd      = winnerScore.breakdown;
    const bars = [
      { label:'SPL',          val:bd.spl,         max:20, color:'#7aadfa' },
      { label:'Audio Quality', val:bd.audioQuality, max:18, color:'#34d399' },
      { label:'IP Rating',    val:bd.ipRating,     max:15, color:'#fbbf24' },
      { label:'SIP',          val:bd.sip,          max:12, color:'#f472b6' },
      { label:'Integration',  val:bd.integration,  max:15, color:'#a78bfa' },
      { label:'Cybersecurity',val:bd.cyber,        max:20, color:'#22d3ee' },
      { label:'Warranty',     val:bd.warranty,     max:7,  color:'#4ade80' },
      { label:'Value',        val:bd.value,        max:5,  color:'#fb923c' }
    ];
    wc.style.display = 'block';
    wc.innerHTML = `
      <div style="background:rgba(79,142,247,0.05);border:1px solid rgba(79,142,247,0.2);border-radius:12px;padding:22px 26px">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
          <div style="font-size:9px;font-family:var(--fm);color:${accent};text-transform:uppercase;letter-spacing:.12em">ryaview recommends</div>
          <div style="padding:2px 8px;background:${accent};border-radius:3px;font-size:8px;font-family:var(--fm);color:#0b0e14;font-weight:700">BEST OVERALL</div>
        </div>
        <div style="font-size:22px;font-weight:800;color:var(--head);letter-spacing:-.03em;margin-bottom:2px">${winner.brand} <span style="color:${accent}">${winner.m}</span></div>
        <div style="font-size:11px;color:var(--mid);margin-bottom:14px">${winner.cat} · ${winner.spl?winner.spl+'dB SPL':''} · ${winner.ip||''}</div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:24px">
          <div id="audio-winner-reasons" style="font-size:12px;color:var(--body);line-height:1.7">
            <div style="display:flex;align-items:center;gap:8px;color:var(--mid);font-size:11px">
              <svg style="animation:spin 1s linear infinite;width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              AI is analysing these audio products…
            </div>
          </div>
          <div style="min-width:200px;text-align:center">
            <div style="font-size:42px;font-weight:800;color:${accent};font-family:var(--fm);line-height:1">${winnerScore.total}</div>
            <div style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:.1em">/ 100 score</div>
            <div style="margin-top:12px">
              ${bars.map(b=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
                <div style="font-size:9px;color:var(--dim);width:80px;text-align:right">${b.label}</div>
                <div style="flex:1;background:rgba(255,255,255,0.04);border-radius:3px;height:5px">
                  <div style="width:${Math.round(b.val/b.max*100)}%;height:5px;background:${b.color};border-radius:3px"></div>
                </div>
                <div style="font-size:9px;color:var(--mid);width:28px">${b.val}/${b.max}</div>
              </div>`).join('')}
            </div>
          </div>
        </div>
        ${isAxis ? `
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(79,142,247,0.1)">
          <div style="font-size:9px;color:var(--blue2);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Why Axis Audio wins beyond the spec sheet</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${['AXIS Audio Manager Edge — no server needed','Native camera event triggers','AXIS OS — same hardened OS as cameras','SIP RFC 3261 compliant','5-year warranty','PoE — no separate power runs','Open API — integrates with BMS/VMS'].map(u=>
              `<div style="padding:4px 10px;background:rgba(79,142,247,0.07);border:1px solid rgba(79,142,247,0.18);border-radius:5px;font-size:9.5px;color:var(--blue2)">${u}</div>`
            ).join('')}
          </div>
        </div>` : ''}
      </div>`;
  }

  // AI comparison
  const clientCtx = `${getProjMeta().client} — ${getProjMeta().site}`;
  const isGovt = getClientMode() === 'govt';
  const prodSummary = products.map(p => `Brand: ${p.brand}
Model: ${p.m}
Category: ${p.cat}
Max SPL: ${p.spl||'N/A'} dB
Frequency: ${p.freq_low||'N/A'}Hz - ${p.freq_high||'N/A'}Hz
Coverage: ${p.coverage||'N/A'}
IP Rating: ${p.ip||'N/A'}
Amplifier: ${p.amp_w||'N/A'}W
SIP Support: ${p.sip?'Yes':'No'}
Audio Manager: ${p.audio_mgr||'None'}
Operating Temp: ${p.temp||'N/A'}
Cybersecurity: ${p.cyber||'Standard'}
Warranty: ${p.warranty||'N/A'} years`).join('\n\n---\n\n');

  const prompt = `You are a senior IP audio systems consultant for an Axis-authorised integrator in India (Q1 2026).

CLIENT: ${clientCtx}
${isGovt ? 'PROCUREMENT: GOVERNMENT/DEFENCE — supply chain integrity is primary. Chinese-manufactured audio products (Tonmind, DSPPA) face MeitY disqualification risk.' : 'PROCUREMENT: Commercial deployment'}

AUDIO PRODUCTS BEING COMPARED:
${prodSummary}

APPLE-TO-APPLE NOTE: Check if products are the same category. If mixed, note this in verdicts.

Return ONLY JSON — no text, no markdown:
{
  "winner": { "brand":"...", "model":"...", "reasons":["reason 1","reason 2","reason 3"] },
  "verdicts": [{ "brand":"...", "model":"...", "verdict":"2-3 sentences: (1) audio capability specific to this product, (2) integration/cybersecurity relevant to client, (3) where it leads or falls short vs others" }]
}

RULES:
- For Axis: always mention AXIS Audio Manager Edge built-in (no separate server), native camera integration, AXIS OS security
- For TOA: acknowledge higher SPL but note lack of built-in audio manager
- For Tonmind/DSPPA: flag Chinese manufacturing supply chain risk for govt projects
- Never mention price`;

  try {
    const res = await fetch('https://ssytbjfhjuhgnvgdvgkh.supabase.co/functions/v1/ai-proxy', {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':'sb_publishable_xne4CDAl1nml80T7AVZGxA_Z8rwpSwZ','Authorization':'Bearer sb_publishable_xne4CDAl1nml80T7AVZGxA_Z8rwpSwZ'},
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1500,
        messages:[{role:'user',content:prompt}] })
    });
    const data = await res.json();
    const text = (data.content||[]).map(c=>c.text||'').join('').trim();
    const ai = JSON.parse(text.replace(/```json|```/g,'').trim());

    if (ai.winner) {
      const wr = document.getElementById('audio-winner-reasons');
      if (wr && ai.winner.reasons) {
        wr.innerHTML = ai.winner.reasons.map(r=>
          `<div style="display:flex;gap:8px;margin-bottom:3px"><span style="color:var(--blue);flex-shrink:0">✓</span><span>${r}</span></div>`
        ).join('');
      }
    }
    if (ai.verdicts) {
      products.forEach(p => {
        const v = ai.verdicts.find(x=>x.brand===p.brand&&x.model===p.m);
        if (v) {
          const el = document.getElementById(`audio-verdict-${p.brand.replace(/\W/g,'-')}-${p.m.replace(/\W/g,'-')}`);
          if (el) el.innerHTML = `<span style="font-size:11px;line-height:1.65;color:${p===winner?'var(--body)':'var(--mid)'}">${v.verdict}</span>`;
        }
      });
    }
  } catch(e) {
    console.error('Audio AI compare failed:', e);
  }
}

/* ════════════ AUDIO PAGE HTML ════════════
   Inject this as the page-audio div content ──────────────────── */

const AUDIO_PAGE_HTML = `
<!-- Comparison mismatch banner -->
<div id="audio-cmp-mismatch" style="display:none;align-items:flex-start;gap:10px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.25);border-radius:8px;padding:11px 16px;margin-bottom:12px;font-size:12px;color:#fcd34d;line-height:1.6"></div>

<!-- Sub-tabs: BOQ | Compare -->
<div style="display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:20px">
  <button class="adm-tab on" id="audio-tab-boq" onclick="switchAudioTab('boq')">Audio BOQ</button>
  <button class="adm-tab" id="audio-tab-compare" onclick="switchAudioTab('compare')">Compare</button>
</div>

<!-- AUDIO BOQ TAB -->
<div id="audio-panel-boq">
  <div class="secrow" style="margin-bottom:14px">
    <div class="sec-lbl"><span class="step">1</span> Select Brand</div>
  </div>
  <div class="brandstrip" id="audio-boq-brands" style="margin-bottom:20px"></div>

  <div id="audio-boq-step2" style="display:none">
    <div class="secrow">
      <div class="sec-lbl"><span class="step">2</span> Audio BOQ <span class="brand-tag" id="audio-boq-brand-tag"></span></div>
      <div class="sec-right" style="display:flex;gap:8px">
        <button class="btn btn-ob btn-sm" onclick="openAudioAltModal()">↔ Alt BOQ</button>
        <button class="btn btn-ghost btn-sm" onclick="addAudioBoqRow()">+ Add Row</button>
      </div>
    </div>
    <div style="overflow-x:auto;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-top:10px">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="width:34px;padding:10px 14px;text-align:left;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">#</th>
          <th style="min-width:220px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Model</th>
          <th style="min-width:110px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Category</th>
          <th style="min-width:70px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1);text-align:center">SPL</th>
          <th style="min-width:70px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1);text-align:center">IP</th>
          <th style="min-width:110px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Unit Price</th>
          <th style="min-width:60px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Qty</th>
          <th style="min-width:110px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Total</th>
          <th style="width:30px;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--s1)"></th>
        </tr></thead>
        <tbody id="audio-boq-tbody"></tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 0">
      <div>
        <div class="gt-label">Audio Grand Total</div>
        <div class="gt-val" id="audio-boq-grand-total">\u20b9 0</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-og" onclick="exportAudioBoqPDF()">Export PDF</button>
        <button class="btn btn-og" onclick="exportAudioBoqExcel()">Export Excel</button>
      </div>
    </div>
  </div>
</div>

<!-- AUDIO COMPARE TAB -->
<div id="audio-panel-compare" style="display:none">
  <div class="notice" style="margin-top:0;margin-bottom:16px">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M1 6s1-1 4-1 5 2 8 2 4-1 4-1V22s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="1" y1="6" x2="1" y2="22"/></svg>
    Select up to 5 audio products across brands — hit Compare to generate matrix. Compare same-category products for a fair evaluation.
  </div>
  <div class="cmpgrid" id="audio-cmp-cards">
    ${[1,2,3,4,5].map(i=>`
    <div class="csc">
      <div class="cnum">${i}</div>
      <div class="csc-lbl">Product ${i}</div>
      <div class="fl">Brand</div>
      <select class="csel" id="ab${i}" onchange="loadAudioModels(${i})">
        <option value="">— brand —</option>
      </select>
      <div class="fl">Model</div>
      <select class="csel" id="am${i}" ${i===1 ? 'onchange="onAudioSlot1ModelChange()"' : ''}><option value="">— model —</option></select>
    </div>`).join('')}
  </div>
  <div style="display:flex;justify-content:center;margin:16px 0">
    <button class="btn btn-og" onclick="runAudioCompare()">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      Compare Audio Products
    </button>
  </div>
  <div id="audio-winner-card" style="display:none;margin-bottom:20px"></div>
  <div id="audio-cmp-matrix" style="display:none"></div>
</div>

<!-- AUDIO ALT BOQ MODAL -->
<div class="modal-overlay" id="audio-alt-modal" onclick="if(event.target===this)closeAudioAltModal()">
  <div class="modal-box">
    <div class="modal-hdr">
      <div class="modal-title">↔ Alternative Audio BOQ <span class="alt-badge">ALTERNATIVE</span></div>
      <button class="modal-close" onclick="closeAudioAltModal()">\u00d7</button>
    </div>
    <div class="modal-body">
      <div style="margin-bottom:16px">
        <div class="sec-lbl" style="margin-bottom:10px"><span class="step">1</span> Select Alternative Brand</div>
        <div class="brandstrip" id="audio-alt-brands"></div>
      </div>
      <div id="audio-alt-step2" style="display:none">
        <div class="secrow" style="margin-top:0">
          <div class="sec-lbl"><span class="step">2</span> Alternative Audio BOQ <span class="brand-tag" id="audio-alt-brand-tag"></span></div>
          <div class="sec-right" style="display:flex;gap:8px">
            <button class="btn btn-og btn-sm" id="audio-alt-ai-btn" onclick="suggestAudioAltEquivalents()">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              AI Suggest Equivalents
            </button>
            <button class="btn btn-ghost btn-sm" onclick="addAudioAltRow()">+ Add Row</button>
          </div>
        </div>
        <div style="overflow-x:auto;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-top:10px">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>
              <th style="width:34px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">#</th>
              <th style="min-width:220px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Model</th>
              <th style="min-width:110px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Category</th>
              <th style="min-width:70px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1);text-align:center">SPL</th>
              <th style="min-width:70px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1);text-align:center">IP</th>
              <th style="min-width:110px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Unit Price</th>
              <th style="min-width:60px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Qty</th>
              <th style="min-width:110px;padding:10px 14px;font-size:9px;font-family:var(--fm);color:var(--dim);border-bottom:1px solid var(--line);background:var(--s1)">Total</th>
              <th style="width:30px;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--s1)"></th>
            </tr></thead>
            <tbody id="audio-alt-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <div>
        <div class="gt-label">Alt Audio Total</div>
        <div class="gt-val" id="audio-alt-grand-total">\u20b9 0</div>
      </div>
      <div class="fbtns">
        <button class="btn btn-og" onclick="exportAudioAltPDF()">Export PDF</button>
        <button class="btn btn-ghost" onclick="closeAudioAltModal()">Close</button>
      </div>
    </div>
  </div>
</div>`;

/* ── AUDIO SUB-TAB SWITCH ── */
function switchAudioTab(tab) {
  ['boq','compare'].forEach(t => {
    document.getElementById('audio-panel-'+t).style.display = t===tab ? '' : 'none';
    document.getElementById('audio-tab-'+t).classList.toggle('on', t===tab);
  });
  if (tab === 'boq') renderAudioBrandStrip();
  if (tab === 'compare') populateAudioCompareBrands();
}

/* ── POPULATE AUDIO COMPARE BRAND DROPDOWNS (dynamic from DB) ── */
function populateAudioCompareBrands() {
  const brands = Object.keys(AUDIO_DB);
  if (!brands.length) return;
  for (let i = 1; i <= 5; i++) {
    const sel = document.getElementById('ab'+i);
    if (!sel) continue;
    const currentVal = sel.value;  // preserve existing selection
    sel.innerHTML = '<option value="">\u2014 brand \u2014</option>';
    brands.forEach(b => {
      const o = document.createElement('option');
      o.value = b; o.textContent = b;
      sel.appendChild(o);
    });
    if (currentVal) sel.value = currentVal;  // restore selection
  }
}

/* ── WHEN SLOT 1 MODEL CHANGES, RE-MATCH ALL OTHER SLOTS ── */
function onAudioSlot1ModelChange() {
  for (let s = 2; s <= 5; s++) {
    const bsel = document.getElementById('ab'+s);
    if (bsel && bsel.value) loadAudioModels(s);
  }
}

/* ── LOAD AUDIO MODELS INTO COMPARE DROPDOWNS — auto-match slots 2-5 ── */
function loadAudioModels(slot) {
  const brand = document.getElementById('ab'+slot)?.value;
  const sel   = document.getElementById('am'+slot);
  if (!sel) return;
  sel.innerHTML = '<option value="">\u2014 select model \u2014</option>';
  if (!brand) return;
  const grouped = {};
  const seen = new Set();
  (AUDIO_DB[brand]||[]).forEach(p => {
    if (seen.has(p.m)) return;
    seen.add(p.m);
    if (!grouped[p.cat]) grouped[p.cat] = [];
    grouped[p.cat].push(p);
  });
  Object.entries(grouped).forEach(([cat,prods]) => {
    const og = document.createElement('optgroup');
    og.label = cat;
    prods.forEach(p => {
      const o = document.createElement('option');
      o.value = `${p.m}|${p.cat}`;
      o.textContent = `${p.m}${p.spl?' \u2014 '+p.spl+'dB':''}`;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });

  // Slot 1 — just pick first model, then re-match others
  if (slot === 1) {
    sel.selectedIndex = 1;
    for (let s = 2; s <= 5; s++) {
      const bsel = document.getElementById('ab'+s);
      if (bsel && bsel.value) loadAudioModels(s);
    }
    return;
  }

  // Slots 2-5 — auto-match against slot 1's selection
  const ref = document.getElementById('am1')?.value;
  if (ref) {
    const [refModel, refCat] = ref.split('|');
    const slot1Brand = document.getElementById('ab1')?.value;
    const refProduct = (AUDIO_DB[slot1Brand] || []).find(p => p.m === refModel);
    const refSpl = refProduct?.spl || 90;
    const match = findBestAudioMatch(brand, refCat, refSpl);
    if (match) {
      const optVal = `${match.m}|${match.cat}`;
      const opt = Array.from(sel.options).find(o => o.value === optVal);
      if (opt) { sel.value = opt.value; return; }
    }
  }
  // Fallback — pick first model
  sel.selectedIndex = 1;
}

/* ── INIT AUDIO PAGE ── */
let _audioPageInited = false;
async function initAudioPage() {
  const el = document.getElementById('page-audio');
  if (!el) return;
  // Only render HTML the first time — subsequent tab switches preserve BOQ data
  if (!_audioPageInited) {
    el.innerHTML = AUDIO_PAGE_HTML;
    _audioPageInited = true;
  }
  if (!AUDIO_DB || Object.keys(AUDIO_DB).length === 0) {
    await loadAudioDB();
    renderAudioBrandStrip();
  }
  switchAudioTab('boq');
}

/* ── AUDIO BOQ EXCEL EXPORT ── */
function exportAudioBoqExcel() {
  if (!validateProjMeta()) return;
  const filled = audioBoqRows.filter(r=>r.price>0);
  if (!filled.length) { showToast('Add at least one product to the Audio BOQ first.'); return; }
  const meta = getProjMeta();
  const wb = XLSX.utils.book_new();
  const grandTotal = filled.reduce((s,r)=>s+r.price*r.qty,0);
  const dateStr = new Date(meta.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  const data = [
    ['ryaview.ai \u2014 Camera Intelligence Platform'],
    ['AUDIO BILL OF QUANTITIES'],
    [],
    ['Brand:', audioBoqBrand, '', 'Client:', meta.client],
    ['Prepared By:', meta.by, '', 'Date:', dateStr],
    ['Project:', meta.site],
    [],
    ['#','Model','Category','SPL (dB)','IP Rating','Unit Price (INR)','Qty','Total (INR)'],
    ...filled.map((r,i)=>[i+1,r.model,r.cat,r.spl||'N/A',r.ip||'N/A',r.price,r.qty,r.price*r.qty]),
    [],
    ['','','','','','Grand Total','',grandTotal],
    [],
    ['\u26a0 All prices indicative only \u2014 exclusive of GST, duties, freight and installation.'],
    ['Verify with authorised distributor before formal quotation.']
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:4},{wch:28},{wch:18},{wch:10},{wch:10},{wch:18},{wch:6},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws, 'Audio BOQ');
  XLSX.writeFile(wb, 'ryaview_AudioBOQ_'+audioBoqBrand+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

/* ── AUDIO ALT BOQ EXCEL EXPORT ── */
function exportAudioAltExcel() {
  if (!validateProjMeta()) return;
  const filled = audioAltRows.filter(r=>r.price>0);
  if (!filled.length) { showToast('Add at least one product first.'); return; }
  const meta = getProjMeta();
  const wb = XLSX.utils.book_new();
  const grandTotal = filled.reduce((s,r)=>s+r.price*r.qty,0);
  const dateStr = new Date(meta.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  const data = [
    ['ryaview.ai \u2014 Camera Intelligence Platform'],
    ['ALTERNATIVE AUDIO BILL OF QUANTITIES'],
    [],
    ['Alt Brand:', audioAltBrand, '', 'Main Brand:', audioBoqBrand],
    ['Client:', meta.client, '', 'Date:', dateStr],
    [],
    ['#','Model','Category','SPL (dB)','IP Rating','Unit Price (INR)','Qty','Total (INR)'],
    ...filled.map((r,i)=>[i+1,r.model,r.cat,r.spl||'N/A',r.ip||'N/A',r.price,r.qty,r.price*r.qty]),
    [],
    ['','','','','','Grand Total','',grandTotal]
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:4},{wch:28},{wch:18},{wch:10},{wch:10},{wch:18},{wch:6},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws, 'Alt Audio BOQ');
  XLSX.writeFile(wb, 'ryaview_AltAudioBOQ_'+audioAltBrand+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

/* ── AUDIO PDF EXPORTS ── (reuse boqPDFDoc with isAudio flag) ──
   These call boqPDFDoc which handles both camera and audio BOQs.
   Pass a converted rows array with standard price/qty/model/type/res fields. */

function exportAudioBoqPDF() {
  if (!validateProjMeta()) return;
  const filled = audioBoqRows.filter(r=>r.price>0);
  if (!filled.length) { alert('Add at least one product to the Audio BOQ first.'); return; }
  const meta = getProjMeta();
  // Convert to boqPDFDoc-compatible format
  const pdfRows = filled.map(r=>({ model:r.model, type:r.cat, res:r.spl?r.spl+'dB':'', price:r.price, qty:r.qty, customPrice:null }));
  const { doc, dateStr } = boqPDFDoc(audioBoqBrand, pdfRows, meta, false, true);
  logUsage('audio_boq_export', audioBoqBrand);
  doc.save('ryaview_AudioBOQ_'+audioBoqBrand+'_'+dateStr.replace(/ /g,'_')+'.pdf');
}

function exportAudioAltPDF() {
  if (!validateProjMeta()) return;
  const filled = audioAltRows.filter(r=>r.price>0);
  if (!filled.length) { alert('Add at least one product first.'); return; }
  const meta = getProjMeta();
  const pdfRows = filled.map(r=>({ model:r.model, type:r.cat, res:r.spl?r.spl+'dB':'', price:r.price, qty:r.qty, customPrice:null }));
  const { doc, dateStr } = boqPDFDoc(audioAltBrand, pdfRows, meta, true, true);
  doc.save('ryaview_AltAudioBOQ_'+audioAltBrand+'_'+dateStr.replace(/ /g,'_')+'.pdf');
}
