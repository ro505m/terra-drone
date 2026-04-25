import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Compact English ↔ Arabic toggle. */
export const LangToggle = ({ className }: { className?: string }) => {
  const { lang, toggle, t } = useI18n();
  return (
    <button
      onClick={toggle}
      className={`glass-subtle h-9 px-3 rounded-full inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider hover:bg-primary/10 transition-colors ${className ?? ""}`}
      aria-label={t("language")}
      title={t("language")}
    >
      <Languages className="h-3.5 w-3.5 text-primary" />
      <span className={lang === "en" ? "text-primary" : "text-muted-foreground"}>EN</span>
      <span className="text-muted-foreground/60">/</span>
      <span className={lang === "ar" ? "text-primary" : "text-muted-foreground"}>ع</span>
    </button>
  );
};
