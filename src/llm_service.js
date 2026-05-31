/**
 * AI Recommendation Engine Orchestrator
 * Integrates with Groq API Gateway using native fetch.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Builds the comprehensive System Instructions for Groq
 */
function buildSystemPrompt(limit = 5) {
  return `You are an elite, local food guide and culinary recommendation expert. Your job is to review a provided list of candidate restaurants and select the best matching ones.

CRITICAL DIRECTIVES:
1. ONLY recommend restaurants that are present in the provided "CANDIDATE LIST CONTEXT". Do NOT invent or hallucinate new restaurants.
2. You MUST return exactly ${limit} recommendations. If there are fewer than ${limit} candidates in the list, return all available candidates.
3. For each recommendation, provide a highly personalized, 2-3 sentence "ai_explanation". Explain precisely how it matches the user's specific implicit desires (e.g. if they want a "romantic atmosphere", explain why the lighting, reviews, or layout of that specific restaurant matches).
4. Do NOT include conversational filler, markdown formatting wrappers, or additional intro text.
5. You MUST respond in a strict JSON format matching this exact schema:
{
  "summary": "A 2-3 sentence general summary showcasing the customized culinary journey recommended",
  "recommendations": [
    {
      "rank": 1,
      "name": "Restaurant Name (must match candidate list exactly)",
      "cuisine": "Comma-separated cuisines offered",
      "rating": 4.5,
      "estimated_cost_for_two": 800,
      "ai_explanation": "Context-aware explanation detailing why this restaurant matches the user's implicit preferences."
    }
  ]
}`;
}

/**
 * Builds the user context details
 */
function buildUserPrompt(userPreferences, candidates, limit = 5) {
  const cleanCandidates = candidates.map(c => ({
    name: c.restaurant_name,
    city: c.city,
    cuisines: c.cuisines,
    cost_for_two: c.average_cost_for_two,
    rating: c.aggregate_rating,
    reviews: c.user_reviews
  }));

  return `======================== CANDIDATE LIST CONTEXT ========================
${JSON.stringify(cleanCandidates, null, 2)}

========================= USER PREFERENCES =========================
- Target City: ${userPreferences.location || 'Any'}
- Desired Cuisine: ${userPreferences.cuisine || 'Any'}
- Budget Level: ${userPreferences.budget || 'Any'}
- Minimum Rating Limit: ${userPreferences.min_rating || '0.0'}
- Semantic Wishes: "${userPreferences.additional_notes || 'None'}"

========================================================================
Rank and return the top ${limit} matching restaurants as a JSON object now.`;
}

/**
 * Programmatic guard checking for hallucinations and schema validity
 */
function validateAndPruneResponse(parsedData, candidates, limit = 5) {
  if (!parsedData || typeof parsedData !== 'object') {
    throw new Error('LLM output is not a valid JSON object.');
  }

  if (typeof parsedData.summary !== 'string' || !parsedData.summary.trim()) {
    parsedData.summary = 'Here are our top tailored restaurant recommendations matching your preferences.';
  }

  if (!Array.isArray(parsedData.recommendations)) {
    throw new Error('LLM output "recommendations" field is not an array.');
  }

  const validRecommendations = [];
  const candidateNames = candidates.map(c => c.restaurant_name.toLowerCase().trim());

  for (const rec of parsedData.recommendations) {
    if (!rec.name) continue;

    const normRecName = rec.name.toLowerCase().trim();
    const matchIdx = candidateNames.indexOf(normRecName);

    // Strict Hallucination Filter: The restaurant MUST exist in our candidate lists
    if (matchIdx === -1) {
      console.warn(`[LLM Service] Hallucination detected and filtered: "${rec.name}" is not in the candidate list.`);
      continue;
    }

    const originalCandidate = candidates[matchIdx];

    // Align schema fields with the verified database parameters to ensure absolute truth
    validRecommendations.push({
      rank: typeof rec.rank === 'number' ? rec.rank : validRecommendations.length + 1,
      name: originalCandidate.restaurant_name,
      cuisine: originalCandidate.cuisines.join(', '),
      rating: originalCandidate.aggregate_rating,
      estimated_cost_for_two: originalCandidate.average_cost_for_two,
      ai_explanation: (rec.ai_explanation || '').trim() || `Excellent choice matching your preferred cuisine in ${originalCandidate.city}.`
    });
  }

  // Ensure ranking order is standard 1, 2, 3...
  const finalizedRecs = validRecommendations.map((r, i) => ({
    ...r,
    rank: i + 1
  }));

  // Fallback if the LLM hallucinated everything or returned empty results
  if (finalizedRecs.length === 0 && candidates.length > 0) {
    console.log('[LLM Service] 0 valid recommendations returned after pruning. Constructing rule-based fallback suggestions.');
    const fallbackSlice = candidates.slice(0, limit);
    return {
      summary: 'Here are the best matching restaurants found programmatically for your query.',
      recommendations: fallbackSlice.map((c, i) => ({
        rank: i + 1,
        name: c.restaurant_name,
        cuisine: c.cuisines.join(', '),
        rating: c.aggregate_rating,
        estimated_cost_for_two: c.average_cost_for_two,
        ai_explanation: `Highly rated restaurant offering ${c.cuisines.join(', ')} in ${c.city}.`
      }))
    };
  }

  return {
    summary: parsedData.summary,
    recommendations: finalizedRecs
  };
}

/**
 * Synthesizes dynamic prompts and executes Chat Completion with Groq Cloud
 */
export async function generateRecommendations({ userPreferences, candidates, limit = 5 }) {
  const apiKey = process.env.GROQ_API_KEY;
  const modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  // --- MOCK MODE FOR OFFLINE / TEST RUNS ---
  if (process.env.MOCK_LLM === 'true') {
    const mockSlice = (candidates || []).slice(0, limit);
    return {
      summary: 'This is a mocked AI recommendation summary matching your preferences.',
      recommendations: mockSlice.map((c, i) => ({
        rank: i + 1,
        name: c.restaurant_name,
        cuisine: c.cuisines.join(', '),
        rating: c.aggregate_rating,
        estimated_cost_for_two: c.average_cost_for_two,
        ai_explanation: `Mocked AI explanation: Highly rated restaurant offering ${c.cuisines.join(', ')} in ${c.city}.`
      })),
      usage: { prompt_tokens: 350, completion_tokens: 150, total_tokens: 500 }
    };
  }

  if (!apiKey || apiKey.startsWith('your_')) {
    throw new Error('[LLM Service] Missing or invalid GROQ_API_KEY inside your .env configuration.');
  }

  // Handle case where candidates list is empty before calling LLM
  if (!candidates || candidates.length === 0) {
    return {
      summary: 'No candidates matched your search criteria, so we could not generate personalized AI suggestions.',
      recommendations: [],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
  }

  const systemPrompt = buildSystemPrompt(limit);
  const userPrompt = buildUserPrompt(userPreferences, candidates, limit);

  console.log(`[LLM Service] Dispatching prompt to Groq Cloud Gateway (model: ${modelName})...`);

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        temperature: 0.2, // low temperature for precise, structural adherence
        response_format: { type: 'json_object' }, // strict JSON Mode
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API Error! HTTP Status: ${response.status}. Details: ${errText}`);
    }

    const payload = await response.json();
    const rawContent = payload.choices[0].message.content;
    
    // Parse response
    const parsedJSON = JSON.parse(rawContent.trim());
    
    // Validate schema structure & filter hallucinations
    const validatedData = validateAndPruneResponse(parsedJSON, candidates, limit);
    
    console.log(`[LLM Service] Successfully parsed, validated, and pruned ${validatedData.recommendations.length} recommendations.`);
    return {
      ...validatedData,
      usage: payload.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };

  } catch (error) {
    console.error('[LLM Service] Error calling Groq API:', error.message);
    throw error;
  }
}
