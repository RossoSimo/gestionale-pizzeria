import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, RefreshCw } from "lucide-react";
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { updateCustomerCoordinates } from "../../services/ipc/customers.ipc";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const GOOGLE_MAP_LIBRARIES = [];

const PIZZERIA_INFO = {
  name: "Chicco Di Grano",
  address: "Via Moglianese Gardigiano, 88, 30037 Scorze VE",
  coordinates: [45.56342494521013, 12.195147305987874],
};

const PIN_ICON_URLS = {
  pizzeria: "https://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png",
  delivery: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
  selected: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
};

const DELIVERY_AREAS = ["Scorze", "Martellago", "Salzano", "Mogliano Veneto", "Zero Branco"];
const DELIVERY_LOCALITY_HINTS = ["Scorze", "Peseggia", "Gardigiano", "Martellago", "Salzano", "Mogliano Veneto", "Zero Branco"];
const DELIVERY_LOCALITY_ALIAS_TO_COMUNE = {
  peseggia: "scorze",
  gardigiano: "scorze",
};
const DEFAULT_PREFERRED_MUNICIPALITY = "scorze";
const GEOCODER_BOUNDS_DELTA = {
  lat: 0.2,
  lng: 0.25,
};
const MAX_DELIVERY_DISTANCE_METERS = 50000;
const MUNICIPALITY_FALLBACK_DISTANCE_METERS = 18000;

function normalizeAddress(value) {
  return String(value ?? "").trim();
}

function buildAddressKey(value) {
  return normalizeAddress(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeHouseNumber(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^0-9a-z]/g, "");
}

function normalizeMunicipality(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHouseNumberFromInput(addressText) {
  const source = String(addressText ?? "");
  const match = source.match(/\b\d+[\/]?[a-z]?\b/i);
  return match ? normalizeHouseNumber(match[0]) : "";
}

function buildGoogleBoundsLiteral(centerCoordinates) {
  const [lat, lng] = centerCoordinates;
  const west = lng - GEOCODER_BOUNDS_DELTA.lng;
  const east = lng + GEOCODER_BOUNDS_DELTA.lng;
  const north = lat + GEOCODER_BOUNDS_DELTA.lat;
  const south = lat - GEOCODER_BOUNDS_DELTA.lat;

  return {
    south,
    west,
    north,
    east,
  };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(fromCoordinates, toCoordinates) {
  if (!Array.isArray(fromCoordinates) || !Array.isArray(toCoordinates)) {
    return Number.POSITIVE_INFINITY;
  }

  const [fromLat, fromLng] = fromCoordinates;
  const [toLat, toLng] = toCoordinates;

  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function getAddressComponentLongName(entry, componentTypeList) {
  const components = Array.isArray(entry?.address_components) ? entry.address_components : [];

  for (const component of components) {
    const types = Array.isArray(component?.types) ? component.types : [];

    if (componentTypeList.some((type) => types.includes(type))) {
      return String(component?.long_name ?? "").trim();
    }
  }

  return "";
}

function extractMunicipalityFromGoogle(entry) {
  return (
    getAddressComponentLongName(entry, [
      "locality",
      "administrative_area_level_3",
      "administrative_area_level_2",
    ]) || ""
  );
}

function extractLocalityFromGoogle(entry) {
  return (
    getAddressComponentLongName(entry, [
      "sublocality",
      "sublocality_level_1",
      "neighborhood",
    ]) || ""
  );
}

function computeCandidatePrecisionRank(entry, requestedHouseNumber) {
  const entryHouseNumber = normalizeHouseNumber(getAddressComponentLongName(entry, ["street_number"]));
  const hasRequestedHouseNumber = Boolean(
    requestedHouseNumber && entryHouseNumber && entryHouseNumber === requestedHouseNumber
  );

  if (hasRequestedHouseNumber) {
    return 0;
  }

  if (entryHouseNumber) {
    return 1;
  }

  const locationType = String(entry?.geometry?.location_type ?? "").toUpperCase();

  if (locationType === "ROOFTOP" || locationType === "RANGE_INTERPOLATED") {
    return 2;
  }

  return 3;
}

function createGoogleBounds() {
  if (typeof window === "undefined" || !window.google?.maps) {
    return null;
  }

  const bounds = buildGoogleBoundsLiteral(PIZZERIA_INFO.coordinates);
  return new window.google.maps.LatLngBounds(
    { lat: bounds.south, lng: bounds.west },
    { lat: bounds.north, lng: bounds.east }
  );
}

function geocodeWithGoogle(geocoder, queryValue, signal) {
  return new Promise((resolve, reject) => {
    geocoder.geocode(
      {
        address: queryValue,
        region: "IT",
        componentRestrictions: {
          country: "IT",
        },
        bounds: createGoogleBounds() ?? undefined,
      },
      (results, status) => {
        if (signal?.aborted) {
          resolve([]);
          return;
        }

        if (status === "OK") {
          resolve(Array.isArray(results) ? results : []);
          return;
        }

        if (status === "ZERO_RESULTS") {
          resolve([]);
          return;
        }

        reject(new Error("Geocoding Google non disponibile"));
      }
    );
  });
}

function buildGeocodingQueries(baseAddress) {
  const queries = [
    `${baseAddress}, Veneto, Italia`,
    ...DELIVERY_LOCALITY_HINTS.map((hint) => `${baseAddress}, ${hint}, Veneto, Italia`),
  ];

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)));
}

function resolvePreferredMunicipalityFromAddress(addressValue) {
  const normalizedAddress = normalizeMunicipality(addressValue);
  const allowedMunicipalities = DELIVERY_AREAS.map((area) => normalizeMunicipality(area));

  for (const municipality of allowedMunicipalities) {
    if (municipality && normalizedAddress.includes(municipality)) {
      return municipality;
    }
  }

  for (const [alias, comune] of Object.entries(DELIVERY_LOCALITY_ALIAS_TO_COMUNE)) {
    if (normalizedAddress.includes(alias)) {
      return comune;
    }
  }

  return DEFAULT_PREFERRED_MUNICIPALITY;
}

function toLatLngLiteral(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return null;
  }

  const [lat, lng] = coordinates;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function normalizeCoordinates(lat, lng) {
  const normalizedLat = Number(lat);
  const normalizedLng = Number(lng);

  if (!Number.isFinite(normalizedLat) || !Number.isFinite(normalizedLng)) {
    return null;
  }

  return [normalizedLat, normalizedLng];
}

function isWithinDeliveryArea(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return false;
  }

  return distanceInMeters(PIZZERIA_INFO.coordinates, coordinates) <= MAX_DELIVERY_DISTANCE_METERS;
}

function normalizeCoordinatesInArea(lat, lng) {
  const coordinates = normalizeCoordinates(lat, lng);

  if (!coordinates) {
    return null;
  }

  return isWithinDeliveryArea(coordinates) ? coordinates : null;
}

async function geocodeAddressCoordinates(addressValue, signal) {
  const normalizedAddress = normalizeAddress(addressValue);

  if (!normalizedAddress) {
    throw new Error("Indirizzo mancante");
  }

  if (typeof window === "undefined" || !window.google?.maps?.Geocoder) {
    throw new Error("Google Maps non pronto per il geocoding");
  }

  const allowedMunicipalityList = DELIVERY_AREAS.map((area) => normalizeMunicipality(area));
  const allowedMunicipalitySet = new Set(allowedMunicipalityList);
  const preferredMunicipality = resolvePreferredMunicipalityFromAddress(normalizedAddress);
  const requestedHouseNumber = extractHouseNumberFromInput(normalizedAddress);
  const queryCandidates = buildGeocodingQueries(normalizedAddress);
  const geocoder = new window.google.maps.Geocoder();

  const responses = await Promise.all(
    queryCandidates.map(async (queryValue) => {
      return geocodeWithGoogle(geocoder, queryValue, signal);
    })
  );

  const rawEntries = responses.flat();
  const seenKeys = new Set();
  const candidates = rawEntries
    .map((entry) => {
      const lat = Number(entry?.geometry?.location?.lat?.());
      const lng = Number(entry?.geometry?.location?.lng?.());

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      const municipality = extractMunicipalityFromGoogle(entry);
      const municipalityNormalized = normalizeMunicipality(municipality);
      const locality = extractLocalityFromGoogle(entry);
      const localityNormalized = normalizeMunicipality(locality);
      const localityComuneAlias = DELIVERY_LOCALITY_ALIAS_TO_COMUNE[localityNormalized] ?? "";
      const displayNameNormalized = normalizeMunicipality(entry?.formatted_address);
      const distanceMeters = distanceInMeters(PIZZERIA_INFO.coordinates, [lat, lng]);

      const inAllowedMunicipality =
        (municipalityNormalized && allowedMunicipalitySet.has(municipalityNormalized)) ||
        (localityNormalized && allowedMunicipalitySet.has(localityNormalized)) ||
        (localityComuneAlias && allowedMunicipalitySet.has(localityComuneAlias)) ||
        allowedMunicipalityList.some((area) => displayNameNormalized.includes(area));
      const inNearbyFallbackArea = distanceMeters <= MUNICIPALITY_FALLBACK_DISTANCE_METERS;

      const inPreferredMunicipality =
        (municipalityNormalized && municipalityNormalized === preferredMunicipality) ||
        (localityNormalized && localityNormalized === preferredMunicipality) ||
        (localityComuneAlias && localityComuneAlias === preferredMunicipality) ||
        displayNameNormalized.includes(preferredMunicipality);

      if (!inAllowedMunicipality && !inNearbyFallbackArea) {
        return null;
      }

      const key = `${lat.toFixed(6)}:${lng.toFixed(6)}`;

      if (seenKeys.has(key)) {
        return null;
      }

      seenKeys.add(key);

      return {
        lat,
        lng,
        precisionRank: computeCandidatePrecisionRank(entry, requestedHouseNumber),
        inPreferredMunicipality,
        distanceMeters,
      };
    })
    .filter((candidate) => candidate && candidate.distanceMeters <= MAX_DELIVERY_DISTANCE_METERS);

  const preferredCandidates = candidates.filter((candidate) => candidate.inPreferredMunicipality);
  const rankingPool = preferredCandidates.length > 0 ? preferredCandidates : candidates;

  rankingPool.sort((a, b) => {
      if (a.precisionRank !== b.precisionRank) {
        return a.precisionRank - b.precisionRank;
      }

      return a.distanceMeters - b.distanceMeters;
    });

  const match = rankingPool[0] ?? null;
  const lat = Number(match?.lat);
  const lng = Number(match?.lng);
  const precisionRank = Number(match?.precisionRank ?? 3);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Consegna fuori zona. Comuni serviti: ${DELIVERY_AREAS.join(", ")}`);
  }

  return {
    coordinates: [lat, lng],
    isApproximate: precisionRank >= 3,
  };
}

export default function CustomerAddressMap({
  customerName,
  customerId,
  customerGeoLat,
  customerGeoLng,
  address,
  deliveryStops = [],
  selectedTimeSlot = "",
}) {
  const [reloadToken, setReloadToken] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activePopupId, setActivePopupId] = useState("");
  const [geoState, setGeoState] = useState({
    status: "idle",
    markers: [],
    unresolvedCount: 0,
    approximateCount: 0,
    error: "",
  });
  const mapRef = useRef(null);

  const { isLoaded: isGoogleMapsLoaded, loadError: googleMapsLoadError } = useJsApiLoader({
    id: "customer-address-google-map",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || "MISSING_GOOGLE_MAPS_API_KEY",
    libraries: GOOGLE_MAP_LIBRARIES,
  });

  const normalizedAddress = useMemo(() => normalizeAddress(address), [address]);
  const selectedAddressKey = useMemo(() => buildAddressKey(normalizedAddress), [normalizedAddress]);
  const selectedCustomerCoordinates = useMemo(
    () => normalizeCoordinatesInArea(customerGeoLat, customerGeoLng),
    [customerGeoLat, customerGeoLng]
  );

  const deliveryStopGroups = useMemo(() => {
    const groupedByAddress = new Map();

    for (const stop of deliveryStops ?? []) {
      const stopAddress = normalizeAddress(stop?.address);

      if (!stopAddress) {
        continue;
      }

      const addressKey = buildAddressKey(stopAddress);
      const stopCoordinates = normalizeCoordinatesInArea(stop?.geoLat, stop?.geoLng);

      if (!groupedByAddress.has(addressKey)) {
        groupedByAddress.set(addressKey, {
          id: addressKey,
          address: stopAddress,
          isSelected: selectedAddressKey && selectedAddressKey === addressKey,
          cachedCoordinates: stopCoordinates,
          entries: [],
        });
      }

      const group = groupedByAddress.get(addressKey);

      if (!group.cachedCoordinates && stopCoordinates) {
        group.cachedCoordinates = stopCoordinates;
      }

      group.entries.push({
        id: stop.id ?? `${addressKey}-${group.entries.length}`,
        customerId: stop.customerId ?? "",
        customerName: normalizeAddress(stop.customerName) || "Cliente",
        dailyNumber: Number.isFinite(Number(stop.dailyNumber)) ? Number(stop.dailyNumber) : null,
        cachedCoordinates: stopCoordinates,
      });
    }

    if (normalizedAddress && !groupedByAddress.has(selectedAddressKey)) {
      groupedByAddress.set(selectedAddressKey, {
        id: selectedAddressKey,
        address: normalizedAddress,
        isSelected: true,
        cachedCoordinates: selectedCustomerCoordinates,
        entries: [
          {
            id: "selected-customer",
            customerId: customerId ?? "",
            customerName: normalizeAddress(customerName) || "Cliente selezionato",
            dailyNumber: null,
            cachedCoordinates: selectedCustomerCoordinates,
          },
        ],
      });
    }

    return Array.from(groupedByAddress.values()).sort((a, b) => {
      if (a.isSelected !== b.isSelected) {
        return a.isSelected ? -1 : 1;
      }

      return a.address.localeCompare(b.address, "it-IT");
    });
  }, [customerId, customerName, deliveryStops, normalizedAddress, selectedAddressKey, selectedCustomerCoordinates]);

  const totalDeliveries = useMemo(() => {
    return deliveryStopGroups.reduce((sum, group) => sum + group.entries.length, 0);
  }, [deliveryStopGroups]);

  const hasMapData = deliveryStopGroups.length > 0;

  useEffect(() => {
    if (!hasMapData) {
      setGeoState({
        status: "idle",
        markers: [],
        unresolvedCount: 0,
        approximateCount: 0,
        error: "",
      });
      return;
    }

    if (!GOOGLE_MAPS_API_KEY || !isGoogleMapsLoaded || googleMapsLoadError) {
      setGeoState({
        status: "idle",
        markers: [],
        unresolvedCount: 0,
        approximateCount: 0,
        error: "",
      });
      return;
    }

    const controller = new AbortController();

    async function geocodeStops() {
      setGeoState({
        status: "loading",
        markers: [],
        unresolvedCount: 0,
        approximateCount: 0,
        error: "",
      });

      try {
        const results = await Promise.all(
          deliveryStopGroups.map(async (group) => {
            if (Array.isArray(group.cachedCoordinates)) {
              return {
                ok: true,
                fromCache: true,
                group,
                coordinates: group.cachedCoordinates,
                isApproximate: false,
              };
            }

            try {
              const geocoded = await geocodeAddressCoordinates(group.address, controller.signal);
              return {
                ok: true,
                fromCache: false,
                group,
                coordinates: geocoded.coordinates,
                isApproximate: geocoded.isApproximate,
              };
            } catch (error) {
              if (controller.signal.aborted) {
                return { ok: false, aborted: true };
              }

              return {
                ok: false,
                aborted: false,
                group,
                error,
              };
            }
          })
        );

        if (controller.signal.aborted) {
          return;
        }

        const resolvedMarkers = results
          .filter((result) => result.ok)
          .map((result) => ({
            id: result.group.id,
            address: result.group.address,
            entries: result.group.entries,
            isSelected: result.group.isSelected,
            coordinates: result.coordinates,
            isApproximate: result.isApproximate,
            fromCache: Boolean(result.fromCache),
          }))
          .sort((a, b) => {
            if (a.isSelected !== b.isSelected) {
              return a.isSelected ? -1 : 1;
            }

            return a.address.localeCompare(b.address, "it-IT");
          });

        const unresolvedResults = results.filter((result) => !result.ok && !result.aborted);
        const unresolvedCount = unresolvedResults.length;
        const approximateCount = resolvedMarkers.filter((marker) => marker.isApproximate).length;

        if (resolvedMarkers.length === 0) {
          setGeoState({
            status: "error",
            markers: [],
            unresolvedCount,
            approximateCount: 0,
            error:
              unresolvedResults[0]?.error?.message ||
              "Impossibile localizzare gli indirizzi delle consegne selezionate",
          });
          return;
        }

        const cacheWritesByCustomer = new Map();

        for (const result of results) {
          if (!result.ok || result.fromCache !== false || !Array.isArray(result.coordinates)) {
            continue;
          }

          for (const entry of result.group.entries ?? []) {
            if (!entry?.customerId || Array.isArray(entry.cachedCoordinates)) {
              continue;
            }

            if (!cacheWritesByCustomer.has(entry.customerId)) {
              cacheWritesByCustomer.set(entry.customerId, result.coordinates);
            }
          }
        }

        if (cacheWritesByCustomer.size > 0) {
          void Promise.allSettled(
            Array.from(cacheWritesByCustomer.entries()).map(([id, coordinates]) =>
              updateCustomerCoordinates({
                id,
                geoLat: coordinates[0],
                geoLng: coordinates[1],
              })
            )
          );
        }

        setGeoState({
          status: "ready",
          markers: resolvedMarkers,
          unresolvedCount,
          approximateCount,
          error:
            unresolvedCount > 0
              ? `${unresolvedCount} indirizzo${unresolvedCount === 1 ? "" : "i"} non localizzato${unresolvedCount === 1 ? "" : "i"}.`
              : "",
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setGeoState({
          status: "error",
          markers: [],
          unresolvedCount: 0,
          approximateCount: 0,
          error: error?.message || "Impossibile localizzare indirizzi",
        });
      }
    }

    void geocodeStops();

    return () => {
      controller.abort();
    };
  }, [hasMapData, deliveryStopGroups, googleMapsLoadError, isGoogleMapsLoaded, reloadToken]);

  const viewportPoints = useMemo(() => {
    const deliveryPoints = geoState.markers
      .map((marker) => toLatLngLiteral(marker.coordinates))
      .filter(Boolean);
    const pizzeriaPoint = toLatLngLiteral(PIZZERIA_INFO.coordinates);

    return [pizzeriaPoint, ...deliveryPoints].filter(Boolean);
  }, [geoState.markers]);

  const focusedCoordinates = useMemo(() => {
    const selectedMarker = geoState.markers.find((marker) => marker.isSelected);
    return selectedMarker?.coordinates ?? geoState.markers[0]?.coordinates ?? PIZZERIA_INFO.coordinates;
  }, [geoState.markers]);

  const focusedLatLng = useMemo(() => {
    return toLatLngLiteral(focusedCoordinates) ?? toLatLngLiteral(PIZZERIA_INFO.coordinates);
  }, [focusedCoordinates]);

  const pizzeriaMarkerIcon = useMemo(() => {
    if (!isGoogleMapsLoaded || typeof window === "undefined" || !window.google?.maps) {
      return PIN_ICON_URLS.pizzeria;
    }

    return {
      url: PIN_ICON_URLS.pizzeria,
      scaledSize: new window.google.maps.Size(24, 24),
    };
  }, [isGoogleMapsLoaded]);

  useEffect(() => {
    if (!isGoogleMapsLoaded || !mapRef.current || viewportPoints.length === 0 || !window.google?.maps) {
      return;
    }

    if (viewportPoints.length === 1) {
      mapRef.current.setCenter(viewportPoints[0]);
      mapRef.current.setZoom(14);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();

    for (const point of viewportPoints) {
      bounds.extend(point);
    }

    mapRef.current.fitBounds(bounds, 48);
  }, [isGoogleMapsLoaded, viewportPoints]);

  useEffect(() => {
    setActivePopupId("");
  }, [selectedTimeSlot, selectedAddressKey]);

  useEffect(() => {
    if (geoState.markers.length === 0) {
      setActivePopupId("");
      return;
    }

    if (activePopupId === "pizzeria") {
      return;
    }

    const activeDeliveryExists = geoState.markers.some((marker) => `delivery:${marker.id}` === activePopupId);

    if (!activeDeliveryExists) {
      setActivePopupId("");
    }
  }, [activePopupId, geoState.markers]);

  return (
    <section className="relative isolate z-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 truncate">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <MapPin size={16} />
          </div>
          <div className="flex flex-col truncate">
            <h3 className="text-sm font-semibold tracking-wide text-slate-800">Mappa consegne</h3>
            {hasMapData ? (
              <p className="truncate text-xs text-slate-500">
                {totalDeliveries} consegne{selectedTimeSlot ? ` alle ${selectedTimeSlot}` : ""}
                {normalizedAddress ? ` - Focus: ${customerName || "Cliente"}` : ""}
              </p>
            ) : (
              <p className="truncate text-xs text-slate-400">Nessun indirizzo consegna disponibile nello slot selezionato</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {hasMapData && (
            <button
              type="button"
              onClick={() => {
                setReloadToken((prev) => prev + 1);
                if (isCollapsed) setIsCollapsed(false);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              title="Ricarica mappa"
            >
              <RefreshCw size={14} className={geoState.status === "loading" ? "animate-spin" : ""} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            disabled={!hasMapData}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
            title={isCollapsed ? "Espandi mappa" : "Comprimi mappa"}
          >
            {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {!isCollapsed && hasMapData && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {!GOOGLE_MAPS_API_KEY && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Google Maps non disponibile: verifica API key e restrizioni del progetto.
            </div>
          )}

          {googleMapsLoadError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Google Maps non disponibile: verifica API key e restrizioni del progetto.
            </div>
          )}

          {geoState.status === "loading" && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Localizzazione consegne in corso...
            </p>
          )}

          {geoState.status === "error" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {geoState.error}
            </div>
          )}

          {geoState.status === "ready" && geoState.error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {geoState.error}
            </div>
          )}

          {geoState.status === "ready" && geoState.approximateCount > 0 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Posizione approssimativa su {geoState.approximateCount} consegn{geoState.approximateCount === 1 ? "a" : "e"}: numero civico non trovato, usata la via piu vicina.
            </div>
          )}

          {GOOGLE_MAPS_API_KEY && isGoogleMapsLoaded && !googleMapsLoadError && (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <GoogleMap
                mapContainerClassName="h-44 w-full"
                center={focusedLatLng}
                zoom={14}
                onLoad={(mapInstance) => {
                  mapRef.current = mapInstance;
                }}
                onUnmount={() => {
                  mapRef.current = null;
                }}
                options={{
                  disableDefaultUI: true,
                  zoomControl: true,
                  mapTypeControl: false,
                  fullscreenControl: false,
                  streetViewControl: false,
                  gestureHandling: "greedy",
                }}
              >
                <MarkerF
                  position={toLatLngLiteral(PIZZERIA_INFO.coordinates)}
                  icon={pizzeriaMarkerIcon}
                  onClick={() => setActivePopupId("pizzeria")}
                />

                {activePopupId === "pizzeria" && (
                  <InfoWindowF
                    position={toLatLngLiteral(PIZZERIA_INFO.coordinates)}
                    onCloseClick={() => setActivePopupId("")}
                  >
                    <div className="text-sm">
                      <p className="font-semibold text-slate-900">{PIZZERIA_INFO.name}</p>
                      <p className="text-slate-600">{PIZZERIA_INFO.address}</p>
                    </div>
                  </InfoWindowF>
                )}

                {geoState.markers.map((marker) => {
                  const markerId = `delivery:${marker.id}`;
                  const markerPosition = toLatLngLiteral(marker.coordinates);

                  if (!markerPosition) {
                    return null;
                  }

                  return (
                    <MarkerF
                      key={marker.id}
                      position={markerPosition}
                      icon={marker.isSelected ? PIN_ICON_URLS.selected : PIN_ICON_URLS.delivery}
                      onClick={() => setActivePopupId(markerId)}
                    >
                      {activePopupId === markerId && (
                        <InfoWindowF position={markerPosition} onCloseClick={() => setActivePopupId("")}>
                          <div className="text-sm">
                            <p className="font-semibold text-slate-900">
                              {marker.isSelected ? "Cliente selezionato" : "Consegna"}
                            </p>
                            <p className="text-slate-600">{marker.address}</p>
                            <div className="mt-1 space-y-0.5">
                              {marker.entries.slice(0, 6).map((entry) => (
                                <p key={entry.id} className="text-xs text-slate-500">
                                  {Number.isFinite(entry.dailyNumber) ? `#${entry.dailyNumber} - ` : ""}
                                  {entry.customerName}
                                </p>
                              ))}
                              {marker.entries.length > 6 && (
                                <p className="text-xs text-slate-400">+{marker.entries.length - 6} altre consegne</p>
                              )}
                            </div>
                          </div>
                        </InfoWindowF>
                      )}
                    </MarkerF>
                  );
                })}
              </GoogleMap>
            </div>
          )}

          {GOOGLE_MAPS_API_KEY && !isGoogleMapsLoaded && !googleMapsLoadError && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Caricamento Google Maps...
            </p>
          )}
        </div>
      )}
    </section>
  );
}
