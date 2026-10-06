import { createApp } from "./app";
import { env } from "./config/env";
import { startOfferReminderSchedule } from "./modules/offers/offer-reminders";

const app = createApp();

// Note: we intentionally do NOT ping the database before starting the
// server. Prisma connects lazily on first query, so the process can boot
// even when DATABASE_URL is unreachable (e.g. no local Postgres in a dev
// sandbox); requests that need the DB will fail gracefully via the global
// error handler instead of crashing the whole process at startup.
app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`CampusLink backend listening on port ${env.PORT}`);
  startOfferReminderSchedule();
});
