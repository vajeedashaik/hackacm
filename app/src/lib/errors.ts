/** A user-correctable problem (bad input, invalid transition). Routes return its message with HTTP 400. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
