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
        // AIチャットボタンの「呼吸する光」。ゴールドの光彩が淡くじんわり浮かんで消える(派手な点滅にしない)。
        "ai-glow": {
          "0%, 100%": { boxShadow: "0 0 6px 0 rgba(212, 175, 106, 0.12), 0 10px 15px -3px rgba(0, 0, 0, 0.4)" },
          "50%": { boxShadow: "0 0 18px 3px rgba(212, 175, 106, 0.35), 0 10px 15px -3px rgba(0, 0, 0, 0.4)" },
        },
        "ai-glow-icon": {
          "0%, 100%": { opacity: "0.75", filter: "drop-shadow(0 0 2px rgba(212, 175, 106, 0.25))" },
          "50%": { opacity: "1", filter: "drop-shadow(0 0 8px rgba(212, 175, 106, 0.6))" },
        },
      },
      animation: {
        "ai-glow": "ai-glow 3.6s ease-in-out infinite",
        "ai-glow-icon": "ai-glow-icon 3.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
