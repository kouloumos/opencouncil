import { useState } from 'react';
import { City, ConnectorStatus, ValidationResult } from '@/types/elasticsearch';

export function useElasticsearchConnector() {
  const [cities, setCities] = useState<City[]>([]);
  const [connectorInfo, setConnectorInfo] = useState<ConnectorStatus | null>(null);
  const [selectedCityIds, setSelectedCityIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const [citiesRes, connectorRes] = await Promise.all([
        fetch('/api/cities/all'),
        fetch('/api/admin/elasticsearch/connector')
      ]);
      
      if (!citiesRes.ok) {
        throw new Error('Failed to fetch cities');
      }
      
      if (!connectorRes.ok) {
        throw new Error('Failed to fetch connector status');
      }
      
      const citiesData = await citiesRes.json();
      const connectorData = await connectorRes.json();
      
      setCities(citiesData);
      setConnectorInfo(connectorData);
      setSelectedCityIds(connectorData.currentCityIds || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }
  };

  const validateConfiguration = async () => {
    if (selectedCityIds.length === 0) {
      setValidationResult({
        isValid: false,
        errorMessage: 'Please add at least one city using the search box above to validate the configuration'
      });
      return;
    }
    
    setIsValidating(true);
    try {
      const response = await fetch('/api/admin/elasticsearch/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cityIds: selectedCityIds })
      });
      
      const result = await response.json();
      setValidationResult(result);
    } catch (err) {
      setValidationResult({
        isValid: false,
        errorMessage: err instanceof Error ? err.message : 'Validation failed'
      });
    } finally {
      setIsValidating(false);
    }
  };

  const applyConfiguration = async () => {
    setIsLoading(true);
    try {
      // First validate in 'update' mode to ensure the template query is valid
      const updateValidationResponse = await fetch('/api/admin/elasticsearch/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cityIds: selectedCityIds,
          mode: 'update'
        })
      });
      
      const updateValidation = await updateValidationResponse.json();
      
      if (!updateValidation.isValid) {
        throw new Error(`Configuration update validation failed: ${updateValidation.errorMessage}`);
      }
      
      // If validation passes, apply the configuration
      const response = await fetch('/api/admin/elasticsearch/connector', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cityIds: selectedCityIds })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update configuration');
      }
      
      // Reload data to show updated state
      await loadData();
      setValidationResult(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSelectedCities = (cityIds: string[]) => {
    setSelectedCityIds(cityIds);
    setValidationResult(null);
  };

  const hasChanges = JSON.stringify(selectedCityIds.sort()) !== JSON.stringify((connectorInfo?.currentCityIds || []).sort());

  return {
    // State
    cities,
    connectorInfo,
    selectedCityIds,
    isLoading,
    isValidating,
    validationResult,
    error,
    hasChanges,
    
    // Actions
    loadData,
    validateConfiguration,
    applyConfiguration,
    updateSelectedCities,
    setError
  };
} 