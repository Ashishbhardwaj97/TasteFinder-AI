import { filterRestaurants } from '../src/filter_engine.js';

async function runTests() {
  console.log('🧪 Starting Automated Filtering Engine Tests...');

  try {
    // 1. Test: Strict Matching
    console.log('\n👉 Running Test 1: Strict Filtering');
    const result1 = await filterRestaurants({
      location: 'Banashankari',
      budgetTier: 'Medium',
      cuisine: 'North Indian',
      minRating: 4.0
    });

    if (result1.matches.length === 0) {
      throw new Error('FAIL: Strict matching returned 0 results, expected matches.');
    }
    console.log(`✅ PASS: Found ${result1.matches.length} strict matches (Total available: ${result1.totalMatches}).`);

    for (const r of result1.matches) {
      if (!r.city.toLowerCase().includes('banashankari')) {
        throw new Error(`FAIL: Match location does not fit query. Got: ${r.city}`);
      }
      if (r.normalized_budget_tier !== 'Medium') {
        throw new Error(`FAIL: Match budget does not fit query. Got: ${r.normalized_budget_tier}`);
      }
      if (!r.cuisines.some(c => c.toLowerCase().includes('north indian'))) {
        throw new Error(`FAIL: Match cuisines do not fit query. Got: ${r.cuisines}`);
      }
      if (r.aggregate_rating < 4.0) {
        throw new Error(`FAIL: Match rating is lower than minRating limit. Got: ${r.aggregate_rating}`);
      }
    }
    console.log('✅ PASS: All strictly returned records satisfy criteria boundaries.');

    // 2. Test: Pruning Limits
    console.log('\n👉 Running Test 2: Pruning Limits (Target limit: 3)');
    const result2 = await filterRestaurants({
      location: 'Banashankari',
      targetLimit: 3
    });
    if (result2.matches.length > 3) {
      throw new Error(`FAIL: Returned record count exceeds target limit. Got: ${result2.matches.length}`);
    }
    console.log(`✅ PASS: Returned record count is strictly bounded by ${result2.matches.length} matches.`);

    // 3. Test: Constraint Relaxation (Fallback 1: Rating)
    console.log('\n👉 Running Test 3: Constraint Relaxation (High Rating)');
    const result3 = await filterRestaurants({
      location: 'Banashankari',
      budgetTier: 'Medium',
      cuisine: 'North Indian',
      minRating: 4.8 // An extremely high rating to trigger fallback relaxation
    });

    if (result3.matches.length === 0) {
      throw new Error('FAIL: Fallback relaxation did not yield results.');
    }
    if (!result3.fallbackApplied) {
      throw new Error('FAIL: Fallback should have been triggered for highly strict rating.');
    }
    console.log('✅ PASS: Fallback successfully triggered. Reason:', result3.fallbackReason);

    // 4. Test: Search Latency Metrics
    console.log('\n👉 Running Test 4: Search Latency Performance Check');
    const start = performance.now();
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      await filterRestaurants({
        location: 'Banashankari',
        budgetTier: 'Medium',
        cuisine: 'North Indian',
        minRating: 4.0
      });
    }
    const end = performance.now();
    const totalTime = end - start;
    const avgLatency = totalTime / iterations;

    console.log(`📊 Latency Metrics over ${iterations} queries:`);
    console.log(`⏱️ Total Time: ${totalTime.toFixed(2)} ms`);
    console.log(`⏱️ Average Search Latency: ${avgLatency.toFixed(2)} ms`);

    if (avgLatency > 20) {
      throw new Error(`FAIL: Average search latency exceeds 20ms. Got: ${avgLatency.toFixed(2)} ms`);
    }
    console.log('✅ PASS: Search engine latency matches target (< 20ms).');

    console.log('\n🎉 ALL FILTER ENGINE TESTS PASSED SUCCESSFULLY!');

  } catch (error) {
    console.error(`\n❌ TEST RUN COMPLETED WITH FAILURES:`);
    console.error(error.message);
    process.exit(1);
  }
}

runTests();
