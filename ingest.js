import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target dataset parameters
const DATASET_NAME = 'ManikaSaini/zomato-restaurant-recommendation';
const CACHE_DIR = path.join(__dirname, 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'zomato_cache.json');
const TARGET_RECORDS = 2000;
const LIMIT_PER_REQUEST = 100;

/**
 * Normalizes rating string into a standard float
 * e.g., "4.1/5" -> 4.1, "NEW" or "Not Rated" -> 0.0
 */
function cleanRating(rateStr) {
  if (!rateStr || typeof rateStr !== 'string') return 0.0;
  const cleaned = rateStr.trim().toLowerCase();
  if (cleaned.includes('new') || cleaned.includes('-') || cleaned.includes('not rated')) {
    return 0.0;
  }
  const parts = cleaned.split('/');
  if (parts.length > 0) {
    const val = parseFloat(parts[0]);
    return isNaN(val) ? 0.0 : val;
  }
  return 0.0;
}

/**
 * Parses Python-like tuple lists for reviews
 * e.g., "[('Rated 4.0', 'RATED\\n  Good food...'), ...]"
 */
function cleanReviews(reviewsStr) {
  if (!reviewsStr || typeof reviewsStr !== 'string') return [];
  const reviews = [];
  try {
    // A robust regex search to pull out the review texts inside quotes
    // e.g. ('Rated X.Y', 'text content')
    const matches = reviewsStr.matchAll(/\('Rated \d\.\d',\s*['"](.*?)['"]\)/gs);
    for (const match of matches) {
      let content = match[1] || '';
      // Clean up escape characters and newlines
      content = content
        .replace(/\\n/g, ' ')
        .replace(/\\r/g, '')
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/Ãƒ.*?Ã‚/g, '') // strip corrupt characters if any
        .trim();
      
      // Filter out empty or trivial reviews
      if (content.length > 5 && !content.startsWith('RATED')) {
        reviews.push(content);
      } else if (content.startsWith('RATED')) {
        const cleanedContent = content.substring(5).trim();
        if (cleanedContent) reviews.push(cleanedContent);
      }
    }
  } catch (err) {
    // Fallback if parsing fails
  }
  
  // Return at most top 5 clean reviews to conserve space and tokens
  return reviews.slice(0, 5);
}

/**
 * Normalizes cuisine strings into clean arrays
 */
function cleanCuisines(cuisinesStr) {
  if (!cuisinesStr || typeof cuisinesStr !== 'string') {
    return ['Multi-cuisine'];
  }
  const list = cuisinesStr.split(',')
    .map(c => c.trim())
    .filter(c => c.length > 0);
  return list.length > 0 ? list : ['Multi-cuisine'];
}

/**
 * Normalizes cost strings into clean integers
 */
function cleanCost(costStr) {
  if (!costStr || typeof costStr !== 'string') return 400; // default standard cost fallback
  const cleaned = costStr.replace(/,/g, '').trim();
  const cost = parseInt(cleaned, 10);
  return isNaN(cost) || cost <= 0 ? 400 : cost;
}

/**
 * Maps cost integers to Low, Medium, High budget tiers
 */
function getBudgetTier(cost) {
  if (cost < 500) return 'Low';
  if (cost <= 1200) return 'Medium';
  return 'High';
}

/**
 * Programmatic pre-ingestion flow
 */
async function startIngestion() {
  console.log(`🚀 Starting Ingestion for HF dataset: ${DATASET_NAME}`);
  console.log(`🎯 Target Records to fetch: ${TARGET_RECORDS}`);

  const cleanedRecords = [];
  let offset = 0;
  let hasMore = true;

  // Make sure target cache folder exists
  await fs.mkdir(CACHE_DIR, { recursive: true });

  while (cleanedRecords.length < TARGET_RECORDS && hasMore) {
    const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(DATASET_NAME)}&config=default&split=train&offset=${offset}&limit=${LIMIT_PER_REQUEST}`;
    console.log(`📥 Fetching rows offset ${offset} to ${offset + LIMIT_PER_REQUEST}...`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      if (!data.rows || data.rows.length === 0) {
        console.log('🏁 No more rows returned from server.');
        hasMore = false;
        break;
      }

      console.log(`📦 Loaded ${data.rows.length} raw rows. Parsing...`);
      for (const item of data.rows) {
        if (cleanedRecords.length >= TARGET_RECORDS) break;

        const row = item.row;
        const name = row.name ? row.name.trim() : '';
        const location = row.location ? row.location.trim() : '';

        // Drop record if mandatory fields are missing
        if (!name || !location) continue;

        const cost = cleanCost(row['approx_cost(for two people)']);
        const rating = cleanRating(row.rate);
        const cuisines = cleanCuisines(row.cuisines);
        const budgetTier = getBudgetTier(cost);
        const reviews = cleanReviews(row.reviews_list);

        cleanedRecords.push({
          restaurant_name: name,
          city: location,
          cuisines: cuisines,
          average_cost_for_two: cost,
          normalized_budget_tier: budgetTier,
          aggregate_rating: rating,
          user_reviews: reviews,
          has_online_delivery: (row.online_order || '').trim().toLowerCase() === 'yes',
          has_table_booking: (row.book_table || '').trim().toLowerCase() === 'yes',
          address: row.address ? row.address.trim() : ''
        });
      }

      console.log(`✅ Total successfully cleaned so far: ${cleanedRecords.length}`);
      offset += LIMIT_PER_REQUEST;

      // Small throttling delay to be a good citizen to HF APIs
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (error) {
      console.error(`❌ Ingestion failed at offset ${offset}:`, error.message);
      console.log('⚠️ Aborting loop. Storing whatever has been loaded.');
      hasMore = false;
      break;
    }
  }

  if (cleanedRecords.length === 0) {
    console.error('❌ Failed to ingest any valid records.');
    process.exit(1);
  }

  // Persist structured cache data
  await fs.writeFile(CACHE_FILE, JSON.stringify(cleanedRecords, null, 2), 'utf-8');
  console.log(`\n🎉 Ingestion Completed Successfully!`);
  console.log(`💾 Cache written to: ${CACHE_FILE}`);
  console.log(`📊 Total Restaurants Cached: ${cleanedRecords.length}`);
}

startIngestion();
