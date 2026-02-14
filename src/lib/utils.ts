import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Soft status colors for calendars/badges: blue (1-5), amber (6), green (7-9) */
export function getStatusColorClasses(status: number | undefined | null): string {
  const s = status ?? 0
  if (s >= 7) return 'bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-700 dark:text-emerald-300'
  if (s === 6) return 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-300'
  if (s >= 1) return 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-950/50 dark:border-blue-700 dark:text-blue-300'
  return 'bg-muted border-border text-muted-foreground'
}

/** Text-only color for status label (no bg/border) */
export function getStatusTextColorClass(status: number | undefined | null): string {
  const s = status ?? 0
  if (s >= 7) return 'text-emerald-600 dark:text-emerald-400 font-medium'
  if (s === 6) return 'text-amber-600 dark:text-amber-400 font-medium'
  if (s >= 1) return 'text-blue-600 dark:text-blue-400 font-medium'
  return 'text-muted-foreground'
}
