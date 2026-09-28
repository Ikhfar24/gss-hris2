"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  Fingerprint,
  LogOut,
  Menu,
  UserRoundCog,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { clearSession } from "@/lib/auth";
import {
  canAttend,
  mobileNavigation,
  navigation,
  type NavigationItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useSession } from "./providers/SessionProvider";
import { AppLogo } from "./AppLogo";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Skeleton } from "./ui/skeleton";
import { LoadingState } from "./ui/feedback";
import AttendancePage from "@/app/(dashboard)/attendance/page";
import { AttendancePresentationProvider } from "./attendance/AttendancePresentationContext";
import {
  CurrentUserAvatar,
  useCurrentUserIdentity,
} from "./employee/CurrentUserIdentity";

const roleLabels = {
  KARYAWAN: "Karyawan",
  KOORDINATOR: "Koordinator",
  ADMIN_HR: "Admin HR",
  KEUANGAN: "Keuangan",
  MARKETING: "Marketing",
  DIREKTUR: "Direktur",
  KOMISARIS: "Komisaris",
  SYSTEM_ADMIN: "System Admin",
} as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceCompleted, setAttendanceCompleted] = useState<
    "check-in" | "check-out" | null
  >(null);

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
      clearSession();
      toast.success("Anda telah keluar");
      router.replace("/login");
    } catch {
      toast.error("Gagal mengakhiri sesi. Periksa koneksi lalu coba lagi.");
    }
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-surface px-4 py-2 font-semibold text-brand shadow-lift focus:not-sr-only"
      >
        Lewati ke konten utama
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden h-dvh w-[224px] flex-col border-r border-white/10 bg-binder-deep text-white lg:flex">
        <div className="flex h-14 items-center border-b border-white/10 px-4">
          <AppLogo inverse />
        </div>
        <nav
          aria-label="Navigasi utama"
          className="flex-1 overflow-y-auto px-2.5 py-4"
        >
          {navigation.map((group) => {
            const attendanceReviewer = [
              "KOORDINATOR",
              "ADMIN_HR",
              "DIREKTUR",
              "SYSTEM_ADMIN",
            ].includes(session.role);
            const items = group.items.filter(
              (item) =>
                item.roles.includes(session.role) &&
                (!item.requiresEmployee || !!session.employee) &&
                (!item.requiresAttendance ||
                  attendanceReviewer ||
                  canAttend(session)),
            );
            if (!items.length) return null;
            return (
              <div key={group.label} className="mb-4">
                <p className="mb-2 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-white/40">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {items.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      active={isActive(pathname, item.href)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <AccountDialog inverse onLogout={logout} />
        </div>
      </aside>
      <div className="min-w-0 lg:ml-[224px]">
        <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between border-b border-white/10 bg-binder pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] shadow-card lg:h-14 lg:border-border lg:bg-paper lg:px-5 lg:pt-0 lg:shadow-none">
          <AppLogo inverse className="lg:hidden" />
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-semibold text-brand">
              {session.employee?.activePlacementName ??
                roleLabels[session.role]}
            </p>
            <p className="mt-0.5 text-caption text-muted">Ruang kerja {roleLabels[session.role]}</p>
          </div>
          <div className="flex items-center gap-1">
            {/* prettier-ignore */}
            <Link href="/activity" aria-label="Pusat Aktivitas" title="Pusat Aktivitas" className="grid size-11 place-items-center rounded-2xl text-white/80 hover:bg-white/10 lg:text-muted lg:hover:bg-surface-subtle"><Bell className="size-5" /></Link>
            <div className="lg:hidden">
              <MobileModules />
            </div>
            <div className="hidden lg:block">
              <AccountDialog compact onLogout={logout} />
            </div>
            <div className="lg:hidden">
              <AccountDialog compact inverse onLogout={logout} />
            </div>
          </div>
        </header>
        {/* prettier-ignore */}
        <main id="main-content" className="mobile-nav-clearance mx-auto w-full max-w-[1640px] pt-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pt-5 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:px-5 lg:pt-5">{children}</main>
      </div>
      <MobileNavigation
        items={mobileNavigation(session)}
        attendanceEnabled={canAttend(session)}
        pathname={pathname}
        onAttendance={() => setAttendanceOpen(true)}
      />
      <Dialog
        open={attendanceOpen}
        onOpenChange={(open) => {
          setAttendanceOpen(open);
          if (!open) setAttendanceCompleted(null);
        }}
      >
        <DialogContent className="inset-0 h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:left-1/2 sm:top-1/2 sm:h-[min(92dvh,860px)] sm:w-[min(100%-2rem,720px)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-6">
          <DialogTitle className="sr-only">Presensi langsung</DialogTitle>
          <DialogDescription className="sr-only">
            Ambil foto dan lokasi GPS untuk check-in atau check-out.
          </DialogDescription>
          {attendanceCompleted ? (
            <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col items-center justify-center text-center sm:min-h-0 sm:py-12">
              <span className="grid size-24 place-items-center rounded-full bg-success-surface text-success">
                <CheckCircle2 className="size-12" strokeWidth={2.5} />
              </span>
              <h2 className="mt-6 text-2xl font-bold text-brand">
                Presensi Berhasil
              </h2>
              <p className="mt-2 text-body text-muted">
                {attendanceCompleted === "check-in"
                  ? "Check-in sudah tercatat. Selamat bekerja."
                  : "Check-out sudah tercatat. Terima kasih atas pekerjaan hari ini."}
              </p>
              <Button
                size="lg"
                className="mt-8 w-full"
                onClick={() => {
                  setAttendanceOpen(false);
                  setAttendanceCompleted(null);
                }}
              >
                Selesai
              </Button>
              <Button asChild variant="ghost" className="mt-2 w-full">
                <Link
                  href="/attendance/history?view=mine"
                  onClick={() => {
                    setAttendanceOpen(false);
                    setAttendanceCompleted(null);
                  }}
                >
                  Lihat Riwayat Presensi
                </Link>
              </Button>
            </div>
          ) : (
            <AttendancePresentationProvider
              onCompleted={(action) => {
                toast.success(
                  action === "check-in"
                    ? "Check-in berhasil"
                    : "Check-out berhasil",
                );
                window.dispatchEvent(new Event("attendance-updated"));
                setAttendanceCompleted(action);
              }}
            >
              <AttendancePage />
            </AttendancePresentationProvider>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MobileModules() {
  const { session } = useSession();
  const pathname = usePathname();
  const attendanceReviewer = [
    "KOORDINATOR",
    "ADMIN_HR",
    "DIREKTUR",
    "SYSTEM_ADMIN",
  ].includes(session.role);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          aria-label="Buka semua modul"
          className="grid size-11 place-items-center rounded-lg text-white/80 hover:bg-white/10"
        >
          <Menu className="size-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[100dvh] rounded-none sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl">
        <DialogTitle>Indeks Modul</DialogTitle>
        <DialogDescription>
          Akses ruang kerja sesuai kewenangan akun Anda.
        </DialogDescription>
        <div className="mt-5 space-y-5">
          {navigation.map((group) => {
            const items = group.items.filter(
              (item) =>
                item.roles.includes(session.role) &&
                (!item.requiresEmployee || !!session.employee) &&
                (!item.requiresAttendance ||
                  attendanceReviewer ||
                  canAttend(session)),
            );
            if (!items.length) return null;
            return (
              <section key={group.label}>
                <p className="mb-2 border-b border-border pb-2 text-caption font-bold uppercase tracking-[0.12em] text-muted">
                  {group.label}
                </p>
                <div className="grid gap-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item.href);
                    return (
                      <DialogClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                            active
                              ? "bg-brand text-white"
                              : "text-muted hover:bg-surface-subtle hover:text-brand",
                          )}
                        >
                          <Icon className="size-[18px]" />
                          {item.label}
                        </Link>
                      </DialogClose>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NavLink({ item, active }: { item: NavigationItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-colors",
        active
          ? "bg-accent text-binder-deep shadow-control"
          : "text-white/58 hover:bg-white/[0.06] hover:text-white",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

function MobileNavigation({
  items,
  attendanceEnabled,
  pathname,
  onAttendance,
}: {
  items: NavigationItem[];
  attendanceEnabled: boolean;
  pathname: string;
  onAttendance: () => void;
}) {
  const midpoint = Math.ceil(items.length / 2);
  const arranged: (NavigationItem & { center?: boolean })[] = attendanceEnabled
    ? [
        ...items.slice(0, midpoint),
        {
          label: "Presensi",
          href: "/attendance",
          icon: Fingerprint,
          roles: [],
          center: true,
        },
        ...items.slice(midpoint),
      ]
    : items;
  return (
    <nav
      aria-label="Navigasi seluler"
      className="fixed inset-x-0 bottom-0 z-40 flex min-h-[4.5rem] items-end border-t border-border bg-paper pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-lift lg:hidden"
    >
      {arranged.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        if (item.center)
          return (
            <button
              key="attendance-center"
              type="button"
              onClick={onAttendance}
              aria-label="Buka presensi langsung"
              className="group -mt-8 flex min-h-11 flex-1 flex-col items-center gap-1 text-caption font-bold text-brand"
            >
              <span className="relative grid size-14 place-items-center overflow-hidden rounded-full border-4 border-paper bg-brand text-white shadow-lift transition-transform group-active:scale-95 motion-reduce:transition-none">
                <Icon className="size-6" />
              </span>
              <span>Presensi</span>
            </button>
          );
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-11 min-w-0 flex-1 flex-col items-center gap-1 px-1 py-1 text-caption font-semibold after:absolute after:-top-2 after:h-0.5 after:w-8 after:bg-transparent",
              active ? "text-brand after:bg-accent" : "text-muted",
            )}
          >
            <Icon className="size-5" />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function AccountDialog({
  compact = false,
  inverse = false,
  onLogout,
}: {
  compact?: boolean;
  inverse?: boolean;
  onLogout: () => void;
}) {
  const { session } = useSession();
  const identity = useCurrentUserIdentity();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          aria-label={compact ? "Buka menu akun" : undefined}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-lg p-1 text-left hover:bg-surface-subtle",
            !compact && "p-2",
            inverse && "text-white hover:bg-white/10",
          )}
        >
          <CurrentUserAvatar
            size="sm"
            className={cn(
              "size-9 border-border bg-brand/10 text-brand",
              inverse && "border-white/10 bg-white/10 text-white",
            )}
          />
          {!compact && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {identity.name}
              </span>
              <span
                className={cn(
                  "block truncate text-caption text-muted",
                  inverse && "text-white/45",
                )}
              >
                {roleLabels[session.role]}
              </span>
            </span>
          )}
          {!compact && (
            <ChevronDown
              className={cn("size-4 text-muted", inverse && "text-white/45")}
            />
          )}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Akun Anda</DialogTitle>
        <DialogDescription>
          Informasi sesi yang terverifikasi oleh server.
        </DialogDescription>
        <div className="mt-5 flex items-center gap-3 border-y border-border py-4">
          <CurrentUserAvatar
            size="sm"
            className="size-12 border-border bg-brand text-sm text-white"
          />
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {identity.name}
            </p>
            <p className="truncate text-body text-muted">{session.email}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge>{roleLabels[session.role]}</Badge>
          {session.employee?.jobTitle && (
            <Badge variant="info">{session.employee.jobTitle}</Badge>
          )}
        </div>
        {session.employee?.activePlacementName && (
          <p className="mt-4 border-l-2 border-accent bg-surface-subtle p-3 text-body text-muted">
            Penempatan aktif:{" "}
            <strong>{session.employee.activePlacementName}</strong>
          </p>
        )}
        <DialogClose asChild>
          <Button asChild variant="secondary" className="mt-6 w-full">
            <Link href="/account">
              <UserRoundCog className="size-4" />
              Keamanan akun
            </Link>
          </Button>
        </DialogClose>
        <Button variant="secondary" className="mt-2 w-full" onClick={onLogout}>
          <LogOut className="size-4" />
          Keluar
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function isActive(pathname: string, href: string) {
  if (href.includes("?")) return false;
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`))
  );
}

export function AppShellSkeleton() {
  return (
    <LoadingState label="Memuat ruang kerja" className="min-h-dvh lg:flex">
      <aside className="hidden h-dvh w-[224px] border-r border-white/10 bg-binder-deep p-4 lg:block">
        <Skeleton className="h-10 w-36 bg-white/10" />
        <div className="mt-12 space-y-4">
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full bg-white/10" />
          ))}
        </div>
      </aside>
      <div className="flex-1">
        <div className="h-14 bg-brand lg:border-b lg:border-border lg:bg-paper" />
        <main className="mobile-nav-clearance px-4 pt-4 sm:px-6 sm:pt-5 lg:px-5 lg:pt-5">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-3 h-4 w-80 max-w-full" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-32" />
            ))}
          </div>
        </main>
      </div>
      <div className="fixed inset-x-0 bottom-0 h-20 border-t border-border bg-paper lg:hidden" />
    </LoadingState>
  );
}
