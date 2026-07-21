import type { Config } from "tailwindcss";

// Identidade visual Vettia: preto #080808, violeta #7B5FEF.
// Tipografia (Outfit Display / DM Sans) é carregada no layout raiz via
// next/font e exposta como variáveis CSS.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        fundo: "#080808",
        superficie: "#111114",
        borda: "#232329",
        primaria: {
          DEFAULT: "#7B5FEF",
          suave: "#9C86F3",
          escura: "#5B41C4",
        },
        texto: {
          DEFAULT: "#F5F5F7",
          suave: "#A1A1AA",
        },
      },
      fontFamily: {
        titulo: ["var(--fonte-titulo)", "system-ui", "sans-serif"],
        corpo: ["var(--fonte-corpo)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
