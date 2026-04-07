import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } from 'docx';
import { PatentData } from '../types';

// Convert a bare base64 string (no data: prefix) to Uint8Array for docx ImageRun
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

// Get an image's natural dimensions from a data URL
const getImageSize = (src: string): Promise<{ w: number; h: number }> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 400, h: 300 });
    img.src = src;
  });

// Render a Mermaid code string to SVG using the already-initialised mermaid instance
const renderMermaidSvg = async (code: string, idx: number): Promise<string | null> => {
  try {
    const mermaidModule = (await import('mermaid')).default;
    const { svg } = await mermaidModule.render(`exp-mmd-${idx}-${Date.now()}`, code);
    return svg;
  } catch (e) {
    console.warn('Mermaid SVG render failed for diagram', idx, e);
    return null;
  }
};

// Convert a Mermaid SVG string to a PNG base64 string via an off-screen canvas.
// Uses a base64 data URL (not a blob URL) to avoid canvas taint security errors.
// Returns null on failure so the caller can skip the diagram gracefully.
const svgToPngBase64 = (
  svg: string,
): Promise<{ pngBase64: string; w: number; h: number } | null> =>
  new Promise((resolve) => {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
    const svgEl = svgDoc.querySelector('svg');

    // Prefer explicit width/height attrs, then fall back to viewBox
    const parseLen = (v: string | null) => v ? parseFloat(v) : NaN;
    let w = parseLen(svgEl?.getAttribute('width') ?? null);
    let h = parseLen(svgEl?.getAttribute('height') ?? null);
    if (!w || !h) {
      const vb = svgEl?.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
      if (vb && vb.length === 4) { w = vb[2] || 800; h = vb[3] || 500; }
    }
    if (!w || !h || isNaN(w) || isNaN(h)) { w = 800; h = 500; }

    // Encode SVG as base64 data URL — same-origin by definition, never taints the canvas
    const b64Svg = btoa(unescape(encodeURIComponent(svg)));
    const dataUrl = `data:image/svg+xml;base64,${b64Svg}`;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      try {
        ctx.drawImage(img, 0, 0, w, h);
        const pngBase64 = canvas.toDataURL('image/png').replace('data:image/png;base64,', '');
        resolve({ pngBase64, w, h });
      } catch (e) {
        console.warn('svgToPngBase64 canvas draw failed:', e);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });

// Smart HTML → plain text that preserves ordered/unordered list numbering.
// A naive textContent strip loses "<ol><li>" numbers, which breaks patent
// claim export (items should read "1. … 2. …" in the output document).
const htmlToPlainText = (html: string | undefined): string => {
  if (!html) return '';
  let processed = html;
  // Ordered lists: restore "N. text" numbering
  processed = processed.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner) => {
    let n = 1;
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_li: string, content: string) => {
      const num = n++;
      const tmp = document.createElement('DIV');
      tmp.innerHTML = content;
      return `\n${num}. ${(tmp.textContent || tmp.innerText || '').trim()}\n`;
    });
  });
  // Unordered lists: "- text"
  processed = processed.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, inner) => {
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_li: string, content: string) => {
      const tmp = document.createElement('DIV');
      tmp.innerHTML = content;
      return `\n- ${(tmp.textContent || tmp.innerText || '').trim()}\n`;
    });
  });
  // Block-level elements add line breaks
  processed = processed.replace(/<\/(p|div|h[1-6])>/gi, '\n');
  processed = processed.replace(/<br\s*\/?>/gi, '\n');
  const tmp = document.createElement('DIV');
  tmp.innerHTML = processed;
  return (tmp.textContent || tmp.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
};

// Keep a simple stripHtml alias for non-structural fields (title, short fields)
const stripHtml = htmlToPlainText;

// Format text with patent numbering
const formatWithNumbering = (content: string, startNum: number = 1): string[] => {
  const blocks = content.split(/\n\n+/).filter(b => b.trim());
  if (blocks.length === 0) return [content];

  return blocks.map((block, idx) => {
    const num = String(startNum + idx).padStart(4, '0');
    return `[${num}] ${block.trim()}`;
  });
};

// Convert KaTeX to Unicode approximations (basic)
const katexToUnicode = (text: string): string => {
  // Basic replacements for common math symbols
  return text
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\delta/g, 'δ')
    .replace(/\\pi/g, 'π')
    .replace(/\\sigma/g, 'σ')
    .replace(/\\omega/g, 'ω')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\mu/g, 'μ')
    .replace(/\\eta/g, 'η')
    .replace(/\\rho/g, 'ρ')
    .replace(/\\tau/g, 'τ')
    .replace(/\\phi/g, 'φ')
    .replace(/\\psi/g, 'ψ')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\sum/g, 'Σ')
    .replace(/\\prod/g, '∏')
    .replace(/\\int/g, '∫')
    .replace(/\\cdot/g, '·')
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\left\[/g, '[')
    .replace(/\\right\]/g, ']')
    .replace(/\^{([^}]+)}/g, '^$1')
    .replace(/_ {([^}]+)}/g, '_$1');
};

// mermaidSvgCache: keyed by diagram index, contains already-rendered SVG strings
// (populated by Editor's MermaidRenderer onSvgReady callbacks).
export const exportToDocx = async (
  patentData: PatentData,
  mermaidSvgCache: Record<number, string> = {},
): Promise<Blob> => {
  const { title, technicalField, backgroundArt, inventionContent, abstract, claims, descriptionOfDrawings, detailedDescription, drawings, mermaidDiagrams } = patentData;

  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      text: title || '未命名专利',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Abstract
  children.push(
    new Paragraph({
      text: '摘要',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );
  const abstractText = katexToUnicode(stripHtml(abstract));
  children.push(
    new Paragraph({
      children: [new TextRun(abstractText || '暂无摘要')],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 300 },
    })
  );

  // Claims
  children.push(
    new Paragraph({
      text: '权利要求书',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );
  const claimsText = katexToUnicode(stripHtml(claims));
  if (claimsText) {
    const claimLines = claimsText.split('\n').filter(l => l.trim());
    claimLines.forEach(line => {
      children.push(
        new Paragraph({
          children: [new TextRun(line)],
          spacing: { after: 100 },
        })
      );
    });
  } else {
    children.push(new Paragraph({ text: '暂无权利要求', spacing: { after: 200 } }));
  }

  // Description - Technical Field
  children.push(
    new Paragraph({
      text: '说明书',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );

  children.push(
    new Paragraph({
      text: '技术领域',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
    })
  );
  const tfText = katexToUnicode(stripHtml(technicalField));
  children.push(
    new Paragraph({
      children: [new TextRun(tfText || '暂无')],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200 },
    })
  );

  // Background Art
  children.push(
    new Paragraph({
      text: '背景技术',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
    })
  );
  const baText = katexToUnicode(stripHtml(backgroundArt));
  children.push(
    new Paragraph({
      children: [new TextRun(baText || '暂无')],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200 },
    })
  );

  // Invention Content
  children.push(
    new Paragraph({
      text: '发明内容',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
    })
  );
  const icText = katexToUnicode(stripHtml(inventionContent));
  children.push(
    new Paragraph({
      children: [new TextRun(icText || '暂无')],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200 },
    })
  );

  // Description of Drawings
  children.push(
    new Paragraph({
      text: '附图说明',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
    })
  );
  const dodText = katexToUnicode(stripHtml(descriptionOfDrawings));
  children.push(
    new Paragraph({
      children: [new TextRun(dodText || '暂无')],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200 },
    })
  );

  // Detailed Description
  children.push(
    new Paragraph({
      text: '具体实施方式',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
    })
  );
  const ddText = katexToUnicode(stripHtml(detailedDescription));
  const numberedLines = formatWithNumbering(ddText, 1);
  numberedLines.forEach(line => {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: line, font: 'Times New Roman', size: 22 })],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 100 },
        indent: { firstLine: 720 }, // ~0.5 inch
      })
    );
  });

  // ---- 说明书附图 ----
  const hasMermaid = mermaidDiagrams && mermaidDiagrams.length > 0;
  const hasDrawings = drawings && drawings.length > 0;

  if (hasMermaid || hasDrawings) {
    children.push(
      new Paragraph({
        text: '说明书附图',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    const MAX_W_PX = 500;

    // Mermaid diagrams → SVG → PNG → ImageRun
    // Prefer cached SVG from the Editor (already rendered in-page).
    // Only fall back to renderMermaidSvg if the cache is missing for this index.
    if (hasMermaid) {
      for (let i = 0; i < mermaidDiagrams!.length; i++) {
        const svg = mermaidSvgCache[i] ?? await renderMermaidSvg(mermaidDiagrams![i], i);
        if (!svg) continue;
        const result = await svgToPngBase64(svg);
        if (!result) continue;
        const { pngBase64, w, h } = result;
        const scale = Math.min(1, MAX_W_PX / w);
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: 'png',
                data: base64ToUint8Array(pngBase64),
                transformation: { width: Math.round(w * scale), height: Math.round(h * scale) },
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 50 },
          })
        );
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `图 ${i + 1}`, bold: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        );
      }
    }

    // User-uploaded images (base64 JPEG)
    if (hasDrawings) {
      const mermaidCount = mermaidDiagrams?.length ?? 0;
      for (let i = 0; i < drawings!.length; i++) {
        const b64 = drawings![i];
        const { w, h } = await getImageSize(`data:image/jpeg;base64,${b64}`);
        const scale = Math.min(1, MAX_W_PX / w);
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: 'jpg',
                data: base64ToUint8Array(b64),
                transformation: { width: Math.round(w * scale), height: Math.round(h * scale) },
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 50 },
          })
        );
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `图 ${mermaidCount + i + 1}`, bold: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 1 inch margins
        },
      },
      children,
    }],
  });

  return await Packer.toBlob(doc);
};

// Build a self-contained HTML string for PDF rendering (browser renders CJK correctly)
const buildPatentHtmlForPdf = (patentData: PatentData, mermaidSvgs: string[]): string => {
  const { title, technicalField, backgroundArt, inventionContent, abstract, claims, descriptionOfDrawings, detailedDescription, patentType, drawings } = patentData;
  const isInvention = patentType === 'invention';
  const inventionSectionLabel = isInvention ? '发明内容' : '实用新型内容';

  const section = (heading: string, content: string | undefined) => {
    if (!content) return '';
    return `
      <h2 style="font-size:15px;font-weight:bold;margin:16px 0 6px;">${heading}</h2>
      <div style="font-size:13px;line-height:1.9;text-align:justify;">${content || ''}</div>
    `;
  };

  const numberedDesc = formatWithNumbering(htmlToPlainText(detailedDescription), 1)
    .map(l => `<p style="margin:0 0 6px;text-indent:2em;">${l}</p>`).join('');

  // Build drawings section HTML
  let drawingsSection = '';
  const hasFigures = mermaidSvgs.length > 0 || (drawings && drawings.length > 0);
  if (hasFigures) {
    const figureItems: string[] = [];
    mermaidSvgs.forEach((svg, idx) => {
      // Keep viewBox but replace width/height attrs with CSS-controlled dimensions
      // so the SVG fills its container without overflowing.
      const scaledSvg = svg
        .replace(/<svg([^>]*)\s+width="[^"]*"/gi, '<svg$1')
        .replace(/<svg([^>]*)\s+height="[^"]*"/gi, '<svg$1')
        .replace('<svg', '<svg width="100%" style="display:block;height:auto;" ');
      figureItems.push(`
        <div style="break-inside:avoid;text-align:center;margin-bottom:20px;">
          <div style="border:1px solid #ddd;padding:8px;background:#fff;box-sizing:border-box;width:100%;">
            ${scaledSvg}
          </div>
          <div style="font-weight:bold;font-size:12px;margin-top:6px;">图 ${idx + 1}</div>
        </div>`);
    });
    const mCount = mermaidSvgs.length;
    (drawings || []).forEach((b64, idx) => {
      figureItems.push(`
        <div style="break-inside:avoid;text-align:center;margin-bottom:20px;">
          <div style="border:1px solid #ddd;padding:8px;background:#fff;display:inline-block;">
            <img src="data:image/jpeg;base64,${b64}" style="max-width:340px;max-height:260px;object-fit:contain;display:block;"/>
          </div>
          <div style="font-weight:bold;font-size:12px;margin-top:6px;">图 ${mCount + idx + 1}</div>
        </div>`);
    });
    drawingsSection = `
      <div style="page-break-before:always;">
        <h1 style="font-size:17px;font-weight:bold;text-align:center;margin:0 0 20px;">说　明　书　附　图</h1>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 20px;align-items:start;">
          ${figureItems.join('')}
        </div>
      </div>`;
  }

  return `
    <div style="
      width:794px;
      background:#fff;
      color:#000;
      font-family:'SimSun','STSong','Source Han Serif CN','Noto Serif CJK SC',serif;
      font-size:13px;
      line-height:1.9;
      padding:50px 60px;
      box-sizing:border-box;
    ">
      <h1 style="font-size:20px;font-weight:bold;text-align:center;margin-bottom:8px;">${title || '未命名专利'}</h1>
      <hr style="margin:12px 0 20px;border-color:#ccc;">

      <h2 style="font-size:16px;font-weight:bold;margin:0 0 6px;">摘　要</h2>
      <div style="font-size:13px;line-height:1.9;text-align:justify;">${abstract || '暂无摘要'}</div>

      <hr style="margin:20px 0;border-color:#ccc;">

      <h2 style="font-size:16px;font-weight:bold;margin:0 0 6px;">权　利　要　求　书</h2>
      <div style="font-size:13px;line-height:1.9;">${claims || '暂无权利要求'}</div>

      <hr style="margin:20px 0;border-color:#ccc;">

      <h1 style="font-size:17px;font-weight:bold;text-align:center;margin-bottom:12px;">说　　明　　书</h1>
      ${section('技术领域', technicalField)}
      ${section('背景技术', backgroundArt)}
      ${section(inventionSectionLabel, inventionContent)}
      ${descriptionOfDrawings ? section('附图说明', descriptionOfDrawings) : ''}
      <h2 style="font-size:15px;font-weight:bold;margin:16px 0 6px;">具体实施方式</h2>
      <div style="font-size:13px;line-height:1.9;">${numberedDesc}</div>

      ${drawingsSection}
    </div>
  `;
};

// Open the patent as a styled HTML page in a new tab and auto-trigger the
// browser's print dialog so the user can "Save as PDF". This is the most
// reliable approach for CJK text because the browser uses its own font engine.
export const exportToPdf = async (
  patentData: PatentData,
  mermaidSvgCache: Record<number, string> = {},
): Promise<void> => {
  const { title, mermaidDiagrams } = patentData;

  // Use cached SVG strings from the Editor where available.
  // Only fall back to renderMermaidSvg for uncached diagrams.
  const mermaidSvgs: string[] = [];
  if (mermaidDiagrams && mermaidDiagrams.length > 0) {
    for (let i = 0; i < mermaidDiagrams.length; i++) {
      const svg = mermaidSvgCache[i] ?? await renderMermaidSvg(mermaidDiagrams[i], i);
      mermaidSvgs.push(svg ?? '<p style="color:gray;text-align:center;">[图表渲染失败]</p>');
    }
  }

  const bodyContent = buildPatentHtmlForPdf(patentData, mermaidSvgs);

  const escTitle = (title || '专利申请书')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escTitle}</title>
  <style>
    @page { size: A4; margin: 20mm 25mm; }
    html, body { margin: 0; padding: 0; background: #f0f2f5; }
    body { font-family: 'SimSun', 'STSong', 'Source Han Serif CN', 'Noto Serif CJK SC', serif; }
    .print-bar {
      position: fixed; top: 0; left: 0; right: 0;
      background: #1d4ed8; color: #fff;
      padding: 10px 24px;
      display: flex; justify-content: space-between; align-items: center;
      font-family: sans-serif; font-size: 14px; z-index: 9999;
      box-shadow: 0 2px 8px rgba(0,0,0,.2);
    }
    .print-bar button {
      background: #fff; color: #1d4ed8;
      border: none; padding: 6px 18px;
      border-radius: 6px; cursor: pointer;
      font-weight: bold; font-size: 14px;
    }
    .print-bar button:hover { background: #e0e7ff; }
    .page-wrapper { padding-top: 56px; }
    @media print {
      .print-bar { display: none !important; }
      html, body { background: #fff; }
      .page-wrapper { padding-top: 0; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <span>📄 ${escTitle} — 在打印对话框中选择「另存为 PDF」</span>
    <button onclick="window.print()">🖨 打印 / 另存为 PDF</button>
  </div>
  <div class="page-wrapper">
    ${bodyContent}
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 600);
    });
  <\/script>
</body>
</html>`;

  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');

  if (!win) {
    // Popup blocked: fallback to downloading as .html so user can open & print
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title || 'patent'}_申请书.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Revoke the object URL after 5 minutes to free memory
  setTimeout(() => URL.revokeObjectURL(url), 300_000);
};

// Export to file helper
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};