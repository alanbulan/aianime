// Copyright (c) 2026 AI anime
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import {
  Maximize2,
  Minimize2,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  KnowledgeGraphNode,
  KnowledgeGraphSnapshot,
} from "@/lib/queries/ingest";
import { cn } from "@/lib/utils";

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 560;

const NODE_TYPE_COLORS: Record<string, string> = {
  Entity: "var(--primary)",
  EntityType: "var(--chart-4)",
  TextSummary: "var(--success)",
  Document: "var(--warning)",
  DocumentChunk: "var(--muted-foreground)",
  Unknown: "var(--chart-3)",
};

interface LayoutNode extends KnowledgeGraphNode {
  x: number;
  y: number;
  radius: number;
  color: string;
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildKnowledgeGraphLayout(
  graph: KnowledgeGraphSnapshot,
): LayoutNode[] {
  const nodes = graph.nodes.map((node, index) => {
    const seed = hashText(node.id);
    const angle = ((seed % 360) * Math.PI) / 180 + index * 2.399;
    const distance = 45 + Math.sqrt(index + 1) * 27;
    return {
      ...node,
      x: VIEW_WIDTH / 2 + Math.cos(angle) * distance,
      y: VIEW_HEIGHT / 2 + Math.sin(angle) * distance * 0.6,
      radius: Math.min(18, 7 + Math.sqrt(Math.max(1, node.degree)) * 1.8),
      color: NODE_TYPE_COLORS[node.type] ?? NODE_TYPE_COLORS.Unknown,
      vx: 0,
      vy: 0,
    };
  });
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const springs = graph.edges
    .map((edge) => [indexById.get(edge.source), indexById.get(edge.target)] as const)
    .filter(
      (pair): pair is readonly [number, number] =>
        pair[0] != null && pair[1] != null,
    );

  for (let step = 0; step < 120; step += 1) {
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const a = nodes[left];
        const b = nodes[right];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const distanceSquared = Math.max(64, dx * dx + dy * dy);
        const distance = Math.sqrt(distanceSquared);
        dx /= distance;
        dy /= distance;
        const force = 1350 / distanceSquared;
        a.vx -= dx * force;
        a.vy -= dy * force;
        b.vx += dx * force;
        b.vy += dy * force;
      }
    }
    for (const [sourceIndex, targetIndex] of springs) {
      if (sourceIndex === targetIndex) continue;
      const source = nodes[sourceIndex];
      const target = nodes[targetIndex];
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const force = (distance - 82) * 0.0024;
      source.vx += (dx / distance) * force;
      source.vy += (dy / distance) * force;
      target.vx -= (dx / distance) * force;
      target.vy -= (dy / distance) * force;
    }
    for (const node of nodes) {
      node.vx += (VIEW_WIDTH / 2 - node.x) * 0.00045;
      node.vy += (VIEW_HEIGHT / 2 - node.y) * 0.0008;
      node.vx *= 0.84;
      node.vy *= 0.84;
      node.x = Math.min(VIEW_WIDTH - 35, Math.max(35, node.x + node.vx));
      node.y = Math.min(VIEW_HEIGHT - 28, Math.max(28, node.y + node.vy));
    }
  }

  return nodes.map(({ vx: _vx, vy: _vy, ...node }) => node);
}

function formatProperty(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function searchableProperties(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value).toLocaleLowerCase();
  } catch {
    return "";
  }
}

function propertyLabel(key: string): string {
  return key.replace(/_/g, " ");
}

function GraphControl({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClick}
            aria-label={label}
            className="size-8"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={7}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function KnowledgeGraphVisualization({
  graph,
  className,
}: {
  graph: KnowledgeGraphSnapshot;
  className?: string;
}) {
  const { t } = useTranslation();
  const patternId = useId().replace(/:/g, "");
  const nodes = useMemo(() => buildKnowledgeGraphLayout(graph), [graph]);
  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const nodeTypes = useMemo(
    () => [...new Set(nodes.map((node) => node.type || "Unknown"))].sort(),
    [nodes],
  );
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    x: number;
    y: number;
  } | null>(null);

  const typeLabel = (type: string) =>
    t(`ingest.knowledgeGraph.types.${type || "Unknown"}`, {
      defaultValue: type || t("ingest.knowledgeGraph.types.Unknown"),
    });
  const relationLabel = (relation: string) =>
    t(`ingest.knowledgeGraph.relations.${relation}`, {
      defaultValue: relation.replace(/_/g, " "),
    });

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleNodes = useMemo(
    () =>
      nodes.filter((node) => {
        if (typeFilter !== "all" && node.type !== typeFilter) return false;
        if (!normalizedSearch) return true;
        return (
          node.label.toLocaleLowerCase().includes(normalizedSearch) ||
          node.type.toLocaleLowerCase().includes(normalizedSearch) ||
          searchableProperties(node.properties).includes(normalizedSearch)
        );
      }),
    [nodes, normalizedSearch, typeFilter],
  );
  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes],
  );
  const visibleEdges = useMemo(
    () =>
      graph.edges.filter(
        (edge) =>
          visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
      ),
    [graph.edges, visibleNodeIds],
  );

  useEffect(() => {
    if (selectedId && !visibleNodeIds.has(selectedId)) setSelectedId(null);
  }, [selectedId, visibleNodeIds]);

  const selected = selectedId ? nodesById.get(selectedId) ?? null : null;
  const selectedRelations = useMemo(() => {
    if (!selectedId) return [];
    return graph.edges
      .filter((edge) => edge.source === selectedId || edge.target === selectedId)
      .slice(0, 12)
      .map((edge) => {
        const neighborId = edge.source === selectedId ? edge.target : edge.source;
        return {
          id: edge.id,
          relation: edge.relation,
          neighborId,
          neighbor: nodesById.get(neighborId)?.label ?? neighborId,
        };
      });
  }, [graph.edges, nodesById, selectedId]);
  const selectedNeighborIds = useMemo(() => {
    const result = new Set<string>();
    if (!selectedId) return result;
    for (const edge of visibleEdges) {
      if (edge.source === selectedId) result.add(edge.target);
      if (edge.target === selectedId) result.add(edge.source);
    }
    return result;
  }, [selectedId, visibleEdges]);
  const visibleLabels = useMemo(
    () =>
      new Set(
        [...visibleNodes]
          .sort((a, b) => b.degree - a.degree)
          .slice(0, normalizedSearch ? 40 : 24)
          .map((node) => node.id),
      ),
    [normalizedSearch, visibleNodes],
  );

  const zoom = (factor: number) =>
    setView((current) => ({
      ...current,
      scale: Math.min(2.6, Math.max(0.55, current.scale * factor)),
    }));
  const resetView = () => setView({ x: 0, y: 0, scale: 1 });

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: view.x,
      y: view.y,
    };
  };
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    setView((current) => ({
      ...current,
      x: drag.x + ((event.clientX - drag.clientX) / bounds.width) * VIEW_WIDTH,
      y: drag.y + ((event.clientY - drag.clientY) / bounds.height) * VIEW_HEIGHT,
    }));
  };
  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    zoom(event.deltaY < 0 ? 1.12 : 0.89);
  };

  return (
    <section
      aria-label={t("ingest.knowledgeGraph.title")}
      className={cn(
        "flex overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-[height] duration-300",
        expanded ? "h-[min(720px,calc(100vh-10rem))]" : "h-[520px]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:mr-auto">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Network className="size-4" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {t("ingest.knowledgeGraph.title")}
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                {t("ingest.knowledgeGraph.stats", {
                  nodes: graph.total_nodes,
                  edges: graph.total_edges,
                })}
              </p>
            </div>
          </div>

          <div className="relative min-w-44 flex-1 sm:w-52 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("ingest.knowledgeGraph.searchPlaceholder")}
              aria-label={t("ingest.knowledgeGraph.searchPlaceholder")}
              className="h-8 pl-8 pr-8 text-xs"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label={t("common.clear", { defaultValue: "Clear" })}
                className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>

          <Select
            value={typeFilter}
            onValueChange={(value) => setTypeFilter(value ?? "all")}
          >
            <SelectTrigger
              aria-label={t("ingest.knowledgeGraph.filterType")}
              className="h-8 w-40 bg-background text-xs"
            >
              <SelectValue>
                {(value: string) =>
                  value === "all"
                    ? t("ingest.knowledgeGraph.allTypes")
                    : typeLabel(value)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} sideOffset={6}>
              <SelectItem value="all">
                {t("ingest.knowledgeGraph.allTypes")}
              </SelectItem>
              {nodeTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: NODE_TYPE_COLORS[type] ?? NODE_TYPE_COLORS.Unknown }}
                    />
                    {typeLabel(type)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TooltipProvider delay={120}>
            <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
              <GraphControl
                label={t("ingest.knowledgeGraph.zoomOut")}
                onClick={() => zoom(0.82)}
              >
                <Minus className="size-3.5" />
              </GraphControl>
              <GraphControl
                label={t("ingest.knowledgeGraph.resetView")}
                onClick={resetView}
              >
                <RotateCcw className="size-3.5" />
              </GraphControl>
              <GraphControl
                label={t("ingest.knowledgeGraph.zoomIn")}
                onClick={() => zoom(1.22)}
              >
                <Plus className="size-3.5" />
              </GraphControl>
              <GraphControl
                label={t(
                  expanded
                    ? "ingest.knowledgeGraph.collapse"
                    : "ingest.knowledgeGraph.expand",
                )}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? (
                  <Minimize2 className="size-3.5" />
                ) : (
                  <Maximize2 className="size-3.5" />
                )}
              </GraphControl>
            </div>
          </TooltipProvider>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/35">
          <svg
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            className="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing"
            aria-label={t("ingest.knowledgeGraph.interactionHint")}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
            onClick={() => setSelectedId(null)}
          >
            <defs>
              <pattern
                id={`${patternId}-grid`}
                width="32"
                height="32"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="1" cy="1" r="0.85" fill="var(--border)" />
              </pattern>
            </defs>
            <rect
              width={VIEW_WIDTH}
              height={VIEW_HEIGHT}
              fill={`url(#${patternId}-grid)`}
              opacity="0.62"
            />
            <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
              {visibleEdges.map((edge) => {
                const source = nodesById.get(edge.source);
                const target = nodesById.get(edge.target);
                if (!source || !target) return null;
                const connected = selectedId === edge.source || selectedId === edge.target;
                return (
                  <line
                    key={edge.id}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={connected ? "var(--primary)" : "var(--muted-foreground)"}
                    strokeWidth={connected ? 2 : 0.9}
                    strokeOpacity={selectedId ? (connected ? 0.9 : 0.12) : 0.34}
                  />
                );
              })}
              {visibleNodes.map((node) => {
                const active = selectedId === node.id;
                const muted =
                  selectedId != null && !active && !selectedNeighborIds.has(node.id);
                const label =
                  node.label.length > 18 ? `${node.label.slice(0, 17)}...` : node.label;
                return (
                  <g
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.label}, ${typeLabel(node.type)}`}
                    transform={`translate(${node.x} ${node.y})`}
                    className="cursor-pointer outline-none"
                    opacity={muted ? 0.24 : 1}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedId(node.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(node.id);
                      }
                    }}
                  >
                    <title>{node.label}</title>
                    <circle r={node.radius * 1.8} fill={node.color} opacity={active ? 0.22 : 0.1} />
                    <circle
                      r={node.radius}
                      fill="var(--card)"
                      stroke={node.color}
                      strokeWidth={active ? 3 : 1.7}
                    />
                    <circle r={Math.max(3, node.radius * 0.3)} fill={node.color} />
                    {(visibleLabels.has(node.id) || active) && (
                      <text
                        y={node.radius + 15}
                        textAnchor="middle"
                        fill="var(--foreground)"
                        stroke="var(--card)"
                        strokeWidth="3"
                        paintOrder="stroke"
                        fontSize={active ? 11 : 9.5}
                        fontWeight={active ? 650 : 520}
                      >
                        {label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {visibleNodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <div>
                <Network className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  {t("ingest.knowledgeGraph.empty")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("ingest.knowledgeGraph.emptyHint")}
                </p>
              </div>
            </div>
          ) : null}

          {selected ? (
            <aside className="absolute inset-x-3 bottom-3 z-10 max-h-[62%] overflow-y-auto rounded-lg border border-border bg-popover/96 p-4 text-popover-foreground shadow-xl backdrop-blur-md sm:inset-x-auto sm:right-3 sm:top-3 sm:w-[310px]">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setSelectedId(null)}
                className="absolute right-2 top-2"
                aria-label={t("common.close")}
              >
                <X className="size-4" />
              </Button>
              <span
                className="inline-flex rounded border bg-background px-2 py-0.5 text-[10px] font-semibold"
                style={{ color: selected.color, borderColor: selected.color }}
              >
                {typeLabel(selected.type)}
              </span>
              <h4 className="mt-3 break-words pr-8 text-base font-semibold leading-6 text-foreground">
                {selected.label}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("ingest.knowledgeGraph.connections", { count: selected.degree })}
              </p>

              {selectedRelations.length > 0 ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("ingest.knowledgeGraph.relationships")}
                  </p>
                  <div className="mt-2 space-y-1">
                    {selectedRelations.map((relation) => (
                      <button
                        key={relation.id}
                        type="button"
                        disabled={!visibleNodeIds.has(relation.neighborId)}
                        onClick={() => setSelectedId(relation.neighborId)}
                        className="flex min-h-8 w-full items-center gap-2 rounded px-2 text-left text-xs transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-60"
                      >
                        <span className="max-w-[112px] shrink-0 truncate text-primary">
                          {relationLabel(relation.relation)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {relation.neighbor}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {Object.keys(selected.properties).length > 0 ? (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("ingest.knowledgeGraph.properties")}
                  </p>
                  {Object.entries(selected.properties)
                    .slice(0, 10)
                    .map(([key, value]) => (
                      <div key={key}>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          {propertyLabel(key)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-foreground/85">
                          {formatProperty(value)}
                        </p>
                      </div>
                    ))}
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>

        <footer className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-card px-4 py-2 text-[11px] text-muted-foreground">
          <span>{t("ingest.knowledgeGraph.interactionHint")}</span>
          <span className="ml-auto">
            {t("ingest.knowledgeGraph.visibleStats", {
              visible: visibleNodes.length,
              total: nodes.length,
            })}
          </span>
          {graph.truncated ? (
            <span className="text-warning">{t("ingest.knowledgeGraph.truncated")}</span>
          ) : null}
        </footer>
      </div>
    </section>
  );
}
