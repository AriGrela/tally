export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";

export const REPO_URL = "https://github.com/AriGrela/tally";
export const AUTHOR = {
  name: "Ariel Grela",
  portfolio: "https://arielgrela.vercel.app",
  github: "https://github.com/AriGrela",
  linkedin: "https://www.linkedin.com/in/arielgrela/",
};
