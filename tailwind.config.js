/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        neutral: {
          850: "#1a1a1a",
          950: "#0a0a0a",
        },
        surface: {
          50: "#ffffff",
          100: "#fafafa",
          200: "#f5f5f5",
          300: "#eeeeee",
          800: "#262626",
          900: "#1a1a1a",
          950: "#0a0a0a",
        },
        border: {
          light: "#e5e5e5",
          dark: "#262626",
        },
      },
    },
  },
  plugins: [],
};
