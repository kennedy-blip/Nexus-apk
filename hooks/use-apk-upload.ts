"use client";

import { useCallback, useRef, useState } from "react";
import type { ApkRecord } from "@/lib/types";

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "parsing" | "done" | "error";
  error?: string;
  record?: ApkRecord;
}

const MAX_BYTES = Number(
  process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES ?? 512 * 1024 * 1024,
);

/**
 * XHR-based uploader so we can surface byte-level progress (fetch still can't
 * report request upload progress across browsers).
 */
export function useApkUpload(onUploaded: (apk: ApkRecord) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)));
  }, []);

  const uploadOne = useCallback(
    (item: UploadItem) =>
      new Promise<void>((resolve) => {
        const form = new FormData();
        form.append("file", item.file);

        const xhr = new XMLHttpRequest();
        xhrs.current.set(item.id, xhr);
        xhr.open("POST", "/api/apks");
        xhr.responseType = "json";

        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 92);
          patch(item.id, { progress: pct, status: pct >= 92 ? "parsing" : "uploading" });
        };

        xhr.onload = () => {
          xhrs.current.delete(item.id);
          const body = (xhr.response ?? {}) as {
            apk?: ApkRecord;
            error?: string;
            detail?: string;
          };

          if (xhr.status >= 200 && xhr.status < 300 && body.apk) {
            patch(item.id, { progress: 100, status: "done", record: body.apk });
            onUploaded(body.apk);
          } else {
            patch(item.id, {
              status: "error",
              progress: 0,
              error: body.error ?? body.detail ?? `Upload failed (${xhr.status})`,
            });
          }
          resolve();
        };

        xhr.onerror = () => {
          xhrs.current.delete(item.id);
          patch(item.id, { status: "error", error: "Network error during upload" });
          resolve();
        };

        xhr.onabort = () => {
          xhrs.current.delete(item.id);
          setItems((prev) => prev.filter((it) => it.id !== item.id));
          resolve();
        };

        patch(item.id, { status: "uploading", progress: 2 });
        xhr.send(form);
      }),
    [onUploaded, patch],
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const accepted = Array.from(files).filter((f) => {
        if (!f.name.toLowerCase().endsWith(".apk")) return false;
        if (f.size > MAX_BYTES) return false;
        return true;
      });

      const rejected = Array.from(files).filter(
        (f) => !accepted.some((a) => a === f),
      );

      const next: UploadItem[] = accepted.map((file) => ({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${file.name}-${Math.random().toString(36).slice(2)}`,
        file,
        progress: 0,
        status: "queued",
      }));

      if (next.length) setItems((prev) => [...prev, ...next]);

      // Rejections are surfaced via the returned value for the caller's toast.
      const rejections = rejected.map((f) => ({
        name: f.name,
        reason: f.name.toLowerCase().endsWith(".apk")
          ? "File exceeds the upload limit"
          : "Only .apk files are supported",
      }));

      // Sequential uploads: keeps memory flat and avoids saturating the uplink.
      for (const item of next) {
        await uploadOne(item);
      }

      return { queued: next.length, rejections };
    },
    [uploadOne],
  );

  const cancel = useCallback((id: string) => {
    xhrs.current.get(id)?.abort();
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const busy = items.some((i) => i.status === "uploading" || i.status === "parsing");

  return { items, addFiles, cancel, dismiss, busy, maxBytes: MAX_BYTES };
}
