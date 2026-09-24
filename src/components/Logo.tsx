export function Logo({ state = "idle" }: { state?: "idle" | "live" | "wait" | "done" | "error" }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <span className="lamp" data-state={state} />
      <span className="font-mono text-[13px] font-semibold tracking-[0.28em]">TALLY</span>
    </span>
  );
}
