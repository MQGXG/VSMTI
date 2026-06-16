/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 主色调：青绿 + 蓝色
        primary: {
          50: "#e6fff9",
          100: "#b3ffe8",
          200: "#80ffd8",
          300: "#4dffc7",
          400: "#1affb7",
          500: "#00D9C0",
          600: "#00b4a0",
          700: "#008f80",
          800: "#006b60",
          900: "#004740",
        },
        // 强调色：天蓝
        accent: {
          50: "#e6f7ff",
          100: "#b3e5ff",
          200: "#80d4ff",
          300: "#4dc2ff",
          400: "#1ab1ff",
          500: "#00A8E8",
          600: "#0086ba",
          700: "#00658c",
          800: "#00435e",
          900: "#002230",
        },
        // 渐变色组合
        gradient: {
          start: "#00D9C0",
          mid: "#00B8D4",
          end: "#00A8E8",
        },
        // 中性色
        neutral: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          850: "#172032",
          900: "#0f172a",
          950: "#0A0F14",
        },
        // 表面色
        surface: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          800: "#0F1A20",
          900: "#0A0F14",
          950: "#060a0e",
        },
        // 玻璃效果色
        glass: {
          light: "rgba(255,255,255,0.04)",
          DEFAULT: "rgba(255,255,255,0.06)",
          medium: "rgba(255,255,255,0.08)",
          heavy: "rgba(255,255,255,0.12)",
          border: "rgba(255,255,255,0.08)",
        },
        // 功能色
        success: "#00D9C0",
        warning: "#FFB800",
        error: "#FF4757",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #00D9C0, #00A8E8)",
        "gradient-primary-hover": "linear-gradient(135deg, #00E8D0, #00B8F0)",
        "gradient-primary-subtle": "linear-gradient(135deg, rgba(0,217,192,0.15), rgba(0,168,232,0.15))",
        "gradient-sidebar": "linear-gradient(180deg, #0F2A2E 0%, #0A1418 100%)",
        "gradient-user-msg": "linear-gradient(135deg, #00B4A0, #0088A8)",
        "gradient-brand": "linear-gradient(135deg, #00D9C0, #00A8E8)",
        "gradient-brand-glow": "linear-gradient(135deg, rgba(0,217,192,0.8), rgba(0,168,232,0.8))",
      },
      boxShadow: {
        "glow-primary": "0 0 0 3px rgba(0, 217, 192, 0.2)",
        "glow-primary-lg": "0 0 20px rgba(0, 217, 192, 0.15)",
        "glow-accent": "0 0 0 3px rgba(0, 168, 232, 0.2)",
        "glass": "0 8px 32px rgba(0, 0, 0, 0.24)",
        "glass-lg": "0 16px 48px rgba(0, 0, 0, 0.32)",
        "card": "0 2px 8px rgba(0, 0, 0, 0.12)",
        "card-hover": "0 8px 24px rgba(0, 0, 0, 0.2)",
        "sidebar": "4px 0 24px rgba(0, 0, 0, 0.2)",
      },
      backdropBlur: {
        xs: "2px",
        glass: "16px",
        "glass-heavy": "24px",
      },
      borderRadius: {
        "card": "16px",
        "button": "24px",
        "input": "12px",
        "avatar": "50%",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.25s ease-out",
        "bounce-dot": "bounce-dot 1.4s ease-in-out infinite",
        "progress": "progress 2s ease-in-out infinite",
        "glow": "glow 2s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "float": "float 3s ease-in-out infinite",
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
        "progress": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        "glow": {
          "0%, 100%": { boxShadow: "0 0 5px rgba(0, 217, 192, 0.5)" },
          "50%": { boxShadow: "0 0 20px rgba(0, 217, 192, 0.8)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
      },
      fontSize: {
        "brand": ["48px", { lineHeight: "1.2", fontWeight: "700" }],
        "heading": ["24px", { lineHeight: "1.2", fontWeight: "600" }],
        "subheading": ["18px", { lineHeight: "1.3", fontWeight: "500" }],
        "body": ["14px", { lineHeight: "1.6" }],
        "caption": ["12px", { lineHeight: "1.5" }],
        "tiny": ["10px", { lineHeight: "1.4" }],
      },
      fontFamily: {
        sans: ["Inter", "SF Pro Display", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
