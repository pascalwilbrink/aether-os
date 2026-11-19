import type { SVGProps } from "react";

/** Line icons for the sidebar: 24×24, stroked with the current colour. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width={20}
      height={20}
      {...props}
    >
      {children}
    </svg>
  );
}

type Props = SVGProps<SVGSVGElement>;

export const LogoIcon = (props: Props) => (
  <Icon strokeWidth={1.9} {...props}>
    <path d="M12 2.5 3.5 7v10l8.5 4.5 8.5-4.5V7z" />
    <path d="m3.5 7 8.5 4.5L20.5 7M12 11.5v10" />
    <path d="m7.75 4.75 8.5 4.5v4.5" />
  </Icon>
);

export const HomeIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6h-6v6H4.5a1 1 0 0 1-1-1z" />
  </Icon>
);

export const InboxIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5" />
    <path d="M5.5 5h13l2 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-5.5z" />
  </Icon>
);

export const FolderIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M3.5 6.5a1 1 0 0 1 1-1H9l2 2.5h8.5a1 1 0 0 1 1 1V18.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
  </Icon>
);

export const AgentIcon = (props: Props) => (
  <Icon {...props}>
    <rect x="4.5" y="8" width="15" height="11" rx="2" />
    <path d="M12 8V4.5M9 13v1.5M15 13v1.5M2.5 13.5h2M19.5 13.5h2" />
  </Icon>
);

export const LayersIcon = (props: Props) => (
  <Icon {...props}>
    <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z" />
    <path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" />
  </Icon>
);

export const UsersIcon = (props: Props) => (
  <Icon {...props}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.75a3.5 3.5 0 0 1 0 6.5M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
  </Icon>
);

export const SettingsIcon = (props: Props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.75 14 5l3-.4.9 2.9 2.6 1.5-1 2.8 1 2.8-2.6 1.5-.9 2.9-3-.4-2 2.25L10 19l-3 .4-.9-2.9-2.6-1.5 1-2.8-1-2.8 2.6-1.5.9-2.9 3 .4z" />
  </Icon>
);

export const ChevronDownIcon = (props: Props) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const ArrowUpRightIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Icon>
);

export const LifebuoyIcon = (props: Props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="m6 6 3.5 3.5M14.5 14.5 18 18M18 6l-3.5 3.5M9.5 14.5 6 18" />
  </Icon>
);

export const PanelIcon = (props: Props) => (
  <Icon {...props}>
    <rect x="3.5" y="4" width="17" height="16" rx="2" />
    <path d="M9.5 4v16M15.5 10l-2 2 2 2" />
  </Icon>
);

export const MenuIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const SunIcon = (props: Props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </Icon>
);

export const MonitorIcon = (props: Props) => (
  <Icon {...props}>
    <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
    <path d="M8.5 20.5h7M12 16.5v4" />
  </Icon>
);
