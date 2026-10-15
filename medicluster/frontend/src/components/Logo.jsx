export default function Logo({ className = "" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <rect x="1" y="1" width="6" height="6" fill="currentColor" />
      <rect x="11" y="1" width="6" height="6" fill="currentColor" />
      <rect x="1" y="11" width="6" height="6" fill="currentColor" />
      <rect x="11" y="11" width="6" height="6" fill="#e0703f" />
    </svg>
  );
}
