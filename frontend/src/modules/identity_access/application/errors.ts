export class IdentityRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "IdentityRequestError";
  }
}
