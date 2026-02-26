export function mapDbError(error: unknown): { status: number; body: { error: string; detail: string } } {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";

  if (code === "ECONNREFUSED") {
    return {
      status: 503,
      body: {
        error: "DB_UNAVAILABLE",
        detail: "Database connection refused. Check DATABASE_URL/PGHOST and ensure PostgreSQL is running.",
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "DB_QUERY_FAILED",
      detail: "Database query failed.",
    },
  };
}
