import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        innergy: {
          primary: "#1f2937",
          accent: "#0ea5e9",
        },
      },
    },
  },
  plugins: [],
};

export default config;
