// ============================================================
// brand-compliance-admin.js — v1.1
// Mounts "Brand Compliance Research" section into adm-ai panel.
// Calls brand-research edge fn (admin-gated, one brand per call).
// Uses bare _sb + await getAiProxyHeaders() per project conventions.
// ============================================================

const BC_BRANDS = ['Axis', 'Bosch', 'Hanwha', 'i-PRO', 'Hikvision', 'CP Plus', 'DSPPA', 'TOA'];
const BC_FN_URL = 'https://ssytbjfhjuhgnvgdvgkh.supabase.co/functions/v1/brand-research';

function initBrandComplianceAdmin() {
  const host = document.getElementById('adm-ai');
  if (!host) { console.error('brand-compliance-admin: adm-ai panel not found'); return; }
  if (document.getElementById('bcAdminSection')) return; // already mounted

  const sec = document.createElement('div');
  sec.id = 'bcAdminSection';
  sec.style.cssText = 'margin-top:28px;padding:20px;background:var(--s1);border:1px solid var(--line);border-radius:12px;';
  sec.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:4px;">' +
      '<span style="font-weight:700;color:var(--head);font-size:14px;">\uD83D\uDEE1\uFE0F Brand Compliance Research</span>' +
      '<button id="bcRefreshAll" class="btn btn-ghost btn-sm" onclick="bcRefreshAll()">Refresh All</button>' +
    '</div>' +
    '<div style="font-size:11px;color:var(--dim);margin-bottom:10px;">Web-search verified: warranty, NDAA, MeitY, BIS, origin. Writes to brand_compliance table. ~30-60s per brand.</div>' +
    '<div id="bcStatus" style="font-size:12px;color:var(--mid);margin-bottom:8px;"></div>' +
    '<div id="bcRows"></div>';
  host.appendChild(sec);

  const rows = sec.querySelector('#bcRows');
  BC_BRANDS.forEach(function (brand) {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);';
    r.innerHTML =
      '<span style="min-width:90px;">' + brand + '</span>' +
      '<span id="bcMeta-' + bcSlug(brand) + '" style="font-size:11px;color:var(--dim);flex:1;text-align:right;margin-right:8px;"></span>' +
      '<button class="btn btn-ghost btn-sm bcResearchBtn" data-brand="' + brand + '">Research</button>';
    rows.appendChild(r);
  });

  rows.querySelectorAll('.bcResearchBtn').forEach(function (btn) {
    btn.addEventListener('click', function () { bcResearchBrand(btn.dataset.brand); });
  });

  bcLoadCurrentState();
}

function bcSlug(brand) { return brand.replace(/[^a-z0-9]/gi, '').toLowerCase(); }

function bcSetStatus(msg) {
  const el = document.getElementById('bcStatus');
  if (el) el.textContent = msg;
}

async function bcLoadCurrentState() {
  try {
    const { data, error } = await _sb.from('brand_compliance')
      .select('brand_name, verified_date, warranty_years_cameras, ndaa_compliant, meity_compliant');
    if (error) throw error;
    (data || []).forEach(function (row) {
      const meta = document.getElementById('bcMeta-' + bcSlug(row.brand_name));
      if (!meta) return;
      if (!row.verified_date) { meta.textContent = 'not researched'; return; }
      const bits = ['verified ' + row.verified_date];
      if (row.warranty_years_cameras != null) bits.push('cam ' + row.warranty_years_cameras + 'y');
      if (row.ndaa_compliant != null) bits.push('NDAA ' + (row.ndaa_compliant ? '\u2713' : '\u2717'));
      if (row.meity_compliant != null) bits.push('MeitY ' + (row.meity_compliant ? '\u2713' : '\u2717'));
      meta.textContent = bits.join(' \u00B7 ');
    });
  } catch (e) {
    bcSetStatus('Load failed: ' + (e.message || e));
  }
}

async function bcResearchBrand(brand) {
  bcSetStatus('Researching ' + brand + '\u2026 (web search, ~30-60s)');
  const btn = document.querySelector('.bcResearchBtn[data-brand="' + brand + '"]');
  if (btn) { btn.disabled = true; btn.textContent = '\u2026'; }
  try {
    const headers = await getAiProxyHeaders();
    const res = await fetch(BC_FN_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ brand: brand })
    });
    const out = await res.json();
    if (!res.ok) {
      if (out.error === 'ADMIN_ONLY') { bcSetStatus('Admin only.'); return; }
      throw new Error(out.error + (out.detail ? (': ' + out.detail) : ''));
    }
    const n = (out.row && out.row.source_urls) ? out.row.source_urls.length : 0;
    bcSetStatus(brand + ' done \u2713 (' + n + ' sources)');
    bcLoadCurrentState();
  } catch (e) {
    bcSetStatus(brand + ' failed: ' + (e.message || e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Research'; }
  }
}

async function bcRefreshAll() {
  const allBtn = document.getElementById('bcRefreshAll');
  if (allBtn) allBtn.disabled = true;
  for (let i = 0; i < BC_BRANDS.length; i++) {
    bcSetStatus('Refresh All: ' + (i + 1) + '/' + BC_BRANDS.length + ' \u2014 ' + BC_BRANDS[i]);
    await bcResearchBrand(BC_BRANDS[i]);
  }
  bcSetStatus('Refresh All complete \u2713');
  if (allBtn) allBtn.disabled = false;
}
