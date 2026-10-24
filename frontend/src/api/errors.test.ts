import { describe, expect, it } from "vitest";
import { ApiError, errorMessage } from "./errors";

const err = (code: string, message: string) => new ApiError({ code, message, status: 401 });

describe("errorMessage INVALID_CREDENTIALS", () => {
  it("keeps the sign-in wording for a wrong e-mail or password", () => {
    expect(errorMessage(err("INVALID_CREDENTIALS", "Invalid e-mail or password"))).toBe("Incorrect email or password.");
  });
  it("shows the real reason when a marketplace rejects the credentials", () => {
    expect(errorMessage(err("INVALID_CREDENTIALS", 'The marketplace rejected the credentials: Invalid sandbox API key (must start with "sandbox_")'))).toContain("marketplace rejected");
  });
});
