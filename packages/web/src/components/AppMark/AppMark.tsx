import { useState } from "react";

import { cn } from "@/lib/class-names";

import { appLogoUrl } from "./appLogoUrl";

type Props = {
  name: string;
  /** The app's key in the built-in catalog, which picks its bundled logo; null for another app. */
  catalogKey: string | null;
  /** Overrides the size and adds to the look, such as a larger square in a page's header. */
  className?: string;
};

/**
 * The app's bundled logo in a square, or its initial in a square tinted by its name, so it keeps
 * its colour. Logos come with the web app, so the browser never asks a third party for them.
 */
export function AppMark({ name, catalogKey, className }: Props) {
  const logoUrl = appLogoUrl(catalogKey);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const square = "flex size-8 shrink-0 items-center justify-center rounded-md";
  if (logoUrl && logoUrl !== failedUrl) {
    return (
      <span aria-hidden className={cn(square, "border border-border bg-white", className)}>
        <img src={logoUrl} alt="" onError={() => setFailedUrl(logoUrl)} className="size-[55%]" />
      </span>
    );
  }
  const hue = hueOf(name);
  return (
    <span
      aria-hidden
      className={cn(square, "text-xs font-semibold", className)}
      style={{ backgroundColor: `oklch(0.95 0.03 ${hue})`, color: `oklch(0.5 0.13 ${hue})` }}
    >
      {[...name][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** A hue that stays the same for an app's name. */
function hueOf(name: string): number {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.codePointAt(0)!) % 360;
  }
  return hash;
}
