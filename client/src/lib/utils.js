import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility: merge Tailwind classes safely.
 * Use everywhere instead of raw template literals.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Safely format a timestamp/date string into a local time (HH:MM:SS or HH:MM).
 * Never returns "Invalid Date".
 */
export function formatSafeTime(ts, includeSeconds = true) {
  if (!ts) return new Date().toLocaleTimeString([], includeSeconds ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
  
  // If already a valid time string like "12:34:56 PM" or "14:20"
  if (typeof ts === 'string' && (/^\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?$/i.test(ts.trim()))) {
    return ts.trim();
  }

  try {
    let d = new Date(ts);
    if (isNaN(d.getTime())) {
      const num = Number(ts);
      if (!isNaN(num) && num > 0) {
        d = new Date(num);
      }
    }

    if (isNaN(d.getTime())) {
      return new Date().toLocaleTimeString([], includeSeconds ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
    }

    return d.toLocaleTimeString([], includeSeconds ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
  } catch {
    return new Date().toLocaleTimeString([], includeSeconds ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
  }
}

/**
 * Safely format a date/time into a readable string (MM/DD/YYYY, HH:MM).
 * Never returns "Invalid Date".
 */
export function formatSafeDateTime(ts) {
  if (!ts) return '—';
  try {
    let d = new Date(ts);
    if (isNaN(d.getTime())) {
      const num = Number(ts);
      if (!isNaN(num) && num > 0) {
        d = new Date(num);
      }
    }
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}
