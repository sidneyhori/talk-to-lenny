import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#ffffff",
        foreground: "#0f0f0f",
        card: "#faf8f5",
        "card-hover": "#f5f3f0",
        border: "#e8e5e0",
        muted: "#737373",
        accent: "#f97316",
        "accent-hover": "#ea580c",
        "accent-muted": "#fef7ed",
      },
      maxWidth: {
        content: "1400px",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        handwriting: ["var(--font-handwriting)", "cursive"],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
