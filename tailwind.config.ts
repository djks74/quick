import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#cc6119",
        secondary: "#6c98e1",
        accent: "#1280DF",
        background: "#FFFFFF",
        "background-shade": "#F0F3F7",
        text: "#010101",
        "text-muted": "#666666",
      },
    },
  },
  plugins: [],
};
export default config;
