import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { filterRestaurants } from './filter_engine.js';
import { generateRecommendations } from './llm_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define default server settings
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

// Pricing variables for Groq llama-3.3-70b-versatile
const PROMPT_COST_PER_MILLION = 0.59;
const COMPLETION_COST_PER_MILLION = 0.79;

/**
 * -------------------------------------------------------------
 * 1. Bounded In-Memory Cache (LRU-based with TTL)
 * -------------------------------------------------------------
 */
class RecommendationCache {
  constructor(maxSize = 100, ttlMs = 3600000) { // 1 Hour TTL by default
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // Refresh access order by re-inserting
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      // Evict oldest entry (the first insertion item in standard Map)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs
    });
  }

  clear() {
    this.store.clear();
  }
}

const cache = new RecommendationCache();

// Active/pending requests Map to handle Request Coalescing (Single Flight)
const pendingRequests = new Map();

/**
 * Normalizes user preferences payload to construct a consistent cache key
 */
function getCacheKey(prefs) {
  return JSON.stringify({
    location: (prefs.location || '').trim().toLowerCase(),
    budget: (prefs.budget || '').trim(),
    cuisine: (prefs.cuisine || '').trim().toLowerCase(),
    min_rating: parseFloat(prefs.min_rating) || 0.0,
    additional_notes: (prefs.additional_notes || '').trim().toLowerCase(),
    limit: parseInt(prefs.limit, 10) || 5
  });
}

/**
 * -------------------------------------------------------------
 * 2. Request Schema & Payload Validation
 * -------------------------------------------------------------
 */
function validatePayload(body) {
  const errors = [];
  
  if (body === null || typeof body !== 'object') {
    return { isValid: false, errors: ['Request body must be a valid JSON object.'] };
  }

  // Location is strictly required
  if (typeof body.location !== 'string' || !body.location.trim()) {
    errors.push('Field "location" is required and must be a non-empty string.');
  }

  // Budget is optional, but if specified, must be matching tiers
  if (body.budget !== undefined && body.budget !== null) {
    const validBudgets = ['Low', 'Medium', 'High'];
    if (!validBudgets.includes(body.budget)) {
      errors.push(`Field "budget" must be one of: ${validBudgets.join(', ')}.`);
    }
  }

  // Cuisine is optional, must be a string if defined
  if (body.cuisine !== undefined && body.cuisine !== null) {
    if (typeof body.cuisine !== 'string') {
      errors.push('Field "cuisine" must be a string.');
    }
  }

  // min_rating is optional, must be a valid float between 0.0 and 5.0
  if (body.min_rating !== undefined && body.min_rating !== null) {
    const ratingVal = parseFloat(body.min_rating);
    if (isNaN(ratingVal) || ratingVal < 0 || ratingVal > 5) {
      errors.push('Field "min_rating" must be a number between 0.0 and 5.0.');
    }
  }

  // additional_notes is optional, must be a string if defined
  if (body.additional_notes !== undefined && body.additional_notes !== null) {
    if (typeof body.additional_notes !== 'string') {
      errors.push('Field "additional_notes" must be a string.');
    }
  }

  // limit is optional, must be a valid integer between 1 and 5
  if (body.limit !== undefined && body.limit !== null) {
    const limitVal = parseInt(body.limit, 10);
    if (isNaN(limitVal) || limitVal < 1 || limitVal > 5) {
      errors.push('Field "limit" must be an integer between 1 and 5.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * -------------------------------------------------------------
 * 3. Static Files Serving Engine
 * -------------------------------------------------------------
 */
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

async function serveStaticFile(reqPath, res) {
  try {
    // Basic path cleaning
    let safePath = reqPath === '/' ? '/index.html' : reqPath;
    const resolvedPath = path.join(PUBLIC_DIR, safePath);

    // Security: Prevent directory traversal out of public folder
    if (!resolvedPath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access Denied: Path outside public root is forbidden.' }));
      return;
    }

    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Not Found: ${reqPath} is not a file.` }));
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = await fs.readFile(resolvedPath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      'Cache-Control': 'public, max-age=3600'
    });
    res.end(content);
  } catch (err) {
    // If files are missing (like when frontend isn't fully created yet), return 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `File Not Found: ${reqPath}` }));
  }
}

/**
 * Helper to set common HTTP response headers (JSON + CORS)
 */
function setCommonHeaders(res, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400' // cache preflight for 24h
  });
}

/**
 * Reads request body stream safely
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) { // 1MB payload ceiling safety
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', err => reject(err));
  });
}

/**
 * -------------------------------------------------------------
 * 4. HTTP Application Server
 * -------------------------------------------------------------
 */
const server = http.createServer(async (req, res) => {
  const start = performance.now();
  const timestamp = new Date().toISOString();
  
  // Initialize logging properties
  let logStatus = 200;
  let logCache = 'MISS';
  let logTokens = { prompt: 0, completion: 0, total: 0 };
  let logCost = 0;

  // Handle CORS OPTIONS preflight
  if (req.method === 'OPTIONS') {
    setCommonHeaders(res, 204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // Route: POST /api/recommend
    if (req.method === 'POST' && url.pathname === '/api/recommend') {
      const rawBody = await readRequestBody(req);
      let payload;
      
      try {
        payload = JSON.parse(rawBody);
      } catch (err) {
        logStatus = 400;
        setCommonHeaders(res, 400);
        res.end(JSON.stringify({ error: 'Malformed JSON payload.' }));
        return;
      }

      // Validate schema
      const validation = validatePayload(payload);
      if (!validation.isValid) {
        logStatus = 400;
        setCommonHeaders(res, 400);
        res.end(JSON.stringify({ error: 'Validation Failed', details: validation.errors }));
        return;
      }

      const cacheKey = getCacheKey(payload);

      // 1. Check standard Cache first
      const cachedResponse = cache.get(cacheKey);
      if (cachedResponse) {
        logCache = 'HIT';
        logTokens = cachedResponse.usage || logTokens;
        logCost = cachedResponse.cost || 0;
        
        setCommonHeaders(res, 200);
        res.end(JSON.stringify(cachedResponse.data));
        return;
      }

      // 2. Request Coalescing: Check if an identical request is already actively calling the LLM
      let activePromise = pendingRequests.get(cacheKey);
      if (activePromise) {
        logCache = 'COALESCED';
        const coalescedResponse = await activePromise;
        logTokens = coalescedResponse.usage || logTokens;
        logCost = coalescedResponse.cost || 0;

        setCommonHeaders(res, 200);
        res.end(JSON.stringify(coalescedResponse.data));
        return;
      }

      // 3. Cache & Coalescence MISS - Define the single-flight request task
      const requestTask = (async () => {
        // Step A: Filtering candidates
        const filterResult = await filterRestaurants({
          location: payload.location,
          budgetTier: payload.budget || '',
          cuisine: payload.cuisine || '',
          minRating: payload.min_rating ? parseFloat(payload.min_rating) : 0.0,
          targetLimit: 10
        });

        // Step B: Invoke LLM Orchestrator
        const recommendationResponse = await generateRecommendations({
          userPreferences: {
            location: payload.location,
            cuisine: payload.cuisine || '',
            budget: payload.budget || '',
            min_rating: payload.min_rating || 0.0,
            additional_notes: payload.additional_notes || ''
          },
          candidates: filterResult.matches,
          limit: parseInt(payload.limit, 10) || 5
        });

        // Calculate token cost
        const usage = recommendationResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        const tk = {
          prompt: usage.prompt_tokens,
          completion: usage.completion_tokens,
          total: usage.total_tokens
        };
        const cost = (tk.prompt * PROMPT_COST_PER_MILLION + tk.completion * COMPLETION_COST_PER_MILLION) / 1000000;

        const finalResponseData = {
          summary: recommendationResponse.summary,
          recommendations: recommendationResponse.recommendations,
          fallback_metadata: {
            fallback_applied: filterResult.fallbackApplied,
            fallback_reason: filterResult.fallbackReason
          }
        };

        const resultObj = {
          data: finalResponseData,
          usage: tk,
          cost: cost
        };

        // Cache the result
        cache.set(cacheKey, resultObj);

        return resultObj;
      })();

      // Register the active promise
      pendingRequests.set(cacheKey, requestTask);

      try {
        const finalResponse = await requestTask;
        logTokens = finalResponse.usage || logTokens;
        logCost = finalResponse.cost || 0;

        setCommonHeaders(res, 200);
        res.end(JSON.stringify(finalResponse.data));
      } finally {
        // Clean up pending requests once resolved/rejected
        pendingRequests.delete(cacheKey);
      }
      return;
    }

    // Default Router: Serve static frontend files if matching GET
    if (req.method === 'GET') {
      await serveStaticFile(url.pathname, res);
      return;
    }

    // Catch-All Endpoint Not Found
    logStatus = 404;
    setCommonHeaders(res, 404);
    res.end(JSON.stringify({ error: `Route not found: ${req.method} ${url.pathname}` }));

  } catch (error) {
    logStatus = 500;
    console.error(`[Server Error] ${error.stack || error.message}`);
    setCommonHeaders(res, 500);
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message
    }));
  } finally {
    const duration = (performance.now() - start).toFixed(2);
    // Print highly optimized log line
    if (req.method === 'POST' && req.url === '/api/recommend') {
      console.log(`[INFO] [${timestamp}] POST /api/recommend - Latency: ${duration} ms | Status: ${logStatus} | Cache: ${logCache} | Tokens: ${logTokens.total} (P: ${logTokens.prompt}, C: ${logTokens.completion}) | Cost: $${logCost.toFixed(5)}`);
    } else if (req.method !== 'OPTIONS') {
      console.log(`[INFO] [${timestamp}] ${req.method} ${req.url} - Latency: ${duration} ms | Status: ${logStatus}`);
    }
  }
});

// Start listening if executed directly
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  server.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`🚀 Zomato Recommendation Backend Service Running on Port ${PORT}`);
    console.log(`📂 Static Root: ${PUBLIC_DIR}`);
    console.log(`🔌 API Endpoint: http://localhost:${PORT}/api/recommend`);
    console.log(`================================================================`);
  });
}

export { server, cache };
