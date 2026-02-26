export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/clients/:path*", "/api/clients/:path*", "/api/stream/:path*"],
};