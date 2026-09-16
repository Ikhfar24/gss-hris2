"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Clock3,
  LockKeyhole,
  Mail,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { saveSession } from "@/lib/auth";
import { isInternalPath } from "@/lib/utils";
import { AppLogo } from "@/components/AppLogo";
import { Alert, LoadingState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/forms";
import { Skeleton } from "@/components/ui/skeleton";

interface LoginResponse {
  user: {
    id: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
  };
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      saveSession(response.user);
      toast.success("Selamat datang kembali");
      const next = params.get("next");
      router.replace(
        response.user.mustChangePassword
          ? "/account"
          : isInternalPath(next)
            ? next
            : "/dashboard",
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Gagal terhubung ke server",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-dvh overflow-hidden bg-paper lg:grid-cols-[minmax(0,1.18fr)_minmax(420px,0.82fr)]">
      <section className="relative hidden overflow-hidden bg-binder-deep px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
        <span
          aria-hidden
          className="absolute inset-y-0 right-0 w-1 bg-accent"
        />
        <AppLogo inverse />
        <div className="relative max-w-2xl">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-white/45">
            Workforce operations dossier
          </p>
          <h1 className="max-w-xl text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.035em] xl:text-[3.5rem]">
            Orang, lokasi, dan keputusan dalam satu ruang kerja.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-white/60">
            Pantau penempatan, jadwal, presensi, dan payroll dengan konteks
            operasional yang tetap terhubung.
          </p>
          <div className="mt-10 grid max-w-xl grid-cols-3 border-y border-white/10">
            <div className="border-r border-white/10 py-5">
              <UsersRound className="size-5 text-accent" />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-white/50">
                Tenaga kerja
              </p>
            </div>
            <div className="border-r border-white/10 px-5 py-5">
              <Building2 className="size-5 text-accent" />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-white/50">
                Lokasi klien
              </p>
            </div>
            <div className="pl-5 py-5">
              <Clock3 className="size-5 text-accent" />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-white/50">
                Waktu kerja
              </p>
            </div>
          </div>
        </div>
        <p className="relative text-xs text-white/35">
          Akses terbatas untuk pengguna terdaftar.
        </p>
      </section>
      <section className="flex min-w-0 items-center justify-center bg-canvas px-5 py-8 sm:px-10 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 border-b border-white/15 bg-binder p-5 lg:hidden">
            <AppLogo inverse />
          </div>
          <div className="mb-7 border-l-4 border-accent pl-4">
            <p className="text-caption font-bold uppercase tracking-[0.15em] text-muted">
              Akses ruang kerja
            </p>
            <h2 className="mt-2 text-page-title text-brand sm:text-3xl">
              Masuk ke akun Anda
            </h2>
            <p className="mt-2 text-body text-muted">
              Gunakan kredensial perusahaan yang terdaftar.
            </p>
          </div>
          <Card className="overflow-hidden border-0 p-0">
            <div className="h-1 bg-brand" />
            <form
              onSubmit={onSubmit}
              aria-busy={loading}
              className="space-y-5 p-6 sm:p-8"
            >
              <div>
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="pl-10"
                    placeholder="nama@perusahaan.com"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pl-10"
                    placeholder="Masukkan password"
                  />
                </div>
              </div>
              {error && <Alert variant="danger">{error}</Alert>}
              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  "Memproses..."
                ) : (
                  <>
                    Masuk <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </form>
          </Card>
          <p className="mt-5 text-center text-caption text-muted">
            Hubungi administrator jika akses akun bermasalah.
          </p>
        </div>
      </section>
    </main>
  );
}

function LoginSkeleton() {
  return (
    <LoadingState
      label="Memuat halaman masuk"
      className="grid min-h-dvh bg-background lg:grid-cols-2"
    >
      <div className="hidden bg-navy lg:block" />
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="mt-10 h-80 w-full rounded-2xl" />
        </div>
      </div>
    </LoadingState>
  );
}
