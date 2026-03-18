/* ════════════════════════════════════════════════════════════════
   ryaview.ai — SPEC GENERATOR MODULE (FINAL)
   
   SINGLE ENTRY POINT:
   Called from the BOQ page after the integrator has built and
   confirmed the camera BOQ (and optionally the audio BOQ) for
   a customer. The spec document describes the minimum technical
   requirements derived from that confirmed BOQ.

   WORKFLOW:
   Customer requirement → Build BOQ → Confirm BOQ → Spec .docx

   BUTTON (inject into BOQ page grand total footer):
   <button class="btn btn-og btn-sm" id="spec-gen-btn"
     onclick="generateSpecDocx()">
     <svg ...></svg> Spec .docx
   </button>

   CDN dependency (add to <head>):
   <script src="https://cdn.jsdelivr.net/npm/docx@9.5.3/build/index.min.js"></script>
   ════════════════════════════════════════════════════════════════ */

/* ── ENTRY POINT ──────────────────────────────────────────────────
   No parameters — reads directly from live BOQ state variables.
   Called from a single button on the BOQ page.
   ─────────────────────────────────────────────────────────────── */
async function generateSpecDocx() {
  // ── Validate project meta ──
  if (!validateProjMeta()) return;
  const meta = getProjMeta();

  // ── Validate BOQ has content ──
  const camRows   = (boqRows   || []).filter(r => r.price > 0);
  const audioRows = (window.audioBoqRows || []).filter(r => r.price > 0);

  if (!camRows.length && !audioRows.length) {
    showToast('Build a Camera BOQ or Audio BOQ first, then generate the spec.');
    return;
  }

  const brand      = boqBrand || window.audioBoqBrand;
  const audioBrand = window.audioBoqBrand || null;

  if (!brand) {
    showToast('Select a brand and build your BOQ first.');
    return;
  }

  // ── Button state ──
  const btn = document.getElementById('spec-gen-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg style="animation:spin 1s linear infinite;width:11px;height:11px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Generating…`;
  }
  showToast('Generating specification document from your BOQ…');

  try {
    // ── Step 1: AI generates spec clauses from the confirmed BOQ ──
    const specContent = await _aiGenerateSpecClauses(brand, camRows, audioBrand, audioRows, meta);

    // ── Step 2: Build the .docx ──
    await _buildSpecDocx(brand, camRows, audioBrand, audioRows, meta, specContent);

    showToast('✓ Spec document downloaded successfully.');
    logUsage('spec_docx_export', brand);

  } catch(e) {
    showToast('Error generating spec: ' + e.message);
    console.error('Spec generator error:', e);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Spec .docx`;
    }
  }
}

/* ── AI CLAUSE GENERATOR ──────────────────────────────────────────
   Sends the confirmed BOQ to Claude and gets back structured
   specification clauses + compliance items.
   ─────────────────────────────────────────────────────────────── */
async function _aiGenerateSpecClauses(brand, camRows, audioBrand, audioRows, meta) {
  const camTypes   = [...new Set(camRows.map(r => r.type).filter(Boolean))];
  const audioTypes = [...new Set(audioRows.map(r => r.type || r.cat).filter(Boolean))];
  const hasAudio   = audioRows.length > 0;
  const totalCams  = camRows.reduce((s, r) => s + r.qty, 0);
  const totalAudio = audioRows.reduce((s, r) => s + r.qty, 0);

  // Build BOQ summary for the prompt
  const camSummary = camRows.map(r =>
    `${r.qty}x ${r.model} (${r.type}, ${r.res})`
  ).join(', ');
  const audioSummary = audioRows.map(r =>
    `${r.qty}x ${r.model} (${r.type || r.cat}${r.spl ? ', ' + r.spl + 'dB' : ''})`
  ).join(', ');

  const prompt = `You are a senior surveillance systems specification writer preparing a tender specification document for an Axis-authorised systems integrator in India.

CONFIRMED CUSTOMER BOQ:
Camera brand: ${brand}
Camera BOQ: ${camSummary || 'None'}
${hasAudio ? `Audio brand: ${audioBrand || brand}
Audio BOQ: ${audioSummary}` : 'No audio requirement.'}

Project: ${meta.site || 'Customer project'}
Client: ${meta.client || 'Customer'}

Write professional technical specification clauses based ONLY on the confirmed BOQ above.
Do NOT name the brand anywhere in the clause text — only describe functional requirements.
Clauses must be specific enough to match the confirmed products without being brand-exclusive.

Return ONLY valid JSON — no text, no markdown fences:
{
  "doc_title": "Technical Specification — [system type based on BOQ]",
  "scope_summary": "2-3 sentences describing the overall system scope",
  "camera_clauses": [
    {
      "clause_num": "2.1",
      "title": "Clause title",
      "text": "Full specification text — 2-4 sentences, cite standards where applicable.",
      "targets": "What capability this targets (optional, very short)",
      "eliminates": "What this eliminates (optional, very short)"
    }
  ],
  "audio_clauses": [
    {
      "clause_num": "3.1",
      "title": "Clause title",
      "text": "Full specification text.",
      "targets": "",
      "eliminates": ""
    }
  ],
  "general_clauses": [
    {
      "clause_num": "4.1",
      "title": "Clause title",
      "text": "Full specification text.",
      "targets": "",
      "eliminates": ""
    }
  ],
  "compliance_items": [
    {
      "requirement": "Requirement name",
      "minimum_spec": "Minimum required value",
      "our_provision": "What the proposed solution provides",
      "status": "COMPLIANT",
      "evidence": "Datasheet or document reference"
    }
  ]
}

MANDATORY RULES:
- camera_clauses: minimum 6 clauses — processing architecture, imaging/resolution, compression, cybersecurity, environmental/physical, warranty
- audio_clauses: only if audioRows provided — minimum 3 clauses (management, performance, SIP/integration)
- general_clauses: 2 clauses (warranty/support, integration/VMS)
- compliance_items: minimum 10 items covering: brand, resolution, IP rating, cybersecurity, PSIRT, signed firmware, operating temp, warranty, ONVIF, supply chain — and audio items if applicable
- ${brand === 'Axis' ? 'For Axis: reference ARTPEC chipset class, DLPU, AXIS OS, Edge Vault, Zipstream, 5yr warranty in our_provision fields. Audio: AXIS Audio Manager Edge, camera-event triggers.' : `For ${brand}: use actual product capabilities accurately.`}
- Never put brand names in clause text — only in compliance_items.our_provision`;

  const res = await fetch('https://ssytbjfhjuhgnvgdvgkh.supabase.co/functions/v1/ai-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'sb_publishable_xne4CDAl1nml80T7AVZGxA_Z8rwpSwZ',
      'Authorization': 'Bearer sb_publishable_xne4CDAl1nml80T7AVZGxA_Z8rwpSwZ'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await res.json();
  const text = (data.content || []).map(c => c.text || '').join('').trim();

  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch(e) {
    throw new Error('AI response parsing failed — please try again.');
  }
}

/* ── DOCX BUILDER ─────────────────────────────────────────────────
   Builds the Word document using docx.js (loaded via CDN).
   Embeds the ryaview logo as a real PNG image in header + cover.
   ─────────────────────────────────────────────────────────────── */
async function _buildSpecDocx(brand, camRows, audioBrand, audioRows, meta, spec) {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    ImageRun, Header, Footer, AlignmentType, BorderStyle, WidthType,
    ShadingType, LevelFormat, PageBreak, HeadingLevel, SimpleField
  } = window.docx;

  // ── Constants ──
  const CW    = 9026;
  const NAVY  = '0D1117';
  const BLUE  = '185FA5';
  const GOLD  = 'E8A820';
  const GREEN = '1D6A34';
  const RED   = '8B0000';
  const LGRAY = 'F4F4F4';
  const WHITE = 'FFFFFF';
  const dateStr = new Date(meta.date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  // ── Border helpers ──
  const bdr  = (c='CCCCCC') => ({ style: BorderStyle.SINGLE, size: 1, color: c });
  const allB = (c='CCCCCC') => ({ top: bdr(c), bottom: bdr(c), left: bdr(c), right: bdr(c) });
  const noB  = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBI = { top: noB, bottom: noB, left: noB, right: noB };

  // ── Text helpers ──
  const run  = (text, o={}) => new TextRun({ text, font: 'Arial', size: 22, ...o });
  const para = (children, o={}) => new Paragraph({ spacing: { before: 60, after: 80 }, children, ...o });
  const gap  = (b=160, a=160) => new Paragraph({ spacing: { before: b, after: a }, children: [] });
  const pb   = () => new Paragraph({ children: [new PageBreak()] });

  const h1 = (text) => new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, bold: true, size: 34, color: NAVY, font: 'Arial' })]
  });

  const divider = () => new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '4F8EF7', space: 1 } },
    children: []
  });

  const warnBox = (text) => new Paragraph({
    spacing: { before: 200, after: 200 },
    shading: { fill: 'FFF8E7', type: ShadingType.CLEAR },
    border: { left: { style: BorderStyle.SINGLE, size: 16, color: GOLD, space: 1 } },
    indent: { left: 300, right: 300 },
    children: [run(text, { size: 20, color: '7A5800', italics: true })]
  });

  // ── Logo image run ──
  let logoRunCover  = null;
  let logoRunHeader = null;
  if (window.RYAVIEW_LOGO_B64) {
    const b64    = window.RYAVIEW_LOGO_B64.split(',')[1];
    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const buf = bytes.buffer;

    // Cover: 50mm × ~12.8mm
    logoRunCover = new ImageRun({
      data: buf, type: 'png',
      transformation: { width: 1800000, height: 460800 }
    });
    // Header: 35mm × ~8.9mm (smaller)
    logoRunHeader = new ImageRun({
      data: buf, type: 'png',
      transformation: { width: 1260000, height: 322560 }
    });
  }

  // ── Clause block ──
  const clauseBlock = (num, title, text, targets, eliminates) => [
    new Paragraph({
      spacing: { before: 160, after: 40 },
      children: [
        run(num + '  ', { bold: true, color: BLUE }),
        run(title, { bold: true, color: NAVY }),
        ...(targets    ? [run('  [' + targets    + ']', { bold: true, size: 18, color: BLUE })] : []),
        ...(eliminates ? [run('  [' + eliminates + ']', { bold: true, size: 18, color: RED  })] : [])
      ]
    }),
    new Paragraph({
      indent: { left: 360 },
      spacing: { before: 0, after: 100 },
      border: { left: { style: BorderStyle.SINGLE, size: 4, color: 'CCDDEE', space: 1 } },
      children: [run(text, { color: '333333' })]
    })
  ];

  // ── Meta table ──
  const metaTable = () => {
    const cells = [
      ['CLIENT',        meta.client  || '—'],
      ['PROJECT / SITE', meta.site    || '—'],
      ['PREPARED BY',   meta.by      || '—'],
      ['DATE',          dateStr            ],
      ['CAMERA BRAND',  brand              ],
      ['VERSION',       'v1.0 — For review']
    ];
    const rows = [];
    for (let i = 0; i < cells.length; i += 2) {
      rows.push(new TableRow({
        children: [cells[i], cells[i + 1]].map(([lbl, val]) =>
          new TableCell({
            borders: noBI,
            width: { size: Math.floor(CW / 2), type: WidthType.DXA },
            shading: { fill: LGRAY, type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              para([run(lbl, { size: 17, color: '888888' })], { spacing: { before: 0, after: 20 } }),
              para([run(val, { bold: true, size: 22, color: NAVY })], { spacing: { before: 0, after: 0 } })
            ]
          })
        )
      }));
    }
    return new Table({
      width: { size: CW, type: WidthType.DXA },
      columnWidths: [Math.floor(CW / 2), Math.floor(CW / 2)],
      rows
    });
  };

  // ── Compliance table ──
  const compTable = (items) => {
    const cols = [2400, 2000, 2400, 1326, 900];
    const hdr = new TableRow({
      tableHeader: true,
      children: ['Requirement', 'Minimum Spec', brand + ' Provision', 'Status', 'Evidence'].map((h, i) =>
        new TableCell({
          borders: allB(), width: { size: cols[i], type: WidthType.DXA },
          shading: { fill: '1F4E79', type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [para([run(h, { bold: true, size: 18, color: WHITE })])]
        })
      )
    });
    const dataRows = items.map((item, ri) =>
      new TableRow({
        children: [item.requirement, item.minimum_spec, item.our_provision, item.status, item.evidence || '—']
          .map((cell, ci) => new TableCell({
            borders: allB(), width: { size: cols[ci], type: WidthType.DXA },
            shading: { fill: ri % 2 === 0 ? WHITE : LGRAY, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [para([run(cell, {
              size: ci === 3 ? 18 : 20,
              bold: ci === 3,
              color: ci === 3
                ? (cell === 'COMPLIANT' || cell === 'PASS' ? GREEN : cell === 'FAIL' ? RED : '666666')
                : (ci === 2 ? BLUE : '333333')
            })])]
          }))
      })
    );
    return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: cols, rows: [hdr, ...dataRows] });
  };

  // ── BOQ reference table ──
  const boqTable = (rows) => {
    const cols = [400, 3400, 1600, 900, 800, 900, 1026];
    const hdr = new TableRow({
      tableHeader: true,
      children: ['#', 'Model', 'Type / Category', 'Spec', 'Unit Price', 'Qty', 'Total'].map((h, i) =>
        new TableCell({
          borders: allB(), width: { size: cols[i], type: WidthType.DXA },
          shading: { fill: '1F4E79', type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [para([run(h, { bold: true, size: 18, color: WHITE })])]
        })
      )
    });
    const dataRows = rows.map((r, ri) => {
      const price = r.customPrice != null ? r.customPrice : r.price;
      const total = price * r.qty;
      return new TableRow({
        children: [
          String(ri + 1).padStart(2, '0'),
          r.model,
          r.type || r.cat || '—',
          r.res || (r.spl ? r.spl + 'dB' : '—'),
          price ? 'Rs.' + price.toLocaleString('en-IN') : '—',
          String(r.qty),
          total > 0 ? 'Rs.' + total.toLocaleString('en-IN') : '—'
        ].map((cell, ci) => new TableCell({
          borders: allB(), width: { size: cols[ci], type: WidthType.DXA },
          shading: { fill: ri % 2 === 0 ? WHITE : LGRAY, type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [para([run(cell, { size: 19, color: ci === 1 ? BLUE : '333333', bold: ci === 1 })])]
        }))
      });
    });
    return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: cols, rows: [hdr, ...dataRows] });
  };

  // ════════════════════════════════════════════════════════════
  // ASSEMBLE DOCUMENT CONTENT
  // ════════════════════════════════════════════════════════════
  const children = [];

  // ── Cover ──
  if (logoRunCover) {
    children.push(para([logoRunCover], { spacing: { before: 0, after: 180 } }));
  }
  children.push(para([run('TECHNICAL SPECIFICATION DOCUMENT', { bold: true, size: 40, color: NAVY })],
    { spacing: { before: 0, after: 40 } }));
  children.push(para([run(spec.doc_title || `IP Surveillance System — ${meta.site || 'Customer Project'}`, { size: 28, color: BLUE })],
    { spacing: { before: 0, after: 40 } }));
  children.push(para([run('Generated from confirmed BOQ  ·  No brand names in specification clauses  ·  For tender / customer submission',
    { size: 20, color: '888888', italics: true })], { spacing: { before: 0, after: 160 } }));
  children.push(divider());
  children.push(metaTable());
  children.push(gap(160, 0));
  children.push(warnBox(
    'IMPORTANT: All technical specifications in this document describe minimum functional requirements ' +
    'derived from the confirmed customer BOQ (' + brand + (audioBrand && audioBrand !== brand ? ' + ' + audioBrand : '') + '). ' +
    'No manufacturer brand name is specified as a mandatory requirement in the clauses. ' +
    'Specifications are generated by ryaview.ai — verify with a qualified systems integrator before ' +
    'formal tender submission.'
  ));
  children.push(pb());

  // ── Section 1: Scope ──
  children.push(h1('1.  Scope of Requirements'));
  children.push(para([run(spec.scope_summary || '', { color: '333333' })]));
  children.push(gap(80, 0));
  children.push(para([run('1.1  Quantity Summary', { bold: true, color: NAVY })],
    { spacing: { before: 120, after: 40 } }));
  // Camera quantities
  const typeMap = {};
  camRows.forEach(r => { typeMap[r.type || 'Camera'] = (typeMap[r.type || 'Camera'] || 0) + r.qty; });
  audioRows.forEach(r => { typeMap[r.type || r.cat || 'Audio'] = (typeMap[r.type || r.cat || 'Audio'] || 0) + r.qty; });
  Object.entries(typeMap).forEach(([type, qty]) => {
    children.push(new Paragraph({
      numbering: { reference: 'bullets', level: 0 }, spacing: { before: 40, after: 40 },
      children: [run(`${qty} \u00d7 ${type}`, { size: 22, color: '333333' })]
    }));
  });
  children.push(pb());

  // ── Section 2: Camera specs ──
  if ((spec.camera_clauses || []).length) {
    children.push(h1('2.  Camera System \u2014 Technical Specifications'));
    spec.camera_clauses.forEach(c => {
      clauseBlock(c.clause_num, c.title, c.text, c.targets, c.eliminates).forEach(p => children.push(p));
    });
    children.push(pb());
  }

  // ── Section 3: Audio specs ──
  let nextSec = 3;
  if ((spec.audio_clauses || []).length && audioRows.length) {
    children.push(h1(`${nextSec}.  Audio System \u2014 Technical Specifications`));
    spec.audio_clauses.forEach(c => {
      clauseBlock(c.clause_num, c.title, c.text, c.targets, c.eliminates).forEach(p => children.push(p));
    });
    children.push(pb());
    nextSec++;
  }

  // ── General clauses ──
  if ((spec.general_clauses || []).length) {
    children.push(h1(`${nextSec}.  General Requirements`));
    spec.general_clauses.forEach(c => {
      clauseBlock(c.clause_num, c.title, c.text, c.targets, c.eliminates).forEach(p => children.push(p));
    });
    children.push(pb());
    nextSec++;
  }

  // ── Compliance matrix ──
  children.push(h1(`${nextSec}.  Compliance Matrix \u2014 Proposed Solution`));
  children.push(para([run(
    `Verification of the proposed solution (${brand}) against the specified requirements. ` +
    `All specifications sourced from official manufacturer datasheets.`,
    { color: '555555' }
  )]));
  children.push(gap(100, 0));
  if ((spec.compliance_items || []).length) {
    children.push(compTable(spec.compliance_items));
  }
  children.push(pb());
  nextSec++;

  // ── BOQ reference ──
  children.push(h1(`${nextSec}.  Confirmed BOQ Reference`));
  children.push(para([run(
    'The following Bill of Quantities was confirmed prior to specification generation. ' +
    'All technical clauses above are derived from this customer BOQ.',
    { color: '555555' }
  )]));
  children.push(gap(100, 0));
  if (camRows.length) {
    children.push(para([run('Cameras \u2014 ' + brand, { bold: true, size: 22, color: NAVY })],
      { spacing: { before: 80, after: 60 } }));
    children.push(boqTable(camRows));
  }
  if (audioRows.length) {
    children.push(gap(120, 0));
    children.push(para([run('Audio \u2014 ' + (audioBrand || brand), { bold: true, size: 22, color: NAVY })],
      { spacing: { before: 80, after: 60 } }));
    children.push(boqTable(audioRows.map(r => ({
      model: r.model, type: r.type || r.cat, res: r.spl ? r.spl + 'dB' : '',
      price: r.price, qty: r.qty, customPrice: null
    }))));
  }

  // Grand total
  const allRows = [...camRows, ...audioRows];
  const grandTotal = allRows.reduce((s, r) => s + (r.customPrice != null ? r.customPrice : r.price) * r.qty, 0);
  children.push(gap(80, 0));
  children.push(para([
    run('Grand Total: ', { bold: true, size: 22, color: NAVY }),
    run('Rs. ' + grandTotal.toLocaleString('en-IN'), { bold: true, size: 22, color: GREEN }),
    run('  (Indicative, excl. GST, duties, freight)', { size: 18, color: '888888' })
  ]));

  children.push(pb());
  nextSec++;

  // ── Disclaimer ──
  children.push(h1(`${nextSec}.  Disclaimer`));
  children.push(warnBox(
    'This specification document was auto-generated by ryaview.ai from a customer BOQ confirmed by ' +
    'Aarya Surveillance Systems. All technical requirements describe minimum functional specifications ' +
    'and do not mandate any specific manufacturer brand. Vendors must submit official manufacturer ' +
    'datasheet evidence for each compliance claim. This document must be reviewed and approved by ' +
    'a qualified systems integrator before formal submission. ' +
    'ryaview.ai — Aarya Surveillance Systems, Hyderabad.'
  ));
  children.push(gap(200, 0));
  children.push(para([run(
    'ryaview.ai  \u00b7  Aarya Surveillance Systems  \u00b7  Hyderabad  \u00b7  ' + dateStr,
    { size: 18, color: '999999' }
  )], { alignment: AlignmentType.CENTER }));

  // ════════════════════════════════════════════════════════════
  // BUILD DOCUMENT
  // ════════════════════════════════════════════════════════════
  const doc = new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      }]
    },
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal',
          run: { size: 34, bold: true, font: 'Arial', color: NAVY },
          paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } }
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
        }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '4F8EF7' } },
            spacing: { after: 100 },
            children: [
              ...(logoRunHeader ? [logoRunHeader] : [run('ryaview.ai', { bold: true, size: 20, color: '4F8EF7' })]),
              run(
                `   Technical Specification  \u00b7  ${brand}  \u00b7  ${meta.client || 'Customer'}  \u00b7  Confidential`,
                { size: 17, color: '888888' }
              )
            ]
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: '4F8EF7' } },
            spacing: { before: 100 },
            alignment: AlignmentType.CENTER,
            children: [
              run(`ryaview.ai  \u00b7  Aarya Surveillance Systems  \u00b7  ${dateStr}  \u00b7  Page `, { size: 17, color: '888888' }),
              new SimpleField({ instruction: 'PAGE' })
            ]
          })]
        })
      },
      children
    }]
  });

  // ── Pack and trigger download ──
  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `ryaview_SpecDoc_${brand}_${(meta.site || 'Project').replace(/\W/g, '_').slice(0, 20)}_${new Date().toISOString().slice(0, 10)}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
