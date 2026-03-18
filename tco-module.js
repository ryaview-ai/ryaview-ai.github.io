/* ════════════════════════════════════════════════════════════════
   ryaview.ai — TCO CALCULATOR MODULE
   Covers: Camera BOQ + Audio BOQ (both in one calculation)
   Standalone block — inject into ryaview-final.html when ready
   ════════════════════════════════════════════════════════════════ */

/* ── STATE ELECTRICITY RATES (₹/unit, commercial tariff) ── */
const ELEC_RATES = {
  'Telangana':          7.50,
  'Andhra Pradesh':     8.00,
  'Maharashtra':        11.50,
  'Delhi':              9.00,
  'Karnataka':          8.50,
  'Tamil Nadu':         8.00,
  'Gujarat':            8.50,
  'West Bengal':        8.50,
  'Rajasthan':          7.50,
  'Punjab':             7.00,
  'Haryana':            7.00,
  'Uttar Pradesh':      7.00,
  'Kerala':             7.50,
  'Madhya Pradesh':     7.50,
  'Odisha':             6.50,
  'Jharkhand':          7.00,
  'Bihar':              7.00,
  'Himachal Pradesh':   5.50,
  'Uttarakhand':        6.50,
  'Chhattisgarh':       6.50,
  'Assam':              7.50,
  'Goa':                5.00,
  'Other':              8.00
};

/* ── STORAGE RATES ── */
const STORAGE_COST_PER_TB = 3000;        // ₹ per TB (enterprise NAS)
const ZIPSTREAM_GB_PER_CAM_PER_DAY = 40; // Axis Zipstream H.265
const STANDARD_GB_PER_CAM_PER_DAY  = 80; // Standard H.265

/* ── POE POWER DRAW DEFAULTS BY BRAND (watts per camera) ── */
const BRAND_WATTS = {
  'Axis':       5.5,
  'Bosch':      6.0,
  'Hikvision':  6.0,
  'Hanwha':     6.5,
  'i-PRO':      6.0,
  'Honeywell':  6.5,
  'Pelco':      7.0,
  'CP Plus':    5.5,
  'Matrix':     5.5,
  'Sparsh':     5.5,
  // Audio brands
  'TOA':        7.0,
  'Commend':    8.0,
  'Tonmind':    6.0,
  'Algo':       7.0,
  'DSPPA':      6.0,
  'Atlas IED':  8.0,
  'Ahuja':      5.0
};

/* ── AUDIO STORAGE (no video storage — just power for audio) ── */
// Audio devices don't generate video — storage cost = 0
// Power draw handled same as cameras via BRAND_WATTS

/* ── TCO CALCULATION ENGINE ── */
function calcTCO(rows, brand, retentionDays, hoursPerDay, elecRate, isAudio) {
  if (!rows || !rows.length) return null;

  const filled       = rows.filter(r => (r.customPrice != null ? r.customPrice : r.price) > 0);
  if (!filled.length) return null;

  const ep           = r => r.customPrice != null ? r.customPrice : r.price;
  const totalUnits   = filled.reduce((s, r) => s + r.qty, 0);
  const hardwareCost = filled.reduce((s, r) => s + ep(r) * r.qty, 0);

  // Storage cost (cameras only — audio has no video storage)
  let storageCost = 0;
  if (!isAudio) {
    const gbPerDay    = brand === 'Axis' ? ZIPSTREAM_GB_PER_CAM_PER_DAY : STANDARD_GB_PER_CAM_PER_DAY;
    const totalGB     = gbPerDay * totalUnits * retentionDays;
    const totalTB     = totalGB / 1024;
    storageCost       = totalTB * STORAGE_COST_PER_TB;
  }

  // Power cost — 5 years
  const wattsPerUnit = BRAND_WATTS[brand] || 6.0;
  const kwhPerYear   = (wattsPerUnit * totalUnits * hoursPerDay * 365) / 1000;
  const powerCost5yr = kwhPerYear * elecRate * 5;

  const total5yr = hardwareCost + storageCost + powerCost5yr;

  return {
    brand,
    isAudio,
    totalUnits,
    hardwareCost,
    storageCost,
    powerCost5yr,
    total5yr,
    perUnitPerYear: total5yr / (totalUnits * 5),
    retentionDays,
    hoursPerDay,
    elecRate,
    gbPerCamPerDay: isAudio ? 0 : (brand === 'Axis' ? ZIPSTREAM_GB_PER_CAM_PER_DAY : STANDARD_GB_PER_CAM_PER_DAY),
    totalStorageTB: isAudio ? 0 : ((brand === 'Axis' ? ZIPSTREAM_GB_PER_CAM_PER_DAY : STANDARD_GB_PER_CAM_PER_DAY) * totalUnits * retentionDays / 1024)
  };
}

/* ── COMPETITOR BOQ BUILDER ── */
// Builds a shadow BOQ for competitor using same qty/type/res as main BOQ
// Matches by type + resolution from the database
function buildCompetitorRows(sourceRows, competitorBrand) {
  const compDB = BOQ_DB[competitorBrand];
  if (!compDB || !compDB.length) return [];

  return sourceRows
    .filter(r => r.price > 0)
    .map(r => {
      // Find best match in competitor catalogue — same type + resolution
      const typeMatch = compDB.filter(c =>
        c.t.toLowerCase() === (r.type || '').toLowerCase() &&
        c.r === r.res
      );
      const match = typeMatch.length
        ? typeMatch[0]
        : compDB.find(c => c.t.toLowerCase() === (r.type || '').toLowerCase())
          || compDB[0];

      return match
        ? { model: match.m, type: match.t, res: match.r, price: match.p, qty: r.qty, customPrice: null }
        : null;
    })
    .filter(Boolean);
}

/* ── RENDER TCO PAGE ── */
function renderTCOPage() {
  const el = document.getElementById('page-tco');
  if (!el) return;

  // Check if any BOQ data exists
  const camRows   = (boqRows   || []).filter(r => r.price > 0);
  const audioRows = (window.audioBoqRows || []).filter(r => r.price > 0);
  const hasCam    = camRows.length > 0;
  const hasAudio  = audioRows.length > 0;

  if (!hasCam && !hasAudio) {
    el.innerHTML = `
      <div class="notice" style="margin-top:0">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Build a Camera BOQ or Audio BOQ first — TCO will calculate automatically from your BOQ.
      </div>`;
    return;
  }

  // Get current settings
  const state        = document.getElementById('tco-state')?.value        || 'Telangana';
  const elecRate     = parseFloat(document.getElementById('tco-elec')?.value   || ELEC_RATES[state] || 7.50);
  const retention    = parseInt(document.getElementById('tco-retention')?.value || 30);
  const hoursPerDay  = parseInt(document.getElementById('tco-hours')?.value     || 24);
  const competitor   = document.getElementById('tco-competitor')?.value         || '';

  // Build all TCO objects
  const results = [];

  if (hasCam && boqBrand) {
    const mainCamTCO = calcTCO(camRows, boqBrand, retention, hoursPerDay, elecRate, false);
    if (mainCamTCO) results.push({ label: boqBrand + ' (Camera)', tco: mainCamTCO, isPrimary: true });

    if (competitor && competitor !== boqBrand) {
      const compRows = buildCompetitorRows(camRows, competitor);
      if (compRows.length) {
        const compTCO = calcTCO(compRows, competitor, retention, hoursPerDay, elecRate, false);
        if (compTCO) results.push({ label: competitor + ' (Camera)', tco: compTCO, isPrimary: false });
      }
    }
  }

  if (hasAudio && window.audioBoqBrand) {
    const mainAudioTCO = calcTCO(audioRows, window.audioBoqBrand, retention, hoursPerDay, elecRate, true);
    if (mainAudioTCO) results.push({ label: window.audioBoqBrand + ' (Audio)', tco: mainAudioTCO, isPrimary: true });

    if (competitor && competitor !== window.audioBoqBrand) {
      const compAudioRows = buildCompetitorRows(audioRows, competitor);
      if (compAudioRows.length) {
        const compAudioTCO = calcTCO(compAudioRows, competitor, retention, hoursPerDay, elecRate, true);
        if (compAudioTCO) results.push({ label: competitor + ' (Audio)', tco: compAudioTCO, isPrimary: false });
      }
    }
  }

  // Combined totals
  const primaryTotal   = results.filter(r => r.isPrimary).reduce((s, r) => s + r.tco.total5yr, 0);
  const competitorTotal= results.filter(r => !r.isPrimary).reduce((s, r) => s + r.tco.total5yr, 0);
  const hasBoth        = primaryTotal > 0 && competitorTotal > 0;
  const primaryWins    = primaryTotal <= competitorTotal;

  // Competitor options — all brands in DB excluding current primary brands
  const allBrands = Object.keys(BOQ_DB || {});
  const primaryBrands = [boqBrand, window.audioBoqBrand].filter(Boolean);
  const compOptions = allBrands.filter(b => !primaryBrands.includes(b));

  el.innerHTML = `
    <div style="max-width:1000px">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--head);letter-spacing:-.02em">Total Cost of Ownership</div>
          <div style="font-size:12px;color:var(--mid);margin-top:3px">5-year analysis · Hardware + Storage + Power · AMC excluded</div>
        </div>
        <button class="btn btn-og btn-sm" onclick="exportTCOPDF()" style="gap:6px">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Export TCO Report
        </button>
      </div>

      <!-- Settings Panel -->
      <div style="background:var(--s1);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:var(--mid);text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">Assumptions</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px">

          <div>
            <div style="font-size:11px;color:var(--mid);margin-bottom:5px">Project State</div>
            <select id="tco-state" onchange="onTCOStateChange()" style="width:100%;background:var(--s2);border:1px solid var(--line);color:var(--body);padding:7px 10px;border-radius:7px;font-size:12px;font-family:var(--f)">
              ${Object.keys(ELEC_RATES).map(s => `<option value="${s}" ${s === state ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>

          <div>
            <div style="font-size:11px;color:var(--mid);margin-bottom:5px">Electricity Rate (₹/unit)</div>
            <input id="tco-elec" type="number" value="${elecRate}" step="0.5" min="1" max="20"
              onchange="recalcTCO()"
              style="width:100%;background:var(--s2);border:1px solid var(--line);color:var(--body);padding:7px 10px;border-radius:7px;font-size:12px;font-family:var(--f)">
          </div>

          <div>
            <div style="font-size:11px;color:var(--mid);margin-bottom:5px">Retention Period (days)</div>
            <input id="tco-retention" type="number" value="${retention}" step="1" min="1" max="365"
              onchange="recalcTCO()"
              style="width:100%;background:var(--s2);border:1px solid var(--line);color:var(--body);padding:7px 10px;border-radius:7px;font-size:12px;font-family:var(--f)">
            <div style="font-size:10px;color:var(--dim);margin-top:3px">How many days of video to store</div>
          </div>

          <div>
            <div style="font-size:11px;color:var(--mid);margin-bottom:5px">Recording Hours/Day</div>
            <input id="tco-hours" type="number" value="${hoursPerDay}" step="1" min="1" max="24"
              onchange="recalcTCO()"
              style="width:100%;background:var(--s2);border:1px solid var(--line);color:var(--body);padding:7px 10px;border-radius:7px;font-size:12px;font-family:var(--f)">
          </div>

          <div>
            <div style="font-size:11px;color:var(--mid);margin-bottom:5px">Compare Against</div>
            <select id="tco-competitor" onchange="recalcTCO()"
              style="width:100%;background:var(--s2);border:1px solid var(--line);color:var(--body);padding:7px 10px;border-radius:7px;font-size:12px;font-family:var(--f)">
              <option value="">— select competitor —</option>
              ${compOptions.map(b => `<option value="${b}" ${b === competitor ? 'selected' : ''}>${b}</option>`).join('')}
            </select>
          </div>

        </div>
      </div>

      <!-- Summary Cards -->
      ${hasBoth ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
        <div style="background:rgba(79,142,247,0.06);border:1px solid rgba(79,142,247,0.2);border-radius:12px;padding:18px;text-align:center">
          <div style="font-size:11px;color:var(--blue2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${primaryBrands.join(' + ')} — 5-Year Total</div>
          <div style="font-size:28px;font-weight:800;color:var(--blue);font-family:var(--fm)">${inrFull(primaryTotal)}</div>
          ${primaryWins ? '<div style="font-size:11px;color:var(--money);margin-top:4px">✓ Lower 5-year cost</div>' : ''}
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:12px;padding:18px;text-align:center">
          <div style="font-size:11px;color:var(--mid);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${competitor} — 5-Year Total</div>
          <div style="font-size:28px;font-weight:800;color:var(--head);font-family:var(--fm)">${inrFull(competitorTotal)}</div>
          ${!primaryWins ? '<div style="font-size:11px;color:var(--money);margin-top:4px">✓ Lower 5-year cost</div>' : ''}
        </div>
      </div>

      <!-- Gap Banner -->
      <div style="background:${primaryWins ? 'rgba(0,200,83,0.06)' : 'rgba(251,191,36,0.06)'};border:1px solid ${primaryWins ? 'rgba(0,200,83,0.2)' : 'rgba(251,191,36,0.2)'};border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:var(--body);line-height:1.6">
        ${primaryWins
          ? `<b style="color:var(--money)">✓ ${primaryBrands.join(' + ')} has a lower 5-year TCO</b> — saves ${inrFull(competitorTotal - primaryTotal)} vs ${competitor} over 5 years. The Zipstream storage saving${hasCam ? ' alone' : ''} accounts for a significant portion of this advantage.`
          : `<b style="color:#fbbf24">⚠ ${competitor} has a lower 5-year TCO</b> — ${inrFull(primaryTotal - competitorTotal)} more expensive over 5 years. However, this does not account for ${competitor.includes('Hikvision') || competitor.includes('CP Plus') || competitor.includes('Dahua') ? 'MeitY/NDAA supply chain disqualification risk for government and PSU projects, ' : ''}warranty difference, product lifecycle, or cybersecurity architecture.`
        }
      </div>` : ''}

      <!-- Detailed Breakdown Table -->
      <div style="background:var(--s1);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:20px">
        <div style="padding:14px 18px;border-bottom:1px solid var(--line)">
          <span style="font-size:13px;font-weight:600;color:var(--head)">5-Year Cost Breakdown</span>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:var(--s2)">
                <th style="padding:10px 16px;text-align:left;color:var(--mid);font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;white-space:nowrap">Cost Component</th>
                ${results.map(r => `
                  <th style="padding:10px 16px;text-align:right;color:${r.isPrimary ? 'var(--blue)' : 'var(--mid)'};font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;white-space:nowrap">
                    ${r.label}
                  </th>`).join('')}
              </tr>
            </thead>
            <tbody>
              <tr style="border-top:1px solid rgba(255,255,255,0.04)">
                <td style="padding:10px 16px;color:var(--body)">Hardware (purchase)</td>
                ${results.map(r => `<td style="padding:10px 16px;text-align:right;font-family:var(--fm);color:var(--head)">${inrFull(r.tco.hardwareCost)}</td>`).join('')}
              </tr>
              <tr style="border-top:1px solid rgba(255,255,255,0.04);background:rgba(255,255,255,0.01)">
                <td style="padding:10px 16px;color:var(--body)">
                  Storage (${retention}-day retention)
                  ${results.some(r => !r.tco.isAudio) ? `<div style="font-size:10px;color:var(--dim)">
                    ${results.filter(r=>r.isPrimary&&!r.tco.isAudio).map(r=>`${r.tco.totalStorageTB.toFixed(0)} TB @ ₹${STORAGE_COST_PER_TB}/TB`).join(' · ')}
                  </div>` : '<div style="font-size:10px;color:var(--dim)">Audio devices — no video storage</div>'}
                </td>
                ${results.map(r => `<td style="padding:10px 16px;text-align:right;font-family:var(--fm);color:${r.tco.isAudio ? 'var(--dim)' : 'var(--head)'}">
                  ${r.tco.isAudio ? '—' : inrFull(r.tco.storageCost)}
                  ${!r.tco.isAudio ? `<div style="font-size:10px;color:var(--dim)">${r.tco.gbPerCamPerDay}GB/cam/day</div>` : ''}
                </td>`).join('')}
              </tr>
              <tr style="border-top:1px solid rgba(255,255,255,0.04)">
                <td style="padding:10px 16px;color:var(--body)">
                  Power (5 years, ₹${elecRate}/unit)
                  <div style="font-size:10px;color:var(--dim)">${hoursPerDay}hr/day · ${BRAND_WATTS[boqBrand] || 6}W/unit avg</div>
                </td>
                ${results.map(r => `<td style="padding:10px 16px;text-align:right;font-family:var(--fm);color:var(--head)">
                  ${inrFull(r.tco.powerCost5yr)}
                  <div style="font-size:10px;color:var(--dim)">${(BRAND_WATTS[r.tco.brand]||6)}W/unit</div>
                </td>`).join('')}
              </tr>
              <tr style="border-top:2px solid var(--line);background:var(--s2)">
                <td style="padding:12px 16px;font-weight:700;color:var(--head)">5-Year Total</td>
                ${results.map(r => `<td style="padding:12px 16px;text-align:right;font-family:var(--fm);font-weight:700;font-size:14px;color:${r.isPrimary ? 'var(--money)' : 'var(--head)'}">
                  ${inrFull(r.tco.total5yr)}
                </td>`).join('')}
              </tr>
              <tr style="border-top:1px solid rgba(255,255,255,0.04)">
                <td style="padding:10px 16px;color:var(--dim);font-size:11px">Per unit per year</td>
                ${results.map(r => `<td style="padding:10px 16px;text-align:right;font-family:var(--fm);color:var(--dim);font-size:11px">
                  ₹${Math.round(r.tco.perUnitPerYear).toLocaleString('en-IN')}
                </td>`).join('')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tipping Point (only when camera BOQ exists and competitor is selected) -->
      ${hasCam && competitor && boqBrand === 'Axis' ? renderTippingPoint(camRows, competitor, hoursPerDay, elecRate) : ''}

      <!-- Assumptions Footer -->
      <div style="font-size:11px;color:var(--dim);line-height:1.8;padding:12px 16px;background:var(--s1);border-radius:8px;border:1px solid var(--line)">
        <b style="color:var(--mid)">Assumptions:</b>
        Axis Zipstream = ${ZIPSTREAM_GB_PER_CAM_PER_DAY}GB/camera/day · Standard H.265 = ${STANDARD_GB_PER_CAM_PER_DAY}GB/camera/day ·
        Storage hardware ₹${STORAGE_COST_PER_TB.toLocaleString('en-IN')}/TB · ${state} electricity ₹${elecRate}/kWh ·
        ${retention}-day retention · ${hoursPerDay}hr/day recording · AMC not included (Axis 5-year warranty = ₹0 AMC for 5 years) ·
        Audio devices: power cost only (no video storage)
      </div>

    </div>`;
}

/* ── TIPPING POINT CALCULATOR ── */
function renderTippingPoint(camRows, competitor, hoursPerDay, elecRate) {
  const compRows = buildCompetitorRows(camRows, competitor);
  if (!compRows.length) return '';

  // Find retention day where Axis breaks even with competitor
  let tippingDay = null;
  for (let d = 1; d <= 365; d++) {
    const axisTCO = calcTCO(camRows, 'Axis', d, hoursPerDay, elecRate, false);
    const compTCO = calcTCO(compRows, competitor, d, hoursPerDay, elecRate, false);
    if (axisTCO && compTCO && axisTCO.total5yr <= compTCO.total5yr) {
      tippingDay = d;
      break;
    }
  }

  if (!tippingDay) return '';

  return `
    <div style="background:rgba(79,142,247,0.05);border:1px solid rgba(79,142,247,0.18);border-radius:10px;padding:14px 18px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:600;color:var(--blue);margin-bottom:6px">TCO Tipping Point — Axis vs ${competitor}</div>
      <div style="font-size:13px;color:var(--body);line-height:1.6">
        At <b style="color:var(--blue)">${tippingDay} days retention</b> or more, Axis has a lower 5-year TCO than ${competitor}.
        ${tippingDay <= 30 ? 'Even on a standard 30-day retention project, Axis is already cheaper over 5 years.' :
          tippingDay <= 90 ? 'Most enterprise and commercial projects require 60-90 day retention — Axis wins on TCO for these projects.' :
          `Projects requiring more than ${tippingDay} days retention give Axis a clear TCO advantage.`}
      </div>
    </div>`;
}

/* ── EVENT HANDLERS ── */
function onTCOStateChange() {
  const state    = document.getElementById('tco-state')?.value;
  const elecEl   = document.getElementById('tco-elec');
  if (elecEl && state && ELEC_RATES[state]) {
    elecEl.value = ELEC_RATES[state];
  }
  recalcTCO();
}

function recalcTCO() {
  renderTCOPage();
}

/* ── TCO PDF EXPORT ── */
function exportTCOPDF() {
  const { jsPDF } = window.jspdf;
  const doc       = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, ML = 14, MR = 14, CW = PW - ML - MR;

  const bg = (r,g,b) => doc.setFillColor(r,g,b);
  const fg = (r,g,b) => doc.setTextColor(r,g,b);

  // Page bg
  bg(13,17,23); doc.rect(0,0,PW,PH,'F');
  bg(79,142,247); doc.rect(0,0,PW,1.2,'F');

  // Logo
  bg(20,30,52); doc.roundedRect(11,5,15,15,2,2,'F');
  bg(232,168,32); doc.roundedRect(12.5,7,11,2.2,1,1,'F');
  fg(220,232,244); doc.setFontSize(11); doc.setFont('helvetica','bolditalic');
  doc.text('a',19,16.5,{align:'center'});
  bg(50,70,100); doc.rect(28,6,0.4,13,'F');
  fg(237,244,252); doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text('ryaview',31,16);
  const rww = doc.getTextWidth('ryaview');
  bg(232,168,32); doc.roundedRect(31+rww,8,doc.getTextWidth('.ai')+2,2.2,0.8,0.8,'F');
  fg(232,168,32); doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text('.ai',31+rww,16);
  fg(107,133,168); doc.setFontSize(6.5); doc.setFont('helvetica','normal');
  doc.text('CAMERA INTELLIGENCE  -  INTERNAL',31,20.5);

  // Title
  let Y = 30;
  fg(220,232,244); doc.setFontSize(15); doc.setFont('helvetica','bold');
  doc.text('Total Cost of Ownership Report',ML,Y);
  Y += 7;
  fg(107,133,168); doc.setFontSize(8); doc.setFont('helvetica','normal');

  const state     = document.getElementById('tco-state')?.value        || 'Telangana';
  const elecRate  = parseFloat(document.getElementById('tco-elec')?.value   || 7.5);
  const retention = parseInt(document.getElementById('tco-retention')?.value || 30);
  const hoursDay  = parseInt(document.getElementById('tco-hours')?.value     || 24);
  const competitor= document.getElementById('tco-competitor')?.value         || '';
  const meta      = getProjMeta();
  const dateStr   = new Date(meta.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});

  doc.text(`${state} - Rs.${elecRate}/unit  |  ${retention}-day retention  |  ${hoursDay}hr/day  |  ${dateStr}`,ML,Y);
  Y += 10;

  // Project meta box
  bg(17,21,32); doc.roundedRect(ML,Y,CW,22,2,2,'F');
  doc.setDrawColor(31,45,69); doc.setLineWidth(0.3);
  doc.roundedRect(ML,Y,CW,22,2,2,'S');
  fg(107,133,168); doc.setFontSize(6.5);
  doc.text('CLIENT',ML+5,Y+6);
  doc.text('PROJECT / SITE',ML+65,Y+6);
  doc.text('PREPARED BY',ML+130,Y+6);
  fg(220,232,244); doc.setFontSize(8.5); doc.setFont('helvetica','bold');
  doc.text(meta.client||'-',ML+5,Y+13,{maxWidth:55});
  doc.text(meta.site  ||'-',ML+65,Y+13,{maxWidth:60});
  doc.text(meta.by    ||'-',ML+130,Y+13,{maxWidth:55});
  fg(144,174,206); doc.setFontSize(7.5); doc.setFont('helvetica','normal');
  doc.text(dateStr,ML+130,Y+19);
  Y += 28;

  // Build TCO data for table
  const camRows   = (boqRows   ||[]).filter(r=>r.price>0);
  const audioRows = (window.audioBoqRows||[]).filter(r=>r.price>0);

  const tcoCols = [];
  if (camRows.length && boqBrand) {
    tcoCols.push({ label: boqBrand+' Camera', tco: calcTCO(camRows,boqBrand,retention,hoursDay,elecRate,false), primary: true });
    if (competitor) {
      const cr = buildCompetitorRows(camRows, competitor);
      if (cr.length) tcoCols.push({ label: competitor+' Camera', tco: calcTCO(cr,competitor,retention,hoursDay,elecRate,false), primary: false });
    }
  }
  if (audioRows.length && window.audioBoqBrand) {
    tcoCols.push({ label: window.audioBoqBrand+' Audio', tco: calcTCO(audioRows,window.audioBoqBrand,retention,hoursDay,elecRate,true), primary: true });
  }

  if (!tcoCols.length) {
    fg(107,133,168); doc.setFontSize(10);
    doc.text('No BOQ data available.',ML,Y);
  } else {
    const rows = [
      ['Hardware (purchase)'].concat(tcoCols.map(c=>pdfInr(c.tco.hardwareCost))),
      ['Storage ('+retention+'-day)'].concat(tcoCols.map(c=>c.tco.isAudio?'-':pdfInr(c.tco.storageCost))),
      ['Power (5 years)'].concat(tcoCols.map(c=>pdfInr(c.tco.powerCost5yr))),
      [{ content:'5-YEAR TOTAL', styles:{fontStyle:'bold',textColor:[107,133,168],fontSize:9}}].concat(
        tcoCols.map(c=>({ content:pdfInr(c.tco.total5yr), styles:{fontStyle:'bold',textColor:c.primary?[0,200,83]:[220,232,244],fontSize:10}}))
      ),
      ['Per unit per year'].concat(tcoCols.map(c=>'Rs.'+Math.round(c.tco.perUnitPerYear).toLocaleString('en-IN')))
    ];

    const colW = Math.floor((CW - 50) / tcoCols.length);
    doc.autoTable({
      head: [['Cost Component'].concat(tcoCols.map(c=>c.label))],
      body: rows,
      startY: Y,
      margin: {left:ML,right:MR},
      styles: {fontSize:8.5,cellPadding:4.5,font:'helvetica',textColor:[168,189,212],fillColor:[22,27,39],lineColor:[31,45,69],lineWidth:0.25},
      headStyles: {fillColor:[17,21,32],textColor:[220,232,244],fontSize:9,fontStyle:'bold',cellPadding:5},
      alternateRowStyles: {fillColor:[23,29,46]},
      columnStyles: Object.fromEntries(
        [{size:50},...tcoCols.map(()=>({size:colW}))].map((c,i)=>([i,{cellWidth:c.size,halign:i===0?'left':'right'}]))
      ),
      didParseCell: d => {
        if (d.row.index===3) { d.cell.styles.fillColor=[17,27,50]; }
      }
    });

    Y = doc.lastAutoTable.finalY + 8;
  }

  // Footer
  bg(31,45,69); doc.rect(ML,Y,CW,0.3,'F');
  fg(107,133,168); doc.setFontSize(7); doc.setFont('helvetica','normal');
  doc.text('NOTE: Storage assumes Axis Zipstream at 40GB/cam/day, standard H.265 at 80GB/cam/day. Power based on PoE draw per unit.',ML,Y+5);
  doc.text('AMC not included. Axis 5-year warranty = Rs.0 AMC for 5 years. All prices indicative only.',ML,Y+10);
  fg(79,142,247); doc.text('ryaview.ai',ML,Y+16);
  fg(107,133,168); doc.text(' - Camera Intelligence Platform - '+dateStr,ML+doc.getTextWidth('ryaview.ai'),Y+16);

  doc.save('ryaview_TCO_'+dateStr.replace(/ /g,'_')+'.pdf');
}

/* ════════════════════════════════════════════════════════════════
   TCO HTML — inject this as a new page tab in ryaview nav
   Add to nav: <button class="nav-btn" onclick="sw('tco',this)">TCO</button>
   Add page div: <div id="page-tco" class="page"></div>
   Call renderTCOPage() when tab is activated
   ════════════════════════════════════════════════════════════════ */
