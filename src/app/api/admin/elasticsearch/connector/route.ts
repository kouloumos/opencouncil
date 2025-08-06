import { NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { ConnectorService } from '@/lib/elasticsearch/connector';

// This prevents Next.js from trying to statically pre-render this route
// This is because the connector configuration is updated dynamically
export const dynamic = 'force-dynamic';
/**
 * GET /api/admin/elasticsearch/connector
 * 
 * Gets the current connector configuration including city filters
 */
export async function GET() {
  try {
    await withUserAuthorizedToEdit({});
    
    const connectorService = new ConnectorService();
    const status = await connectorService.getConnectorStatus();

    return NextResponse.json(status);
  } catch (error) {
    console.error('Error fetching connector config:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message }, 
        { status: error.message.includes('not found') ? 404 : 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch connector configuration' }, 
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/elasticsearch/connector
 * 
 * Updates the connector configuration with new city filters
 */
export async function PUT(request: Request) {
  try {
    await withUserAuthorizedToEdit({});
    
    const body = await request.json();
    const { cityIds } = body;
    
    // Validate request body format
    if (!cityIds || !Array.isArray(cityIds)) {
      return NextResponse.json(
        { error: 'cityIds must be provided as an array' }, 
        { status: 400 }
      );
    }
        
    // Update connector configuration (validation is handled in the service)
    const connectorService = new ConnectorService();
    await connectorService.updateConnectorQuery(cityIds);

    // Get updated status to confirm changes
    const updatedStatus = await connectorService.getConnectorStatus();
    
    return NextResponse.json({
      success: true,
      message: `Connector updated successfully with ${cityIds.length} cities`,
      status: updatedStatus
    });
    
  } catch (error) {
    console.error('Error updating connector config:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message }, 
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to update connector configuration' }, 
      { status: 500 }
    );
  }
} 