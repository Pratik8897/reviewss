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
    // 1️⃣ Handle both single & bulk
    const singleId = req.query.shopifyId;
    const bulkIds = req.query.ids ? req.query.ids.split(",") : [];
    const shopifyIds = singleId ? [singleId] : bulkIds;

    if (!Array.isArray(shopifyIds) || shopifyIds.length === 0) {
      return res
        .status(400)
        .json({ error: "Missing ?shopifyId= or ?ids= query parameter" });
    }

    // 2️⃣ Cache setup
    const cacheKey = shopifyIds.sort().join(",");
    const cached = getCache(cacheKey);
    if (cached) {
      console.log("⚡ Cache hit:", cacheKey);
      return res.json(cached);
    }

    // 3️⃣ Fetch each product’s reviews in parallel
    const results = [];

    await Promise.all(
      shopifyIds.map(async (externalId) => {
        try {
          console.log("Fetching reviews for:", externalId);

          // Step 1: Get Judge.me Product ID
          const productResponse = await axiosInstance.get(
            `https://judge.me/api/v1/products?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&external_id=${externalId}`
          );

          const judgeMeProductId = productResponse.data?.product?.id;

          if (!judgeMeProductId) {
            console.warn(`No Judge.me product found for ${externalId}`);
            results.push({ shopifyId: externalId, reviews: [] });
            return;
          }

          // Step 2: Get Reviews
          const reviewsResponse = await axiosInstance.get(
            `https://judge.me/api/v1/reviews?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&product_id=${judgeMeProductId}&per_page=20&page=1`
          );

          results.push({
            shopifyId: externalId,
            judgeMeProductId,
            reviews: reviewsResponse.data.reviews || [],
          });
        } catch (err) {
          console.error(`Error fetching for ${externalId}:`, err.message);
          results.push({
            shopifyId: externalId,
            error: err.message,
          });
        }
      })
    );

    // 4️⃣ Decide response type
    const response =
      shopifyIds.length === 1 ? results[0] : { count: results.length, results };

    // 5️⃣ Cache for 10 minutes
    setCache(cacheKey, response);
    console.log("✅ Cached:", cacheKey);

    // 6️⃣ Send JSON response
    res.json(response);
  } catch (error) {
    console.error("Unified fetch error:", error.message);
    res.status(500).json({
      error: "Failed to fetch product reviews",
      details: error.message,
    });
  }
});


// Health route
app.get("/", (req, res) => {
  res.json({ message: "🚀 API running with caching enabled" });
});

module.exports = app;
