import { ensureConfigured, env } from "../config/env";
import { ContractRepository } from "../repositories/contractRepository";
import { MockWeatherProvider } from "./providers/mockWeatherProvider";
import { OpenWeatherProvider } from "./providers/openWeatherProvider";
import { WeatherProvider } from "./providers/weatherProvider";

const getProvider = (): WeatherProvider => {
  if (env.oracleWeatherProvider === "mock") {
    return new MockWeatherProvider();
  }

  return new OpenWeatherProvider();
};

const contractRepository = new ContractRepository();

const resolveTrackedLocations = async () => {
  const trackedFromDb = await contractRepository.listTrackedLocations();

  if (trackedFromDb.length > 0) {
    return trackedFromDb.map((location) => ({
      locationId: location.location_id,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      label: location.location_label ?? location.location_id,
    }));
  }

  return env.oracleLocations;
};

const pushWeatherUpdate = async (payload: unknown) => {
  ensureConfigured([
    ["BACKEND_BASE_URL", env.backendBaseUrl],
    ["ORACLE_SHARED_SECRET", env.oracleSharedSecret],
  ]);

  const url = new URL("/oracle/update-weather", env.backendBaseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-oracle-key": env.oracleSharedSecret,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Backend rejected oracle update: ${response.status} ${body}`);
  }

  return response.json();
};

const runOnce = async () => {
  const trackedLocations = await resolveTrackedLocations();
  if (trackedLocations.length === 0) {
    throw new Error(
      "No tracked locations found. Create a policy first or configure ORACLE_LOCATIONS_JSON as fallback."
    );
  }

  const provider = getProvider();

  for (const location of trackedLocations) {
    const weather = await provider.fetchCurrent(location);
    const result = await pushWeatherUpdate(weather);
    console.log(
      `[oracle] ${location.locationId} score=${result.assessment.riskScore} payout_jobs=${result.payoutJobs.length}`
    );
  }
};

const main = async () => {
  await runOnce();

  if (env.oracleRunOnce) {
    return;
  }

  setInterval(() => {
    runOnce().catch((error) => {
      console.error("[oracle] polling cycle failed", error);
    });
  }, env.oraclePollIntervalMs);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
