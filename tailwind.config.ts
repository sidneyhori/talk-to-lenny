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
        foreground: "#1a1a1a",
        card: "#fafafa",
        border: "#e5e5e5",
        muted: "#737373",
        accent: "#f97316", // Lenny's orange
        "accent-hover": "#ea580c",
        "accent-muted": "#fef3e2", // Muted peach/cream
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
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
