/**
 * Time and Date utility functions for consistent 24-hour format throughout the application
 * 
 * STANDARDIZED FORMATS:
 * - Date: YYYY-MM-DD (e.g., "2025-12-25")
 * - Time: HH:MM in 24-hour format (e.g., "09:30", "14:45", "23:59")
 * - DateTime: Combined as "YYYY-MM-DDTHH:MM:SS" for database storage
 * 
 * All time inputs and outputs should use 24-hour format consistently.
 * No AM/PM format should be used anywhere in the application.
 */

/**
 * Formats a Date object to YYYY-MM-DD format
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Formats a Date object to HH:MM format (24-hour)
 */
export function formatTime(date: Date): string {
  return date.toISOString().split('T')[1].substring(0, 5);
}

/**
 * Gets current time in HH:MM format (24-hour)
 */
export function getCurrentTime(): string {
  return formatTime(new Date());
}

/**
 * Gets current date in YYYY-MM-DD format
 */
export function getCurrentDate(): string {
  return formatDate(new Date());
}

/**
 * Converts time string (HH:MM) to minutes since midnight
 */
export function timeToMinutes(timeString: string): number {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Converts minutes since midnight to time string (HH:MM)
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
  const mins = (minutes % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

/**
 * Validates that a time string is in HH:MM format (24-hour)
 */
export function isValidTimeFormat(timeString: string): boolean {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(timeString);
}

/**
 * Validates that a date string is in YYYY-MM-DD format
 */
export function isValidDateFormat(dateString: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date.toISOString().split('T')[0] === dateString;
}

/**
 * Creates a Date object from date and time strings
 */
export function createDateTime(dateString: string, timeString: string): Date {
  return new Date(`${dateString}T${timeString}:00`);
}

/**
 * Extracts date in YYYY-MM-DD format from Date object or datetime string
 */
export function extractDate(dateTime: Date | string): string {
  if (typeof dateTime === 'string') {
    return new Date(dateTime).toISOString().split('T')[0];
  }
  return formatDate(dateTime);
}

/**
 * Extracts time in HH:MM format from Date object or datetime string
 */
export function extractTime(dateTime: Date | string): string {
  if (typeof dateTime === 'string') {
    return new Date(dateTime).toISOString().split('T')[1].substring(0, 5);
  }
  return formatTime(dateTime);
}
