import { drainInbox } from "./inbox.js";
import { senderStep } from "./template-sender.js";
export function startWorker(io) {
  let stopped = false, timer, active, nextMaintenance = 0;
  async function tick() {
    if (stopped) return;
    active = (async () => {
      // Incoming always gets the first bounded slice. Sender safety also checks
      // for failed/backlogged/unreviewed incoming events before a new send.
      const pending = await drainInbox(io, 20);
      // Recovery still runs when sending is disabled; no send is allowed by
      // senderStep itself. Throttle disabled maintenance to reduce free-tier work.
      if (pending < 20 && (process.env.SENDER_ENABLED === "true" || Date.now() >= nextMaintenance)) {
        nextMaintenance = Date.now() + 15000;
        await senderStep(io);
      }
    })();
    try { await active; } catch (err) { console.error(`Recovery worker: ${String(err.code || err.name || "ERROR").slice(0, 70)}`); }
    finally { active = null; if (!stopped) { timer = setTimeout(tick, 1500); timer.unref(); } }
  }
  timer = setTimeout(tick, 500); timer.unref();
  return async () => { stopped = true; clearTimeout(timer); await active?.catch(() => {}); };
}
