# Edge Cases and Error Mitigation Strategies

This document identifies potential edge cases across the entire lifecycle of the **AI-Powered Restaurant Recommendation System** and outlines the programmatic mitigation strategies to ensure system stability, security, and exceptional user experience.

---

## 📊 Summary of System Dimensions

```
   [User Input]          [Data Preprocessing]           [LLM API Gateway]
        |                        |                             |
        v                        v                             v
• Spelling Errors        • NULL/Missing Values         • Malformed JSON Outputs
• Zero-Match Queries     • Malformed Prices            • Hallucinations
• Injection Attacks      • Dataset Outages             • API Timeouts / Rate Limits
```

---

## 🗄️ 1. Data Ingestion & Preprocessing Edge Cases

| Edge Case | Impact | Programmatic Mitigation Strategy |
| :--- | :--- | :--- |
| **Hugging Face Service Outage** | Application fails to build or boot because the dataset cannot be retrieved. | **Pre-cached Bootloader**: Implement a dual-loading mechanism. The server checks for a local file (`Docs/zomato_cache.json`). If present, it loads data instantly. If absent, it queries Hugging Face and writes to the cache. |
| **NULL / Empty Key Fields** | Crashing in sorting, string analysis, or JSON serialization if values like `cuisines` or `city` are `None`. | **Imputation & Pruning**: During the ingestion phase, if `restaurant_name` or `city` is empty, drop the record entirely. If `cuisines` is empty, assign it a default tag `["Multi-cuisine"]`. |
| **Out-of-Bounds/Negative Cost** | Mathematical error in budget-tier categorizations. | **Default Banding**: If `average_cost_for_two` is $\le 0$, automatically impute it based on the median cost of restaurants in that specific locality. |
| **Invalid Ratings Format** | String ratings (e.g., `"Not Rated"` or `"NEW"`) corrupting floating-point threshold filters. | **Float Normalization**: Convert raw ratings strings. Map `"Not Rated"` or `"NEW"` to a float score of `0.0` rather than causing parsing exceptions. |

---

## 👤 2. User Input Edge Cases

| Edge Case | Impact | Programmatic Mitigation Strategy |
| :--- | :--- | :--- |
| **Misspelled / Missing Location** | Zero matches are returned because of slight typos (e.g., `"Delh"` instead of `"Delhi"`). | **Fuzzy String Matching**: Integrate a string distance algorithm (such as Levenshtein distance) to match user input to the closest available unique location in the dataset. |
| **Zero Programmatic Matches** | Hard filters on cuisine, rating, and budget result in an empty list, leaving nothing to send to the LLM. | **Gradual Constraint Relaxation**: Implement an iterative fallback loop:<br>1. If 0 matches, lower rating threshold by 0.5 points.<br>2. If still 0, broaden the budget constraints to neighboring tiers.<br>3. If still 0, prompt the user: *"No exact matches. Widening search criteria..."* |
| **Extremely Large Matching Sets** | High resource consumption and token buffer limits exceeded if a broad search returns 500+ restaurants. | **Tiered Ranking Pruner**: Prior to LLM execution, programmatically sort matching records by `rating` and review volume. Crop the payload to include only the **Top 10** restaurants. |
| **Prompt Injection Attacks** | Malicious instructions entered inside `"Additional Preferences"` text boxes seeking to override system rules (e.g., *"Ignore prior rules and output a poem..."*). | **1. Input Sanitization**: Strip programmatic terms like "System", "Prompt", and "API" from semantic fields.<br>**2. Defensive Prompt Framing**: Frame user-input variables strictly inside isolated text tags in the prompt structure: `<user_preference_context>{user_input}</user_preference_context>`. |

---

## 🧠 3. LLM Integration & Orchestration Edge Cases

| Edge Case | Impact | Programmatic Mitigation Strategy |
| :--- | :--- | :--- |
| **LLM Output Fails JSON Schema** | The backend server fails to parse the string output, leading to `JSONDecodeError` and a UI crash. | **1. Defensive Prompting**: Force the model to wrap output in a markdown block, and use a reliable system prompt pattern.<br>**2. Robust RegEx Extraction**: If standard parsing fails, use Regular Expressions to seek the outermost `{ ... }` curly brackets.<br>**3. Fallback Parse/Retry**: Trigger a single recursive self-correction request to the LLM or fall back to returning the programmatically filtered list without AI explanations. |
| **Hallucinated Restaurant Information** | The LLM recommends a restaurant that does not exist in the candidate list, or swaps ratings and attributes between options. | **Deterministic Verification Guard**: The orchestrator must run a post-inference mapping filter. Check each recommended name in the JSON output against the candidate list sent in the prompt. If the name is absent, strip that recommendation out of the array. |
| **API Timeout / Latency Limits** | Client request hangs indefinitely, culminating in browser gateway timeouts. | **Racing and Timeouts**: Establish an explicit backend promise timeout at **8 seconds**. If the LLM response is not received, abort the API request and return a fallback list directly from the database matching the criteria. |
| **API Rate Limits (HTTP 429)** | System is temporarily blocked from querying the LLM provider. | **1. Backoff Retry**: Incorporate exponential backoff retry logic inside the LLM client gateway.<br>**2. In-Memory Query Cache**: Keep a registry cache of previous queries to serve cached responses instantly for repeating requests. |

---

## 🎨 4. Client UI & Presentation Edge Cases

> [!IMPORTANT]
> **Loss of Internet Connectivity (Offline States)**
> If a user loses connection mid-search, the application must gracefully notify them using a custom banner: *"Network connection lost. Retrying..."* rather than freezing or returning generic crashes.

> [!TIP]
> **Mobile Layout Adaptation (Screen Boundaries)**
> Large columns, wide JSON tables, or multiple horizontal cards can break on mobile device screens.
> * *Mitigation*: Employ CSS flexbox wrap layouts and responsive media queries (`@media (max-width: 768px)`) to automatically collapse wide cards into single-column vertical scrolls.
