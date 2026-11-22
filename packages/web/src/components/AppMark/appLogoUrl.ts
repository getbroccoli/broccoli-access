/** The bundled logos by catalog key, such as `notion`, read from their file names. */
const LOGO_URLS = new Map(
  Object.entries(
    import.meta.glob<string>("./logos/*.svg", { eager: true, query: "?url", import: "default" }),
  ).map(([path, url]) => [path.slice("./logos/".length, -".svg".length), url]),
);

/** The URL of the logo bundled for a catalog app; undefined for an app without one. */
export function appLogoUrl(catalogKey: string | null): string | undefined {
  return catalogKey ? LOGO_URLS.get(catalogKey) : undefined;
}
