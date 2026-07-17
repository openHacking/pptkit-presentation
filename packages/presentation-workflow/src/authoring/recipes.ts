import type { Box, PresentationDocument, PresentationSlide } from "@pptkit/core";

import type { AssetResolver, ChartPlan, LayoutDecision, SlidePlan } from "../contracts.js";
import { getTypography, SLIDE, type ThemeTokens } from "../themes.js";
import { addImage, addRect, addRule, addText, paragraph, solid } from "./primitives.js";

const CONTENT_TOP = 142;

function roleLabel(plan: SlidePlan) {
  return plan.role.replaceAll("-", " ").toUpperCase();
}

function addChrome(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan, index: number) {
  const page = String(index).padStart(2, "0");
  if (tokens.id === "swiss-grid") {
    addRect(slide, tokens, { x: 0, y: 0, width: 18, height: SLIDE.height }, { fill: tokens.accent, strokeOpacity: 0, radius: false });
    addText(slide, tokens, roleLabel(plan), { x: 52, y: 23, width: 180, height: 16 }, {
      size: 9, color: tokens.accent, bold: true, lineSpacing: 1, name: "Metadata — section",
    });
    addText(slide, tokens, page, { x: 852, y: 23, width: 54, height: 16 }, {
      size: tokens.captionSize, color: tokens.muted, align: "right", lineSpacing: 1, name: "Metadata — page number",
    });
    addRule(slide, { x: 52, y: 49 }, { x: 906, y: 49 }, tokens.muted, 0.75, 0.3);
  } else if (tokens.id === "editorial-story") {
    addRect(slide, tokens, { x: 58, y: 27, width: 24, height: 4 }, { fill: tokens.accent, strokeOpacity: 0, radius: false });
    addText(slide, tokens, roleLabel(plan), { x: 94, y: 21, width: 190, height: 18 }, {
      size: 9, color: tokens.muted, bold: true, lineSpacing: 1, name: "Metadata — section",
    });
    addText(slide, tokens, page, { x: 850, y: 21, width: 54, height: 18 }, {
      size: tokens.captionSize, color: tokens.muted, align: "right", lineSpacing: 1, name: "Metadata — page number",
    });
    addRule(slide, { x: 58, y: 50 }, { x: 904, y: 50 }, tokens.text, 0.75, 0.14);
  } else {
    addText(slide, tokens, roleLabel(plan), { x: 54, y: 23, width: 190, height: 18 }, {
      size: 9, color: tokens.accent, bold: true, lineSpacing: 1, name: "Metadata — section",
    });
    addText(slide, tokens, page, { x: 850, y: 23, width: 56, height: 18 }, {
      size: tokens.captionSize, color: tokens.muted, align: "right", lineSpacing: 1, name: "Metadata — page number",
    });
    addRule(slide, { x: 54, y: 50 }, { x: 906, y: 50 }, tokens.text, 0.75, 0.15);
  }
}

function addTitle(slide: PresentationSlide, tokens: ThemeTokens, title: string, decision: LayoutDecision) {
  const typography = getTypography(tokens.id);
  const [minimum, maximum] = typography.ranges.title;
  const size = decision.density === "airy" ? maximum : decision.density === "dense" ? minimum : Math.min(maximum, Math.max(minimum, tokens.titleSize));
  addText(slide, tokens, title, { x: tokens.margin, y: 68, width: 800, height: 56 }, {
    size,
    bold: tokens.id !== "editorial-story",
    font: tokens.headingFont,
    lineSpacing: typography.titleLineSpacing,
    name: "Slide title",
  });
}

function renderCover(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan) {
  const typography = getTypography(tokens.id);
  if (tokens.id === "swiss-grid") {
    addRect(slide, tokens, { x: 0, y: 0, width: 20, height: SLIDE.height }, { fill: tokens.accent, strokeOpacity: 0, radius: false });
    addText(slide, tokens, "PPTKIT / PRESENTATION", { x: 58, y: 28, width: 250, height: 18 }, {
      size: 9, color: tokens.accent, bold: true, lineSpacing: 1, name: "Metadata — deck label",
    });
    addText(slide, tokens, "01", { x: 842, y: 28, width: 64, height: 20 }, {
      size: 11, color: tokens.muted, align: "right", lineSpacing: 1, name: "Metadata — page number",
    });
    addRule(slide, { x: 58, y: 58 }, { x: 906, y: 58 }, tokens.muted, 0.75, 0.3);
    addText(slide, tokens, plan.title, { x: 62, y: 132, width: 520, height: 172 }, {
      size: typography.displaySize, bold: false, font: tokens.headingFont,
      lineSpacing: typography.titleLineSpacing, verticalAlign: "middle", name: "Cover title",
    });
    addRule(slide, { x: 62, y: 336 }, { x: 260, y: 336 }, tokens.accent, 3);
    addText(slide, tokens, plan.subtitle ?? "", { x: 62, y: 358, width: 470, height: 72 }, {
      size: typography.leadSize, color: tokens.muted, lineSpacing: 1.08, name: "Cover subtitle",
    });
    addRect(slide, tokens, { x: 636, y: 116, width: 248, height: 322 }, { fill: tokens.surface, stroke: tokens.muted, strokeOpacity: 0.24, radius: false });
    addText(slide, tokens, "01", { x: 674, y: 148, width: 150, height: 76 }, {
      size: 58, color: tokens.accent, lineSpacing: 0.94, name: "Cover numeric anchor",
    });
    addText(slide, tokens, plan.subtitle ?? plan.title, { x: 674, y: 262, width: 170, height: 112 }, {
      size: 24, bold: true, lineSpacing: 1.02, name: "Cover framing",
    });
    return;
  }

  if (tokens.id === "editorial-story") {
    addRect(slide, tokens, { x: 618, y: 0, width: 342, height: 540 }, { fill: tokens.surface, strokeOpacity: 0, radius: false });
    addRect(slide, tokens, { x: 58, y: 42, width: 42, height: 5 }, { fill: tokens.accent, strokeOpacity: 0, radius: false });
    addText(slide, tokens, "EDITORIAL STORY", { x: 112, y: 35, width: 220, height: 18 }, {
      size: 9, color: tokens.muted, bold: true, lineSpacing: 1, name: "Metadata — deck label",
    });
    addText(slide, tokens, plan.title, { x: 58, y: 142, width: 520, height: 172 }, {
      size: typography.displaySize, font: tokens.headingFont, lineSpacing: typography.titleLineSpacing,
      verticalAlign: "middle", name: "Cover title",
    });
    addText(slide, tokens, plan.subtitle ?? "", { x: 62, y: 344, width: 440, height: 88 }, {
      size: 23, color: tokens.muted, lineSpacing: 1.16, name: "Cover subtitle",
    });
    addText(slide, tokens, "A considered narrative\nfor focused audiences.", { x: 672, y: 176, width: 208, height: 118 }, {
      size: 24, font: tokens.headingFont, lineSpacing: 1.08, name: "Cover editorial device",
    });
    addRule(slide, { x: 672, y: 326 }, { x: 846, y: 326 }, tokens.accent, 2.5);
    addText(slide, tokens, "01", { x: 672, y: 350, width: 90, height: 48 }, {
      size: 36, color: tokens.accent, font: tokens.headingFont, lineSpacing: 1, name: "Cover numeric anchor",
    });
    return;
  }

  addRect(slide, tokens, { x: 0, y: 0, width: 12, height: 540 }, { fill: tokens.accent, strokeOpacity: 0, radius: false });
  addText(slide, tokens, "PPTKIT", { x: 66, y: 42, width: 150, height: 20 }, {
    size: 10, color: tokens.accent, bold: true, lineSpacing: 1, name: "Metadata — deck label",
  });
  addRule(slide, { x: 66, y: 76 }, { x: 906, y: 76 }, tokens.text, 0.75, 0.14);
  addText(slide, tokens, plan.title, { x: 66, y: 154, width: 660, height: 140 }, {
    size: typography.displaySize, bold: true, font: tokens.headingFont,
    lineSpacing: typography.titleLineSpacing, verticalAlign: "middle", name: "Cover title",
  });
  addText(slide, tokens, plan.subtitle ?? "", { x: 68, y: 320, width: 560, height: 74 }, {
    size: 24, color: tokens.muted, lineSpacing: 1.14, name: "Cover subtitle",
  });
  addRect(slide, tokens, { x: 760, y: 132, width: 146, height: 268 }, { fill: tokens.accent, strokeOpacity: 0, radius: false });
  addText(slide, tokens, "01", { x: 786, y: 158, width: 90, height: 70 }, {
    size: 52, color: "FFFFFF", bold: true, lineSpacing: 1, name: "Cover numeric anchor",
  });
  addText(slide, tokens, "CLEAR\nFOCUSED\nEDITABLE", { x: 786, y: 284, width: 96, height: 76 }, {
      size: 15, color: "FFFFFF", bold: true, lineSpacing: 1.18, name: "Cover framing",
  });
}

function renderCoverSplit(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan) {
  const typography = getTypography(tokens.id);
  const fieldOnRight = tokens.id !== "editorial-story";
  const fieldX = fieldOnRight ? 610 : 0;
  addRect(slide, tokens, { x: fieldX, y: 0, width: 350, height: SLIDE.height }, { fill: tokens.accent, strokeOpacity: 0, radius: false });
  const textX = fieldOnRight ? tokens.margin : 410;
  addText(slide, tokens, "PPTKIT / PRESENTATION", { x: textX, y: 34, width: 250, height: 18 }, {
    size: 9, color: fieldOnRight ? tokens.accent : tokens.muted, bold: true, lineSpacing: 1, name: "Metadata — deck label",
  });
  addText(slide, tokens, plan.title, { x: textX, y: 132, width: 490, height: 176 }, {
    size: typography.displaySize, bold: tokens.id !== "editorial-story", font: tokens.headingFont,
    lineSpacing: typography.titleLineSpacing, verticalAlign: "middle", name: "Cover title",
  });
  addText(slide, tokens, plan.subtitle ?? "", { x: textX, y: 344, width: 430, height: 74 }, {
    size: typography.leadSize, color: tokens.muted, lineSpacing: 1.1, name: "Cover subtitle",
  });
  addText(slide, tokens, "01", { x: fieldX + 48, y: 190, width: 240, height: 110 }, {
    size: 76, color: "FFFFFF", font: tokens.headingFont, lineSpacing: 1, name: "Cover numeric anchor",
  });
}

function renderAgenda(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan) {
  const items = (plan.items ?? []).slice(0, 6);
  if (tokens.id === "swiss-grid") {
    const columns = 2;
    const width = 398;
    items.forEach((item, itemIndex) => {
      const column = itemIndex % columns;
      const row = Math.floor(itemIndex / columns);
      const x = 52 + column * 426;
      const y = 150 + row * 104;
      addRect(slide, tokens, { x, y, width, height: 82 }, { fill: tokens.background, stroke: tokens.muted, strokeOpacity: 0.26, radius: false });
      addText(slide, tokens, String(itemIndex + 1).padStart(2, "0"), { x: x + 18, y: y + 17, width: 52, height: 34 }, {
        size: 24, color: tokens.accent, lineSpacing: 1, name: "Agenda sequence",
      });
      addText(slide, tokens, item, { x: x + 82, y: y + 14, width: 286, height: 52 }, {
        size: 20, bold: true, lineSpacing: 1.06, verticalAlign: "middle", name: "Agenda item",
      });
    });
    return;
  }
  const rowHeight = Math.min(58, 300 / Math.max(1, items.length));
  items.forEach((item, itemIndex) => {
    const y = 148 + itemIndex * rowHeight;
    addText(slide, tokens, String(itemIndex + 1).padStart(2, "0"), { x: tokens.margin, y: y + 5, width: 54, height: 28 }, {
      size: 15, color: tokens.accent, bold: true, lineSpacing: 1, name: "Agenda sequence",
    });
    addText(slide, tokens, item, { x: tokens.margin + 76, y, width: 690, height: 38 }, {
      size: tokens.id === "editorial-story" ? 22 : 21,
      bold: tokens.id === "clean-business" && itemIndex === 0,
      font: tokens.id === "editorial-story" ? tokens.headingFont : tokens.bodyFont,
      lineSpacing: 1.06, name: "Agenda item",
    });
    addRule(slide, { x: tokens.margin + 76, y: y + 42 }, { x: 904, y: y + 42 }, tokens.text, 0.75, 0.12);
  });
}

function renderAgendaGrid(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan) {
  const items = (plan.items ?? []).slice(0, 6);
  const columns = items.length <= 3 ? items.length : 3;
  const rows = Math.ceil(items.length / Math.max(1, columns));
  const width = (SLIDE.width - tokens.margin * 2 - tokens.gap * Math.max(0, columns - 1)) / Math.max(1, columns);
  const height = rows === 1 ? 218 : 132;
  items.forEach((item, itemIndex) => {
    const column = itemIndex % columns;
    const row = Math.floor(itemIndex / columns);
    const x = tokens.margin + column * (width + tokens.gap);
    const y = 154 + row * (height + tokens.gap);
    addRule(slide, { x, y }, { x: x + width, y }, itemIndex === 0 ? tokens.accent : tokens.text, itemIndex === 0 ? 3 : 1, itemIndex === 0 ? 1 : 0.18);
    addText(slide, tokens, String(itemIndex + 1).padStart(2, "0"), { x, y: y + 18, width: 48, height: 28 }, {
      size: 16, color: tokens.accent, bold: true, lineSpacing: 1, name: "Agenda sequence",
    });
    addText(slide, tokens, item, { x, y: y + 58, width, height: height - 68 }, {
      size: 20, bold: tokens.id !== "editorial-story", font: tokens.id === "editorial-story" ? tokens.headingFont : tokens.bodyFont,
      lineSpacing: 1.08, verticalAlign: "middle", name: "Agenda item",
    });
  });
}

function renderSection(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan, index: number) {
  const typography = getTypography(tokens.id);
  const message = plan.message ?? plan.subtitle ?? "";
  if (tokens.id === "swiss-grid") {
    addText(slide, tokens, String(index).padStart(2, "0"), { x: 52, y: 150, width: 230, height: 126 }, {
      size: 88, color: tokens.accent, lineSpacing: 0.92, name: "Section numeric anchor",
    });
    addRule(slide, { x: 322, y: 154 }, { x: 322, y: 430 }, tokens.accent, 3);
    addText(slide, tokens, message, { x: 370, y: 172, width: 492, height: 214 }, {
      size: 34, bold: true, font: tokens.headingFont, lineSpacing: 0.98,
      verticalAlign: "middle", name: "Section message",
    });
    return;
  }
  addText(slide, tokens, message, { x: tokens.margin, y: 164, width: 650, height: 214 }, {
    size: tokens.id === "editorial-story" ? 38 : 34,
    bold: tokens.id === "clean-business", font: tokens.headingFont,
    color: tokens.id === "clean-business" ? tokens.text : tokens.accent,
    lineSpacing: typography.titleLineSpacing, verticalAlign: "middle", name: "Section message",
  });
  addRect(slide, tokens, { x: 776, y: 158, width: 128, height: 224 }, { fill: tokens.accent, strokeOpacity: 0, radius: false });
  addText(slide, tokens, String(index).padStart(2, "0"), { x: 800, y: 184, width: 82, height: 62 }, {
    size: 44, color: "FFFFFF", bold: tokens.id === "clean-business", font: tokens.headingFont,
    lineSpacing: 1, name: "Section numeric anchor",
  });
}

function renderSectionDivided(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan, index: number) {
  const typography = getTypography(tokens.id);
  addRect(slide, tokens, { x: 0, y: 132, width: 360, height: 408 }, { fill: tokens.accent, strokeOpacity: 0, radius: false });
  addText(slide, tokens, String(index).padStart(2, "0"), { x: 58, y: 190, width: 230, height: 100 }, {
    size: 72, color: "FFFFFF", font: tokens.headingFont, lineSpacing: 1, name: "Section numeric anchor",
  });
  addText(slide, tokens, plan.message ?? plan.subtitle ?? "", { x: 420, y: 178, width: 454, height: 220 }, {
    size: 34, bold: tokens.id !== "editorial-story", font: tokens.headingFont,
    lineSpacing: typography.titleLineSpacing, verticalAlign: "middle", name: "Section message",
  });
}

function renderStatement(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan, recipeId: string) {
  const typography = getTypography(tokens.id);
  const items = (plan.items ?? []).slice(0, 4);
  if (recipeId === "statement-divided") {
    addRect(slide, tokens, { x: tokens.margin, y: 156, width: 280, height: 276 }, { fill: tokens.accent, strokeOpacity: 0, radius: false });
    addText(slide, tokens, plan.message ?? "", { x: tokens.margin + 26, y: 182, width: 228, height: 224 }, {
      size: 28, color: "FFFFFF", bold: tokens.id !== "editorial-story", font: tokens.headingFont,
      lineSpacing: typography.titleLineSpacing, verticalAlign: "middle", name: "Statement message",
    });
    if (items.length) addText(slide, tokens, items, { x: 400, y: 182, width: 470, height: 210 }, {
      size: 20, color: tokens.muted, bullet: true, lineSpacing: 1.16, verticalAlign: "middle", name: "Statement support",
    });
    else addText(slide, tokens, plan.title, { x: 400, y: 194, width: 450, height: 160 }, {
      size: 32, font: tokens.headingFont, lineSpacing: 1.02, verticalAlign: "middle", name: "Statement support",
    });
    return;
  }
  if (recipeId === "statement-split" && items.length > 0) {
    const dividerX = tokens.id === "swiss-grid" ? 610 : 598;
    addText(slide, tokens, plan.message ?? "", { x: tokens.margin, y: 158, width: dividerX - tokens.margin - 42, height: 232 }, {
      size: tokens.id === "editorial-story" ? 32 : 31,
      bold: tokens.id !== "editorial-story", font: tokens.headingFont,
      lineSpacing: typography.titleLineSpacing, verticalAlign: "middle", name: "Statement message",
    });
    addRule(slide, { x: dividerX, y: 154 }, { x: dividerX, y: 432 }, tokens.accent, tokens.id === "swiss-grid" ? 3 : 2);
    addText(slide, tokens, items, { x: dividerX + 42, y: 178, width: 248, height: 220 }, {
      size: 18, color: tokens.muted, bullet: true, lineSpacing: 1.12,
      verticalAlign: "middle", name: "Statement support",
    });
    return;
  }
  if (tokens.id === "editorial-story") {
    addText(slide, tokens, "“", { x: 56, y: 130, width: 80, height: 90 }, {
      size: 78, color: tokens.accent, font: tokens.headingFont, lineSpacing: 1, name: "Editorial quote mark",
    });
  }
  addText(slide, tokens, plan.message ?? "", {
    x: tokens.id === "editorial-story" ? 126 : tokens.margin,
    y: 158,
    width: tokens.id === "editorial-story" ? 700 : 820,
    height: 246,
  }, {
    size: tokens.id === "swiss-grid" ? 38 : 35,
    bold: tokens.id !== "editorial-story", font: tokens.headingFont,
    lineSpacing: typography.titleLineSpacing, verticalAlign: "middle", name: "Statement message",
  });
}

function renderImage(
  document: PresentationDocument,
  slide: PresentationSlide,
  tokens: ThemeTokens,
  plan: SlidePlan,
  resolveAsset: AssetResolver,
  recipeId: string,
) {
  if (recipeId === "image-hero" && plan.image) {
    const imageBox: Box = { x: tokens.margin, y: CONTENT_TOP + 4, width: SLIDE.width - tokens.margin * 2, height: 220 };
    addImage(document, slide, plan.image, imageBox, resolveAsset);
    const overlayFill = tokens.id === "editorial-story" ? tokens.surface : tokens.id === "swiss-grid" ? tokens.accent : tokens.text;
    const overlayText = tokens.id === "editorial-story" ? tokens.text : "FFFFFF";
    const overlayX = tokens.id === "editorial-story" ? 586 : 76;
    addRect(slide, tokens, { x: overlayX, y: 366, width: 318, height: 96 }, {
      fill: overlayFill, stroke: tokens.id === "editorial-story" ? tokens.muted : overlayFill,
      strokeOpacity: tokens.id === "editorial-story" ? 0.2 : 0, radius: false,
    });
    addText(slide, tokens, plan.message ?? plan.title, { x: overlayX + 24, y: 383, width: 270, height: 60 }, {
      size: 22, color: overlayText, bold: tokens.id !== "editorial-story", font: tokens.headingFont,
      lineSpacing: 1.04, verticalAlign: "middle", name: "Image hero message",
    });
    return;
  }
  const imageOnLeft = recipeId === "image-evidence-split" ? tokens.id !== "editorial-story" : tokens.id === "editorial-story";
  const imageBox: Box = imageOnLeft
    ? { x: 58, y: CONTENT_TOP + 6, width: 500, height: 326 }
    : { x: 468, y: CONTENT_TOP + 4, width: 438, height: 326 };
  const textBox: Box = imageOnLeft
    ? { x: 600, y: CONTENT_TOP + 16, width: 304, height: 292 }
    : { x: tokens.margin, y: CONTENT_TOP + 16, width: 356, height: 292 };
  if (plan.image) addImage(document, slide, plan.image, imageBox, resolveAsset);
  else addRect(slide, tokens, imageBox, { fill: tokens.surface, stroke: tokens.muted, strokeOpacity: 0.22, radius: false });
  if (plan.message) addText(slide, tokens, plan.message, { ...textBox, height: 112 }, {
    size: 26, bold: tokens.id !== "editorial-story", font: tokens.headingFont,
    lineSpacing: 1.04, name: "Image lead",
  });
  if (plan.items?.length) addText(slide, tokens, plan.items.slice(0, 4), {
    x: textBox.x, y: textBox.y + 138, width: textBox.width, height: 144,
  }, { size: 18, color: tokens.muted, bullet: true, lineSpacing: 1.12, name: "Image support" });
}

function renderKpi(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan) {
  const kpis = (plan.kpis ?? []).slice(0, 4);
  const available = SLIDE.width - tokens.margin * 2;
  const width = available / Math.max(1, kpis.length);
  kpis.forEach((kpi, kpiIndex) => {
    const x = tokens.margin + kpiIndex * width;
    if (tokens.id === "swiss-grid") {
      addRect(slide, tokens, { x, y: 158, width: width - 10, height: 252 }, { fill: tokens.background, stroke: tokens.muted, strokeOpacity: 0.28, radius: false });
    } else {
      addRule(slide, { x, y: 164 }, { x: x + width - 18, y: 164 }, kpiIndex === 0 ? tokens.accent : tokens.text, kpiIndex === 0 ? 3 : 1, kpiIndex === 0 ? 1 : 0.18);
      if (kpiIndex > 0) addRule(slide, { x, y: 164 }, { x, y: 414 }, tokens.text, 0.75, 0.12);
    }
    addText(slide, tokens, kpi.value, { x: x + 16, y: 194, width: width - 42, height: 72 }, {
      size: tokens.id === "swiss-grid" ? 45 : 41, color: tokens.accent,
      bold: tokens.id !== "editorial-story", font: tokens.headingFont, lineSpacing: 1,
      name: "KPI value",
    });
    addText(slide, tokens, kpi.label, { x: x + 16, y: 288, width: width - 42, height: 52 }, {
      size: 19, bold: true, lineSpacing: 1.05, name: "KPI label",
    });
    if (kpi.detail) addText(slide, tokens, kpi.detail, { x: x + 16, y: 352, width: width - 42, height: 46 }, {
      size: 15, color: tokens.muted, lineSpacing: 1.12, name: "KPI detail",
    });
  });
}

function renderKpiLedger(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan) {
  const kpis = (plan.kpis ?? []).slice(0, 4);
  const rowHeight = 282 / Math.max(1, kpis.length);
  kpis.forEach((kpi, index) => {
    const y = 152 + index * rowHeight;
    addText(slide, tokens, kpi.value, { x: tokens.margin, y: y + 8, width: 210, height: rowHeight - 16 }, {
      size: Math.max(30, 46 - kpis.length * 2), color: tokens.accent, bold: tokens.id !== "editorial-story",
      font: tokens.headingFont, lineSpacing: 1, verticalAlign: "middle", name: "KPI value",
    });
    addText(slide, tokens, kpi.label, { x: 302, y: y + 8, width: 230, height: rowHeight - 16 }, {
      size: 20, bold: true, lineSpacing: 1.05, verticalAlign: "middle", name: "KPI label",
    });
    addText(slide, tokens, kpi.detail ?? "", { x: 566, y: y + 8, width: 320, height: rowHeight - 16 }, {
      size: 16, color: tokens.muted, lineSpacing: 1.1, verticalAlign: "middle", name: "KPI detail",
    });
    addRule(slide, { x: tokens.margin, y: y + rowHeight }, { x: 906, y: y + rowHeight }, tokens.text, 0.75, 0.14);
  });
}

function renderComparison(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan) {
  const columns = [plan.comparison?.left, plan.comparison?.right];
  const dividerX = 480;
  if (tokens.id === "swiss-grid") addRule(slide, { x: dividerX, y: 152 }, { x: dividerX, y: 438 }, tokens.accent, 3);
  if (tokens.id === "editorial-story") addRect(slide, tokens, { x: 506, y: 148, width: 398, height: 292 }, { fill: tokens.surface, strokeOpacity: 0, radius: false });
  columns.forEach((column, columnIndex) => {
    const x = columnIndex === 0 ? tokens.margin : 526;
    const width = columnIndex === 0 ? 360 : 350;
    if (tokens.id === "clean-business") addRule(slide, { x, y: 160 }, { x: x + width, y: 160 }, columnIndex === 0 ? tokens.muted : tokens.accent, columnIndex === 0 ? 1 : 3, columnIndex === 0 ? 0.4 : 1);
    addText(slide, tokens, column?.heading ?? "", { x, y: 184, width, height: 52 }, {
      size: 25, bold: tokens.id !== "editorial-story", font: tokens.headingFont,
      color: columnIndex === 1 ? tokens.accent : tokens.text, lineSpacing: 1.02,
      name: "Comparison heading",
    });
    addText(slide, tokens, (column?.items ?? []).slice(0, 5), { x, y: 258, width, height: 156 }, {
      size: 18, color: tokens.muted, bullet: true, lineSpacing: 1.12,
      name: "Comparison points",
    });
  });
}

function renderComparisonSplit(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan) {
  const columns = [plan.comparison?.left, plan.comparison?.right];
  columns.forEach((column, index) => {
    const x = index === 0 ? 0 : 480;
    const fill = index === 0 ? tokens.surface : tokens.accent;
    const color = index === 0 ? tokens.text : "FFFFFF";
    addRect(slide, tokens, { x, y: 138, width: 480, height: 402 }, { fill, strokeOpacity: 0, radius: false });
    addText(slide, tokens, column?.heading ?? "", { x: x + 54, y: 184, width: 360, height: 62 }, {
      size: 28, color, bold: tokens.id !== "editorial-story", font: tokens.headingFont, lineSpacing: 1.02, name: "Comparison heading",
    });
    addText(slide, tokens, (column?.items ?? []).slice(0, 5), { x: x + 54, y: 278, width: 350, height: 190 }, {
      size: 18, color: index === 0 ? tokens.muted : "FFFFFF", bullet: true, lineSpacing: 1.14, name: "Comparison points",
    });
  });
}

function renderProcess(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan) {
  const steps = (plan.steps ?? []).slice(0, 6);
  const width = (SLIDE.width - tokens.margin * 2 - tokens.gap * Math.max(0, steps.length - 1)) / Math.max(1, steps.length);
  steps.forEach((step, stepIndex) => {
    const x = tokens.margin + stepIndex * (width + tokens.gap);
    if (tokens.id === "editorial-story") {
      addText(slide, tokens, String(stepIndex + 1).padStart(2, "0"), { x, y: 164, width, height: 32 }, {
        size: 16, color: tokens.accent, bold: true, lineSpacing: 1, name: "Process sequence",
      });
      addRule(slide, { x, y: 210 }, { x: x + width, y: 210 }, tokens.text, 0.75, 0.16);
      addText(slide, tokens, step, { x, y: 236, width, height: 144 }, {
        size: 19, font: tokens.headingFont, lineSpacing: 1.1, verticalAlign: "middle", name: "Process step",
      });
    } else {
      addText(slide, tokens, String(stepIndex + 1).padStart(2, "0"), { x, y: 166, width, height: 36 }, {
        size: 22, color: tokens.accent, bold: true, lineSpacing: 1, name: "Process sequence",
      });
      addRect(slide, tokens, { x, y: 220, width, height: 178 }, {
        fill: tokens.id === "swiss-grid" ? tokens.background : tokens.surface,
        stroke: tokens.id === "swiss-grid" ? tokens.muted : tokens.text,
        strokeOpacity: tokens.id === "swiss-grid" ? 0.3 : 0.1,
        radius: tokens.id !== "swiss-grid",
      });
      addText(slide, tokens, step, { x: x + 12, y: 240, width: width - 24, height: 132 }, {
        size: 17, bold: true, lineSpacing: 1.08, verticalAlign: "middle", name: "Process step",
      });
      if (stepIndex < steps.length - 1) addRule(slide, { x: x + width, y: 309 }, { x: x + width + tokens.gap, y: 309 }, tokens.accent, 1.5);
    }
  });
}

function renderProcessLedger(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan) {
  const steps = (plan.steps ?? []).slice(0, 6);
  const rowHeight = 286 / Math.max(1, steps.length);
  steps.forEach((step, index) => {
    const y = 150 + index * rowHeight;
    addText(slide, tokens, String(index + 1).padStart(2, "0"), { x: tokens.margin, y: y + 6, width: 70, height: rowHeight - 12 }, {
      size: 18, color: tokens.accent, bold: true, lineSpacing: 1, verticalAlign: "middle", name: "Process sequence",
    });
    addText(slide, tokens, step, { x: tokens.margin + 92, y: y + 6, width: 720, height: rowHeight - 12 }, {
      size: 19, font: tokens.id === "editorial-story" ? tokens.headingFont : tokens.bodyFont,
      lineSpacing: 1.08, verticalAlign: "middle", name: "Process step",
    });
    addRule(slide, { x: tokens.margin + 92, y: y + rowHeight }, { x: 906, y: y + rowHeight }, tokens.text, 0.75, 0.14);
  });
}

function renderProcessDivided(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan) {
  const steps = (plan.steps ?? []).slice(0, 6);
  const midpoint = Math.ceil(steps.length / 2);
  addRule(slide, { x: 480, y: 154 }, { x: 480, y: 440 }, tokens.accent, 2.5);
  [steps.slice(0, midpoint), steps.slice(midpoint)].forEach((column, columnIndex) => {
    column.forEach((step, rowIndex) => {
      const index = columnIndex === 0 ? rowIndex : midpoint + rowIndex;
      const x = columnIndex === 0 ? tokens.margin : 526;
      const y = 168 + rowIndex * 86;
      addText(slide, tokens, String(index + 1).padStart(2, "0"), { x, y, width: 52, height: 28 }, {
        size: 16, color: tokens.accent, bold: true, lineSpacing: 1, name: "Process sequence",
      });
      addText(slide, tokens, step, { x: x + 64, y: y - 2, width: 300, height: 58 }, {
        size: 18, lineSpacing: 1.08, verticalAlign: "middle", name: "Process step",
      });
    });
  });
}

function addChart(slide: PresentationSlide, tokens: ThemeTokens, chart: ChartPlan, box: Box) {
  const categories = chart.categories.slice(0, 8);
  const series = chart.series.slice(0, 2);
  const values = series.flatMap((item) => item.values.slice(0, categories.length));
  const max = Math.max(1, ...values);
  const min = chart.type === "line" ? Math.min(0, ...values) : 0;
  const range = Math.max(1, max - min);
  const palette = [tokens.accent, tokens.accent2];
  const bottom = box.y + box.height - 30;
  addRule(slide, { x: box.x, y: bottom }, { x: box.x + box.width, y: bottom }, tokens.muted, 1, 0.4);
  if (chart.type === "bar") {
    const groupWidth = box.width / Math.max(1, categories.length);
    const barWidth = Math.min(28, (groupWidth - 10) / Math.max(1, series.length));
    categories.forEach((category, categoryIndex) => {
      series.forEach((item, seriesIndex) => {
        const height = Math.max(1, (Math.abs(item.values[categoryIndex] ?? 0) / Math.max(1, max)) * (box.height - 72));
        addRect(slide, tokens, {
          x: box.x + categoryIndex * groupWidth + (groupWidth - barWidth * series.length) / 2 + seriesIndex * barWidth,
          y: bottom - height, width: Math.max(4, barWidth - 3), height,
        }, { fill: palette[seriesIndex] ?? tokens.accent, strokeOpacity: 0, radius: false });
      });
      addText(slide, tokens, category, { x: box.x + categoryIndex * groupWidth, y: bottom + 6, width: groupWidth, height: 20 }, {
        size: 15, color: tokens.muted, align: "center", lineSpacing: 1, name: "Chart category",
      });
    });
    return;
  }
  categories.forEach((category, index) => {
    const x = box.x + (index / Math.max(1, categories.length - 1)) * box.width;
    addText(slide, tokens, category, { x: x - 35, y: bottom + 6, width: 70, height: 20 }, {
      size: 15, color: tokens.muted, align: "center", lineSpacing: 1, name: "Chart category",
    });
  });
  series.forEach((item, seriesIndex) => {
    const points = categories.map((_, index) => ({
      x: box.x + (index / Math.max(1, categories.length - 1)) * box.width,
      y: bottom - (((item.values[index] ?? 0) - min) / range) * (box.height - 68),
    }));
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      addRule(slide, points[pointIndex - 1]!, points[pointIndex]!, palette[seriesIndex] ?? tokens.accent, 2.5);
    }
    for (const point of points) {
      addRect(slide, tokens, { x: point.x - 4, y: point.y - 4, width: 8, height: 8 }, { fill: palette[seriesIndex] ?? tokens.accent, strokeOpacity: 0, radius: false });
    }
  });
}

function renderLedger(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan) {
  const table = plan.table!;
  const rows = table.rows.slice(0, 8);
  const leftWidth = tokens.id === "editorial-story" ? 320 : 360;
  addText(slide, tokens, table.headers[0] ?? "", { x: tokens.margin, y: 148, width: leftWidth, height: 24 }, {
    size: 15, color: tokens.accent, bold: true, lineSpacing: 1, name: "Table header",
  });
  addText(slide, tokens, table.headers[1] ?? "", { x: tokens.margin + leftWidth + 34, y: 148, width: 430, height: 24 }, {
    size: 15, color: tokens.accent, bold: true, lineSpacing: 1, name: "Table header",
  });
  addRule(slide, { x: tokens.margin, y: 178 }, { x: 906, y: 178 }, tokens.accent, 2);
  const rowHeight = Math.min(54, 270 / Math.max(1, rows.length));
  rows.forEach((row, rowIndex) => {
    const y = 188 + rowIndex * rowHeight;
    addText(slide, tokens, row[0] ?? "", { x: tokens.margin, y: y + 5, width: leftWidth, height: rowHeight - 10 }, {
      size: 17, bold: true, font: tokens.id === "editorial-story" ? tokens.headingFont : tokens.bodyFont,
      lineSpacing: 1.06, verticalAlign: "middle", name: "Table label",
    });
    addText(slide, tokens, row[1] ?? "", { x: tokens.margin + leftWidth + 34, y: y + 5, width: 430, height: rowHeight - 10 }, {
      size: 16, color: tokens.muted, lineSpacing: 1.08, verticalAlign: "middle", name: "Table value",
    });
    addRule(slide, { x: tokens.margin, y: y + rowHeight }, { x: 906, y: y + rowHeight }, tokens.text, 0.75, 0.12);
  });
}

function renderTable(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan, recipeId: string) {
  if (recipeId === "table-split-chart" && plan.chart) {
    addChart(slide, tokens, plan.chart, { x: tokens.margin, y: 154, width: 610, height: 286 });
    addText(slide, tokens, plan.chart.series.slice(0, 2).map((series, index) => `${index === 0 ? "●" : "■"} ${series.name}`), {
      x: 718, y: 184, width: 180, height: 96,
    }, { size: 15, color: tokens.muted, lineSpacing: 1.16, name: "Chart legend" });
    return;
  }
  if (!plan.table) return;
  if (recipeId === "table-ledger") {
    renderLedger(slide, tokens, plan);
    return;
  }
  const headers = plan.table.headers.slice(0, 6);
  const rows = plan.table.rows.slice(0, 8);
  const width = 840 / Math.max(1, headers.length);
  slide.addElement({
    type: "table",
    name: "Data table",
    box: { x: tokens.margin, y: 150, width: 840, height: Math.min(310, 44 + rows.length * 36) },
    columns: headers.map(() => width),
    rows: [
      { height: 40, cells: headers.map((value) => ({
        content: [paragraph(value, tokens, { size: 16, bold: true, color: "FFFFFF", lineSpacing: 1 })],
        style: { fill: solid(tokens.accent), margin: 8 },
      })) },
      ...rows.map((row, rowIndex) => ({
        height: 36,
        cells: headers.map((_, cellIndex) => ({
          content: [paragraph(String(row[cellIndex] ?? ""), tokens, { size: 15, lineSpacing: 1.06 })],
          style: { fill: solid(rowIndex % 2 === 0 ? tokens.surface : tokens.background), margin: 7 },
        })),
      })),
    ],
  });
}

function renderClosing(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan, index: number) {
  const typography = getTypography(tokens.id);
  if (tokens.id === "swiss-grid") {
    addText(slide, tokens, plan.title, { x: 58, y: 146, width: 570, height: 172 }, {
      size: 46, font: tokens.headingFont, lineSpacing: 0.94, verticalAlign: "middle", name: "Closing message",
    });
    addRule(slide, { x: 58, y: 350 }, { x: 240, y: 350 }, tokens.accent, 3);
    addText(slide, tokens, plan.message ?? "", { x: 58, y: 374, width: 480, height: 60 }, {
      size: 24, lineSpacing: 1.08, name: "Closing action",
    });
    addRect(slide, tokens, { x: 690, y: 132, width: 194, height: 288 }, { fill: tokens.surface, stroke: tokens.muted, strokeOpacity: 0.26, radius: false });
    addText(slide, tokens, String(index).padStart(2, "0"), { x: 724, y: 166, width: 100, height: 66 }, {
      size: 50, color: tokens.accent, lineSpacing: 1, name: "Closing numeric anchor",
    });
    addText(slide, tokens, "Visibility starts early.\nMomentum keeps going.", { x: 724, y: 286, width: 126, height: 92 }, {
      size: 18, bold: true, lineSpacing: 1.08, name: "Closing framing",
    });
    return;
  }
  if (tokens.id === "editorial-story") {
    addText(slide, tokens, plan.title, { x: 64, y: 152, width: 690, height: 164 }, {
      size: typography.displaySize, font: tokens.headingFont, lineSpacing: 0.98,
      verticalAlign: "middle", name: "Closing message",
    });
    addRule(slide, { x: 66, y: 348 }, { x: 280, y: 348 }, tokens.accent, 2.5);
    addText(slide, tokens, plan.message ?? "", { x: 66, y: 372, width: 560, height: 70 }, {
      size: 23, color: tokens.muted, lineSpacing: 1.16, name: "Closing action",
    });
    return;
  }
  addRect(slide, tokens, { x: 0, y: 0, width: 14, height: 540 }, { fill: tokens.accent, strokeOpacity: 0, radius: false });
  addText(slide, tokens, plan.title, { x: 70, y: 156, width: 720, height: 150 }, {
    size: 43, bold: true, font: tokens.headingFont, lineSpacing: 0.98,
    verticalAlign: "middle", name: "Closing message",
  });
  addRule(slide, { x: 72, y: 340 }, { x: 270, y: 340 }, tokens.accent, 3);
  addText(slide, tokens, plan.message ?? "", { x: 72, y: 370, width: 580, height: 68 }, {
    size: 24, color: tokens.muted, lineSpacing: 1.12, name: "Closing action",
  });
}

function renderClosingSplit(slide: PresentationSlide, tokens: ThemeTokens, plan: SlidePlan, index: number) {
  const typography = getTypography(tokens.id);
  addRect(slide, tokens, { x: 620, y: 0, width: 340, height: 540 }, { fill: tokens.accent, strokeOpacity: 0, radius: false });
  addText(slide, tokens, plan.title, { x: 64, y: 150, width: 500, height: 170 }, {
    size: typography.displaySize, bold: tokens.id !== "editorial-story", font: tokens.headingFont,
    lineSpacing: typography.titleLineSpacing, verticalAlign: "middle", name: "Closing message",
  });
  addText(slide, tokens, plan.message ?? "", { x: 66, y: 356, width: 440, height: 72 }, {
    size: 23, color: tokens.muted, lineSpacing: 1.14, name: "Closing action",
  });
  addText(slide, tokens, String(index).padStart(2, "0"), { x: 674, y: 186, width: 190, height: 100 }, {
    size: 72, color: "FFFFFF", font: tokens.headingFont, lineSpacing: 1, name: "Closing numeric anchor",
  });
}

export function renderSlide(
  document: PresentationDocument,
  plan: SlidePlan,
  tokens: ThemeTokens,
  index: number,
  resolveAsset: AssetResolver,
  decision: LayoutDecision,
  notes?: string,
) {
  const slide = document.addSlide({
    id: plan.id,
    background: solid(tokens.background),
    ...(notes ? { notes } : {}),
  });
  if (plan.role === "cover") {
    if (decision.recipeId === "cover-split") renderCoverSplit(slide, tokens, plan);
    else renderCover(slide, tokens, plan);
    return;
  }
  addChrome(slide, tokens, plan, index);
  if (plan.role === "closing") {
    if (decision.recipeId === "closing-split") renderClosingSplit(slide, tokens, plan, index);
    else renderClosing(slide, tokens, plan, index);
    return slide;
  }
  addTitle(slide, tokens, plan.title, decision);
  if (plan.role === "agenda") decision.recipeId === "agenda-grid" ? renderAgendaGrid(slide, tokens, plan) : renderAgenda(slide, tokens, plan);
  else if (plan.role === "section") decision.recipeId === "section-divided" ? renderSectionDivided(slide, tokens, plan, index) : renderSection(slide, tokens, plan, index);
  else if (plan.role === "statement") renderStatement(slide, tokens, plan, decision.recipeId);
  else if (plan.role === "image") renderImage(document, slide, tokens, plan, resolveAsset, decision.recipeId);
  else if (plan.role === "kpi") decision.recipeId === "kpi-ledger" ? renderKpiLedger(slide, tokens, plan) : renderKpi(slide, tokens, plan);
  else if (plan.role === "comparison") decision.recipeId === "comparison-split" ? renderComparisonSplit(slide, tokens, plan) : renderComparison(slide, tokens, plan);
  else if (plan.role === "process") {
    if (decision.recipeId === "process-ledger") renderProcessLedger(slide, tokens, plan);
    else if (decision.recipeId === "process-divided") renderProcessDivided(slide, tokens, plan);
    else renderProcess(slide, tokens, plan);
  } else if (plan.role === "table") renderTable(slide, tokens, plan, decision.recipeId);
  return slide;
}
