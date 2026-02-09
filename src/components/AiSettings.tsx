import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { useAiStore } from "../stores/aiStore";

interface Props {
  onClose: () => void;
}

const MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
];

export default function AiSettings({ onClose }: Props) {
  const { t } = useTranslation("ai");
  const { apiKey, model, saveSettings } = useAiStore();
  const [key, setKey] = useState(apiKey);
  const [selectedModel, setSelectedModel] = useState(model);
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      await saveSettings({ apiKey: key, model: selectedModel });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error handled by store
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[420px] rounded-xl border border-border-primary bg-bg-secondary shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-primary px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("settings.title")}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-4">
          {/* API Key */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              {t("settings.apiKeyLabel")}
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t("settings.apiKeyPlaceholder")}
                className="w-full rounded-lg border border-border-primary bg-bg-primary px-3 py-2 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none font-mono"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              {t("settings.modelLabel")}
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full rounded-lg border border-border-primary bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border-primary px-4 py-3">
          {saved && (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("settings.saved")}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || !key.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-bg-primary hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("settings.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
