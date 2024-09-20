
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();
// Define the Ride schema
const rideSchema = new mongoose.Schema({
    bookingId: String,
    from: String,
    to: String,
    userId: String,
    userName: String,
    sharedUserIds: [String],
    sharedUserNames: [String],
    fare: Number,
    driverName: String,
    carName: String,
    date: { type: Date, default: Date.now },
    feedback: String
});

const Ride = mongoose.model('Ride', rideSchema);

// Random driver and car names (you can expand these lists)
const driverNames = ['John Doe', 'Jane Smith', 'Mike Johnson', 'Sarah Williams'];
const carNames = ['Toyota Camry', 'Honda Civic', 'Ford Focus', 'Chevrolet Malibu'];

const dbOperations = {
    connectDB: async () => {
        try {
            await mongoose.connect(process.env.MONGO_DB_URI);
            console.log('Connected to MongoDB');
        } catch (error) {
            console.error('MongoDB connection error:', error);
            process.exit(1);
        }
    },

    saveRideBooking: async (bookingData) => {
        const newRide = new Ride({
            bookingId: uuidv4(),
            ...bookingData,
            driverName: driverNames[Math.floor(Math.random() * driverNames.length)],
            carName: carNames[Math.floor(Math.random() * carNames.length)]
        });

        try {
            const savedRide = await newRide.save();
            return savedRide;
        } catch (error) {
            throw new Error('Error saving ride booking: ' + error.message);
        }
    },

    getRideHistory: async (userId) => {
        try {
            const rides = await Ride.find({
                $or: [
                    { userId: userId },
                    { sharedUserIds: userId }
                ]
            }).sort({ date: -1 });
    
            // Modify rides to include the primary user in the sharedUserNames array if userId is a shared user
            const updatedRides = rides.map(ride => {
                // Check if the user is in the sharedUserIds
                if (ride.sharedUserIds.includes(userId)) {
                    // Add the primary user (userName) to sharedUserNames if not already there
                    if (!ride.sharedUserNames.includes(ride.userName)) {
                        ride.sharedUserNames.push(ride.userName);
                    }
                }
                return ride;
            });
    
            return updatedRides;
        } catch (error) {
            throw new Error('Error fetching ride history: ' + error.message);
        }
    },
    
    addFeedback: async (rideId, feedback) => {
        try {
            const bookingId = rideId;
            const ride = await Ride.findOne({ bookingId: bookingId });
            if (!ride) {
                throw new Error('Ride not found');
            }
            ride.feedback = feedback;
            const updatedRide = await ride.save();

            if (!updatedRide) {
                throw new Error('Ride not found');
            }
            return updatedRide;
        } catch (error) {
            throw new Error('Error adding feedback: ' + error.message);
        }
    }

};
export default dbOperations;