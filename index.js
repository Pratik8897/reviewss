const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ====== CONFIG ======
const SHOP_DOMAIN = process.env.SHOP_DOMAIN;
const API_TOKEN = process.env.API_TOKEN;

// ====== AXIOS CLIENT ======
const axiosInstance = axios.create({
  headers: { "User-Agent": "ShopifyReviewProxy/1.0 (contact@example.com)" },
});

// ====== SIMPLE MEMORY CACHE (10 min) ======
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes in ms

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  const isExpired = Date.now() - entry.timestamp > CACHE_TTL;
  if (isExpired) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ====== UNIFIED ENDPOINT (single + bulk) ======
app.all("/api/product-reviews", async (req, res) => {
  try {
    const singleId = req.query.shopifyId;
    const bulkIds = req.query.ids ? req.query.ids.split(",") : [];
    const shopifyIds = singleId ? [singleId] : bulkIds;

    if (!shopifyIds.length) {
      return res.status(400).json({ error: "Missing ?shopifyId= or ?ids=" });
    }

    // check cache first
    const cacheKey = shopifyIds.sort().join(",");
    const cached = getCache(cacheKey);
    if (cached) {
      console.log("⚡ Cache hit:", cacheKey);
      return res.json(cached);
    }

    const results = [];
    await Promise.all(
      shopifyIds.map(async (externalId) => {
        try {
          // Step 1: Get Judge.me product ID
          const productRes = await axiosInstance.get(
            `https://judge.me/api/v1/products?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&external_id=${externalId}`
          );
          const judgeMeProductId = productRes.data?.product?.id;
          if (!judgeMeProductId) {
            results.push({ shopifyId: externalId, reviews: [] });
            return;
          }

          // Step 2: Get reviews
          const reviewsRes = await axiosInstance.get(
            `https://judge.me/api/v1/reviews?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&product_id=${judgeMeProductId}&per_page=20&page=1`
          );

          results.push({
            shopifyId: externalId,
            judgeMeProductId,
            reviews: reviewsRes.data.reviews || [],
          });
        } catch (err) {
          results.push({ shopifyId: externalId, error: err.message });
        }
      })
    );

    // format single vs bulk
    const response =
      shopifyIds.length === 1 ? results[0] : { count: results.length, results };

    // store in cache
    setCache(cacheKey, response);

    console.log("✅ Cached:", cacheKey);
    res.json(response);
  } catch (error) {
    console.error("Unified fetch error:", error.message);
    res.status(500).json({ error: "Failed to fetch product reviews" });
  }
});

// Health route
app.get("/", (req, res) => {
  res.json({ message: "🚀 API running with caching enabled" });
});

module.exports = app;
