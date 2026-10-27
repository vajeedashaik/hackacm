/** Typed service failure. `status` is the HTTP code the API layer returns. Messages never contain complaint text. */
export class ServiceError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 422 | 503,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
