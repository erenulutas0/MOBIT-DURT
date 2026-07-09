import { afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});
