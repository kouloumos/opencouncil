'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, AlertTriangle, Clock, X, ChevronDown, ChevronUp, Code } from 'lucide-react';
import { buildSyncQuery } from '@/lib/elasticsearch/queryTemplate';
import Combobox from '@/components/Combobox';
import ElasticsearchStatus from './Status';
import { useElasticsearchConnector } from '@/hooks/useElasticsearchConnector';
import { City } from '@/types/elasticsearch';

export default function ElasticsearchManagement() {
  const {
    cities,
    connectorInfo,
    selectedCityIds,
    isLoading,
    isValidating,
    validationResult,
    error,
    hasChanges,
    loadData,
    validateConfiguration,
    applyConfiguration,
    updateSelectedCities,
    setError
  } = useElasticsearchConnector();

  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [showQueryPreview, setShowQueryPreview] = useState(false);
  
  // Load initial data
  useEffect(() => {
    loadData();
  }, []);
  
  const handleCitySelect = (city: City | null) => {
    if (city && !selectedCityIds.includes(city.id)) {
      updateSelectedCities([...selectedCityIds, city.id]);
    }
    // Clear the combobox selection after adding
    setSelectedCity(null);
  };

  const handleCityRemove = (cityId: string) => {
    updateSelectedCities(selectedCityIds.filter(id => id !== cityId));
  };
  
  const handleSelectAll = () => {
    if (selectedCityIds.length === cities.length) {
      updateSelectedCities([]);
    } else {
      updateSelectedCities(cities.map(city => city.id));
    }
  };

  const getSelectedCities = () => {
    return cities.filter(city => selectedCityIds.includes(city.id));
  };

  const getAvailableCities = () => {
    return cities.filter(city => !selectedCityIds.includes(city.id));
  };
  
  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {/* Connector Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Sync Configuration
            {connectorInfo?.isConnected ? (
              <Badge variant="secondary" className="text-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                Disconnected
              </Badge>
            )}
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Configure which cities are included in the Elasticsearch search index. 
            Changes will be validated before applying to prevent data loss.
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* City Selection */}
          <div>
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">1. Select Cities</h3>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSelectAll}
                  disabled={cities.length === 0}
                >
                  {selectedCityIds.length === cities.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Choose which cities' council meetings and subjects will be searchable in Elasticsearch.
              </p>
            </div>
            
            {/* Combobox for adding cities */}
            <div className="mb-4">
              <Combobox
                items={getAvailableCities()}
                value={selectedCity}
                onChange={handleCitySelect}
                placeholder="Search and select cities to add..."
                searchPlaceholder="Search cities..."
                getItemLabel={(city) => city.name}
                getItemValue={(city) => city.id}
                disabled={cities.length === 0}
                className="w-full"
              />
            </div>

            {/* Selected Cities Display */}
            {selectedCityIds.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Selected Cities:</div>
                <div className="flex flex-wrap gap-2">
                  {getSelectedCities().map(city => (
                    <Badge 
                      key={city.id} 
                      variant="secondary" 
                      className="flex items-center gap-2 px-3 py-1"
                    >
                      <span>{city.name}</span>
                      {connectorInfo?.currentCityIds.includes(city.id) && (
                        <span className="text-xs bg-green-100 text-green-700 px-1 rounded">
                          Active
                        </span>
                      )}
                      <button
                        onClick={() => handleCityRemove(city.id)}
                        className="ml-1 hover:bg-gray-200 rounded-full p-0.5 transition-colors"
                        aria-label={`Remove ${city.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {cities.length === 0 && (
              <p className="text-sm text-muted-foreground">Loading cities...</p>
            )}
          </div>
          
          {/* Selection Summary */}
          {selectedCityIds.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <strong>{selectedCityIds.length}</strong> of {cities.length} cities selected
              {hasChanges && (
                <span className="ml-2 text-orange-600 font-medium">
                  • Changes pending
                </span>
              )}
            </div>
          )}

          {/* Query Preview Section */}
          {selectedCityIds.length > 0 && (
            <div className="border-t pt-4">
              <div className="mb-2">
                <h3 className="text-sm font-semibold mb-1">2. Technical Preview (Optional)</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  View the SQL query and sample documents that will be generated for your city selection.
                </p>
              </div>
              
              <button
                onClick={() => setShowQueryPreview(!showQueryPreview)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showQueryPreview ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                <Code className="h-4 w-4" />
                {showQueryPreview ? 'Hide' : 'Show'} SQL Queries
              </button>
              
              {showQueryPreview && (
                <div className="mt-3 space-y-4">
                  <div className="text-xs text-muted-foreground">
                    Compare the current configuration with your proposed changes.
                  </div>

                  {/* Current Configuration Query */}
                  {connectorInfo?.currentQuery && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-medium">Current Configuration Query</h4>
                        <Badge variant="outline" className="text-xs">
                          {connectorInfo.currentCityIds.length} cities
                        </Badge>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-md overflow-x-auto">
                        <pre className="text-xs whitespace-pre-wrap text-blue-900">
                          {connectorInfo.currentQuery}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Proposed Query */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-medium">
                        {hasChanges ? 'Proposed Configuration Query' : 'Generated Query Preview'}
                      </h4>
                      <Badge variant={hasChanges ? "default" : "secondary"} className="text-xs">
                        {selectedCityIds.length} cities
                      </Badge>
                      {hasChanges && (
                        <Badge variant="outline" className="text-xs text-orange-600">
                          Changes pending
                        </Badge>
                      )}
                    </div>
                    <div className={`p-3 rounded-md overflow-x-auto ${hasChanges ? 'bg-green-50' : 'bg-gray-50'}`}>
                      <pre className={`text-xs whitespace-pre-wrap ${hasChanges ? 'text-green-900' : 'text-gray-900'}`}>
                        {(() => {
                          try {
                            return buildSyncQuery(selectedCityIds);
                          } catch (error) {
                            return `Error generating query: ${error instanceof Error ? error.message : 'Unknown error'}`;
                          }
                        })()}
                      </pre>
                    </div>
                  </div>

                  {/* Show comparison info if queries differ */}
                  {connectorInfo?.currentQuery && hasChanges && (
                    <div className="p-3 bg-yellow-50 rounded-md">
                      <div className="text-sm text-yellow-800 font-medium mb-1">Query Comparison</div>
                      <div className="text-xs text-yellow-700 space-y-1">
                        <div>• <strong>Current:</strong> {connectorInfo.currentCityIds.length} cities configured</div>
                        <div>• <strong>Proposed:</strong> {selectedCityIds.length} cities selected</div>
                        <div className="mt-2 text-xs">
                          The proposed query will replace the current configuration when you apply changes.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show mismatch info if available from validation */}
                  {validationResult?.queryMismatch && !validationResult.queryMismatch.structureMatches && (
                    <div className="p-3 bg-orange-50 rounded-md">
                      <div className="text-sm text-orange-800 font-medium mb-1">Query Structure Mismatch Detected</div>
                      <div className="text-xs text-orange-700">
                        The current remote query structure differs from the expected template. 
                        Applying the configuration will update it to match the standard format.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Validation Result */}
          {validationResult && (
            <Alert variant={validationResult.isValid ? "default" : "destructive"}>
              {validationResult.isValid ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {validationResult.isValid ? (
                  <div>
                    <div>{validationResult.details}</div>
                    {validationResult.executionTime && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Validation completed in {validationResult.executionTime}ms
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="whitespace-pre-line">{validationResult.errorMessage}</div>
                    {validationResult.queryMismatch && (
                      <div className="mt-3 p-3 bg-orange-50 rounded-md text-sm">
                        <div className="font-medium text-orange-800 mb-2">Query Mismatch Details:</div>
                        {!validationResult.queryMismatch.structureMatches && (
                          <div className="text-orange-700 mb-1">• Query structure differs from expected template</div>
                        )}
                        {!validationResult.queryMismatch.cityIdsMatch && (
                          <div className="text-orange-700 mb-2">
                            • City IDs: Remote [{validationResult.queryMismatch.actualCityIds.join(', ')}] 
                            vs Expected [{validationResult.queryMismatch.expectedCityIds.join(', ')}]
                          </div>
                        )}
                        <div className="text-orange-600 text-xs">
                          Use "Apply Configuration" to update the remote query to match your selection.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Actions Section */}
          <div>
            <h3 className="text-sm font-semibold mb-2">3. Validate & Apply</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Check your current setup or apply your city selection to the Elasticsearch connector.
            </p>
            
            <div className="flex gap-2">
              <Button 
                onClick={validateConfiguration}
                disabled={selectedCityIds.length === 0 || isValidating}
                variant="outline"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 mr-2" />
                    Check Current Setup
                  </>
                )}
              </Button>
              
              <Button 
                onClick={applyConfiguration}
                disabled={selectedCityIds.length === 0 || isLoading || !hasChanges}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  'Apply Configuration'
                )}
              </Button>
            </div>
            
            {/* Action Explanations */}
            <div className="mt-2 text-xs text-muted-foreground space-y-1">
              <div><strong>Check Current Setup:</strong> Validates if your selection matches what's currently configured</div>
              <div><strong>Apply Configuration:</strong> Updates the Elasticsearch connector with your selected cities</div>
            </div>
          </div>
          
          {/* Contextual Help */}
          <div className="bg-gray-50 p-3 rounded-md">
            <div className="text-sm">
              {selectedCityIds.length === 0 ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Start by selecting cities using the search box above.</span>
                </div>
              ) : !hasChanges ? (
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-4 w-4" />
                  <span>Your selection matches the current configuration. No changes needed.</span>
                </div>
              ) : validationResult?.isValid ? (
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-4 w-4" />
                  <span>Configuration validated successfully. Ready to apply your changes.</span>
                </div>
              ) : validationResult && !validationResult.isValid ? (
                <div className="flex items-center gap-2 text-orange-700">
                  <XCircle className="h-4 w-4" />
                  <span>Validation found issues. You can still apply the configuration - it will be validated again during the update.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-blue-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Changes pending. Use "Check Current Setup" to validate or "Apply Configuration" to update.</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Existing Status Component */}
      <ElasticsearchStatus />
    </div>
  );
} 