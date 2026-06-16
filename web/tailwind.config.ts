import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // The four classic answer-tile colours (colour-blind-safe pairing with
        // distinct shapes assigned in the AnswerTile component).
        tile: {
          red: "#e21b3c",
          blue: "#1368ce",
          yellow: "#d89e00",
          green: "#26890c",
        },
        brand: {
          DEFAULT: "#46178f",
          dark: "#2d0e5c",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
