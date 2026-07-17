export type ThemeId = "clean-business" | "swiss-grid" | "editorial-story";

export type CompositionIntent =
  | "hero"
  | "split"
  | "ledger"
  | "grid"
  | "divided"
  | "timeline"
  | "image-split"
  | "image-hero";

export type SlideDensity = "airy" | "balanced" | "dense";
export type DesignVariation = "restrained" | "balanced" | "expressive";

export interface ThemeOverrides {
  colors?: Partial<{
    background: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    accent2: string;
  }>;
  fonts?: Partial<{ heading: string; body: string }>;
}

export interface DeckTheme {
  id: ThemeId;
  overrides?: ThemeOverrides;
}

export interface DeckDesign {
  theme: DeckTheme;
  seed: string;
  variation: DesignVariation;
}

export type SlideRole =
  | "cover"
  | "agenda"
  | "section"
  | "statement"
  | "image"
  | "kpi"
  | "comparison"
  | "process"
  | "table"
  | "closing";

export interface SourceRef {
  id: string;
  label?: string;
  slideNumbers?: number[];
}

export interface DeckBrief {
  title: string;
  audience: string;
  purpose: string;
  language: string;
  slideCountRange: [number, number];
  imagePolicy: string;
  constraints: string[];
  mode?: "create" | "restyle";
  author?: string;
}

export interface SourceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceTextBlock {
  id: string;
  text: string;
  box?: SourceBox;
  groupPath: string[];
  fontSize?: number;
  bold?: boolean;
}

export interface SourceShapeEvidence {
  id: string;
  kind: "shape" | "connector" | "group" | "table" | "image" | "chart" | "diagram";
  name?: string;
  box?: SourceBox;
  text?: string;
  groupPath: string[];
  relationshipTarget?: string;
}

export interface SourceTableEvidence {
  id: string;
  box?: SourceBox;
  rows: string[][];
  groupPath: string[];
}

export interface SourceDiagramEvidence {
  id: string;
  box?: SourceBox;
  labels: string[];
  edges: Array<{ from: string; to: string }>;
  groupPath: string[];
}

export interface SourceSlideEvidence {
  slideNumber: number;
  partName: string;
  title?: string;
  text: string;
  textBlocks: SourceTextBlock[];
  shapes: SourceShapeEvidence[];
  tables: SourceTableEvidence[];
  diagrams: SourceDiagramEvidence[];
  notes?: string;
  warnings: string[];
}

export interface PptxEvidence {
  slideCount: number;
  size?: { width: number; height: number };
  slides: SourceSlideEvidence[];
}

export interface PptxEmbeddedAsset {
  partName: string;
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/svg+xml";
  bytes: Uint8Array;
  slideNumbers: number[];
  width?: number;
  height?: number;
}

export interface ImagePlan {
  assetId: string;
  alt: string;
  width?: number;
  height?: number;
  fit?: "contain" | "cover" | "stretch";
}

export interface KpiPlan {
  value: string;
  label: string;
  detail?: string;
}

export interface ComparisonPlan {
  left: { heading: string; items: string[] };
  right: { heading: string; items: string[] };
}

export interface ChartPlan {
  type: "bar" | "line";
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
}

export interface TablePlan {
  headers: string[];
  rows: string[][];
}

export interface SlidePlan {
  id: string;
  role: SlideRole;
  title: string;
  subtitle?: string;
  message?: string;
  items?: string[];
  image?: ImagePlan;
  kpis?: KpiPlan[];
  comparison?: ComparisonPlan;
  steps?: string[];
  table?: TablePlan;
  chart?: ChartPlan;
  notes?: string;
  sourceRefs?: SourceRef[];
  composition?: CompositionIntent;
  density?: SlideDensity;
}

export interface DeckSpec {
  brief: DeckBrief;
  slides: SlidePlan[];
  design: DeckDesign;
}

export interface LayoutDecision {
  slideId: string;
  composition: CompositionIntent;
  density: SlideDensity;
  recipeId: string;
  reason: string;
}

export interface SessionAsset {
  id: string;
  name: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  width?: number;
  height?: number;
  origin?: {
    kind: "user" | "source-embedded" | "source-slide-preview" | "source-slide-crop";
    sourceId?: string;
    slideNumber?: number;
    slideNumbers?: number[];
    partName?: string;
    crop?: SourceBox;
  };
}

export interface ExtractedSource {
  id: string;
  name: string;
  mimeType: string;
  type: "text" | "document" | "table" | "image";
  content?: string;
  sheets?: Array<{ name: string; rows: unknown[][] }>;
  assetId?: string;
  width?: number;
  height?: number;
  pptx?: PptxEvidence;
  warnings: string[];
}

export interface SourceInput {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface DeckSessionV2 {
  schemaVersion: 2;
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deck: DeckSpec;
  sources: ExtractedSource[];
  assets: SessionAsset[];
}

export interface StructuralIssue {
  severity: "warning" | "error";
  code: string;
  message: string;
  slideId?: string;
  elementId?: string;
}

export type PackageCheck =
  | { status: "not-run"; valid: false; parts: 0; slideParts: 0; issues: string[] }
  | { status: "checked"; valid: boolean; parts: number; slideParts: number; issues: string[] };

export interface BuildReport {
  runtime: "browser" | "node";
  sessionId?: string;
  output?: string;
  slideCount: number;
  byteLength: number;
  diagnostics: Array<{ severity: string; code: string; message: string; path: string }>;
  exportWarnings: Array<{ code: string; message: string; slideId?: string; assetId?: string }>;
  structuralIssues: StructuralIssue[];
  layoutDecisions: LayoutDecision[];
  packageChecks: PackageCheck;
  previewStatus: "not-run" | "rendered" | "rendered-with-warnings" | "failed";
  exportStatus: "not-run" | "generated" | "generated-with-warnings" | "failed";
  renderStatus: "not-run" | "skipped" | "partial" | "rendered";
  restyleAudit?: RestyleAudit;
  generatedAt: string;
}

export interface RestyleSlideAudit {
  sourceId: string;
  slideNumber: number;
  mappedOutputSlideIds: string[];
  textRetention: number;
  warnings: string[];
}

export interface RestyleAudit {
  status: "not-applicable" | "checked";
  sourceSlideCount: number;
  referencedSourceSlideCount: number;
  sourceCoverage: number;
  aggregateTextRetention: number;
  unreferencedSourceSlides: Array<{ sourceId: string; slideNumber: number }>;
  rasterizedSlideRiskIds: string[];
  assetIssueIds: string[];
  slideAudits: RestyleSlideAudit[];
  issues: StructuralIssue[];
}

export type AssetResolver = (assetId: string) =>
  | { source: { type: "url" | "path"; value: string }; mimeType: string; dedupeKey?: string }
  | undefined;
