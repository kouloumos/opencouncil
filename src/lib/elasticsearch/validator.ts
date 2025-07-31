import prisma from '@/lib/db/prisma';
import { buildSyncQuery, validateQueryStructure } from './queryTemplate';

export interface ValidationResult {
  isValid: boolean;
  rowCount?: number;
  errorMessage?: string;
  executionTime?: number;
  queryMismatch?: {
    structureMatches: boolean;
    cityIdsMatch: boolean;
    actualCityIds: string[];
    expectedCityIds: string[];
    remoteQuery: string;
    expectedQuery: string;
  };
}

/**
 * Validates a sync query by executing it with COUNT to ensure it returns results
 * This prevents the sync process from deleting all data due to malformed queries
 * 
 * @param cityIds Array of city IDs to validate
 * @param remoteQuery Optional remote query to compare against our template
 * @param mode Validation mode - 'check' compares remote vs template, 'update' validates template only
 * @returns ValidationResult indicating if the query is safe to use
 */
export async function validateSyncQuery(
  cityIds: string[], 
  remoteQuery?: string, 
  mode: 'check' | 'update' = 'check'
): Promise<ValidationResult> {
  const startTime = Date.now();
  
  try {
    // Validate input
    if (!cityIds || cityIds.length === 0) {
      return {
        isValid: false,
        errorMessage: 'At least one city must be selected for sync'
      };
    }

    // Check for query structure mismatch if remote query provided and in 'check' mode
    if (remoteQuery && mode === 'check') {
      const structureValidation = validateQueryStructure(remoteQuery, cityIds);
      if (!structureValidation.isValid) {
        const executionTime = Date.now() - startTime;
        
        let errorMessage = 'Query structure mismatch detected:\n';
        if (!structureValidation.structureMatches) {
          errorMessage += '- The remote Elasticsearch query structure differs from our expected template. ';
          errorMessage += 'The connector may have been manually modified or is using an outdated query format.\n';
        }
        if (!structureValidation.cityIdsMatch) {
          errorMessage += `- City IDs mismatch: Remote has [${structureValidation.actualCityIds.join(', ')}] but expected [${structureValidation.expectedCityIds.join(', ')}].\n`;
        }
        errorMessage += '\nPlease update the connector configuration or use the "Apply Configuration" button to sync the queries.';

        return {
          isValid: false,
          executionTime,
          errorMessage,
          queryMismatch: structureValidation
        };
      }
    }

    // Build the sync query - use appropriate query based on mode
    const query = mode === 'update' 
      ? buildSyncQuery(cityIds)  // Always use template for updates
      : (remoteQuery || buildSyncQuery(cityIds));  // Use remote if available for checks
    
    // Wrap in COUNT to validate without returning large result sets
    const countQuery = `SELECT COUNT(*) as count FROM (${query}) as validation_query`;
    
    // Execute validation query
    const result = await prisma.$queryRawUnsafe(countQuery);
    const rowCount = Number((result as any)[0].count);
    
    const executionTime = Date.now() - startTime;
    
    // Check if query returned any results
    if (rowCount === 0) {
      return {
        isValid: false,
        rowCount: 0,
        executionTime,
        errorMessage: 'Query returned no results. This would delete all existing data in Elasticsearch. Please check your city selection and ensure the cities have released council meetings with subjects.'
      };
    }
    
    // Validation successful
    return {
      isValid: true,
      rowCount,
      executionTime
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // Handle specific database errors
    let errorMessage = 'Query validation failed';
    
    if (error instanceof Error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        errorMessage = `Database schema error: ${error.message}. The sync query may need to be updated for the current database schema.`;
      } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
        errorMessage = `Database table error: ${error.message}. Please ensure all required tables exist.`;
      } else {
        errorMessage = `Query validation failed: ${error.message}`;
      }
    }
    
    return {
      isValid: false,
      executionTime,
      errorMessage
    };
  }
}

/**
 * Validates that the provided city IDs exist in the database
 * 
 * @param cityIds Array of city IDs to validate
 * @returns ValidationResult indicating if all cities exist
 */
export async function validateCityIds(cityIds: string[]): Promise<ValidationResult> {
  try {
    if (!cityIds || cityIds.length === 0) {
      return {
        isValid: false,
        errorMessage: 'No cities provided for validation'
      };
    }

    const existingCities = await prisma.city.findMany({
      where: {
        id: { in: cityIds }
      },
      select: {
        id: true,
        name: true
      }
    });

    const existingCityIds = existingCities.map(city => city.id);
    const missingCityIds = cityIds.filter(id => !existingCityIds.includes(id));

    if (missingCityIds.length > 0) {
      return {
        isValid: false,
        errorMessage: `The following cities do not exist: ${missingCityIds.join(', ')}`
      };
    }

    return {
      isValid: true,
      rowCount: existingCities.length
    };

  } catch (error) {
    return {
      isValid: false,
      errorMessage: `City validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
} 