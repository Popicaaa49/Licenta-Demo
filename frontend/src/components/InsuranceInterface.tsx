import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import {
  CropReference,
  InsuranceRequest,
  InsuredLocation,
} from "../types/insurance";
import { getInsuranceContract, getReadInsuranceContract } from "../web3Config";

type StatusPayload = { type: "success" | "error" | "warning"; message: string };
type LocationMode = "coordinates" | "geojson" | "existing";
type MarketplaceFilter = "all" | "open" | "locked" | "ready" | "severe";

interface InsuranceInterfaceProps {
  walletConnected: boolean;
  account: string | null;
  mode?: "full" | "request" | "marketplace";
}

const BACKEND_BASE_URL =
  process.env.REACT_APP_BACKEND_URL?.trim() || "http://127.0.0.1:4000";

const buildInsuranceRequestDetailUrl = (
  requestId: number,
  viewerAddress?: string | null
) => {
  const query = viewerAddress
    ? `?viewerAddress=${encodeURIComponent(viewerAddress)}`
    : "";
  return `${BACKEND_BASE_URL}/insurance-request/${requestId}${query}`;
};

const GEOJSON_PLACEHOLDER = `{
  "type": "Polygon",
  "coordinates": [[
    [21.2081, 45.7485],
    [21.2092, 45.7485],
    [21.2092, 45.7493],
    [21.2081, 45.7493],
    [21.2081, 45.7485]
  ]]
}`;

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(address.length - 4)}`;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: value < 1000 ? 2 : 0,
  }).format(value);

const formatPercent = (value: number) =>
  `${new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value * 100)}%`;

const getHistorySourceLabel = (source: unknown) => {
  switch (source) {
    case "local":
      return "Istoric local";
    case "open-meteo":
      return "Open-Meteo";
    case "fallback":
      return "Fallback conservator";
    default:
      return "Necunoscut";
  }
};

const formatEth = (value: number, digits = 4) =>
  `${new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)} ETH`;

const getRiskTierLabel = (riskTier: string) => {
  switch (riskTier) {
    case "low":
      return "Scazut";
    case "medium":
      return "Mediu";
    case "high":
      return "Ridicat";
    case "severe":
      return "Sever";
    default:
      return riskTier;
  }
};

const getRiskTierClassName = (riskTier: string) => {
  if (riskTier === "medium") {
    return "risk-score__pill risk-score__pill--watch";
  }

  if (riskTier === "high" || riskTier === "severe") {
    return "risk-score__pill risk-score__pill--triggered";
  }

  return "risk-score__pill risk-score__pill--normal";
};

const getRequestStatusLabel = (status: string) => {
  switch (status) {
    case "quoted":
      return "Ofertata";
    case "awaiting_farmer_lock":
      return "Asteapta premium initial";
    case "awaiting_underwriter":
      return "Asteapta underwriter";
    case "awaiting_premium":
      return "Asteapta premium";
    case "ready_for_activation":
      return "Gata de activare";
    case "activated":
      return "Activata";
    default:
      return status;
  }
};

const normalizeLocation = (location: Partial<InsuredLocation>): InsuredLocation => ({
  locationId: String(location.locationId ?? ""),
  locationLabel: String(location.locationLabel ?? ""),
  sourceType: String(location.sourceType ?? "unknown"),
  latitude: Number(location.latitude ?? 0),
  longitude: Number(location.longitude ?? 0),
  areaHectares:
    location.areaHectares === null || location.areaHectares === undefined
      ? null
      : Number(location.areaHectares),
  geometryGeoJson: location.geometryGeoJson ?? null,
  metadata:
    location.metadata && typeof location.metadata === "object" ? location.metadata : {},
  createdAt: String(location.createdAt ?? ""),
  updatedAt: String(location.updatedAt ?? ""),
});

const normalizeCrop = (crop: Partial<CropReference>): CropReference => ({
  cropType: String(crop.cropType ?? ""),
  displayName: String(crop.displayName ?? ""),
  family: String(crop.family ?? ""),
  expectedYieldTHa: Number(crop.expectedYieldTHa ?? 0),
  referencePriceEurT: Number(crop.referencePriceEurT ?? 0),
  productionCostEurHa: Number(crop.productionCostEurHa ?? 0),
  basePremiumRate: Number(crop.basePremiumRate ?? 0),
  referenceSeasonDays: Number(crop.referenceSeasonDays ?? 0),
  active: Boolean(crop.active ?? true),
  createdAt: String(crop.createdAt ?? ""),
  updatedAt: String(crop.updatedAt ?? ""),
});

const normalizeRequest = (request: Partial<InsuranceRequest>): InsuranceRequest => ({
  id: Number(request.id ?? 0),
  farmerAddress: String(request.farmerAddress ?? ""),
  locationId: String(request.locationId ?? ""),
  locationLabel: String(request.locationLabel ?? ""),
  cropType: String(request.cropType ?? ""),
  areaHa: Number(request.areaHa ?? 0),
  coverageStart: String(request.coverageStart ?? ""),
  coverageEnd: String(request.coverageEnd ?? ""),
  status: String(request.status ?? ""),
  createdAt: String(request.createdAt ?? ""),
  updatedAt: String(request.updatedAt ?? ""),
  latestQuote:
    request.latestQuote && typeof request.latestQuote === "object"
      ? {
          id: Number(request.latestQuote.id ?? 0),
          requestId: Number(request.latestQuote.requestId ?? 0),
          underwriterAddress: String(request.latestQuote.underwriterAddress ?? "system"),
          status: String(request.latestQuote.status ?? "open"),
          lockedAmountEth:
            request.latestQuote.lockedAmountEth === null
              ? null
              : Number(request.latestQuote.lockedAmountEth ?? 0),
          capitalLockTxHash:
            request.latestQuote.capitalLockTxHash === null
              ? null
              : String(request.latestQuote.capitalLockTxHash ?? ""),
          riskTier: String(request.latestQuote.riskTier ?? "low"),
          severeEvents90d: Number(request.latestQuote.severeEvents90d ?? 0),
          averageRiskScore: Number(request.latestQuote.averageRiskScore ?? 0),
          maxRiskScore: Number(request.latestQuote.maxRiskScore ?? 0),
          maxRain24h: Number(request.latestQuote.maxRain24h ?? 0),
          maxRain1h: Number(request.latestQuote.maxRain1h ?? 0),
          maxWindSpeed: Number(request.latestQuote.maxWindSpeed ?? 0),
          maxTemperature: Number(request.latestQuote.maxTemperature ?? 0),
          locationRiskMultiplier: Number(request.latestQuote.locationRiskMultiplier ?? 1),
          seasonMultiplier: Number(request.latestQuote.seasonMultiplier ?? 1),
          expectedRevenuePerHaEur: Number(request.latestQuote.expectedRevenuePerHaEur ?? 0),
          insuredAmountPerHaEur: Number(request.latestQuote.insuredAmountPerHaEur ?? 0),
          payoutCapEur: Number(request.latestQuote.payoutCapEur ?? 0),
          premiumRate: Number(request.latestQuote.premiumRate ?? 0),
          premiumAmountEur: Number(request.latestQuote.premiumAmountEur ?? 0),
          triggerThresholdScore: Number(request.latestQuote.triggerThresholdScore ?? 8),
          triggerEmergencyRain24h: Number(request.latestQuote.triggerEmergencyRain24h ?? 80),
          riskModelVersion: String(request.latestQuote.riskModelVersion ?? "unknown"),
          expiresAt: String(request.latestQuote.expiresAt ?? ""),
          breakdown:
            request.latestQuote.breakdown &&
            typeof request.latestQuote.breakdown === "object"
              ? request.latestQuote.breakdown
              : {},
          createdAt: String(request.latestQuote.createdAt ?? ""),
          updatedAt: String(request.latestQuote.updatedAt ?? ""),
        }
      : null,
  latestSettlement:
    request.latestSettlement && typeof request.latestSettlement === "object"
      ? {
          id: Number(request.latestSettlement.id ?? 0),
          quoteId: Number(request.latestSettlement.quoteId ?? 0),
          status: String(request.latestSettlement.status ?? "unknown"),
          underwriterAddress:
            request.latestSettlement.underwriterAddress === null
              ? null
              : String(request.latestSettlement.underwriterAddress ?? ""),
          premiumLockWei: String(request.latestSettlement.premiumLockWei ?? "0"),
          payoutCapWei: String(request.latestSettlement.payoutCapWei ?? "0"),
          ethEurRate: Number(request.latestSettlement.ethEurRate ?? 0),
          rateSource: String(request.latestSettlement.rateSource ?? "unknown"),
          rateFetchedAt: String(request.latestSettlement.rateFetchedAt ?? ""),
          expiresAt: String(request.latestSettlement.expiresAt ?? ""),
          termsTxHash:
            request.latestSettlement.termsTxHash === null
              ? null
              : String(request.latestSettlement.termsTxHash ?? ""),
          createdAt: String(request.latestSettlement.createdAt ?? ""),
          updatedAt: String(request.latestSettlement.updatedAt ?? ""),
        }
      : null,
  latestPremiumPayment:
    request.latestPremiumPayment && typeof request.latestPremiumPayment === "object"
      ? {
          id: Number(request.latestPremiumPayment.id ?? 0),
          requestId: Number(request.latestPremiumPayment.requestId ?? 0),
          quoteId: Number(request.latestPremiumPayment.quoteId ?? 0),
          payerAddress: String(request.latestPremiumPayment.payerAddress ?? ""),
          amountEur: Number(request.latestPremiumPayment.amountEur ?? 0),
          amountEth:
            request.latestPremiumPayment.amountEth === null
              ? null
              : Number(request.latestPremiumPayment.amountEth ?? 0),
          asset: String(request.latestPremiumPayment.asset ?? "EUR"),
          transactionHash:
            request.latestPremiumPayment.transactionHash === null
              ? null
              : String(request.latestPremiumPayment.transactionHash ?? ""),
          status: String(request.latestPremiumPayment.status ?? "recorded"),
          createdAt: String(request.latestPremiumPayment.createdAt ?? ""),
        }
      : null,
  latestReservation:
    request.latestReservation && typeof request.latestReservation === "object"
      ? {
          id: Number(request.latestReservation.id ?? 0),
          requestId: Number(request.latestReservation.requestId ?? 0),
          quoteId: Number(request.latestReservation.quoteId ?? 0),
          policyId:
            request.latestReservation.policyId === null
              ? null
              : Number(request.latestReservation.policyId ?? 0),
          reservedAmountEur: Number(request.latestReservation.reservedAmountEur ?? 0),
          reservedAmountEth:
            request.latestReservation.reservedAmountEth === null
              ? null
              : Number(request.latestReservation.reservedAmountEth ?? 0),
          status: String(request.latestReservation.status ?? "reserved"),
          createdAt: String(request.latestReservation.createdAt ?? ""),
          updatedAt: String(request.latestReservation.updatedAt ?? ""),
        }
      : null,
});

const extractSettlementTerms = (request: InsuranceRequest) => {
  const settlement = request.latestSettlement;
  const toEth = (value: string | undefined) => {
    try {
      return Number(ethers.formatEther(BigInt(value ?? "0")));
    } catch {
      return null;
    }
  };

  return {
    ethEurRate: settlement?.ethEurRate ?? null,
    capitalLockEth: toEth(settlement?.payoutCapWei),
    premiumLockEth: toEth(settlement?.premiumLockWei),
    fetchedAt: settlement?.rateFetchedAt ?? null,
    expiresAt: settlement?.expiresAt ?? null,
    rateSource: settlement?.rateSource ?? null,
  };
};

const extractRiskBreakdown = (request: InsuranceRequest) => {
  const risk =
    request.latestQuote?.breakdown &&
    typeof request.latestQuote.breakdown === "object" &&
    "risk" in request.latestQuote.breakdown &&
    request.latestQuote.breakdown.risk &&
    typeof request.latestQuote.breakdown.risk === "object"
      ? (request.latestQuote.breakdown.risk as Record<string, unknown>)
      : null;

  return {
    source: risk?.source,
    sampleCount:
      typeof risk?.sampleCount === "number" ? risk.sampleCount : null,
    warning: typeof risk?.warning === "string" ? risk.warning : null,
  };
};

const InsuranceInterface: React.FC<InsuranceInterfaceProps> = ({
  walletConnected,
  account,
  mode = "full",
}) => {
  const [farmerAddress, setFarmerAddress] = useState("");
  const [locationMode, setLocationMode] = useState<LocationMode>("coordinates");
  const [locationLabel, setLocationLabel] = useState("Ferma mea");
  const [latitude, setLatitude] = useState("45.7489");
  const [longitude, setLongitude] = useState("21.2087");
  const [locationGeoJson, setLocationGeoJson] = useState("");
  const [customLocationId, setCustomLocationId] = useState("");
  const [registeredLocations, setRegisteredLocations] = useState<InsuredLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [cropType, setCropType] = useState("wheat");
  const [areaHa, setAreaHa] = useState("");
  const [coverageDays, setCoverageDays] = useState("30");
  const [underwriterFundAmount, setUnderwriterFundAmount] = useState("1");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [isRequestingQuote, setIsRequestingQuote] = useState(false);
  const [isFundingUnderwriterCapital, setIsFundingUnderwriterCapital] = useState(false);
  const [isWithdrawingUnderwriterCapital, setIsWithdrawingUnderwriterCapital] = useState(false);
  const [lockingRequestId, setLockingRequestId] = useState<number | null>(null);
  const [lockingPremiumRequestId, setLockingPremiumRequestId] = useState<number | null>(null);
  const [releasingRequestId, setReleasingRequestId] = useState<number | null>(null);
  const [releasingPremiumRequestId, setReleasingPremiumRequestId] = useState<number | null>(null);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestLoadError, setRequestLoadError] = useState<string | null>(null);
  const [activeMarketplaceFilter, setActiveMarketplaceFilter] =
    useState<MarketplaceFilter>("all");
  const [selectedMarketplaceRequestId, setSelectedMarketplaceRequestId] = useState<number | null>(
    null
  );
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
  const [oracleAddress, setOracleAddress] = useState<string | null>(null);
  const [underwriterCapital, setUnderwriterCapital] = useState<{
    depositedEth: string;
    lockedEth: string;
    availableEth: string;
  } | null>(null);
  const [cropCatalog, setCropCatalog] = useState<CropReference[]>([]);
  const [insuranceRequests, setInsuranceRequests] = useState<InsuranceRequest[]>([]);

  const selectedLocation = useMemo(
    () =>
      registeredLocations.find((location) => location.locationId === selectedLocationId) ?? null,
    [registeredLocations, selectedLocationId]
  );

  const selectedCrop = useMemo(
    () => cropCatalog.find((crop) => crop.cropType === cropType) ?? null,
    [cropCatalog, cropType]
  );

  const areaHaValue = useMemo(() => {
    const parsed = Number(areaHa);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    if (
      selectedLocation?.areaHectares !== null &&
      selectedLocation?.areaHectares !== undefined &&
      selectedLocation.areaHectares > 0
    ) {
      return selectedLocation.areaHectares;
    }

    return null;
  }, [areaHa, selectedLocation]);

  const coverageDaysValue = useMemo(() => {
    const parsed = Number(coverageDays);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [coverageDays]);

  const expectedRevenuePerHa = useMemo(() => {
    if (!selectedCrop) {
      return null;
    }

    return selectedCrop.expectedYieldTHa * selectedCrop.referencePriceEurT;
  }, [selectedCrop]);

  const requestPreview = useMemo(() => {
    if (!selectedCrop || !areaHaValue || !expectedRevenuePerHa) {
      return null;
    }

    const expectedMarginPerHa = Math.max(
      0,
      expectedRevenuePerHa - selectedCrop.productionCostEurHa
    );
    const insuredAmountPerHa = Math.min(
      selectedCrop.productionCostEurHa * 0.85 + expectedMarginPerHa * 0.25,
      selectedCrop.productionCostEurHa * 1.15
    );
    const totalRevenue = expectedRevenuePerHa * areaHaValue;
    const totalCost = selectedCrop.productionCostEurHa * areaHaValue;
    const payoutBenchmark = insuredAmountPerHa * areaHaValue;
    const basePremiumBenchmark = payoutBenchmark * selectedCrop.basePremiumRate;

    return {
      insuredAmountPerHa,
      totalRevenue,
      totalCost,
      payoutBenchmark,
      basePremiumBenchmark,
    };
  }, [areaHaValue, expectedRevenuePerHa, selectedCrop]);

  const marketplaceRequests = useMemo(
    () => {
      const normalizedAccount =
        account && ethers.isAddress(account) ? account.toLowerCase() : null;

      return insuranceRequests.filter((request) => {
        if (["quoted", "awaiting_farmer_lock", "awaiting_underwriter"].includes(request.status)) {
          return true;
        }

        if (request.status !== "ready_for_activation" || !normalizedAccount) {
          return false;
        }

        const underwriterAddress = request.latestSettlement?.underwriterAddress;
        const isRequestFarmer = request.farmerAddress.toLowerCase() === normalizedAccount;
        const isRequestUnderwriter =
          !!underwriterAddress &&
          ethers.isAddress(underwriterAddress) &&
          underwriterAddress.toLowerCase() === normalizedAccount;

        return isRequestFarmer || isRequestUnderwriter;
      });
    },
    [account, insuranceRequests]
  );

  const filteredMarketplaceRequests = useMemo(() => {
    switch (activeMarketplaceFilter) {
      case "open":
        return marketplaceRequests.filter((request) =>
          ["quoted", "awaiting_farmer_lock"].includes(request.status)
        );
      case "locked":
        return marketplaceRequests.filter((request) => !!request.latestSettlement);
      case "ready":
        return marketplaceRequests.filter(
          (request) => request.status === "ready_for_activation"
        );
      case "severe":
        return marketplaceRequests.filter(
          (request) => request.latestQuote?.riskTier === "severe"
        );
      default:
        return marketplaceRequests;
    }
  }, [activeMarketplaceFilter, marketplaceRequests]);

  const selectedMarketplaceRequest = useMemo(
    () =>
      filteredMarketplaceRequests.find(
        (request) => request.id === selectedMarketplaceRequestId
      ) ?? filteredMarketplaceRequests[0] ?? null,
    [filteredMarketplaceRequests, selectedMarketplaceRequestId]
  );

  const pendingFarmerLockRequests = useMemo(() => {
    const activeFarmerAddress = account ?? farmerAddress;
    const normalizedFarmerAddress = ethers.isAddress(activeFarmerAddress)
      ? activeFarmerAddress.toLowerCase()
      : null;

    if (!normalizedFarmerAddress) {
      return [];
    }

    return insuranceRequests.filter((request) => {
      if (request.status !== "awaiting_farmer_lock") {
        return false;
      }

      return request.farmerAddress.toLowerCase() === normalizedFarmerAddress;
    });
  }, [account, farmerAddress, insuranceRequests]);

  const showCoverageForm = mode !== "marketplace";
  const showMarketplace = mode !== "request";

  const modeHeader = useMemo(() => {
    if (mode === "request") {
      return {
        title: "Request Coverage",
        description:
          "Configurezi parcela si obtii o oferta comerciala in EUR. Fondurile sunt blocate doar dupa pregatirea settlement-ului ETH.",
      };
    }

    if (mode === "marketplace") {
      return {
        title: "Marketplace & Capital",
        description:
          "Aici furnizorul selecteaza o oferta comerciala si pregateste settlement-ul ETH la cursul curent.",
      };
    }

    return {
        title: "Asigurari parametrice agricole",
        description:
          "Fluxul este request in EUR -> settlement ETH -> premium lock -> capital lock -> activare. Marketplace-ul listeaza ofertele comerciale, iar tab-ul Policies urmareste acoperirile activate.",
    };
  }, [mode]);

  const loadLocations = async () => {
    try {
      setIsLoadingLocations(true);
      const response = await fetch(`${BACKEND_BASE_URL}/location`);
      if (!response.ok) {
        throw new Error("Nu am putut incarca locatiile inregistrate.");
      }

      const payload = (await response.json()) as Array<Partial<InsuredLocation>>;
      const locations = payload.map(normalizeLocation);

      setRegisteredLocations(locations);
      setSelectedLocationId((current) =>
        locations.some((location) => location.locationId === current) ? current : ""
      );
    } catch (err) {
      console.warn("Unable to load registered locations", err);
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const loadCropCatalog = async () => {
    try {
      setIsLoadingCatalog(true);
      const response = await fetch(`${BACKEND_BASE_URL}/insurance-request/catalog`);
      if (!response.ok) {
        throw new Error("Nu am putut incarca catalogul de culturi.");
      }

      const payload = (await response.json()) as Array<Partial<CropReference>>;
      setCropCatalog(payload.map(normalizeCrop));
    } catch (err) {
      console.warn("Unable to load crop catalog", err);
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  const loadInsuranceRequests = useCallback(async () => {
    try {
      setIsLoadingRequests(true);
      setRequestLoadError(null);
      const query = account ? `?viewerAddress=${encodeURIComponent(account)}` : "";
      const response = await fetch(`${BACKEND_BASE_URL}/insurance-request${query}`);
      if (!response.ok) {
        throw new Error("Nu am putut incarca cererile de asigurare.");
      }

      const payload = (await response.json()) as Array<Partial<InsuranceRequest>>;
      setInsuranceRequests(payload.map(normalizeRequest));
    } catch (err) {
      console.warn("Unable to load insurance requests", err);
      setRequestLoadError(
        err instanceof Error ? err.message : "Nu am putut incarca cererile de asigurare."
      );
    } finally {
      setIsLoadingRequests(false);
    }
  }, [account]);

  useEffect(() => {
    if (!walletConnected) {
      setOwnerAddress(null);
      setOracleAddress(null);
      setUnderwriterCapital(null);
      return;
    }

    let isMounted = true;

    const loadAdminInfo = async () => {
      try {
        const { contract } = await getReadInsuranceContract();
        const capitalPromise = account
          ? contract.getUnderwriterCapitalAccount(account)
          : Promise.resolve([BigInt(0), BigInt(0), BigInt(0)] as const);
        const [owner, oracle, capital] = await Promise.all([
          contract.owner(),
          contract.oracle(),
          capitalPromise,
        ]);

        if (!isMounted) return;
        setOwnerAddress(owner);
        setOracleAddress(oracle);
        setUnderwriterCapital({
          depositedEth: ethers.formatEther(capital[0]),
          lockedEth: ethers.formatEther(capital[1]),
          availableEth: ethers.formatEther(capital[2]),
        });
      } catch (err) {
        console.warn("Unable to load insurance admin data", err);
      }
    };

    void loadAdminInfo();

    return () => {
      isMounted = false;
    };
  }, [walletConnected, account]);

  useEffect(() => {
    if (account) {
      setFarmerAddress(account);
    }
  }, [account]);

  useEffect(() => {
    void loadLocations();
    void loadCropCatalog();
  }, []);

  useEffect(() => {
    void loadInsuranceRequests();
  }, [loadInsuranceRequests, walletConnected]);

  useEffect(() => {
    if (cropCatalog.length === 0) {
      return;
    }

    setCropType((current) =>
      cropCatalog.some((crop) => crop.cropType === current) ? current : cropCatalog[0].cropType
    );
  }, [cropCatalog]);

  useEffect(() => {
    if (filteredMarketplaceRequests.length === 0) {
      setSelectedMarketplaceRequestId(null);
      return;
    }

    setSelectedMarketplaceRequestId((current) =>
      current !== null &&
      filteredMarketplaceRequests.some((request) => request.id === current)
        ? current
        : filteredMarketplaceRequests[0].id
    );
  }, [filteredMarketplaceRequests]);

  const buildCoverageWindow = () => {
    const durationDays = Number(coverageDays);
    if (Number.isNaN(durationDays) || durationDays <= 0) {
      throw new Error("Durata politei trebuie sa fie un numar pozitiv de zile.");
    }

    const startTime = new Date();
    const endTime = new Date(
      startTime.getTime() + Math.max(1, durationDays) * 24 * 60 * 60 * 1000
    );

    return {
      startTime,
      endTime,
    };
  };

  const buildLocationPayload = () => {
    const payload: Record<string, unknown> = {};

    if (locationMode === "existing") {
      if (!selectedLocationId) {
        throw new Error("Selecteaza o locatie existenta.");
      }

      payload.locationId = selectedLocationId;
      return payload;
    }

    if (locationMode === "geojson") {
      if (!locationLabel.trim()) {
        throw new Error("Completeaza un nume pentru parcela.");
      }

      let parsedGeoJson: unknown;
      try {
        parsedGeoJson = JSON.parse(locationGeoJson);
      } catch {
        throw new Error("GeoJSON-ul nu este valid JSON.");
      }

      payload.locationId = customLocationId.trim() || undefined;
      payload.locationLabel = locationLabel.trim();
      payload.locationGeoJson = parsedGeoJson;
      return payload;
    }

    const latitudeValue = Number(latitude);
    const longitudeValue = Number(longitude);

    if (Number.isNaN(latitudeValue) || latitudeValue < -90 || latitudeValue > 90) {
      throw new Error("Latitudinea trebuie sa fie intre -90 si 90.");
    }

    if (Number.isNaN(longitudeValue) || longitudeValue < -180 || longitudeValue > 180) {
      throw new Error("Longitudinea trebuie sa fie intre -180 si 180.");
    }

    if (!locationLabel.trim()) {
      throw new Error("Completeaza un nume pentru locatie.");
    }

    payload.locationId = customLocationId.trim() || undefined;
    payload.locationLabel = locationLabel.trim();
    payload.latitude = latitudeValue;
    payload.longitude = longitudeValue;

    return payload;
  };

  const performPremiumLock = async (requestId: number) => {
    if (!walletConnected || !account) {
      throw new Error("Conecteaza wallet-ul fermierului pentru a bloca premium-ul.");
    }

    const requestResponse = await fetch(buildInsuranceRequestDetailUrl(requestId, account));
    const requestPayload = (await requestResponse.json()) as Partial<InsuranceRequest> & {
      error?: string;
    };
    if (!requestResponse.ok) {
      throw new Error(requestPayload.error || "Nu am putut reincarca cererea curenta.");
    }

    const freshRequest = normalizeRequest(requestPayload);
    const premiumLockWei = freshRequest.latestSettlement?.premiumLockWei;
    if (!freshRequest.latestSettlement || !premiumLockWei || premiumLockWei === "0") {
      throw new Error(
        "Nu exista o sesiune de settlement activa pentru aceasta oferta."
      );
    }

    const parsedAmountWei = BigInt(premiumLockWei);

    const { contract } = await getInsuranceContract();
    const tx = await contract.lockPremiumForQuote(BigInt(freshRequest.latestSettlement.id), {
      value: parsedAmountWei,
      gasLimit: 180_000,
    });
    await tx.wait();

    const response = await fetch(
      `${BACKEND_BASE_URL}/insurance-request/${freshRequest.id}/lock-premium`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          payerAddress: account,
          asset: "ETH_ESCROW",
          transactionHash: tx.hash,
        }),
      }
    );

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "Blocarea premium-ului a esuat.");
    }

    return {
      txHash: tx.hash,
      lockedAmountEth: ethers.formatEther(parsedAmountWei),
      ethEurRate: freshRequest.latestSettlement.ethEurRate,
    };
  };

  const handleRequestQuote = async () => {
    if (!walletConnected || !account) {
      setStatus({
        type: "warning",
        message: "Conecteaza wallet-ul fermierului pentru a trimite cererea de asigurare.",
      });
      return;
    }

    if (!ethers.isAddress(farmerAddress)) {
      setStatus({
        type: "error",
        message: "Adresa fermierului trebuie sa fie valida.",
      });
      return;
    }

    if (farmerAddress.toLowerCase() !== account.toLowerCase()) {
      setStatus({
        type: "error",
        message: "Cererea poate fi creata doar de wallet-ul fermierului asigurat.",
      });
      return;
    }

    try {
      setIsRequestingQuote(true);
      setStatus({
        type: "success",
        message: "Se calculeaza oferta comerciala in EUR...",
      });

      const { startTime, endTime } = buildCoverageWindow();
      const parsedAreaHa = areaHa.trim() === "" ? undefined : Number(areaHa);

      if (parsedAreaHa !== undefined && (Number.isNaN(parsedAreaHa) || parsedAreaHa <= 0)) {
        throw new Error("Suprafata trebuie sa fie un numar pozitiv.");
      }

      const payload: Record<string, unknown> = {
        farmerAddress,
        cropType: cropType.trim().toLowerCase(),
        areaHa: parsedAreaHa,
        coverageStart: startTime.toISOString(),
        coverageEnd: endTime.toISOString(),
        ...buildLocationPayload(),
      };

      const response = await fetch(`${BACKEND_BASE_URL}/insurance-request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = (await response.json()) as {
        error?: string;
        request?: {
          id: number;
        };
        quote?: {
          id: number;
          payoutCapEur: number;
          premiumAmountEur: number;
          riskTier: string;
        };
      };

      if (!response.ok) {
        throw new Error(responsePayload.error || "Generarea ofertei a esuat.");
      }

      const payoutLabel = responsePayload.quote
        ? formatCurrency(Number(responsePayload.quote.payoutCapEur))
        : "n/a";
      const premiumLabel = responsePayload.quote
        ? formatCurrency(Number(responsePayload.quote.premiumAmountEur))
        : "n/a";
      const riskTierLabel = responsePayload.quote
        ? getRiskTierLabel(String(responsePayload.quote.riskTier))
        : "n/a";

      if (!responsePayload.request || !responsePayload.quote) {
        throw new Error("Backend-ul nu a intors request-ul si quote-ul create.");
      }

      setStatus({
        type: "success",
        message: `Oferta pentru cerere a fost listata in marketplace. Payout: ${payoutLabel}, prima: ${premiumLabel}, risc: ${riskTierLabel}. Oferta este exprimata in EUR; settlement-ul ETH va fi pregatit doar dupa selectarea unui furnizor de capital.`,
      });

      await Promise.all([loadLocations(), loadInsuranceRequests()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generarea ofertei a esuat.";
      setStatus({ type: "error", message });
    } finally {
      setIsRequestingQuote(false);
    }
  };

  const handlePrepareSettlement = async (request: InsuranceRequest) => {
    if (!walletConnected) {
      setStatus({ type: "warning", message: "Conecteaza wallet-ul pentru a pregati settlement-ul." });
      return;
    }

    try {
      setLockingRequestId(request.id);
      setStatus({ type: "success", message: "Se actualizeaza cursul ETH/EUR si se pregatesc termenii settlement-ului..." });

      const response = await fetch(
        `${BACKEND_BASE_URL}/insurance-request/${request.id}/prepare-settlement`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const payload = (await response.json()) as { error?: string; latestSettlement?: unknown };
      if (!response.ok) {
        throw new Error(payload.error || "Pregatirea settlement-ului a esuat.");
      }

      setStatus({
        type: "success",
        message: "Settlement-ul ETH a fost fixat temporar. Fermierul poate bloca premium-ul, apoi furnizorul poate bloca capitalul.",
      });
      await loadInsuranceRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pregatirea settlement-ului a esuat.";
      setStatus({ type: "error", message });
    } finally {
      setLockingRequestId(null);
    }
  };

  const handleFundUnderwriterCapital = async () => {
    if (!walletConnected) {
      setStatus({
        type: "warning",
        message: "Conecteaza portofelul pentru a depune capital de underwriting.",
      });
      return;
    }

    try {
      setIsFundingUnderwriterCapital(true);
      setStatus({ type: "success", message: "Se depune capitalul..." });

      const { contract } = await getInsuranceContract();
      const tx = await contract.fundUnderwriterCapital({
        value: ethers.parseEther(underwriterFundAmount),
        gasLimit: 150_000,
      });
      await tx.wait();

      const { contract: readContract } = await getReadInsuranceContract();
      const capital = account
        ? await readContract.getUnderwriterCapitalAccount(account)
        : [BigInt(0), BigInt(0), BigInt(0)];
      setUnderwriterCapital({
        depositedEth: ethers.formatEther(capital[0]),
        lockedEth: ethers.formatEther(capital[1]),
        availableEth: ethers.formatEther(capital[2]),
      });

      setStatus({
        type: "success",
        message: "Capitalul de underwriting a fost depus in contract.",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Depunerea capitalului a esuat.";
      setStatus({ type: "error", message });
    } finally {
      setIsFundingUnderwriterCapital(false);
    }
  };

  const handleWithdrawUnderwriterCapital = async () => {
    if (!walletConnected || !account) {
      setStatus({
        type: "warning",
        message: "Conecteaza portofelul pentru a retrage capitalul disponibil.",
      });
      return;
    }

    try {
      setIsWithdrawingUnderwriterCapital(true);
      setStatus({ type: "success", message: "Se retrage capitalul disponibil..." });

      const { contract } = await getInsuranceContract();
      const tx = await contract.withdrawUnderwriterCapital(
        ethers.parseEther(underwriterFundAmount),
        { gasLimit: 150_000 }
      );
      await tx.wait();

      const { contract: readContract } = await getReadInsuranceContract();
      const capital = await readContract.getUnderwriterCapitalAccount(account);
      setUnderwriterCapital({
        depositedEth: ethers.formatEther(capital[0]),
        lockedEth: ethers.formatEther(capital[1]),
        availableEth: ethers.formatEther(capital[2]),
      });

      setStatus({
        type: "success",
        message: "Capitalul disponibil a fost retras in wallet.",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Retragerea capitalului a esuat.";
      setStatus({ type: "error", message });
    } finally {
      setIsWithdrawingUnderwriterCapital(false);
    }
  };

  const handleLockCapital = async (request: InsuranceRequest) => {
    if (!walletConnected || !account) {
      setStatus({
        type: "warning",
        message: "Conecteaza portofelul pentru a bloca capital pentru oferta.",
      });
      return;
    }

    if (!request.latestQuote) {
      setStatus({ type: "error", message: "Cererea nu are o oferta activa." });
      return;
    }

    try {
      setLockingRequestId(request.id);
      setStatus({ type: "success", message: "Se blocheaza capitalul fixat în ofertă..." });

      const quoteResponse = await fetch(buildInsuranceRequestDetailUrl(request.id, account));
      const quotePayload = (await quoteResponse.json()) as Partial<InsuranceRequest> & {
        error?: string;
      };
      if (!quoteResponse.ok) {
        throw new Error(quotePayload.error || "Nu am putut reincarca cererea curenta.");
      }

      const freshRequest = normalizeRequest(quotePayload);
      if (
        !freshRequest.latestSettlement?.payoutCapWei ||
        freshRequest.latestSettlement.payoutCapWei === "0"
      ) {
        throw new Error(
          "Oferta nu contine capitalul fixat necesar pentru activare."
        );
      }

      const lockedAmountWei = BigInt(freshRequest.latestSettlement.payoutCapWei);
      const lockedAmountEth = ethers.formatEther(lockedAmountWei);

      const { contract } = await getInsuranceContract();
      const tx = await contract.lockCapitalForQuote(
        BigInt(freshRequest.latestSettlement.id),
        lockedAmountWei,
        { gasLimit: 200_000 }
      );
      await tx.wait();

      const response = await fetch(
        `${BACKEND_BASE_URL}/insurance-request/${freshRequest.id}/lock-capital`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            underwriterAddress: account,
            transactionHash: tx.hash,
          }),
        }
      );

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Persistarea lock-ului de capital a esuat.");
      }

      const { contract: readContract } = await getReadInsuranceContract();
      const capital = await readContract.getUnderwriterCapitalAccount(account);
      setUnderwriterCapital({
        depositedEth: ethers.formatEther(capital[0]),
        lockedEth: ethers.formatEther(capital[1]),
        availableEth: ethers.formatEther(capital[2]),
      });

      setStatus({
        type: "success",
        message: `Capitalul pentru cererea #${freshRequest.id} a fost blocat automat cu ${lockedAmountEth} ETH.`,
      });
      await loadInsuranceRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Blocarea capitalului a esuat.";
      setStatus({ type: "error", message });
    } finally {
      setLockingRequestId(null);
    }
  };

  const handleReleaseLockedCapital = async (request: InsuranceRequest) => {
    const settlement = request.latestSettlement;

    if (!walletConnected || !account || !settlement) {
      setStatus({
        type: "warning",
        message: "Conecteaza portofelul care a blocat capitalul pentru a-l elibera.",
      });
      return;
    }

    try {
      setReleasingRequestId(request.id);
      setStatus({ type: "success", message: "Se elibereaza capitalul blocat..." });

      const { contract } = await getInsuranceContract();
      const tx = await contract.releaseQuoteCapital(BigInt(settlement.id), {
        gasLimit: 180_000,
      });
      await tx.wait();

      const response = await fetch(
        `${BACKEND_BASE_URL}/insurance-request/${request.id}/release-capital`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            underwriterAddress: account,
          }),
        }
      );

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Persistarea release-ului a esuat.");
      }

      const { contract: readContract } = await getReadInsuranceContract();
      const capital = await readContract.getUnderwriterCapitalAccount(account);
      setUnderwriterCapital({
        depositedEth: ethers.formatEther(capital[0]),
        lockedEth: ethers.formatEther(capital[1]),
        availableEth: ethers.formatEther(capital[2]),
      });

      setStatus({
        type: "success",
        message: `Capitalul blocat pentru cererea #${request.id} a fost eliberat.`,
      });
      await loadInsuranceRequests();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Eliberarea capitalului a esuat.";
      setStatus({ type: "error", message });
    } finally {
      setReleasingRequestId(null);
    }
  };

  const handleLockPremium = async (request: InsuranceRequest) => {
    if (!walletConnected || !account || !request.latestSettlement) {
      setStatus({
        type: "warning",
        message: "Conecteaza wallet-ul fermierului pentru a bloca premium-ul.",
      });
      return;
    }

    try {
      setLockingPremiumRequestId(request.id);
      setStatus({
        type: "success",
        message: "Se calculeaza cursul live si se blocheaza premium-ul necesar...",
      });
      const premiumLockResult = await performPremiumLock(request.id);

      setStatus({
        type: "success",
        message: `Premium-ul pentru cererea #${request.id} a fost blocat automat cu ${premiumLockResult.lockedAmountEth} ETH${premiumLockResult.ethEurRate ? ` la ${premiumLockResult.ethEurRate} EUR/ETH` : ""}, iar cererea este acum listata economic.`,
      });
      await loadInsuranceRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Blocarea premium-ului a esuat.";
      setStatus({ type: "error", message });
    } finally {
      setLockingPremiumRequestId(null);
    }
  };

  const handleReleaseLockedPremium = async (request: InsuranceRequest) => {
    const settlement = request.latestSettlement;

    if (!walletConnected || !account || !settlement) {
      setStatus({
        type: "warning",
        message: "Conecteaza wallet-ul fermierului pentru a elibera premium-ul.",
      });
      return;
    }

    try {
      setReleasingPremiumRequestId(request.id);
      setStatus({ type: "success", message: "Se elibereaza premium-ul blocat..." });

      const { contract } = await getInsuranceContract();
      const tx = await contract.releasePremiumForQuote(BigInt(settlement.id), {
        gasLimit: 180_000,
      });
      await tx.wait();

      const response = await fetch(
        `${BACKEND_BASE_URL}/insurance-request/${request.id}/release-premium`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            payerAddress: account,
            transactionHash: tx.hash,
          }),
        }
      );

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Eliberarea premium-ului a esuat.");
      }

      setStatus({
        type: "success",
        message: `Premium-ul pentru cererea #${request.id} a fost eliberat.`,
      });
      await loadInsuranceRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Eliberarea premium-ului a esuat.";
      setStatus({ type: "error", message });
    } finally {
      setReleasingPremiumRequestId(null);
    }
  };

  const handleActivateFromQuote = async (request: InsuranceRequest) => {
    if (!walletConnected) {
      setStatus({
        type: "warning",
        message: "Conecteaza portofelul pentru activarea on-chain a politei.",
      });
      return;
    }

    try {
      setStatus({ type: "success", message: "Se activeaza polita din oferta..." });

      const response = await fetch(`${BACKEND_BASE_URL}/insurance-request/${request.id}/activate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const payload = (await response.json()) as {
        error?: string;
        contract?: { contractId: number };
      };
      if (!response.ok) {
        throw new Error(payload.error || "Activarea politei a esuat.");
      }

      setStatus({
        type: "success",
        message: `Cererea #${request.id} a fost activata on-chain${
          payload.contract ? ` ca polita #${payload.contract.contractId}` : ""
        }.`,
      });
      await loadInsuranceRequests();
      if (account) {
        const { contract: readContract } = await getReadInsuranceContract();
        const capital = await readContract.getUnderwriterCapitalAccount(account);
        setUnderwriterCapital({
          depositedEth: ethers.formatEther(capital[0]),
          lockedEth: ethers.formatEther(capital[1]),
          availableEth: ethers.formatEther(capital[2]),
        });
      }
      window.dispatchEvent(new CustomEvent("policies:refresh"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Activarea politei a esuat.";
      setStatus({ type: "error", message });
    }
  };

  const underwriterAvailableEth = Number(underwriterCapital?.availableEth ?? 0);

  const marketplaceSummary = useMemo(
    () => ({
      total: marketplaceRequests.length,
      open: marketplaceRequests.filter((request) =>
        ["quoted", "awaiting_farmer_lock"].includes(request.status)
      ).length,
      ready: marketplaceRequests.filter(
        (request) => request.status === "ready_for_activation"
      ).length,
      severe: marketplaceRequests.filter(
        (request) => request.latestQuote?.riskTier === "severe"
      ).length,
    }),
    [marketplaceRequests]
  );

  return (
    <div className="insurance-actions">
      <div className="panel-header">
        <h2>{modeHeader.title}</h2>
        <p>{modeHeader.description}</p>
      </div>

      {(ownerAddress || oracleAddress) && (
        <div className="insurance-meta">
          {ownerAddress ? <span>Owner: {shortAddress(ownerAddress)}</span> : null}
          {oracleAddress ? <span>Oracle: {shortAddress(oracleAddress)}</span> : null}
        </div>
      )}

      {status && (
        <p
          className={`status-message ${
            status.type === "success"
              ? "status-message--success"
              : status.type === "warning"
                ? "status-message--warning"
                : "status-message--error"
          }`}
        >
          {status.message}
        </p>
      )}

      {!walletConnected && (
        <p className="status-message status-message--warning">
          Conecteaza MetaMask pentru pasii on-chain. Cererea poate fi pregatita si cu o adresa
          completata manual, dar blocarea premium-ului, blocarea capitalului si activarea raman
          actiuni separate.
        </p>
      )}

      {showCoverageForm ? (
        <div className="admin-card">
          <h3>Cerere de acoperire</h3>
          <div className="coverage-layout">
            <div className="coverage-layout__main">
              <div className="coverage-section">
                <div className="coverage-section__header">
                  <h4>Solicitant</h4>
                  <p>Adresa care trimite cererea si primeste oferta.</p>
                </div>
                <div className="form-grid form-grid--insurance">
                  <label className="form-field">
                    <span>Adresa fermier</span>
                    <input
                      type="text"
                      value={farmerAddress}
                      onChange={(e) => setFarmerAddress(e.target.value)}
                      placeholder="0x..."
                    />
                  </label>
                </div>
              </div>

              <div className="coverage-section">
                <div className="coverage-section__header">
                  <h4>Locatie</h4>
                  <p>Definesti parcela prin coordonate, GeoJSON sau o locatie deja salvata.</p>
                </div>
                <div className="form-grid form-grid--insurance">
                  <label className="form-field">
                    <span>Mod locatie</span>
                    <select
                      value={locationMode}
                      onChange={(e) => setLocationMode(e.target.value as LocationMode)}
                    >
                      <option value="coordinates">Coordonate simple</option>
                      <option value="geojson">Parcela GeoJSON</option>
                      <option value="existing">Locatie existenta</option>
                    </select>
                  </label>

                  {locationMode === "existing" ? (
                    <>
                      <label className="form-field form-field--full">
                        <span>Locatie inregistrata</span>
                        <select
                          value={selectedLocationId}
                          onChange={(e) => setSelectedLocationId(e.target.value)}
                          disabled={isLoadingLocations}
                        >
                          <option value="">
                            {isLoadingLocations
                              ? "Se incarca locatiile..."
                              : "Selecteaza o locatie existenta"}
                          </option>
                          {registeredLocations.map((location) => (
                            <option key={location.locationId} value={location.locationId}>
                              {location.locationLabel} ({location.locationId})
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="form-field form-field--full">
                        <span>Detalii locatie</span>
                        <p className="field-hint">
                          {selectedLocation
                            ? `Centroid ${selectedLocation.latitude.toFixed(5)}, ${selectedLocation.longitude.toFixed(5)}${
                                selectedLocation.areaHectares !== null
                                  ? ` | suprafata salvata ~ ${selectedLocation.areaHectares.toFixed(2)} ha`
                                  : ""
                              } | sursa ${selectedLocation.sourceType}.`
                            : registeredLocations.length === 0
                            ? "Nu exista inca locatii inregistrate. Creeaza una din coordonate sau GeoJSON."
                            : "Alege o locatie deja salvata in backend."}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="form-field">
                        <span>Nume locatie</span>
                        <input
                          type="text"
                          value={locationLabel}
                          onChange={(e) => setLocationLabel(e.target.value)}
                          placeholder="Ferma din Timis"
                        />
                      </label>

                      <label className="form-field">
                        <span>Location ID custom</span>
                        <input
                          type="text"
                          value={customLocationId}
                          onChange={(e) => setCustomLocationId(e.target.value)}
                          placeholder="optional"
                        />
                      </label>

                      {locationMode === "coordinates" ? (
                        <>
                          <label className="form-field">
                            <span>Latitudine</span>
                            <input
                              type="number"
                              min="-90"
                              max="90"
                              step="0.0001"
                              value={latitude}
                              onChange={(e) => setLatitude(e.target.value)}
                              placeholder="45.7489"
                            />
                          </label>

                          <label className="form-field">
                            <span>Longitudine</span>
                            <input
                              type="number"
                              min="-180"
                              max="180"
                              step="0.0001"
                              value={longitude}
                              onChange={(e) => setLongitude(e.target.value)}
                              placeholder="21.2087"
                            />
                          </label>
                        </>
                      ) : (
                        <label className="form-field form-field--full">
                          <span>GeoJSON parcela</span>
                          <textarea
                            value={locationGeoJson}
                            onChange={(e) => setLocationGeoJson(e.target.value)}
                            placeholder={GEOJSON_PLACEHOLDER}
                          />
                          <p className="field-hint">
                            Accepta `Polygon`, `MultiPolygon` sau `Feature` cu geometrie poligonala.
                            Backend-ul extrage centroidul si, daca ai desenat parcela, poate deriva si
                            suprafata pentru underwriting.
                          </p>
                        </label>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="coverage-section">
                <div className="coverage-section__header">
                  <h4>Cultura si expunere</h4>
                  <p>Parametrii folositi la underwriting si la benchmark-ul economic.</p>
                </div>
                <div className="form-grid form-grid--insurance">
                  <label className="form-field">
                    <span>Tip cultura</span>
                    {cropCatalog.length > 0 ? (
                      <select value={cropType} onChange={(e) => setCropType(e.target.value)}>
                        {cropCatalog.map((crop) => (
                          <option key={crop.cropType} value={crop.cropType}>
                            {crop.displayName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={cropType}
                        onChange={(e) => setCropType(e.target.value)}
                        placeholder={isLoadingCatalog ? "Se incarca..." : "wheat"}
                      />
                    )}
                  </label>

                  <label className="form-field">
                    <span>Suprafata (ha)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={areaHa}
                      onChange={(e) => setAreaHa(e.target.value)}
                      placeholder={
                        selectedLocation?.areaHectares !== null &&
                        selectedLocation?.areaHectares !== undefined
                          ? `${selectedLocation.areaHectares.toFixed(2)}`
                          : "10"
                      }
                    />
                  </label>

                  <label className="form-field">
                    <span>Durata (zile)</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={coverageDays}
                      onChange={(e) => setCoverageDays(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="coverage-section">
                <div className="coverage-section__header">
                  <h4>Trigger si escrow farmer</h4>
                  <p>
                    Pragurile parametrice si sumele escrow sunt calculate de backend, fixate in
                    oferta si inregistrate in smart contract inainte de blocarea fondurilor.
                  </p>
                </div>
                <div className="form-grid form-grid--insurance">
                  <div className="form-field">
                    <span>Configurație parametrică</span>
                    <p className="field-hint">
                      Valoarea trigger-ului este determinată de cultură, sezon și risk tier; nu
                      poate fi modificată din interfață.
                    </p>
                  </div>
                  <div className="form-field">
                    <span>Premium lock initial</span>
                    <p className="field-hint">
                      Prima este convertită în ETH o singură dată la generarea ofertei. Suma
                      rezultată rămâne fixă până la expirarea ofertei.
                    </p>
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleRequestQuote}
                  disabled={isRequestingQuote}
                >
                  {isRequestingQuote
                    ? "Se listeaza cererea..."
                    : "Solicita oferta"}
                </button>
              </div>
            </div>

            <aside className="coverage-layout__aside">
              <div className="coverage-summary-card">
                <span className="coverage-summary-card__eyebrow">Rezumat cerere</span>
                <h4>{selectedCrop?.displayName ?? "Alege cultura"}</h4>
                <p>
                  {areaHaValue ? `${areaHaValue.toFixed(2)} ha` : "Suprafata nedefinita"}
                  {coverageDaysValue ? ` - ${coverageDaysValue} zile` : ""}
                </p>
                <div className="coverage-summary-list">
                  <div>
                    <span>Payout benchmark</span>
                    <strong>
                      {requestPreview
                        ? formatCurrency(requestPreview.payoutBenchmark)
                        : "se calculeaza dupa suprafata"}
                    </strong>
                  </div>
                  <div>
                    <span>Prima benchmark</span>
                    <strong>
                      {requestPreview
                        ? formatCurrency(requestPreview.basePremiumBenchmark)
                        : "in asteptare"}
                    </strong>
                  </div>
                  <div>
                    <span>Premium lock initial</span>
                    <strong>fixat automat în ofertă</strong>
                  </div>
                  <div>
                    <span>Locatie</span>
                    <strong>
                      {locationMode === "existing"
                        ? selectedLocation?.locationLabel || "Alege o locatie"
                        : locationLabel || "Defineste parcela"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="coverage-summary-card">
                <span className="coverage-summary-card__eyebrow">Benchmark agricol</span>
                {selectedCrop ? (
                  <>
                    <div className="coverage-summary-list">
                      <div>
                        <span>Randament</span>
                        <strong>{selectedCrop.expectedYieldTHa.toFixed(2)} t/ha</strong>
                      </div>
                      <div>
                        <span>Pret referinta</span>
                        <strong>{formatCurrency(selectedCrop.referencePriceEurT)}/t</strong>
                      </div>
                      <div>
                        <span>Cost productie</span>
                        <strong>{formatCurrency(selectedCrop.productionCostEurHa)}/ha</strong>
                      </div>
                      <div>
                        <span>Rata baza</span>
                        <strong>{formatPercent(selectedCrop.basePremiumRate)}</strong>
                      </div>
                    </div>
                    {requestPreview ? (
                      <div className="coverage-summary-note">
                        <strong>Expunere estimata</strong>
                        <p>
                          Venit teoretic: {formatCurrency(requestPreview.totalRevenue)} - cost de
                          productie: {formatCurrency(requestPreview.totalCost)} - acoperire/ha:{" "}
                          {formatCurrency(requestPreview.insuredAmountPerHa)}.
                        </p>
                      </div>
                    ) : (
                      <div className="coverage-summary-note">
                        <strong>Adauga suprafata</strong>
                        <p>Completeaza suprafata pentru a vedea o estimare economica de baza.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="field-hint">Catalogul de culturi se incarca din backend.</p>
                )}
              </div>

              <div className="coverage-summary-card">
                <span className="coverage-summary-card__eyebrow">Flux nou</span>
                <div className="coverage-summary-note">
                  <strong>1. Oferta comerciala este calculata</strong>
                  <p>
                    Cererea si valorile comerciale in EUR sunt publicate in marketplace pentru
                    evaluarea furnizorilor de capital.
                  </p>
                </div>
                <div className="coverage-summary-note">
                  <strong>2. Underwriter-ul pregateste settlement-ul ETH</strong>
                  <p>
                    Pentru oferta selectata sunt fixate temporar cursul ETH/EUR si sumele necesare
                    blocarii fondurilor.
                  </p>
                </div>
                <div className="coverage-summary-note">
                  <strong>3. Participantii blocheaza fondurile si activeaza</strong>
                  <p>
                    Fermierul blocheaza premium-ul, apoi underwriter-ul blocheaza capitalul. Dupa
                    ambele operatii, cererea devine gata de activare.
                  </p>
                </div>
              </div>
            </aside>
          </div>

          {pendingFarmerLockRequests.length > 0 ? (
            <div className="coverage-summary-card coverage-summary-card--full">
              <span className="coverage-summary-card__eyebrow">
                Settlement-uri ce asteapta premium lock
              </span>
              <div className="coverage-summary-note">
                <strong>Un furnizor a pregatit termenii ETH ai ofertei</strong>
                <p>
                  Cursul ETH/EUR si sumele in Wei sunt valabile temporar. Blocheaza premium-ul
                  doar daca doresti sa continui activarea politei.
                </p>
              </div>
              <div className="marketplace-list">
                {pendingFarmerLockRequests.map((request) => {
                  const draftSettlementTerms = extractSettlementTerms(request);
                  const quoteExpired =
                    !!draftSettlementTerms.expiresAt &&
                    new Date(draftSettlementTerms.expiresAt).getTime() <= Date.now();

                  return (
                    <article key={request.id} className="marketplace-card">
                      <div className="marketplace-card__header">
                        <div className="marketplace-card__title">
                          <span className="marketplace-card__eyebrow">Draft #{request.id}</span>
                          <h4>{request.locationLabel}</h4>
                          <p>
                            {request.cropType} - {request.areaHa.toFixed(2)} ha - fermier{" "}
                            {shortAddress(request.farmerAddress)}
                          </p>
                        </div>
                        <div className="marketplace-card__status">
                          <span
                            className={getRiskTierClassName(request.latestQuote?.riskTier ?? "low")}
                          >
                            {request.latestQuote
                              ? getRiskTierLabel(request.latestQuote.riskTier)
                              : "Fara scor"}
                          </span>
                          <strong>{getRequestStatusLabel(request.status)}</strong>
                        </div>
                      </div>

                      <div className="marketplace-card__metrics">
                        <div className="marketplace-metric">
                          <span>Payout cap</span>
                          <strong>
                            {request.latestQuote
                              ? formatCurrency(request.latestQuote.payoutCapEur)
                              : "n/a"}
                          </strong>
                        </div>
                        <div className="marketplace-metric">
                          <span>Prima benchmark</span>
                          <strong>
                            {request.latestQuote
                              ? formatCurrency(request.latestQuote.premiumAmountEur)
                              : "n/a"}
                          </strong>
                        </div>
                        <div className="marketplace-metric">
                          <span>Stare curenta</span>
                          <strong>{getRequestStatusLabel(request.status)}</strong>
                        </div>
                      </div>

                      <div className="marketplace-card__footer">
                        <div className="marketplace-card__footnotes">
                          <small>
                            Settlement expira la: {draftSettlementTerms.expiresAt
                              ? new Date(draftSettlementTerms.expiresAt).toLocaleString("ro-RO")
                              : "indisponibil"}
                          </small>
                          <small>
                            Premium fixat pentru settlement:{" "}
                            {draftSettlementTerms.premiumLockEth !== null
                              ? `${formatEth(draftSettlementTerms.premiumLockEth, 6)} la ${new Intl.NumberFormat(
                                  "ro-RO",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }
                                ).format(draftSettlementTerms.ethEurRate ?? 0)} EUR/ETH`
                              : "indisponibil"}
                          </small>
                        </div>
                        <div className="marketplace-card__actions">
                          <button
                            type="button"
                            className="tertiary-button"
                            onClick={() => void handleLockPremium(request)}
                            disabled={
                              lockingPremiumRequestId === request.id ||
                              draftSettlementTerms.premiumLockEth === null ||
                              quoteExpired
                            }
                          >
                            {lockingPremiumRequestId === request.id
                              ? "Se blocheaza..."
                              : "Blocheaza premium"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showMarketplace ? (
        <div className="admin-card">
          <h3>Capital underwriter</h3>
          <div className="form-grid">
          <div className="form-field form-field--full">
            <span>Situatie curenta</span>
            <p className="field-hint">
              {walletConnected && underwriterCapital
                ? `Depus: ${underwriterCapital.depositedEth} ETH | Blocat: ${underwriterCapital.lockedEth} ETH | Disponibil: ${underwriterCapital.availableEth} ETH`
                : "Conecteaza wallet-ul pentru a vedea capitalul disponibil pentru underwriting."}
            </p>
            <p className="field-hint">
              Capitalul se depune o data, apoi se aloca punctual pe fiecare cerere pe care alegi
              sa o sustii.
            </p>
          </div>
          <label className="form-field">
            <span>Depune capital (ETH)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={underwriterFundAmount}
              onChange={(e) => setUnderwriterFundAmount(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={handleFundUnderwriterCapital}
            disabled={isFundingUnderwriterCapital || !walletConnected}
          >
            {isFundingUnderwriterCapital ? "Se depune..." : "Depune capital"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleWithdrawUnderwriterCapital}
            disabled={isWithdrawingUnderwriterCapital || !walletConnected}
          >
            {isWithdrawingUnderwriterCapital ? "Se retrage..." : "Retrage disponibil"}
          </button>
          </div>
        </div>
      ) : null}

      {showMarketplace ? (
        <div className="admin-card">
          <div className="marketplace-board__header">
            <div>
              <h3>Marketplace</h3>
              <p className="field-hint">
                Cereri comerciale in EUR, settlement-uri ETH pregatite si cereri gata pentru capital lock.
              </p>
            </div>
            <div className="marketplace-board__summary">
              <div className="marketplace-board__summary-card">
                <span>Open requests</span>
                <strong>{marketplaceSummary.open}</strong>
              </div>
              <div className="marketplace-board__summary-card">
                <span>Ready</span>
                <strong>{marketplaceSummary.ready}</strong>
              </div>
              <div className="marketplace-board__summary-card">
                <span>Capital disponibil</span>
                <strong>{formatEth(underwriterAvailableEth, 4)}</strong>
              </div>
            </div>
          </div>

          <div className="marketplace-board__filters">
            {[
              { id: "all", label: "Toate", count: marketplaceSummary.total },
              { id: "open", label: "Open", count: marketplaceSummary.open },
              {
                id: "locked",
                label: "Settlement",
                count: marketplaceRequests.filter((request) => !!request.latestSettlement)
                  .length,
              },
              { id: "ready", label: "Ready", count: marketplaceSummary.ready },
              { id: "severe", label: "Severe", count: marketplaceSummary.severe },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`marketplace-filter ${
                  activeMarketplaceFilter === filter.id ? "marketplace-filter--active" : ""
                }`}
                onClick={() =>
                  setActiveMarketplaceFilter(filter.id as MarketplaceFilter)
                }
              >
                <span>{filter.label}</span>
                <strong>{filter.count}</strong>
              </button>
            ))}
          </div>

          {isLoadingRequests ? (
            <div className="skeleton">Se incarca cererile de underwriting...</div>
          ) : requestLoadError ? (
            <div className="empty-state">
              <h3>Nu am putut incarca marketplace-ul</h3>
              <p>{requestLoadError}</p>
            </div>
          ) : marketplaceRequests.length === 0 ? (
            <div className="empty-state">
              <h3>Nu exista cereri</h3>
              <p>
                Inca nu exista cereri comerciale listate. Trimite o cerere pentru a porni fluxul EUR catre settlement ETH.
              </p>
            </div>
          ) : filteredMarketplaceRequests.length === 0 ? (
            <div className="empty-state">
              <h3>Filtrul selectat nu are rezultate</h3>
              <p>Schimba filtrul pentru a vedea alte cereri listate.</p>
            </div>
          ) : (
            <div className="marketplace-board">
              <div className="marketplace-board__list">
                {filteredMarketplaceRequests.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    className={`marketplace-row-card ${
                      selectedMarketplaceRequest?.id === request.id
                        ? "marketplace-row-card--active"
                        : ""
                    }`}
                    onClick={() => setSelectedMarketplaceRequestId(request.id)}
                  >
                    <div className="marketplace-row-card__top">
                      <div>
                        <span className="marketplace-card__eyebrow">Cerere #{request.id}</span>
                        <h4>{request.locationLabel}</h4>
                        <p>
                          {request.cropType} · {request.areaHa.toFixed(2)} ha · fermier{" "}
                          {shortAddress(request.farmerAddress)}
                        </p>
                      </div>
                      <div className="marketplace-row-card__status">
                        <span
                          className={getRiskTierClassName(
                            request.latestQuote?.riskTier ?? "low"
                          )}
                        >
                          {request.latestQuote
                            ? getRiskTierLabel(request.latestQuote.riskTier)
                            : "Fara scor"}
                        </span>
                        <strong>{getRequestStatusLabel(request.status)}</strong>
                      </div>
                    </div>

                    <div className="marketplace-row-card__metrics">
                      <div>
                        <span>Payout</span>
                        <strong>
                          {request.latestQuote
                            ? formatCurrency(request.latestQuote.payoutCapEur)
                            : "n/a"}
                        </strong>
                      </div>
                      <div>
                        <span>Prima</span>
                        <strong>
                          {request.latestQuote
                            ? formatCurrency(request.latestQuote.premiumAmountEur)
                            : "n/a"}
                        </strong>
                      </div>
                      <div>
                        <span>Stare settlement</span>
                        <strong>{request.latestSettlement?.status ?? "nepregatit"}</strong>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="marketplace-board__detail">
                {selectedMarketplaceRequest ? (() => {
                  const request = selectedMarketplaceRequest;
                  const riskBreakdown = extractRiskBreakdown(request);
                  const settlementTerms = extractSettlementTerms(request);
                  const hasSufficientCapital =
                    settlementTerms.capitalLockEth !== null &&
                    underwriterAvailableEth >= settlementTerms.capitalLockEth;
                  const settlementExpired =
                    request.latestSettlement?.status === "prepared" &&
                    !!settlementTerms.expiresAt &&
                    new Date(settlementTerms.expiresAt).getTime() <= Date.now();
                  const commercialQuoteExpired =
                    !!request.latestQuote?.expiresAt &&
                    new Date(request.latestQuote.expiresAt).getTime() <= Date.now();
                  const isFarmer =
                    !!account &&
                    request.farmerAddress.toLowerCase() === account.toLowerCase();
                  const isUnderwriter =
                    !!account &&
                    !!request.latestSettlement?.underwriterAddress &&
                    ethers.isAddress(request.latestSettlement.underwriterAddress) &&
                    request.latestSettlement.underwriterAddress.toLowerCase() ===
                      account.toLowerCase();

                  return (
                    <div className="marketplace-detail-panel">
                      <div className="marketplace-detail-panel__header">
                        <div>
                          <span className="marketplace-card__eyebrow">Detaliu cerere</span>
                          <h4>{request.locationLabel}</h4>
                          <p>
                            {request.cropType} · {request.areaHa.toFixed(2)} ha · fermier{" "}
                            {shortAddress(request.farmerAddress)}
                          </p>
                        </div>
                        <div className="marketplace-row-card__status">
                          <span
                            className={getRiskTierClassName(
                              request.latestQuote?.riskTier ?? "low"
                            )}
                          >
                            {request.latestQuote
                              ? getRiskTierLabel(request.latestQuote.riskTier)
                              : "Fara scor"}
                          </span>
                          <strong>{getRequestStatusLabel(request.status)}</strong>
                        </div>
                      </div>

                      <div className="marketplace-card__metrics">
                        <div className="marketplace-metric">
                          <span>Payout cap</span>
                          <strong>
                            {request.latestQuote
                              ? formatCurrency(request.latestQuote.payoutCapEur)
                              : "n/a"}
                          </strong>
                        </div>
                        <div className="marketplace-metric">
                          <span>Prima</span>
                          <strong>
                            {request.latestQuote
                              ? formatCurrency(request.latestQuote.premiumAmountEur)
                              : "n/a"}
                          </strong>
                        </div>
                        <div className="marketplace-metric">
                          <span>Rata tehnica</span>
                          <strong>
                            {request.latestQuote
                              ? formatPercent(request.latestQuote.premiumRate)
                              : "n/a"}
                          </strong>
                        </div>
                        <div className="marketplace-metric">
                          <span>Evenimente severe</span>
                          <strong>{request.latestQuote?.severeEvents90d ?? 0}</strong>
                        </div>
                      </div>

                      <div className="marketplace-card__detail-grid">
                        <div className="marketplace-detail">
                          <span>Istoric folosit</span>
                          <strong>{getHistorySourceLabel(riskBreakdown.source)}</strong>
                          <small>
                            {riskBreakdown.sampleCount !== null
                              ? `${riskBreakdown.sampleCount} puncte`
                              : "fara puncte locale"}
                          </small>
                        </div>
                        <div className="marketplace-detail">
                          <span>Max rain 24h</span>
                          <strong>{request.latestQuote?.maxRain24h ?? 0} mm</strong>
                          <small>in fereastra analizata</small>
                        </div>
                        <div className="marketplace-detail">
                          <span>Max vant</span>
                          <strong>{request.latestQuote?.maxWindSpeed ?? 0} m/s</strong>
                          <small>peak istoric relevant</small>
                        </div>
                        <div className="marketplace-detail">
                          <span>Max temperatura</span>
                          <strong>{request.latestQuote?.maxTemperature ?? 0} C</strong>
                          <small>peak istoric relevant</small>
                        </div>
                        <div className="marketplace-detail">
                          <span>Curs ETH/EUR pentru settlement</span>
                          <strong>
                            {settlementTerms.ethEurRate !== null
                              ? `${new Intl.NumberFormat("ro-RO", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }).format(settlementTerms.ethEurRate)} EUR`
                              : "se calculeaza la settlement"}
                          </strong>
                          <small>
                            {settlementTerms.fetchedAt
                              ? `fixat la ${new Date(
                                  settlementTerms.fetchedAt
                                ).toLocaleTimeString("ro-RO")}`
                              : "oferta comerciala ramane in EUR"}
                          </small>
                        </div>
                        <div className="marketplace-detail">
                          <span>Capital necesar</span>
                          <strong>
                            {settlementTerms.capitalLockEth !== null
                              ? formatEth(settlementTerms.capitalLockEth, 6)
                              : "indisponibil"}
                          </strong>
                          <small>fixat doar in sesiunea de settlement</small>
                        </div>
                        <div className="marketplace-detail">
                          <span>Trigger score</span>
                          <strong>{request.latestQuote?.triggerThresholdScore ?? "n/a"}</strong>
                          <small>configuratie calculata automat</small>
                        </div>
                        <div className="marketplace-detail">
                          <span>Prag ploaie 24h</span>
                          <strong>
                            {request.latestQuote?.triggerEmergencyRain24h ?? "n/a"} mm
                          </strong>
                          <small>{request.latestQuote?.riskModelVersion ?? "model indisponibil"}</small>
                        </div>
                      </div>

                      {riskBreakdown.warning ? (
                        <p className="marketplace-card__warning">{riskBreakdown.warning}</p>
                      ) : null}

                      {request.status === "awaiting_underwriter" &&
                      settlementTerms.capitalLockEth !== null &&
                      !hasSufficientCapital ? (
                        <p className="marketplace-card__warning">
                          Capital disponibil insuficient. Sunt necesari{" "}
                          {formatEth(settlementTerms.capitalLockEth, 6)}, iar wallet-ul are disponibil{" "}
                          {formatEth(underwriterAvailableEth, 6)}.
                        </p>
                      ) : null}

                      {commercialQuoteExpired ? (
                        <p className="marketplace-card__warning">
                          Oferta comerciala in EUR a expirat. Pentru continuare trebuie generata o oferta noua.
                        </p>
                      ) : null}

                      {!commercialQuoteExpired && settlementExpired ? (
                        <p className="marketplace-card__warning">
                          Settlement-ul ETH a expirat. Se poate pregati unul nou la cursul curent.
                        </p>
                      ) : null}

                      <div className="marketplace-card__footnotes">
                        {request.latestPremiumPayment?.status === "locked" ? (
                          <small>
                            Premium farmer lock:{" "}
                            {request.latestPremiumPayment.amountEth !== null
                              ? `${request.latestPremiumPayment.amountEth.toFixed(4)} ETH`
                              : formatCurrency(request.latestPremiumPayment.amountEur)}
                          </small>
                        ) : null}
                        {request.latestSettlement?.underwriterAddress ? (
                          <small>
                            Underwriter: {shortAddress(request.latestSettlement.underwriterAddress)}
                            {request.latestReservation?.reservedAmountEth !== null &&
                            request.latestReservation?.reservedAmountEth !== undefined
                              ? ` - lock ${request.latestReservation.reservedAmountEth.toFixed(4)} ETH`
                              : ""}
                          </small>
                        ) : null}
                        {request.latestReservation ? (
                          <small>
                            Rezerva: {formatCurrency(request.latestReservation.reservedAmountEur)}
                            {request.latestReservation.reservedAmountEth !== null
                              ? ` - ${request.latestReservation.reservedAmountEth.toFixed(4)} ETH`
                              : ""}
                          </small>
                        ) : null}
                      </div>

                      <div className="marketplace-card__actions marketplace-card__actions--split">
                        <div className="marketplace-card__actions-group">
                          {request.status === "quoted" && !commercialQuoteExpired ? (
                            <button
                              type="button"
                              className="tertiary-button"
                              onClick={() => void handlePrepareSettlement(request)}
                              disabled={lockingRequestId === request.id}
                            >
                              {lockingRequestId === request.id
                                ? "Se pregateste..."
                              : "Pregateste settlement ETH"}
                            </button>
                          ) : null}

                          {request.status === "awaiting_farmer_lock" &&
                          settlementExpired &&
                          !commercialQuoteExpired &&
                          request.latestSettlement?.status === "prepared" ? (
                            <button
                              type="button"
                              className="tertiary-button"
                              onClick={() => void handlePrepareSettlement(request)}
                              disabled={lockingRequestId === request.id}
                            >
                              {lockingRequestId === request.id
                                ? "Se recalculeaza..."
                                : "Recalculeaza settlement ETH"}
                            </button>
                          ) : null}

                          {request.status === "awaiting_farmer_lock" &&
                          isFarmer &&
                          settlementTerms.premiumLockEth !== null &&
                          !settlementExpired ? (
                            <button
                              type="button"
                              className="tertiary-button"
                              onClick={() => void handleLockPremium(request)}
                              disabled={lockingPremiumRequestId === request.id}
                            >
                              {lockingPremiumRequestId === request.id
                                ? "Se blocheaza..."
                                : "Blocheaza premium fermier"}
                            </button>
                          ) : null}

                          {request.status === "awaiting_underwriter" &&
                          settlementTerms.capitalLockEth !== null &&
                          !settlementExpired ? (
                            <button
                              type="button"
                              className="tertiary-button"
                              onClick={() => void handleLockCapital(request)}
                              disabled={
                                lockingRequestId === request.id || !hasSufficientCapital
                              }
                            >
                              {lockingRequestId === request.id
                                ? "Se blocheaza..."
                                : "Blocheaza capital underwriter"}
                            </button>
                          ) : null}

                          {request.status === "ready_for_activation" ? (
                            <button
                              type="button"
                              className="primary-button primary-button--compact"
                              onClick={() => void handleActivateFromQuote(request)}
                              disabled={settlementExpired}
                            >
                              Activeaza din lock
                            </button>
                          ) : null}
                        </div>

                        <div className="marketplace-card__actions-group">
                          {request.latestPremiumPayment?.status === "locked" && isFarmer ? (
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => void handleReleaseLockedPremium(request)}
                              disabled={releasingPremiumRequestId === request.id}
                            >
                              {releasingPremiumRequestId === request.id
                                ? "Se elibereaza..."
                                : "Elibereaza premium"}
                            </button>
                          ) : null}

                          {request.latestSettlement?.underwriterAddress && isUnderwriter ? (
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => void handleReleaseLockedCapital(request)}
                              disabled={releasingRequestId === request.id}
                            >
                              {releasingRequestId === request.id
                                ? "Se elibereaza..."
                                : "Elibereaza lock"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })() : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

    </div>
  );
};

export default InsuranceInterface;
