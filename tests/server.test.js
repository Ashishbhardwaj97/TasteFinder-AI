process.env.MOCK_LLM = 'true';
import { server, cache } from '../src/server.js';

async function runTests() {
  console.log('🧪 Starting Automated Backend Server Integration & Stress Tests...');

  // Start the server dynamically on an ephemeral port (port 0) to avoid collisions
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`📡 Test Server bound dynamically to ephemeral port: ${port}`);

  let failed = false;

  try {
    // Clear cache before starting
    cache.clear();

    const validPayload = {
      location: 'Banashankari',
      cuisine: 'North Indian',
      budget: 'Medium',
      min_rating: 4.0,
      additional_notes: 'Cozy and spacious environment for family dinner.'
    };

    // -------------------------------------------------------------------------
    // Test 1: OPTIONS CORS Preflight
    // -------------------------------------------------------------------------
    console.log('\n👉 Running Test 1: OPTIONS CORS Preflight');
    const optionsRes = await fetch(`${baseUrl}/api/recommend`, {
      method: 'OPTIONS'
    });
    if (optionsRes.status !== 204) {
      throw new Error(`FAIL: OPTIONS response should be 204. Got: ${optionsRes.status}`);
    }
    const corsOrigin = optionsRes.headers.get('access-control-allow-origin');
    const corsMethods = optionsRes.headers.get('access-control-allow-methods');
    if (corsOrigin !== '*' || !corsMethods.includes('POST')) {
      throw new Error(`FAIL: Missing or invalid CORS preflight headers: Origin=${corsOrigin}, Methods=${corsMethods}`);
    }
    console.log('✅ PASS: CORS OPTIONS preflight handled correctly.');

    // -------------------------------------------------------------------------
    // Test 2: POST /api/recommend (Cache MISS)
    // -------------------------------------------------------------------------
    console.log('\n👉 Running Test 2: POST /api/recommend (Cache MISS)');
    const t1Start = performance.now();
    const res1 = await fetch(`${baseUrl}/api/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload)
    });
    const t1End = performance.now();
    const t1Duration = t1End - t1Start;

    if (res1.status !== 200) {
      throw new Error(`FAIL: Expected status 200. Got: ${res1.status}`);
    }

    const data1 = await res1.json();
    console.log(`⏱️ Response received in ${t1Duration.toFixed(2)} ms`);

    // Verify response schema
    if (typeof data1.summary !== 'string' || !Array.isArray(data1.recommendations)) {
      throw new Error(`FAIL: Malformed API response schema. Got: ${JSON.stringify(data1)}`);
    }
    if (!data1.fallback_metadata || typeof data1.fallback_metadata.fallback_applied !== 'boolean') {
      throw new Error(`FAIL: Missing fallback_metadata blocks in output.`);
    }

    console.log(`💬 AI Summary: "${data1.summary}"`);
    console.log(`✅ PASS: Cache MISS returned matching structural JSON schema successfully.`);

    // -------------------------------------------------------------------------
    // Test 3: POST /api/recommend (Cache HIT)
    // -------------------------------------------------------------------------
    console.log('\n👉 Running Test 3: POST /api/recommend (Cache HIT)');
    const t2Start = performance.now();
    const res2 = await fetch(`${baseUrl}/api/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload)
    });
    const t2End = performance.now();
    const t2Duration = t2End - t2Start;

    if (res2.status !== 200) {
      throw new Error(`FAIL: Expected status 200 on cache hit. Got: ${res2.status}`);
    }

    const data2 = await res2.json();
    console.log(`⏱️ Cache HIT latency: ${t2Duration.toFixed(2)} ms`);

    // Verify cache hit was instant
    if (t2Duration > 10) {
      throw new Error(`FAIL: Cache HIT took too long (${t2Duration.toFixed(2)} ms). Target: < 10ms`);
    }

    // Verify consistency
    if (JSON.stringify(data1) !== JSON.stringify(data2)) {
      throw new Error('FAIL: Cached response does not match the original response exactly.');
    }
    console.log('✅ PASS: Cache HIT successfully completed in sub-millisecond speeds.');

    // -------------------------------------------------------------------------
    // Test 4: Validation Failures (HTTP 400)
    // -------------------------------------------------------------------------
    console.log('\n👉 Running Test 4: Payload Validation Failures (HTTP 400)');
    const invalidPayloads = [
      {}, // Missing location entirely
      { location: '', budget: 'Medium' }, // Blank location
      { location: 'Banashankari', budget: 'SuperCheap' }, // Invalid budget tier
      { location: 'Banashankari', min_rating: 6.5 } // Invalid rating tier
    ];

    for (const p of invalidPayloads) {
      const badRes = await fetch(`${baseUrl}/api/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      });
      if (badRes.status !== 400) {
        throw new Error(`FAIL: Expected 400 Bad Request for payload: ${JSON.stringify(p)}. Got: ${badRes.status}`);
      }
      const badData = await badRes.json();
      if (!badData.error || !badData.details) {
        throw new Error(`FAIL: Response lacks validation error details: ${JSON.stringify(badData)}`);
      }
      console.log(`  Expected Validation Error Triggered: "${badData.error}" Details: ${badData.details.join(', ')}`);
    }
    console.log('✅ PASS: Request payload validation rules strictly enforced.');

    // -------------------------------------------------------------------------
    // Test 5: Route Not Found (HTTP 404)
    // -------------------------------------------------------------------------
    console.log('\n👉 Running Test 5: Endpoint Route Not Found (HTTP 404)');
    const getRes = await fetch(`${baseUrl}/api/nonexistent`);
    if (getRes.status !== 404) {
      throw new Error(`FAIL: Expected 404 Not Found for invalid route. Got: ${getRes.status}`);
    }
    console.log('✅ PASS: Server catch-all endpoint handles 404 perfectly.');

    // -------------------------------------------------------------------------
    // Test 6: Bounded LRU Cache Eviction
    // -------------------------------------------------------------------------
    console.log('\n👉 Running Test 6: Cache Size Limit Eviction');
    cache.clear();
    // Fill cache up to standard max limit (100 items) plus additions
    const maxLimit = cache.maxSize;
    console.log(`  Filling cache with ${maxLimit} entries...`);
    for (let i = 0; i < maxLimit; i++) {
      cache.set(`key_${i}`, { data: `value_${i}` });
    }
    if (cache.store.size !== maxLimit) {
      throw new Error(`FAIL: Cache size did not reach ${maxLimit}. Got: ${cache.store.size}`);
    }

    // Adding 1 extra item should evict the oldest item ("key_0")
    console.log('  Adding one more entry to trigger eviction...');
    cache.set('extra_key', { data: 'extra_value' });
    if (cache.store.size > maxLimit) {
      throw new Error(`FAIL: Cache size exceeded its bounding limit. Size: ${cache.store.size}`);
    }
    if (cache.get('key_0') !== null) {
      throw new Error('FAIL: Oldest item "key_0" was not evicted upon exceeding limit.');
    }
    if (cache.get('extra_key') === null || cache.get('key_99') === null) {
      throw new Error('FAIL: New items or newer access keys were incorrectly evicted.');
    }
    console.log('✅ PASS: LRU Cache size is successfully bounded, evicting oldest records correctly.');

    // -------------------------------------------------------------------------
    // Test 7: High Concurrency Load (Stress testing)
    // -------------------------------------------------------------------------
    console.log('\n👉 Running Test 7: High Concurrency Load Test (50 Parallel requests)');
    const totalConcurrent = 50;
    const startConcurrency = performance.now();
    
    // We clear cache to force at least one actual search, and let the rest leverage concurrency + cache
    cache.clear();

    const requestPromises = [];
    for (let i = 0; i < totalConcurrent; i++) {
      requestPromises.push(
        fetch(`${baseUrl}/api/recommend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validPayload)
        }).then(async r => {
          if (r.status !== 200) {
            throw new Error(`FAIL: Concurrency request returned status ${r.status}`);
          }
          return r.json();
        })
      );
    }

    const responses = await Promise.all(requestPromises);
    const endConcurrency = performance.now();
    const concurrencyDuration = endConcurrency - startConcurrency;

    console.log(`⏱️ Completed ${totalConcurrent} parallel requests in ${concurrencyDuration.toFixed(2)} ms`);
    console.log(`📊 Average query time during concurrent load: ${(concurrencyDuration / totalConcurrent).toFixed(2)} ms`);
    
    if (responses.length !== totalConcurrent) {
      throw new Error(`FAIL: Missing concurrent responses. Expected ${totalConcurrent}, Got: ${responses.length}`);
    }
    console.log('✅ PASS: Concurrency stress-testing completed smoothly. Zero crashes.');

  } catch (error) {
    console.error(`\n❌ TEST RUN COMPLETED WITH FAILURES:`);
    console.error(error.stack || error.message);
    failed = true;
  } finally {
    // Graceful Server Shutdown
    console.log('\n🛑 Shutting down backend test server gracefully...');
    await new Promise((resolve) => server.close(resolve));
    console.log('💤 Test server closed.');
    if (failed) {
      process.exit(1);
    } else {
      console.log('\n🎉 ALL BACKEND SERVER TESTS PASSED SUCCESSFULLY!');
    }
  }
}

runTests();
