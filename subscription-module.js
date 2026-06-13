/* ═══════════════════════════════════════════════
   RYAVIEW SUBSCRIPTION MODULE v1.1
   Plan fetch · gating · upgrade modal · billing modal · Razorpay checkout
   ═══════════════════════════════════════════════ */

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzeXRiamZoanVoZ252Z2R2Z2toIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMzA3MTYsImV4cCI6MjA4ODYwNjcxNn0.pim0GxqgOdqgWNNRp15L3YA1yMEfTXbJKXMUBDFXcJc';
const SUPABASE_FN_URL   = 'https://ssytbjfhjuhgnvgdvgkh.supabase.co/functions/v1/razorpay-checkout';
const RZP_KEY_ID        = 'rzp_test_T0zjCTcKkszEfl';
const FREE_BOQ_LIMIT    = 2;
const FREE_CMP_LIMIT    = 2;

let _currentPlan       = 'free';
let _currentStatus     = 'active';
let _currentValidUntil = null;
let _currentSubId      = null;

/* ── Fetch plan from subscriptions table ── */
async function fetchUserPlan() {
  if (!_currentUser) return;
  try {
    const { data } = await _sb.from('subscriptions')
      .select('plan, status, valid_until, razorpay_sub_id')
      .eq('user_id', _currentUser.id)
      .single();

    _currentStatus     = data?.status       || 'active';
    _currentValidUntil = data?.valid_until  || null;
    _currentSubId      = data?.razorpay_sub_id || null;

    _currentPlan = (data && data.plan && (
      data.status === 'active' ||
      (data.status === 'cancelled' && data.valid_until && new Date(data.valid_until) > new Date())
    )) ? data.plan : 'free';
  } catch(e) {
    _currentPlan       = 'free';
    _currentStatus     = 'active';
    _currentValidUntil = null;
    _currentSubId      = null;
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
    free:  { text:'FREE',  bg:'rgba(144,174,206,0.08)', border:'1px solid rgba(144,174,206,0.2)',  color:'90aece' },
    pro:   { text:'PRO',   bg:'rgba(79,142,247,0.12)',  border:'1.5px solid rgba(79,142,247,0.4)', color:'#7aadfa' },
    team:  { text:'TEAM',  bg:'rgba(0,200,83,0.08)',    border:'1.5px solid rgba(0,200,83,0.3)',   color:'#00c853' }
  };
  const s = styles[_currentPlan] || styles.free;
  badge.textContent = s.text;
  badge.style.background = s.bg;
  badge.style.border      = s.border;
  badge.style.color       = s.color;
  badge.style.cursor      = 'pointer';
  badge.title  = _currentPlan === 'free' ? 'Upgrade plan' : 'Manage subscription';
  badge.onclick = _currentPlan === 'free' ? () => showUpgradeModal('badge') : () => showBillingModal();
}

/* ── Patch onAuthSuccess ── */
const _origOnAuth_sub = window.onAuthSuccess;
window.onAuthSuccess = function(user) {
  _origOnAuth_sub(user);
  fetchUserPlan();
};

/* ── Count today's events ── */
async function getTodayCount(action) {
  if (!_currentUser) return 0;
  try {
    const today = new Date().toISOString().slice(0,10);
    const { data } = await _sb.from('usage_events')
      .select('id')
      .eq('user_id', _currentUser.id)
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
   BILLING MODAL
   ══════════════════════════════════════ */
function injectBillingModal() {
  if (document.getElementById('rv-billing-modal')) return;
  document.body.insertAdjacentHTML('beforeend', `
<div id="rv-billing-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(8,15,30,0.88);backdrop-filter:blur(10px);align-items:center;justify-content:center">
  <div style="background:rgba(13,24,41,0.82);border:1px solid rgba(79,142,247,0.2);border-radius:16px;padding:40px;max-width:480px;width:92%;position:relative;box-shadow:0 32px 80px rgba(0,0,0,0.65),0 0 0 1px rgba(255,255,255,0.04) inset;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)">
    <button onclick="closeBillingModal()" style="position:absolute;top:14px;right:16px;background:none;border:none;color:#6080a8;font-size:22px;cursor:pointer;line-height:1;padding:4px 8px">×</button>
    <div style="font-size:10px;font-family:var(--fm);color:#4f8ef7;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:10px">ryaview.ai</div>
    <div style="font-size:20px;font-weight:700;color:#edf4fc;letter-spacing:-0.02em;margin-bottom:24px">Your Subscription</div>
    <div id="rv-billing-body"></div>
  </div>
</div>`);
}

function _billingBody() {
  const planColor = { pro:'#7aadfa', team:'#00c853', free:'#90aece' }[_currentPlan] || '#90aece';
  const planLabel = { pro:'PRO', team:'TEAM', free:'FREE' }[_currentPlan] || 'FREE';

  let validStr = '';
  if (_currentValidUntil) {
    const d = new Date(_currentValidUntil);
    validStr = d.toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
  }

  const isCancelled = _currentStatus === 'cancelled';
  const isPaid      = _currentPlan !== 'free';

  let statusHtml = '';
  if (isPaid && isCancelled) {
    statusHtml = `<div style="background:rgba(255,160,0,0.08);border:1px solid rgba(255,160,0,0.25);border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:12px;color:#ffa000;line-height:1.6">
      ⚠ Subscription cancelled. Access continues until <strong>${validStr}</strong>, then reverts to Free.
    </div>`;
  } else if (isPaid && validStr) {
    statusHtml = `<div style="background:rgba(79,142,247,0.06);border:1px solid rgba(79,142,247,0.15);border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:12px;color:#90aece;line-height:1.6">
      Next billing date: <strong style="color:#edf4fc">${validStr}</strong>
    </div>`;
  }

  let cancelHtml = '';
  if (isPaid && !isCancelled) {
    cancelHtml = `
    <div id="rv-cancel-confirm" style="display:none;background:rgba(244,67,54,0.06);border:1px solid rgba(244,67,54,0.2);border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="font-size:12px;color:#ef9a9a;margin-bottom:12px">Cancel at end of billing cycle? You keep access until <strong>${validStr}</strong>.</div>
      <div style="display:flex;gap:8px">
        <button onclick="cancelSubscription()" id="rv-confirm-cancel-btn" style="flex:1;padding:9px;background:#f44336;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--f)">Yes, cancel</button>
        <button onclick="document.getElementById('rv-cancel-confirm').style.display='none'" style="flex:1;padding:9px;background:transparent;color:#6080a8;border:1px solid #1c3050;border-radius:6px;font-size:12px;cursor:pointer;font-family:var(--f)">Keep plan</button>
      </div>
    </div>
    <button onclick="document.getElementById('rv-cancel-confirm').style.display='block'" style="width:100%;padding:10px;background:transparent;color:#6080a8;border:1px solid #1c3050;border-radius:8px;font-size:12px;cursor:pointer;font-family:var(--f);margin-bottom:4px">Cancel subscription</button>`;
  }

  const upgradeHtml = !isPaid
    ? `<button onclick="closeBillingModal();showUpgradeModal('badge')" style="width:100%;padding:11px;background:#4f8ef7;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--f)">Upgrade to Pro →</button>`
    : '';

  return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <div style="font-size:13px;color:#6080a8">Current plan</div>
      <div style="padding:4px 14px;border-radius:100px;font-size:11px;font-weight:700;font-family:var(--fm);letter-spacing:0.06em;background:rgba(79,142,247,0.1);border:1.5px solid rgba(79,142,247,0.3);color:${planColor}">${planLabel}</div>
    </div>
    ${statusHtml}
    ${cancelHtml}
    ${upgradeHtml}
    <div style="margin-top:16px;text-align:center;font-size:10px;color:#4a6080;font-family:var(--fm)">Questions? <a href="mailto:support@ryaview.ai" style="color:#4f8ef7;text-decoration:none">support@ryaview.ai</a></div>
  `;
}

function showBillingModal() {
  injectBillingModal();
  document.getElementById('rv-billing-body').innerHTML = _billingBody();
  document.getElementById('rv-billing-modal').style.display = 'flex';
}

function closeBillingModal() {
  const m = document.getElementById('rv-billing-modal');
  if (m) m.style.display = 'none';
}

async function cancelSubscription() {
  const btn = document.getElementById('rv-confirm-cancel-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }
  try {
    const { data: { session } } = await _sb.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error('Not logged in');
    const res = await fetch(SUPABASE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken
      },
      body: JSON.stringify({ action: 'cancel' })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Cancel failed');
    closeBillingModal();
    await fetchUserPlan();
    if (window.showToast) showToast('Subscription cancelled. Access continues until end of billing cycle.');
  } catch(err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Yes, cancel'; }
    if (window.showToast) showToast('Error: ' + err.message);
    else alert('Error: ' + err.message);
  }
}

/* ══════════════════════════════════════
   UPGRADE MODAL
   ══════════════════════════════════════ */
function injectUpgradeModal() {
  if (document.getElementById('rv-upgrade-modal')) return;
  document.body.insertAdjacentHTML('beforeend', `
<div id="rv-upgrade-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(8,15,30,0.88);backdrop-filter:blur(10px);align-items:center;justify-content:center">
  <div style="background:rgba(13,24,41,0.82);border:1px solid rgba(79,142,247,0.2);border-radius:16px;padding:40px;max-width:660px;width:92%;position:relative;box-shadow:0 32px 80px rgba(0,0,0,0.65),0 0 0 1px rgba(255,255,255,0.04) inset;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)">
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
          ✓ Priority phone support
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
  } else if (trigger === 'tender') {
    hl.textContent = "Tender Compliance — Team Feature";
    sb.textContent = "Upload tender PDFs and auto-generate compliance BOQs. Available on Team plan only.";
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
    const { data: { session } } = await _sb.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error('Not logged in');
    const res = await fetch(SUPABASE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken
      },
      body: JSON.stringify({ action: 'checkout', plan })
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
    prefill: { email: _currentUser?.email || '' },
    theme: { color: '#4f8ef7' },
    modal: { ondismiss: function() {
      const planBefore = _currentPlan;
      let tries = 0;
      function _pollPlanActivation() {
        tries++;
        fetchUserPlan().then(function() {
          if ((_currentPlan === 'pro' || _currentPlan === 'team') && _currentPlan !== planBefore) {
            if (window.showToast) showToast('Plan activated! Welcome to ' + (_currentPlan === 'pro' ? 'Pro' : 'Team') + '! 🎉');
          } else if (tries < 10) {
            setTimeout(_pollPlanActivation, 3000);
          } else {
            if (window.showToast) showToast('Payment cancelled. If UPI mandate was approved, your plan activates shortly — refresh to check.');
          }
        });
      }
      setTimeout(_pollPlanActivation, 3000);
    } },
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
  if (_currentUser) {
    fetchUserPlan();
  } else {
    let attempts = 0;
    const poll = setInterval(function() {
      attempts++;
      if (_currentUser) {
        clearInterval(poll);
        fetchUserPlan();
      } else if (attempts > 20) {
        clearInterval(poll);
      }
    }, 300);
  }
})();
