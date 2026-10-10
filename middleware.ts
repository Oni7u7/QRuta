import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/cookies";

// Refresca la sesión de Supabase y protege el área de talleres.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, ...SESSION_COOKIE }));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { pathname, search } = request.nextUrl;

  if (!user && pathname.startsWith("/taller")) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }
  if (user && pathname === "/login") {
    const taller = request.nextUrl.clone();
    taller.pathname = "/taller";
    taller.search = "";
    return NextResponse.redirect(taller);
  }
  return response;
}

export const config = {
  matcher: ["/taller/:path*", "/login", "/api/expedientes"],
};
