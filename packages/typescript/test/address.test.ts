import { describe, expect, it } from "vitest";
import { a1, colToLetters } from "../src/address.ts";

describe("colToLetters", () => {
  it("maps the first 26 columns to A..Z", () => {
    expect(colToLetters(1)).toBe("A");
    expect(colToLetters(2)).toBe("B");
    expect(colToLetters(26)).toBe("Z");
  });

  it("wraps to two letters at 27", () => {
    expect(colToLetters(27)).toBe("AA");
    expect(colToLetters(28)).toBe("AB");
    expect(colToLetters(52)).toBe("AZ");
    expect(colToLetters(53)).toBe("BA");
    expect(colToLetters(702)).toBe("ZZ");
  });

  it("wraps to three letters at 703", () => {
    expect(colToLetters(703)).toBe("AAA");
  });

  it("rejects non-positive integers", () => {
    expect(() => colToLetters(0)).toThrow(RangeError);
    expect(() => colToLetters(-1)).toThrow(RangeError);
    expect(() => colToLetters(1.5)).toThrow(RangeError);
  });
});

describe("a1", () => {
  it("composes column letters with the row number", () => {
    expect(a1(1, 1)).toBe("A1");
    expect(a1(5, 3)).toBe("C5");
    expect(a1(100, 27)).toBe("AA100");
  });
});
