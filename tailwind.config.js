/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        neutral: {
          850: "#1a1a1a",
          950: "#0a0a0a",
        },
      },
    },
  },
  plugins: [],
};
