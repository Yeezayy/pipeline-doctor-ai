// Shared artwork, derived from docs/screenshots/logo.png with its padding removed.
// Decorative beside the wordmark; the surrounding brand link supplies its label.
export function BrandLogo() {
  return (
    <img
      className="brand-logo"
      src={`${import.meta.env.BASE_URL}brand/logo.png`}
      alt=""
      aria-hidden="true"
      width="512"
      height="160"
      decoding="async"
    />
  );
}
