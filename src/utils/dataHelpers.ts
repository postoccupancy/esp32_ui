export function constructUrl(endpoint: string, paramsObj: object) {
  let params = "";
  const entries = Object.entries(paramsObj);
  for (const [key, value] of entries) {
    if (value === undefined) continue; // skip undefined values
    const str = [key, value].join("=") + "&";
    params += str;
  }
  return endpoint + "?" + params;
}

const now = new Date();
const todayUTC = {
  yyyy: now.getUTCFullYear(),
  mm: String(now.getUTCMonth() + 1).padStart(2, "0"), // e.g. month as "05"
  dd: String(now.getUTCDate()).padStart(2, "0"),
};

export const apiTodayUTC = `${todayUTC.yyyy}-${todayUTC.mm}-${todayUTC.dd}`;

export const rangeOptions = {
  allTime: -1,
  sevenDays: 7 * 24 * 60 * 60 * 1000,
  threeDays: 3 * 24 * 60 * 60 * 1000,
  oneDay: 24 * 60 * 60 * 1000,
  customRange: -2,
};

export const getDateMsAgo = (durationMs: number, nowMs = Date.now()) => {
  const date = new Date(nowMs - durationMs).setUTCHours(0, 0, 0, 0);
  return new Date(date)
};

export function midnightTomorrow(date = new Date()) {
  const tomorrow = new Date(date); // Create a copy to avoid mutating the original date
  // Set the time to midnight (00:00:00.000) of the current day
  tomorrow.setUTCHours(0, 0, 0, 0); 
  // Add one day (24 hours) to get midnight of the next day
  tomorrow.setDate(tomorrow.getDate() + 1); 
  return tomorrow;
}