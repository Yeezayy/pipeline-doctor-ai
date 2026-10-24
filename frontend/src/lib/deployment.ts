// Public builds are an offline presentation, never a proxy to a live backend.
export const PUBLIC_DEMO = import.meta.env.VITE_PUBLIC_DEMO === "true";
export const LOCAL_SETUP_URL =
  "https://github.com/Yeezayy/pipeline-doctor-ai#quick-start";
