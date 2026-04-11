import type { ImportedDocumentType } from "../types";

import { extractTextFromPageImage } from "./aiService";

const FILE_TYPE_DOCX = "docx";
const FILE_TYPE_PDF = "pdf";
const FILE_TYPE_UNKNOWN = "unknown";
const MIME_TYPE_PDF = "application/pdf";
const MIME_TYPE_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_TYPE_IMAGE_PNG = "image/png";
const OCR_TEXT_LENGTH_THRESHOLD = 80;
const OCR_RENDER_SCALE = 1.75;

export interface DocumentIngestionProgress {
  stage: "reading" | "extracting" | "ocr" | "structuring" | "completed";
  current: number;
  total: number;
  message: string;
}

export interface DocumentIngestionOptions {
  userId?: string;
  onProgress?: (progress: DocumentIngestionProgress) => void;
}

export interface IngestedDisclosureDocument {
  fileType: ImportedDocumentType;
  extractedText: string;
  pageCount?: number;
  usedOcr: boolean;
  warnings: string[];
}

interface MammothResultMessage {
  type?: string;
  message?: string;
}

interface MammothLikeModule {
  default?: {
    extractRawText: (input: {
      arrayBuffer: ArrayBuffer;
    }) => Promise<{ value: string; messages: MammothResultMessage[] }>;
  };
  extractRawText?: (input: {
    arrayBuffer: ArrayBuffer;
  }) => Promise<{ value: string; messages: MammothResultMessage[] }>;
}

const normalizeExtractedText = (value: string): string => {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const notifyProgress = (
  callback: DocumentIngestionOptions["onProgress"],
  progress: DocumentIngestionProgress,
): void => {
  try {
    callback?.(progress);
  } catch (error) {
    console.error("Document ingestion progress callback failed:", error);
  }
};

const detectFileType = (file: File): ImportedDocumentType => {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(`.${FILE_TYPE_DOCX}`) || file.type === MIME_TYPE_DOCX) {
    return FILE_TYPE_DOCX;
  }

  if (lowerName.endsWith(`.${FILE_TYPE_PDF}`) || file.type === MIME_TYPE_PDF) {
    return FILE_TYPE_PDF;
  }

  return FILE_TYPE_UNKNOWN;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
};

const getMammothExtractor = async (): Promise<
  (input: { arrayBuffer: ArrayBuffer }) => Promise<{
    value: string;
    messages: MammothResultMessage[];
  }>
> => {
  const mammothModule = (await import("mammoth")) as MammothLikeModule;
  const mammoth = mammothModule.default ?? mammothModule;

  return mammoth.extractRawText ?? (async () => ({ value: "", messages: [] }));
};

const getPdfPageText = async (pdfPage: any): Promise<string> => {
  const textContent = await pdfPage.getTextContent();
  const items = Array.isArray(textContent.items) ? textContent.items : [];

  return items
    .map((item) => {
      if (!item || typeof item !== "object" || !("str" in item)) {
        return "";
      }

      const text = typeof item.str === "string" ? item.str : "";
      const separator = item.hasEOL ? "\n" : " ";
      return `${text}${separator}`;
    })
    .join("");
};

const renderPdfPageToBase64 = async (pdfPage: any): Promise<string> => {
  if (typeof OffscreenCanvas === "undefined") {
    return "";
  }

  const viewport = pdfPage.getViewport({ scale: OCR_RENDER_SCALE });
  const canvas = new OffscreenCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  const context = canvas.getContext("2d");

  if (!context) {
    return "";
  }

  await pdfPage.render({
    canvasContext: context,
    viewport,
  }).promise;

  const blob = await canvas.convertToBlob({ type: MIME_TYPE_IMAGE_PNG });
  const buffer = await blob.arrayBuffer();
  return arrayBufferToBase64(buffer);
};

const ingestDocxDocument = async (
  file: File,
  options?: DocumentIngestionOptions,
): Promise<IngestedDisclosureDocument> => {
  notifyProgress(options?.onProgress, {
    stage: "reading",
    current: 0,
    total: 1,
    message: "正在读取 Word 文档…",
  });

  const arrayBuffer = await file.arrayBuffer();
  const extractRawText = await getMammothExtractor();
  const result = await extractRawText({ arrayBuffer });
  const warnings = Array.isArray(result.messages)
    ? result.messages
        .map((message) => message.message || "")
        .filter((message) => message.trim().length > 0)
    : [];

  notifyProgress(options?.onProgress, {
    stage: "extracting",
    current: 1,
    total: 1,
    message: "Word 文本提取完成，准备进入 AI 整理…",
  });

  return {
    fileType: FILE_TYPE_DOCX,
    extractedText: normalizeExtractedText(result.value || ""),
    usedOcr: false,
    warnings,
  };
};

const ingestPdfDocument = async (
  file: File,
  options?: DocumentIngestionOptions,
): Promise<IngestedDisclosureDocument> => {
  const pdfjs = await import("pdfjs-dist/legacy/webpack.mjs");

  notifyProgress(options?.onProgress, {
    stage: "reading",
    current: 0,
    total: 1,
    message: "正在读取 PDF…",
  });

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: typeof OffscreenCanvas !== "undefined",
  } as any);
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];
  const warnings: string[] = [];
  let usedOcr = false;

  for (let index = 1; index <= pdf.numPages; index += 1) {
    notifyProgress(options?.onProgress, {
      stage: "extracting",
      current: index,
      total: pdf.numPages,
      message: `正在提取第 ${index} / ${pdf.numPages} 页文本…`,
    });

    const page = await pdf.getPage(index);
    const rawText = normalizeExtractedText(await getPdfPageText(page));
    let pageText = rawText;

    if (rawText.replace(/\s/g, "").length < OCR_TEXT_LENGTH_THRESHOLD) {
      notifyProgress(options?.onProgress, {
        stage: "ocr",
        current: index,
        total: pdf.numPages,
        message: `第 ${index} 页疑似扫描页，正在执行 OCR…`,
      });

      const pageImageBase64 = await renderPdfPageToBase64(page);
      if (pageImageBase64) {
        const ocrText = await extractTextFromPageImage(pageImageBase64, index, {
          userId: options?.userId,
        });

        if (ocrText.trim()) {
          pageText = normalizeExtractedText(ocrText);
          usedOcr = true;
        } else {
          warnings.push(`第 ${index} 页 OCR 未提取到可用文本，请人工复核。`);
        }
      } else {
        warnings.push(`第 ${index} 页检测为扫描页，但当前环境无法渲染 OCR 图像。`);
      }
    }

    if (pageText) {
      pageTexts.push(`【第${index}页】\n${pageText}`);
    }

    page.cleanup();
  }

  notifyProgress(options?.onProgress, {
    stage: usedOcr ? "ocr" : "extracting",
    current: pdf.numPages,
    total: pdf.numPages,
    message: "PDF 文本提取完成，准备进入 AI 整理…",
  });

  return {
    fileType: FILE_TYPE_PDF,
    extractedText: normalizeExtractedText(pageTexts.join("\n\n")),
    pageCount: pdf.numPages,
    usedOcr,
    warnings,
  };
};

/**
 * 解析用户上传的技术资料文件，提取供 AI 结构化整理使用的纯文本内容。
 * @param file 用户上传的单个资料文件，目前支持 DOCX 与 PDF。
 * @param options 解析选项，包含进度回调和配额所需的 userId。
 * @returns 解析后的纯文本、是否使用 OCR、页数及解析警告；失败时返回空结果。
 */
export const ingestDisclosureDocument = async (
  file: File,
  options?: DocumentIngestionOptions,
): Promise<IngestedDisclosureDocument> => {
  const fallback: IngestedDisclosureDocument = {
    fileType: detectFileType(file),
    extractedText: "",
    usedOcr: false,
    warnings: [],
  };

  try {
    const fileType = detectFileType(file);

    if (fileType === FILE_TYPE_DOCX) {
      return await ingestDocxDocument(file, options);
    }

    if (fileType === FILE_TYPE_PDF) {
      return await ingestPdfDocument(file, options);
    }

    return {
      ...fallback,
      warnings: ["当前仅支持上传 .docx 或 .pdf 技术资料。"],
    };
  } catch (error) {
    console.error("ingestDisclosureDocument failed:", error);
    return {
      ...fallback,
      warnings: ["资料解析失败，请更换文件或稍后重试。"],
    };
  }
};

/**
 * 返回上传资料模式允许选择的文件类型 accept 字符串。
 * @returns 适用于 input[type=file] 的 accept 配置。
 */
export const getSupportedDisclosureFileAccept = (): string => {
  return [MIME_TYPE_DOCX, ".docx", MIME_TYPE_PDF, ".pdf"].join(",");
};