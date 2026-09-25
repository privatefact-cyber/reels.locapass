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
      keyframes: {
        // AIチャットボタンの初回アピール(一度だけ「ぷるん」と弾む)。
        "ai-nudge": {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "25%": { transform: "translateY(-7px) scale(1.07)" },
          "45%": { transform: "translateY(0) scale(0.96)" },
          "65%": { transform: "translateY(-3px) scale(1.03)" },
          "85%": { transform: "translateY(0) scale(0.99)" },
        },
        "ai-teaser-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "ai-nudge": "ai-nudge 0.9s ease-out 1",
        // 終わりの状態を保持しない(保持すると、消えるときの opacity-0 のフェードが効かなくなる)。
        "ai-teaser-in": "ai-teaser-in 0.35s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
