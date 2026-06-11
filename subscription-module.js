/* ═══════════════════════════════════════════════
   RYAVIEW SUBSCRIPTION MODULE v1.0
   Plan fetch · gating · upgrade modal · Razorpay checkout
   ═══════════════════════════════════════════════ */

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzeXRiamZoanVoZ252Z2R2Z2toIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMzA3MTYsImV4cCI6MjA4ODYwNjcxNn0.pim0GxqgOdqgWNNRp15L3YA1yMEfTXbJKXMUBDFXcJc';
const SUPABASE_FN_URL   = 'https://ssytbjfhjuhgnvgdvgkh.supabase.co/functions/v1/razorpay-checkout';
const RZP_KEY_ID        = 'rzp_live_T008Bsexyq5Txm';
const FREE_BOQ_LIMIT    = 2;
const FREE_CMP_LIMIT    = 2;

let _currentPlan = 'free';

/* ── Fetch plan from subscriptions table ── */
async function fetchUserPlan() {
  if (!window._currentUser) return;
  try {
    const { data } = await window._sb.from('subscriptions')
      .select('plan, status, valid_until')
      .eq('user_id', window._currentUser.id)
      .single();
    _currentPlan = (data && data.status === 'active' && data.plan) ? data.plan : 'free';
  } catch(e) {
    _currentPlan = 'free';
  }
  updatePlanBadge();
}

/* ── Plan badge in header ── */
function updatePlanBadge() {
  let badge = document.getElementById('rv-plan-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'rv-plan-badge';
    badge.style.cssText = 'padding:3px 10px;border-radius:100px;font-size:10px;font-family:var(--fm);letter-spacing:0.06em;font-weight:600;margin-right:4px;cursor:pointer;transition:all .2s';
    const hright = document.querySelector('.hright');
    if (hright) hright.insertBefore(badge, hright.firstChild);
  }
  const styles = {
    free:  { text:'FREE',  bg:'rgba(144,174,206,0.08)', border:'1px solid rgba(144,174,206,0.2)',  color:'#90aece', cursor:'pointer' },
    pro:   { text:'PRO',   bg:'rgba(79,142,247,0.12)',  border:'1.5px solid rgba(79,142,247,0.4)', color:'#7aadfa', cursor:'default' },
    team:  { text:'TEAM',  bg:'rgba(0,200,83,0.08)',    border:'1.5px solid rgba(0,200,83,0.3)',   color:'#00c853', cursor:'default' }
  };
  const s = styles[_currentPlan] || styles.free;
  badge.textContent = s.text;
  badge.style.background = s.bg;
  badge.style.border = s.border;
  badge.style.color = s.color;
  badge.style.cursor = s.cursor;
  badge.title = _currentPlan === 'free' ? 'Upgrade plan' : 'Active plan: ' + s.text;
  badge.onclick = _currentPlan === 'free' ? () => showUpgradeModal('badge') : null;
}

/* ── Patch onAuthSuccess ── */
const _origOnAuth_sub = window.onAuthSuccess;
window.onAuthSuccess = function(user) {
  _origOnAuth_sub(user);
  fetchUserPlan();
};

/* ── Count today's events ── */
async function getTodayCount(action) {
  if (!window._currentUser) return 0;
  try {
    const today = new Date().toISOString().slice(0,10);
    const { data } = await window._sb.from('usage_events')
      .select('id')
      .eq('user_id', window._currentUser.id)
      .eq('action', action)
      .gte('ts', today + 'T00:00:00.000Z');
    return data ? data.length : 0;
  } catch(e) { return 0; }
}

/* ── Gate: BOQ PDF ── */
const _origExportBoqPDF_sub = window.exportBoqPDF;
window.exportBoqPDF = async function() {
  if (_currentPlan === 'free') {
    const n = await getTodayCount('boq_export');
    if (n >= FREE_BOQ_LIMIT) { showUpgradeModal('boq'); return; }
  }
  _origExportBoqPDF_sub();
};

/* ── Gate: BOQ Excel ── */
const _origExportBoqExcel_sub = window.exportBoqExcel;
window.exportBoqExcel = async function() {
  if (_currentPlan === 'free') {
    const n = await getTodayCount('boq_export');
    if (n >= FREE_BOQ_LIMIT) { showUpgradeModal('boq'); return; }
  }
  _origExportBoqExcel_sub();
};

/* ── Gate: Compare ── */
const _origRunCompare_sub = window.runCompare;
window.runCompare = async function() {
  if (_currentPlan === 'free') {
    const n = await getTodayCount('compare_run');
    if (n >= FREE_CMP_LIMIT) { showUpgradeModal('compare'); return; }
  }
  _origRunCompare_sub();
};

/* ══════════════════════════════════════
   UPGRADE MODAL
   ══════════════════════════════════════ */
function injectUpgradeModal() {
  if (document.getElementById('rv-upgrade-modal')) return;
  document.body.insertAdjacentHTML('beforeend', `
<div id="rv-upgrade-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(8,15,30,0.88);backdrop-filter:blur(10px);align-items:center;justify-content:center">
  <div style="background:#0d1829;border:1px solid #1c3050;border-radius:16px;padding:40px;max-width:660px;width:92%;position:relative;box-shadow:0 32px 80px rgba(0,0,0,0.65)">
    <button onclick="closeUpgradeModal()" style="position:absolute;top:14px;right:16px;background:none;border:none;color:#6080a8;font-size:22px;cursor:pointer;line-height:1;padding:4px 8px">×</button>
    <div style="font-size:10px;font-family:var(--fm);color:#4f8ef7;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:10px">ryaview.ai</div>
    <div id="rv-upgrade-headline" style="font-size:22px;font-weight:700;color:#edf4fc;letter-spacing:-0.02em;margin-bottom:6px">You've hit your daily free limit</div>
    <div id="rv-upgrade-sub" style="font-size:12px;color:#6080a8;margin-bottom:30px">Free plan: 2 BOQ exports/day · 2 comparisons/day</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
      <div style="background:#080f1e;border:1.5px solid rgba(79,142,247,0.4);border-radius:12px;padding:24px;position:relative">
        <div style="position:absolute;top:-10px;left:18px;background:#4f8ef7;color:#fff;font-size:9px;font-family:var(--fm);padding:2px 10px;border-radius:10px;letter-spacing:0.08em;font-weight:600">RECOMMENDED</div>
        <div style="font-size:14px;font-weight:700;color:#edf4fc;margin-bottom:6px">Pro</div>
        <div style="font-size:28px;font-weight:700;color:#7aadfa;letter-spacing:-0.03em;margin-bottom:18px">₹2,999<span style="font-size:12px;color:#6080a8;font-weight:400">/mo</span></div>
        <div style="font-size:11px;color:#90aece;line-height:2.1">
          ✓ Unlimited BOQ exports<br>
          ✓ Unlimited comparisons<br>
          ✓ AI verdicts &amp; scoring<br>
          ✓ PDF + Excel exports<br>
          ✓ TCO calculator<br>
          ✓ Priority email support
        </div>
        <button id="rv-btn-pro" onclick="startCheckout('pro')" style="margin-top:20px;width:100%;padding:11px;background:#4f8ef7;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--f)">Upgrade to Pro →</button>
      </div>
      <div style="background:#080f1e;border:1px solid #1c3050;border-radius:12px;padding:24px">
        <div style="font-size:14px;font-weight:700;color:#edf4fc;margin-bottom:6px">Team</div>
        <div style="font-size:28px;font-weight:700;color:#00c853;letter-spacing:-0.03em;margin-bottom:18px">₹7,999<span style="font-size:12px;color:#6080a8;font-weight:400">/mo</span></div>
        <div style="font-size:11px;color:#90aece;line-height:2.1">
          ✓ Everything in Pro<br>
          ✓ Tender compliance check<br>
          ✓ Reverse spec generator<br>
          ✓ Up to 5 team members<br>
          ✓ Priority phone support<br>
          <span style="color:#4a6080">⏳ Tender module — coming soon</span>
        </div>
        <button id="rv-btn-team" onclick="startCheckout('team')" style="margin-top:20px;width:100%;padding:11px;background:transparent;color:#00c853;border:1px solid rgba(0,200,83,0.3);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--f)">Upgrade to Team →</button>
      </div>
    </div>
    <div style="text-align:center;font-size:10px;color:#4a6080;font-family:var(--fm)">Billed monthly · Cancel anytime · Payments secured by Razorpay</div>
  </div>
</div>`);
}

function showUpgradeModal(trigger) {
  injectUpgradeModal();
  const hl = document.getElementById('rv-upgrade-headline');
  const sb = document.getElementById('rv-upgrade-sub');
  if (trigger === 'boq') {
    hl.textContent = "Daily BOQ limit reached";
    sb.textContent = "Free plan allows 2 BOQ exports per day. Upgrade for unlimited.";
  } else if (trigger === 'compare') {
    hl.textContent = "Daily comparison limit reached";
    sb.textContent = "Free plan allows 2 comparisons per day. Upgrade for unlimited.";
  } else {
    hl.textContent = "Upgrade ryaview";
    sb.textContent = "Free plan: 2 BOQ exports/day · 2 comparisons/day";
  }
  document.getElementById('rv-upgrade-modal').style.display = 'flex';
}

function closeUpgradeModal() {
  const m = document.getElementById('rv-upgrade-modal');
  if (m) m.style.display = 'none';
}

/* ══════════════════════════════════════
   RAZORPAY CHECKOUT
   ══════════════════════════════════════ */
async function startCheckout(plan) {
  const btn = document.getElementById('rv-btn-' + plan);
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Please wait…'; }
  try {
    const res = await fetch(SUPABASE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ plan, user_email: window._currentUser?.email })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Checkout failed');
    if (btn) { btn.disabled = false; btn.textContent = orig; }
    _openRzpModal(plan, d.subscription_id);
  } catch(err) {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
    if (window.showToast) showToast('Checkout error: ' + err.message);
    else alert('Checkout error: ' + err.message);
  }
}

function _openRzpModal(plan, subId) {
  const isPro = plan === 'pro';
  const options = {
    key: RZP_KEY_ID,
    subscription_id: subId,
    name: 'ryaview.ai',
    description: isPro ? 'Pro — ₹2,999/month' : 'Team — ₹7,999/month',
    prefill: { email: window._currentUser?.email || '' },
    theme: { color: '#4f8ef7' },
    modal: { ondismiss: function() { if (window.showToast) showToast('Payment cancelled.'); } },
    handler: function() {
      closeUpgradeModal();
      if (window.showToast) showToast('Payment received! Activating plan…');
      setTimeout(async () => {
        await fetchUserPlan();
        if (window.showToast) showToast('Plan activated. Welcome to ' + (isPro ? 'Pro' : 'Team') + '!');
      }, 3500);
    }
  };
  const rzp = new Razorpay(options);
  rzp.open();
}

/* ── Load Razorpay JS ── */
(function() {
  if (window.Razorpay) return;
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  document.head.appendChild(s);
})();

/* ── Fallback: user already logged in when module loaded ── */
(function tryImmediately() {
  if (window._currentUser) {
    fetchUserPlan();
  } else {
    // Poll briefly in case auth resolves just after module load
    let attempts = 0;
    const poll = setInterval(function() {
      attempts++;
      if (window._currentUser) {
        clearInterval(poll);
        fetchUserPlan();
      } else if (attempts > 20) {
        clearInterval(poll);
      }
    }, 300);
  }
})();
