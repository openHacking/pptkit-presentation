export function normalizeSourceReceipt(sources, generatedAt = new Date().toISOString()) {
  if (!Array.isArray(sources)) throw new Error("Source receipt requires a sources array.");
  const ids = new Set();
  const normalized = sources.map((source, index) => {
    if (!source || typeof source !== "object") throw new Error(`sources[${index}] must be an object.`);
    if (typeof source.id !== "string" || source.id.length === 0) throw new Error(`sources[${index}].id is required.`);
    if (ids.has(source.id)) throw new Error(`Source receipt contains duplicate source id ${source.id}.`);
    ids.add(source.id);
    if (typeof source.name !== "string" || source.name.length === 0) throw new Error(`sources[${index}].name is required.`);
    if (typeof source.mimeType !== "string" || source.mimeType.length === 0) throw new Error(`sources[${index}].mimeType is required.`);
    if (typeof source.type !== "string" || source.type.length === 0) throw new Error(`sources[${index}].type is required.`);
    if (source.warnings !== undefined && (!Array.isArray(source.warnings) || source.warnings.some((warning) => typeof warning !== "string"))) {
      throw new Error(`sources[${index}].warnings must be an array of strings.`);
    }
    return {
      ...source,
      warnings: [...(source.warnings ?? [])],
    };
  });
  return Object.freeze({ generatedAt, sources: normalized });
}
