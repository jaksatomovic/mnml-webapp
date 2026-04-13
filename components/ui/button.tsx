import { ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "default" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    "bg-ink text-white border border-ink/90 shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-ink/92 hover:shadow-md active:scale-[0.98]",
  outline:
    "bg-white/80 text-ink border border-ink/12 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-paper-dark hover:border-ink/20 active:scale-[0.98]",
  ghost:
    "bg-transparent text-ink border border-transparent hover:bg-ink/[0.06] active:bg-ink/[0.08]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-sm",
  default: "px-5 py-2.5 text-sm",
  lg: "px-8 py-3 text-base",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/15 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
export type { ButtonProps };
