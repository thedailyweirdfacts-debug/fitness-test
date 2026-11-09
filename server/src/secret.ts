import { timingSafeEqual } from "node:crypto";

export const SECRET_HEADER = "x-plateful-secret";

export function secretMatches(provided: string, expected: string): boolean {
  const given = Buffer.from(provided);
  const actual = Buffer.from(expected);
  if (given.length !== actual.length) {
    timingSafeEqual(actual, actual);
    return false;
  }
  return timingSafeEqual(given, actual);
}
