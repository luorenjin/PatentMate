import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { jsPDF } from 'jspdf';
import { PatentData } from '../types';

// Helper to strip HTML tags
const stripHtml = (html: string | undefined): string => {
  if (!html) return '';
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

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

export const exportToDocx = async (patentData: PatentData): Promise<Blob> => {
  const { title, technicalField, backgroundArt, inventionContent, abstract, claims, descriptionOfDrawings, detailedDescription } = patentData;

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

export const exportToPdf = async (patentData: PatentData): Promise<Blob> => {
  const { title, technicalField, backgroundArt, inventionContent, abstract, claims, descriptionOfDrawings, detailedDescription } = patentData;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  const addPage = () => {
    doc.addPage();
    y = margin;
  };

  const checkPageBreak = (height: number) => {
    if (y + height > pageHeight - margin) {
      addPage();
    }
  };

  const addText = (text: string, fontSize: number = 12, isBold: boolean = false, align: 'left' | 'center' = 'left') => {
    const lines = doc.splitTextToSize(text, contentWidth);
    const lineHeight = fontSize * 0.5;

    lines.forEach((line: string) => {
      checkPageBreak(lineHeight);
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');

      if (align === 'center') {
        doc.text(line, pageWidth / 2, y, { align: 'center' });
      } else {
        doc.text(line, margin, y);
      }
      y += lineHeight;
    });
  };

  const addParagraph = (text: string, fontSize: number = 12, indent: boolean = false) => {
    if (!text) return;
    const cleanText = katexToUnicode(stripHtml(text));
    const lines = doc.splitTextToSize(cleanText, contentWidth - (indent ? 10 : 0));
    const lineHeight = fontSize * 0.5;

    lines.forEach((line: string) => {
      checkPageBreak(lineHeight);
      doc.setFontSize(fontSize);
      doc.setFont('times', 'normal');
      doc.text(line, margin + (indent ? 10 : 0), y);
      y += lineHeight;
    });
  };

  // Title
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(title || '未命名专利', pageWidth / 2, y, { align: 'center' });
  y += 15;

  // Page number
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('1', pageWidth - margin, 290, { align: 'right' });

  // Abstract
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('摘要', margin, y);
  y += 8;
  addParagraph(abstract || '', 12);

  // Claims
  y += 5;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('权利要求书', margin, y);
  y += 8;
  addParagraph(claims || '', 11);

  // Description
  y += 5;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('说明书', margin, y);
  y += 8;

  // Technical Field
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('技术领域', margin, y);
  y += 6;
  addParagraph(technicalField, 12);
  y += 3;

  // Background Art
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('背景技术', margin, y);
  y += 6;
  addParagraph(backgroundArt, 12);
  y += 3;

  // Invention Content
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('发明内容', margin, y);
  y += 6;
  addParagraph(inventionContent || '', 12);
  y += 3;

  // Description of Drawings
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('附图说明', margin, y);
  y += 6;
  addParagraph(descriptionOfDrawings || '', 12);
  y += 3;

  // Detailed Description with numbering
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('具体实施方式', margin, y);
  y += 6;
  const numberedDesc = formatWithNumbering(detailedDescription, 1);
  numberedDesc.forEach((line) => {
    addParagraph(line, 12, true);
  });

  return doc.output('blob');
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