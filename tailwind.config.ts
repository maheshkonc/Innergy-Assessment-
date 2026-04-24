import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        innergy: {
          background: "#FFFAEF",
          pink: "#FF3F64",
          yellow: "#FFDE59",
          brown: "#36211B",
          sand: "#F5ECDF",
        },
      },
    },
  },
  plugins: [],
};

export default config;
