import { handlers } from "@/auth";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const { GET: authGET, POST } = handlers;

// GitHub rolled out RFC 9207 and now returns an `iss` parameter on the OAuth
// callback. @auth/core builds a synthetic authorization-server record for
// GitHub whose issuer never matches GitHub's real `iss`, so oauth4webapi
// rejects the callback and login fails with a generic Configuration error.
// GitHub is a single, PKCE-protected provider here (no mix-up-attack surface),
// so it's safe to drop the `iss` param before Auth.js validates it.
export async function GET(request: NextRequest): Promise<Response> {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname.endsWith("/callback/github") && searchParams.has("iss")) {
    console.log("[auth-debug] github callback iss=", searchParams.get("iss"));
    const url = new URL(request.url);
    url.searchParams.delete("iss");
    return authGET(new NextRequest(url, request));
  }
  return authGET(request);
}

export { POST };
