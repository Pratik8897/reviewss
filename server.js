const express = require('express');
const axios = require('axios'); // Used for making HTTP requests
const app = express();
const port = 3000;

// --- Your Judge.me Credentials and Product ID ---
const SHOP_DOMAIN = 'aef057-93.myshopify.com';
const API_TOKEN = 'bqH4U_FvWCiXkwwc7b-gIcD15Ts';
const EXTERNAL_ID = '7475575128203'; // The Shopify product ID

// --- API Endpoints ---
const PRODUCT_INFO_URL = `https://judge.me/api/v1/products/-1?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&external_id=${EXTERNAL_ID}`;
const REVIEWS_BASE_URL = `https://judge.me/api/v1/reviews?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}`;


app.get('/api/product-reviews', async (req, res) => {
    let judgeMeProductId;

    try {
        // Step 1: Get the Judge.me Product ID
        console.log('Fetching product info...');
        const productResponse = await axios.get(PRODUCT_INFO_URL);
        
        // Ensure you access the correct field in the response for the ID
        judgeMeProductId = productResponse.data.product.id; 
        console.log(`Product ID found: ${judgeMeProductId}`);

        // Step 2: Fetch Reviews using the Product ID
        console.log('Fetching reviews...');
        const reviewsUrl = `${REVIEWS_BASE_URL}&product_id=${judgeMeProductId}&per_page=20&page=1`;
        const reviewsResponse = await axios.get(reviewsUrl);

        // Send the reviews data back to the client
        res.json(reviewsResponse.data);

    } catch (error) {
        console.error('Error fetching data from Judge.me API:', error.message);
        // Send a meaningful error response
        res.status(500).json({ error: 'Failed to retrieve product reviews.', details: error.message });
    }
});


app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});