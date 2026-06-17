import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Loop / NDI palette from the design doc.
        cream: "#FFF7EC", // app background
        ink: "#241F33", // primary text
        muted: "#6B6280", // secondary text
        line: "#EFE4D4", // soft borders
        sun: "#FFE2A8", // yellow accent / blobs
        blush: "#FFD8D2", // pink accent / blobs
        brand: {
          DEFAULT: "#FF6B5E", // coral
          dark: "#E0493D", // coral shadow (3D button base)
          ink: "#241F33",
        },
        // The four classic answer-tile colours, distinguished by BOTH colour and
        // shape (colour-blind safe). Tuned to sit well on the cream theme.
        tile: {
          red: "#E84B5C",
          blue: "#2F6BFF",
          yellow: "#F4A100",
          green: "#1FA971",
        },
      },
      fontFamily: {
        display: ["var(--font-fredoka)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-dmsans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Chunky "3D" bottom shadow used on primary buttons / brand mark.
        pop: "0 6px 0 var(--tw-shadow-color)",
        card: "0 10px 30px rgba(36,31,51,.08)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
