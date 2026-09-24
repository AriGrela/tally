import { houseKeys } from "@/lib/server/guard";

// Tells the studio whether an access code can unlock server-side keys.
export function GET() {
  const house = houseKeys();
  return Response.json({
    ok: true,
    houseKeys: {
      anthropic: !!(process.env.TALLY_ACCESS_CODE && house.anthropic),
      compat: !!(process.env.TALLY_ACCESS_CODE && house.compatKey && house.compatBaseUrl)
        ? { model: house.compatModel || null }
        : false,
    },
  });
}
