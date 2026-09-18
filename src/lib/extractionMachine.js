export function createMachine() {
  return { status: "idle", emptyStreak: 0 };
}

export function start(_machine) {
  return { status: "running", emptyStreak: 0 };
}

export function pause(machine) {
  return { ...machine, status: "paused" };
}

export function ingest(machine, { newCount, hasMoreReplyButtons, scrolled }) {
  if (machine.status !== "running") return machine;
  if (hasMoreReplyButtons || scrolled) {
    return { status: "running", emptyStreak: 0 };
  }
  const emptyStreak = newCount === 0 ? machine.emptyStreak + 1 : 0;
  if (emptyStreak >= 10) return { status: "complete", emptyStreak };
  return { status: "running", emptyStreak };
}
