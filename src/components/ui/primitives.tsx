"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Check, Minus, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  containerClassName?: string;
  disableToggle?: boolean;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, containerClassName, disableToggle, dir, disabled, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const { t } = useTranslation();
    const toggleLabel = visible ? t("hide_password") : t("show_password");

    if (disableToggle) {
      return (
        <input
          ref={ref}
          type="password"
          dir={dir}
          disabled={disabled}
          className={cn(
            "h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-ink outline-none transition placeholder:text-faint",
            "focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
            className
          )}
          {...props}
        />
      );
    }

    return (
      <div className={cn("relative flex items-center w-full", containerClassName)} dir={dir}>
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          dir={dir}
          disabled={disabled}
          className={cn(
            "h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] ps-3 pe-9 text-[13px] text-ink outline-none transition placeholder:text-faint",
            "focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
            className
          )}
          {...props}
        />
        <button
          type="button"
          disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onClick={() => setVisible((prev) => !prev)}
          onMouseDown={(e) => e.preventDefault()}
          aria-label={toggleLabel}
          title={toggleLabel}
          className={cn(
            "absolute end-1 top-1/2 -translate-y-1/2 z-[1] flex size-7 items-center justify-center rounded-[var(--radius-xs)] text-muted transition hover:bg-[var(--surface-hover)] hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]",
            disabled && "pointer-events-none opacity-40"
          )}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
  disableToggle?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, containerClassName, disableToggle, ...props }, ref) => {
    if (type === "password" && !disableToggle) {
      return (
        <PasswordInput
          ref={ref}
          className={className}
          containerClassName={containerClassName}
          disableToggle={disableToggle}
          {...props}
        />
      );
    }

    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-ink outline-none transition placeholder:text-faint",
          "focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-faint",
      "focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";


export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer size-[15px] shrink-0 rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface)] transition-colors",
      "data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)]",
      "data-[state=indeterminate]:border-[var(--accent)] data-[state=indeterminate]:bg-[var(--accent)]",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
      {props.checked === "indeterminate" ? (
        <Minus className="size-3" strokeWidth={3} />
      ) : (
        <Check className="size-3" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";


export function Progress({
  value,
  className,
  indeterminate,
}: {
  value: number;
  className?: string;
  indeterminate?: boolean;
}) {
  return (
    <ProgressPrimitive.Root
      value={value}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]",
        indeterminate && "shimmer",
        className
      )}
    >
      <ProgressPrimitive.Indicator
        className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[#0ea5e9] transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </ProgressPrimitive.Root>
  );
}


export const Separator = React.forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    orientation={orientation}
    className={cn(
      "bg-[var(--border)]",
      orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
      className
    )}
    {...props}
  />
));
Separator.displayName = "Separator";


export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
      "bg-[var(--border-strong)] data-[state=checked]:bg-[var(--accent)]",
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-[14px] translate-x-[2px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[16px]" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";


export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-8 items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-0.5",
      className
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] font-medium text-muted transition-all",
      "data-[state=active]:bg-[var(--surface)] data-[state=active]:text-ink data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = TabsPrimitive.Content;


export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  children,
  label,
  side = "bottom",
  shortcut,
}: {
  children: React.ReactNode;
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  shortcut?: string;
}) {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-100 flex items-center gap-1.5 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-ink shadow-[var(--shadow-float)] data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95"
        >
          {label}
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}


export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-1 font-mono text-[10px] font-medium text-muted",
        className
      )}
    >
      {children}
    </kbd>
  );
}


export function Badge({
  children,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  const tones: Record<string, string> = {
    neutral: "border-[var(--border)] bg-[var(--surface-2)] text-muted",
    accent: "border-transparent bg-[var(--accent-soft)] text-[var(--accent)]",
    success: "border-transparent bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-[var(--success)]",
    warning: "border-transparent bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] text-[var(--warning)]",
    danger: "border-transparent bg-[color-mix(in_oklab,var(--danger)_16%,transparent)] text-[var(--danger)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}


export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[var(--radius-xs)] bg-[var(--surface-2)]", className)} />;
}


export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-6 py-14 text-center",
        className
      )}
    >
      {icon ? (
        <div className="flex size-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description ? <p className="max-w-sm text-[12.5px] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
