// Stat-card icons for the dashboard — same hand-drawn inline-SVG approach as
// layouts/NavIcons.tsx, no icon library dependency.
const common = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function OrdersStatIcon() {
  return (
    <svg {...common}>
      <path d="M4 7l1.5-3h13L20 7" />
      <path d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z" />
      <path d="M9 11a3 3 0 0 0 6 0" />
    </svg>
  );
}

export function ClockStatIcon() {
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function TruckStatIcon() {
  return (
    <svg {...common}>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7z" />
      <circle cx="7.5" cy="18" r="1.5" />
      <circle cx="17.5" cy="18" r="1.5" />
    </svg>
  );
}

export function ReturnStatIcon() {
  return (
    <svg {...common}>
      <path d="M4 12a8 8 0 1 1 3 6.2" />
      <path d="M4 17v-4h4" />
    </svg>
  );
}

export function ProductsStatIcon() {
  return (
    <svg {...common}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12v9M12 12l8-4.5M12 12L4 7.5" />
    </svg>
  );
}

export function CustomersStatIcon() {
  return (
    <svg {...common}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
      <path d="M16 4.3a3.2 3.2 0 0 1 0 6.2" />
      <path d="M18 14.3c2 .6 3 2.3 3 5.7" />
    </svg>
  );
}
