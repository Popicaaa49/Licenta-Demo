import path from "path";
import dotenv from "dotenv";

dotenv.config();

export type OracleLocationConfig = {
  locationId: string;
  latitude: number;
  longitude: number;
  label?: string;
};

const backendRoot = path.resolve(__dirname, "../..");

const readString = (name: string, fallback = "") => process.env[name]?.trim() || fallback;

const readNumber = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) return fallback;

  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsed;
};

const readBoolean = (name: string, fallback: boolean) => {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) return fallback;
  return raw.trim().toLowerCase() === "true";
};

const readJson = <T>(name: string, fallback: T): T => {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`Environment variable ${name} must contain valid JSON. ${String(error)}`);
  }
};

const readNumberList = (name: string, fallback: number[]) => {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) return fallback;

  const parsed = raw
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry >= 0);

  if (parsed.length === 0) {
    throw new Error(`Environment variable ${name} must contain a comma-separated number list.`);
  }

  return parsed;
};

export const env = {
  nodeEnv: readString("NODE_ENV", "development"),
  port: readNumber("PORT", 4000),
  backendBaseUrl: readString("BACKEND_BASE_URL", "http://127.0.0.1:4000"),
  oracleSharedSecret: readString("ORACLE_SHARED_SECRET"),

  databaseUrl: readString("DATABASE_URL"),
  dbHost: readString("PGHOST", "127.0.0.1"),
  dbPort: readNumber("PGPORT", 5432),
  dbName: readString("PGDATABASE", "licenta_demo"),
  dbUser: readString("PGUSER", "postgres"),
  dbPassword: readString("PGPASSWORD", "postgres"),

  rpcUrl: readString("RPC_URL", "http://127.0.0.1:8545"),
  oraclePrivateKey: readString("ORACLE_PRIVATE_KEY"),
  policyManagerPrivateKey: readString("POLICY_MANAGER_PRIVATE_KEY"),
  insuranceContractAddress: readString("INSURANCE_CONTRACT_ADDRESS"),
  insuranceContractAbiPath: path.resolve(
    backendRoot,
    readString("INSURANCE_CONTRACT_ABI_PATH", "../frontend/src/contracts/InsuranceEscrow.json")
  ),

  openWeatherApiKey: readString("OPENWEATHER_API_KEY"),
  openWeatherBaseUrl: readString("OPENWEATHER_BASE_URL", "https://api.openweathermap.org"),
  openWeatherUnits: readString("OPENWEATHER_UNITS", "metric"),
  ethExchangeRatesBaseUrl: readString(
    "ETH_EXCHANGE_RATES_BASE_URL",
    "https://api.coinbase.com/v2/exchange-rates"
  ),
  ethExchangeRatesCacheTtlMs: readNumber("ETH_EXCHANGE_RATES_CACHE_TTL_MS", 60_000),
  openMeteoArchiveBaseUrl: readString(
    "OPEN_METEO_ARCHIVE_BASE_URL",
    "https://archive-api.open-meteo.com"
  ),
  oraclePollIntervalMs: readNumber("ORACLE_POLL_INTERVAL_MS", 60 * 60 * 1000),
  oracleRunOnce: readBoolean("ORACLE_RUN_ONCE", false),
  oracleWeatherProvider: readString("ORACLE_WEATHER_PROVIDER", "openweather"),
  oracleLocations: readJson<OracleLocationConfig[]>("ORACLE_LOCATIONS_JSON", []),
  underwritingHistoryDays: readNumber("UNDERWRITING_HISTORY_DAYS", 90),
  underwritingLocalHistoryMinPoints: readNumber("UNDERWRITING_LOCAL_HISTORY_MIN_POINTS", 168),
  payoutWorkerPollIntervalMs: readNumber("PAYOUT_WORKER_POLL_INTERVAL_MS", 5_000),
  payoutConfirmationTimeoutMs: readNumber("PAYOUT_CONFIRMATION_TIMEOUT_MS", 120_000),
  payoutStaleJobTimeoutMs: readNumber("PAYOUT_STALE_JOB_TIMEOUT_MS", 300_000),
  payoutRetryDelaysMs: readNumberList(
    "PAYOUT_RETRY_DELAYS_MS",
    [30_000, 120_000, 600_000, 1_800_000, 7_200_000]
  ),
};

export const ensureConfigured = (entries: Array<[string, string]>) => {
  const missing = entries
    .filter(([, value]) => !value || value.trim().length === 0)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
};
