"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";

import {
  AgentIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  FolderIcon,
  HomeIcon,
  InboxIcon,
  LayersIcon,
  LifebuoyIcon,
  LogoIcon,
  MenuIcon,
  PanelIcon,
  SettingsIcon,
  UsersIcon,
} from "@/app/components/icons";
import { storeValue, useStoredValue } from "@/app/components/stored-value";
import { ThemeSwitch } from "@/app/components/theme-switch";
import { unreadBadge } from "@/lib/notifications";
import { initials, projectColor, projectOf, sectionOf, type SidebarSection } from "@/lib/sidebar";

import { startTour, Tour } from "./tour";

export interface SidebarData {
  organization: { id: string; name: string };
  /** The person's organizations, to switch to. */
  organizations: { id: string; name: string }[];
  /** Active projects the person can read; `attention`: unread notifications about it. */
  projects: { id: string; name: string; attention: boolean }[];
  /** Unread notifications; null when Kerykes didn't answer. */
  unread: number | null;
  user: { name: string; role: string | null };
  status: { ok: boolean; text: string; down: string[] };
}

const HELP_URL = "https://github.com/pascalwilbrink/aether-os/tree/main/docs";
const COLLAPSED_KEY = "iris-sidebar-collapsed";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/** Closes a popover on a click outside it or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/**
 * The organization's sidebar: the logo, the organization (switch to another),
 * its sections and projects, the services' status, help, and the person
 * (theme, switch organization, sign out). Collapses to icons (remembered in
 * this browser); on small screens it's a drawer behind a menu button.
 */
export function SidebarView({ data }: { data: SidebarData }) {
  const pathname = usePathname();
  const collapsed = useStoredValue(COLLAPSED_KEY) === "true";
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleCollapsed = () => storeValue(COLLAPSED_KEY, String(!collapsed));

  return (
    <>
      <Tour base={`/orgs/${data.organization.id}`} />
      {/* Small screens: a bar with the menu button. */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-zinc-100/90 px-4 py-2 backdrop-blur md:hidden dark:border-zinc-800 dark:bg-[#0f0f11]/90">
        <Logo />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-label="Open the menu"
        >
          <MenuIcon />
        </button>
      </div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close the menu"
            onClick={() => setMobileOpen(false)}
          />
          {/* A link followed in the drawer closes it. */}
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw]"
            onClickCapture={(event) => {
              if ((event.target as Element).closest("a")) setMobileOpen(false);
            }}
          >
            <Panel data={data} pathname={pathname} collapsed={false} onCollapse={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div
        className={`sticky top-0 hidden h-screen shrink-0 transition-[width] duration-200 md:block ${
          collapsed ? "w-[72px]" : "w-72"
        }`}
      >
        <Panel data={data} pathname={pathname} collapsed={collapsed} onCollapse={toggleCollapsed} />
      </div>
    </>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoIcon className="shrink-0 text-indigo-500 dark:text-indigo-400" width={28} height={28} />
      {compact ? null : (
        <>
          <span className="text-2xl font-bold tracking-tight">iris</span>
          <span className="w-12 text-[9px] leading-tight font-medium tracking-[0.25em] text-zinc-500">AETHER-OS</span>
        </>
      )}
    </span>
  );
}

function Panel({
  data,
  pathname,
  collapsed,
  onCollapse,
}: {
  data: SidebarData;
  pathname: string;
  collapsed: boolean;
  onCollapse: () => void;
}) {
  const org = data.organization.id;
  const base = `/orgs/${org}`;
  const section = sectionOf(pathname, org);
  const currentProject = projectOf(pathname, org);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const badge = data.unread === null ? null : unreadBadge(data.unread);

  const items: { key: SidebarSection; label: string; href: string; Icon: IconType; badge?: string | null }[] = [
    { key: "home", label: "Home", href: base, Icon: HomeIcon },
    { key: "inbox", label: "Inbox", href: `${base}/notifications`, Icon: InboxIcon, badge },
  ];
  const rest: { key: SidebarSection; label: string; href: string; Icon: IconType }[] = [
    { key: "agents", label: "Agents", href: `${base}/agents`, Icon: AgentIcon },
    { key: "templates", label: "Templates", href: `${base}/templates`, Icon: LayersIcon },
    { key: "members", label: "Members", href: `${base}/members`, Icon: UsersIcon },
    { key: "settings", label: "Settings", href: `${base}/settings`, Icon: SettingsIcon },
  ];

  return (
    <nav
      aria-label="Organization"
      className="flex h-full flex-col border-r border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-800/80 dark:bg-[#0f0f11] dark:text-zinc-400"
    >
      <div className={`flex items-center px-4 pt-5 pb-4 ${collapsed ? "flex-col gap-3" : "justify-between"}`}>
        <Link href={base} className="text-zinc-900 dark:text-zinc-100" aria-label="Home">
          <Logo compact={collapsed} />
        </Link>
        <button
          type="button"
          onClick={onCollapse}
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <PanelIcon className={collapsed ? "rotate-180" : ""} />
        </button>
      </div>

      <div className="px-3" data-tour="organization">
        <OrganizationSwitcher data={data} collapsed={collapsed} />
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
        {collapsed ? null : (
          <p className="mb-2 px-3 text-[11px] font-medium tracking-[0.2em] text-zinc-500">ORGANIZATION</p>
        )}
        <ul className="space-y-1">
          {items.map(({ key, ...item }) => (
            <li key={key}>
              <NavItem {...item} tour={key} active={section === key} collapsed={collapsed} />
            </li>
          ))}
          <li data-tour="projects">
            {collapsed ? (
              <NavItem
                label="Projects"
                href={`${base}/projects`}
                Icon={FolderIcon}
                active={section === "projects"}
                collapsed
              />
            ) : (
              <>
                <div
                  className={`flex items-center rounded-lg ${
                    pathname === `${base}/projects`
                      ? "bg-indigo-100/70 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
                      : section === "projects"
                        ? "text-zinc-900 dark:text-zinc-100"
                        : ""
                  }`}
                >
                  <Link
                    href={`${base}/projects`}
                    aria-current={pathname === `${base}/projects` ? "page" : undefined}
                    className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium hover:bg-zinc-200/70 dark:hover:bg-zinc-800/60"
                  >
                    <FolderIcon className="shrink-0" />
                    <span className="flex-1">Projects</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setProjectsOpen((open) => !open)}
                    aria-expanded={projectsOpen}
                    aria-label={projectsOpen ? "Hide the projects" : "Show the projects"}
                    className="mr-1 rounded-md p-1.5 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/60"
                  >
                    <ChevronDownIcon
                      width={16}
                      height={16}
                      className={`transition-transform ${projectsOpen ? "" : "-rotate-90"}`}
                    />
                  </button>
                </div>
                {projectsOpen ? (
                  <ul className="mt-1 ml-[21px] space-y-0.5 border-l border-zinc-300 pl-3 dark:border-zinc-800">
                    {data.projects.length === 0 ? (
                      <li className="px-3 py-1.5 text-sm text-zinc-500">No projects yet</li>
                    ) : (
                      data.projects.map((project) => (
                        <li key={project.id}>
                          <Link
                            href={`${base}/projects/${project.id}`}
                            aria-current={currentProject === project.id ? "page" : undefined}
                            className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-sm hover:bg-zinc-200/70 dark:hover:bg-zinc-800/60 ${
                              currentProject === project.id
                                ? "bg-zinc-200/80 font-medium text-zinc-900 dark:bg-zinc-800/70 dark:text-zinc-100"
                                : ""
                            }`}
                          >
                            <span className={`size-1.5 shrink-0 rounded-full ${projectColor(project.id)}`} />
                            <span className="flex-1 truncate">{project.name}</span>
                            {project.attention ? (
                              <span
                                className="size-1.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400"
                                title="Unread notifications"
                              />
                            ) : null}
                          </Link>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </>
            )}
          </li>
          {rest.map(({ key, ...item }) => (
            <li key={key}>
              <NavItem {...item} tour={key} active={section === key} collapsed={collapsed} />
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1 px-3 pb-3">
        <Link
          href={`${base}/settings#status`}
          title={data.status.down.length > 0 ? `Unreachable: ${data.status.down.join(", ")}` : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-zinc-200/70 dark:hover:bg-zinc-800/60 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <span
            className={`size-2 shrink-0 rounded-full ${
              data.status.ok ? "bg-emerald-600 dark:bg-emerald-400" : "bg-amber-500 dark:bg-amber-400"
            }`}
          />
          {collapsed ? (
            <span className="sr-only">{data.status.text}</span>
          ) : (
            <>
              <span className="flex-1">{data.status.text}</span>
              <ArrowUpRightIcon width={16} height={16} />
            </>
          )}
        </Link>
        <a
          href={HELP_URL}
          target="_blank"
          rel="noreferrer"
          title={collapsed ? "Help & resources" : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] hover:bg-zinc-200/70 dark:hover:bg-zinc-800/60 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LifebuoyIcon className="shrink-0" />
          {collapsed ? (
            <span className="sr-only">Help & resources</span>
          ) : (
            <>
              <span className="flex-1">Help &amp; resources</span>
              <ArrowUpRightIcon width={16} height={16} />
            </>
          )}
        </a>
      </div>

      <div className="border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
        <div data-tour="user">
          <UserMenu data={data} collapsed={collapsed} />
        </div>
      </div>
    </nav>
  );
}

function NavItem({
  label,
  href,
  Icon,
  active,
  collapsed,
  badge,
  tour,
}: {
  label: string;
  href: string;
  Icon: IconType;
  active: boolean;
  collapsed: boolean;
  badge?: string | null;
  /** What the tour calls it (`data-tour`). */
  tour?: string;
}) {
  return (
    <Link
      href={href}
      data-tour={tour}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium ${
        collapsed ? "justify-center" : ""
      } ${
        active
          ? "bg-indigo-100/70 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
          : "hover:bg-zinc-200/70 hover:text-zinc-900 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
      }`}
    >
      <span className="relative shrink-0">
        <Icon />
        {badge && collapsed ? (
          <span
            className="absolute -top-2 -right-2.5 rounded-md bg-indigo-600 px-1 text-[10px] leading-4 font-semibold text-white"
            aria-label={`${badge} unread`}
          >
            {badge}
          </span>
        ) : null}
      </span>
      {collapsed ? <span className="sr-only">{label}</span> : <span className="flex-1">{label}</span>}
      {badge && !collapsed ? (
        <span
          className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300"
          aria-label={`${badge} unread`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function Popover({ children, align = "bottom" }: { children: ReactNode; align?: "bottom" | "top" }) {
  return (
    <div
      className={`absolute left-0 z-50 w-64 rounded-xl border border-zinc-200 bg-white p-1.5 text-sm text-zinc-700 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 ${
        align === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
      }`}
    >
      {children}
    </div>
  );
}

function OrganizationSwitcher({ data, collapsed }: { data: SidebarData; collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const others = data.organizations.filter((organization) => organization.id !== data.organization.id);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={collapsed ? data.organization.name : undefined}
        className={`flex w-full items-center gap-3 rounded-xl text-left ${
          collapsed
            ? "justify-center p-1"
            : "border border-zinc-200 bg-white p-2.5 hover:border-zinc-300 dark:border-zinc-800 dark:bg-transparent dark:hover:border-zinc-700"
        }`}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-lg font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
          {initials(data.organization.name).slice(0, 1)}
        </span>
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-zinc-900 dark:text-zinc-100">
                {data.organization.name}
              </span>
              <span className="block text-sm text-zinc-500">Organization</span>
            </span>
            <ChevronDownIcon width={18} height={18} className="text-zinc-500" />
          </>
        )}
      </button>
      {open ? (
        <Popover>
          <p className="px-2.5 pt-1.5 pb-1 text-xs text-zinc-500">Switch organization</p>
          {others.length === 0 ? (
            <p className="px-2.5 py-1.5 text-zinc-500">No other organizations</p>
          ) : (
            others.map((organization) => (
              // A new sign-in for that organization (one per token).
              <a
                key={organization.id}
                href={`/auth/sign-in?organization=${organization.id}`}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span className="flex size-6 items-center justify-center rounded-md bg-zinc-200 text-xs font-semibold dark:bg-zinc-800">
                  {initials(organization.name).slice(0, 1)}
                </span>
                <span className="truncate">{organization.name}</span>
              </a>
            ))
          )}
          <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
          <Link href="/orgs" className="block rounded-lg px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            All organizations…
          </Link>
        </Popover>
      ) : null}
    </div>
  );
}

function UserMenu({ data, collapsed }: { data: SidebarData; collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={collapsed ? data.user.name : undefined}
        className={`flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-zinc-200/70 dark:hover:bg-zinc-800/60 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
          {initials(data.user.name)}
        </span>
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-zinc-900 dark:text-zinc-100">{data.user.name}</span>
              {data.user.role ? <span className="block text-sm text-zinc-500">{data.user.role}</span> : null}
            </span>
            <ChevronDownIcon width={18} height={18} className="text-zinc-500" />
          </>
        )}
      </button>
      {open ? (
        <Popover align="top">
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-zinc-500">Theme</span>
            <ThemeSwitch />
          </div>
          <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              startTour();
            }}
            className="w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Take the tour
          </button>
          <Link href="/orgs" className="block rounded-lg px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Switch organization
          </Link>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
        </Popover>
      ) : null}
    </div>
  );
}
