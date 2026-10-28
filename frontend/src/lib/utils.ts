import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function date(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function gitlabLink(
  value: string | null | undefined,
  instance: string | undefined,
) {
  if (!value || !instance) return null;
  try {
    const url = new URL(value);
    const base = new URL(instance);
    return ["http:", "https:"].includes(url.protocol) &&
      url.origin === base.origin &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
