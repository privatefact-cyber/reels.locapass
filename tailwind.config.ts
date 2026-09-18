import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Cormorant Garamond'", "serif"],
        // トップのFEATURED枠(黒×ゴールドの誌面風演出)専用の和文明朝体。他画面のゴシック体とは分けて使う。
        mincho: ["'Shippori Mincho'", "serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#e0245e",
          dark: "#b91c4a",
        },
        gold: {
          DEFAULT: "#d4af6a",
          light: "#e8cf9a",
          dark: "#a97e3f",
        },
      },
    },
  },
  plugins: [],
};

export default config;
