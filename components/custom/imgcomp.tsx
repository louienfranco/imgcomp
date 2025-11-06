"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Download, ImageUp, Loader2, RotateCcw } from "lucide-react";

type Status = "idle" | "ready" | "compressing" | "done" | "error";
type OutputType = "image/png" | "image/jpeg" | "image/webp" | "image/avif";

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
];
const MAX_DIMENSION = 4096;

const OUTPUT_OPTIONS: { type: OutputType; label: string }[] = [
  { type: "image/png", label: "PNG" },
  { type: "image/jpeg", label: "JPEG/JPG" },
  { type: "image/webp", label: "WEBP" },
  { type: "image/avif", label: "AVIF" },
];

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let num = bytes;
  while (num >= 1024 && i < units.length - 1) {
    num /= 1024;
    i++;
  }
  return `${num.toFixed(num < 10 && i > 0 ? 2 : 0)} ${units[i]}`;
}

function baseName(name: string) {
  const idx = name.lastIndexOf(".");
  return idx > -1 ? name.slice(0, idx) : name;
}

function pickOutputType(inputType: string): OutputType {
  // Prefer JPEG for photos; WEBP for images that may have transparency (PNG/WEBP/AVIF)
  if (
    inputType.includes("png") ||
    inputType.includes("webp") ||
    inputType.includes("avif")
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

function typeLabel(type: string) {
  switch (type) {
    case "image/png":
      return "PNG";
    case "image/jpeg":
      return "JPEG/JPG";
    case "image/webp":
      return "WEBP";
    case "image/avif":
      return "AVIF";
    default:
      return type.replace("image/", "").toUpperCase();
  }
}

function mimeToExt(type: string) {
  switch (type) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      return "img";
  }
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality)
  );
  if (blob) return blob;
  // Fallback via dataURL
  const dataUrl = canvas.toDataURL(type, quality);
  const res = await fetch(dataUrl);
  return await res.blob();
}

export default function ImgComp() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [originalMeta, setOriginalMeta] = useState<{
    name: string;
    type: string;
    size: number;
    width: number;
    height: number;
  } | null>(null);

  const [compressed, setCompressed] = useState<{
    blob: Blob | null;
    url: string | null;
    type: string | null;
    size: number;
    width: number;
    height: number;
  } | null>(null);

  const [quality, setQuality] = useState<number>(70); // 1-100
  const [progress, setProgress] = useState<number>(0);

  // User-chosen output type
  const [outType, setOutType] = useState<OutputType>("image/jpeg");

  const jobRef = useRef(0);
  const progressTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetProgressTimer = () => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const startSimulatedProgress = () => {
    resetProgressTimer();
    setProgress(10);
    progressTimerRef.current = window.setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 12, 90));
    }, 220);
  };

  const stopSimulatedProgress = () => {
    resetProgressTimer();
    setProgress(100);
    setTimeout(() => setProgress(0), 600);
  };

  // Cleanup object URLs when replacing/remounting
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (compressed?.url) URL.revokeObjectURL(compressed.url);
      resetProgressTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files || []);
      const picked = arr.find((f) => ACCEPTED_TYPES.includes(f.type));
      if (!picked) {
        setError("Please choose a supported image: JPEG, PNG, WEBP, or AVIF.");
        return;
      }
      setError(null);

      // Cleanup old URLs
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (compressed?.url) URL.revokeObjectURL(compressed.url);

      const objUrl = URL.createObjectURL(picked);
      setFile(picked);
      setOriginalUrl(objUrl);
      setCompressed(null);
      setStatus("ready");

      // Default the output type based on the input (user can change after)
      try {
        setOutType(pickOutputType(picked.type));
      } catch {
        setOutType("image/jpeg");
      }

      // Read dimensions quickly via createImageBitmap fallback to HTMLImageElement
      let width = 0;
      let height = 0;
      try {
        try {
          const bitmap = await createImageBitmap(picked);
          width = bitmap.width;
          height = bitmap.height;
          bitmap.close();
        } catch {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error("Failed to load image."));
            im.src = objUrl;
          });
          width = img.naturalWidth || img.width;
          height = img.naturalHeight || img.height;
        }
      } catch {
        // ignore, keep 0
      }

      setOriginalMeta({
        name: picked.name,
        type: picked.type,
        size: picked.size,
        width,
        height,
      });
    },
    [compressed?.url, originalUrl]
  );

  const computeTargetSize = useCallback((w: number, h: number) => {
    if (w === 0 || h === 0) return { w, h };
    if (w <= MAX_DIMENSION && h <= MAX_DIMENSION) return { w, h };
    const scale = MAX_DIMENSION / Math.max(w, h);
    return { w: Math.round(w * scale), h: Math.round(h * scale) };
  }, []);

  const compress = useCallback(
    async (q: number) => {
      if (!file || !originalMeta) return;
      setStatus("compressing");
      startSimulatedProgress();

      const myJob = ++jobRef.current;
      try {
        // Load source
        let source: CanvasImageSource;
        let sw = originalMeta.width;
        let sh = originalMeta.height;

        try {
          const bitmap = await createImageBitmap(file);
          source = bitmap;
          sw = bitmap.width || sw;
          sh = bitmap.height || sh;
        } catch {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error("Failed to load image."));
            im.src = originalUrl!;
          });
          source = img;
          sw = img.naturalWidth || img.width || sw;
          sh = img.naturalHeight || img.height || sh;
        }

        const { w, h } = computeTargetSize(sw, sh);

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext("2d", { willReadFrequently: false });
        if (!ctx) throw new Error("Canvas not supported in this browser.");

        // Draw (fill white for JPEG to avoid black transparent areas)
        ctx.clearRect(0, 0, w, h);
        if (outType === "image/jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(source, 0, 0, w, h);

        // Quality in [0,1]; for PNG many browsers ignore quality (lossless)
        const q01 = Math.min(1, Math.max(0.05, q / 100));

        const blob = await canvasToBlob(canvas, outType, q01);

        // If another job already started, ignore this result
        if (jobRef.current !== myJob) return;

        // Create object URL
        const url = URL.createObjectURL(blob);

        // Cleanup previous compressed URL
        setCompressed((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return {
            blob,
            url,
            type: blob.type || outType,
            size: blob.size,
            width: w,
            height: h,
          };
        });

        stopSimulatedProgress();
        setStatus("done");
      } catch (e: unknown) {
        stopSimulatedProgress();
        setStatus("error");
        const message = e instanceof Error ? e.message : "Compression failed.";
        setError(message);
      }
    },
    [file, originalMeta, originalUrl, computeTargetSize, outType]
  );

  // Auto compress when a file is selected or when quality/output type changes (debounced)
  useEffect(() => {
    if (!file || !originalMeta) return;
    const t = setTimeout(() => {
      compress(quality);
    }, 180);
    return () => clearTimeout(t);
  }, [file, originalMeta, quality, outType, compress]);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer?.files?.length) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length) handleFiles(files);
      e.currentTarget.value = "";
    },
    [handleFiles]
  );

  const onDropzoneClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Stop propagation so we don't trigger the dropzone click too (prevents double picker)
  const onBrowseClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      fileInputRef.current?.click();
    },
    []
  );

  const resetAll = useCallback(() => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (compressed?.url) URL.revokeObjectURL(compressed.url);
    setFile(null);
    setOriginalUrl(null);
    setOriginalMeta(null);
    setCompressed(null);
    setQuality(70);
    setProgress(0);
    setError(null);
    setOutType("image/jpeg");
    setStatus("idle");
  }, [compressed?.url, originalUrl]);

  const savings = useMemo(() => {
    if (!originalMeta || !compressed?.size) return null;
    const saved = originalMeta.size - compressed.size;
    const pct =
      originalMeta.size > 0
        ? Math.max(0, (saved / originalMeta.size) * 100)
        : 0;
    return { bytes: saved, pct };
  }, [originalMeta, compressed]);

  const downloadName = useMemo(() => {
    const base = baseName(originalMeta?.name || "image");
    const finalType = compressed?.type || outType;
    const ext = mimeToExt(finalType);
    return `${base}-compressed.${ext}`;
  }, [originalMeta?.name, compressed?.type, outType]);

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Image Compressor
          </h1>
          <p className="text-muted-foreground">
            Fast, private, and client-side only. Compress images right in your
            browser.
          </p>
        </div>

        {/* Upload Card */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={onDropzoneClick}
              className={[
                "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
                isDragging
                  ? "border-primary/50 bg-primary/5"
                  : "border-muted-foreground/20 hover:bg-muted/40",
              ].join(" ")}
              role="button"
              aria-label="Upload image"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                className="hidden"
                onChange={onFileInput}
              />
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="rounded-full bg-muted p-3">
                  <ImageUp className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    Click to choose an image or drag & drop here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports JPEG, PNG, WEBP, AVIF — up to {MAX_DIMENSION}px on
                    the longest side
                  </p>
                </div>
                <div className="mt-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={onBrowseClick}
                  >
                    Browse files
                  </Button>
                </div>
              </div>
            </div>

            {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
          </CardContent>
        </Card>

        {/* Controls */}
        {originalMeta && (
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Compression Settings</CardTitle>
              <CardDescription>
                Choose output format and adjust quality to balance size and
                clarity.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="flex flex-col gap-5">
                {/* Output format */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Output format
                    </span>
                    <span className="text-sm font-medium">
                      {typeLabel(outType)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {OUTPUT_OPTIONS.map((opt) => (
                      <Button
                        key={opt.type}
                        type="button"
                        size="sm"
                        variant={opt.type === outType ? "default" : "outline"}
                        onClick={() => setOutType(opt.type)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG is lossless (quality slider may have little effect).
                    JPEG discards transparency (filled with white). WEBP/AVIF
                    provide strong compression with transparency support.
                  </p>
                </div>

                {/* Quality */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Quality
                    </span>
                    <span className="text-sm font-medium">{quality}%</span>
                  </div>
                  <Slider
                    min={10}
                    max={100}
                    step={1}
                    value={[quality]}
                    onValueChange={(v) => setQuality(v[0] ?? 70)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setQuality(50)}
                    >
                      Smaller (50%)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setQuality(70)}
                    >
                      Balanced (70%)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setQuality(90)}
                    >
                      Higher (90%)
                    </Button>
                  </div>
                  {outType === "image/png" && (
                    <div className="text-xs text-muted-foreground">
                      Note: PNG output is typically lossless.
                    </div>
                  )}
                </div>

                {status === "compressing" && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Compressing...
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Previews */}
        {originalMeta && (
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Original</CardTitle>
                <CardDescription title={originalMeta.name} className="truncate">
                  {originalMeta.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
                  {originalUrl && (
                    <img
                      src={originalUrl}
                      alt="Original"
                      className="h-full w-full object-contain"
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Size</div>
                  <div className="text-right">
                    {formatBytes(originalMeta.size)}
                  </div>

                  <div className="text-muted-foreground">Dimensions</div>
                  <div className="text-right">
                    {originalMeta.width} × {originalMeta.height}
                  </div>

                  <div className="text-muted-foreground">Type</div>
                  <div className="text-right uppercase">
                    {originalMeta.type.replace("image/", "")}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Compressed</CardTitle>
                <CardDescription>
                  {(compressed?.type || outType)
                    .replace("image/", "")
                    .toUpperCase()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
                  {status === "compressing" && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-sm">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {compressed?.url ? (
                    <img
                      src={compressed.url}
                      alt="Compressed"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                      Adjust settings to generate preview
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Size</div>
                  <div className="text-right">
                    {compressed?.size ? formatBytes(compressed.size) : "-"}
                  </div>

                  <div className="text-muted-foreground">Dimensions</div>
                  <div className="text-right">
                    {compressed?.width && compressed?.height
                      ? `${compressed.width} × ${compressed.height}`
                      : "-"}
                  </div>

                  <div className="text-muted-foreground">Saved</div>
                  <div className="text-right">
                    {savings ? (
                      <>
                        {formatBytes(savings.bytes)} ({savings.pct.toFixed(0)}%)
                      </>
                    ) : (
                      "-"
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetAll}
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <Button
                  type="button"
                  className="gap-2"
                  disabled={!compressed?.url || status === "compressing"}
                  onClick={() => {
                    if (!compressed?.url) return;
                    const a = document.createElement("a");
                    a.href = compressed.url;
                    a.download = downloadName;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                  }}
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* Footer note */}
        <div className="mt-8 text-center text-xs text-muted-foreground">
          All processing happens locally in your browser. No files are uploaded.
        </div>
      </div>
    </div>
  );
}
