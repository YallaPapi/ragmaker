const { Index } = require('@upstash/vector');
require('dotenv').config();

async function cleanupTestData() {
  try {
    console.log('Cleaning up test data from vector store...');
    
    const index = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN
    });
    
    // Delete specific test vector that was created without namespace
    const testIds = ['test123_chunk_0'];
    
    for (const id of testIds) {
      try {
        await index.delete(id);
        console.log(`Deleted test vector: ${id}`);
      } catch (error) {
        console.log(`Could not delete ${id}: ${error.message}`);
      }
    }
    
    // Get stats to verify
    const info = await index.info();
    console.log('\nVector store stats after cleanup:');
    console.log(`Total vectors: ${info.vectorCount}`);
    
    console.log('\nCleanup complete!');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

cleanupTestData();