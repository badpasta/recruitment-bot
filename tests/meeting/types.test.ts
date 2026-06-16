import { describe, it, expect } from "vitest";
import {
  LoginExpiredError,
  TimeConflictError,
  PageStructureError,
} from "../../src/meeting/types.js";

describe("LoginExpiredError", () => {
  it("is an instance of Error", () => {
    const err = new LoginExpiredError();
    expect(err).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    const err = new LoginExpiredError();
    expect(err.name).toBe("LoginExpiredError");
  });

  it("accepts a message", () => {
    const err = new LoginExpiredError("session timed out");
    expect(err.message).toBe("session timed out");
  });

  it("has default message when none provided", () => {
    const err = new LoginExpiredError();
    expect(err.message).toBe("Login expired");
  });
});

describe("TimeConflictError", () => {
  it("is an instance of Error", () => {
    const err = new TimeConflictError();
    expect(err).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    const err = new TimeConflictError();
    expect(err.name).toBe("TimeConflictError");
  });

  it("accepts a message", () => {
    const err = new TimeConflictError("slot taken");
    expect(err.message).toBe("slot taken");
  });

  it("has default message when none provided", () => {
    const err = new TimeConflictError();
    expect(err.message).toBe("Time conflict");
  });
});

describe("PageStructureError", () => {
  it("is an instance of Error", () => {
    const err = new PageStructureError();
    expect(err).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    const err = new PageStructureError();
    expect(err.name).toBe("PageStructureError");
  });

  it("accepts a message", () => {
    const err = new PageStructureError("selector not found");
    expect(err.message).toBe("selector not found");
  });

  it("has default message when none provided", () => {
    const err = new PageStructureError();
    expect(err.message).toBe("Page structure changed");
  });
});
