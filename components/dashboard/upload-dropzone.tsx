"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, FileWarning, Loader2, UploadCloud, X } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import type { UploadItem } from "@/hooks/use-apk-upload";

interface Props {
  onFiles: (files: File[]) => void;
  items: UploadItem[];
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
  maxBytes: number;
}

export function UploadDropzone({ onFiles, items, onCancel, onDismiss, maxBytes }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  return (
    <div>
      <motion.div
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          depth.current -= 1;
          if (depth.current <= 0) {
            depth.current = 0;
            setDragging(false);
          }
        }}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Upload an APK file"
        animate={{
          borderColor: dragging ? "rgba(103,232,249,0.55)" : "rgba(255,255,255,0.10)",
          backgroundColor: dragging ? "rgba(6,182,212,0.07)" : "rgba(255,255,255,0.025)",
          scale: dragging ? 1.005 : 1,
        }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className={cn(
          "group relative cursor-pointer overflow-hidden rounded-3xl border border-dashed p-8 text-center",
          "backdrop-blur-xl transition-colors sm:p-10",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.12),transparent_65%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        />
        <div className="relative flex flex-col items-center">
          <motion.span
            animate={dragging ? { y: -4, scale: 1.06 } : { y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-gradient-to-br from-indigo-500/25 to-cyan-500/15 text-indigo-200 shadow-[0_0_32px_-8px_rgba(99,102,241,0.9)]"
          >
            <UploadCloud className="h-5 w-5" />
          </motion.span>

          <p className="text-[15px] font-medium text-white">
            {dragging ? "Release to upload" : "Drop your APK here"}
          </p>
          <p className="mt-1 text-[13px] text-zinc-500">
            or <span className="text-indigo-300 underline decoration-indigo-400/40 underline-offset-4">browse files</span>{" "}
            · max {formatBytes(maxBytes, 0)}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
            {[".apk", "manifest parsed", "icon extracted", "private storage"].map((t) => (
              <span
                key={t}
                className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 font-mono text-[10.5px] text-zinc-500"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".apk,application/vnd.android.package-archive"
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onFiles(files);
            e.target.value = "";
          }}
        />
      </motion.div>

      <AnimatePresence initial={false}>
        {items.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-2 overflow-hidden"
          >
            {items.map((item) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="glass-subtle flex items-center gap-3 rounded-xl px-3 py-2.5"
              >
                <span className="shrink-0">
                  {item.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : item.status === "error" ? (
                    <FileWarning className="h-4 w-4 text-rose-400" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-300" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[12.5px] font-medium text-zinc-200">
                      {item.file.name}
                    </p>
                    <span className="shrink-0 font-mono text-[10.5px] text-zinc-500">
                      {formatBytes(item.file.size)}
                    </span>
                  </div>

                  {item.status === "error" ? (
                    <p className="mt-0.5 truncate text-[11.5px] text-rose-300">
                      {item.error}
                    </p>
                  ) : (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/8">
                      <motion.div
                        className={cn(
                          "h-full rounded-full",
                          item.status === "done"
                            ? "bg-emerald-400"
                            : "bg-gradient-to-r from-indigo-400 to-cyan-300",
                        )}
                        animate={{ width: `${item.progress}%` }}
                        transition={{ type: "spring", stiffness: 140, damping: 26 }}
                      />
                    </div>
                  )}
                  {item.status === "parsing" && (
                    <p className="mt-1 text-[10.5px] text-cyan-300/80">
                      Upload complete — reading AndroidManifest…
                    </p>
                  )}
                </div>

                <button
                  onClick={() =>
                    item.status === "uploading" ? onCancel(item.id) : onDismiss(item.id)
                  }
                  className="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={item.status === "uploading" ? "Cancel upload" : "Dismiss"}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
