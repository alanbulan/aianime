// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JsonNode } from "@/features/superchat/structured-json-view";

describe("SuperChat structured JSON view", () => {
  it("renders string, number, boolean, and null scalars", () => {
    render(
      <div>
        <JsonNode name="text" value="hello" />
        <JsonNode name="count" value={42} />
        <JsonNode name="enabled" value={false} />
        <JsonNode name="empty" value={null} />
      </div>,
    );

    expect(screen.getByText("text")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("labels array entries with stable one-based indexes", () => {
    render(<JsonNode name="items" value={["first", "second"]} />);

    expect(screen.getByText("items")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("uses an object's title as its heading and recursively renders fields", () => {
    render(
      <JsonNode
        name="fallback heading"
        value={{
          title: "Scene 1",
          metadata: { status: "ready" },
        }}
      />,
    );

    expect(screen.queryByText("fallback heading")).toBeNull();
    expect(screen.getAllByText("Scene 1")).toHaveLength(2);
    expect(screen.getByText("metadata")).toBeInTheDocument();
    expect(screen.getByText("status")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });
});
