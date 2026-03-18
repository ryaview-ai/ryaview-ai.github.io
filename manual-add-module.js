/* ════════════════════════════════════════════════════════════════
   ryaview.ai — MANUAL MODEL ADD MODULE
   
   PURPOSE:
   Allows integrators to add any camera or audio model that is
   not in the ryaview database — directly into the active BOQ.
   No database dependency. Works for any brand, any model, always.

   INJECTION:
   1. Add "+ Add Custom Model" button to BOQ footer (camera + audio)
   2. A modal appears with: brand, model, type, resolution, price, qty
   3. Row added to boqRows / audioBoqRows and BOQ re-renders
   4. Custom rows are visually tagged "CUSTOM" so user knows
   5. Exports (PDF, Excel, Spec) include custom rows seamlessly

   ALSO HANDLES:
   - Editing price of any existing BOQ row inline
   - Removing a row from the BOQ
   ════════════════════════════════════════════════════════════════ */

/* ── MODAL HTML ───────────────────────────────────────────────── */
const MANUAL_ADD_MODAL_HTML = `
<div id="manual-add-overlay"
  style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;align-items:center;justify-content:center"
  onclick="if(event.target===this) closeManualAdd()">
  <div style="background:var(--s1);border:1px solid var(--line);border-radius:14px;padding:28px 28px 22px;width:100%;max-width:480px;margin:16px">

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--head)" id="manual-add-title">Add Custom Model to BOQ</div>
        <div style="font-size:11px;color:var(--dim);margin-top:2px">Model not in database? Add it manually.</div>
      </div>
      <button onclick="closeManualAdd()" style="background:none;border:none;color:var(--mid);cursor:pointer;font-size:18px;padding:4px 8px">✕</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">

      <!-- Brand -->
      <div>
        <div style="font-size:10px;color:var(--mid);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Brand</div>
        <input id="ma-brand" placeholder="e.g. i-PRO, Axis, Bosch…"
          style="width:100%;background:var(--s2);border:1px solid var(--line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--head);outline:none"
          list="ma-brand-list">
        <datalist id="ma-brand-list">
          <option value="Axis"><option value="Bosch"><option value="Hanwha">
          <option value="Hikvision"><option value="i-PRO"><option value="Honeywell">
          <option value="Pelco"><option value="CP Plus"><option value="Matrix">
          <option value="Sparsh"><option value="Dahua"><option value="Uniview">
        </datalist>
      </div>

      <!-- Model number -->
      <div>
        <div style="font-size:10px;color:var(--mid);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Model Number *</div>
        <input id="ma-model" placeholder="e.g. WV-U2532LA"
          style="width:100%;background:var(--s2);border:1px solid var(--line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--head);outline:none;font-family:var(--fm)">
      </div>

      <!-- Type -->
      <div>
        <div style="font-size:10px;color:var(--mid);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Camera Type</div>
        <select id="ma-type"
          style="width:100%;background:var(--s2);border:1px solid var(--line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--head);outline:none">
          <option value="Fixed Dome">Fixed Dome</option>
          <option value="Varifocal Dome">Varifocal Dome</option>
          <option value="Bullet">Bullet</option>
          <option value="PTZ">PTZ</option>
          <option value="Fisheye">Fisheye</option>
          <option value="Mini Dome">Mini Dome</option>
          <option value="Multi-Sensor">Multi-Sensor</option>
          <option value="Box">Box</option>
          <option value="Vandal Dome">Vandal Dome</option>
          <option value="Horn Speaker">Horn Speaker</option>
          <option value="Ceiling Speaker">Ceiling Speaker</option>
          <option value="Audio Amplifier">Audio Amplifier</option>
        </select>
      </div>

      <!-- Resolution -->
      <div>
        <div style="font-size:10px;color:var(--mid);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Resolution</div>
        <select id="ma-res"
          style="width:100%;background:var(--s2);border:1px solid var(--line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--head);outline:none">
          <option value="1MP">1MP (720p)</option>
          <option value="2MP" selected>2MP (1080p)</option>
          <option value="4MP">4MP</option>
          <option value="5MP">5MP</option>
          <option value="6MP">6MP</option>
          <option value="8MP">8MP (4K)</option>
          <option value="12MP">12MP</option>
          <option value="20MP">20MP</option>
          <option value="32MP">32MP</option>
          <option value="—">N/A (Audio)</option>
        </select>
      </div>

      <!-- Unit price -->
      <div>
        <div style="font-size:10px;color:var(--mid);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Unit Price (₹ INR) *</div>
        <input id="ma-price" type="number" min="0" step="500" placeholder="e.g. 46500"
          style="width:100%;background:var(--s2);border:1px solid var(--line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--head);outline:none;font-family:var(--fm)">
      </div>

      <!-- Quantity -->
      <div>
        <div style="font-size:10px;color:var(--mid);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Quantity *</div>
        <input id="ma-qty" type="number" min="1" step="1" value="1" placeholder="1"
          style="width:100%;background:var(--s2);border:1px solid var(--line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--head);outline:none;font-family:var(--fm)">
      </div>

    </div>

    <!-- Notes -->
    <div style="margin-bottom:16px">
      <div style="font-size:10px;color:var(--mid);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Notes (optional)</div>
      <input id="ma-notes" placeholder="e.g. Varifocal, motorized, IP66, NDAA compliant"
        style="width:100%;background:var(--s2);border:1px solid var(--line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--head);outline:none">
    </div>

    <!-- Error -->
    <div id="ma-error" style="display:none;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:8px 12px;font-size:11px;color:#ef4444;margin-bottom:12px"></div>

    <!-- Actions -->
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button onclick="closeManualAdd()"
        style="padding:9px 18px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--mid);font-size:12px;cursor:pointer">
        Cancel
      </button>
      <button onclick="submitManualAdd()"
        style="padding:9px 20px;border-radius:8px;background:var(--blue);border:none;color:#fff;font-size:12px;font-weight:600;cursor:pointer">
        Add to BOQ
      </button>
    </div>

  </div>
</div>`;

/* ── STATE ────────────────────────────────────────────────────── */
let _maTarget = 'camera'; // 'camera' | 'audio'
let _maEditIdx = null;    // index if editing existing row

/* ── OPEN MODAL ───────────────────────────────────────────────── */
function openManualAdd(target) {
  // Inject modal if not present
  if (!document.getElementById('manual-add-overlay')) {
    document.body.insertAdjacentHTML('beforeend', MANUAL_ADD_MODAL_HTML);
  }

  _maTarget  = target || 'camera';
  _maEditIdx = null;

  // Reset fields
  ['ma-brand','ma-model','ma-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const priceEl = document.getElementById('ma-price');
  const qtyEl   = document.getElementById('ma-qty');
  const errEl   = document.getElementById('ma-error');
  if (priceEl) priceEl.value = '';
  if (qtyEl)   qtyEl.value   = '1';
  if (errEl)   errEl.style.display = 'none';

  // Adjust type options for audio targets
  const typeEl = document.getElementById('ma-type');
  if (typeEl && target === 'audio') {
    typeEl.value = 'Horn Speaker';
    document.getElementById('ma-res').value = '—';
  } else if (typeEl) {
    typeEl.value = 'Fixed Dome';
    document.getElementById('ma-res').value = '2MP';
  }

  // Pre-fill brand from active BOQ brand
  const brandEl = document.getElementById('ma-brand');
  if (brandEl) {
    if (target === 'audio' && window.audioBoqBrand) {
      brandEl.value = window.audioBoqBrand;
    } else if (target === 'camera' && typeof boqBrand !== 'undefined' && boqBrand) {
      brandEl.value = boqBrand;
    }
  }

  // Update title
  const titleEl = document.getElementById('manual-add-title');
  if (titleEl) {
    titleEl.textContent = target === 'audio'
      ? 'Add Custom Audio Model to BOQ'
      : 'Add Custom Camera Model to BOQ';
  }

  const overlay = document.getElementById('manual-add-overlay');
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('ma-model')?.focus(), 50);
}

/* ── OPEN FOR PRICE EDIT ──────────────────────────────────────── */
function openPriceEdit(target, idx) {
  openManualAdd(target);
  _maEditIdx = idx;

  const rows = target === 'audio'
    ? (window.audioBoqRows || [])
    : (typeof boqRows !== 'undefined' ? boqRows : []);
  const row = rows[idx];
  if (!row) return;

  document.getElementById('ma-brand').value = row.brand || (target==='audio' ? window.audioBoqBrand : boqBrand) || '';
  document.getElementById('ma-model').value = row.m || row.model || '';
  document.getElementById('ma-type').value  = row.t || row.type || 'Fixed Dome';
  document.getElementById('ma-res').value   = row.r || row.res || '2MP';
  document.getElementById('ma-price').value = row.customPrice != null ? row.customPrice : (row.p || row.price || '');
  document.getElementById('ma-qty').value   = row.qty || 1;

  const titleEl = document.getElementById('manual-add-title');
  if (titleEl) titleEl.textContent = 'Edit Row Price & Details';

  const addBtn = document.querySelector('#manual-add-overlay button[onclick="submitManualAdd()"]');
  if (addBtn) addBtn.textContent = 'Save Changes';
}

/* ── CLOSE MODAL ──────────────────────────────────────────────── */
function closeManualAdd() {
  const overlay = document.getElementById('manual-add-overlay');
  if (overlay) overlay.style.display = 'none';
  _maEditIdx = null;
}

/* ── SUBMIT ───────────────────────────────────────────────────── */
function submitManualAdd() {
  const brand = document.getElementById('ma-brand').value.trim();
  const model = document.getElementById('ma-model').value.trim().toUpperCase();
  const type  = document.getElementById('ma-type').value;
  const res   = document.getElementById('ma-res').value;
  const price = parseInt(document.getElementById('ma-price').value, 10);
  const qty   = parseInt(document.getElementById('ma-qty').value, 10) || 1;
  const notes = document.getElementById('ma-notes').value.trim();
  const errEl = document.getElementById('ma-error');

  // Validate
  if (!model) { showManualAddError('Model number is required.'); return; }
  if (!price || price < 0) { showManualAddError('Please enter a valid unit price in ₹.'); return; }
  if (errEl) errEl.style.display = 'none';

  if (_maTarget === 'camera') {
    _submitCameraRow(brand, model, type, res, price, qty, notes);
  } else {
    _submitAudioRow(brand, model, type, res, price, qty, notes);
  }

  closeManualAdd();
  showToast(`✓ ${model} added to BOQ`);
  logUsage('manual_model_add', brand || 'custom');
}

function _submitCameraRow(brand, model, type, res, price, qty, notes) {
  if (typeof boqRows === 'undefined') { showToast('Open the BOQ tab first.'); return; }

  const newRow = {
    m: model, t: type, r: res, p: price, qty,
    brand: brand || boqBrand || 'Custom',
    customPrice: price,
    isCustom: true,
    notes
  };

  if (_maEditIdx !== null && _maEditIdx >= 0) {
    // Edit existing row
    boqRows[_maEditIdx] = { ...boqRows[_maEditIdx], ...newRow, qty };
  } else {
    // Check if model already exists — update qty instead
    const existing = boqRows.findIndex(r => (r.m||'').toUpperCase() === model);
    if (existing >= 0) {
      boqRows[existing].qty   += qty;
      boqRows[existing].customPrice = price;
      boqRows[existing].isCustom    = true;
    } else {
      boqRows.push(newRow);
    }
  }

  // Re-render BOQ table
  if (typeof renderBoq === 'function') renderBoq();
  else if (typeof buildBoqTable === 'function') buildBoqTable();
  else _refreshBoqDisplay();
}

function _submitAudioRow(brand, model, type, res, price, qty, notes) {
  if (!window.audioBoqRows) window.audioBoqRows = [];

  const newRow = {
    model, cat: type, type, spl: null,
    brand: brand || window.audioBoqBrand || 'Custom',
    price, customPrice: price, qty,
    isCustom: true, notes
  };

  if (_maEditIdx !== null && _maEditIdx >= 0) {
    window.audioBoqRows[_maEditIdx] = { ...window.audioBoqRows[_maEditIdx], ...newRow, qty };
  } else {
    const existing = window.audioBoqRows.findIndex(r => (r.model||'').toUpperCase() === model);
    if (existing >= 0) {
      window.audioBoqRows[existing].qty        += qty;
      window.audioBoqRows[existing].customPrice = price;
      window.audioBoqRows[existing].isCustom    = true;
    } else {
      window.audioBoqRows.push(newRow);
    }
  }

  // Re-render audio BOQ
  if (typeof renderAudioBoq === 'function') renderAudioBoq();
  else _refreshAudioBoqDisplay();
}

function showManualAddError(msg) {
  const errEl = document.getElementById('ma-error');
  if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
}

/* ── REMOVE ROW ───────────────────────────────────────────────── */
function removeBoqRow(target, idx) {
  if (!confirm('Remove this row from the BOQ?')) return;
  if (target === 'camera' && typeof boqRows !== 'undefined') {
    boqRows.splice(idx, 1);
    if (typeof renderBoq === 'function') renderBoq();
    else _refreshBoqDisplay();
  } else if (target === 'audio' && window.audioBoqRows) {
    window.audioBoqRows.splice(idx, 1);
    if (typeof renderAudioBoq === 'function') renderAudioBoq();
    else _refreshAudioBoqDisplay();
  }
}

/* ── FALLBACK REFRESH (if main render fn name differs) ────────── */
function _refreshBoqDisplay() {
  // Try common render function names used in ryaview-final.html
  const fns = ['renderBoqTable','refreshBoq','drawBoq','updateBoq'];
  for (const fn of fns) {
    if (typeof window[fn] === 'function') { window[fn](); return; }
  }
  // Last resort: find and trigger the BOQ section update
  console.warn('ryaview manual-add: could not find BOQ render function. Please call renderBoq() after submitManualAdd().');
}

function _refreshAudioBoqDisplay() {
  const fns = ['renderAudioBoqTable','refreshAudioBoq','drawAudioBoq'];
  for (const fn of fns) {
    if (typeof window[fn] === 'function') { window[fn](); return; }
  }
}

/* ── INJECT "+ Add Custom Model" BUTTON ───────────────────────── 
   Call this once after BOQ renders to add the button.
   Place it at end of the BOQ table footer, before grand total.
   ─────────────────────────────────────────────────────────────── */
function injectManualAddButtons() {
  // Camera BOQ footer
  const camFooter = document.getElementById('boq-footer-actions');
  if (camFooter && !document.getElementById('btn-manual-add-cam')) {
    camFooter.insertAdjacentHTML('beforeend', `
      <button id="btn-manual-add-cam" class="btn btn-ob btn-sm"
        onclick="openManualAdd('camera')"
        title="Add a model that is not in the ryaview database">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Custom Model
      </button>`);
  }

  // Audio BOQ footer
  const audioFooter = document.getElementById('audio-boq-footer-actions');
  if (audioFooter && !document.getElementById('btn-manual-add-audio')) {
    audioFooter.insertAdjacentHTML('beforeend', `
      <button id="btn-manual-add-audio" class="btn btn-ob btn-sm"
        onclick="openManualAdd('audio')"
        title="Add an audio model that is not in the ryaview database">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Custom Audio Model
      </button>`);
  }
}

/* ── CUSTOM ROW INDICATOR HTML ────────────────────────────────── 
   Call this in BOQ row rendering to show the CUSTOM badge
   and inline Edit / Remove buttons on custom rows.
   
   Usage in BOQ table row render:
   ${isCustomRow(row) ? customRowBadge() : ''}
   ${rowActionButtons('camera', idx)}
   ─────────────────────────────────────────────────────────────── */
function isCustomRow(row) {
  return row.isCustom === true;
}

function customRowBadge() {
  return `<span style="display:inline-block;padding:1px 6px;background:rgba(251,191,36,0.1);
    border:1px solid rgba(251,191,36,0.25);border-radius:3px;font-size:9px;
    font-family:var(--fm);color:#fbbf24;letter-spacing:.04em;margin-left:4px">CUSTOM</span>`;
}

function rowActionButtons(target, idx) {
  return `
    <span style="display:inline-flex;gap:4px;margin-left:6px">
      <button onclick="openPriceEdit('${target}',${idx})"
        title="Edit price / details"
        style="background:none;border:none;color:var(--dim);cursor:pointer;padding:0 2px;font-size:11px;line-height:1">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button onclick="removeBoqRow('${target}',${idx})"
        title="Remove from BOQ"
        style="background:none;border:none;color:var(--dim);cursor:pointer;padding:0 2px;font-size:11px;line-height:1">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </span>`;
}

/* ── KEYBOARD SHORTCUT ────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  // Escape closes modal
  if (e.key === 'Escape') closeManualAdd();
  // Enter submits if modal is open
  if (e.key === 'Enter' && document.getElementById('manual-add-overlay')?.style.display === 'flex') {
    submitManualAdd();
  }
});

/* ════════════════════════════════════════════════════════════════
   INJECTION NOTES for ryaview-final.html:

   1. After the BOQ renders (end of renderBoq function), call:
      injectManualAddButtons();

   2. In the BOQ table row rendering, add to the model name cell:
      ${row.isCustom ? customRowBadge() : ''}

   3. Add edit/remove buttons at end of each row:
      ${rowActionButtons('camera', idx)}

   4. In PDF/Excel/Spec exports, custom rows export identically
      to database rows — customPrice overrides price if set.
      Use: const price = row.customPrice ?? row.p ?? row.price ?? 0;

   5. Add this to the BOQ section header area as a fallback entry
      point button (shown when no brand selected yet):
      
      <button class="btn btn-ob" onclick="openManualAdd('camera')">
        + Add model manually
      </button>
   ════════════════════════════════════════════════════════════════ */
