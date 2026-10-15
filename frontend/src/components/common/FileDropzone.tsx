import React, { useRef, useState } from "react";
import { UploadCloud, FileText, CheckCircle2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";

interface FileDropzoneProps {
  accept?: string;
  maxSizeMb?: number;
  helpText?: string;
  uploading?: boolean;
  progress?: number;
  uploadedFileName?: string;
  onFileSelect: (file: File) => void;
  className?: string;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  accept,
  maxSizeMb = 10,
  helpText = "PNG, JPG, WebP up to 10MB",
  uploading = false,
  progress,
  uploadedFileName,
  onFileSelect,
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setError(null);
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`File size exceeds maximum allowed size of ${maxSizeMb}MB`);
      return;
    }
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "group flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all",
        isDragOver
          ? "border-primary bg-muted/50"
          : "border-border bg-card/60 hover:border-neutral-400 hover:bg-muted/30",
        uploading && "pointer-events-none opacity-80",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {uploading ? (
        <div className="space-y-3 w-full max-w-xs text-center">
          <div className="inline-flex h-10 w-10 animate-spin items-center justify-center rounded-full border-2 border-primary border-t-transparent mx-auto" />
          <p className="text-xs font-semibold text-foreground">
            Uploading file...
          </p>
          {progress !== undefined && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      ) : uploadedFileName ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {uploadedFileName}
          </p>
          <p className="text-xs text-muted-foreground">
            Click or drop a different file to replace
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform group-hover:scale-105">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Choose a file or drag & drop it here
            </p>
            <p className="text-xs text-muted-foreground">{helpText}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Browse files
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  );
};
