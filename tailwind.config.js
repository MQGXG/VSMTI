/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 主色调：经典蓝 (Vercel/Stripe 风格)
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        // 强调色：青色
        accent: {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63",
        },
        // 中性色：柔和灰
        neutral: {
          50: "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          300: "#d1d5db",
          400: "#9ca3af",
          500: "#6b7280",
          600: "#4b5563",
          700: "#374151",
          800: "#1f2937",
          900: "#111827",
          950: "#0f1117",
        },
        // 功能色
        success: "#10b981",
        warning: "#f59e0b",
        error: "#ef4444",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #3b82f6, #06b6d4)",
        "gradient-primary-hover": "linear-gradient(135deg, #60a5fa, #22d3ee)",
        "gradient-primary-subtle": "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(6,182,212,0.12))",
        "gradient-brand": "linear-gradient(135deg, #3b82f6, #06b6d4)",
        "gradient-brand-glow": "linear-gradient(135deg, rgba(59,130,246,0.8), rgba(6,182,212,0.8))",
        "gradient-user-msg": "linear-gradient(135deg, #3b82f6, #06b6d4)",
      },
      boxShadow: {
        "glow-primary": "0 0 0 3px rgba(59, 130, 246, 0.2)",
        "glow-primary-lg": "0 0 20px rgba(59, 130, 246, 0.15)",
        "glow-accent": "0 0 0 3px rgba(6, 182, 212, 0.2)",
        "glass": "0 8px 32px rgba(0, 0, 0, 0.24)",
        "glass-lg": "0 16px 48px rgba(0, 0, 0, 0.32)",
        "card": "0 2px 8px rgba(0, 0, 0, 0.08)",
        "card-hover": "0 8px 24px rgba(0, 0, 0, 0.12)",
      },
      borderRadius: {
        "card": "16px",
        "button": "24px",
        "input": "12px",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.25s ease-out",
        "bounce-dot": "bounce-dot 1.4s ease-in-out infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1", filter: "brightness(1)" },
          "50%": { opacity: "0.7", filter: "brightness(1.3)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "bounce-dot": {
          "0%, 80%, 100%": { transform: "scale(0)" },
          "40%": { transform: "scale(1)" },
        },
      },
      fontFamily: {
        sans: ["Inter", "SF Pro Display", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
