// Copyright (c) 2026 AI anime
import { act, fireEvent } from "@testing-library/react";

// Portaled panels are measured on the next animation frame. Component tests
// exercise commands after that frame; real geometry is verified in Browser Mode.
export async function clickAndLayout(element: Element) {
  fireEvent.click(element);
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}
