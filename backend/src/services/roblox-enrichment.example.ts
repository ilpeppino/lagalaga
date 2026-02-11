/**
 * Example Usage: Roblox Enrichment Service
 *
 * This file demonstrates how to use the RobloxEnrichmentService
 * to fetch and cache game metadata from Roblox.
 */

import { RobloxEnrichmentService } from './roblox-enrichment.service.js';
import { logger } from '../lib/logger.js';

async function example() {
  // Initialize service
  const enrichmentService = new RobloxEnrichmentService();

  try {
    // Example 1: Enrich Jailbreak
    console.log('Example 1: Enriching Jailbreak...');
    const jailbreak = await enrichmentService.enrichGame(606849621);
    console.log('Result:', jailbreak);
    /*
    Output:
    {
      placeId: 606849621,
      universeId: 245683,
      name: 'Jailbreak',
      thumbnailUrl: 'https://tr.rbxcdn.com/...'
    }
    */

    // Example 2: Enrich another game
    console.log('\nExample 2: Enriching Adopt Me...');
    const adoptMe = await enrichmentService.enrichGame(920587237);
    console.log('Result:', adoptMe);

    // Example 3: Second call uses cache (no external requests)
    console.log('\nExample 3: Re-enriching Jailbreak (cached)...');
    const jailbreakCached = await enrichmentService.enrichGame(606849621);
    console.log('Result:', jailbreakCached);

    // Example 4: Handle errors gracefully
    console.log('\nExample 4: Handling invalid placeId...');
    try {
      await enrichmentService.enrichGame(999999999999);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
    }

    // Example 5: Partial enrichment (if thumbnail fails)
    console.log('\nExample 5: Partial enrichment still works...');
    const partial = await enrichmentService.enrichGame(123456789);
    console.log('Result:', partial);
    // Will return with name but possibly null thumbnail

  } catch (error) {
    logger.error({ error }, 'Enrichment example failed');
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  example().catch(console.error);
}

export { example };
