// ================================================================
// datasheet-admin.js — v1.2
// Mounts "Datasheet Verification" section into adm-ai panel.
// v1.1: manual PDF URL input, PDF vs page distinction
// v1.2: Verify All (sequential, skips already-verified, stoppable)
// ================================================================

const DS_FN_URL = 'https://ssytbjfhjuhgnvgdvgkh.supabase.co/functions/v1/datasheet-verify';
const DS_BRANDS = ['Axis','Bosch','Hanwha','i-PRO','Hikvision','CP Plus','Honeywell','Pelco','Matrix','Sparsh'];

let _dsStop = false;   // stop flag for Verify All

function initDatasheetAdmin() {
  const host = document.getElementById('adm-ai');
  if (!host) { console.error('datasheet-admin: adm-ai not found'); return; }
  if (document.getElementById('dsAdminSection')) return;

  const sec = document.createElement('div');
  sec.id = 'dsAdminSection';
  sec.style.cssText = 'margin-top:28px;padding:20px;background:var(--s1);border:1px solid var(--line);border-radius:12px;';
  sec.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;">' +
      '<span style="font-weight:700;color:var(--head);font-size:14px;">\uD83D\uDCCB Datasheet Verification</span>' +
    '</div>' +
    '<div style="font-size:11px;color:var(--dim);margin-bottom:10px;">Per-model: Claude finds PDF + extracts specs. Paste PDF URL to override auto-search. Verify All runs sequentially — skips already-verified models.</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">' +
      '<select id="dsBrandSelect" style="padding:4px 8px;font-size:12px;background:var(--s2);border:1px solid var(--line);border-radius:6px;color:var(--text);min-width:140px;">' +
        '<option value="">\u2014 Select brand \u2014</option>' +
        DS_BRANDS.map(function(b) { return '<option>' + b + '</option>'; }).join('') +
      '</select>' +
      '<button class="btn btn-ghost btn-sm" onclick="dsLoadBrand()">Load Models</button>' +
      '<button class="btn btn-ghost btn-sm" id="dsVerifyAllBtn" onclick="dsVerifyAll()" style="display:none;">Verify All Unverified</button>' +
      '<button class="btn btn-ghost btn-sm" id="dsStopBtn" onclick="dsStopAll()" style="display:none;color:var(--red);">Stop</button>' +
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
  document.getElementById('dsVerifyAllBtn').style.display = 'none';
  try {
    const { data, error } = await _sb
      .from('cameras')
      .select('id, model, datasheet_url, specs_verified, specs_verified_date, product_page_url')
      .eq('brand', brand)
      .eq('active', true)
      .order('model');
    if (error) throw error;
    if (!data || !data.length) { dsSetStatus('No active models for ' + brand); return; }
    const unverified = data.filter(function(m) { return !m.specs_verified || !m.specs_verified_date; }).length;
    dsSetStatus(data.length + ' models · ' + unverified + ' unverified');
    dsRenderTable(brand, data);
    document.getElementById('dsVerifyAllBtn').style.display = unverified > 0 ? 'inline-flex' : 'none';
  } catch(e) {
    dsSetStatus('Failed: ' + (e.message || e));
  }
}

function dsRenderTable(brand, models) {
  const wrap = document.getElementById('dsTable');
  const rows = models.map(function(m) {
    const hasUrl = !!m.datasheet_url;
    const isPdf  = hasUrl && m.datasheet_url.toLowerCase().includes('.pdf');
    const ago    = (m.specs_verified && m.specs_verified_date) ? dsDaysAgo(m.specs_verified_date) + 'd ago' : '\u2014';
    const urlLabel = isPdf ? '\u2197 PDF' : (hasUrl ? '\u2197 page' : '\u2014');
    const urlColor = isPdf ? 'var(--money)' : 'var(--acc)';
    const urlCell  = hasUrl
      ? '<a href="' + m.datasheet_url + '" target="_blank" rel="noopener" style="font-size:13px;font-weight:600;color:' + urlColor + ';" title="' + m.datasheet_url + '">' + urlLabel + '</a>'
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
          'data-pageurl="' + (m.product_page_url || '') + '" ' +
          'id="dsBtn_' + slug + '" ' +
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
  const inputEl   = document.getElementById('dsInput_' + slug);
  const manualUrl = inputEl ? inputEl.value.trim() : '';
  const pageUrl   = btn.dataset.pageurl || '';

  btn.disabled = true;
  btn.textContent = '\u2026';

  try {
    const headers = await getAiProxyHeaders();
    const body    = { brand: brand, model: model };
    if (manualUrl) body.datasheet_url = manualUrl;
    else if (pageUrl) body.product_page_url = pageUrl;

    const res = await fetch(DS_FN_URL, { method:'POST', headers:headers, body:JSON.stringify(body) });
    const out = await res.json();
    if (!res.ok) {
      if (out.error === 'ADMIN_ONLY') { dsSetStatus('Admin only.'); return; }
      throw new Error(out.error || ('HTTP ' + res.status));
    }

    dsUpdateRow(slug, out);
    if (inputEl) inputEl.value = '';
    return out;
  } catch(e) {
    dsSetStatus(model + ' failed: ' + (e.message || e));
    throw e;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify';
  }
}

function dsUpdateRow(slug, out) {
  const urlEl = document.getElementById('dsUrl_' + slug);
  const agoEl = document.getElementById('dsAgo_' + slug);
  if (urlEl && out.datasheet_url) {
    const isPdf  = out.datasheet_url.toLowerCase().includes('.pdf');
    const lbl    = isPdf ? '\u2197 PDF' : '\u2197 page';
    const color  = isPdf ? 'var(--money)' : 'var(--acc)';
    urlEl.innerHTML = '<a href="' + out.datasheet_url + '" target="_blank" rel="noopener" style="font-size:13px;font-weight:600;color:' + color + ';" title="' + out.datasheet_url + '">' + lbl + '</a>';
  }
  if (agoEl) agoEl.textContent = '0d ago';
}

async function dsVerifyAll() {
  const brand = document.getElementById('dsBrandSelect').value;
  if (!brand) { dsSetStatus('Select brand first.'); return; }

  _dsStop = false;
  document.getElementById('dsVerifyAllBtn').style.display = 'none';
  document.getElementById('dsStopBtn').style.display = 'inline-flex';

  // Collect all unverified rows (no 0d ago / no verified text)
  const rows = document.querySelectorAll('#dsTable tbody tr');
  const queue = [];
  rows.forEach(function(row) {
    const agoEl = row.querySelector('[id^="dsAgo_"]');
    const btn   = row.querySelector('button[data-model]');
    if (btn && agoEl && agoEl.textContent.trim() === '\u2014') {
      queue.push(btn);
    }
  });

  if (!queue.length) { dsSetStatus('All models already verified.'); dsVerifyAllDone(); return; }

  let done = 0, pdfs = 0, pages = 0, failed = 0;
  dsSetStatus('0/' + queue.length + ' \u2014 starting\u2026');

  for (let i = 0; i < queue.length; i++) {
    if (_dsStop) { dsSetStatus('Stopped at ' + done + '/' + queue.length + '. ' + pdfs + ' PDF, ' + pages + ' page, ' + failed + ' failed.'); break; }

    const btn   = queue[i];
    const model = btn.dataset.model;
    dsSetStatus((i+1) + '/' + queue.length + ' \u2014 ' + model + '\u2026');

    try {
      const out = await dsVerifyModel(btn);
      done++;
      if (out && out.datasheet_url && out.datasheet_url.toLowerCase().includes('.pdf')) pdfs++;
      else if (out && out.datasheet_url) pages++;
    } catch(_) {
      failed++;
    }

    if (i < queue.length - 1 && !_dsStop) {
      await new Promise(function(r) { setTimeout(r, 3000); });
    }
  }

  if (!_dsStop) {
    dsSetStatus('Done: ' + pdfs + ' PDF \u2713, ' + pages + ' page, ' + failed + ' failed out of ' + queue.length);
    dsVerifyAllDone();
  }
}

function dsStopAll() {
  _dsStop = true;
  dsVerifyAllDone();
}

function dsVerifyAllDone() {
  document.getElementById('dsStopBtn').style.display  = 'none';
  document.getElementById('dsVerifyAllBtn').style.display = 'inline-flex';
}

function dsSlug(str) { return str.replace(/[^a-z0-9]/gi,'').toLowerCase(); }

function dsDaysAgo(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

