import type { Config } from "tailwindcss";

/**
 * Design language: technical / blueprint. Sharp corners only, a strict spacing
 * scale, one decisive accent. Colors are driven by CSS variables (see
 * globals.css) so the whole palette can be re-keyed to the Hero asset in one
 * place.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // No rounded corners. Anywhere. By design.
    borderRadius: {
      none: "0",
      DEFAULT: "0",
    },
    extend: {
      colors: {
        ink: "rgb(var(--ink) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-ink": "rgb(var(--accent-ink) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      spacing: {
        // 4px base grid, exposed as semantic step names used across the UI.
        px: "1px",
        "1": "0.25rem",
        "2": "0.5rem",
        "3": "0.75rem",
        "4": "1rem",
        "5": "1.25rem",
        "6": "1.5rem",
        "8": "2rem",
        "10": "2.5rem",
        "12": "3rem",
        "16": "4rem",
        "20": "5rem",
        "24": "6rem",
        "32": "8rem",
      },
      letterSpacing: {
        tightest: "-0.04em",
        wider: "0.08em",
        widest: "0.18em",
      },
      maxWidth: {
        shell: "78rem",
      },
    },
  },
  plugins: [],
};

export default config;
