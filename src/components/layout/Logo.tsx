interface LogoProps {
  size?: number;
}

export function Logo({ size = 32 }: LogoProps) {
  return (
    <svg
      aria-label="FarmFriend"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="28" width="32" height="8" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="6" y="20" width="8" height="8" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="16" y="16" width="8" height="12" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="26" y="20" width="8" height="8" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="17" y="10" width="6" height="6" rx="1" fill="currentColor" opacity="0.9" />
      <path d="M12 14 Q16 8 20 13 Q16 16 12 14Z" fill="currentColor" opacity="0.85" />
      <path d="M28 14 Q24 8 20 13 Q24 16 28 14Z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}
