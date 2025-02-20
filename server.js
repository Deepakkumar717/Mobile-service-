require('dotenv').config(); // Load environment variables
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require("multer");
const axios = require("axios");
const FormData = require('form-data'); // Required for Imgur upload
const fs = require("fs");
const bcrypt = require("bcrypt");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;



const app = express();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});


// 🔹 Multer Storage Configuration (Cloudinary)
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "complaints",
        allowed_formats: ["jpg", "jpeg", "png"]
    }
});
const upload = multer({ storage });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// MongoDB Connection
const mongoURI = process.env.MONGO_URI;
const PORT = process.env.PORT || 5000;


mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Connection Failed:", err.message));

// Check MongoDB connection status
const isDatabaseConnected = () => mongoose.connection.readyState === 1;

// --------------------- SCHEMAS & MODELS ---------------------

// User Schema
const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);








// Define Location Schema
const LocationSchema = new mongoose.Schema({
    name: String,  
    type: String, // "user" or "admin"
    latitude: Number,
    longitude: Number
});
const Location = mongoose.model("Location", LocationSchema);

const UserProfileSchema = new mongoose.Schema({
    fullName: String,
    email: String,
    phone: String,
    latitude: String,
    longitude: String,
    address: String
});

const UserProfile = mongoose.model("UserProfile", UserProfileSchema);


// --------------------- SCHEMAS & MODELS ---------------------

// ✅ Admin Authentication Schema (For Login & Signup)
const AdminAuthSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
});
const AdminAuth = mongoose.model("AdminAuth", AdminAuthSchema);

// ✅ Admin Profile Schema (Separate Collection)
const AdminProfileSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true }, // Reference email from AdminAuth
    fullName: String,
    phone: String,
    role: String,
    latitude: String,
    longitude: String,
    address: String
});
const AdminProfile = mongoose.model("AdminProfile", AdminProfileSchema);

// 🔴 ADMIN SIGNUP
app.post("/admin-signup", async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) 
        return res.status(400).json({ error: "All fields are required!" });

    try {
        const existingAdmin = await AdminAuth.findOne({ email });
        if (existingAdmin) return res.status(400).json({ error: "Admin already exists!" });

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create Admin Auth Record
        const newAdmin = new AdminAuth({ name, email, password: hashedPassword });
        await newAdmin.save();

        // Create an empty Admin Profile (To be updated later)
        const newProfile = new AdminProfile({ email, fullName: "", phone: "", role: "", latitude: "", longitude: "", address: "" });
        await newProfile.save();

        res.json({ message: "✅ Admin Registered Successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Server error during signup" });
    }
});

app.post("/admin-login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const admin = await AdminAuth.findOne({ email });
        
        if (!admin) return res.status(401).json({ error: "Invalid email or password!" });

        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (!passwordMatch) return res.status(401).json({ error: "Invalid email or password!" });

        console.log("✅ Admin Found:", admin);  // Debug: Check the actual admin document

        // Send back correct admin ID
        res.json({ message: "✅ Admin Login Successful!", adminId: admin._id.toString() });

    } catch (error) {
        console.error("❌ Error during login:", error);
        res.status(500).json({ error: "Server error during login" });
    }
});



// ✅ Fetch Admin Profile by Email (Using `AdminProfile` Collection)
app.get("/get-admin-profile/:email", async (req, res) => {
    try {
        const adminProfile = await AdminProfile.findOne({ email: req.params.email });
        if (!adminProfile) {
            // Return an empty profile if none exists
            return res.json({ success: true, adminProfile: { email: req.params.email, fullName: "", phone: "", role: "", latitude: "", longitude: "", address: "" } });
        }
        res.json({ success: true, adminProfile });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// ✅ Update Admin Profile
app.post("/update-admin-profile", async (req, res) => {
    try {
        const { email, fullName, phone, role, latitude, longitude, address } = req.body;

        // Upsert: Create if not exists, update if exists
        const updatedAdminProfile = await AdminProfile.findOneAndUpdate(
            { email },
            { fullName, phone, role, latitude, longitude, address },
            { new: true, upsert: true }
        );

        res.json({ success: true, message: "Profile updated successfully", adminProfile: updatedAdminProfile });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// ✅ Get All Admin Profiles
app.get("/all-admin-profiles", async (req, res) => {
    try {
        const admins = await AdminProfile.find();
        res.json({ success: true, admins });
    } catch (error) {
        res.status(500).json({ message: "❌ Error fetching admin profiles" });
    }
});

// ✅ Delete Admin Profile (By Email)
app.delete("/delete-admin-profile/:email", async (req, res) => {
    try {
        await AdminProfile.findOneAndDelete({ email: req.params.email });
        await AdminAuth.findOneAndDelete({ email: req.params.email }); // Also delete from AdminAuth
        res.json({ success: true, message: "Admin profile deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// ✅ Logout (Clear Local Storage - Optional)
app.post("/logout", (req, res) => {
    res.json({ success: true, message: "Logged out successfully" });
});
// Get User Profile
app.get("/get-user/:email", async (req, res) => {
    try {
        const user = await UserProfile.findOne({ email: req.params.email });
        if (user) {
            res.json({ success: true, user });
        } else {
            res.json({ success: false, message: "User not found" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// Create or Update Profile
app.post("/submit-profile", async (req, res) => {
    const { fullName, email, phone, latitude, longitude, address } = req.body;
    try {
        let user = await UserProfile.findOne({ email });

        if (user) {
            // Update existing user
            user.fullName = fullName;
            user.phone = phone;
            user.latitude = latitude;
            user.longitude = longitude;
            user.address = address;
        } else {
            // Create new user
            user = new UserProfile({ fullName, email, phone, latitude, longitude, address });
        }

        await user.save();
        res.json({ success: true, message: "Profile updated successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error updating profile" });
    }
});


// API to fetch user details by user ID
app.get("/get-user/:id", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        res.json({ success: true, user: { name: user.name, email: user.email } });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error });
    }
});

// Route: Fetch all locations
app.get("/api/locations", async (req, res) => {
    try {
        const locations = await Location.find();
        res.json(locations);
    } catch (error) {
        res.status(500).json({ message: "❌ Error fetching locations" });
    }
});



// API to Fetch User Data
app.get("/get-user/:id", async (req, res) => {
    try {
        const user = await UserPro.findById(req.params.id);
        if (!user) return res.json({ success: false, message: "User not found" });
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching user" });
    }
});





 
// Fetch all admin locations & print them
app.get("/api/admins", async (req, res) => {
    try {
        const admins = await AdminProfile.find({}, "fullName latitude longitude");
        console.log("📌 Admin Locations:");
        admins.forEach(admin => {
            console.log(`🗺️ ${admin.fullName}: [${admin.latitude}, ${admin.longitude}]`);
        });

        res.json(admins);
    } catch (error) {
        console.error("❌ Error fetching admin locations:", error);
        res.status(500).json({ message: "Server error" });
    }
});


const Complaint = mongoose.model("Complaint", new mongoose.Schema({
    category: String,
    description: String,
    dateTime: String,
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminProfile" },
    status: { type: String, enum: ["Pending", "Accepted", "Rejected"], default: "Pending" },
    image: { type: String } // Stores Cloudinary URL
}));

app.get("/api/locations", async (req, res) => {
    const admins = await AdminProfile.find({}, "fullName latitude longitude");
    res.json(admins.map(admin => ({
        _id: admin._id, name: admin.fullName, latitude: admin.latitude, longitude: admin.longitude
    })));
});

app.post("/submitComplaint", upload.single("image"), async (req, res) => {
    try {
        const { category, description, dateTime, adminId } = req.body;
        const imageUrl = req.file ? req.file.path : null;

        if (!adminId) {
            return res.status(400).json({ message: "Please select an admin." });
        }

        const newComplaint = new Complaint({
            category,
            description,
            dateTime,
            adminId,
            image: imageUrl
        });

        await newComplaint.save();
        res.status(201).json({ message: "Complaint submitted successfully", complaint: newComplaint });
    } catch (err) {
        console.error("❌ Error submitting complaint:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// 🔹 Fetch all complaints


app.get("/api/complaints", async (req, res) => {
    try {
        const complaints = await Complaint.find();
        res.json(complaints);
    } catch (error) {
        console.error("❌ Error fetching complaints:", error);
        res.status(500).json({ error: "Server error fetching complaints" });
    }
});

// 🔹 Update complaint status
app.put("/api/complaints/update/:id", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        const updatedComplaint = await Complaint.findByIdAndUpdate(id, { status }, { new: true });

        if (!updatedComplaint) {
            return res.status(404).json({ error: "Complaint not found!" });
        }

        res.json({ message: "✅ Complaint status updated!", updatedComplaint });
    } catch (error) {
        console.error("❌ Error updating complaint status:", error);
        res.status(500).json({ error: "Server error updating complaint status" });
    }
});

// User Signup
app.post("/user-signup", async (req, res) => {
    if (!isDatabaseConnected()) {
        return res.status(500).json({ error: "Database is not connected." });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: "All fields are required!" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.status(400).json({ error: "User already exists!" });
    }

    const newUser = new User({ name, email, password });
    await newUser.save();
    
    res.json({ message: "✅ User Registered Successfully!" });
});

// User Login
app.post("/user-login", async (req, res) => {
    if (!isDatabaseConnected()) {
        return res.status(500).json({ error: "Database is not connected." });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid email or password!" });
    }

    res.json({ message: "✅ Login Successful!", user });
});

//See Status


app.get("/api/complaints/all", async (req, res) => {
    try {
        const complaints = await Complaint.find()
            .sort({ createdAt: -1 }) // Fetch in descending order (latest first)
            .exec();

        if (!complaints.length) {
            return res.status(404).json({ message: "No complaints found" });
        }

        res.json(complaints);
    } catch (error) {
        console.error("Error fetching complaints:", error);
        res.status(500).json({ error: "Server error" });
    }
});


// Feedback Schema
const feedbackSchema = new mongoose.Schema({
    rating: Number,
    feedback: String,
    createdAt: { type: Date, default: Date.now }
});

const Feedback = mongoose.model("Feedback", feedbackSchema);

app.post("/submitFeedback", async (req, res) => {
    try {
        const { rating, feedback } = req.body;
        if (!rating || !feedback) return res.status(400).json({ error: "Rating and feedback are required!" });

        const newFeedback = new Feedback({ rating, feedback });
        await newFeedback.save();
        res.status(201).json({ message: "Feedback submitted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});




// Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));