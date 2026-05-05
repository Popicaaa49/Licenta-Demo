import { useEffect, useMemo, useState } from "react";
import { RiskSnapshot } from "../types/insurance";

const BACKEND_BASE_URL =
  process.env.REACT_APP_BACKEND_URL?.trim() || "http://127.0.0.1:4000";

export type RiskFeedStatus = "idle" | "connecting" | "live" | "error";

type RiskStreamState = {
  snapshotsByLocation: Record<string, RiskSnapshot>;
  status: RiskFeedStatus;
  errorMessage: string | null;
};

const normalizeLocationIds = (locationIds: string[]) =>
  Array.from(
    new Set(
      locationIds
        .map((locationId) => locationId.trim())
        .filter(Boolean)
    )
  ).sort();

export const useRiskStream = (
  locationIds: string[],
  enabled: boolean
): RiskStreamState => {
  const [snapshotsByLocation, setSnapshotsByLocation] = useState<Record<string, RiskSnapshot>>({});
  const [status, setStatus] = useState<RiskFeedStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const normalizedLocationIds = useMemo(
    () => normalizeLocationIds(locationIds),
    [locationIds]
  );

  useEffect(() => {
    if (!enabled || normalizedLocationIds.length === 0) {
      setSnapshotsByLocation({});
      setStatus("idle");
      setErrorMessage(null);
      return;
    }

    let disposed = false;
    const abortController = new AbortController();
    const params = new URLSearchParams({
      locations: normalizedLocationIds.join(","),
    });
    const snapshotUrl = `${BACKEND_BASE_URL}/risk?${params.toString()}`;
    const streamUrl = `${BACKEND_BASE_URL}/risk/stream?${params.toString()}`;

    setSnapshotsByLocation({});
    setStatus("connecting");
    setErrorMessage(null);

    const loadInitialSnapshots = async () => {
      try {
        const response = await fetch(snapshotUrl, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Snapshot request failed with ${response.status}`);
        }

        const payload = (await response.json()) as RiskSnapshot[];
        if (disposed) {
          return;
        }

        setSnapshotsByLocation(
          Object.fromEntries(payload.map((snapshot) => [snapshot.locationId, snapshot]))
        );
      } catch (error) {
        if (disposed || abortController.signal.aborted) {
          return;
        }

        console.error("Unable to load risk snapshots", error);
        setStatus("error");
        setErrorMessage("Nu am putut incarca scorul live din backend.");
      }
    };

    void loadInitialSnapshots();

    const eventSource = new EventSource(streamUrl);

    const handleSnapshotEvent = (event: MessageEvent<string>) => {
      if (disposed) {
        return;
      }

      try {
        const snapshot = JSON.parse(event.data) as RiskSnapshot;
        setSnapshotsByLocation((current) => ({
          ...current,
          [snapshot.locationId]: snapshot,
        }));
        setStatus("live");
        setErrorMessage(null);
      } catch (error) {
        console.error("Unable to parse risk snapshot event", error);
      }
    };

    eventSource.onopen = () => {
      if (disposed) {
        return;
      }

      setStatus("live");
      setErrorMessage(null);
    };

    eventSource.onerror = () => {
      if (disposed) {
        return;
      }

      setStatus("error");
      setErrorMessage("Fluxul live de risc s-a deconectat. Browserul incearca reconnect.");
    };

    eventSource.addEventListener("risk_snapshot", handleSnapshotEvent as EventListener);
    eventSource.addEventListener(
      "risk_snapshot_replay",
      handleSnapshotEvent as EventListener
    );

    return () => {
      disposed = true;
      abortController.abort();
      eventSource.removeEventListener(
        "risk_snapshot",
        handleSnapshotEvent as EventListener
      );
      eventSource.removeEventListener(
        "risk_snapshot_replay",
        handleSnapshotEvent as EventListener
      );
      eventSource.close();
    };
  }, [enabled, normalizedLocationIds]);

  return {
    snapshotsByLocation,
    status,
    errorMessage,
  };
};
