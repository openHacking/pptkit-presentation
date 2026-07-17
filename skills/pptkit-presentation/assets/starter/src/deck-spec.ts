import type { DeckSpec } from "./contracts.js";

export const deckSpec: DeckSpec = {
  design: {
    theme: { id: "clean-business" },
    seed: "untitled-pptkit-deck",
    variation: "balanced",
  },
  brief: {
    title: "Untitled PPTKit Deck",
    audience: "Project stakeholders",
    purpose: "Explain one clear idea and agree on the next action",
    language: "en-US",
    slideCountRange: [3, 5],
    imagePolicy: "Use asset IDs backed by supplied local files",
    constraints: ["Keep every visible object editable in PowerPoint"],
    author: "PPTKit",
  },
  slides: [
    {
      id: "cover",
      role: "cover",
      title: "Replace with the confirmed title",
      subtitle: "Replace with the audience promise",
    },
    {
      id: "core-message",
      role: "statement",
      title: "The core message",
      message: "Replace this placeholder with one defensible, source-backed claim.",
      sourceRefs: [],
    },
    {
      id: "closing",
      role: "closing",
      title: "Next step",
      message: "Replace with the action the audience should take.",
    },
  ],
};
