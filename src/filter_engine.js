import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.join(__dirname, '..', 'data', 'zomato_cache.json');

let cachedData = null;

/**
 * Loads the restaurant database from local JSON cache
 */
async function loadCache() {
  if (cachedData) return cachedData;
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf-8');
    cachedData = JSON.parse(raw);
    return cachedData;
  } catch (err) {
    throw new Error(`[Filter Engine] Failed to load data cache from ${CACHE_FILE}: ${err.message}`);
  }
}

/**
 * Performs sorting of records based on rating (desc) and cost (asc)
 */
function sortRecords(records) {
  return [...records].sort((a, b) => {
    // Sort by rating descending
    if (b.aggregate_rating !== a.aggregate_rating) {
      return b.aggregate_rating - a.aggregate_rating;
    }
    // Secondary sort by cost ascending
    return a.average_cost_for_two - b.average_cost_for_two;
  });
}

/**
 * Filters the restaurant database based on strict criteria
 */
function applyFilters(data, { location, budgetTier, cuisine, minRating }) {
  const normLocation = (location || '').trim().toLowerCase();
  const normCuisine = (cuisine || '').trim().toLowerCase();
  const normBudget = (budgetTier || '').trim();
  const targetRating = typeof minRating === 'number' ? minRating : 0.0;

  return data.filter(r => {
    // 1. Location match (case-insensitive substring)
    if (normLocation && !r.city.toLowerCase().includes(normLocation)) {
      return false;
    }
    
    // 2. Cuisine match (case-insensitive substring across array elements)
    if (normCuisine && !r.cuisines.some(c => c.toLowerCase().includes(normCuisine))) {
      return false;
    }

    // 3. Budget match (strict tier check)
    if (normBudget && r.normalized_budget_tier !== normBudget) {
      return false;
    }

    // 4. Rating match (equal or greater check)
    if (r.aggregate_rating < targetRating) {
      return false;
    }

    return true;
  });
}

/**
 * Core Public Search Engine with Step-by-Step Fallback Relaxation
 */
export async function filterRestaurants({
  location = '',
  budgetTier = '',
  cuisine = '',
  minRating = 0.0,
  targetLimit = 10
}) {
  const data = await loadCache();
  
  let matches = applyFilters(data, { location, budgetTier, cuisine, minRating });
  let fallbackApplied = false;
  let fallbackReason = null;

  // --- Fallback Relaxation Pipeline ---
  
  // Step 1: Lower rating by 0.5 points
  if (matches.length === 0 && minRating > 0) {
    const relaxedRating = Math.max(0, minRating - 0.5);
    console.log(`[Filter Engine] 0 matches. Relaxing rating limit: ${minRating} -> ${relaxedRating}`);
    matches = applyFilters(data, { location, budgetTier, cuisine, minRating: relaxedRating });
    if (matches.length > 0) {
      fallbackApplied = true;
      fallbackReason = `Relaxed minimum rating threshold from ${minRating} to ${relaxedRating} to produce results.`;
    }
  }

  // Step 2: Broaden budget categories to neighboring tiers
  if (matches.length === 0 && budgetTier) {
    console.log(`[Filter Engine] 0 matches. Broadening budget tier constraints for: ${budgetTier}`);
    let allowedBudgets = [budgetTier];
    if (budgetTier === 'Low') allowedBudgets = ['Low', 'Medium'];
    else if (budgetTier === 'High') allowedBudgets = ['Medium', 'High'];
    else allowedBudgets = ['Low', 'Medium', 'High'];

    matches = data.filter(r => {
      if (location && !r.city.toLowerCase().includes(location.trim().toLowerCase())) return false;
      if (cuisine && !r.cuisines.some(c => c.toLowerCase().includes(cuisine.trim().toLowerCase()))) return false;
      if (!allowedBudgets.includes(r.normalized_budget_tier)) return false;
      return true;
    });

    if (matches.length > 0) {
      fallbackApplied = true;
      fallbackReason = `Broadened budget constraints from "${budgetTier}" to include adjacent bands.`;
    }
  }

  // Step 3: Remove cuisine restriction (match any food style in locality)
  if (matches.length === 0 && cuisine) {
    console.log(`[Filter Engine] 0 matches. Removing cuisine restriction: ${cuisine}`);
    matches = data.filter(r => {
      if (location && !r.city.toLowerCase().includes(location.trim().toLowerCase())) return false;
      if (budgetTier && r.normalized_budget_tier !== budgetTier) return false;
      return true;
    });
    if (matches.length > 0) {
      fallbackApplied = true;
      fallbackReason = `Removed cuisine preference (${cuisine}) to display available options in the area.`;
    }
  }

  // Step 4: Remove location restriction (widen search globally)
  if (matches.length === 0 && location) {
    console.log(`[Filter Engine] 0 matches. Removing location restriction: ${location}`);
    matches = data.filter(r => {
      if (cuisine && !r.cuisines.some(c => c.toLowerCase().includes(cuisine.trim().toLowerCase()))) return false;
      if (budgetTier && r.normalized_budget_tier !== budgetTier) return false;
      return true;
    });
    if (matches.length > 0) {
      fallbackApplied = true;
      fallbackReason = `Widened search location beyond "${location}" to fetch matches.`;
    }
  }

  // Final fallback: Return best rated restaurants overall
  if (matches.length === 0) {
    console.log('[Filter Engine] 0 matches even after full relaxation. Returning highest-rated options overall.');
    matches = [...data];
    fallbackApplied = true;
    fallbackReason = 'No exact matches found. Displaying general top-rated recommendations.';
  }

  // Sort matched options by rating desc and cost asc
  const sorted = sortRecords(matches);
  const sliced = sorted.slice(0, targetLimit);

  return {
    matches: sliced,
    totalMatches: matches.length,
    fallbackApplied,
    fallbackReason
  };
}
