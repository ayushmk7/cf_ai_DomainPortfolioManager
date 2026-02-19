export class ValidationError extends Error {
  readonly kind = "validation";
}

export class NotFoundError extends Error {
  readonly kind = "not_found";
}

export class InfraError extends Error {
  readonly kind = "infra";
}

export function normalizeError(error: unknown): { message: string; kind: string } {
  if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof InfraError) {
    return { message: error.message, kind: error.kind };
  }
  if (error instanceof Error) {
    return { message: error.message, kind: "unknown" };
  }
  return { message: "Unexpected error", kind: "unknown" };
}
