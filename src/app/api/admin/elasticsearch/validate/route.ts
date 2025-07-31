import { NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { validateSyncQuery, validateCityIds } from '@/lib/elasticsearch/validator';
import { ConnectorService } from '@/lib/elasticsearch/connector';

/**
 * POST /api/admin/elasticsearch/validate
 * 
 * Validates a sync query configuration before applying it to the connector
 * This prevents data loss by ensuring the query returns results
 */
export async function POST(request: Request) {
  try {
    await withUserAuthorizedToEdit({});
    
    const body = await request.json();
    const { cityIds, mode = 'check' } = body;
    
    // Validate request body
    if (!cityIds || !Array.isArray(cityIds)) {
      return NextResponse.json({
        isValid: false,
        errorMessage: 'cityIds must be provided as an array'
      }, { status: 400 });
    }
    
    if (cityIds.length === 0) {
      return NextResponse.json({
        isValid: false,
        errorMessage: 'At least one city must be selected for validation'
      }, { status: 400 });
    }
    
    // First validate that all city IDs exist in the database
    const cityValidation = await validateCityIds(cityIds);
    if (!cityValidation.isValid) {
      return NextResponse.json({
        isValid: false,
        errorMessage: cityValidation.errorMessage
      });
    }
    
    // Get the remote query from Elasticsearch connector for comparison
    let remoteQuery = null;
    try {
      const connectorService = new ConnectorService();
      const config = await connectorService.getConnectorConfig();
      const filteringConfig = config.filtering?.[0];
      remoteQuery = filteringConfig?.active?.advanced_snippet?.value?.[0]?.query ||
                    filteringConfig?.draft?.advanced_snippet?.value?.[0]?.query;
    } catch (error) {
      console.warn('Could not fetch remote query for comparison:', error);
    }
    
    // Validate the actual sync query with remote query comparison
    const syncValidation = await validateSyncQuery(cityIds, remoteQuery || undefined, mode);
    
    // Return validation result with detailed information
    return NextResponse.json({
      isValid: syncValidation.isValid,
      rowCount: syncValidation.rowCount,
      errorMessage: syncValidation.errorMessage,
      executionTime: syncValidation.executionTime,
      citiesValidated: cityIds.length,
      queryMismatch: syncValidation.queryMismatch,
      details: syncValidation.isValid 
        ? `Query validation successful: ${syncValidation.rowCount} subjects found across ${cityIds.length} cities`
        : undefined
    });
    
  } catch (error) {
    console.error('Error validating sync query:', error);
    
    return NextResponse.json({
      isValid: false,
      errorMessage: error instanceof Error ? error.message : 'Validation failed due to an unexpected error'
    }, { status: 500 });
  }
} 