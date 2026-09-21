import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "rgb(0 31 63 / <alpha-value>)",
        binder: {
          DEFAULT: "rgb(var(--binder-rgb, 0 31 63) / <alpha-value>)",
          deep: "rgb(var(--binder-deep-rgb, 0 20 41) / <alpha-value>)",
          soft: "rgb(var(--binder-soft-rgb, 13 48 82) / <alpha-value>)",
        },
        paper: "rgb(var(--paper-rgb, 255 255 255) / <alpha-value>)",
        canvas: "rgb(var(--canvas-rgb, 240 240 240) / <alpha-value>)",
        rule: "rgb(var(--rule-rgb, 226 223 217) / <alpha-value>)",
        grey: "rgb(var(--background-rgb, 240 240 240) / <alpha-value>)",
        brand: "rgb(var(--brand-rgb, 0 31 63) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb, 255 215 0) / <alpha-value>)",
        indigo: "rgb(var(--indigo-rgb, 41 41 122) / <alpha-value>)",
        background: "rgb(var(--background-rgb, 240 240 240) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--surface-rgb, 255 255 255) / <alpha-value>)",
          subtle: "rgb(var(--surface-subtle-rgb, 248 247 245) / <alpha-value>)",
        },
        foreground: "rgb(var(--foreground-rgb, 27 21 19) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb, 101 94 90) / <alpha-value>)",
        border: "rgb(var(--border-rgb, 226 223 217) / <alpha-value>)",
        success: {
          DEFAULT:
            "rgb(var(--success-foreground-rgb, 54 83 20) / <alpha-value>)",
          accent: "rgb(var(--success-rgb, 182 213 136) / <alpha-value>)",
          surface:
            "rgb(var(--success-surface-rgb, 244 248 237) / <alpha-value>)",
          border: "rgb(var(--success-border-rgb, 160 194 111) / <alpha-value>)",
        },
        warning: {
          DEFAULT:
            "rgb(var(--warning-foreground-rgb, 107 87 0) / <alpha-value>)",
          accent: "rgb(var(--warning-rgb, 255 215 0) / <alpha-value>)",
          surface:
            "rgb(var(--warning-surface-rgb, 255 249 214) / <alpha-value>)",
          border: "rgb(var(--warning-border-rgb, 224 185 0) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--danger-rgb, 220 20 60) / <alpha-value>)",
          hover: "rgb(var(--danger-hover-rgb, 180 15 48) / <alpha-value>)",
          surface:
            "rgb(var(--danger-surface-rgb, 255 240 243) / <alpha-value>)",
          border: "rgb(var(--danger-border-rgb, 241 166 181) / <alpha-value>)",
        },
        info: {
          DEFAULT: "rgb(var(--info-rgb, 41 41 122) / <alpha-value>)",
          surface: "rgb(var(--info-surface-rgb, 242 242 251) / <alpha-value>)",
          border: "rgb(var(--info-border-rgb, 181 181 220) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "Archivo Variable",
          "Arial",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        "page-title": [
          "1.625rem",
          { lineHeight: "2rem", letterSpacing: "-0.025em", fontWeight: "700" },
        ],
        "section-title": [
          "1.125rem",
          {
            lineHeight: "1.625rem",
            letterSpacing: "-0.01em",
            fontWeight: "700",
          },
        ],
        body: ["0.875rem", { lineHeight: "1.375rem" }],
        caption: ["0.75rem", { lineHeight: "1.125rem" }],
      },
      spacing: {
        "control-sm": "2.25rem",
        control: "2.5rem",
        "control-touch": "2.75rem",
      },
      borderRadius: { lg: "0.5rem", xl: "0.625rem", "2xl": "0.875rem" },
      boxShadow: {
        control: "0 1px 2px rgb(0 31 63 / 0.045)",
        card: "0 4px 14px -10px rgb(0 31 63 / 0.24)",
        sheet: "0 8px 24px -18px rgb(0 31 63 / 0.28)",
        lift: "0 20px 48px -20px rgb(0 20 41 / 0.34)",
      },
    },
  },
  plugins: [],
};
export default config;
