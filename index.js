import Stripe from 'stripe';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import dbOperations from './db.js';
import bodyParser from 'body-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
dotenv.config();
const stripe = Stripe(process.env.STRIPE_KEY); // Replace with your actual secret key
const PORT = process.env.PORT || 3000;
const app = express();
app.use(cors());
app.use(bodyParser.json());
dbOperations.connectDB();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({model:"gemini-1.5-flash"});
// Endpoint to login a user and get a token
app.post('/login', async (req, res) => {
  const { username, password, expiresInMins = 1200 } = req.body;

  try {
    const response = await axios.post('https://dummyjson.com/auth/login', {
      username,
      password,
      expiresInMins,
    }, {
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true, // Include cookies in the request
    });

    const data = response.data;

    // Send back the token and user info
    res.cookie('accessToken', data.token, { httpOnly: true });
    res.cookie('refreshToken', data.refreshToken, { httpOnly: true });
    res.status(200).json(data);
  } catch (err) {
    const errorMsg = err.response?.data?.message || 'Login failed';
    res.status(err.response?.status || 500).json({ error: errorMsg });
  }
});

// Endpoint to get the current authenticated user
app.get('/me', async (req, res) => {
  const accessToken = req.headers.authorization?.split(' ')[1];

  if (!accessToken) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  try {
    const response = await axios.get('https://dummyjson.com/auth/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      withCredentials: true,
    });

    res.status(200).json(response.data);
  } catch (err) {
    const status = err.response?.status;
    const errorMsg = err.response?.data?.message || 'Failed to get user info';
    if (status === 401) return res.status(401).json({ error: 'Unauthorized' });
    if (status === 403) return res.status(403).json({ error: 'Forbidden' });
    res.status(status || 500).json({ error: errorMsg });
  }
});
app.get("/users/:usernameExclude", async (req, res) => {
  const { usernameExclude } = req.params;
  try{
    const response = await axios.get('https://dummyjson.com/users');
    const data = response.data;
    const allUsers = data.users;
    const filteredUsers = allUsers.filter(user => user.username !== usernameExclude);
    res.status(200).json({ users: filteredUsers });
  } catch (err) {
    const errorMsg = err.response?.data?.message || 'Failed to get users';
    res.status(err.response?.status || 500).json({ error: errorMsg });


  }
});

// Endpoint to refresh auth session
app.post('/refresh', async (req, res) => {
  const { refreshToken, expiresInMins = 60 } = req.body;

  try {
    const response = await axios.post('https://dummyjson.com/auth/refresh', {
      refreshToken: refreshToken || req.cookies.refreshToken,
      expiresInMins,
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    const data = response.data;

    // Send back the new access token
    res.cookie('accessToken', data.token, { httpOnly: true });
    res.status(200).json(data);
  } catch (err) {
    const errorMsg = err.response?.data?.message || 'Failed to refresh token';
    res.status(err.response?.status || 500).json({ error: errorMsg });
  }
});

// Endpoint to create a Stripe checkout session
app.post('/create-checkout-session', async (req, res) => {
  const { from, to, type, amount, userId, userName, sharedUserIds, sharedUserNames, redirectURL, distance } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Cab from ${from.toUpperCase()} to ${to.toUpperCase()} (${type.toUpperCase()})`,
          },
          unit_amount: parseInt(amount * 100), // Amount in cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${redirectURL}/success`,
      cancel_url: `${redirectURL}/cancel`,
     
    });

    
    dbOperations.saveRideBooking({
      from,
      to,
      userId,
      userName,
      fare: amount,
      sharedUserIds: sharedUserIds,
      sharedUserNames: sharedUserNames,
      type,
      distance,
      bookingId: session.id,
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});


app.post('/gemini', async (req, res) => {
  const { prompt } = req.body;
  try {
    const result = await model.generateContent( prompt );
    const text = result.response.text();
    res.json({ text });
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
}
);
app.post('/bookings', async (req, res) => {
  try {
    const savedRide = await dbOperations.saveRideBooking(req.body);
    res.status(201).json({ message: 'Ride booked successfully', booking: savedRide });
  } catch (error) {
    res.status(500).json({ message: 'Error booking ride', error: error.message });
  }
});

// API endpoint to get ride history for a user
app.get('/rides/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const rides = await dbOperations.getRideHistory(userId);
    res.json(rides);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching ride history', error: error.message });
  }
});

app.post('/rides/:rideId/feedback', async (req, res) => {
  try {
    const { rideId } = req.params;
    const { feedback } = req.body;

    if (!feedback) {
      return res.status(400).json({ message: 'Feedback is required' });
    }

    const updatedRide = await dbOperations.addFeedback(rideId, feedback);
    res.status(200).json({ message: 'Feedback added successfully', ride: updatedRide });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Error adding feedback', error: error.message });
  }
});

app.post('/rides/:rideId/cancel', async (req, res) => {
  try {
    const { rideId } = req.params;
    const updatedRide = await dbOperations.cancelRide(rideId);
    res.status(200).json({ message: 'Ride cancelled successfully', ride: updatedRide });
  } catch (error) {
    res.status(500).json({ message: 'Error cancelling ride', error: error.message });
  }
}
);

app.post('/rides/:rideId/complete', async (req, res) => {
  try {
    const { rideId } = req.params;
    const updatedRide = await dbOperations.completeRide(rideId);
    res.status(200).json({ message: 'Ride completed successfully', ride: updatedRide });
  } catch (error) {
    res.status(500).json({ message: 'Error completing ride', error: error.message });
  }
}
);


app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Start the server
const envName = process.env.NODE_ENV || 'development';
if (envName === 'development') {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

export default app;
