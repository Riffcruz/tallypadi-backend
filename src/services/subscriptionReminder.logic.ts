const calendarDayNumber = (date: Date, offsetMinutes: number) => {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return Math.floor(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) / 86_400_000);
};

export const subscriptionDaysRemaining = (now: Date, expiryAt: Date, offsetMinutes = 60) =>
  calendarDayNumber(expiryAt, offsetMinutes) - calendarDayNumber(now, offsetMinutes);

export const shouldSendSubscriptionReminder = (now: Date, expiryAt: Date, offsetMinutes = 60) => {
  const daysBeforeExpiry = subscriptionDaysRemaining(now, expiryAt, offsetMinutes);
  if (![0, 1, 2, 3].includes(daysBeforeExpiry)) return null;
  if (daysBeforeExpiry === 0 && expiryAt.getTime() > now.getTime()) return null;
  return daysBeforeExpiry as 0 | 1 | 2 | 3;
};
