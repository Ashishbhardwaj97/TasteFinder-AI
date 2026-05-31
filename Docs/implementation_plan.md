# Implementation Plan: AI-Powered Restaurant Recommendation System

This document outlines a **6-Phase Implementation Roadmap** to develop and deploy the AI-Powered Restaurant Recommendation System. It translates the project's [Context](file:///c:/Users/Ashish%20Bhardwaj/Downloads/ZomatoProject/Docs/context.md) and [System Architecture](file:///c:/Users/Ashish%20Bhardwaj/Downloads/ZomatoProject/Docs/architecture.md) into concrete, sequential development sprints utilizing the **Node.js** technology stack.

---

## 📅 Roadmap Timeline Summary

| Phase | Title | Focus Area | Estimated Effort |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Ingestion & Cleaning | Hugging Face Dataset & Preprocessing | 1 Week |
| **Phase 2** | Local Filtering Engine | Strict Rule-based Filtering & Pruning | 1 Week |
| **Phase 3** | LLM Orchestrator | Prompts, Inference API, & Schema Validation | 1 Week |
| **Phase 4** | Backend Services | Application API, State Routing & Caching | 1 Week |
| **Phase 5** | Client UI (Frontend) | Interactive Dashboard, Styled Cards, & Visuals | 1-2 Weeks |
| **Phase 6** | E2E Testing & Launch | Quality Assurance, Prompts Optimization, & Deploy | 1 Week |

---

## 🛠️ Phase-by-Phase Breakdown

### 🎯 Phase 1: Data Ingestion & Preprocessing (Week 1)
Establish the workspace and design the ingestion pipelines to pull and structure raw restaurant data.

#### Key Tasks
- [x] **Workspace Initialization**: Setup repository, initialize Node.js environment, and configure ES module settings (`package.json`).
- [x] **Hugging Face Connector**: Write a script to fetch the [ManikaSaini/zomato-restaurant-recommendation](https://huggingface.co/datasets/ManikaSaini/zomato-restaurant-recommendation) dataset.
- [x] **Data Cleaning Pipeline**:
  - Normalize location names (handling casing and whitespace).
  - Categorize numerical cost-for-two into discrete budget tiers (`Low`, `Medium`, `High`).
  - Impute missing rating records with a default threshold.
- [x] **Data Storage Cache**: Persist cleaned dataset records locally (`data/zomato_cache.json`) to avoid network latency during dev server start.

#### Deliverables
* Ingestion script (`ingest.js`)
* Local structured dataset (`data/zomato_cache.json`)
* Unit test verifying data loading and schema validity (`tests/ingest.test.js`).

---

### 🔍 Phase 2: Rule-Based Filtering Engine (Week 2)
Implement the programmatic filters that reduce the dataset candidate size to optimize token usage.

#### Key Tasks
- [x] **Core Filter Utility**: Develop a modular engine in `src/filter_engine.js` that accepts queries containing Location, Budget Tier, Cuisine, and Rating.
- [x] **Pruning Module**:
  - Filter candidate records strictly matching explicit constraints.
  - Sort leftovers by `aggregate_rating` desc and review counts.
  - Slice the output to select the **Top 10** optimal candidates.
- [x] **Error Handling**: Build fallback responses in case strict filtering yields zero matches (e.g., automatically widening the geographical radius or budget category).

#### Deliverables
* Filtering service module (`src/filter_engine.js`)
* Comprehensive test suite evaluating filtering speed (target: < 20ms) and fallback triggers (`tests/filter.test.js`).

---

### 🧠 Phase 3: LLM Orchestrator Layer (Week 3)
Build the middleware that synthesizes prompt contexts, executes LLM inference, and guarantees structured JSON outputs.

#### Key Tasks
- [x] **Prompt Builder**: Design a dynamic prompt compiler that stitches together the System Instructions, Candidate List, and User Semantic preferences.
- [x] **LLM API Wrapper**: Create an interface connecting to the Groq API (using the standard OpenAI-compatible completions endpoint) using native `fetch`.
- [x] **JSON Parser & Schema Guard**:
  - Parse the raw LLM string response.
  - Programmatically validate response structure against the `System Output Schema`.
  - Handle retry loops if the LLM output fails schema validation.

#### Deliverables
* AI Service orchestrator (`src/llm_service.js`)
* Dynamic Prompt template configuration
* Integration test calling the LLM and validating the response schema (`tests/llm.test.js`).

---

### ⚙️ Phase 4: Backend API Services (Week 4)
Create a stable backend web application to wrap the engine services and expose web endpoints.

#### Key Tasks
- [x] **API Framework Setup**: Setup a backend server using the native Node.js `http` module to maximize speed and remove dependency footprint.
- [x] **Endpoint Construction**: Develop the primary endpoint `POST /api/recommend` matching the user request payload schema.
- [x] **Caching Layer**: Implement a local in-memory cache to map identical request signatures to existing recommendations.
- [x] **Request Logging**: Set up request logging to track response latencies, costs, and token consumption statistics.

#### Deliverables
* Executable backend application (`src/server.js`)
* Fully documented HTTP API contract
* Stress-testing scripts verifying routing performance (`tests/server.test.js`).

---

### 🎨 Phase 5: Client Presentation UI (Weeks 4-5)
Deliver a premium, responsive web interface that matches high-end design aesthetics.

#### Key Tasks
- [x] **Dashboard Layout**:
  - A modern, centered panel containing filters (dropdown search for Locations, tag chips for Cuisine, sliding range for Ratings, budget selectors).
  - Clear semantic text field for implicit desires (e.g., "cozy corner for writing").
- [x] **Interactive Visual States**:
  - Glassmorphic backdrop filters, custom premium color scheme, and smooth transition animations on buttons and input focus.
  - Skeleton loading states to keep the UI active during the LLM inference delay.
- [x] **Result Presentation Cards**:
  - An interactive layout (grid or horizontal swipe) featuring restaurant info.
  - Expandable detailed views showing the custom **AI-Generated Explanation** text blocks.

#### Deliverables
* Responsive HTML/JS files (`public/index.html`, `public/app.js`)
* Sleek CSS styling layout (`public/style.css`)
* Dynamic preview demonstration using mocked API endpoints.

---

### 🚀 Phase 6: End-to-End Verification & Launch (Week 5)
Conduct full system validation, optimize latency, and prepare deploy configurations.

#### Key Tasks
- [x] **Prompt Tuning**: Refine semantic guidance guidelines to improve LLM reasoning consistency.
- [x] **Performance Auditing**: Benchmark API latency, verifying that filtering and rendering perform smoothly.
- [x] **Security Hardening**: Secure external API keys using environment configuration variables.
- [x] **Production Configuration**: Prepare scripts to deploy the frontend/backend services to production hosting (e.g., Vercel, Render, or Dockerized VPS).

#### Deliverables
* Final, tested application release
* Environment configuration instructions (`.env.example`)
* System Walkthrough / README deployment guide

---

## ⚠️ Critical Path & Risk Management

> [!WARNING]
> **API Rate Limits and Latency Spikes**
> External LLM APIs can introduce unexpected delays. If the frontend relies solely on synchronous waiting, it might trigger request timeouts.
> * *Mitigation*: The Client UI must use skeleton loaders to manage expectations, and the backend must maintain a 30-second timeout limit.

> [!IMPORTANT]
> **Dynamic Data Failures**
> Hugging Face or network API interruptions during boot could crash the server.
> * *Mitigation*: Fallback data must always be loaded from local files (`data/zomato_cache.json`) if the external Hugging Face dataset is unreachable.
