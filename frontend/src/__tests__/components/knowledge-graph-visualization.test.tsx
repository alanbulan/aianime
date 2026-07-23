// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18next from "i18next";
import { beforeAll, describe, expect, it } from "vitest";

import {
  KnowledgeGraphVisualization,
  buildKnowledgeGraphLayout,
} from "@/components/ingest/KnowledgeGraphVisualization";
import type { KnowledgeGraphSnapshot } from "@/lib/queries/ingest";

const graph: KnowledgeGraphSnapshot = {
  nodes: [
    {
      id: "hero",
      label: "林昭",
      type: "Entity",
      degree: 1,
      properties: { description: "主角" },
    },
    {
      id: "place",
      label: "雨巷",
      type: "Document",
      degree: 1,
      properties: { chapter: 1 },
    },
  ],
  edges: [
    {
      id: "edge-1",
      source: "hero",
      target: "place",
      relation: "appears_in",
      properties: {},
    },
  ],
  total_nodes: 2,
  total_edges: 1,
  truncated: false,
};

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          common: { close: "Close", clear: "Clear" },
          ingest: {
            knowledgeGraph: {
              title: "Knowledge Graph",
              stats: "{{nodes}} nodes · {{edges}} relationships",
              visibleStats: "Showing {{visible}} of {{total}} nodes",
              connections: "{{count}} connections",
              relationships: "Relationships",
              properties: "Node details",
              searchPlaceholder: "Search entities or properties",
              filterType: "Filter node type",
              allTypes: "All types",
              empty: "No matching nodes",
              emptyHint: "Clear the filters.",
              interactionHint: "Drag to pan",
              truncated: "Showing core relationships",
              zoomIn: "Zoom in",
              zoomOut: "Zoom out",
              resetView: "Reset view",
              expand: "Expand graph",
              collapse: "Collapse graph",
              types: {
                Entity: "Entity",
                Document: "Document",
                Unknown: "Other",
              },
              relations: { appears_in: "appears in" },
            },
          },
        },
      },
    },
  });
});

function renderGraph() {
  return render(
    <I18nextProvider i18n={i18n}>
      <KnowledgeGraphVisualization graph={graph} />
    </I18nextProvider>,
  );
}

describe("KnowledgeGraphVisualization", () => {
  it("builds a deterministic bounded layout", () => {
    const first = buildKnowledgeGraphLayout(graph);
    const second = buildKnowledgeGraphLayout(graph);

    expect(second).toEqual(first);
    expect(first.every((node) => node.x >= 35 && node.x <= 965)).toBe(true);
    expect(first.every((node) => node.y >= 28 && node.y <= 532)).toBe(true);
  });

  it("searches node properties and exposes relationship details", async () => {
    const user = userEvent.setup();
    renderGraph();

    expect(screen.getByRole("button", { name: "林昭, Entity" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "雨巷, Document" })).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "Search entities or properties" }),
      "主角",
    );
    expect(screen.getByRole("button", { name: "林昭, Entity" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "雨巷, Document" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    await user.click(screen.getByRole("button", { name: "林昭, Entity" }));

    expect(screen.getByText("appears in")).toBeInTheDocument();
    expect(screen.getByText("主角")).toBeInTheDocument();
  });
});
