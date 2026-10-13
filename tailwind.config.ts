import type { Config } from "tailwindcss";

// Identidade Consominas: o vermelho do origami do logotipo como destaque, o verde do "Grupo" como
// cor principal e o quase-preto esverdeado do "consominas" para o texto. Neutros levemente
// esverdeados (nada de cinza puro).
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101B17",
        ground: "#F3F5F2",
        line: "#E1E7E3",
        brand: {
          DEFAULT: "#0A9E7F",
          dark: "#077A62",
          deep: "#0A3D32",
          soft: "#E2F5EF",
          light: "#E2F5EF",
        },
        accent: {
          DEFAULT: "#E63329",
          dark: "#C22921",
          soft: "#FDE8E6",
        },
        ok: { DEFAULT: "#0E8F63", soft: "#DDF3E8" },
        info: { DEFAULT: "#1D6FB8", soft: "#E1EEFA" },
        warn: { DEFAULT: "#B86E00", soft: "#FFEFD2" },
        bad: { DEFAULT: "#C9342B", soft: "#FDE8E6" },
        gray: {
          50: "#F7F9F7",
          100: "#EEF2EF",
          200: "#E1E7E3",
          300: "#CBD4CE",
          400: "#9AA8A1",
          500: "#6F7E77",
          600: "#55645D",
          700: "#3E4A45",
          800: "#28332E",
          900: "#17211D",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,27,23,0.04), 0 4px 14px rgba(16,27,23,0.05)",
        pop: "0 10px 40px rgba(16,27,23,0.18)",
      },
      borderRadius: {
        xl2: "18px",
      },
    },
  },
  plugins: [],
};
export default config;
