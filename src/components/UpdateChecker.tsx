import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { X, Download, Loader2, RefreshCw } from "lucide-react";

export default function UpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [version, setVersion] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [updateRef, setUpdateRef] = useState<Awaited<ReturnType<typeof check>> | null>(null);

  useEffect(() => {
    // Check for updates 3 seconds after app start
    const timer = setTimeout(async () => {
      try {
        const update = await check();
        if (update) {
          setUpdateAvailable(true);
          setVersion(update.version);
          setUpdateRef(update);
        }
      } catch {
        // Silently fail - updater not configured or no internet
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  async function handleUpdate() {
    if (!updateRef) return;
    setIsDownloading(true);
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;

      await updateRef.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });

      await relaunch();
    } catch {
      setIsDownloading(false);
    }
  }

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-accent/30 bg-bg-secondary px-4 py-3 shadow-lg">
      {isDownloading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          <div className="text-xs">
            <p className="font-medium text-text-primary">Güncelleme indiriliyor...</p>
            <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-bg-hover">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4 text-accent" />
          <div className="text-xs">
            <p className="font-medium text-text-primary">
              Yeni sürüm mevcut: <span className="text-accent">v{version}</span>
            </p>
          </div>
          <button
            onClick={handleUpdate}
            className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-black hover:bg-accent-hover transition-colors"
          >
            <Download className="h-3 w-3" />
            Güncelle
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded p-0.5 text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
