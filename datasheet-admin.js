// ================================================================
// datasheet-admin.js — v1.1
// Mounts "Datasheet Verification" section into adm-ai panel.
// Calls datasheet-verify edge fn (admin-gated) per camera model.
// Brand dropdown → load models → table with Verify btn per row.
// v1.1: manual PDF URL input per row for admin override
// ================================================================

const DS_FN_URL = 'https://ssytbjfhjuhgnvgdvgkh.supabase.co/functions/v1/datasheet-verify';
const DS_BRANDS = ['Axis','Bosch','Hanwha','i-PRO','Hikvision','CP Plus','Honeywell','Pelco','Matrix','Sparsh'];

function initDatasheetAdmin() {
  const host = document.getElementById('adm-ai');
  if (!host) { console.error('datasheet-admin: adm-ai not found'); return; }
  if (document.getElementById('dsAdminSection')) return;

  const sec = document.createElement('div');
  sec.id = 'dsAdminSection';
  sec.style.cssText = 'margin-top:28px;padding:20px;background:var(--s1);border:1px solid var(--line);border-radius:12px;';
  sec.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px;">' +
      '<span style="font-weight:700;color:var(--head);font-size:14px;">\uD83D\uDCCB Datasheet Verification</span>' +
    '</div>' +
    '<div style="font-size:11px;color:var(--dim);margin-bottom:10px;">Per-model: Claude finds datasheet PDF + extracts specs. Writes datasheet_url + verified_date to cameras table. Paste a PDF URL to override auto-search.</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">' +
      '<select id="dsBrandSelect" style="padding:4px 8px;font-size:12px;background:var(--s2);border:1px solid var(--line);border-radius:6px;color:var(--text);min-width:140px;">' +
        '<option value="">\u2014 Select brand \u2014</option>' +
        DS_BRANDS.map(function(b) { return '<option>' + b + '</option>'; }).join('') +
      '</select>' +
      '<button class="btn btn-ghost btn-sm" onclick="dsLoadBrand()">Load Models</button>' +
      '<span id="dsStatus" style="font-size:11px;color:var(--mid);"></span>' +
    '</div>' +
    '<div id="dsTable"></div>';
  host.appendChild(sec);
}

function dsSetStatus(msg) {
  const el = document.getElementById('dsStatus');
  if (el) el.textContent = msg;
}

async function dsLoadBrand() {
  const brand = document.getElementById('dsBrandSelect').value;
  if (!brand) { dsSetStatus('Select brand first.'); return; }
  dsSetStatus('Loading\u2026');
  document.getElementById('dsTable').innerHTML = '';
  try {
    const { data, error } = await _sb
      .from('cameras')
      .select('id, model, datasheet_url, verified_date')
      .eq('brand', brand)
      .eq('active', true)
      .order('model');
    if (error) throw error;
    if (!data || !data.length) { dsSetStatus('No active models for ' + brand); return; }
    dsSetStatus(data.length + ' models');
    dsRenderTable(brand, data);
  } catch(e) {
    dsSetStatus('Failed: ' + (e.message || e));
  }
}

function dsRenderTable(brand, models) {
  const wrap = document.getElementById('dsTable');
  const rows = models.map(function(m) {
    const hasUrl = !!m.datasheet_url;
    const isPdf  = hasUrl && m.datasheet_url.toLowerCase().includes('.pdf');
    const ago    = m.verified_date ? dsDaysAgo(m.verified_date) + 'd ago' : '\u2014';
    const urlLabel = isPdf ? '\u2197 PDF' : (hasUrl ? '\u2197 page' : '\u2014');
    const urlStyle = isPdf ? 'color:var(--money);' : 'color:var(--acc);';
    const urlCell  = hasUrl
      ? '<a href="' + m.datasheet_url + '" target="_blank" rel="noopener" style="font-size:13px;font-weight:600;' + urlStyle + '" title="' + m.datasheet_url + '">' + urlLabel + '</a>'
      : '<span style="color:var(--dim);">\u2014</span>';
    const slug = dsSlug(m.model);
    return '<tr id="dsRow_' + slug + '">' +
      '<td style="font-size:11px;padding:5px 6px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + m.model + '">' + m.model + '</td>' +
      '<td style="font-size:11px;padding:5px 6px;text-align:center;" id="dsUrl_' + slug + '">' + urlCell + '</td>' +
      '<td style="font-size:11px;padding:5px 6px;text-align:center;color:var(--dim);" id="dsAgo_' + slug + '">' + ago + '</td>' +
      '<td style="padding:5px 6px;display:flex;gap:4px;align-items:center;">' +
        '<input type="text" id="dsInput_' + slug + '" placeholder="Paste PDF URL (optional)" ' +
          'style="font-size:10px;padding:2px 5px;width:190px;background:var(--s2);border:1px solid var(--line);border-radius:4px;color:var(--text);" />' +
        '<button class="btn btn-ghost btn-sm" ' +
          'data-brand="' + brand + '" ' +
          'data-model="' + m.model + '" ' +
          'onclick="dsVerifyModel(this)">Verify</button>' +
      '</td>' +
    '</tr>';
  }).join('');
  wrap.innerHTML =
    '<table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr>' +
        '<th style="font-size:10px;font-weight:700;text-align:left;padding:4px 6px;color:var(--dim);border-bottom:1px solid var(--line);">Model</th>' +
        '<th style="font-size:10px;font-weight:700;text-align:center;padding:4px 6px;color:var(--dim);border-bottom:1px solid var(--line);">URL</th>' +
        '<th style="font-size:10px;font-weight:700;text-align:center;padding:4px 6px;color:var(--dim);border-bottom:1px solid var(--line);">Verified</th>' +
        '<th style="font-size:10px;font-weight:700;text-align:left;padding:4px 6px;color:var(--dim);border-bottom:1px solid var(--line);">Action</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
}

async function dsVerifyModel(btn) {
  const brand = btn.dataset.brand;
  const model = btn.dataset.model;
  const slug  = dsSlug(model);

  // Manual override: if admin pasted a URL in the input, use it (Path A — PDF read)
  const inputEl    = document.getElementById('dsInput_' + slug);
  const manualUrl  = inputEl ? inputEl.value.trim() : '';

  btn.disabled = true;
  btn.textContent = '\u2026';
  dsSetStatus('Verifying ' + model + '\u2026 (this takes ~30-60s)');

  try {
    const headers = await getAiProxyHeaders();
    const body    = { brand: brand, model: model };
    if (manualUrl) {
      body.datasheet_url = manualUrl;  // Path A: read PDF directly
    }
    // Note: no longer sending existingUrl — if DB has a product page URL,
    // re-verify should use Path B (web search + page fetch) not Path A
    const res = await fetch(DS_FN_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    const out = await res.json();
    if (!res.ok) {
      if (out.error === 'ADMIN_ONLY') { dsSetStatus('Admin only.'); return; }
      throw new Error(out.error || ('HTTP ' + res.status));
    }
    const isPdf   = out.datasheet_url && out.datasheet_url.toLowerCase().includes('.pdf');
    const method  = isPdf ? 'PDF \u2713' : (out.confirmed ? 'confirmed \u2713' : 'page only');
    dsSetStatus(model + ' done \u2713 (' + method + ')');

    // Update cells in-place
    const urlEl = document.getElementById('dsUrl_' + slug);
    const agoEl = document.getElementById('dsAgo_' + slug);
    if (urlEl && out.datasheet_url) {
      const lbl   = isPdf ? '\u2197 PDF' : '\u2197 page';
      const color = isPdf ? 'var(--money)' : 'var(--acc)';
      urlEl.innerHTML = '<a href="' + out.datasheet_url + '" target="_blank" rel="noopener" style="font-size:13px;font-weight:600;color:' + color + ';" title="' + out.datasheet_url + '">' + lbl + '</a>';
    }
    if (agoEl) agoEl.textContent = '0d ago';
    if (inputEl) inputEl.value = '';  // clear manual input after success
  } catch(e) {
    dsSetStatus(model + ' failed: ' + (e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify';
  }
}

function dsSlug(str) { return str.replace(/[^a-z0-9]/gi, '').toLowerCase(); }

function dsDaysAgo(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
