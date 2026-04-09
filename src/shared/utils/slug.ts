/**
 * Generates a URL-safe slug from any string.
 * Used for shop slugs and product handles.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function generateUniqueSlug(base: string, suffix?: string): string {
  const slug = slugify(base);
  return suffix ? `${slug}-${suffix}` : slug;
}
