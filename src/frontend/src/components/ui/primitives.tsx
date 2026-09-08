import {
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Icon, type IconName } from "./Icon";

export function cx(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "secondary",
  size = "normal",
  icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "normal" | "small";
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "button",
        `button--${variant}`,
        size === "small" && "button--small",
        className,
      )}
    >
      {icon && <Icon name={icon} size={size === "small" ? 16 : 18} />}
      {children}
    </button>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("card", className)} {...props} />;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "accent" | "success";
  children: ReactNode;
}) {
  return <span className={cx("badge", `badge--${tone}`)}>{children}</span>;
}

type FieldProps = { label: string; hint?: string; error?: string };
export function Field({
  label,
  hint,
  error,
  id: suppliedId,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  const uniqueId = useId();
  const id = suppliedId ?? uniqueId;
  return (
    <div className={cx("field", className)}>
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        className="input"
        id={id}
        aria-invalid={!!error}
        aria-describedby={hint || error ? `${id}-hint` : undefined}
      />
      {(hint || error) && (
        <span
          className={cx("field-hint", !!error && "text-danger")}
          id={`${id}-hint`}
        >
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

export function SelectField({
  label,
  id: suppliedId,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const uniqueId = useId();
  const id = suppliedId ?? uniqueId;
  return (
    <div className={cx("field", className)}>
      <label htmlFor={id}>{label}</label>
      <select {...props} className="input" id={id}>
        {children}
      </select>
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "error" | "success";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cx("notice", `notice--${tone}`)}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon name={tone === "success" ? "check" : "info"} size={18} />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon = "image",
  action,
}: {
  title: string;
  children: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function LoadingState({
  children = "Loading…",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" aria-hidden="true" />
      {children}
    </div>
  );
}
