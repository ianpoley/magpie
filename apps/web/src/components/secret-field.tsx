"use client";

import { Field, FieldDescription, FieldError, FieldLabel } from "@ui-sdk/react/field";
import { PasswordInput, PasswordInputControl, PasswordInputToggle } from "@ui-sdk/react/password-input";
import { Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";

export function SecretField({
  name,
  label = name,
  mono = true,
  value,
  onChange,
  error,
  description,
  autoFocus,
}: {
  name: string;
  label?: string;
  mono?: boolean;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  description?: ReactNode;
  autoFocus?: boolean;
}) {
  return (
    <Field name={name} invalid={error ? true : undefined}>
      <FieldLabel className={mono ? "font-mono text-[13px] text-ink" : "text-[13px] font-semibold text-ink"}>{label}</FieldLabel>
      <PasswordInput
        required
        autoComplete="off"
        value={value}
        onValueChange={onChange}
        className="h-10 rounded-full pl-4 text-[16px] transition-shadow duration-150 ease-out has-[input:focus-visible]:shadow-[0_0_0_1px_var(--color-primary)] sm:text-[14px]"
      >
        <PasswordInputControl spellCheck={false} autoFocus={autoFocus} data-1p-ignore="" data-lpignore="true" />
        <PasswordInputToggle aria-label={`Show ${label}`} className="focus-ring size-8 cursor-pointer rounded-full border-0 bg-transparent text-ink-muted hover:bg-sunken">
          {(state) => (state.visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />)}
        </PasswordInputToggle>
      </PasswordInput>
      {description && !error ? <FieldDescription className="text-[12px] leading-snug text-ink-muted">{description}</FieldDescription> : null}
      {error ? (
        <FieldError match role="alert" className="text-[13px] leading-snug text-like-text">
          {error}
        </FieldError>
      ) : null}
    </Field>
  );
}
