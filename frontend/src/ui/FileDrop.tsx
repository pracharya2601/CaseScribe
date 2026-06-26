import { useRef, useState, type DragEvent } from "react";
import { UploadCloud, FileText } from "lucide-react";
import { cn } from "./cn";

export interface FileDropProps {
  /** Called with the file's text contents once read. */
  onText: (text: string, fileName: string) => void;
  accept?: string;
  className?: string;
  hint?: string;
}

/** Drag-drop a .txt/.pdf-as-text file; reads it and calls back with the text. */
export function FileDrop({
  onText,
  accept = ".txt,.md,.json",
  className,
  hint = "Drop a transcript, or click to browse",
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [name, setName] = useState<string | null>(null);

  const read = (file?: File | null) => {
    if (!file) return;
    setName(file.name);
    const reader = new FileReader();
    reader.onload = () => onText(String(reader.result ?? ""), file.name);
    reader.readAsText(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    read(e.dataTransfer.files?.[0]);
  };

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "group flex w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-input)] border border-dashed px-4 py-6 text-center outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-brand/40",
        over
          ? "border-brand bg-brand-soft"
          : "border-border-strong bg-surface-2/40 hover:border-brand/60 hover:bg-brand-soft/50",
        className,
      )}
    >
      {name ? (
        <FileText className="size-6 text-success" aria-hidden />
      ) : (
        <UploadCloud
          className={cn(
            "size-6 transition-colors",
            over ? "text-brand" : "text-ink-soft group-hover:text-brand",
          )}
          aria-hidden
        />
      )}
      <span className="text-sm text-ink-muted">
        {name ? (
          <span className="font-medium text-ink">{name}</span>
        ) : (
          hint
        )}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => read(e.target.files?.[0])}
      />
    </button>
  );
}
