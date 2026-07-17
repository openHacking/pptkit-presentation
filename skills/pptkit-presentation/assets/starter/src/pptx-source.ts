import { OfficeParser, type OfficeContentNode } from "officeparser";
import { analyzePptxEvidence, type SourceInput, type SourceParserResult } from "presentation-workflow";

function nodeText(node: OfficeContentNode): string {
  const children = (node.children ?? []).map(nodeText).filter(Boolean);
  return children.length > 0 ? children.join("\n") : node.text?.trim() ?? "";
}

export async function parsePptxSource(input: SourceInput): Promise<SourceParserResult> {
  const pptx = analyzePptxEvidence(input.bytes);
  const ast = await OfficeParser.parseOffice(input.bytes, {
    fileType: "pptx",
    extractAttachments: false,
    ignoreNotes: false,
    includeRawContent: false,
    ocr: false,
  });
  const notes = new Map<number, string>();
  for (const node of ast.content) {
    if (node.type !== "note") continue;
    const slideNumber = Number((node.metadata as { slideNumber?: number } | undefined)?.slideNumber ?? 0);
    const content = nodeText(node);
    if (slideNumber > 0 && content) notes.set(slideNumber, content);
  }
  const slides = ast.content.filter((node) => node.type === "slide");
  const content = slides.map((slide, index) => {
    const slideNumber = Number((slide.metadata as { slideNumber?: number } | undefined)?.slideNumber ?? index + 1);
    return [
      `Slide ${slideNumber}`,
      nodeText(slide),
      ...(notes.has(slideNumber) ? [`Notes\n${notes.get(slideNumber)}`] : []),
    ].filter(Boolean).join("\n");
  }).join("\n\n");
  return {
    content,
    pptx,
    warnings: [
      ...ast.warnings.map((warning) => `${warning.code}: ${warning.message}`),
      ...pptx.slides.flatMap((slide) => slide.warnings.map((warning) => `Slide ${slide.slideNumber}: ${warning}`)),
    ],
  };
}
