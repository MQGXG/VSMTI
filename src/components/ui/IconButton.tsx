import { ReactNode } from "react";

interface IconButtonProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
  disabled?: boolean;
  variant?: "ghost" | "danger" | "accent";
  size?: "sm" | "md";
}

export function IconButton({
  children, onClick, className = "", title, disabled, variant = "ghost", size = "sm"
}: IconButtonProps) {
  const sizeClass = size === "sm" ? "p-1.5" : "p-2";
  const variantClass = variant === "danger"
    ? "hover:bg-red-500/20 text-neutral-500 hover:text-red-400"
    : variant === "accent"
    ? "hover:bg-accent-500/20 text-neutral-500 hover:text-accent-400"
    : "hover:bg-white/10 text-neutral-500 hover:text-neutral-300";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${sizeClass} rounded-lg transition-all duration-200 ${variantClass} disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}
