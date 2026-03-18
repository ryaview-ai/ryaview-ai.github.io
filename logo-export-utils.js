/* ════════════════════════════════════════════════════════════════
   ryaview.ai — LOGO ASSET + UNIVERSAL EXPORT HEADER/FOOTER
   
   HOW TO USE:
   1. The logo base64 constant below is the actual ryaview logo
      captured from the live site on 17 Mar 2026.
   2. Call drawPDFHeader(doc, dateStr) on every new PDF page.
   3. Call drawPDFFooter(doc, pageNum, totalPages, dateStr) on every page.
   4. For docx, use LOGO_DOCX_IMAGE_RUN() which returns an ImageRun.
   5. NEVER simulate the logo in code — always use this embedded image.
   ════════════════════════════════════════════════════════════════ */

/* ── LOGO BASE64 ──────────────────────────────────────────────────
   Source: ryaview-ai.github.io — captured 17 Mar 2026
   Size: 427×109px (original), embedded at 1x for PDF, 2x for docx
   Dark background (#0d1117), italic gold 'a', brushstroke, ryaview.ai
   ─────────────────────────────────────────────────────────────── */

// This constant is defined in ryaview-final.html — loaded at runtime
// For standalone modules, paste the base64 string from ryaview-logo-b64.txt
// or load it dynamically:

async function loadLogoBase64() {
  // If running in ryaview-final.html, the logo is already embedded
  // as window.RYAVIEW_LOGO_B64 set during build.
  // Fallback: load from the same origin.
  if (window.RYAVIEW_LOGO_B64) return window.RYAVIEW_LOGO_B64;
  try {
    const resp = await fetch('/ryaview-logo.png');
    const blob = await resp.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch(e) {
    console.warn('Logo load failed:', e);
    return null;
  }
}

/* ── UNIVERSAL PDF HEADER ─────────────────────────────────────────
   Call at the start of every page in every jsPDF document.
   Parameters:
     doc       — jsPDF instance
     logoB64   — base64 data URL of the ryaview logo
     subtitle  — right-side label e.g. "Bill of Quantities"
   Returns: Y position after header (start drawing content here)
   ─────────────────────────────────────────────────────────────── */

function drawPDFHeader(doc, logoB64, subtitle) {
  const PW = doc.internal.pageSize.getWidth();

  // Dark header bar
  doc.setFillColor(13, 17, 23);
  doc.rect(0, 0, PW, 20, 'F');

  // Gold accent line at top
  doc.setFillColor(232, 168, 32);
  doc.rect(0, 0, PW, 0.8, 'F');

  // Logo image — embed the actual PNG
  if (logoB64) {
    // Logo at 427×109px scaled to fit header height ~14mm
    // At 1:1 ratio: 427/109 = 3.92 aspect ratio
    const logoH = 10;   // mm height in PDF
    const logoW = logoH * (427 / 109); // ~39mm wide
    try {
      doc.addImage(logoB64, 'PNG', 6, 3, logoW, logoH);
    } catch(e) {
      // Fallback text if image fails
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text('ryaview', 8, 12);
      doc.setTextColor(232, 168, 32);
      doc.text('.ai', 8 + doc.getTextWidth('ryaview'), 12);
    }
  }

  // Right side — document type label
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(107, 133, 168);
    doc.text(subtitle, PW - 6, 8, { align: 'right' });
    doc.setTextColor(78, 100, 130);
    doc.text('CONFIDENTIAL — INTERNAL USE ONLY', PW - 6, 13, { align: 'right' });
  }

  return 24; // Y position after header — start content here
}

/* ── UNIVERSAL PDF FOOTER ─────────────────────────────────────────
   Call at the bottom of every page in every jsPDF document.
   Parameters:
     doc       — jsPDF instance
     meta      — { client, site, by, date } from getProjMeta()
     pageNum   — current page number (1-based)
     dateStr   — formatted date string
   ─────────────────────────────────────────────────────────────── */

function drawPDFFooter(doc, meta, pageNum, dateStr) {
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();

  // Footer separator line
  doc.setDrawColor(31, 45, 69);
  doc.setLineWidth(0.3);
  doc.line(6, PH - 10, PW - 6, PH - 10);

  // Left: client name
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(107, 133, 168);
  if (meta && meta.client) {
    doc.text(`Client: ${meta.client}`, 6, PH - 6);
  }

  // Center: date
  doc.text(dateStr || '', PW / 2, PH - 6, { align: 'center' });

  // Right: page number
  doc.text(`Page ${pageNum}`, PW - 6, PH - 6, { align: 'right' });
}

/* ── UNIVERSAL PDF PAGE SETUP ────────────────────────────────────
   Creates a new jsPDF doc with the correct dark background.
   All ryaview PDFs use the same dark theme.
   ─────────────────────────────────────────────────────────────── */

function newRyaviewPDF(orientation) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: orientation || 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();

  // Dark background
  doc.setFillColor(13, 17, 23);
  doc.rect(0, 0, PW, PH, 'F');

  return doc;
}

/* ── DOCX LOGO IMAGE RUN ─────────────────────────────────────────
   Returns a docx.js ImageRun with the ryaview logo.
   Call this inside a Paragraph for docx headers.

   Usage:
     new Paragraph({
       children: [ ryaviewLogoImageRun(logoBuffer) ]
     })

   Parameters:
     logoBuffer — ArrayBuffer of the PNG (loaded via fetch or fs.readFileSync)
     widthMM    — width in mm (default 50mm)
   ─────────────────────────────────────────────────────────────── */

function ryaviewLogoImageRun(logoBuffer, widthMM) {
  const { ImageRun } = window.docx || {}; // loaded via CDN
  // Logo original: 427×109px, aspect ~3.92
  const w = widthMM || 50;       // mm
  const h = w / (427 / 109);     // maintain aspect ratio
  // Convert mm to EMU (1mm = 36000 EMU)
  const wEMU = Math.round(w * 36000);
  const hEMU = Math.round(h * 36000);

  return new ImageRun({
    data: logoBuffer,
    transformation: { width: wEMU, height: hEMU },
    type: 'png'
  });
}

/* ════════════════════════════════════════════════════════════════
   IMPLEMENTATION CHECKLIST — apply to ALL existing PDF exports:

   CAMERA BOQ PDF (exportBoqPDF):
   ✅ Replace current logo drawing code with:
      const Y = drawPDFHeader(doc, window.RYAVIEW_LOGO_B64, 'Bill of Quantities');
   ✅ Replace footer with:
      drawPDFFooter(doc, getProjMeta(), pageNum, dateStr);

   CAMERA COMPARISON PDF (exportCmpPDF):
   ✅ Same header/footer pattern

   ALT BOQ PDF (exportAltPDF):
   ✅ Same header/footer pattern

   TCO PDF (exportTCOPDF):
   ✅ Same header/footer pattern

   AUDIO BOQ PDF (exportAudioBoqPDF):
   ✅ Same header/footer pattern

   AUDIO ALT BOQ PDF (exportAudioAltPDF):
   ✅ Same header/footer pattern

   SPEC GENERATOR DOCX:
   ✅ Use ryaviewLogoImageRun(logoBuffer, 50) in header paragraph

   TENDER COMPLIANCE DOCX (planned):
   ✅ Same docx pattern

   TOTAL EXPORTS THAT NEED THIS: 8
   ════════════════════════════════════════════════════════════════ */


/* ── LOGO LOADING FOR RUNTIME ────────────────────────────────────
   Add this to DOMContentLoaded in ryaview-final.html:

   window.RYAVIEW_LOGO_B64 = null;

   // Load logo on startup — all PDF exports wait for this
   (async () => {
     window.RYAVIEW_LOGO_B64 = await loadLogoBase64();
     console.log('ryaview logo loaded:', !!window.RYAVIEW_LOGO_B64);
   })();

   Then every PDF export function just calls:
     drawPDFHeader(doc, window.RYAVIEW_LOGO_B64, 'Bill of Quantities');

   The logo loads once on startup and is available to all exports.
   ─────────────────────────────────────────────────────────────── */
