import { ReactNode } from "react";

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "light" | "heavy";
  glow?: boolean;
}

export function GlassPanel({ children, className = "", variant = "default", glow = false }: GlassPanelProps) {
  const variantClass = variant === "light" ? "glass-light" : variant === "heavy" ? "glass-heavy" : "glass";
  return (
    <div className={`${variantClass} rounded-2xl ${glow ? "glow" : ""} ${className}`}>
      {children}
    </div>
  );
}
