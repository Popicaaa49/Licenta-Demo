# Parametric Agricultural Insurance Backend

This backend implements the off-chain layers for the insurance system:

- `Oracle Service`: polls weather data and forwards normalized readings.
- `Risk Engine`: computes the seasonal risk score and decides whether the trigger is met.
- `Express API`: persists weather/risk data in PostgreSQL and exposes snapshot and audit endpoints.
- `Payout Worker`: processes queued settlement jobs with retry and dead-letter handling.

## Structure

- `src/routes`: API endpoints required by the brief.
- `src/services`: orchestration for policy creation and oracle ingestion.
- `src/risk`: seasonal risk-scoring logic.
- `src/repositories`: PostgreSQL access layer.
- `src/blockchain`: Ethereum contract adapter using `ethers`.
- `src/oracle`: pluggable weather providers and hourly polling runner.
- `src/workers`: background workers for payout execution.
- `sql/schema.sql`: database schema.
- `sql/seed.sql`: demo seed data.

## Required environment variables

Copy `.env.example` to `.env` and update:

- PostgreSQL connection variables (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`)
- `ORACLE_SHARED_SECRET`
- `RPC_URL`
- `ORACLE_PRIVATE_KEY`
- `POLICY_MANAGER_PRIVATE_KEY`
- `INSURANCE_CONTRACT_ADDRESS`
- `OPENWEATHER_API_KEY`
- `ORACLE_LOCATIONS_JSON`

## Commands

```bash
npm install
npm run build
npm run dev
npm run oracle
npm run payout-worker
```

## API

- `POST /oracle/update-weather`
- `GET /risk?locations=...`
- `GET /risk/stream?locations=...`
- `GET /risk/:location`
- `GET /risk/history/:location`
- `POST /contract/create`
- `GET /contract/:id`
- `GET /payout/jobs`
- `GET /payout/jobs/:id`
- `GET /payout/jobs/:id/attempts`
- `POST /payout/jobs/:id/requeue`
- `GET /payout/policy/:policyId/audit`

## Demo flow

1. Deploy the updated Solidity contract on Hardhat localhost.
2. Apply `sql/schema.sql` in PostgreSQL.
3. Load `sql/seed.sql` if you want sample data.
4. Start the backend with `npm run dev`.
5. Start the backend with `npm run dev`.
6. Start the oracle poller with `npm run oracle`.
7. Start the payout worker with `npm run payout-worker`.

The oracle component only fetches and normalizes weather data. The payout decision is derived off-chain by the risk engine, persisted as a payout job, and enforced on-chain by the dedicated payout worker.
