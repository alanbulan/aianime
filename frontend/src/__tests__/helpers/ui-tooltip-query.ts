// Copyright (c) 2026 AI anime
import { waitFor } from "@testing-library/react";

type TooltipMatcher = string | RegExp;
type TooltipContainer = Document | DocumentFragment | HTMLElement;

function matches(value: string, matcher: TooltipMatcher): boolean {
  if (typeof matcher === "string") return value === matcher;
  matcher.lastIndex = 0;
  return matcher.test(value);
}

function matchesIn(
  container: TooltipContainer,
  matcher: TooltipMatcher,
): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-ui-tooltip]"),
  ).filter((element) =>
    matches(element.getAttribute("data-ui-tooltip") ?? "", matcher),
  );
}

export function queryByUiTooltip(
  matcher: TooltipMatcher,
  container: TooltipContainer = document.body,
): HTMLElement | null {
  const matches = matchesIn(container, matcher);
  if (matches.length > 1) {
    throw new Error(`Found multiple elements with UI tooltip: ${matcher}`);
  }
  return matches[0] ?? null;
}

export function queryAllByUiTooltip(
  matcher: TooltipMatcher,
  container: TooltipContainer = document.body,
): HTMLElement[] {
  return matchesIn(container, matcher);
}

export function getByUiTooltip(
  matcher: TooltipMatcher,
  container: TooltipContainer = document.body,
): HTMLElement {
  const element = queryByUiTooltip(matcher, container);
  if (!element) throw new Error(`Unable to find UI tooltip: ${matcher}`);
  return element;
}

export function getAllByUiTooltip(
  matcher: TooltipMatcher,
  container: TooltipContainer = document.body,
): HTMLElement[] {
  const elements = queryAllByUiTooltip(matcher, container);
  if (elements.length === 0) {
    throw new Error(`Unable to find UI tooltip: ${matcher}`);
  }
  return elements;
}

export async function findByUiTooltip(
  matcher: TooltipMatcher,
  container: TooltipContainer = document.body,
): Promise<HTMLElement> {
  return waitFor(() => getByUiTooltip(matcher, container));
}

export async function findAllByUiTooltip(
  matcher: TooltipMatcher,
  container: TooltipContainer = document.body,
): Promise<HTMLElement[]> {
  return waitFor(() => getAllByUiTooltip(matcher, container));
}
