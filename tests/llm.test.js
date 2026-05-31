import { generateRecommendations } from '../src/llm_service.js';

// Setup Mock Candidates
const mockCandidates = [
  {
    restaurant_name: 'Jalsa',
    city: 'Banashankari',
    cuisines: ['North Indian', 'Mughlai', 'Chinese'],
    average_cost_for_two: 800,
    normalized_budget_tier: 'Medium',
    aggregate_rating: 4.1,
    user_reviews: [
      'A beautiful place to dine in. The interiors take you back to the Mughal era. The lightings are just perfect.',
      'We went there on the occasion of Christmas. Ambiance is good with some good old Hindi music.'
    ],
    has_online_delivery: true,
    has_table_booking: true,
    address: '942, 21st Main Road, Banashankari, Bangalore'
  },
  {
    restaurant_name: 'Spice Elephant',
    city: 'Banashankari',
    cuisines: ['Chinese', 'North Indian', 'Thai'],
    average_cost_for_two: 800,
    normalized_budget_tier: 'Medium',
    aggregate_rating: 4.1,
    user_reviews: [
      'Had been here for dinner with family. suitability for all ages. Starters were excellent.',
      'Quiet and calm place. Tasty food, perfect for early family gathering.'
    ],
    has_online_delivery: true,
    has_table_booking: false,
    address: 'Kathriguppe, 3rd Stage, Banashankari, Bangalore'
  },
  {
    restaurant_name: 'San Churro Cafe',
    city: 'Banashankari',
    cuisines: ['Cafe', 'Mexican', 'Italian'],
    average_cost_for_two: 800,
    normalized_budget_tier: 'Medium',
    aggregate_rating: 3.8,
    user_reviews: [
      'Nutella churros are excellent, unique corporate feel. Good spacious place.',
      'Cheesecake is amazing. Best churros in Bangalore.'
    ],
    has_online_delivery: true,
    has_table_booking: false,
    address: '1112, 17th Cross, Banashankari, Bangalore'
  }
];

async function runTests() {
  console.log('🧪 Starting Automated LLM Orchestrator Integration Tests...');

  // Ensure key exists
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) {
    console.error('❌ FAIL: GROQ_API_KEY is not defined in the environment.');
    console.error('⚠️ Please add your actual Groq key to the .env file to run this integration test.');
    process.exit(1);
  }

  try {
    const userPreferences = {
      location: 'Banashankari',
      cuisine: 'Indian',
      budget: 'Medium',
      min_rating: 4.0,
      additional_notes: 'I am celebrating an anniversary dinner with my family. I want a place with royal interiors, beautiful lighting, and delicious North Indian food.'
    };

    console.log('👉 Querying Groq API Gateway for recommendations...');
    const start = performance.now();
    
    const result = await generateRecommendations({
      userPreferences,
      candidates: mockCandidates
    });
    
    const end = performance.now();
    console.log(`⏱️ Groq API Latency: ${(end - start).toFixed(2)} ms`);

    // 1. Validate Structure
    if (!result || typeof result !== 'object') {
      throw new Error('FAIL: Result is not a valid object.');
    }
    if (typeof result.summary !== 'string' || !result.summary.trim()) {
      throw new Error('FAIL: Missing or empty "summary" string.');
    }
    if (!Array.isArray(result.recommendations) || result.recommendations.length === 0) {
      throw new Error('FAIL: Recommendations array is empty or missing.');
    }

    console.log('\n📊 Recommendation Summary from AI:');
    console.log(`💬 "${result.summary}"`);

    console.log('\n🔍 Validating Recommendations List Schema:');
    for (const rec of result.recommendations) {
      console.log(`  ⭐ [Rank ${rec.rank}] Name: ${rec.name} | Rating: ${rec.rating} | Cost: ${rec.estimated_cost_for_two}`);
      console.log(`     Explanation: ${rec.ai_explanation}\n`);

      // Verify fields exist
      if (!rec.name || !rec.cuisine || !rec.rating || !rec.estimated_cost_for_two || !rec.ai_explanation) {
        throw new Error(`FAIL: Recommendation missing required fields: ${JSON.stringify(rec)}`);
      }

      // Verify hallucination filter (name must match mockCandidates name)
      const validNames = mockCandidates.map(c => c.restaurant_name);
      if (!validNames.includes(rec.name)) {
        throw new Error(`FAIL: Hallucination detected! "${rec.name}" was recommended but is not in valid candidate names.`);
      }
    }

    console.log('✅ PASS: Recommendation list contains only verified candidate restaurants.');
    console.log('✅ PASS: JSON mode successfully parsed and matches expected schema structure.');
    console.log('\n🎉 ALL LLM ORCHESTRATOR TESTS PASSED SUCCESSFULLY!');

  } catch (error) {
    console.error('\n❌ TEST RUN COMPLETED WITH FAILURES:');
    console.error(error.message);
    process.exit(1);
  }
}

runTests();
