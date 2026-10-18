import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        mist: "#f4f7fb",
        coral: "#d96c5f",
        teal: "#1f8a8a",
        gold: "#b7791f"
      }
    }
  },
  plugins: []
};

export default config;
