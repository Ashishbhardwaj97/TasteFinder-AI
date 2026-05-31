import React, { useState, useEffect, useRef } from 'react';

const DATABASE_LOCATIONS = [
  'Indiranagar', 'Banashankari', 'Basavanagudi', 'Mysore Road', 'Jayanagar', 
  'JP Nagar', 'Koramangala', 'Bellandur', 'Marathahalli', 'HSR', 
  'Whitefield', 'Electronic City', 'BTM', 'Malleshwaram', 'Rajajinagar', 
  'Kalyan Nagar', 'Richmond Road', 'MG Road', 'Ulsoor', 'Lavelle Road', 
  'Residency Road', 'Sarjapur Road', 'Brigade Road', 'Bannerghatta Road'
];

const POPULAR_CUISINES = [
  'Italian', 'Chinese', 'North Indian', 'Cafe', 'Pizza', 
  'South Indian', 'Desserts', 'Burgers', 'Fast Food', 
  'Beverages', 'Mughlai', 'Biryani'
];

export default function App() {
  // --- Form Preferences State ---
  const [location, setLocation] = useState('Indiranagar');
  const [budget, setBudget] = useState('Medium');
  const [cuisines, setCuisines] = useState(['Italian', 'Chinese', 'North Indian']);
  const [cuisineInput, setCuisineInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [minRating, setMinRating] = useState(4.0);
  const [additionalNotes, setAdditionalNotes] = useState('family-friendly, quick service, outdoor seating');
  const [limit, setLimit] = useState(5);
  
  // --- Bookmarked items ---
  const [bookmarks, setBookmarks] = useState({});

  // --- API Result & State flags ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState('');
  const [recommendations, setRecommendations] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  const suggestionRef = useRef(null);

  // Close suggestions dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Cuisine Select Actions ---
  const handleRemoveCuisine = (cuisineToRemove) => {
    setCuisines(cuisines.filter(c => c !== cuisineToRemove));
  };

  const handleAddCuisine = (cuisineToAdd) => {
    const trimmed = cuisineToAdd.trim();
    if (!trimmed) return;
    if (!cuisines.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setCuisines([...cuisines, trimmed]);
    }
    setCuisineInput('');
    setShowSuggestions(false);
  };

  const handleCuisineKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCuisine(cuisineInput);
    }
  };

  const filteredSuggestions = POPULAR_CUISINES.filter(
    c => c.toLowerCase().includes(cuisineInput.toLowerCase()) && 
         !cuisines.some(selected => selected.toLowerCase() === c.toLowerCase())
  );

  // --- Bookmarking Actions ---
  const toggleBookmark = (name) => {
    setBookmarks(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  // --- API Query Actions ---
  const fetchRecommendations = async () => {
    setLoading(true);
    setError(null);
    setHasSearched(false);
    
    const payload = {
      location: `${location}, Bangalore`,
      budget: budget,
      cuisine: cuisines.length > 0 ? cuisines.join(', ') : null,
      min_rating: minRating,
      additional_notes: additionalNotes || null,
      limit: limit
    };

    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errDetails = await response.json();
        throw new Error(errDetails.error || `HTTP error ${response.status}`);
      }

      const results = await response.json();
      setSummary(results.summary || `We found ${results.recommendations?.length || 0} excellent matching options.`);
      
      // Clientside slicing based on custom Limit counter choice
      const recs = results.recommendations || [];
      setRecommendations(recs.slice(0, limit));
      setHasSearched(true);
    } catch (err) {
      console.error('[API Error]', err);
      setError(err.message || 'An unexpected connection failure occurred inside the recommendation pipeline.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchRecommendations();
  };

  return (
    <div className="app-wrapper">
      {/* Global Header Logo */}
      <header className="global-header">
        <div className="logo-text-top">TasteFinder</div>
      </header>

      {/* Main Title Hero */}
      <section className="hero-section">
        <h1 className="hero-title">TasteFinder</h1>
        <p className="hero-subtitle">
          Personalized picks for you, <em>ranked by AI.</em>
        </p>
      </section>

      {/* Preferences Form Card */}
      <main className="form-dashboard-card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid-layout">
            
            {/* Column 1 */}
            <div className="input-block">
              <label htmlFor="location-select" className="input-label">
                <i className="fa-solid fa-location-dot label-icon"></i> Location
              </label>
              <div className="custom-select-wrapper">
                <select 
                  id="location-select"
                  className="form-select-control"
                  value={location} 
                  onChange={(e) => setLocation(e.target.value)}
                  required
                >
                  {DATABASE_LOCATIONS.map(loc => (
                    <option key={loc} value={loc}>{loc}, Bangalore</option>
                  ))}
                </select>
                <i className="fa-solid fa-chevron-down select-chevron-icon"></i>
              </div>
            </div>

            {/* Column 2: Budget Segmented control */}
            <div className="input-block">
              <label className="input-label">
                <i className="fa-solid fa-wallet label-icon"></i> Budget
              </label>
              <div className="segmented-budget-selector">
                {['Low', 'Medium', 'High'].map(tier => (
                  <button
                    key={tier}
                    type="button"
                    className={`budget-tab-pill ${budget === tier ? 'active' : ''}`}
                    onClick={() => setBudget(tier)}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            {/* Column 3: Multi-Cuisine selector */}
            <div className="input-block" style={{ position: 'relative' }} ref={suggestionRef}>
              <label className="input-label">
                <i className="fa-solid fa-utensils label-icon"></i> Cuisine
              </label>
              <div className="cuisine-input-group">
                <div className="chips-flex-wrap">
                  {cuisines.map(c => (
                    <span key={c} className="cuisine-chip-pill">
                      {c}
                      <button type="button" onClick={() => handleRemoveCuisine(c)}>
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    className="cuisine-search-input"
                    placeholder={cuisines.length === 0 ? "Search cuisines..." : ""}
                    value={cuisineInput}
                    onChange={(e) => {
                      setCuisineInput(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={handleCuisineKeyDown}
                  />
                </div>
              </div>
              
              {/* Suggestion Dropdown List */}
              {showSuggestions && (cuisineInput.length > 0 || filteredSuggestions.length > 0) && (
                <ul className="suggestions-list-box">
                  {filteredSuggestions.map(sug => (
                    <li 
                      key={sug} 
                      className="suggestion-item-row"
                      onClick={() => handleAddCuisine(sug)}
                    >
                      {sug}
                    </li>
                  ))}
                  {cuisineInput.trim() && !POPULAR_CUISINES.includes(cuisineInput.trim()) && (
                    <li 
                      className="suggestion-item-row"
                      onClick={() => handleAddCuisine(cuisineInput)}
                      style={{ borderTop: '1px solid var(--border-light)', fontWeight: 600 }}
                    >
                      Add Custom: "{cuisineInput.trim()}"
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* Column 4: Min Rating Slider */}
            <div className="input-block">
              <div className="input-label-row">
                <label htmlFor="rating-range" className="input-label">
                  <i className="fa-solid fa-star label-icon"></i> Min Rating
                </label>
                <span className="badge-red-value">{Number(minRating).toFixed(1)}</span>
              </div>
              <input
                id="rating-range"
                type="range"
                className="slider-range-control"
                min="1.0"
                max="5.0"
                step="0.1"
                value={minRating}
                onChange={(e) => setMinRating(parseFloat(e.target.value))}
              />
              <div className="slider-ticks-row">
                <span>1.0</span>
                <span>5.0</span>
              </div>
            </div>

            {/* Column 5: Semantic implicit wishes text input */}
            <div className="input-block" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="preferences-input" className="input-label">
                <i className="fa-solid fa-sliders label-icon"></i> Additional Preferences
              </label>
              <input
                id="preferences-input"
                type="text"
                className="text-preferences-control"
                placeholder="e.g. cozy spot for reading, romantic evening, rooftop view..."
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
              />
            </div>

            {/* Column 6: Results Limit Spinner & Recommendations button */}
            <div className="input-block">
              <label className="input-label">
                <i className="fa-solid fa-list-ol label-icon"></i> Number of results
              </label>
              <div className="numeric-spinner-row">
                <button 
                  type="button" 
                  className="spinner-btn-pill" 
                  disabled={limit <= 1}
                  onClick={() => setLimit(Math.max(1, limit - 1))}
                >
                  <i className="fa-solid fa-minus"></i>
                </button>
                <span className="spinner-display-val">{limit}</span>
                <button 
                  type="button" 
                  className="spinner-btn-pill" 
                  disabled={limit >= 5}
                  onClick={() => setLimit(Math.min(5, limit + 1))}
                >
                  <i className="fa-solid fa-plus"></i>
                </button>
              </div>
            </div>

            <div className="form-action-row" style={{ gridColumn: 'span 2', justifyContent: 'flex-end', display: 'flex', alignItems: 'flex-end' }}>
              <button 
                type="submit" 
                className="primary-recommendation-trigger"
                disabled={loading}
              >
                <span>Get recommendations</span>
                <i className="fa-solid fa-wand-magic-sparkles"></i>
              </button>
            </div>

          </div>
        </form>
      </main>

      {/* Perfect Match Status Banner */}
      {hasSearched && recommendations.length > 0 && !loading && (
        <section className="perfect-match-banner-fluid">
          <div className="banner-inner-content">
            <div className="banner-circle-badge">
              <i className="fa-solid fa-circle-check"></i>
            </div>
            <div className="banner-text-details">
              <h2 className="banner-title-text">We found the perfect match</h2>
              <p className="banner-subtitle-text">
                {recommendations.length} strong {cuisines.slice(0, 2).join(' & ')} options in {location} within a {budget.toLowerCase()} budget, matching your preferences.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Loading Skeleton States */}
      {loading && (
        <section className="loading-shimmer-container">
          <div className="spinner-compass-ring"></div>
          {[1, 2, 3].map(id => (
            <div key={id} className="skeleton-loading-card">
              <div className="skeleton-shimmer skeleton-header-block"></div>
              <div className="skeleton-shimmer skeleton-meta-block"></div>
              <div className="skeleton-shimmer skeleton-chips-block"></div>
              <div className="skeleton-shimmer skeleton-callout-block"></div>
            </div>
          ))}
        </section>
      )}

      {/* Dynamic Recommendation Output Cards */}
      {hasSearched && !loading && (
        <section className="results-stack-panel">
          {recommendations.length === 0 ? (
            <div className="restaurant-entry-card" style={{ padding: '40px', textAlign: 'center' }}>
              <i className="fa-solid fa-face-frown" style={{ fontSize: '36px', color: 'var(--text-light)', marginBottom: '12px' }}></i>
              <h3 className="restaurant-name-header">No Restaurants Matched</h3>
              <p className="locality-dot-text" style={{ marginTop: '4px' }}>
                We programmatically widened parameters but could not find a local match. Try adjusting the rating slider or budget filters.
              </p>
            </div>
          ) : (
            recommendations.map(rec => (
              <article key={rec.name} className="restaurant-entry-card">
                
                {/* Header Top Row */}
                <div className="card-primary-row">
                  <div className="restaurant-left-side">
                    <div className="rank-index-square">#{rec.rank}</div>
                    <div className="restaurant-main-title-block">
                      <h3 className="restaurant-name-header">{rec.name}</h3>
                      <div className="restaurant-rating-row">
                        <span className="rating-score-bold">{Number(rec.rating).toFixed(1)}</span>
                        <i className="fa-solid fa-star rating-star-icon"></i>
                        <span className="locality-dot-text">• {location}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Price & Bookmark Details */}
                  <div className="restaurant-right-side">
                    <div className="pricing-block-details">
                      <span className="price-value-span">₹{Number(rec.estimated_cost_for_two).toLocaleString()}</span>
                      <span className="price-sub-label">for two</span>
                    </div>
                    <button 
                      type="button" 
                      className={`bookmark-icon-btn ${bookmarks[rec.name] ? 'active' : ''}`}
                      onClick={() => toggleBookmark(rec.name)}
                    >
                      <i className={bookmarks[rec.name] ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark"}></i>
                    </button>
                  </div>
                </div>

                {/* Cuisine Badges Row */}
                <div className="card-cuisines-row">
                  {(rec.cuisine || '').split(',').map(tag => (
                    <span key={tag.trim()} className="cuisine-tag-grey-badge">
                      {tag.trim()}
                    </span>
                  ))}
                </div>

                {/* WHY WE PICKED THIS Callout */}
                <div className="ai-why-picked-callout">
                  <h4 className="callout-small-header">Why we picked this</h4>
                  <p className="callout-body-explanation">
                    "{rec.ai_explanation || `Excellent matching restaurant offering outstanding dining in ${location}.`}"
                  </p>
                </div>

              </article>
            ))
          )}
        </section>
      )}

      {/* Error Message Modal Dialog Overlay */}
      {error && (
        <div className="modal-error-backdrop">
          <div className="error-modal-container">
            <i className="fa-solid fa-triangle-exclamation error-triangle-icon"></i>
            <h3 className="error-modal-container error-dialog-title">Connection Error</h3>
            <p className="error-dialog-text">{error}</p>
            <button 
              type="button" 
              className="error-dismiss-btn"
              onClick={() => setError(null)}
            >
              Dismiss Alert
            </button>
          </div>
        </div>
      )}

      {/* Subtle Footer Info */}
      <footer style={{ marginTop: 'auto', paddingTop: '48px', fontSize: '11px', color: 'var(--text-light)', textAlign: 'center' }}>
        <p style={{ color: 'var(--brand-red)', fontWeight: 600, fontSize: '12px' }}>TasteFinder</p>
        <p style={{ marginTop: '4px' }}>&copy; 2026 TasteFinder Bangalore</p>
      </footer>
    </div>
  );
}
