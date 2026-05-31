import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.join(__dirname, '..', 'data', 'zomato_cache.json');

async function runTests() {
  console.log('🧪 Starting Automated Ingestion Verification Tests...');

  try {
    // 1. Test: File Existence
    try {
      await fs.access(CACHE_FILE);
      console.log('✅ PASS: Cache file "data/zomato_cache.json" exists.');
    } catch (err) {
      throw new Error(`FAIL: Cache file does not exist at "${CACHE_FILE}". Run ingestion first.`);
    }

    // 2. Test: Parsing JSON
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    let records;
    try {
      records = JSON.parse(content);
      console.log('✅ PASS: Cache file parsed successfully as JSON.');
    } catch (err) {
      throw new Error('FAIL: Cache file is not valid JSON.');
    }

    // 3. Test: Record Count
    if (!Array.isArray(records)) {
      throw new Error('FAIL: Cache data root is not a JSON Array.');
    }
    if (records.length < 100) {
      throw new Error(`FAIL: Ingested record size is too low (${records.length} records found).`);
    }
    console.log(`✅ PASS: Ingested array contains a robust set of ${records.length} records.`);

    // 4. Test: Sample Record Structural Verification
    const sample = records[0];
    const requiredKeys = [
      'restaurant_name',
      'city',
      'cuisines',
      'average_cost_for_two',
      'normalized_budget_tier',
      'aggregate_rating',
      'user_reviews',
      'has_online_delivery',
      'has_table_booking',
      'address'
    ];

    console.log('🔍 Sampling record schema verification:', JSON.stringify(sample, null, 2));

    for (const key of requiredKeys) {
      if (!(key in sample)) {
        throw new Error(`FAIL: Sample record is missing required field "${key}".`);
      }
    }
    console.log('✅ PASS: All required database schema fields are present in the sample.');

    // 5. Test: Field Data Types and Rules
    if (typeof sample.restaurant_name !== 'string' || !sample.restaurant_name.trim()) {
      throw new Error('FAIL: "restaurant_name" must be a non-empty string.');
    }
    if (typeof sample.city !== 'string' || !sample.city.trim()) {
      throw new Error('FAIL: "city" must be a non-empty string.');
    }
    if (!Array.isArray(sample.cuisines) || sample.cuisines.length === 0) {
      throw new Error('FAIL: "cuisines" must be a non-empty array of strings.');
    }
    if (typeof sample.average_cost_for_two !== 'number' || sample.average_cost_for_two <= 0) {
      throw new Error('FAIL: "average_cost_for_two" must be a positive number.');
    }
    const budgetTiers = ['Low', 'Medium', 'High'];
    if (!budgetTiers.includes(sample.normalized_budget_tier)) {
      throw new Error(`FAIL: "normalized_budget_tier" must be one of Low, Medium, High. Got: ${sample.normalized_budget_tier}`);
    }
    if (typeof sample.aggregate_rating !== 'number' || sample.aggregate_rating < 0 || sample.aggregate_rating > 5) {
      throw new Error(`FAIL: "aggregate_rating" must be a float between 0.0 and 5.0. Got: ${sample.aggregate_rating}`);
    }
    if (!Array.isArray(sample.user_reviews)) {
      throw new Error('FAIL: "user_reviews" must be an array.');
    }
    if (typeof sample.has_online_delivery !== 'boolean') {
      throw new Error('FAIL: "has_online_delivery" must be a boolean.');
    }
    if (typeof sample.has_table_booking !== 'boolean') {
      throw new Error('FAIL: "has_table_booking" must be a boolean.');
    }
    if (typeof sample.address !== 'string') {
      throw new Error('FAIL: "address" must be a string.');
    }

    console.log('✅ PASS: Data type rules verified successfully.');
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');

  } catch (error) {
    console.error(`\n❌ TEST RUN COMPLETED WITH FAILURES:`);
    console.error(error.message);
    process.exit(1);
  }
}

runTests();
