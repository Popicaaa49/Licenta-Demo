import { randomUUID } from "crypto";

const roundCoordinate = (value: number) => value.toFixed(5).replace(/^-/, "m").replace(".", "_");

export const buildLocationIdFromCoordinates = (latitude: number, longitude: number) =>
  `loc-${roundCoordinate(latitude)}-${roundCoordinate(longitude)}`.toLowerCase();

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

export const buildGeneratedLocationId = (label: string) => {
  const prefix = slugify(label) || "parcel";
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  return `loc-${prefix}-${suffix}`;
};
