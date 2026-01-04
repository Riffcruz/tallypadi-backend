/**
 * Get start and end of "today" for a given UTC offset (in minutes).
 * Returns UTC Date objects suitable for MongoDB queries.
 *
 * Example offsets:
 * Nigeria (UTC+1)       ->  60
 * London (UTC+0)        ->   0
 * New York (UTC-5)      -> -300
 */
export const getTodayRangeForOffset = (utcOffsetMinutes: number) => {
  const nowUtc = new Date();

  // 1. Convert current UTC time to "Local" time
  const localNow = new Date(nowUtc.getTime() + utcOffsetMinutes * 60 * 1000);

  // 2. Get the Year/Month/Day of that Local time
  const year = localNow.getUTCFullYear();
  const month = localNow.getUTCMonth();      // 0–11
  const day = localNow.getUTCDate();         // 1–31

  // 3. Create start/end of day in "Local" time
  const localStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const localEnd   = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

  // 4. Convert back to real UTC for the Database
  const startUtc = new Date(localStart.getTime() - utcOffsetMinutes * 60 * 1000);
  const endUtc   = new Date(localEnd.getTime()   - utcOffsetMinutes * 60 * 1000);

  return { start: startUtc, end: endUtc };
};

/*
  Convert a date to "User Local" date by adding the offset minutes.
  Validates offset to prevent overflow (limit +/- 1440 minutes, i.e., 24 hours).
 */
export const toUserLocalDate = (d: Date | string | number, offsetMinutes: number): Date => {
  let offset = offsetMinutes;
  // Validate offset: limit to +/- 24 hours (1440 minutes)
  if (typeof offset !== 'number' || Math.abs(offset) > 1440) {
    offset = 0;
  }
  
  const date = new Date(d);
  // Check if date is valid
  if (isNaN(date.getTime())) {
    // Fallback to current date or could throw, but returning new Date() is safer for now to avoid crashes
    return new Date();
  }

  return new Date(date.getTime() + offset * 60 * 1000);
};