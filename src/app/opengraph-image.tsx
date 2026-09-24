import { ImageResponse } from "next/og";

export const alt = "Tally — agent runs, on air";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ROWS = [
  { kind: "LLM", color: "#5ac8fa", name: "turn 1", left: 0, width: 17, dur: "3.38 s", indent: 0 },
  { kind: "TOOL", color: "#30d158", name: "weather_forecast", left: 17.5, width: 10.4, dur: "2.02 s", indent: 1 },
  { kind: "GATE", color: "#ffb340", name: "approve send_webhook", left: 28.5, width: 12, dur: "held", indent: 1 },
  { kind: "LLM", color: "#5ac8fa", name: "turn 2", left: 41, width: 14, dur: "2.71 s", indent: 0 },
  { kind: "LLM", color: "#5ac8fa", name: "turn 3", left: 56, width: 44, dur: "11.2 s", indent: 0 },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#090b0e", color: "#e8ebef", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 22, height: 22, borderRadius: 22, background: "#ff453a", boxShadow: "0 0 30px #ff453a" }} />
          <div style={{ fontSize: 30, letterSpacing: 10, fontWeight: 700 }}>TALLY</div>
          <div style={{ marginLeft: "auto", fontSize: 20, color: "#6b7482", letterSpacing: 4 }}>AGENT STUDIO · PLAYOUT LOG · MCP</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 52 }}>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>Agent runs,</div>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -3, lineHeight: 1.1, color: "#ff453a" }}>on air.</div>
          <div style={{ fontSize: 28, color: "#9aa3b0", marginTop: 22, maxWidth: 900 }}>
            Compose agents from skills and live tools, run them with your own key, trace every step.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", border: "1px solid #2e3642", borderRadius: 14, background: "#0f1217", padding: "10px 18px" }}>
          {ROWS.map((r) => (
            <div key={r.name} style={{ display: "flex", alignItems: "center", height: 34, gap: 14 }}>
              <div style={{ width: 62, fontSize: 15, color: r.color, border: `1px solid ${r.color}66`, borderRadius: 5, display: "flex", justifyContent: "center" }}>{r.kind}</div>
              <div style={{ width: 300, fontSize: 18, paddingLeft: r.indent * 22, color: r.indent ? "#9aa3b0" : "#e8ebef" }}>{r.name}</div>
              <div style={{ flex: 1, height: 14, background: "#151a21", borderRadius: 3, display: "flex", position: "relative" }}>
                <div style={{ position: "absolute", left: `${r.left}%`, width: `${r.width}%`, height: 14, background: r.color, borderRadius: 3 }} />
              </div>
              <div style={{ width: 80, fontSize: 16, color: "#9aa3b0", display: "flex", justifyContent: "flex-end" }}>{r.dur}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
