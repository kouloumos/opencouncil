export interface ConnectorStatus {
  currentCityIds: string[];
  currentQuery?: string;
  queryUpdatedAt?: string; // When the advanced snippet query was last updated
  isValid: boolean;
  isConnected: boolean;
  lastSeen?: string;
  status?: string;
}

export interface ValidationResult {
  isValid: boolean;
  rowCount?: number;
  errorMessage?: string;
  executionTime?: number;
  citiesValidated?: number;
  details?: string;
  queryMismatch?: {
    structureMatches: boolean;
    cityIdsMatch: boolean;
    actualCityIds: string[];
    expectedCityIds: string[];
    remoteQuery: string;
    expectedQuery: string;
  };
}
