import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#121014",
        surface: "#1B181D",
        surface2: "#221F25",
        line: "#332F37",
        paper: "#F2EFEA",
        muted: "#A39C9E",
        brass: "#E8A33D",
        brassDim: "#B77F2B",
        teal: "#4FB6AE",
        danger: "#E15B4F"
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"]
      },
      keyframes: {
        unpack: {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(1.15)", opacity: "0" }
        },
        rise: {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" }
        }
      },
      animation: {
        unpack: "unpack 0.6s ease-out forwards",
        rise: "rise 0.4s ease-out forwards"
      }
    }
  },
  plugins: []
};

export default config;
