// Business-day math for the reminder job. Everything is done on Philippine calendar dates (UTC+8),
// because that is the calendar the Council and the offices work on.
//
// A business day is Monday-Friday that is NOT in gc_holidays (admins manage that list in the staff app).

const PH_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// "YYYY-MM-DD" in Philippine time
export const phYmd = (ms) => new Date(ms + PH_OFFSET_MS).toISOString().slice(0, 10)

const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

export async function loadHolidays(supabase) {
  const { data, error } = await supabase.from('gc_holidays').select('holiday_date')
  if (error) throw error
  return new Set((data || []).map((r) => r.holiday_date))
}

export function isBusinessDay(ymd, holidays) {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay() // 0 = Sunday, 6 = Saturday
  return dow !== 0 && dow !== 6 && !holidays.has(ymd)
}

// Business days that have passed after the start date, up to and including today (PH dates).
// Started Monday -> Tuesday is 1, Wednesday 2, Thursday 3. Weekends and holidays add nothing.
export function businessDaysSince(fromMs, toMs, holidays) {
  const end = phYmd(toMs)
  let cur = phYmd(fromMs)
  let n = 0
  for (let i = 0; cur < end && i < 800; i++) {
    cur = addDays(cur, 1)
    if (isBusinessDay(cur, holidays)) n++
  }
  return n
}
