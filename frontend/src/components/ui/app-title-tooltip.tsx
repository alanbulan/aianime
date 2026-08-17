// Copyright (c) 2026 AI anime
import { useEffect, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

const TOOLTIP_ATTRIBUTE = "data-ui-tooltip";
const TOOLTIP_SELECTOR = `[${TOOLTIP_ATTRIBUTE}]`;
const GENERATED_LABEL_ATTRIBUTE = "data-ui-tooltip-generated-label";
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[role='button']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface ActiveTooltip {
  anchor: Element;
  label: string;
}

function tooltipTarget(eventTarget: EventTarget | null): Element | null {
  if (!(eventTarget instanceof Element)) return null;
  const target = eventTarget.closest(TOOLTIP_SELECTOR);
  return target?.closest("[data-slot='tooltip-trigger']") ? null : target;
}

function tooltipLabel(element: Element): string {
  return element.getAttribute(TOOLTIP_ATTRIBUTE)?.trim() ?? "";
}

function syncAccessibleName(element: Element): void {
  const label = tooltipLabel(element);
  const generatedLabel = element.getAttribute(GENERATED_LABEL_ATTRIBUTE);
  const currentLabel = element.getAttribute("aria-label");
  const shouldGenerate =
    Boolean(label) &&
    element.matches(INTERACTIVE_SELECTOR) &&
    !element.textContent?.trim();

  if (!shouldGenerate) {
    if (generatedLabel && currentLabel === generatedLabel) {
      element.removeAttribute("aria-label");
    }
    element.removeAttribute(GENERATED_LABEL_ATTRIBUTE);
    return;
  }

  if (currentLabel && currentLabel !== generatedLabel) {
    element.removeAttribute(GENERATED_LABEL_ATTRIBUTE);
    return;
  }

  element.setAttribute("aria-label", label);
  element.setAttribute(GENERATED_LABEL_ATTRIBUTE, label);
}

/**
 * Renders every `data-ui-tooltip` with the application's themed tooltip.
 * Event delegation covers lazily rendered canvas nodes and editor-created DOM,
 * while source-level checks keep native browser titles out of the application.
 */
export function AppTitleTooltip() {
  const [active, setActive] = useState<ActiveTooltip | null>(null);

  useEffect(() => {
    const syncTree = (root: Element | Document) => {
      if (root instanceof Element && root.hasAttribute(TOOLTIP_ATTRIBUTE)) {
        syncAccessibleName(root);
      }
      root.querySelectorAll(TOOLTIP_SELECTOR).forEach(syncAccessibleName);
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          if (mutation.target instanceof Element) {
            syncAccessibleName(mutation.target);
          }
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) syncTree(node);
          });
          continue;
        }

        const element = mutation.target;
        if (element instanceof Element) syncAccessibleName(element);
      }
      setActive((current) => {
        if (!current || !current.anchor.isConnected) return null;
        const label = tooltipLabel(current.anchor);
        if (!label) return null;
        return label === current.label ? current : { ...current, label };
      });
    });

    observer.observe(document.documentElement, {
      attributeFilter: [TOOLTIP_ATTRIBUTE],
      attributes: true,
      childList: true,
      subtree: true,
    });
    syncTree(document);

    const show = (event: Event) => {
      const anchor = tooltipTarget(event.target);
      if (!anchor) return;
      const label = tooltipLabel(anchor);
      if (!label) return;
      syncAccessibleName(anchor);
      setActive((current) =>
        current?.anchor === anchor && current.label === label
          ? current
          : { anchor, label },
      );
    };

    const hide = (event: Event) => {
      const current = tooltipTarget(event.target);
      const next = tooltipTarget(
        "relatedTarget" in event
          ? (event.relatedTarget as EventTarget | null)
          : null,
      );
      if (current && current === next) return;
      if (
        event.type === "pointerout" &&
        current?.contains(document.activeElement)
      ) {
        return;
      }
      if (event.type === "focusout" && current?.matches(":hover")) return;
      setActive((shown) => (shown?.anchor === current ? null : shown));
    };

    const hideOnActivation = (event: Event) => {
      const current = tooltipTarget(event.target);
      setActive((shown) => (shown?.anchor === current ? null : shown));
    };

    document.addEventListener("pointerover", show, true);
    document.addEventListener("pointerout", hide, true);
    document.addEventListener("pointerdown", hideOnActivation, true);
    document.addEventListener("click", hideOnActivation, true);
    document.addEventListener("focusin", show, true);
    document.addEventListener("focusout", hide, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerover", show, true);
      document.removeEventListener("pointerout", hide, true);
      document.removeEventListener("pointerdown", hideOnActivation, true);
      document.removeEventListener("click", hideOnActivation, true);
      document.removeEventListener("focusin", show, true);
      document.removeEventListener("focusout", hide, true);
    };
  }, []);

  const visibleActive =
    active?.anchor.isConnected && tooltipLabel(active.anchor)
      ? active
      : null;

  return (
    <TooltipProvider delay={120}>
      <Tooltip open={Boolean(visibleActive)} disableHoverablePopup>
        {visibleActive ? (
          <TooltipContent anchor={visibleActive.anchor} sideOffset={7}>
            {visibleActive.label}
          </TooltipContent>
        ) : null}
      </Tooltip>
    </TooltipProvider>
  );
}
