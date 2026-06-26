import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grow with content instead of scrolling. */
  autosize?: boolean;
  minRows?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autosize = false, minRows = 3, value, onChange, ...props }, ref) => {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

    const resize = () => {
      const el = innerRef.current;
      if (!el || !autosize) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };

    useEffect(() => {
      resize();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, autosize]);

    return (
      <textarea
        ref={innerRef}
        rows={minRows}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          resize();
        }}
        className={cn(
          "w-full rounded-[var(--radius-input)] border border-border bg-surface px-3.5 py-2.5",
          "text-sm text-ink placeholder:text-ink-soft outline-none resize-y",
          "transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30",
          autosize && "resize-none overflow-hidden",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
