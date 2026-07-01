import * as React from "react"
import { cn } from "../../lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg px-3 py-2 text-sm outline-none placeholder:text-sm file:border-0 file:bg-transparent file:text-sm disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        style={{ background: "var(--bg)", color: "var(--fg)", border: "1px solid var(--border-subtle)" }}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
