const express = require('express');
const Stripe = require('stripe');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)); // use fetch in Node.js
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const stripe = Stripe(process.env.STRIPE_KEY); // Replace with your actual secret key

const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(bodyParser.json());

// Endpoint to login a user and get a token
app.post('/login', async (req, res) => {
  const { username, password, expiresInMins = 1200 } = req.body;

  try {
    const response = await fetch('https://dummyjson.com/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, expiresInMins }),
      credentials: 'include', // Cookies included in the request
    });
    
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Login failed' });
    }

    // Send back the token and user info
    res.cookie('accessToken', data.token, { httpOnly: true });
    res.cookie('refreshToken', data.refreshToken, { httpOnly: true });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error', details: err });
  }
});

// Endpoint to get the current authenticated user
app.get('/me', async (req, res) => {
  const accessToken = req.headers.authorization?.split(' ')[1];

  if (!accessToken) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  try {
    const response = await fetch('https://dummyjson.com/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      credentials: 'include',
    });

    const data = await response.json();

    if(!response.ok) {
      if(response.status === 401) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if(response.status === 403) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return res.status(response.status).json({ error: data.message || 'Failed to get user info' });
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error', details: err });
  }
});

// Endpoint to refresh auth session
app.post('/refresh', async (req, res) => {
  const { refreshToken, expiresInMins = 60 } = req.body;

  try {
    const response = await fetch('https://dummyjson.com/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: refreshToken || req.cookies.refreshToken, // Use cookie if not provided
        expiresInMins,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Failed to refresh token' });
    }

    // Send back the new access token
    res.cookie('accessToken', data.token, { httpOnly: true });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error', details: err });
  }
});


app.post('/create-checkout-session', async (req, res) => {
  const { amount } = req.body;

  try {
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Your Product Name',
              },
              unit_amount: parseInt(amount*100) 
            },
            quantity: 1,
          }],
          mode: 'payment',
          success_url: 'http://localhost:5173/success',
          cancel_url: 'http://localhost:5173/cancel',
        });

      res.json({ id: session.id });
  } catch (error) {
      console.log(error);
      res.status(500).send(error);
  }
});

app.get('/', (req, res) => {
  res.send('Hello World!');
}
);
// Start the server
module.exports = app; // Export the app for Vercel
